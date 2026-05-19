use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use anyhow::{Context, Result, anyhow, bail};
use base64::{Engine, engine::general_purpose::STANDARD};
use chrono::Local;
use walkdir::{DirEntry, WalkDir};

#[derive(Debug)]
struct SearchHit {
    rank: u8,
    modified: u64,
    path: PathBuf,
}

pub(crate) fn markdown_entries(
    vault: &Path,
) -> impl Iterator<Item = walkdir::Result<DirEntry>> + '_ {
    WalkDir::new(vault)
        .into_iter()
        .filter_entry(|entry| !is_hidden(entry))
        .filter(|entry| {
            entry
                .as_ref()
                .map(|entry| {
                    entry.file_type().is_file()
                        && entry.path().extension().and_then(|ext| ext.to_str()) == Some("md")
                })
                .unwrap_or(true)
        })
}

fn is_hidden(entry: &DirEntry) -> bool {
    entry
        .file_name()
        .to_str()
        .map(|name| name.starts_with('.') && name != ".")
        .unwrap_or(false)
}

pub(crate) fn search_markdown(vault: &Path, keyword: &str) -> Result<Vec<PathBuf>> {
    let keyword = keyword.trim();
    let needle = keyword.to_lowercase();
    let mut hits = Vec::new();

    for entry in markdown_entries(vault) {
        let entry = entry?;
        let path = entry.path().to_path_buf();
        let rel = rel_to_vault(vault, &path)?;
        let display_rel = rel.strip_suffix(".md").unwrap_or(&rel);
        let path_matches = display_rel.to_lowercase().contains(&needle);
        let content_matches = !keyword.is_empty()
            && fs::read_to_string(&path)
                .unwrap_or_default()
                .to_lowercase()
                .contains(&needle);

        if keyword.is_empty() || path_matches || content_matches {
            hits.push(SearchHit {
                rank: if !keyword.is_empty() && path_matches {
                    0
                } else {
                    1
                },
                modified: modified_secs(&entry),
                path,
            });
        }
    }

    hits.sort_by(|a, b| {
        a.rank
            .cmp(&b.rank)
            .then_with(|| b.modified.cmp(&a.modified))
    });
    let limit = if keyword.is_empty() { 20 } else { hits.len() };
    Ok(hits.into_iter().take(limit).map(|hit| hit.path).collect())
}

fn modified_secs(entry: &DirEntry) -> u64 {
    entry
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or_default()
}

pub(crate) fn random_markdown_file(vault: &Path) -> Result<Option<PathBuf>> {
    let files = markdown_entries(vault)
        .filter_map(|entry| entry.ok().map(|entry| entry.path().to_path_buf()))
        .collect::<Vec<_>>();
    if files.is_empty() {
        return Ok(None);
    }
    let nanos = Local::now()
        .timestamp_nanos_opt()
        .unwrap_or_default()
        .unsigned_abs() as usize;
    Ok(files.get(nanos % files.len()).cloned())
}

pub(crate) fn resolve_markdown_request(vault: &Path, input: &str) -> Result<PathBuf> {
    let rel = normalize_markdown_rel(input, true)?;
    let requested = vault.join(&rel);
    if requested.exists() {
        return Ok(requested);
    }

    if rel.components().count() == 1 {
        let file_name = rel
            .file_name()
            .ok_or_else(|| anyhow!("path has no file name"))?;
        let mut matches = Vec::new();
        for entry in markdown_entries(vault) {
            let entry = entry?;
            if entry.path().file_name() == Some(file_name) {
                matches.push(entry.path().to_path_buf());
            }
        }
        matches.sort_by_key(|path| rel_to_vault(vault, path).unwrap_or_default());
        if let Some(path) = matches.into_iter().next() {
            return Ok(path);
        }
    }

    Ok(requested)
}

pub(crate) fn normalize_rel_path(input: &str) -> Result<PathBuf> {
    normalize_rel(input, None)
}

pub(crate) fn normalize_markdown_rel(input: &str, add_extension: bool) -> Result<PathBuf> {
    normalize_rel(input, add_extension.then_some(".md"))
}

fn normalize_rel(input: &str, extension: Option<&str>) -> Result<PathBuf> {
    let mut trimmed = input.trim().trim_start_matches('/').to_string();
    if trimmed.contains('\0') {
        bail!("path contains null byte");
    }
    if let Some(extension) = extension
        && !trimmed.ends_with(extension)
    {
        trimmed.push_str(extension);
    }
    let path = Path::new(&trimmed);
    if path.is_absolute() {
        bail!("absolute paths are not allowed");
    }
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            Component::ParentDir => bail!("parent path components are not allowed"),
            _ => bail!("unsupported path component"),
        }
    }
    if clean.as_os_str().is_empty() {
        bail!("empty path");
    }
    Ok(clean)
}

pub(crate) fn ensure_inside(vault: &Path, path: &Path) -> Result<()> {
    let parent = path.parent().ok_or_else(|| anyhow!("path has no parent"))?;
    let canonical_parent = if parent.exists() {
        parent.canonicalize()?
    } else {
        let mut existing = parent;
        while !existing.exists() {
            existing = existing
                .parent()
                .ok_or_else(|| anyhow!("no existing parent for {}", path.display()))?;
        }
        existing.canonicalize()?
    };
    if canonical_parent.starts_with(vault) {
        Ok(())
    } else {
        bail!("path escapes vault: {}", path.display())
    }
}

pub(crate) fn rel_to_vault(vault: &Path, path: &Path) -> Result<String> {
    let rel = path
        .strip_prefix(vault)
        .with_context(|| format!("{} is outside {}", path.display(), vault.display()))?;
    Ok(rel.to_string_lossy().replace('\\', "/"))
}

pub(crate) fn save_data_url_image(
    vault: &Path,
    image: &str,
    now: &chrono::DateTime<Local>,
) -> Result<String> {
    let (meta, data) = image
        .split_once(',')
        .ok_or_else(|| anyhow!("invalid image data url"))?;
    if !meta.starts_with("data:image/") || !meta.ends_with(";base64") {
        bail!("unsupported image data url");
    }
    let mime = meta
        .trim_start_matches("data:image/")
        .trim_end_matches(";base64");
    let ext = match mime {
        "jpeg" | "jpg" => "jpg",
        "png" => "png",
        "gif" => "gif",
        "webp" => "webp",
        other => bail!("unsupported image type: {other}"),
    };
    let bytes = STANDARD.decode(data)?;
    let name = format!("obr-{}.{}", now.format("%Y-%m-%d-%H-%M-%S"), ext);
    let path = vault.join("Pics").join(&name);
    ensure_inside(vault, &path)?;
    fs::create_dir_all(vault.join("Pics"))?;
    fs::write(&path, bytes)?;
    Ok(name)
}

pub(crate) fn mark_todo_content(content: &str, index: usize) -> Option<String> {
    let mut checkbox_index = 0;
    let mut changed = false;
    let mut lines = Vec::new();

    for line in content.lines() {
        if line.contains("[ ]") || line.contains("[x]") || line.contains("[X]") {
            if checkbox_index == index && line.contains("[ ]") {
                lines.push(line.replacen("[ ]", "[x]", 1));
                changed = true;
            } else {
                lines.push(line.to_string());
            }
            checkbox_index += 1;
        } else {
            lines.push(line.to_string());
        }
    }

    changed.then(|| lines.join("\n"))
}

pub(crate) fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub(crate) fn escape_html_attr(value: &str) -> String {
    escape_html(value).replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use std::{
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };

    use super::*;

    static NEXT_DIR: AtomicUsize = AtomicUsize::new(0);

    struct TestVault {
        path: PathBuf,
    }

    impl TestVault {
        fn new() -> Self {
            let id = NEXT_DIR.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!("obr-test-{}-{id}", std::process::id()));
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        fn write(&self, rel: &str, content: &str) {
            let path = self.path.join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }

        fn rel(&self, path: &Path) -> String {
            rel_to_vault(&self.path, path).unwrap()
        }
    }

    impl Drop for TestVault {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn normalize_markdown_rel_cleans_safe_paths() {
        assert_eq!(
            normalize_markdown_rel(" Daily/today ", true).unwrap(),
            PathBuf::from("Daily/today.md")
        );
        assert_eq!(
            normalize_markdown_rel("/Life/note.md", true).unwrap(),
            PathBuf::from("Life/note.md")
        );
        assert_eq!(
            normalize_markdown_rel("Life/./note", true).unwrap(),
            PathBuf::from("Life/note.md")
        );
    }

    #[test]
    fn normalize_markdown_rel_rejects_escaping_paths() {
        assert!(normalize_markdown_rel("../secret", true).is_err());
        assert!(normalize_markdown_rel("Life/../secret", true).is_err());
        assert!(normalize_markdown_rel("a\0b", true).is_err());
    }

    #[test]
    fn normalize_rel_path_allows_safe_static_paths() {
        assert_eq!(
            normalize_rel_path("nested/photo.png").unwrap(),
            PathBuf::from("nested/photo.png")
        );
    }

    #[test]
    fn normalize_rel_path_rejects_static_path_escape() {
        assert!(normalize_rel_path("../secret.png").is_err());
        assert!(normalize_rel_path("nested/../../secret.png").is_err());
        assert!(normalize_rel_path("nested\0secret.png").is_err());
    }

    #[test]
    fn resolve_markdown_request_matches_bare_filename_inside_vault() {
        let vault = TestVault::new();
        vault.write("Life/page.md", "nested");

        let path = resolve_markdown_request(&vault.path, "page").unwrap();

        assert_eq!(vault.rel(&path), "Life/page.md");
    }

    #[test]
    fn search_markdown_ranks_filename_matches_before_content_matches() {
        let vault = TestVault::new();
        vault.write("Alpha.md", "nothing here");
        vault.write("Beta.md", "alpha appears in content");

        let hits = search_markdown(&vault.path, "alpha").unwrap();
        let rels = hits.iter().map(|path| vault.rel(path)).collect::<Vec<_>>();

        assert_eq!(rels, vec!["Alpha.md", "Beta.md"]);
    }

    #[test]
    fn search_markdown_empty_keyword_caps_recent_results() {
        let vault = TestVault::new();
        for i in 0..25 {
            vault.write(&format!("notes/{i:02}.md"), "body");
        }

        let hits = search_markdown(&vault.path, "").unwrap();

        assert_eq!(hits.len(), 20);
    }

    #[test]
    fn mark_todo_content_marks_requested_unchecked_box() {
        let content = "- [ ] first\n- [x] second\n- [ ] third";

        let updated = mark_todo_content(content, 2).unwrap();

        assert_eq!(updated, "- [ ] first\n- [x] second\n- [x] third");
    }

    #[test]
    fn mark_todo_content_returns_none_for_checked_or_missing_task() {
        let content = "- [ ] first\n- [x] second";

        assert!(mark_todo_content(content, 1).is_none());
        assert!(mark_todo_content(content, 4).is_none());
    }

    #[test]
    fn ensure_inside_rejects_paths_outside_vault() {
        let vault = TestVault::new();
        let outside = vault.path.parent().unwrap().join("outside.md");

        assert!(ensure_inside(&vault.path, &outside).is_err());
    }

    #[test]
    fn escape_html_attr_escapes_text_and_attribute_delimiters() {
        assert_eq!(
            escape_html_attr("<tag a='b' \"c\">"),
            "&lt;tag a=&#39;b&#39; &quot;c&quot;&gt;"
        );
    }
}
