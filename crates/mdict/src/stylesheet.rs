//! StyleSheet substitution for MDX articles.
//!
//! MDX uses `` `N` `` markers in article text that reference stylesheet entries.
//! Each style ID maps to a (prefix, suffix) pair. The substitution replaces:
//! - `` `N` `` with `prefix` of style N, accumulating `suffix` for later output.
//! - When a new `` `N` `` is found or end of text, pending suffix is emitted.

use crate::types::StyleSheet;

/// Substitute stylesheet markers in article text.
///
/// Matches the GoldenDict `substituteStylesheet()` algorithm exactly.
pub fn substitute_stylesheet(article: &str, stylesheets: &StyleSheet) -> String {
    if stylesheets.is_empty() || !article.contains('`') {
        return article.to_string();
    }

    let mut result = String::with_capacity(article.len());
    let mut end_style = String::new();
    let mut chars = article.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '`' {
            // Try to parse a number followed by backtick
            let mut num_str = String::new();
            let mut found_closing = false;

            // Peek ahead to collect digits
            while let Some(&next) = chars.peek() {
                if next.is_ascii_digit() {
                    num_str.push(next);
                    chars.next();
                } else if next == '`' && !num_str.is_empty() {
                    chars.next();
                    found_closing = true;
                    break;
                } else {
                    break;
                }
            }

            if found_closing {
                if let Ok(style_id) = num_str.parse::<i32>() {
                    if let Some((prefix, suffix)) = stylesheets.get(&style_id) {
                        // Emit accumulated end_style + new prefix
                        result.push_str(&end_style);
                        result.push_str(prefix);
                        end_style = suffix.clone();
                    } else {
                        // Unknown style: emit accumulated end_style, clear it
                        result.push_str(&end_style);
                        end_style.clear();
                    }
                } else {
                    // Not a valid number, output as-is
                    result.push('`');
                    result.push_str(&num_str);
                    result.push('`');
                }
            } else {
                // No closing backtick or no digits, output as-is
                result.push('`');
                result.push_str(&num_str);
            }
        } else {
            result.push(ch);
        }
    }

    // Strip trailing nulls (matching GoldenDict's rstripnull)
    let trimmed = result.trim_end_matches('\0');
    let mut final_result = trimmed.to_string();
    final_result.push_str(&end_style);
    final_result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn make_styles(entries: &[(i32, &str, &str)]) -> StyleSheet {
        let mut map = BTreeMap::new();
        for &(id, prefix, suffix) in entries {
            map.insert(id, (prefix.to_string(), suffix.to_string()));
        }
        map
    }

    #[test]
    fn substitute_single_style() {
        let styles = make_styles(&[(1, "<b>", "</b>")]);
        let input = "`1`Hello`1`";
        let result = substitute_stylesheet(input, &styles);
        // First `1` → prefix "<b>", end_style = "</b>"
        // "Hello"
        // Second `1` → emit end_style "</b>" + new prefix "<b>", end_style = "</b>"
        // Final: append end_style
        assert_eq!(result, "<b>Hello</b><b></b>");
    }

    #[test]
    fn substitute_nested_styles() {
        let styles = make_styles(&[
            (1, "<div class=\"a\">", "</div>"),
            (2, "<span>", "</span>"),
        ]);
        let input = "`1`outer`2`inner`2`rest`1`";
        let result = substitute_stylesheet(input, &styles);
        // `1` → "<div class=\"a\">" end_style="</div>"
        // "outer"
        // `2` → emit "</div>" + "<span>", end_style="</span>"
        // "inner"
        // `2` → emit "</span>" + "<span>", end_style="</span>"
        // "rest"
        // `1` → emit "</span>" + "<div class=\"a\">", end_style="</div>"
        // final → "</div>"
        assert_eq!(
            result,
            "<div class=\"a\">outer</div><span>inner</span><span>rest</span><div class=\"a\"></div>"
        );
    }

    #[test]
    fn substitute_unknown_id() {
        let styles = make_styles(&[(1, "<b>", "</b>")]);
        let input = "`1`text`99`more";
        let result = substitute_stylesheet(input, &styles);
        // `1` → "<b>", end_style="</b>"
        // "text"
        // `99` → unknown, emit end_style "</b>", clear end_style
        // "more"
        // final: no end_style
        assert_eq!(result, "<b>text</b>more");
    }

    #[test]
    fn substitute_no_styles() {
        let styles = StyleSheet::new();
        let input = "no styles here";
        let result = substitute_stylesheet(input, &styles);
        assert_eq!(result, "no styles here");
    }

    #[test]
    fn substitute_no_backticks() {
        let styles = make_styles(&[(1, "<b>", "</b>")]);
        let input = "plain text without backticks";
        let result = substitute_stylesheet(input, &styles);
        assert_eq!(result, "plain text without backticks");
    }

    #[test]
    fn substitute_trailing_suffix() {
        let styles = make_styles(&[(1, "<p>", "</p>")]);
        let input = "`1`content";
        let result = substitute_stylesheet(input, &styles);
        // `1` → "<p>", end_style="</p>"
        // "content"
        // final → append "</p>"
        assert_eq!(result, "<p>content</p>");
    }

    #[test]
    fn substitute_backtick_not_style() {
        let styles = make_styles(&[(1, "<b>", "</b>")]);
        let input = "code: `x = 1`";
        let result = substitute_stylesheet(input, &styles);
        // `x` is not a number followed by backtick → output as-is
        assert_eq!(result, "code: `x = 1`");
    }
}
