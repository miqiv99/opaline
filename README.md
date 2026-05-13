# diorite

diorite is a local-first note management app built around HTML as the native note format.

Obsidian treats Markdown files as the source of truth. diorite explores a different idea: notes should be rich HTML documents that remain portable, inspectable, editable, and publishable outside the app.

The project is planned around:

- Tauri 2
- React
- Tiptap
- SQLite
- Local folders as workspaces
- HTML notes as durable files
- AI-assisted writing, organization, search, and refactoring

## Vision

diorite should feel like a serious personal knowledge base, not just a rich text editor.

The goal is to combine:

- The file ownership and portability of Obsidian
- The rich editing comfort of modern document apps
- The local-first reliability of desktop software
- The programmable structure of HTML
- The leverage of AI coding and AI-native workflows

HTML is the core bet. A note can contain headings, links, images, tables, callouts, embedded media, semantic blocks, custom attributes, and eventually interactive components. This gives diorite room to grow beyond plain Markdown while still keeping notes readable and exportable.

## Product Principles

- Local-first by default.
- Notes should remain useful without diorite installed.
- HTML output should be clean, predictable, and version-control friendly.
- The editor should feel fast and calm.
- Search and links should make the workspace navigable at scale.
- AI should help organize knowledge, not trap user data in a black box.
- Desktop comes first, but the architecture should not block mobile or web later.

## Proposed Stack

### Desktop

- Tauri 2 for the native shell
- React for UI
- Tiptap for rich text editing
- SQLite for metadata, search indexes, backlinks, and app state
- File system storage for note documents and attachments

### Future Targets

- Windows
- macOS
- Linux
- iOS
- Android
- Web, with a different storage adapter

The desktop app should be the first-class target. Mobile can come later after the note format, storage model, and editor experience are stable.

## Repository Direction

The future app may use a structure like this:

```text
diorite/
  src/
    app/
    components/
    editor/
    features/
    lib/
    storage/
    styles/
  src-tauri/
  docs/
  examples/
  tests/
```

A user workspace may look like this:

```text
MyNotes/
  notes/
    index.html
    projects/
      diorite.html
  assets/
    images/
    files/
  .diorite/
    index.sqlite
    settings.json
    cache/
```

## HTML Note Format

diorite should define a clean HTML subset instead of saving arbitrary editor output.

Early notes can use a structure like:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Example Note</title>
    <meta name="diorite:id" content="note-id">
    <meta name="diorite:created" content="2026-05-13T00:00:00Z">
    <meta name="diorite:updated" content="2026-05-13T00:00:00Z">
  </head>
  <body>
    <article data-diorite-note>
      <h1>Example Note</h1>
      <p>This is a portable HTML note.</p>
    </article>
  </body>
</html>
```

Internal note links can later compile to:

```html
<a href="../projects/diorite.html" data-diorite-link="note-id">diorite</a>
```

Tags can use:

```html
<span data-diorite-tag="research">#research</span>
```

This keeps the document readable in browsers while preserving app-specific meaning.

## Development Phases

### Phase 0: Foundation

Set up the project and define the shape of the system.

- Initialize Tauri + React
- Choose package manager and formatter
- Add Tiptap editor baseline
- Add SQLite integration
- Define the first HTML note schema
- Decide workspace directory conventions
- Add basic test and build commands

### Phase 1: Usable Local Notes

Build the first version that is genuinely useful.

- Open a local workspace folder
- Create, rename, move, and delete notes
- Edit notes with Tiptap
- Save notes as HTML files
- Auto-save changes
- Show a file tree
- Show recent notes
- Add title and body search
- Support images and attachments
- Add light and dark themes

Success criteria: diorite can replace a simple local notes folder for daily writing.

### Phase 2: Knowledge Base Features

Make notes connect to each other.

- Support `[[note links]]`
- Resolve and update internal links
- Add backlinks
- Add tags
- Add daily notes
- Add favorites
- Add command palette
- Add full-text search index
- Track created and updated timestamps
- Add broken-link detection
- Add import from Markdown and HTML

Success criteria: diorite becomes useful for projects, research, and long-running personal knowledge.

### Phase 3: Rich HTML Blocks

Lean into HTML as the native format.

- Tables
- Task lists
- Callouts
- Code blocks with syntax highlighting
- Embeds
- Math
- Diagrams
- Bookmark cards
- Resizable images
- Custom block attributes
- Block IDs
- Block references

Success criteria: diorite can handle rich documents without becoming messy or opaque.

### Phase 4: AI-Native Workflows

Be ambitious here. AI coding and AI-assisted knowledge work are strong enough that diorite should treat AI as a core design pillar, not a plugin afterthought.

Possible capabilities:

- Summarize a note
- Generate note titles
- Extract tags automatically
- Suggest links to related notes
- Detect duplicate or overlapping notes
- Turn rough writing into structured outlines
- Refactor a long note into smaller connected notes
- Generate backlinks and missing index pages
- Create study questions from notes
- Chat with the current workspace
- Ask questions with citations to local notes
- Convert Markdown notes into clean diorite HTML
- Clean imported web pages into readable notes
- Build AI-assisted search over SQLite and local embeddings

The key rule: AI should propose changes clearly and keep the user in control.

### Phase 5: Graph, Timeline, and Structure

Add higher-level views over the workspace.

- Graph view
- Tag browser
- Timeline view
- Calendar view
- Outline view
- Project dashboards
- Saved searches
- Smart collections
- Workspace health checks

Success criteria: users can understand a large knowledge base without manually organizing every file.

### Phase 6: Sync, Publish, and Interop

Make diorite fit real workflows.

- Git-friendly note storage
- WebDAV or cloud-folder sync compatibility
- Static site export
- PDF export
- Markdown export
- HTML import and export
- Obsidian vault import
- Browser clipper
- Shareable read-only bundles

Success criteria: users trust that their notes are portable and not locked into the app.

### Phase 7: Mobile and Web

Move beyond desktop after the core is stable.

- Tauri mobile exploration for iOS and Android
- Mobile editor interaction design
- Mobile file permission model
- Web storage adapter using IndexedDB or OPFS
- Optional remote sync service
- Shared React component layer
- Shared domain and note-format logic

Success criteria: most product logic is reused, while storage and native capabilities are swapped per platform.

### Phase 8: Plugin and Theme System

Open the app to user customization.

- Theme API
- Custom CSS
- Plugin manifest
- Plugin permissions
- Custom commands
- Custom note transforms
- Custom block types
- Workspace automation hooks

Success criteria: diorite becomes a platform without sacrificing local trust.

## Editor Choice

diorite should start with Tiptap.

Tiptap gives a practical middle path:

- It is built on ProseMirror.
- It works well with React.
- It can output HTML.
- It has a mature extension model.
- It is easier to ship with than raw ProseMirror.
- It leaves room for advanced editor behavior later.

ProseMirror remains important because Tiptap is built on it. The project should expect to learn some ProseMirror concepts over time.

Lexical is also strong, but Tiptap is likely better for the first version because the note-taking and rich-document ecosystem around ProseMirror/Tiptap is deeper.

## Storage Model

Use both files and SQLite.

Files should store durable user content:

- HTML notes
- Images
- Attachments
- Exported assets

SQLite should store derived or app-specific data:

- Search index
- Backlinks
- Tags
- Recent notes
- Favorites
- Workspace settings
- AI embeddings, if enabled
- Cached metadata

This keeps user data portable while giving the app fast navigation and search.

## Architecture Notes

Keep platform-specific work behind adapters.

```text
React UI
  -> Editor layer
  -> Domain layer
  -> Storage adapter
      -> Tauri desktop file system
      -> Tauri mobile file system
      -> Web IndexedDB or OPFS
```

This separation matters if diorite later targets iOS, Android, or the web.

## Early Technical Questions

- Should each note be a full HTML document or an HTML fragment?
- Should note IDs be path-based, UUID-based, or both?
- How strict should the allowed HTML schema be?
- Should SQLite be per workspace or global?
- Should backlinks be computed eagerly or lazily?
- How should assets move when a note is moved?
- Should AI features be local-only, cloud-backed, or adapter-based?

## Short-Term Roadmap

1. Scaffold Tauri + React.
2. Add Tiptap with basic rich text editing.
3. Save and load one HTML note.
4. Add workspace folder support.
5. Add file tree and note list.
6. Add SQLite metadata.
7. Add search.
8. Add `[[note links]]`.
9. Add backlinks.
10. Add AI-assisted note cleanup and title/tag suggestions.

## License

Copyright (c) 2026 Enjun Lu.

diorite is licensed under the PolyForm Noncommercial License 1.0.0.

Noncommercial use is permitted under the terms in [LICENSE](LICENSE). Commercial use requires a separate commercial license from the author.
