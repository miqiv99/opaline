import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AlertCircle,
  BookOpen,
  Bot,
  Bug,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  Clock3,
  DatabaseZap,
  DownloadCloud,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  History,
  Home,
  Keyboard,
  Lightbulb,
  Link2,
  ListChecks,
  Loader2,
  MessageCircle,
  Network,
  NotebookPen,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Puzzle,
  RotateCcw,
  Star,
  ArrowDownAZ,
  BarChart3,
  FileUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { AiSettingsPanel } from "./ai/AiPanel";
import { getAiAdapter, loadAiSettings } from "./ai/settings";
import type { NoteSuggestion } from "./editor/OpalineEditor";
import { OpalineEditor } from "./editor/OpalineEditor";
import { GraphView } from "./editor/GraphView";
import { articleFromHtmlDocument, replaceArticleInDocument, titleFromArticleHtml } from "./editor/htmlProfile";
import {
  createDefaultDocumentStyle,
  documentStylesEqual,
  extractDocumentStyleFromHtml,
  type OpalineDocumentStyle,
} from "./editor/documentStyle";
import {
  defaultEditorShortcutSettings,
  formatShortcut,
  normalizeShortcutSettings,
  shortcutActions,
  shortcutConflicts,
  shortcutFromKeyboardEvent,
  shortcutSignature,
  type EditorShortcutSettings,
  type KeyboardShortcut,
  type ShortcutActionId,
} from "./editor/keyboardShortcuts";
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
import type { GraphData, ImportedAsset, LinkKind, NewNoteInput, NoteDocument, NoteHistoryEntry, NoteSummary, SearchResult, WorkspaceDiagnosticIssue, WorkspaceDiagnostics, WorkspaceState } from "./domain/note";
import leafLogo from "./assets/opaline-leaf-mark.svg";
import { workspaceAdapter } from "./storage/adapter";
import { WorkspaceMigrationDialog } from "./components/WorkspaceMigrationDialog";
import { useConstrainedMenuPosition } from "./components/useConstrainedMenuPosition";
import { useI18n, type LanguageOption } from "./i18n";
import { checkForAppUpdate, getCurrentAppVersion, installAppUpdate, type UpdateProgress } from "./updates/updater";
import type { Update } from "@tauri-apps/plugin-updater";

const initialState: WorkspaceState = {
  path: null,
  notes: [],
  activeNote: null,
};

const WORKSPACE_PATH_STORAGE_KEY = "opaline-workspace-path";
const ACTIVE_NOTE_STORAGE_KEY = "opaline-active-note";
const FILE_LINK_SETTINGS_STORAGE_KEY = "opaline-file-link-settings";
const EDITOR_SHORTCUT_SETTINGS_STORAGE_KEY = "opaline-editor-shortcuts";
const DEFAULT_AUTO_SAVE_DELAY_MS = 5000;
const MIN_AUTO_SAVE_DELAY_MS = 2000;
const MAX_AUTO_SAVE_DELAY_MS = 300000;
const AUTO_HISTORY_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
const AUTO_HISTORY_CONTENT_DELTA_CHARS = 2000;
type SettingsPanelId = "files" | "shortcuts" | "stats" | "diagnostics" | "plugins" | "ai" | "language" | "updates";
type SaveStatus = "saved" | "dirty" | "saving" | "error";
type FileLinkSettings = {
  defaultOpenFile: "last" | "none";
  newNoteLocation: "vault-root" | "current-folder" | "journal";
  autoSaveDelayMs: number;
};
type StatsSettings = {
  heatmapThresholds: [number, number, number, number];
};

const STATS_SETTINGS_STORAGE_KEY = "opaline-stats-settings";
const defaultFileLinkSettings = (): FileLinkSettings => ({
  defaultOpenFile: "last",
  newNoteLocation: "vault-root",
  autoSaveDelayMs: DEFAULT_AUTO_SAVE_DELAY_MS,
});
const defaultStatsSettings = (): StatsSettings => ({
  heatmapThresholds: [1, 10, 30, 60],
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
      autoSaveDelayMs: normalizeAutoSaveDelayMs(parsed?.autoSaveDelayMs),
    };
  } catch {
    return defaultFileLinkSettings();
  }
};

const normalizeAutoSaveDelayMs = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AUTO_SAVE_DELAY_MS;
  }
  return Math.min(MAX_AUTO_SAVE_DELAY_MS, Math.max(MIN_AUTO_SAVE_DELAY_MS, Math.round(parsed)));
};

const saveFileLinkSettings = (settings: FileLinkSettings) => {
  localStorage.setItem(FILE_LINK_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

const loadEditorShortcutSettings = (): EditorShortcutSettings => {
  if (typeof localStorage === "undefined") return defaultEditorShortcutSettings;
  try {
    return normalizeShortcutSettings(JSON.parse(localStorage.getItem(EDITOR_SHORTCUT_SETTINGS_STORAGE_KEY) || "null"));
  } catch {
    return defaultEditorShortcutSettings;
  }
};

const saveEditorShortcutSettings = (settings: EditorShortcutSettings) => {
  localStorage.setItem(EDITOR_SHORTCUT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

const normalizeStatsThresholds = (value: unknown): StatsSettings["heatmapThresholds"] => {
  const defaults = defaultStatsSettings().heatmapThresholds;
  const source = Array.isArray(value) ? value : defaults;
  const thresholds = defaults.map((fallback, index) => {
    const parsed = Number(source[index]);
    return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : fallback;
  }) as StatsSettings["heatmapThresholds"];

  for (let index = 1; index < thresholds.length; index += 1) {
    thresholds[index] = Math.max(thresholds[index], thresholds[index - 1] + 1);
  }

  return thresholds;
};

const loadStatsSettings = (): StatsSettings => {
  if (typeof localStorage === "undefined") return defaultStatsSettings();
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS_SETTINGS_STORAGE_KEY) || "null") as Partial<StatsSettings> | null;
    return {
      heatmapThresholds: normalizeStatsThresholds(parsed?.heatmapThresholds),
    };
  } catch {
    return defaultStatsSettings();
  }
};

const saveStatsSettings = (settings: StatsSettings) => {
  localStorage.setItem(STATS_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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
type AppView = "home" | "today" | "note" | "settings" | "graph" | "stats";
type VaultSortMode = "updated" | "title";
type TodayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type AppDialogRequest =
  | {
      kind: "text";
      title: string;
      message?: string;
      defaultValue?: string;
      confirmLabel: string;
      cancelLabel: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: "confirm";
      title: string;
      message: string;
      confirmLabel: string;
      cancelLabel: string;
      danger?: boolean;
      resolve: (value: boolean) => void;
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
  const latestArticleHtmlRef = useRef(articleHtml);
  const [savedArticleHtml, setSavedArticleHtml] = useState("");
  const [documentStyle, setDocumentStyle] = useState<OpalineDocumentStyle>(() => createDefaultDocumentStyle());
  const [savedDocumentStyle, setSavedDocumentStyle] = useState<OpalineDocumentStyle>(() => createDefaultDocumentStyle());
  const latestDocumentStyleRef = useRef(documentStyle);
  const [status, setStatus] = useState(() => t("app.status.preparingWorkspace"));
  const [isBusy, setIsBusy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const lastHistorySnapshotRef = useRef<{ noteId: string; at: number; articleHtml: string } | null>(null);
  const saveNoteRef = useRef<(options?: { silent?: boolean; articleHtml?: string; documentStyle?: OpalineDocumentStyle; createHistory?: boolean }) => Promise<boolean>>(async () => true);
  const allowTauriCloseRef = useRef(false);
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
  const [historyDialogNote, setHistoryDialogNote] = useState<NoteSummary | null>(null);
  const [migrationDialog, setMigrationDialog] = useState<{ oldPath: string; newPath: string } | null>(null);
  const [fileLinkSettings, setFileLinkSettings] = useState<FileLinkSettings>(() => loadFileLinkSettings());
  const [editorShortcutSettings, setEditorShortcutSettings] = useState<EditorShortcutSettings>(() => loadEditorShortcutSettings());
  const [statsSettings, setStatsSettings] = useState<StatsSettings>(() => loadStatsSettings());
  const [appDialog, setAppDialog] = useState<AppDialogRequest | null>(null);
  const isDirty = workspace.activeNote !== null && (
    articleHtml !== savedArticleHtml || !documentStylesEqual(documentStyle, savedDocumentStyle)
  );
  const isDirtyRef = useRef(isDirty);
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

  const updateArticleHtml = useCallback((html: string) => {
    latestArticleHtmlRef.current = html;
    setArticleHtml(html);
  }, []);
  const updateDocumentStyle = useCallback((style: OpalineDocumentStyle) => {
    latestDocumentStyleRef.current = style;
    setDocumentStyle(style);
  }, []);
  const cycleVaultSort = useCallback(() => {
    setVaultSortMode((mode) => (mode === "updated" ? "title" : "updated"));
  }, []);

  const askText = useCallback((options: { title: string; message?: string; defaultValue?: string }) => (
    new Promise<string | null>((resolve) => {
      setAppDialog({
        kind: "text",
        title: options.title,
        message: options.message,
        defaultValue: options.defaultValue,
        confirmLabel: t("action.confirm"),
        cancelLabel: t("action.cancel"),
        resolve,
      });
    })
  ), [t]);

  const askConfirm = useCallback((options: { title: string; message: string; danger?: boolean }) => (
    new Promise<boolean>((resolve) => {
      setAppDialog({
        kind: "confirm",
        title: options.title,
        message: options.message,
        confirmLabel: t("action.confirm"),
        cancelLabel: t("action.cancel"),
        danger: options.danger,
        resolve,
      });
    })
  ), [t]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
    if (isSaving) {
      setSaveStatus("saving");
      return;
    }
    if (lastSaveError) {
      setSaveStatus("error");
      return;
    }
    setSaveStatus(isDirty ? "dirty" : "saved");
  }, [isDirty, isSaving, lastSaveError]);

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
    if (view === "stats") {
      return t("app.title.stats");
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

  const updateEditorShortcutSettings = useCallback((next: EditorShortcutSettings) => {
    const normalized = normalizeShortcutSettings(next);
    setEditorShortcutSettings(normalized);
    saveEditorShortcutSettings(normalized);
  }, []);

  const updateStatsSettings = useCallback((patch: Partial<StatsSettings>) => {
    setStatsSettings((current) => {
      const next = {
        ...current,
        ...patch,
        heatmapThresholds: normalizeStatsThresholds(patch.heatmapThresholds ?? current.heatmapThresholds),
      };
      saveStatsSettings(next);
      return next;
    });
  }, []);

  const ensureCurrentNoteSafe = useCallback(async () => {
    if (!isDirtyRef.current) {
      return true;
    }

    setStatus(t("save.status.savingBeforeLeave"));
    const saved = await saveNoteRef.current({ silent: true });
    if (saved) {
      return true;
    }

    return askConfirm({
      title: t("save.leaveBlockedTitle"),
      message: t("save.leaveBlockedMessage"),
      danger: true,
    });
  }, [askConfirm, t]);

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
          const nextDocumentStyle = extractDocumentStyleFromHtml(note.html);
          setWorkspace({ path, notes, activeNote: note });
          latestArticleHtmlRef.current = nextArticleHtml;
          latestDocumentStyleRef.current = nextDocumentStyle;
          setArticleHtml(nextArticleHtml);
          setSavedArticleHtml(nextArticleHtml);
          setDocumentStyle(nextDocumentStyle);
          setSavedDocumentStyle(nextDocumentStyle);
          setLastSavedAt(note.updatedAt);
          setLastSaveError(null);
          setSaveStatus("saved");
          lastHistorySnapshotRef.current = { noteId: note.id, at: Date.now(), articleHtml: nextArticleHtml };
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
    if (!(await ensureCurrentNoteSafe())) {
      return;
    }
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
  }, [ensureCurrentNoteSafe, openWorkspacePath, t]);

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
    const raw = await askText({
      title: t("dialog.folderPromptTitle"),
      message: t("dialog.folderPromptHelp"),
      defaultValue: "notes/",
    });
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
  }, [askText, refreshNotes, t, workspace.path]);

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
      if (workspace.activeNote?.id !== note.id && !(await ensureCurrentNoteSafe())) {
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
    [ensureCurrentNoteSafe, refreshBacklinks, t, workspace.activeNote?.id, workspace.notes, workspace.path],
  );

  const enterSeriousWorkspace = useCallback(async () => {
    if (workspace.activeNote) {
      setView("note");
      return;
    }

    const firstNote = workspace.notes[0];
    if (firstNote) {
      await openNote(firstNote);
      return;
    }

    setView("note");
  }, [openNote, workspace.activeNote, workspace.notes]);

  const openSearchResult = useCallback(
    async (result: SearchResult) => {
      if (!workspace.path) {
        return;
      }
      if (workspace.activeNote?.id !== result.id && !(await ensureCurrentNoteSafe())) {
        return;
      }

      const document = await workspaceAdapter.readNote(workspace.path, result.path);
      openNoteDocument(workspace.path, workspace.notes, document);
      setView("note");
      await refreshBacklinks(workspace.path, document.id);
    },
    [ensureCurrentNoteSafe, refreshBacklinks, workspace.activeNote?.id, workspace.notes, workspace.path],
  );

  const shouldCreateAutoHistorySnapshot = useCallback((noteId: string, nextArticleHtml: string) => {
    const previous = lastHistorySnapshotRef.current;
    if (!previous || previous.noteId !== noteId) {
      return true;
    }
    const elapsed = Date.now() - previous.at;
    const contentDelta = Math.abs(nextArticleHtml.length - previous.articleHtml.length);
    return elapsed >= AUTO_HISTORY_SNAPSHOT_INTERVAL_MS || contentDelta >= AUTO_HISTORY_CONTENT_DELTA_CHARS;
  }, []);

  const saveNote = useCallback(async (options: { silent?: boolean; articleHtml?: string; documentStyle?: OpalineDocumentStyle; createHistory?: boolean } = {}) => {
    if (!workspace.path || !workspace.activeNote) {
      setStatus(t("app.status.noNoteToSave"));
      return false;
    }

    const nextArticleHtml = options.articleHtml ?? articleHtml;
    const nextDocumentStyle = options.documentStyle ?? documentStyle;
    latestArticleHtmlRef.current = nextArticleHtml;
    latestDocumentStyleRef.current = nextDocumentStyle;

    if (nextArticleHtml === savedArticleHtml && documentStylesEqual(nextDocumentStyle, savedDocumentStyle)) {
      if (!options.silent) {
        setStatus(t("app.status.noUnsavedChanges"));
      }
      setLastSaveError(null);
      setSaveStatus("saved");
      isDirtyRef.current = false;
      return true;
    }

    const html = replaceArticleInDocument(workspace.activeNote.html, nextArticleHtml, workspace.notes, nextDocumentStyle);
    if (sameNoteDocumentContent(workspace.activeNote.html, html)) {
      setSavedArticleHtml(nextArticleHtml);
      setSavedDocumentStyle(nextDocumentStyle);
      isDirtyRef.current = false;
      setArticleHtml((current) => (
        latestArticleHtmlRef.current === nextArticleHtml ? nextArticleHtml : current
      ));
      setDocumentStyle((current) => (
        latestDocumentStyleRef.current === nextDocumentStyle ? nextDocumentStyle : current
      ));
      if (!options.silent) {
        setStatus(t("app.status.noUnsavedChanges"));
      }
      setLastSaveError(null);
      setSaveStatus("saved");
      return true;
    }

    const createHistory = options.createHistory ?? (!options.silent || shouldCreateAutoHistorySnapshot(workspace.activeNote.id, nextArticleHtml));
    setIsSaving(true);
    setSaveStatus("saving");
    setLastSaveError(null);
    try {
      const saved = await workspaceAdapter.saveNote(workspace.path, {
        ...workspace.activeNote,
        title: titleFromArticleHtml(nextArticleHtml, workspace.activeNote.title),
        html,
      }, { createHistory });
      const notes = await refreshNotes(workspace.path);
      setWorkspace((current) => (
        current.activeNote?.id === saved.id
          ? { path: workspace.path, notes, activeNote: saved }
          : { ...current, notes }
      ));
      setSavedArticleHtml(nextArticleHtml);
      setSavedDocumentStyle(nextDocumentStyle);
      isDirtyRef.current = false;
      setArticleHtml((current) => (
        latestArticleHtmlRef.current === nextArticleHtml ? nextArticleHtml : current
      ));
      setDocumentStyle((current) => (
        latestDocumentStyleRef.current === nextDocumentStyle ? nextDocumentStyle : current
      ));
      await refreshBacklinks(workspace.path, saved.id);
      setStatus(options.silent ? t("app.status.autoSaved", { title: saved.title }) : t("app.status.saved", { title: saved.title }));
      setLastSavedAt(new Date().toISOString());
      setLastSaveError(null);
      setSaveStatus("saved");
      if (createHistory) {
        lastHistorySnapshotRef.current = { noteId: saved.id, at: Date.now(), articleHtml: nextArticleHtml };
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : t("app.status.saveFailed");
      setStatus(message);
      setLastSaveError(message);
      setSaveStatus("error");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [articleHtml, documentStyle, refreshBacklinks, refreshNotes, savedArticleHtml, savedDocumentStyle, shouldCreateAutoHistorySnapshot, t, workspace.activeNote, workspace.notes, workspace.path]);

  useEffect(() => {
    saveNoteRef.current = saveNote;
  }, [saveNote]);

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
        const saved = await saveNote({ silent: true, articleHtml: sourceHtml });
        if (!saved) {
          return;
        }
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
    if (workspace.activeNote?.id === note.id && !(await ensureCurrentNoteSafe())) return;
    const newTitle = (await askText({
      title: t("dialog.renameTitle"),
      defaultValue: note.title,
    }))?.trim();
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
  }, [askText, ensureCurrentNoteSafe, refreshNotes, t, workspace.activeNote, workspace.path]);

  const deleteNote = useCallback(async (note: NoteSummary) => {
    const shouldDelete = await askConfirm({
      title: t("dialog.deleteTitle"),
      message: t("dialog.deleteConfirm", { title: note.title }),
      danger: true,
    });
    if (!shouldDelete) return;
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
  }, [askConfirm, refreshNotes, t, workspace.activeNote, workspace.path]);

  const moveNote = useCallback(async (note: NoteSummary) => {
    if (workspace.activeNote?.id === note.id && !(await ensureCurrentNoteSafe())) return;
    const dir = (await askText({
      title: t("dialog.movePrompt"),
      message: t("dialog.folderPromptHelp"),
      defaultValue: "notes/",
    }))?.trim();
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
  }, [askText, ensureCurrentNoteSafe, refreshNotes, t, workspace.activeNote, workspace.path]);

  const revealNoteInExplorer = useCallback(async (note: NoteSummary) => {
    try {
      await workspaceAdapter.revealInExplorer(workspace.path!, note.path);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("app.status.revealFailed"));
    }
  }, [t, workspace.path]);

  const openHistoryDialog = useCallback((note: NoteSummary) => {
    setHistoryDialogNote(note);
  }, []);

  const restoreHistorySnapshot = useCallback(async (note: NoteSummary, snapshot: NoteHistoryEntry) => {
    if (!workspace.path) return;
    setIsBusy(true);
    try {
      const restored = await workspaceAdapter.restoreNoteHistory(workspace.path, note.path, note.id, snapshot.snapshotId);
      const notesList = await refreshNotes(workspace.path);
      openNoteDocument(workspace.path, notesList, restored);
      await refreshBacklinks(workspace.path, restored.id);
      setHistoryDialogNote(null);
      setStatus(t("history.restored", { title: restored.title }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("history.restoreFailed"));
      throw error;
    } finally {
      setIsBusy(false);
    }
  }, [refreshBacklinks, refreshNotes, t, workspace.path]);

  const moveNoteTo = useCallback(async (note: NoteSummary, targetDir: string) => {
    if (!workspace.path) return;
    if (workspace.activeNote?.id === note.id && !(await ensureCurrentNoteSafe())) return;
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
  }, [ensureCurrentNoteSafe, refreshNotes, t, workspace.activeNote, workspace.path]);

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
    }, fileLinkSettings.autoSaveDelayMs);

    return () => window.clearTimeout(timer);
  }, [fileLinkSettings.autoSaveDelayMs, isBusy, isDirty, isSaving, saveNote]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowTauriCloseRef.current || !isDirtyRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = t("save.beforeUnloadMessage");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [t]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const appWindow = getCurrentWindow();

    void appWindow.onCloseRequested(async (event) => {
      if (!isDirtyRef.current) {
        return;
      }

      event.preventDefault();
      const ok = await ensureCurrentNoteSafe();
      if (!ok || disposed) {
        return;
      }

      allowTauriCloseRef.current = true;
      window.setTimeout(() => {
        void appWindow.destroy().catch(() => {
          void appWindow.close();
        });
      }, 0);
    }).then((dispose) => {
      if (disposed) {
        dispose();
      } else {
        unlisten = dispose;
      }
    }).catch(() => {
      // Browser/demo builds still have beforeunload protection.
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [ensureCurrentNoteSafe]);

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
    const nextDocumentStyle = extractDocumentStyleFromHtml(note.html);
    localStorage.setItem(ACTIVE_NOTE_STORAGE_KEY, JSON.stringify({ id: note.id, path: note.path, title: note.title }));
    setWorkspace({ path, notes, activeNote: note });
    latestArticleHtmlRef.current = nextArticleHtml;
    latestDocumentStyleRef.current = nextDocumentStyle;
    setArticleHtml(nextArticleHtml);
    setSavedArticleHtml(nextArticleHtml);
    setDocumentStyle(nextDocumentStyle);
    setSavedDocumentStyle(nextDocumentStyle);
    setLastSavedAt(note.updatedAt);
    setLastSaveError(null);
    setSaveStatus("saved");
    lastHistorySnapshotRef.current = { noteId: note.id, at: Date.now(), articleHtml: nextArticleHtml };
    setView("note");
  };
  const isVaultView = view === "note" || view === "graph" || view === "stats" || view === "settings";

  return (
    <main
      className={`app-shell ${view === "home" ? "is-home-mode" : ""} ${isVaultView ? "is-note-mode" : ""} ${leftPanelCollapsed ? "is-left-collapsed" : ""} ${rightPanelCollapsed ? "is-right-collapsed" : ""}`}
    >
      {isVaultView ? (
        <NoteRibbon
          activeView={view}
          leftCollapsed={leftPanelCollapsed}
          onHome={() => setView("home")}
          onNotes={() => setView("note")}
          onToggleLeft={() => setLeftPanelCollapsed((value) => !value)}
          onGraph={() => setView("graph")}
          onStats={() => setView("stats")}
          onSettings={() => setView("settings")}
          onImport={importMarkdown}
        />
      ) : null}
      {view === "home" || (isVaultView && leftPanelCollapsed) ? null : (
      <aside className={`sidebar ${isVaultView ? "is-vault-sidebar" : ""}`}>
        {isVaultView ? null : (
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
          {isVaultView ? null : (
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
          {!isVaultView ? (
            <button type="button" onClick={importMarkdown} disabled={isBusy} data-tooltip={t("action.import")} aria-label={t("action.import")}>
              <FileUp size={17} />
              <span>{t("action.import")}</span>
            </button>
          ) : null}
          {isVaultView ? (
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

        {isVaultView ? (
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
              {view === "note" ? (
                <p>
                  <SaveStatusIndicator
                    status={saveStatus}
                    lastSavedAt={lastSavedAt}
                    error={lastSaveError}
                    locale={locale}
                    onRetry={() => void saveNote({ createHistory: true })}
                  />
                  {currentTags.map((tag) => (
                    <span key={tag} className="tag-pill">#{tag}</span>
                  ))}
                </p>
              ) : (
                <p>{status}</p>
              )}
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
                  data-tooltip={rightPanelCollapsed ? t("action.expandInspector") : t("action.collapseInspector")}
                  data-tooltip-align="right"
                  onClick={() => setRightPanelCollapsed((value) => !value)}
                  aria-label={rightPanelCollapsed ? t("action.expandInspector") : t("action.collapseInspector")}
                >
                  {rightPanelCollapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                </button>
              </div>
            ) : null}
          </header>
        )}

        {view === "home" ? (
          <EntryChoiceView
            onSerious={() => void enterSeriousWorkspace()}
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
        ) : view === "stats" ? (
          <StatsView notes={workspace.notes} settings={statsSettings} />
        ) : view === "settings" ? (
          <SettingsView
            workspacePath={workspace.path}
            fileLinkSettings={fileLinkSettings}
            editorShortcutSettings={editorShortcutSettings}
            statsSettings={statsSettings}
            locale={locale}
            languageOptions={languageOptions}
            communityLanguagePacks={communityLanguagePacks}
            onLocaleChange={setLocale}
            onLanguagePacksChange={setCommunityLanguagePacks}
            onFileLinkSettingsChange={updateFileLinkSettings}
            onEditorShortcutSettingsChange={updateEditorShortcutSettings}
            onStatsSettingsChange={updateStatsSettings}
            onWorkspaceIndexRebuilt={async (notes) => {
              setWorkspace((current) => ({ ...current, notes }));
              if (workspace.path) {
                setGraph(await workspaceAdapter.graphData(workspace.path));
              }
            }}
            onChangeWorkspace={async () => {
              if (!(await ensureCurrentNoteSafe())) return;
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
              documentStyle={documentStyle}
              isSaving={isSaving}
              keyboardShortcuts={editorShortcutSettings}
              currentNote={workspace.activeNote}
              linkableNotes={workspace.notes}
              scrollToBlockTarget={pendingBlockTarget}
              onChange={updateArticleHtml}
              onDocumentStyleChange={updateDocumentStyle}
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
              <Section title={t("panel.history")} icon={<History size={16} />}>
                <div className="inspector-actions">
                  <button type="button" onClick={() => openHistoryDialog(workspace.activeNote!)}>
                    <History size={15} />
                    {t("history.open")}
                  </button>
                </div>
                <p className="muted">{t("history.retentionHint")}</p>
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
        onHistory={(note) => openHistoryDialog(note)}
        onRename={(note) => void renameNote(note)}
        onDelete={(note) => void deleteNote(note)}
        onMove={(note) => void moveNote(note)}
        onReveal={(note) => void revealNoteInExplorer(note)}
      />
      <NoteHistoryDialog
        workspacePath={workspace.path}
        note={historyDialogNote}
        busy={isBusy}
        onClose={() => setHistoryDialogNote(null)}
        onRestore={restoreHistorySnapshot}
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
      <AppDialog request={appDialog} onDismiss={() => setAppDialog(null)} />
    </main>
  );
}

function EntryChoiceView({
  onSerious,
}: {
  onSerious: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="entry-choice" aria-label="Opaline">
      <div className="entry-choice-panel">
        <div className="entry-choice-header">
          <span className="entry-choice-mark" aria-hidden="true">
            <img src={leafLogo} alt="" />
          </span>
          <div>
            <strong>Opaline</strong>
            <span>{t("home.localFirstHint")}</span>
          </div>
        </div>
        <div className="entry-choice-grid">
          <button type="button" className="entry-choice-card is-primary" onClick={onSerious}>
            <NotebookPen size={34} strokeWidth={1.8} />
            <span>{t("home.serious")}</span>
            <small>{t("home.seriousDesc")}</small>
          </button>
        </div>
      </div>
    </section>
  );
}

function NoteRibbon({
  activeView,
  leftCollapsed,
  onHome,
  onNotes,
  onToggleLeft,
  onGraph,
  onStats,
  onSettings,
  onImport,
}: {
  activeView: AppView;
  leftCollapsed: boolean;
  onHome: () => void;
  onNotes: () => void;
  onToggleLeft: () => void;
  onGraph: () => void;
  onStats: () => void;
  onSettings: () => void;
  onImport: () => void;
}) {
  const { t } = useI18n();
  return (
    <nav className="note-ribbon" aria-label={t("nav.workspace")}>
      <button type="button" onClick={onToggleLeft} data-tooltip={leftCollapsed ? t("action.expandFileTree") : t("action.collapseFileTree")} aria-label={leftCollapsed ? t("action.expandFileTree") : t("action.collapseFileTree")}>
        {leftCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
      <button type="button" onClick={onHome} data-tooltip={t("nav.backHome")} aria-label={t("nav.backHome")}>
        <Home size={18} />
      </button>
      <button type="button" className={activeView === "note" ? "is-active" : ""} onClick={onNotes} data-tooltip={t("nav.notes")} aria-label={t("nav.notes")} aria-current={activeView === "note" ? "page" : undefined}>
        <BookOpen size={18} />
      </button>
      <button type="button" onClick={onImport} data-tooltip={t("action.import")} aria-label={t("action.import")}>
        <FileUp size={18} />
      </button>
      <button type="button" className={activeView === "graph" ? "is-active" : ""} onClick={onGraph} data-tooltip={t("nav.graph")} aria-label={t("nav.graph")} aria-current={activeView === "graph" ? "page" : undefined}>
        <Network size={18} />
      </button>
      <button type="button" className={activeView === "stats" ? "is-active" : ""} onClick={onStats} data-tooltip={t("nav.stats")} aria-label={t("nav.stats")} aria-current={activeView === "stats" ? "page" : undefined}>
        <BarChart3 size={18} />
      </button>
      <button type="button" className={activeView === "settings" ? "ribbon-bottom is-active" : "ribbon-bottom"} onClick={onSettings} data-tooltip={t("nav.settings")} aria-label={t("nav.settings")} aria-current={activeView === "settings" ? "page" : undefined}>
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

type StatsDay = {
  date: Date;
  dateKey: string;
  created: number;
  updated: number;
  total: number;
};

type StatsWeekCell = StatsDay | null;

function StatsView({ notes, settings }: { notes: NoteSummary[]; settings: StatsSettings }) {
  const { t, locale } = useI18n();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedDateKey, setSelectedDateKey] = useState(() => toLocalDateKey(new Date()));

  const stats = useMemo(() => buildYearStats(notes, selectedYear), [notes, selectedYear]);
  const selectedDay = stats.daysByKey.get(selectedDateKey) ?? stats.recentDays[0] ?? stats.days[0];
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  const selectYear = (year: number) => {
    setSelectedYear(year);
    setSelectedDateKey(year === currentYear ? toLocalDateKey(new Date()) : toLocalDateKey(new Date(year, 0, 1)));
  };

  return (
    <section className="stats-view" aria-labelledby="stats-title">
      <div className="stats-hero">
        <div>
          <p>{t("stats.subtitle")}</p>
          <h2 id="stats-title">{t("stats.yearTitle", { year: selectedYear })}</h2>
        </div>
        <div className="stats-year-switcher" aria-label={t("stats.yearSwitcher")}>
          {yearOptions.map((year) => (
            <button
              key={year}
              type="button"
              className={selectedYear === year ? "is-active" : ""}
              onClick={() => selectYear(year)}
              aria-pressed={selectedYear === year}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      <div className="stats-summary-grid">
        <StatsMetric label={t("stats.created")} value={stats.yearCreated} />
        <StatsMetric label={t("stats.updated")} value={stats.yearUpdated} />
        <StatsMetric label={t("stats.total")} value={stats.yearTotal} />
      </div>

      <div className="stats-heatmap-card">
        <div className="stats-heatmap-header">
          <strong>{t("stats.heatmapTitle")}</strong>
          <span>{t("stats.heatmapHint")}</span>
        </div>
        <div className="stats-heatmap-scroll" tabIndex={0}>
          <div className="stats-month-row" style={{ "--stats-week-count": stats.weeks.length } as CSSProperties}>
            {stats.weeks.map((week, index) => (
              <span key={`month-${index}`}>{monthLabelForWeek(week, locale)}</span>
            ))}
          </div>
          <div className="stats-heatmap-grid" style={{ "--stats-week-count": stats.weeks.length } as CSSProperties}>
            <div className="stats-weekday-labels" aria-hidden="true">
              {weekdayLabels(locale).map((day, index) => (
                <span key={`${day}-${index}`}>{index % 2 === 1 ? day : ""}</span>
              ))}
            </div>
            {stats.weeks.map((week, weekIndex) => (
              <div className="stats-week" key={`week-${weekIndex}`}>
                {week.map((day, dayIndex) => (
                  day ? (
                    <button
                      key={day.dateKey}
                      type="button"
                      className={`stats-day-cell is-level-${activityLevel(day.total, settings.heatmapThresholds)} ${selectedDay?.dateKey === day.dateKey ? "is-selected" : ""}`}
                      onClick={() => setSelectedDateKey(day.dateKey)}
                      aria-label={activityLabel(day, locale, t)}
                      aria-pressed={selectedDay?.dateKey === day.dateKey}
                    >
                      <span className="stats-day-tooltip">{activityLabel(day, locale, t)}</span>
                    </button>
                  ) : (
                    <span key={`empty-${weekIndex}-${dayIndex}`} className="stats-day-cell is-empty" />
                  )
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="stats-selected-day">
          <span>{t("stats.selectedDate")}</span>
          <strong>{selectedDay ? formatStatsDate(selectedDay.date, locale) : t("stats.emptyDate")}</strong>
          <small>{selectedDay ? activityCompactLabel(selectedDay, t) : t("stats.noActivity")}</small>
        </div>
      </div>

      <div className="stats-recent-card">
        <div className="stats-heatmap-header">
          <strong>{t("stats.recentActivity")}</strong>
          <span>{t("stats.recentHint")}</span>
        </div>
        {stats.recentDays.length ? (
          <div className="stats-recent-list">
            {stats.recentDays.map((day) => (
              <button
                key={day.dateKey}
                type="button"
                className={selectedDay?.dateKey === day.dateKey ? "is-selected" : ""}
                onClick={() => setSelectedDateKey(day.dateKey)}
              >
                <span>{formatStatsDate(day.date, locale)}</span>
                <strong>{activityCompactLabel(day, t)}</strong>
              </button>
            ))}
          </div>
        ) : (
          <p className="stats-empty">{t("stats.noActivityInYear")}</p>
        )}
      </div>
    </section>
  );
}

function StatsMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="stats-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
      <span className="note-title">
        {note.favorite ? <Star size={12} fill="currentColor" /> : null}
        <span>{note.title}</span>
      </span>
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
  onHistory,
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
  onHistory: (note: NoteSummary) => void;
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
      <button type="button" onClick={() => run(() => onHistory(state.note))}>{t("context.history")}</button>
      <span role="separator" />
      <button type="button" className="menu-danger" onClick={() => run(() => onDelete(state.note))}>{t("context.delete")}</button>
    </div>
  );
}

function NoteHistoryDialog({
  workspacePath,
  note,
  busy,
  onClose,
  onRestore,
}: {
  workspacePath: string | null;
  note: NoteSummary | null;
  busy: boolean;
  onClose: () => void;
  onRestore: (note: NoteSummary, snapshot: NoteHistoryEntry) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [entries, setEntries] = useState<NoteHistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!workspacePath || !note) {
      setEntries([]);
      setSelectedId(null);
      setPreviewHtml("");
      setConfirming(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setStatus("");
    setConfirming(false);
    workspaceAdapter
      .listNoteHistory(workspacePath, note.path, note.id)
      .then((items) => {
        if (cancelled) return;
        setEntries(items);
        setSelectedId(items[0]?.snapshotId ?? null);
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : t("history.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [note, t, workspacePath]);

  useEffect(() => {
    if (!workspacePath || !note || !selectedId) {
      setPreviewHtml("");
      return;
    }

    let cancelled = false;
    setStatus("");
    workspaceAdapter
      .readNoteHistory(workspacePath, note.path, note.id, selectedId)
      .then((html) => {
        if (!cancelled) setPreviewHtml(html);
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : t("history.previewFailed"));
      });

    return () => {
      cancelled = true;
    };
  }, [note, selectedId, t, workspacePath]);

  if (!note) {
    return null;
  }

  const selected = entries.find((entry) => entry.snapshotId === selectedId) ?? null;

  const runRestore = async () => {
    if (!selected) return;
    try {
      await onRestore(note, selected);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("history.restoreFailed"));
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="note-dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="note-dialog-header">
          <span className="dialog-leaf history-leaf" aria-hidden="true">
            <History size={25} />
          </span>
          <div>
            <h2 id="history-dialog-title">{t("history.title")}</h2>
            <p>{note.title}</p>
          </div>
        </div>

        <div className="history-layout">
          <aside className="history-list" aria-label={t("history.listLabel")}>
            {loading ? <p className="muted">{t("history.loading")}</p> : null}
            {!loading && entries.length === 0 ? (
              <div className="history-empty">
                <Clock3 size={20} />
                <strong>{t("history.emptyTitle")}</strong>
                <p>{t("history.emptyDesc")}</p>
              </div>
            ) : null}
            {entries.map((entry) => (
              <button
                key={entry.snapshotId}
                type="button"
                className={entry.snapshotId === selectedId ? "is-active" : ""}
                onClick={() => {
                  setSelectedId(entry.snapshotId);
                  setConfirming(false);
                }}
              >
                <span>{formatHistoryDate(entry.createdAt, locale)}</span>
                <small>{entry.title || t("history.untitled")} · {formatBytes(entry.size)}</small>
              </button>
            ))}
          </aside>
          <section className="history-preview">
            {selected ? (
              <>
                <div className="history-preview-bar">
                  <div>
                    <strong>{formatHistoryDate(selected.createdAt, locale)}</strong>
                    <small>{formatBytes(selected.size)}</small>
                  </div>
                  <button type="button" className="dialog-primary" onClick={() => setConfirming(true)} disabled={busy}>
                    <RotateCcw size={15} />
                    {t("history.restore")}
                  </button>
                </div>
                <iframe title={t("history.previewTitle")} sandbox="" srcDoc={previewHtml} />
              </>
            ) : (
              <div className="history-preview-empty">{t("history.selectVersion")}</div>
            )}
          </section>
        </div>

        {confirming && selected ? (
          <div className="history-confirm">
            <strong>{t("history.confirmTitle")}</strong>
            <p>{t("history.confirmDesc")}</p>
            <div>
              <button type="button" className="dialog-secondary" onClick={() => setConfirming(false)} disabled={busy}>
                {t("action.cancel")}
              </button>
              <button type="button" className="dialog-primary" onClick={() => void runRestore()} disabled={busy}>
                {busy ? t("action.processing") : t("history.confirmRestore")}
              </button>
            </div>
          </div>
        ) : null}

        {status ? <p className="history-status">{status}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="dialog-secondary" onClick={onClose} disabled={busy}>
            {t("action.close")}
          </button>
        </div>
      </section>
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
        <div className="today-capture-banner">
          <NotebookPen size={18} />
          <div>
            <strong>{t("today.captureTitle")}</strong>
            <span>{t("today.captureDesc")}</span>
          </div>
        </div>
        <section className="today-thread" aria-label={t("app.title.today")}>
          {messages.length ? (
            messages.map((message) => (
              <article key={message.id} className={`today-message is-${message.role}`}>
                <div>
                  <strong>{message.role === "user" ? t("common.me") : t("common.ai")}</strong>
                  <span>{formatTime(message.createdAt, locale)}</span>
                </div>
                <div dangerouslySetInnerHTML={{ __html: paragraphsFromPlainText(message.content) }} />
              </article>
            ))
          ) : (
            <div className="today-empty">
              <strong>{t("today.emptyTitle")}</strong>
              <span>{t("today.emptyDesc")}</span>
            </div>
          )}
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
  editorShortcutSettings,
  statsSettings,
  locale,
  languageOptions,
  communityLanguagePacks,
  onLocaleChange,
  onLanguagePacksChange,
  onFileLinkSettingsChange,
  onEditorShortcutSettingsChange,
  onStatsSettingsChange,
  onWorkspaceIndexRebuilt,
  onChangeWorkspace,
}: {
  workspacePath: string | null;
  fileLinkSettings: FileLinkSettings;
  editorShortcutSettings: EditorShortcutSettings;
  statsSettings: StatsSettings;
  locale: string;
  languageOptions: LanguageOption[];
  communityLanguagePacks: ReturnType<typeof useI18n>["communityLanguagePacks"];
  onLocaleChange: (locale: string) => void;
  onLanguagePacksChange: ReturnType<typeof useI18n>["setCommunityLanguagePacks"];
  onFileLinkSettingsChange: (patch: Partial<FileLinkSettings>) => void;
  onEditorShortcutSettingsChange: (settings: EditorShortcutSettings) => void;
  onStatsSettingsChange: (patch: Partial<StatsSettings>) => void;
  onWorkspaceIndexRebuilt: (notes: NoteSummary[]) => void | Promise<void>;
  onChangeWorkspace: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [activePanel, setActivePanel] = useState<SettingsPanelId>("files");
  const settingsNodes: Array<{
    id: SettingsPanelId;
    title: string;
    description: string;
    icon: ReactNode;
    left: number;
    top: number;
  }> = [
    {
      id: "files",
      title: t("settings.filesLinks"),
      description: t("settings.defaultOpenFileDesc"),
      icon: <FolderOpen size={19} />,
      left: 50,
      top: 16,
    },
    {
      id: "updates",
      title: t("settings.updates"),
      description: t("settings.updatesDesc"),
      icon: <DownloadCloud size={19} />,
      left: 78,
      top: 30,
    },
    {
      id: "shortcuts",
      title: t("settings.shortcuts"),
      description: t("settings.shortcutsDesc"),
      icon: <Keyboard size={19} />,
      left: 82,
      top: 48,
    },
    {
      id: "language",
      title: t("settings.language"),
      description: t("settings.interfaceLanguageDesc"),
      icon: <MessageCircle size={19} />,
      left: 22,
      top: 50,
    },
    {
      id: "stats",
      title: t("settings.stats"),
      description: t("settings.statsDesc"),
      icon: <BarChart3 size={19} />,
      left: 78,
      top: 62,
    },
    {
      id: "diagnostics",
      title: t("settings.diagnostics"),
      description: t("settings.diagnosticsDesc"),
      icon: <ListChecks size={19} />,
      left: 22,
      top: 66,
    },
    {
      id: "plugins",
      title: t("settings.plugins"),
      description: t("plugin.marketDesc"),
      icon: <Puzzle size={19} />,
      left: 38,
      top: 84,
    },
    {
      id: "ai",
      title: t("settings.ai"),
      description: t("ai.settingsDesc"),
      icon: <Bot size={19} />,
      left: 62,
      top: 84,
    },
  ];
  const activeNode = settingsNodes.find((node) => node.id === activePanel) ?? settingsNodes[0];
  const activeContent =
    activePanel === "files" ? (
      <FileLinksSettingsPanel
        workspacePath={workspacePath}
        settings={fileLinkSettings}
        onChange={onFileLinkSettingsChange}
        onChangeWorkspace={onChangeWorkspace}
      />
    ) : activePanel === "stats" ? (
      <StatsSettingsPanel
        settings={statsSettings}
        onChange={onStatsSettingsChange}
      />
    ) : activePanel === "diagnostics" ? (
      <WorkspaceDiagnosticsPanel
        workspacePath={workspacePath}
        onIndexRebuilt={onWorkspaceIndexRebuilt}
      />
    ) : activePanel === "shortcuts" ? (
      <ShortcutSettingsPanel
        settings={editorShortcutSettings}
        onChange={onEditorShortcutSettingsChange}
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
    ) : activePanel === "updates" ? (
      <UpdateSettingsPanel />
    ) : activePanel === "plugins" ? (
      <LiveComponentsSettingsPanel workspacePath={workspacePath} />
    ) : (
      <AiSettingsPanel />
    );

  return (
    <section className="settings-view settings-map-view">
      <div className="settings-map-canvas" aria-label={t("settings.options")}>
        <svg className="settings-map-lines" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
          {settingsNodes.map((node) => (
            <path
              key={node.id}
              className={activePanel === node.id ? "is-active" : undefined}
              d={`M50 50 L${node.left} ${node.top}`}
            />
          ))}
        </svg>
        <div className="settings-map-center" aria-hidden="true">
          <Settings size={20} />
          <span>{t("settings.options")}</span>
        </div>
        {settingsNodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className={activePanel === node.id ? "settings-map-node is-active" : "settings-map-node"}
            style={{ left: `${node.left}%`, top: `${node.top}%` } as CSSProperties}
            onClick={() => setActivePanel(node.id)}
            aria-label={node.title}
            aria-pressed={activePanel === node.id}
          >
            <span className="settings-map-node-dot">{node.icon}</span>
            <span className="settings-map-node-label">
              <strong>{node.title}</strong>
            </span>
          </button>
        ))}
      </div>
      <div className="settings-popover" role="region" aria-label={activeNode.title}>
        <header className="settings-popover-header">
          <span className="settings-popover-icon">{activeNode.icon}</span>
          <div>
            <strong>{activeNode.title}</strong>
          </div>
        </header>
        <div className="settings-popover-body">
          {activeContent}
        </div>
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
          <strong>{t("settings.autoSaveDelay")}</strong>
          <small>{t("settings.autoSaveDelayDesc")}</small>
        </div>
        <label className="settings-number-field">
          <input
            type="number"
            min={MIN_AUTO_SAVE_DELAY_MS / 1000}
            max={MAX_AUTO_SAVE_DELAY_MS / 1000}
            step={1}
            value={Math.round(settings.autoSaveDelayMs / 1000)}
            onChange={(event) => {
              onChange({ autoSaveDelayMs: normalizeAutoSaveDelayMs(Number(event.target.value) * 1000) });
            }}
            aria-label={t("settings.autoSaveDelay")}
          />
          <span>{t("settings.seconds")}</span>
        </label>
      </div>
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

function WorkspaceDiagnosticsPanel({
  workspacePath,
  onIndexRebuilt,
}: {
  workspacePath: string | null;
  onIndexRebuilt: (notes: NoteSummary[]) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [diagnostics, setDiagnostics] = useState<WorkspaceDiagnostics | null>(null);
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState<"diagnose" | "rebuild" | null>(null);

  const runDiagnostics = useCallback(async () => {
    if (!workspacePath) {
      setStatus(t("settings.workspaceNotReady"));
      return null;
    }
    setRunning("diagnose");
    setStatus(t("diagnostics.running"));
    try {
      const result = await workspaceAdapter.diagnoseWorkspace(workspacePath);
      setDiagnostics(result);
      setStatus(t("diagnostics.complete", {
        errors: result.summary.errorCount,
        warnings: result.summary.warningCount,
      }));
      return result;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("diagnostics.failed"));
      return null;
    } finally {
      setRunning(null);
    }
  }, [t, workspacePath]);

  const rebuildIndex = useCallback(async () => {
    if (!workspacePath) {
      setStatus(t("settings.workspaceNotReady"));
      return;
    }
    setRunning("rebuild");
    setStatus(t("diagnostics.rebuildRunning"));
    try {
      const notes = await workspaceAdapter.rebuildWorkspaceIndex(workspacePath);
      await onIndexRebuilt(notes);
      const result = await workspaceAdapter.diagnoseWorkspace(workspacePath);
      setDiagnostics(result);
      setStatus(t("diagnostics.rebuildComplete", { count: notes.length }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("diagnostics.rebuildFailed"));
    } finally {
      setRunning(null);
    }
  }, [onIndexRebuilt, t, workspacePath]);

  const errors = diagnostics?.issues.filter((issue) => issue.level === "error") ?? [];
  const warnings = diagnostics?.issues.filter((issue) => issue.level !== "error") ?? [];
  const summaryItems = diagnostics ? diagnosticSummaryItems(diagnostics, t) : [];

  return (
    <section className="settings-row-list diagnostics-panel">
      <div className="settings-choice-row diagnostics-action-row">
        <div>
          <strong>{t("diagnostics.title")}</strong>
          <small>{t("diagnostics.desc")}</small>
        </div>
        <div className="diagnostics-actions">
          <button type="button" className="secondary-action-button" onClick={() => void runDiagnostics()} disabled={running !== null || !workspacePath}>
            {running === "diagnose" ? <Loader2 size={15} className="spinner" /> : <RefreshCw size={15} />}
            <span>{running === "diagnose" ? t("diagnostics.runningShort") : t("diagnostics.run")}</span>
          </button>
          <button type="button" className="secondary-action-button" onClick={() => void rebuildIndex()} disabled={running !== null || !workspacePath}>
            {running === "rebuild" ? <Loader2 size={15} className="spinner" /> : <DatabaseZap size={15} />}
            <span>{running === "rebuild" ? t("diagnostics.rebuildingShort") : t("diagnostics.rebuild")}</span>
          </button>
        </div>
      </div>

      <div className="diagnostics-safety-note">
        <ShieldCheck size={16} />
        <span>{t("diagnostics.rebuildSafety")}</span>
      </div>

      {diagnostics ? (
        <>
          <div className="diagnostics-summary-grid">
            {summaryItems.map((item) => (
              <div className={item.emphasis ? "diagnostics-metric is-emphasis" : "diagnostics-metric"} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className={diagnostics.summary.needsRebuild ? "diagnostics-index-state needs-rebuild" : "diagnostics-index-state"}>
            {diagnostics.summary.needsRebuild ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{diagnostics.summary.needsRebuild ? t("diagnostics.needsRebuild") : t("diagnostics.indexHealthy")}</span>
          </div>

          <DiagnosticIssueGroup title={t("diagnostics.errors")} emptyLabel={t("diagnostics.noErrors")} issues={errors} />
          <DiagnosticIssueGroup title={t("diagnostics.warnings")} emptyLabel={t("diagnostics.noWarnings")} issues={warnings} />
        </>
      ) : (
        <div className="diagnostics-empty">
          <ListChecks size={20} />
          <strong>{t("diagnostics.emptyTitle")}</strong>
          <small>{t("diagnostics.emptyDesc")}</small>
        </div>
      )}

      {status ? <p className="plugin-status-text">{status}</p> : null}
    </section>
  );
}

function DiagnosticIssueGroup({
  title,
  emptyLabel,
  issues,
}: {
  title: string;
  emptyLabel: string;
  issues: WorkspaceDiagnosticIssue[];
}) {
  const { t } = useI18n();
  return (
    <details className="diagnostics-group" open={issues.length > 0}>
      <summary>
        <span>{title}</span>
        <strong>{issues.length}</strong>
      </summary>
      {issues.length ? (
        <div className="diagnostics-issue-list">
          {issues.map((issue, index) => (
            <details className="diagnostics-issue" key={`${issue.code}-${issue.path ?? "workspace"}-${issue.target ?? ""}-${index}`}>
              <summary>
                <span>{diagnosticIssueTitle(issue, t)}</span>
                {issue.path ? <code>{issue.path}</code> : null}
              </summary>
              <p>{diagnosticIssueDescription(issue, t)}</p>
              {issue.message ? (
                <div className="diagnostics-issue-detail">
                  <span>{t("diagnostics.issueDetail")}</span>
                  <code>{issue.message}</code>
                </div>
              ) : null}
              <div className="diagnostics-issue-meta">
                <span>{t("diagnostics.issueType")}: <code>{issue.code}</code></span>
                {issue.target ? <span>{t("diagnostics.target")}: <code>{issue.target}</code></span> : null}
              </div>
              {issue.relatedPaths.length ? (
                <div className="diagnostics-related-paths">
                  <span>{t("diagnostics.relatedPaths")}</span>
                  {issue.relatedPaths.map((path) => <code key={path}>{path}</code>)}
                </div>
              ) : null}
            </details>
          ))}
        </div>
      ) : (
        <div className="diagnostics-group-empty">{emptyLabel}</div>
      )}
    </details>
  );
}

const diagnosticSummaryItems = (diagnostics: WorkspaceDiagnostics, t: ReturnType<typeof useI18n>["t"]) => {
  const summary = diagnostics.summary;
  return [
    { label: t("diagnostics.metricHtmlNotes"), value: summary.htmlNoteCount },
    { label: t("diagnostics.metricParsed"), value: summary.parsedNoteCount },
    { label: t("diagnostics.metricErrors"), value: summary.errorCount, emphasis: summary.errorCount > 0 },
    { label: t("diagnostics.metricWarnings"), value: summary.warningCount, emphasis: summary.warningCount > 0 },
    { label: t("diagnostics.metricMissingIds"), value: summary.missingIdCount, emphasis: summary.missingIdCount > 0 },
    { label: t("diagnostics.metricDuplicateIds"), value: summary.duplicateIdCount, emphasis: summary.duplicateIdCount > 0 },
    { label: t("diagnostics.metricBrokenLinks"), value: summary.brokenHrefCount + summary.unresolvedLinkCount, emphasis: summary.brokenHrefCount + summary.unresolvedLinkCount > 0 },
    { label: t("diagnostics.metricAssets"), value: summary.missingAssetCount + summary.unreferencedAssetCount, emphasis: summary.missingAssetCount + summary.unreferencedAssetCount > 0 },
    { label: t("diagnostics.metricSqliteNotes"), value: summary.sqliteNoteCount ?? t("diagnostics.notAvailable") },
    { label: t("diagnostics.metricSqliteRelations"), value: summary.sqliteRelationCount ?? t("diagnostics.notAvailable") },
  ];
};

const diagnosticIssueTitle = (issue: WorkspaceDiagnosticIssue, t: ReturnType<typeof useI18n>["t"]) => {
  const key = `diagnostics.issue.${issue.code}.title`;
  const translated = t(key);
  return translated === key ? t("diagnostics.issue.unknown.title", { code: issue.code }) : translated;
};

const diagnosticIssueDescription = (issue: WorkspaceDiagnosticIssue, t: ReturnType<typeof useI18n>["t"]) => {
  const key = `diagnostics.issue.${issue.code}.desc`;
  const translated = t(key);
  return translated === key ? t("diagnostics.issue.unknown.desc") : translated;
};

function ShortcutSettingsPanel({
  settings,
  onChange,
}: {
  settings: EditorShortcutSettings;
  onChange: (settings: EditorShortcutSettings) => void;
}) {
  const { t } = useI18n();
  const [activeCapture, setActiveCapture] = useState<ShortcutActionId | null>(null);
  const [status, setStatus] = useState("");
  const conflicts = shortcutConflicts(settings);

  const setShortcut = (actionId: ShortcutActionId, shortcut: KeyboardShortcut) => {
    const duplicate = shortcutActions.find((action) => (
      action.id !== actionId && shortcutSignature(settings[action.id]) === shortcutSignature(shortcut)
    ));
    if (duplicate) {
      setStatus(t("settings.shortcutConflict", {
        action: t(shortcutActions.find((action) => action.id === duplicate.id)?.labelKey ?? duplicate.id),
      }));
      return;
    }

    onChange({ ...settings, [actionId]: shortcut });
    setStatus(t("settings.shortcutSaved"));
    setActiveCapture(null);
  };

  const resetOne = (actionId: ShortcutActionId) => {
    onChange({ ...settings, [actionId]: defaultEditorShortcutSettings[actionId] });
    setStatus(t("settings.shortcutReset"));
  };

  const resetAll = () => {
    onChange(defaultEditorShortcutSettings);
    setStatus(t("settings.shortcutsResetAll"));
  };

  return (
    <section className="settings-row-list">
      <div className="settings-choice-row settings-shortcuts-heading">
        <div>
          <strong>{t("settings.shortcuts")}</strong>
          <small>{t("settings.shortcutsHelp")}</small>
        </div>
        <button type="button" className="secondary-action-button" onClick={resetAll}>
          <RotateCcw size={15} />
          <span>{t("settings.shortcutsReset")}</span>
        </button>
      </div>
      <div className="shortcut-settings-list">
        {shortcutActions.map((action) => {
          const shortcut = settings[action.id];
          const isActive = activeCapture === action.id;
          const hasConflict = conflicts.some(([left, right]) => left === action.id || right === action.id);

          return (
            <div className={hasConflict ? "shortcut-settings-row is-conflict" : "shortcut-settings-row"} key={action.id}>
              <div>
                <strong>{t(action.labelKey)}</strong>
                <small>{t(action.descriptionKey)}</small>
              </div>
              <div className="shortcut-capture-controls">
                <input
                  readOnly
                  value={isActive ? t("settings.shortcutRecording") : formatShortcut(shortcut)}
                  aria-label={t("settings.shortcutInputAria", { action: t(action.labelKey) })}
                  onFocus={() => {
                    setActiveCapture(action.id);
                    setStatus(t("settings.shortcutRecordingHelp"));
                  }}
                  onBlur={() => setActiveCapture((current) => (current === action.id ? null : current))}
                  onKeyDown={(event) => {
                    event.preventDefault();
                    if (event.key === "Escape") {
                      setActiveCapture(null);
                      setStatus("");
                      return;
                    }
                    const next = shortcutFromKeyboardEvent(event);
                    if (!next) {
                      setStatus(t("settings.shortcutNeedsCtrl"));
                      return;
                    }
                    setShortcut(action.id, next);
                  }}
                />
                <button type="button" className="secondary-action-button" onClick={() => resetOne(action.id)}>
                  {t("settings.shortcutResetOne")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {status ? <p className="plugin-status-text">{status}</p> : null}
      {conflicts.length ? <p className="plugin-status-text is-error">{t("settings.shortcutConflictsFound")}</p> : null}
    </section>
  );
}

function StatsSettingsPanel({
  settings,
  onChange,
}: {
  settings: StatsSettings;
  onChange: (patch: Partial<StatsSettings>) => void;
}) {
  const { t } = useI18n();
  const updateThreshold = (index: number, value: string) => {
    const next = [...settings.heatmapThresholds] as StatsSettings["heatmapThresholds"];
    next[index] = Number(value);
    onChange({ heatmapThresholds: normalizeStatsThresholds(next) });
  };
  const labels = [
    t("settings.statsLevel1"),
    t("settings.statsLevel2"),
    t("settings.statsLevel3"),
    t("settings.statsLevel4"),
  ];

  return (
    <section className="settings-row-list">
      <div className="settings-choice-row settings-threshold-row">
        <div>
          <strong>{t("settings.statsHeatmapThresholds")}</strong>
          <small>{t("settings.statsHeatmapThresholdsDesc")}</small>
        </div>
        <div className="stats-threshold-grid">
          {settings.heatmapThresholds.map((threshold, index) => (
            <label key={labels[index]}>
              <span>
                <i className={`stats-threshold-swatch is-level-${index + 1}`} aria-hidden="true" />
                {labels[index]}
              </span>
              <input
                type="number"
                min={index === 0 ? 1 : settings.heatmapThresholds[index - 1] + 1}
                step={1}
                value={threshold}
                onChange={(event) => updateThreshold(index, event.target.value)}
                aria-label={labels[index]}
              />
            </label>
          ))}
        </div>
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

function UpdateSettingsPanel() {
  const { t } = useI18n();
  const updateRef = useRef<Update | null>(null);
  const [currentVersion, setCurrentVersion] = useState("");
  const [availableVersion, setAvailableVersion] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getCurrentAppVersion().then((version) => {
      if (!cancelled) {
        setCurrentVersion(version);
      }
    });
    return () => {
      cancelled = true;
      void updateRef.current?.close().catch(() => undefined);
    };
  }, []);

  const describeUpdateError = useCallback((error: unknown, fallbackKey: string) => {
    const message = error instanceof Error ? error.message : String(error || "");
    if (/updater|endpoint|pubkey|public key|signature/i.test(message)) {
      return t("settings.updateSourceNotConfigured", { message });
    }
    return t(fallbackKey, { message: message || t("settings.updateUnknownError") });
  }, [t]);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setStatus("");
    setAvailableVersion("");
    setReleaseNotes("");
    void updateRef.current?.close().catch(() => undefined);
    updateRef.current = null;

    try {
      const result = await checkForAppUpdate();
      setCurrentVersion(result.currentVersion);
      updateRef.current = result.update;
      if (result.update) {
        setAvailableVersion(result.update.version);
        setReleaseNotes(result.update.body ?? "");
        setStatus(t("settings.updateAvailable", { version: result.update.version }));
      } else {
        setStatus(t("settings.noUpdates"));
      }
    } catch (error) {
      setStatus(describeUpdateError(error, "settings.updateCheckFailed"));
    } finally {
      setChecking(false);
    }
  }, [describeUpdateError, t]);

  const runInstall = useCallback(async () => {
    if (!updateRef.current) return;
    setInstalling(true);
    setStatus(t("settings.installingUpdate"));
    setProgress(null);

    try {
      await installAppUpdate(updateRef.current, setProgress);
      setStatus(t("settings.updateInstalled"));
    } catch (error) {
      setStatus(describeUpdateError(error, "settings.updateInstallFailed"));
    } finally {
      setInstalling(false);
    }
  }, [describeUpdateError, t]);

  const progressText = progress
    ? progress.totalBytes
      ? t("settings.updateDownloadProgress", {
        percent: Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100)),
      })
      : t("settings.updateDownloading")
    : "";

  return (
    <section className="settings-row-list">
      <div className="settings-choice-row">
        <div>
          <strong>{t("settings.currentVersion")}</strong>
          <small>{t("settings.currentVersionDesc")}</small>
        </div>
        <span className="settings-version-badge">{currentVersion || t("settings.versionUnknown")}</span>
      </div>
      <div className="settings-choice-row">
        <div>
          <strong>{t("settings.updatePolicy")}</strong>
          <small>{t("settings.updatePolicyDesc")}</small>
        </div>
        <button type="button" className="secondary-action-button" onClick={() => void runCheck()} disabled={checking || installing}>
          {checking ? <RefreshCw size={16} className="spinner" /> : <DownloadCloud size={16} />}
          <span>{checking ? t("settings.checkingUpdates") : t("settings.checkForUpdates")}</span>
        </button>
      </div>
      {availableVersion ? (
        <div className="settings-update-card">
          <div>
            <strong>{t("settings.updateVersion", { version: availableVersion })}</strong>
            <small>{releaseNotes || t("settings.updateNotesEmpty")}</small>
          </div>
          <button type="button" className="secondary-action-button" onClick={() => void runInstall()} disabled={installing || !updateRef.current}>
            {installing ? <RefreshCw size={16} className="spinner" /> : <DownloadCloud size={16} />}
            <span>{installing ? t("settings.installingUpdate") : t("settings.installUpdate")}</span>
          </button>
        </div>
      ) : null}
      {progressText ? <p className="plugin-status-text">{progressText}</p> : null}
      {status ? <p className="plugin-status-text">{status}</p> : null}
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
      <div className="plugin-policy-list is-extension-panel">
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
          <button type="button" className="secondary-action-button" disabled>{t("action.browse")}</button>
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

function SaveStatusIndicator({
  status,
  lastSavedAt,
  error,
  locale,
  onRetry,
}: {
  status: SaveStatus;
  lastSavedAt: string | null;
  error: string | null;
  locale: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const labelKey = status === "saving"
    ? "save.status.saving"
    : status === "dirty"
      ? "save.status.dirty"
      : status === "error"
        ? "save.status.error"
        : "save.status.saved";
  const Icon = status === "saving" ? Loader2 : status === "error" ? AlertCircle : CheckCircle2;
  const savedText = lastSavedAt ? t("save.lastSavedAt", { time: formatSaveTimestamp(lastSavedAt, locale) }) : t("save.lastSavedNever");

  return (
    <span className={`save-state is-${status}`} role="status" aria-live="polite">
      <Icon size={14} className={status === "saving" ? "spinner" : undefined} />
      <span>{t(labelKey)}</span>
      <span className="save-state-time">{savedText}</span>
      {status === "error" ? (
        <>
          <span className="save-state-error">{error}</span>
          <button type="button" onClick={onRetry}>
            <RefreshCw size={13} />
            <span>{t("save.retry")}</span>
          </button>
        </>
      ) : null}
    </span>
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

function AppDialog({ request, onDismiss }: { request: AppDialogRequest | null; onDismiss: () => void }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (request?.kind === "text") {
      setValue(request.defaultValue ?? "");
    }
  }, [request]);

  if (!request) {
    return null;
  }

  const cancel = () => {
    if (request.kind === "text") {
      request.resolve(null);
    } else {
      request.resolve(false);
    }
    onDismiss();
  };

  const confirm = () => {
    if (request.kind === "text") {
      request.resolve(value);
    } else {
      request.resolve(true);
    }
    onDismiss();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={cancel}>
      <section
        className={request.kind === "confirm" && request.danger ? "note-dialog app-dialog is-danger" : "note-dialog app-dialog"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="app-dialog-title">{request.title}</h2>
        {request.message ? <p className="app-dialog-message">{request.message}</p> : null}
        {request.kind === "text" ? (
          <label className="dialog-field">
            <span>{request.title}</span>
            <input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") confirm();
                if (event.key === "Escape") cancel();
              }}
            />
          </label>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="dialog-secondary" onClick={cancel}>
            {request.cancelLabel}
          </button>
          <button type="button" className={request.kind === "confirm" && request.danger ? "dialog-danger" : "dialog-primary"} onClick={confirm}>
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
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

const buildYearStats = (notes: NoteSummary[], year: number) => {
  const counts = new Map<string, { created: number; updated: number }>();
  const addCount = (iso: string, field: "created" | "updated") => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year) return;
    const dateKey = toLocalDateKey(date);
    const current = counts.get(dateKey) ?? { created: 0, updated: 0 };
    current[field] += 1;
    counts.set(dateKey, current);
  };

  for (const note of notes) {
    addCount(note.createdAt, "created");
    addCount(note.updatedAt, "updated");
  }

  const days: StatsDay[] = [];
  const daysByKey = new Map<string, StatsDay>();
  for (let date = new Date(year, 0, 1); date.getFullYear() === year; date.setDate(date.getDate() + 1)) {
    const dayDate = new Date(date);
    const dateKey = toLocalDateKey(dayDate);
    const dayCounts = counts.get(dateKey) ?? { created: 0, updated: 0 };
    const day = {
      date: dayDate,
      dateKey,
      created: dayCounts.created,
      updated: dayCounts.updated,
      total: dayCounts.created + dayCounts.updated,
    };
    days.push(day);
    daysByKey.set(dateKey, day);
  }

  const weeks: StatsWeekCell[][] = [];
  const start = new Date(year, 0, 1);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(year, 11, 31);
  end.setDate(end.getDate() + (6 - end.getDay()));
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 7)) {
    const week: StatsWeekCell[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const current = new Date(date);
      current.setDate(date.getDate() + dayIndex);
      week.push(current.getFullYear() === year ? daysByKey.get(toLocalDateKey(current)) ?? null : null);
    }
    weeks.push(week);
  }

  return {
    days,
    daysByKey,
    weeks,
    recentDays: days.filter((day) => day.total > 0).sort((a, b) => b.dateKey.localeCompare(a.dateKey)).slice(0, 36),
    yearCreated: days.reduce((sum, day) => sum + day.created, 0),
    yearUpdated: days.reduce((sum, day) => sum + day.updated, 0),
    yearTotal: days.reduce((sum, day) => sum + day.total, 0),
  };
};

const toLocalDateKey = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const activityLevel = (total: number, thresholds: StatsSettings["heatmapThresholds"]) => {
  if (total <= 0) return 0;
  for (let index = thresholds.length - 1; index >= 0; index -= 1) {
    if (total >= thresholds[index]) return index + 1;
  }
  return 0;
};

const formatStatsDate = (date: Date, locale = "zh-CN") =>
  new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);

const weekdayLabels = (locale = "zh-CN") => {
  const sunday = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + index);
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  });
};

const monthLabelForWeek = (week: StatsWeekCell[], locale = "zh-CN") => {
  const labeledDay = week.find((day) => day && (day.date.getDate() === 1 || (day.date.getMonth() === 0 && day.date.getDate() <= 7)));
  return labeledDay ? new Intl.DateTimeFormat(locale, { month: "short" }).format(labeledDay.date) : "";
};

const activityCompactLabel = (day: StatsDay, t: ReturnType<typeof useI18n>["t"]) =>
  `${t("stats.createdCount", { count: day.created })} · ${t("stats.updatedCount", { count: day.updated })} · ${t("stats.totalCount", { count: day.total })}`;

const activityLabel = (day: StatsDay, locale: string, t: ReturnType<typeof useI18n>["t"]) =>
  `${formatStatsDate(day.date, locale)}: ${activityCompactLabel(day, t)}`;

const sameNoteDocumentContent = (left: string, right: string) =>
  normalizeUpdatedMetaForCompare(left) === normalizeUpdatedMetaForCompare(right);

const normalizeUpdatedMetaForCompare = (html: string) =>
  html.replace(/<meta\b(?=[^>]*\bname=["']opaline:updated["'])[^>]*>/gi, (tag) =>
    tag.replace(/\bcontent=(["'])[\s\S]*?\1/i, "content=\"\""),
  );

const formatTime = (iso: string, locale = "zh-CN") =>
  new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const formatSaveTimestamp = (iso: string, locale = "zh-CN") =>
  new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const formatHistoryDate = (iso: string, locale = "zh-CN") =>
  new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
