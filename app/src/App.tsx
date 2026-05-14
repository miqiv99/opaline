import { FilePlus2, FolderOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OpalineEditor } from "./editor/OpalineEditor";
import { articleFromHtmlDocument, replaceArticleInDocument, titleFromArticleHtml } from "./editor/htmlProfile";
import type { NoteDocument, NoteSummary, WorkspaceState } from "./domain/note";
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
    return notes;
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
      setStatus(notes.length > 0 ? "工作区已打开" : "工作区已初始化，可以创建第一篇笔记");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "打开工作区失败");
    } finally {
      setIsBusy(false);
    }
  }, [refreshNotes]);

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

  const openNote = useCallback(
    async (note: NoteSummary) => {
      if (!workspace.path) {
        return;
      }

      setIsBusy(true);
      try {
        const document = await workspaceAdapter.readNote(workspace.path, note.path);
        openNoteDocument(workspace.path, workspace.notes, document);
        setStatus("笔记已打开");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "打开笔记失败");
      } finally {
        setIsBusy(false);
      }
    },
    [workspace.notes, workspace.path],
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
      const html = replaceArticleInDocument(workspace.activeNote.html, articleHtml);
      const saved = await workspaceAdapter.saveNote(workspace.path, {
        ...workspace.activeNote,
        title: titleFromArticleHtml(articleHtml, workspace.activeNote.title),
        html,
      });
      const notes = await refreshNotes(workspace.path);
      openNoteDocument(workspace.path, notes, saved);
      setStatus(options.silent ? `自动保存：${saved.title}` : `已保存：${saved.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  }, [articleHtml, refreshNotes, savedArticleHtml, workspace.activeNote, workspace.path]);

  useEffect(() => {
    void openWorkspace();
  }, [openWorkspace]);

  useEffect(() => {
    if (!isDirty || isSaving || isBusy) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveNote({ silent: true });
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [isBusy, isDirty, isSaving, saveNote]);

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
                <span>{note.title}</span>
                <small>{note.path}</small>
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
        </header>

        {workspace.activeNote ? (
          <OpalineEditor content={articleHtml} isSaving={isSaving} onChange={setArticleHtml} onSave={saveNote} />
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
