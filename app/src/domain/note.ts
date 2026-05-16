export type NoteId = string;

export type NoteSummary = {
  id: NoteId;
  path: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  tags: string[];
  headings: string[];
  outgoingLinks: LinkInfo[];
  favorite: boolean;
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
  body?: string;
  directory?: string;
};

export type LinkInfo = {
  href: string;
  label: string;
  targetId: NoteId | null;
  isBroken: boolean;
  kind?: LinkKind;
  targetHeading?: string | null;
  targetBlockId?: string | null;
  concept?: string | null;
};

export type LinkKind = "note" | "heading" | "block" | "concept";

export type SearchResult = {
  id: NoteId;
  path: string;
  title: string;
  excerpt: string;
  updatedAt: string;
};

export type GraphNode = {
  id: NoteId;
  title: string;
  path: string;
  kind?: "note" | "concept";
};

export type GraphEdge = {
  source: NoteId;
  target: NoteId;
  kind?: LinkKind;
  label?: string;
  targetHeading?: string | null;
  targetBlockId?: string | null;
  concept?: string | null;
  count?: number;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  brokenLinks: LinkInfo[];
};

export type AssetImport = {
  sourcePath: string;
  kind: "image" | "file";
};

export type ImportedAsset = {
  href: string;
  name: string;
};
