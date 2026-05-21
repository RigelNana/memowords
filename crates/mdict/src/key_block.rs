//! Key Block Info and Key Block parsing.
//!
//! The key block section sits immediately after the header and contains:
//! 1. Key Block Header: counts and sizes
//! 2. Key Block Info: per-block (compressed, decompressed) size pairs
//! 3. Key Blocks: compressed blocks of (offset, headword) entries

use crate::checksum::verify_adler32;
use crate::decompress::decompress_block;
use crate::decrypt::decrypt_key_block_info;
use crate::error::Error;
use crate::number::{read_number, read_u8_or_u16};
use crate::types::{BlockSizePair, DictEncoding, EncryptionFlags, KeyEntry, Version};
use crate::Result;

/// Parsed key block header metadata.
#[derive(Debug, Clone)]
pub struct KeyBlockHeader {
    pub num_blocks: u64,
    pub num_entries: u64,
    /// Only present in v2.0 — decompressed size of key block info.
    pub info_decompressed_size: Option<u64>,
    pub info_compressed_size: u64,
    pub blocks_total_size: u64,
}

/// Parse the Key Block Header from raw bytes.
/// Returns `(KeyBlockHeader, bytes_consumed)`.
pub fn parse_key_block_header(data: &[u8], version: Version) -> Result<(KeyBlockHeader, usize)> {
    let mut offset = 0;

    let (num_blocks, n) = read_number(&data[offset..], version)?;
    offset += n;

    let (num_entries, n) = read_number(&data[offset..], version)?;
    offset += n;

    let info_decompressed_size = if version == Version::V2 {
        let (val, n) = read_number(&data[offset..], version)?;
        offset += n;
        Some(val)
    } else {
        None
    };

    let (info_compressed_size, n) = read_number(&data[offset..], version)?;
    offset += n;

    let (blocks_total_size, n) = read_number(&data[offset..], version)?;
    offset += n;

    // v2.0: Adler-32 checksum of the header bytes
    if version == Version::V2 {
        if data.len() < offset + 4 {
            return Err(Error::Corrupt("key block header too short for checksum".into()));
        }
        let checksum = u32::from_be_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        verify_adler32(&data[..offset], checksum)?;
        offset += 4;
    }

    Ok((
        KeyBlockHeader {
            num_blocks,
            num_entries,
            info_decompressed_size,
            info_compressed_size,
            blocks_total_size,
        },
        offset,
    ))
}

/// Parse Key Block Info bytes into a list of (compressed, decompressed) size pairs.
///
/// `raw_info` is the raw key block info data (may need decryption + decompression).
/// After decompression, we decode the block info entries.
pub fn parse_key_block_info(
    raw_info: &[u8],
    version: Version,
    encoding: &DictEncoding,
    encrypted: EncryptionFlags,
    decompressed_size: Option<u64>,
) -> Result<Vec<BlockSizePair>> {
    let decompressed: Vec<u8>;

    if version == Version::V2 {
        // May need decryption
        let mut buf = raw_info.to_vec();
        if encrypted.key_info_encrypted() {
            decrypt_key_block_info(&mut buf)?;
        }

        // Decompress
        let expected = decompressed_size.unwrap_or(0) as usize;
        decompressed = decompress_block(&buf, expected)?;
    } else {
        // v1.x: info is not compressed
        decompressed = raw_info.to_vec();
    }

    decode_block_info(&decompressed, version, encoding)
}

/// Decode block info entries from decompressed data.
fn decode_block_info(
    data: &[u8],
    version: Version,
    encoding: &DictEncoding,
) -> Result<Vec<BlockSizePair>> {
    let mut entries = Vec::new();
    let mut offset = 0;
    let _is_u16 = version == Version::V2;
    let text_term_size: usize = if version == Version::V2 { 1 } else { 0 };

    while offset < data.len() {
        // Number of keywords in block (skip)
        let (_, n) = read_number(&data[offset..], version)?;
        offset += n;

        // First headword size
        let (first_head_size, n) = read_u8_or_u16(&data[offset..], version)?;
        offset += n;

        // Skip first headword text
        let char_size = if *encoding == DictEncoding::Utf16Le { 2 } else { 1 };
        offset += (first_head_size as usize + text_term_size) * char_size;

        // Last headword size
        let (last_head_size, n) = read_u8_or_u16(&data[offset..], version)?;
        offset += n;

        // Skip last headword text
        offset += (last_head_size as usize + text_term_size) * char_size;

        // Compressed size
        let (compressed, n) = read_number(&data[offset..], version)?;
        offset += n;

        // Decompressed size
        let (decompressed, n) = read_number(&data[offset..], version)?;
        offset += n;

        entries.push(BlockSizePair {
            compressed,
            decompressed,
        });
    }

    Ok(entries)
}

/// Parse a single decompressed key block into key entries.
///
/// Each entry is: [offset: number(version)] [headword: null-terminated string]
pub fn split_key_block(
    block: &[u8],
    version: Version,
    encoding: &DictEncoding,
) -> Result<Vec<KeyEntry>> {
    let mut entries = Vec::new();
    let mut pos = 0;

    while pos < block.len() {
        // Read record offset
        let (record_offset, n) = read_number(&block[pos..], version)?;
        pos += n;

        // Read null-terminated headword
        let headword = if *encoding == DictEncoding::Utf16Le {
            read_utf16le_null_terminated(&block[pos..])?
        } else {
            read_utf8_null_terminated(&block[pos..])?
        };

        let byte_len = if *encoding == DictEncoding::Utf16Le {
            (headword.encode_utf16().count() + 1) * 2
        } else {
            headword.len() + 1
        };
        pos += byte_len;

        entries.push(KeyEntry {
            record_offset,
            headword,
        });
    }

    Ok(entries)
}

/// Read a null-terminated UTF-8 (or compatible) string.
fn read_utf8_null_terminated(data: &[u8]) -> Result<String> {
    let end = data
        .iter()
        .position(|&b| b == 0)
        .unwrap_or(data.len());
    let s = String::from_utf8_lossy(&data[..end]).into_owned();
    Ok(s)
}

/// Read a null-terminated UTF-16LE string (null = two zero bytes).
fn read_utf16le_null_terminated(data: &[u8]) -> Result<String> {
    let mut chars = Vec::new();
    let mut i = 0;
    while i + 1 < data.len() {
        let code_unit = u16::from_le_bytes([data[i], data[i + 1]]);
        if code_unit == 0 {
            break;
        }
        chars.push(code_unit);
        i += 2;
    }
    String::from_utf16(&chars).map_err(|e| Error::EncodingError(format!("UTF-16LE: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::checksum::compute_adler32;

    #[test]
    fn parse_key_block_header_v2() {
        // 5 × i64 + u32 checksum
        let mut data = Vec::new();
        data.extend_from_slice(&10u64.to_be_bytes()); // num_blocks
        data.extend_from_slice(&1000u64.to_be_bytes()); // num_entries
        data.extend_from_slice(&256u64.to_be_bytes()); // info_decompressed_size
        data.extend_from_slice(&128u64.to_be_bytes()); // info_compressed_size
        data.extend_from_slice(&4096u64.to_be_bytes()); // blocks_total_size

        let checksum = compute_adler32(&data);
        data.extend_from_slice(&checksum.to_be_bytes());

        let (header, consumed) = parse_key_block_header(&data, Version::V2).unwrap();
        assert_eq!(header.num_blocks, 10);
        assert_eq!(header.num_entries, 1000);
        assert_eq!(header.info_decompressed_size, Some(256));
        assert_eq!(header.info_compressed_size, 128);
        assert_eq!(header.blocks_total_size, 4096);
        assert_eq!(consumed, 44); // 5*8 + 4
    }

    #[test]
    fn parse_key_block_header_v1() {
        // 4 × u32, no checksum
        let mut data = Vec::new();
        data.extend_from_slice(&5u32.to_be_bytes()); // num_blocks
        data.extend_from_slice(&500u32.to_be_bytes()); // num_entries
        data.extend_from_slice(&64u32.to_be_bytes()); // info_compressed_size
        data.extend_from_slice(&2048u32.to_be_bytes()); // blocks_total_size

        let (header, consumed) = parse_key_block_header(&data, Version::V1).unwrap();
        assert_eq!(header.num_blocks, 5);
        assert_eq!(header.num_entries, 500);
        assert_eq!(header.info_decompressed_size, None);
        assert_eq!(header.info_compressed_size, 64);
        assert_eq!(header.blocks_total_size, 2048);
        assert_eq!(consumed, 16);
    }

    #[test]
    fn parse_key_block_header_bad_checksum() {
        let mut data = Vec::new();
        data.extend_from_slice(&1u64.to_be_bytes());
        data.extend_from_slice(&1u64.to_be_bytes());
        data.extend_from_slice(&1u64.to_be_bytes());
        data.extend_from_slice(&1u64.to_be_bytes());
        data.extend_from_slice(&1u64.to_be_bytes());
        data.extend_from_slice(&0xDEADBEEFu32.to_be_bytes()); // bad checksum

        let result = parse_key_block_header(&data, Version::V2);
        assert!(result.is_err());
    }

    #[test]
    fn split_headwords_utf8_v2() {
        let mut block = Vec::new();
        // Entry 1: offset=0, headword="hello"
        block.extend_from_slice(&0u64.to_be_bytes());
        block.extend_from_slice(b"hello\0");
        // Entry 2: offset=100, headword="world"
        block.extend_from_slice(&100u64.to_be_bytes());
        block.extend_from_slice(b"world\0");

        let entries = split_key_block(&block, Version::V2, &DictEncoding::Utf8).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].record_offset, 0);
        assert_eq!(entries[0].headword, "hello");
        assert_eq!(entries[1].record_offset, 100);
        assert_eq!(entries[1].headword, "world");
    }

    #[test]
    fn split_headwords_utf16le_v2() {
        let mut block = Vec::new();
        // Entry: offset=42, headword="hi" in UTF-16LE
        block.extend_from_slice(&42u64.to_be_bytes());
        // 'h' = 0x0068, 'i' = 0x0069, null = 0x0000
        block.extend_from_slice(&[0x68, 0x00, 0x69, 0x00, 0x00, 0x00]);

        let entries = split_key_block(&block, Version::V2, &DictEncoding::Utf16Le).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].record_offset, 42);
        assert_eq!(entries[0].headword, "hi");
    }

    #[test]
    fn split_headwords_utf8_v1() {
        let mut block = Vec::new();
        // Entry: offset=10, headword="test"
        block.extend_from_slice(&10u32.to_be_bytes());
        block.extend_from_slice(b"test\0");

        let entries = split_key_block(&block, Version::V1, &DictEncoding::Utf8).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].record_offset, 10);
        assert_eq!(entries[0].headword, "test");
    }

    #[test]
    fn decode_key_block_info_v1() {
        // v1: each entry is: num_keywords(u32) + first_head_size(u8) + text + last_head_size(u8) + text + comp(u32) + decomp(u32)
        let mut data = Vec::new();
        // Block 1:
        data.extend_from_slice(&50u32.to_be_bytes()); // num_keywords
        data.push(3); // first_head_size = 3 chars
        data.extend_from_slice(b"abc\0"); // first_head + null (v1 has no textTermSize extra)
                                          // Wait - v1 textTermSize = 0, so just 3+0 = 3 bytes for text... but the text is null-terminated in the raw data
        // Actually re-reading GoldenDict: skipRawData(textHeadSize + textTermSize)
        // v1: textTermSize = 0, so skip textHeadSize bytes

        // Let me redo this properly:
        // v1: skip textHeadSize bytes (no extra terminator accounted in skip)
        data.clear();
        data.extend_from_slice(&50u32.to_be_bytes()); // num_keywords
        data.push(3); // first_head_size = 3
        data.extend_from_slice(b"abc"); // 3 bytes
        data.push(5); // last_head_size = 5
        data.extend_from_slice(b"zebra"); // 5 bytes
        data.extend_from_slice(&100u32.to_be_bytes()); // compressed
        data.extend_from_slice(&200u32.to_be_bytes()); // decompressed

        let entries = decode_block_info(&data, Version::V1, &DictEncoding::Utf8).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].compressed, 100);
        assert_eq!(entries[0].decompressed, 200);
    }

    #[test]
    fn decode_key_block_info_v2_utf8() {
        // v2: num(i64) + head_size(u16) + text(size+1 bytes) + ... + comp(i64) + decomp(i64)
        let mut data = Vec::new();
        data.extend_from_slice(&100u64.to_be_bytes()); // num_keywords
        data.extend_from_slice(&3u16.to_be_bytes()); // first_head_size = 3
        data.extend_from_slice(b"abc\0"); // 3+1 = 4 bytes (textTermSize=1)
        data.extend_from_slice(&4u16.to_be_bytes()); // last_head_size = 4
        data.extend_from_slice(b"wxyz\0"); // 4+1 = 5 bytes
        data.extend_from_slice(&512u64.to_be_bytes()); // compressed
        data.extend_from_slice(&1024u64.to_be_bytes()); // decompressed

        let entries = decode_block_info(&data, Version::V2, &DictEncoding::Utf8).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].compressed, 512);
        assert_eq!(entries[0].decompressed, 1024);
    }

    #[test]
    fn decode_key_block_info_v2_utf16le() {
        // v2 + UTF-16LE: text bytes = (size+1)*2
        let mut data = Vec::new();
        data.extend_from_slice(&10u64.to_be_bytes()); // num_keywords
        data.extend_from_slice(&2u16.to_be_bytes()); // first_head_size = 2 chars
        // 2+1 = 3 chars × 2 = 6 bytes
        data.extend_from_slice(&[0x41, 0x00, 0x42, 0x00, 0x00, 0x00]); // "AB\0"
        data.extend_from_slice(&1u16.to_be_bytes()); // last_head_size = 1 char
        // 1+1 = 2 chars × 2 = 4 bytes
        data.extend_from_slice(&[0x5A, 0x00, 0x00, 0x00]); // "Z\0"
        data.extend_from_slice(&256u64.to_be_bytes()); // compressed
        data.extend_from_slice(&768u64.to_be_bytes()); // decompressed

        let entries = decode_block_info(&data, Version::V2, &DictEncoding::Utf16Le).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].compressed, 256);
        assert_eq!(entries[0].decompressed, 768);
    }
}
