//! Core types for MDX/MDD format parsing.

use std::collections::BTreeMap;

/// MDX format version determines number size and block info format.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Version {
    /// Version 1.x — numbers are u32, key block info is uncompressed.
    V1,
    /// Version 2.0+ — numbers are i64, key block info may be compressed/encrypted.
    V2,
}

impl Version {
    /// Determine version from the `GeneratedByEngineVersion` float.
    pub fn from_engine_version(v: f64) -> Self {
        if v < 2.0 {
            Self::V1
        } else {
            Self::V2
        }
    }

    /// Number of bytes used for numeric fields.
    pub fn number_size(self) -> usize {
        match self {
            Self::V1 => 4,
            Self::V2 => 8,
        }
    }
}

/// Dictionary text encoding.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DictEncoding {
    Utf8,
    Utf16Le,
    Gb18030,
}

impl DictEncoding {
    /// Normalize encoding string from MDX header attribute.
    ///
    /// Rules (matching GoldenDict):
    /// - "GBK" | "GB2312" → Gb18030
    /// - "" | "UTF-16" → Utf16Le
    /// - "UTF-8" → Utf8
    /// - "UTF-16LE" → Utf16Le
    /// - anything else → attempt as Utf8 fallback
    pub fn from_header_str(s: &str) -> Self {
        let upper = s.trim().to_uppercase();
        match upper.as_str() {
            "GBK" | "GB2312" | "GB18030" => Self::Gb18030,
            "" | "UTF-16" | "UTF-16LE" => Self::Utf16Le,
            _ => Self::Utf8,
        }
    }

    /// encoding_rs compatible label.
    pub fn label(&self) -> &'static str {
        match self {
            Self::Utf8 => "utf-8",
            Self::Utf16Le => "utf-16le",
            Self::Gb18030 => "gb18030",
        }
    }
}

/// Encryption flags from the MDX header.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EncryptionFlags(pub u32);

impl EncryptionFlags {
    pub const NONE: Self = Self(0);

    /// Whether the key block info is encrypted (bit 1).
    pub fn key_info_encrypted(self) -> bool {
        self.0 & 0x02 != 0
    }
}

/// A single stylesheet entry: id → (prefix, suffix).
pub type StyleSheet = BTreeMap<i32, (String, String)>;

/// Parsed MDX header information.
#[derive(Debug, Clone)]
pub struct HeaderInfo {
    pub version: Version,
    pub encoding: DictEncoding,
    pub encrypted: EncryptionFlags,
    pub title: String,
    pub description: String,
    pub stylesheets: StyleSheet,
    pub rtl: bool,
}

/// A compressed/decompressed size pair for a block.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BlockSizePair {
    pub compressed: u64,
    pub decompressed: u64,
}

/// Record block index entry for binary search.
#[derive(Debug, Clone, Copy)]
pub struct RecordIndex {
    /// Byte offset of the compressed block from record section start.
    pub start_pos: u64,
    /// End offset = start_pos + compressed_size.
    pub end_pos: u64,
    /// Logical (decompressed) start offset.
    pub shadow_start: u64,
    /// Logical (decompressed) end offset.
    pub shadow_end: u64,
    /// Compressed size of this block.
    pub compressed_size: u64,
    /// Decompressed size of this block.
    pub decompressed_size: u64,
}

impl RecordIndex {
    /// Binary search: find the block containing `offset` (in decompressed space).
    pub fn find(blocks: &[Self], offset: u64) -> Option<usize> {
        blocks
            .binary_search_by(|b| {
                if offset < b.shadow_start {
                    std::cmp::Ordering::Greater
                } else if offset >= b.shadow_end {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .ok()
    }
}

/// Info needed to extract a single record from the file.
#[derive(Debug, Clone, Copy)]
pub struct RecordInfo {
    /// Absolute file offset of the compressed block.
    pub compressed_block_pos: u64,
    /// Offset within the decompressed block where this record starts.
    pub record_offset: u64,
    /// Decompressed size of the entire block.
    pub decompressed_block_size: u64,
    /// Compressed size of the entire block.
    pub compressed_block_size: u64,
    /// Size of this record within the decompressed block.
    pub record_size: u64,
}

/// A key entry: (record_offset, headword).
#[derive(Debug, Clone)]
pub struct KeyEntry {
    pub record_offset: u64,
    pub headword: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_from_engine_below_2() {
        assert_eq!(Version::from_engine_version(1.2), Version::V1);
        assert_eq!(Version::from_engine_version(0.5), Version::V1);
        assert_eq!(Version::from_engine_version(1.99), Version::V1);
    }

    #[test]
    fn version_from_engine_at_2() {
        assert_eq!(Version::from_engine_version(2.0), Version::V2);
        assert_eq!(Version::from_engine_version(2.5), Version::V2);
        assert_eq!(Version::from_engine_version(3.0), Version::V2);
    }

    #[test]
    fn version_number_size() {
        assert_eq!(Version::V1.number_size(), 4);
        assert_eq!(Version::V2.number_size(), 8);
    }

    #[test]
    fn encoding_normalize_gbk() {
        assert_eq!(DictEncoding::from_header_str("GBK"), DictEncoding::Gb18030);
        assert_eq!(DictEncoding::from_header_str("GB2312"), DictEncoding::Gb18030);
        assert_eq!(DictEncoding::from_header_str("GB18030"), DictEncoding::Gb18030);
    }

    #[test]
    fn encoding_normalize_utf16() {
        assert_eq!(DictEncoding::from_header_str(""), DictEncoding::Utf16Le);
        assert_eq!(DictEncoding::from_header_str("UTF-16"), DictEncoding::Utf16Le);
        assert_eq!(DictEncoding::from_header_str("UTF-16LE"), DictEncoding::Utf16Le);
    }

    #[test]
    fn encoding_normalize_utf8() {
        assert_eq!(DictEncoding::from_header_str("UTF-8"), DictEncoding::Utf8);
        assert_eq!(DictEncoding::from_header_str("utf-8"), DictEncoding::Utf8);
    }

    #[test]
    fn encryption_flags() {
        assert!(!EncryptionFlags(0).key_info_encrypted());
        assert!(!EncryptionFlags(1).key_info_encrypted());
        assert!(EncryptionFlags(2).key_info_encrypted());
        assert!(EncryptionFlags(3).key_info_encrypted());
    }

    #[test]
    fn record_index_find() {
        let blocks = vec![
            RecordIndex {
                start_pos: 0, end_pos: 100,
                shadow_start: 0, shadow_end: 500,
                compressed_size: 100, decompressed_size: 500,
            },
            RecordIndex {
                start_pos: 100, end_pos: 250,
                shadow_start: 500, shadow_end: 1200,
                compressed_size: 150, decompressed_size: 700,
            },
        ];

        assert_eq!(RecordIndex::find(&blocks, 0), Some(0));
        assert_eq!(RecordIndex::find(&blocks, 499), Some(0));
        assert_eq!(RecordIndex::find(&blocks, 500), Some(1));
        assert_eq!(RecordIndex::find(&blocks, 1199), Some(1));
        assert_eq!(RecordIndex::find(&blocks, 1200), None);
    }
}
