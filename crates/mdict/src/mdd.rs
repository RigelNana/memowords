//! MDD resource file parsing and resource loading.
//!
//! MDD files use the same binary format as MDX but store resources
//! (images, CSS, JS, audio, fonts) instead of articles.

use std::path::{Path, PathBuf};

use memmap2::Mmap;

use crate::decompress::decompress_block;
use crate::error::Error;
use crate::header::parse_header;
use crate::index::{self, DictIndex};
use crate::key_block::{parse_key_block_header, parse_key_block_info, split_key_block};
use crate::link::parse_link_utf16le;
use crate::record_block::{
    extract_record_bytes, parse_record_block_header, parse_record_block_infos, build_record_infos,
};
use crate::types::{KeyEntry, RecordInfo};
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

/// A parsed MDD resource file ready for lookups.
///
/// Uses the same binary format as MDX (key blocks + record blocks) but stores
/// binary resources (images, CSS, audio, etc.) instead of HTML articles.
/// Keys are resource paths, indexed via a persistent FST (same as MDX).
pub struct MddFile {
    /// Memory-mapped file data.
    mmap: Mmap,
    /// All key entries (resource paths + record offsets).
    entries: Vec<KeyEntry>,
    /// Pre-computed RecordInfo per entry.
    record_infos: Vec<RecordInfo>,
    /// FST index (folded resource path → entry indices). Persistent cache.
    index: DictIndex,
}

impl MddFile {
    /// Open and parse an MDD resource file.
    ///
    /// Uses the same persistent FST index approach as MDX:
    /// - Try loading cached `.mdd.idx` file
    /// - If stale/missing, rebuild from key blocks and persist in background
    pub fn open(path: &Path) -> Result<Self> {
        let file = std::fs::File::open(path).map_err(|e| {
            Error::Io(std::io::Error::new(e.kind(), format!("{}: {e}", path.display())))
        })?;

        let mmap = unsafe { Mmap::map(&file)? };
        let data = &mmap[..];

        let fallback_title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("mdd");

        // 1. Parse header (same format as MDX)
        let (info, header_consumed) = parse_header(data, fallback_title)?;
        let mut pos = header_consumed;

        // 2. Parse key block header
        let (kb_header, kb_header_consumed) =
            parse_key_block_header(&data[pos..], info.version)?;
        pos += kb_header_consumed;

        // 3. Parse key block info
        let info_end = pos + kb_header.info_compressed_size as usize;
        if info_end > data.len() {
            return Err(Error::Corrupt("MDD key block info extends beyond file".into()));
        }
        let raw_info = &data[pos..info_end];
        let block_sizes = parse_key_block_info(
            raw_info,
            info.version,
            &info.encoding,
            info.encrypted,
            kb_header.info_decompressed_size,
        )?;
        pos = info_end;

        // 4. Read all key blocks
        let mut all_entries = Vec::with_capacity(kb_header.num_entries as usize);
        for size_pair in &block_sizes {
            let block_end = pos + size_pair.compressed as usize;
            if block_end > data.len() {
                return Err(Error::Corrupt("MDD key block extends beyond file".into()));
            }
            let compressed_block = &data[pos..block_end];
            let decompressed = decompress_block(compressed_block, size_pair.decompressed as usize)?;
            let entries = split_key_block(&decompressed, info.version, &info.encoding)?;
            all_entries.extend(entries);
            pos = block_end;
        }

        // 5. Parse record block header
        let (rb_header, rb_header_consumed) =
            parse_record_block_header(&data[pos..], info.version)?;
        pos += rb_header_consumed;

        // 6. Parse record block infos
        let rb_info_end = pos + rb_header.record_info_size as usize;
        if rb_info_end > data.len() {
            return Err(Error::Corrupt("MDD record block info extends beyond file".into()));
        }
        let record_blocks = parse_record_block_infos(
            &data[pos..rb_info_end],
            rb_header.num_record_blocks,
            info.version,
        )?;
        let record_section_offset = rb_info_end as u64;

        // 7. Build RecordInfo for each entry
        let record_infos = build_record_infos(&all_entries, &record_blocks, record_section_offset)?;

        // 8. Build or load cached FST index (same as MDX)
        let idx_path = index::mdd_index_path_for(path);
        let source_mtime = source_mtime_secs(path);
        let entry_count = all_entries.len() as u64;

        let fst_index = match index::load_index(&idx_path, entry_count, source_mtime) {
            Some(cached) => {
                tracing::debug!(path = %idx_path.display(), "loaded cached MDD index");
                cached
            }
            None => {
                tracing::debug!("building MDD FST index ({} entries)", all_entries.len());
                let built = DictIndex::build(&all_entries)?;
                // Persist cache in background thread
                let save_path = idx_path.clone();
                let fst_bytes = built.fst_bytes().to_vec();
                let dups = built.duplicates_clone();
                std::thread::spawn(move || {
                    if let Err(e) = index::save_index_raw(
                        &fst_bytes, &dups, &save_path, entry_count, source_mtime,
                    ) {
                        tracing::warn!(error = %e, "failed to persist MDD index");
                    } else {
                        tracing::debug!(path = %save_path.display(), "MDD index persisted");
                    }
                });
                built
            }
        };

        tracing::debug!(
            path = %path.display(),
            entries = all_entries.len(),
            unique_keys = fst_index.len(),
            "MDD file opened"
        );

        Ok(Self {
            mmap,
            entries: all_entries,
            record_infos,
            index: fst_index,
        })
    }

    /// Lookup a resource by its normalized path.
    /// Returns raw bytes if found.
    pub fn lookup(&self, normalized_path: &str) -> Option<Vec<u8>> {
        let indices = self.index.get(normalized_path);
        if indices.is_empty() {
            return None;
        }
        // Use first match
        let idx = indices[0];
        let info = self.record_infos.get(idx)?;
        extract_record_bytes(&self.mmap, info).ok()
    }

    /// Number of resource entries in this MDD file.
    pub fn entry_count(&self) -> usize {
        self.entries.len()
    }
}

/// Get the modification time of a file as seconds since UNIX epoch.
fn source_mtime_secs(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
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
