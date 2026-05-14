use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
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
struct NoteSummary {
    id: String,
    path: String,
    title: String,
    updated_at: String,
    tags: Vec<String>,
    outgoing_links: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteDocument {
    id: String,
    path: String,
    title: String,
    updated_at: String,
    tags: Vec<String>,
    outgoing_links: Vec<String>,
    html: String,
}

#[tauri::command]
fn ensure_workspace(path: String) -> Result<(), String> {
    let workspace = workspace_path(&path)?;
    fs::create_dir_all(&workspace).map_err(to_error)?;
    fs::create_dir_all(workspace.join("notes")).map_err(to_error)?;
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
    ensure_workspace(path)?;

    let notes_dir = workspace.join("notes");
    let conn = open_index(&workspace)?;
    let mut notes = Vec::new();

    conn.execute("delete from note_tags", []).map_err(to_error)?;
    conn.execute("delete from note_links", []).map_err(to_error)?;
    conn.execute("delete from notes", []).map_err(to_error)?;

    for entry in WalkDir::new(&notes_dir).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }

        let file_path = entry.path();
        if file_path.extension().and_then(|ext| ext.to_str()) != Some("html") {
            continue;
        }

        let html = fs::read_to_string(file_path).map_err(to_error)?;
        let summary = summary_from_html(&workspace, file_path, &html)?;
        upsert_note_index(&conn, &summary)?;
        notes.push(summary);
    }

    notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then_with(|| a.title.cmp(&b.title)));
    Ok(notes)
}

#[tauri::command]
fn create_note(path: String, input: NewNoteInput) -> Result<NoteDocument, String> {
    let workspace = workspace_path(&path)?;
    ensure_workspace(path)?;

    let title = clean_title(&input.title);
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let lang = input.lang.unwrap_or_else(|| "zh-Hans".to_string());
    let file_name = unique_note_file(&workspace.join("notes"), &title)?;
    let note_path = workspace.join("notes").join(file_name);
    let relative_path = relative_to_workspace(&workspace, &note_path)?;
    let html = render_note_html(&id, &title, &lang, &now, "<p></p>");

    fs::write(&note_path, &html).map_err(to_error)?;

    let note = NoteDocument {
        id,
        path: relative_path,
        title,
        updated_at: now,
        tags: Vec::new(),
        outgoing_links: Vec::new(),
        html,
    };

    let conn = open_index(&workspace)?;
    upsert_note_index(&conn, &note.clone().into())?;
    Ok(note)
}

#[tauri::command]
fn read_note(path: String, note_path: String) -> Result<NoteDocument, String> {
    let workspace = workspace_path(&path)?;
    let absolute = note_absolute_path(&workspace, &note_path)?;
    let html = fs::read_to_string(&absolute).map_err(to_error)?;
    let summary = summary_from_html(&workspace, &absolute, &html)?;

    Ok(NoteDocument {
        id: summary.id,
        path: summary.path,
        title: summary.title,
        updated_at: summary.updated_at,
        tags: summary.tags,
        outgoing_links: summary.outgoing_links,
        html,
    })
}

#[tauri::command]
fn save_note(path: String, note: NoteDocument) -> Result<NoteDocument, String> {
    let workspace = workspace_path(&path)?;
    let absolute = note_absolute_path(&workspace, &note.path)?;
    let html = normalize_note_html(&note.html, &note.id, &note.title)?;

    write_file_atomically(&absolute, &html)?;

    let html = fs::read_to_string(&absolute).map_err(to_error)?;
    let summary = summary_from_html(&workspace, &absolute, &html)?;
    let conn = open_index(&workspace)?;
    upsert_note_index(&conn, &summary)?;

    Ok(NoteDocument {
        id: summary.id,
        path: summary.path,
        title: summary.title,
        updated_at: summary.updated_at,
        tags: summary.tags,
        outgoing_links: summary.outgoing_links,
        html,
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            ensure_workspace,
            list_notes,
            create_note,
            read_note,
            save_note
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

impl From<NoteDocument> for NoteSummary {
    fn from(note: NoteDocument) -> Self {
        Self {
            id: note.id,
            path: note.path,
            title: note.title,
            updated_at: note.updated_at,
            tags: note.tags,
            outgoing_links: note.outgoing_links,
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
    let db_path = workspace.join(".opaline/index.sqlite");
    Connection::open(db_path).map_err(to_error)
}

fn migrate_index(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        pragma journal_mode = wal;

        create table if not exists notes (
          id text primary key,
          path text not null unique,
          title text not null,
          updated_at text not null
        );

        create table if not exists note_tags (
          note_id text not null,
          tag text not null,
          primary key (note_id, tag),
          foreign key (note_id) references notes(id) on delete cascade
        );

        create table if not exists note_links (
          note_id text not null,
          href text not null,
          target_id text,
          label text,
          primary key (note_id, href),
          foreign key (note_id) references notes(id) on delete cascade
        );

        create table if not exists app_state (
          key text primary key,
          value text not null
        );
        ",
    )
    .map_err(to_error)
}

fn upsert_note_index(conn: &Connection, note: &NoteSummary) -> Result<(), String> {
    conn.execute(
        "
        insert into notes (id, path, title, updated_at)
        values (?1, ?2, ?3, ?4)
        on conflict(id) do update set
          path = excluded.path,
          title = excluded.title,
          updated_at = excluded.updated_at
        ",
        params![note.id, note.path, note.title, note.updated_at],
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

    conn.execute("delete from note_links where note_id = ?1", params![note.id])
        .map_err(to_error)?;
    for href in &note.outgoing_links {
        conn.execute(
            "insert or ignore into note_links (note_id, href) values (?1, ?2)",
            params![note.id, href],
        )
        .map_err(to_error)?;
    }

    Ok(())
}

fn summary_from_html(workspace: &Path, file_path: &Path, html: &str) -> Result<NoteSummary, String> {
    let relative_path = relative_to_workspace(workspace, file_path)?;
    let id = meta_content(html, "opaline:id").unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = title_content(html)
        .or_else(|| first_heading_content(html))
        .unwrap_or_else(|| "未命名笔记".to_string());
    let updated_at = meta_content(html, "opaline:updated").unwrap_or_else(|| {
        fs::metadata(file_path)
            .and_then(|metadata| metadata.modified())
            .map(|modified| chrono::DateTime::<Utc>::from(modified).to_rfc3339())
            .unwrap_or_else(|_| Utc::now().to_rfc3339())
    });

    Ok(NoteSummary {
        id,
        path: relative_path,
        title,
        updated_at,
        tags: extract_tags(html),
        outgoing_links: extract_links(html),
    })
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
    let notes_dir = workspace.join("notes");
    if absolute.extension().and_then(|ext| ext.to_str()) != Some("html") {
        return Err("只能读取或保存 HTML 笔记".to_string());
    }

    if !absolute.starts_with(&notes_dir) {
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

fn unique_note_file(notes_dir: &Path, title: &str) -> Result<String, String> {
    let base = slugify(title);
    let mut candidate = format!("{base}.html");
    let mut counter = 2;

    while notes_dir.join(&candidate).exists() {
        candidate = format!("{base}-{counter}.html");
        counter += 1;
    }

    Ok(candidate)
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

fn normalize_note_html(html: &str, fallback_id: &str, fallback_title: &str) -> Result<String, String> {
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
            &format!("    <title>{}</title>\n  </head>", escape_text(fallback_title)),
        );
    }

    if !normalized.starts_with("<!doctype html>") {
        normalized = format!("<!doctype html>\n{normalized}");
    }

    Ok(normalized)
}

fn write_file_atomically(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "保存失败：笔记路径无父目录".to_string())?;
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

fn extract_tags(html: &str) -> Vec<String> {
    extract_attr_values(html, "data-opaline-tag")
}

fn extract_links(html: &str) -> Vec<String> {
    extract_attr_values(html, "href")
        .into_iter()
        .filter(|href| !href.trim().is_empty())
        .collect()
}

fn extract_attr_values(html: &str, attr_name: &str) -> Vec<String> {
    let mut values = Vec::new();
    let patterns = [
        format!("{attr_name}=\""),
        format!("{attr_name}='"),
        format!("{}=\"", attr_name.to_uppercase()),
        format!("{}='", attr_name.to_uppercase()),
    ];

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
    let marker = format!(r#"name="{name}""#);
    let start = html.find(&marker)?;
    let rest = &html[start..];
    let content_start = rest.find(r#"content=""#)? + r#"content=""#.len();
    let content_rest = &rest[content_start..];
    let content_end = content_rest.find('"')?;
    Some(unescape_text(&content_rest[..content_end]))
}

fn title_content(html: &str) -> Option<String> {
    between_case_insensitive(html, "<title>", "</title>").map(unescape_text)
}

fn first_heading_content(html: &str) -> Option<String> {
    between_case_insensitive(html, "<h1>", "</h1>")
        .map(strip_tags)
        .map(|value| unescape_text(&value))
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
            '>' => in_tag = false,
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

    #[test]
    fn workspace_round_trip_rebuilds_metadata() {
        let workspace = std::env::current_dir()
            .expect("current dir")
            .join("target")
            .join("test-workspaces")
            .join(Uuid::new_v4().to_string());
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

        assert!(workspace.join(&note.path).exists());
        assert_eq!(note.title, "测试笔记");

        let saved_html = note.html.replace(
            "<p></p>",
            r#"<p><span data-opaline-tag="research">#research</span></p><p><a href="../linked.html">linked</a></p>"#,
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
        assert!(saved.outgoing_links.contains(&"../linked.html".to_string()));

        let notes = list_notes(workspace_string).expect("notes are indexed");
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "测试笔记");
        assert!(notes[0].tags.contains(&"research".to_string()));

        fs::remove_dir_all(workspace).expect("test workspace cleaned up");
    }
}
