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
  ShieldCheck,
  Puzzle,
  Star,
  ArrowDownAZ,
  FileUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { AiSettingsPanel } from "./ai/AiPanel";
import { getAiAdapter, loadAiSettings } from "./ai/settings";
import type { NoteSuggestion } from "./editor/OpalineEditor";
import { OpalineEditor } from "./editor/OpalineEditor";
import { GraphView } from "./editor/GraphView";
import { articleFromHtmlDocument, replaceArticleInDocument, titleFromArticleHtml } from "./editor/htmlProfile";
import {
  loadLiveComponentSettings,
  saveLiveComponentSettings,
  type LiveComponentSettings,
} from "./editor/liveComponentSettings";
import {
  loadInstalledPluginsFromCache,
  saveInstalledPluginsToCache,
  type InstalledPlugin,
} from "./editor/pluginRegistry";
import { markdownTitle } from "./editor/markdownImport";
import type { GraphData, ImportedAsset, LinkKind, NewNoteInput, NoteDocument, NoteSummary, SearchResult, WorkspaceState } from "./domain/note";
import leafLogo from "./assets/opaline-leaf-gradient.svg";
import { workspaceAdapter } from "./storage/adapter";
import { WorkspaceMigrationDialog } from "./components/WorkspaceMigrationDialog";
import { useConstrainedMenuPosition } from "./components/useConstrainedMenuPosition";
import { useI18n, type LanguageOption } from "./i18n";

const initialState: WorkspaceState = {
  path: null,
  notes: [],
  activeNote: null,
};

const WORKSPACE_PATH_STORAGE_KEY = "opaline-workspace-path";
const ACTIVE_NOTE_STORAGE_KEY = "opaline-active-note";
const FILE_LINK_SETTINGS_STORAGE_KEY = "opaline-file-link-settings";
type SettingsPanelId = "files" | "plugins" | "ai" | "language";
type FileLinkSettings = {
  defaultOpenFile: "last" | "none";
  newNoteLocation: "vault-root" | "current-folder" | "journal";
};

const defaultFileLinkSettings = (): FileLinkSettings => ({
  defaultOpenFile: "last",
  newNoteLocation: "vault-root",
});

const loadFileLinkSettings = (): FileLinkSettings => {
  if (typeof localStorage === "undefined") return defaultFileLinkSettings();
  try {
    const parsed = JSON.parse(localStorage.getItem(FILE_LINK_SETTINGS_STORAGE_KEY) || "null") as Partial<FileLinkSettings> | null;
    return {
      defaultOpenFile: parsed?.defaultOpenFile === "none" ? "none" : "last",
      newNoteLocation:
        parsed?.newNoteLocation === "current-folder" || parsed?.newNoteLocation === "journal"
          ? parsed.newNoteLocation
          : "vault-root",
    };
  } catch {
    return defaultFileLinkSettings();
  }
};

const saveFileLinkSettings = (settings: FileLinkSettings) => {
  localStorage.setItem(FILE_LINK_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

const loadLastActiveNote = (): { path?: string } | null => {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_NOTE_STORAGE_KEY) || "null") as { path?: string } | null;
  } catch {
    return null;
  }
};

const directoryForNewNote = (settings: FileLinkSettings, activeNote: NoteDocument | null) => {
  if (settings.newNoteLocation === "journal") return "notes/journal";
  if (settings.newNoteLocation === "current-folder" && activeNote?.path.includes("/")) {
    return activeNote.path.split("/").slice(0, -1).join("/") || "notes";
  }
  return "notes";
};

const normalizeInternalNotePath = (value: string) =>
  decodeURIComponent(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^notes\//, "");

type NoteTemplateId = "blank" | "idea" | "project-log" | "reading" | "debugging";
type AppView = "home" | "today" | "note" | "settings" | "graph";
type VaultSortMode = "updated" | "title";
type TodayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type NoteTemplate = {
  id: NoteTemplateId;
  title: string;
  description: string;
  icon: ReactNode;
  defaultTitle: string;
  body: string;
};

const noteTemplates = (t: ReturnType<typeof useI18n>["t"]): NoteTemplate[] => [
  {
    id: "blank",
    title: t("template.blank.title"),
    description: t("template.blank.description"),
    icon: <FilePlus2 size={17} />,
    defaultTitle: t("template.blank.defaultTitle"),
    body: "<p></p>",
  },
  {
    id: "idea",
    title: t("template.idea.title"),
    description: t("template.idea.description"),
    icon: <Lightbulb size={17} />,
    defaultTitle: t("template.idea.defaultTitle"),
    body: t("template.body.idea"),
  },
  {
    id: "project-log",
    title: t("template.projectLog.title"),
    description: t("template.projectLog.description"),
    icon: <CalendarDays size={17} />,
    defaultTitle: t("template.projectLog.defaultTitle"),
    body: t("template.body.projectLog"),
  },
  {
    id: "reading",
    title: t("template.reading.title"),
    description: t("template.reading.description"),
    icon: <BookOpen size={17} />,
    defaultTitle: t("template.reading.defaultTitle"),
    body: t("template.body.reading"),
  },
  {
    id: "debugging",
    title: t("template.debugging.title"),
    description: t("template.debugging.description"),
    icon: <Bug size={17} />,
    defaultTitle: t("template.debugging.defaultTitle"),
    body: t("template.body.debugging"),
  },
];

export function App() {
  const {
    t,
    locale,
    languageOptions,
    communityLanguagePacks,
    setLocale,
    setCommunityLanguagePacks,
  } = useI18n();
  const templates = useMemo(() => noteTemplates(t), [t]);
  const [workspace, setWorkspace] = useState<WorkspaceState>(initialState);
  const [view, setView] = useState<AppView>("home");
  const [articleHtml, setArticleHtml] = useState("");
  const [savedArticleHtml, setSavedArticleHtml] = useState("");
  const [status, setStatus] = useState(() => t("app.status.preparingWorkspace"));
  const [isBusy, setIsBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [backlinks, setBacklinks] = useState<SearchResult[]>([]);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [], brokenLinks: [] });
  const [pendingBlockTarget, setPendingBlockTarget] = useState<{ blockId: string; requestId: number } | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(() => t("template.blank.defaultTitle"));
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
  const [fileLinkSettings, setFileLinkSettings] = useState<FileLinkSettings>(() => loadFileLinkSettings());
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

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!workspace.path || !workspaceAdapter.listLanguagePacks) {
      setCommunityLanguagePacks([]);
      return;
    }

    void workspaceAdapter.listLanguagePacks(workspace.path)
      .then(setCommunityLanguagePacks)
      .catch(() => setCommunityLanguagePacks([]));
  }, [setCommunityLanguagePacks, workspace.path]);

  const activeTitle = useMemo(() => {
    if (view === "home") {
      return "Opaline";
    }
    if (view === "settings") {
      return t("app.title.settings");
    }
    if (view === "today") {
      return t("app.title.today");
    }
    if (view === "graph") {
      return t("app.title.graph");
    }
    if (!workspace.activeNote) {
      return t("app.title.noOpenNote");
    }

    return titleFromArticleHtml(articleHtml, workspace.activeNote.title);
  }, [articleHtml, t, view, workspace.activeNote]);

  const refreshNotes = useCallback(async (path: string) => {
    const notes = await workspaceAdapter.listNotes(path);
    setWorkspace((current) => ({ ...current, path, notes }));
    setGraph(await workspaceAdapter.graphData(path));
    return notes;
  }, []);

  const refreshBacklinks = useCallback(async (path: string, noteId: string) => {
    setBacklinks(await workspaceAdapter.listBacklinks(path, noteId));
  }, []);

  const updateFileLinkSettings = useCallback((patch: Partial<FileLinkSettings>) => {
    setFileLinkSettings((current) => {
      const next = { ...current, ...patch };
      saveFileLinkSettings(next);
      return next;
    });
  }, []);

  const openWorkspacePath = useCallback(
    async (path: string) => {
      await workspaceAdapter.ensureWorkspace(path);
      const notes = await refreshNotes(path);
      localStorage.setItem(WORKSPACE_PATH_STORAGE_KEY, path);
      setWorkspace((current) => ({ ...current, path, notes }));
      setStatus(notes.length > 0 ? t("app.status.workspaceOpened") : t("app.status.workspaceInitialized"));
      if (fileLinkSettings.defaultOpenFile === "last") {
        const last = loadLastActiveNote();
        const lastSummary = last?.path ? notes.find((note) => note.path === last.path) : null;
        if (lastSummary) {
          const note = await workspaceAdapter.readNote(path, lastSummary.path);
          const nextArticleHtml = articleFromHtmlDocument(note.html);
          setWorkspace({ path, notes, activeNote: note });
          setArticleHtml(nextArticleHtml);
          setSavedArticleHtml(nextArticleHtml);
          setView("note");
          await refreshBacklinks(path, note.id);
          setStatus(t("app.status.lastFileOpened"));
        }
      }
      return notes;
    },
    [fileLinkSettings.defaultOpenFile, refreshBacklinks, refreshNotes, t],
  );

  const openWorkspace = useCallback(async () => {
    setIsBusy(true);
    try {
      const path = await workspaceAdapter.chooseWorkspace();
      if (!path) {
        setStatus(t("app.status.workspaceNotSelected"));
        return;
      }

      await openWorkspacePath(path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.openWorkspaceFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [openWorkspacePath, t]);

  const requestCreateNote = useCallback(() => {
    const template = templates[0];
    setDraftTemplate(template.id);
    setDraftTitle(template.defaultTitle);
    setDraftLang("zh-Hans");
    setCreateDialogOpen(true);
  }, [templates]);

  const createNoteFromInput = useCallback(async (input: NewNoteInput, successMessage: string) => {
    const title = input.title.trim();
    if (!title) {
      setStatus(t("app.status.titleRequired"));
      return;
    }

    setIsBusy(true);
    try {
      const path = workspace.path ?? (await workspaceAdapter.defaultWorkspacePath());

      await workspaceAdapter.ensureWorkspace(path);
      const note = await workspaceAdapter.createNote(path, {
        ...input,
        title,
        directory: input.directory ?? directoryForNewNote(fileLinkSettings, workspace.activeNote),
      });
      const notes = await workspaceAdapter.listNotes(path);
      openNoteDocument(path, notes, note);
      await refreshBacklinks(path, note.id);
      setStatus(successMessage);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.createNoteFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [fileLinkSettings, refreshBacklinks, t, workspace.activeNote, workspace.path]);

  const createNote = useCallback(async () => {
    const template = templates.find((item) => item.id === draftTemplate) ?? templates[0];
    setCreateDialogOpen(false);
    await createNoteFromInput(
      {
        title: draftTitle,
        lang: draftLang,
        body: template.body,
      },
      t("app.status.createdTemplate", { title: template.title }),
    );
  }, [createNoteFromInput, draftLang, draftTemplate, draftTitle, t, templates]);

  const createDailyNote = useCallback(async () => {
    setIsBusy(true);
    try {
      const path = workspace.path ?? (await workspaceAdapter.defaultWorkspacePath());

      await workspaceAdapter.ensureWorkspace(path);
      const note = await workspaceAdapter.createDailyNote(path);
      const notes = await workspaceAdapter.listNotes(path);
      openNoteDocument(path, notes, note);
      await refreshBacklinks(path, note.id);
      setStatus(t("app.status.todayOpened"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.createDailyFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [refreshBacklinks, t, workspace.path]);

  const createFolder = useCallback(async () => {
    const raw = window.prompt(t("dialog.folderPromptTitle"), "notes/");
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
      setStatus(t("app.status.folderCreated"));
      setAllFoldersExpanded(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.createFolderFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [refreshNotes, t, workspace.path]);

  const importMarkdown = useCallback(async () => {
    const selected = await open({
      multiple: true,
      directory: false,
      title: t("dialog.chooseMarkdown"),
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
      setStatus(t("app.status.importedNotes", { count: paths.length }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.importFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [refreshNotes, t, workspace.path]);

  const exportNoteMarkdown = useCallback(async (note: NoteSummary) => {
    if (!workspace.path) {
      setStatus(t("app.status.openWorkspaceFirst"));
      return;
    }

    const dir = await open({
      directory: true,
      multiple: false,
      title: t("dialog.exportMarkdownTitle", { title: note.title }),
    });
    if (typeof dir !== "string") return;

    setIsBusy(true);
    setStatus(t("app.status.exporting", { title: note.title }));
    try {
      const { articleHtmlToMarkdown } = await import("./editor/markdownExport");
      const document = await workspaceAdapter.readNote(workspace.path, note.path);
      const articleHtml = articleFromHtmlDocument(document.html);
      const markdown = articleHtmlToMarkdown(articleHtml);
      const filePath = `${dir}/${markdownExportPath(note.path, note.title)}`;
      await workspaceAdapter.writeExportFile!(filePath, markdown);
      setStatus(t("app.status.exportedMarkdown", { title: note.title }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.exportFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [t, workspace.path]);

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
        setStatus(t("app.status.noteOpened"));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : t("app.status.openNoteFailed"));
      } finally {
        setIsBusy(false);
      }
    },
    [refreshBacklinks, t, workspace.notes, workspace.path],
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

  const saveNote = useCallback(async (options: { silent?: boolean; articleHtml?: string } = {}) => {
    if (!workspace.path || !workspace.activeNote) {
      setStatus(t("app.status.noNoteToSave"));
      return;
    }

    const nextArticleHtml = options.articleHtml ?? articleHtml;

    if (nextArticleHtml === savedArticleHtml) {
      if (!options.silent) {
        setStatus(t("app.status.noUnsavedChanges"));
      }
      return;
    }

    setIsSaving(true);
    try {
      const html = replaceArticleInDocument(workspace.activeNote.html, nextArticleHtml, workspace.notes);
      const saved = await workspaceAdapter.saveNote(workspace.path, {
        ...workspace.activeNote,
        title: titleFromArticleHtml(nextArticleHtml, workspace.activeNote.title),
        html,
      });
      const notes = await refreshNotes(workspace.path);
      openNoteDocument(workspace.path, notes, saved);
      await refreshBacklinks(workspace.path, saved.id);
      setStatus(options.silent ? t("app.status.autoSaved", { title: saved.title }) : t("app.status.saved", { title: saved.title }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }, [articleHtml, refreshBacklinks, refreshNotes, savedArticleHtml, t, workspace.activeNote, workspace.notes, workspace.path]);

  const openInternalLink = useCallback(
    async (target: { noteId?: string; notePath?: string; blockId?: string | null; sourceHtml?: string }) => {
      const normalizedTargetPath = target.notePath ? normalizeInternalNotePath(target.notePath) : null;
      const note = workspace.notes.find((item) => {
        if (target.noteId && item.id === target.noteId) return true;
        return normalizedTargetPath !== null && normalizeInternalNotePath(item.path) === normalizedTargetPath;
      });

      if (!note) {
        setStatus(t("app.status.internalLinkMissing"));
        return;
      }

      const sourceHtml = target.sourceHtml ?? articleHtml;
      if (sourceHtml !== savedArticleHtml) {
        await saveNote({ silent: true, articleHtml: sourceHtml });
      }

      if (target.blockId) {
        setPendingBlockTarget({ blockId: target.blockId, requestId: Date.now() });
      }

      await openNote(note);
    },
    [articleHtml, openNote, saveNote, savedArticleHtml, t, workspace.notes],
  );

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
    setStatus(favorite ? t("app.status.favorited") : t("app.status.unfavorited"));
  }, [refreshNotes, t, workspace.activeNote, workspace.path]);

  const toggleNoteFavorite = useCallback(async (note: NoteSummary) => {
    if (!workspace.path) return;
    const favorite = await workspaceAdapter.toggleFavorite(workspace.path, note.id);
    const notes = await refreshNotes(workspace.path);
    setWorkspace((current) => ({
      ...current,
      notes,
      activeNote: current.activeNote?.id === note.id ? { ...current.activeNote, favorite } : current.activeNote,
    }));
    setStatus(favorite ? t("app.status.favorited") : t("app.status.unfavorited"));
  }, [refreshNotes, t, workspace.path]);

  const duplicateNote = useCallback(async (note: NoteSummary) => {
    if (!workspace.path) return;
    setIsBusy(true);
    try {
      const document = await workspaceAdapter.readNote(workspace.path, note.path);
      const directory = note.path.split("/").slice(0, -1).join("/") || "notes";
      const duplicate = await workspaceAdapter.createNote(workspace.path, {
        title: t("context.duplicateTitle", { title: note.title }),
        lang: "zh-Hans",
        directory,
        body: articleFromHtmlDocument(document.html),
      });
      const notes = await workspaceAdapter.listNotes(workspace.path);
      openNoteDocument(workspace.path, notes, duplicate);
      setStatus(t("app.status.duplicated"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.duplicateFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [t, workspace.path]);

  const copyNotePath = useCallback(async (note: NoteSummary) => {
    await navigator.clipboard?.writeText(note.path);
    setStatus(t("app.status.pathCopied"));
  }, [t]);

  const renameNote = useCallback(async (note: NoteSummary) => {
    const newTitle = window.prompt(t("dialog.renameTitle"), note.title)?.trim();
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
      setStatus(t("app.status.renamed"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.renameFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [refreshNotes, t, workspace.activeNote, workspace.path]);

  const deleteNote = useCallback(async (note: NoteSummary) => {
    if (!window.confirm(t("dialog.deleteConfirm", { title: note.title }))) return;
    setIsBusy(true);
    try {
      await workspaceAdapter.deleteNote(workspace.path!, note.id);
      if (workspace.activeNote?.id === note.id) {
        setWorkspace((current) => ({ ...current, activeNote: null }));
        setView("home");
      }
      await refreshNotes(workspace.path!);
      setStatus(t("app.status.deleted"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.deleteFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [refreshNotes, t, workspace.activeNote, workspace.path]);

  const moveNote = useCallback(async (note: NoteSummary) => {
    const dir = window.prompt(t("dialog.movePrompt"), "notes/")?.trim();
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
      setStatus(t("app.status.moved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.moveFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [refreshNotes, t, workspace.activeNote, workspace.path]);

  const revealNoteInExplorer = useCallback(async (note: NoteSummary) => {
    try {
      await workspaceAdapter.revealInExplorer(workspace.path!, note.path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.revealFailed"));
    }
  }, [t, workspace.path]);

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
      setStatus(t("app.status.movedTo", { path: targetDir }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.moveFailed"));
    } finally {
      setIsBusy(false);
    }
  }, [refreshNotes, t, workspace.activeNote, workspace.path]);

  const importAsset = useCallback(
    async (kind: "image" | "file"): Promise<ImportedAsset | null> => {
      if (!workspace.path) {
        setStatus(t("app.status.workspacePreparing"));
        return null;
      }

      const selected = await open({
        multiple: false,
        directory: false,
        title: kind === "image" ? t("dialog.chooseImage") : t("dialog.chooseAttachment"),
      });

      if (typeof selected !== "string") {
        return null;
      }

      return workspaceAdapter.importAsset(workspace.path, { sourcePath: selected, kind });
    },
    [t, workspace.path],
  );

  const searchNoteSuggestions = useCallback(async (queryText: string): Promise<NoteSuggestion[]> => {
    if (!workspace.path) return [];
    const trimmed = queryText.trim();
    const results = trimmed
      ? await workspaceAdapter.searchNotes(workspace.path, trimmed)
      : workspace.notes.slice(0, 8).map((note) => ({
          id: note.id,
          title: note.title,
          path: note.path,
          excerpt: note.headings.slice(0, 3).join(" · ") || note.tags.map((tag) => `#${tag}`).join(" ") || t("empty.recent"),
          updatedAt: note.updatedAt,
        }));

    return results
      .filter((result) => result.id !== workspace.activeNote?.id)
      .slice(0, 10)
      .map((result) => ({
        id: result.id,
        title: result.title,
        path: result.path,
        excerpt: result.excerpt,
      }));
  }, [t, workspace.activeNote?.id, workspace.notes, workspace.path]);

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
        setStatus(error instanceof Error ? error.message : t("app.status.initWorkspaceFailed"));
      }
    })();
  }, [didLoadDefaultWorkspace, openWorkspacePath, t]);

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
      setStatus(t("app.status.writeSomethingFirst"));
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
      const withUserEntry = appendDailyEntry(articleFromHtmlDocument(dailyNote.html), userMessage, locale, t);
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
          content: t("today.aiNotConfigured"),
          createdAt: new Date().toISOString(),
        };
        setTodayMessages((current) => [...current, assistantMessage]);
        setStatus(t("app.status.todaySavedNoAi"));
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
              t("today.systemPrompt"),
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

      const withAssistantEntry = appendDailyEntry(articleFromHtmlDocument(dailyNote.html), assistantMessage, locale, t);
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
      setStatus(t("app.status.todaySavedWithAi"));
    } catch (error) {
      const assistantMessage: TodayMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: error instanceof Error ? error.message : t("today.recordOrAiFailed"),
        createdAt: new Date().toISOString(),
      };
      setTodayMessages((current) => [...current, assistantMessage]);
      setStatus(error instanceof Error ? error.message : t("app.status.recordFailed"));
    } finally {
      setIsTodayBusy(false);
    }
  }, [locale, refreshNotes, t, todayMessages, todayText, workspace.path]);

  const openNoteDocument = (path: string, notes: NoteSummary[], note: NoteDocument) => {
    const nextArticleHtml = articleFromHtmlDocument(note.html);
    localStorage.setItem(ACTIVE_NOTE_STORAGE_KEY, JSON.stringify({ id: note.id, path: note.path, title: note.title }));
    setWorkspace({ path, notes, activeNote: note });
    setArticleHtml(nextArticleHtml);
    setSavedArticleHtml(nextArticleHtml);
    setView("note");
  };

  return (
    <main
      className={`app-shell ${view === "home" ? "is-home-mode" : ""} ${(view === "note" || view === "graph" || view === "settings") ? "is-note-mode" : ""} ${leftPanelCollapsed ? "is-left-collapsed" : ""} ${rightPanelCollapsed ? "is-right-collapsed" : ""}`}
    >
      {(view === "note" || view === "graph" || view === "settings") ? (
        <NoteRibbon
          leftCollapsed={leftPanelCollapsed}
          onHome={() => setView("home")}
          onNotes={() => setView("note")}
          onToggleLeft={() => setLeftPanelCollapsed((value) => !value)}
          onGraph={() => setView("graph")}
          onSettings={() => setView("settings")}
          onImport={importMarkdown}
        />
      ) : null}
      {view === "home" || ((view === "note" || view === "graph" || view === "settings") && leftPanelCollapsed) ? null : (
      <aside className={`sidebar ${(view === "note" || view === "graph" || view === "settings") ? "is-vault-sidebar" : ""}`}>
        {(view === "note" || view === "graph" || view === "settings") ? null : (
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <img src={leafLogo} alt="" />
          </span>
          <div>
            <strong>Opaline</strong>
            <span>{t("app.brand.subtitle")}</span>
          </div>
        </div>
        )}

        <div className="sidebar-actions">
          {(view === "note" || view === "graph" || view === "settings") ? null : (
            <button type="button" onClick={() => setView("home")} disabled={isBusy} data-tooltip={t("action.home")} aria-label={t("action.home")}>
              <Home size={17} />
              <span>{t("action.home")}</span>
            </button>
          )}
          <button type="button" onClick={openWorkspace} disabled={isBusy} data-tooltip={t("action.open")} aria-label={t("action.open")}>
            <FolderOpen size={17} />
            <span>{t("action.open")}</span>
          </button>
          <button type="button" onClick={requestCreateNote} disabled={isBusy} data-tooltip={t("action.create")} aria-label={t("action.create")}>
            <FilePlus2 size={17} />
            <span>{t("action.create")}</span>
          </button>
          {(view !== "note" && view !== "graph" && view !== "settings") ? (
            <button type="button" onClick={importMarkdown} disabled={isBusy} data-tooltip={t("action.import")} aria-label={t("action.import")}>
              <FileUp size={17} />
              <span>{t("action.import")}</span>
            </button>
          ) : null}
          {(view === "note" || view === "graph" || view === "settings") ? (
            <>
              <button type="button" onClick={createFolder} disabled={isBusy} data-tooltip={t("action.createFolder")} aria-label={t("action.createFolder")}>
                <FolderPlus size={17} />
                <span>{t("action.createFolder")}</span>
              </button>
              <button type="button" onClick={() => setAllFoldersExpanded((value) => !value)} disabled={isBusy} data-tooltip={allFoldersExpanded ? t("action.collapseFolders") : t("action.expandFolders")} aria-label={allFoldersExpanded ? t("action.collapseFolders") : t("action.expandFolders")}>
                <ChevronsDown size={17} />
                <span>{allFoldersExpanded ? t("action.collapseFolders") : t("action.expandFolders")}</span>
              </button>
              <button type="button" onClick={cycleVaultSort} disabled={isBusy} data-tooltip={vaultSortMode === "updated" ? t("action.sortByTime") : t("action.sortByTitle")} aria-label={vaultSortMode === "updated" ? t("action.sortByTime") : t("action.sortByTitle")}>
                <ArrowDownAZ size={17} />
                <span>{vaultSortMode === "updated" ? t("action.sortByTime") : t("action.sortByTitle")}</span>
              </button>
            </>
          ) : (
            <button type="button" onClick={createDailyNote} disabled={isBusy} data-tooltip={t("action.daily")} aria-label={t("action.daily")}>
              <CalendarDays size={17} />
              <span>{t("action.daily")}</span>
            </button>
          )}
          {workspace.path ? (
            <button type="button" onClick={() => refreshNotes(workspace.path as string)} disabled={isBusy} data-tooltip={t("action.refresh")} aria-label={t("action.refresh")}>
              <RefreshCw size={17} />
              <span>{t("action.refresh")}</span>
            </button>
          ) : null}
        </div>

        <div className="workspace-path" title={workspace.path ?? undefined}>
          {workspace.path ?? t("common.noWorkspace")}
        </div>

        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search.placeholder")} />
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

        {(view === "note" || view === "graph" || view === "settings") ? (
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
          <nav className="note-list" aria-label={t("nav.notes")}>
            {workspace.notes.length === 0 ? (
              <p className="empty-state">{t("common.emptyNotes")}</p>
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

      </aside>
      )}

      <section className="main-pane">
        {view === "home" ? null : (
          <header className="topbar">
            <div>
              <h1>{activeTitle}</h1>
              {view !== "note" || isDirty || currentTags.length ? (
                <p>
                  {view === "note" ? null : status}
                  {isDirty ? <span className="dirty-dot">{t("common.unsaved")}</span> : null}
                  {currentTags.map((tag) => (
                    <span key={tag} className="tag-pill">#{tag}</span>
                  ))}
                </p>
              ) : null}
            </div>
            {view === "note" ? (
              <div className="topbar-actions">
                {workspace.activeNote ? (
                  <button className="favorite-button" type="button" onClick={toggleFavorite} aria-label={t("app.status.favorited")}>
                    <Star size={18} fill={workspace.activeNote.favorite ? "currentColor" : "none"} />
                  </button>
                ) : null}
                <button
                  className="right-panel-toggle"
                  type="button"
                  data-tooltip={rightPanelCollapsed ? t("action.expandFolders") : t("action.collapseFolders")}
                  onClick={() => setRightPanelCollapsed((value) => !value)}
                  aria-label={rightPanelCollapsed ? t("action.expandFolders") : t("action.collapseFolders")}
                >
                  {rightPanelCollapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                </button>
              </div>
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
            fileLinkSettings={fileLinkSettings}
            locale={locale}
            languageOptions={languageOptions}
            communityLanguagePacks={communityLanguagePacks}
            onLocaleChange={setLocale}
            onLanguagePacksChange={setCommunityLanguagePacks}
            onFileLinkSettingsChange={updateFileLinkSettings}
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
              currentNote={workspace.activeNote}
              linkableNotes={workspace.notes}
              scrollToBlockTarget={pendingBlockTarget}
              onChange={setArticleHtml}
              onSave={(html) => saveNote({ articleHtml: html })}
              onImportAsset={importAsset}
              onSearchNotes={searchNoteSuggestions}
              onOpenInternalLink={openInternalLink}
            />
            <aside className="inspector">
              <Section title={t("panel.outline")} icon={<FileText size={16} />}>
                {workspace.activeNote.headings.length ? (
                  workspace.activeNote.headings.map((heading) => <p key={heading}>{heading}</p>)
                ) : (
                  <p className="muted">{t("panel.noHeadings")}</p>
                )}
              </Section>
              <Section title={t("panel.outgoing")} icon={<Link2 size={16} />}>
                {workspace.activeNote.outgoingLinks.length ? (
                  workspace.activeNote.outgoingLinks.map((link) => {
                    const target = link.targetId ? workspace.notes.find((note) => note.id === link.targetId) : null;
                    return (
                      <button
                        key={`${link.href}-${link.label}`}
                        className={`inspector-link relation-link ${link.isBroken ? "is-broken" : ""}`}
                        type="button"
                        disabled={!target}
                        onClick={() => {
                          if (target) void openNote(target);
                        }}
                      >
                        <span className={`relation-kind is-${link.kind ?? "note"}`}>
                          {t(`relation.${(link.kind ?? "note") as LinkKind}`)}
                        </span>
                        <span>{link.label || link.href}</span>
                        {link.targetHeading ? <small>{link.targetHeading}</small> : null}
                        {link.targetBlockId ? <small>#{link.targetBlockId}</small> : null}
                        {link.concept ? <small>#{link.concept}</small> : null}
                      </button>
                    );
                  })
                ) : (
                  <p className="muted">{t("panel.noOutgoing")}</p>
                )}
              </Section>
              <Section title={t("panel.backlinks")} icon={<Clock3 size={16} />}>
                {backlinks.length ? (
                  backlinks.map((link) => (
                    <button key={link.id} className="inspector-link" type="button" onClick={() => openSearchResult(link)}>
                      {link.title}
                    </button>
                  ))
                ) : (
                  <p className="muted">{t("panel.noBacklinks")}</p>
                )}
              </Section>
              <Section title={t("panel.localGraph")} icon={<Network size={16} />}>
                <GraphPreview
                  graph={graph}
                  activeNoteId={workspace.activeNote.id}
                  onOpenNode={(nodeId) => {
                    const note = workspace.notes.find((item) => item.id === nodeId);
                    if (note) void openNote(note);
                  }}
                />
                {workspace.activeNote.outgoingLinks.filter((link) => link.isBroken).length ? (
                  <p className="is-broken">
                    {t("panel.brokenLinks", { count: workspace.activeNote.outgoingLinks.filter((link) => link.isBroken).length })}
                  </p>
                ) : null}
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
        templates={templates}
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
        onExportMarkdown={(note) => void exportNoteMarkdown(note)}
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
  const { t } = useI18n();
  return (
    <section className="entry-choice" aria-label={t("home.serious")}>
      <button type="button" className="entry-choice-card" onClick={onSerious}>
        <NotebookPen size={82} strokeWidth={1.7} />
        <span>{t("home.serious")}</span>
      </button>
      <button type="button" className="entry-choice-card" onClick={onCasual}>
        <MessageCircle size={82} strokeWidth={1.7} />
        <span>{t("home.casual")}</span>
      </button>
    </section>
  );
}

function NoteRibbon({
  leftCollapsed,
  onHome,
  onNotes,
  onToggleLeft,
  onGraph,
  onSettings,
  onImport,
}: {
  leftCollapsed: boolean;
  onHome: () => void;
  onNotes: () => void;
  onToggleLeft: () => void;
  onGraph: () => void;
  onSettings: () => void;
  onImport: () => void;
}) {
  const { t } = useI18n();
  return (
    <nav className="note-ribbon" aria-label={t("nav.workspace")}>
      <button type="button" onClick={onToggleLeft} data-tooltip={leftCollapsed ? t("action.expandFolders") : t("action.collapseFolders")} aria-label={leftCollapsed ? t("action.expandFolders") : t("action.collapseFolders")}>
        {leftCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
      <button type="button" onClick={onHome} data-tooltip={t("nav.backHome")} aria-label={t("nav.backHome")}>
        <Home size={18} />
      </button>
      <button type="button" onClick={onNotes} data-tooltip={t("nav.notes")} aria-label={t("nav.notes")}>
        <BookOpen size={18} />
      </button>
      <button type="button" onClick={onImport} data-tooltip={t("action.import")} aria-label={t("action.import")}>
        <FileUp size={18} />
      </button>
      <button type="button" onClick={onGraph} data-tooltip={t("nav.graph")} aria-label={t("nav.graph")}>
        <Network size={18} />
      </button>
      <button type="button" className="ribbon-bottom" onClick={onSettings} data-tooltip={t("nav.settings")} aria-label={t("nav.settings")}>
        <Settings size={18} />
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
  const { t } = useI18n();
  return (
    <section className="serious-empty">
      <div className="serious-empty-actions" aria-label={t("home.serious")}>
        <button type="button" onClick={onCreate} disabled={busy}>
          <FilePlus2 size={24} />
          <span>{t("action.create")}</span>
        </button>
        <button type="button" onClick={onDaily} disabled={busy}>
          <CalendarDays size={24} />
          <span>{t("action.daily")}</span>
        </button>
      </div>

      <section className="serious-start-panel">
        <div className="vault-section-title">
          <Clock3 size={15} />
          <span>{t("empty.recent")}</span>
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
          <p className="empty-state">{t("empty.startSerious")}</p>
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
  const { t } = useI18n();
  const activeNode = graph.nodes.find((node) => node.id === activeNoteId);
  const neighborhoodEdges = graph.edges.filter((edge) => edge.source === activeNoteId || edge.target === activeNoteId);
  const neighborhoodIds = new Set<string>([activeNoteId]);
  for (const edge of neighborhoodEdges) {
    neighborhoodIds.add(edge.source);
    neighborhoodIds.add(edge.target);
  }
  const nodes = graph.nodes
    .filter((node) => neighborhoodIds.has(node.id))
    .sort((a, b) => Number(b.id === activeNoteId) - Number(a.id === activeNoteId))
    .slice(0, 20);
  const width = 260;
  const height = 200;
  const centerX = width / 2;
  const centerY = height / 2;
  const neighborNodes = nodes.filter((node) => node.id !== activeNoteId);
  const radius = Math.max(60, neighborNodes.length <= 1 ? 0 : Math.min(80, neighborNodes.length * 10));
  const positions = new Map(
    nodes.map((node, index) => {
      if (node.id === activeNoteId) {
        return [node.id, { x: centerX, y: centerY }] as const;
      }
      const neighborIndex = Math.max(0, index - 1);
      const angle = neighborNodes.length <= 1 ? -Math.PI / 2 : (Math.PI * 2 * neighborIndex) / neighborNodes.length - Math.PI / 2;
      return [
        node.id,
        {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        },
      ] as const;
    }),
  );
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = neighborhoodEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)).slice(0, 36);

  if (!activeNode) {
    return <p className="muted">{t("graph.previewEmpty")}</p>;
  }

  return (
    <div className="graph-preview">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("nav.graph")}>
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
              className={`is-${edge.kind ?? "note"}`}
            />
          );
        })}
        {nodes.map((node) => {
          const position = positions.get(node.id);
          if (!position) return null;
          const active = node.id === activeNoteId;
          return (
            <g
              key={node.id}
              className={`${active ? "is-active" : ""} ${node.kind === "concept" ? "is-concept" : ""}`}
              onClick={() => {
                if (node.kind !== "concept") onOpenNode(node.id);
              }}
            >
              <circle cx={position.x} cy={position.y} r={active ? 9 : 6} />
              <title>{node.title}</title>
            </g>
          );
        })}
      </svg>
      <p>
        {edges.length
          ? t("graph.previewStats", { nodes: nodes.length - 1, edges: edges.length })
          : t("graph.previewNoRelations")}
      </p>
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
  const { t, locale } = useI18n();
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [draggingNote, setDraggingNote] = useState<NoteSummary | null>(null);

  const sortedNotes = [...notes].sort((a, b) => {
    if (sortMode === "title") {
      return a.title.localeCompare(b.title, locale);
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
            <span>{t("app.status.favorited")}</span>
          </div>
          <nav className="note-list is-compact" aria-label={t("app.status.favorited")}>
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
          <span>{t("settings.filesLinks")}</span>
          <small>{sortMode === "updated" ? t("action.sortByTime") : t("action.sortByTitle")}</small>
        </div>
        <nav className="note-list vault-tree" aria-label={t("nav.notes")}>
          {notes.length === 0 ? (
            <p className="empty-state">{t("common.emptyNotes")}</p>
          ) : (
            grouped.map((group) => (
              <section key={group.directory} className={`vault-folder ${dragOverFolder === group.directory ? "is-drag-over" : ""}`}>
                <div className="vault-folder-title" {...makeFolderDropHandlers(group.directory)}>
                  <ChevronRight size={14} className={expanded ? "is-expanded" : undefined} />
                  <span>{group.directory.replace(/^notes\/?/, "") || t("settings.vaultRoot")}</span>
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
  const { t, locale } = useI18n();
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
  onExportMarkdown,
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
  onExportMarkdown: (note: NoteSummary) => void;
  onRename: (note: NoteSummary) => void;
  onDelete: (note: NoteSummary) => void;
  onMove: (note: NoteSummary) => void;
  onReveal: (note: NoteSummary) => void;
}) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuStyle = useConstrainedMenuPosition(state, menuRef);

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
      style={menuStyle}
      role="menu"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" onClick={() => run(() => onOpen(state.note))}>{t("action.open")}</button>
      <button type="button" onClick={() => run(() => onRename(state.note))}>{t("context.rename")}</button>
      <button type="button" onClick={() => run(() => onDuplicate(state.note))}>{t("context.duplicate")}</button>
      <button type="button" onClick={() => run(() => onToggleFavorite(state.note))}>{state.note.favorite ? t("app.status.unfavorited") : t("app.status.favorited")}</button>
      <span role="separator" />
      <button type="button" onClick={() => run(() => onMove(state.note))}>{t("context.moveTo")}</button>
      <button type="button" onClick={() => run(() => onReveal(state.note))}>{t("context.reveal")}</button>
      <button type="button" onClick={() => run(() => onCopyPath(state.note))}>{t("context.copyPath")}</button>
      <button type="button" onClick={() => run(() => onExportMarkdown(state.note))}>{t("context.exportMarkdown")}</button>
      <span role="separator" />
      <button type="button" className="menu-danger" onClick={() => run(() => onDelete(state.note))}>{t("context.delete")}</button>
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
  const { t, locale } = useI18n();
  return (
    <section className="today-home">
      <div className="today-chat">
        <section className="today-thread" aria-label={t("app.title.today")}>
          {messages.map((message) => (
            <article key={message.id} className={`today-message is-${message.role}`}>
              <div>
                <strong>{message.role === "user" ? t("common.me") : t("common.ai")}</strong>
                <span>{formatTime(message.createdAt, locale)}</span>
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
          aria-label={t("app.title.today")}
        />
        <div className="today-composer-actions">
          <button type="button" onClick={onSubmit} disabled={busy || !text.trim()}>
            {busy ? <Bot size={17} className="spinner" /> : <Send size={17} />}
            <span>{busy ? t("action.processing") : t("action.send")}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function SettingsView({
  workspacePath,
  fileLinkSettings,
  locale,
  languageOptions,
  communityLanguagePacks,
  onLocaleChange,
  onLanguagePacksChange,
  onFileLinkSettingsChange,
  onChangeWorkspace,
}: {
  workspacePath: string | null;
  fileLinkSettings: FileLinkSettings;
  locale: string;
  languageOptions: LanguageOption[];
  communityLanguagePacks: ReturnType<typeof useI18n>["communityLanguagePacks"];
  onLocaleChange: (locale: string) => void;
  onLanguagePacksChange: ReturnType<typeof useI18n>["setCommunityLanguagePacks"];
  onFileLinkSettingsChange: (patch: Partial<FileLinkSettings>) => void;
  onChangeWorkspace: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [activePanel, setActivePanel] = useState<SettingsPanelId>("files");

  return (
    <section className="settings-view settings-panel-view">
      <aside className="settings-sidebar" aria-label={t("settings.options")}>
        <strong>{t("settings.options")}</strong>
        <button type="button" className={activePanel === "files" ? "is-active" : ""} onClick={() => setActivePanel("files")}>
          <FolderOpen size={17} />{t("settings.filesLinks")}
        </button>
        <button type="button" className={activePanel === "language" ? "is-active" : ""} onClick={() => setActivePanel("language")}>
          <MessageCircle size={17} />{t("settings.language")}
        </button>
        <button type="button" className={activePanel === "plugins" ? "is-active" : ""} onClick={() => setActivePanel("plugins")}>
          <Puzzle size={17} />{t("settings.plugins")}
        </button>
        <button type="button" className={activePanel === "ai" ? "is-active" : ""} onClick={() => setActivePanel("ai")}>
          <Bot size={17} />{t("settings.ai")}
        </button>
      </aside>
      <div className="settings-main-panel">
        {activePanel === "files" ? (
          <FileLinksSettingsPanel
            workspacePath={workspacePath}
            settings={fileLinkSettings}
            onChange={onFileLinkSettingsChange}
            onChangeWorkspace={onChangeWorkspace}
          />
        ) : activePanel === "language" ? (
          <LanguageSettingsPanel
            workspacePath={workspacePath}
            locale={locale}
            languageOptions={languageOptions}
            communityLanguagePacks={communityLanguagePacks}
            onLocaleChange={onLocaleChange}
            onLanguagePacksChange={onLanguagePacksChange}
          />
        ) : activePanel === "plugins" ? (
          <LiveComponentsSettingsPanel workspacePath={workspacePath} />
        ) : (
          <AiSettingsPanel />
        )}
      </div>
    </section>
  );
}

function FileLinksSettingsPanel({
  workspacePath,
  settings,
  onChange,
  onChangeWorkspace,
}: {
  workspacePath: string | null;
  settings: FileLinkSettings;
  onChange: (patch: Partial<FileLinkSettings>) => void;
  onChangeWorkspace: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <section className="settings-row-list">
      <SettingsSelectRow
        title={t("settings.defaultOpenFile")}
        description={t("settings.defaultOpenFileDesc")}
        value={settings.defaultOpenFile}
        onChange={(value) => onChange({ defaultOpenFile: value as FileLinkSettings["defaultOpenFile"] })}
        options={[
          { value: "last", label: t("settings.lastOpenFile") },
          { value: "none", label: t("settings.noAutoOpen") },
        ]}
      />
      <SettingsSelectRow
        title={t("settings.newNoteLocation")}
        description={t("settings.newNoteLocationDesc")}
        value={settings.newNoteLocation}
        onChange={(value) => onChange({ newNoteLocation: value as FileLinkSettings["newNoteLocation"] })}
        options={[
          { value: "vault-root", label: t("settings.vaultRoot") },
          { value: "current-folder", label: t("settings.currentFolder") },
          { value: "journal", label: t("settings.journalFolder") },
        ]}
      />
      <div className="settings-choice-row">
        <div>
          <strong>{t("settings.attachmentLocation")}</strong>
          <small>{t("settings.attachmentLocationDesc")}</small>
        </div>
        <select value="assets" disabled>
          <option value="assets">{t("settings.assetsFolder")}</option>
        </select>
      </div>
      <div className="settings-choice-row">
        <div>
          <strong>{t("settings.currentWorkspace")}</strong>
          <small>{workspacePath ?? t("app.status.preparingWorkspace")}</small>
        </div>
        <button type="button" className="secondary-action-button" onClick={onChangeWorkspace}>
          {t("action.change")}
        </button>
      </div>
    </section>
  );
}

function SettingsSelectRow({
  title,
  description,
  value,
  options,
  onChange,
}: {
  title: string;
  description: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="settings-choice-row">
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function LanguageSettingsPanel({
  workspacePath,
  locale,
  languageOptions,
  communityLanguagePacks,
  onLocaleChange,
  onLanguagePacksChange,
}: {
  workspacePath: string | null;
  locale: string;
  languageOptions: LanguageOption[];
  communityLanguagePacks: ReturnType<typeof useI18n>["communityLanguagePacks"];
  onLocaleChange: (locale: string) => void;
  onLanguagePacksChange: ReturnType<typeof useI18n>["setCommunityLanguagePacks"];
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState("");

  const refreshLanguagePacks = useCallback(async () => {
    if (!workspacePath || !workspaceAdapter.listLanguagePacks) {
      onLanguagePacksChange([]);
      setStatus(t("settings.workspaceNotReady"));
      return;
    }

    try {
      const packs = await workspaceAdapter.listLanguagePacks(workspacePath);
      onLanguagePacksChange(packs);
      setStatus(packs.length ? t("settings.languagePackStatusRefreshed", { count: packs.length }) : t("settings.languagePackStatusEmpty"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("settings.languagePackReadFailed"));
    }
  }, [onLanguagePacksChange, t, workspacePath]);

  const openLanguagePacksFolder = useCallback(async () => {
    if (!workspacePath) {
      setStatus(t("settings.workspaceNotReady"));
      return;
    }
    if (!workspaceAdapter.openLanguagePacksFolder) {
      setStatus(t("settings.cannotOpenLanguageFolder"));
      return;
    }

    try {
      await workspaceAdapter.openLanguagePacksFolder(workspacePath);
      setStatus(t("settings.languagePackOpened"));
      await refreshLanguagePacks();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("settings.languagePackOpenFailed"));
    }
  }, [refreshLanguagePacks, t, workspacePath]);

  return (
    <section className="settings-row-list">
      <SettingsSelectRow
        title={t("settings.interfaceLanguage")}
        description={t("settings.interfaceLanguageDesc")}
        value={locale}
        onChange={onLocaleChange}
        options={languageOptions.map((option) => ({
          value: option.locale,
          label: `${option.nativeName} (${option.source === "builtin" ? t("settings.builtinLanguage") : t("settings.communityLanguage")})`,
        }))}
      />
      <div className="settings-choice-row">
        <div>
          <strong>{t("settings.communityPacks")}</strong>
          <small>{t("settings.communityPacksDesc")}</small>
        </div>
        <div className="installed-plugins-actions">
          <button type="button" title={t("action.refresh")} onClick={() => void refreshLanguagePacks()}>
            <RefreshCw size={16} />
          </button>
          <button type="button" title={t("action.openFolder")} onClick={openLanguagePacksFolder}>
            <FolderOpen size={16} />
          </button>
        </div>
      </div>
      {status ? <p className="plugin-status-text">{status}</p> : null}
      <div className="plugin-market-card">
        <p className="plugin-status-text">
          {communityLanguagePacks.length
            ? t("settings.installedLanguagePacks", { count: communityLanguagePacks.length })
            : t("settings.noLanguagePacks")}
        </p>
        {communityLanguagePacks.map((pack) => (
          <div className="plugin-example-row" key={pack.manifest.id}>
            <div>
              <strong>{pack.manifest.nativeName}</strong>
              <small>{pack.manifest.name} · {pack.manifest.locale}</small>
              <code>{pack.manifest.id}</code>
            </div>
            <span>{pack.manifest.version}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function LiveComponentsSettingsPanel({ workspacePath }: { workspacePath: string | null }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<LiveComponentSettings>(() => loadLiveComponentSettings());
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>(() => loadInstalledPluginsFromCache());
  const [pluginStatus, setPluginStatus] = useState("");

  const updateSettings = useCallback((patch: Partial<LiveComponentSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveLiveComponentSettings(next);
      return next;
    });
  }, []);

  const refreshInstalledPlugins = useCallback(async () => {
    if (!workspacePath || !workspaceAdapter.listInstalledPlugins) {
      setInstalledPlugins([]);
      saveInstalledPluginsToCache([]);
      return;
    }

    const plugins = await workspaceAdapter.listInstalledPlugins(workspacePath);
    setInstalledPlugins(plugins);
    setPluginStatus(plugins.length ? t("plugin.statusRefreshed", { count: plugins.length }) : "");
  }, [t, workspacePath]);

  useEffect(() => {
    void refreshInstalledPlugins().catch((error) => {
      setPluginStatus(error instanceof Error ? error.message : t("plugin.readFailed"));
    });
  }, [refreshInstalledPlugins]);

  const openPluginsFolder = useCallback(async () => {
    if (!workspacePath) {
      setPluginStatus(t("plugin.workspaceNotReady"));
      return;
    }
    if (!workspaceAdapter.openPluginsFolder) {
      setPluginStatus(t("plugin.cannotOpenFolder"));
      return;
    }

    try {
      await workspaceAdapter.openPluginsFolder(workspacePath);
      setPluginStatus(t("plugin.openedFolder"));
      await refreshInstalledPlugins();
    } catch (error) {
      setPluginStatus(error instanceof Error ? error.message : t("plugin.openFolderFailed"));
    }
  }, [refreshInstalledPlugins, t, workspacePath]);

  return (
    <section className="plugin-settings-content">
      <div className="plugin-policy-list is-obsidian-like">
        <PluginPolicyRow
          icon={<ShieldCheck size={17} />}
          title={t("plugin.safeMode")}
          description={settings.trustedPluginWidgetsEnabled ? t("plugin.safeModeOffDesc") : t("plugin.safeModeOnDesc")}
          enabled={settings.trustedPluginWidgetsEnabled}
          onToggle={() => updateSettings({ trustedPluginWidgetsEnabled: !settings.trustedPluginWidgetsEnabled })}
          buttonLabel={settings.trustedPluginWidgetsEnabled ? t("plugin.turnOff") : t("plugin.turnOn")}
        />
        <div className="plugin-policy-row">
          <div className="plugin-policy-icon"><Puzzle size={17} /></div>
          <div>
            <strong>{t("plugin.market")}</strong>
            <small>{t("plugin.marketDesc")}</small>
          </div>
          <button type="button" className="secondary-action-button is-purple" disabled>{t("action.browse")}</button>
        </div>
        <div className="plugin-policy-row">
          <div className="plugin-policy-icon"><FolderOpen size={17} /></div>
          <div>
            <strong>{t("plugin.installStatus")}</strong>
            <small>{t("plugin.installedCount", { count: installedPlugins.length })}</small>
          </div>
        </div>
        <PluginPolicyRow
          title={t("plugin.autoUpdate")}
          description={t("plugin.autoUpdateDesc")}
          enabled={settings.autoCheckPluginUpdates}
          onToggle={() => updateSettings({ autoCheckPluginUpdates: !settings.autoCheckPluginUpdates })}
        />
      </div>

      <div className="plugin-market-card">
        <div className="installed-plugins-header">
          <h3>{t("plugin.installed")}</h3>
          <div className="installed-plugins-actions">
            <button type="button" title={t("plugin.refreshTitle")} onClick={() => void refreshInstalledPlugins()}>
              <RefreshCw size={16} />
            </button>
            <button type="button" title={t("plugin.openFolderTitle")} onClick={openPluginsFolder}>
              <FolderOpen size={16} />
            </button>
          </div>
        </div>
        {pluginStatus ? <p className="plugin-status-text">{pluginStatus}</p> : null}
        {installedPlugins.length > 0 ? (
          installedPlugins.map((plugin) => (
            <div className="plugin-example-row" key={plugin.id}>
              <div>
                <strong>{plugin.name}</strong>
                <small>{plugin.description || plugin.id}</small>
                <code>{plugin.widgets.length ? plugin.widgets.map((widget) => widget.type).join(" / ") : t("plugin.noWidget")}</code>
              </div>
              <span>{plugin.version}</span>
            </div>
          ))
        ) : null}
      </div>
    </section>
  );
}

function PluginPolicyRow({
  icon,
  title,
  description,
  enabled,
  onToggle,
  buttonLabel,
  danger = false,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  buttonLabel?: string;
  danger?: boolean;
}) {
  return (
    <div className={danger ? "plugin-policy-row is-danger" : "plugin-policy-row"}>
      <div className="plugin-policy-icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      {buttonLabel ? (
        <button type="button" className="secondary-action-button" onClick={onToggle}>{buttonLabel}</button>
      ) : (
        <button type="button" className={enabled ? "switch-button is-on" : "switch-button"} onClick={onToggle} aria-pressed={enabled}>
          <span />
        </button>
      )}
    </div>
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
  templates: NoteTemplate[];
  busy: boolean;
  onTitleChange: (value: string) => void;
  onLangChange: (value: string) => void;
  onTemplateChange: (template: NoteTemplate) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
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
            <h2 id="create-note-title">{t("create.title")}</h2>
            <p>{t("create.description")}</p>
          </div>
        </div>

        <label className="dialog-field">
          <span>{t("create.noteTitle")}</span>
          <input autoFocus value={title} onChange={(event) => onTitleChange(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit();
            if (event.key === "Escape") onCancel();
          }} />
        </label>

        <div className="template-picker" role="listbox" aria-label={t("create.templateAria")}>
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
          <span>{t("create.language")}</span>
          <select value={lang} onChange={(event) => onLangChange(event.target.value)}>
            <option value="zh-Hans">简体中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
          </select>
        </label>

        <div className="dialog-actions">
          <button type="button" className="dialog-secondary" onClick={onCancel}>
            {t("action.cancel")}
          </button>
          <button type="button" className="dialog-primary" onClick={onSubmit} disabled={busy || !title.trim()}>
            {t("create.submit")}
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

const appendDailyEntry = (
  articleHtml: string,
  message: TodayMessage,
  locale: string,
  t: ReturnType<typeof useI18n>["t"],
) => {
  const document = new DOMParser().parseFromString(`<article>${articleHtml}</article>`, "text/html");
  const article = document.body.firstElementChild ?? document.createElement("article");
  let log = article.querySelector<HTMLElement>("[data-opaline-daily-log]");

  if (!log) {
    log = document.createElement("section");
    log.setAttribute("data-opaline-daily-log", "");
    const heading = document.createElement("h2");
    heading.textContent = t("today.dailyLog");
    log.append(heading);
    article.append(log);
  }

  const entry = document.createElement("section");
  entry.setAttribute("data-opaline-entry", message.role);
  const meta = document.createElement("p");
  meta.setAttribute("data-opaline-entry-meta", "");
  meta.textContent = `${message.role === "user" ? t("common.me") : t("common.ai")} · ${formatTime(message.createdAt, locale)}`;
  const content = document.createElement("div");
  content.setAttribute("data-opaline-entry-content", "");
  content.innerHTML = paragraphsFromPlainText(message.content);
  entry.append(meta, content);
  log.append(entry);

  return article.innerHTML;
};

const formatTime = (iso: string, locale = "zh-CN") =>
  new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
