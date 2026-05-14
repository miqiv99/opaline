export type NoteId = string;

export type NoteSummary = {
  id: NoteId;
  path: string;
  title: string;
  updatedAt: string;
  tags: string[];
  outgoingLinks: string[];
};

export type NoteDocument = NoteSummary & {
  html: string;
};

export type WorkspaceState = {
  path: string | null;
  notes: NoteSummary[];
  activeNote: NoteDocument | null;
};

export type NewNoteInput = {
  title: string;
  lang?: string;
};
