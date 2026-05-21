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

    // First open: builds index (write is async in background)
    let t1 = Instant::now();
    let dict = mdict::MdxDict::open(path).unwrap();
    let d1 = t1.elapsed();
    println!(
        "First open (build, async write): {:?}  entries={}",
        d1,
        dict.entry_count()
    );
    drop(dict);

    // Wait for background write to complete
    std::thread::sleep(std::time::Duration::from_secs(3));

    // Verify cache exists
    if idx.exists() {
        let cache_size = std::fs::metadata(&idx).unwrap().len();
        println!("Cache file size: {:.2} MB", cache_size as f64 / 1024.0 / 1024.0);
    } else {
        println!("Warning: cache file not yet written");
    }

    // Second open: loads from cache
    let t2 = Instant::now();
    let dict2 = mdict::MdxDict::open(path).unwrap();
    let d2 = t2.elapsed();
    println!(
        "Second open (cached): {:?}  entries={}",
        d2,
        dict2.entry_count()
    );

    println!("\nFirst open speedup vs cached: {:.1}x", d1.as_secs_f64() / d2.as_secs_f64());
}
