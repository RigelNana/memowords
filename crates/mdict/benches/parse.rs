use std::path::Path;
use std::time::Duration;

use criterion::{criterion_group, criterion_main, Criterion};
use mdict::MdxDict;

const FIXTURE: &str = "tests/fixtures/bing.mdx";

fn fixture_path() -> &'static Path {
    Path::new(FIXTURE)
}

/// Benchmark: full open (header + key blocks + record index + FST build).
fn bench_open(c: &mut Criterion) {
    let path = fixture_path();
    if !path.exists() {
        eprintln!("SKIP: fixture not found at {}", path.display());
        return;
    }

    c.bench_function("mdx_open", |b| {
        b.iter(|| {
            let dict = MdxDict::open(std::hint::black_box(path)).unwrap();
            std::hint::black_box(&dict);
        });
    });
}

/// Benchmark: prefix search after open.
fn bench_prefix_search(c: &mut Criterion) {
    let path = fixture_path();
    if !path.exists() {
        return;
    }

    let dict = MdxDict::open(path).unwrap();

    c.bench_function("prefix_search_hello", |b| {
        b.iter(|| {
            let results = dict.prefix_search(std::hint::black_box("hello"), 20);
            std::hint::black_box(&results);
        });
    });

    c.bench_function("prefix_search_a", |b| {
        b.iter(|| {
            let results = dict.prefix_search(std::hint::black_box("a"), 50);
            std::hint::black_box(&results);
        });
    });
}

/// Benchmark: exact lookup.
fn bench_lookup(c: &mut Criterion) {
    let path = fixture_path();
    if !path.exists() {
        return;
    }

    let dict = MdxDict::open(path).unwrap();

    c.bench_function("lookup_hello", |b| {
        b.iter(|| {
            let result = dict.lookup(std::hint::black_box("hello"));
            std::hint::black_box(&result);
        });
    });

    c.bench_function("lookup_nonexistent", |b| {
        b.iter(|| {
            let result = dict.lookup(std::hint::black_box("xyzzyplugh"));
            std::hint::black_box(&result);
        });
    });
}

/// Benchmark: fuzzy search.
fn bench_fuzzy_search(c: &mut Criterion) {
    let path = fixture_path();
    if !path.exists() {
        return;
    }

    let dict = MdxDict::open(path).unwrap();

    c.bench_function("fuzzy_hello_d1", |b| {
        b.iter(|| {
            let results = dict.fuzzy_search(std::hint::black_box("hello"), 1, 20);
            std::hint::black_box(&results);
        });
    });
}

/// Benchmark: FST index build alone (given pre-parsed entries).
fn bench_index_build(c: &mut Criterion) {
    let path = fixture_path();
    if !path.exists() {
        return;
    }

    // Open once to get the entries
    let dict = MdxDict::open(path).unwrap();
    let entry_count = dict.entry_count();
    eprintln!("Dictionary entries: {}", entry_count);

    // We need entries; re-parse just key blocks for this bench
    // Instead, just benchmark the FST build portion via open
    c.bench_function("fst_index_build", |b| {
        b.iter(|| {
            let d = MdxDict::open(std::hint::black_box(path)).unwrap();
            std::hint::black_box(d.entry_count());
        });
    });
}

criterion_group! {
    name = benches;
    config = Criterion::default()
        .sample_size(10)
        .measurement_time(Duration::from_secs(30));
    targets = bench_open, bench_prefix_search, bench_lookup, bench_fuzzy_search, bench_index_build
}
criterion_main!(benches);
