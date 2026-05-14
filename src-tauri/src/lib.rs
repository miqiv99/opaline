use chrono::{Datelike, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewNoteInput {
    title: String,
    lang: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkInfo {
    href: String,
    label: String,
    target_id: Option<String>,
    is_broken: bool,
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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GraphEdge {
    source: String,
    target: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GraphData {
    nodes: Vec<GraphNode>,
    edges: Vec<GraphEdge>,
    broken_links: Vec<LinkInfo>,
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

#[tauri::command]
fn ensure_workspace(path: String) -> Result<(), String> {
    let workspace = workspace_path(&path)?;
    fs::create_dir_all(&workspace).map_err(to_error)?;
    fs::create_dir_all(workspace.join("notes")).map_err(to_error)?;
    fs::create_dir_all(workspace.join("notes/journal")).map_err(to_error)?;
    fs::create_dir_all(workspace.join("assets/images")).map_err(to_error)?;
    fs::create_dir_all(workspace.join("assets/files")).map_err(to_error)?;
    fs::create_dir_all(workspace.join(".opaline/cache")).map_err(to_error)?;

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
        "notes",
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
    create_note_at(&workspace, &title, "zh-Hans", "notes/journal")
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
fn save_note(path: String, note: NoteDocument) -> Result<NoteDocument, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;

    let absolute = note_absolute_path(&workspace, &note.path)?;
    let html = normalize_note_html(&note.html, &note.id, &note.title)?;
    write_file_atomically(&absolute, &html)?;

    let html = fs::read_to_string(&absolute).map_err(to_error)?;
    let conn = open_index(&workspace)?;
    let summary = summary_from_html(&conn, &workspace, &absolute, &html)?;
    upsert_note_index(&conn, &summary, &html)?;

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
            })
        })
        .map_err(to_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_error)?;

    let mut edge_statement = conn
        .prepare("select note_id, target_id from note_links where target_id is not null")
        .map_err(to_error)?;
    let edges = edge_statement
        .query_map([], |row| {
            Ok(GraphEdge {
                source: row.get(0)?,
                target: row.get(1)?,
            })
        })
        .map_err(to_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_error)?;

    let mut broken_statement = conn
        .prepare("select href, label from note_links where is_broken = 1 order by href")
        .map_err(to_error)?;
    let broken_links = broken_statement
        .query_map([], |row| {
            Ok(LinkInfo {
                href: row.get(0)?,
                label: row.get(1)?,
                target_id: None,
                is_broken: true,
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
fn write_settings(path: String, settings: serde_json::Value) -> Result<(), String> {
    let workspace = workspace_path(&path)?;
    let settings_path = workspace.join(".opaline/settings.json");
    let raw = serde_json::to_string_pretty(&settings).map_err(to_error)?;
    fs::write(&settings_path, raw).map_err(to_error)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            ensure_workspace,
            list_notes,
            create_note,
            create_daily_note,
            read_note,
            save_note,
            search_notes,
            list_backlinks,
            graph_data,
            toggle_favorite,
            import_asset,
            read_settings,
            write_settings
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
    let conn = open_index(workspace)?;
    migrate_index(&conn)?;

    let favorite_by_id = load_favorites(&conn)?;
    conn.execute("delete from note_tags", [])
        .map_err(to_error)?;
    conn.execute("delete from note_headings", [])
        .map_err(to_error)?;
    conn.execute("delete from note_links", [])
        .map_err(to_error)?;
    conn.execute("delete from notes_fts", [])
        .map_err(to_error)?;

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

    for (summary, html) in &mut notes {
        resolve_links(summary, &present_ids, &id_by_path, &id_by_title);
        upsert_note_index(&conn, summary, html)?;
    }

    if !present_ids.is_empty() {
        let placeholders = present_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("delete from notes where id not in ({placeholders})");
        let params = rusqlite::params_from_iter(present_ids.iter());
        conn.execute(&sql, params).map_err(to_error)?;
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

fn create_note_at(
    workspace: &Path,
    title: &str,
    lang: &str,
    directory: &str,
) -> Result<NoteDocument, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let directory_path = workspace.join(directory);
    fs::create_dir_all(&directory_path).map_err(to_error)?;
    let file_name = unique_note_file(&directory_path, title);
    let note_path = directory_path.join(file_name);
    let html = render_note_html(&id, title, lang, &now, "<p></p>");

    write_file_atomically(&note_path, &html)?;

    let conn = open_index(workspace)?;
    let summary = summary_from_html(&conn, workspace, &note_path, &html)?;
    upsert_note_index(&conn, &summary, &html)?;

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
    for (position, heading) in note.headings.iter().enumerate() {
        conn.execute(
            "insert or ignore into note_headings (note_id, heading, level, position) values (?1, ?2, ?3, ?4)",
            params![note.id, heading, 1, position as i64],
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
    let id = meta_content(html, "opaline:id").unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = title_content(html)
        .or_else(|| first_heading_content(html))
        .unwrap_or_else(|| "未命名笔记".to_string());
    let created_at =
        meta_content(html, "opaline:created").unwrap_or_else(|| file_timestamp(file_path));
    let updated_at =
        meta_content(html, "opaline:updated").unwrap_or_else(|| file_timestamp(file_path));

    Ok(NoteSummary {
        favorite: favorite_for(conn, &id)?,
        id,
        path: relative_path,
        title,
        created_at,
        updated_at,
        tags: extract_tags(html),
        headings: extract_headings(html),
        outgoing_links: extract_links(html),
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
        if is_external_href(&link.href) || link.href.starts_with('#') {
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
    href.starts_with("http:")
        || href.starts_with("https:")
        || href.starts_with("mailto:")
        || href.starts_with("tel:")
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

fn relative_to_workspace(workspace: &Path, file_path: &Path) -> Result<String, String> {
    file_path
        .strip_prefix(workspace)
        .map_err(to_error)
        .map(|path| path.to_string_lossy().replace('\\', "/"))
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
    if !html.to_lowercase().contains("<html") || !html.to_lowercase().contains("<body") {
        return Err("保存失败：笔记必须是完整 HTML 文档".to_string());
    }
    if !html.contains("data-opaline-note") {
        return Err("保存失败：笔记正文缺少 data-opaline-note".to_string());
    }

    let mut normalized = html.to_string();
    let now = Utc::now().to_rfc3339();
    normalized = upsert_meta_content(&normalized, "opaline:id", fallback_id);
    normalized = upsert_meta_content(&normalized, "opaline:updated", &now);
    if title_content(&normalized).is_none() {
        normalized = normalized.replace(
            "</head>",
            &format!(
                "    <title>{}</title>\n  </head>",
                escape_text(fallback_title)
            ),
        );
    }
    if !normalized.starts_with("<!doctype html>") {
        normalized = format!("<!doctype html>\n{normalized}");
    }
    Ok(normalized)
}

fn write_file_atomically(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "保存失败：笔记路径无父目录".to_string())?;
    fs::create_dir_all(parent).map_err(to_error)?;
    let temp_path = path.with_extension("html.tmp");
    let backup_path = path.with_extension("html.bak");
    fs::write(&temp_path, contents).map_err(to_error)?;

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

fn extract_tags(html: &str) -> Vec<String> {
    let mut tags = extract_attr_values(html, "data-opaline-tag");
    for word in plain_text(html).split_whitespace() {
        if let Some(tag) = word.strip_prefix('#') {
            let tag = tag.trim_matches(|c: char| !c.is_alphanumeric()).to_string();
            if !tag.is_empty() && !tags.contains(&tag) {
                tags.push(tag);
            }
        }
    }
    tags
}

fn extract_headings(html: &str) -> Vec<String> {
    let mut headings = Vec::new();
    for tag in ["h1", "h2", "h3"] {
        let mut rest = html;
        let start_tag = format!("<{tag}");
        let end_tag = format!("</{tag}>");
        while let Some(start) = rest.to_lowercase().find(&start_tag) {
            let after_start = &rest[start..];
            let Some(content_start) = after_start.find('>') else {
                break;
            };
            let content = &after_start[content_start + 1..];
            let Some(end) = content.to_lowercase().find(&end_tag) else {
                break;
            };
            let heading = unescape_text(&strip_tags(&content[..end]))
                .trim()
                .to_string();
            if !heading.is_empty() {
                headings.push(heading);
            }
            rest = &content[end + end_tag.len()..];
        }
    }
    headings
}

fn extract_links(html: &str) -> Vec<LinkInfo> {
    let mut links = Vec::new();
    let mut rest = html;
    while let Some(start) = rest.to_lowercase().find("<a ") {
        let after_start = &rest[start..];
        let Some(tag_end) = after_start.find('>') else {
            break;
        };
        let tag = &after_start[..tag_end + 1];
        let content = &after_start[tag_end + 1..];
        let Some(close) = content.to_lowercase().find("</a>") else {
            break;
        };
        let href = attr_value(tag, "href").unwrap_or_default();
        if !href.is_empty() {
            links.push(LinkInfo {
                href,
                label: unescape_text(&strip_tags(&content[..close]))
                    .trim()
                    .to_string(),
                target_id: attr_value(tag, "data-opaline-link"),
                is_broken: false,
            });
        }
        rest = &content[close + "</a>".len()..];
    }

    for unresolved in extract_attr_values(html, "data-opaline-unresolved") {
        links.push(LinkInfo {
            href: format!("[[{unresolved}]]"),
            label: unresolved,
            target_id: None,
            is_broken: true,
        });
    }

    links
}

fn extract_attr_values(html: &str, attr_name: &str) -> Vec<String> {
    let mut values = Vec::new();
    let patterns = [format!("{attr_name}=\""), format!("{attr_name}='")];
    for pattern in patterns {
        let quote = if pattern.ends_with('"') { '"' } else { '\'' };
        let mut rest = html;
        while let Some(start) = rest.find(&pattern) {
            let value_start = start + pattern.len();
            let after_start = &rest[value_start..];
            if let Some(end) = after_start.find(quote) {
                let value = unescape_text(&after_start[..end]).trim().to_string();
                if !value.is_empty() && !values.contains(&value) {
                    values.push(value);
                }
                rest = &after_start[end + 1..];
            } else {
                break;
            }
        }
    }
    values
}

fn attr_value(tag: &str, attr_name: &str) -> Option<String> {
    extract_attr_values(tag, attr_name).into_iter().next()
}

fn normalize_relative_note_path(base_dir: &Path, href: &str) -> Option<String> {
    let href = href.split('#').next().unwrap_or(href);
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
    unescape_text(&strip_tags(html))
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn upsert_meta_content(html: &str, name: &str, content: &str) -> String {
    let marker = format!(r#"name="{name}""#);
    let Some(start) = html.find(&marker) else {
        return html.replace(
            "</head>",
            &format!(
                "    <meta name=\"{}\" content=\"{}\">\n  </head>",
                escape_attr(name),
                escape_attr(content)
            ),
        );
    };
    let rest = &html[start..];
    let Some(content_attr_start) = rest.find(r#"content=""#) else {
        return html.to_string();
    };
    let absolute_content_start = start + content_attr_start + r#"content=""#.len();
    let Some(content_end) = html[absolute_content_start..].find('"') else {
        return html.to_string();
    };
    let absolute_content_end = absolute_content_start + content_end;
    format!(
        "{}{}{}",
        &html[..absolute_content_start],
        escape_attr(content),
        &html[absolute_content_end..]
    )
}

fn meta_content(html: &str, name: &str) -> Option<String> {
    let mut rest = html;
    loop {
        let lower = rest.to_lowercase();
        let start = lower.find("<meta")?;
        let after_start = &rest[start..];
        let tag_end = after_start.find('>')?;
        let tag = &after_start[..tag_end + 1];
        if attr_value(tag, "name").as_deref() == Some(name) {
            return attr_value(tag, "content").map(|value| unescape_text(&value));
        }
        rest = &after_start[tag_end + 1..];
    }
}

fn title_content(html: &str) -> Option<String> {
    between_case_insensitive(html, "<title>", "</title>").map(unescape_text)
}

fn first_heading_content(html: &str) -> Option<String> {
    extract_headings(html).into_iter().next()
}

fn between_case_insensitive<'a>(html: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let lower = html.to_lowercase();
    let start_index = lower.find(start)? + start.len();
    let end_index = lower[start_index..].find(end)? + start_index;
    Some(&html[start_index..end_index])
}

fn strip_tags(value: &str) -> String {
    let mut output = String::new();
    let mut in_tag = false;
    for character in value.chars() {
        match character {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                output.push(' ');
            }
            _ if !in_tag => output.push(character),
            _ => {}
        }
    }
    output
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

fn unescape_text(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&gt;", ">")
        .replace("&lt;", "<")
        .replace("&amp;", "&")
}

fn to_error(error: impl std::fmt::Display) -> String {
    error.to_string()
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
    fn workspace_round_trip_rebuilds_metadata() {
        let workspace = test_workspace();
        let workspace_string = workspace.to_string_lossy().to_string();

        ensure_workspace(workspace_string.clone()).expect("workspace is created");

        let note = create_note(
            workspace_string.clone(),
            NewNoteInput {
                title: "测试笔记".to_string(),
                lang: Some("zh-Hans".to_string()),
            },
        )
        .expect("note is created");

        let linked = create_note(
            workspace_string.clone(),
            NewNoteInput {
                title: "linked".to_string(),
                lang: Some("zh-Hans".to_string()),
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
        assert!(extract_tags(html).contains(&"research".to_string()));
        assert!(extract_headings(html).contains(&"研究问题".to_string()));
        assert!(plain_text(html).contains("HTML 笔记"));

        let links = extract_links(html);
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
                },
                LinkInfo {
                    href: "#local-block".to_string(),
                    label: "local".to_string(),
                    target_id: None,
                    is_broken: false,
                },
                LinkInfo {
                    href: "../target.html#b-intro".to_string(),
                    label: "target".to_string(),
                    target_id: None,
                    is_broken: false,
                },
                LinkInfo {
                    href: "missing.html".to_string(),
                    label: "missing".to_string(),
                    target_id: None,
                    is_broken: false,
                },
                LinkInfo {
                    href: "stale.html".to_string(),
                    label: "stale".to_string(),
                    target_id: Some("deleted".to_string()),
                    is_broken: false,
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
            },
        )
        .expect("alpha is created");

        let beta = create_note(
            workspace_string.clone(),
            NewNoteInput {
                title: "Beta Notes".to_string(),
                lang: Some("en".to_string()),
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
}
