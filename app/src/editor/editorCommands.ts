import type { Editor } from "@tiptap/core";
import type { ImportedAsset } from "../domain/note";
import {
  normalizeDocumentStyle,
  updateDocumentStyleSlot,
  type DocumentStyleSlot,
  type DocumentTextStyle,
  type OpalineDocumentStyle,
} from "./documentStyle";

export type EditorCommandCategory =
  | "history"
  | "format"
  | "block"
  | "insert"
  | "link"
  | "style"
  | "experimental";

export type EditorCommandPermission = "none" | "note:read" | "note:write" | "asset:write" | "network";

export type JsonSchema = {
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: Array<string | number | boolean | null>;
  items?: JsonSchema;
  additionalProperties?: boolean;
  minimum?: number;
  maximum?: number;
  description?: string;
};

export type EditorCommandAiMetadata = {
  toolName: string;
  permission: EditorCommandPermission;
  mutatesNote: boolean;
  requiresConfirmation: boolean;
  createsHistorySnapshot: boolean;
};

export type EditorCommandContext = {
  editor: Editor;
  t: (key: string) => string;
  documentStyle: OpalineDocumentStyle;
  onDocumentStyleChange: (style: OpalineDocumentStyle) => void;
  onImportAsset?: (kind: "image" | "file") => Promise<ImportedAsset | null>;
  openAtomicLinkDialog?: () => void;
  openMathInlineDialog?: () => void;
  openMathBlockDialog?: () => void;
  openMermaidDialog?: () => void;
  openWidgetDialog?: () => void;
  openEmbedDialog?: () => void;
  experimentalScriptsEnabled?: boolean;
};

export type EditorCommandDefinition = {
  id: string;
  labelKey: string;
  category: EditorCommandCategory;
  payloadSchema?: JsonSchema;
  canRun: (context: EditorCommandContext, payload?: unknown) => boolean;
  run: (context: EditorCommandContext, payload?: unknown) => boolean | Promise<boolean>;
  ai: EditorCommandAiMetadata;
};

export const editorCommandDefinitions: EditorCommandDefinition[] = [
  {
    id: "editor.undo",
    labelKey: "editor.undo",
    category: "history",
    canRun: ({ editor }) => editor.can().undo(),
    run: ({ editor }) => editor.chain().focus().undo().run(),
    ai: readOnlyAi("opaline_editor_undo"),
  },
  {
    id: "editor.redo",
    labelKey: "editor.redo",
    category: "history",
    canRun: ({ editor }) => editor.can().redo(),
    run: ({ editor }) => editor.chain().focus().redo().run(),
    ai: readOnlyAi("opaline_editor_redo"),
  },
  {
    id: "editor.toggleBold",
    labelKey: "editor.bold",
    category: "format",
    canRun: ({ editor }) => editor.can().chain().focus().toggleBold().run(),
    run: ({ editor }) => editor.chain().focus().toggleBold().run(),
    ai: noteWriteAi("opaline_editor_toggle_bold"),
  },
  {
    id: "editor.toggleItalic",
    labelKey: "editor.italic",
    category: "format",
    canRun: ({ editor }) => editor.can().chain().focus().toggleItalic().run(),
    run: ({ editor }) => editor.chain().focus().toggleItalic().run(),
    ai: noteWriteAi("opaline_editor_toggle_italic"),
  },
  {
    id: "editor.toggleUnderline",
    labelKey: "editor.underline",
    category: "format",
    canRun: () => false,
    run: () => false,
    ai: noteWriteAi("opaline_editor_toggle_underline"),
  },
  {
    id: "editor.setHeading",
    labelKey: "editor.heading",
    category: "block",
    payloadSchema: {
      type: "object",
      properties: {
        level: { type: "number", enum: [1, 2, 3, 4, 5, 6] },
      },
      required: ["level"],
      additionalProperties: false,
    },
    canRun: (_context, payload) => headingLevelFromPayload(payload) !== null,
    run: ({ editor }, payload) => {
      const level = headingLevelFromPayload(payload);
      if (level === null) return false;
      return editor.chain().focus().setHeading({ level }).run();
    },
    ai: noteWriteAi("opaline_editor_set_heading"),
  },
  {
    id: "editor.setParagraph",
    labelKey: "editor.paragraph",
    category: "block",
    canRun: ({ editor }) => editor.can().chain().focus().setParagraph().run(),
    run: ({ editor }) => editor.chain().focus().setParagraph().run(),
    ai: noteWriteAi("opaline_editor_set_paragraph"),
  },
  {
    id: "editor.insertCallout",
    labelKey: "editor.callout",
    category: "insert",
    canRun: () => true,
    run: ({ editor, t }) => editor.chain().focus().insertContent(t("editor.calloutDefault")).run(),
    ai: noteWriteAi("opaline_editor_insert_callout"),
  },
  {
    id: "editor.insertTable",
    labelKey: "editor.insertTable",
    category: "insert",
    payloadSchema: {
      type: "object",
      properties: {
        rows: { type: "number", minimum: 1, maximum: 20 },
        cols: { type: "number", minimum: 1, maximum: 12 },
        withHeaderRow: { type: "boolean" },
      },
      additionalProperties: false,
    },
    canRun: () => true,
    run: ({ editor }, payload) => {
      const table = tablePayload(payload);
      return editor.chain().focus().insertTable(table).run();
    },
    ai: noteWriteAi("opaline_editor_insert_table"),
  },
  {
    id: "editor.insertImage",
    labelKey: "editor.insertImage",
    category: "insert",
    canRun: ({ onImportAsset }) => Boolean(onImportAsset),
    run: async ({ editor, onImportAsset }) => {
      const asset = await onImportAsset?.("image");
      if (!asset) return false;
      return editor.chain().focus().setImage({ src: asset.href, alt: asset.name }).run();
    },
    ai: assetWriteAi("opaline_editor_insert_image"),
  },
  {
    id: "editor.insertMathInline",
    labelKey: "editor.mathInline",
    category: "insert",
    payloadSchema: latexPayloadSchema(),
    canRun: () => true,
    run: ({ editor, openMathInlineDialog }, payload) => {
      const latex = latexFromPayload(payload);
      if (!latex) {
        openMathInlineDialog?.();
        return true;
      }
      return editor.chain().focus().setMathInline(latex).run();
    },
    ai: noteWriteAi("opaline_editor_insert_math_inline"),
  },
  {
    id: "editor.insertMathBlock",
    labelKey: "editor.mathBlock",
    category: "insert",
    payloadSchema: latexPayloadSchema(),
    canRun: () => true,
    run: ({ editor, openMathBlockDialog }, payload) => {
      const latex = latexFromPayload(payload);
      if (!latex) {
        openMathBlockDialog?.();
        return true;
      }
      return editor.chain().focus().setMathBlock(latex).run();
    },
    ai: noteWriteAi("opaline_editor_insert_math_block"),
  },
  {
    id: "editor.insertDiagram",
    labelKey: "editor.mermaid",
    category: "insert",
    payloadSchema: {
      type: "object",
      properties: {
        source: { type: "string" },
      },
      required: ["source"],
      additionalProperties: false,
    },
    canRun: () => true,
    run: ({ editor, openMermaidDialog }, payload) => {
      const source = stringPayloadValue(payload, "source");
      if (!source) {
        openMermaidDialog?.();
        return true;
      }
      return editor.chain().focus().setMermaidBlock(source).run();
    },
    ai: noteWriteAi("opaline_editor_insert_diagram"),
  },
  {
    id: "editor.insertWidget",
    labelKey: "editor.widget",
    category: "insert",
    canRun: ({ openWidgetDialog }) => Boolean(openWidgetDialog),
    run: ({ openWidgetDialog }) => {
      openWidgetDialog?.();
      return true;
    },
    ai: noteWriteAi("opaline_editor_insert_widget"),
  },
  {
    id: "editor.insertScript",
    labelKey: "editor.script",
    category: "experimental",
    canRun: ({ experimentalScriptsEnabled }) => Boolean(experimentalScriptsEnabled),
    run: ({ editor, experimentalScriptsEnabled }) =>
      experimentalScriptsEnabled ? editor.chain().focus().insertOpalineScript().run() : false,
    ai: {
      ...noteWriteAi("opaline_editor_insert_script"),
      requiresConfirmation: true,
    },
  },
  {
    id: "editor.insertNoteEmbed",
    labelKey: "editor.embedNote",
    category: "insert",
    canRun: ({ openEmbedDialog }) => Boolean(openEmbedDialog),
    run: ({ openEmbedDialog }) => {
      openEmbedDialog?.();
      return true;
    },
    ai: noteWriteAi("opaline_editor_insert_note_embed"),
  },
  {
    id: "editor.createLinkToHeadingBlock",
    labelKey: "editor.linkAtomic",
    category: "link",
    canRun: ({ openAtomicLinkDialog }) => Boolean(openAtomicLinkDialog),
    run: ({ openAtomicLinkDialog }) => {
      openAtomicLinkDialog?.();
      return true;
    },
    ai: noteWriteAi("opaline_editor_create_heading_block_link"),
  },
  {
    id: "editor.insertTwoColumnLayout",
    labelKey: "editor.twoColumn",
    category: "insert",
    canRun: () => true,
    run: ({ editor }) => editor.chain().focus().insertTwoColumnLayout().run(),
    ai: noteWriteAi("opaline_editor_insert_two_column_layout"),
  },
  {
    id: "editor.insertCompareLayout",
    labelKey: "editor.compare",
    category: "insert",
    canRun: () => true,
    run: ({ editor }) => editor.chain().focus().insertCompareLayout().run(),
    ai: noteWriteAi("opaline_editor_insert_compare_layout"),
  },
  {
    id: "editor.insertSidenoteLayout",
    labelKey: "editor.sidenote",
    category: "insert",
    canRun: () => true,
    run: ({ editor }) => editor.chain().focus().insertSidenoteLayout().run(),
    ai: noteWriteAi("opaline_editor_insert_sidenote_layout"),
  },
  {
    id: "editor.insertDisclosureBlock",
    labelKey: "editor.disclosure",
    category: "insert",
    canRun: () => true,
    run: ({ editor }) => editor.chain().focus().insertDisclosureBlock().run(),
    ai: noteWriteAi("opaline_editor_insert_disclosure"),
  },
  {
    id: "document.applyStyle",
    labelKey: "editor.documentStyle",
    category: "style",
    payloadSchema: {
      type: "object",
      properties: {
        style: { type: "object" },
        slot: { type: "string", enum: ["body", "heading1", "heading2", "heading3", "callout", "code"] },
        patch: { type: "object" },
      },
      additionalProperties: false,
    },
    canRun: (_context, payload) => documentStylePayload(payload) !== null,
    run: ({ documentStyle, onDocumentStyleChange }, payload) => {
      const stylePayload = documentStylePayload(payload);
      if (!stylePayload) return false;
      if ("style" in stylePayload) {
        onDocumentStyleChange(stylePayload.style);
        return true;
      }
      onDocumentStyleChange(updateDocumentStyleSlot(documentStyle, stylePayload.slot, stylePayload.patch));
      return true;
    },
    ai: noteWriteAi("opaline_document_apply_style"),
  },
];

export const editorCommandById = new Map(editorCommandDefinitions.map((command) => [command.id, command]));

export const canRunEditorCommand = (
  id: string,
  context: EditorCommandContext,
  payload?: unknown,
): boolean => editorCommandById.get(id)?.canRun(context, payload) ?? false;

export const runEditorCommand = async (
  id: string,
  context: EditorCommandContext,
  payload?: unknown,
): Promise<boolean> => {
  const command = editorCommandById.get(id);
  if (!command || !command.canRun(context, payload)) {
    return false;
  }
  return Boolean(await command.run(context, payload));
};

function readOnlyAi(toolName: string): EditorCommandAiMetadata {
  return {
    toolName,
    permission: "none",
    mutatesNote: false,
    requiresConfirmation: false,
    createsHistorySnapshot: false,
  };
}

function noteWriteAi(toolName: string): EditorCommandAiMetadata {
  return {
    toolName,
    permission: "note:write",
    mutatesNote: true,
    requiresConfirmation: true,
    createsHistorySnapshot: true,
  };
}

function assetWriteAi(toolName: string): EditorCommandAiMetadata {
  return {
    toolName,
    permission: "asset:write",
    mutatesNote: true,
    requiresConfirmation: true,
    createsHistorySnapshot: true,
  };
}

const headingLevelFromPayload = (payload: unknown): 1 | 2 | 3 | 4 | 5 | 6 | null => {
  if (!isRecord(payload)) return null;
  const level = payload.level;
  return level === 1 || level === 2 || level === 3 || level === 4 || level === 5 || level === 6 ? level : null;
};

const tablePayload = (payload: unknown) => {
  if (!isRecord(payload)) {
    return { rows: 3, cols: 3, withHeaderRow: true };
  }
  return {
    rows: clampInteger(payload.rows, 1, 20, 3),
    cols: clampInteger(payload.cols, 1, 12, 3),
    withHeaderRow: typeof payload.withHeaderRow === "boolean" ? payload.withHeaderRow : true,
  };
};

function latexPayloadSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      latex: { type: "string" },
    },
    required: ["latex"],
    additionalProperties: false,
  };
}

const latexFromPayload = (payload: unknown) => stringPayloadValue(payload, "latex");

const stringPayloadValue = (payload: unknown, key: string) => {
  if (!isRecord(payload)) return "";
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
};

type DocumentStyleCommandPayload =
  | { style: OpalineDocumentStyle }
  | { slot: DocumentStyleSlot; patch: Partial<DocumentTextStyle> };

const documentStylePayload = (payload: unknown): DocumentStyleCommandPayload | null => {
  if (!isRecord(payload)) return null;
  if (isRecord(payload.style)) {
    return { style: normalizeDocumentStyle(payload.style) };
  }

  const slot = payload.slot;
  if (!isDocumentStyleSlot(slot) || !isRecord(payload.patch)) {
    return null;
  }

  return {
    slot,
    patch: payload.patch,
  };
};

const isDocumentStyleSlot = (value: unknown): value is DocumentStyleSlot =>
  value === "body" || value === "heading1" || value === "heading2" || value === "heading3" || value === "callout" || value === "code";

const clampInteger = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
