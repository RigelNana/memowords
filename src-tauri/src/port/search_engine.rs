use anyhow::Result;

use crate::domain::dictionary::{DictArticle, SearchResult};

pub trait SearchEngine: Send + Sync {
    fn prefix_search(&self, query: &str, group_id: &str, limit: usize) -> Result<Vec<SearchResult>>;
    fn exact_search(&self, word: &str, group_id: &str) -> Result<Vec<SearchResult>>;
    fn lookup(&self, word: &str, group_id: &str) -> Result<Vec<DictArticle>>;
}
