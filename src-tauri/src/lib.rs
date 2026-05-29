pub mod html_profile;

use chrono::{Datelike, TimeZone, Utc};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Manager;
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewNoteInput {
    title: String,
    lang: Option<String>,
    body: Option<String>,
    directory: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkInfo {
    href: String,
    label: String,
    target_id: Option<String>,
    is_broken: bool,
    kind: String,
    target_heading: Option<String>,
    target_block_id: Option<String>,
    concept: Option<String>,
}

impl From<html_profile::NoteLink> for LinkInfo {
    fn from(link: html_profile::NoteLink) -> Self {
        Self {
            href: link.href,
            label: link.label,
            target_id: link.target_id,
            is_broken: link.is_broken,
            kind: link.kind,
            target_heading: link.target_heading,
            target_block_id: link.target_block_id,
            concept: link.concept,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteSummary {
    id: String,
    path: String,
    title: String,
    created_at: String,
    updated_at: String,
    tags: Vec<String>,
    headings: Vec<String>,
    outgoing_links: Vec<LinkInfo>,
    favorite: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteDocument {
    id: String,
    path: String,
    title: String,
    created_at: String,
    updated_at: String,
    tags: Vec<String>,
    headings: Vec<String>,
    outgoing_links: Vec<LinkInfo>,
    favorite: bool,
    html: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteHistoryEntry {
    id: String,
    snapshot_id: String,
    timestamp: String,
    created_at: String,
    size: u64,
    title: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchResult {
    id: String,
    path: String,
    title: String,
    excerpt: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GraphNode {
    id: String,
    title: String,
    path: String,
    kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GraphEdge {
    source: String,
    target: String,
    kind: String,
    label: String,
    target_heading: Option<String>,
    target_block_id: Option<String>,
    concept: Option<String>,
    count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GraphData {
    nodes: Vec<GraphNode>,
    edges: Vec<GraphEdge>,
    broken_links: Vec<LinkInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceDiagnostics {
    summary: WorkspaceDiagnosticsSummary,
    issues: Vec<WorkspaceDiagnosticIssue>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceDiagnosticsSummary {
    html_note_count: usize,
    parsed_note_count: usize,
    parse_failure_count: usize,
    error_count: usize,
    warning_count: usize,
    missing_id_count: usize,
    duplicate_id_count: usize,
    missing_title_count: usize,
    missing_h1_count: usize,
    missing_note_article_count: usize,
    empty_body_count: usize,
    unresolved_link_count: usize,
    broken_href_count: usize,
    missing_heading_target_count: usize,
    missing_block_target_count: usize,
    missing_asset_count: usize,
    unreferenced_asset_count: usize,
    sqlite_note_count: Option<usize>,
    sqlite_relation_count: Option<usize>,
    needs_rebuild: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceDiagnosticIssue {
    level: String,
    code: String,
    path: Option<String>,
    related_paths: Vec<String>,
    target: Option<String>,
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssetImport {
    source_path: String,
    kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedAsset {
    href: String,
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpTextResult {
    url: String,
    status: u16,
    ok: bool,
    content_type: Option<String>,
    body: String,
    elapsed_ms: u128,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginManifest {
    id: Option<String>,
    name: Option<String>,
    version: Option<String>,
    description: Option<String>,
    permissions: Option<Vec<String>>,
    widgets: Option<Vec<PluginManifestWidget>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginManifestWidget {
    #[serde(rename = "type")]
    widget_type: String,
    label: Option<String>,
    script: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledPlugin {
    id: String,
    name: String,
    version: String,
    description: String,
    permissions: Vec<String>,
    enabled: bool,
    widgets: Vec<InstalledPluginWidget>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledPluginWidget {
    #[serde(rename = "type")]
    widget_type: String,
    label: String,
    script: String,
    code: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LanguagePackManifest {
    schema_version: i64,
    id: String,
    locale: String,
    name: String,
    native_name: String,
    version: String,
    author: Option<String>,
    fallback: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadedLanguagePack {
    manifest: LanguagePackManifest,
    messages: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginPingResult {
    host: String,
    ok: bool,
    code: Option<i32>,
    stdout: String,
    stderr: String,
    elapsed_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginTcpResult {
    host: String,
    port: u16,
    ok: bool,
    error: Option<String>,
    elapsed_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginFsEntry {
    name: String,
    path: String,
    is_dir: bool,
    is_file: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginStorageInput {
    plugin_id: String,
    key: String,
    value: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginShellExecInput {
    command: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginShellExecResult {
    code: Option<i32>,
    stdout: String,
    stderr: String,
    elapsed_ms: u128,
    timed_out: bool,
}

#[tauri::command]
fn default_workspace_path(app: tauri::AppHandle) -> Result<String, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(to_error)?;
    Ok(base.join("Opaline").to_string_lossy().to_string())
}

#[tauri::command]
async fn http_get_text(url: String) -> Result<HttpTextResult, String> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(to_error)?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => {
            return Err(
                "Only http:// and https:// URLs are allowed for live components.".to_string(),
            )
        }
    }

    let started = Instant::now();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(to_error)?;
    let response = client.get(parsed.clone()).send().await.map_err(to_error)?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let body = response.text().await.map_err(to_error)?;
    let body = truncate_chars(&body, 12000);

    Ok(HttpTextResult {
        url: parsed.to_string(),
        status: status.as_u16(),
        ok: status.is_success(),
        content_type,
        body,
        elapsed_ms: started.elapsed().as_millis(),
    })
}

#[tauri::command]
fn plugin_ping(host: String, timeout_ms: Option<u64>) -> Result<PluginPingResult, String> {
    let host = host.trim().to_string();
    if host.is_empty() {
        return Err("ping host cannot be empty".to_string());
    }

    let timeout = timeout_ms.unwrap_or(2000).clamp(500, 30_000);
    #[cfg(target_os = "windows")]
    let (command, args) = (
        "ping".to_string(),
        vec![
            "-n".to_string(),
            "1".to_string(),
            "-w".to_string(),
            timeout.to_string(),
            host.clone(),
        ],
    );
    #[cfg(not(target_os = "windows"))]
    let (command, args) = (
        "ping".to_string(),
        vec![
            "-c".to_string(),
            "1".to_string(),
            "-W".to_string(),
            ((timeout + 999) / 1000).to_string(),
            host.clone(),
        ],
    );

    let result = run_command_capture(&command, &args, None, timeout + 1000)?;
    Ok(PluginPingResult {
        host,
        ok: result.code == Some(0),
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        elapsed_ms: result.elapsed_ms,
    })
}

#[tauri::command]
fn plugin_tcp_connect(
    host: String,
    port: u16,
    timeout_ms: Option<u64>,
) -> Result<PluginTcpResult, String> {
    let host = host.trim().to_string();
    if host.is_empty() {
        return Err("tcp host cannot be empty".to_string());
    }

    let started = Instant::now();
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(2000).clamp(200, 30_000));
    let addresses = (host.as_str(), port).to_socket_addrs().map_err(to_error)?;
    let mut last_error = None;

    for address in addresses {
        match TcpStream::connect_timeout(&address, timeout) {
            Ok(_) => {
                return Ok(PluginTcpResult {
                    host,
                    port,
                    ok: true,
                    error: None,
                    elapsed_ms: started.elapsed().as_millis(),
                });
            }
            Err(error) => last_error = Some(error.to_string()),
        }
    }

    Ok(PluginTcpResult {
        host,
        port,
        ok: false,
        error: last_error,
        elapsed_ms: started.elapsed().as_millis(),
    })
}

#[tauri::command]
fn ensure_workspace(path: String) -> Result<(), String> {
    let workspace = workspace_path(&path)?;
    fs::create_dir_all(&workspace).map_err(to_error)?;
    fs::create_dir_all(workspace.join("notes")).map_err(to_error)?;
    fs::create_dir_all(workspace.join("notes/journal")).map_err(to_error)?;
    fs::create_dir_all(workspace.join("assets/images")).map_err(to_error)?;
    fs::create_dir_all(workspace.join("assets/files")).map_err(to_error)?;
    fs::create_dir_all(workspace.join(".opaline/cache")).map_err(to_error)?;
    fs::create_dir_all(workspace.join(".opaline/history")).map_err(to_error)?;

    let settings_path = workspace.join(".opaline/settings.json");
    if !settings_path.exists() {
        fs::write(
            &settings_path,
            "{\n  \"profileVersion\": 1,\n  \"noteFormat\": \"opaline-html\"\n}\n",
        )
        .map_err(to_error)?;
    }

    let conn = open_index(&workspace)?;
    migrate_index(&conn)?;
    Ok(())
}

#[tauri::command]
fn create_folder(path: String, directory: String) -> Result<(), String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;
    let directory = clean_note_directory(&directory)?;
    fs::create_dir_all(workspace.join(directory)).map_err(to_error)?;
    Ok(())
}

#[tauri::command]
fn list_notes(path: String) -> Result<Vec<NoteSummary>, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path.clone())?;
    rebuild_index(&workspace)
}

#[tauri::command]
fn create_note(path: String, input: NewNoteInput) -> Result<NoteDocument, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;

    let title = clean_title(&input.title);
    create_note_at(
        &workspace,
        &title,
        input.lang.as_deref().unwrap_or("zh-Hans"),
        input.directory.as_deref().unwrap_or("notes"),
        input.body.as_deref().unwrap_or("<p></p>"),
    )
}

#[tauri::command]
fn create_daily_note(path: String) -> Result<NoteDocument, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;

    let now = Utc::now();
    let file_name = format!("{:04}-{:02}-{:02}.html", now.year(), now.month(), now.day());
    let note_path = workspace.join("notes/journal").join(&file_name);

    if note_path.exists() {
        return read_note(
            workspace.to_string_lossy().to_string(),
            format!("notes/journal/{file_name}"),
        );
    }

    let title = format!("日记 {:04}-{:02}-{:02}", now.year(), now.month(), now.day());
    create_note_at(&workspace, &title, "zh-Hans", "notes/journal", "<p></p>")
}

#[tauri::command]
fn read_note(path: String, note_path: String) -> Result<NoteDocument, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;

    let absolute = note_absolute_path(&workspace, &note_path)?;
    let html = fs::read_to_string(&absolute).map_err(to_error)?;
    let conn = open_index(&workspace)?;
    let summary = summary_from_html(&conn, &workspace, &absolute, &html)?;
    summary.last_opened(&conn)?;

    Ok(NoteDocument {
        id: summary.id,
        path: summary.path,
        title: summary.title,
        created_at: summary.created_at,
        updated_at: summary.updated_at,
        tags: summary.tags,
        headings: summary.headings,
        outgoing_links: summary.outgoing_links,
        favorite: summary.favorite,
        html,
    })
}

#[tauri::command]
fn save_note(
    path: String,
    note: NoteDocument,
    create_history: Option<bool>,
) -> Result<NoteDocument, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;

    let absolute = note_absolute_path(&workspace, &note.path)?;
    let html = normalize_note_html(&note.html, &note.id, &note.title)?;
    let current_html = if absolute.exists() {
        Some(fs::read_to_string(&absolute).map_err(to_error)?)
    } else {
        None
    };
    let unchanged = current_html
        .as_ref()
        .is_some_and(|current| note_html_equivalent_for_save(current, &html));

    if !unchanged {
        write_file_atomically(&absolute, &html)?;
    }

    let html = if unchanged {
        current_html.unwrap_or(html)
    } else {
        fs::read_to_string(&absolute).map_err(to_error)?
    };
    let conn = open_index(&workspace)?;
    let summary = summary_from_html(&conn, &workspace, &absolute, &html)?;
    upsert_note_index(&conn, &summary, &html)?;
    if create_history.unwrap_or(true) && !unchanged {
        create_note_history_snapshot(&workspace, &summary.id, &summary.path, &html, false)?;
    }

    Ok(NoteDocument {
        id: summary.id,
        path: summary.path,
        title: summary.title,
        created_at: summary.created_at,
        updated_at: summary.updated_at,
        tags: summary.tags,
        headings: summary.headings,
        outgoing_links: summary.outgoing_links,
        favorite: summary.favorite,
        html,
    })
}

#[tauri::command]
fn search_notes(path: String, query: String) -> Result<Vec<SearchResult>, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;
    let conn = open_index(&workspace)?;
    let trimmed = query.trim();

    if trimmed.is_empty() {
        let mut statement = conn
            .prepare(
                "
                select id, path, title, body_text, updated_at
                from notes
                order by favorite desc, coalesce(last_opened_at, updated_at) desc
                limit 20
                ",
            )
            .map_err(to_error)?;
        return collect_search_results(&mut statement, []);
    }

    let fts_query = to_fts_query(trimmed);
    if !fts_query.is_empty() {
        let mut statement = conn
            .prepare(
                "
                select n.id,
                       n.path,
                       n.title,
                       snippet(notes_fts, 2, '', '', '...', 18) as excerpt,
                       n.updated_at
                from notes_fts
                join notes n on n.id = notes_fts.note_id
                where notes_fts match ?1
                order by bm25(notes_fts, 10.0, 1.0, 0.2), n.favorite desc, n.updated_at desc
                limit 50
                ",
            )
            .map_err(to_error)?;

        if let Ok(results) = collect_search_results(&mut statement, params![fts_query]) {
            return Ok(results);
        }
    }

    let like_query = format!("%{trimmed}%");
    let mut statement = conn
        .prepare(
            "
            select id, path, title, body_text, updated_at
            from notes
            where title like ?1 or body_text like ?1 or path like ?1
            order by favorite desc, updated_at desc
            limit 50
            ",
        )
        .map_err(to_error)?;

    collect_search_results(&mut statement, params![like_query])
}

#[tauri::command]
fn list_backlinks(path: String, note_id: String) -> Result<Vec<SearchResult>, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;
    let conn = open_index(&workspace)?;
    let mut statement = conn
        .prepare(
            "
            select n.id, n.path, n.title, n.body_text, n.updated_at
            from note_links l
            join notes n on n.id = l.note_id
            where l.target_id = ?1
            order by n.updated_at desc
            ",
        )
        .map_err(to_error)?;

    collect_search_results(&mut statement, params![note_id])
}

#[tauri::command]
fn graph_data(path: String) -> Result<GraphData, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;
    let conn = open_index(&workspace)?;

    let mut node_statement = conn
        .prepare("select id, title, path from notes order by title")
        .map_err(to_error)?;
    let nodes = node_statement
        .query_map([], |row| {
            Ok(GraphNode {
                id: row.get(0)?,
                title: row.get(1)?,
                path: row.get(2)?,
                kind: "note".to_string(),
            })
        })
        .map_err(to_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_error)?;

    let mut nodes = nodes;
    let mut concept_nodes: BTreeSet<String> = BTreeSet::new();

    let mut tag_node_statement = conn
        .prepare("select distinct tag from note_tags order by tag")
        .map_err(to_error)?;
    let tags = tag_node_statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(to_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_error)?;

    for tag in &tags {
        let id = concept_node_id(tag);
        if concept_nodes.insert(id.clone()) {
            nodes.push(GraphNode {
                id,
                title: format!("#{tag}"),
                path: String::new(),
                kind: "concept".to_string(),
            });
        }
    }

    let mut edge_statement = conn
        .prepare("select note_id, target_id, href, label from note_links")
        .map_err(to_error)?;
    let mut edges = edge_statement
        .query_map([], |row| {
            let source: String = row.get(0)?;
            let target_id: Option<String> = row.get(1)?;
            let href: String = row.get(2)?;
            let label: String = row.get(3)?;
            let meta =
                html_profile::link_metadata_from_parts(&href, None, None, None, None, &label);
            let Some(target) =
                target_id.or_else(|| meta.concept.as_ref().map(|c| concept_node_id(c)))
            else {
                return Ok(None);
            };
            Ok(Some(GraphEdge {
                source,
                target,
                kind: meta.kind,
                label,
                target_heading: meta.target_heading,
                target_block_id: meta.target_block_id,
                concept: meta.concept,
                count: 1,
            }))
        })
        .map_err(to_error)?
        .filter_map(|result| match result {
            Ok(Some(edge)) => Some(Ok(edge)),
            Ok(None) => None,
            Err(error) => Some(Err(error)),
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_error)?;

    let mut tag_edge_statement = conn
        .prepare("select note_id, tag from note_tags")
        .map_err(to_error)?;
    let tag_edges = tag_edge_statement
        .query_map([], |row| {
            let source: String = row.get(0)?;
            let tag: String = row.get(1)?;
            Ok(GraphEdge {
                source,
                target: concept_node_id(&tag),
                kind: "concept".to_string(),
                label: tag.clone(),
                target_heading: None,
                target_block_id: None,
                concept: Some(tag),
                count: 1,
            })
        })
        .map_err(to_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_error)?;
    edges.extend(tag_edges);

    for edge in &edges {
        if edge.kind == "concept" {
            if let Some(concept) = &edge.concept {
                let id = concept_node_id(concept);
                if concept_nodes.insert(id.clone()) {
                    nodes.push(GraphNode {
                        id,
                        title: format!("#{concept}"),
                        path: String::new(),
                        kind: "concept".to_string(),
                    });
                }
            }
        }
    }

    let mut broken_statement = conn
        .prepare("select href, label, target_id from note_links where is_broken = 1 order by href")
        .map_err(to_error)?;
    let broken_links = broken_statement
        .query_map([], |row| {
            let href: String = row.get(0)?;
            let label: String = row.get(1)?;
            let target_id: Option<String> = row.get(2)?;
            let meta =
                html_profile::link_metadata_from_parts(&href, None, None, None, None, &label);
            Ok(LinkInfo {
                href,
                label,
                target_id,
                is_broken: true,
                kind: meta.kind,
                target_heading: meta.target_heading,
                target_block_id: meta.target_block_id,
                concept: meta.concept,
            })
        })
        .map_err(to_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_error)?;

    Ok(GraphData {
        nodes,
        edges,
        broken_links,
    })
}

#[tauri::command]
fn diagnose_workspace(path: String) -> Result<WorkspaceDiagnostics, String> {
    let workspace = workspace_path(&path)?;
    diagnose_workspace_inner(&workspace)
}

#[tauri::command]
fn rebuild_workspace_index(path: String) -> Result<Vec<NoteSummary>, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;
    rebuild_index(&workspace)
}

#[tauri::command]
fn toggle_favorite(path: String, note_id: String) -> Result<bool, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;
    let conn = open_index(&workspace)?;
    let current: i64 = conn
        .query_row(
            "select favorite from notes where id = ?1",
            params![note_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(to_error)?
        .unwrap_or(0);
    let next = if current == 0 { 1 } else { 0 };
    conn.execute(
        "update notes set favorite = ?1 where id = ?2",
        params![next, note_id],
    )
    .map_err(to_error)?;
    Ok(next == 1)
}

#[tauri::command]
fn import_asset(path: String, input: AssetImport) -> Result<ImportedAsset, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;

    let source = PathBuf::from(&input.source_path);
    if !source.is_file() {
        return Err("附件路径不是文件".to_string());
    }

    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "附件文件名无效".to_string())?;
    let bucket = if input.kind == "image" {
        "images"
    } else {
        "files"
    };
    let destination_dir = workspace.join("assets").join(bucket);
    let destination_name = unique_asset_file(&destination_dir, file_name);
    let destination = destination_dir.join(&destination_name);

    fs::copy(&source, &destination).map_err(to_error)?;

    Ok(ImportedAsset {
        href: format!("../assets/{bucket}/{destination_name}"),
        name: destination_name,
    })
}

#[tauri::command]
fn read_settings(path: String) -> Result<serde_json::Value, String> {
    let workspace = workspace_path(&path)?;
    let settings_path = workspace.join(".opaline/settings.json");
    if !settings_path.exists() {
        return Ok(serde_json::json!({
            "profileVersion": 1,
            "noteFormat": "opaline-html"
        }));
    }
    let raw = fs::read_to_string(&settings_path).map_err(to_error)?;
    serde_json::from_str(&raw).map_err(to_error)
}

#[tauri::command]
fn read_file_text(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(to_error)
}

#[tauri::command]
fn list_note_history(
    path: String,
    note_path: String,
    note_id: String,
) -> Result<Vec<NoteHistoryEntry>, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;
    let conn = open_index(&workspace)?;
    let resolved_note_id = resolve_history_note_id(&conn, &workspace, &note_path, &note_id)?;
    list_note_history_entries(&workspace, &resolved_note_id)
}

#[tauri::command]
fn read_note_history(
    path: String,
    note_path: String,
    note_id: String,
    snapshot_id: String,
) -> Result<String, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;
    let conn = open_index(&workspace)?;
    let resolved_note_id = resolve_history_note_id(&conn, &workspace, &note_path, &note_id)?;
    let snapshot = note_history_snapshot_path(&workspace, &resolved_note_id, &snapshot_id)?;
    fs::read_to_string(snapshot).map_err(to_error)
}

#[tauri::command]
fn restore_note_history(
    path: String,
    note_path: String,
    note_id: String,
    snapshot_id: String,
) -> Result<NoteDocument, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;
    let conn = open_index(&workspace)?;
    let resolved_note_id = resolve_history_note_id(&conn, &workspace, &note_path, &note_id)?;
    let restore_path = resolve_note_path_for_history(&conn, &note_path, &resolved_note_id)?;
    let absolute = note_absolute_path(&workspace, &restore_path)?;
    let snapshot = note_history_snapshot_path(&workspace, &resolved_note_id, &snapshot_id)?;
    let snapshot_html = fs::read_to_string(snapshot).map_err(to_error)?;

    if absolute.exists() {
        let current_html = fs::read_to_string(&absolute).map_err(to_error)?;
        create_note_history_snapshot(
            &workspace,
            &resolved_note_id,
            &restore_path,
            &current_html,
            true,
        )?;
    }

    let restored_to_write =
        upsert_meta_content(&snapshot_html, "opaline:updated", &Utc::now().to_rfc3339());
    write_file_atomically(&absolute, &restored_to_write)?;
    let restored_html = fs::read_to_string(&absolute).map_err(to_error)?;
    let summary = summary_from_html(&conn, &workspace, &absolute, &restored_html)?;
    upsert_note_index(&conn, &summary, &restored_html)?;
    rebuild_index(&workspace)?;

    Ok(NoteDocument {
        id: summary.id,
        path: summary.path,
        title: summary.title,
        created_at: summary.created_at,
        updated_at: summary.updated_at,
        tags: summary.tags,
        headings: summary.headings,
        outgoing_links: summary.outgoing_links,
        favorite: summary.favorite,
        html: restored_html,
    })
}

#[tauri::command]
fn rename_note(path: String, note_id: String, new_title: String) -> Result<NoteSummary, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;
    let conn = open_index(&workspace)?;

    let old_path: String = conn
        .query_row(
            "select path from notes where id = ?1",
            params![note_id],
            |row| row.get(0),
        )
        .map_err(to_error)?;

    let absolute = note_absolute_path(&workspace, &old_path)?;
    let mut html = fs::read_to_string(&absolute).map_err(to_error)?;
    create_note_history_snapshot(&workspace, &note_id, &old_path, &html, true)?;

    let old_title = title_content(&html).unwrap_or_default();
    html = html_profile::replace_title_text(&html, &new_title);
    html = html_profile::replace_first_h1_if_text_matches(&html, &old_title, &new_title);

    let directory = Path::new(&old_path).parent().unwrap_or(Path::new("notes"));
    let directory_str = directory.to_string_lossy().replace('\\', "/");
    let new_file_name = unique_note_file(&workspace.join(&directory_str), &new_title);
    let new_note_path = directory.join(&new_file_name);
    let new_relative = new_note_path.to_string_lossy().replace('\\', "/");

    write_file_atomically(&workspace.join(&new_relative), &html)?;
    if old_path != new_relative {
        let _ = fs::remove_file(&absolute);
        let _ = fs::remove_file(absolute.with_extension("html.bak"));
    }

    let summary = summary_from_html(&conn, &workspace, &workspace.join(&new_relative), &html)?;
    upsert_note_index(&conn, &summary, &html)?;
    rebuild_index(&workspace)?;

    Ok(summary)
}

#[tauri::command]
fn delete_note(path: String, note_id: String) -> Result<(), String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;
    let conn = open_index(&workspace)?;

    let note_path: String = conn
        .query_row(
            "select path from notes where id = ?1",
            params![note_id],
            |row| row.get(0),
        )
        .map_err(to_error)?;

    let absolute = note_absolute_path(&workspace, &note_path)?;
    if absolute.exists() {
        let html = fs::read_to_string(&absolute).map_err(to_error)?;
        create_note_history_snapshot(&workspace, &note_id, &note_path, &html, true)?;
    }

    let _ = fs::remove_file(&absolute);
    let _ = fs::remove_file(absolute.with_extension("html.bak"));

    conn.execute("delete from notes where id = ?1", params![note_id])
        .map_err(to_error)?;
    conn.execute("delete from notes_fts where note_id = ?1", params![note_id])
        .map_err(to_error)?;
    conn.execute("delete from note_tags where note_id = ?1", params![note_id])
        .map_err(to_error)?;
    conn.execute(
        "delete from note_headings where note_id = ?1",
        params![note_id],
    )
    .map_err(to_error)?;
    conn.execute(
        "delete from note_links where note_id = ?1",
        params![note_id],
    )
    .map_err(to_error)?;

    rebuild_index(&workspace)?;
    Ok(())
}

#[tauri::command]
fn move_note(path: String, note_id: String, new_directory: String) -> Result<NoteSummary, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;
    let conn = open_index(&workspace)?;
    let directory = clean_note_directory(&new_directory)?;

    let old_path: String = conn
        .query_row(
            "select path from notes where id = ?1",
            params![note_id],
            |row| row.get(0),
        )
        .map_err(to_error)?;

    let absolute = note_absolute_path(&workspace, &old_path)?;
    let html = fs::read_to_string(&absolute).map_err(to_error)?;
    create_note_history_snapshot(&workspace, &note_id, &old_path, &html, true)?;

    let file_name = absolute
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("note.html");
    let new_relative = format!("{directory}/{file_name}");
    let new_absolute = workspace.join(&new_relative);

    if let Some(parent) = new_absolute.parent() {
        fs::create_dir_all(parent).map_err(to_error)?;
    }
    fs::rename(&absolute, &new_absolute).map_err(to_error)?;
    let _ = fs::remove_file(absolute.with_extension("html.bak"));

    let summary = summary_from_html(&conn, &workspace, &new_absolute, &html)?;
    upsert_note_index(&conn, &summary, &html)?;
    rebuild_index(&workspace)?;

    Ok(summary)
}

#[tauri::command]
fn reveal_in_explorer(
    path: String,
    note_path: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let workspace = workspace_path(&path)?;
    let absolute = note_absolute_path(&workspace, &note_path)?;
    let path_str = absolute.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        app.shell()
            .command("explorer")
            .args(["/select,", &path_str])
            .spawn()
            .map_err(to_error)?;
    }
    #[cfg(target_os = "macos")]
    {
        app.shell()
            .command("open")
            .args(["-R", &path_str])
            .spawn()
            .map_err(to_error)?;
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = absolute.parent() {
            app.shell()
                .command("xdg-open")
                .arg(parent.to_string_lossy().to_string())
                .spawn()
                .map_err(to_error)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn open_plugins_folder(path: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let workspace = workspace_path(&path)?;
    let plugins = plugins_dir(&workspace);
    fs::create_dir_all(&plugins).map_err(to_error)?;
    let path_str = plugins.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        app.shell()
            .command("explorer")
            .arg(&path_str)
            .spawn()
            .map_err(to_error)?;
    }
    #[cfg(target_os = "macos")]
    {
        app.shell()
            .command("open")
            .arg(&path_str)
            .spawn()
            .map_err(to_error)?;
    }
    #[cfg(target_os = "linux")]
    {
        app.shell()
            .command("xdg-open")
            .arg(&path_str)
            .spawn()
            .map_err(to_error)?;
    }

    Ok(())
}

#[tauri::command]
fn list_language_packs(path: String) -> Result<Vec<LoadedLanguagePack>, String> {
    let workspace = workspace_path(&path)?;
    let packs_dir = language_packs_dir(&workspace);
    if !packs_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut packs = Vec::new();
    for entry in fs::read_dir(&packs_dir).map_err(to_error)? {
        let entry = entry.map_err(to_error)?;
        let pack_path = entry.path();
        if !pack_path.is_dir() {
            continue;
        }

        let manifest_path = pack_path.join("manifest.json");
        let messages_path = pack_path.join("messages.json");
        if !manifest_path.is_file() || !messages_path.is_file() {
            continue;
        }

        let manifest_raw = fs::read_to_string(&manifest_path).map_err(to_error)?;
        let manifest: LanguagePackManifest =
            serde_json::from_str(&manifest_raw).map_err(to_error)?;
        validate_language_pack_manifest(&manifest)?;

        let messages_raw = fs::read_to_string(&messages_path).map_err(to_error)?;
        let messages_value: serde_json::Value =
            serde_json::from_str(&messages_raw).map_err(to_error)?;
        let object = messages_value
            .as_object()
            .ok_or_else(|| "messages.json must be a JSON object".to_string())?;
        let mut messages = HashMap::new();
        for (key, value) in object {
            if let Some(message) = value.as_str() {
                messages.insert(key.to_string(), message.to_string());
            }
        }

        packs.push(LoadedLanguagePack { manifest, messages });
    }

    packs.sort_by(|a, b| {
        a.manifest
            .native_name
            .to_lowercase()
            .cmp(&b.manifest.native_name.to_lowercase())
    });
    Ok(packs)
}

#[tauri::command]
fn open_language_packs_folder(path: String, app: tauri::AppHandle) -> Result<(), String> {
    let workspace = workspace_path(&path)?;
    let packs = language_packs_dir(&workspace);
    fs::create_dir_all(&packs).map_err(to_error)?;
    open_target_with_system(&app, &packs.to_string_lossy())
}

#[tauri::command]
fn list_installed_plugins(path: String) -> Result<Vec<InstalledPlugin>, String> {
    let workspace = workspace_path(&path)?;
    let plugins = plugins_dir(&workspace);
    if !plugins.is_dir() {
        return Ok(Vec::new());
    }

    let mut installed = Vec::new();
    for entry in fs::read_dir(&plugins).map_err(to_error)? {
        let entry = entry.map_err(to_error)?;
        let plugin_path = entry.path();
        if !plugin_path.is_dir() {
            continue;
        }

        if let Some(plugin) = read_installed_plugin(&plugin_path)? {
            installed.push(plugin);
        }
    }

    installed.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(installed)
}

#[tauri::command]
fn plugin_fs_read_text(path: String, file_path: String) -> Result<String, String> {
    let workspace = workspace_path(&path)?;
    fs::read_to_string(resolve_plugin_path(&workspace, &file_path)).map_err(to_error)
}

#[tauri::command]
fn plugin_fs_write_text(path: String, file_path: String, content: String) -> Result<(), String> {
    let workspace = workspace_path(&path)?;
    let target = resolve_plugin_path(&workspace, &file_path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(to_error)?;
    }
    fs::write(target, content).map_err(to_error)
}

#[tauri::command]
fn plugin_fs_list_dir(path: String, directory: String) -> Result<Vec<PluginFsEntry>, String> {
    let workspace = workspace_path(&path)?;
    let directory = resolve_plugin_path(&workspace, &directory);
    let mut entries = Vec::new();

    for entry in fs::read_dir(&directory).map_err(to_error)? {
        let entry = entry.map_err(to_error)?;
        let file_type = entry.file_type().map_err(to_error)?;
        entries.push(PluginFsEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: file_type.is_dir(),
            is_file: file_type.is_file(),
        });
    }

    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

#[tauri::command]
fn plugin_storage_get(
    path: String,
    input: PluginStorageInput,
) -> Result<Option<serde_json::Value>, String> {
    let storage = read_plugin_storage(&workspace_path(&path)?, &input.plugin_id)?;
    Ok(storage.get(input.key.trim()).cloned())
}

#[tauri::command]
fn plugin_storage_set(path: String, input: PluginStorageInput) -> Result<(), String> {
    let workspace = workspace_path(&path)?;
    let mut storage = read_plugin_storage(&workspace, &input.plugin_id)?;
    storage.insert(
        input.key.trim().to_string(),
        input.value.unwrap_or(serde_json::Value::Null),
    );
    write_plugin_storage(&workspace, &input.plugin_id, &storage)
}

#[tauri::command]
fn plugin_storage_remove(path: String, input: PluginStorageInput) -> Result<(), String> {
    let workspace = workspace_path(&path)?;
    let mut storage = read_plugin_storage(&workspace, &input.plugin_id)?;
    storage.remove(input.key.trim());
    write_plugin_storage(&workspace, &input.plugin_id, &storage)
}

#[tauri::command]
fn plugin_system_open_external(target: String, app: tauri::AppHandle) -> Result<(), String> {
    open_target_with_system(&app, &target)
}

#[tauri::command]
fn plugin_system_open_path(
    path: String,
    target: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let workspace = workspace_path(&path)?;
    let target = resolve_plugin_path(&workspace, &target);
    open_target_with_system(&app, &target.to_string_lossy())
}

#[tauri::command]
fn plugin_shell_exec(input: PluginShellExecInput) -> Result<PluginShellExecResult, String> {
    let command = input.command.trim();
    if command.is_empty() {
        return Err("shell command cannot be empty".to_string());
    }
    let args = input.args.unwrap_or_default();
    let cwd = input.cwd.as_deref().map(PathBuf::from);
    run_command_capture(
        command,
        &args,
        cwd.as_deref(),
        input.timeout_ms.unwrap_or(10_000).clamp(500, 120_000),
    )
}

#[tauri::command]
fn copy_workspace(source: String, destination: String) -> Result<(), String> {
    let src = PathBuf::from(&source);
    let dst = PathBuf::from(&destination);

    if !src.exists() {
        return Err("源工作区不存在".to_string());
    }

    fs::create_dir_all(&dst).map_err(to_error)?;

    for entry in WalkDir::new(&src).into_iter().filter_map(Result::ok) {
        let relative = entry.path().strip_prefix(&src).map_err(to_error)?;
        let target = dst.join(relative);

        if entry.file_type().is_dir() {
            fs::create_dir_all(&target).map_err(to_error)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(to_error)?;
            }
            fs::copy(entry.path(), &target).map_err(to_error)?;
        }
    }

    Ok(())
}

#[tauri::command]
fn move_workspace(source: String, destination: String) -> Result<(), String> {
    copy_workspace(source.clone(), destination)?;
    fs::remove_dir_all(&source).map_err(to_error)?;
    Ok(())
}

#[tauri::command]
fn write_export_file(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    write_file_atomically(&path, &content)
}

#[tauri::command]
fn write_settings(path: String, settings: serde_json::Value) -> Result<(), String> {
    let workspace = workspace_path(&path)?;
    let settings_path = workspace.join(".opaline/settings.json");
    let raw = serde_json::to_string_pretty(&settings).map_err(to_error)?;
    write_file_atomically(&settings_path, &raw)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            default_workspace_path,
            http_get_text,
            plugin_ping,
            plugin_tcp_connect,
            ensure_workspace,
            create_folder,
            list_notes,
            create_note,
            create_daily_note,
            read_note,
            save_note,
            search_notes,
            list_backlinks,
            graph_data,
            diagnose_workspace,
            rebuild_workspace_index,
            toggle_favorite,
            import_asset,
            read_settings,
            write_settings,
            list_language_packs,
            open_language_packs_folder,
            read_file_text,
            list_note_history,
            read_note_history,
            restore_note_history,
            rename_note,
            delete_note,
            move_note,
            reveal_in_explorer,
            open_plugins_folder,
            list_installed_plugins,
            plugin_fs_read_text,
            plugin_fs_write_text,
            plugin_fs_list_dir,
            plugin_storage_get,
            plugin_storage_set,
            plugin_storage_remove,
            plugin_system_open_external,
            plugin_system_open_path,
            plugin_shell_exec,
            copy_workspace,
            move_workspace,
            write_export_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

impl NoteSummary {
    fn last_opened(&self, conn: &Connection) -> Result<(), String> {
        conn.execute(
            "update notes set last_opened_at = ?1 where id = ?2",
            params![Utc::now().to_rfc3339(), self.id],
        )
        .map_err(to_error)?;
        Ok(())
    }
}

impl From<NoteDocument> for NoteSummary {
    fn from(note: NoteDocument) -> Self {
        Self {
            id: note.id,
            path: note.path,
            title: note.title,
            created_at: note.created_at,
            updated_at: note.updated_at,
            tags: note.tags,
            headings: note.headings,
            outgoing_links: note.outgoing_links,
            favorite: note.favorite,
        }
    }
}

fn workspace_path(path: &str) -> Result<PathBuf, String> {
    let workspace = PathBuf::from(path);
    if workspace.as_os_str().is_empty() {
        return Err("工作区路径不能为空".to_string());
    }
    Ok(workspace)
}

fn plugins_dir(workspace: &Path) -> PathBuf {
    workspace.join(".opaline").join("plugins")
}

fn language_packs_dir(workspace: &Path) -> PathBuf {
    workspace.join(".opaline").join("language-packs")
}

fn validate_language_pack_manifest(manifest: &LanguagePackManifest) -> Result<(), String> {
    if manifest.schema_version != 1 {
        return Err("language pack schemaVersion must be 1".to_string());
    }
    if manifest.id.trim().is_empty() {
        return Err("language pack id cannot be empty".to_string());
    }
    if manifest.locale.trim().is_empty() {
        return Err("language pack locale cannot be empty".to_string());
    }
    if manifest.native_name.trim().is_empty() {
        return Err("language pack nativeName cannot be empty".to_string());
    }
    Ok(())
}

fn plugin_data_dir(workspace: &Path, plugin_id: &str) -> Result<PathBuf, String> {
    let plugin_id = plugin_id.trim();
    if plugin_id.is_empty() {
        return Err("plugin id cannot be empty".to_string());
    }
    if plugin_id
        .chars()
        .any(|ch| !(ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.'))
    {
        return Err(
            "plugin id can only contain letters, numbers, dash, underscore, and dot".to_string(),
        );
    }
    Ok(workspace
        .join(".opaline")
        .join("plugin-data")
        .join(plugin_id))
}

fn resolve_plugin_path(workspace: &Path, value: &str) -> PathBuf {
    let raw = PathBuf::from(value.trim());
    if raw.is_absolute() {
        raw
    } else {
        workspace.join(raw)
    }
}

fn read_plugin_storage(
    workspace: &Path,
    plugin_id: &str,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let path = plugin_data_dir(workspace, plugin_id)?.join("storage.json");
    if !path.is_file() {
        return Ok(serde_json::Map::new());
    }
    let value: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(path).map_err(to_error)?).map_err(to_error)?;
    Ok(value.as_object().cloned().unwrap_or_default())
}

fn write_plugin_storage(
    workspace: &Path,
    plugin_id: &str,
    storage: &serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    let path = plugin_data_dir(workspace, plugin_id)?.join("storage.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_error)?;
    }
    let raw = serde_json::to_string_pretty(storage).map_err(to_error)?;
    fs::write(path, raw).map_err(to_error)
}

fn run_command_capture(
    command: &str,
    args: &[String],
    cwd: Option<&Path>,
    timeout_ms: u64,
) -> Result<PluginShellExecResult, String> {
    let started = Instant::now();
    let mut builder = Command::new(command);
    builder.args(args);
    if let Some(cwd) = cwd {
        builder.current_dir(cwd);
    }
    let mut child = builder
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(to_error)?;
    let timeout = Duration::from_millis(timeout_ms);
    let mut timed_out = false;

    loop {
        if child.try_wait().map_err(to_error)?.is_some() {
            break;
        }
        if started.elapsed() >= timeout {
            timed_out = true;
            let _ = child.kill();
            break;
        }
        thread::sleep(Duration::from_millis(20));
    }

    let output = child.wait_with_output().map_err(to_error)?;
    Ok(PluginShellExecResult {
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        elapsed_ms: started.elapsed().as_millis(),
        timed_out,
    })
}

fn open_target_with_system(app: &tauri::AppHandle, target: &str) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    #[cfg(target_os = "windows")]
    {
        app.shell()
            .command("cmd")
            .args(["/C", "start", "", target])
            .spawn()
            .map(|_| ())
            .map_err(to_error)
    }

    #[cfg(target_os = "macos")]
    {
        app.shell()
            .command("open")
            .arg(target)
            .spawn()
            .map(|_| ())
            .map_err(to_error)
    }

    #[cfg(target_os = "linux")]
    {
        app.shell()
            .command("xdg-open")
            .arg(target)
            .spawn()
            .map(|_| ())
            .map_err(to_error)
    }
}

fn read_installed_plugin(plugin_path: &Path) -> Result<Option<InstalledPlugin>, String> {
    let manifest_path = plugin_path.join("manifest.json");
    if !manifest_path.is_file() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&manifest_path).map_err(to_error)?;
    let manifest: PluginManifest = serde_json::from_str(&raw).map_err(to_error)?;
    let fallback_id = plugin_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("plugin")
        .to_string();
    let id = clean_manifest_text(manifest.id).unwrap_or(fallback_id);
    let name = clean_manifest_text(manifest.name).unwrap_or_else(|| id.clone());
    let version = clean_manifest_text(manifest.version).unwrap_or_else(|| "0.0.0".to_string());
    let description = clean_manifest_text(manifest.description).unwrap_or_default();
    let mut widgets = Vec::new();

    for widget in manifest.widgets.unwrap_or_default() {
        let widget_type = widget.widget_type.trim().to_string();
        if widget_type.is_empty() {
            continue;
        }

        let Some(script) = clean_manifest_text(widget.script) else {
            continue;
        };
        if is_unsafe_plugin_relative_path(&script) {
            continue;
        }

        let script_path = plugin_path.join(&script);
        if !script_path.is_file() {
            continue;
        }

        let code = fs::read_to_string(&script_path).map_err(to_error)?;
        widgets.push(InstalledPluginWidget {
            widget_type: widget_type.clone(),
            label: clean_manifest_text(widget.label).unwrap_or(widget_type),
            script,
            code,
        });
    }

    Ok(Some(InstalledPlugin {
        id,
        name,
        version,
        description,
        permissions: manifest.permissions.unwrap_or_default(),
        enabled: true,
        widgets,
    }))
}

fn clean_manifest_text(value: Option<String>) -> Option<String> {
    let value = value?.trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn is_unsafe_plugin_relative_path(value: &str) -> bool {
    Path::new(value).components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    })
}

fn open_index(workspace: &Path) -> Result<Connection, String> {
    Connection::open(workspace.join(".opaline/index.sqlite")).map_err(to_error)
}

fn migrate_index(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        pragma journal_mode = wal;
        pragma foreign_keys = on;

        create table if not exists notes (
          id text primary key,
          path text not null unique,
          title text not null,
          created_at text not null,
          updated_at text not null,
          body_text text not null default '',
          favorite integer not null default 0,
          last_opened_at text
        );

        create virtual table if not exists notes_fts
          using fts5(note_id unindexed, title, body_text, path unindexed);

        create table if not exists note_tags (
          note_id text not null,
          tag text not null,
          primary key (note_id, tag)
        );

        create table if not exists note_headings (
          note_id text not null,
          heading text not null,
          level integer not null,
          position integer not null,
          primary key (note_id, heading, position)
        );

        create table if not exists note_links (
          note_id text not null,
          href text not null,
          label text not null,
          target_id text,
          is_broken integer not null default 0,
          primary key (note_id, href)
        );

        create table if not exists app_state (
          key text primary key,
          value text not null
        );
        ",
    )
    .map_err(to_error)?;

    let _ = conn.execute("alter table notes add column created_at text", []);
    let _ = conn.execute(
        "alter table notes add column body_text text not null default ''",
        [],
    );
    let _ = conn.execute(
        "alter table notes add column favorite integer not null default 0",
        [],
    );
    let _ = conn.execute("alter table notes add column last_opened_at text", []);
    Ok(())
}

fn rebuild_index(workspace: &Path) -> Result<Vec<NoteSummary>, String> {
    let mut conn = open_index(workspace)?;
    migrate_index(&conn)?;

    let favorite_by_id = load_favorites(&conn)?;
    let notes_dir = workspace.join("notes");
    let mut notes = Vec::new();
    let mut present_ids = BTreeSet::new();
    let mut id_by_path = HashMap::new();
    let mut id_by_title = HashMap::new();

    for entry in WalkDir::new(&notes_dir).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }
        let file_path = entry.path();
        if file_path.extension().and_then(|ext| ext.to_str()) != Some("html") {
            continue;
        }

        let html = fs::read_to_string(file_path).map_err(to_error)?;
        let mut summary = summary_from_html(&conn, workspace, file_path, &html)?;
        summary.favorite = favorite_by_id.get(&summary.id).copied().unwrap_or(false);
        present_ids.insert(summary.id.clone());
        id_by_path.insert(summary.path.clone(), summary.id.clone());
        id_by_title.insert(summary.title.to_lowercase(), summary.id.clone());
        notes.push((summary, html));
    }

    for (summary, _) in &mut notes {
        resolve_links(summary, &present_ids, &id_by_path, &id_by_title);
    }

    {
        let tx = conn.transaction().map_err(to_error)?;
        tx.execute("delete from note_tags", []).map_err(to_error)?;
        tx.execute("delete from note_headings", [])
            .map_err(to_error)?;
        tx.execute("delete from note_links", []).map_err(to_error)?;
        tx.execute("delete from notes_fts", []).map_err(to_error)?;

        for (summary, html) in &notes {
            upsert_note_index(&tx, summary, html)?;
        }

        if present_ids.is_empty() {
            tx.execute("delete from notes", []).map_err(to_error)?;
        } else {
            let placeholders = present_ids
                .iter()
                .map(|_| "?")
                .collect::<Vec<_>>()
                .join(",");
            let sql = format!("delete from notes where id not in ({placeholders})");
            let params = rusqlite::params_from_iter(present_ids.iter());
            tx.execute(&sql, params).map_err(to_error)?;
        }

        tx.commit().map_err(to_error)?;
    }

    let mut summaries = notes
        .into_iter()
        .map(|(summary, _)| summary)
        .collect::<Vec<_>>();
    summaries.sort_by(|a, b| {
        b.favorite
            .cmp(&a.favorite)
            .then_with(|| b.updated_at.cmp(&a.updated_at))
            .then_with(|| a.title.cmp(&b.title))
    });
    Ok(summaries)
}

#[derive(Clone)]
struct DiagnosticNoteRecord {
    path: String,
    absolute_path: PathBuf,
    inspection: html_profile::NoteHtmlInspection,
}

fn diagnose_workspace_inner(workspace: &Path) -> Result<WorkspaceDiagnostics, String> {
    let mut summary = WorkspaceDiagnosticsSummary::default();
    let mut issues = Vec::new();
    let notes_dir = workspace.join("notes");
    let assets_dir = workspace.join("assets");
    let mut notes = Vec::new();
    let mut paths = BTreeSet::new();
    let mut id_paths: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut inventory_by_path: HashMap<String, html_profile::NoteTargetInventory> = HashMap::new();
    let mut path_by_id: HashMap<String, String> = HashMap::new();

    if !notes_dir.is_dir() {
        push_diagnostic_issue(
            &mut summary,
            &mut issues,
            "warning",
            "notes_dir_missing",
            Some("notes".to_string()),
            Vec::new(),
            None,
            "Workspace has no notes directory.",
        );
    } else {
        for entry in WalkDir::new(&notes_dir).into_iter().filter_map(Result::ok) {
            if !entry.file_type().is_file() {
                continue;
            }
            let file_path = entry.path();
            if file_path.extension().and_then(|ext| ext.to_str()) != Some("html") {
                continue;
            }

            summary.html_note_count += 1;
            let relative_path = relative_to_workspace(workspace, file_path)?;
            paths.insert(relative_path.clone());
            let html = match fs::read_to_string(file_path) {
                Ok(html) => html,
                Err(error) => {
                    summary.parse_failure_count += 1;
                    push_diagnostic_issue(
                        &mut summary,
                        &mut issues,
                        "error",
                        "read_failed",
                        Some(relative_path),
                        Vec::new(),
                        None,
                        &format!("Failed to read note HTML: {error}"),
                    );
                    continue;
                }
            };

            let inspection = html_profile::inspect_note_html(&html);
            summary.parsed_note_count += 1;

            if !inspection.has_html || !inspection.has_body {
                summary.parse_failure_count += 1;
                push_diagnostic_issue(
                    &mut summary,
                    &mut issues,
                    "warning",
                    "malformed_html",
                    Some(relative_path.clone()),
                    Vec::new(),
                    None,
                    "The note is missing an explicit html or body element.",
                );
            }

            if let Some(id) = inspection.metadata.id.clone() {
                id_paths
                    .entry(id.clone())
                    .or_default()
                    .push(relative_path.clone());
                path_by_id
                    .entry(id)
                    .or_insert_with(|| relative_path.clone());
            } else {
                summary.missing_id_count += 1;
                push_diagnostic_issue(
                    &mut summary,
                    &mut issues,
                    "warning",
                    "missing_opaline_id",
                    Some(relative_path.clone()),
                    Vec::new(),
                    None,
                    "The note is missing meta name=\"opaline:id\".",
                );
            }

            if inspection.metadata.title.is_none() {
                summary.missing_title_count += 1;
                push_diagnostic_issue(
                    &mut summary,
                    &mut issues,
                    "warning",
                    "missing_title",
                    Some(relative_path.clone()),
                    Vec::new(),
                    None,
                    "The note is missing a title element.",
                );
            }

            if inspection.metadata.first_h1.is_none() {
                summary.missing_h1_count += 1;
                push_diagnostic_issue(
                    &mut summary,
                    &mut issues,
                    "warning",
                    "missing_h1",
                    Some(relative_path.clone()),
                    Vec::new(),
                    None,
                    "The note is missing a first h1 heading.",
                );
            }

            if !inspection.has_note_article {
                summary.missing_note_article_count += 1;
                push_diagnostic_issue(
                    &mut summary,
                    &mut issues,
                    "error",
                    "missing_note_article",
                    Some(relative_path.clone()),
                    Vec::new(),
                    None,
                    "The note is missing article data-opaline-note.",
                );
            }

            if note_body_is_near_empty(&inspection) {
                summary.empty_body_count += 1;
                push_diagnostic_issue(
                    &mut summary,
                    &mut issues,
                    "warning",
                    "empty_body",
                    Some(relative_path.clone()),
                    Vec::new(),
                    None,
                    "The note body is empty or nearly empty.",
                );
            }

            inventory_by_path.insert(relative_path.clone(), inspection.target_inventory.clone());
            notes.push(DiagnosticNoteRecord {
                path: relative_path,
                absolute_path: file_path.to_path_buf(),
                inspection,
            });
        }
    }

    for (id, duplicate_paths) in &id_paths {
        if duplicate_paths.len() <= 1 {
            continue;
        }
        summary.duplicate_id_count += 1;
        push_diagnostic_issue(
            &mut summary,
            &mut issues,
            "error",
            "duplicate_opaline_id",
            None,
            duplicate_paths.clone(),
            Some(id.clone()),
            "Multiple notes share the same opaline:id.",
        );
    }

    diagnose_links(
        &notes,
        &inventory_by_path,
        &path_by_id,
        &mut summary,
        &mut issues,
    );
    diagnose_assets(workspace, &assets_dir, &notes, &mut summary, &mut issues)?;
    diagnose_index_state(workspace, &paths, &mut summary, &mut issues);

    Ok(WorkspaceDiagnostics { summary, issues })
}

fn diagnose_links(
    notes: &[DiagnosticNoteRecord],
    inventory_by_path: &HashMap<String, html_profile::NoteTargetInventory>,
    path_by_id: &HashMap<String, String>,
    summary: &mut WorkspaceDiagnosticsSummary,
    issues: &mut Vec<WorkspaceDiagnosticIssue>,
) {
    for note in notes {
        let note_dir = Path::new(&note.path)
            .parent()
            .unwrap_or_else(|| Path::new(""));
        for link in &note.inspection.links {
            if link.unresolved {
                summary.unresolved_link_count += 1;
                push_diagnostic_issue(
                    summary,
                    issues,
                    "warning",
                    "unresolved_wikilink",
                    Some(note.path.clone()),
                    Vec::new(),
                    Some(link.label.clone()),
                    "The note contains an unresolved [[...]] shortcut.",
                );
                continue;
            }

            if html_profile::is_external_href(&link.href)
                || link.href.starts_with('#')
                || link.kind == "concept"
                || link.href.starts_with("opaline://concept/")
            {
                if link.href.starts_with('#') {
                    diagnose_fragment_target(
                        &note.path,
                        &note.path,
                        link,
                        inventory_by_path,
                        summary,
                        issues,
                    );
                }
                continue;
            }

            if let Some(target_id) = &link.target_id {
                if !path_by_id.contains_key(target_id) {
                    summary.broken_href_count += 1;
                    push_diagnostic_issue(
                        summary,
                        issues,
                        "error",
                        "missing_link_target_id",
                        Some(note.path.clone()),
                        Vec::new(),
                        Some(target_id.clone()),
                        "data-opaline-link points to a missing note id.",
                    );
                }
            }

            if html_profile::is_note_html_href(&link.href) {
                let Some(target_path) = normalize_relative_note_path(note_dir, &link.href) else {
                    continue;
                };
                if !inventory_by_path.contains_key(&target_path) {
                    summary.broken_href_count += 1;
                    push_diagnostic_issue(
                        summary,
                        issues,
                        "error",
                        "broken_href",
                        Some(note.path.clone()),
                        Vec::new(),
                        Some(link.href.clone()),
                        "The href points to an HTML file that does not exist in notes.",
                    );
                    continue;
                }
                diagnose_fragment_target(
                    &note.path,
                    &target_path,
                    link,
                    inventory_by_path,
                    summary,
                    issues,
                );
            }
        }
    }
}

fn diagnose_fragment_target(
    source_path: &str,
    target_path: &str,
    link: &html_profile::NoteLink,
    inventory_by_path: &HashMap<String, html_profile::NoteTargetInventory>,
    summary: &mut WorkspaceDiagnosticsSummary,
    issues: &mut Vec<WorkspaceDiagnosticIssue>,
) {
    let Some(inventory) = inventory_by_path.get(target_path) else {
        return;
    };

    if link.kind == "block" {
        let block_id = link.target_block_id.clone().or_else(|| {
            link.fragment
                .as_deref()
                .map(html_profile::normalize_block_fragment_value)
        });
        if let Some(block_id) = block_id {
            let exists = contains_exact(&inventory.block_ids, &block_id)
                || contains_exact(&inventory.element_ids, &block_id);
            if !exists {
                summary.missing_block_target_count += 1;
                push_diagnostic_issue(
                    summary,
                    issues,
                    "warning",
                    "missing_block_target",
                    Some(source_path.to_string()),
                    vec![target_path.to_string()],
                    Some(block_id),
                    "The link points to a block id that does not exist in the target note.",
                );
            }
        }
        return;
    }

    if link.kind == "heading" {
        let heading = link.target_heading.clone().or_else(|| {
            link.fragment
                .as_deref()
                .map(html_profile::normalize_heading_fragment_value)
        });
        if let Some(heading) = heading {
            let raw_fragment = link.fragment.as_deref().unwrap_or("");
            let exists = contains_case_insensitive(&inventory.headings, &heading)
                || contains_exact(&inventory.heading_ids, raw_fragment)
                || contains_exact(&inventory.element_ids, raw_fragment);
            if !exists {
                summary.missing_heading_target_count += 1;
                push_diagnostic_issue(
                    summary,
                    issues,
                    "warning",
                    "missing_heading_target",
                    Some(source_path.to_string()),
                    vec![target_path.to_string()],
                    Some(heading),
                    "The link points to a heading that does not exist in the target note.",
                );
            }
        }
    }
}

fn diagnose_assets(
    workspace: &Path,
    assets_dir: &Path,
    notes: &[DiagnosticNoteRecord],
    summary: &mut WorkspaceDiagnosticsSummary,
    issues: &mut Vec<WorkspaceDiagnosticIssue>,
) -> Result<(), String> {
    let mut referenced_assets = HashSet::new();

    for note in notes {
        let note_dir = note.absolute_path.parent().unwrap_or_else(|| workspace);
        for reference in &note.inspection.asset_references {
            let Some(target_path) = resolve_local_reference(workspace, note_dir, &reference.source)
            else {
                continue;
            };
            if target_path.is_file() {
                if let Ok(relative) = relative_to_workspace(workspace, &target_path) {
                    referenced_assets.insert(relative);
                }
            } else {
                summary.missing_asset_count += 1;
                push_diagnostic_issue(
                    summary,
                    issues,
                    "warning",
                    "missing_asset",
                    Some(note.path.clone()),
                    Vec::new(),
                    Some(reference.source.clone()),
                    "The note references a local image or attachment that does not exist.",
                );
            }
        }
    }

    if assets_dir.is_dir() {
        for entry in WalkDir::new(assets_dir).into_iter().filter_map(Result::ok) {
            if !entry.file_type().is_file() {
                continue;
            }
            let relative = relative_to_workspace(workspace, entry.path())?;
            if !referenced_assets.contains(&relative) {
                summary.unreferenced_asset_count += 1;
                push_diagnostic_issue(
                    summary,
                    issues,
                    "warning",
                    "unreferenced_asset",
                    Some(relative),
                    Vec::new(),
                    None,
                    "The asset exists under assets but is not referenced by any note.",
                );
            }
        }
    }

    Ok(())
}

fn diagnose_index_state(
    workspace: &Path,
    note_paths: &BTreeSet<String>,
    summary: &mut WorkspaceDiagnosticsSummary,
    issues: &mut Vec<WorkspaceDiagnosticIssue>,
) {
    let index_path = workspace.join(".opaline/index.sqlite");
    if !index_path.is_file() {
        summary.needs_rebuild = true;
        push_diagnostic_issue(
            summary,
            issues,
            "warning",
            "index_missing",
            Some(".opaline/index.sqlite".to_string()),
            Vec::new(),
            None,
            "The SQLite index file is missing.",
        );
        return;
    }

    let conn = match Connection::open_with_flags(&index_path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(conn) => conn,
        Err(error) => {
            summary.needs_rebuild = true;
            push_diagnostic_issue(
                summary,
                issues,
                "warning",
                "index_read_failed",
                Some(".opaline/index.sqlite".to_string()),
                Vec::new(),
                None,
                &format!("Failed to open SQLite index read-only: {error}"),
            );
            return;
        }
    };

    let indexed_paths = match read_indexed_note_paths(&conn) {
        Ok(paths) => paths,
        Err(error) => {
            summary.needs_rebuild = true;
            push_diagnostic_issue(
                summary,
                issues,
                "warning",
                "index_read_failed",
                Some(".opaline/index.sqlite".to_string()),
                Vec::new(),
                None,
                &format!("Failed to read SQLite note index: {error}"),
            );
            return;
        }
    };

    summary.sqlite_note_count = Some(indexed_paths.len());
    summary.sqlite_relation_count = count_index_rows(&conn, "note_links").ok();

    if indexed_paths.len() != note_paths.len() {
        summary.needs_rebuild = true;
        push_diagnostic_issue(
            summary,
            issues,
            "warning",
            "index_count_mismatch",
            Some(".opaline/index.sqlite".to_string()),
            Vec::new(),
            Some(format!(
                "files={} sqlite={}",
                note_paths.len(),
                indexed_paths.len()
            )),
            "SQLite notes count does not match the number of HTML notes on disk.",
        );
    }

    for path in note_paths {
        if !indexed_paths.contains(path) {
            summary.needs_rebuild = true;
            push_diagnostic_issue(
                summary,
                issues,
                "warning",
                "index_missing_note",
                Some(path.clone()),
                Vec::new(),
                None,
                "The HTML note is missing from the SQLite index.",
            );
        }
    }

    for path in indexed_paths {
        if !note_paths.contains(&path) {
            summary.needs_rebuild = true;
            push_diagnostic_issue(
                summary,
                issues,
                "warning",
                "index_stale_note",
                Some(path),
                Vec::new(),
                None,
                "The SQLite index contains a note path that no longer exists.",
            );
        }
    }
}

fn read_indexed_note_paths(conn: &Connection) -> Result<BTreeSet<String>, String> {
    let mut statement = conn.prepare("select path from notes").map_err(to_error)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(to_error)?;
    let mut paths = BTreeSet::new();
    for row in rows {
        paths.insert(row.map_err(to_error)?);
    }
    Ok(paths)
}

fn count_index_rows(conn: &Connection, table: &str) -> Result<usize, String> {
    let sql = format!("select count(*) from {table}");
    let count: i64 = conn
        .query_row(&sql, [], |row| row.get(0))
        .map_err(to_error)?;
    Ok(count.max(0) as usize)
}

fn push_diagnostic_issue(
    summary: &mut WorkspaceDiagnosticsSummary,
    issues: &mut Vec<WorkspaceDiagnosticIssue>,
    level: &str,
    code: &str,
    path: Option<String>,
    related_paths: Vec<String>,
    target: Option<String>,
    message: &str,
) {
    if level == "error" {
        summary.error_count += 1;
    } else {
        summary.warning_count += 1;
    }
    issues.push(WorkspaceDiagnosticIssue {
        level: level.to_string(),
        code: code.to_string(),
        path,
        related_paths,
        target,
        message: message.to_string(),
    });
}

fn note_body_is_near_empty(inspection: &html_profile::NoteHtmlInspection) -> bool {
    let mut text = inspection.article_text.trim();
    if text.is_empty() {
        return true;
    }
    if let Some(h1) = inspection.metadata.first_h1.as_deref() {
        let h1 = h1.trim();
        if text == h1 {
            return true;
        }
        if let Some(rest) = text.strip_prefix(h1) {
            text = rest.trim();
        }
    }
    text.chars().filter(|ch| ch.is_alphanumeric()).count() < 3
}

fn resolve_local_reference(workspace: &Path, base_dir: &Path, source: &str) -> Option<PathBuf> {
    let source = html_profile::href_path_without_suffix(source);
    if source.is_empty() {
        return None;
    }
    let raw = Path::new(source);
    let joined = if raw.is_absolute() {
        workspace.join(source.trim_start_matches(['/', '\\']))
    } else {
        base_dir.join(raw)
    };
    let normalized = normalize_path_lexically(&joined);
    normalized.starts_with(workspace).then_some(normalized)
}

fn normalize_path_lexically(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::Normal(value) => normalized.push(value),
            Component::RootDir | Component::Prefix(_) => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

fn contains_case_insensitive(values: &[String], needle: &str) -> bool {
    values
        .iter()
        .any(|value| value.eq_ignore_ascii_case(needle))
}

fn contains_exact(values: &[String], needle: &str) -> bool {
    values.iter().any(|value| value == needle)
}

fn create_note_at(
    workspace: &Path,
    title: &str,
    lang: &str,
    directory: &str,
    body: &str,
) -> Result<NoteDocument, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let directory = clean_note_directory(directory)?;
    let directory_path = workspace.join(&directory);
    fs::create_dir_all(&directory_path).map_err(to_error)?;
    let file_name = unique_note_file(&directory_path, title);
    let note_path = directory_path.join(file_name);
    let html = render_note_html(&id, title, lang, &now, body);

    write_file_atomically(&note_path, &html)?;

    let conn = open_index(workspace)?;
    let summary = summary_from_html(&conn, workspace, &note_path, &html)?;
    upsert_note_index(&conn, &summary, &html)?;
    create_note_history_snapshot(workspace, &summary.id, &summary.path, &html, true)?;

    Ok(NoteDocument {
        id: summary.id,
        path: summary.path,
        title: summary.title,
        created_at: summary.created_at,
        updated_at: summary.updated_at,
        tags: summary.tags,
        headings: summary.headings,
        outgoing_links: summary.outgoing_links,
        favorite: summary.favorite,
        html,
    })
}

fn clean_note_directory(directory: &str) -> Result<String, String> {
    let directory = directory.trim().replace('\\', "/");
    if directory.is_empty() {
        return Ok("notes".to_string());
    }
    if directory != "notes" && !directory.starts_with("notes/") {
        return Err("笔记目录必须位于 notes 内".to_string());
    }
    if directory
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err("笔记目录无效".to_string());
    }
    Ok(directory)
}

fn upsert_note_index(conn: &Connection, note: &NoteSummary, html: &str) -> Result<(), String> {
    let body_text = plain_text(html);
    conn.execute(
        "
        insert into notes (id, path, title, created_at, updated_at, body_text, favorite)
        values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        on conflict(id) do update set
          path = excluded.path,
          title = excluded.title,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          body_text = excluded.body_text,
          favorite = notes.favorite
        ",
        params![
            note.id,
            note.path,
            note.title,
            note.created_at,
            note.updated_at,
            body_text,
            if note.favorite { 1 } else { 0 }
        ],
    )
    .map_err(to_error)?;

    conn.execute("delete from notes_fts where note_id = ?1", params![note.id])
        .map_err(to_error)?;
    conn.execute(
        "insert into notes_fts (note_id, title, body_text, path) values (?1, ?2, ?3, ?4)",
        params![note.id, note.title, body_text, note.path],
    )
    .map_err(to_error)?;

    conn.execute("delete from note_tags where note_id = ?1", params![note.id])
        .map_err(to_error)?;
    for tag in &note.tags {
        conn.execute(
            "insert or ignore into note_tags (note_id, tag) values (?1, ?2)",
            params![note.id, tag],
        )
        .map_err(to_error)?;
    }

    conn.execute(
        "delete from note_headings where note_id = ?1",
        params![note.id],
    )
    .map_err(to_error)?;
    let heading_details = html_profile::extract_note_heading_details(html);
    for (position, heading) in note.headings.iter().enumerate() {
        let level = heading_details
            .get(position)
            .map(|detail| detail.level as i64)
            .unwrap_or(1);
        conn.execute(
            "insert or ignore into note_headings (note_id, heading, level, position) values (?1, ?2, ?3, ?4)",
            params![note.id, heading, level, position as i64],
        )
        .map_err(to_error)?;
    }

    conn.execute(
        "delete from note_links where note_id = ?1",
        params![note.id],
    )
    .map_err(to_error)?;
    for link in &note.outgoing_links {
        conn.execute(
            "
            insert or ignore into note_links (note_id, href, label, target_id, is_broken)
            values (?1, ?2, ?3, ?4, ?5)
            ",
            params![
                note.id,
                link.href,
                link.label,
                link.target_id,
                if link.is_broken { 1 } else { 0 }
            ],
        )
        .map_err(to_error)?;
    }

    Ok(())
}

fn summary_from_html(
    conn: &Connection,
    workspace: &Path,
    file_path: &Path,
    html: &str,
) -> Result<NoteSummary, String> {
    let relative_path = relative_to_workspace(workspace, file_path)?;
    let inspection = html_profile::inspect_note_html(html);
    let id = inspection
        .metadata
        .id
        .clone()
        .unwrap_or_else(|| fallback_note_id(&relative_path));
    let title = inspection
        .metadata
        .title
        .clone()
        .or_else(|| inspection.metadata.first_h1.clone())
        .unwrap_or_else(|| "未命名笔记".to_string());
    let created_at = inspection
        .metadata
        .created_at
        .clone()
        .unwrap_or_else(|| file_timestamp(file_path));
    let updated_at = inspection
        .metadata
        .updated_at
        .clone()
        .unwrap_or_else(|| file_timestamp(file_path));

    Ok(NoteSummary {
        favorite: favorite_for(conn, &id)?,
        id,
        path: relative_path,
        title,
        created_at,
        updated_at,
        tags: inspection.tags,
        headings: inspection
            .headings
            .into_iter()
            .map(|heading| heading.text)
            .collect(),
        outgoing_links: inspection.links.into_iter().map(Into::into).collect(),
    })
}

fn resolve_links(
    note: &mut NoteSummary,
    present_ids: &BTreeSet<String>,
    id_by_path: &HashMap<String, String>,
    id_by_title: &HashMap<String, String>,
) {
    let note_dir = Path::new(&note.path)
        .parent()
        .unwrap_or_else(|| Path::new(""));

    for link in &mut note.outgoing_links {
        if is_external_href(&link.href)
            || link.href.starts_with('#')
            || link.kind == "concept"
            || link.href.starts_with("opaline://concept/")
        {
            link.is_broken = false;
            continue;
        }

        if let Some(target_id) = link.target_id.clone() {
            link.is_broken = !present_ids.contains(&target_id);
            link.target_id = Some(target_id);
            continue;
        }

        let normalized = normalize_relative_note_path(note_dir, &link.href);
        if let Some(target_id) = normalized.and_then(|path| id_by_path.get(&path).cloned()) {
            link.target_id = Some(target_id);
            link.is_broken = false;
        } else if let Some(target_id) = id_by_title.get(&link.label.to_lowercase()).cloned() {
            link.target_id = Some(target_id);
            link.is_broken = false;
        } else {
            link.is_broken = true;
        }
    }
}

fn is_external_href(href: &str) -> bool {
    html_profile::is_external_href(href)
}

fn collect_search_results<P: rusqlite::Params>(
    statement: &mut rusqlite::Statement<'_>,
    params: P,
) -> Result<Vec<SearchResult>, String> {
    statement
        .query_map(params, |row| {
            let body: String = row.get(3)?;
            Ok(SearchResult {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                excerpt: body.chars().take(160).collect(),
                updated_at: row.get(4)?,
            })
        })
        .map_err(to_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_error)
}

fn to_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .map(|term| {
            term.chars()
                .filter(|character| {
                    character.is_alphanumeric() || *character == '_' || *character == '-'
                })
                .collect::<String>()
        })
        .filter(|term| !term.is_empty())
        .map(|term| format!(r#""{term}""#))
        .collect::<Vec<_>>()
        .join(" AND ")
}

fn load_favorites(conn: &Connection) -> Result<HashMap<String, bool>, String> {
    let mut statement = conn
        .prepare("select id, favorite from notes where favorite = 1")
        .map_err(to_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? == 1))
        })
        .map_err(to_error)?;
    let mut favorites = HashMap::new();
    for row in rows {
        let (id, favorite) = row.map_err(to_error)?;
        favorites.insert(id, favorite);
    }
    Ok(favorites)
}

fn favorite_for(conn: &Connection, id: &str) -> Result<bool, String> {
    let favorite: Option<i64> = conn
        .query_row(
            "select favorite from notes where id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(to_error)?;
    Ok(favorite.unwrap_or(0) == 1)
}

const HISTORY_RETENTION_DAYS: i64 = 30;
const MILLIS_PER_DAY: i64 = 24 * 60 * 60 * 1000;

fn resolve_history_note_id(
    conn: &Connection,
    workspace: &Path,
    note_path: &str,
    note_id: &str,
) -> Result<String, String> {
    let trimmed_id = note_id.trim();
    if !trimmed_id.is_empty() {
        return Ok(trimmed_id.to_string());
    }

    let trimmed_path = note_path.trim();
    if trimmed_path.is_empty() {
        return Err("缺少笔记 ID".to_string());
    }

    let absolute = note_absolute_path(workspace, trimmed_path)?;
    if absolute.exists() {
        let html = fs::read_to_string(absolute).map_err(to_error)?;
        if let Some(id) = meta_content(&html, "opaline:id") {
            return Ok(id);
        }
    }

    conn.query_row(
        "select id from notes where path = ?1",
        params![trimmed_path],
        |row| row.get(0),
    )
    .optional()
    .map_err(to_error)?
    .ok_or_else(|| "找不到笔记历史".to_string())
}

fn resolve_note_path_for_history(
    conn: &Connection,
    note_path: &str,
    note_id: &str,
) -> Result<String, String> {
    if let Some(path) = conn
        .query_row(
            "select path from notes where id = ?1",
            params![note_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_error)?
    {
        return Ok(path);
    }

    let trimmed_path = note_path.trim();
    if trimmed_path.is_empty() {
        Err("找不到要恢复的笔记路径".to_string())
    } else {
        Ok(trimmed_path.to_string())
    }
}

fn create_note_history_snapshot(
    workspace: &Path,
    note_id: &str,
    note_path: &str,
    html: &str,
    force: bool,
) -> Result<Option<NoteHistoryEntry>, String> {
    if note_id.trim().is_empty() || html.trim().is_empty() {
        return Ok(None);
    }

    let history_dir = note_history_dir(workspace, note_id)?;
    fs::create_dir_all(&history_dir).map_err(to_error)?;

    if !force {
        if let Some(latest) = latest_note_history_entry(workspace, note_id)? {
            let latest_path = note_history_snapshot_path(workspace, note_id, &latest.snapshot_id)?;
            if fs::read_to_string(latest_path).map_err(to_error)? == html {
                cleanup_note_history(workspace, note_id)?;
                return Ok(None);
            }
        }
    }

    let timestamp = Utc::now().timestamp_millis();
    let mut snapshot_id = timestamp.to_string();
    let mut counter = 2;
    while history_dir.join(format!("{snapshot_id}.html")).exists() {
        snapshot_id = format!("{timestamp}-{counter}");
        counter += 1;
    }

    let snapshot_path = history_dir.join(format!("{snapshot_id}.html"));
    fs::write(&snapshot_path, html).map_err(to_error)?;
    let entry = note_history_entry_from_path(&snapshot_path)?;
    cleanup_note_history(workspace, note_id)?;

    let _ = note_path;
    Ok(Some(entry))
}

fn latest_note_history_entry(
    workspace: &Path,
    note_id: &str,
) -> Result<Option<NoteHistoryEntry>, String> {
    Ok(list_note_history_entries(workspace, note_id)?
        .into_iter()
        .next())
}

fn list_note_history_entries(
    workspace: &Path,
    note_id: &str,
) -> Result<Vec<NoteHistoryEntry>, String> {
    let history_dir = note_history_dir(workspace, note_id)?;
    if !history_dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(history_dir).map_err(to_error)? {
        let entry = entry.map_err(to_error)?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) == Some("html") {
            entries.push(note_history_entry_from_path(&path)?);
        }
    }

    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(entries)
}

fn note_history_entry_from_path(path: &Path) -> Result<NoteHistoryEntry, String> {
    let snapshot_id = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "历史版本文件名无效".to_string())?
        .to_string();
    let timestamp_millis = snapshot_timestamp_millis(&snapshot_id).unwrap_or(0);
    let created_at = if timestamp_millis > 0 {
        Utc.timestamp_millis_opt(timestamp_millis)
            .single()
            .map(|value| value.to_rfc3339())
            .unwrap_or_else(|| file_timestamp(path))
    } else {
        file_timestamp(path)
    };
    let html = fs::read_to_string(path).unwrap_or_default();
    let title = title_content(&html).or_else(|| first_heading_content(&html));
    let size = fs::metadata(path).map_err(to_error)?.len();

    Ok(NoteHistoryEntry {
        id: snapshot_id.clone(),
        snapshot_id,
        timestamp: timestamp_millis.to_string(),
        created_at,
        size,
        title,
    })
}

fn cleanup_note_history(workspace: &Path, note_id: &str) -> Result<(), String> {
    let history_dir = note_history_dir(workspace, note_id)?;
    if !history_dir.exists() {
        return Ok(());
    }

    let cutoff = Utc::now().timestamp_millis() - HISTORY_RETENTION_DAYS * MILLIS_PER_DAY;
    for entry in fs::read_dir(history_dir).map_err(to_error)? {
        let entry = entry.map_err(to_error)?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("html") {
            continue;
        }
        let Some(snapshot_id) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        if snapshot_timestamp_millis(snapshot_id).is_some_and(|timestamp| timestamp < cutoff) {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

fn note_history_dir(workspace: &Path, note_id: &str) -> Result<PathBuf, String> {
    let safe_id = safe_history_component(note_id);
    if safe_id.is_empty() {
        return Err("笔记 ID 无效".to_string());
    }
    Ok(workspace.join(".opaline/history").join(safe_id))
}

fn note_history_snapshot_path(
    workspace: &Path,
    note_id: &str,
    snapshot_id: &str,
) -> Result<PathBuf, String> {
    let snapshot_id = clean_snapshot_id(snapshot_id)?;
    Ok(note_history_dir(workspace, note_id)?.join(format!("{snapshot_id}.html")))
}

fn clean_snapshot_id(snapshot_id: &str) -> Result<String, String> {
    let id = snapshot_id.trim().trim_end_matches(".html");
    if id.is_empty()
        || id.contains('/')
        || id.contains('\\')
        || id.contains("..")
        || !id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err("历史版本 ID 无效".to_string());
    }
    Ok(id.to_string())
}

fn safe_history_component(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn snapshot_timestamp_millis(snapshot_id: &str) -> Option<i64> {
    snapshot_id
        .split('-')
        .next()
        .and_then(|value| value.parse::<i64>().ok())
}

fn relative_to_workspace(workspace: &Path, file_path: &Path) -> Result<String, String> {
    file_path
        .strip_prefix(workspace)
        .map_err(to_error)
        .map(|path| path.to_string_lossy().replace('\\', "/"))
}

fn fallback_note_id(relative_path: &str) -> String {
    format!("path:{relative_path}")
}

fn note_absolute_path(workspace: &Path, note_path: &str) -> Result<PathBuf, String> {
    let relative = PathBuf::from(note_path);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::Prefix(_)
                    | std::path::Component::RootDir
            )
        })
    {
        return Err("笔记路径不能包含上级目录".to_string());
    }

    let absolute = workspace.join(relative);
    if absolute.extension().and_then(|ext| ext.to_str()) != Some("html") {
        return Err("只能读取或保存 HTML 笔记".to_string());
    }
    if !absolute.starts_with(workspace.join("notes")) {
        return Err("只能读取或保存 notes 目录内的 HTML 笔记".to_string());
    }
    Ok(absolute)
}

fn render_note_html(id: &str, title: &str, lang: &str, timestamp: &str, body: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="{lang}">
  <head>
    <meta charset="utf-8">
    <title>{title}</title>
    <meta name="opaline:id" content="{id}">
    <meta name="opaline:created" content="{timestamp}">
    <meta name="opaline:updated" content="{timestamp}">
  </head>
  <body>
    <article data-opaline-note>
      <h1>{title}</h1>
      {body}
    </article>
  </body>
</html>
"#,
        lang = escape_attr(lang),
        title = escape_text(title),
        id = escape_attr(id),
        timestamp = escape_attr(timestamp),
        body = body,
    )
}

fn unique_note_file(notes_dir: &Path, title: &str) -> String {
    let base = slugify(title);
    let mut candidate = format!("{base}.html");
    let mut counter = 2;
    while notes_dir.join(&candidate).exists() {
        candidate = format!("{base}-{counter}.html");
        counter += 1;
    }
    candidate
}

fn unique_asset_file(directory: &Path, name: &str) -> String {
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("asset");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let mut candidate = name.to_string();
    let mut counter = 2;

    while directory.join(&candidate).exists() {
        candidate = if extension.is_empty() {
            format!("{stem}-{counter}")
        } else {
            format!("{stem}-{counter}.{extension}")
        };
        counter += 1;
    }

    candidate
}

fn slugify(title: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for character in title.trim().to_lowercase().chars() {
        if character.is_alphanumeric() {
            slug.push(character);
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "untitled".to_string()
    } else {
        slug.chars().take(60).collect()
    }
}

fn clean_title(title: &str) -> String {
    let title = title.trim();
    if title.is_empty() {
        "未命名笔记".to_string()
    } else {
        title.to_string()
    }
}

fn normalize_note_html(
    html: &str,
    fallback_id: &str,
    fallback_title: &str,
) -> Result<String, String> {
    if !html_profile::document_has_complete_html(html) {
        return Err("保存失败：笔记必须是完整 HTML 文档".to_string());
    }
    if !html_profile::document_has_note_article(html) {
        return Err("保存失败：笔记正文缺少 data-opaline-note".to_string());
    }

    let mut normalized = html.to_string();
    let now = Utc::now().to_rfc3339();
    normalized = upsert_meta_content(&normalized, "opaline:id", fallback_id);
    normalized = upsert_meta_content(&normalized, "opaline:updated", &now);
    normalized = html_profile::ensure_title(&normalized, fallback_title);
    if !normalized.starts_with("<!doctype html>") {
        normalized = format!("<!doctype html>\n{normalized}");
    }
    Ok(normalized)
}

fn note_html_equivalent_for_save(left: &str, right: &str) -> bool {
    normalize_updated_meta_for_compare(left) == normalize_updated_meta_for_compare(right)
}

fn normalize_updated_meta_for_compare(html: &str) -> String {
    html_profile::normalize_updated_meta_for_compare(html)
}

fn write_file_atomically(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "保存失败：笔记路径无父目录".to_string())?;
    fs::create_dir_all(parent).map_err(to_error)?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "保存失败：笔记文件名无效".to_string())?;
    let temp_path = parent.join(format!(".{file_name}.{}.tmp", Uuid::new_v4()));
    let backup_path = parent.join(format!(".{file_name}.bak"));

    {
        let mut temp_file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(to_error)?;
        temp_file.write_all(contents.as_bytes()).map_err(to_error)?;
        temp_file.flush().map_err(to_error)?;
        temp_file.sync_all().map_err(to_error)?;
    }

    if path.exists() {
        if backup_path.exists() {
            fs::remove_file(&backup_path).map_err(to_error)?;
        }
        fs::rename(path, &backup_path).map_err(to_error)?;
    }
    if let Err(error) = fs::rename(&temp_path, path) {
        if backup_path.exists() {
            let _ = fs::rename(&backup_path, path);
        }
        return Err(error.to_string());
    }
    if backup_path.exists() {
        fs::remove_file(&backup_path).map_err(to_error)?;
    }
    Ok(())
}

fn file_timestamp(file_path: &Path) -> String {
    fs::metadata(file_path)
        .and_then(|metadata| metadata.modified())
        .map(|modified| chrono::DateTime::<Utc>::from(modified).to_rfc3339())
        .unwrap_or_else(|_| Utc::now().to_rfc3339())
}

fn concept_node_id(concept: &str) -> String {
    format!("concept:{}", concept.trim().to_lowercase())
}

fn normalize_relative_note_path(base_dir: &Path, href: &str) -> Option<String> {
    let href = html_profile::href_path_without_suffix(href);
    if href.is_empty() || !href.ends_with(".html") {
        return None;
    }

    let mut components = Vec::new();
    for component in base_dir.join(href).components() {
        match component {
            std::path::Component::Normal(value) => {
                components.push(value.to_string_lossy().to_string())
            }
            std::path::Component::ParentDir => {
                components.pop();
            }
            std::path::Component::CurDir => {}
            _ => {}
        }
    }

    let path = components.join("/");
    if path.starts_with("notes/") {
        Some(path)
    } else {
        Some(format!("notes/{path}"))
    }
}

fn plain_text(html: &str) -> String {
    html_profile::plain_text_from_html(html)
}

fn upsert_meta_content(html: &str, name: &str, content: &str) -> String {
    html_profile::upsert_meta_content(html, name, content)
}

fn meta_content(html: &str, name: &str) -> Option<String> {
    html_profile::meta_content(html, name)
}

fn title_content(html: &str) -> Option<String> {
    html_profile::title_content(html)
}

fn first_heading_content(html: &str) -> Option<String> {
    html_profile::first_heading_content(html)
}

fn escape_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_attr(value: &str) -> String {
    escape_text(value).replace('"', "&quot;")
}

fn to_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut output = String::new();
    for (index, ch) in value.chars().enumerate() {
        if index >= max_chars {
            output.push_str("\n…");
            break;
        }
        output.push(ch);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_workspace() -> PathBuf {
        std::env::current_dir()
            .expect("current dir")
            .join("target")
            .join("test-workspaces")
            .join(Uuid::new_v4().to_string())
    }

    #[test]
    fn note_directories_stay_inside_notes() {
        assert_eq!(clean_note_directory("notes").unwrap(), "notes");
        assert_eq!(clean_note_directory("notes/inbox").unwrap(), "notes/inbox");
        assert!(clean_note_directory("notes-other").is_err());
        assert!(clean_note_directory("../notes").is_err());
        assert!(clean_note_directory("notes/../outside").is_err());
    }

    #[test]
    fn workspace_round_trip_rebuilds_metadata() {
        let workspace = test_workspace();
        let workspace_string = workspace.to_string_lossy().to_string();

        ensure_workspace(workspace_string.clone()).expect("workspace is created");

        let note = create_note(
            workspace_string.clone(),
            NewNoteInput {
                title: "测试笔记".to_string(),
                lang: Some("zh-Hans".to_string()),
                body: None,
                directory: None,
            },
        )
        .expect("note is created");

        let linked = create_note(
            workspace_string.clone(),
            NewNoteInput {
                title: "linked".to_string(),
                lang: Some("zh-Hans".to_string()),
                body: None,
                directory: None,
            },
        )
        .expect("linked note is created");

        assert!(workspace.join(&note.path).exists());
        assert_eq!(note.title, "测试笔记");

        let saved_html = note.html.replace(
            "<p></p>",
            &format!(
                r#"<p><span data-opaline-tag="research">#research</span></p><h2>二级标题</h2><p><a href="{}" data-opaline-link="{}">linked</a></p>"#,
                linked.path.replace("notes/", ""),
                linked.id
            ),
        );
        let saved = save_note(
            workspace_string.clone(),
            NoteDocument {
                html: saved_html,
                ..note
            },
            Some(true),
        )
        .expect("note is saved");

        assert!(saved.tags.contains(&"research".to_string()));
        assert!(saved.headings.contains(&"二级标题".to_string()));
        assert!(saved
            .outgoing_links
            .iter()
            .any(|link| link.target_id == Some(linked.id.clone())));

        let notes = list_notes(workspace_string.clone()).expect("notes are indexed");
        assert_eq!(notes.len(), 2);

        let backlinks =
            list_backlinks(workspace_string.clone(), linked.id).expect("backlinks are listed");
        assert_eq!(backlinks.len(), 1);

        let results = search_notes(workspace_string, "research".to_string()).expect("search works");
        assert!(!results.is_empty());

        fs::remove_dir_all(workspace).expect("test workspace cleaned up");
    }

    #[test]
    fn note_history_snapshots_and_restores_without_git() {
        let workspace = test_workspace();
        let workspace_string = workspace.to_string_lossy().to_string();
        ensure_workspace(workspace_string.clone()).expect("workspace is created");

        let note = create_note(
            workspace_string.clone(),
            NewNoteInput {
                title: "history note".to_string(),
                lang: Some("en".to_string()),
                body: None,
                directory: None,
            },
        )
        .expect("note is created");

        let initial_history =
            list_note_history(workspace_string.clone(), note.path.clone(), note.id.clone())
                .expect("initial history is listed");
        assert_eq!(initial_history.len(), 1);

        let changed = save_note(
            workspace_string.clone(),
            NoteDocument {
                html: note.html.replace("<p></p>", "<p>changed content</p>"),
                ..note.clone()
            },
            Some(true),
        )
        .expect("note is saved");

        let history = list_note_history(
            workspace_string.clone(),
            changed.path.clone(),
            changed.id.clone(),
        )
        .expect("history is listed");
        assert!(history.len() >= 2);
        let latest = history.first().expect("latest snapshot");
        let latest_html = read_note_history(
            workspace_string.clone(),
            changed.path.clone(),
            changed.id.clone(),
            latest.snapshot_id.clone(),
        )
        .expect("latest history is read");
        assert!(latest_html.contains("changed content"));

        let unchanged = save_note(
            workspace_string.clone(),
            NoteDocument {
                html: changed.html.clone(),
                ..changed.clone()
            },
            Some(true),
        )
        .expect("unchanged note is accepted");
        let unchanged_history = list_note_history(
            workspace_string.clone(),
            unchanged.path.clone(),
            unchanged.id.clone(),
        )
        .expect("history is listed after unchanged save");
        assert_eq!(unchanged_history.len(), history.len());

        let oldest = history.last().expect("oldest snapshot");
        let restored = restore_note_history(
            workspace_string.clone(),
            changed.path.clone(),
            changed.id.clone(),
            oldest.snapshot_id.clone(),
        )
        .expect("history is restored");
        assert!(!restored.html.contains("changed content"));

        let post_restore_history = list_note_history(workspace_string, restored.path, restored.id)
            .expect("history remains");
        assert!(post_restore_history.len() >= 3);

        fs::remove_dir_all(workspace).expect("test workspace cleaned up");
    }

    #[test]
    fn atomic_write_replaces_file_with_complete_contents() {
        let workspace = test_workspace();
        fs::create_dir_all(&workspace).expect("workspace dir");
        let note_path = workspace.join("note.html");

        write_file_atomically(&note_path, "<p>first</p>").expect("initial write");
        write_file_atomically(&note_path, &"<p>second</p>".repeat(2048))
            .expect("replacement write");

        let saved = fs::read_to_string(&note_path).expect("saved file");
        assert!(saved.starts_with("<p>second</p>"));
        assert!(!saved.contains("<p>first</p>"));
        let leftovers = fs::read_dir(&workspace)
            .expect("read workspace")
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains("note.html."))
            .count();
        assert_eq!(leftovers, 0);

        fs::remove_dir_all(workspace).expect("test workspace cleaned up");
    }

    #[test]
    fn html_profile_extracts_core_metadata_from_nested_html() {
        let html = r#"<!doctype html>
<html lang="zh-Hans">
  <head>
    <meta charset="utf-8">
    <title>测试 &amp; 标题</title>
    <meta name="opaline:id" content="note-1">
    <meta name="opaline:created" content="2026-05-14T00:00:00Z">
    <meta name="opaline:updated" content="2026-05-14T00:00:00Z">
  </head>
  <body>
    <article data-opaline-note>
      <h1 data-opaline-block-id="b-title">测试 &amp; 标题</h1>
      <section data-opaline-callout="note">
        <h2>研究问题</h2>
        <p><span data-opaline-tag="research">#research</span> HTML 笔记</p>
        <p><a href="related.html#b-intro" data-opaline-link="note-2" data-opaline-block-ref="b-intro">相关笔记</a></p>
      </section>
    </article>
  </body>
</html>"#;

        assert_eq!(meta_content(html, "opaline:id").as_deref(), Some("note-1"));
        assert_eq!(
            meta_content(r#"<meta content="note-2" name="opaline:id">"#, "opaline:id").as_deref(),
            Some("note-2")
        );
        assert_eq!(title_content(html).as_deref(), Some("测试 & 标题"));
        assert_eq!(first_heading_content(html).as_deref(), Some("测试 & 标题"));
        assert!(html_profile::extract_note_tags(html).contains(&"research".to_string()));
        assert!(html_profile::extract_note_headings(html).contains(&"研究问题".to_string()));
        assert!(plain_text(html).contains("HTML 笔记"));

        let links = html_profile::extract_note_links(html);
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].href, "related.html#b-intro");
        assert_eq!(links[0].target_id.as_deref(), Some("note-2"));
    }

    #[test]
    fn link_resolution_rules_distinguish_external_internal_and_broken_links() {
        let mut note = NoteSummary {
            id: "source".to_string(),
            path: "notes/projects/source.html".to_string(),
            title: "source".to_string(),
            created_at: "2026-05-14T00:00:00Z".to_string(),
            updated_at: "2026-05-14T00:00:00Z".to_string(),
            tags: vec![],
            headings: vec![],
            favorite: false,
            outgoing_links: vec![
                LinkInfo {
                    href: "https://example.com".to_string(),
                    label: "external".to_string(),
                    target_id: None,
                    is_broken: false,
                    kind: "note".to_string(),
                    target_heading: None,
                    target_block_id: None,
                    concept: None,
                },
                LinkInfo {
                    href: "#local-block".to_string(),
                    label: "local".to_string(),
                    target_id: None,
                    is_broken: false,
                    kind: "heading".to_string(),
                    target_heading: Some("local block".to_string()),
                    target_block_id: None,
                    concept: None,
                },
                LinkInfo {
                    href: "../target.html#b-intro".to_string(),
                    label: "target".to_string(),
                    target_id: None,
                    is_broken: false,
                    kind: "block".to_string(),
                    target_heading: None,
                    target_block_id: Some("b intro".to_string()),
                    concept: None,
                },
                LinkInfo {
                    href: "missing.html".to_string(),
                    label: "missing".to_string(),
                    target_id: None,
                    is_broken: false,
                    kind: "note".to_string(),
                    target_heading: None,
                    target_block_id: None,
                    concept: None,
                },
                LinkInfo {
                    href: "stale.html".to_string(),
                    label: "stale".to_string(),
                    target_id: Some("deleted".to_string()),
                    is_broken: false,
                    kind: "note".to_string(),
                    target_heading: None,
                    target_block_id: None,
                    concept: None,
                },
            ],
        };
        let present_ids = BTreeSet::from(["target-id".to_string()]);
        let id_by_path =
            HashMap::from([("notes/target.html".to_string(), "target-id".to_string())]);
        let id_by_title = HashMap::from([("target".to_string(), "target-id".to_string())]);

        resolve_links(&mut note, &present_ids, &id_by_path, &id_by_title);

        assert!(!note.outgoing_links[0].is_broken);
        assert!(!note.outgoing_links[1].is_broken);
        assert_eq!(
            note.outgoing_links[2].target_id.as_deref(),
            Some("target-id")
        );
        assert!(!note.outgoing_links[2].is_broken);
        assert!(note.outgoing_links[3].is_broken);
        assert!(note.outgoing_links[4].is_broken);
    }

    #[test]
    fn search_uses_fts_for_ranked_matches() {
        let workspace = test_workspace();
        let workspace_string = workspace.to_string_lossy().to_string();
        ensure_workspace(workspace_string.clone()).expect("workspace is created");

        let alpha = create_note(
            workspace_string.clone(),
            NewNoteInput {
                title: "Alpha Research".to_string(),
                lang: Some("en".to_string()),
                body: None,
                directory: None,
            },
        )
        .expect("alpha is created");

        let beta = create_note(
            workspace_string.clone(),
            NewNoteInput {
                title: "Beta Notes".to_string(),
                lang: Some("en".to_string()),
                body: None,
                directory: None,
            },
        )
        .expect("beta is created");

        let _ = save_note(
            workspace_string.clone(),
            NoteDocument {
                html: alpha.html.replace(
                    "<p></p>",
                    "<p>opaline semantic retrieval and html profile</p>",
                ),
                ..alpha
            },
            Some(true),
        )
        .expect("alpha is saved");
        let _ = save_note(
            workspace_string.clone(),
            NoteDocument {
                html: beta
                    .html
                    .replace("<p></p>", "<p>unrelated journal text</p>"),
                ..beta
            },
            Some(true),
        )
        .expect("beta is saved");

        let results =
            search_notes(workspace_string, "semantic retrieval".to_string()).expect("search works");
        assert_eq!(
            results.first().map(|result| result.title.as_str()),
            Some("Alpha Research")
        );

        fs::remove_dir_all(workspace).expect("test workspace cleaned up");
    }

    #[test]
    fn workspace_diagnostics_report_profile_links_and_assets() {
        let workspace = test_workspace();
        let workspace_string = workspace.to_string_lossy().to_string();
        ensure_workspace(workspace_string.clone()).expect("workspace is created");
        fs::create_dir_all(workspace.join("assets/images")).expect("assets dir");
        fs::write(workspace.join("assets/images/used.png"), "used").expect("used asset");
        fs::write(workspace.join("assets/images/unused.png"), "unused").expect("unused asset");

        write_test_note(
            &workspace,
            "notes/target.html",
            r#"<!doctype html>
<html><head><title>Target</title><meta name="opaline:id" content="target"></head>
<body><article data-opaline-note><h1>Target</h1><h2 id="existing-heading">Existing Heading</h2><p id="b-existing" data-opaline-block>enough body text</p></article></body></html>"#,
        );
        write_test_note(
            &workspace,
            "notes/source.html",
            r#"<!doctype html>
<html><head><title>Source</title><meta name="opaline:id" content="source"></head>
<body><article data-opaline-note><h1>Source</h1><p>source body text</p>
<a href="missing.html">Missing file</a>
<a href="target.html#Missing-Heading" data-opaline-link-kind="heading">Missing heading</a>
<a href="target.html#b-missing" data-opaline-link-kind="block">Missing block</a>
<span data-opaline-unresolved="No Such Note">[[No Such Note]]</span>
<img src="../assets/images/missing.png"><img src="../assets/images/used.png">
</article></body></html>"#,
        );
        write_test_note(
            &workspace,
            "notes/no-id.html",
            r#"<!doctype html><html><head><title>No ID</title></head><body><article data-opaline-note><h1>No ID</h1><p>body text</p></article></body></html>"#,
        );
        write_test_note(
            &workspace,
            "notes/duplicate-a.html",
            r#"<!doctype html><html><head><title>Dup A</title><meta name="opaline:id" content="dup"></head><body><article data-opaline-note><h1>Dup A</h1><p>body text</p></article></body></html>"#,
        );
        write_test_note(
            &workspace,
            "notes/duplicate-b.html",
            r#"<!doctype html><html><head><title>Dup B</title><meta name="opaline:id" content="dup"></head><body><article data-opaline-note><h1>Dup B</h1><p>body text</p></article></body></html>"#,
        );
        write_test_note(
            &workspace,
            "notes/no-article.html",
            r#"<!doctype html><html><head><title>No Article</title><meta name="opaline:id" content="no-article"></head><body><h1>No Article</h1><p>body text</p></body></html>"#,
        );

        let diagnostics = diagnose_workspace(workspace_string).expect("diagnostics run");

        assert_eq!(diagnostics.summary.html_note_count, 6);
        assert_eq!(diagnostics.summary.missing_id_count, 1);
        assert_eq!(diagnostics.summary.duplicate_id_count, 1);
        assert_eq!(diagnostics.summary.missing_note_article_count, 1);
        assert!(diagnostics.summary.unresolved_link_count >= 1);
        assert!(diagnostics.summary.broken_href_count >= 1);
        assert!(diagnostics.summary.missing_heading_target_count >= 1);
        assert!(diagnostics.summary.missing_block_target_count >= 1);
        assert!(diagnostics.summary.missing_asset_count >= 1);
        assert!(diagnostics.summary.unreferenced_asset_count >= 1);
        assert!(has_issue(&diagnostics, "missing_opaline_id"));
        assert!(has_issue(&diagnostics, "duplicate_opaline_id"));
        assert!(has_issue(&diagnostics, "missing_note_article"));
        assert!(has_issue(&diagnostics, "broken_href"));
        assert!(has_issue(&diagnostics, "missing_asset"));
        assert!(has_issue(&diagnostics, "unreferenced_asset"));

        fs::remove_dir_all(workspace).expect("test workspace cleaned up");
    }

    #[test]
    fn diagnostics_profile_issue_does_not_request_index_rebuild() {
        let workspace = test_workspace();
        let workspace_string = workspace.to_string_lossy().to_string();
        ensure_workspace(workspace_string.clone()).expect("workspace is created");

        write_test_note(
            &workspace,
            "notes/no-article.html",
            r#"<!doctype html>
<html><head><title>No Article</title><meta name="opaline:id" content="no-article"></head>
<body><h1>No Article</h1><p>body text</p></body></html>"#,
        );

        rebuild_workspace_index(workspace_string.clone()).expect("index rebuilt");
        let diagnostics = diagnose_workspace(workspace_string).expect("diagnostics run");

        assert!(has_issue(&diagnostics, "missing_note_article"));
        assert!(diagnostics.summary.error_count > 0);
        assert_eq!(diagnostics.summary.sqlite_note_count, Some(1));
        assert!(!diagnostics.summary.needs_rebuild);

        fs::remove_dir_all(workspace).expect("test workspace cleaned up");
    }

    #[test]
    fn rebuild_workspace_index_matches_notes_and_relations() {
        let workspace = test_workspace();
        let workspace_string = workspace.to_string_lossy().to_string();
        ensure_workspace(workspace_string.clone()).expect("workspace is created");

        write_test_note(
            &workspace,
            "notes/target.html",
            r#"<!doctype html>
<html><head><title>Target</title><meta name="opaline:id" content="target"><meta name="opaline:created" content="2026-05-14T00:00:00Z"><meta name="opaline:updated" content="2026-05-14T00:00:00Z"></head>
<body><article data-opaline-note><h1>Target</h1><p id="b-target" data-opaline-block>target body text</p></article></body></html>"#,
        );
        write_test_note(
            &workspace,
            "notes/source.html",
            r#"<!doctype html>
<html><head><title>Source</title><meta name="opaline:id" content="source"><meta name="opaline:created" content="2026-05-14T00:00:00Z"><meta name="opaline:updated" content="2026-05-14T00:00:00Z"></head>
<body><article data-opaline-note><h1>Source</h1><p>source body text <a href="target.html" data-opaline-link="target">Target</a></p></article></body></html>"#,
        );

        let before =
            diagnose_workspace(workspace_string.clone()).expect("diagnostics before rebuild");
        assert!(before.summary.needs_rebuild);

        let notes = rebuild_workspace_index(workspace_string.clone()).expect("index rebuilt");
        assert_eq!(notes.len(), 2);

        let conn = open_index(&workspace).expect("index opens");
        let note_count: i64 = conn
            .query_row("select count(*) from notes", [], |row| row.get(0))
            .expect("note count");
        let relation_count: i64 = conn
            .query_row("select count(*) from note_links", [], |row| row.get(0))
            .expect("link count");
        assert_eq!(note_count, 2);
        assert_eq!(relation_count, 1);

        let after = diagnose_workspace(workspace_string).expect("diagnostics after rebuild");
        assert_eq!(after.summary.sqlite_note_count, Some(2));
        assert_eq!(after.summary.sqlite_relation_count, Some(1));
        assert!(!after.summary.needs_rebuild);

        fs::remove_dir_all(workspace).expect("test workspace cleaned up");
    }

    #[test]
    fn rebuild_workspace_index_preserves_existing_index_on_scan_failure() {
        let workspace = test_workspace();
        let workspace_string = workspace.to_string_lossy().to_string();
        ensure_workspace(workspace_string.clone()).expect("workspace is created");

        write_test_note(
            &workspace,
            "notes/stable.html",
            r#"<!doctype html>
<html><head><title>Stable</title><meta name="opaline:id" content="stable"></head>
<body><article data-opaline-note><h1>Stable</h1><p><span data-opaline-tag="keep">#keep</span> stable body text</p></article></body></html>"#,
        );
        rebuild_workspace_index(workspace_string.clone()).expect("initial index rebuilt");

        fs::write(workspace.join("notes/invalid.html"), [0xff, 0xfe, 0xfd])
            .expect("invalid utf8 note");
        let error =
            rebuild_workspace_index(workspace_string).expect_err("invalid utf8 aborts rebuild");
        assert!(!error.is_empty());

        let conn = open_index(&workspace).expect("index opens");
        let note_count: i64 = conn
            .query_row("select count(*) from notes", [], |row| row.get(0))
            .expect("note count");
        let fts_count: i64 = conn
            .query_row("select count(*) from notes_fts", [], |row| row.get(0))
            .expect("fts count");
        let tag_count: i64 = conn
            .query_row("select count(*) from note_tags", [], |row| row.get(0))
            .expect("tag count");
        let stable_title: String = conn
            .query_row("select title from notes where id = 'stable'", [], |row| {
                row.get(0)
            })
            .expect("stable title");
        assert_eq!(note_count, 1);
        assert_eq!(fts_count, 1);
        assert_eq!(tag_count, 1);
        assert_eq!(stable_title, "Stable");

        fs::remove_dir_all(workspace).expect("test workspace cleaned up");
    }

    fn write_test_note(workspace: &Path, relative: &str, html: &str) {
        let path = workspace.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("note parent");
        }
        fs::write(path, html).expect("write note");
    }

    fn has_issue(diagnostics: &WorkspaceDiagnostics, code: &str) -> bool {
        diagnostics.issues.iter().any(|issue| issue.code == code)
    }
}
