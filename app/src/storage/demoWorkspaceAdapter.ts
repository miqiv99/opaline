import type { AssetImport, NewNoteInput, NoteDocument, NoteHistoryEntry, NoteSummary } from "../domain/note";
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
let history: Record<string, NoteHistoryEntry[]> = {
  [seedNote.id]: [{
    id: seedTime,
    snapshotId: seedTime,
    timestamp: `${Date.parse(seedTime)}`,
    createdAt: seedTime,
    size: seedNote.html.length,
    title: seedNote.title,
  }],
};

export const demoWorkspaceAdapter: WorkspaceAdapter = {
  async defaultWorkspacePath() {
    return demoWorkspacePath;
  },

  async chooseWorkspace() {
    return demoWorkspacePath;
  },

  async ensureWorkspace() {
    return;
  },

  async createFolder() {
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

  async saveNote(_path: string, note: NoteDocument, options?: { createHistory?: boolean }) {
    const updated: NoteDocument = {
      ...note,
      updatedAt: nowIso(),
    };

    notes = notes.map((item) => (item.path === note.path ? updated : item));
    if (options?.createHistory !== false) addDemoHistory(updated);
    return updated;
  },

  async listNoteHistory(_path: string, _notePath: string, noteId: string) {
    return history[noteId] ?? [];
  },

  async readNoteHistory(_path: string, _notePath: string, noteId: string, snapshotId: string) {
    const note = notes.find((item) => item.id === noteId);
    const entry = history[noteId]?.find((item) => item.snapshotId === snapshotId);
    if (!note || !entry) throw new Error("找不到历史版本");
    return note.html;
  },

  async restoreNoteHistory(_path: string, _notePath: string, noteId: string) {
    const note = notes.find((item) => item.id === noteId);
    if (!note) throw new Error("找不到笔记");
    addDemoHistory(note);
    return note;
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
    const conceptNodes = new Map<string, { id: string; title: string; path: string; kind: "concept" }>();
    const conceptEdges = notes.flatMap((note) =>
      note.tags.map((tag) => {
        const id = conceptNodeId(tag);
        conceptNodes.set(id, { id, title: `#${tag}`, path: "", kind: "concept" });
        return {
          source: note.id,
          target: id,
          kind: "concept" as const,
          label: tag,
          targetHeading: null,
          targetBlockId: null,
          concept: tag,
        };
      }),
    );
    const outgoingEdges = notes.flatMap((note) =>
      note.outgoingLinks.flatMap((link) => {
        if (link.targetId) {
          return [{
            source: note.id,
            target: link.targetId,
            kind: link.kind ?? "note",
            label: link.label || link.href,
            targetHeading: link.targetHeading,
            targetBlockId: link.targetBlockId,
            concept: link.concept,
          }];
        }
        if ((link.kind ?? "note") === "concept" && link.concept) {
          const id = conceptNodeId(link.concept);
          conceptNodes.set(id, { id, title: `#${link.concept}`, path: "", kind: "concept" });
          return [{
            source: note.id,
            target: id,
            kind: "concept" as const,
            label: link.label || link.concept,
            targetHeading: null,
            targetBlockId: null,
            concept: link.concept,
          }];
        }
        return [];
      }),
    );

    return {
      nodes: [
        ...notes.map((note) => ({ id: note.id, title: note.title, path: note.path, kind: "note" as const })),
        ...conceptNodes.values(),
      ],
      edges: outgoingEdges.concat(conceptEdges),
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

  async readSettings() {
    try {
      const raw = localStorage.getItem("opaline-workspace-settings");
      if (raw) return JSON.parse(raw) as Record<string, unknown>;
    } catch { /* ignore */ }
    return { profileVersion: 1, noteFormat: "opaline-html" };
  },

  async importMarkdown(_path: string, markdown: string, title: string) {
    const { markdownToOpalineArticle } = await import("../editor/markdownImport");
    const body = markdownToOpalineArticle(markdown);
    return createDemoNote({ title, body, lang: "zh-Hans" });
  },

  async readFileText() {
    throw new Error("浏览器演示模式不支持读取本地文件");
  },

  async renameNote(_path: string, noteId: string, newTitle: string) {
    const note = notes.find((n) => n.id === noteId);
    if (!note) throw new Error("找不到笔记");
    const updated: NoteDocument = {
      ...note,
      title: newTitle,
      path: `${note.path.split("/").slice(0, -1).join("/")}/${slugify(newTitle)}.html`,
      html: note.html.replace(/<title>.*?<\/title>/, `<title>${newTitle}</title>`)
        .replace(/<h1>.*?<\/h1>/, `<h1>${newTitle}</h1>`),
    };
    notes = notes.map((n) => (n.id === noteId ? updated : n));
    return toSummary(updated);
  },

  async deleteNote(_path: string, noteId: string) {
    notes = notes.filter((n) => n.id !== noteId);
    notes = notes.map((n) => ({
      ...n,
      outgoingLinks: n.outgoingLinks.filter((l) => l.targetId !== noteId),
    }));
  },

  async moveNote(_path: string, noteId: string, newDirectory: string) {
    const note = notes.find((n) => n.id === noteId);
    if (!note) throw new Error("找不到笔记");
    const dir = newDirectory.replace(/^\/+|\/+$/g, "") || "notes";
    const updated: NoteDocument = { ...note, path: `${dir}/${note.path.split("/").pop()}` };
    notes = notes.map((n) => (n.id === noteId ? updated : n));
    return toSummary(updated);
  },

  async revealInExplorer(_path: string, notePath: string) {
    window.alert(`演示模式：文件路径 ${notePath}`);
  },

  async writeSettings(_path: string, settings: Record<string, unknown>) {
    localStorage.setItem("opaline-workspace-settings", JSON.stringify(settings));
  },

  async listLanguagePacks() {
    return [];
  },

  async openLanguagePacksFolder() {
    window.alert("演示模式不能打开本地语言包文件夹。桌面版会打开 .opaline/language-packs。");
  },

  async openPluginsFolder() {
    window.alert("演示模式不能打开本地扩展文件夹。桌面版会打开 .opaline/plugins。");
  },

  async listInstalledPlugins() {
    return [];
  },

  async copyWorkspace() {},

  async moveWorkspace() {},

  async writeExportFile(_filePath: string, _content: string) {},
};

const createDemoNote = (input: NewNoteInput) => {
  const title = input.title.trim() || "未命名笔记";
  const id = crypto.randomUUID();
  const created = nowIso();
  const directory = input.directory?.replace(/^\/+|\/+$/g, "") || "notes";
  const note: NoteDocument = {
    id,
    path: `${directory}/${slugify(title)}.html`,
    title,
    createdAt: created,
    updatedAt: created,
    tags: [],
    headings: [title],
    outgoingLinks: [],
    favorite: false,
    html: makeHtmlNote(id, title, input.body || "<p></p>", input.lang),
  };

  notes = [note, ...notes];
  addDemoHistory(note);
  return note;
};

const addDemoHistory = (note: NoteDocument) => {
  const createdAt = nowIso();
  const snapshot: NoteHistoryEntry = {
    id: createdAt,
    snapshotId: createdAt,
    timestamp: `${Date.parse(createdAt)}`,
    createdAt,
    size: note.html.length,
    title: note.title,
  };
  history = { ...history, [note.id]: [snapshot, ...(history[note.id] ?? [])] };
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

const conceptNodeId = (concept: string) => `concept:${concept.trim().toLowerCase()}`;
