import { open } from "@tauri-apps/plugin-dialog";
import {
  BookOpen,
  Bot,
  Bug,
  CalendarDays,
  FilePlus2,
  FolderOpen,
  Home,
  Lightbulb,
  RefreshCw,
  Search,
  Send,
  Settings,
  Star,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AiPanel, AiSettingsPanel } from "./ai/AiPanel";
import { getAiAdapter, loadAiSettings } from "./ai/settings";
import type { NoteSuggestion } from "./editor/OpalineEditor";
import { OpalineEditor } from "./editor/OpalineEditor";
import { articleFromHtmlDocument, replaceArticleInDocument, titleFromArticleHtml } from "./editor/htmlProfile";
import type { GraphData, ImportedAsset, NewNoteInput, NoteDocument, NoteSummary, SearchResult, WorkspaceState } from "./domain/note";
import leafLogo from "./assets/opaline-leaf-gradient.svg";
import { workspaceAdapter } from "./storage/adapter";

const initialState: WorkspaceState = {
  path: null,
  notes: [],
  activeNote: null,
};

const WORKSPACE_PATH_STORAGE_KEY = "opaline-workspace-path";

type NoteTemplateId = "blank" | "idea" | "project-log" | "reading" | "debugging";
type AppView = "today" | "note" | "settings";
type TodayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

const NOTE_TEMPLATES: Array<{
  id: NoteTemplateId;
  title: string;
  description: string;
  icon: ReactNode;
  defaultTitle: string;
  body: string;
}> = [
  {
    id: "blank",
    title: "空白笔记",
    description: "从一个标题和空白正文开始。",
    icon: <FilePlus2 size={17} />,
    defaultTitle: "未命名笔记",
    body: "<p></p>",
  },
  {
    id: "idea",
    title: "想法",
    description: "记录一个还没成形但值得保留的念头。",
    icon: <Lightbulb size={17} />,
    defaultTitle: "一个想法",
    body: '<p><span data-opaline-tag="idea">#idea</span></p><h2>想法</h2><p></p><h2>为什么值得留下</h2><p></p><h2>下一步</h2><ul><li></li></ul>',
  },
  {
    id: "project-log",
    title: "项目日志",
    description: "记录今天推进了什么、卡在哪里、下一步是什么。",
    icon: <CalendarDays size={17} />,
    defaultTitle: "项目日志",
    body: '<p><span data-opaline-tag="project">#project</span></p><h2>今天推进</h2><ul><li></li></ul><h2>关键决定</h2><p></p><h2>卡点</h2><p></p><h2>下一步</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul>',
  },
  {
    id: "reading",
    title: "阅读摘录",
    description: "把文章、书、网页里的关键句变成自己的材料。",
    icon: <BookOpen size={17} />,
    defaultTitle: "阅读摘录",
    body: '<p><span data-opaline-tag="reading">#reading</span></p><h2>来源</h2><p></p><h2>摘录</h2><blockquote><p></p></blockquote><h2>我怎么理解</h2><p></p><h2>相关笔记</h2><p></p>',
  },
  {
    id: "debugging",
    title: "问题排查",
    description: "保存 bug、报错、假设和最终解法。",
    icon: <Bug size={17} />,
    defaultTitle: "问题排查",
    body: '<p><span data-opaline-tag="debug">#debug</span></p><h2>现象</h2><p></p><h2>复现步骤</h2><ol><li></li></ol><h2>原因假设</h2><ul><li></li></ul><h2>解决办法</h2><p></p><h2>以后怎么避免</h2><p></p>',
  },
];

const TODAY_PROMPTS = [
  "今天遇到了什么问题？",
  "今天学到的一个概念是什么？",
  "今天哪个决定以后可能需要回看？",
  "今天读到/看到的哪句话值得留下？",
  "这个项目现在最不确定的地方是什么？",
];

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(initialState);
  const [view, setView] = useState<AppView>("today");
  const [articleHtml, setArticleHtml] = useState("");
  const [savedArticleHtml, setSavedArticleHtml] = useState("");
  const [status, setStatus] = useState("正在准备工作区");
  const [isBusy, setIsBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [backlinks, setBacklinks] = useState<SearchResult[]>([]);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [], brokenLinks: [] });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("未命名笔记");
  const [draftLang, setDraftLang] = useState("zh-Hans");
  const [draftTemplate, setDraftTemplate] = useState<NoteTemplateId>("blank");
  const [todayText, setTodayText] = useState("");
  const [todayMessages, setTodayMessages] = useState<TodayMessage[]>([]);
  const [isTodayBusy, setIsTodayBusy] = useState(false);
  const [didLoadDefaultWorkspace, setDidLoadDefaultWorkspace] = useState(false);
  const isDirty = workspace.activeNote !== null && articleHtml !== savedArticleHtml;

  const activeTitle = useMemo(() => {
    if (view === "settings") {
      return "设置";
    }
    if (view === "today") {
      return "今天";
    }
    if (!workspace.activeNote) {
      return "没有打开的笔记";
    }

    return titleFromArticleHtml(articleHtml, workspace.activeNote.title);
  }, [articleHtml, view, workspace.activeNote]);

  const refreshNotes = useCallback(async (path: string) => {
    const notes = await workspaceAdapter.listNotes(path);
    setWorkspace((current) => ({ ...current, path, notes }));
    setGraph(await workspaceAdapter.graphData(path));
    return notes;
  }, []);

  const refreshBacklinks = useCallback(async (path: string, noteId: string) => {
    setBacklinks(await workspaceAdapter.listBacklinks(path, noteId));
  }, []);

  const openWorkspacePath = useCallback(
    async (path: string) => {
      await workspaceAdapter.ensureWorkspace(path);
      const notes = await refreshNotes(path);
      localStorage.setItem(WORKSPACE_PATH_STORAGE_KEY, path);
      setWorkspace((current) => ({ ...current, path, notes }));
      setStatus(notes.length > 0 ? "工作区已打开" : "工作区已初始化");
      return notes;
    },
    [refreshNotes],
  );

  const openWorkspace = useCallback(async () => {
    setIsBusy(true);
    try {
      const path = await workspaceAdapter.chooseWorkspace();
      if (!path) {
        setStatus("未选择工作区");
        return;
      }

      await openWorkspacePath(path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "打开工作区失败");
    } finally {
      setIsBusy(false);
    }
  }, [openWorkspacePath]);

  const requestCreateNote = useCallback(() => {
    const template = NOTE_TEMPLATES[0];
    setDraftTemplate(template.id);
    setDraftTitle(template.defaultTitle);
    setDraftLang("zh-Hans");
    setCreateDialogOpen(true);
  }, []);

  const createNoteFromInput = useCallback(async (input: NewNoteInput, successMessage: string) => {
    const title = input.title.trim();
    if (!title) {
      setStatus("笔记标题不能为空");
      return;
    }

    setIsBusy(true);
    try {
      const path = workspace.path ?? (await workspaceAdapter.defaultWorkspacePath());

      await workspaceAdapter.ensureWorkspace(path);
      const note = await workspaceAdapter.createNote(path, { ...input, title });
      const notes = await workspaceAdapter.listNotes(path);
      openNoteDocument(path, notes, note);
      await refreshBacklinks(path, note.id);
      setStatus(successMessage);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "创建笔记失败");
    } finally {
      setIsBusy(false);
    }
  }, [refreshBacklinks, workspace.path]);

  const createNote = useCallback(async () => {
    const template = NOTE_TEMPLATES.find((item) => item.id === draftTemplate) ?? NOTE_TEMPLATES[0];
    setCreateDialogOpen(false);
    await createNoteFromInput(
      {
        title: draftTitle,
        lang: draftLang,
        body: template.body,
      },
      `已创建${template.title}`,
    );
  }, [createNoteFromInput, draftLang, draftTemplate, draftTitle]);

  const createFromPrompt = useCallback(async (prompt: string) => {
    setTodayText(prompt);
    setView("today");
  }, []);

  const createPromptNote = useCallback(async (prompt: string) => {
    await createNoteFromInput(
      {
        title: prompt.replace(/[？?]$/, ""),
        lang: "zh-Hans",
        body: `<p><span data-opaline-tag="prompt">#prompt</span></p><h2>${escapeHtml(prompt)}</h2><p></p><h2>背景</h2><p></p><h2>后续</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul>`,
      },
      "已根据今日提示创建草稿",
    );
  }, [createNoteFromInput]);

  const createDailyNote = useCallback(async () => {
    setIsBusy(true);
    try {
      const path = workspace.path ?? (await workspaceAdapter.defaultWorkspacePath());

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
        setView("note");
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
      setView("note");
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
        setStatus("工作区还在准备中");
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
    if (didLoadDefaultWorkspace) {
      return;
    }

    setDidLoadDefaultWorkspace(true);
    void (async () => {
      try {
        const path = localStorage.getItem(WORKSPACE_PATH_STORAGE_KEY) || (await workspaceAdapter.defaultWorkspacePath());
        await openWorkspacePath(path);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "初始化工作区失败");
      }
    })();
  }, [didLoadDefaultWorkspace, openWorkspacePath]);

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

  const appendTodayConversation = useCallback(async () => {
    const text = todayText.trim();
    if (!text) {
      setStatus("先写一点内容");
      return;
    }

    const userMessage: TodayMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    setTodayMessages((current) => [...current, userMessage]);
    setTodayText("");
    setIsTodayBusy(true);

    try {
      const path = workspace.path ?? (await workspaceAdapter.defaultWorkspacePath());

      await workspaceAdapter.ensureWorkspace(path);
      let dailyNote = await workspaceAdapter.createDailyNote(path);
      const currentNotes = await workspaceAdapter.listNotes(path);
      const withUserEntry = appendDailyEntry(articleFromHtmlDocument(dailyNote.html), userMessage);
      dailyNote = await workspaceAdapter.saveNote(path, {
        ...dailyNote,
        html: replaceArticleInDocument(dailyNote.html, withUserEntry, currentNotes),
      });

      const settings = loadAiSettings();
      const adapter = getAiAdapter(settings.provider);
      if (!settings.apiKey.trim()) {
        const assistantMessage: TodayMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "已记录。AI 还没配置，去设置里保存模型后我就能继续接话。",
          createdAt: new Date().toISOString(),
        };
        setTodayMessages((current) => [...current, assistantMessage]);
        setStatus("已写入今日日记，AI 尚未配置");
        setWorkspace((current) => ({ ...current, path, notes: currentNotes, activeNote: current.activeNote }));
        return;
      }

      const recentMessages = [...todayMessages, userMessage].slice(-8).map((message) => ({
        role: message.role,
        content: message.content,
      }));
      const reply = await adapter.chat(
        [
          {
            role: "system",
            content:
              "你是 Opaline 的随手记录助手。用户可能在吐槽、复盘、提问或记录灵感。请先接住用户的话，再给出有用的下一步、解决思路或可沉淀的笔记线索。用中文，简洁但具体。",
          },
          ...recentMessages,
        ],
        {
          model: settings.model || adapter.defaultModel,
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl || adapter.defaultBaseUrl,
        },
      );

      const assistantMessage: TodayMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        createdAt: new Date().toISOString(),
      };
      setTodayMessages((current) => [...current, assistantMessage]);

      const withAssistantEntry = appendDailyEntry(articleFromHtmlDocument(dailyNote.html), assistantMessage);
      const saved = await workspaceAdapter.saveNote(path, {
        ...dailyNote,
        html: replaceArticleInDocument(dailyNote.html, withAssistantEntry, currentNotes),
      });
      const notes = await refreshNotes(path);
      setWorkspace((current) => ({
        ...current,
        path,
        notes,
        activeNote: current.activeNote?.id === saved.id ? saved : current.activeNote,
      }));
      setStatus("已写入今日日记，AI 已回复");
    } catch (error) {
      const assistantMessage: TodayMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: error instanceof Error ? error.message : "记录或 AI 请求失败",
        createdAt: new Date().toISOString(),
      };
      setTodayMessages((current) => [...current, assistantMessage]);
      setStatus(error instanceof Error ? error.message : "记录失败");
    } finally {
      setIsTodayBusy(false);
    }
  }, [refreshNotes, todayMessages, todayText, workspace.path]);

  const openNoteDocument = (path: string, notes: NoteSummary[], note: NoteDocument) => {
    const nextArticleHtml = articleFromHtmlDocument(note.html);
    setWorkspace({ path, notes, activeNote: note });
    setArticleHtml(nextArticleHtml);
    setSavedArticleHtml(nextArticleHtml);
    setView("note");
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <img src={leafLogo} alt="" />
          </span>
          <div>
            <strong>Opaline</strong>
            <span>本地 HTML 笔记</span>
          </div>
        </div>

        <div className="sidebar-actions">
          <button type="button" onClick={() => setView("today")} disabled={isBusy}>
            <Home size={17} />
            <span>今天</span>
          </button>
          <button type="button" onClick={openWorkspace} disabled={isBusy}>
            <FolderOpen size={17} />
            <span>打开</span>
          </button>
          <button type="button" onClick={requestCreateNote} disabled={isBusy}>
            <FilePlus2 size={17} />
            <span>新建</span>
          </button>
          <button type="button" onClick={createDailyNote} disabled={isBusy}>
            <CalendarDays size={17} />
            <span>日记</span>
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

        <button type="button" className="settings-entry" onClick={() => setView("settings")}>
          <Settings size={18} />
          <span>设置</span>
        </button>
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

        {view === "settings" ? (
          <SettingsView
            workspacePath={workspace.path}
            onChangeWorkspace={async () => {
              const path = await workspaceAdapter.chooseWorkspace();
              if (!path) return;
              await openWorkspacePath(path);
            }}
          />
        ) : view === "note" && workspace.activeNote ? (
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
          <TodayView
            text={todayText}
            messages={todayMessages}
            busy={isTodayBusy}
            onTextChange={setTodayText}
            onSubmit={appendTodayConversation}
          />
        )}
      </section>
      <CreateNoteDialog
        open={createDialogOpen}
        title={draftTitle}
        lang={draftLang}
        template={draftTemplate}
        templates={NOTE_TEMPLATES}
        busy={isBusy}
        onTitleChange={setDraftTitle}
        onLangChange={setDraftLang}
        onTemplateChange={(template) => {
          setDraftTemplate(template.id);
          setDraftTitle(template.defaultTitle);
        }}
        onCancel={() => setCreateDialogOpen(false)}
        onSubmit={createNote}
      />
    </main>
  );
}

function TodayView({
  text,
  messages,
  busy,
  onTextChange,
  onSubmit,
}: {
  text: string;
  messages: TodayMessage[];
  busy: boolean;
  onTextChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="today-home">
      <div className="today-chat">
        <section className="today-thread" aria-label="今日对话">
          {messages.map((message) => (
            <article key={message.id} className={`today-message is-${message.role}`}>
              <div>
                <strong>{message.role === "user" ? "我" : "AI"}</strong>
                <span>{formatTime(message.createdAt)}</span>
              </div>
              <div dangerouslySetInnerHTML={{ __html: paragraphsFromPlainText(message.content) }} />
            </article>
          ))}
        </section>

        <textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              onSubmit();
            }
          }}
          rows={4}
          aria-label="今天"
        />
        <div className="today-composer-actions">
          <button type="button" onClick={onSubmit} disabled={busy || !text.trim()}>
            {busy ? <Bot size={17} className="spinner" /> : <Send size={17} />}
            <span>{busy ? "处理中" : "发送"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function SettingsView({
  workspacePath,
  onChangeWorkspace,
}: {
  workspacePath: string | null;
  onChangeWorkspace: () => void | Promise<void>;
}) {
  return (
    <section className="settings-view">
      <section className="settings-card">
        <div className="settings-card-header">
          <FolderOpen size={18} />
          <div>
            <h2>工作区</h2>
          </div>
        </div>
        <div className="workspace-settings-row">
          <span title={workspacePath ?? undefined}>{workspacePath ?? "正在准备"}</span>
          <button type="button" onClick={onChangeWorkspace}>
            更改
          </button>
        </div>
      </section>
      <AiSettingsPanel />
    </section>
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

function CreateNoteDialog({
  open,
  title,
  lang,
  template,
  templates,
  busy,
  onTitleChange,
  onLangChange,
  onTemplateChange,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  lang: string;
  template: NoteTemplateId;
  templates: typeof NOTE_TEMPLATES;
  busy: boolean;
  onTitleChange: (value: string) => void;
  onLangChange: (value: string) => void;
  onTemplateChange: (template: (typeof NOTE_TEMPLATES)[number]) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="note-dialog" role="dialog" aria-modal="true" aria-labelledby="create-note-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="note-dialog-header">
          <span className="dialog-leaf" aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <path d="M39.5 8.5C27.6 8.9 15.8 14.2 10.2 23.8C5.1 32.7 11 41 20.6 40.8C31.6 40.6 39.6 30.4 39.5 8.5Z" />
              <path d="M14 33.6C19.4 27.6 25.5 22.9 33.4 18.9" />
            </svg>
          </span>
          <div>
            <h2 id="create-note-title">创建新笔记</h2>
            <p>选择一个清晰标题，Opaline 会保存为干净 HTML 文件。</p>
          </div>
        </div>

        <label className="dialog-field">
          <span>笔记标题</span>
          <input autoFocus value={title} onChange={(event) => onTitleChange(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit();
            if (event.key === "Escape") onCancel();
          }} />
        </label>

        <div className="template-picker" role="listbox" aria-label="选择笔记模板">
          {templates.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === template ? "template-card is-active" : "template-card"}
              onClick={() => onTemplateChange(item)}
            >
              {item.icon}
              <span>{item.title}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </div>

        <label className="dialog-field">
          <span>语言</span>
          <select value={lang} onChange={(event) => onLangChange(event.target.value)}>
            <option value="zh-Hans">简体中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
        </label>

        <div className="dialog-actions">
          <button type="button" className="dialog-secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="dialog-primary" onClick={onSubmit} disabled={busy || !title.trim()}>
            创建笔记
          </button>
        </div>
      </section>
    </div>
  );
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const paragraphsFromPlainText = (value: string) =>
  value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");

const appendDailyEntry = (articleHtml: string, message: TodayMessage) => {
  const document = new DOMParser().parseFromString(`<article>${articleHtml}</article>`, "text/html");
  const article = document.body.firstElementChild ?? document.createElement("article");
  let log = article.querySelector<HTMLElement>("[data-opaline-daily-log]");

  if (!log) {
    log = document.createElement("section");
    log.setAttribute("data-opaline-daily-log", "");
    const heading = document.createElement("h2");
    heading.textContent = "今日记录";
    log.append(heading);
    article.append(log);
  }

  const entry = document.createElement("section");
  entry.setAttribute("data-opaline-entry", message.role);
  const meta = document.createElement("p");
  meta.setAttribute("data-opaline-entry-meta", "");
  meta.textContent = `${message.role === "user" ? "我" : "AI"} · ${formatTime(message.createdAt)}`;
  const content = document.createElement("div");
  content.setAttribute("data-opaline-entry-content", "");
  content.innerHTML = paragraphsFromPlainText(message.content);
  entry.append(meta, content);
  log.append(entry);

  return article.innerHTML;
};

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
