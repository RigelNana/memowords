//! Top-level MDX dictionary API.
//!
//! `MdxDict` is the primary interface for opening and querying MDX dictionaries.
//! It orchestrates all lower-level modules (header, key_block, record_block, etc.)
//! to provide a simple lookup API.

use std::path::{Path, PathBuf};

use memmap2::Mmap;

use crate::decompress::decompress_block;
use crate::error::Error;
use crate::header::parse_header;
use crate::index::DictIndex;
use crate::key_block::{parse_key_block_header, parse_key_block_info, split_key_block};
use crate::link::resolve_links;
use crate::mdd::{find_mdd_files, normalize_resource_path};
use crate::record_block::{
    extract_record, parse_record_block_header, parse_record_block_infos, build_record_infos,
};
use crate::stylesheet::substitute_stylesheet;
use crate::types::{HeaderInfo, KeyEntry, RecordIndex};
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
    /// Record block index for binary search.
    record_blocks: Vec<RecordIndex>,
    /// Absolute file offset where record data begins.
    record_section_offset: u64,
    /// Associated MDD file paths.
    pub mdd_paths: Vec<PathBuf>,
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

        // 7. Build FST index
        let index = DictIndex::build(&all_entries)?;

        // 8. Find associated MDD files
        let mdd_paths = find_mdd_files(path);

        tracing::info!(
            title = %info.title,
            entries = all_entries.len(),
            unique_keys = index.len(),
            mdd_count = mdd_paths.len(),
            "MDX dictionary opened"
        );

        Ok(Self {
            info,
            mmap,
            entries: all_entries,
            index,
            record_blocks,
            record_section_offset,
            mdd_paths,
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

    /// Lookup a word (exact match, case-insensitive via FST index).
    /// Returns all matching article HTML texts.
    pub fn lookup(&self, word: &str) -> Result<Vec<String>> {
        let indices = self.index.get(word);
        if indices.is_empty() {
            return Ok(vec![]);
        }

        let mut articles = Vec::new();
        for &idx in &indices {
            let entry = &self.entries[idx];
            let article = self.load_article(entry)?;

            // Resolve @@@LINK redirects
            let resolved = resolve_links(&article, |target| {
                let target_indices = self.index.get(target);
                target_indices.first().and_then(|&i| {
                    self.load_article(&self.entries[i]).ok()
                })
            })?;

            // Apply stylesheet substitution
            let processed = substitute_stylesheet(&resolved, &self.info.stylesheets);
            articles.push(processed);
        }

        Ok(articles)
    }

    /// Prefix search: find headwords starting with the given prefix.
    /// Returns up to `limit` headwords (via FST automaton, O(k) where k = results).
    pub fn prefix_search(&self, prefix: &str, limit: usize) -> Vec<&str> {
        let indices = self.index.prefix_search(prefix, limit);
        indices
            .iter()
            .map(|&i| self.entries[i].headword.as_str())
            .collect()
    }

    /// Fuzzy search: find headwords within `max_distance` edits.
    /// Returns up to `limit` headwords.
    pub fn fuzzy_search(&self, word: &str, max_distance: u32, limit: usize) -> Vec<&str> {
        let indices = self.index.fuzzy_search(word, max_distance, limit);
        indices
            .iter()
            .map(|&i| self.entries[i].headword.as_str())
            .collect()
    }

    /// Load raw article text for a key entry.
    fn load_article(&self, entry: &KeyEntry) -> Result<String> {
        let infos = build_record_infos(
            std::slice::from_ref(entry),
            &self.record_blocks,
            self.record_section_offset,
        )?;

        if infos.is_empty() {
            return Err(Error::Corrupt("no record info built".into()));
        }

        extract_record(&self.mmap, &infos[0], &self.info.encoding)
    }

    /// Load a resource from associated MDD files by path.
    pub fn load_resource(&self, resource_path: &str) -> Result<Vec<u8>> {
        let normalized = normalize_resource_path(resource_path);
        // For now, return KeyNotFound — full MDD index loading is Phase 6
        Err(Error::KeyNotFound(normalized))
    }
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
