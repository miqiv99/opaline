import { open } from "@tauri-apps/plugin-dialog";
import { CalendarDays, FilePlus2, FolderOpen, RefreshCw, Search, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AiPanel } from "./ai/AiPanel";
import type { NoteSuggestion } from "./editor/OpalineEditor";
import { OpalineEditor } from "./editor/OpalineEditor";
import { articleFromHtmlDocument, replaceArticleInDocument, titleFromArticleHtml } from "./editor/htmlProfile";
import type { GraphData, ImportedAsset, NoteDocument, NoteSummary, SearchResult, WorkspaceState } from "./domain/note";
import { workspaceAdapter } from "./storage/adapter";

const initialState: WorkspaceState = {
  path: null,
  notes: [],
  activeNote: null,
};

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(initialState);
  const [articleHtml, setArticleHtml] = useState("");
  const [savedArticleHtml, setSavedArticleHtml] = useState("");
  const [status, setStatus] = useState("请选择或创建一个工作区");
  const [isBusy, setIsBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [backlinks, setBacklinks] = useState<SearchResult[]>([]);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [], brokenLinks: [] });
  const isDirty = workspace.activeNote !== null && articleHtml !== savedArticleHtml;

  const activeTitle = useMemo(() => {
    if (!workspace.activeNote) {
      return "没有打开的笔记";
    }

    return titleFromArticleHtml(articleHtml, workspace.activeNote.title);
  }, [articleHtml, workspace.activeNote]);

  const refreshNotes = useCallback(async (path: string) => {
    const notes = await workspaceAdapter.listNotes(path);
    setWorkspace((current) => ({ ...current, path, notes }));
    setGraph(await workspaceAdapter.graphData(path));
    return notes;
  }, []);

  const refreshBacklinks = useCallback(async (path: string, noteId: string) => {
    setBacklinks(await workspaceAdapter.listBacklinks(path, noteId));
  }, []);

  const openWorkspace = useCallback(async () => {
    setIsBusy(true);
    try {
      const path = await workspaceAdapter.chooseWorkspace();
      if (!path) {
        setStatus("未选择工作区");
        return;
      }

      await workspaceAdapter.ensureWorkspace(path);
      const notes = await refreshNotes(path);
      if (notes[0]) {
        const document = await workspaceAdapter.readNote(path, notes[0].path);
        openNoteDocument(path, notes, document);
        await refreshBacklinks(path, document.id);
      }
      setStatus(notes.length > 0 ? "工作区已打开" : "工作区已初始化，可以创建第一篇笔记");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "打开工作区失败");
    } finally {
      setIsBusy(false);
    }
  }, [refreshBacklinks, refreshNotes]);

  const createNote = useCallback(async () => {
    const title = window.prompt("新笔记标题", "未命名笔记")?.trim();
    if (!title) {
      return;
    }

    setIsBusy(true);
    try {
      const path = workspace.path ?? (await workspaceAdapter.chooseWorkspace());
      if (!path) {
        setStatus("需要先选择工作区");
        return;
      }

      await workspaceAdapter.ensureWorkspace(path);
      const note = await workspaceAdapter.createNote(path, { title, lang: "zh-Hans" });
      const notes = await workspaceAdapter.listNotes(path);
      openNoteDocument(path, notes, note);
      setStatus("已创建笔记");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "创建笔记失败");
    } finally {
      setIsBusy(false);
    }
  }, [workspace.path]);

  const createDailyNote = useCallback(async () => {
    setIsBusy(true);
    try {
      const path = workspace.path ?? (await workspaceAdapter.chooseWorkspace());
      if (!path) {
        setStatus("需要先选择工作区");
        return;
      }

      await workspaceAdapter.ensureWorkspace(path);
      const note = await workspaceAdapter.createDailyNote(path);
      const notes = await workspaceAdapter.listNotes(path);
      openNoteDocument(path, notes, note);
      await refreshBacklinks(path, note.id);
      setStatus("已打开今天的日记");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "创建日记失败");
    } finally {
      setIsBusy(false);
    }
  }, [refreshBacklinks, workspace.path]);

  const openNote = useCallback(
    async (note: NoteSummary) => {
      if (!workspace.path) {
        return;
      }

      setIsBusy(true);
      try {
        const document = await workspaceAdapter.readNote(workspace.path, note.path);
        openNoteDocument(workspace.path, workspace.notes, document);
        await refreshBacklinks(workspace.path, document.id);
        setStatus("笔记已打开");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "打开笔记失败");
      } finally {
        setIsBusy(false);
      }
    },
    [refreshBacklinks, workspace.notes, workspace.path],
  );

  const openSearchResult = useCallback(
    async (result: SearchResult) => {
      if (!workspace.path) {
        return;
      }

      const document = await workspaceAdapter.readNote(workspace.path, result.path);
      openNoteDocument(workspace.path, workspace.notes, document);
      await refreshBacklinks(workspace.path, document.id);
    },
    [refreshBacklinks, workspace.notes, workspace.path],
  );

  const saveNote = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!workspace.path || !workspace.activeNote) {
      setStatus("没有可保存的笔记");
      return;
    }

    if (articleHtml === savedArticleHtml) {
      if (!options.silent) {
        setStatus("没有未保存的更改");
      }
      return;
    }

    setIsSaving(true);
    try {
      const html = replaceArticleInDocument(workspace.activeNote.html, articleHtml, workspace.notes);
      const saved = await workspaceAdapter.saveNote(workspace.path, {
        ...workspace.activeNote,
        title: titleFromArticleHtml(articleHtml, workspace.activeNote.title),
        html,
      });
      const notes = await refreshNotes(workspace.path);
      openNoteDocument(workspace.path, notes, saved);
      await refreshBacklinks(workspace.path, saved.id);
      setStatus(options.silent ? `自动保存：${saved.title}` : `已保存：${saved.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  }, [articleHtml, refreshBacklinks, refreshNotes, savedArticleHtml, workspace.activeNote, workspace.notes, workspace.path]);

  const toggleFavorite = useCallback(async () => {
    if (!workspace.path || !workspace.activeNote) {
      return;
    }

    const favorite = await workspaceAdapter.toggleFavorite(workspace.path, workspace.activeNote.id);
    const notes = await refreshNotes(workspace.path);
    setWorkspace((current) => ({
      ...current,
      notes,
      activeNote: current.activeNote ? { ...current.activeNote, favorite } : current.activeNote,
    }));
    setStatus(favorite ? "已收藏" : "已取消收藏");
  }, [refreshNotes, workspace.activeNote, workspace.path]);

  const importAsset = useCallback(
    async (kind: "image" | "file"): Promise<ImportedAsset | null> => {
      if (!workspace.path) {
        setStatus("需要先选择工作区");
        return null;
      }

      const selected = await open({
        multiple: false,
        directory: false,
        title: kind === "image" ? "选择图片" : "选择附件",
      });

      if (typeof selected !== "string") {
        return null;
      }

      return workspaceAdapter.importAsset(workspace.path, { sourcePath: selected, kind });
    },
    [workspace.path],
  );

  const pickNote = useCallback(async (): Promise<NoteSuggestion | null> => {
    if (!workspace.path) return null;
    const title = window.prompt("输入要嵌入的笔记标题或路径")?.trim();
    if (!title) return null;

    const results = await workspaceAdapter.searchNotes(workspace.path, title);
    if (!results[0]) {
      setStatus("找不到匹配的笔记");
      return null;
    }

    return {
      id: results[0].id,
      title: results[0].title,
      path: results[0].path,
      excerpt: results[0].excerpt,
    };
  }, [workspace.path]);

  useEffect(() => {
    if (!isDirty || isSaving || isBusy) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveNote({ silent: true });
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [isBusy, isDirty, isSaving, saveNote]);

  useEffect(() => {
    if (!workspace.path) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearchResults(await workspaceAdapter.searchNotes(workspace.path as string, query));
    }, 180);

    return () => window.clearTimeout(timer);
  }, [query, workspace.path, workspace.notes]);

  const openNoteDocument = (path: string, notes: NoteSummary[], note: NoteDocument) => {
    const nextArticleHtml = articleFromHtmlDocument(note.html);
    setWorkspace({ path, notes, activeNote: note });
    setArticleHtml(nextArticleHtml);
    setSavedArticleHtml(nextArticleHtml);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">O</span>
          <div>
            <strong>Opaline</strong>
            <span>本地 HTML 笔记</span>
          </div>
        </div>

        <div className="sidebar-actions">
          <button type="button" onClick={openWorkspace} disabled={isBusy}>
            <FolderOpen size={17} />
            <span>打开工作区</span>
          </button>
          <button type="button" onClick={createNote} disabled={isBusy}>
            <FilePlus2 size={17} />
            <span>新建笔记</span>
          </button>
          <button type="button" onClick={createDailyNote} disabled={isBusy}>
            <CalendarDays size={17} />
            <span>今日日记</span>
          </button>
          {workspace.path ? (
            <button type="button" onClick={() => refreshNotes(workspace.path as string)} disabled={isBusy}>
              <RefreshCw size={17} />
              <span>刷新</span>
            </button>
          ) : null}
        </div>

        <div className="workspace-path" title={workspace.path ?? undefined}>
          {workspace.path ?? "未选择工作区"}
        </div>

        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题和正文" />
        </label>

        {query ? (
          <div className="search-results">
            {searchResults.map((result) => (
              <button key={result.id} type="button" className="search-result" onClick={() => openSearchResult(result)}>
                <span>{result.title}</span>
                <small>{result.excerpt}</small>
              </button>
            ))}
          </div>
        ) : null}

        <nav className="note-list" aria-label="笔记列表">
          {workspace.notes.length === 0 ? (
            <p className="empty-state">还没有笔记。</p>
          ) : (
            workspace.notes.map((note) => (
              <button
                key={note.path}
                type="button"
                className={workspace.activeNote?.path === note.path ? "note-item is-active" : "note-item"}
                onClick={() => openNote(note)}
              >
                <span>{note.favorite ? "★ " : ""}{note.title}</span>
                <small>{note.path}</small>
                {note.tags.length ? <small>{note.tags.map((tag) => `#${tag}`).join(" ")}</small> : null}
              </button>
            ))
          )}
        </nav>
      </aside>

      <section className="main-pane">
        <header className="topbar">
          <div>
            <h1>{activeTitle}</h1>
            <p>
              {status}
              {isDirty ? <span className="dirty-dot">未保存</span> : null}
            </p>
          </div>
          {workspace.activeNote ? (
            <button className="favorite-button" type="button" onClick={toggleFavorite} aria-label="收藏">
              <Star size={18} fill={workspace.activeNote.favorite ? "currentColor" : "none"} />
            </button>
          ) : null}
        </header>

        {workspace.activeNote ? (
          <div className="workbench">
            <OpalineEditor
              content={articleHtml}
              isSaving={isSaving}
              onChange={setArticleHtml}
              onSave={saveNote}
              onImportAsset={importAsset}
              onPickNote={pickNote}
            />
            <aside className="inspector">
              <AiPanel />
              <Section title="标题">
                {workspace.activeNote.headings.length ? (
                  workspace.activeNote.headings.map((heading) => <p key={heading}>{heading}</p>)
                ) : (
                  <p className="muted">还没有标题。</p>
                )}
              </Section>
              <Section title="出链">
                {workspace.activeNote.outgoingLinks.length ? (
                  workspace.activeNote.outgoingLinks.map((link) => (
                    <p key={link.href} className={link.isBroken ? "is-broken" : undefined}>
                      {link.label || link.href}
                    </p>
                  ))
                ) : (
                  <p className="muted">还没有链接。</p>
                )}
              </Section>
              <Section title="反链">
                {backlinks.length ? (
                  backlinks.map((link) => (
                    <button key={link.id} className="inspector-link" type="button" onClick={() => openSearchResult(link)}>
                      {link.title}
                    </button>
                  ))
                ) : (
                  <p className="muted">还没有反链。</p>
                )}
              </Section>
              <Section title="图谱">
                <p>{graph.nodes.length} 篇笔记</p>
                <p>{graph.edges.length} 条链接</p>
                {graph.brokenLinks.length ? <p className="is-broken">{graph.brokenLinks.length} 条断链</p> : null}
              </Section>
            </aside>
          </div>
        ) : (
          <section className="welcome-panel">
            <h2>先从一个本地工作区开始</h2>
            <p>工作区会包含 notes、assets 和 .opaline。HTML 文件是源数据，SQLite 只保存可重建的索引和元数据。</p>
            <button type="button" onClick={createNote} disabled={isBusy}>
              <FilePlus2 size={18} />
              <span>创建第一篇笔记</span>
            </button>
          </section>
        )}
      </section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="inspector-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
