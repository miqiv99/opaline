import type { NewNoteInput, NoteDocument, NoteSummary } from "../domain/note";
import type { WorkspaceAdapter } from "./workspaceAdapter";

const demoWorkspacePath = "demo://workspace";

const nowIso = () => new Date().toISOString();

const makeHtmlNote = (id: string, title: string, body: string, lang = "zh-Hans") => {
  const created = nowIso();

  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <meta name="opaline:id" content="${id}">
    <meta name="opaline:created" content="${created}">
    <meta name="opaline:updated" content="${created}">
  </head>
  <body>
    <article data-opaline-note>
      <h1>${title}</h1>
      ${body}
    </article>
  </body>
</html>`;
};

const seedNote: NoteDocument = {
  id: "demo-welcome-note",
  path: "notes/welcome.html",
  title: "欢迎使用 Opaline",
  updatedAt: nowIso(),
  tags: ["本地优先"],
  outgoingLinks: [],
  html: makeHtmlNote(
    "demo-welcome-note",
    "欢迎使用 Opaline",
    "<p>这是浏览器演示模式。桌面版会把笔记保存为工作区里的干净 HTML 文件。</p><p>先从打开工作区、创建笔记、编辑和保存开始。</p>",
  ),
};

let notes: NoteDocument[] = [seedNote];

export const demoWorkspaceAdapter: WorkspaceAdapter = {
  async chooseWorkspace() {
    return demoWorkspacePath;
  },

  async ensureWorkspace() {
    return;
  },

  async listNotes() {
    return notes.map(toSummary);
  },

  async createNote(_path: string, input: NewNoteInput) {
    const title = input.title.trim() || "未命名笔记";
    const id = crypto.randomUUID();
    const created = nowIso();
    const note: NoteDocument = {
      id,
      path: `notes/${slugify(title)}.html`,
      title,
      updatedAt: created,
      tags: [],
      outgoingLinks: [],
      html: makeHtmlNote(id, title, "<p></p>", input.lang),
    };

    notes = [note, ...notes];
    return note;
  },

  async readNote(_path: string, notePath: string) {
    const note = notes.find((item) => item.path === notePath);
    if (!note) {
      throw new Error(`找不到笔记：${notePath}`);
    }

    return note;
  },

  async saveNote(_path: string, note: NoteDocument) {
    const updated: NoteDocument = {
      ...note,
      updatedAt: nowIso(),
    };

    notes = notes.map((item) => (item.path === note.path ? updated : item));
    return updated;
  },
};

const toSummary = (note: NoteDocument): NoteSummary => ({
  id: note.id,
  path: note.path,
  title: note.title,
  updatedAt: note.updatedAt,
  tags: note.tags,
  outgoingLinks: note.outgoingLinks,
});

const slugify = (title: string) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
