use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow, bail};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use reqwest::{
    Client,
    header::{CONTENT_TYPE, HOST, HeaderMap, HeaderValue},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::time::sleep;
use tracing::info;
use url::Url;

type HmacSha256 = Hmac<Sha256>;

const TENCENT_ACTION_TEXT_TRANSLATE: &str = "TextTranslate";
const TENCENT_API_VERSION: &str = "2018-03-21";
const TENCENT_SERVICE: &str = "tmt";
const TENCENT_ALGORITHM: &str = "TC3-HMAC-SHA256";
const TENCENT_SIGNED_HEADERS: &str = "content-type;host";
const TENCENT_CONTENT_TYPE: &str = "application/json; charset=utf-8";
const TENCENT_REQUEST_GAP: Duration = Duration::from_millis(220);

#[derive(Debug, Clone)]
pub(crate) struct TencentTranslateConfig {
    pub(crate) secret_id: String,
    pub(crate) secret_key: String,
    pub(crate) endpoint: String,
    pub(crate) region: String,
    pub(crate) source: String,
    pub(crate) target: String,
    pub(crate) project_id: i64,
    pub(crate) max_chars: usize,
}

impl TencentTranslateConfig {
    pub(crate) fn model_name(&self) -> String {
        format!("tencent-tmt:{}-{}", self.source, self.target)
    }
}

pub(crate) async fn translate_markdown_bilingual(
    client: &Client,
    config: &TencentTranslateConfig,
    markdown: &str,
) -> Result<String> {
    let segments = markdown_translation_segments(markdown, config.max_chars);
    let mut output = Vec::with_capacity(segments.len());
    let mut translated_any = false;

    for segment in segments {
        match segment {
            MarkdownTranslationSegment::Original(markdown) => output.push(markdown),
            MarkdownTranslationSegment::Translatable(source) => {
                let translated = normalize_tencent_markdown_translation(
                    &translate_text_chunks(client, config, &source).await?,
                );
                if translated.trim().is_empty() {
                    output.push(source);
                    continue;
                }
                translated_any = true;
                output.push(format!(
                    "{}\n\n{}",
                    source.trim(),
                    quote_markdown_translation(&translated)
                ));
            }
        }
    }

    translated_any
        .then(|| output.join("\n\n"))
        .ok_or_else(|| anyhow!("Tencent translation returned no translated content"))
}

async fn translate_text_chunks(
    client: &Client,
    config: &TencentTranslateConfig,
    text: &str,
) -> Result<String> {
    let chunks = split_text_chunks(text, config.max_chars);
    let mut translated = Vec::with_capacity(chunks.len());
    for (index, chunk) in chunks.iter().enumerate() {
        if index > 0 {
            sleep(TENCENT_REQUEST_GAP).await;
        }
        translated.push(translate_text(client, config, chunk).await?);
    }
    Ok(translated.join("\n"))
}

async fn translate_text(
    client: &Client,
    config: &TencentTranslateConfig,
    source_text: &str,
) -> Result<String> {
    let endpoint = config.endpoint.trim();
    let payload = TencentTextTranslateRequest {
        source_text,
        source: &config.source,
        target: &config.target,
        project_id: config.project_id,
    };
    let request_body =
        serde_json::to_vec(&payload).context("serialize Tencent translation request")?;
    let timestamp = current_unix_timestamp()?;
    let (host, authorization) = tc3_authorization(config, timestamp, &request_body)?;
    let started = std::time::Instant::now();
    info!(
        source_chars = source_text.chars().count(),
        "Tencent translation request"
    );
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static(TENCENT_CONTENT_TYPE));
    headers.insert(
        HOST,
        HeaderValue::from_str(&host).context("build Tencent host header")?,
    );
    headers.insert(
        "X-TC-Action",
        HeaderValue::from_static(TENCENT_ACTION_TEXT_TRANSLATE),
    );
    headers.insert(
        "X-TC-Version",
        HeaderValue::from_static(TENCENT_API_VERSION),
    );
    headers.insert(
        "X-TC-Timestamp",
        HeaderValue::from_str(&timestamp.to_string()).context("build Tencent timestamp header")?,
    );
    headers.insert(
        "X-TC-Region",
        HeaderValue::from_str(config.region.trim()).context("build Tencent region header")?,
    );
    headers.insert(
        "Authorization",
        HeaderValue::from_str(&authorization).context("build Tencent authorization header")?,
    );

    let response = client
        .post(endpoint)
        .headers(headers)
        .body(request_body)
        .send()
        .await
        .context("request Tencent translation")?;
    let status = response.status();
    let body = response
        .text()
        .await
        .context("read Tencent translation response")?;
    info!(
        status = %status,
        elapsed_ms = started.elapsed().as_millis(),
        "Tencent translation response"
    );
    if !status.is_success() {
        bail!(
            "Tencent translation returned HTTP {}: {}",
            status,
            truncate_chars(&body, 240)
        );
    }
    let parsed: TencentTextTranslateEnvelope =
        serde_json::from_str(&body).context("parse Tencent translation response")?;
    if let Some(error) = parsed.response.error {
        bail!(
            "Tencent translation error {}: {}",
            error.code,
            error.message
        );
    }
    parsed
        .response
        .target_text
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
        .ok_or_else(|| anyhow!("Tencent translation response did not include TargetText"))
}

fn tc3_authorization(
    config: &TencentTranslateConfig,
    timestamp: i64,
    payload: &[u8],
) -> Result<(String, String)> {
    let endpoint = Url::parse(config.endpoint.trim()).context("parse Tencent endpoint")?;
    let host = endpoint_host(&endpoint)?;
    let path = if endpoint.path().is_empty() {
        "/"
    } else {
        endpoint.path()
    };
    let query = endpoint.query().unwrap_or_default();
    let hashed_payload = sha256_hex(payload);
    let canonical_headers = format!("content-type:{TENCENT_CONTENT_TYPE}\nhost:{host}\n");
    let canonical_request = format!(
        "POST\n{path}\n{query}\n{canonical_headers}\n{TENCENT_SIGNED_HEADERS}\n{hashed_payload}"
    );
    let date = utc_date(timestamp)?;
    let credential_scope = format!("{date}/{TENCENT_SERVICE}/tc3_request");
    let string_to_sign = format!(
        "{TENCENT_ALGORITHM}\n{timestamp}\n{credential_scope}\n{}",
        sha256_hex(canonical_request.as_bytes())
    );
    let secret_date = hmac_sha256(
        format!("TC3{}", config.secret_key).as_bytes(),
        date.as_bytes(),
    )?;
    let secret_service = hmac_sha256(&secret_date, TENCENT_SERVICE.as_bytes())?;
    let secret_signing = hmac_sha256(&secret_service, b"tc3_request")?;
    let signature = hex::encode(hmac_sha256(&secret_signing, string_to_sign.as_bytes())?);
    let authorization = format!(
        "{TENCENT_ALGORITHM} Credential={}/{credential_scope}, SignedHeaders={TENCENT_SIGNED_HEADERS}, Signature={signature}",
        config.secret_id
    );
    Ok((host, authorization))
}

fn endpoint_host(endpoint: &Url) -> Result<String> {
    let host = endpoint
        .host_str()
        .ok_or_else(|| anyhow!("Tencent endpoint must include a host"))?;
    let mut value = host.to_string();
    if let Some(port) = endpoint.port() {
        value.push(':');
        value.push_str(&port.to_string());
    }
    Ok(value)
}

fn utc_date(timestamp: i64) -> Result<String> {
    let datetime = DateTime::<Utc>::from_timestamp(timestamp, 0)
        .ok_or_else(|| anyhow!("invalid Tencent timestamp"))?;
    Ok(datetime.format("%Y-%m-%d").to_string())
}

fn current_unix_timestamp() -> Result<i64> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("system clock is before UNIX epoch")?
        .as_secs() as i64)
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Result<Vec<u8>> {
    let mut mac = HmacSha256::new_from_slice(key).context("initialize HMAC-SHA256")?;
    mac.update(data);
    Ok(mac.finalize().into_bytes().to_vec())
}

fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

fn markdown_translation_blocks(markdown: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let mut current = Vec::new();
    let mut in_fence = false;
    for line in markdown.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
        }
        if !in_fence && line.trim().is_empty() {
            flush_block(&mut blocks, &mut current);
        } else {
            current.push(line);
        }
    }
    flush_block(&mut blocks, &mut current);
    blocks
}

#[derive(Debug, PartialEq, Eq)]
enum MarkdownTranslationSegment {
    Original(String),
    Translatable(String),
}

fn markdown_translation_segments(
    markdown: &str,
    max_chars: usize,
) -> Vec<MarkdownTranslationSegment> {
    let mut segments = Vec::new();
    let mut current = String::new();
    let limit = max_chars.max(200);

    for block in markdown_translation_blocks(markdown) {
        if !should_translate_block(&block) {
            flush_translation_segment(&mut segments, &mut current);
            segments.push(MarkdownTranslationSegment::Original(block));
            continue;
        }

        let separator_chars = if current.is_empty() { 0 } else { 2 };
        let next_chars = current.chars().count() + separator_chars + block.chars().count();
        if !current.is_empty() && next_chars > limit {
            flush_translation_segment(&mut segments, &mut current);
        }

        if !current.is_empty() {
            current.push_str("\n\n");
        }
        current.push_str(block.trim());
    }

    flush_translation_segment(&mut segments, &mut current);
    segments
}

fn flush_translation_segment(segments: &mut Vec<MarkdownTranslationSegment>, current: &mut String) {
    if current.trim().is_empty() {
        current.clear();
        return;
    }
    segments.push(MarkdownTranslationSegment::Translatable(
        current.trim().to_string(),
    ));
    current.clear();
}

fn flush_block(blocks: &mut Vec<String>, current: &mut Vec<&str>) {
    if current.is_empty() {
        return;
    }
    let block = current.join("\n").trim().to_string();
    current.clear();
    if !block.is_empty() {
        blocks.push(block);
    }
}

fn should_translate_block(block: &str) -> bool {
    let trimmed = block.trim_start();
    if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
        return false;
    }
    block.chars().any(|ch| ch.is_ascii_alphabetic())
}

fn split_text_chunks(text: &str, max_chars: usize) -> Vec<String> {
    let limit = max_chars.max(200);
    let mut chunks = Vec::new();
    let mut current = String::new();
    for line in text.lines() {
        let extra = if current.is_empty() { 0 } else { 1 } + line.chars().count();
        if !current.is_empty() && current.chars().count() + extra > limit {
            chunks.push(std::mem::take(&mut current));
        }
        if line.chars().count() > limit {
            if !current.is_empty() {
                chunks.push(std::mem::take(&mut current));
            }
            let mut chunk = String::new();
            for ch in line.chars() {
                if chunk.chars().count() >= limit {
                    chunks.push(std::mem::take(&mut chunk));
                }
                chunk.push(ch);
            }
            if !chunk.is_empty() {
                chunks.push(chunk);
            }
            continue;
        }
        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(line);
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

fn quote_markdown_translation(text: &str) -> String {
    text.lines()
        .map(|line| {
            if line.trim().is_empty() {
                ">".to_string()
            } else {
                format!("> {}", line.trim())
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) fn normalize_tencent_markdown_translation(text: &str) -> String {
    let text = normalize_url_schemes(text);
    let text = normalize_displaced_markdown_link_text(&text);
    let text = normalize_orphaned_markdown_link_tail(&text);
    let text = normalize_escaped_bracket_markdown_link_tail(&text);
    let text = normalize_markdown_link_parentheses(&text);
    let text = normalize_markdown_link_targets(&text);
    normalize_markdown_heading_markers(&text)
}

fn normalize_markdown_heading_markers(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut in_fence = false;
    for line in text.split_inclusive('\n') {
        let (line_body, line_ending) = line
            .strip_suffix('\n')
            .map(|body| (body, "\n"))
            .unwrap_or((line, ""));
        let (line_body, carriage_return) = line_body
            .strip_suffix('\r')
            .map(|body| (body, "\r"))
            .unwrap_or((line_body, ""));
        let trimmed = line_body.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            output.push_str(line_body);
            output.push_str(carriage_return);
            output.push_str(line_ending);
            continue;
        }
        if in_fence {
            output.push_str(line_body);
        } else {
            output.push_str(&normalize_markdown_heading_line(line_body));
        }
        output.push_str(carriage_return);
        output.push_str(line_ending);
    }
    output
}

fn normalize_markdown_heading_line(line: &str) -> String {
    let chars = line.chars().collect::<Vec<_>>();
    let Some(hash_start) = markdown_heading_marker_start(&chars) else {
        return line.to_string();
    };
    let mut hash_end = hash_start;
    while hash_end < chars.len() && chars[hash_end] == '#' && hash_end - hash_start < 6 {
        hash_end += 1;
    }
    if hash_end < chars.len() && chars[hash_end] == '#' {
        return line.to_string();
    }
    if chars.get(hash_end).is_none_or(|ch| ch.is_whitespace()) {
        return line.to_string();
    }
    let mut output = String::with_capacity(line.len() + 1);
    output.extend(chars[..hash_end].iter());
    output.push(' ');
    output.extend(chars[hash_end..].iter());
    output
}

fn markdown_heading_marker_start(chars: &[char]) -> Option<usize> {
    let mut index = 0;
    let mut leading_spaces = 0;
    while chars.get(index).is_some_and(|ch| *ch == ' ') {
        leading_spaces += 1;
        if leading_spaces > 3 {
            return None;
        }
        index += 1;
    }
    while chars.get(index).is_some_and(|ch| *ch == '>') {
        index += 1;
        if chars.get(index).is_some_and(|ch| *ch == ' ') {
            index += 1;
        }
        leading_spaces = 0;
        while chars.get(index).is_some_and(|ch| *ch == ' ') {
            leading_spaces += 1;
            if leading_spaces > 3 {
                return None;
            }
            index += 1;
        }
    }
    chars.get(index).filter(|ch| **ch == '#').map(|_| index)
}

fn normalize_markdown_link_parentheses(text: &str) -> String {
    let chars = text.chars().collect::<Vec<_>>();
    let mut output = String::with_capacity(text.len());
    let mut i = 0;
    let mut in_link_target = false;
    while i < chars.len() {
        if chars[i] == ']' && chars.get(i + 1).is_some_and(|ch| *ch == '（') {
            output.push_str("](");
            i += 2;
            in_link_target = true;
            continue;
        }
        if in_link_target && chars[i] == '）' {
            output.push(')');
            in_link_target = false;
            i += 1;
            continue;
        }
        if in_link_target && (chars[i] == ')' || chars[i].is_whitespace()) {
            in_link_target = false;
        }
        output.push(chars[i]);
        i += 1;
    }
    output
}

fn normalize_displaced_markdown_link_text(text: &str) -> String {
    let chars = text.chars().collect::<Vec<_>>();
    let mut output = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '['
            && !is_escaped_char(&chars, i)
            && let Some((replacement, next_index)) = displaced_markdown_link_replacement(&chars, i)
        {
            output.push_str(&replacement);
            i = next_index;
            continue;
        }
        output.push(chars[i]);
        i += 1;
    }
    output
}

fn displaced_markdown_link_replacement(chars: &[char], start: usize) -> Option<(String, usize)> {
    let close_bracket = find_char_before_newline(chars, start + 1, ']')?;
    let tail_start = close_bracket + 1;
    if chars
        .get(tail_start)
        .is_some_and(|ch| matches!(ch, '(' | '（'))
    {
        return None;
    }
    let open_paren = find_link_target_open_after_tail(chars, tail_start)?;
    let tail = chars[tail_start..open_paren]
        .iter()
        .collect::<String>()
        .trim()
        .to_string();
    if tail.is_empty() || tail.chars().count() > 80 {
        return None;
    }
    let close_paren = find_matching_link_target_close(chars, open_paren + 1, chars[open_paren])?;
    let raw_target = chars[open_paren + 1..close_paren]
        .iter()
        .collect::<String>();
    let target = normalize_markdown_link_target(&raw_target);
    if !is_normalized_markdown_link_target(&target) {
        return None;
    }
    let label = chars[start + 1..close_bracket]
        .iter()
        .collect::<String>()
        .trim()
        .to_string();
    if label.is_empty() {
        return None;
    }
    Some((format!("[{label}{tail}]({target})"), close_paren + 1))
}

fn find_char_before_newline(chars: &[char], mut index: usize, target: char) -> Option<usize> {
    while index < chars.len() {
        if chars[index] == '\n' {
            return None;
        }
        if chars[index] == target && !is_escaped_char(chars, index) {
            return Some(index);
        }
        index += 1;
    }
    None
}

fn find_link_target_open_after_tail(chars: &[char], mut index: usize) -> Option<usize> {
    while index < chars.len() {
        if chars[index] == '\n' || chars[index] == '[' || chars[index] == ']' {
            return None;
        }
        if chars[index] == '（' || chars[index] == '(' {
            return Some(index);
        }
        index += 1;
    }
    None
}

fn find_matching_link_target_close(chars: &[char], mut index: usize, open: char) -> Option<usize> {
    let preferred_close = if open == '（' { '）' } else { ')' };
    while index < chars.len() {
        if chars[index] == '\n' {
            return None;
        }
        if (chars[index] == preferred_close || chars[index] == ')' || chars[index] == '）')
            && !is_escaped_char(chars, index)
        {
            return Some(index);
        }
        index += 1;
    }
    None
}

fn normalize_orphaned_markdown_link_tail(text: &str) -> String {
    let chars = text.chars().collect::<Vec<_>>();
    let mut output = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == ']'
            && !is_escaped_char(&chars, i)
            && let Some((replacement, next_index)) =
                orphaned_markdown_link_tail_replacement(&chars, i)
        {
            output.push_str(&replacement);
            i = next_index;
            continue;
        }
        output.push(chars[i]);
        i += 1;
    }
    output
}

fn normalize_escaped_bracket_markdown_link_tail(text: &str) -> String {
    let chars = text.chars().collect::<Vec<_>>();
    let mut output = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\'
            && chars.get(i + 1).is_some_and(|ch| *ch == '[')
            && let Some((replacement, next_index)) =
                escaped_bracket_markdown_link_tail_replacement(&chars, i)
        {
            output.push_str(&replacement);
            i = next_index;
            continue;
        }
        output.push(chars[i]);
        i += 1;
    }
    output
}

fn escaped_bracket_markdown_link_tail_replacement(
    chars: &[char],
    start: usize,
) -> Option<(String, usize)> {
    let escaped_close = find_escaped_close_bracket_before_newline(chars, start + 2)?;
    let tail_start = escaped_close + 2;
    let close_bracket = find_char_before_newline(chars, tail_start, ']')?;
    let tail = chars[tail_start..close_bracket]
        .iter()
        .collect::<String>()
        .trim()
        .to_string();
    if tail.is_empty()
        || tail.chars().count() > 80
        || tail.chars().any(|ch| matches!(ch, '[' | ']'))
        || !tail.chars().any(is_cjk_char)
    {
        return None;
    }
    let mut open_paren = close_bracket + 1;
    while chars
        .get(open_paren)
        .is_some_and(|ch| *ch != '\n' && ch.is_whitespace())
    {
        open_paren += 1;
    }
    if !chars
        .get(open_paren)
        .is_some_and(|ch| matches!(ch, '(' | '（'))
    {
        return None;
    }
    let close_paren = find_matching_link_target_close(chars, open_paren + 1, chars[open_paren])?;
    let raw_target = chars[open_paren + 1..close_paren]
        .iter()
        .collect::<String>();
    let target = normalize_markdown_link_target(&raw_target);
    if !is_normalized_markdown_link_target(&target) {
        return None;
    }
    let prefix = chars[start..tail_start].iter().collect::<String>();
    if prefix.chars().count() > 120 {
        return None;
    }
    Some((format!("{prefix}[{tail}]({target})"), close_paren + 1))
}

fn orphaned_markdown_link_tail_replacement(
    chars: &[char],
    close_bracket: usize,
) -> Option<(String, usize)> {
    let tail_start = close_bracket + 1;
    if chars
        .get(tail_start)
        .is_none_or(|ch| ch.is_whitespace() || matches!(ch, '(' | '（' | '[' | ']'))
    {
        return None;
    }
    let open_paren = find_link_target_open_after_tail(chars, tail_start)?;
    let tail = chars[tail_start..open_paren]
        .iter()
        .collect::<String>()
        .trim()
        .to_string();
    if tail.is_empty() || tail.chars().count() > 80 || !tail.chars().any(is_cjk_char) {
        return None;
    }
    let close_paren = find_matching_link_target_close(chars, open_paren + 1, chars[open_paren])?;
    let raw_target = chars[open_paren + 1..close_paren]
        .iter()
        .collect::<String>();
    let target = normalize_markdown_link_target(&raw_target);
    if !is_normalized_markdown_link_target(&target) {
        return None;
    }
    Some((format!("[{tail}]({target})"), close_paren + 1))
}

fn find_escaped_close_bracket_before_newline(chars: &[char], mut index: usize) -> Option<usize> {
    while index + 1 < chars.len() {
        if chars[index] == '\n' {
            return None;
        }
        if chars[index] == '\\' && chars[index + 1] == ']' {
            return Some(index);
        }
        index += 1;
    }
    None
}

fn normalize_url_schemes(text: &str) -> String {
    let text = text
        .replace("https：", "https:")
        .replace("Https：", "https:")
        .replace("HTTPS：", "https:")
        .replace("http：", "http:")
        .replace("Http：", "http:")
        .replace("HTTP：", "http:");
    let mut output = String::with_capacity(text.len());
    let mut index = 0;
    while index < text.len() {
        let rest = &text[index..];
        if rest.starts_with("https:") {
            output.push_str("https:");
            index += "https:".len();
            index = normalize_url_scheme_slashes(&text, index, &mut output);
            continue;
        }
        if rest.starts_with("http:") {
            output.push_str("http:");
            index += "http:".len();
            index = normalize_url_scheme_slashes(&text, index, &mut output);
            continue;
        }
        let Some(ch) = rest.chars().next() else {
            break;
        };
        output.push(ch);
        index += ch.len_utf8();
    }
    output
}

fn normalize_url_scheme_slashes(text: &str, index: usize, output: &mut String) -> usize {
    let rest = &text[index..];
    if rest.starts_with("//") {
        output.push_str("//");
        return index + 2;
    }
    if rest
        .chars()
        .next()
        .is_some_and(|ch| ch.is_ascii_alphanumeric())
    {
        output.push_str("//");
    }
    index
}

fn normalize_markdown_link_targets(text: &str) -> String {
    let chars = text.chars().collect::<Vec<_>>();
    let mut output = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == ']' {
            let mut open_paren = i + 1;
            while chars
                .get(open_paren)
                .is_some_and(|ch| *ch != '\n' && ch.is_whitespace())
            {
                open_paren += 1;
            }
            if chars
                .get(open_paren)
                .is_some_and(|ch| matches!(ch, '(' | '（'))
                && let Some(close_paren) =
                    find_matching_link_target_close(&chars, open_paren + 1, chars[open_paren])
            {
                let raw_target = chars[open_paren + 1..close_paren]
                    .iter()
                    .collect::<String>();
                let target = normalize_markdown_link_target(&raw_target);
                let already_plain_markdown =
                    open_paren == i + 1 && chars[open_paren] == '(' && chars[close_paren] == ')';
                if already_plain_markdown || is_normalized_markdown_link_target(&target) {
                    output.push_str("](");
                    output.push_str(&target);
                    output.push(')');
                    i = close_paren + 1;
                    continue;
                }
            }
            if chars.get(i + 1).is_some_and(|ch| *ch == '(') {
                output.push_str("](");
                i += 2;
                let target_start = i;
                while i < chars.len() && chars[i] != ')' && chars[i] != '\n' {
                    i += 1;
                }
                if i < chars.len() && chars[i] == ')' {
                    let target = chars[target_start..i].iter().collect::<String>();
                    output.push_str(&normalize_markdown_link_target(&target));
                    output.push(')');
                    i += 1;
                    continue;
                }
                output.push_str(&chars[target_start..i].iter().collect::<String>());
                continue;
            }
        }
        output.push(chars[i]);
        i += 1;
    }
    output
}

fn normalize_markdown_link_target(target: &str) -> String {
    let trimmed = target.trim();
    let unwrapped = trimmed
        .strip_prefix('<')
        .and_then(|target| target.strip_suffix('>'))
        .map(str::trim)
        .unwrap_or(trimmed);
    let compact = unwrapped
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>()
        .replace('：', ":");
    if compact.is_empty() {
        return String::new();
    }
    let lower = compact.to_ascii_lowercase();
    if lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
        || lower.starts_with('/')
        || lower.starts_with('#')
    {
        return compact;
    }
    if lower.starts_with("www.") || looks_like_bare_domain(&compact) {
        return format!("https://{compact}");
    }
    trimmed.to_string()
}

fn is_normalized_markdown_link_target(target: &str) -> bool {
    let lower = target.to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
        || lower.starts_with('/')
        || lower.starts_with('#')
}

fn is_escaped_char(chars: &[char], index: usize) -> bool {
    let mut backslashes = 0;
    let mut cursor = index;
    while cursor > 0 && chars[cursor - 1] == '\\' {
        backslashes += 1;
        cursor -= 1;
    }
    backslashes % 2 == 1
}

fn is_cjk_char(ch: char) -> bool {
    matches!(
        ch,
        '\u{3400}'..='\u{4DBF}'
            | '\u{4E00}'..='\u{9FFF}'
            | '\u{F900}'..='\u{FAFF}'
            | '\u{20000}'..='\u{2A6DF}'
            | '\u{2A700}'..='\u{2B73F}'
            | '\u{2B740}'..='\u{2B81F}'
            | '\u{2B820}'..='\u{2CEAF}'
    )
}

fn looks_like_bare_domain(target: &str) -> bool {
    let Some(host) = target
        .split(['/', '?', '#'])
        .next()
        .filter(|host| !host.is_empty())
    else {
        return false;
    };
    if !host.contains('.') || host.starts_with('.') || host.ends_with('.') {
        return false;
    }
    host.chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '.'))
}

fn truncate_chars(input: &str, max_chars: usize) -> String {
    let mut output = input.chars().take(max_chars).collect::<String>();
    if input.chars().count() > max_chars {
        output.push('…');
    }
    output
}

#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
struct TencentTextTranslateRequest<'a> {
    source_text: &'a str,
    source: &'a str,
    target: &'a str,
    project_id: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct TencentTextTranslateEnvelope {
    response: TencentTextTranslateResponse,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct TencentTextTranslateResponse {
    target_text: Option<String>,
    error: Option<TencentTextTranslateError>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct TencentTextTranslateError {
    code: String,
    message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> TencentTranslateConfig {
        TencentTranslateConfig {
            secret_id: "secret-id".to_string(),
            secret_key: "secret-key".to_string(),
            endpoint: "https://tmt.tencentcloudapi.com".to_string(),
            region: "ap-guangzhou".to_string(),
            source: "en".to_string(),
            target: "zh".to_string(),
            project_id: 0,
            max_chars: 24,
        }
    }

    #[test]
    fn tc3_authorization_uses_expected_scope_and_headers() -> Result<()> {
        let payload = br#"{"SourceText":"hello","Source":"en","Target":"zh","ProjectId":0}"#;
        let (_host, authorization) = tc3_authorization(&test_config(), 1_779_235_200, payload)?;

        assert!(
            authorization
                .starts_with("TC3-HMAC-SHA256 Credential=secret-id/2026-05-20/tmt/tc3_request")
        );
        assert!(authorization.contains("SignedHeaders=content-type;host"));
        assert!(authorization.contains("Signature="));
        Ok(())
    }

    #[test]
    fn markdown_blocks_keep_code_fences_intact() {
        let markdown = "Intro paragraph.\n\n```rust\nfn main() {}\n\n```\n\nSecond paragraph.";
        let blocks = markdown_translation_blocks(markdown);

        assert_eq!(blocks.len(), 3);
        assert!(blocks[1].contains("fn main()"));
    }

    #[test]
    fn markdown_segments_batch_small_blocks() {
        let markdown = "First paragraph.\n\nSecond paragraph.\n\n```rust\nfn main() {}\n```\n\nThird paragraph.";
        let segments = markdown_translation_segments(markdown, 200);

        assert_eq!(segments.len(), 3);
        assert_eq!(
            segments[0],
            MarkdownTranslationSegment::Translatable(
                "First paragraph.\n\nSecond paragraph.".to_string()
            )
        );
        assert!(matches!(
            segments[1],
            MarkdownTranslationSegment::Original(_)
        ));
        assert_eq!(
            segments[2],
            MarkdownTranslationSegment::Translatable("Third paragraph.".to_string())
        );
    }

    #[test]
    fn markdown_segments_split_at_configured_limit() {
        let first = "A".repeat(140);
        let second = "B".repeat(140);
        let markdown = format!("{first}\n\n{second}");
        let segments = markdown_translation_segments(&markdown, 200);

        assert_eq!(
            segments,
            vec![
                MarkdownTranslationSegment::Translatable(first),
                MarkdownTranslationSegment::Translatable(second),
            ]
        );
    }

    #[test]
    fn split_text_chunks_respects_character_limit() {
        let input = "a".repeat(260);
        let chunks = split_text_chunks(&input, 50);

        assert_eq!(chunks.len(), 2);
        assert!(chunks.iter().all(|chunk| chunk.chars().count() <= 200));
    }

    #[test]
    fn quote_markdown_translation_prefixes_each_line() {
        assert_eq!(quote_markdown_translation("你好\n世界"), "> 你好\n> 世界");
    }

    #[test]
    fn normalizes_tencent_markdown_link_punctuation() {
        let input = "阅读[Wayback]（https：//web.archive.org/web/20260115160923/https：//example.com/a）和[内部链接]（/docs/terms/用户协议），以及 https：wiert.wordpress.com。";
        let output = normalize_tencent_markdown_translation(input);

        assert_eq!(
            output,
            "阅读[Wayback](https://web.archive.org/web/20260115160923/https://example.com/a)和[内部链接](/docs/terms/用户协议)，以及 https://wiert.wordpress.com。"
        );
    }

    #[test]
    fn normalizes_link_with_ascii_close_after_fullwidth_open() {
        let input = "关联论文 *（[什么是关联论文？]（https：//www.linkedpapers.com/关于)*\n> [下一个链接]（https：//example.com/next）";
        let output = normalize_tencent_markdown_translation(input);

        assert_eq!(
            output,
            "关联论文 *（[什么是关联论文？](https://www.linkedpapers.com/关于)*\n> [下一个链接](https://example.com/next)"
        );
    }

    #[test]
    fn normalizes_bare_domains_and_spaces_inside_markdown_link_targets() {
        let input = "据[美国能源情报署](www.eia.gov/international/content/analysis/countries_short/Taiwan/Taiwan.pdf? utm_source= chatgtt.com)，另见[Example](example.com/a? x= 1)。";
        let output = normalize_tencent_markdown_translation(input);

        assert_eq!(
            output,
            "据[美国能源情报署](https://www.eia.gov/international/content/analysis/countries_short/Taiwan/Taiwan.pdf?utm_source=chatgtt.com)，另见[Example](https://example.com/a?x=1)。"
        );
    }

    #[test]
    fn normalizes_fullwidth_colons_and_angle_wrapped_link_targets() {
        let input = "[Email](mailto：Connect@example.com) [Share](<https://www.facebook.com/sharer/sharer.php?u= https%3A%2F%2Fexample.com%2F >) [Image](https://assets.example.com/cdn-cgi/rs：fit：47/plain/image.jpg)";
        let output = normalize_tencent_markdown_translation(input);

        assert_eq!(
            output,
            "[Email](mailto:Connect@example.com) [Share](https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexample.com%2F) [Image](https://assets.example.com/cdn-cgi/rs:fit:47/plain/image.jpg)"
        );
    }

    #[test]
    fn normalizes_displaced_markdown_link_text_before_fullwidth_url() {
        let input = "LoveFrom是Ive [在他长期的苹果职业生涯后]创立的工作室（https：//www.theguardian.com/technology/2019/jun/27/jony-ive-apple-designer-leave-imac-iphone），负责设计。";
        let output = normalize_tencent_markdown_translation(input);

        assert_eq!(
            output,
            "LoveFrom是Ive [在他长期的苹果职业生涯后创立的工作室](https://www.theguardian.com/technology/2019/jun/27/jony-ive-apple-designer-leave-imac-iphone)，负责设计。"
        );
    }

    #[test]
    fn normalizes_space_before_link_target_and_fullwidth_close() {
        let input = "Gotit.pub *（[什么是GotitPub？] (http：//sport.pub/faq））*";
        let output = normalize_tencent_markdown_translation(input);

        assert_eq!(
            output,
            "Gotit.pub *（[什么是GotitPub？](http://sport.pub/faq)）*"
        );
    }

    #[test]
    fn normalizes_orphaned_translated_link_tail() {
        let input =
            "他说，“我们将在\\[.\\]]中战斗（https：//jstribune.com/saviors-of-their-nations/）";
        let output = normalize_tencent_markdown_translation(input);

        assert_eq!(
            output,
            "他说，“我们将在\\[.\\][中战斗](https://jstribune.com/saviors-of-their-nations/)"
        );
    }

    #[test]
    fn normalizes_escaped_bracket_prefix_with_tail_before_link_target() {
        let input =
            "他说，“我们将在\\[.\\]中战斗]（https：//jstribune.com/saviors-of-their-nations/）";
        let output = normalize_tencent_markdown_translation(input);

        assert_eq!(
            output,
            "他说，“我们将在\\[.\\][中战斗](https://jstribune.com/saviors-of-their-nations/)"
        );
    }

    #[test]
    fn normalizes_heading_markers_without_required_space() {
        let input = "#拥有一套房子的实际成本\n##二级标题\n### [已有空格](#x)\n> ###引用标题\n正文里的 #标签 不变";
        let output = normalize_tencent_markdown_translation(input);

        assert_eq!(
            output,
            "# 拥有一套房子的实际成本\n## 二级标题\n### [已有空格](#x)\n> ### 引用标题\n正文里的 #标签 不变"
        );
    }

    #[test]
    fn does_not_normalize_heading_markers_inside_code_fences() {
        let input = "```c\n#include <stdio.h>\n```\n\n####标题";
        let output = normalize_tencent_markdown_translation(input);

        assert_eq!(output, "```c\n#include <stdio.h>\n```\n\n#### 标题");
    }
}
