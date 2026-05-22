-- Per-dictionary configuration (display, styling, extra resources)

CREATE TABLE IF NOT EXISTS dict_config (
    dict_id       TEXT PRIMARY KEY REFERENCES dictionaries(id) ON DELETE CASCADE,
    display_name  TEXT,
    priority      INTEGER NOT NULL DEFAULT 5,
    dark_mode     TEXT NOT NULL DEFAULT 'auto',
    custom_css    TEXT NOT NULL DEFAULT '',
    custom_js     TEXT NOT NULL DEFAULT '',
    js_enabled    INTEGER NOT NULL DEFAULT 0,
    css_path      TEXT,
    js_path       TEXT,
    extra_mdd_paths TEXT NOT NULL DEFAULT '[]',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
