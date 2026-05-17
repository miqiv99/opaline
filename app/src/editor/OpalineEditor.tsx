import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextSelection } from "@tiptap/pm/state";
import {
  Bold,
  Brain,
  CheckSquare,
  Code2,
  Columns2,
  Copy,
  FileImage,
  GitBranch,
  Heading1,
  Heading2,
  Italic,
  LinkIcon,
  List,
  ListOrdered,
  MessageSquareQuote,
  Network,
  PanelRight,
  Pi,
  Redo2,
  Save,
  Search,
  Sparkles,
  Table2,
  Tag,
  TextCursorInput,
  TextSearch,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ImportedAsset } from "../domain/note";
import { SUMMARY_PROMPT, TAG_PROMPT, TITLE_PROMPT } from "../ai/adapter";
import { getAiAdapter, loadAiSettings } from "../ai/settings";
import { useConstrainedMenuPosition } from "../components/useConstrainedMenuPosition";
import { MathInline, MathBlock } from "./extensions/math";
import { MermaidBlock } from "./extensions/mermaid";
import { NoteEmbed } from "./extensions/embed";
import { BlockId, assignBlockIds, listBlockIds } from "./extensions/blockId";
import { DisclosureBlock, DisclosureContent, DisclosureSummary, LayoutColumn, OpalineLayout } from "./extensions/layout";
import { OpalineWidget } from "./extensions/widget";
import { OpalineScript } from "./extensions/liveScript";
import { BUILT_IN_WIDGETS, loadLiveComponentSettings } from "./liveComponentSettings";
import { loadInstalledPluginsFromCache, type InstalledPluginWidget } from "./pluginRegistry";
import { useI18n } from "../i18n";
import "katex/dist/katex.min.css";

export type NoteSuggestion = {
  id: string;
  title: string;
  path: string;
  excerpt: string;
};

type EditorNoteReference = {
  id: string;
  title: string;
  path: string;
};

const OpalineLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      opalineLink: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-opaline-link"),
        renderHTML: (attributes) =>
          attributes.opalineLink ? { "data-opaline-link": attributes.opalineLink as string } : {},
      },
      opalineLinkKind: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-opaline-link-kind"),
        renderHTML: (attributes) =>
          attributes.opalineLinkKind ? { "data-opaline-link-kind": attributes.opalineLinkKind as string } : {},
      },
      opalineBlockRef: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-opaline-block-ref"),
        renderHTML: (attributes) =>
          attributes.opalineBlockRef ? { "data-opaline-block-ref": attributes.opalineBlockRef as string } : {},
      },
      opalineHeading: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-opaline-heading"),
        renderHTML: (attributes) =>
          attributes.opalineHeading ? { "data-opaline-heading": attributes.opalineHeading as string } : {},
      },
    };
  },
});

type OpalineEditorProps = {
  content: string;
  isSaving: boolean;
  currentNote: EditorNoteReference | null;
  linkableNotes?: EditorNoteReference[];
  scrollToBlockTarget?: { blockId: string; requestId: number } | null;
  onChange: (html: string) => void;
  onSave: (html: string) => void | Promise<void>;
  onImportAsset: (kind: "image" | "file") => Promise<ImportedAsset | null>;
  onSearchNotes?: (query: string) => Promise<NoteSuggestion[]>;
  onOpenInternalLink?: (target: InternalLinkTarget) => void;
};

export function OpalineEditor({
  content,
  isSaving,
  currentNote,
  linkableNotes = [],
  scrollToBlockTarget,
  onChange,
  onSave,
  onImportAsset,
  onSearchNotes,
  onOpenInternalLink,
}: OpalineEditorProps) {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<InsertDialogState | null>(null);
  const [aiResult, setAiResult] = useState<AiResultState | null>(null);
  const [noteLinkDialogOpen, setNoteLinkDialogOpen] = useState(false);
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
  const [atomicLinkDialogOpen, setAtomicLinkDialogOpen] = useState(false);
  const [widgetDialogOpen, setWidgetDialogOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const linkContextRef = useRef<InternalLinkContext>({
    currentNote,
    notes: linkableNotes,
    getCurrentHtml: undefined,
    onOpenInternalLink,
  });
  const liveComponentSettings = loadLiveComponentSettings();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      OpalineLink.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: "noreferrer",
        },
      }),
      Image,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Placeholder.configure({
        placeholder: "写点东西，保存后就是一篇干净的 HTML 笔记...",
      }),
      MathInline,
      MathBlock,
      MermaidBlock,
      NoteEmbed,
      OpalineWidget,
      OpalineScript,
      BlockId,
      LayoutColumn,
      OpalineLayout,
      DisclosureBlock,
      DisclosureSummary,
      DisclosureContent,
    ],
    content,
    editorProps: {
      attributes: {
        class: "editor-surface",
      },
      handleDOMEvents: {
        click: (_view, event) => {
          return handleEditorLinkClick(event, linkContextRef.current);
        },
        contextmenu: (_view, event) => {
          event.preventDefault();
          setContextMenu({ x: event.clientX, y: event.clientY });
          return true;
        },
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    linkContextRef.current = {
      currentNote,
      notes: linkableNotes,
      getCurrentHtml: editor ? () => editor.getHTML() : undefined,
      onOpenInternalLink,
    };
  }, [currentNote, editor, linkableNotes, onOpenInternalLink]);

  useEffect(() => {
    if (!editor || editor.getHTML() === content) {
      return;
    }

    editor.commands.setContent(content, false);
  }, [content, editor]);

  useEffect(() => {
    if (!editor || !scrollToBlockTarget) {
      return;
    }

    const timer = window.setTimeout(() => {
      scrollEditorToBlock(editor, scrollToBlockTarget.blockId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [content, editor, scrollToBlockTarget]);

  if (!editor) {
    return <div className="editor-empty">{t("editor.empty")}</div>;
  }

  return (
    <section className="editor-shell" onClick={() => setContextMenu(null)}>
      <div className="toolbar" aria-label={t("editor.toolbar")}>
        <IconButton label={t("editor.undo")} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 size={17} />
        </IconButton>
        <IconButton label={t("editor.redo")} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 size={17} />
        </IconButton>
        <span className="toolbar-divider" />
        <IconButton label={t("editor.callout")} onClick={() => insertCallout(editor, t)}>
          <MessageSquareQuote size={17} />
        </IconButton>
        <IconButton label={t("editor.twoColumn")} onClick={() => editor.chain().focus().insertTwoColumnLayout().run()}>
          <Columns2 size={17} />
        </IconButton>
        <IconButton label={t("editor.compare")} onClick={() => editor.chain().focus().insertCompareLayout().run()}>
          <TextCursorInput size={17} />
        </IconButton>
        <IconButton label={t("editor.sidenote")} onClick={() => editor.chain().focus().insertSidenoteLayout().run()}>
          <PanelRight size={17} />
        </IconButton>
        <IconButton label={t("editor.disclosure")} onClick={() => editor.chain().focus().insertDisclosureBlock().run()}>
          <span className="icon-math-display">⌄</span>
        </IconButton>
        <span className="toolbar-divider" />
        <IconButton label={t("editor.mathInline")} onClick={() => setDialog({ type: "math-inline", value: "x^2 + y^2 = 1" })}>
          <Pi size={17} />
        </IconButton>
        <IconButton label={t("editor.mathBlock")} onClick={() => setDialog({ type: "math-block", value: "\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}" })}>
          <span className="icon-math-display">∑</span>
        </IconButton>
        <IconButton label={t("editor.mermaid")} onClick={() => setDialog({ type: "mermaid", value: t("editor.mermaidDefault") })}>
          <GitBranch size={17} />
        </IconButton>
        <IconButton label={t("editor.linkAtomic")} onClick={() => openAtomicLinkDialog(editor, onChange, setAtomicLinkDialogOpen)}>
          <LinkIcon size={17} />
        </IconButton>
        <IconButton label={t("editor.widget")} onClick={() => setWidgetDialogOpen(true)}>
          <Network size={17} />
        </IconButton>
        <IconButton
          label={t("editor.script")}
          onClick={() => editor.chain().focus().insertOpalineScript().run()}
          disabled={!liveComponentSettings.experimentalScriptsEnabled}
        >
          <Code2 size={17} />
        </IconButton>
        {onSearchNotes ? (
          <IconButton label={t("editor.embedNote")} onClick={() => setEmbedDialogOpen(true)}>
            <FileImage size={17} />
          </IconButton>
        ) : null}
        <button
          className="save-button"
          data-tooltip={isSaving ? t("action.saving") : t("action.save")}
          onClick={() => {
            const html = editor.getHTML();
            onChange(html);
            void onSave(html);
          }}
          disabled={isSaving}
        >
          <Save size={17} />
          <span>{isSaving ? t("action.saving") : t("action.save")}</span>
        </button>
      </div>
      <EditorContent editor={editor} className="editor-scroll" />
      <EditorContextMenu
        editor={editor}
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onNoteLink={() => setNoteLinkDialogOpen(true)}
        onAtomicLink={() => openAtomicLinkDialog(editor, onChange, setAtomicLinkDialogOpen)}
        onCopyBlockLink={() => copyCurrentBlockLink(editor, currentNote, onChange)}
        onWebLink={() => openLinkDialog(editor, setDialog)}
        onImage={() => insertImage(editor, onImportAsset)}
        onMathInline={() => setDialog({ type: "math-inline", value: "x^2 + y^2 = 1" })}
        onAiAction={(action) => {
          void runEditorAiAction(editor, action, setAiResult);
        }}
        onEmbedNote={() => setEmbedDialogOpen(true)}
        canLinkNote={Boolean(onSearchNotes)}
        canEmbedNote={Boolean(onSearchNotes)}
      />
      <InsertDialog editor={editor} state={dialog} onClose={() => setDialog(null)} />
      <WidgetInsertDialog editor={editor} open={widgetDialogOpen} onClose={() => setWidgetDialogOpen(false)} />
      <AtomicLinkDialog
        editor={editor}
        open={atomicLinkDialogOpen}
        currentNote={currentNote}
        onChange={onChange}
        onClose={() => setAtomicLinkDialogOpen(false)}
      />
      <NoteLinkDialog
        editor={editor}
        open={noteLinkDialogOpen}
        onChange={onChange}
        onSearchNotes={onSearchNotes}
        onClose={() => setNoteLinkDialogOpen(false)}
      />
      <EmbedNoteDialog
        editor={editor}
        open={embedDialogOpen}
        onSearchNotes={onSearchNotes}
        onClose={() => setEmbedDialogOpen(false)}
      />
      <AiResultDialog editor={editor} state={aiResult} onClose={() => setAiResult(null)} />
    </section>
  );
}

type ContextMenuState = {
  x: number;
  y: number;
};

type InsertDialogState =
  | { type: "link"; value: string }
  | { type: "math-inline"; value: string }
  | { type: "math-block"; value: string }
  | { type: "mermaid"; value: string };

type AiEditorAction = "summary" | "title" | "tags";

type AiResultState = {
  action: AiEditorAction;
  title: string;
  status: "loading" | "done" | "error";
  result: string;
};

type IconButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
};

function IconButton({ label, active = false, disabled = false, children, onClick }: IconButtonProps) {
  return (
    <button
      className={active ? "icon-button is-active" : "icon-button"}
      type="button"
      data-tooltip={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const openLinkDialog = (
  editor: NonNullable<ReturnType<typeof useEditor>>,
  setDialog: (state: InsertDialogState) => void,
) => {
  const current = editor.getAttributes("link").href as string | undefined;
  setDialog({ type: "link", value: current ?? "" });
};

const runEditorAiAction = async (
  editor: NonNullable<ReturnType<typeof useEditor>>,
  action: AiEditorAction,
  setAiResult: (state: AiResultState) => void,
) => {
  const titleMap: Record<AiEditorAction, string> = {
    summary: "生成摘要",
    title: "建议标题",
    tags: "提取标签",
  };
  const promptMap: Record<AiEditorAction, string> = {
    summary: SUMMARY_PROMPT,
    title: TITLE_PROMPT,
    tags: TAG_PROMPT,
  };
  const text = editor.getText().trim();

  setAiResult({ action, title: titleMap[action], status: "loading", result: "正在读取当前笔记并请求模型..." });

  if (!text) {
    setAiResult({ action, title: titleMap[action], status: "error", result: "当前笔记没有可分析的正文。" });
    return;
  }

  try {
    const settings = loadAiSettings();
    if (!settings.apiKey.trim()) {
      setAiResult({ action, title: titleMap[action], status: "error", result: "请先在设置里填写 API Key。" });
      return;
    }

    const adapter = getAiAdapter(settings.provider);
    const result = await adapter.chat(
      [
        { role: "system", content: promptMap[action] },
        { role: "user", content: editor.getHTML().slice(0, 24000) },
      ],
      {
        model: settings.model || adapter.defaultModel,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
      },
    );

    setAiResult({ action, title: titleMap[action], status: "done", result });
  } catch (error) {
    setAiResult({
      action,
      title: titleMap[action],
      status: "error",
      result: error instanceof Error ? error.message : "AI 请求失败",
    });
  }
};

const insertCallout = (editor: NonNullable<ReturnType<typeof useEditor>>, t: ReturnType<typeof useI18n>["t"]) => {
  editor
    .chain()
    .focus()
    .insertContent(
      t("editor.calloutDefault"),
    )
    .run();
};

const insertImage = async (
  editor: NonNullable<ReturnType<typeof useEditor>>,
  onImportAsset: (kind: "image" | "file") => Promise<ImportedAsset | null>,
) => {
  const asset = await onImportAsset("image");
  if (!asset) {
    return;
  }

  editor.chain().focus().setImage({ src: asset.href, alt: asset.name }).run();
};

const insertEmbed = (
  editor: NonNullable<ReturnType<typeof useEditor>>,
  note: NoteSuggestion,
) => {
  editor.chain().focus().setNoteEmbed({ noteId: note.id, title: note.title, excerpt: note.excerpt }).run();
};

const insertNoteLink = (
  editor: NonNullable<ReturnType<typeof useEditor>>,
  note: NoteSuggestion,
) => {
  const { from, to } = editor.state.selection;
  const selected = editor.state.doc.textBetween(from, to, " ").trim();
  const text = selected || note.title;
  const href = relativeNoteHref(note.path);
  insertMarkedLink(editor, { from, to }, text, {
    href,
    opalineLink: note.id,
    opalineLinkKind: "note",
  });
};

const relativeNoteHref = (notePath: string) => notePath.replace(/^notes\//, "");

const insertMarkedLink = (
  editor: NonNullable<ReturnType<typeof useEditor>>,
  range: { from: number; to: number },
  text: string,
  attrs: Record<string, string | null>,
) => {
  const linkMark = editor.state.schema.marks.link;
  const cleanAttrs = Object.fromEntries(Object.entries(attrs).filter(([, value]) => value !== null));

  if (!linkMark) {
    return;
  }

  let transaction = editor.state.tr;
  if (range.from === range.to) {
    transaction = transaction.insert(range.from, editor.state.schema.text(text, [linkMark.create(cleanAttrs)]));
    transaction = transaction.setSelection(TextSelection.create(transaction.doc, range.from + text.length));
  } else {
    transaction = transaction.addMark(range.from, range.to, linkMark.create(cleanAttrs));
    transaction = transaction.setSelection(TextSelection.create(transaction.doc, range.to));
  }

  editor.view.dispatch(transaction.scrollIntoView());
  editor.commands.focus();
};

const cssEscape = (value: string) => {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
};

type InternalLinkTarget = {
  noteId?: string;
  notePath?: string;
  blockId?: string | null;
  sourceHtml?: string;
};

type InternalLinkContext = {
  currentNote: EditorNoteReference | null;
  notes: EditorNoteReference[];
  getCurrentHtml?: () => string;
  onOpenInternalLink?: (target: InternalLinkTarget) => void;
};

const handleEditorLinkClick = (
  event: MouseEvent,
  context: InternalLinkContext,
) => {
  const target = event.target as HTMLElement | null;
  const link = target?.closest<HTMLAnchorElement>("a[href]");
  if (!link) return false;

  const internalTarget = getInternalLinkTarget(link, context.notes);
  if (!internalTarget) return false;

  event.preventDefault();
  event.stopPropagation();

  const targetNotePath = internalTarget.notePath ? normalizeNoteHrefPath(internalTarget.notePath) : null;
  const currentNotePath = context.currentNote ? normalizeNoteHrefPath(relativeNoteHref(context.currentNote.path)) : null;
  const isCurrentNote =
    !internalTarget.noteId && !targetNotePath
      ? true
      : Boolean(
          context.currentNote &&
          ((internalTarget.noteId && internalTarget.noteId === context.currentNote.id) ||
            (targetNotePath && targetNotePath === currentNotePath)),
        );

  if (!isCurrentNote && (internalTarget.noteId || internalTarget.notePath)) {
    context.onOpenInternalLink?.({ ...internalTarget, sourceHtml: context.getCurrentHtml?.() });
    return true;
  }

  if (internalTarget.blockId) {
    const didScroll = scrollEditorToBlockFromLink(link, internalTarget.blockId);
    if (!didScroll && (internalTarget.noteId || internalTarget.notePath)) {
      context.onOpenInternalLink?.({ ...internalTarget, sourceHtml: context.getCurrentHtml?.() });
    }
  }

  return true;
};

const getInternalLinkTarget = (
  link: HTMLAnchorElement,
  notes: EditorNoteReference[],
): InternalLinkTarget | null => {
  const href = link.getAttribute("href") ?? "";
  const noteId = link.getAttribute("data-opaline-link") ?? undefined;
  const explicitBlockId = link.getAttribute("data-opaline-block-ref");
  const textTarget = resolveInternalLinkText(link.textContent ?? "", notes);
  let notePath: string | undefined;
  let blockId = explicitBlockId ?? textTarget?.blockId ?? null;

  if (href.startsWith("#")) {
    blockId = blockId ?? decodeURIComponent(href.slice(1));
    return mergeInternalTargets({ noteId, blockId }, textTarget);
  }

  let parsed: URL;
  try {
    parsed = new URL(href, window.location.href);
  } catch {
    return mergeInternalTargets(noteId ? { noteId, blockId } : null, textTarget);
  }

  if (parsed.origin !== window.location.origin) {
    return mergeInternalTargets(noteId ? { noteId, blockId } : null, textTarget);
  }

  if (parsed.hash) {
    blockId = blockId ?? decodeURIComponent(parsed.hash.slice(1));
  }

  const parsedPath = normalizeNoteHrefPath(parsed.pathname);
  const currentPath = normalizeNoteHrefPath(window.location.pathname);
  if (parsedPath && parsedPath !== currentPath) {
    notePath = parsedPath;
  }

  return mergeInternalTargets(
    noteId || notePath || blockId ? { noteId, notePath, blockId } : null,
    textTarget,
  );
};

const scrollEditorToBlock = (
  editor: NonNullable<ReturnType<typeof useEditor>>,
  blockId: string,
) => {
  return revealBlockTarget(findBlockTarget(editor.view.dom, blockId));
};

const scrollEditorToBlockFromLink = (link: HTMLAnchorElement, blockId: string) => {
  const surface = link.closest(".editor-surface");

  return revealBlockTarget(surface ? findBlockTarget(surface, blockId, link) : null);
};

const findBlockTarget = (root: ParentNode, blockId: string, sourceLink?: HTMLAnchorElement) => {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      `[data-opaline-block-id="${cssEscape(blockId)}"], #${cssEscape(blockId)}`,
    ),
  );

  return (
    candidates.find((element) => element !== sourceLink && element.tagName.toLowerCase() !== "a") ??
    candidates.find((element) => element !== sourceLink) ??
    null
  );
};

const revealBlockTarget = (targetBlock: HTMLElement | null) => {
  if (!targetBlock) return false;

  targetBlock.scrollIntoView({ block: "center", behavior: "smooth" });
  targetBlock.classList.add("is-block-link-target");
  targetBlock.setAttribute("data-opaline-highlighted-block", "true");
  window.setTimeout(() => showBlockTargetMarker(targetBlock), 180);
  window.setTimeout(() => {
    targetBlock.classList.remove("is-block-link-target");
    targetBlock.removeAttribute("data-opaline-highlighted-block");
  }, 3200);
  return true;
};

const showBlockTargetMarker = (targetBlock: HTMLElement) => {
  const scrollBox = targetBlock.closest<HTMLElement>(".editor-scroll");
  if (!scrollBox) return;

  document
    .querySelectorAll(".block-link-target-marker, .block-link-target-outline")
    .forEach((marker) => marker.remove());

  const outline = document.createElement("div");
  outline.className = "block-link-target-outline";
  const marker = document.createElement("div");
  marker.className = "block-link-target-marker";
  marker.textContent = "链接目标";
  scrollBox.append(outline);
  scrollBox.append(marker);

  const updatePosition = () => {
    const rect = targetBlock.getBoundingClientRect();
    const scrollRect = scrollBox.getBoundingClientRect();
    const left = rect.left - scrollRect.left + scrollBox.scrollLeft;
    const top = rect.top - scrollRect.top + scrollBox.scrollTop;

    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    outline.style.left = `${left - 8}px`;
    outline.style.top = `${top - 6}px`;
    outline.style.width = `${Math.max(28, rect.width + 16)}px`;
    outline.style.height = `${Math.max(28, rect.height + 12)}px`;
    marker.style.left = `${left + 8}px`;
    marker.style.top = `${top - 8}px`;
  };

  updatePosition();
  const interval = window.setInterval(updatePosition, 120);
  window.setTimeout(() => {
    window.clearInterval(interval);
    outline.remove();
    marker.remove();
  }, 3200);
};

const normalizeNoteHrefPath = (value: string) =>
  decodeURIComponent(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^notes\//, "");

const resolveInternalLinkText = (
  value: string,
  notes: EditorNoteReference[],
): InternalLinkTarget | null => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const [title, blockId] = splitVisibleBlockRef(normalized);
  if (!blockId) return null;

  const note = notes.find((item) => item.title.toLowerCase() === title.toLowerCase());
  if (!note) return null;

  return {
    noteId: note.id,
    notePath: relativeNoteHref(note.path),
    blockId,
  };
};

const splitVisibleBlockRef = (value: string): [string, string | null] => {
  const hashIndex = value.lastIndexOf("#");
  if (hashIndex === -1) return [value.trim(), null];
  const title = value.slice(0, hashIndex).trim();
  const blockId = value.slice(hashIndex + 1).trim();
  return title && blockId ? [title, blockId] : [value.trim(), null];
};

const mergeInternalTargets = (
  primary: InternalLinkTarget | null,
  fallback: InternalLinkTarget | null,
): InternalLinkTarget | null => {
  if (!primary) return fallback;
  if (!fallback) return primary;

  return {
    noteId: primary.noteId ?? fallback.noteId,
    notePath: primary.notePath ?? fallback.notePath,
    blockId: primary.blockId ?? fallback.blockId,
  };
};

type AtomicLinkTarget = {
  id: string;
  kind: "heading" | "block";
  label: string;
  detail: string;
};

const openAtomicLinkDialog = (
  editor: NonNullable<ReturnType<typeof useEditor>>,
  onChange: (html: string) => void,
  setOpen: (open: boolean) => void,
) => {
  ensureEditorBlockIds(editor, onChange);
  setOpen(true);
};

const ensureEditorBlockIds = (
  editor: NonNullable<ReturnType<typeof useEditor>>,
  onChange: (html: string) => void,
) => {
  const current = editor.getHTML();
  const withIds = assignBlockIds(current);
  if (withIds !== current) {
    editor.commands.setContent(withIds, false);
    onChange(withIds);
  }
  return withIds;
};

const copyCurrentBlockLink = async (
  editor: NonNullable<ReturnType<typeof useEditor>>,
  currentNote: { id: string; title: string; path: string } | null,
  onChange: (html: string) => void,
) => {
  if (!currentNote) {
    window.alert("请先打开一篇笔记。");
    return;
  }

  ensureEditorBlockIds(editor, onChange);
  const blockId = currentBlockId(editor) ?? listBlockIds(editor.getHTML())[0]?.id;
  if (!blockId) {
    window.alert("当前没有可复制的块链接。");
    return;
  }

  const plainText = `[[${currentNote.title}#${blockId}]]`;
  const linkText = `${currentNote.title}#${blockId}`;
  const href = `${relativeNoteHref(currentNote.path)}#${blockId}`;
  const linkHtml = `<a href="${escapeAttribute(href)}" data-opaline-link="${escapeAttribute(currentNote.id)}" data-opaline-link-kind="block" data-opaline-block-ref="${escapeAttribute(blockId)}">${escapeHtml(linkText)}</a>`;
  await writeClipboardLink(plainText, linkHtml);
};

const writeClipboardLink = async (plainText: string, html: string) => {
  const clipboardItem = typeof ClipboardItem !== "undefined" ? ClipboardItem : null;
  if (clipboardItem && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new clipboardItem({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return;
    } catch {
      await navigator.clipboard?.writeText(plainText);
      return;
    }
  }

  await navigator.clipboard?.writeText(plainText);
};

const currentBlockId = (editor: NonNullable<ReturnType<typeof useEditor>>) => {
  const { from } = editor.state.selection;
  const domAtPos = editor.view.domAtPos(from).node;
  const element =
    domAtPos.nodeType === Node.ELEMENT_NODE
      ? (domAtPos as Element)
      : (domAtPos.parentElement as Element | null);
  return element?.closest("[data-opaline-block-id]")?.getAttribute("data-opaline-block-id") ?? null;
};

function AtomicLinkDialog({
  editor,
  open,
  currentNote,
  onChange,
  onClose,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  open: boolean;
  currentNote: { id: string; title: string; path: string } | null;
  onChange: (html: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  if (!open) return null;

  const html = editor.getHTML();
  const blocks = listBlockIds(html);
  const targets: AtomicLinkTarget[] = blocks.map((block) => {
    const isHeading = /^h[1-6]$/.test(block.tag);
    return {
      id: block.id,
      kind: isHeading ? "heading" : "block",
      label: block.text || block.id,
      detail: isHeading ? `${block.tag.toUpperCase()} · #${block.id}` : `${block.tag} · #${block.id}`,
    };
  });
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTargets = normalizedQuery
    ? targets.filter((target) => `${target.label} ${target.detail}`.toLowerCase().includes(normalizedQuery))
    : targets;

  const pick = (target: AtomicLinkTarget) => {
    if (!currentNote) return;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, " ").trim();
    const text = selected || target.label || target.id;
    insertMarkedLink(editor, { from, to }, text, {
      href: `#${target.id}`,
      opalineLink: currentNote.id,
      opalineLinkKind: target.kind,
      opalineBlockRef: target.kind === "block" ? target.id : null,
      opalineHeading: target.kind === "heading" ? target.label : null,
    });
    onChange(editor.getHTML());
    onClose();
  };

  return (
    <div className="insert-popover" role="dialog" aria-modal="true" aria-label="链接到本篇标题或段落">
      <div className="insert-card atomic-link-dialog">
        <header>
          <strong>链接到本篇标题/段落</strong>
          <p>选择当前笔记里的标题、段落、表格或块。链接会使用稳定 ID，不靠第几段这种脆弱位置。</p>
        </header>
        {!currentNote ? (
          <p className="muted">请先打开一篇笔记。</p>
        ) : (
          <>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="筛选标题、段落、表格或块 ID"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Escape") onClose();
                if (event.key === "Enter" && visibleTargets[0]) pick(visibleTargets[0]);
              }}
            />
            <div className="atomic-link-list">
              {visibleTargets.slice(0, 40).map((target) => (
                <button key={`${target.kind}-${target.id}`} type="button" onClick={() => pick(target)}>
                  <span className={`relation-kind is-${target.kind}`}>{target.kind === "heading" ? "标题" : "块"}</span>
                  <strong>{target.label}</strong>
                  <small>{target.detail}</small>
                </button>
              ))}
              {!visibleTargets.length ? <p className="muted">没有匹配的标题或块。</p> : null}
            </div>
          </>
        )}
        <div className="insert-actions">
          <button type="button" className="dialog-secondary" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

function InsertDialog({
  editor,
  state,
  onClose,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  state: InsertDialogState | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(state?.value ?? "");
  }, [state]);

  if (!state) return null;

  const isTextArea = state.type === "mermaid" || state.type === "math-block";
  const titleMap: Record<InsertDialogState["type"], string> = {
    link: "添加网页链接",
    "math-inline": "插入行内公式",
    "math-block": "插入公式块",
    mermaid: "设计图表",
  };
  const helpMap: Record<InsertDialogState["type"], string> = {
    link: "链到外部 URL。清空后会移除当前链接。",
    "math-inline": "输入 LaTeX，插入为行内公式。",
    "math-block": "输入 LaTeX，插入为居中的公式块。",
    mermaid: "选择一个模板或编辑图表结构，插入后页面里显示为图表。",
  };

  const apply = () => {
    const trimmed = value.trim();
    if (state.type === "link") {
      if (!trimmed) {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
      } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
      }
    }
    if (state.type === "math-inline" && trimmed) editor.chain().focus().setMathInline(trimmed).run();
    if (state.type === "math-block" && trimmed) editor.chain().focus().setMathBlock(trimmed).run();
    if (state.type === "mermaid" && trimmed) editor.chain().focus().setMermaidBlock(trimmed).run();
    onClose();
  };

  const templates = [
    { label: "流程图", value: "graph TD\n  A[开始] --> B[处理]\n  B --> C[完成]" },
    { label: "左右流程", value: "graph LR\n  A[想法] --> B[证据]\n  B --> C[结论]" },
    { label: "时序图", value: "sequenceDiagram\n  participant A as 用户\n  participant B as Opaline\n  A->>B: 创建笔记\n  B-->>A: 保存 HTML" },
  ];

  return (
    <div className="insert-popover" role="dialog" aria-modal="true" aria-label={titleMap[state.type]}>
      <div className="insert-card">
        <header>
          <strong>{titleMap[state.type]}</strong>
          <p>{helpMap[state.type]}</p>
        </header>
        {state.type === "mermaid" ? (
          <div className="template-row">
            {templates.map((template) => (
              <button key={template.label} type="button" onClick={() => setValue(template.value)}>
                {template.label}
              </button>
            ))}
          </div>
        ) : null}
        {isTextArea ? (
          <textarea value={value} onChange={(event) => setValue(event.target.value)} rows={7} autoFocus />
        ) : (
          <input value={value} onChange={(event) => setValue(event.target.value)} autoFocus onKeyDown={(event) => {
            if (event.key === "Enter") apply();
            if (event.key === "Escape") onClose();
          }} />
        )}
        <div className="insert-actions">
          <button type="button" className="dialog-secondary" onClick={onClose}>取消</button>
          <button type="button" className="dialog-primary" onClick={apply}>插入</button>
        </div>
      </div>
    </div>
  );
}

type WidgetOption = {
  type: string;
  label: string;
  description: string;
  plugin?: string;
};

function WidgetInsertDialog({
  editor,
  open,
  onClose,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  open: boolean;
  onClose: () => void;
}) {
  const [selectedType, setSelectedType] = useState("local-graph");
  const [title, setTitle] = useState("当前笔记邻域");
  const [target, setTarget] = useState("192.168.31.1");
  const [endpoint, setEndpoint] = useState("");
  const [refresh, setRefresh] = useState("2s");
  const [query, setQuery] = useState("");
  const options: WidgetOption[] = useMemo(() => {
    const installedPlugins = open ? loadInstalledPluginsFromCache() : [];
    return [
      ...BUILT_IN_WIDGETS.map((widget) => ({
        type: widget.type,
        label: widget.label,
        description: widget.description,
      })),
      ...installedPlugins.flatMap((plugin) =>
        plugin.widgets.map((widget: InstalledPluginWidget) => ({
          type: widget.type,
          label: widget.label || widget.type,
          description: `${plugin.name} · ${widget.script}`,
          plugin: plugin.id,
        })),
      ),
    ];
  }, [open]);
  const selected = options.find((option) => option.type === selectedType) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const first = options[0];
    if (first && !options.some((option) => option.type === selectedType)) {
      setSelectedType(first.type);
      setTitle(first.label);
    }
  }, [open, options, selectedType]);

  if (!open) return null;

  const pick = (option: WidgetOption) => {
    setSelectedType(option.type);
    setTitle(option.label);
    if (option.type === "ping-monitor") {
      setTarget("192.168.31.1");
      setRefresh("2s");
      setEndpoint("");
    }
    if (option.type === "tcp-check") {
      setTarget("192.168.31.1");
      setEndpoint("80");
      setRefresh("5s");
    }
  };

  const insert = () => {
    const option = selected ?? { type: selectedType, label: title };
    editor.chain().focus().insertOpalineWidget({
      type: option.type,
      title: title.trim() || option.label || option.type,
      query: query.trim(),
      target: target.trim(),
      endpoint: endpoint.trim(),
      refresh: refresh.trim(),
      plugin: option.plugin || "",
    }).run();
    onClose();
  };

  return (
    <div className="insert-popover" role="dialog" aria-modal="true" aria-label="插入组件">
      <div className="insert-card widget-insert-card">
        <header>
          <strong>插入组件</strong>
          <p>从内置组件或 .opaline/plugins 里的扩展组件选择一个组件，填参数后插入到当前笔记。</p>
        </header>
        <div className="widget-picker-grid">
          <div className="widget-option-list">
            {options.map((option) => (
              <button
                key={`${option.plugin || "builtin"}-${option.type}`}
                type="button"
                className={option.type === selectedType ? "is-active" : ""}
                onClick={() => pick(option)}
              >
                <strong>{option.label}</strong>
                <small>{option.type}</small>
              </button>
            ))}
            {!options.length ? <p className="muted">还没有可插入组件。</p> : null}
          </div>
          <div className="widget-field-grid">
            <label>
              <span>标题</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              <span>类型</span>
              <input value={selected?.type ?? selectedType} readOnly />
            </label>
            <label>
              <span>目标 / target</span>
              <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="192.168.31.1" />
            </label>
            <label>
              <span>端口或路径 / endpoint</span>
              <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="80 或 /status" />
            </label>
            <label>
              <span>刷新间隔</span>
              <input value={refresh} onChange={(event) => setRefresh(event.target.value)} placeholder="2s" />
            </label>
            <label>
              <span>查询 / 命令</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="可选" />
            </label>
            <p>{selected?.description}</p>
          </div>
        </div>
        <div className="insert-actions">
          <button type="button" className="dialog-secondary" onClick={onClose}>取消</button>
          <button type="button" className="dialog-primary" onClick={insert} disabled={!selected}>插入组件</button>
        </div>
      </div>
    </div>
  );
}

function EditorContextMenu({
  editor,
  state,
  onClose,
  onNoteLink,
  onAtomicLink,
  onCopyBlockLink,
  onWebLink,
  onImage,
  onMathInline,
  onAiAction,
  onEmbedNote,
  canLinkNote,
  canEmbedNote,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  state: ContextMenuState | null;
  onClose: () => void;
  onNoteLink: () => void;
  onAtomicLink: () => void;
  onCopyBlockLink: () => void | Promise<void>;
  onWebLink: () => void;
  onImage: () => void;
  onMathInline: () => void;
  onAiAction: (action: AiEditorAction) => void;
  onEmbedNote: () => void;
  canLinkNote: boolean;
  canEmbedNote: boolean;
}) {
  const { t } = useI18n();
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const submenuCloseTimer = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuStyle = useConstrainedMenuPosition(state, menuRef);

  const clearSubmenuCloseTimer = () => {
    if (submenuCloseTimer.current !== null) {
      window.clearTimeout(submenuCloseTimer.current);
      submenuCloseTimer.current = null;
    }
  };

  const openSubmenu = (id: string) => {
    clearSubmenuCloseTimer();
    setActiveSubmenu(id);
  };

  const closeSubmenuSoon = (id: string) => {
    clearSubmenuCloseTimer();
    submenuCloseTimer.current = window.setTimeout(() => {
      setActiveSubmenu((current) => (current === id ? null : current));
    }, 180);
  };

  useEffect(() => {
    if (!state) {
      setActiveSubmenu(null);
    }
    return clearSubmenuCloseTimer;
  }, [state]);

  if (!state) return null;

  const run = (action: () => unknown | Promise<unknown>) => {
    void Promise.resolve(action()).finally(onClose);
  };

  const selectedText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " ");
  const canPaste = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText);

  return (
    <div
      ref={menuRef}
      className="editor-context-menu"
      style={menuStyle}
      role="menu"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ContextMenuItem icon={<LinkIcon size={17} />} label="链接到其他笔记..." disabled={!canLinkNote} onClick={() => run(onNoteLink)} />
      <ContextMenuItem icon={<LinkIcon size={17} />} label="链接到本篇标题/段落..." onClick={() => run(onAtomicLink)} />
      <ContextMenuItem icon={<Copy size={17} />} label="复制这段的链接" onClick={() => run(onCopyBlockLink)} />
      <ContextMenuItem
        icon={<LinkIcon size={17} />}
        label="添加网页链接..."
        onClick={() => run(onWebLink)}
      />
      <ContextMenuSeparator />
      <ContextMenuItem
        icon={<Search size={17} />}
        label={selectedText ? `查找“${truncateLabel(selectedText)}”` : "查找选中文本"}
        disabled={!selectedText}
        onClick={() => run(() => {
          const findInPage = (window as Window & { find?: (query: string) => boolean }).find;
          if (selectedText && findInPage) findInPage(selectedText);
        })}
      />
      {canEmbedNote ? (
        <ContextMenuItem
          icon={<FileImage size={17} />}
          label="嵌入其他笔记"
          onClick={() => run(onEmbedNote)}
        />
      ) : null}
      <ContextMenuSubmenu
        id="ai"
        icon={<Brain size={17} />}
        label="AI 助手"
        active={activeSubmenu === "ai"}
        onOpen={openSubmenu}
        onCloseSoon={closeSubmenuSoon}
      >
        <ContextMenuItem icon={<Sparkles size={17} />} label="生成摘要" onClick={() => run(() => onAiAction("summary"))} />
        <ContextMenuItem icon={<TextSearch size={17} />} label="建议标题" onClick={() => run(() => onAiAction("title"))} />
        <ContextMenuItem icon={<Tag size={17} />} label="提取标签" onClick={() => run(() => onAiAction("tags"))} />
      </ContextMenuSubmenu>
      <ContextMenuSubmenu
        id="format"
        icon={<Bold size={17} />}
        label="文本格式"
        active={activeSubmenu === "format"}
        onOpen={openSubmenu}
        onCloseSoon={closeSubmenuSoon}
      >
        <ContextMenuItem icon={<Bold size={17} />} label="加粗" active={editor.isActive("bold")} onClick={() => run(() => editor.chain().focus().toggleBold().run())} />
        <ContextMenuItem icon={<Italic size={17} />} label="倾斜" active={editor.isActive("italic")} onClick={() => run(() => editor.chain().focus().toggleItalic().run())} />
        <ContextMenuItem icon={<span className="context-menu-symbol">S</span>} label="删除线" active={editor.isActive("strike")} onClick={() => run(() => editor.chain().focus().toggleStrike().run())} />
        <ContextMenuItem icon={<Code2 size={17} />} label="代码" active={editor.isActive("code")} onClick={() => run(() => editor.chain().focus().toggleCode().run())} />
        <ContextMenuItem icon={<Pi size={17} />} label="数学" onClick={() => run(onMathInline)} />
        <ContextMenuItem icon={<span className="context-menu-symbol">⌫</span>} label="清除格式" onClick={() => run(() => editor.chain().focus().unsetAllMarks().clearNodes().run())} />
      </ContextMenuSubmenu>
      <ContextMenuSubmenu
        id="paragraph"
        icon={<span className="context-menu-symbol">¶</span>}
        label="段落设置"
        active={activeSubmenu === "paragraph"}
        onOpen={openSubmenu}
        onCloseSoon={closeSubmenuSoon}
      >
        <ContextMenuItem icon={<List size={17} />} label="无序列表" active={editor.isActive("bulletList")} onClick={() => run(() => editor.chain().focus().toggleBulletList().run())} />
        <ContextMenuItem icon={<ListOrdered size={17} />} label="有序列表" active={editor.isActive("orderedList")} onClick={() => run(() => editor.chain().focus().toggleOrderedList().run())} />
        <ContextMenuItem icon={<CheckSquare size={17} />} label="任务列表" active={editor.isActive("taskList")} onClick={() => run(() => editor.chain().focus().toggleTaskList().run())} />
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Heading1 size={17} />} label="1级标题" active={editor.isActive("heading", { level: 1 })} onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 1 }).run())} />
        <ContextMenuItem icon={<Heading2 size={17} />} label="2级标题" active={editor.isActive("heading", { level: 2 })} onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())} />
        <ContextMenuItem icon={<span className="context-menu-symbol">H3</span>} label="3级标题" active={editor.isActive("heading", { level: 3 })} onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 3 }).run())} />
        <ContextMenuItem icon={<span className="context-menu-symbol">H4</span>} label="4级标题" active={editor.isActive("heading", { level: 4 })} onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 4 }).run())} />
        <ContextMenuItem icon={<span className="context-menu-symbol">H5</span>} label="5级标题" active={editor.isActive("heading", { level: 5 })} onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 5 }).run())} />
        <ContextMenuItem icon={<span className="context-menu-symbol">H6</span>} label="6级标题" active={editor.isActive("heading", { level: 6 })} onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 6 }).run())} />
        <ContextMenuItem icon={<span className="context-menu-symbol">¶</span>} label="正文" active={editor.isActive("paragraph")} onClick={() => run(() => editor.chain().focus().setParagraph().run())} />
        <ContextMenuSeparator />
        <ContextMenuItem icon={<span className="context-menu-symbol">❝</span>} label="引用" active={editor.isActive("blockquote")} onClick={() => run(() => editor.chain().focus().toggleBlockquote().run())} />
      </ContextMenuSubmenu>
      <ContextMenuSubmenu
        id="insert"
        icon={<TextCursorInput size={17} />}
        label="插入"
        active={activeSubmenu === "insert"}
        onOpen={openSubmenu}
        onCloseSoon={closeSubmenuSoon}
      >
        <ContextMenuItem icon={<FileImage size={17} />} label="图片" onClick={() => run(onImage)} />
        <ContextMenuItem icon={<Table2 size={17} />} label="表格" onClick={() => run(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())} />
        <ContextMenuItem icon={<MessageSquareQuote size={17} />} label={t("editor.callout")} onClick={() => run(() => insertCallout(editor, t))} />
        <ContextMenuItem icon={<Columns2 size={17} />} label="双栏块" onClick={() => run(() => editor.chain().focus().insertTwoColumnLayout().run())} />
      </ContextMenuSubmenu>
      <ContextMenuSeparator />
      <ContextMenuItem icon={<TextCursorInput size={17} />} label="剪切" onClick={() => run(() => document.execCommand("cut"))} />
      <ContextMenuItem icon={<TextCursorInput size={17} />} label="复制" onClick={() => run(() => document.execCommand("copy"))} />
      <ContextMenuItem icon={<TextCursorInput size={17} />} label="粘贴" disabled={!canPaste} onClick={() => run(async () => {
        const text = await navigator.clipboard.readText();
        editor.chain().focus().insertContent(text).run();
      })} />
      <ContextMenuItem icon={<TextCursorInput size={17} />} label="以纯文本形式粘贴" disabled={!canPaste} onClick={() => run(async () => {
        const text = await navigator.clipboard.readText();
        editor.chain().focus().insertContent(text).run();
      })} />
      <ContextMenuItem icon={<TextCursorInput size={17} />} label="全选" onClick={() => run(() => editor.chain().focus().selectAll().run())} />
    </div>
  );
}

function ContextMenuItem({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" className={active ? "context-menu-item is-active" : "context-menu-item"} disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ContextMenuSubmenu({
  id,
  icon,
  label,
  active,
  onOpen,
  onCloseSoon,
  children,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  onOpen: (id: string) => void;
  onCloseSoon: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div
      className={active ? "context-menu-submenu is-open" : "context-menu-submenu"}
      onMouseEnter={() => onOpen(id)}
      onMouseLeave={() => onCloseSoon(id)}
    >
      <button type="button" className="context-menu-item" onFocus={() => onOpen(id)} onClick={() => onOpen(id)}>
        {icon}
        <span>{label}</span>
        <span className="context-menu-arrow">›</span>
      </button>
      <div className="context-submenu-panel" onMouseEnter={() => onOpen(id)} onMouseLeave={() => onCloseSoon(id)}>
        {children}
      </div>
    </div>
  );
}

function ContextMenuSeparator() {
  return <span className="context-menu-separator" role="separator" />;
}

function NoteLinkDialog({
  editor,
  open,
  onChange,
  onSearchNotes,
  onClose,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  open: boolean;
  onChange: (html: string) => void;
  onSearchNotes?: (query: string) => Promise<NoteSuggestion[]>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteSuggestion[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "empty">("idle");

  useEffect(() => {
    if (!open || !onSearchNotes) {
      return;
    }

    let cancelled = false;
    setStatus("loading");
    const timer = window.setTimeout(() => {
      void onSearchNotes(query).then((notes) => {
        if (cancelled) return;
        setResults(notes);
        setStatus(notes.length ? "idle" : "empty");
      });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [onSearchNotes, open, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
    }
  }, [open]);

  if (!open || !onSearchNotes) return null;

  const pick = (note: NoteSuggestion) => {
    insertNoteLink(editor, note);
    onChange(editor.getHTML());
    onClose();
  };

  return (
    <div className="insert-popover" role="dialog" aria-modal="true" aria-label="链接到其他笔记">
      <div className="insert-card embed-note-dialog">
        <header>
          <strong>链接到其他笔记</strong>
          <p>搜索笔记，选中后把当前文字变成内部链接。没有选中文字时会插入笔记标题。</p>
        </header>
        <label className="embed-search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索笔记标题或正文"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter" && results[0]) pick(results[0]);
            }}
          />
        </label>
        <div className="embed-result-list" aria-label="可链接笔记">
          {results.map((note) => (
            <button key={note.id} type="button" onClick={() => pick(note)}>
              <strong>{note.title}</strong>
              <span>{note.excerpt || note.path}</span>
            </button>
          ))}
          {status === "loading" ? <p className="muted">正在搜索...</p> : null}
          {status === "empty" ? <p className="muted">没有找到匹配的笔记。</p> : null}
        </div>
        <div className="insert-actions">
          <button type="button" className="dialog-secondary" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

function EmbedNoteDialog({
  editor,
  open,
  onSearchNotes,
  onClose,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  open: boolean;
  onSearchNotes?: (query: string) => Promise<NoteSuggestion[]>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteSuggestion[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "empty">("idle");

  useEffect(() => {
    if (!open || !onSearchNotes) {
      return;
    }

    let cancelled = false;
    setStatus("loading");
    const timer = window.setTimeout(() => {
      void onSearchNotes(query).then((notes) => {
        if (cancelled) return;
        setResults(notes);
        setStatus(notes.length ? "idle" : "empty");
      });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [onSearchNotes, open, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
    }
  }, [open]);

  if (!open || !onSearchNotes) return null;

  const pick = (note: NoteSuggestion) => {
    insertEmbed(editor, note);
    onClose();
  };

  return (
    <div className="insert-popover" role="dialog" aria-modal="true" aria-label="嵌入笔记">
      <div className="insert-card embed-note-dialog">
        <header>
          <strong>嵌入笔记</strong>
          <p>把另一篇笔记插入为引用卡片，适合在当前正文里预览相关材料。</p>
        </header>
        <label className="embed-search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题或正文"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter" && results[0]) pick(results[0]);
            }}
          />
        </label>
        <div className="embed-result-list" aria-label="可嵌入笔记">
          {results.map((note) => (
            <button key={note.id} type="button" onClick={() => pick(note)}>
              <strong>{note.title}</strong>
              <span>{note.excerpt || "无摘要"}</span>
            </button>
          ))}
          {status === "loading" ? <p className="muted">正在搜索...</p> : null}
          {status === "empty" ? <p className="muted">没有找到匹配的笔记。</p> : null}
        </div>
        <div className="insert-actions">
          <button type="button" className="dialog-secondary" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

function AiResultDialog({
  editor,
  state,
  onClose,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  state: AiResultState | null;
  onClose: () => void;
}) {
  if (!state) return null;

  const canApply = state.status === "done" && state.result.trim().length > 0;
  const insertResult = () => {
    if (!canApply) return;
    editor.chain().focus().insertContent(plainTextToHtml(state.result)).run();
    onClose();
  };

  return (
    <div className="insert-popover" role="dialog" aria-modal="true" aria-label={state.title}>
      <div className="insert-card ai-result-card">
        <header>
          <strong>{state.title}</strong>
          <p>{state.status === "loading" ? "正在处理当前笔记。" : state.status === "error" ? "没有完成请求。" : "结果可复制，也可以插入到光标位置。"}</p>
        </header>
        <div className={`ai-editor-result is-${state.status}`}>
          {state.status === "loading" ? <Sparkles size={17} className="spinner" /> : null}
          <div>{state.result}</div>
        </div>
        <div className="insert-actions">
          <button type="button" className="dialog-secondary" onClick={onClose}>关闭</button>
          <button type="button" className="dialog-secondary" disabled={!canApply} onClick={() => void navigator.clipboard?.writeText(state.result)}>复制</button>
          <button type="button" className="dialog-primary" disabled={!canApply} onClick={insertResult}>插入</button>
        </div>
      </div>
    </div>
  );
}

const truncateLabel = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escapeAttribute = (value: string) => escapeHtml(value).replace(/"/g, "&quot;");

const plainTextToHtml = (value: string) =>
  value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
