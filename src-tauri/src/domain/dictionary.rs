use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictMeta {
    pub id: DictId,
    pub title: String,
    pub description: Option<String>,
    pub encoding: String,
    pub path: String,
    pub has_mdd: bool,
    pub word_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictGroup {
    pub id: String,
    pub name: String,
    pub dict_ids: Vec<DictId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictArticle {
    pub dict_id: DictId,
    pub dict_name: String,
    pub headword: String,
    pub html: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub headword: String,
    pub dict_id: DictId,
    pub offset: u64,
}
