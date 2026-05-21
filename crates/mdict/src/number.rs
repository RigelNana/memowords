//! Versioned number reading for MDX binary format.
//!
//! v1.x uses big-endian u32; v2.0+ uses big-endian i64.

use crate::error::Error;
use crate::types::Version;
use crate::Result;

/// Read a version-dependent number (u32 or i64 big-endian) from a byte slice.
/// Returns the value and the number of bytes consumed.
pub fn read_number(data: &[u8], version: Version) -> Result<(u64, usize)> {
    match version {
        Version::V1 => {
            if data.len() < 4 {
                return Err(Error::Corrupt("not enough bytes for u32".into()));
            }
            let val = u32::from_be_bytes([data[0], data[1], data[2], data[3]]);
            Ok((val as u64, 4))
        }
        Version::V2 => {
            if data.len() < 8 {
                return Err(Error::Corrupt("not enough bytes for i64".into()));
            }
            let val = i64::from_be_bytes([
                data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7],
            ]);
            Ok((val as u64, 8))
        }
    }
}

/// Read a u8 or u16 big-endian depending on version.
/// v2.0 uses u16 for text head sizes; v1.x uses u8.
pub fn read_u8_or_u16(data: &[u8], version: Version) -> Result<(u32, usize)> {
    match version {
        Version::V1 => {
            if data.is_empty() {
                return Err(Error::Corrupt("not enough bytes for u8".into()));
            }
            Ok((data[0] as u32, 1))
        }
        Version::V2 => {
            if data.len() < 2 {
                return Err(Error::Corrupt("not enough bytes for u16".into()));
            }
            let val = u16::from_be_bytes([data[0], data[1]]);
            Ok((val as u32, 2))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_u32_be_from_bytes() {
        let data = [0x00, 0x01, 0x00, 0x00]; // 65536
        let (val, consumed) = read_number(&data, Version::V1).unwrap();
        assert_eq!(val, 65536);
        assert_eq!(consumed, 4);
    }

    #[test]
    fn read_i64_be_from_bytes() {
        let data = [0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00]; // 65536
        let (val, consumed) = read_number(&data, Version::V2).unwrap();
        assert_eq!(val, 65536);
        assert_eq!(consumed, 8);
    }

    #[test]
    fn read_u32_max() {
        let data = 0xFFFF_FFFFu32.to_be_bytes();
        let (val, _) = read_number(&data, Version::V1).unwrap();
        assert_eq!(val, 0xFFFF_FFFF);
    }

    #[test]
    fn read_number_v1_too_short() {
        let data = [0x00, 0x01, 0x02];
        assert!(read_number(&data, Version::V1).is_err());
    }

    #[test]
    fn read_number_v2_too_short() {
        let data = [0x00; 7];
        assert!(read_number(&data, Version::V2).is_err());
    }

    #[test]
    fn read_u8_single_byte() {
        let data = [0x42];
        let (val, consumed) = read_u8_or_u16(&data, Version::V1).unwrap();
        assert_eq!(val, 0x42);
        assert_eq!(consumed, 1);
    }

    #[test]
    fn read_u16_two_bytes() {
        let data = [0x01, 0x00]; // 256
        let (val, consumed) = read_u8_or_u16(&data, Version::V2).unwrap();
        assert_eq!(val, 256);
        assert_eq!(consumed, 2);
    }

    #[test]
    fn read_u8_empty_errors() {
        let data: &[u8] = &[];
        assert!(read_u8_or_u16(data, Version::V1).is_err());
    }

    #[test]
    fn read_u16_one_byte_errors() {
        let data = [0x01];
        assert!(read_u8_or_u16(&data, Version::V2).is_err());
    }
}
