use serde::{Deserialize, Serialize};

use super::wordbook::WordBookId;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewCard {
    pub id: String,
    pub headword: String,
    pub book_id: WordBookId,
    pub state: CardState,
    pub due: Option<String>,
    pub interval_days: f64,
    pub ease_factor: f64,
    pub reps: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CardState {
    New,
    Learning,
    Review,
    Relearning,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Rating {
    Again,
    Hard,
    Good,
    Easy,
}
