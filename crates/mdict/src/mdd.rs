//! MDD resource file parsing and resource loading.
//!
//! MDD files use the same binary format as MDX but store resources
//! (images, CSS, JS, audio, fonts) instead of articles.

use std::path::{Path, PathBuf};

use crate::error::Error;
use crate::link::parse_link_utf16le;
use crate::Result;

/// Normalize a resource path for MDD lookup.
///
/// Applies the same rules as GoldenDict:
/// 1. Replace '/' with '\\'
/// 2. Remove leading '.'
/// 3. Ensure starts with '\\'
/// 4. Case-insensitive comparison key (lowercase)
pub fn normalize_resource_path(path: &str) -> String {
    let mut normalized = path.replace('/', "\\");

    // Remove leading dot
    if normalized.starts_with('.') {
        normalized = normalized[1..].to_string();
    }

    // Ensure starts with backslash
    if !normalized.starts_with('\\') {
        normalized.insert(0, '\\');
    }

    normalized
}

/// Generate the case-folded lookup key for MDD resources.
pub fn resource_lookup_key(path: &str) -> String {
    normalize_resource_path(path).to_lowercase()
}

/// Find MDD resource files associated with an MDX file.
///
/// Looks for:
/// - `{stem}.mdd` — main resource file
/// - `{stem}.1.mdd`, `{stem}.2.mdd`, ... — volume files
pub fn find_mdd_files(mdx_path: &Path) -> Vec<PathBuf> {
    let Some(stem) = mdx_path.file_stem().and_then(|s| s.to_str()) else {
        return vec![];
    };
    let Some(dir) = mdx_path.parent() else {
        return vec![];
    };

    let mut mdds = Vec::new();

    // Main MDD
    let main_mdd = dir.join(format!("{stem}.mdd"));
    if main_mdd.exists() {
        mdds.push(main_mdd);
    }

    // Volume files
    for i in 1.. {
        let vol = dir.join(format!("{stem}.{i}.mdd"));
        if !vol.exists() {
            break;
        }
        mdds.push(vol);
    }

    mdds
}

/// Follow @@@LINK redirects in MDD resource data (UTF-16LE encoded).
///
/// Returns the final resource name after following redirects.
/// Detects cycles using a visited set.
pub fn follow_mdd_redirect(data: &[u8], _max_depth: usize) -> Result<MddRedirectResult> {
    match parse_link_utf16le(data) {
        Some(target) => Ok(MddRedirectResult::Redirect(target)),
        None => Ok(MddRedirectResult::Data),
    }
}

/// Result of checking MDD data for redirects.
#[derive(Debug, Clone, PartialEq)]
pub enum MddRedirectResult {
    /// The data is a redirect to another resource path.
    Redirect(String),
    /// The data is actual resource content (not a redirect).
    Data,
}

/// Resolve MDD resource with redirect chain support.
///
/// `load_fn` takes a normalized resource path and returns raw data.
/// Returns the final resource data after following any redirect chain.
pub fn resolve_mdd_resource<F>(initial_path: &str, mut load_fn: F) -> Result<Vec<u8>>
where
    F: FnMut(&str) -> Option<Vec<u8>>,
{
    use std::collections::HashSet;

    let mut current_path = initial_path.to_string();
    let mut visited = HashSet::new();
    const MAX_DEPTH: usize = 10;

    for _ in 0..MAX_DEPTH {
        if !visited.insert(current_path.clone()) {
            return Err(Error::Corrupt(format!(
                "MDD @@@LINK cycle: {}",
                current_path
            )));
        }

        let data = load_fn(&current_path).ok_or_else(|| {
            Error::KeyNotFound(current_path.clone())
        })?;

        match follow_mdd_redirect(&data, MAX_DEPTH)? {
            MddRedirectResult::Redirect(target) => {
                current_path = target;
            }
            MddRedirectResult::Data => {
                return Ok(data);
            }
        }
    }

    Err(Error::Corrupt(format!(
        "MDD redirect depth exceeded for: {}",
        initial_path
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn normalize_path_leading_dot() {
        assert_eq!(normalize_resource_path("./img/pic.png"), "\\img\\pic.png");
    }

    #[test]
    fn normalize_path_forward_slash() {
        assert_eq!(normalize_resource_path("/css/style.css"), "\\css\\style.css");
    }

    #[test]
    fn normalize_path_backslash_prefix() {
        assert_eq!(normalize_resource_path("\\fonts\\a.ttf"), "\\fonts\\a.ttf");
    }

    #[test]
    fn normalize_path_no_prefix() {
        assert_eq!(normalize_resource_path("audio/word.mp3"), "\\audio\\word.mp3");
    }

    #[test]
    fn resource_lookup_key_case_insensitive() {
        assert_eq!(resource_lookup_key("/IMG/Photo.PNG"), "\\img\\photo.png");
        assert_eq!(resource_lookup_key("\\CSS\\Style.CSS"), "\\css\\style.css");
    }

    #[test]
    fn find_mdd_none() {
        let dir = tempfile::tempdir().unwrap();
        let mdx = dir.path().join("test.mdx");
        fs::write(&mdx, b"").unwrap();

        let mdds = find_mdd_files(&mdx);
        assert!(mdds.is_empty());
    }

    #[test]
    fn find_mdd_single() {
        let dir = tempfile::tempdir().unwrap();
        let mdx = dir.path().join("dict.mdx");
        fs::write(&mdx, b"").unwrap();
        fs::write(dir.path().join("dict.mdd"), b"").unwrap();

        let mdds = find_mdd_files(&mdx);
        assert_eq!(mdds.len(), 1);
    }

    #[test]
    fn find_mdd_volumes() {
        let dir = tempfile::tempdir().unwrap();
        let mdx = dir.path().join("big.mdx");
        fs::write(&mdx, b"").unwrap();
        fs::write(dir.path().join("big.mdd"), b"").unwrap();
        fs::write(dir.path().join("big.1.mdd"), b"").unwrap();
        fs::write(dir.path().join("big.2.mdd"), b"").unwrap();
        fs::write(dir.path().join("big.3.mdd"), b"").unwrap();

        let mdds = find_mdd_files(&mdx);
        assert_eq!(mdds.len(), 4);
    }

    #[test]
    fn mdd_redirect_utf16le() {
        // Build redirect data
        let mut data = Vec::new();
        data.extend_from_slice(&[
            b'@', 0, b'@', 0, b'@', 0, b'L', 0, b'I', 0, b'N', 0, b'K', 0, b'=', 0,
        ]);
        for ch in "\\img\\real.png".encode_utf16() {
            data.extend_from_slice(&ch.to_le_bytes());
        }
        data.extend_from_slice(&[0, 0]);

        let result = follow_mdd_redirect(&data, 10).unwrap();
        assert_eq!(result, MddRedirectResult::Redirect("\\img\\real.png".to_string()));
    }

    #[test]
    fn mdd_not_a_redirect() {
        let data = vec![0x89, 0x50, 0x4E, 0x47]; // PNG magic
        let result = follow_mdd_redirect(&data, 10).unwrap();
        assert_eq!(result, MddRedirectResult::Data);
    }

    #[test]
    fn resolve_mdd_chain() {
        // path_a → redirect to path_b → actual data
        let load = |path: &str| -> Option<Vec<u8>> {
            match path {
                "\\a.css" => {
                    let mut d = Vec::new();
                    d.extend_from_slice(&[
                        b'@', 0, b'@', 0, b'@', 0, b'L', 0, b'I', 0, b'N', 0, b'K', 0, b'=', 0,
                    ]);
                    for ch in "\\b.css".encode_utf16() {
                        d.extend_from_slice(&ch.to_le_bytes());
                    }
                    d.extend_from_slice(&[0, 0]);
                    Some(d)
                }
                "\\b.css" => Some(b"body { color: red; }".to_vec()),
                _ => None,
            }
        };

        let result = resolve_mdd_resource("\\a.css", load).unwrap();
        assert_eq!(result, b"body { color: red; }");
    }

    #[test]
    fn resolve_mdd_cycle_detection() {
        // path_a → path_b → path_a (cycle)
        let load = |path: &str| -> Option<Vec<u8>> {
            let target = if path == "\\a" { "\\b" } else { "\\a" };
            let mut d = Vec::new();
            d.extend_from_slice(&[
                b'@', 0, b'@', 0, b'@', 0, b'L', 0, b'I', 0, b'N', 0, b'K', 0, b'=', 0,
            ]);
            for ch in target.encode_utf16() {
                d.extend_from_slice(&ch.to_le_bytes());
            }
            d.extend_from_slice(&[0, 0]);
            Some(d)
        };

        let result = resolve_mdd_resource("\\a", load);
        assert!(result.is_err());
        assert!(format!("{}", result.unwrap_err()).contains("cycle"));
    }
}
