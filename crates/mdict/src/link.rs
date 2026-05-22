//! @@@LINK internal redirect handling.
//!
//! MDX articles may contain `@@@LINK=target` as their content, meaning
//! the article is a redirect to another headword. MDD resources may also
//! contain redirects encoded in UTF-16LE.

use std::collections::HashSet;

use crate::error::Error;
use crate::Result;

/// Maximum redirect depth to prevent infinite loops.
const MAX_REDIRECT_DEPTH: usize = 10;

/// Check if article text is an @@@LINK redirect.
/// Returns the target headword if it is, None otherwise.
pub fn parse_link(article: &str) -> Option<&str> {
    let trimmed = article.trim();
    if let Some(target) = trimmed.strip_prefix("@@@LINK=") {
        let target = target.trim();
        if target.is_empty() {
            None
        } else {
            Some(target)
        }
    } else {
        None
    }
}

/// Check if raw bytes (MDD resource) contain a UTF-16LE @@@LINK redirect.
/// Returns the target resource name if found.
pub fn parse_link_utf16le(data: &[u8]) -> Option<String> {
    // Pattern: "@\0@\0@\0L\0I\0N\0K\0=\0" (16 bytes)
    static PATTERN: &[u8] = &[
        b'@', 0, b'@', 0, b'@', 0, b'L', 0, b'I', 0, b'N', 0, b'K', 0, b'=', 0,
    ];

    if data.len() <= PATTERN.len() {
        return None;
    }

    if &data[..PATTERN.len()] != PATTERN {
        return None;
    }

    // Decode the rest as UTF-16LE
    let payload = &data[PATTERN.len()..];
    let mut code_units = Vec::new();
    let mut i = 0;
    while i + 1 < payload.len() {
        let unit = u16::from_le_bytes([payload[i], payload[i + 1]]);
        if unit == 0 {
            break;
        }
        code_units.push(unit);
        i += 2;
    }

    let target = String::from_utf16(&code_units).ok()?;
    let trimmed = target.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

/// Resolve a chain of @@@LINK redirects.
///
/// `lookup_fn` takes a headword and returns the article text (if found).
/// Returns the final resolved article text, or an error if a cycle is detected.
pub fn resolve_links<F>(initial_article: &str, mut lookup_fn: F) -> Result<String>
where
    F: FnMut(&str) -> Option<String>,
{
    let mut current = initial_article.to_string();
    let mut visited = HashSet::new();

    for _ in 0..MAX_REDIRECT_DEPTH {
        match parse_link(&current) {
            Some(target) => {
                if !visited.insert(target.to_string()) {
                    return Err(Error::Corrupt(format!(
                        "@@@LINK cycle detected: {}",
                        target
                    )));
                }
                match lookup_fn(target) {
                    Some(article) => current = article,
                    None => {
                        // Target not found — return the raw link text instead of failing.
                        // Many dictionaries have dangling @@@LINK entries for regional
                        // variants or inflections whose targets simply don't exist.
                        return Ok(current);
                    }
                }
            }
            None => return Ok(current),
        }
    }

    Err(Error::Corrupt(format!(
        "@@@LINK redirect depth exceeded ({MAX_REDIRECT_DEPTH})"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_link_simple() {
        assert_eq!(parse_link("@@@LINK=hello"), Some("hello"));
    }

    #[test]
    fn parse_link_with_whitespace() {
        assert_eq!(parse_link("  @@@LINK=world  "), Some("world"));
    }

    #[test]
    fn parse_link_empty_target() {
        assert_eq!(parse_link("@@@LINK="), None);
        assert_eq!(parse_link("@@@LINK=   "), None);
    }

    #[test]
    fn parse_link_not_a_link() {
        assert_eq!(parse_link("<p>Hello</p>"), None);
        assert_eq!(parse_link("@@LINK=foo"), None);
    }

    #[test]
    fn parse_link_utf16le_valid() {
        // Build: pattern + "test" in UTF-16LE + null
        let mut data = Vec::new();
        data.extend_from_slice(&[
            b'@', 0, b'@', 0, b'@', 0, b'L', 0, b'I', 0, b'N', 0, b'K', 0, b'=', 0,
        ]);
        // "test" in UTF-16LE
        for ch in "test".encode_utf16() {
            data.extend_from_slice(&ch.to_le_bytes());
        }
        data.extend_from_slice(&[0, 0]); // null terminator

        assert_eq!(parse_link_utf16le(&data), Some("test".to_string()));
    }

    #[test]
    fn parse_link_utf16le_not_a_link() {
        let data = b"<html>not a link</html>";
        assert_eq!(parse_link_utf16le(data), None);
    }

    #[test]
    fn parse_link_utf16le_too_short() {
        let data = &[b'@', 0, b'@', 0]; // too short
        assert_eq!(parse_link_utf16le(data), None);
    }

    #[test]
    fn follow_link_chain() {
        // a → @@@LINK=b, b → @@@LINK=c, c → "<p>final</p>"
        let lookup = |word: &str| -> Option<String> {
            match word {
                "b" => Some("@@@LINK=c".to_string()),
                "c" => Some("<p>final</p>".to_string()),
                _ => None,
            }
        };

        let result = resolve_links("@@@LINK=b", lookup).unwrap();
        assert_eq!(result, "<p>final</p>");
    }

    #[test]
    fn detect_link_cycle() {
        // a → b → a (cycle)
        let lookup = |word: &str| -> Option<String> {
            match word {
                "a" => Some("@@@LINK=b".to_string()),
                "b" => Some("@@@LINK=a".to_string()),
                _ => None,
            }
        };

        let result = resolve_links("@@@LINK=a", lookup);
        assert!(result.is_err());
        let err = format!("{}", result.unwrap_err());
        assert!(err.contains("cycle"));
    }

    #[test]
    fn resolve_non_link_article() {
        let result = resolve_links("<p>normal article</p>", |_| None).unwrap();
        assert_eq!(result, "<p>normal article</p>");
    }

    #[test]
    fn resolve_link_target_not_found() {
        // Dangling links now gracefully return the raw article text
        let result = resolve_links("@@@LINK=nonexistent", |_| None).unwrap();
        assert_eq!(result, "@@@LINK=nonexistent");
    }
}
