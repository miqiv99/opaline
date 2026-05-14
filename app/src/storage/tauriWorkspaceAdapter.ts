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
import type { WorkspaceAdapter } from "./workspaceAdapter";

export const tauriWorkspaceAdapter: WorkspaceAdapter = {
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
};
