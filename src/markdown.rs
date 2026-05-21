use std::{
    collections::{HashMap, HashSet},
    fmt::Write as FmtWrite,
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    sync::{Arc, RwLock},
    time::UNIX_EPOCH,
};

use anyhow::{Context, Result, anyhow, bail};
use base64::{Engine, engine::general_purpose::STANDARD};
use chrono::Local;
use notify::{
    Config as NotifyConfig, Event as NotifyEvent, RecommendedWatcher, RecursiveMode, Watcher,
};
use pulldown_cmark::{Event, Options, Parser, html};
use uuid::Uuid;
use walkdir::{DirEntry, WalkDir};
use yaml_serde::Value as YamlValue;

#[derive(Debug)]
struct SearchHit {
    rank: u8,
    modified: u64,
    path: PathBuf,
}

const RECENT_SEARCH_LIMIT: usize = 20;
const SEARCH_PAGE_SIZE: usize = 50;

#[derive(Clone, Debug)]
struct CachedMarkdown {
    content: String,
    content_lower: String,
    display_rel_lower: String,
    modified: u128,
    len: u64,
}

#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct MarkdownIndexStats {
    pub(crate) files: usize,
    pub(crate) content_bytes: usize,
}

#[derive(Debug)]
pub(crate) struct MarkdownSearchResults {
    pub(crate) paths: Vec<PathBuf>,
    pub(crate) total_matches: usize,
    pub(crate) offset: usize,
    pub(crate) limit: usize,
}

pub(crate) struct MarkdownIndex {
    vault: PathBuf,
    entries: Arc<RwLock<HashMap<PathBuf, CachedMarkdown>>>,
    _watcher: RecommendedWatcher,
}

impl MarkdownIndex {
    pub(crate) fn load(vault: PathBuf) -> Result<Self> {
        let vault = vault
            .canonicalize()
            .with_context(|| format!("resolve markdown vault {}", vault.display()))?;
        let entries = Arc::new(RwLock::new(HashMap::new()));
        load_all_markdown(&vault, &entries)?;
        let watcher = watch_markdown_vault(vault.clone(), Arc::clone(&entries))?;
        Ok(Self {
            vault,
            entries,
            _watcher: watcher,
        })
    }

    pub(crate) fn stats(&self) -> MarkdownIndexStats {
        let entries = self.entries.read().expect("markdown index poisoned");
        MarkdownIndexStats {
            files: entries.len(),
            content_bytes: entries.values().map(|entry| entry.content.len()).sum(),
        }
    }

    pub(crate) fn search_page(&self, keyword: &str, page: usize) -> Result<MarkdownSearchResults> {
        let keyword = keyword.trim();
        let needle = keyword.to_lowercase();
        let entries = self.entries.read().expect("markdown index poisoned");
        let mut hits = Vec::new();

        for (path, entry) in entries.iter() {
            let path_matches = entry.display_rel_lower.contains(&needle);
            let content_matches = !keyword.is_empty() && entry.content_lower.contains(&needle);

            if keyword.is_empty() || path_matches || content_matches {
                hits.push(SearchHit {
                    rank: if !keyword.is_empty() && path_matches {
                        0
                    } else {
                        1
                    },
                    modified: (entry.modified / 1_000_000_000) as u64,
                    path: path.clone(),
                });
            }
        }

        sort_search_hits(&mut hits);
        let total_matches = hits.len();
        let (offset, limit) = search_page_window(keyword, page);
        Ok(MarkdownSearchResults {
            paths: hits
                .into_iter()
                .skip(offset)
                .take(limit)
                .map(|hit| hit.path)
                .collect(),
            total_matches,
            offset,
            limit,
        })
    }

    pub(crate) fn random_file(&self) -> Result<Option<PathBuf>> {
        let entries = self.entries.read().expect("markdown index poisoned");
        if entries.is_empty() {
            return Ok(None);
        }
        let mut paths = entries.keys().cloned().collect::<Vec<_>>();
        paths.sort_by_key(|path| rel_to_vault(&self.vault, path).unwrap_or_default());
        let nanos = Local::now()
            .timestamp_nanos_opt()
            .unwrap_or_default()
            .unsigned_abs() as usize;
        Ok(paths.get(nanos % paths.len()).cloned())
    }

    pub(crate) fn resolve_request(&self, input: &str) -> Result<PathBuf> {
        let rel = normalize_markdown_rel(input, true)?;
        let requested = self.vault.join(&rel);
        if self
            .entries
            .read()
            .expect("markdown index poisoned")
            .contains_key(&requested)
        {
            return Ok(requested);
        }
        if requested.exists() {
            return requested
                .canonicalize()
                .with_context(|| format!("resolve markdown path {}", requested.display()));
        }

        if rel.components().count() == 1 {
            let file_name = rel
                .file_name()
                .ok_or_else(|| anyhow!("path has no file name"))?;
            let entries = self.entries.read().expect("markdown index poisoned");
            let mut matches = entries
                .keys()
                .filter(|path| path.file_name() == Some(file_name))
                .cloned()
                .collect::<Vec<_>>();
            matches.sort_by_key(|path| rel_to_vault(&self.vault, path).unwrap_or_default());
            if let Some(path) = matches.into_iter().next() {
                return Ok(path);
            }
        }

        Ok(requested)
    }

    pub(crate) fn read_path(&self, path: &Path) -> Result<Option<String>> {
        let path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        Ok(self
            .entries
            .read()
            .expect("markdown index poisoned")
            .get(&path)
            .map(|entry| entry.content.clone()))
    }

    pub(crate) fn update_path(&self, path: &Path, content: String) -> Result<()> {
        let path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let metadata = fs::metadata(&path).with_context(|| format!("stat {}", path.display()))?;
        if !metadata.is_file() || !is_indexable_markdown_path(&path) {
            return Ok(());
        }
        self.entries
            .write()
            .expect("markdown index poisoned")
            .insert(
                path.clone(),
                cached_markdown(&self.vault, &path, &metadata, content)?,
            );
        Ok(())
    }
}

fn load_all_markdown(
    vault: &Path,
    entries: &Arc<RwLock<HashMap<PathBuf, CachedMarkdown>>>,
) -> Result<()> {
    let mut loaded = HashMap::new();
    for entry in markdown_entries(vault) {
        let entry = entry?;
        let path = entry.path().to_path_buf();
        let metadata = entry
            .metadata()
            .with_context(|| format!("stat {}", path.display()))?;
        let content = fs::read_to_string(&path)
            .with_context(|| format!("read markdown index entry {}", path.display()))?;
        loaded.insert(
            path.clone(),
            cached_markdown(vault, &path, &metadata, content)?,
        );
    }
    *entries.write().expect("markdown index poisoned") = loaded;
    Ok(())
}

fn watch_markdown_vault(
    vault: PathBuf,
    entries: Arc<RwLock<HashMap<PathBuf, CachedMarkdown>>>,
) -> Result<RecommendedWatcher> {
    let callback_vault = vault.clone();
    let mut watcher = RecommendedWatcher::new(
        move |event: notify::Result<NotifyEvent>| match event {
            Ok(event) => update_index_from_event(&callback_vault, &entries, event),
            Err(err) => tracing::warn!("markdown index watcher error: {err}"),
        },
        NotifyConfig::default(),
    )
    .context("create markdown index watcher")?;
    watcher
        .watch(&vault, RecursiveMode::Recursive)
        .with_context(|| format!("watch markdown vault {}", vault.display()))?;
    Ok(watcher)
}

fn update_index_from_event(
    vault: &Path,
    entries: &Arc<RwLock<HashMap<PathBuf, CachedMarkdown>>>,
    event: NotifyEvent,
) {
    for path in event.paths {
        if !path.starts_with(vault) || path_has_hidden_component(vault, &path) {
            continue;
        }
        if let Err(err) = refresh_event_path(vault, entries, &path) {
            tracing::warn!(path = %path.display(), "refresh markdown index from watcher failed: {err}");
        }
    }
}

fn refresh_event_path(
    vault: &Path,
    entries: &Arc<RwLock<HashMap<PathBuf, CachedMarkdown>>>,
    path: &Path,
) -> Result<()> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            remove_path_or_children(entries, path);
            return Ok(());
        }
        Err(err) => return Err(err).with_context(|| format!("stat {}", path.display())),
    };

    if metadata.is_dir() {
        return Ok(());
    }
    if !metadata.is_file() || !is_indexable_markdown_path(path) {
        remove_path_or_children(entries, path);
        return Ok(());
    }

    let modified = metadata_modified_nanos(&metadata);
    let len = metadata.len();
    let stale = entries
        .read()
        .expect("markdown index poisoned")
        .get(path)
        .map(|entry| entry.modified != modified || entry.len != len)
        .unwrap_or(true);
    if stale {
        let content = fs::read_to_string(path)
            .with_context(|| format!("read markdown index entry {}", path.display()))?;
        entries.write().expect("markdown index poisoned").insert(
            path.to_path_buf(),
            cached_markdown(vault, path, &metadata, content)?,
        );
    }
    Ok(())
}

fn cached_markdown(
    vault: &Path,
    path: &Path,
    metadata: &fs::Metadata,
    content: String,
) -> Result<CachedMarkdown> {
    let rel = rel_to_vault(vault, path)?;
    let display_rel = rel.strip_suffix(".md").unwrap_or(&rel).to_string();
    Ok(CachedMarkdown {
        content_lower: content.to_lowercase(),
        display_rel_lower: display_rel.to_lowercase(),
        content,
        modified: metadata_modified_nanos(metadata),
        len: metadata.len(),
    })
}

fn remove_path_or_children(entries: &Arc<RwLock<HashMap<PathBuf, CachedMarkdown>>>, path: &Path) {
    entries
        .write()
        .expect("markdown index poisoned")
        .retain(|entry_path, _| entry_path != path && !entry_path.starts_with(path));
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str()) == Some("md")
}

fn is_indexable_markdown_path(path: &Path) -> bool {
    is_markdown_path(path) && !path.components().any(|component| {
        matches!(component, Component::Normal(part) if part.to_str().map(|name| name.starts_with('.')).unwrap_or(false))
    })
}

fn path_has_hidden_component(vault: &Path, path: &Path) -> bool {
    let rel = path.strip_prefix(vault).unwrap_or(path);
    rel.components().any(|component| {
        matches!(component, Component::Normal(part) if part.to_str().map(|name| name.starts_with('.')).unwrap_or(false))
    })
}

fn metadata_modified_nanos(metadata: &fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
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

#[cfg(test)]
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

    sort_search_hits(&mut hits);
    let (_, limit) = search_page_window(keyword, 0);
    Ok(hits.into_iter().take(limit).map(|hit| hit.path).collect())
}

fn search_page_window(keyword: &str, page: usize) -> (usize, usize) {
    if keyword.trim().is_empty() {
        (
            page.saturating_mul(RECENT_SEARCH_LIMIT),
            RECENT_SEARCH_LIMIT,
        )
    } else {
        (page.saturating_mul(SEARCH_PAGE_SIZE), SEARCH_PAGE_SIZE)
    }
}

#[cfg(test)]
fn modified_secs(entry: &DirEntry) -> u64 {
    entry
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or_default()
}

fn sort_search_hits(hits: &mut [SearchHit]) {
    hits.sort_by(|a, b| {
        a.rank
            .cmp(&b.rank)
            .then_with(|| b.modified.cmp(&a.modified))
            .then_with(|| a.path.cmp(&b.path))
    });
}

#[cfg(test)]
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

pub(crate) fn render_markdown_html(raw: &str) -> String {
    let (frontmatter, body) = split_frontmatter(raw)
        .map(|(frontmatter, body)| (Some(frontmatter), body))
        .unwrap_or((None, raw));
    let preprocessed = preprocess_obsidian_refs(body);
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_FOOTNOTES);

    let parser = Parser::new_ext(&preprocessed, options);
    let mut events = Vec::new();
    let mut task_index = 0usize;

    for event in parser.map(Event::into_static) {
        match event {
            Event::TaskListMarker(checked) => {
                let checked_attr = if checked { " checked disabled" } else { "" };
                events.push(Event::Html(
                    format!(
                        r#"<input type="checkbox" data-task-index="{task_index}"{checked_attr}>"#
                    )
                    .into(),
                ));
                task_index += 1;
            }
            Event::SoftBreak => events.push(Event::Html("<br>\n".into())),
            other => events.push(other),
        }
    }

    let mut rendered = String::new();
    html::push_html(&mut rendered, events.into_iter());
    let mut output = String::new();
    if let Some(frontmatter) = frontmatter {
        output.push_str(&render_frontmatter_panel(frontmatter));
    }
    output.push_str(&sanitize_rendered_html(&rendered));
    output
}

fn split_frontmatter(raw: &str) -> Option<(&str, &str)> {
    let mut offset = 0usize;
    let first_line = raw.split_inclusive('\n').next()?;
    let (first_body, _) = split_line_ending(first_line);
    if first_body.trim() != "---" {
        return None;
    }

    offset += first_line.len();
    let frontmatter_start = offset;
    for line in raw[offset..].split_inclusive('\n') {
        let (body, _) = split_line_ending(line);
        let marker = body.trim_end();
        if marker == "---" || marker == "..." {
            let frontmatter = &raw[frontmatter_start..offset];
            let content = &raw[offset + line.len()..];
            return Some((frontmatter, content));
        }
        offset += line.len();
    }

    None
}

fn render_frontmatter_panel(frontmatter: &str) -> String {
    match yaml_serde::from_str::<YamlValue>(frontmatter) {
        Ok(YamlValue::Mapping(mapping)) => render_frontmatter_mapping(&mapping),
        _ => render_raw_frontmatter(frontmatter),
    }
}

fn render_frontmatter_mapping(mapping: &yaml_serde::Mapping) -> String {
    if mapping.is_empty() {
        return String::new();
    }

    let mut html = String::new();
    let _ = write!(
        html,
        r#"<details class="metadata-panel"><summary><span>Properties</span><span class="metadata-count">{} {}</span></summary><dl class="metadata-list">"#,
        mapping.len(),
        if mapping.len() == 1 { "item" } else { "items" }
    );
    for (key, value) in mapping {
        let key = yaml_value_plain_text(key);
        let _ = write!(
            html,
            r#"<dt class="metadata-key">{}</dt><dd class="metadata-value">{}</dd>"#,
            escape_html(&key),
            render_property_value(value)
        );
    }
    html.push_str("</dl></details>");
    html
}

fn render_raw_frontmatter(frontmatter: &str) -> String {
    format!(
        r#"<details class="metadata-panel"><summary><span>Properties</span><span class="metadata-count">raw</span></summary><pre class="metadata-raw"><code>{}</code></pre></details>"#,
        escape_html(frontmatter.trim())
    )
}

fn render_property_value(value: &YamlValue) -> String {
    match value {
        YamlValue::Null => r#"<span class="metadata-empty">empty</span>"#.to_string(),
        YamlValue::Bool(value) => escape_html(&value.to_string()),
        YamlValue::Number(value) => escape_html(&value.to_string()),
        YamlValue::String(value) => render_property_scalar(value),
        YamlValue::Sequence(values) => render_property_sequence(values),
        YamlValue::Mapping(_) => render_property_code(value),
        YamlValue::Tagged(tagged) => render_property_value(&tagged.value),
    }
}

fn render_property_scalar(value: &str) -> String {
    if value.trim().is_empty() {
        return r#"<span class="metadata-empty">empty</span>"#.to_string();
    }
    if is_http_url(value) {
        return format!(
            r#"<a href="{}" target="_blank" rel="noreferrer">{}</a>"#,
            escape_html_attr(value),
            escape_html(value)
        );
    }
    escape_html(value)
}

fn render_property_sequence(values: &[YamlValue]) -> String {
    if values.is_empty() {
        return r#"<span class="metadata-empty">empty</span>"#.to_string();
    }
    if values.iter().all(is_scalar_yaml_value) {
        let mut html = String::from(r#"<span class="metadata-chips">"#);
        for value in values {
            let text = yaml_value_plain_text(value);
            let _ = write!(
                html,
                r#"<span class="metadata-chip">{}</span>"#,
                escape_html(&text)
            );
        }
        html.push_str("</span>");
        return html;
    }
    render_property_code(&YamlValue::Sequence(values.to_vec()))
}

fn render_property_code(value: &YamlValue) -> String {
    let serialized = yaml_serde::to_string(value)
        .unwrap_or_else(|_| yaml_value_plain_text(value))
        .trim()
        .trim_start_matches("---\n")
        .trim()
        .to_string();
    format!(
        r#"<pre class="metadata-raw"><code>{}</code></pre>"#,
        escape_html(&serialized)
    )
}

fn is_scalar_yaml_value(value: &YamlValue) -> bool {
    matches!(
        value,
        YamlValue::Null | YamlValue::Bool(_) | YamlValue::Number(_) | YamlValue::String(_)
    )
}

fn yaml_value_plain_text(value: &YamlValue) -> String {
    match value {
        YamlValue::Null => String::new(),
        YamlValue::Bool(value) => value.to_string(),
        YamlValue::Number(value) => value.to_string(),
        YamlValue::String(value) => value.clone(),
        YamlValue::Sequence(values) => values
            .iter()
            .map(yaml_value_plain_text)
            .collect::<Vec<_>>()
            .join(", "),
        YamlValue::Mapping(_) => yaml_serde::to_string(value).unwrap_or_default(),
        YamlValue::Tagged(tagged) => yaml_value_plain_text(&tagged.value),
    }
}

fn is_http_url(value: &str) -> bool {
    value.starts_with("https://") || value.starts_with("http://")
}

fn preprocess_obsidian_refs(raw: &str) -> String {
    let mut output = String::with_capacity(raw.len());
    let mut in_fenced_code = false;

    for line in raw.split_inclusive('\n') {
        let (body, ending) = split_line_ending(line);
        if body.trim_start().starts_with("```") {
            output.push_str(body);
            output.push_str(ending);
            in_fenced_code = !in_fenced_code;
        } else if in_fenced_code {
            output.push_str(line);
        } else {
            output.push_str(&replace_obsidian_refs_in_line(body));
            output.push_str(ending);
        }
    }

    output
}

fn obsidian_link_html(raw: &str) -> String {
    let (target, label) = split_obsidian_target(raw);
    if target.is_empty() {
        return escape_html(raw);
    }
    let text = label
        .filter(|label| !label.is_empty())
        .unwrap_or_else(|| target.split('#').next().unwrap_or(target).trim());
    format!(
        r##"<a href="#" data-page="{}">{}</a>"##,
        escape_html_attr(target),
        escape_html(text)
    )
}

fn obsidian_embed_html(raw: &str) -> String {
    let (target, size) = split_obsidian_target(raw);
    if target.is_empty() {
        return escape_html(raw);
    }

    let src = format!("/assets/images/{}", percent_encode_path(target));
    if is_pdf_embed_target(target) {
        return format!(
            r#"<div class="pdf-embed"><div class="pdf-icon" aria-hidden="true">PDF</div><div class="pdf-meta"><strong>{}</strong><span>Preview may be blocked by mobile WebViews.</span></div><a class="pdf-link" href="{}" target="_blank">Open PDF</a></div>"#,
            escape_html(target),
            escape_html_attr(&src)
        );
    }

    let mut attrs = String::new();
    if let Some(size) = size {
        let (width, height) = split_embed_size(size);
        if let Some(width) = width {
            let _ = write!(attrs, r#" width="{width}""#);
        }
        if let Some(height) = height {
            let _ = write!(attrs, r#" height="{height}""#);
        }
    }

    format!(
        r#"<img src="{}" alt="{}" loading="lazy" decoding="async"{}>"#,
        escape_html_attr(&src),
        escape_html_attr(target),
        attrs
    )
}

fn is_pdf_embed_target(target: &str) -> bool {
    target
        .split('#')
        .next()
        .unwrap_or(target)
        .rsplit('.')
        .next()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
}

fn split_obsidian_target(raw: &str) -> (&str, Option<&str>) {
    let mut parts = raw.splitn(2, '|');
    let target = parts.next().unwrap_or_default().trim();
    let label = parts.next().map(str::trim);
    (target, label)
}

fn split_embed_size(size: &str) -> (Option<u32>, Option<u32>) {
    let mut parts = size.split(['x', 'X']);
    let width = parts.next().and_then(parse_dimension);
    let height = parts.next().and_then(parse_dimension);
    (width, height)
}

fn parse_dimension(value: &str) -> Option<u32> {
    let value = value.trim();
    (!value.is_empty() && value.chars().all(|ch| ch.is_ascii_digit()))
        .then(|| value.parse().ok())
        .flatten()
}

fn percent_encode_path(path: &str) -> String {
    path.split('/')
        .map(percent_encode_segment)
        .collect::<Vec<_>>()
        .join("/")
}

fn percent_encode_segment(segment: &str) -> String {
    let mut encoded = String::new();
    for byte in segment.bytes() {
        if matches!(
            byte,
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~'
        ) {
            encoded.push(byte as char);
        } else {
            let _ = write!(encoded, "%{byte:02X}");
        }
    }
    encoded
}

fn sanitize_rendered_html(rendered: &str) -> String {
    let mut cleaner = ammonia::Builder::new();
    cleaner
        .add_tags(&["input"])
        .add_tag_attributes("a", &["class", "data-page", "target"])
        .add_tag_attributes("div", &["class", "aria-hidden"])
        .add_tag_attributes("span", &["class"])
        .add_tag_attributes("img", &["loading", "decoding"])
        .add_tag_attributes("input", &["type", "checked", "disabled", "data-task-index"])
        .set_tag_attribute_value("img", "loading", "lazy")
        .set_tag_attribute_value("img", "decoding", "async");
    cleaner.clean(rendered).to_string()
}

fn split_line_ending(line: &str) -> (&str, &str) {
    if let Some(body) = line.strip_suffix("\r\n") {
        (body, "\r\n")
    } else if let Some(body) = line.strip_suffix('\n') {
        (body, "\n")
    } else {
        (line, "")
    }
}

fn replace_obsidian_refs_in_line(line: &str) -> String {
    let mut output = String::with_capacity(line.len());
    let mut index = 0;

    while index < line.len() {
        let rest = &line[index..];
        if rest.starts_with('`') {
            let end = inline_code_span_end(rest);
            output.push_str(&rest[..end]);
            index += end;
        } else if rest.starts_with("![[") || rest.starts_with("[[") {
            let is_embed = rest.starts_with("![[");
            let body_start = if is_embed { 3 } else { 2 };
            if let Some(close) = rest[body_start..].find("]]") {
                let body_end = body_start + close;
                let body = &rest[body_start..body_end];
                output.push_str(&if is_embed {
                    obsidian_embed_html(body)
                } else {
                    obsidian_link_html(body)
                });
                index += body_end + 2;
            } else {
                output.push_str(rest);
                break;
            }
        } else if let Some(ch) = rest.chars().next() {
            output.push(ch);
            index += ch.len_utf8();
        } else {
            break;
        }
    }

    output
}

fn inline_code_span_end(rest: &str) -> usize {
    let delimiter_len = rest.bytes().take_while(|byte| *byte == b'`').count();
    let delimiter = &rest[..delimiter_len];
    rest[delimiter_len..]
        .find(delimiter)
        .map(|end| delimiter_len + end + delimiter_len)
        .unwrap_or(delimiter_len)
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
        time::{Duration, Instant},
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
            let vault = self.path.canonicalize().unwrap();
            let path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
            rel_to_vault(&vault, &path).unwrap()
        }
    }

    impl Drop for TestVault {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn wait_until(mut predicate: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if predicate() {
                return;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        assert!(predicate(), "condition was not met before timeout");
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
    fn search_markdown_non_empty_keyword_caps_broad_results() {
        let vault = TestVault::new();
        for i in 0..(SEARCH_PAGE_SIZE + 5) {
            vault.write(&format!("notes/{i:03}.md"), "common body");
        }

        let hits = search_markdown(&vault.path, "common").unwrap();

        assert_eq!(hits.len(), SEARCH_PAGE_SIZE);
    }

    #[test]
    fn markdown_index_search_uses_cached_content_and_watcher_updates_external_changes() {
        let vault = TestVault::new();
        vault.write("Alpha.md", "first version");
        let index = MarkdownIndex::load(vault.path.clone()).unwrap();

        assert_eq!(index.stats().files, 1);
        let hits = index.search_page("first", 0).unwrap().paths;
        assert_eq!(
            hits.iter().map(|path| vault.rel(path)).collect::<Vec<_>>(),
            vec!["Alpha.md"]
        );

        vault.write("Alpha.md", "second external version");
        wait_until(|| index.search_page("second", 0).unwrap().paths.len() == 1);
        let hits = index.search_page("second", 0).unwrap().paths;

        assert_eq!(
            hits.iter().map(|path| vault.rel(path)).collect::<Vec<_>>(),
            vec!["Alpha.md"]
        );
    }

    #[test]
    fn markdown_index_update_path_refreshes_written_content() {
        let vault = TestVault::new();
        vault.write("Note.md", "old content");
        let index = MarkdownIndex::load(vault.path.clone()).unwrap();
        let path = vault.path.join("Note.md");

        fs::write(&path, "new content").unwrap();
        index.update_path(&path, "new content".to_string()).unwrap();

        assert_eq!(
            index.read_path(&path).unwrap().as_deref(),
            Some("new content")
        );
        assert_eq!(index.search_page("new", 0).unwrap().paths.len(), 1);
    }

    #[test]
    fn markdown_index_search_reports_total_matches_when_limited() {
        let vault = TestVault::new();
        for i in 0..(SEARCH_PAGE_SIZE + 3) {
            vault.write(&format!("notes/{i:03}.md"), "shared needle");
        }
        let index = MarkdownIndex::load(vault.path.clone()).unwrap();

        let results = index.search_page("needle", 0).unwrap();

        assert_eq!(results.paths.len(), SEARCH_PAGE_SIZE);
        assert_eq!(results.total_matches, SEARCH_PAGE_SIZE + 3);
        assert_eq!(results.offset, 0);
        assert_eq!(results.limit, SEARCH_PAGE_SIZE);
    }

    #[test]
    fn markdown_index_search_can_page_broad_results() {
        let vault = TestVault::new();
        for i in 0..(SEARCH_PAGE_SIZE + 3) {
            vault.write(&format!("notes/{i:03}.md"), "shared needle");
        }
        let index = MarkdownIndex::load(vault.path.clone()).unwrap();

        let results = index.search_page("needle", 1).unwrap();

        assert_eq!(results.paths.len(), 3);
        assert_eq!(results.total_matches, SEARCH_PAGE_SIZE + 3);
        assert_eq!(results.offset, SEARCH_PAGE_SIZE);
        assert_eq!(results.limit, SEARCH_PAGE_SIZE);
    }

    #[test]
    fn markdown_index_empty_search_can_page_recent_results() {
        let vault = TestVault::new();
        for i in 0..(RECENT_SEARCH_LIMIT + 3) {
            vault.write(&format!("notes/{i:03}.md"), "recent note");
        }
        let index = MarkdownIndex::load(vault.path.clone()).unwrap();

        let first_page = index.search_page("", 0).unwrap();
        let second_page = index.search_page("", 1).unwrap();

        assert_eq!(first_page.paths.len(), RECENT_SEARCH_LIMIT);
        assert_eq!(first_page.total_matches, RECENT_SEARCH_LIMIT + 3);
        assert_eq!(first_page.offset, 0);
        assert_eq!(first_page.limit, RECENT_SEARCH_LIMIT);
        assert_eq!(second_page.paths.len(), 3);
        assert_eq!(second_page.total_matches, RECENT_SEARCH_LIMIT + 3);
        assert_eq!(second_page.offset, RECENT_SEARCH_LIMIT);
        assert_eq!(second_page.limit, RECENT_SEARCH_LIMIT);
        assert!(
            first_page
                .paths
                .iter()
                .all(|path| !second_page.paths.contains(path))
        );
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

    #[test]
    fn render_markdown_html_handles_obsidian_links_and_embeds() {
        let rendered = render_markdown_html("[[People/可可|可可]]\n\n![[hello world.jpg|250]]");

        assert!(rendered.contains(r##"href="#"##));
        assert!(rendered.contains(r#"data-page="People/可可""#));
        assert!(rendered.contains(">可可</a>"));
        assert!(rendered.contains(r#"<img src="/assets/images/hello%20world.jpg""#));
        assert!(rendered.contains(r#"loading="lazy""#));
        assert!(rendered.contains(r#"decoding="async""#));
        assert!(rendered.contains(r#"width="250""#));
    }

    #[test]
    fn render_markdown_html_embeds_pdfs_with_stable_link_card() {
        let rendered = render_markdown_html("![[O'Reilly_Invoice_Annual Plan_2-18-2024.pdf]]");

        assert!(rendered.contains(r#"<div class="pdf-embed">"#));
        assert!(rendered.contains(r#"class="pdf-icon""#));
        assert!(rendered.contains(">PDF</div>"));
        assert!(rendered.contains(r#"<div class="pdf-meta">"#));
        assert!(rendered.contains(r#"Reilly_Invoice_Annual Plan_2-18-2024.pdf"#));
        assert!(rendered.contains(r#"<a class="pdf-link" href="/assets/images/O%27Reilly_Invoice_Annual%20Plan_2-18-2024.pdf" target="_blank""#));
        assert!(!rendered.contains("<iframe"));
        assert!(!rendered.contains("<img"));
    }

    #[test]
    fn render_markdown_html_lazy_loads_markdown_images() {
        let rendered = render_markdown_html("![Alt text](photo.jpg)");

        assert!(rendered.contains(r#"<img src="photo.jpg" alt="Alt text""#));
        assert!(rendered.contains(r#"loading="lazy""#));
        assert!(rendered.contains(r#"decoding="async""#));
    }

    #[test]
    fn render_markdown_html_preserves_soft_line_breaks() {
        let rendered = render_markdown_html("我说你你你好\n你好");

        assert!(rendered.contains("我说你你你好<br>\n你好"));
        assert!(!rendered.contains("我说你你你好 你好"));
    }

    #[test]
    fn render_markdown_html_folds_yaml_frontmatter() {
        let rendered = render_markdown_html(
            "---\ndoc_type: hypothesis-highlights\nurl: https://news.ycombinator.com/item?id=1\ntags:\n  - Words\nhighlight_count: 1\n---\n\n# Body",
        );

        assert!(rendered.contains(r#"<details class="metadata-panel">"#));
        assert!(rendered.contains(r#"<span class="metadata-count">4 items</span>"#));
        assert!(rendered.contains(r#"<dt class="metadata-key">doc_type</dt>"#));
        assert!(rendered.contains(r#"<a href="https://news.ycombinator.com/item?id=1""#));
        assert!(rendered.contains(r#"<span class="metadata-chip">Words</span>"#));
        assert!(rendered.contains("<h1>Body</h1>"));
        assert!(!rendered.contains("doc_type: hypothesis-highlights"));
    }

    #[test]
    fn render_markdown_html_keeps_invalid_frontmatter_collapsed() {
        let rendered = render_markdown_html("---\nfoo: [bar\n---\n\nBody");

        assert!(rendered.contains(r#"<details class="metadata-panel">"#));
        assert!(rendered.contains(r#"<span class="metadata-count">raw</span>"#));
        assert!(rendered.contains(r#"<pre class="metadata-raw"><code>"#));
        assert!(rendered.contains("<p>Body</p>"));
    }

    #[test]
    fn render_markdown_html_keeps_plain_horizontal_rule_without_frontmatter_close() {
        let rendered = render_markdown_html("---\n\nBody");

        assert!(!rendered.contains("metadata-panel"));
        assert!(rendered.contains("<hr"));
        assert!(rendered.contains("<p>Body</p>"));
    }

    #[test]
    fn render_markdown_html_adds_clickable_task_indexes() {
        let rendered = render_markdown_html("- [ ] first\n- [x] second");

        assert!(rendered.contains(r#"data-task-index="0""#));
        assert!(rendered.contains(r#"data-task-index="1""#));
        assert!(rendered.contains("checked"));
        assert!(rendered.contains("disabled"));
    }

    #[test]
    fn render_markdown_html_does_not_link_inside_code() {
        let rendered = render_markdown_html("`[[Note]]`\n\n```\n[[Block]]\n```");

        assert!(rendered.contains("<code>[[Note]]</code>"));
        assert!(rendered.contains("[[Block]]"));
        assert!(!rendered.contains("data-page"));
    }

    #[test]
    fn render_markdown_html_sanitizes_unsafe_html() {
        let rendered =
            render_markdown_html("<script>alert(1)</script>\n\n<img src=\"x\" onerror=\"bad()\">");

        assert!(!rendered.contains("<script"));
        assert!(!rendered.contains("onerror"));
    }
}
