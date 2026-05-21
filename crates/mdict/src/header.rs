//! MDX header parsing.
//!
//! The header section of an MDX file:
//! ```text
//! [header_text_size: i32 BE] [header_text: UTF-16LE bytes] [checksum: u32 LE]
//! ```

use crate::checksum::verify_adler32;
use crate::error::Error;
use crate::types::{DictEncoding, EncryptionFlags, HeaderInfo, StyleSheet, Version};
use crate::Result;

/// Parse the MDX header from raw file bytes starting at offset 0.
/// Returns `(HeaderInfo, bytes_consumed)`.
pub fn parse_header(data: &[u8], fallback_title: &str) -> Result<(HeaderInfo, usize)> {
    if data.len() < 4 {
        return Err(Error::InvalidHeader("file too small for header size".into()));
    }

    // 1. Read header text size (i32, big-endian)
    let header_text_size =
        i32::from_be_bytes([data[0], data[1], data[2], data[3]]) as usize;

    let consumed_so_far = 4;

    if data.len() < consumed_so_far + header_text_size + 4 {
        return Err(Error::InvalidHeader("file too small for header content".into()));
    }

    // 2. Read header text bytes (UTF-16LE)
    let header_text_bytes = &data[consumed_so_far..consumed_so_far + header_text_size];

    // 3. Read Adler-32 checksum (u32, little-endian)
    let checksum_offset = consumed_so_far + header_text_size;
    let checksum = u32::from_le_bytes([
        data[checksum_offset],
        data[checksum_offset + 1],
        data[checksum_offset + 2],
        data[checksum_offset + 3],
    ]);

    // 4. Verify checksum
    verify_adler32(header_text_bytes, checksum)?;

    // 5. Decode UTF-16LE to String
    let header_text = decode_utf16le(header_text_bytes);

    // 6. Parse XML attributes
    let info = parse_header_xml(&header_text, fallback_title)?;

    let total_consumed = checksum_offset + 4;
    Ok((info, total_consumed))
}

/// Decode UTF-16LE bytes to a Rust String.
fn decode_utf16le(data: &[u8]) -> String {
    let (cow, _, _) = encoding_rs::UTF_16LE.decode(data);
    cow.into_owned()
}

/// Parse header XML text into HeaderInfo.
fn parse_header_xml(xml_text: &str, fallback_title: &str) -> Result<HeaderInfo> {
    // The header is a single XML element like:
    // <Dictionary_Data ... GeneratedByEngineVersion="2.0" Encoding="UTF-8" ... />
    // or sometimes wrapped with attributes as shown.
    //
    // We use quick-xml to parse attributes from the root element.

    // Strip control characters (Qt6 compat, matching GoldenDict)
    let cleaned: String = xml_text
        .chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\r' || *c == '\t')
        .collect();

    // Extract StyleSheet attribute before XML parsing (GoldenDict workaround for QTBUG-102612)
    let stylesheets = extract_stylesheets(&cleaned);

    let attrs = parse_xml_attributes(&cleaned)?;

    // Version
    let version_str = attrs.get("GeneratedByEngineVersion").map(|s| s.as_str()).unwrap_or("1.0");
    let version_f64: f64 = version_str.parse().unwrap_or(1.0);
    let version = Version::from_engine_version(version_f64);

    // Encoding
    let encoding_str = attrs.get("Encoding").map(|s| s.as_str()).unwrap_or("");
    let encoding = DictEncoding::from_header_str(encoding_str);

    // Encrypted
    let encrypted_str = attrs.get("Encrypted").map(|s| s.as_str()).unwrap_or("0");
    let encrypted_val: u32 = encrypted_str.parse().unwrap_or(0);
    let encrypted = EncryptionFlags(encrypted_val);

    // Title
    let raw_title = attrs.get("Title").map(|s| s.as_str()).unwrap_or("");
    let title = normalize_title(raw_title, fallback_title);

    // Description
    let description = attrs.get("Description").cloned().unwrap_or_default();

    // RTL
    let left2right = attrs.get("Left2Right").map(|s| s.as_str()).unwrap_or("");
    let rtl = left2right != "Yes";

    Ok(HeaderInfo {
        version,
        encoding,
        encrypted,
        title,
        description,
        stylesheets,
        rtl,
    })
}

/// Extract StyleSheet attribute value using simple string search.
/// Format: lines of (id, prefix, suffix) triplets separated by newlines.
fn extract_stylesheets(text: &str) -> StyleSheet {
    let mut map = StyleSheet::new();

    // Find StyleSheet="..." value
    let marker = "StyleSheet=\"";
    let Some(start) = text.find(marker) else {
        return map;
    };
    let after = &text[start + marker.len()..];
    let Some(end) = after.find('"') else {
        return map;
    };
    let value = &after[..end];

    if value.is_empty() {
        return map;
    }

    // Parse triplets: id\nprefix\nsuffix
    let lines: Vec<&str> = value.split(['\r', '\n']).collect();
    let mut i = 0;
    while i + 2 < lines.len() {
        if let Ok(id) = lines[i].parse::<i32>() {
            let prefix = html_unescape_basic(lines[i + 1]);
            let suffix = html_unescape_basic(lines[i + 2]);
            map.insert(id, (prefix, suffix));
        }
        i += 3;
    }

    map
}

/// Parse XML attributes from root element.
fn parse_xml_attributes(xml: &str) -> Result<std::collections::HashMap<String, String>> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;
    use std::collections::HashMap;

    let mut reader = Reader::from_str(xml);
    let mut attrs = HashMap::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                for attr in e.attributes().flatten() {
                    let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                    let value = attr.unescape_value().unwrap_or_default().to_string();
                    attrs.insert(key, value);
                }
                break;
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => continue,
        }
    }

    if attrs.is_empty() {
        return Err(Error::InvalidHeader("no XML attributes found in header".into()));
    }

    Ok(attrs)
}

/// Normalize title: empty or placeholder → use filename; contains HTML → strip tags.
fn normalize_title(raw: &str, fallback: &str) -> String {
    if raw.is_empty() || raw == "Title (No HTML code allowed)" {
        return fallback.to_string();
    }

    if raw.contains('<') || raw.contains('>') {
        // Strip HTML tags
        strip_html_tags(raw)
    } else {
        raw.to_string()
    }
}

/// Very basic HTML tag stripping.
fn strip_html_tags(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut inside_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => result.push(ch),
            _ => {}
        }
    }
    result.trim().to_string()
}

/// Basic HTML entity unescaping (used for stylesheet values).
fn html_unescape_basic(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: build a minimal MDX header binary from XML text.
    fn build_header_bytes(xml: &str) -> Vec<u8> {
        // Encode XML to UTF-16LE
        let utf16le: Vec<u8> = xml
            .encode_utf16()
            .flat_map(|c| c.to_le_bytes())
            .collect();

        let header_text_size = utf16le.len() as i32;
        let checksum = crate::checksum::compute_adler32(&utf16le);

        let mut buf = Vec::new();
        buf.extend_from_slice(&header_text_size.to_be_bytes());
        buf.extend_from_slice(&utf16le);
        buf.extend_from_slice(&checksum.to_le_bytes());
        buf
    }

    #[test]
    fn parse_header_v2_utf8() {
        let xml = r#"<Dictionary GeneratedByEngineVersion="2.0" Encoding="UTF-8" Encrypted="0" Title="Test Dict" Description="A test" Left2Right="Yes" />"#;
        let data = build_header_bytes(xml);

        let (info, consumed) = parse_header(&data, "fallback").unwrap();
        assert_eq!(info.version, Version::V2);
        assert_eq!(info.encoding, DictEncoding::Utf8);
        assert!(!info.encrypted.key_info_encrypted());
        assert_eq!(info.title, "Test Dict");
        assert_eq!(info.description, "A test");
        assert!(!info.rtl);
        assert_eq!(consumed, data.len());
    }

    #[test]
    fn parse_header_v1_gbk() {
        let xml = r#"<Dictionary GeneratedByEngineVersion="1.2" Encoding="GBK" Encrypted="0" Title="中文词典" Description="" Left2Right="Yes" />"#;
        let data = build_header_bytes(xml);

        let (info, _) = parse_header(&data, "fallback").unwrap();
        assert_eq!(info.version, Version::V1);
        assert_eq!(info.encoding, DictEncoding::Gb18030);
        assert_eq!(info.title, "中文词典");
    }

    #[test]
    fn parse_header_with_stylesheet() {
        let xml = r#"<Dictionary GeneratedByEngineVersion="2.0" Encoding="UTF-8" Encrypted="0" StyleSheet="1
&lt;div class=&quot;s1&quot;&gt;
&lt;/div&gt;" Title="SS Test" Description="" Left2Right="Yes" />"#;
        let data = build_header_bytes(xml);

        let (info, _) = parse_header(&data, "fallback").unwrap();
        assert_eq!(info.stylesheets.len(), 1);
        let (prefix, suffix) = info.stylesheets.get(&1).unwrap();
        assert_eq!(prefix, r#"<div class="s1">"#);
        assert_eq!(suffix, "</div>");
    }

    #[test]
    fn parse_header_empty_title_uses_filename() {
        let xml = r#"<Dictionary GeneratedByEngineVersion="2.0" Encoding="UTF-8" Encrypted="0" Title="" Description="" Left2Right="Yes" />"#;
        let data = build_header_bytes(xml);

        let (info, _) = parse_header(&data, "my_dictionary").unwrap();
        assert_eq!(info.title, "my_dictionary");
    }

    #[test]
    fn parse_header_html_title_strips_tags() {
        let xml = r#"<Dictionary GeneratedByEngineVersion="2.0" Encoding="UTF-8" Encrypted="0" Title="&lt;b&gt;Bold Title&lt;/b&gt;" Description="" Left2Right="Yes" />"#;
        let data = build_header_bytes(xml);

        let (info, _) = parse_header(&data, "fallback").unwrap();
        assert_eq!(info.title, "Bold Title");
    }

    #[test]
    fn parse_header_bad_checksum_errors() {
        let xml = r#"<Dictionary GeneratedByEngineVersion="2.0" Encoding="UTF-8" Title="X" />"#;
        let mut data = build_header_bytes(xml);

        // Corrupt the checksum
        let len = data.len();
        data[len - 1] ^= 0xFF;

        let result = parse_header(&data, "fallback");
        assert!(result.is_err());
    }

    #[test]
    fn parse_header_truncated_errors() {
        let data = [0x00, 0x00, 0x01, 0x00]; // claims 256 bytes but nothing follows
        let result = parse_header(&data, "fallback");
        assert!(result.is_err());
    }

    #[test]
    fn parse_header_rtl_default() {
        let xml = r#"<Dictionary GeneratedByEngineVersion="2.0" Encoding="UTF-8" Title="RTL" Description="" />"#;
        let data = build_header_bytes(xml);

        let (info, _) = parse_header(&data, "fallback").unwrap();
        // No Left2Right attribute → rtl = true (GoldenDict: "Left2Right != Yes" → RTL)
        assert!(info.rtl);
    }

    #[test]
    fn parse_header_encrypted_key_info() {
        let xml = r#"<Dictionary GeneratedByEngineVersion="2.0" Encoding="UTF-8" Encrypted="2" Title="Enc" Description="" Left2Right="Yes" />"#;
        let data = build_header_bytes(xml);

        let (info, _) = parse_header(&data, "fallback").unwrap();
        assert!(info.encrypted.key_info_encrypted());
    }
}
