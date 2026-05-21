use anyhow::Result;

use crate::domain::review::{Rating, ReviewCard};
use crate::domain::wordbook::WordBookId;

pub trait ReviewRepo: Send + Sync {
    fn due_cards(&self, book_id: &WordBookId, limit: usize) -> Result<Vec<ReviewCard>>;
    fn get_card(&self, id: &str) -> Result<Option<ReviewCard>>;
    fn save_card(&self, card: &ReviewCard) -> Result<()>;
    fn rate_card(&self, id: &str, rating: Rating) -> Result<ReviewCard>;
}
