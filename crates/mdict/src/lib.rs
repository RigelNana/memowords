//! # mdict
//!
//! High-performance MDX/MDD dictionary parser and indexer.
//!
//! Supports MDX v1.x and v2.0 formats with zlib/LZO decompression,
//! RIPEMD128 decryption, and multiple encodings (UTF-8, UTF-16LE, GBK, GB18030).

pub mod checksum;
pub mod decompress;
pub mod decrypt;
pub mod error;
pub mod header;
pub mod key_block;
pub mod number;
pub mod record_block;
pub mod types;

pub use error::Error;
pub use types::{HeaderInfo, Version};

pub type Result<T> = std::result::Result<T, Error>;

#[cfg(test)]
mod tests {
    #[test]
    fn smoke() {
        assert_eq!(2 + 2, 4);
    }
}
