//! Compressed block parsing and decompression.
//!
//! MDX block format: `[type: u32 BE] [checksum: u32 BE] [payload...]`
//!
//! Types:
//! - 0x00000000: uncompressed (Adler32 checksum on payload)
//! - 0x01000000: LZO1X compressed (Adler32 checksum on decompressed)
//! - 0x02000000: zlib (deflate) compressed (Adler32 checksum validated internally)

use crate::checksum::verify_adler32;
use crate::error::Error;
use crate::Result;

/// Compression type marker in the block header.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompressionType {
    None,
    Lzo,
    Zlib,
}

impl CompressionType {
    fn from_u32(val: u32) -> Result<Self> {
        match val {
            0x0000_0000 => Ok(Self::None),
            0x0100_0000 => Ok(Self::Lzo),
            0x0200_0000 => Ok(Self::Zlib),
            other => Err(Error::DecompressFailed(format!(
                "unknown compression type: 0x{other:08X}"
            ))),
        }
    }
}

/// Decompress a compressed block.
///
/// `compressed` is the full block including the 8-byte header (type + checksum).
/// `expected_decompressed_size` is the expected output size (from block info).
///
/// Returns the decompressed bytes.
pub fn decompress_block(compressed: &[u8], expected_decompressed_size: usize) -> Result<Vec<u8>> {
    if compressed.len() <= 8 {
        return Err(Error::DecompressFailed("block too small (≤ 8 bytes)".into()));
    }

    let comp_type = u32::from_be_bytes([compressed[0], compressed[1], compressed[2], compressed[3]]);
    let checksum = u32::from_be_bytes([compressed[4], compressed[5], compressed[6], compressed[7]]);
    let payload = &compressed[8..];

    let comp_type = CompressionType::from_u32(comp_type)?;

    match comp_type {
        CompressionType::None => decompress_none(payload, checksum),
        CompressionType::Lzo => decompress_lzo(payload, expected_decompressed_size, checksum),
        CompressionType::Zlib => decompress_zlib(payload, checksum),
    }
}

fn decompress_none(payload: &[u8], checksum: u32) -> Result<Vec<u8>> {
    verify_adler32(payload, checksum)?;
    Ok(payload.to_vec())
}

fn decompress_zlib(payload: &[u8], checksum: u32) -> Result<Vec<u8>> {
    use flate2::read::ZlibDecoder;
    use std::io::Read;

    let mut decoder = ZlibDecoder::new(payload);
    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| Error::DecompressFailed(format!("zlib: {e}")))?;

    verify_adler32(&decompressed, checksum)?;
    Ok(decompressed)
}

fn decompress_lzo(payload: &[u8], expected_size: usize, checksum: u32) -> Result<Vec<u8>> {
    let lzo = minilzo_rs::LZO::init()
        .map_err(|e| Error::DecompressFailed(format!("lzo init: {e:?}")))?;
    let decompressed = lzo
        .decompress_safe(payload, expected_size)
        .map_err(|e| Error::DecompressFailed(format!("lzo: {e:?}")))?;

    if decompressed.len() != expected_size {
        return Err(Error::DecompressFailed(format!(
            "lzo: expected {expected_size} bytes, got {}",
            decompressed.len()
        )));
    }

    verify_adler32(&decompressed, checksum)?;
    Ok(decompressed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::checksum::compute_adler32;

    /// Build a test compressed block with type + checksum + payload.
    fn build_block(comp_type: u32, payload: &[u8], checksum: u32) -> Vec<u8> {
        let mut buf = Vec::with_capacity(8 + payload.len());
        buf.extend_from_slice(&comp_type.to_be_bytes());
        buf.extend_from_slice(&checksum.to_be_bytes());
        buf.extend_from_slice(payload);
        buf
    }

    #[test]
    fn decompress_uncompressed_with_adler32() {
        let payload = b"hello world";
        let checksum = compute_adler32(payload);
        let block = build_block(0x0000_0000, payload, checksum);

        let result = decompress_block(&block, payload.len()).unwrap();
        assert_eq!(result, payload);
    }

    #[test]
    fn decompress_uncompressed_bad_checksum() {
        let payload = b"hello world";
        let block = build_block(0x0000_0000, payload, 0xDEADBEEF);

        let result = decompress_block(&block, payload.len());
        assert!(result.is_err());
    }

    #[test]
    fn decompress_zlib_block() {
        use flate2::write::ZlibEncoder;
        use flate2::Compression;
        use std::io::Write;

        let original = b"The quick brown fox jumps over the lazy dog";
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(original).unwrap();
        let compressed_payload = encoder.finish().unwrap();

        let checksum = compute_adler32(original);
        let block = build_block(0x0200_0000, &compressed_payload, checksum);

        let result = decompress_block(&block, original.len()).unwrap();
        assert_eq!(result, original);
    }

    #[test]
    fn decompress_zlib_bad_checksum() {
        use flate2::write::ZlibEncoder;
        use flate2::Compression;
        use std::io::Write;

        let original = b"test data";
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(original).unwrap();
        let compressed_payload = encoder.finish().unwrap();

        let block = build_block(0x0200_0000, &compressed_payload, 0xBADBAD);

        let result = decompress_block(&block, original.len());
        assert!(result.is_err());
    }

    #[test]
    fn decompress_unknown_type_errors() {
        let block = build_block(0x0300_0000, b"data", 0);
        let result = decompress_block(&block, 4);
        assert!(result.is_err());
        let err_msg = format!("{}", result.unwrap_err());
        assert!(err_msg.contains("unknown compression type"));
    }

    #[test]
    fn decompress_too_small_block_errors() {
        let block = [0u8; 8]; // exactly 8 bytes, no payload
        let result = decompress_block(&block, 0);
        assert!(result.is_err());
    }

    #[test]
    fn decompress_lzo_block() {
        let original = b"LZO compressed test data that needs to be long enough for LZO to work well with compression";
        let mut lzo = minilzo_rs::LZO::init().unwrap();
        let compressed_payload = lzo
            .compress(original)
            .expect("lzo compress");

        let checksum = compute_adler32(original);
        let block = build_block(0x0100_0000, &compressed_payload, checksum);

        let result = decompress_block(&block, original.len()).unwrap();
        assert_eq!(result, original.as_slice());
    }

    #[test]
    fn decompress_lzo_bad_checksum() {
        let original = b"LZO compressed test data that needs to be long enough for LZO to work well with compression";
        let mut lzo = minilzo_rs::LZO::init().unwrap();
        let compressed_payload = lzo
            .compress(original)
            .expect("lzo compress");

        let block = build_block(0x0100_0000, &compressed_payload, 0xDEAD);

        let result = decompress_block(&block, original.len());
        assert!(result.is_err());
    }
}
