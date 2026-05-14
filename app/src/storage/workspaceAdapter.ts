import type { NewNoteInput, NoteDocument, NoteSummary } from "../domain/note";

export interface WorkspaceAdapter {
  chooseWorkspace(): Promise<string | null>;
  ensureWorkspace(path: string): Promise<void>;
  listNotes(path: string): Promise<NoteSummary[]>;
  createNote(path: string, input: NewNoteInput): Promise<NoteDocument>;
  readNote(path: string, notePath: string): Promise<NoteDocument>;
  saveNote(path: string, note: NoteDocument): Promise<NoteDocument>;
}
