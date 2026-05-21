//! RIPEMD-128 based decryption for MDX Key Block Info.
//!
//! Algorithm (matching GoldenDict):
//! 1. key = RIPEMD128(buffer[4..8] ++ b"\x95\x36\x00\x00") → 16 bytes
//! 2. Starting from buffer[8], for each byte i:
//!    - rotated = (byte >> 4) | (byte << 4)
//!    - decoded = rotated ^ prev ^ (i & 0xFF) ^ key[i % 16]
//!    - prev = original byte (before decode)
//!    - Initial prev = 0x36

use ripemd::{Digest, Ripemd128};

/// Decrypt the Key Block Info buffer in-place.
///
/// The first 8 bytes are the "header" used for key derivation;
/// decryption applies from byte 8 onward.
///
/// Returns `Ok(())` on success. The buffer is modified in-place.
pub fn decrypt_key_block_info(buffer: &mut [u8]) -> crate::Result<()> {
    if buffer.len() <= 8 {
        return Err(crate::Error::DecryptFailed);
    }

    // Derive key: RIPEMD128(buffer[4..8] + magic)
    let mut hasher = Ripemd128::new();
    hasher.update(&buffer[4..8]);
    hasher.update(b"\x95\x36\x00\x00");
    let key: [u8; 16] = hasher.finalize().into();

    // Decrypt from byte 8 onward
    let data = &mut buffer[8..];
    let mut prev: u8 = 0x36;

    for (i, byte) in data.iter_mut().enumerate() {
        let original = *byte;
        let rotated = original.rotate_left(4);
        *byte = rotated ^ prev ^ (i as u8) ^ key[i % 16];
        prev = original;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ripemd128_key_derivation() {
        // Verify the key derivation produces expected 16-byte output
        let mut hasher = Ripemd128::new();
        hasher.update(&[0x01, 0x02, 0x03, 0x04]);
        hasher.update(b"\x95\x36\x00\x00");
        let key: [u8; 16] = hasher.finalize().into();
        assert_eq!(key.len(), 16);
        // Just verify it doesn't panic and produces non-zero output
        assert!(key.iter().any(|&b| b != 0));
    }

    #[test]
    fn decrypt_roundtrip() {
        // Create a test buffer, encrypt it (reverse the algorithm), then decrypt
        let plaintext = b"Hello, world! This is a test buffer for decryption.";

        // Build buffer with 8-byte header + plaintext
        let mut buffer = vec![0u8; 8 + plaintext.len()];
        buffer[4] = 0xAA;
        buffer[5] = 0xBB;
        buffer[6] = 0xCC;
        buffer[7] = 0xDD;

        // Derive key for encryption (same as decryption)
        let mut hasher = Ripemd128::new();
        hasher.update(&buffer[4..8]);
        hasher.update(b"\x95\x36\x00\x00");
        let key: [u8; 16] = hasher.finalize().into();

        // "Encrypt" — reverse the decrypt operation
        let mut prev: u8 = 0x36;
        for (i, &plain_byte) in plaintext.iter().enumerate() {
            let xored = plain_byte ^ prev ^ (i as u8) ^ key[i % 16];
            let encrypted = (xored >> 4) | (xored << 4);
            buffer[8 + i] = encrypted;
            prev = encrypted;
        }

        // Now decrypt and verify
        decrypt_key_block_info(&mut buffer).unwrap();
        assert_eq!(&buffer[8..], plaintext);
    }

    #[test]
    fn decrypt_too_short_errors() {
        let mut buffer = [0u8; 8]; // exactly 8 bytes — no data to decrypt
        let result = decrypt_key_block_info(&mut buffer);
        assert!(result.is_err());
    }

    #[test]
    fn decrypt_known_pattern() {
        // Verify specific byte transformations
        let mut buffer = vec![0u8; 12]; // 8 header + 4 data
        buffer[4..8].copy_from_slice(&[0x00, 0x00, 0x00, 0x00]);

        // Set some known data bytes
        buffer[8] = 0x63;  // byte to decrypt
        buffer[9] = 0xA5;
        buffer[10] = 0x12;
        buffer[11] = 0xFF;

        // Just verify it doesn't panic and modifies the data
        let original_data = buffer[8..].to_vec();
        decrypt_key_block_info(&mut buffer).unwrap();
        // Data should be modified
        assert_ne!(&buffer[8..], original_data.as_slice());
    }
}
