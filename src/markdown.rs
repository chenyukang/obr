use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
};

use anyhow::{Context, Result, anyhow, bail};
use base64::{Engine, engine::general_purpose::STANDARD};
use chrono::Local;
use uuid::Uuid;
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
    let canonical_vault = vault
        .canonicalize()
        .with_context(|| format!("resolve root {}", vault.display()))?;
    let candidate = canonical_candidate(path)?;
    if candidate.starts_with(&canonical_vault) {
        Ok(())
    } else {
        bail!("path escapes vault: {}", path.display())
    }
}

fn canonical_candidate(path: &Path) -> Result<PathBuf> {
    match fs::symlink_metadata(path) {
        Ok(_) => {
            return path
                .canonicalize()
                .with_context(|| format!("resolve path {}", path.display()));
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(err).with_context(|| format!("inspect path {}", path.display())),
    }

    let parent = path.parent().ok_or_else(|| anyhow!("path has no parent"))?;
    let mut existing = parent;
    loop {
        match fs::symlink_metadata(existing) {
            Ok(_) => break,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                existing = existing
                    .parent()
                    .ok_or_else(|| anyhow!("no existing parent for {}", path.display()))?;
            }
            Err(err) => {
                return Err(err).with_context(|| format!("inspect path {}", existing.display()));
            }
        }
    }

    let remainder = path
        .strip_prefix(existing)
        .with_context(|| format!("resolve path remainder {}", path.display()))?;
    for component in remainder.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir => bail!("parent path components are not allowed"),
            _ => bail!("unsupported path component"),
        }
    }
    Ok(existing
        .canonicalize()
        .with_context(|| format!("resolve parent {}", existing.display()))?
        .join(remainder))
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
    fs::create_dir_all(vault.join("Pics"))?;
    for _ in 0..16 {
        let suffix = Uuid::new_v4().simple().to_string();
        let name = format!(
            "obr-{}-{}.{}",
            now.format("%Y-%m-%d-%H-%M-%S"),
            &suffix[..4],
            ext
        );
        let path = vault.join("Pics").join(&name);
        ensure_inside(vault, &path)?;
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                file.write_all(&bytes)?;
                return Ok(name);
            }
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(err) => return Err(err).with_context(|| format!("write {}", path.display())),
        }
    }
    bail!("could not allocate unique image filename")
}

pub(crate) fn auto_link_note_titles(vault: &Path, text: &str) -> Result<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    let mut titles = HashSet::new();
    for entry in markdown_entries(vault) {
        let entry = entry?;
        if let Some(stem) = entry.path().file_stem().and_then(|stem| stem.to_str()) {
            let title = stem.trim();
            if !title.is_empty() {
                titles.insert(title.to_string());
            }
        }
    }

    let mut titles = titles.into_iter().collect::<Vec<_>>();
    titles.sort_by(|a, b| b.len().cmp(&a.len()).then_with(|| a.cmp(b)));

    let mut linked = trimmed.to_string();
    for title in titles {
        linked = link_title_outside_wiki_links(&linked, &title);
    }
    Ok(linked)
}

fn link_title_outside_wiki_links(text: &str, title: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut rest = text;

    while let Some(start) = rest.find("[[") {
        let before = &rest[..start];
        output.push_str(&replace_title_in_plain_segment(before, title));
        if let Some(end) = rest[start + 2..].find("]]") {
            let wiki_end = start + 2 + end + 2;
            output.push_str(&rest[start..wiki_end]);
            rest = &rest[wiki_end..];
        } else {
            output.push_str(&rest[start..]);
            return output;
        }
    }

    output.push_str(&replace_title_in_plain_segment(rest, title));
    output
}

fn replace_title_in_plain_segment(segment: &str, title: &str) -> String {
    let mut output = String::with_capacity(segment.len());
    let mut rest = segment;

    while let Some(index) = rest.find(title) {
        output.push_str(&rest[..index]);
        output.push_str("[[");
        output.push_str(title);
        output.push_str("]]");
        rest = &rest[index + title.len()..];
    }

    output.push_str(rest);
    output
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
    fn normalize_rel_path_allows_safe_relative_paths() {
        assert_eq!(
            normalize_rel_path("nested/photo.png").unwrap(),
            PathBuf::from("nested/photo.png")
        );
    }

    #[test]
    fn normalize_rel_path_rejects_relative_path_escape() {
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
    fn auto_link_note_titles_links_existing_note_names() {
        let vault = TestVault::new();
        vault.write("People/可可.md", "");
        vault.write("People/可.md", "");

        let linked = auto_link_note_titles(&vault.path, "可可睡觉了").unwrap();

        assert_eq!(linked, "[[可可]]睡觉了");
    }

    #[test]
    fn auto_link_note_titles_skips_existing_wiki_links() {
        let vault = TestVault::new();
        vault.write("People/可可.md", "");

        let linked = auto_link_note_titles(&vault.path, "[[可可]]睡觉了，可可很乖").unwrap();

        assert_eq!(linked, "[[可可]]睡觉了，[[可可]]很乖");
    }

    #[test]
    fn ensure_inside_rejects_paths_outside_vault() {
        let vault = TestVault::new();
        let outside = vault.path.parent().unwrap().join("outside.md");

        assert!(ensure_inside(&vault.path, &outside).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn ensure_inside_rejects_file_symlink_to_outside_vault() {
        use std::os::unix::fs::symlink;

        let vault = TestVault::new();
        let outside = vault.path.with_extension("outside.md");
        fs::write(&outside, "secret").unwrap();
        let link = vault.path.join("leak.md");
        symlink(&outside, &link).unwrap();

        assert!(ensure_inside(&vault.path, &link).is_err());

        let _ = fs::remove_file(outside);
    }

    #[cfg(unix)]
    #[test]
    fn ensure_inside_rejects_broken_file_symlink() {
        use std::os::unix::fs::symlink;

        let vault = TestVault::new();
        let outside = vault.path.with_extension("missing.md");
        let link = vault.path.join("broken.md");
        symlink(&outside, &link).unwrap();

        assert!(ensure_inside(&vault.path, &link).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn ensure_inside_rejects_new_file_under_symlinked_parent() {
        use std::os::unix::fs::symlink;

        let vault = TestVault::new();
        let outside_dir = vault.path.with_extension("outside-dir");
        fs::create_dir_all(&outside_dir).unwrap();
        let link = vault.path.join("Linked");
        symlink(&outside_dir, &link).unwrap();

        assert!(ensure_inside(&vault.path, &link.join("note.md")).is_err());

        let _ = fs::remove_dir_all(outside_dir);
    }

    #[test]
    fn escape_html_attr_escapes_text_and_attribute_delimiters() {
        assert_eq!(
            escape_html_attr("<tag a='b' \"c\">"),
            "&lt;tag a=&#39;b&#39; &quot;c&quot;&gt;"
        );
    }
}
