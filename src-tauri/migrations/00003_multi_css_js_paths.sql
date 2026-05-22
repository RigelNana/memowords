-- Convert css_path/js_path from single string to JSON arrays (like extra_mdd_paths).
-- Existing non-null values are wrapped into a single-element JSON array.

-- css_paths (JSON array)
ALTER TABLE dict_config ADD COLUMN css_paths TEXT NOT NULL DEFAULT '[]';
UPDATE dict_config SET css_paths = json_array(css_path) WHERE css_path IS NOT NULL AND css_path != '';

-- js_paths (JSON array)
ALTER TABLE dict_config ADD COLUMN js_paths TEXT NOT NULL DEFAULT '[]';
UPDATE dict_config SET js_paths = json_array(js_path) WHERE js_path IS NOT NULL AND js_path != '';
