import { open } from "@tauri-apps/plugin-dialog";
import {
  BookOpen,
  Bot,
  Bug,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  Clock3,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  Home,
  Lightbulb,
  Link2,
  MessageCircle,
  Network,
  NotebookPen,
  RefreshCw,
  Search,
  Send,
  Settings,
  Star,
  ArrowDownAZ,
  FileDown,
  FileUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { AiPanel, AiSettingsPanel } from "./ai/AiPanel";
import { getAiAdapter, loadAiSettings } from "./ai/settings";
import type { NoteSuggestion } from "./editor/OpalineEditor";
import { OpalineEditor } from "./editor/OpalineEditor";
import { GraphView } from "./editor/GraphView";
import { articleFromHtmlDocument, replaceArticleInDocument, titleFromArticleHtml } from "./editor/htmlProfile";
import { markdownTitle } from "./editor/markdownImport";
import type { GraphData, ImportedAsset, NewNoteInput, NoteDocument, NoteSummary, SearchResult, WorkspaceState } from "./domain/note";
import leafLogo from "./assets/opaline-leaf-gradient.svg";
import { workspaceAdapter } from "./storage/adapter";
import { WorkspaceMigrationDialog } from "./components/WorkspaceMigrationDialog";

const initialState: WorkspaceState = {
  path: null,
  notes: [],
  activeNote: null,
};

const WORKSPACE_PATH_STORAGE_KEY = "opaline-workspace-path";

type NoteTemplateId = "blank" | "idea" | "project-log" | "reading" | "debugging";
type AppView = "home" | "today" | "note" | "settings" | "graph";
type VaultSortMode = "updated" | "title";
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

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(initialState);
  const [view, setView] = useState<AppView>("home");
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
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [vaultSortMode, setVaultSortMode] = useState<VaultSortMode>("updated");
  const [allFoldersExpanded, setAllFoldersExpanded] = useState(true);
  const [noteContextMenu, setNoteContextMenu] = useState<{ note: NoteSummary; x: number; y: number } | null>(null);
  const [migrationDialog, setMigrationDialog] = useState<{ oldPath: string; newPath: string } | null>(null);
  const isDirty = workspace.activeNote !== null && articleHtml !== savedArticleHtml;
  const favoriteNotes = useMemo(() => workspace.notes.filter((note) => note.favorite), [workspace.notes]);
  const recentNotes = useMemo(() => workspace.notes.slice(0, 6), [workspace.notes]);
  const currentTags = workspace.activeNote?.tags ?? [];
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const note of workspace.notes) {
      for (const tag of note.tags) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [workspace.notes]);
  const cycleVaultSort = useCallback(() => {
    setVaultSortMode((mode) => (mode === "updated" ? "title" : "updated"));
  }, []);

  const activeTitle = useMemo(() => {
    if (view === "home") {
      return "Opaline";
    }
    if (view === "settings") {
      return "设置";
    }
    if (view === "today") {
      return "今天";
    }
    if (view === "graph") {
      return "图谱";
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

  const createFolder = useCallback(async () => {
    const raw = window.prompt("新建文件夹", "notes/");
    if (!raw) {
      return;
    }
    const directory = raw.trim().replace(/\\/g, "/");
    if (!directory) {
      return;
    }

    setIsBusy(true);
    try {
      const path = workspace.path ?? (await workspaceAdapter.defaultWorkspacePath());
      await workspaceAdapter.ensureWorkspace(path);
      await workspaceAdapter.createFolder(path, directory.startsWith("notes") ? directory : `notes/${directory}`);
      await refreshNotes(path);
      setStatus("文件夹已创建");
      setAllFoldersExpanded(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "创建文件夹失败");
    } finally {
      setIsBusy(false);
    }
  }, [refreshNotes, workspace.path]);

  const importMarkdown = useCallback(async () => {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "选择 Markdown 文件",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    if (!paths.length) return;

    setIsBusy(true);
    try {
      const path = workspace.path ?? (await workspaceAdapter.defaultWorkspacePath());
      await workspaceAdapter.ensureWorkspace(path);

      for (const filePath of paths) {
        const content = await workspaceAdapter.readFileText!(filePath);
        const title = markdownTitle(content);
        await workspaceAdapter.importMarkdown!(path, content, title);
      }

      await refreshNotes(path);
      setStatus(`已导入 ${paths.length} 篇笔记`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "导入失败");
    } finally {
      setIsBusy(false);
    }
  }, [refreshNotes, workspace.path]);

  const exportMarkdown = useCallback(async () => {
    if (!workspace.path) {
      setStatus("请先打开工作区");
      return;
    }
    const dir = await open({
      directory: true,
      multiple: false,
      title: "选择导出目录",
    });
    if (typeof dir !== "string") return;
    setIsBusy(true);
    setStatus("正在导出...");
    let exported = 0;
    try {
      const { articleHtmlToMarkdown } = await import("./editor/markdownExport");
      for (const note of workspace.notes) {
        try {
          const document = await workspaceAdapter.readNote(workspace.path, note.path);
          const articleHtml = articleFromHtmlDocument(document.html);
          const markdown = articleHtmlToMarkdown(articleHtml);
          const filePath = `${dir}/${markdownExportPath(note.path, note.title)}`;
          await workspaceAdapter.writeExportFile!(filePath, markdown);
          exported++;
          setStatus(`正在导出... ${exported} / ${workspace.notes.length}`);
        } catch {
          // continue with next note
        }
      }
      setStatus(`已导出 ${exported} 篇笔记`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "导出失败");
    } finally {
      setIsBusy(false);
    }
  }, [workspace.notes, workspace.path]);

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

  const toggleNoteFavorite = useCallback(async (note: NoteSummary) => {
    if (!workspace.path) return;
    const favorite = await workspaceAdapter.toggleFavorite(workspace.path, note.id);
    const notes = await refreshNotes(workspace.path);
    setWorkspace((current) => ({
      ...current,
      notes,
      activeNote: current.activeNote?.id === note.id ? { ...current.activeNote, favorite } : current.activeNote,
    }));
    setStatus(favorite ? "已收藏" : "已取消收藏");
  }, [refreshNotes, workspace.path]);

  const duplicateNote = useCallback(async (note: NoteSummary) => {
    if (!workspace.path) return;
    setIsBusy(true);
    try {
      const document = await workspaceAdapter.readNote(workspace.path, note.path);
      const directory = note.path.split("/").slice(0, -1).join("/") || "notes";
      const duplicate = await workspaceAdapter.createNote(workspace.path, {
        title: `${note.title} 副本`,
        lang: "zh-Hans",
        directory,
        body: articleFromHtmlDocument(document.html),
      });
      const notes = await workspaceAdapter.listNotes(workspace.path);
      openNoteDocument(workspace.path, notes, duplicate);
      setStatus("已创建副本");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "创建副本失败");
    } finally {
      setIsBusy(false);
    }
  }, [workspace.path]);

  const copyNotePath = useCallback(async (note: NoteSummary) => {
    await navigator.clipboard?.writeText(note.path);
    setStatus("已复制路径");
  }, []);

  const renameNote = useCallback(async (note: NoteSummary) => {
    const newTitle = window.prompt("新标题", note.title)?.trim();
    if (!newTitle || newTitle === note.title) return;
    setIsBusy(true);
    try {
      const updated = await workspaceAdapter.renameNote(workspace.path!, note.id, newTitle);
      const notesList = await refreshNotes(workspace.path!);
      if (workspace.activeNote?.id === note.id) {
        const doc = await workspaceAdapter.readNote(workspace.path!, updated.path);
        openNoteDocument(workspace.path!, notesList, doc);
      } else {
        setWorkspace((current) => ({ ...current, notes: notesList }));
      }
      setStatus("已重命名");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "重命名失败");
    } finally {
      setIsBusy(false);
    }
  }, [refreshNotes, workspace.activeNote, workspace.path]);

  const deleteNote = useCallback(async (note: NoteSummary) => {
    if (!window.confirm(`确定要删除「${note.title}」吗？此操作不可撤销。`)) return;
    setIsBusy(true);
    try {
      await workspaceAdapter.deleteNote(workspace.path!, note.id);
      if (workspace.activeNote?.id === note.id) {
        setWorkspace((current) => ({ ...current, activeNote: null }));
        setView("home");
      }
      await refreshNotes(workspace.path!);
      setStatus("已删除");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "删除失败");
    } finally {
      setIsBusy(false);
    }
  }, [refreshNotes, workspace.activeNote, workspace.path]);

  const moveNote = useCallback(async (note: NoteSummary) => {
    const dir = window.prompt("移动到文件夹 (e.g. notes/archive)", "notes/")?.trim();
    if (!dir) return;
    setIsBusy(true);
    try {
      const updated = await workspaceAdapter.moveNote(workspace.path!, note.id, dir);
      const notesList = await refreshNotes(workspace.path!);
      if (workspace.activeNote?.id === note.id) {
        const doc = await workspaceAdapter.readNote(workspace.path!, updated.path);
        openNoteDocument(workspace.path!, notesList, doc);
      } else {
        setWorkspace((current) => ({ ...current, notes: notesList }));
      }
      setStatus("已移动");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "移动失败");
    } finally {
      setIsBusy(false);
    }
  }, [refreshNotes, workspace.activeNote, workspace.path]);

  const revealNoteInExplorer = useCallback(async (note: NoteSummary) => {
    try {
      await workspaceAdapter.revealInExplorer(workspace.path!, note.path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "打开文件管理器失败");
    }
  }, [workspace.path]);

  const moveNoteTo = useCallback(async (note: NoteSummary, targetDir: string) => {
    if (!workspace.path) return;
    const currentDir = note.path.split("/").slice(0, -1).join("/") || "notes";
    if (currentDir === targetDir) return;
    setIsBusy(true);
    try {
      const updated = await workspaceAdapter.moveNote(workspace.path, note.id, targetDir);
      const notesList = await refreshNotes(workspace.path);
      if (workspace.activeNote?.id === note.id) {
        const doc = await workspaceAdapter.readNote(workspace.path, updated.path);
        openNoteDocument(workspace.path, notesList, doc);
      } else {
        setWorkspace((current) => ({ ...current, notes: notesList }));
      }
      setStatus(`已移动到 ${targetDir}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "移动失败");
    } finally {
      setIsBusy(false);
    }
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
    <main
      className={`app-shell ${view === "home" ? "is-home-mode" : ""} ${(view === "note" || view === "graph") ? "is-note-mode" : ""} ${leftPanelCollapsed ? "is-left-collapsed" : ""} ${rightPanelCollapsed ? "is-right-collapsed" : ""}`}
    >
      {(view === "note" || view === "graph") ? (
        <NoteRibbon
          leftCollapsed={leftPanelCollapsed}
          onHome={() => setView("home")}
          onToggleLeft={() => setLeftPanelCollapsed((value) => !value)}
          onGraph={() => setView("graph")}
          onImport={importMarkdown}
          onExport={exportMarkdown}
        />
      ) : null}
      {view === "home" || ((view === "note" || view === "graph") && leftPanelCollapsed) ? null : (
      <aside className={`sidebar ${(view === "note" || view === "graph") ? "is-vault-sidebar" : ""}`}>
        {(view === "note" || view === "graph") ? null : (
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <img src={leafLogo} alt="" />
          </span>
          <div>
            <strong>Opaline</strong>
            <span>本地 HTML 笔记</span>
          </div>
        </div>
        )}

        <div className="sidebar-actions">
          {(view === "note" || view === "graph") ? null : (
            <button type="button" onClick={() => setView("home")} disabled={isBusy} data-tooltip="入口" aria-label="入口">
              <Home size={17} />
              <span>入口</span>
            </button>
          )}
          <button type="button" onClick={openWorkspace} disabled={isBusy} data-tooltip="打开工作区" aria-label="打开工作区">
            <FolderOpen size={17} />
            <span>打开</span>
          </button>
          <button type="button" onClick={requestCreateNote} disabled={isBusy} data-tooltip="新建笔记" aria-label="新建笔记">
            <FilePlus2 size={17} />
            <span>新建</span>
          </button>
          {(view !== "note" && view !== "graph") ? (
            <button type="button" onClick={importMarkdown} disabled={isBusy} data-tooltip="导入 Markdown 文件" aria-label="导入 Markdown">
              <FileDown size={17} />
              <span>导入</span>
            </button>
          ) : null}
          {(view === "note" || view === "graph") ? (
            <>
              <button type="button" onClick={createFolder} disabled={isBusy} data-tooltip="新建文件夹" aria-label="新建文件夹">
                <FolderPlus size={17} />
                <span>新建文件夹</span>
              </button>
              <button type="button" onClick={() => setAllFoldersExpanded((value) => !value)} disabled={isBusy} data-tooltip={allFoldersExpanded ? "折叠全部" : "展开全部"} aria-label={allFoldersExpanded ? "折叠全部" : "展开全部"}>
                <ChevronsDown size={17} />
                <span>{allFoldersExpanded ? "折叠文件夹" : "展开文件夹"}</span>
              </button>
              <button type="button" onClick={cycleVaultSort} disabled={isBusy} data-tooltip={vaultSortMode === "updated" ? "按修改时间排序" : "按标题排序"} aria-label={vaultSortMode === "updated" ? "按修改时间排序" : "按标题排序"}>
                <ArrowDownAZ size={17} />
                <span>{vaultSortMode === "updated" ? "按时间" : "按标题"}</span>
              </button>
            </>
          ) : (
            <button type="button" onClick={createDailyNote} disabled={isBusy} data-tooltip="日记" aria-label="日记">
              <CalendarDays size={17} />
              <span>日记</span>
            </button>
          )}
          {workspace.path ? (
            <button type="button" onClick={() => refreshNotes(workspace.path as string)} disabled={isBusy} data-tooltip="刷新" aria-label="刷新">
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

        {(view === "note" || view === "graph") ? (
          <VaultExplorer
            notes={workspace.notes}
            favorites={favoriteNotes}
            activePath={workspace.activeNote?.path ?? null}
            sortMode={vaultSortMode}
            expanded={allFoldersExpanded}
            onOpen={openNote}
            onMoveTo={moveNoteTo}
            onContextMenu={(note, event) => {
              event.preventDefault();
              setNoteContextMenu({ note, x: event.clientX, y: event.clientY });
            }}
          />
        ) : (
          <nav className="note-list" aria-label="笔记列表">
            {workspace.notes.length === 0 ? (
              <p className="empty-state">还没有笔记。</p>
            ) : (
              workspace.notes.map((note) => (
                <NoteListItem
                  key={note.path}
                  note={note}
                  active={workspace.activeNote?.path === note.path}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setNoteContextMenu({ note, x: event.clientX, y: event.clientY });
                  }}
                  onOpen={() => openNote(note)}
                />
              ))
            )}
          </nav>
        )}

        <button type="button" className="settings-entry" onClick={() => setView("settings")}>
          <Settings size={18} />
          <span>设置</span>
        </button>
      </aside>
      )}

      <section className="main-pane">
        {view === "home" ? null : (
          <header className="topbar">
            <div>
              <h1>{activeTitle}</h1>
              <p>
                {view === "note" && workspace.activeNote ? workspace.activeNote.path : status}
                {isDirty ? <span className="dirty-dot">未保存</span> : null}
                {currentTags.map((tag) => (
                  <span key={tag} className="tag-pill">#{tag}</span>
                ))}
              </p>
            </div>
            {workspace.activeNote ? (
              <button className="favorite-button" type="button" onClick={toggleFavorite} aria-label="收藏">
                <Star size={18} fill={workspace.activeNote.favorite ? "currentColor" : "none"} />
              </button>
            ) : null}
            {view === "note" ? (
              <button
                className="right-panel-toggle"
                type="button"
                data-tooltip={rightPanelCollapsed ? "展开右侧栏" : "折叠右侧栏"}
                onClick={() => setRightPanelCollapsed((value) => !value)}
                aria-label={rightPanelCollapsed ? "展开右侧栏" : "折叠右侧栏"}
              >
                {rightPanelCollapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
              </button>
            ) : null}
          </header>
        )}

        {view === "home" ? (
          <EntryChoiceView
            onSerious={() => setView("note")}
            onCasual={() => setView("today")}
          />
        ) : view === "graph" ? (
          <GraphView
            graph={graph}
            activeNoteId={workspace.activeNote?.id ?? null}
            allTags={allTags}
            onOpenNote={(nodeId) => {
              const note = workspace.notes.find((n) => n.id === nodeId);
              if (note) { void openNote(note); setView("note"); }
            }}
            onBack={() => setView(workspace.activeNote ? "note" : "home")}
          />
        ) : view === "settings" ? (
          <SettingsView
            workspacePath={workspace.path}
            onChangeWorkspace={async () => {
              const newPath = await workspaceAdapter.chooseWorkspace();
              if (!newPath) return;
              const oldPath = workspace.path;
              if (oldPath && oldPath !== newPath) {
                setMigrationDialog({ oldPath, newPath });
                return;
              }
              await openWorkspacePath(newPath);
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
              <Section title="操作" icon={<CalendarDays size={16} />}>
                <div className="inspector-actions">
                  <button type="button" onClick={requestCreateNote} disabled={isBusy}>
                    <FilePlus2 size={16} />
                    <span>新建笔记</span>
                  </button>
                  <button type="button" onClick={createDailyNote} disabled={isBusy}>
                    <CalendarDays size={16} />
                    <span>今日日记</span>
                  </button>
                  <button type="button" onClick={() => workspace.path && refreshNotes(workspace.path)} disabled={isBusy || !workspace.path}>
                    <RefreshCw size={16} />
                    <span>刷新</span>
                  </button>
                </div>
              </Section>
              <AiPanel />
              <Section title="大纲" icon={<FileText size={16} />}>
                {workspace.activeNote.headings.length ? (
                  workspace.activeNote.headings.map((heading) => <p key={heading}>{heading}</p>)
                ) : (
                  <p className="muted">还没有标题。</p>
                )}
              </Section>
              <Section title="出链" icon={<Link2 size={16} />}>
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
              <Section title="反链" icon={<Clock3 size={16} />}>
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
              <Section title="图谱" icon={<Network size={16} />}>
                <GraphPreview
                  graph={graph}
                  activeNoteId={workspace.activeNote.id}
                  onOpenNode={(nodeId) => {
                    const note = workspace.notes.find((item) => item.id === nodeId);
                    if (note) void openNote(note);
                  }}
                />
                {graph.brokenLinks.length ? <p className="is-broken">{graph.brokenLinks.length} 条断链</p> : null}
              </Section>
            </aside>
          </div>
        ) : view === "note" ? (
          <SeriousEmptyView
            recentNotes={recentNotes}
            onCreate={requestCreateNote}
            onDaily={createDailyNote}
            onOpen={openNote}
            busy={isBusy}
          />
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
      <NoteContextMenu
        state={noteContextMenu}
        onClose={() => setNoteContextMenu(null)}
        onOpen={(note) => void openNote(note)}
        onDuplicate={(note) => void duplicateNote(note)}
        onToggleFavorite={(note) => void toggleNoteFavorite(note)}
        onCopyPath={(note) => void copyNotePath(note)}
        onRename={(note) => void renameNote(note)}
        onDelete={(note) => void deleteNote(note)}
        onMove={(note) => void moveNote(note)}
        onReveal={(note) => void revealNoteInExplorer(note)}
      />
      <WorkspaceMigrationDialog
        open={migrationDialog !== null}
        oldPath={migrationDialog?.oldPath ?? ""}
        newPath={migrationDialog?.newPath ?? ""}
        onCopy={async () => {
          await workspaceAdapter.copyWorkspace!(migrationDialog!.oldPath, migrationDialog!.newPath);
          await openWorkspacePath(migrationDialog!.newPath);
          setMigrationDialog(null);
        }}
        onMove={async () => {
          await workspaceAdapter.moveWorkspace!(migrationDialog!.oldPath, migrationDialog!.newPath);
          await openWorkspacePath(migrationDialog!.newPath);
          setMigrationDialog(null);
        }}
        onCancel={() => setMigrationDialog(null)}
      />
    </main>
  );
}

function EntryChoiceView({
  onSerious,
  onCasual,
}: {
  onSerious: () => void;
  onCasual: () => void;
}) {
  return (
    <section className="entry-choice" aria-label="选择记录方式">
      <button type="button" className="entry-choice-card" onClick={onSerious}>
        <NotebookPen size={82} strokeWidth={1.7} />
        <span>认真记记</span>
      </button>
      <button type="button" className="entry-choice-card" onClick={onCasual}>
        <MessageCircle size={82} strokeWidth={1.7} />
        <span>随便记记</span>
      </button>
    </section>
  );
}

function NoteRibbon({
  leftCollapsed,
  onHome,
  onToggleLeft,
  onGraph,
  onImport,
  onExport,
}: {
  leftCollapsed: boolean;
  onHome: () => void;
  onToggleLeft: () => void;
  onGraph: () => void;
  onImport: () => void;
  onExport: () => void;
}) {
  return (
    <nav className="note-ribbon" aria-label="工作台">
      <button type="button" onClick={onHome} data-tooltip="返回入口页" aria-label="返回入口页">
        <Home size={18} />
      </button>
      <button type="button" onClick={onToggleLeft} data-tooltip={leftCollapsed ? "展开左侧栏" : "折叠左侧栏"} aria-label={leftCollapsed ? "展开左侧栏" : "折叠左侧栏"}>
        {leftCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
      <button type="button" onClick={onImport} data-tooltip="导入 Markdown" aria-label="导入 Markdown">
        <FileDown size={18} />
      </button>
      <button type="button" onClick={onExport} data-tooltip="导出 Markdown" aria-label="导出 Markdown">
        <FileUp size={18} />
      </button>
      <button type="button" onClick={onGraph} data-tooltip="图谱" aria-label="图谱">
        <Network size={18} />
      </button>
    </nav>
  );
}

function SeriousEmptyView({
  recentNotes,
  onCreate,
  onDaily,
  onOpen,
  busy,
}: {
  recentNotes: NoteSummary[];
  onCreate: () => void;
  onDaily: () => void;
  onOpen: (note: NoteSummary) => void;
  busy: boolean;
}) {
  return (
    <section className="serious-empty">
      <div className="serious-empty-actions" aria-label="开始认真记录">
        <button type="button" onClick={onCreate} disabled={busy}>
          <FilePlus2 size={24} />
          <span>新建</span>
        </button>
        <button type="button" onClick={onDaily} disabled={busy}>
          <CalendarDays size={24} />
          <span>日记</span>
        </button>
      </div>

      <section className="serious-start-panel">
        <div className="vault-section-title">
          <Clock3 size={15} />
          <span>最近</span>
        </div>
        {recentNotes.length ? (
          <div className="recent-note-grid">
            {recentNotes.map((note) => (
              <button key={note.path} type="button" onClick={() => onOpen(note)}>
                <strong>{note.title}</strong>
                <span>{note.path}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-state">认真记录从第一篇笔记开始。</p>
        )}
      </section>

    </section>
  );
}

function GraphPreview({
  graph,
  activeNoteId,
  onOpenNode,
}: {
  graph: GraphData;
  activeNoteId: string;
  onOpenNode: (nodeId: string) => void;
}) {
  const nodes = graph.nodes.slice(0, 20);
  const width = 260;
  const height = 200;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(60, nodes.length <= 1 ? 0 : Math.min(80, nodes.length * 8));
  const positions = new Map(
    nodes.map((node, index) => {
      const angle = nodes.length <= 1 ? 0 : (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
      return [
        node.id,
        {
          x: nodes.length <= 1 ? centerX : centerX + Math.cos(angle) * radius,
          y: nodes.length <= 1 ? centerY : centerY + Math.sin(angle) * radius,
        },
      ] as const;
    }),
  );
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)).slice(0, 36);

  if (!nodes.length) {
    return <p className="muted">还没有可显示的图谱。</p>;
  }

  return (
    <div className="graph-preview">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="笔记图谱">
        {edges.map((edge, index) => {
          const source = positions.get(edge.source);
          const target = positions.get(edge.target);
          if (!source || !target) return null;
          return (
            <line
              key={`${edge.source}-${edge.target}-${index}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
            />
          );
        })}
        {nodes.map((node) => {
          const position = positions.get(node.id);
          if (!position) return null;
          const active = node.id === activeNoteId;
          return (
            <g key={node.id} className={active ? "is-active" : undefined} onClick={() => onOpenNode(node.id)}>
              <circle cx={position.x} cy={position.y} r={active ? 9 : 6} />
              <title>{node.title}</title>
            </g>
          );
        })}
      </svg>
      <p>{graph.nodes.length} 篇笔记 · {graph.edges.length} 条链接</p>
    </div>
  );
}

function VaultExplorer({
  notes,
  favorites,
  activePath,
  sortMode,
  expanded,
  onOpen,
  onContextMenu,
  onMoveTo,
}: {
  notes: NoteSummary[];
  favorites: NoteSummary[];
  activePath: string | null;
  sortMode: VaultSortMode;
  expanded: boolean;
  onOpen: (note: NoteSummary) => void;
  onContextMenu: (note: NoteSummary, event: MouseEvent) => void;
  onMoveTo: (note: NoteSummary, targetDir: string) => void;
}) {
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [draggingNote, setDraggingNote] = useState<NoteSummary | null>(null);

  const sortedNotes = [...notes].sort((a, b) => {
    if (sortMode === "title") {
      return a.title.localeCompare(b.title, "zh-Hans");
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const grouped = sortedNotes.reduce<Array<{ directory: string; notes: NoteSummary[] }>>((groups, note) => {
    const directory = note.path.split("/").slice(0, -1).join("/") || "notes";
    const existing = groups.find((group) => group.directory === directory);
    if (existing) {
      existing.notes.push(note);
    } else {
      groups.push({ directory, notes: [note] });
    }
    return groups;
  }, []);

  const makeFolderDropHandlers = (directory: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverFolder(directory);
    },
    onDragLeave: (e: React.DragEvent) => {
      const relatedTarget = e.relatedTarget as Node | null;
      if (!e.currentTarget.contains(relatedTarget)) {
        setDragOverFolder(null);
      }
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverFolder(null);
      if (draggingNote) {
        onMoveTo(draggingNote, directory);
      }
    },
  });

  const makeDraggableProps = (note: NoteSummary) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", note.id);
      setDraggingNote(note);
    },
    onDragEnd: () => {
      setDraggingNote(null);
    },
  });

  return (
    <div className="vault-explorer">
      {favorites.length ? (
        <section className="vault-section">
          <div className="vault-section-title">
            <Star size={15} />
            <span>收藏</span>
          </div>
          <nav className="note-list is-compact" aria-label="收藏笔记">
            {favorites.map((note) => (
              <NoteListItem
                key={note.path}
                note={note}
                active={activePath === note.path}
                showPath={false}
                onContextMenu={(event) => onContextMenu(note, event)}
                onOpen={() => onOpen(note)}
              />
            ))}
          </nav>
        </section>
      ) : null}

      <section className="vault-section is-files">
        <div className="vault-section-title">
          <FileText size={15} />
          <span>文件</span>
          <small>{sortMode === "updated" ? "时间" : "标题"}</small>
        </div>
        <nav className="note-list vault-tree" aria-label="所有笔记">
          {notes.length === 0 ? (
            <p className="empty-state">还没有笔记。</p>
          ) : (
            grouped.map((group) => (
              <section key={group.directory} className={`vault-folder ${dragOverFolder === group.directory ? "is-drag-over" : ""}`}>
                <div className="vault-folder-title" {...makeFolderDropHandlers(group.directory)}>
                  <ChevronRight size={14} className={expanded ? "is-expanded" : undefined} />
                  <span>{group.directory.replace(/^notes\/?/, "") || "根目录"}</span>
                </div>
                {expanded ? (
                  <div className="vault-folder-notes">
                    {group.notes.map((note) => (
                      <NoteListItem
                        key={note.path}
                        note={note}
                        active={activePath === note.path}
                        showPath={false}
                        {...makeDraggableProps(note)}
                        onContextMenu={(event) => onContextMenu(note, event)}
                        onOpen={() => onOpen(note)}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            ))
          )}
        </nav>
      </section>
    </div>
  );
}

function NoteListItem({
  note,
  active,
  showPath = true,
  draggable,
  onDragStart,
  onDragEnd,
  onContextMenu,
  onOpen,
}: {
  note: NoteSummary;
  active: boolean;
  showPath?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onContextMenu?: (event: MouseEvent) => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "note-item is-active" : "note-item"}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      onClick={onOpen}
    >
      <span>{note.favorite ? "★ " : ""}{note.title}</span>
      {showPath ? <small>{note.path}</small> : null}
      {note.tags.length ? <small>{note.tags.map((tag) => `#${tag}`).join(" ")}</small> : null}
    </button>
  );
}

function NoteContextMenu({
  state,
  onClose,
  onOpen,
  onDuplicate,
  onToggleFavorite,
  onCopyPath,
  onRename,
  onDelete,
  onMove,
  onReveal,
}: {
  state: { note: NoteSummary; x: number; y: number } | null;
  onClose: () => void;
  onOpen: (note: NoteSummary) => void;
  onDuplicate: (note: NoteSummary) => void;
  onToggleFavorite: (note: NoteSummary) => void;
  onCopyPath: (note: NoteSummary) => void;
  onRename: (note: NoteSummary) => void;
  onDelete: (note: NoteSummary) => void;
  onMove: (note: NoteSummary) => void;
  onReveal: (note: NoteSummary) => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!state) {
      return;
    }

    const closeWhenOutside = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", closeWhenOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", onClose);
    window.addEventListener("scroll", onClose, true);

    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose, state]);

  if (!state) return null;

  const run = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="file-context-menu"
      style={{ left: state.x, top: state.y }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" onClick={() => run(() => onOpen(state.note))}>打开</button>
      <button type="button" onClick={() => run(() => onRename(state.note))}>重命名</button>
      <button type="button" onClick={() => run(() => onDuplicate(state.note))}>创建副本</button>
      <button type="button" onClick={() => run(() => onToggleFavorite(state.note))}>{state.note.favorite ? "取消收藏" : "收藏"}</button>
      <span role="separator" />
      <button type="button" onClick={() => run(() => onMove(state.note))}>移动到...</button>
      <button type="button" onClick={() => run(() => onReveal(state.note))}>在文件管理器中显示</button>
      <button type="button" onClick={() => run(() => onCopyPath(state.note))}>复制路径</button>
      <span role="separator" />
      <button type="button" className="menu-danger" onClick={() => run(() => onDelete(state.note))}>删除</button>
    </div>
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

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="inspector-section">
      <h2>{icon}{title}</h2>
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

const markdownExportPath = (notePath: string, fallbackTitle: string) => {
  const normalized = notePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const withoutNotesPrefix = normalized.replace(/^notes\//, "");
  const withoutHtml = withoutNotesPrefix.replace(/\.html?$/i, "");
  const candidate = withoutHtml.trim() || fallbackTitle.trim() || "untitled";
  const safeParts = candidate
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[\\:*?"<>|]/g, "-").trim() || "untitled");

  return `${safeParts.join("/")}.md`;
};

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
