use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordBookId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordBook {
    pub id: WordBookId,
    pub name: String,
    pub language: String,
    pub source: WordBookSource,
    pub word_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WordBookSource {
    BuiltIn,
    Custom,
    Favorites,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordEntry {
    pub id: String,
    pub headword: String,
    pub book_id: WordBookId,
}
