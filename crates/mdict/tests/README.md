# Test MDX/MDD Samples

Integration tests require real MDX/MDD dictionary files which are not committed to the repository due to licensing.

## How to obtain test files

1. **Minimal test dict**: Use `mdx-builder` (Python) to create a minimal MDX file:
   ```bash
   pip install mdict-utils
   # Create a test.txt with tab-separated key\thtml_value entries
   mdict -a test.txt test.mdx
   ```

2. **Real dictionaries**: Place `.mdx` and `.mdd` files in this directory. They are gitignored.

3. **Expected structure**:
   ```
   tests/
   ├── README.md          (this file)
   ├── fixtures/          (gitignored test dictionaries)
   │   ├── minimal.mdx    (auto-generated minimal dict)
   │   └── *.mdx / *.mdd  (real dicts for integration testing)
   └── integration.rs     (integration tests, skipped if no fixtures)
   ```

## Running integration tests

```bash
# Run only if fixtures exist:
cargo test --package mdict --test integration

# Run all mdict tests including unit tests:
cargo test --package mdict
```

Tests that require fixture files use `#[ignore]` and can be run with:
```bash
cargo test --package mdict -- --ignored
```
