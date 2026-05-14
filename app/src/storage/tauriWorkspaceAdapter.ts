import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { NewNoteInput, NoteDocument, NoteSummary } from "../domain/note";
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

  async readNote(path: string, notePath: string) {
    return invoke<NoteDocument>("read_note", { path, notePath });
  },

  async saveNote(path: string, note: NoteDocument) {
    return invoke<NoteDocument>("save_note", { path, note });
  },
};
