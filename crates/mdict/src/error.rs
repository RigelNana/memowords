//! Error types for the mdict crate.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("invalid header: {0}")]
    InvalidHeader(String),

    #[error("unsupported version: {0}")]
    UnsupportedVersion(f64),

    #[error("checksum mismatch")]
    ChecksumMismatch,

    #[error("decompression failed: {0}")]
    DecompressFailed(String),

    #[error("decryption failed")]
    DecryptFailed,

    #[error("encoding error: {0}")]
    EncodingError(String),

    #[error("key not found: {0}")]
    KeyNotFound(String),

    #[error("corrupt dictionary: {0}")]
    Corrupt(String),

    #[error(transparent)]
    Io(#[from] std::io::Error),
}
