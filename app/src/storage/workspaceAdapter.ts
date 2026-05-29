import type {
  AssetImport,
  GraphData,
  ImportedAsset,
  NewNoteInput,
  NoteDocument,
  NoteHistoryEntry,
  NoteSummary,
  SearchResult,
  WorkspaceBackupPreview,
  WorkspaceBackupResult,
  WorkspaceDiagnostics,
  WorkspaceMigrationPreview,
  WorkspaceMigrationResult,
} from "../domain/note";
import type { InstalledPlugin } from "../editor/pluginRegistry";
import type { LoadedLanguagePack } from "../i18n";

export interface WorkspaceAdapter {
  defaultWorkspacePath(): Promise<string>;
  chooseWorkspace(): Promise<string | null>;
  ensureWorkspace(path: string): Promise<void>;
  createFolder(path: string, directory: string): Promise<void>;
  listNotes(path: string): Promise<NoteSummary[]>;
  createNote(path: string, input: NewNoteInput): Promise<NoteDocument>;
  createDailyNote(path: string): Promise<NoteDocument>;
  readNote(path: string, notePath: string): Promise<NoteDocument>;
  saveNote(path: string, note: NoteDocument, options?: { createHistory?: boolean }): Promise<NoteDocument>;
  listNoteHistory(path: string, notePath: string, noteId: string): Promise<NoteHistoryEntry[]>;
  readNoteHistory(path: string, notePath: string, noteId: string, snapshotId: string): Promise<string>;
  restoreNoteHistory(path: string, notePath: string, noteId: string, snapshotId: string): Promise<NoteDocument>;
  searchNotes(path: string, query: string): Promise<SearchResult[]>;
  listBacklinks(path: string, noteId: string): Promise<SearchResult[]>;
  graphData(path: string): Promise<GraphData>;
  diagnoseWorkspace(path: string): Promise<WorkspaceDiagnostics>;
  rebuildWorkspaceIndex(path: string): Promise<NoteSummary[]>;
  toggleFavorite(path: string, noteId: string): Promise<boolean>;
  importAsset(path: string, input: AssetImport): Promise<ImportedAsset>;
  importMarkdown?(path: string, markdown: string, title: string): Promise<NoteDocument>;
  readFileText?(filePath: string): Promise<string>;
  renameNote(path: string, noteId: string, newTitle: string): Promise<NoteSummary>;
  deleteNote(path: string, noteId: string): Promise<void>;
  moveNote(path: string, noteId: string, newDirectory: string): Promise<NoteSummary>;
  revealInExplorer(path: string, notePath: string): Promise<void>;
  readSettings(path: string): Promise<Record<string, unknown>>;
  writeSettings(path: string, settings: Record<string, unknown>): Promise<void>;
  listLanguagePacks?(path: string): Promise<LoadedLanguagePack[]>;
  openLanguagePacksFolder?(path: string): Promise<void>;
  openPluginsFolder?(path: string): Promise<void>;
  listInstalledPlugins?(path: string): Promise<InstalledPlugin[]>;
  previewWorkspaceBackup?(path: string, backupParent?: string): Promise<WorkspaceBackupPreview>;
  createWorkspaceBackup?(path: string, backupPath?: string): Promise<WorkspaceBackupResult>;
  previewWorkspaceMigration?(source: string, destination: string): Promise<WorkspaceMigrationPreview>;
  migrateWorkspace?(source: string, destination: string): Promise<WorkspaceMigrationResult>;
  copyWorkspace?(source: string, destination: string): Promise<WorkspaceMigrationResult>;
  moveWorkspace?(source: string, destination: string): Promise<WorkspaceMigrationResult>;
  writeExportFile?(filePath: string, content: string): Promise<void>;
}
