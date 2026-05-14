import type {
  AssetImport,
  GraphData,
  ImportedAsset,
  NewNoteInput,
  NoteDocument,
  NoteSummary,
  SearchResult,
} from "../domain/note";

export interface WorkspaceAdapter {
  chooseWorkspace(): Promise<string | null>;
  ensureWorkspace(path: string): Promise<void>;
  listNotes(path: string): Promise<NoteSummary[]>;
  createNote(path: string, input: NewNoteInput): Promise<NoteDocument>;
  createDailyNote(path: string): Promise<NoteDocument>;
  readNote(path: string, notePath: string): Promise<NoteDocument>;
  saveNote(path: string, note: NoteDocument): Promise<NoteDocument>;
  searchNotes(path: string, query: string): Promise<SearchResult[]>;
  listBacklinks(path: string, noteId: string): Promise<SearchResult[]>;
  graphData(path: string): Promise<GraphData>;
  toggleFavorite(path: string, noteId: string): Promise<boolean>;
  importAsset(path: string, input: AssetImport): Promise<ImportedAsset>;
}
