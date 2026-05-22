//! Diagnostic tool: inspect what a lookup actually returns.
//!
//! Usage:
//!   cargo run -p mdict --example lookup_debug -- /path/to/dict.mdx "word"
//!
//! This prints:
//!   - How many duplicate entry indices the FST returns
//!   - Each entry's headword + raw article (first 300 chars)
//!   - Whether the article is a @@@LINK redirect
//!   - Final resolved articles count and sizes

use std::path::Path;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: {} <dict.mdx> <word> [word2] ...", args[0]);
        std::process::exit(1);
    }

    let mdx_path = Path::new(&args[1]);
    let words: Vec<&str> = args[2..].iter().map(|s| s.as_str()).collect();

    eprintln!("Opening: {}", mdx_path.display());
    let dict = mdict::MdxDict::open(mdx_path).expect("failed to open MDX");
    eprintln!(
        "Title: {}\nEntries: {}\n",
        dict.title(),
        dict.entry_count()
    );

    for word in &words {
        println!("═══════════════════════════════════════════════");
        println!("LOOKUP: {:?}", word);
        println!("═══════════════════════════════════════════════");

        // Step 1: Check FST index — how many entry indices?
        let indices = dict.get_entry_indices(word);
        println!(
            "\n[1] get_entry_indices({:?}) → {} entry indices: {:?}",
            word,
            indices.len(),
            indices
        );

        if indices.is_empty() {
            println!("    → No match in FST index.\n");

            // Try prefix search for context
            let prefix_hits = dict.prefix_search(word, 10);
            if !prefix_hits.is_empty() {
                println!("    Prefix matches: {:?}", prefix_hits);
            }
            continue;
        }

        // Step 2: Load each raw article
        println!("\n[2] Raw articles for each entry index:");
        for (n, &idx) in indices.iter().enumerate() {
            let entry = &dict.entries()[idx];
            let headword = &entry.headword;

            match dict.load_article_for_entry(idx) {
                Ok(raw) => {
                    let is_link = raw.trim().starts_with("@@@LINK=");
                    let preview: String = raw.chars().take(300).collect();
                    let total_len = raw.len();

                    println!("  [{n}] headword={:?}  raw_len={}  is_link={}", headword, total_len, is_link);
                    println!("      preview: {:?}", preview);
                    if total_len > 300 {
                        println!("      ... ({} more bytes)", total_len - 300);
                    }
                }
                Err(e) => {
                    println!("  [{n}] headword={:?}  ERROR: {}", headword, e);
                }
            }
        }

        // Step 3: Full lookup (with @@@LINK resolution)
        println!("\n[3] dict.lookup({:?}):", word);
        match dict.lookup(word) {
            Ok(articles) => {
                println!("    → {} article(s) returned", articles.len());
                for (i, art) in articles.iter().enumerate() {
                    let preview: String = art.chars().take(200).collect();
                    println!(
                        "    [{}] len={}  starts_with_link={}",
                        i,
                        art.len(),
                        art.trim().starts_with("@@@LINK=")
                    );
                    println!("        {:?}", preview);
                    if art.len() > 200 {
                        println!("        ... ({} more bytes)", art.len() - 200);
                    }
                }
            }
            Err(e) => {
                println!("    → ERROR: {}", e);
            }
        }
        println!();
    }
}
