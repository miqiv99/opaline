import type { AssetImport, NewNoteInput, NoteDocument, NoteSummary } from "../domain/note";
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

const seedTime = nowIso();
const seedNote: NoteDocument = {
  id: "demo-welcome-note",
  path: "notes/welcome.html",
  title: "欢迎使用 Opaline",
  createdAt: seedTime,
  updatedAt: seedTime,
  tags: ["本地优先"],
  headings: ["欢迎使用 Opaline"],
  outgoingLinks: [],
  favorite: true,
  html: makeHtmlNote(
    "demo-welcome-note",
    "欢迎使用 Opaline",
    "<p>这是浏览器演示模式。桌面版会把笔记保存为工作区里的干净 HTML 文件。</p><p>先从打开工作区、创建笔记、编辑、搜索和链接开始。</p>",
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
    return createDemoNote(input);
  },

  async createDailyNote() {
    return createDemoNote({ title: `日记 ${new Date().toLocaleDateString("zh-CN")}`, lang: "zh-Hans" });
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

  async searchNotes(_path: string, query: string) {
    const needle = query.trim().toLowerCase();
    return notes
      .filter((note) => !needle || `${note.title} ${note.html}`.toLowerCase().includes(needle))
      .map((note) => ({
        id: note.id,
        path: note.path,
        title: note.title,
        excerpt: note.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 150),
        updatedAt: note.updatedAt,
      }));
  },

  async listBacklinks(_path: string, noteId: string) {
    return notes
      .filter((note) => note.outgoingLinks.some((link) => link.targetId === noteId))
      .map((note) => ({
        id: note.id,
        path: note.path,
        title: note.title,
        excerpt: note.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 150),
        updatedAt: note.updatedAt,
      }));
  },

  async graphData() {
    return {
      nodes: notes.map((note) => ({ id: note.id, title: note.title, path: note.path })),
      edges: notes.flatMap((note) =>
        note.outgoingLinks.flatMap((link) => (link.targetId ? [{ source: note.id, target: link.targetId }] : [])),
      ),
      brokenLinks: notes.flatMap((note) => note.outgoingLinks.filter((link) => link.isBroken)),
    };
  },

  async toggleFavorite(_path: string, noteId: string) {
    let favorite = false;
    notes = notes.map((note) => {
      if (note.id !== noteId) {
        return note;
      }
      favorite = !note.favorite;
      return { ...note, favorite };
    });
    return favorite;
  },

  async importAsset(_path: string, input: AssetImport) {
    const name = input.sourcePath.split(/[\\/]/).pop() || "asset";
    return { name, href: input.kind === "image" ? `../assets/images/${name}` : `../assets/files/${name}` };
  },
};

const createDemoNote = (input: NewNoteInput) => {
  const title = input.title.trim() || "未命名笔记";
  const id = crypto.randomUUID();
  const created = nowIso();
  const note: NoteDocument = {
    id,
    path: `notes/${slugify(title)}.html`,
    title,
    createdAt: created,
    updatedAt: created,
    tags: [],
    headings: [title],
    outgoingLinks: [],
    favorite: false,
    html: makeHtmlNote(id, title, "<p></p>", input.lang),
  };

  notes = [note, ...notes];
  return note;
};

const toSummary = (note: NoteDocument): NoteSummary => ({
  id: note.id,
  path: note.path,
  title: note.title,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
  tags: note.tags,
  headings: note.headings,
  outgoingLinks: note.outgoingLinks,
  favorite: note.favorite,
});

const slugify = (title: string) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
