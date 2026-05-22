//! Top-level MDX dictionary API.
//!
//! `MdxDict` is the primary interface for opening and querying MDX dictionaries.
//! It orchestrates all lower-level modules (header, key_block, record_block, etc.)
//! to provide a simple lookup API.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use memmap2::Mmap;

use crate::decompress::decompress_block;
use crate::error::Error;
use crate::header::parse_header;
use crate::index::{self, DictIndex};
use crate::key_block::{parse_key_block_header, parse_key_block_info, split_key_block};
use crate::mdd::{find_mdd_files, normalize_resource_path, resolve_mdd_resource, MddFile};
use crate::record_block::{
    extract_record, parse_record_block_header, parse_record_block_infos, build_record_infos,
};
use crate::stylesheet::substitute_stylesheet;
use crate::types::{HeaderInfo, KeyEntry, RecordIndex, RecordInfo};
use crate::Result;

/// A parsed and indexed MDX dictionary ready for lookups.
pub struct MdxDict {
    /// Parsed header information.
    pub info: HeaderInfo,
    /// Memory-mapped file data.
    mmap: Mmap,
    /// All key entries (headword + record offset), sorted by headword.
    entries: Vec<KeyEntry>,
    /// FST index for fast lookup.
    index: DictIndex,
    /// Record block index (kept for potential future diagnostics).
    #[allow(dead_code)]
    record_blocks: Vec<RecordIndex>,
    /// Absolute file offset where record data begins.
    #[allow(dead_code)]
    record_section_offset: u64,
    /// Pre-computed RecordInfo per entry (indexed same as `entries`).
    record_infos: Vec<RecordInfo>,
    /// Associated MDD file paths.
    pub mdd_paths: Vec<PathBuf>,
    /// Lazily loaded MDD files (opened on first resource request).
    mdd_files: OnceLock<Vec<MddFile>>,
    /// Source file path.
    pub path: PathBuf,
}

impl MdxDict {
    /// Open and parse an MDX dictionary file.
    pub fn open(path: &Path) -> Result<Self> {
        let file = std::fs::File::open(path).map_err(|e| {
            Error::Io(std::io::Error::new(e.kind(), format!("{}: {e}", path.display())))
        })?;

        // SAFETY: We assume the file is not modified while we hold the mmap.
        let mmap = unsafe { Mmap::map(&file)? };
        let data = &mmap[..];

        // Determine fallback title from filename stem
        let fallback_title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");

        // 1. Parse header
        let (info, header_consumed) = parse_header(data, fallback_title)?;
        let mut pos = header_consumed;

        // 2. Parse key block header
        let (kb_header, kb_header_consumed) =
            parse_key_block_header(&data[pos..], info.version)?;
        pos += kb_header_consumed;

        // 3. Parse key block info
        let info_end = pos + kb_header.info_compressed_size as usize;
        if info_end > data.len() {
            return Err(Error::Corrupt("key block info extends beyond file".into()));
        }
        let raw_info = &data[pos..info_end];
        let block_sizes = parse_key_block_info(
            raw_info,
            info.version,
            &info.encoding,
            info.encrypted,
            kb_header.info_decompressed_size,
        )?;
        pos = info_end;

        // 4. Read all key blocks
        let mut all_entries = Vec::with_capacity(kb_header.num_entries as usize);
        for size_pair in &block_sizes {
            let block_end = pos + size_pair.compressed as usize;
            if block_end > data.len() {
                return Err(Error::Corrupt("key block extends beyond file".into()));
            }
            let compressed_block = &data[pos..block_end];
            let decompressed = decompress_block(compressed_block, size_pair.decompressed as usize)?;
            let entries = split_key_block(&decompressed, info.version, &info.encoding)?;
            all_entries.extend(entries);
            pos = block_end;
        }

        // 5. Parse record block header
        let (rb_header, rb_header_consumed) =
            parse_record_block_header(&data[pos..], info.version)?;
        pos += rb_header_consumed;

        // 6. Parse record block infos
        let rb_info_end = pos + rb_header.record_info_size as usize;
        if rb_info_end > data.len() {
            return Err(Error::Corrupt("record block info extends beyond file".into()));
        }
        let record_blocks = parse_record_block_infos(
            &data[pos..rb_info_end],
            rb_header.num_record_blocks,
            info.version,
        )?;
        let record_section_offset = rb_info_end as u64;

        // 7. Build or load cached FST index
        let idx_path = index::index_path_for(path);
        let source_mtime = source_mtime_secs(path);
        let entry_count = all_entries.len() as u64;

        let index = match index::load_index(&idx_path, entry_count, source_mtime) {
            Some(cached) => {
                tracing::debug!(path = %idx_path.display(), "loaded cached FST index");
                cached
            }
            None => {
                tracing::debug!("building FST index ({} entries)", all_entries.len());
                let built = DictIndex::build(&all_entries)?;
                // Persist cache in background thread — don't block open()
                let save_path = idx_path.clone();
                let fst_bytes = built.fst_bytes().to_vec();
                let dups = built.duplicates_clone();
                std::thread::spawn(move || {
                    if let Err(e) = index::save_index_raw(
                        &fst_bytes, &dups, &save_path, entry_count, source_mtime,
                    ) {
                        tracing::warn!(error = %e, "failed to persist FST index");
                    } else {
                        tracing::debug!(path = %save_path.display(), "FST index persisted");
                    }
                });
                built
            }
        };

        // 8. Find associated MDD files
        let mdd_paths = find_mdd_files(path);

        tracing::info!(
            title = %info.title,
            entries = all_entries.len(),
            unique_keys = index.len(),
            mdd_count = mdd_paths.len(),
            "MDX dictionary opened"
        );

        // 8. Pre-compute RecordInfo for every entry (needs all entries for correct sizing)
        let record_infos = build_record_infos(&all_entries, &record_blocks, record_section_offset)?;

        Ok(Self {
            info,
            mmap,
            entries: all_entries,
            index,
            record_blocks,
            record_section_offset,
            record_infos,
            mdd_paths,
            mdd_files: OnceLock::new(),
            path: path.to_path_buf(),
        })
    }

    /// Get the number of entries in the dictionary.
    pub fn entry_count(&self) -> usize {
        self.entries.len()
    }

    /// Get the dictionary title.
    pub fn title(&self) -> &str {
        &self.info.title
    }

    /// Get entry indices for a word from the FST index (for diagnostics).
    pub fn get_entry_indices(&self, word: &str) -> Vec<usize> {
        self.index.get(word)
    }

    /// Get all key entries (for diagnostics).
    pub fn entries(&self) -> &[KeyEntry] {
        &self.entries
    }

    /// Load the raw article text for an entry index (for diagnostics).
    pub fn load_article_for_entry(&self, idx: usize) -> Result<String> {
        self.load_article_by_idx(idx)
    }

    /// Lookup a word (exact match, case-insensitive via FST index).
    /// Returns all matching article HTML texts.
    ///
    /// Uses a GoldenDict-style chain approach:
    /// - Walk a queue of entry indices; for each entry load the article.
    /// - If the article is a `@@@LINK=target` redirect, resolve target to
    ///   new entry indices and append them to the queue (instead of recursing).
    /// - Deduplicate by entry index **and** by content hash so physically
    ///   duplicated articles only appear once.
    pub fn lookup(&self, word: &str) -> Result<Vec<String>> {
        use std::collections::HashSet;

        let initial = self.index.get(word);
        if initial.is_empty() {
            return Ok(vec![]);
        }

        // Queue of entry indices still to process (GoldenDict calls this "chain")
        let mut queue: Vec<usize> = initial;
        let mut seen_indices: HashSet<usize> = HashSet::new();
        let mut seen_hashes: HashSet<u64> = HashSet::new();
        let mut articles: Vec<String> = Vec::new();
        let mut cursor = 0;

        while cursor < queue.len() {
            let idx = queue[cursor];
            cursor += 1;

            // Skip already-visited entry index
            if !seen_indices.insert(idx) {
                continue;
            }

            let headword = &self.entries[idx].headword;
            let raw = match self.load_article_by_idx(idx) {
                Ok(text) => text,
                Err(e) => {
                    tracing::warn!(headword = %headword, error = %e, "failed to load article");
                    continue;
                }
            };

            // Handle @@@LINK redirects: resolve target and append to queue
            if let Some(target) = crate::link::parse_link(&raw) {
                let target_indices = self.resolve_link_target(target);
                for ti in target_indices {
                    if !seen_indices.contains(&ti) {
                        queue.push(ti);
                    }
                }
                continue;
            }

            // Content dedup via simple hash
            let hash = Self::hash_content(&raw);
            if !seen_hashes.insert(hash) {
                continue;
            }

            // Apply stylesheet substitution
            let processed = substitute_stylesheet(&raw, &self.info.stylesheets);
            articles.push(processed);
        }

        Ok(articles)
    }

    /// Resolve an @@@LINK target to entry indices, with fallback trimming.
    fn resolve_link_target(&self, target: &str) -> Vec<usize> {
        let indices = self.index.get(target);
        if !indices.is_empty() {
            return indices;
        }
        // Fallback: trim whitespace / trailing punctuation
        let trimmed = target.trim().trim_end_matches(|c: char| c.is_ascii_punctuation());
        if trimmed != target {
            let indices2 = self.index.get(trimmed);
            if !indices2.is_empty() {
                return indices2;
            }
        }
        Vec::new()
    }

    /// Simple FNV-1a hash for content dedup (not cryptographic).
    fn hash_content(s: &str) -> u64 {
        let mut h: u64 = 0xcbf29ce484222325;
        for b in s.bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        h
    }

    /// Prefix search: find headwords starting with the given prefix.
    /// Returns up to `limit` unique headwords (via FST automaton, O(k) where k = results).
    pub fn prefix_search(&self, prefix: &str, limit: usize) -> Vec<&str> {
        let indices = self.index.prefix_search(prefix, limit * 3);
        let mut seen = std::collections::HashSet::new();
        let mut results = Vec::new();
        for &i in &indices {
            let hw = self.entries[i].headword.as_str();
            if seen.insert(hw) {
                results.push(hw);
                if results.len() >= limit {
                    break;
                }
            }
        }
        results
    }

    /// Fuzzy search: find headwords within `max_distance` edits.
    /// Returns up to `limit` unique headwords.
    pub fn fuzzy_search(&self, word: &str, max_distance: u32, limit: usize) -> Vec<&str> {
        let indices = self.index.fuzzy_search(word, max_distance, limit * 3);
        let mut seen = std::collections::HashSet::new();
        let mut results = Vec::new();
        for &i in &indices {
            let hw = self.entries[i].headword.as_str();
            if seen.insert(hw) {
                results.push(hw);
                if results.len() >= limit {
                    break;
                }
            }
        }
        results
    }

    /// Load raw article text for an entry by its index.
    fn load_article_by_idx(&self, idx: usize) -> Result<String> {
        let info = self.record_infos.get(idx).ok_or_else(|| {
            Error::Corrupt(format!("entry index {} out of range", idx))
        })?;
        extract_record(&self.mmap, info, &self.info.encoding)
    }

    /// Ensure MDD files are loaded (lazy init on first call).
    fn mdd_files(&self) -> &[MddFile] {
        self.mdd_files.get_or_init(|| {
            self.mdd_paths
                .iter()
                .filter_map(|p| {
                    match MddFile::open(p) {
                        Ok(mdd) => {
                            tracing::info!(
                                path = %p.display(),
                                entries = mdd.entry_count(),
                                "MDD loaded"
                            );
                            Some(mdd)
                        }
                        Err(e) => {
                            tracing::warn!(path = %p.display(), error = %e, "failed to open MDD");
                            None
                        }
                    }
                })
                .collect()
        })
    }

    /// Raw MDD lookup: search all MDD files for a normalized path.
    /// Returns raw bytes (may contain @@@LINK redirect data).
    fn mdd_raw_lookup(&self, normalized: &str) -> Option<Vec<u8>> {
        for mdd in self.mdd_files() {
            if let Some(data) = mdd.lookup(normalized) {
                return Some(data);
            }
        }
        None
    }

    /// Load a resource from associated MDD files by path.
    ///
    /// Resolution order (same as GoldenDict):
    /// 1. Local file in MDX directory (takes precedence)
    /// 2. MDD resource files (with @@@LINK redirect chain support)
    pub fn load_resource(&self, resource_path: &str) -> Result<Vec<u8>> {
        tracing::debug!(
            resource_path = %resource_path,
            mdd_count = self.mdd_paths.len(),
            "load_resource: START"
        );

        // 1. Try local file first (GoldenDict behaviour)
        if let Some(dir) = self.path.parent() {
            let clean = resource_path
                .replace('\\', "/")
                .trim_start_matches('/')
                .trim_start_matches("./")
                .to_string();
            let local = dir.join(&clean);
            tracing::debug!(local_path = %local.display(), exists = local.is_file(), "load_resource: local file check");
            if local.is_file() {
                tracing::debug!(path = %local.display(), "load_resource: local file hit");
                return std::fs::read(&local).map_err(|e| {
                    Error::Io(std::io::Error::new(e.kind(), format!("reading {}: {e}", local.display())))
                });
            }
        }

        // 2. MDD lookup with @@@LINK redirect chain
        if !self.mdd_paths.is_empty() {
            let normalized = normalize_resource_path(resource_path);
            tracing::debug!(
                resource_path = %resource_path,
                normalized = %normalized,
                "load_resource: MDD lookup with normalized path"
            );
            match resolve_mdd_resource(&normalized, |path| self.mdd_raw_lookup(path)) {
                Ok(data) => {
                    let head: Vec<u8> = data.iter().take(16).copied().collect();
                    tracing::debug!(
                        resource = %resource_path,
                        data_len = data.len(),
                        head_hex = %format!("{:02x?}", head),
                        "load_resource: MDD hit"
                    );
                    return Ok(data);
                }
                Err(e) => {
                    tracing::warn!(resource = %resource_path, error = %e, "load_resource: MDD miss");
                }
            }
        }

        let normalized = normalize_resource_path(resource_path);
        tracing::warn!(resource = %resource_path, normalized = %normalized, "load_resource: NOT FOUND anywhere");
        Err(Error::KeyNotFound(normalized))
    }
}

/// Get the modification time of a file as seconds since UNIX epoch.
fn source_mtime_secs(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

impl std::fmt::Debug for MdxDict {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MdxDict")
            .field("title", &self.info.title)
            .field("entries", &self.entries.len())
            .field("path", &self.path)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_nonexistent_file_errors() {
        let result = MdxDict::open(Path::new("/nonexistent/dict.mdx"));
        assert!(result.is_err());
    }

    #[test]
    fn open_empty_file_errors() {
        let dir = tempfile::tempdir().unwrap();
        let mdx = dir.path().join("empty.mdx");
        std::fs::write(&mdx, b"").unwrap();

        let result = MdxDict::open(&mdx);
        assert!(result.is_err());
    }

    #[test]
    fn open_truncated_file_errors() {
        let dir = tempfile::tempdir().unwrap();
        let mdx = dir.path().join("truncated.mdx");
        // Just a header size field pointing to more data than available
        std::fs::write(&mdx, &100i32.to_be_bytes()).unwrap();

        let result = MdxDict::open(&mdx);
        assert!(result.is_err());
    }
}
