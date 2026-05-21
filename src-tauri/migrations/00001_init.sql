-- Initial schema for MemoWords

CREATE TABLE IF NOT EXISTS dictionaries (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT,
    encoding    TEXT NOT NULL DEFAULT 'UTF-8',
    path        TEXT NOT NULL,
    has_mdd     INTEGER NOT NULL DEFAULT 0,
    word_count  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dict_groups (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dict_group_members (
    group_id TEXT NOT NULL REFERENCES dict_groups(id) ON DELETE CASCADE,
    dict_id  TEXT NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (group_id, dict_id)
);

CREATE TABLE IF NOT EXISTS wordbooks (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    language   TEXT NOT NULL DEFAULT 'en',
    source     TEXT NOT NULL DEFAULT 'custom',
    word_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS word_entries (
    id       TEXT PRIMARY KEY,
    headword TEXT NOT NULL,
    book_id  TEXT NOT NULL REFERENCES wordbooks(id) ON DELETE CASCADE,
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_word_entries_book ON word_entries(book_id);

CREATE TABLE IF NOT EXISTS review_cards (
    id            TEXT PRIMARY KEY,
    headword      TEXT NOT NULL,
    book_id       TEXT NOT NULL REFERENCES wordbooks(id) ON DELETE CASCADE,
    state         TEXT NOT NULL DEFAULT 'new',
    due           TEXT,
    interval_days REAL NOT NULL DEFAULT 0,
    ease_factor   REAL NOT NULL DEFAULT 2.5,
    reps          INTEGER NOT NULL DEFAULT 0,
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_review_cards_due ON review_cards(book_id, state, due);

CREATE TABLE IF NOT EXISTS lookup_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    headword  TEXT NOT NULL,
    dict_ids  TEXT NOT NULL,
    looked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_time ON lookup_history(looked_at DESC);
