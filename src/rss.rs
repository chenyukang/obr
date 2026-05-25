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
use rusqlite::{Connection, OptionalExtension, params, params_from_iter, types::Value};
use serde::Serialize;
use tokio::sync::Mutex;
use tracing::{info, warn};
use url::Url;
use uuid::Uuid;

use crate::{
    config::Config,
    markdown::{escape_html_attr, render_markdown_html_for_file},
};

const RSS_SCHEMA_VERSION: i64 = 4;
const CONTENT_DIR: &str = "content";
const HTML_DIR: &str = "html";
const USER_AGENT_VALUE: &str = concat!("Obr/", env!("CARGO_PKG_VERSION"), " RSS Reader");
const MIN_ARTICLE_MARKDOWN_CHARS: usize = 160;
const RSS_LIST_SUMMARY_CHARS: usize = 420;

#[derive(Clone)]
pub(crate) struct RssReader {
    vault_path: PathBuf,
    feeds_path: PathBuf,
    data_dir: PathBuf,
    db_path: PathBuf,
    content_dir: PathBuf,
    html_dir: PathBuf,
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
    pub(crate) updated_at: Option<String>,
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
    #[serde(skip_serializing)]
    pub(crate) content_path: Option<String>,
    #[serde(skip_serializing)]
    pub(crate) content_markdown: String,
    #[serde(skip_serializing)]
    pub(crate) html_path: Option<String>,
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
        let html_dir = data_dir.join(HTML_DIR);
        fs::create_dir_all(&content_dir)
            .with_context(|| format!("create RSS content dir {}", content_dir.display()))?;
        fs::create_dir_all(&html_dir)
            .with_context(|| format!("create RSS HTML dir {}", html_dir.display()))?;
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
            html_dir,
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
        offset: usize,
        search: Option<&str>,
    ) -> Result<Vec<RssItemSummary>> {
        let conn = self.connection()?;
        let limit = limit.clamp(1, 200);
        let offset = offset.min(i64::MAX as usize) as i64;
        let search_terms = search_terms(search);
        let summary_chars = RSS_LIST_SUMMARY_CHARS as i64;
        let mut sql = String::from(
            "SELECT i.id, i.feed_id, COALESCE(f.title, f.url), f.url, i.title, i.url,
                    i.author, i.published_at, i.updated_at, i.first_seen_at, i.read_at,
                    i.starred_at, substr(i.summary_md, 1, ?), i.content_source
             FROM items i
             JOIN feeds f ON f.id = i.feed_id",
        );
        let mut clauses = Vec::new();
        let mut values = vec![Value::Integer(summary_chars)];
        if filter == RssItemFilter::Unread {
            clauses.push("i.read_at IS NULL".to_string());
        }
        for term in &search_terms {
            clauses.push(
                "(COALESCE(i.search_text, '') LIKE ? ESCAPE '\\'
                  OR lower(COALESCE(f.title, '')) LIKE ? ESCAPE '\\'
                  OR lower(f.url) LIKE ? ESCAPE '\\')"
                    .to_string(),
            );
            let pattern = sql_like_pattern(term);
            for _ in 0..3 {
                values.push(Value::Text(pattern.clone()));
            }
        }
        if !clauses.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&clauses.join(" AND "));
        }
        sql.push_str(
            " ORDER BY i.sort_at IS NULL, i.sort_at DESC, i.first_seen_at DESC
              LIMIT ? OFFSET ?",
        );
        values.push(Value::Integer(limit as i64));
        values.push(Value::Integer(offset));
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(values), |row| {
            Ok(RssItemSummary {
                id: row.get(0)?,
                feed_id: row.get(1)?,
                feed_title: row.get(2)?,
                feed_url: row.get(3)?,
                title: row.get(4)?,
                url: row.get(5)?,
                author: row.get(6)?,
                published_at: row.get(7)?,
                updated_at: row.get(8)?,
                first_seen_at: row.get(9)?,
                read_at: row.get(10)?,
                starred_at: row.get(11)?,
                summary_md: row.get(12)?,
                content_source: row.get(13)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub(crate) fn get_item(&self, id: &str) -> Result<Option<RssItemDetail>> {
        let conn = self.connection()?;
        let row = conn
            .query_row(
                "SELECT i.id, i.feed_id, COALESCE(f.title, f.url), f.url, i.title, i.url,
                        i.author, i.published_at, i.updated_at, i.first_seen_at, i.fetched_at,
                        i.read_at, i.starred_at, i.content_source, i.extraction_quality,
                        i.content_path, i.summary_md, i.html_path
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
                        row.get::<_, Option<String>>(17)?,
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
            html_path,
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
            content_path,
            content_markdown,
            html_path,
        }))
    }

    pub(crate) fn rendered_item_html(&self, item: &mut RssItemDetail) -> Result<String> {
        if let Some((cached_path, cached_html)) = item
            .html_path
            .as_deref()
            .and_then(|path| self.html_file_path(path))
            .and_then(|path| fs::read_to_string(&path).ok().map(|html| (path, html)))
            .filter(|(_, html)| !html.trim().is_empty())
        {
            let resolved_html = resolve_rss_html_image_sources(&cached_html, &item.url);
            if resolved_html != cached_html {
                fs::write(&cached_path, &resolved_html)
                    .with_context(|| format!("update RSS HTML {}", cached_path.display()))?;
            }
            return Ok(resolved_html);
        }

        let html =
            render_markdown_html_for_file(&item.content_markdown, &format!("rss/{}.md", item.id));
        let html = resolve_rss_html_image_sources(&html, &item.url);
        let html_path = format!("{HTML_DIR}/{}.html", item.id);
        self.write_item_html(&html_path, &html)?;
        let conn = self.connection()?;
        conn.execute(
            "UPDATE items SET html_path = ?2 WHERE id = ?1",
            params![item.id, html_path],
        )?;
        item.html_path = Some(html_path);
        Ok(html)
    }

    pub(crate) fn warm_item_html_cache(&self, ids: &[String]) -> Result<usize> {
        let mut warmed = 0;
        for id in ids {
            let Some(mut item) = self.get_item(id)? else {
                continue;
            };
            if item
                .html_path
                .as_deref()
                .and_then(|path| self.html_file_path(path))
                .is_some_and(|path| path.is_file())
            {
                continue;
            }
            self.rendered_item_html(&mut item)?;
            warmed += 1;
        }
        Ok(warmed)
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
            let mut stmt =
                conn.prepare("SELECT id, feed_id, content_path, html_path FROM items")?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })?;
            let mut removed_items = Vec::new();
            for row in rows {
                let (id, feed_id, content_path, html_path) = row?;
                if !active_feed_ids.contains(&feed_id) {
                    removed_items.push((id, content_path, html_path));
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
        for (id, _, _) in &removed_items {
            tx.execute("DELETE FROM items WHERE id = ?1", params![id])?;
        }
        for id in &removed_feeds {
            tx.execute("DELETE FROM feeds WHERE id = ?1", params![id])?;
        }
        tx.commit()?;

        for (_, content_path, html_path) in &removed_items {
            self.remove_data_file(content_path.as_deref(), CONTENT_DIR, "content");
            self.remove_data_file(html_path.as_deref(), HTML_DIR, "HTML cache");
        }

        Ok(PruneStats {
            feeds: removed_feeds.len(),
            items: removed_items.len(),
        })
    }

    fn content_file_path(&self, content_path: &str) -> Option<PathBuf> {
        data_file_path(&self.data_dir, content_path, CONTENT_DIR)
    }

    fn html_file_path(&self, html_path: &str) -> Option<PathBuf> {
        data_file_path(&self.data_dir, html_path, HTML_DIR)
    }

    fn write_item_html(&self, html_path: &str, html: &str) -> Result<()> {
        let path = self
            .html_file_path(html_path)
            .with_context(|| format!("unsafe RSS HTML path {html_path}"))?;
        fs::create_dir_all(&self.html_dir)
            .with_context(|| format!("create RSS HTML dir {}", self.html_dir.display()))?;
        fs::write(&path, html).with_context(|| format!("write RSS HTML {}", path.display()))?;
        Ok(())
    }

    fn remove_data_file(&self, relative_path: Option<&str>, root_dir: &str, label: &str) {
        let Some(relative_path) = relative_path else {
            return;
        };
        let Some(absolute_path) = data_file_path(&self.data_dir, relative_path, root_dir) else {
            warn!(
                path = relative_path,
                "skipping unsafe RSS data path during prune"
            );
            return;
        };
        if let Err(err) = fs::remove_file(&absolute_path)
            && err.kind() != std::io::ErrorKind::NotFound
        {
            warn!(
                path = %absolute_path.display(),
                error = %err,
                label = label,
                "failed to remove pruned RSS data file"
            );
        }
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
                self.update_existing_item(candidate)?;
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
            let (markdown, source) = article_markdown_preserving_feed_images(
                article.markdown,
                feed_content_md.as_deref(),
            );
            content_source = source.to_string();
            extraction_quality = (source == "article").then_some(article.quality);
            content_markdown = markdown;
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
        let content_markdown = normalize_markdown(&item.content_markdown);
        fs::write(&absolute_content_path, &content_markdown)
            .with_context(|| format!("write RSS item {}", absolute_content_path.display()))?;
        let html_path = format!("{HTML_DIR}/{}.html", item.id);
        let html = render_markdown_html_for_file(&content_markdown, &format!("rss/{}.md", item.id));
        let html = resolve_rss_html_image_sources(&html, &item.url);
        self.write_item_html(&html_path, &html)?;
        let search_text = build_item_search_text(
            &item.title,
            &item.url,
            item.author.as_deref(),
            item.summary_md.as_deref(),
            &content_markdown,
        );
        let seen_at = now_string();
        let sort_at = rss_item_sort_at(item.published_at.as_deref(), item.updated_at.as_deref());
        let conn = self.connection()?;
        conn.execute(
            "INSERT OR IGNORE INTO items (
                id, feed_id, feed_url, guid, url, title, author, published_at,
                updated_at, sort_at, summary_md, content_path, content_source,
                extraction_quality, first_seen_at, fetched_at, read_at, html_path, search_text
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15, NULL, ?16, ?17)",
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
                sort_at,
                item.summary_md,
                content_path,
                item.content_source,
                item.extraction_quality,
                seen_at,
                html_path,
                search_text,
            ],
        )?;
        Ok(())
    }

    fn update_existing_item(&self, item: ItemCandidate) -> Result<bool> {
        let Some(existing) = self.get_item(&item.id)? else {
            return Ok(false);
        };
        fs::create_dir_all(&self.content_dir)
            .with_context(|| format!("create RSS content dir {}", self.content_dir.display()))?;

        let content_path = existing
            .content_path
            .clone()
            .unwrap_or_else(|| format!("{CONTENT_DIR}/{}.md", item.id));
        let absolute_content_path = self
            .content_file_path(&content_path)
            .with_context(|| format!("unsafe RSS content path {content_path}"))?;
        let content_markdown = normalize_markdown(&item.content_markdown);
        let existing_content =
            fs::read_to_string(&absolute_content_path).unwrap_or(existing.content_markdown);
        let content_changed = existing_content != content_markdown;
        if content_changed {
            fs::write(&absolute_content_path, &content_markdown)
                .with_context(|| format!("write RSS item {}", absolute_content_path.display()))?;
        }

        let html_path = existing
            .html_path
            .clone()
            .unwrap_or_else(|| format!("{HTML_DIR}/{}.html", item.id));
        let html = render_markdown_html_for_file(&content_markdown, &format!("rss/{}.md", item.id));
        let html = resolve_rss_html_image_sources(&html, &item.url);
        let existing_html = self
            .html_file_path(&html_path)
            .and_then(|path| fs::read_to_string(path).ok())
            .unwrap_or_default();
        let html_changed = existing_html != html;
        if html_changed {
            self.write_item_html(&html_path, &html)?;
        }

        let search_text = build_item_search_text(
            &item.title,
            &item.url,
            item.author.as_deref(),
            item.summary_md.as_deref(),
            &content_markdown,
        );
        let sort_at = rss_item_sort_at(item.published_at.as_deref(), item.updated_at.as_deref());
        let conn = self.connection()?;
        conn.execute(
            "UPDATE items
             SET feed_id = ?2, feed_url = ?3, guid = ?4, url = ?5, title = ?6,
                 author = ?7, published_at = ?8, updated_at = ?9, sort_at = ?10,
                 summary_md = ?11, content_path = ?12, content_source = ?13,
                 extraction_quality = ?14, fetched_at = ?15, html_path = ?16,
                 search_text = ?17
             WHERE id = ?1",
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
                sort_at,
                item.summary_md,
                content_path,
                item.content_source,
                item.extraction_quality,
                now_string(),
                html_path,
                search_text,
            ],
        )?;
        Ok(content_changed || html_changed)
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
            sort_at TEXT,
            summary_md TEXT,
            content_path TEXT,
            html_path TEXT,
            search_text TEXT,
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
    ensure_column(&conn, "items", "html_path", "TEXT")?;
    ensure_column(&conn, "items", "search_text", "TEXT")?;
    ensure_column(&conn, "items", "sort_at", "TEXT")?;
    conn.execute(
        "UPDATE items
         SET sort_at = COALESCE(NULLIF(published_at, ''), NULLIF(updated_at, ''))",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_items_read_sort ON items(read_at, sort_at DESC)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_items_sort ON items(sort_at DESC)",
        [],
    )?;
    if let Some(data_dir) = path.parent() {
        backfill_email_markdown_content(&conn, data_dir)?;
        backfill_item_search_text(&conn, data_dir)?;
    }
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

fn backfill_email_markdown_content(conn: &Connection, data_dir: &Path) -> Result<()> {
    let mut stmt = conn.prepare(
        "SELECT id, title, url, author, summary_md, content_path, html_path
         FROM items
         WHERE content_path IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
        ))
    })?;
    let rows = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    for (id, title, url, author, summary_md, content_path, html_path) in rows {
        let Some(content_path) = content_path else {
            continue;
        };
        let Some(absolute_content_path) = data_file_path(data_dir, &content_path, CONTENT_DIR)
        else {
            continue;
        };
        let Ok(existing_content) = fs::read_to_string(&absolute_content_path) else {
            continue;
        };
        let cleaned_content = normalize_markdown(&clean_html_email_markdown(&existing_content));
        if cleaned_content == existing_content {
            continue;
        }

        fs::write(&absolute_content_path, &cleaned_content)
            .with_context(|| format!("write RSS item {}", absolute_content_path.display()))?;
        let html_path = html_path.unwrap_or_else(|| format!("{HTML_DIR}/{id}.html"));
        let html = render_markdown_html_for_file(&cleaned_content, &format!("rss/{id}.md"));
        let html = resolve_rss_html_image_sources(&html, &url);
        let absolute_html_path = data_file_path(data_dir, &html_path, HTML_DIR)
            .with_context(|| format!("unsafe RSS HTML path {html_path}"))?;
        if let Some(parent) = absolute_html_path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("create RSS HTML dir {}", parent.display()))?;
        }
        fs::write(&absolute_html_path, html)
            .with_context(|| format!("write RSS HTML {}", absolute_html_path.display()))?;
        let search_text = build_item_search_text(
            &title,
            &url,
            author.as_deref(),
            summary_md.as_deref(),
            &cleaned_content,
        );
        conn.execute(
            "UPDATE items SET html_path = ?2, search_text = ?3 WHERE id = ?1",
            params![id, html_path, search_text],
        )?;
    }
    Ok(())
}

fn backfill_item_search_text(conn: &Connection, data_dir: &Path) -> Result<()> {
    let mut stmt = conn.prepare(
        "SELECT id, title, url, author, summary_md, content_path
         FROM items
         WHERE search_text IS NULL OR search_text = ''",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
        ))
    })?;
    let rows = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    if rows.is_empty() {
        return Ok(());
    }

    for (id, title, url, author, summary_md, content_path) in rows {
        let content_markdown = content_path
            .as_deref()
            .and_then(|path| data_file_path(data_dir, path, CONTENT_DIR))
            .and_then(|path| fs::read_to_string(path).ok())
            .unwrap_or_default();
        let search_text = build_item_search_text(
            &title,
            &url,
            author.as_deref(),
            summary_md.as_deref(),
            &content_markdown,
        );
        conn.execute(
            "UPDATE items SET search_text = ?2 WHERE id = ?1",
            params![id, search_text],
        )?;
    }
    Ok(())
}

fn data_file_path(data_dir: &Path, relative_path: &str, root_dir: &str) -> Option<PathBuf> {
    let path = Path::new(relative_path);
    if path.is_absolute()
        || !path.starts_with(root_dir)
        || path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return None;
    }
    Some(data_dir.join(path))
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

fn sql_like_pattern(term: &str) -> String {
    let mut pattern = String::with_capacity(term.len() + 2);
    pattern.push('%');
    for ch in term.chars() {
        if matches!(ch, '%' | '_' | '\\') {
            pattern.push('\\');
        }
        pattern.push(ch);
    }
    pattern.push('%');
    pattern
}

fn build_item_search_text(
    title: &str,
    url: &str,
    author: Option<&str>,
    summary_md: Option<&str>,
    content_markdown: &str,
) -> String {
    [
        title,
        url,
        author.unwrap_or_default(),
        summary_md.unwrap_or_default(),
        content_markdown,
    ]
    .join("\n")
    .to_lowercase()
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
        clean_html_email_markdown(&html2markdown::convert(content))
    } else {
        content.to_string()
    };
    normalize_markdown(&markdown)
}

fn normalize_markdown(markdown: &str) -> String {
    let normalized = markdown.replace("\r\n", "\n").replace('\r', "\n");
    let normalized = clean_markdown_heading_strong_markers(&normalized);
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("{trimmed}\n")
    }
}

fn clean_markdown_heading_strong_markers(markdown: &str) -> String {
    markdown
        .lines()
        .map(clean_markdown_heading_strong_marker)
        .collect::<Vec<_>>()
        .join("\n")
}

fn clean_markdown_heading_strong_marker(line: &str) -> String {
    let Some((prefix, rest)) = split_markdown_heading(line) else {
        return line.to_string();
    };
    let Some(after_open) = rest.strip_prefix("**") else {
        return line.to_string();
    };
    let Some(close_index) = after_open.find("**") else {
        return line.to_string();
    };
    let marker = &after_open[..close_index];
    let Some(clean_marker) = clean_ordered_heading_marker(marker) else {
        return line.to_string();
    };
    format!("{prefix}{clean_marker}{}", &after_open[close_index + 2..])
}

fn split_markdown_heading(line: &str) -> Option<(&str, &str)> {
    let heading_marks = line.bytes().take_while(|byte| *byte == b'#').count();
    if heading_marks == 0 || heading_marks > 6 {
        return None;
    }
    let after_marks = &line[heading_marks..];
    let space_bytes = after_marks
        .bytes()
        .take_while(|byte| byte.is_ascii_whitespace())
        .count();
    if space_bytes == 0 {
        return None;
    }
    let rest_start = heading_marks + space_bytes;
    Some((&line[..rest_start], &line[rest_start..]))
}

fn clean_ordered_heading_marker(marker: &str) -> Option<String> {
    let trimmed = marker.trim_matches(is_markdown_space);
    let number = trimmed.strip_suffix('.')?;
    if number.is_empty() || !number.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    Some(format!("{trimmed} "))
}

fn is_markdown_space(ch: char) -> bool {
    ch.is_whitespace() || ch == '\u{00a0}'
}

fn clean_html_email_markdown(markdown: &str) -> String {
    if !looks_like_html_email_markdown(markdown) {
        return markdown.to_string();
    }

    let without_comments = strip_html_comments(markdown);
    let lines = without_comments.lines().collect::<Vec<_>>();
    let mut cleaned = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        if is_markdown_table_separator(lines[index]) {
            index += 1;
            continue;
        }
        if is_markdown_table_row(lines[index]) {
            let mut block = Vec::new();
            while index < lines.len()
                && (is_markdown_table_row(lines[index])
                    || is_markdown_table_separator(lines[index]))
            {
                block.push(lines[index]);
                index += 1;
            }
            cleaned.extend(unwrap_email_markdown_table(&block));
            continue;
        }

        let line = clean_email_markdown_line(lines[index]);
        if !should_drop_email_markdown_line(&line) {
            cleaned.push(line);
        }
        index += 1;
    }

    compact_markdown_blank_lines(cleaned)
}

fn looks_like_html_email_markdown(markdown: &str) -> bool {
    markdown.contains("Outlook doesn't respect max-width")
        || markdown.contains("SPACING TO AVOID BODY TEXT")
        || markdown.contains("END CENTERED WHITE CONTAINER")
        || markdown.contains("<!--[if mso]>")
}

fn strip_html_comments(markdown: &str) -> String {
    let mut output = String::with_capacity(markdown.len());
    let mut rest = markdown;
    while let Some(start) = rest.find("<!--") {
        output.push_str(&rest[..start]);
        let after_start = &rest[start + 4..];
        if let Some(end) = after_start.find("-->") {
            rest = &after_start[end + 3..];
        } else {
            return output;
        }
    }
    output.push_str(rest);
    output
}

fn unwrap_email_markdown_table(block: &[&str]) -> Vec<String> {
    let mut output = Vec::new();
    for line in block {
        if is_markdown_table_separator(line) {
            continue;
        }
        let cells = split_markdown_table_row(line);
        let Some(cell) = cells
            .iter()
            .map(|cell| clean_email_markdown_cell(cell))
            .filter(|cell| !should_drop_email_markdown_line(cell))
            .max_by_key(|cell| cell.chars().count())
        else {
            continue;
        };
        for part in cell.lines().map(clean_email_markdown_line) {
            if !should_drop_email_markdown_line(&part) {
                output.push(part);
                output.push(String::new());
            }
        }
    }
    output
}

fn split_markdown_table_row(row: &str) -> Vec<String> {
    let trimmed = row.trim();
    let inner = trimmed.strip_prefix('|').unwrap_or(trimmed);
    let inner = inner.strip_suffix('|').unwrap_or(inner);
    let mut cells = Vec::new();
    let mut current = String::new();
    let mut escaped = false;
    for ch in inner.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            current.push(ch);
            continue;
        }
        if ch == '|' {
            cells.push(current.trim().to_string());
            current.clear();
        } else {
            current.push(ch);
        }
    }
    cells.push(current.trim().to_string());
    cells
}

fn clean_email_markdown_cell(cell: &str) -> String {
    let decoded = decode_email_markdown_entities(cell);
    decoded
        .lines()
        .map(clean_email_markdown_line)
        .filter(|line| !should_drop_email_markdown_line(line))
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn clean_email_markdown_line(line: &str) -> String {
    decode_email_markdown_entities(line)
        .replace("\\|", "|")
        .replace("在浏览器中打开", "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn decode_email_markdown_entities(value: &str) -> String {
    value
        .replace("&#xA;", "\n")
        .replace("&#10;", "\n")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
}

fn is_markdown_table_row(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.starts_with('|') && trimmed.ends_with('|') && trimmed.matches('|').count() >= 3
}

fn is_markdown_table_separator(line: &str) -> bool {
    let trimmed = line.trim();
    if !is_markdown_table_row(trimmed) {
        return false;
    }
    trimmed
        .trim_matches('|')
        .chars()
        .all(|ch| ch.is_ascii_whitespace() || matches!(ch, '-' | ':' | '|'))
}

fn should_drop_email_markdown_line(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.is_empty()
        || trimmed == "-"
        || trimmed == "在浏览器中打开"
        || trimmed == "评论"
        || trimmed == "YouTube｜BiliBili"
        || trimmed.contains("取消订阅")
        || trimmed.contains("Kill the Newsletter! feed settings")
        || trimmed
            .chars()
            .all(|ch| ch.is_whitespace() || is_email_preview_filler(ch))
}

fn is_email_preview_filler(ch: char) -> bool {
    matches!(
        ch,
        '\u{00a0}' | '\u{00ad}' | '\u{034f}' | '\u{2007}' | '\u{200c}' | '\u{200d}'
    )
}

fn compact_markdown_blank_lines(lines: Vec<String>) -> String {
    let mut output = Vec::new();
    let mut previous_blank = true;
    for line in lines {
        let blank = line.trim().is_empty();
        if blank {
            if !previous_blank {
                output.push(String::new());
            }
        } else {
            output.push(line);
        }
        previous_blank = blank;
    }
    while output.last().is_some_and(|line| line.trim().is_empty()) {
        output.pop();
    }
    output.join("\n")
}

fn rss_item_sort_at(published_at: Option<&str>, updated_at: Option<&str>) -> Option<String> {
    published_at
        .filter(|value| !value.trim().is_empty())
        .or_else(|| updated_at.filter(|value| !value.trim().is_empty()))
        .map(ToString::to_string)
}

fn article_markdown_preserving_feed_images(
    article_markdown: String,
    feed_content_markdown: Option<&str>,
) -> (String, &'static str) {
    let Some(feed_markdown) = feed_content_markdown else {
        return (article_markdown, "article");
    };
    let article_images = markdown_image_count(&article_markdown);
    let feed_images = markdown_image_count(feed_markdown);
    let article_links = markdown_link_count(&article_markdown);
    let feed_links = markdown_link_count(feed_markdown);
    let article_len = article_markdown.trim().len();
    let feed_len = feed_markdown.trim().len();
    let feed_is_link_poor = article_links >= 2 && feed_links.saturating_mul(2) < article_links;
    if feed_images > article_images
        && !feed_is_link_poor
        && feed_len >= article_len.saturating_mul(3) / 5
    {
        (feed_markdown.to_string(), "feed_content")
    } else {
        (article_markdown, "article")
    }
}

fn markdown_image_count(markdown: &str) -> usize {
    markdown.match_indices("![").count()
}

fn markdown_link_count(markdown: &str) -> usize {
    let inline_links = markdown
        .match_indices("](")
        .count()
        .saturating_sub(markdown_image_count(markdown));
    let reference_links = markdown
        .lines()
        .filter(|line| {
            let trimmed = line.trim_start();
            trimmed.starts_with('[') && trimmed.contains("]: http")
        })
        .count();
    inline_links + reference_links
}

fn resolve_rss_html_image_sources(html: &str, base_url: &str) -> String {
    let Ok(base) = Url::parse(base_url) else {
        return html.to_string();
    };
    let mut output = String::with_capacity(html.len());
    let mut offset = 0;

    while let Some(relative_start) = find_case_insensitive(&html[offset..], "<img") {
        let start = offset + relative_start;
        output.push_str(&html[offset..start]);
        let Some(tag_end_offset) = html[start..].find('>') else {
            output.push_str(&html[start..]);
            return output;
        };
        let tag_end = start + tag_end_offset + 1;
        let tag = &html[start..tag_end];
        if is_img_tag(tag) {
            output.push_str(&resolve_img_tag_src(tag, &base));
        } else {
            output.push_str(tag);
        }
        offset = tag_end;
    }

    output.push_str(&html[offset..]);
    output
}

fn is_img_tag(tag: &str) -> bool {
    let mut chars = tag.chars();
    matches!(chars.next(), Some('<'))
        && matches!(chars.next(), Some(ch) if ch.eq_ignore_ascii_case(&'i'))
        && matches!(chars.next(), Some(ch) if ch.eq_ignore_ascii_case(&'m'))
        && matches!(chars.next(), Some(ch) if ch.eq_ignore_ascii_case(&'g'))
        && chars
            .next()
            .map(|ch| ch.is_ascii_whitespace() || ch == '/' || ch == '>')
            .unwrap_or(true)
}

fn resolve_img_tag_src(tag: &str, base: &Url) -> String {
    let Some(src_range) = find_html_attr_value(tag, "src") else {
        return tag.to_string();
    };
    let src = &tag[src_range.clone()];
    let resolved = resolve_rss_image_src(src, base);
    if resolved == src {
        return tag.to_string();
    }
    let resolved = escape_html_attr(&resolved);

    let mut output = String::with_capacity(tag.len() + resolved.len().saturating_sub(src.len()));
    output.push_str(&tag[..src_range.start]);
    output.push_str(&resolved);
    output.push_str(&tag[src_range.end..]);
    output
}

fn find_html_attr_value(tag: &str, attr_name: &str) -> Option<std::ops::Range<usize>> {
    let bytes = tag.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        while index < bytes.len()
            && !bytes[index].is_ascii_alphabetic()
            && bytes[index] != b'_'
            && bytes[index] != b':'
        {
            index += 1;
        }
        let name_start = index;
        while index < bytes.len()
            && (bytes[index].is_ascii_alphanumeric() || matches!(bytes[index], b'-' | b'_' | b':'))
        {
            index += 1;
        }
        if name_start == index {
            break;
        }
        let name = &tag[name_start..index];
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        if index >= bytes.len() || bytes[index] != b'=' {
            continue;
        }
        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        if index >= bytes.len() {
            break;
        }
        let value = if matches!(bytes[index], b'\'' | b'"') {
            let quote = bytes[index];
            index += 1;
            let value_start = index;
            while index < bytes.len() && bytes[index] != quote {
                index += 1;
            }
            let value_end = index;
            if index < bytes.len() {
                index += 1;
            }
            value_start..value_end
        } else {
            let value_start = index;
            while index < bytes.len() && !bytes[index].is_ascii_whitespace() && bytes[index] != b'>'
            {
                index += 1;
            }
            value_start..index
        };
        if name.eq_ignore_ascii_case(attr_name) {
            return Some(value);
        }
    }
    None
}

fn resolve_rss_image_src(src: &str, base: &Url) -> String {
    let decoded = decode_html_attr_entities(src);
    let trimmed = decoded.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('#')
        || trimmed.starts_with("data:")
        || trimmed.starts_with("blob:")
        || trimmed.starts_with("cid:")
    {
        return src.to_string();
    }

    let Ok(resolved) = base.join(trimmed) else {
        return src.to_string();
    };
    if matches!(resolved.scheme(), "http" | "https") {
        resolved.to_string()
    } else {
        src.to_string()
    }
}

fn decode_html_attr_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn find_case_insensitive(haystack: &str, needle: &str) -> Option<usize> {
    if needle.is_empty() {
        return Some(0);
    }
    haystack
        .as_bytes()
        .windows(needle.len())
        .position(|window| window.eq_ignore_ascii_case(needle.as_bytes()))
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
    fn markup_to_markdown_preserves_images() {
        let markdown = markup_to_markdown(
            r#"<p><img src="http://catcoding.me/images/ob_pasted-image.png" alt="" /></p>"#,
            "html",
        );

        assert!(markdown.contains("http://catcoding.me/images/ob_pasted-image.png"));
        assert!(markdown.contains("!["));
    }

    #[test]
    fn markup_to_markdown_unwraps_email_layout_tables() {
        let markdown = markup_to_markdown(
            r#"
            <!-- SPACING TO AVOID BODY TEXT BEING DUPLICATED IN PREVIEW TEXT -->
            &#x2007;&#x034f;&#x2007;&#x034f;
            <table>
              <tr>
                <td><!-- Outlook doesn't respect max-width so we need an extra centered table --></td>
                <td>看不见的底层机制<br>作者 DSH • 2026年4月24日<br>在浏览器中打开</td>
                <td><!--[if mso]>ignored<![endif]--></td>
              </tr>
            </table>
            <table>
              <tr>
                <td><!-- Outlook doesn't respect max-width so we need an extra centered table --></td>
                <td>The Mathematical Reason Most People Never &quot;Make It&quot;<br>推荐语：正文<br>How understanding bioenergetics can help our brain health | Aeon Essays</td>
                <td><!--[if mso]>ignored<![endif]--></td>
              </tr>
            </table>
            "#,
            "html",
        );

        assert!(markdown.contains("看不见的底层机制"));
        assert!(markdown.contains("The Mathematical Reason Most People Never"));
        assert!(markdown.contains("How understanding bioenergetics"));
        assert!(!markdown.contains("| ---"));
        assert!(!markdown.contains("<table"));
        assert!(!markdown.contains("Outlook doesn't respect"));
        assert!(!markdown.contains("在浏览器中打开"));
    }

    #[test]
    fn markup_to_markdown_preserves_email_table_links() {
        let markdown = markup_to_markdown(
            r#"
            <!-- SPACING TO AVOID BODY TEXT BEING DUPLICATED IN PREVIEW TEXT -->
            <table>
              <tr>
                <td><!-- Outlook doesn't respect max-width so we need an extra centered table --></td>
                <td>
                  <h2 style="margin: 0 0 0.5em 0;">
                    1.&nbsp;<a href="https://example.test/story?m=abc&amp;u=def" rel="noopener nofollow" style="overflow-wrap: anywhere; color: #DC4B4F; text-decoration: underline;" target="_blank">Appearing Productive in The Workplace</a>
                  </h2>
                  <p>推荐语：正文</p>
                </td>
                <td><!--[if mso]>ignored<![endif]--></td>
              </tr>
            </table>
            "#,
            "html",
        );

        assert!(markdown.contains(
            "[Appearing Productive in The Workplace](https://example.test/story?m=abc&u=def)"
        ));
    }

    #[test]
    fn normalize_markdown_cleans_broken_numbered_heading_bold() {
        let markdown = normalize_markdown(concat!(
            "## **1.\u{00a0}**[**What would you do?**](https://example.test/story)\n",
            "\n",
            "## **Important**\n"
        ));

        assert!(markdown.contains("## 1. [**What would you do?**](https://example.test/story)"));
        assert!(markdown.contains("## **Important**"));
        assert!(!markdown.contains("**1."));
    }

    #[test]
    fn resolves_rss_html_image_sources_against_item_url() {
        let html = r#"<p><img src="/img/a.jpg"><IMG alt="b" SRC='b.png'><img src="https://cdn.example.test/c.png"><img src="/img/query.jpg?a=1&amp;b=2"><img src="data:image/png;base64,abc"><image src="/not-img"></p>"#;
        let resolved =
            resolve_rss_html_image_sources(html, "https://example.test/posts/story/index.html");

        assert!(resolved.contains(r#"<img src="https://example.test/img/a.jpg">"#));
        assert!(resolved.contains(r#"<IMG alt="b" SRC='https://example.test/posts/story/b.png'>"#));
        assert!(resolved.contains(r#"<img src="https://cdn.example.test/c.png">"#));
        assert!(resolved.contains(r#"<img src="https://example.test/img/query.jpg?a=1&amp;b=2">"#));
        assert!(resolved.contains(r#"<img src="data:image/png;base64,abc">"#));
        assert!(resolved.contains(r#"<image src="/not-img">"#));
    }

    #[test]
    fn article_markdown_uses_feed_content_when_extraction_drops_images() {
        let article = "Intro\n\nText\n\nEnding".to_string();
        let feed = "Intro\n\n![](https://example.test/a.png)\n\nText\n\nEnding";
        let (markdown, source) = article_markdown_preserving_feed_images(article, Some(feed));

        assert_eq!(source, "feed_content");
        assert!(markdown.contains("https://example.test/a.png"));
    }

    #[test]
    fn article_markdown_keeps_article_when_feed_drops_links() {
        let article = [
            "Intro",
            "[First](https://example.test/one)",
            "[Second](https://example.test/two)",
            "Text",
            "Ending",
        ]
        .join("\n\n");
        let feed = "Intro\n\n![](https://example.test/a.png)\n\nFirst\n\nSecond\n\nText\n\nEnding";
        let (markdown, source) = article_markdown_preserving_feed_images(article, Some(feed));

        assert_eq!(source, "article");
        assert!(markdown.contains("[First](https://example.test/one)"));
        assert!(!markdown.contains("https://example.test/a.png"));
    }

    #[test]
    fn article_markdown_keeps_article_when_feed_is_only_a_short_teaser() {
        let article = "Long article ".repeat(40);
        let feed = "![](https://example.test/a.png)\n\nTeaser";
        let (markdown, source) = article_markdown_preserving_feed_images(article, Some(feed));

        assert_eq!(source, "article");
        assert!(!markdown.contains("https://example.test/a.png"));
    }

    #[test]
    fn rendered_item_html_resolves_and_updates_cached_relative_images() -> Result<()> {
        let (reader, root) = test_reader()?;
        let item_id = insert_test_item(&reader, "https://example.test/feed.xml", "image-cache")?;
        let html_path = reader.html_dir.join(format!("{item_id}.html"));
        fs::write(&html_path, r#"<p><img src="/img/a.jpg"></p>"#)?;

        let mut item = reader.get_item(&item_id)?.unwrap();
        let html = reader.rendered_item_html(&mut item)?;

        assert!(html.contains(r#"src="https://example.test/img/a.jpg""#));
        assert!(
            fs::read_to_string(&html_path)?.contains(r#"src="https://example.test/img/a.jpg""#)
        );
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn update_existing_item_refreshes_content_and_html_cache() -> Result<()> {
        let (reader, root) = test_reader()?;
        let feed_url = "https://example.test/feed.xml";
        let guid = "update-existing";
        let item_id = insert_test_item(&reader, feed_url, guid)?;
        let feed_id = stable_id("feed", feed_url);

        assert!(reader.update_existing_item(ItemCandidate {
            id: item_id.clone(),
            feed_id,
            feed_url: feed_url.to_string(),
            guid: guid.to_string(),
            url: "https://example.test/posts/story/".to_string(),
            title: "Updated post".to_string(),
            author: None,
            published_at: None,
            updated_at: None,
            summary_md: Some("Updated summary".to_string()),
            content_markdown: "Full text\n\n![](/images/a.png)".to_string(),
            content_source: "feed_content".to_string(),
            extraction_quality: None,
        })?);

        let item = reader.get_item(&item_id)?.unwrap();
        assert!(item.content_markdown.contains("![](/images/a.png)"));
        let html = fs::read_to_string(reader.html_dir.join(format!("{item_id}.html")))?;
        assert!(html.contains(r#"src="https://example.test/images/a.png""#));
        fs::remove_dir_all(root)?;
        Ok(())
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
            "UPDATE items SET title = ?1, summary_md = ?2, search_text = ?3 WHERE id = ?4",
            params![
                "Ownership update",
                "Borrow checker links",
                build_item_search_text(
                    "Ownership update",
                    &format!("https://example.test/{item_id}"),
                    None,
                    Some("Borrow checker links"),
                    "A lifetimes deep dive.\n",
                ),
                item_id,
            ],
        )?;
        fs::write(
            reader
                .data_dir
                .join(CONTENT_DIR)
                .join(format!("{item_id}.md")),
            "A lifetimes deep dive.\n",
        )?;

        let by_feed = reader.list_items(RssItemFilter::Unread, 10, 0, Some("rust"))?;
        let by_title_and_summary =
            reader.list_items(RssItemFilter::Unread, 10, 0, Some("ownership borrow"))?;
        let by_content = reader.list_items(RssItemFilter::Unread, 10, 0, Some("lifetimes"))?;
        let no_match = reader.list_items(RssItemFilter::Unread, 10, 0, Some("python"))?;

        assert_eq!(by_feed.len(), 1);
        assert_eq!(by_title_and_summary.len(), 1);
        assert_eq!(by_content.len(), 1);
        assert!(no_match.is_empty());
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn list_items_returns_short_summary_preview() -> Result<()> {
        let (reader, root) = test_reader()?;
        let item_id = insert_test_item(&reader, "https://example.test/feed.xml", "long-summary")?;
        let long_summary = "x".repeat(RSS_LIST_SUMMARY_CHARS + 200);
        let conn = reader.connection()?;
        conn.execute(
            "UPDATE items SET summary_md = ?1, search_text = ?2 WHERE id = ?3",
            params![
                long_summary,
                build_item_search_text(
                    "Example post",
                    "https://example.test/long-summary",
                    None,
                    Some(&"x".repeat(RSS_LIST_SUMMARY_CHARS + 200)),
                    "Full text",
                ),
                item_id,
            ],
        )?;

        let items = reader.list_items(RssItemFilter::Unread, 10, 0, None)?;

        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0].summary_md.as_deref().unwrap_or_default().len(),
            RSS_LIST_SUMMARY_CHARS
        );
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn list_items_uses_offset_for_pagination() -> Result<()> {
        let (reader, root) = test_reader()?;
        let first = insert_test_item(&reader, "https://example.test/feed.xml", "first-page")?;
        let second = insert_test_item(&reader, "https://example.test/feed.xml", "second-page")?;
        let conn = reader.connection()?;
        conn.execute(
            "UPDATE items SET sort_at = ?1 WHERE id = ?2",
            params!["2026-05-25T00:00:02Z", first],
        )?;
        conn.execute(
            "UPDATE items SET sort_at = ?1 WHERE id = ?2",
            params!["2026-05-25T00:00:01Z", second],
        )?;

        let page_one = reader.list_items(RssItemFilter::Unread, 1, 0, None)?;
        let page_two = reader.list_items(RssItemFilter::Unread, 1, 1, None)?;

        assert_eq!(page_one.len(), 1);
        assert_eq!(page_two.len(), 1);
        assert_eq!(page_one[0].id, first);
        assert_eq!(page_two[0].id, second);
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn list_items_orders_unknown_dates_after_published_dates() -> Result<()> {
        let (reader, root) = test_reader()?;
        let feed_url = "https://example.test/feed.xml";
        let unknown = insert_test_item(&reader, feed_url, "unknown-date")?;
        let feed_id = stable_id("feed", feed_url);
        let dated = stable_id("item", "published-date");
        reader.insert_item(ItemCandidate {
            id: dated.clone(),
            feed_id,
            feed_url: feed_url.to_string(),
            guid: "published-date".to_string(),
            url: "https://example.test/published-date".to_string(),
            title: "Published post".to_string(),
            author: None,
            published_at: Some("2020-01-01T00:00:00Z".to_string()),
            updated_at: None,
            summary_md: Some("Summary".to_string()),
            content_markdown: "Full text".to_string(),
            content_source: "summary".to_string(),
            extraction_quality: None,
        })?;

        let conn = reader.connection()?;
        let unknown_sort_at: Option<String> = conn.query_row(
            "SELECT sort_at FROM items WHERE id = ?1",
            params![&unknown],
            |row| row.get(0),
        )?;
        let items = reader.list_items(RssItemFilter::Unread, 10, 0, None)?;

        assert_eq!(unknown_sort_at, None);
        assert_eq!(items[0].id, dated);
        assert_eq!(
            items.last().map(|item| item.id.as_str()),
            Some(unknown.as_str())
        );
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn rendered_item_html_creates_cache_for_legacy_item() -> Result<()> {
        let (reader, root) = test_reader()?;
        let item_id = insert_test_item(&reader, "https://example.test/feed.xml", "html-cache")?;
        let legacy_html_path = reader.html_dir.join(format!("{item_id}.html"));
        let conn = reader.connection()?;
        conn.execute(
            "UPDATE items SET html_path = NULL WHERE id = ?1",
            params![item_id],
        )?;
        let _ = fs::remove_file(&legacy_html_path);

        let mut item = reader.get_item(&item_id)?.unwrap();
        assert!(item.html_path.is_none());
        let html = reader.rendered_item_html(&mut item)?;

        assert!(html.contains("Full text"));
        assert!(item.html_path.is_some());
        assert!(reader.html_dir.join(format!("{item_id}.html")).exists());
        fs::remove_dir_all(root)?;
        Ok(())
    }

    #[test]
    fn item_detail_json_omits_raw_markdown_and_cache_path() -> Result<()> {
        let detail = RssItemDetail {
            id: "item".to_string(),
            feed_id: "feed".to_string(),
            feed_title: "Feed".to_string(),
            feed_url: "https://example.test/feed.xml".to_string(),
            title: "Title".to_string(),
            url: "https://example.test/post".to_string(),
            author: None,
            published_at: None,
            updated_at: None,
            first_seen_at: "2026-05-25T00:00:00Z".to_string(),
            fetched_at: None,
            read_at: None,
            starred_at: None,
            content_source: "summary".to_string(),
            extraction_quality: None,
            content_path: Some("content/item.md".to_string()),
            content_markdown: "raw markdown should not cross the wire".to_string(),
            html_path: Some("html/item.html".to_string()),
        };

        let value = serde_json::to_value(detail)?;

        assert!(value.get("content_markdown").is_none());
        assert!(value.get("content_path").is_none());
        assert!(value.get("html_path").is_none());
        assert_eq!(
            value.get("title").and_then(|title| title.as_str()),
            Some("Title")
        );
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
        let html_dir = data_dir.join(HTML_DIR);
        fs::create_dir_all(&vault_path)?;
        fs::create_dir_all(&content_dir)?;
        fs::create_dir_all(&html_dir)?;
        let db_path = data_dir.join("rss.sqlite");
        init_db(&db_path)?;
        Ok((
            RssReader {
                vault_path,
                feeds_path: PathBuf::from("feeds.md"),
                data_dir,
                db_path,
                content_dir,
                html_dir,
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
