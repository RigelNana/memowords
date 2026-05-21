use anyhow::Result;

use crate::domain::dictionary::{DictArticle, DictId, DictResource, SearchCandidate};

/// Search engine port — abstracts dictionary lookup operations.
pub trait SearchEngine: Send + Sync {
    /// Prefix search across loaded dictionaries in a group.
    fn prefix_search(&self, query: &str, dict_ids: &[DictId], limit: usize) -> Result<Vec<SearchCandidate>>;

    /// Fuzzy search (Levenshtein) across loaded dictionaries.
    fn fuzzy_search(&self, query: &str, dict_ids: &[DictId], limit: usize) -> Result<Vec<SearchCandidate>>;

    /// Exact lookup — returns full article HTML for each matching dict.
    fn lookup(&self, word: &str, dict_ids: &[DictId]) -> Result<Vec<DictArticle>>;

    /// Load a resource (image, audio, CSS) from a specific dictionary.
    fn load_resource(&self, dict_id: &DictId, path: &str) -> Result<Option<DictResource>>;

    /// Load/register a dictionary into the engine. Returns entry count.
    fn load_dict(&self, dict_id: &DictId, mdx_path: &str) -> Result<u64>;

    /// Unload a dictionary from the engine.
    fn unload_dict(&self, dict_id: &DictId);

    /// Check if a dictionary is currently loaded.
    fn is_loaded(&self, dict_id: &DictId) -> bool;
}
