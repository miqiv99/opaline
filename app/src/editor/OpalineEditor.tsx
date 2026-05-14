import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { Bold, Heading1, Heading2, Italic, LinkIcon, List, ListOrdered, Redo2, Save, Table2, Undo2 } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";

type OpalineEditorProps = {
  content: string;
  isSaving: boolean;
  onChange: (html: string) => void;
  onSave: () => void;
};

export function OpalineEditor({ content, isSaving, onChange, onSave }: OpalineEditorProps) {
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
      Placeholder.configure({
        placeholder: "写点东西，保存后就是一篇干净的 HTML 笔记...",
      }),
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
        <IconButton label="链接" onClick={() => setLink(editor)} active={editor.isActive("link")}>
          <LinkIcon size={17} />
        </IconButton>
        <IconButton label="插入表格" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Table2 size={17} />
        </IconButton>
        <button className="save-button" onClick={onSave} disabled={isSaving}>
          <Save size={17} />
          <span>{isSaving ? "保存中" : "保存"}</span>
        </button>
      </div>
      <EditorContent editor={editor} />
    </section>
  );
}

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

const setLink = (editor: NonNullable<ReturnType<typeof useEditor>>) => {
  const current = editor.getAttributes("link").href as string | undefined;
  const href = window.prompt("链接地址", current ?? "");

  if (href === null) {
    return;
  }

  if (href.trim() === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }

  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
};
