//! FST-based dictionary index for fast prefix and fuzzy search.
//!
//! Uses the `fst` crate (Finite State Transducer) for compact, immutable indexing.
//! The FST maps folded headwords → entry indices in the entries Vec.
//!
//! Index file format:
//! ```text
//! [magic: 8 bytes "MWDICTIX"] [version: u32 LE] [entry_count: u64 LE]
//! [source_mtime: u64 LE] [fst_len: u64 LE] [fst_data: bytes]
//! ```

use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

use fst::{Automaton, IntoStreamer, Map, MapBuilder, Streamer};
use unicode_normalization::UnicodeNormalization;

use crate::error::Error;
use crate::types::KeyEntry;
use crate::Result;

/// Magic bytes for the index file header.
const INDEX_MAGIC: &[u8; 8] = b"MWDICTIX";

/// Current index format version. Bump when format changes.
const INDEX_VERSION: u32 = 1;

/// Index file header (40 bytes).
#[derive(Debug, Clone, Copy)]
struct IndexHeader {
    magic: [u8; 8],
    version: u32,
    entry_count: u64,
    source_mtime: u64,
    fst_len: u64,
}

impl IndexHeader {
    const SIZE: usize = 8 + 4 + 8 + 8 + 8; // 36 bytes

    fn to_bytes(self) -> [u8; Self::SIZE] {
        let mut buf = [0u8; Self::SIZE];
        buf[0..8].copy_from_slice(&self.magic);
        buf[8..12].copy_from_slice(&self.version.to_le_bytes());
        buf[12..20].copy_from_slice(&self.entry_count.to_le_bytes());
        buf[20..28].copy_from_slice(&self.source_mtime.to_le_bytes());
        buf[28..36].copy_from_slice(&self.fst_len.to_le_bytes());
        buf
    }

    fn from_bytes(buf: &[u8]) -> Option<Self> {
        if buf.len() < Self::SIZE {
            return None;
        }
        let mut magic = [0u8; 8];
        magic.copy_from_slice(&buf[0..8]);
        Some(Self {
            magic,
            version: u32::from_le_bytes([buf[8], buf[9], buf[10], buf[11]]),
            entry_count: u64::from_le_bytes([
                buf[12], buf[13], buf[14], buf[15], buf[16], buf[17], buf[18], buf[19],
            ]),
            source_mtime: u64::from_le_bytes([
                buf[20], buf[21], buf[22], buf[23], buf[24], buf[25], buf[26], buf[27],
            ]),
            fst_len: u64::from_le_bytes([
                buf[28], buf[29], buf[30], buf[31], buf[32], buf[33], buf[34], buf[35],
            ]),
        })
    }
}

/// A built FST index that maps folded keys → entry index.
pub struct DictIndex {
    /// The FST map (folded_key → u64 packed entry index).
    map: Map<Vec<u8>>,
    /// Mapping from folded key to list of entry indices (for duplicates).
    /// FST only stores one value per key, so we pack the first index and
    /// handle collisions separately.
    duplicates: Vec<Vec<usize>>,
}

impl DictIndex {
    /// Build an FST index from key entries.
    ///
    /// Entries are sorted by their folded key. Duplicate folded keys
    /// map to the first occurrence; additional indices are stored separately.
    pub fn build(entries: &[KeyEntry]) -> Result<Self> {
        if entries.is_empty() {
            let builder = MapBuilder::memory();
            let map = builder.into_map();
            return Ok(Self {
                map,
                duplicates: Vec::new(),
            });
        }

        // Build sorted (folded_key, original_index) pairs
        let mut keyed: Vec<(String, usize)> = entries
            .iter()
            .enumerate()
            .map(|(i, e)| (fold_key(&e.headword), i))
            .collect();

        keyed.sort_by(|a, b| a.0.cmp(&b.0));

        // Build FST (requires sorted, unique keys)
        let mut builder = MapBuilder::memory();
        let mut duplicates: Vec<Vec<usize>> = Vec::new();
        let mut prev_key: Option<&str> = None;

        for (key, entry_idx) in &keyed {
            if prev_key == Some(key.as_str()) {
                // Duplicate: add to the last duplicates entry
                if let Some(last) = duplicates.last_mut() {
                    last.push(*entry_idx);
                }
            } else {
                // New unique key: insert into FST with value = duplicates.len()
                let dup_idx = duplicates.len() as u64;
                builder
                    .insert(key.as_bytes(), dup_idx)
                    .map_err(|e| Error::Corrupt(format!("fst insert: {e}")))?;
                duplicates.push(vec![*entry_idx]);
                prev_key = Some(key.as_str());
            }
        }

        let map = builder.into_map();

        Ok(Self { map, duplicates })
    }

    /// Exact lookup: find entry indices for a given word.
    pub fn get(&self, word: &str) -> Vec<usize> {
        let folded = fold_key(word);
        match self.map.get(folded.as_bytes()) {
            Some(dup_idx) => {
                self.duplicates.get(dup_idx as usize).cloned().unwrap_or_default()
            }
            None => Vec::new(),
        }
    }

    /// Prefix search: find all entry indices whose folded key starts with `prefix`.
    /// Returns up to `limit` results.
    pub fn prefix_search(&self, prefix: &str, limit: usize) -> Vec<usize> {
        use fst::automaton::Str;

        let folded_prefix = fold_key(prefix);
        let automaton = Str::new(&folded_prefix).starts_with();
        let mut stream = self.map.search(automaton).into_stream();

        let mut results = Vec::new();
        while let Some((_key, dup_idx)) = stream.next() {
            if let Some(indices) = self.duplicates.get(dup_idx as usize) {
                for &idx in indices {
                    results.push(idx);
                    if results.len() >= limit {
                        return results;
                    }
                }
            }
        }
        results
    }

    /// Fuzzy search using Levenshtein automaton.
    /// Finds all entry indices within `max_distance` edits of `word`.
    /// Returns up to `limit` results.
    pub fn fuzzy_search(&self, word: &str, max_distance: u32, limit: usize) -> Vec<usize> {
        use fst::automaton::Levenshtein;

        let folded = fold_key(word);
        let Ok(automaton) = Levenshtein::new(&folded, max_distance) else {
            return Vec::new();
        };
        let mut stream = self.map.search(automaton).into_stream();

        let mut results = Vec::new();
        while let Some((_key, dup_idx)) = stream.next() {
            if let Some(indices) = self.duplicates.get(dup_idx as usize) {
                for &idx in indices {
                    results.push(idx);
                    if results.len() >= limit {
                        return results;
                    }
                }
            }
        }
        results
    }

    /// Get the raw FST bytes for serialization.
    pub fn fst_bytes(&self) -> &[u8] {
        self.map.as_fst().as_bytes()
    }

    /// Number of unique keys in the FST.
    pub fn len(&self) -> usize {
        self.map.len()
    }

    /// Whether the index is empty.
    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    /// Clone the duplicates data for background serialization.
    pub fn duplicates_clone(&self) -> Vec<Vec<usize>> {
        self.duplicates.clone()
    }
}

/// Case-fold and normalize a headword for indexing.
///
/// 1. Unicode NFC normalization
/// 2. Lowercase
/// 3. Trim whitespace
pub fn fold_key(word: &str) -> String {
    word.nfc().collect::<String>().to_lowercase().trim().to_string()
}

/// Compute the index file path for a given MDX file.
pub fn index_path_for(mdx_path: &Path) -> PathBuf {
    mdx_path.with_extension("mdict.idx")
}

/// Compute the index file path for a given MDD file.
pub fn mdd_index_path_for(mdd_path: &Path) -> PathBuf {
    mdd_path.with_extension("mdd.idx")
}

/// Save a DictIndex to disk.
pub fn save_index(
    index: &DictIndex,
    path: &Path,
    entry_count: u64,
    source_mtime: u64,
) -> Result<()> {
    let fst_data = index.fst_bytes();
    let header = IndexHeader {
        magic: *INDEX_MAGIC,
        version: INDEX_VERSION,
        entry_count,
        source_mtime,
        fst_len: fst_data.len() as u64,
    };

    let file = fs::File::create(path)?;
    let mut writer = BufWriter::with_capacity(8 * 1024 * 1024, file);
    writer.write_all(&header.to_bytes())?;
    writer.write_all(fst_data)?;

    // Serialize duplicates as a single contiguous buffer to minimize syscalls.
    // Format: [count: u32 LE] then for each: [len: u32 LE] [indices: u32 LE...]
    let total_indices: usize = index.duplicates.iter().map(|g| g.len()).sum();
    let buf_size = 4 + index.duplicates.len() * 4 + total_indices * 4;
    let mut dup_buf = Vec::with_capacity(buf_size);

    dup_buf.extend_from_slice(&(index.duplicates.len() as u32).to_le_bytes());
    for group in &index.duplicates {
        dup_buf.extend_from_slice(&(group.len() as u32).to_le_bytes());
        for &idx in group {
            dup_buf.extend_from_slice(&(idx as u32).to_le_bytes());
        }
    }
    writer.write_all(&dup_buf)?;
    writer.flush()?;
    Ok(())
}

/// Save raw FST bytes + duplicates to disk (for background thread usage).
///
/// This avoids needing a reference to DictIndex (which isn't Send).
pub fn save_index_raw(
    fst_data: &[u8],
    duplicates: &[Vec<usize>],
    path: &Path,
    entry_count: u64,
    source_mtime: u64,
) -> Result<()> {
    let header = IndexHeader {
        magic: *INDEX_MAGIC,
        version: INDEX_VERSION,
        entry_count,
        source_mtime,
        fst_len: fst_data.len() as u64,
    };

    let file = fs::File::create(path)?;
    let mut writer = BufWriter::with_capacity(8 * 1024 * 1024, file);
    writer.write_all(&header.to_bytes())?;
    writer.write_all(fst_data)?;

    // Serialize duplicates as a single contiguous buffer
    let total_indices: usize = duplicates.iter().map(|g| g.len()).sum();
    let buf_size = 4 + duplicates.len() * 4 + total_indices * 4;
    let mut dup_buf = Vec::with_capacity(buf_size);

    dup_buf.extend_from_slice(&(duplicates.len() as u32).to_le_bytes());
    for group in duplicates {
        dup_buf.extend_from_slice(&(group.len() as u32).to_le_bytes());
        for &idx in group {
            dup_buf.extend_from_slice(&(idx as u32).to_le_bytes());
        }
    }
    writer.write_all(&dup_buf)?;
    writer.flush()?;
    Ok(())
}

/// Load a DictIndex from disk, verifying it's valid for the given source.
/// Returns `None` if the index is stale or corrupt (should rebuild).
pub fn load_index(
    path: &Path,
    expected_entry_count: u64,
    expected_mtime: u64,
) -> Option<DictIndex> {
    let data = fs::read(path).ok()?;
    if data.len() < IndexHeader::SIZE {
        return None;
    }

    let header = IndexHeader::from_bytes(&data)?;

    // Validate
    if &header.magic != INDEX_MAGIC {
        return None;
    }
    if header.version != INDEX_VERSION {
        return None;
    }
    if header.entry_count != expected_entry_count {
        return None;
    }
    if header.source_mtime != expected_mtime {
        return None;
    }

    let fst_start = IndexHeader::SIZE;
    let fst_end = fst_start + header.fst_len as usize;
    if fst_end > data.len() {
        return None;
    }

    let fst_data = data[fst_start..fst_end].to_vec();
    let map = Map::new(fst_data).ok()?;

    // Read duplicates
    let mut pos = fst_end;
    if pos + 4 > data.len() {
        return None;
    }
    let dup_count = u32::from_le_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
    pos += 4;

    let mut duplicates = Vec::with_capacity(dup_count);
    for _ in 0..dup_count {
        if pos + 4 > data.len() {
            return None;
        }
        let len = u32::from_le_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
        pos += 4;

        let mut group = Vec::with_capacity(len);
        for _ in 0..len {
            if pos + 4 > data.len() {
                return None;
            }
            let idx = u32::from_le_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
            pos += 4;
            group.push(idx);
        }
        duplicates.push(group);
    }

    Some(DictIndex { map, duplicates })
}

/// Check if an index needs rebuilding based on source file modification time.
pub fn index_needs_rebuild(index_path: &Path, source_mtime: u64, entry_count: u64) -> bool {
    load_index(index_path, entry_count, source_mtime).is_none()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_entries(words: &[&str]) -> Vec<KeyEntry> {
        words
            .iter()
            .enumerate()
            .map(|(i, &w)| KeyEntry {
                record_offset: (i * 100) as u64,
                headword: w.to_string(),
            })
            .collect()
    }

    #[test]
    fn fold_key_lowercase() {
        assert_eq!(fold_key("Hello"), "hello");
        assert_eq!(fold_key("WORLD"), "world");
    }

    #[test]
    fn fold_key_trim() {
        assert_eq!(fold_key("  space  "), "space");
    }

    #[test]
    fn fold_key_unicode_normalize() {
        // é as combining (e + acute) vs precomposed
        let combining = "e\u{0301}"; // e + combining acute
        let precomposed = "\u{00E9}"; // é precomposed
        assert_eq!(fold_key(combining), fold_key(precomposed));
    }

    #[test]
    fn build_empty_index() {
        let entries: Vec<KeyEntry> = vec![];
        let index = DictIndex::build(&entries).unwrap();
        assert!(index.is_empty());
        assert_eq!(index.len(), 0);
    }

    #[test]
    fn build_and_exact_lookup() {
        let entries = make_entries(&["apple", "banana", "cherry"]);
        let index = DictIndex::build(&entries).unwrap();

        assert_eq!(index.get("apple"), vec![0]);
        assert_eq!(index.get("banana"), vec![1]);
        assert_eq!(index.get("cherry"), vec![2]);
        assert_eq!(index.get("nonexistent"), Vec::<usize>::new());
    }

    #[test]
    fn build_case_insensitive_lookup() {
        let entries = make_entries(&["Apple", "BANANA"]);
        let index = DictIndex::build(&entries).unwrap();

        assert_eq!(index.get("apple"), vec![0]);
        assert_eq!(index.get("APPLE"), vec![0]);
        assert_eq!(index.get("Banana"), vec![1]);
    }

    #[test]
    fn build_duplicate_headwords() {
        let entries = make_entries(&["word", "word", "other"]);
        let index = DictIndex::build(&entries).unwrap();

        let mut results = index.get("word");
        results.sort();
        assert_eq!(results, vec![0, 1]);
        assert_eq!(index.get("other"), vec![2]);
    }

    #[test]
    fn prefix_search_exact() {
        let entries = make_entries(&["app", "apple", "application", "banana"]);
        let index = DictIndex::build(&entries).unwrap();

        let results = index.prefix_search("app", 100);
        assert!(results.contains(&0)); // "app"
        assert!(results.contains(&1)); // "apple"
        assert!(results.contains(&2)); // "application"
        assert!(!results.contains(&3)); // "banana"
    }

    #[test]
    fn prefix_search_with_limit() {
        let entries = make_entries(&["a1", "a2", "a3", "a4", "a5"]);
        let index = DictIndex::build(&entries).unwrap();

        let results = index.prefix_search("a", 3);
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn prefix_search_empty_prefix() {
        let entries = make_entries(&["x", "y", "z"]);
        let index = DictIndex::build(&entries).unwrap();

        let results = index.prefix_search("", 100);
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn prefix_search_no_match() {
        let entries = make_entries(&["hello", "world"]);
        let index = DictIndex::build(&entries).unwrap();

        let results = index.prefix_search("xyz", 100);
        assert!(results.is_empty());
    }

    #[test]
    fn fuzzy_search_distance_1() {
        let entries = make_entries(&["hello", "hallo", "world", "help"]);
        let index = DictIndex::build(&entries).unwrap();

        let results = index.fuzzy_search("hello", 1, 100);
        assert!(results.contains(&0)); // "hello" (distance 0)
        assert!(results.contains(&1)); // "hallo" (distance 1)
        assert!(!results.contains(&2)); // "world" (distance > 1)
    }

    #[test]
    fn fuzzy_search_no_match() {
        let entries = make_entries(&["hello", "world"]);
        let index = DictIndex::build(&entries).unwrap();

        let results = index.fuzzy_search("zzzzz", 1, 100);
        assert!(results.is_empty());
    }

    #[test]
    fn save_and_load_index() {
        let dir = tempfile::tempdir().unwrap();
        let idx_path = dir.path().join("test.idx");

        let entries = make_entries(&["alpha", "beta", "gamma", "alpha"]);
        let index = DictIndex::build(&entries).unwrap();

        save_index(&index, &idx_path, 4, 12345).unwrap();

        let loaded = load_index(&idx_path, 4, 12345).unwrap();
        assert_eq!(loaded.get("alpha"), vec![0, 3]);
        assert_eq!(loaded.get("beta"), vec![1]);
        assert_eq!(loaded.get("gamma"), vec![2]);
    }

    #[test]
    fn load_index_wrong_version_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let idx_path = dir.path().join("test.idx");

        let entries = make_entries(&["word"]);
        let index = DictIndex::build(&entries).unwrap();
        save_index(&index, &idx_path, 1, 100).unwrap();

        // Wrong mtime
        assert!(load_index(&idx_path, 1, 999).is_none());
        // Wrong entry count
        assert!(load_index(&idx_path, 99, 100).is_none());
    }

    #[test]
    fn load_index_corrupt_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let idx_path = dir.path().join("bad.idx");
        fs::write(&idx_path, b"garbage data").unwrap();

        assert!(load_index(&idx_path, 0, 0).is_none());
    }

    #[test]
    fn index_needs_rebuild_no_file() {
        assert!(index_needs_rebuild(Path::new("/nonexistent.idx"), 0, 0));
    }
}
