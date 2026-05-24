use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use anyhow::{Context, Result, anyhow, bail};
use chrono::{DateTime, Utc};
use feed_rs::{
    model::{Content, Entry, Feed, Link, Text},
    parser,
};
use reqwest::{
    Client, StatusCode,
    header::{ETAG, HeaderMap, IF_MODIFIED_SINCE, IF_NONE_MATCH, LAST_MODIFIED},
};
use rs_trafilatura::{Options as ExtractOptions, extract_bytes_with_options};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use tokio::sync::Mutex;
use tracing::{info, warn};
use uuid::Uuid;

use crate::config::Config;

const RSS_SCHEMA_VERSION: i64 = 2;
const CONTENT_DIR: &str = "content";
const USER_AGENT_VALUE: &str = concat!("Obr/", env!("CARGO_PKG_VERSION"), " RSS Reader");
const MIN_ARTICLE_MARKDOWN_CHARS: usize = 160;

#[derive(Clone)]
pub(crate) struct RssReader {
    vault_path: PathBuf,
    feeds_path: PathBuf,
    data_dir: PathBuf,
    db_path: PathBuf,
    content_dir: PathBuf,
    refresh_minutes: u64,
    max_items_per_feed: usize,
    fetch_full_content: bool,
    client: Client,
    refresh_lock: Arc<Mutex<()>>,
}

#[derive(Debug, Serialize)]
pub(crate) struct RssStatus {
    pub(crate) enabled: bool,
    pub(crate) feeds_path: String,
    pub(crate) refresh_minutes: u64,
    pub(crate) feed_count: i64,
    pub(crate) item_count: i64,
    pub(crate) unread_count: i64,
    pub(crate) last_checked_at: Option<String>,
    pub(crate) last_success_at: Option<String>,
    pub(crate) last_error: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct RssRefreshSummary {
    pub(crate) feeds: usize,
    pub(crate) checked: usize,
    pub(crate) unchanged: usize,
    pub(crate) failed: usize,
    pub(crate) new_items: usize,
    pub(crate) removed_feeds: usize,
    pub(crate) removed_items: usize,
}

#[derive(Debug, Serialize)]
pub(crate) struct RssUnsubscribeSummary {
    pub(crate) feed_id: String,
    pub(crate) url: String,
    pub(crate) removed_feeds: usize,
    pub(crate) removed_items: usize,
}

#[derive(Debug, Serialize)]
pub(crate) struct RssFeedSummary {
    pub(crate) id: String,
    pub(crate) url: String,
    pub(crate) title: String,
    pub(crate) site_url: Option<String>,
    pub(crate) last_checked_at: Option<String>,
    pub(crate) last_success_at: Option<String>,
    pub(crate) last_error: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct RssItemSummary {
    pub(crate) id: String,
    pub(crate) feed_id: String,
    pub(crate) feed_title: String,
    pub(crate) feed_url: String,
    pub(crate) title: String,
    pub(crate) url: String,
    pub(crate) author: Option<String>,
    pub(crate) published_at: Option<String>,
    pub(crate) first_seen_at: String,
    pub(crate) read_at: Option<String>,
    pub(crate) starred_at: Option<String>,
    pub(crate) summary_md: Option<String>,
    pub(crate) content_source: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct RssItemDetail {
    pub(crate) id: String,
    pub(crate) feed_id: String,
    pub(crate) feed_title: String,
    pub(crate) feed_url: String,
    pub(crate) title: String,
    pub(crate) url: String,
    pub(crate) author: Option<String>,
    pub(crate) published_at: Option<String>,
    pub(crate) updated_at: Option<String>,
    pub(crate) first_seen_at: String,
    pub(crate) fetched_at: Option<String>,
    pub(crate) read_at: Option<String>,
    pub(crate) starred_at: Option<String>,
    pub(crate) content_source: String,
    pub(crate) extraction_quality: Option<f64>,
    pub(crate) content_markdown: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RssItemFilter {
    Unread,
    All,
}

#[derive(Debug)]
struct FeedCache {
    etag: Option<String>,
    last_modified: Option<String>,
}

#[derive(Debug, Default)]
struct FeedRefreshStats {
    unchanged: bool,
    new_items: usize,
}

#[derive(Debug, Default)]
struct PruneStats {
    feeds: usize,
    items: usize,
}

#[derive(Debug)]
struct FeedUpdate<'a> {
    id: &'a str,
    url: &'a str,
    title: &'a str,
    site_url: Option<&'a str>,
    etag: Option<&'a str>,
    last_modified: Option<&'a str>,
    checked_at: &'a str,
}

#[derive(Debug)]
struct ItemCandidate {
    id: String,
    feed_id: String,
    feed_url: String,
    guid: String,
    url: String,
    title: String,
    author: Option<String>,
    published_at: Option<String>,
    updated_at: Option<String>,
    summary_md: Option<String>,
    content_markdown: String,
    content_source: String,
    extraction_quality: Option<f64>,
}

impl RssReader {
    pub(crate) fn open(config: &Config) -> Result<Option<Arc<Self>>> {
        if !config.rss_enabled {
            return Ok(None);
        }
        let data_dir = config.rss_data_dir.clone();
        let db_path = data_dir.join("rss.sqlite");
        let content_dir = data_dir.join(CONTENT_DIR);
        fs::create_dir_all(&content_dir)
            .with_context(|| format!("create RSS content dir {}", content_dir.display()))?;
        init_db(&db_path)?;
        let client = Client::builder()
            .user_agent(USER_AGENT_VALUE)
            .timeout(Duration::from_secs(25))
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .context("build RSS HTTP client")?;
        Ok(Some(Arc::new(Self {
            vault_path: config.vault_path.clone(),
            feeds_path: config.rss_feeds_path.clone(),
            data_dir,
            db_path,
            content_dir,
            refresh_minutes: config.rss_refresh_minutes,
            max_items_per_feed: config.rss_max_items_per_feed,
            fetch_full_content: config.rss_fetch_full_content,
            client,
            refresh_lock: Arc::new(Mutex::new(())),
        })))
    }

    pub(crate) fn spawn_refresh_loop(self: Arc<Self>) {
        tokio::spawn(async move {
            if let Err(err) = self.refresh().await {
                warn!(error = %err, "initial RSS refresh failed");
            }
            let mut interval =
                tokio::time::interval(Duration::from_secs(self.refresh_minutes * 60));
            interval.tick().await;
            loop {
                interval.tick().await;
                if let Err(err) = self.refresh().await {
                    warn!(error = %err, "RSS refresh failed");
                }
            }
        });
    }

    pub(crate) async fn refresh(&self) -> Result<RssRefreshSummary> {
        let _guard = self.refresh_lock.lock().await;
        let feed_urls = self.feed_urls()?;
        let prune = self.prune_removed_feeds(&feed_urls)?;
        let feed_urls = match self.prioritize_new_feed_urls(feed_urls.clone()) {
            Ok(feed_urls) => feed_urls,
            Err(err) => {
                warn!(
                    error = %err,
                    "prioritize new RSS feeds failed; refreshing configured order"
                );
                feed_urls
            }
        };
        let mut summary = RssRefreshSummary {
            feeds: feed_urls.len(),
            checked: 0,
            unchanged: 0,
            failed: 0,
            new_items: 0,
            removed_feeds: prune.feeds,
            removed_items: prune.items,
        };

        for feed_url in feed_urls {
            summary.checked += 1;
            match self.refresh_feed(&feed_url).await {
                Ok(stats) => {
                    if stats.unchanged {
                        summary.unchanged += 1;
                    }
                    summary.new_items += stats.new_items;
                }
                Err(err) => {
                    summary.failed += 1;
                    warn!(feed = %feed_url, error = %err, "RSS feed refresh failed");
                    if let Err(record_err) = self.record_feed_error(&feed_url, &format!("{err:#}"))
                    {
                        warn!(
                            feed = %feed_url,
                            error = %record_err,
                            "record RSS feed error failed"
                        );
                    }
                }
            }
        }

        info!(
            feeds = summary.feeds,
            checked = summary.checked,
            unchanged = summary.unchanged,
            failed = summary.failed,
            new_items = summary.new_items,
            removed_feeds = summary.removed_feeds,
            removed_items = summary.removed_items,
            "RSS refresh complete"
        );
        Ok(summary)
    }

    pub(crate) fn status(&self) -> Result<RssStatus> {
        let conn = self.connection()?;
        Ok(RssStatus {
            enabled: true,
            feeds_path: vault_rel_path(&self.feeds_path),
            refresh_minutes: self.refresh_minutes,
            feed_count: count_rows(&conn, "feeds", None)?,
            item_count: count_rows(&conn, "items", None)?,
            unread_count: count_rows(&conn, "items", Some("read_at IS NULL"))?,
            last_checked_at: max_column(&conn, "feeds", "last_checked_at")?,
            last_success_at: max_column(&conn, "feeds", "last_success_at")?,
            last_error: latest_error(&conn)?,
        })
    }

    pub(crate) fn list_feeds(&self) -> Result<Vec<RssFeedSummary>> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, url, title, site_url, last_checked_at, last_success_at, last_error
             FROM feeds
             ORDER BY COALESCE(title, url) COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], |row| {
            let url: String = row.get(1)?;
            let title = row
                .get::<_, Option<String>>(2)?
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| url.clone());
            Ok(RssFeedSummary {
                id: row.get(0)?,
                url,
                title,
                site_url: row.get(3)?,
                last_checked_at: row.get(4)?,
                last_success_at: row.get(5)?,
                last_error: row.get(6)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub(crate) fn list_items(
        &self,
        filter: RssItemFilter,
        limit: usize,
        search: Option<&str>,
    ) -> Result<Vec<RssItemSummary>> {
        let conn = self.connection()?;
        let limit = limit.clamp(1, 200);
        let search_terms = search_terms(search);
        let row_limit = if search_terms.is_empty() { limit } else { 2000 } as i64;
        let mut sql = String::from(
            "SELECT i.id, i.feed_id, COALESCE(f.title, f.url), f.url, i.title, i.url,
                    i.author, i.published_at, i.first_seen_at, i.read_at,
                    i.starred_at, i.summary_md, i.content_source, i.content_path
             FROM items i
             JOIN feeds f ON f.id = i.feed_id",
        );
        if filter == RssItemFilter::Unread {
            sql.push_str(" WHERE i.read_at IS NULL");
        }
        sql.push_str(
            " ORDER BY COALESCE(i.published_at, i.updated_at, i.first_seen_at) DESC
              LIMIT ?1",
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![row_limit], |row| {
            Ok((
                RssItemSummary {
                    id: row.get(0)?,
                    feed_id: row.get(1)?,
                    feed_title: row.get(2)?,
                    feed_url: row.get(3)?,
                    title: row.get(4)?,
                    url: row.get(5)?,
                    author: row.get(6)?,
                    published_at: row.get(7)?,
                    first_seen_at: row.get(8)?,
                    read_at: row.get(9)?,
                    starred_at: row.get(10)?,
                    summary_md: row.get(11)?,
                    content_source: row.get(12)?,
                },
                row.get::<_, Option<String>>(13)?,
            ))
        })?;
        let rows = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        if search_terms.is_empty() {
            return Ok(rows.into_iter().map(|(item, _)| item).collect());
        }

        let mut matches = Vec::new();
        for (item, content_path) in rows {
            let content_markdown = content_path
                .as_deref()
                .and_then(|path| self.content_file_path(path))
                .and_then(|path| fs::read_to_string(path).ok())
                .unwrap_or_default();
            if rss_item_matches_search(&item, &content_markdown, &search_terms) {
                matches.push(item);
                if matches.len() >= limit {
                    break;
                }
            }
        }
        Ok(matches)
    }

    pub(crate) fn get_item(&self, id: &str) -> Result<Option<RssItemDetail>> {
        let conn = self.connection()?;
        let row = conn
            .query_row(
                "SELECT i.id, i.feed_id, COALESCE(f.title, f.url), f.url, i.title, i.url,
                        i.author, i.published_at, i.updated_at, i.first_seen_at, i.fetched_at,
                        i.read_at, i.starred_at, i.content_source, i.extraction_quality,
                        i.content_path, i.summary_md
                 FROM items i
                 JOIN feeds f ON f.id = i.feed_id
                 WHERE i.id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<String>>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, String>(9)?,
                        row.get::<_, Option<String>>(10)?,
                        row.get::<_, Option<String>>(11)?,
                        row.get::<_, Option<String>>(12)?,
                        row.get::<_, String>(13)?,
                        row.get::<_, Option<f64>>(14)?,
                        row.get::<_, Option<String>>(15)?,
                        row.get::<_, Option<String>>(16)?,
                    ))
                },
            )
            .optional()?;

        let Some((
            id,
            feed_id,
            feed_title,
            feed_url,
            title,
            url,
            author,
            published_at,
            updated_at,
            first_seen_at,
            fetched_at,
            read_at,
            starred_at,
            content_source,
            extraction_quality,
            content_path,
            summary_md,
        )) = row
        else {
            return Ok(None);
        };

        let content_markdown = content_path
            .as_deref()
            .and_then(|path| self.content_file_path(path))
            .and_then(|path| fs::read_to_string(path).ok())
            .filter(|content| !content.trim().is_empty())
            .or(summary_md)
            .unwrap_or_default();

        Ok(Some(RssItemDetail {
            id,
            feed_id,
            feed_title,
            feed_url,
            title,
            url,
            author,
            published_at,
            updated_at,
            first_seen_at,
            fetched_at,
            read_at,
            starred_at,
            content_source,
            extraction_quality,
            content_markdown,
        }))
    }

    pub(crate) fn mark_item_read(&self, id: &str, read: bool) -> Result<bool> {
        let conn = self.connection()?;
        let changed = if read {
            conn.execute(
                "UPDATE items SET read_at = COALESCE(read_at, ?2) WHERE id = ?1",
                params![id, now_string()],
            )?
        } else {
            conn.execute("UPDATE items SET read_at = NULL WHERE id = ?1", params![id])?
        };
        Ok(changed > 0)
    }

    pub(crate) fn mark_item_starred(&self, id: &str, starred: bool) -> Result<bool> {
        let conn = self.connection()?;
        let changed = if starred {
            conn.execute(
                "UPDATE items SET starred_at = COALESCE(starred_at, ?2) WHERE id = ?1",
                params![id, now_string()],
            )?
        } else {
            conn.execute(
                "UPDATE items SET starred_at = NULL WHERE id = ?1",
                params![id],
            )?
        };
        Ok(changed > 0)
    }

    pub(crate) fn unsubscribe_feed(&self, feed_id: &str) -> Result<Option<RssUnsubscribeSummary>> {
        let conn = self.connection()?;
        let feed_url = conn
            .query_row(
                "SELECT url FROM feeds WHERE id = ?1",
                params![feed_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let Some(feed_url) = feed_url else {
            return Ok(None);
        };
        self.remove_feed_url_from_feeds_file(&feed_url)?;
        let feed_urls = self.feed_urls()?;
        let prune = self.prune_removed_feeds(&feed_urls)?;
        Ok(Some(RssUnsubscribeSummary {
            feed_id: feed_id.to_string(),
            url: feed_url,
            removed_feeds: prune.feeds,
            removed_items: prune.items,
        }))
    }

    fn connection(&self) -> Result<Connection> {
        open_connection(&self.db_path)
    }

    fn feed_urls(&self) -> Result<Vec<String>> {
        let path = self.vault_path.join(&self.feeds_path);
        let raw = fs::read_to_string(&path)
            .with_context(|| format!("read RSS feeds {}", path.display()))?;
        Ok(parse_feed_urls(&raw))
    }

    fn remove_feed_url_from_feeds_file(&self, feed_url: &str) -> Result<bool> {
        let path = self.vault_path.join(&self.feeds_path);
        let raw = fs::read_to_string(&path)
            .with_context(|| format!("read RSS feeds {}", path.display()))?;
        let mut removed = false;
        let lines = raw
            .lines()
            .filter(|line| {
                let should_remove = feed_url_from_line(line).as_deref() == Some(feed_url);
                if should_remove {
                    removed = true;
                }
                !should_remove
            })
            .collect::<Vec<_>>();
        if !removed {
            return Ok(false);
        }

        let mut updated = lines.join("\n");
        if raw.ends_with('\n') && !updated.is_empty() {
            updated.push('\n');
        }
        fs::write(&path, updated).with_context(|| format!("write RSS feeds {}", path.display()))?;
        Ok(true)
    }

    fn prioritize_new_feed_urls(&self, feed_urls: Vec<String>) -> Result<Vec<String>> {
        let conn = self.connection()?;
        let mut stmt = conn.prepare("SELECT url FROM feeds")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let known_urls = rows.collect::<rusqlite::Result<HashSet<_>>>()?;

        let (new_urls, known_urls_in_order): (Vec<_>, Vec<_>) = feed_urls
            .into_iter()
            .partition(|url| !known_urls.contains(url));
        Ok(new_urls.into_iter().chain(known_urls_in_order).collect())
    }

    fn prune_removed_feeds(&self, feed_urls: &[String]) -> Result<PruneStats> {
        let active_feed_ids = feed_urls
            .iter()
            .map(|url| stable_id("feed", url))
            .collect::<HashSet<_>>();
        let mut conn = self.connection()?;
        let removed_items = {
            let mut stmt = conn.prepare("SELECT id, feed_id, content_path FROM items")?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })?;
            let mut removed_items = Vec::new();
            for row in rows {
                let (id, feed_id, content_path) = row?;
                if !active_feed_ids.contains(&feed_id) {
                    removed_items.push((id, content_path));
                }
            }
            removed_items
        };
        let removed_feeds = {
            let mut stmt = conn.prepare("SELECT id FROM feeds")?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            let mut removed_feeds = Vec::new();
            for row in rows {
                let id = row?;
                if !active_feed_ids.contains(&id) {
                    removed_feeds.push(id);
                }
            }
            removed_feeds
        };

        if removed_items.is_empty() && removed_feeds.is_empty() {
            return Ok(PruneStats::default());
        }

        let tx = conn.transaction()?;
        for (id, _) in &removed_items {
            tx.execute("DELETE FROM items WHERE id = ?1", params![id])?;
        }
        for id in &removed_feeds {
            tx.execute("DELETE FROM feeds WHERE id = ?1", params![id])?;
        }
        tx.commit()?;

        for (_, content_path) in &removed_items {
            let Some(content_path) = content_path.as_deref() else {
                continue;
            };
            let Some(absolute_path) = self.content_file_path(content_path) else {
                warn!(
                    content_path = content_path,
                    "skipping unsafe RSS content path during prune"
                );
                continue;
            };
            if let Err(err) = fs::remove_file(&absolute_path)
                && err.kind() != std::io::ErrorKind::NotFound
            {
                warn!(
                    path = %absolute_path.display(),
                    error = %err,
                    "failed to remove pruned RSS content file"
                );
            }
        }

        Ok(PruneStats {
            feeds: removed_feeds.len(),
            items: removed_items.len(),
        })
    }

    fn content_file_path(&self, content_path: &str) -> Option<PathBuf> {
        let path = Path::new(content_path);
        if path.is_absolute()
            || !path.starts_with(CONTENT_DIR)
            || path
                .components()
                .any(|component| matches!(component, std::path::Component::ParentDir))
        {
            return None;
        }
        Some(self.data_dir.join(path))
    }

    async fn refresh_feed(&self, feed_url: &str) -> Result<FeedRefreshStats> {
        let cache = self.feed_cache(feed_url)?;
        let mut request = self.client.get(feed_url);
        if let Some(etag) = cache.etag {
            request = request.header(IF_NONE_MATCH, etag);
        }
        if let Some(last_modified) = cache.last_modified {
            request = request.header(IF_MODIFIED_SINCE, last_modified);
        }

        let response = request
            .send()
            .await
            .with_context(|| format!("fetch feed {feed_url}"))?;
        let checked_at = now_string();
        if response.status() == StatusCode::NOT_MODIFIED {
            self.mark_feed_checked(feed_url, &checked_at)?;
            return Ok(FeedRefreshStats {
                unchanged: true,
                new_items: 0,
            });
        }
        if !response.status().is_success() {
            bail!("feed returned HTTP {}", response.status());
        }
        let headers = response.headers().clone();
        let bytes = response
            .bytes()
            .await
            .with_context(|| format!("read feed body {feed_url}"))?;
        let feed =
            parser::parse(bytes.as_ref()).with_context(|| format!("parse feed {feed_url}"))?;
        let feed_id = stable_id("feed", feed_url);
        let title = feed_title(&feed).unwrap_or_else(|| feed_url.to_string());
        let site_url = feed_site_url(&feed);
        let etag = header_to_string(&headers, ETAG);
        let last_modified = header_to_string(&headers, LAST_MODIFIED);
        self.upsert_feed(FeedUpdate {
            id: &feed_id,
            url: feed_url,
            title: &title,
            site_url: site_url.as_deref(),
            etag: etag.as_deref(),
            last_modified: last_modified.as_deref(),
            checked_at: &checked_at,
        })?;

        let mut stats = FeedRefreshStats::default();
        for entry in feed.entries.iter().take(self.max_items_per_feed) {
            let candidate = self.item_candidate(&feed_id, feed_url, entry).await?;
            if self.item_exists(&candidate.id)? {
                continue;
            }
            self.insert_item(candidate)?;
            stats.new_items += 1;
        }
        Ok(stats)
    }

    async fn item_candidate(
        &self,
        feed_id: &str,
        feed_url: &str,
        entry: &Entry,
    ) -> Result<ItemCandidate> {
        let url = entry_url(entry).unwrap_or_else(|| entry.id.clone());
        let guid = if entry.id.trim().is_empty() {
            url.clone()
        } else {
            entry.id.clone()
        };
        let id = stable_id("item", &format!("{feed_url}\n{guid}"));
        let title = entry_title(entry)
            .or_else(|| (!url.trim().is_empty()).then(|| url.clone()))
            .unwrap_or_else(|| "Untitled".to_string());
        let author = entry
            .authors
            .first()
            .map(|author| author.name.trim().to_string())
            .filter(|author| !author.is_empty());
        let published_at = entry.published.as_ref().map(date_to_string);
        let updated_at = entry.updated.as_ref().map(date_to_string);
        let summary_md = entry_summary_markdown(entry);
        let feed_content_md = entry_content_markdown(entry);
        let mut content_source = if feed_content_md.is_some() {
            "feed_content"
        } else {
            "summary"
        }
        .to_string();
        let mut extraction_quality = None;
        let mut content_markdown = feed_content_md
            .clone()
            .or_else(|| summary_md.clone())
            .unwrap_or_default();

        if self.fetch_full_content
            && is_http_url(&url)
            && let Ok(article) = self.fetch_article_markdown(&url).await
            && article.markdown.trim().len() >= MIN_ARTICLE_MARKDOWN_CHARS
        {
            content_source = "article".to_string();
            extraction_quality = Some(article.quality);
            content_markdown = article.markdown;
        }

        Ok(ItemCandidate {
            id,
            feed_id: feed_id.to_string(),
            feed_url: feed_url.to_string(),
            guid,
            url,
            title,
            author,
            published_at,
            updated_at,
            summary_md,
            content_markdown,
            content_source,
            extraction_quality,
        })
    }

    async fn fetch_article_markdown(&self, url: &str) -> Result<ArticleMarkdown> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .with_context(|| format!("fetch article {url}"))?;
        if !response.status().is_success() {
            bail!("article returned HTTP {}", response.status());
        }
        let bytes = response
            .bytes()
            .await
            .with_context(|| format!("read article body {url}"))?;
        let options = ExtractOptions {
            include_images: true,
            include_links: true,
            include_tables: true,
            favor_recall: true,
            output_markdown: true,
            url: Some(url.to_string()),
            ..ExtractOptions::default()
        };
        let extracted = extract_bytes_with_options(&bytes, &options)
            .map_err(|err| anyhow!("extract article content: {err}"))?;
        let markdown = extracted
            .content_markdown
            .filter(|markdown| !markdown.trim().is_empty())
            .unwrap_or(extracted.content_text);
        Ok(ArticleMarkdown {
            markdown: normalize_markdown(&markdown),
            quality: extracted.extraction_quality,
        })
    }

    fn feed_cache(&self, feed_url: &str) -> Result<FeedCache> {
        let conn = self.connection()?;
        let row = conn
            .query_row(
                "SELECT etag, last_modified FROM feeds WHERE url = ?1",
                params![feed_url],
                |row| {
                    Ok(FeedCache {
                        etag: row.get(0)?,
                        last_modified: row.get(1)?,
                    })
                },
            )
            .optional()?;
        Ok(row.unwrap_or(FeedCache {
            etag: None,
            last_modified: None,
        }))
    }

    fn upsert_feed(&self, update: FeedUpdate<'_>) -> Result<()> {
        let conn = self.connection()?;
        conn.execute(
            "INSERT INTO feeds (
                id, url, title, site_url, etag, last_modified,
                last_checked_at, last_success_at, last_error
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, NULL)
             ON CONFLICT(url) DO UPDATE SET
                title = excluded.title,
                site_url = excluded.site_url,
                etag = COALESCE(excluded.etag, feeds.etag),
                last_modified = COALESCE(excluded.last_modified, feeds.last_modified),
                last_checked_at = excluded.last_checked_at,
                last_success_at = excluded.last_success_at,
                last_error = NULL",
            params![
                update.id,
                update.url,
                update.title,
                update.site_url,
                update.etag,
                update.last_modified,
                update.checked_at,
            ],
        )?;
        Ok(())
    }

    fn mark_feed_checked(&self, feed_url: &str, checked_at: &str) -> Result<()> {
        let conn = self.connection()?;
        let id = stable_id("feed", feed_url);
        conn.execute(
            "INSERT INTO feeds (id, url, last_checked_at, last_error)
             VALUES (?1, ?2, ?3, NULL)
             ON CONFLICT(url) DO UPDATE SET
                last_checked_at = excluded.last_checked_at,
                last_error = NULL",
            params![id, feed_url, checked_at],
        )?;
        Ok(())
    }

    fn record_feed_error(&self, feed_url: &str, error: &str) -> Result<()> {
        let conn = self.connection()?;
        let id = stable_id("feed", feed_url);
        conn.execute(
            "INSERT INTO feeds (id, url, last_checked_at, last_error)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(url) DO UPDATE SET
                last_checked_at = excluded.last_checked_at,
                last_error = excluded.last_error",
            params![id, feed_url, now_string(), error],
        )?;
        Ok(())
    }

    fn item_exists(&self, id: &str) -> Result<bool> {
        let conn = self.connection()?;
        let exists: i64 = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM items WHERE id = ?1)",
            params![id],
            |row| row.get(0),
        )?;
        Ok(exists != 0)
    }

    fn insert_item(&self, item: ItemCandidate) -> Result<()> {
        fs::create_dir_all(&self.content_dir)
            .with_context(|| format!("create RSS content dir {}", self.content_dir.display()))?;
        let content_path = format!("{CONTENT_DIR}/{}.md", item.id);
        let absolute_content_path = self.data_dir.join(&content_path);
        fs::write(
            &absolute_content_path,
            normalize_markdown(&item.content_markdown),
        )
        .with_context(|| format!("write RSS item {}", absolute_content_path.display()))?;
        let conn = self.connection()?;
        conn.execute(
            "INSERT OR IGNORE INTO items (
                id, feed_id, feed_url, guid, url, title, author, published_at,
                updated_at, summary_md, content_path, content_source,
                extraction_quality, first_seen_at, fetched_at, read_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, NULL)",
            params![
                item.id,
                item.feed_id,
                item.feed_url,
                item.guid,
                item.url,
                item.title,
                item.author,
                item.published_at,
                item.updated_at,
                item.summary_md,
                content_path,
                item.content_source,
                item.extraction_quality,
                now_string(),
            ],
        )?;
        Ok(())
    }
}

#[derive(Debug)]
struct ArticleMarkdown {
    markdown: String,
    quality: f64,
}

pub(crate) fn disabled_status(config: &Config) -> RssStatus {
    RssStatus {
        enabled: false,
        feeds_path: vault_rel_path(&config.rss_feeds_path),
        refresh_minutes: config.rss_refresh_minutes,
        feed_count: 0,
        item_count: 0,
        unread_count: 0,
        last_checked_at: None,
        last_success_at: None,
        last_error: None,
    }
}

fn init_db(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    let conn = open_connection(path)?;
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS feeds (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL UNIQUE,
            title TEXT,
            site_url TEXT,
            last_checked_at TEXT,
            last_success_at TEXT,
            etag TEXT,
            last_modified TEXT,
            last_error TEXT
        );

        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            feed_id TEXT NOT NULL,
            feed_url TEXT NOT NULL,
            guid TEXT NOT NULL,
            url TEXT NOT NULL,
            title TEXT NOT NULL,
            author TEXT,
            published_at TEXT,
            updated_at TEXT,
            summary_md TEXT,
            content_path TEXT,
            content_source TEXT NOT NULL,
            extraction_quality REAL,
            first_seen_at TEXT NOT NULL,
            fetched_at TEXT,
            read_at TEXT,
            FOREIGN KEY(feed_id) REFERENCES feeds(id)
        );

        CREATE INDEX IF NOT EXISTS idx_items_read_published
            ON items(read_at, published_at DESC, first_seen_at DESC);
        CREATE INDEX IF NOT EXISTS idx_items_feed_id ON items(feed_id);
        ",
    )?;
    ensure_column(&conn, "items", "starred_at", "TEXT")?;
    conn.pragma_update(None, "user_version", RSS_SCHEMA_VERSION)?;
    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for row in rows {
        if row? == column {
            return Ok(());
        }
    }
    conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
        [],
    )?;
    Ok(())
}

fn open_connection(path: &Path) -> Result<Connection> {
    let conn =
        Connection::open(path).with_context(|| format!("open RSS database {}", path.display()))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    Ok(conn)
}

fn parse_feed_urls(raw: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut urls = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some(url) = feed_url_from_line(line) else {
            continue;
        };
        if seen.insert(url.clone()) {
            urls.push(url);
        }
    }
    urls
}

fn search_terms(search: Option<&str>) -> Vec<String> {
    search
        .unwrap_or_default()
        .split_whitespace()
        .map(|term| term.trim().to_lowercase())
        .filter(|term| !term.is_empty())
        .collect()
}

fn rss_item_matches_search(
    item: &RssItemSummary,
    content_markdown: &str,
    terms: &[String],
) -> bool {
    if terms.is_empty() {
        return true;
    }
    let searchable = [
        item.feed_title.as_str(),
        item.feed_url.as_str(),
        item.title.as_str(),
        item.url.as_str(),
        item.author.as_deref().unwrap_or_default(),
        item.summary_md.as_deref().unwrap_or_default(),
        content_markdown,
    ]
    .join("\n")
    .to_lowercase();
    terms.iter().all(|term| searchable.contains(term))
}

fn feed_url_from_line(line: &str) -> Option<String> {
    let start = line.find("https://").or_else(|| line.find("http://"))?;
    let url = line[start..]
        .split(|ch: char| ch.is_whitespace() || matches!(ch, ')' | ']' | '>'))
        .next()
        .unwrap_or_default()
        .trim_matches(|ch| matches!(ch, '"' | '\'' | ',' | ';'));
    is_http_url(url).then(|| url.to_string())
}

fn feed_title(feed: &Feed) -> Option<String> {
    feed.title
        .as_ref()
        .map(|title| title.content.trim().to_string())
        .filter(|title| !title.is_empty())
}

fn feed_site_url(feed: &Feed) -> Option<String> {
    pick_link(&feed.links).map(ToString::to_string)
}

fn entry_title(entry: &Entry) -> Option<String> {
    entry
        .title
        .as_ref()
        .map(|title| title.content.trim().to_string())
        .filter(|title| !title.is_empty())
}

fn entry_url(entry: &Entry) -> Option<String> {
    pick_link(&entry.links)
        .map(ToString::to_string)
        .or_else(|| {
            entry
                .content
                .as_ref()
                .and_then(|content| content.src.as_ref())
                .map(|link| link.href.clone())
        })
        .or_else(|| is_http_url(&entry.id).then(|| entry.id.clone()))
}

fn pick_link(links: &[Link]) -> Option<&str> {
    links
        .iter()
        .find(|link| {
            is_http_url(&link.href)
                && link
                    .rel
                    .as_deref()
                    .map(|rel| rel.eq_ignore_ascii_case("alternate"))
                    .unwrap_or(true)
        })
        .or_else(|| links.iter().find(|link| is_http_url(&link.href)))
        .map(|link| link.href.as_str())
}

fn entry_summary_markdown(entry: &Entry) -> Option<String> {
    entry
        .summary
        .as_ref()
        .map(text_to_markdown)
        .filter(|markdown| !markdown.trim().is_empty())
}

fn entry_content_markdown(entry: &Entry) -> Option<String> {
    entry
        .content
        .as_ref()
        .and_then(content_to_markdown)
        .filter(|markdown| !markdown.trim().is_empty())
}

fn text_to_markdown(text: &Text) -> String {
    markup_to_markdown(&text.content, text.content_type.as_str())
}

fn content_to_markdown(content: &Content) -> Option<String> {
    content
        .body
        .as_deref()
        .map(|body| markup_to_markdown(body, content.content_type.as_str()))
}

fn markup_to_markdown(content: &str, content_type: &str) -> String {
    let markdown = if content_type.contains("html") || content_type.contains("xhtml") {
        html2markdown::convert(content)
    } else {
        content.to_string()
    };
    normalize_markdown(&markdown)
}

fn normalize_markdown(markdown: &str) -> String {
    let normalized = markdown.replace("\r\n", "\n").replace('\r', "\n");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("{trimmed}\n")
    }
}

fn count_rows(conn: &Connection, table: &str, where_clause: Option<&str>) -> Result<i64> {
    let sql = if let Some(where_clause) = where_clause {
        format!("SELECT COUNT(*) FROM {table} WHERE {where_clause}")
    } else {
        format!("SELECT COUNT(*) FROM {table}")
    };
    conn.query_row(&sql, [], |row| row.get(0))
        .map_err(Into::into)
}

fn max_column(conn: &Connection, table: &str, column: &str) -> Result<Option<String>> {
    let sql = format!("SELECT MAX({column}) FROM {table}");
    conn.query_row(&sql, [], |row| row.get(0))
        .map_err(Into::into)
}

fn latest_error(conn: &Connection) -> Result<Option<String>> {
    conn.query_row(
        "SELECT last_error FROM feeds
         WHERE last_error IS NOT NULL AND last_error != ''
         ORDER BY last_checked_at DESC
         LIMIT 1",
        [],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

fn header_to_string(headers: &HeaderMap, name: reqwest::header::HeaderName) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn stable_id(kind: &str, value: &str) -> String {
    Uuid::new_v5(
        &Uuid::NAMESPACE_URL,
        format!("obr-rss:{kind}:{value}").as_bytes(),
    )
    .to_string()
}

fn now_string() -> String {
    Utc::now().to_rfc3339()
}

fn date_to_string(date: &DateTime<Utc>) -> String {
    date.to_rfc3339()
}

fn is_http_url(value: &str) -> bool {
    value.starts_with("https://") || value.starts_with("http://")
}

fn vault_rel_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_feed_urls_skips_comments_invalid_and_duplicates() {
        let raw = r#"
            # feeds
            https://example.com/feed.xml
            https://example.com/feed.xml
            not-a-url
            http://example.test/rss extra words
            - [Blog](https://example.org/atom.xml)
        "#;

        assert_eq!(
            parse_feed_urls(raw),
            vec![
                "https://example.com/feed.xml".to_string(),
                "http://example.test/rss".to_string(),
                "https://example.org/atom.xml".to_string(),
            ]
        );
    }

    #[test]
    fn stable_id_is_deterministic_and_namespaced() {
        assert_eq!(stable_id("item", "a"), stable_id("item", "a"));
        assert_ne!(stable_id("item", "a"), stable_id("feed", "a"));
        assert_ne!(stable_id("item", "a"), stable_id("item", "b"));
    }

    #[test]
    fn markup_to_markdown_converts_html() {
        let markdown = markup_to_markdown(
            "<p>Hello <a href=\"https://example.com\">world</a>.</p>",
            "text/html",
        );

        assert!(markdown.contains("Hello"));
        assert!(markdown.contains("world"));
        assert!(markdown.contains("https://example.com"));
    }

    #[test]
    fn refresh_prioritizes_new_feeds_before_known_feeds() -> Result<()> {
        let (reader, root) = test_reader()?;
        let known_a = "https://example.test/known-a.xml";
        let new_a = "https://example.test/new-a.xml";
        let known_b = "https://example.test/known-b.xml";
        let new_b = "https://example.test/new-b.xml";
        let checked_at = now_string();
        for feed_url in [known_a, known_b] {
            let feed_id = stable_id("feed", feed_url);
            reader.upsert_feed(FeedUpdate {
                id: &feed_id,
                url: feed_url,
                title: "Known feed",
                site_url: None,
                etag: None,
                last_modified: None,
                checked_at: &checked_at,
            })?;
        }

        let ordered = reader.prioritize_new_feed_urls(vec![
            known_a.to_string(),
            new_a.to_string(),
            known_b.to_string(),
            new_b.to_string(),
        ])?;

        assert_eq!(
            ordered,
            vec![
                new_a.to_string(),
                new_b.to_string(),
                known_a.to_string(),
                known_b.to_string(),
            ]
        );
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn prune_removed_feeds_deletes_items_content_and_feed() -> Result<()> {
        let (reader, root) = test_reader()?;
        let feed_url = "https://example.test/feed.xml";
        let feed_id = stable_id("feed", feed_url);
        let item_id = stable_id("item", "removed-item");
        let checked_at = now_string();
        reader.upsert_feed(FeedUpdate {
            id: &feed_id,
            url: feed_url,
            title: "Example feed",
            site_url: None,
            etag: None,
            last_modified: None,
            checked_at: &checked_at,
        })?;
        reader.insert_item(ItemCandidate {
            id: item_id.clone(),
            feed_id,
            feed_url: feed_url.to_string(),
            guid: "removed-item".to_string(),
            url: "https://example.test/post".to_string(),
            title: "Removed post".to_string(),
            author: None,
            published_at: None,
            updated_at: None,
            summary_md: Some("Summary".to_string()),
            content_markdown: "Full text".to_string(),
            content_source: "summary".to_string(),
            extraction_quality: None,
        })?;
        let content_path = reader
            .data_dir
            .join(CONTENT_DIR)
            .join(format!("{item_id}.md"));
        assert!(content_path.exists());

        let stats = reader.prune_removed_feeds(&[])?;

        assert_eq!(stats.feeds, 1);
        assert_eq!(stats.items, 1);
        let conn = reader.connection()?;
        assert_eq!(count_rows(&conn, "feeds", None)?, 0);
        assert_eq!(count_rows(&conn, "items", None)?, 0);
        assert!(!content_path.exists());
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn prune_removed_feeds_keeps_active_feed_items() -> Result<()> {
        let (reader, root) = test_reader()?;
        let feed_url = "https://example.test/feed.xml";
        let feed_id = stable_id("feed", feed_url);
        let item_id = stable_id("item", "active-item");
        let checked_at = now_string();
        reader.upsert_feed(FeedUpdate {
            id: &feed_id,
            url: feed_url,
            title: "Example feed",
            site_url: None,
            etag: None,
            last_modified: None,
            checked_at: &checked_at,
        })?;
        reader.insert_item(ItemCandidate {
            id: item_id.clone(),
            feed_id,
            feed_url: feed_url.to_string(),
            guid: "active-item".to_string(),
            url: "https://example.test/post".to_string(),
            title: "Active post".to_string(),
            author: None,
            published_at: None,
            updated_at: None,
            summary_md: Some("Summary".to_string()),
            content_markdown: "Full text".to_string(),
            content_source: "summary".to_string(),
            extraction_quality: None,
        })?;
        let content_path = reader
            .data_dir
            .join(CONTENT_DIR)
            .join(format!("{item_id}.md"));

        let stats = reader.prune_removed_feeds(&[feed_url.to_string()])?;

        assert_eq!(stats.feeds, 0);
        assert_eq!(stats.items, 0);
        let conn = reader.connection()?;
        assert_eq!(count_rows(&conn, "feeds", None)?, 1);
        assert_eq!(count_rows(&conn, "items", None)?, 1);
        assert!(content_path.exists());
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn mark_item_starred_toggles_starred_at() -> Result<()> {
        let (reader, root) = test_reader()?;
        let feed_url = "https://example.test/feed.xml";
        let item_id = insert_test_item(&reader, feed_url, "starred-item")?;

        assert!(reader.mark_item_starred(&item_id, true)?);
        assert!(reader.get_item(&item_id)?.unwrap().starred_at.is_some());
        assert!(reader.mark_item_starred(&item_id, false)?);
        assert!(reader.get_item(&item_id)?.unwrap().starred_at.is_none());

        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn list_items_search_matches_feed_source_title_and_content() -> Result<()> {
        let (reader, root) = test_reader()?;
        let feed_url = "https://example.test/feed.xml";
        let item_id = insert_test_item(&reader, feed_url, "search-item")?;
        let conn = reader.connection()?;
        conn.execute(
            "UPDATE feeds SET title = ?1 WHERE url = ?2",
            params!["Rust Notes", feed_url],
        )?;
        conn.execute(
            "UPDATE items SET title = ?1, summary_md = ?2 WHERE id = ?3",
            params!["Ownership update", "Borrow checker links", item_id],
        )?;
        fs::write(
            reader
                .data_dir
                .join(CONTENT_DIR)
                .join(format!("{item_id}.md")),
            "A lifetimes deep dive.\n",
        )?;

        let by_feed = reader.list_items(RssItemFilter::Unread, 10, Some("rust"))?;
        let by_title_and_summary =
            reader.list_items(RssItemFilter::Unread, 10, Some("ownership borrow"))?;
        let by_content = reader.list_items(RssItemFilter::Unread, 10, Some("lifetimes"))?;
        let no_match = reader.list_items(RssItemFilter::Unread, 10, Some("python"))?;

        assert_eq!(by_feed.len(), 1);
        assert_eq!(by_title_and_summary.len(), 1);
        assert_eq!(by_content.len(), 1);
        assert!(no_match.is_empty());
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn unsubscribe_feed_removes_feed_line_items_and_content() -> Result<()> {
        let (reader, root) = test_reader()?;
        let removed_feed_url = "https://example.test/remove.xml";
        let kept_feed_url = "https://example.test/keep.xml";
        fs::write(
            reader.vault_path.join(&reader.feeds_path),
            format!("# feeds\n- [Remove]({removed_feed_url})\n{kept_feed_url}\n"),
        )?;
        let removed_item_id = insert_test_item(&reader, removed_feed_url, "removed-item")?;
        let kept_item_id = insert_test_item(&reader, kept_feed_url, "kept-item")?;
        let removed_content_path = reader
            .data_dir
            .join(CONTENT_DIR)
            .join(format!("{removed_item_id}.md"));
        let kept_content_path = reader
            .data_dir
            .join(CONTENT_DIR)
            .join(format!("{kept_item_id}.md"));

        let summary = reader
            .unsubscribe_feed(&stable_id("feed", removed_feed_url))?
            .unwrap();

        assert_eq!(summary.removed_feeds, 1);
        assert_eq!(summary.removed_items, 1);
        let feeds_file = fs::read_to_string(reader.vault_path.join(&reader.feeds_path))?;
        assert!(!feeds_file.contains(removed_feed_url));
        assert!(feeds_file.contains(kept_feed_url));
        assert!(!removed_content_path.exists());
        assert!(kept_content_path.exists());
        let conn = reader.connection()?;
        assert_eq!(count_rows(&conn, "feeds", None)?, 1);
        assert_eq!(count_rows(&conn, "items", None)?, 1);

        fs::remove_dir_all(root)?;
        Ok(())
    }

    fn insert_test_item(reader: &RssReader, feed_url: &str, guid: &str) -> Result<String> {
        let feed_id = stable_id("feed", feed_url);
        let item_id = stable_id("item", guid);
        let checked_at = now_string();
        reader.upsert_feed(FeedUpdate {
            id: &feed_id,
            url: feed_url,
            title: "Example feed",
            site_url: None,
            etag: None,
            last_modified: None,
            checked_at: &checked_at,
        })?;
        reader.insert_item(ItemCandidate {
            id: item_id.clone(),
            feed_id,
            feed_url: feed_url.to_string(),
            guid: guid.to_string(),
            url: format!("https://example.test/{guid}"),
            title: "Example post".to_string(),
            author: None,
            published_at: None,
            updated_at: None,
            summary_md: Some("Summary".to_string()),
            content_markdown: "Full text".to_string(),
            content_source: "summary".to_string(),
            extraction_quality: None,
        })?;
        Ok(item_id)
    }

    fn test_reader() -> Result<(RssReader, PathBuf)> {
        let root = std::env::temp_dir().join(format!("obr-rss-test-{}", Uuid::new_v4()));
        let vault_path = root.join("vault");
        let data_dir = root.join("data").join("rss");
        let content_dir = data_dir.join(CONTENT_DIR);
        fs::create_dir_all(&vault_path)?;
        fs::create_dir_all(&content_dir)?;
        let db_path = data_dir.join("rss.sqlite");
        init_db(&db_path)?;
        Ok((
            RssReader {
                vault_path,
                feeds_path: PathBuf::from("feeds.md"),
                data_dir,
                db_path,
                content_dir,
                refresh_minutes: 30,
                max_items_per_feed: 20,
                fetch_full_content: false,
                client: Client::builder().build()?,
                refresh_lock: Arc::new(Mutex::new(())),
            },
            root,
        ))
    }
}
