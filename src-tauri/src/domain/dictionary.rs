use serde::{Deserialize, Serialize};

/// Unique dictionary identifier (UUID string).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct DictId(pub String);

impl DictId {
    pub fn new() -> Self {
        Self(uuid::Uuid::new_v4().to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for DictId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Dictionary metadata persisted in SQLite.
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

/// Unique group identifier.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct GroupId(pub String);

impl GroupId {
    pub fn new() -> Self {
        Self(uuid::Uuid::new_v4().to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Dictionary group with ordered members.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictGroup {
    pub id: GroupId,
    pub name: String,
    pub dict_ids: Vec<DictId>,
}

/// A loaded article from a specific dictionary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictArticle {
    pub dict_id: DictId,
    pub dict_name: String,
    pub headword: String,
    pub html: String,
}

/// A single search suggestion/candidate.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchCandidate {
    pub headword: String,
    pub dict_id: DictId,
    pub dict_name: String,
}

/// Resource data returned from MDD.
#[derive(Debug, Clone)]
pub struct DictResource {
    pub data: Vec<u8>,
    pub mime_type: String,
}

/// Per-dictionary configuration: display, styling, extra resources.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictConfig {
    pub dict_id: DictId,
    pub display_name: Option<String>,
    pub priority: i32,
    pub dark_mode: String,
    pub custom_css: String,
    pub custom_js: String,
    pub js_enabled: bool,
    pub css_path: Option<String>,
    pub js_path: Option<String>,
    pub extra_mdd_paths: Vec<String>,
}

impl DictConfig {
    /// Create a default config for a newly imported dictionary.
    pub fn default_for(dict_id: &DictId) -> Self {
        Self {
            dict_id: dict_id.clone(),
            display_name: None,
            priority: 5,
            dark_mode: "auto".to_string(),
            custom_css: String::new(),
            custom_js: String::new(),
            js_enabled: false,
            css_path: None,
            js_path: None,
            extra_mdd_paths: Vec::new(),
        }
    }
}

/// Partial update for DictConfig — only supplied fields are updated.
/// All fields use flat Option: None = don't update, Some("") = clear to default.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DictConfigUpdate {
    pub display_name: Option<String>,
    pub priority: Option<i32>,
    pub dark_mode: Option<String>,
    pub custom_css: Option<String>,
    pub custom_js: Option<String>,
    pub js_enabled: Option<bool>,
    pub css_path: Option<String>,
    pub js_path: Option<String>,
    pub extra_mdd_paths: Option<Vec<String>>,
}
