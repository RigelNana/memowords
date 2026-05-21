//! Adler-32 checksum verification for MDX blocks.

use crate::error::Error;
use crate::Result;

/// Verify that the Adler-32 checksum of `data` matches `expected`.
pub fn verify_adler32(data: &[u8], expected: u32) -> Result<()> {
    let computed = adler::adler32_slice(data);
    if computed == expected {
        Ok(())
    } else {
        Err(Error::ChecksumMismatch)
    }
}

/// Compute Adler-32 checksum of `data`.
pub fn compute_adler32(data: &[u8]) -> u32 {
    adler::adler32_slice(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adler32_valid() {
        let data = b"Hello, world!";
        let checksum = compute_adler32(data);
        assert!(verify_adler32(data, checksum).is_ok());
    }

    #[test]
    fn adler32_invalid() {
        let data = b"Hello, world!";
        let bad_checksum = 0xDEADBEEF;
        assert!(verify_adler32(data, bad_checksum).is_err());
    }

    #[test]
    fn adler32_empty_input() {
        let data: &[u8] = &[];
        let checksum = compute_adler32(data);
        // Adler32 of empty input is 1
        assert_eq!(checksum, 1);
        assert!(verify_adler32(data, checksum).is_ok());
    }

    #[test]
    fn adler32_known_value() {
        // "Wikipedia" has known Adler-32 = 0x11E60398
        let data = b"Wikipedia";
        let checksum = compute_adler32(data);
        assert_eq!(checksum, 0x11E60398);
    }
}
