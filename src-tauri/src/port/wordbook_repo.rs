use anyhow::Result;

use crate::domain::wordbook::{WordBook, WordBookId, WordEntry};

pub trait WordBookRepo: Send + Sync {
    fn list_books(&self) -> Result<Vec<WordBook>>;
    fn get_book(&self, id: &WordBookId) -> Result<Option<WordBook>>;
    fn save_book(&self, book: &WordBook) -> Result<()>;
    fn remove_book(&self, id: &WordBookId) -> Result<()>;

    fn list_entries(&self, book_id: &WordBookId) -> Result<Vec<WordEntry>>;
    fn add_entry(&self, entry: &WordEntry) -> Result<()>;
    fn remove_entry(&self, id: &str) -> Result<()>;
}
