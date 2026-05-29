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

export type NoteHistoryEntry = {
  id: string;
  snapshotId: string;
  timestamp: string;
  createdAt: string;
  size: number;
  title?: string | null;
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

export type WorkspaceDiagnosticLevel = "error" | "warning";

export type WorkspaceDiagnosticIssue = {
  level: WorkspaceDiagnosticLevel;
  code: string;
  path?: string | null;
  relatedPaths: string[];
  target?: string | null;
  message: string;
};

export type WorkspaceDiagnosticsSummary = {
  htmlNoteCount: number;
  parsedNoteCount: number;
  parseFailureCount: number;
  errorCount: number;
  warningCount: number;
  missingIdCount: number;
  duplicateIdCount: number;
  missingTitleCount: number;
  missingH1Count: number;
  missingNoteArticleCount: number;
  emptyBodyCount: number;
  unresolvedLinkCount: number;
  brokenHrefCount: number;
  missingHeadingTargetCount: number;
  missingBlockTargetCount: number;
  missingAssetCount: number;
  unreferencedAssetCount: number;
  sqliteNoteCount?: number | null;
  sqliteRelationCount?: number | null;
  needsRebuild: boolean;
};

export type WorkspaceDiagnostics = {
  summary: WorkspaceDiagnosticsSummary;
  issues: WorkspaceDiagnosticIssue[];
};

export type AssetImport = {
  sourcePath: string;
  kind: "image" | "file";
};

export type ImportedAsset = {
  href: string;
  name: string;
};
