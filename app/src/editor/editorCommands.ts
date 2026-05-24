import type { Editor } from "@tiptap/core";
import type { ImportedAsset } from "../domain/note";
import {
  normalizeDocumentStyle,
  updateDocumentStyleSlot,
  type DocumentStyleSlot,
  type DocumentTextStyle,
  type OpalineDocumentStyle,
} from "./documentStyle";
import type { ShortcutActionId } from "./keyboardShortcuts";

export type EditorCommandCategory =
  | "history"
  | "format"
  | "block"
  | "insert"
  | "link"
  | "style"
  | "experimental";

export type EditorCommandGroup =
  | "history"
  | "inline"
  | "block"
  | "list"
  | "insert"
  | "link"
  | "layout"
  | "style"
  | "ai"
  | "experimental";

export type EditorCommandPermission = "none" | "note:read" | "note:write" | "asset:write" | "network";

export type EditorCommandRiskLevel = "low" | "medium" | "high";

export type EditorCommandIconKey =
  | "undo"
  | "redo"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "inlineCode"
  | "codeBlock"
  | "quote"
  | "eraser"
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "link"
  | "callout"
  | "table"
  | "image"
  | "mathInline"
  | "mathBlock"
  | "diagram"
  | "widget"
  | "script"
  | "embed"
  | "columns"
  | "compare"
  | "sidenote"
  | "disclosure"
  | "palette"
  | "command";

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

export type EditorCommandUiVisibility = {
  toolbar: boolean;
  moreFormat: boolean;
  contextMenu: boolean;
  slashMenu: boolean;
  commandPalette: boolean;
  ai: boolean;
};

export type EditorCommandAiMetadata = {
  toolName: string;
  permission: EditorCommandPermission;
  mutatesNote: boolean;
  requiresConfirmation: boolean;
  createsHistorySnapshot: boolean;
  riskLevel: EditorCommandRiskLevel;
  experimental: boolean;
};

export type EditorCommandContext = {
  editor: Editor;
  t: (key: string) => string;
  documentStyle: OpalineDocumentStyle;
  onDocumentStyleChange: (style: OpalineDocumentStyle) => void;
  onImportAsset?: (kind: "image" | "file") => Promise<ImportedAsset | null>;
  openWebLinkDialog?: () => void;
  openAtomicLinkDialog?: () => void;
  openMathInlineDialog?: () => void;
  openMathBlockDialog?: () => void;
  openMermaidDialog?: () => void;
  openWidgetDialog?: () => void;
  openEmbedDialog?: () => void;
  experimentalScriptsEnabled?: boolean;
};

export type EditorCommandVariant = {
  id: string;
  labelKey: string;
  descriptionKey: string;
  payload?: unknown;
  group?: EditorCommandGroup;
  section?: string;
  iconKey?: EditorCommandIconKey;
  shortcutId?: ShortcutActionId;
  shortcutDisplay?: string;
  ui?: Partial<EditorCommandUiVisibility>;
  isActive?: (context: EditorCommandContext) => boolean;
};

export type EditorCommandDefinition = {
  id: string;
  labelKey: string;
  descriptionKey: string;
  category: EditorCommandCategory;
  group: EditorCommandGroup;
  section: string;
  iconKey: EditorCommandIconKey;
  shortcutId?: ShortcutActionId;
  shortcutDisplay?: string;
  payloadSchema?: JsonSchema;
  permission: EditorCommandPermission;
  mutatesNote: boolean;
  requiresConfirmation: boolean;
  createsHistorySnapshot: boolean;
  riskLevel: EditorCommandRiskLevel;
  experimental?: boolean;
  ui: EditorCommandUiVisibility;
  variants?: EditorCommandVariant[];
  canRun: (context: EditorCommandContext, payload?: unknown) => boolean;
  run: (context: EditorCommandContext, payload?: unknown) => boolean | Promise<boolean>;
  isActive?: (context: EditorCommandContext, payload?: unknown) => boolean;
  ai: EditorCommandAiMetadata;
};

export type EditorCommandUiSurface = keyof EditorCommandUiVisibility;

export type EditorCommandUiEntry = {
  entryId: string;
  commandId: string;
  labelKey: string;
  descriptionKey: string;
  category: EditorCommandCategory;
  group: EditorCommandGroup;
  section: string;
  iconKey: EditorCommandIconKey;
  shortcutId?: ShortcutActionId;
  shortcutDisplay?: string;
  payload?: unknown;
  payloadSchema?: JsonSchema;
  permission: EditorCommandPermission;
  mutatesNote: boolean;
  requiresConfirmation: boolean;
  createsHistorySnapshot: boolean;
  riskLevel: EditorCommandRiskLevel;
  experimental: boolean;
  ui: EditorCommandUiVisibility;
  canRun: (context: EditorCommandContext) => boolean;
  run: (context: EditorCommandContext) => boolean | Promise<boolean>;
  isActive: (context: EditorCommandContext) => boolean;
};

const showEverywhere: EditorCommandUiVisibility = {
  toolbar: true,
  moreFormat: false,
  contextMenu: true,
  slashMenu: false,
  commandPalette: true,
  ai: true,
};

const hiddenByDefault: EditorCommandUiVisibility = {
  toolbar: false,
  moreFormat: false,
  contextMenu: false,
  slashMenu: false,
  commandPalette: true,
  ai: false,
};

const noPayloadSchema: JsonSchema = { type: "object", properties: {}, additionalProperties: false };

const withUi = (ui: Partial<EditorCommandUiVisibility>): EditorCommandUiVisibility => ({
  ...hiddenByDefault,
  ...ui,
});

export const editorCommandDefinitions: EditorCommandDefinition[] = [
  command({
    id: "editor.undo",
    labelKey: "editor.undo",
    descriptionKey: "editor.command.undo.desc",
    category: "history",
    group: "history",
    section: "history",
    iconKey: "undo",
    shortcutDisplay: "Ctrl+Z",
    ui: withUi({ toolbar: true, commandPalette: true, ai: true }),
    canRun: ({ editor }) => editor.can().undo(),
    run: ({ editor }) => editor.chain().focus().undo().run(),
    ai: readOnlyAi("opaline_editor_undo"),
  }),
  command({
    id: "editor.redo",
    labelKey: "editor.redo",
    descriptionKey: "editor.command.redo.desc",
    category: "history",
    group: "history",
    section: "history",
    iconKey: "redo",
    shortcutDisplay: "Ctrl+Shift+Z",
    ui: withUi({ toolbar: true, commandPalette: true, ai: true }),
    canRun: ({ editor }) => editor.can().redo(),
    run: ({ editor }) => editor.chain().focus().redo().run(),
    ai: readOnlyAi("opaline_editor_redo"),
  }),
  command({
    id: "editor.toggleBold",
    labelKey: "editor.bold",
    descriptionKey: "editor.command.bold.desc",
    category: "format",
    group: "inline",
    section: "inline",
    iconKey: "bold",
    shortcutId: "bold",
    ui: showEverywhere,
    canRun: ({ editor }) => editor.can().chain().focus().toggleBold().run(),
    run: ({ editor }) => editor.chain().focus().toggleBold().run(),
    isActive: ({ editor }) => editor.isActive("bold"),
    ai: noteWriteAi("opaline_editor_toggle_bold", { requiresConfirmation: false, riskLevel: "low" }),
  }),
  command({
    id: "editor.toggleItalic",
    labelKey: "editor.italic",
    descriptionKey: "editor.command.italic.desc",
    category: "format",
    group: "inline",
    section: "inline",
    iconKey: "italic",
    shortcutId: "italic",
    ui: showEverywhere,
    canRun: ({ editor }) => editor.can().chain().focus().toggleItalic().run(),
    run: ({ editor }) => editor.chain().focus().toggleItalic().run(),
    isActive: ({ editor }) => editor.isActive("italic"),
    ai: noteWriteAi("opaline_editor_toggle_italic", { requiresConfirmation: false, riskLevel: "low" }),
  }),
  command({
    id: "editor.toggleUnderline",
    labelKey: "editor.underline",
    descriptionKey: "editor.command.underline.desc",
    category: "format",
    group: "inline",
    section: "inline",
    iconKey: "underline",
    shortcutId: "underline",
    ui: showEverywhere,
    canRun: ({ editor }) => editor.can().chain().focus().toggleUnderline().run(),
    run: ({ editor }) => editor.chain().focus().toggleUnderline().run(),
    isActive: ({ editor }) => editor.isActive("underline"),
    ai: noteWriteAi("opaline_editor_toggle_underline", { requiresConfirmation: false, riskLevel: "low" }),
  }),
  command({
    id: "editor.toggleStrike",
    labelKey: "editor.strike",
    descriptionKey: "editor.command.strike.desc",
    category: "format",
    group: "inline",
    section: "more-format",
    iconKey: "strike",
    ui: withUi({ moreFormat: true, contextMenu: true, commandPalette: true, ai: true }),
    canRun: ({ editor }) => editor.can().chain().focus().toggleStrike().run(),
    run: ({ editor }) => editor.chain().focus().toggleStrike().run(),
    isActive: ({ editor }) => editor.isActive("strike"),
    ai: noteWriteAi("opaline_editor_toggle_strike", { requiresConfirmation: false, riskLevel: "low" }),
  }),
  command({
    id: "editor.toggleInlineCode",
    labelKey: "editor.inlineCode",
    descriptionKey: "editor.command.inlineCode.desc",
    category: "format",
    group: "inline",
    section: "more-format",
    iconKey: "inlineCode",
    ui: withUi({ moreFormat: true, contextMenu: true, commandPalette: true, ai: true }),
    canRun: ({ editor }) => editor.can().chain().focus().toggleCode().run(),
    run: ({ editor }) => editor.chain().focus().toggleCode().run(),
    isActive: ({ editor }) => editor.isActive("code"),
    ai: noteWriteAi("opaline_editor_toggle_inline_code", { requiresConfirmation: false, riskLevel: "low" }),
  }),
  command({
    id: "editor.toggleCodeBlock",
    labelKey: "editor.codeBlock",
    descriptionKey: "editor.command.codeBlock.desc",
    category: "block",
    group: "block",
    section: "more-format",
    iconKey: "codeBlock",
    ui: withUi({ moreFormat: true, contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
    canRun: ({ editor }) => editor.can().chain().focus().toggleCodeBlock().run(),
    run: ({ editor }) => editor.chain().focus().toggleCodeBlock().run(),
    isActive: ({ editor }) => editor.isActive("codeBlock"),
    ai: noteWriteAi("opaline_editor_toggle_code_block"),
  }),
  command({
    id: "editor.toggleBlockquote",
    labelKey: "editor.blockquote",
    descriptionKey: "editor.command.blockquote.desc",
    category: "block",
    group: "block",
    section: "block",
    iconKey: "quote",
    ui: withUi({ moreFormat: true, contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
    canRun: ({ editor }) => editor.can().chain().focus().toggleBlockquote().run(),
    run: ({ editor }) => editor.chain().focus().toggleBlockquote().run(),
    isActive: ({ editor }) => editor.isActive("blockquote"),
    ai: noteWriteAi("opaline_editor_toggle_blockquote"),
  }),
  command({
    id: "editor.clearFormatting",
    labelKey: "editor.clearFormatting",
    descriptionKey: "editor.command.clearFormatting.desc",
    category: "format",
    group: "inline",
    section: "more-format",
    iconKey: "eraser",
    ui: withUi({ moreFormat: true, contextMenu: true, commandPalette: true, ai: true }),
    canRun: ({ editor }) => editor.can().chain().focus().unsetAllMarks().clearNodes().run(),
    run: ({ editor }) => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    ai: noteWriteAi("opaline_editor_clear_formatting"),
  }),
  command({
    id: "editor.setHeading",
    labelKey: "editor.heading",
    descriptionKey: "editor.command.heading.desc",
    category: "block",
    group: "block",
    section: "block",
    iconKey: "heading1",
    payloadSchema: {
      type: "object",
      properties: {
        level: { type: "number", enum: [1, 2, 3, 4, 5, 6] },
      },
      required: ["level"],
      additionalProperties: false,
    },
    ui: withUi({ commandPalette: true, ai: true }),
    variants: [1, 2, 3, 4, 5, 6].map((level) => ({
      id: `editor.heading${level}`,
      labelKey: `editor.heading${level}`,
      descriptionKey: `editor.command.heading${level}.desc`,
      payload: { level },
      group: "block",
      section: "block",
      iconKey: `heading${level}` as EditorCommandIconKey,
      shortcutId: level <= 3 ? (`heading${level}` as ShortcutActionId) : undefined,
      ui: {
        toolbar: level <= 3,
        contextMenu: true,
        slashMenu: level <= 3,
        commandPalette: true,
        ai: level <= 3,
      },
      isActive: ({ editor }) => editor.isActive("heading", { level }),
    })),
    canRun: (_context, payload) => headingLevelFromPayload(payload) !== null,
    run: ({ editor }, payload) => {
      const level = headingLevelFromPayload(payload);
      if (level === null) return false;
      return editor.chain().focus().setHeading({ level }).run();
    },
    ai: noteWriteAi("opaline_editor_set_heading"),
  }),
  command({
    id: "editor.setParagraph",
    labelKey: "editor.paragraph",
    descriptionKey: "editor.command.paragraph.desc",
    category: "block",
    group: "block",
    section: "block",
    iconKey: "paragraph",
    ui: withUi({ toolbar: true, contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
    canRun: ({ editor }) => editor.can().chain().focus().setParagraph().run(),
    run: ({ editor }) => editor.chain().focus().setParagraph().run(),
    isActive: ({ editor }) => editor.isActive("paragraph"),
    ai: noteWriteAi("opaline_editor_set_paragraph"),
  }),
  command({
    id: "editor.toggleBulletList",
    labelKey: "editor.bulletList",
    descriptionKey: "editor.command.bulletList.desc",
    category: "block",
    group: "list",
    section: "list",
    iconKey: "bulletList",
    shortcutId: "bulletList",
    ui: withUi({ toolbar: true, contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
    canRun: ({ editor }) => editor.can().chain().focus().toggleBulletList().run(),
    run: ({ editor }) => editor.chain().focus().toggleBulletList().run(),
    isActive: ({ editor }) => editor.isActive("bulletList"),
    ai: noteWriteAi("opaline_editor_toggle_bullet_list"),
  }),
  command({
    id: "editor.toggleOrderedList",
    labelKey: "editor.orderedList",
    descriptionKey: "editor.command.orderedList.desc",
    category: "block",
    group: "list",
    section: "list",
    iconKey: "orderedList",
    shortcutId: "orderedList",
    ui: withUi({ toolbar: true, contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
    canRun: ({ editor }) => editor.can().chain().focus().toggleOrderedList().run(),
    run: ({ editor }) => editor.chain().focus().toggleOrderedList().run(),
    isActive: ({ editor }) => editor.isActive("orderedList"),
    ai: noteWriteAi("opaline_editor_toggle_ordered_list"),
  }),
  command({
    id: "editor.toggleTaskList",
    labelKey: "editor.taskList",
    descriptionKey: "editor.command.taskList.desc",
    category: "block",
    group: "list",
    section: "list",
    iconKey: "taskList",
    ui: withUi({ toolbar: true, contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
    canRun: ({ editor }) => editor.can().chain().focus().toggleTaskList().run(),
    run: ({ editor }) => editor.chain().focus().toggleTaskList().run(),
    isActive: ({ editor }) => editor.isActive("taskList"),
    ai: noteWriteAi("opaline_editor_toggle_task_list"),
  }),
  command({
    id: "editor.openWebLink",
    labelKey: "editor.webLink",
    descriptionKey: "editor.command.webLink.desc",
    category: "link",
    group: "link",
    section: "link",
    iconKey: "link",
    shortcutId: "webLink",
    ui: withUi({ toolbar: true, contextMenu: true, slashMenu: true, commandPalette: true }),
    canRun: ({ openWebLinkDialog }) => Boolean(openWebLinkDialog),
    run: ({ openWebLinkDialog }) => {
      openWebLinkDialog?.();
      return true;
    },
    ai: {
      ...noteWriteAi("opaline_editor_open_web_link", { riskLevel: "medium" }),
      requiresConfirmation: true,
    },
  }),
  command({
    id: "editor.insertCallout",
    labelKey: "editor.callout",
    descriptionKey: "editor.command.callout.desc",
    category: "insert",
    group: "insert",
    section: "insert",
    iconKey: "callout",
    ui: withUi({ toolbar: true, contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
    canRun: () => true,
    run: ({ editor, t }) => editor.chain().focus().insertContent(t("editor.calloutDefault")).run(),
    ai: noteWriteAi("opaline_editor_insert_callout"),
  }),
  command({
    id: "editor.insertTable",
    labelKey: "editor.insertTable",
    descriptionKey: "editor.command.insertTable.desc",
    category: "insert",
    group: "insert",
    section: "insert",
    iconKey: "table",
    payloadSchema: {
      type: "object",
      properties: {
        rows: { type: "number", minimum: 1, maximum: 20 },
        cols: { type: "number", minimum: 1, maximum: 12 },
        withHeaderRow: { type: "boolean" },
      },
      additionalProperties: false,
    },
    ui: withUi({ contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
    canRun: () => true,
    run: ({ editor }, payload) => {
      const table = tablePayload(payload);
      return editor.chain().focus().insertTable(table).run();
    },
    ai: noteWriteAi("opaline_editor_insert_table"),
  }),
  command({
    id: "editor.insertImage",
    labelKey: "editor.insertImage",
    descriptionKey: "editor.command.insertImage.desc",
    category: "insert",
    group: "insert",
    section: "insert",
    iconKey: "image",
    ui: withUi({ contextMenu: true, slashMenu: true, commandPalette: true }),
    canRun: ({ onImportAsset }) => Boolean(onImportAsset),
    run: async ({ editor, onImportAsset }) => {
      const asset = await onImportAsset?.("image");
      if (!asset) return false;
      return editor.chain().focus().setImage({ src: asset.href, alt: asset.name }).run();
    },
    ai: assetWriteAi("opaline_editor_insert_image"),
  }),
  command({
    id: "editor.insertMathInline",
    labelKey: "editor.mathInline",
    descriptionKey: "editor.command.mathInline.desc",
    category: "insert",
    group: "insert",
    section: "insert",
    iconKey: "mathInline",
    payloadSchema: latexPayloadSchema(),
    ui: withUi({ toolbar: true, contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
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
  }),
  command({
    id: "editor.insertMathBlock",
    labelKey: "editor.mathBlock",
    descriptionKey: "editor.command.mathBlock.desc",
    category: "insert",
    group: "insert",
    section: "insert",
    iconKey: "mathBlock",
    payloadSchema: latexPayloadSchema(),
    ui: withUi({ toolbar: true, contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
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
  }),
  command({
    id: "editor.insertDiagram",
    labelKey: "editor.mermaid",
    descriptionKey: "editor.command.mermaid.desc",
    category: "insert",
    group: "insert",
    section: "insert",
    iconKey: "diagram",
    payloadSchema: {
      type: "object",
      properties: {
        source: { type: "string" },
      },
      required: ["source"],
      additionalProperties: false,
    },
    ui: withUi({ toolbar: true, contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
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
  }),
  command({
    id: "editor.insertWidget",
    labelKey: "editor.widget",
    descriptionKey: "editor.command.widget.desc",
    category: "insert",
    group: "experimental",
    section: "experimental",
    iconKey: "widget",
    ui: withUi({ toolbar: true, commandPalette: true }),
    canRun: ({ openWidgetDialog }) => Boolean(openWidgetDialog),
    run: ({ openWidgetDialog }) => {
      openWidgetDialog?.();
      return true;
    },
    ai: {
      ...noteWriteAi("opaline_editor_insert_widget", { riskLevel: "medium", experimental: true }),
      requiresConfirmation: true,
    },
  }),
  command({
    id: "editor.insertScript",
    labelKey: "editor.script",
    descriptionKey: "editor.command.script.desc",
    category: "experimental",
    group: "experimental",
    section: "experimental",
    iconKey: "script",
    ui: withUi({ toolbar: true, commandPalette: true }),
    canRun: ({ experimentalScriptsEnabled }) => Boolean(experimentalScriptsEnabled),
    run: ({ editor, experimentalScriptsEnabled }) =>
      experimentalScriptsEnabled ? editor.chain().focus().insertOpalineScript().run() : false,
    experimental: true,
    ai: {
      ...noteWriteAi("opaline_editor_insert_script", { riskLevel: "high", experimental: true }),
      requiresConfirmation: true,
    },
  }),
  command({
    id: "editor.insertNoteEmbed",
    labelKey: "editor.embedNote",
    descriptionKey: "editor.command.embedNote.desc",
    category: "insert",
    group: "link",
    section: "link",
    iconKey: "embed",
    ui: withUi({ toolbar: true, contextMenu: true, commandPalette: true }),
    canRun: ({ openEmbedDialog }) => Boolean(openEmbedDialog),
    run: ({ openEmbedDialog }) => {
      openEmbedDialog?.();
      return true;
    },
    ai: noteWriteAi("opaline_editor_insert_note_embed", { riskLevel: "medium" }),
  }),
  command({
    id: "editor.createLinkToHeadingBlock",
    labelKey: "editor.linkAtomic",
    descriptionKey: "editor.command.linkAtomic.desc",
    category: "link",
    group: "link",
    section: "link",
    iconKey: "link",
    ui: withUi({ toolbar: true, contextMenu: true, commandPalette: true }),
    canRun: ({ openAtomicLinkDialog }) => Boolean(openAtomicLinkDialog),
    run: ({ openAtomicLinkDialog }) => {
      openAtomicLinkDialog?.();
      return true;
    },
    ai: noteWriteAi("opaline_editor_create_heading_block_link", { riskLevel: "medium" }),
  }),
  command({
    id: "editor.insertTwoColumnLayout",
    labelKey: "editor.twoColumn",
    descriptionKey: "editor.command.twoColumn.desc",
    category: "insert",
    group: "layout",
    section: "layout",
    iconKey: "columns",
    ui: withUi({ toolbar: true, contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
    canRun: () => true,
    run: ({ editor }) => editor.chain().focus().insertTwoColumnLayout().run(),
    ai: noteWriteAi("opaline_editor_insert_two_column_layout"),
  }),
  command({
    id: "editor.insertCompareLayout",
    labelKey: "editor.compare",
    descriptionKey: "editor.command.compare.desc",
    category: "insert",
    group: "layout",
    section: "layout",
    iconKey: "compare",
    ui: withUi({ toolbar: true, commandPalette: true, ai: true }),
    canRun: () => true,
    run: ({ editor }) => editor.chain().focus().insertCompareLayout().run(),
    ai: noteWriteAi("opaline_editor_insert_compare_layout"),
  }),
  command({
    id: "editor.insertSidenoteLayout",
    labelKey: "editor.sidenote",
    descriptionKey: "editor.command.sidenote.desc",
    category: "insert",
    group: "layout",
    section: "layout",
    iconKey: "sidenote",
    ui: withUi({ toolbar: true, commandPalette: true, ai: true }),
    canRun: () => true,
    run: ({ editor }) => editor.chain().focus().insertSidenoteLayout().run(),
    ai: noteWriteAi("opaline_editor_insert_sidenote_layout"),
  }),
  command({
    id: "editor.insertDisclosureBlock",
    labelKey: "editor.disclosure",
    descriptionKey: "editor.command.disclosure.desc",
    category: "insert",
    group: "layout",
    section: "layout",
    iconKey: "disclosure",
    ui: withUi({ toolbar: true, contextMenu: true, slashMenu: true, commandPalette: true, ai: true }),
    canRun: () => true,
    run: ({ editor }) => editor.chain().focus().insertDisclosureBlock().run(),
    ai: noteWriteAi("opaline_editor_insert_disclosure"),
  }),
  command({
    id: "document.applyStyle",
    labelKey: "editor.documentStyle",
    descriptionKey: "editor.command.documentStyle.desc",
    category: "style",
    group: "style",
    section: "style",
    iconKey: "palette",
    payloadSchema: {
      type: "object",
      properties: {
        style: { type: "object" },
        slot: { type: "string", enum: ["body", "heading1", "heading2", "heading3", "callout", "code"] },
        patch: { type: "object" },
      },
      additionalProperties: false,
    },
    ui: withUi({ commandPalette: false, ai: true }),
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
    ai: noteWriteAi("opaline_document_apply_style", { riskLevel: "medium" }),
  }),
];

export const editorCommandById = new Map(editorCommandDefinitions.map((command) => [command.id, command]));

export const editorCommandUiEntries: EditorCommandUiEntry[] = editorCommandDefinitions.flatMap((definition) =>
  definition.variants?.length
    ? definition.variants.map((variant) => uiEntryFromVariant(definition, variant))
    : [uiEntryFromCommand(definition)],
);

export const editorCommandUiEntryById = new Map(editorCommandUiEntries.map((entry) => [entry.entryId, entry]));

export const getEditorCommandEntriesForSurface = (surface: EditorCommandUiSurface): EditorCommandUiEntry[] =>
  editorCommandUiEntries.filter((entry) => entry.ui[surface]);

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

export const defaultSchemaForCommand = (command: EditorCommandDefinition): JsonSchema =>
  command.payloadSchema ?? noPayloadSchema;

function command(
  definition: Omit<
    EditorCommandDefinition,
    "permission" | "mutatesNote" | "requiresConfirmation" | "createsHistorySnapshot" | "riskLevel"
  > & {
    permission?: EditorCommandPermission;
    mutatesNote?: boolean;
    requiresConfirmation?: boolean;
    createsHistorySnapshot?: boolean;
    riskLevel?: EditorCommandRiskLevel;
  },
): EditorCommandDefinition {
  return {
    ...definition,
    permission: definition.permission ?? definition.ai.permission,
    mutatesNote: definition.mutatesNote ?? definition.ai.mutatesNote,
    requiresConfirmation: definition.requiresConfirmation ?? definition.ai.requiresConfirmation,
    createsHistorySnapshot: definition.createsHistorySnapshot ?? definition.ai.createsHistorySnapshot,
    riskLevel: definition.riskLevel ?? definition.ai.riskLevel,
    experimental: definition.experimental ?? definition.ai.experimental,
  };
}

function uiEntryFromCommand(command: EditorCommandDefinition): EditorCommandUiEntry {
  return {
    entryId: command.id,
    commandId: command.id,
    labelKey: command.labelKey,
    descriptionKey: command.descriptionKey,
    category: command.category,
    group: command.group,
    section: command.section,
    iconKey: command.iconKey,
    shortcutId: command.shortcutId,
    shortcutDisplay: command.shortcutDisplay,
    payloadSchema: command.payloadSchema,
    permission: command.permission,
    mutatesNote: command.mutatesNote,
    requiresConfirmation: command.requiresConfirmation,
    createsHistorySnapshot: command.createsHistorySnapshot,
    riskLevel: command.riskLevel,
    experimental: Boolean(command.experimental),
    ui: command.ui,
    canRun: (context) => command.canRun(context),
    run: (context) => command.run(context),
    isActive: (context) => command.isActive?.(context) ?? false,
  };
}

function uiEntryFromVariant(command: EditorCommandDefinition, variant: EditorCommandVariant): EditorCommandUiEntry {
  const ui = { ...command.ui, ...variant.ui };
  return {
    entryId: variant.id,
    commandId: command.id,
    labelKey: variant.labelKey,
    descriptionKey: variant.descriptionKey,
    category: command.category,
    group: variant.group ?? command.group,
    section: variant.section ?? command.section,
    iconKey: variant.iconKey ?? command.iconKey,
    shortcutId: variant.shortcutId ?? command.shortcutId,
    shortcutDisplay: variant.shortcutDisplay ?? command.shortcutDisplay,
    payload: variant.payload,
    payloadSchema: command.payloadSchema,
    permission: command.permission,
    mutatesNote: command.mutatesNote,
    requiresConfirmation: command.requiresConfirmation,
    createsHistorySnapshot: command.createsHistorySnapshot,
    riskLevel: command.riskLevel,
    experimental: Boolean(command.experimental),
    ui,
    canRun: (context) => command.canRun(context, variant.payload),
    run: (context) => command.run(context, variant.payload),
    isActive: (context) => variant.isActive?.(context) ?? command.isActive?.(context, variant.payload) ?? false,
  };
}

function readOnlyAi(toolName: string): EditorCommandAiMetadata {
  return {
    toolName,
    permission: "none",
    mutatesNote: false,
    requiresConfirmation: false,
    createsHistorySnapshot: false,
    riskLevel: "low",
    experimental: false,
  };
}

function noteWriteAi(
  toolName: string,
  options: Partial<Pick<EditorCommandAiMetadata, "requiresConfirmation" | "riskLevel" | "experimental">> = {},
): EditorCommandAiMetadata {
  return {
    toolName,
    permission: "note:write",
    mutatesNote: true,
    requiresConfirmation: options.requiresConfirmation ?? true,
    createsHistorySnapshot: true,
    riskLevel: options.riskLevel ?? "medium",
    experimental: options.experimental ?? false,
  };
}

function assetWriteAi(toolName: string): EditorCommandAiMetadata {
  return {
    toolName,
    permission: "asset:write",
    mutatesNote: true,
    requiresConfirmation: true,
    createsHistorySnapshot: true,
    riskLevel: "medium",
    experimental: false,
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
