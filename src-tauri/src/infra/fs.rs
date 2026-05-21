use anyhow::Result;
use std::path::{Path, PathBuf};

pub fn find_mdx_files(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut results = vec![];

    if !dir.is_dir() {
        return Ok(results);
    }

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext.eq_ignore_ascii_case("mdx") {
                    results.push(path);
                }
            }
        }
    }

    results.sort();
    Ok(results)
}

pub fn find_mdd_files(mdx_path: &Path) -> Vec<PathBuf> {
    let Some(stem) = mdx_path.file_stem().and_then(|s| s.to_str()) else {
        return vec![];
    };
    let Some(dir) = mdx_path.parent() else {
        return vec![];
    };

    let mut mdds = vec![];

    let main_mdd = dir.join(format!("{stem}.mdd"));
    if main_mdd.exists() {
        mdds.push(main_mdd);
    }

    for i in 1.. {
        let vol = dir.join(format!("{stem}.{i}.mdd"));
        if !vol.exists() {
            break;
        }
        mdds.push(vol);
    }

    mdds
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn find_mdd_no_mdd() {
        let dir = tempfile::tempdir().unwrap();
        let mdx = dir.path().join("test.mdx");
        fs::write(&mdx, b"").unwrap();

        let mdds = find_mdd_files(&mdx);
        assert!(mdds.is_empty());
    }

    #[test]
    fn find_mdd_with_volumes() {
        let dir = tempfile::tempdir().unwrap();
        let mdx = dir.path().join("dict.mdx");
        fs::write(&mdx, b"").unwrap();
        fs::write(dir.path().join("dict.mdd"), b"").unwrap();
        fs::write(dir.path().join("dict.1.mdd"), b"").unwrap();
        fs::write(dir.path().join("dict.2.mdd"), b"").unwrap();

        let mdds = find_mdd_files(&mdx);
        assert_eq!(mdds.len(), 3);
    }
}
