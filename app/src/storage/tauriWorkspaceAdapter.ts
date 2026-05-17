import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AssetImport,
  GraphData,
  ImportedAsset,
  NewNoteInput,
  NoteDocument,
  NoteSummary,
  SearchResult,
} from "../domain/note";
import { saveInstalledPluginsToCache, type InstalledPlugin } from "../editor/pluginRegistry";
import type { WorkspaceAdapter } from "./workspaceAdapter";

export const tauriWorkspaceAdapter: WorkspaceAdapter = {
  async defaultWorkspacePath() {
    return invoke<string>("default_workspace_path");
  },

  async chooseWorkspace() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择 Opaline 工作区",
    });

    return typeof selected === "string" ? selected : null;
  },

  async ensureWorkspace(path: string) {
    await invoke("ensure_workspace", { path });
  },

  async createFolder(path: string, directory: string) {
    await invoke("create_folder", { path, directory });
  },

  async listNotes(path: string) {
    return invoke<NoteSummary[]>("list_notes", { path });
  },

  async createNote(path: string, input: NewNoteInput) {
    return invoke<NoteDocument>("create_note", { path, input });
  },

  async createDailyNote(path: string) {
    return invoke<NoteDocument>("create_daily_note", { path });
  },

  async readNote(path: string, notePath: string) {
    return invoke<NoteDocument>("read_note", { path, notePath });
  },

  async saveNote(path: string, note: NoteDocument) {
    return invoke<NoteDocument>("save_note", { path, note });
  },

  async searchNotes(path: string, query: string) {
    return invoke<SearchResult[]>("search_notes", { path, query });
  },

  async listBacklinks(path: string, noteId: string) {
    return invoke<SearchResult[]>("list_backlinks", { path, noteId });
  },

  async graphData(path: string) {
    return invoke<GraphData>("graph_data", { path });
  },

  async toggleFavorite(path: string, noteId: string) {
    return invoke<boolean>("toggle_favorite", { path, noteId });
  },

  async importAsset(path: string, input: AssetImport) {
    return invoke<ImportedAsset>("import_asset", { path, input });
  },

  async readSettings(path: string) {
    return invoke<Record<string, unknown>>("read_settings", { path });
  },

  async importMarkdown(path: string, markdown: string, title: string) {
    const { markdownToOpalineArticle } = await import("../editor/markdownImport");
    const body = markdownToOpalineArticle(markdown);
    return invoke<NoteDocument>("create_note", { path, input: { title, body, lang: undefined, directory: undefined } });
  },

  async readFileText(filePath: string) {
    return invoke<string>("read_file_text", { filePath });
  },

  async renameNote(path: string, noteId: string, newTitle: string) {
    return invoke<NoteSummary>("rename_note", { path, noteId, newTitle });
  },

  async deleteNote(path: string, noteId: string) {
    await invoke("delete_note", { path, noteId });
  },

  async moveNote(path: string, noteId: string, newDirectory: string) {
    return invoke<NoteSummary>("move_note", { path, noteId, newDirectory });
  },

  async revealInExplorer(path: string, notePath: string) {
    await invoke("reveal_in_explorer", { path, notePath });
  },

  async writeSettings(path: string, settings: Record<string, unknown>) {
    await invoke("write_settings", { path, settings });
  },

  async listLanguagePacks(path: string) {
    return invoke("list_language_packs", { path });
  },

  async openLanguagePacksFolder(path: string) {
    await invoke("open_language_packs_folder", { path });
  },

  async openPluginsFolder(path: string) {
    await invoke("open_plugins_folder", { path });
  },

  async listInstalledPlugins(path: string) {
    const plugins = await invoke<InstalledPlugin[]>("list_installed_plugins", { path });
    saveInstalledPluginsToCache(plugins);
    return plugins;
  },

  async copyWorkspace(source: string, destination: string) {
    await invoke("copy_workspace", { source, destination });
  },

  async moveWorkspace(source: string, destination: string) {
    await invoke("move_workspace", { source, destination });
  },

  async writeExportFile(filePath: string, content: string) {
    await invoke("write_export_file", { filePath, content });
  },
};
