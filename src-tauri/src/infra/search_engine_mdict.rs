use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;

use anyhow::{Context, Result};
use dashmap::DashMap;

use mdict::MdxDict;

use crate::domain::dictionary::{DictArticle, DictId, DictResource, SearchCandidate};
use crate::port::search_engine::SearchEngine;

/// Search engine implementation backed by the `mdict` crate.
///
/// Manages a map of loaded MdxDict instances keyed by DictId.
/// Thread-safe via DashMap for concurrent access.
pub struct MdictSearchEngine {
    dicts: DashMap<String, Arc<MdxDict>>,
    /// User-configured display names (overrides MDX title).
    display_names: DashMap<String, String>,
}

impl MdictSearchEngine {
    pub fn new() -> Self {
        Self {
            dicts: DashMap::new(),
            display_names: DashMap::new(),
        }
    }

    fn get_dict(&self, dict_id: &DictId) -> Option<Arc<MdxDict>> {
        self.dicts.get(dict_id.as_str()).map(|r| Arc::clone(r.value()))
    }

    /// Resolve the display name for a dict: user override > MDX title.
    fn resolve_name(&self, dict_id: &DictId, dict: &MdxDict) -> String {
        self.display_names
            .get(dict_id.as_str())
            .map(|r| r.value().clone())
            .unwrap_or_else(|| dict.title().to_string())
    }

    /// Set or clear a user-configured display name for a dictionary.
    pub fn set_display_name(&self, dict_id: &DictId, name: Option<String>) {
        match name {
            Some(n) if !n.is_empty() => {
                self.display_names.insert(dict_id.as_str().to_string(), n);
            }
            _ => {
                self.display_names.remove(dict_id.as_str());
            }
        }
    }
}

impl SearchEngine for MdictSearchEngine {
    fn prefix_search(&self, query: &str, dict_ids: &[DictId], limit: usize) -> Result<Vec<SearchCandidate>> {
        let mut results = Vec::new();
        let mut seen: HashSet<(String, String)> = HashSet::new();

        for dict_id in dict_ids {
            let Some(dict) = self.get_dict(dict_id) else {
                continue;
            };

            let headwords = dict.prefix_search(query, limit);
            for hw in headwords {
                let key = (hw.to_string(), dict_id.as_str().to_string());
                if !seen.insert(key) {
                    continue;
                }
                results.push(SearchCandidate {
                    headword: hw.to_string(),
                    dict_id: dict_id.clone(),
                    dict_name: self.resolve_name(dict_id, &dict),
                });
                if results.len() >= limit {
                    return Ok(results);
                }
            }
        }

        Ok(results)
    }

    fn fuzzy_search(&self, query: &str, dict_ids: &[DictId], limit: usize) -> Result<Vec<SearchCandidate>> {
        let mut results = Vec::new();
        let mut seen: HashSet<(String, String)> = HashSet::new();

        for dict_id in dict_ids {
            let Some(dict) = self.get_dict(dict_id) else {
                continue;
            };

            let headwords = dict.fuzzy_search(query, 1, limit);
            for hw in headwords {
                let key = (hw.to_string(), dict_id.as_str().to_string());
                if !seen.insert(key) {
                    continue;
                }
                results.push(SearchCandidate {
                    headword: hw.to_string(),
                    dict_id: dict_id.clone(),
                    dict_name: self.resolve_name(dict_id, &dict),
                });
                if results.len() >= limit {
                    return Ok(results);
                }
            }
        }

        Ok(results)
    }

    fn lookup(&self, word: &str, dict_ids: &[DictId]) -> Result<Vec<DictArticle>> {
        let mut articles = Vec::new();

        for dict_id in dict_ids {
            let Some(dict) = self.get_dict(dict_id) else {
                continue;
            };

            match dict.lookup(word) {
                Ok(results) => {
                    for html in results {
                        // Skip unresolved @@@LINK entries
                        if html.trim().starts_with("@@@LINK=") {
                            continue;
                        }
                        articles.push(DictArticle {
                            dict_id: dict_id.clone(),
                            dict_name: self.resolve_name(dict_id, &dict),
                            headword: word.to_string(),
                            html,
                        });
                    }
                }
                Err(e) => {
                    tracing::warn!(dict = %dict.title(), word, error = %e, "lookup failed");
                }
            }
        }

        Ok(articles)
    }

    fn load_resource(&self, dict_id: &DictId, path: &str) -> Result<Option<DictResource>> {
        let Some(dict) = self.get_dict(dict_id) else {
            return Ok(None);
        };

        match dict.load_resource(path) {
            Ok(data) => {
                let mime = guess_mime(path);
                Ok(Some(DictResource { data, mime_type: mime }))
            }
            Err(mdict::Error::KeyNotFound(_)) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    fn load_dict(&self, dict_id: &DictId, mdx_path: &str) -> Result<u64> {
        let path = Path::new(mdx_path);
        let dict = MdxDict::open(path)
            .with_context(|| format!("failed to open MDX: {}", mdx_path))?;

        let count = dict.entry_count() as u64;
        tracing::info!(
            dict_id = %dict_id,
            title = %dict.title(),
            entries = count,
            "dictionary loaded into search engine"
        );

        self.dicts.insert(dict_id.as_str().to_string(), Arc::new(dict));
        Ok(count)
    }

    fn unload_dict(&self, dict_id: &DictId) {
        if self.dicts.remove(dict_id.as_str()).is_some() {
            tracing::info!(dict_id = %dict_id, "dictionary unloaded");
        }
    }

    fn is_loaded(&self, dict_id: &DictId) -> bool {
        self.dicts.contains_key(dict_id.as_str())
    }
}

/// Simple MIME type guessing by extension.
fn guess_mime(path: &str) -> String {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "css" => "text/css",
        "js" => "application/javascript",
        "html" | "htm" => "text/html",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "ttf" => "font/ttf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "otf" => "font/otf",
        _ => "application/octet-stream",
    }
    .to_string()
}
