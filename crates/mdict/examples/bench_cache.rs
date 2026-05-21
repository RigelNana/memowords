use std::path::Path;
use std::time::Instant;

fn main() {
    let path = Path::new("tests/fixtures/bing.mdx");
    if !path.exists() {
        eprintln!("fixture not found at {}", path.display());
        return;
    }

    // Remove cache
    let idx = path.with_extension("mdict.idx");
    let _ = std::fs::remove_file(&idx);

    // First open: builds + persists index
    let t1 = Instant::now();
    let dict = mdict::MdxDict::open(path).unwrap();
    let d1 = t1.elapsed();
    println!(
        "First open (build + persist): {:?}  entries={}",
        d1,
        dict.entry_count()
    );
    drop(dict);

    // Verify cache exists
    assert!(idx.exists(), "cache file should exist");
    let cache_size = std::fs::metadata(&idx).unwrap().len();
    println!("Cache file size: {:.2} MB", cache_size as f64 / 1024.0 / 1024.0);

    // Second open: loads from cache
    let t2 = Instant::now();
    let dict2 = mdict::MdxDict::open(path).unwrap();
    let d2 = t2.elapsed();
    println!(
        "Second open (cached): {:?}  entries={}",
        d2,
        dict2.entry_count()
    );

    let speedup = d1.as_secs_f64() / d2.as_secs_f64();
    println!("\nSpeedup: {:.1}x", speedup);
}
