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
  Table2,
  TextCursorInput,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ImportedAsset } from "../domain/note";
import { MathInline, MathBlock } from "./extensions/math";
import { MermaidBlock } from "./extensions/mermaid";
import { NoteEmbed } from "./extensions/embed";
import { BlockId } from "./extensions/blockId";
import { LayoutColumn, OpalineLayout } from "./extensions/layout";
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
  onPickNote?: () => Promise<NoteSuggestion | null>;
};

export function OpalineEditor({ content, isSaving, onChange, onSave, onImportAsset, onPickNote }: OpalineEditorProps) {
  const [dialog, setDialog] = useState<InsertDialogState | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
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
    ],
    content,
    editorProps: {
      attributes: {
        class: "editor-surface",
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
    <section className="editor-shell">
      <div className="toolbar" aria-label="编辑工具栏">
        <IconButton label="撤销" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 size={17} />
        </IconButton>
        <IconButton label="重做" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 size={17} />
        </IconButton>
        <span className="toolbar-divider" />
        <IconButton label="一级标题" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })}>
          <Heading1 size={17} />
        </IconButton>
        <IconButton label="二级标题" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}>
          <Heading2 size={17} />
        </IconButton>
        <IconButton label="加粗" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
          <Bold size={17} />
        </IconButton>
        <IconButton label="斜体" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
          <Italic size={17} />
        </IconButton>
        <IconButton label="无序列表" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
          <List size={17} />
        </IconButton>
        <IconButton label="有序列表" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
          <ListOrdered size={17} />
        </IconButton>
        <IconButton label="任务列表" onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")}>
          <CheckSquare size={17} />
        </IconButton>
        <IconButton label="代码块" onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")}>
          <Code2 size={17} />
        </IconButton>
        <IconButton label="标注块" onClick={() => insertCallout(editor)}>
          <MessageSquareQuote size={17} />
        </IconButton>
        <IconButton label="链接" onClick={() => openLinkDialog(editor, setDialog)} active={editor.isActive("link")}>
          <LinkIcon size={17} />
        </IconButton>
        <IconButton label="插入图片" onClick={() => insertImage(editor, onImportAsset)}>
          <FileImage size={17} />
        </IconButton>
        <IconButton label="插入表格" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Table2 size={17} />
        </IconButton>
        <span className="toolbar-divider" />
        <IconButton label="双栏布局" onClick={() => editor.chain().focus().insertTwoColumnLayout().run()}>
          <Columns2 size={17} />
        </IconButton>
        <IconButton label="对照布局" onClick={() => editor.chain().focus().insertCompareLayout().run()}>
          <TextCursorInput size={17} />
        </IconButton>
        <IconButton label="旁注布局" onClick={() => editor.chain().focus().insertSidenoteLayout().run()}>
          <PanelRight size={17} />
        </IconButton>
        <IconButton label="折叠布局" onClick={() => editor.chain().focus().insertDetailsLayout().run()}>
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
        {onPickNote ? (
          <IconButton label="嵌入笔记" onClick={() => insertEmbed(editor, onPickNote)}>
            <FileImage size={17} />
          </IconButton>
        ) : null}
        <button className="save-button" onClick={onSave} disabled={isSaving}>
          <Save size={17} />
          <span>{isSaving ? "保存中" : "保存"}</span>
        </button>
      </div>
      <EditorContent editor={editor} />
      <InsertDialog editor={editor} state={dialog} onClose={() => setDialog(null)} />
    </section>
  );
}

type InsertDialogState =
  | { type: "link"; value: string }
  | { type: "math-inline"; value: string }
  | { type: "math-block"; value: string }
  | { type: "mermaid"; value: string };

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
      title={label}
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

const insertEmbed = async (
  editor: NonNullable<ReturnType<typeof useEditor>>,
  onPickNote: () => Promise<{ id: string; title: string; excerpt: string } | null>,
) => {
  const note = await onPickNote();
  if (!note) return;
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
