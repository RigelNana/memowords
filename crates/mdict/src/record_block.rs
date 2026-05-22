//! Record Block Info parsing and article extraction.
//!
//! Record blocks contain the actual article content (HTML/text).
//! The record section sits after all key blocks.

use crate::decompress::decompress_block;
use crate::error::Error;
use crate::number::read_number;
use crate::types::{DictEncoding, KeyEntry, RecordIndex, RecordInfo, Version};
use crate::Result;

/// Parsed record block section header.
#[derive(Debug, Clone)]
pub struct RecordBlockHeader {
    pub num_record_blocks: u64,
    pub num_entries: u64,
    pub record_info_size: u64,
    pub total_records_size: u64,
}

/// Parse the Record Block Header.
/// Returns `(RecordBlockHeader, bytes_consumed)`.
pub fn parse_record_block_header(data: &[u8], version: Version) -> Result<(RecordBlockHeader, usize)> {
    let mut offset = 0;

    let (num_record_blocks, n) = read_number(&data[offset..], version)?;
    offset += n;

    let (num_entries, n) = read_number(&data[offset..], version)?;
    offset += n;

    let (record_info_size, n) = read_number(&data[offset..], version)?;
    offset += n;

    let (total_records_size, n) = read_number(&data[offset..], version)?;
    offset += n;

    Ok((
        RecordBlockHeader {
            num_record_blocks,
            num_entries,
            record_info_size,
            total_records_size,
        },
        offset,
    ))
}

/// Parse record block info entries into RecordIndex list.
/// Each entry has (compressed_size, decompressed_size) and we compute shadow positions.
pub fn parse_record_block_infos(
    data: &[u8],
    num_blocks: u64,
    version: Version,
) -> Result<Vec<RecordIndex>> {
    let mut blocks = Vec::with_capacity(num_blocks as usize);
    let mut offset = 0;
    let mut acc_compressed: u64 = 0;
    let mut acc_decompressed: u64 = 0;

    for _ in 0..num_blocks {
        let (compressed_size, n) = read_number(&data[offset..], version)?;
        offset += n;

        let (decompressed_size, n) = read_number(&data[offset..], version)?;
        offset += n;

        blocks.push(RecordIndex {
            start_pos: acc_compressed,
            end_pos: acc_compressed + compressed_size,
            shadow_start: acc_decompressed,
            shadow_end: acc_decompressed + decompressed_size,
            compressed_size,
            decompressed_size,
        });

        acc_compressed += compressed_size;
        acc_decompressed += decompressed_size;
    }

    Ok(blocks)
}

/// Build RecordInfo for a list of key entries against record block indices.
/// `record_section_offset` is the absolute file offset where record blocks start.
pub fn build_record_infos(
    entries: &[KeyEntry],
    blocks: &[RecordIndex],
    record_section_offset: u64,
) -> Result<Vec<RecordInfo>> {
    let mut infos = Vec::with_capacity(entries.len());
    let mut current_block_idx: usize = 0;

    for (i, entry) in entries.iter().enumerate() {
        // Find the block containing this entry's offset
        if current_block_idx < blocks.len()
            && blocks[current_block_idx].shadow_end <= entry.record_offset
        {
            current_block_idx = RecordIndex::find(blocks, entry.record_offset)
                .ok_or_else(|| {
                    Error::Corrupt(format!(
                        "record offset {} not in any block",
                        entry.record_offset
                    ))
                })?;
        }

        let block = &blocks[current_block_idx];

        // Record size = next entry's offset - this entry's offset
        // For the last entry in this block: block shadow_end - entry offset
        let record_size = if i + 1 < entries.len() {
            entries[i + 1].record_offset - entry.record_offset
        } else {
            block.shadow_end - entry.record_offset
        };

        infos.push(RecordInfo {
            compressed_block_pos: record_section_offset + block.start_pos,
            record_offset: entry.record_offset - block.shadow_start,
            decompressed_block_size: block.decompressed_size,
            compressed_block_size: block.compressed_size,
            record_size,
        });
    }

    Ok(infos)
}

/// Extract a single article from file data given its RecordInfo.
/// `file_data` is the full mmap'd file.
pub fn extract_record(file_data: &[u8], info: &RecordInfo, encoding: &DictEncoding) -> Result<String> {
    let block_start = info.compressed_block_pos as usize;
    let block_end = block_start + info.compressed_block_size as usize;

    if block_end > file_data.len() {
        return Err(Error::Corrupt("record block extends beyond file".into()));
    }

    let compressed = &file_data[block_start..block_end];
    let decompressed = decompress_block(compressed, info.decompressed_block_size as usize)?;

    let record_start = info.record_offset as usize;
    let record_end = record_start + info.record_size as usize;

    if record_end > decompressed.len() {
        return Err(Error::Corrupt("record extends beyond decompressed block".into()));
    }

    let raw = &decompressed[record_start..record_end];
    decode_record_text(raw, encoding)
}

/// Decode raw record bytes to a UTF-8 string using the dictionary encoding.
/// Strips trailing null bytes and whitespace (MDX records are null-terminated).
fn decode_record_text(data: &[u8], encoding: &DictEncoding) -> Result<String> {
    let s = match encoding {
        DictEncoding::Utf8 => String::from_utf8_lossy(data).into_owned(),
        DictEncoding::Utf16Le => {
            let (cow, _, had_errors) = encoding_rs::UTF_16LE.decode(data);
            if had_errors {
                tracing::warn!("UTF-16LE decoding had errors");
            }
            cow.into_owned()
        }
        DictEncoding::Gb18030 => {
            let (cow, _, had_errors) = encoding_rs::GB18030.decode(data);
            if had_errors {
                tracing::warn!("GB18030 decoding had errors");
            }
            cow.into_owned()
        }
    };
    // Strip trailing null bytes and whitespace (MDX null-terminates records)
    Ok(s.trim_end_matches('\0').trim_end().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_record_block_header_v2() {
        let mut data = Vec::new();
        data.extend_from_slice(&5u64.to_be_bytes());
        data.extend_from_slice(&1000u64.to_be_bytes());
        data.extend_from_slice(&80u64.to_be_bytes());
        data.extend_from_slice(&50000u64.to_be_bytes());

        let (header, consumed) = parse_record_block_header(&data, Version::V2).unwrap();
        assert_eq!(header.num_record_blocks, 5);
        assert_eq!(header.num_entries, 1000);
        assert_eq!(header.record_info_size, 80);
        assert_eq!(header.total_records_size, 50000);
        assert_eq!(consumed, 32);
    }

    #[test]
    fn parse_record_block_infos_accumulates() {
        let mut data = Vec::new();
        // Block 1: compressed=100, decompressed=500
        data.extend_from_slice(&100u64.to_be_bytes());
        data.extend_from_slice(&500u64.to_be_bytes());
        // Block 2: compressed=200, decompressed=800
        data.extend_from_slice(&200u64.to_be_bytes());
        data.extend_from_slice(&800u64.to_be_bytes());

        let blocks = parse_record_block_infos(&data, 2, Version::V2).unwrap();
        assert_eq!(blocks.len(), 2);

        assert_eq!(blocks[0].start_pos, 0);
        assert_eq!(blocks[0].end_pos, 100);
        assert_eq!(blocks[0].shadow_start, 0);
        assert_eq!(blocks[0].shadow_end, 500);

        assert_eq!(blocks[1].start_pos, 100);
        assert_eq!(blocks[1].end_pos, 300);
        assert_eq!(blocks[1].shadow_start, 500);
        assert_eq!(blocks[1].shadow_end, 1300);
    }

    #[test]
    fn shadow_positions_accumulate_correctly() {
        let mut data = Vec::new();
        for i in 1..=4u64 {
            data.extend_from_slice(&(i * 50).to_be_bytes()); // compressed
            data.extend_from_slice(&(i * 100).to_be_bytes()); // decompressed
        }

        let blocks = parse_record_block_infos(&data, 4, Version::V2).unwrap();

        let mut expected_comp: u64 = 0;
        let mut expected_decomp: u64 = 0;
        for (i, block) in blocks.iter().enumerate() {
            assert_eq!(block.start_pos, expected_comp);
            assert_eq!(block.shadow_start, expected_decomp);
            expected_comp += (i as u64 + 1) * 50;
            expected_decomp += (i as u64 + 1) * 100;
            assert_eq!(block.end_pos, expected_comp);
            assert_eq!(block.shadow_end, expected_decomp);
        }
    }

    #[test]
    fn build_record_infos_basic() {
        let blocks = vec![
            RecordIndex {
                start_pos: 0,
                end_pos: 100,
                shadow_start: 0,
                shadow_end: 500,
                compressed_size: 100,
                decompressed_size: 500,
            },
            RecordIndex {
                start_pos: 100,
                end_pos: 250,
                shadow_start: 500,
                shadow_end: 1200,
                compressed_size: 150,
                decompressed_size: 700,
            },
        ];

        let entries = vec![
            KeyEntry { record_offset: 0, headword: "a".into() },
            KeyEntry { record_offset: 100, headword: "b".into() },
            KeyEntry { record_offset: 400, headword: "c".into() },
            KeyEntry { record_offset: 600, headword: "d".into() },
        ];

        let infos = build_record_infos(&entries, &blocks, 1000).unwrap();
        assert_eq!(infos.len(), 4);

        // Entry "a": block 0, offset=0, size=100
        assert_eq!(infos[0].compressed_block_pos, 1000);
        assert_eq!(infos[0].record_offset, 0);
        assert_eq!(infos[0].record_size, 100);

        // Entry "b": block 0, offset=100, size=300
        assert_eq!(infos[1].record_offset, 100);
        assert_eq!(infos[1].record_size, 300);

        // Entry "c": block 0, offset=400, size=200 (next is 600 which is in block 1)
        assert_eq!(infos[2].record_offset, 400);
        assert_eq!(infos[2].record_size, 200);
    }

    #[test]
    fn decode_record_text_utf8() {
        let data = b"<p>Hello</p>";
        let result = decode_record_text(data, &DictEncoding::Utf8).unwrap();
        assert_eq!(result, "<p>Hello</p>");
    }

    #[test]
    fn decode_record_text_utf16le() {
        // "Hi" in UTF-16LE
        let data = [0x48, 0x00, 0x69, 0x00];
        let result = decode_record_text(&data, &DictEncoding::Utf16Le).unwrap();
        assert_eq!(result, "Hi");
    }

    #[test]
    fn bsearch_exact_match() {
        let blocks = vec![
            RecordIndex {
                start_pos: 0, end_pos: 100,
                shadow_start: 0, shadow_end: 500,
                compressed_size: 100, decompressed_size: 500,
            },
        ];
        assert_eq!(RecordIndex::find(&blocks, 0), Some(0));
        assert_eq!(RecordIndex::find(&blocks, 499), Some(0));
        assert_eq!(RecordIndex::find(&blocks, 500), None);
    }

    #[test]
    fn bsearch_not_found() {
        let blocks = vec![
            RecordIndex {
                start_pos: 0, end_pos: 50,
                shadow_start: 100, shadow_end: 200,
                compressed_size: 50, decompressed_size: 100,
            },
        ];
        assert_eq!(RecordIndex::find(&blocks, 50), None);
        assert_eq!(RecordIndex::find(&blocks, 200), None);
    }
}
