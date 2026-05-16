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
import {
  Bold,
  Brain,
  CheckSquare,
  Code2,
  Columns2,
  FileImage,
  GitBranch,
  Heading1,
  Heading2,
  Italic,
  LinkIcon,
  List,
  ListOrdered,
  MessageSquareQuote,
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
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ImportedAsset } from "../domain/note";
import { SUMMARY_PROMPT, TAG_PROMPT, TITLE_PROMPT } from "../ai/adapter";
import { getAiAdapter, loadAiSettings } from "../ai/settings";
import { MathInline, MathBlock } from "./extensions/math";
import { MermaidBlock } from "./extensions/mermaid";
import { NoteEmbed } from "./extensions/embed";
import { BlockId } from "./extensions/blockId";
import { DisclosureBlock, DisclosureContent, DisclosureSummary, LayoutColumn, OpalineLayout } from "./extensions/layout";
import "katex/dist/katex.min.css";

export type NoteSuggestion = {
  id: string;
  title: string;
  path: string;
  excerpt: string;
};

type OpalineEditorProps = {
  content: string;
  isSaving: boolean;
  onChange: (html: string) => void;
  onSave: () => void;
  onImportAsset: (kind: "image" | "file") => Promise<ImportedAsset | null>;
  onSearchNotes?: (query: string) => Promise<NoteSuggestion[]>;
};

export function OpalineEditor({ content, isSaving, onChange, onSave, onImportAsset, onSearchNotes }: OpalineEditorProps) {
  const [dialog, setDialog] = useState<InsertDialogState | null>(null);
  const [aiResult, setAiResult] = useState<AiResultState | null>(null);
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Link.configure({
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
    if (!editor || editor.getHTML() === content) {
      return;
    }

    editor.commands.setContent(content, false);
  }, [content, editor]);

  if (!editor) {
    return <div className="editor-empty">正在准备编辑器...</div>;
  }

  return (
    <section className="editor-shell" onClick={() => setContextMenu(null)}>
      <div className="toolbar" aria-label="编辑工具栏">
        <IconButton label="撤销" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 size={17} />
        </IconButton>
        <IconButton label="重做" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 size={17} />
        </IconButton>
        <span className="toolbar-divider" />
        <IconButton label="标注块" onClick={() => insertCallout(editor)}>
          <MessageSquareQuote size={17} />
        </IconButton>
        <IconButton label="双栏布局" onClick={() => editor.chain().focus().insertTwoColumnLayout().run()}>
          <Columns2 size={17} />
        </IconButton>
        <IconButton label="对照布局" onClick={() => editor.chain().focus().insertCompareLayout().run()}>
          <TextCursorInput size={17} />
        </IconButton>
        <IconButton label="旁注布局" onClick={() => editor.chain().focus().insertSidenoteLayout().run()}>
          <PanelRight size={17} />
        </IconButton>
        <IconButton label="可展开说明" onClick={() => editor.chain().focus().insertDisclosureBlock().run()}>
          <span className="icon-math-display">⌄</span>
        </IconButton>
        <span className="toolbar-divider" />
        <IconButton label="行内公式" onClick={() => setDialog({ type: "math-inline", value: "x^2 + y^2 = 1" })}>
          <Pi size={17} />
        </IconButton>
        <IconButton label="公式块" onClick={() => setDialog({ type: "math-block", value: "\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}" })}>
          <span className="icon-math-display">∑</span>
        </IconButton>
        <IconButton label="插入图表" onClick={() => setDialog({ type: "mermaid", value: "graph TD\n  A[开始] --> B[完成]" })}>
          <GitBranch size={17} />
        </IconButton>
        {onSearchNotes ? (
          <IconButton label="嵌入笔记" onClick={() => setEmbedDialogOpen(true)}>
            <FileImage size={17} />
          </IconButton>
        ) : null}
        <button className="save-button" data-tooltip={isSaving ? "保存中" : "保存"} onClick={onSave} disabled={isSaving}>
          <Save size={17} />
          <span>{isSaving ? "保存中" : "保存"}</span>
        </button>
      </div>
      <EditorContent editor={editor} className="editor-scroll" />
      <EditorContextMenu
        editor={editor}
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onLink={() => openLinkDialog(editor, setDialog)}
        onImage={() => insertImage(editor, onImportAsset)}
        onMathInline={() => setDialog({ type: "math-inline", value: "x^2 + y^2 = 1" })}
        onAiAction={(action) => {
          void runEditorAiAction(editor, action, setAiResult);
        }}
        onEmbedNote={() => setEmbedDialogOpen(true)}
        canEmbedNote={Boolean(onSearchNotes)}
      />
      <InsertDialog editor={editor} state={dialog} onClose={() => setDialog(null)} />
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

const insertCallout = (editor: NonNullable<ReturnType<typeof useEditor>>) => {
  editor
    .chain()
    .focus()
    .insertContent(
      '<section data-opaline-callout="note"><p><strong>提示</strong></p><p>在这里写标注内容。</p></section><p></p>',
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
    link: "设置链接",
    "math-inline": "插入行内公式",
    "math-block": "插入公式块",
    mermaid: "设计图表",
  };
  const helpMap: Record<InsertDialogState["type"], string> = {
    link: "输入网页、文件或笔记链接。清空后会移除当前链接。",
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

function EditorContextMenu({
  editor,
  state,
  onClose,
  onLink,
  onImage,
  onMathInline,
  onAiAction,
  onEmbedNote,
  canEmbedNote,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  state: ContextMenuState | null;
  onClose: () => void;
  onLink: () => void;
  onImage: () => void;
  onMathInline: () => void;
  onAiAction: (action: AiEditorAction) => void;
  onEmbedNote: () => void;
  canEmbedNote: boolean;
}) {
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const submenuCloseTimer = useRef<number | null>(null);

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
      className="editor-context-menu"
      style={{ left: state.x, top: state.y }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ContextMenuItem icon={<LinkIcon size={17} />} label="新增链接" onClick={() => run(onLink)} />
      <ContextMenuItem
        icon={<LinkIcon size={17} />}
        label="新增外部链接"
        onClick={() => run(() => {
          const href = window.prompt("输入外部链接")?.trim();
          if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
        })}
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
        <ContextMenuItem icon={<MessageSquareQuote size={17} />} label="标注块" onClick={() => run(() => insertCallout(editor))} />
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

const plainTextToHtml = (value: string) =>
  value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
