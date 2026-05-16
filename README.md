# Opaline

Opaline is a local-first knowledge workspace built around clean HTML as the native note format.

This Markdown file is kept as the repository landing page. Start from [index.html](index.html) for the document portal. The project-native HTML documentation starts at [README.html](README.html), with split documents under [docs/](docs/). 中文 Markdown 见 [README.zh.md](README.zh.md)，中文 HTML 入口见 [README.zh.html](README.zh.html)。

It starts as a personal desktop note app, but the larger idea is broader: notes should be durable local documents that can be edited comfortably, searched deeply, linked together, published as webpages, and eventually queried by AI with clear citations.

Obsidian proved that local Markdown files can become a serious personal knowledge base. Opaline explores a related but different bet:

> Rich knowledge notes should be stored as clean local HTML, so every note is already a readable document, a publishable webpage, and a structured source for AI-assisted organization.

## Core Thesis

Opaline should not begin as a social platform, forum, website builder, or full Obsidian clone.

The first product should be a reliable local tool for one person:

```text
speak -> auto-record -> save -> search -> link -> publish later
```

The long-term direction can grow toward public knowledge sites and reader-facing AI search, but only after the local knowledge system is trustworthy.

## Current Product Loop

The current prototype now splits users naturally from the first screen:

- **认真记记** opens a more Obsidian-like workspace for users who know what they want to record.
- **随便记记** opens Today, where users can talk first and let the app turn the conversation into a durable daily HTML note.
- Today writes the user's raw text into the daily note before AI replies, so casual conversation becomes local knowledge instead of disposable chat.
- The serious workspace has a left ribbon, collapsible file pane, main HTML editor, and collapsible right inspector.
- The right inspector now contains note operations, outline, outgoing links, backlinks, and a small graph preview.
- Settings owns workspace location and AI configuration so the note/editor surface stays focused.

The immediate next product gap is workspace migration: changing the workspace location should offer to copy or move the previous workspace files with an explicit confirmation flow.

## Current Implementation Status

The current app is no longer only a scaffold. It already has the first usable desktop loop:

- Tauri + React + Tiptap app shell.
- Automatic default workspace under the user's documents folder.
- Workspace settings for changing the location.
- Local HTML note creation, loading, editing, saving, and auto-saving.
- Daily journal creation through Today.
- Today conversation capture that stores user and AI turns in the daily HTML note.
- AI settings with provider selection, custom API base URL, model name, API key, explicit save, model test, and model fetching.
- Clean Opaline HTML Profile helpers and tests.
- SQLite-backed metadata/search direction, with FTS participation already introduced for search.
- Link scanning for normal links, wiki-style note links, block references, backlinks, outgoing links, and broken links.
- Relationship data now distinguishes file-level, heading-level, block-level, and concept-level links for the graph model.
- The editor can copy a stable link to the current block and insert links to headings or blocks in the current note using stored block IDs.
- A controlled built-in widget placeholder exists for future live components through readable `<opaline-widget>` HTML, starting with a local-graph widget; it does not allow arbitrary note scripts.
- Rich editor blocks for callouts, two-column layouts, comparison layouts, sidenotes, disclosure blocks, tables, task lists, images, embeds, math, and Mermaid diagrams.
- Editor right-click menus for common formatting, paragraph styles, H1-H6 headings, insert actions, and clipboard actions.
- File-pane right-click menu for opening, duplicating, favoriting, and copying note paths.
- Obsidian-inspired serious workspace with a left ribbon, file explorer, collapsible left/right panels, graph preview, and a full graph view with relation-type filters, current-note neighborhood mode, and edge details.

Still rough:

- Workspace migration is not implemented yet.
- Ordinary-user UI for creating concept-level links from selected text is not implemented yet.
- File operations are still limited; rename, delete, move, reveal in system explorer, and history should be added deliberately.
- The editor UI still needs more polish so HTML-only advantages feel obvious without exposing raw HTML to users.
- Known residual issue: block links can open the target note and scroll to the target block, but the visible target highlight is still unreliable in the desktop editor and may not appear. This should be fixed in a focused follow-up.

## Positioning

Opaline is for people who accumulate knowledge over time:

- independent researchers
- writers
- developers
- students
- product thinkers
- technical creators
- anyone who wants local ownership without giving up rich documents

The first user is the author, not the public reader.

The early promise is:

> Your notes stay on your machine as clean HTML files, while Opaline gives you rich editing, fast search, links, metadata, and eventually AI-assisted retrieval and refactoring.

## Why HTML

HTML is not the goal by itself. The goal is durable rich knowledge.

HTML is attractive because it is:

- **Readable**: every note can open in a browser without Opaline.
- **Publishable**: the web already speaks HTML, so publishing needs less conversion.
- **Structured**: sections, figures, tables, callouts, annotations, embeds, and custom attributes can be represented directly.
- **AI-friendly**: headings, blocks, links, citations, and concept spans can give AI clearer context than plain text alone.
- **Interaction-friendly**: published pages can support text selection, popovers, hover previews, anchors, and concept search.
- **Portable**: clean HTML is an open format, not a private app database.

Markdown is excellent for plain-text notes. Opaline's bet is that long-term knowledge work often wants richer structure than Markdown can express without many incompatible extensions.

## HTML Risks

HTML can also fail badly if it becomes arbitrary editor output.

Opaline must avoid saving messy browser HTML like:

```html
<span style="font-size: 13.5pt;">
<div class="Apple-converted-space">
<p style="margin: 0;">
```

The project therefore needs an **Opaline HTML Profile**:

- a strict, predictable HTML subset
- stable serialization
- normalized pasted content
- deterministic attribute order where possible
- no editor-only classes in saved notes
- readable structure for Git diffs
- app-specific meaning stored with `data-opaline-*` attributes

The product advantage is not merely "using HTML". The advantage is maintaining clean HTML that remains useful for years.

## Product Principles

- Local-first by default.
- HTML files are the source of truth.
- The app should initialize a sensible default workspace automatically.
- Rough conversation can be a valid capture surface if it is recorded as local HTML.
- SQLite indexes are rebuildable.
- Notes should remain useful without Opaline installed.
- The editor should feel fast, calm, and serious.
- Search should help users recover old context, not only match keywords.
- AI should propose, explain, and cite. It should not silently rewrite knowledge.
- Publishing should be a natural consequence of the file format, not the first product.
- Public/community features should come after the personal tool is solid.

## Proposed Stack

### Desktop

- Tauri 2 for the native shell
- React for UI
- Tiptap on ProseMirror for rich editing
- SQLite for metadata, search indexes, links, backlinks, tags, app state, and optional embeddings
- File system storage for HTML notes and assets

### Future Targets

- Windows
- macOS
- Linux
- iOS
- Android
- Web with a different storage adapter

Desktop comes first. Mobile and web should be enabled by architecture, not forced into the first release.

## Workspace Model

On desktop, Opaline should create a default workspace in the user's documents folder under `Opaline`. Users can change that location from Settings, and the selected location is remembered. Changing location should eventually include a migration flow for moving existing notes and assets.

A user workspace may look like this:

```text
MyNotes/
  notes/
    index.html
    projects/
      opaline.html
  assets/
    images/
    files/
  .opaline/
    index.sqlite
    settings.json
    cache/
```

Rules:

- `notes/` stores durable user-authored HTML.
- `assets/` stores images and attachments.
- `.opaline/` stores rebuildable app metadata and cache.
- Deleting `.opaline/index.sqlite` should not destroy user content.
- The workspace should remain inspectable in normal file browsers.

## Note Format

Each note should be a complete HTML document, not only a fragment.

Early notes can use a structure like:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Example Note</title>
    <meta name="opaline:id" content="note-id">
    <meta name="opaline:created" content="2026-05-13T00:00:00Z">
    <meta name="opaline:updated" content="2026-05-13T00:00:00Z">
  </head>
  <body>
    <article data-opaline-note>
      <h1>Example Note</h1>
      <p>This is a portable HTML note.</p>
    </article>
  </body>
</html>
```

Internal links can compile to normal browser-readable links with Opaline metadata:

```html
<a href="../projects/opaline.html" data-opaline-link="note-id" data-opaline-link-kind="note">Opaline</a>
<a href="../projects/opaline.html#architecture" data-opaline-link="note-id" data-opaline-link-kind="heading">Architecture</a>
<a href="../projects/opaline.html#b-intro" data-opaline-link="note-id" data-opaline-link-kind="block" data-opaline-block-id="b-intro">intro block</a>
<a href="opaline://concept/RAG" data-opaline-link-kind="concept" data-opaline-concept="RAG">RAG</a>
```

Tags can remain readable while preserving meaning:

```html
<span data-opaline-tag="research">#research</span>
```

Blocks can later receive stable identifiers:

```html
<section id="b-introduction" data-opaline-block>
  <h2>Introduction</h2>
  <p>...</p>
</section>
```

Controlled live components are stored as readable custom elements rather than arbitrary scripts:

```html
<opaline-widget type="local-graph" title="Current note neighborhood">
  Opaline widget: Current note neighborhood
</opaline-widget>
```

The first built-in model is intentionally narrow: Opaline may render known widget types such as `query`, `chart`, and `local-graph`, while an unsupported widget still degrades to readable text in a browser or another editor.

## Identity Model

Opaline should distinguish identity from location.

- Note IDs should be stable UUID-style identifiers.
- Paths should be user-facing locations that may change.
- Links should store both an `href` and a stable Opaline target ID when possible.
- Links should also keep a relation kind: file, heading, block, or concept.
- SQLite can resolve IDs, paths, titles, aliases, backlinks, and broken links.

This allows notes to be renamed or moved without losing graph meaning.
It also allows the graph to show different kinds of knowledge relationships instead of treating every edge as the same.

## Storage Model

Use both files and SQLite.

Files store durable content:

- HTML notes
- images
- attachments
- exported assets

SQLite stores derived and app-specific data:

- search index
- backlinks
- outgoing links
- tags
- titles and aliases
- recent notes
- favorites
- workspace settings
- AI embeddings if enabled
- cached metadata

The rule is:

> HTML files are canonical. SQLite is useful, fast, and rebuildable.

## Architecture

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

### Layers

**Note Format Layer**

- parse HTML
- serialize HTML
- normalize saved documents
- validate the Opaline HTML Profile
- migrate old note versions

**Domain Layer**

- note identity
- note metadata
- links and backlinks
- tags
- assets
- search indexing
- publish metadata

**Editor Layer**

- Tiptap extensions
- editing commands
- paste sanitization
- selection behavior
- rich block editing
- undo and redo behavior

Tiptap is an implementation detail. The Opaline HTML format should be more durable than the editor library.

## Search Model

Search should have levels.

### Exact Search

Fast local keyword search across titles, headings, body text, tags, and paths.

This is the enhanced Ctrl+F layer.

### Structured Search

Filters over metadata:

- path
- tag
- note type
- created time
- updated time
- linked notes
- broken links

### Semantic Search

Optional AI/embedding-powered retrieval over local notes.

This should answer questions like:

> Did I ever write about why HTML notes might be better than Markdown for this project?

The result should show matching notes and snippets before generating any answer.

### AI Answers

AI should answer only with visible sources:

- cite notes
- link back to original text
- show retrieved snippets
- say when no relevant note was found
- separate source facts from AI inference

Private notes should not be sent to cloud models without explicit user permission. AI provider, custom API base URL, model, API key, model tests, and model fetching belong in Settings and should be saved explicitly.

### Today Conversation

The Today page is not meant to be a full chat product. It is a low-friction capture surface:

1. The user types a thought, complaint, question, or log entry.
2. Opaline appends the raw user text to today's HTML journal note.
3. If AI is configured, the assistant replies and that reply is also appended to the same daily note.
4. Later search, links, summaries, and note extraction can build on the saved record.

This preserves the difference between Opaline and a normal AI chat app: the durable object is the user's local knowledge base, not the conversation UI.

## Public Notes and Publishing

Publishing is important, but it should not be the first product surface.

There are several possible stages:

### Static Export

Generate a static website from selected notes.

This can work without accounts or hosting:

- GitHub Pages
- Cloudflare Pages
- Vercel
- personal server

### Hosted Publish

Opaline or another service may host public notes:

```text
opaline.site/username
```

This adds accounts, billing, domains, privacy, and content operations.

### Public Knowledge Network

Later, public notes from many users could become discoverable:

- author pages
- public note search
- collections
- citations
- follows
- bookmarks
- cross-user references
- topic discovery

This is closer to a knowledge forum or research network. It is promising, but too large for the first version.

## Reader-Facing Concept Search

A future published Opaline site should let readers select text and search the author's public notes.

Example:

```text
Reader selects "HTML-native notes"
  -> Search this note
  -> Search this author
  -> Find related public notes
  -> Ask with cited sources
```

This is different from ordinary site search. It lets readers treat an author's public knowledge base as a context they can query while reading.

The careful version should:

- be triggered by selection, not intrusive by default
- search only public content unless the reader is authenticated
- show source snippets
- link to original notes
- clearly label AI summaries
- avoid presenting AI inference as the author's direct claim

This feature is a long-term differentiator, not an MVP requirement.

## Relationship to Diandanr

Opaline and Diandanr can eventually complement each other, but should remain separate for now.

```text
Opaline  = local knowledge creation and management
Diandanr = publishing, site generation, distribution, and platform features
```

Opaline can later export a package that Diandanr understands:

```text
export/
  manifest.json
  notes/
  assets/
  search-index.json
  graph.json
  publish.json
```

This keeps Opaline focused while preserving a path toward generated websites and public distribution.

## Development Phases

### Phase 0: Foundation

Goal: define the system shape.

- Keep `README.md` and `README.zh.md` as repository entry points.
- Keep `README.html` and `README.zh.html` as project-native HTML entry points.
- Keep split documentation under `docs/` as clean semantic HTML.
- Define the first documentation style and linking conventions.
- Initialize Tauri + React
- Choose package manager and formatter
- Add Tiptap editor baseline
- Add SQLite integration
- Define the first Opaline HTML Profile
- Add example HTML notes for format testing
- Use a default workspace convention and remember user-selected workspace locations
- Add basic test and build commands

### Phase 1: Trustworthy Local Notes

Goal: make the storage loop reliable.

- Auto-initialize a default workspace under the user's documents folder
- Create a note
- Capture rough thoughts through the Today chat entry
- Edit with Tiptap
- Save as clean HTML
- Load existing HTML notes
- Auto-save changes
- Rebuild SQLite metadata from files
- Show file tree and recent notes
- Allow users to change the workspace location in Settings

Success criteria:

> Opaline can safely hold simple real notes, and those notes remain useful without Opaline.

### Phase 2: Search and Navigation

Goal: make the workspace findable.

- Title search
- Body search
- Heading extraction
- Tag extraction
- Recent notes
- Favorites
- Basic command palette
- Broken file detection

Success criteria:

> Users can find notes by memory, title, keyword, and structure.

### Phase 3: Knowledge Links

Goal: make notes connect.

- `[[note links]]`
- Resolve links to stable IDs
- Update links when notes move
- Backlinks
- Outgoing links
- Broken-link detection
- Daily notes
- Today chat that appends user and AI turns into the daily HTML note
- Basic graph data

Success criteria:

> Opaline becomes useful for projects, research, and long-running personal knowledge.

### Phase 4: Rich HTML Blocks

Goal: lean into HTML without losing cleanliness.

- Tables
- Task lists
- Callouts
- Code blocks
- Images and attachments
- Embeds
- Math
- Diagrams
- Block IDs
- Block references
- Concept spans

Success criteria:

> Opaline can handle rich documents while preserving a clean note format.

### Phase 5: AI-Assisted Knowledge Work

Goal: help users recover and reorganize their own context.

- Configure AI providers, custom API base URLs, models, keys, model tests, and model fetching from Settings
- Continue the Today conversation after recording the user's raw text locally
- Summarize a note
- Generate titles
- Extract tags
- Suggest related notes
- Detect duplicate or overlapping notes
- Turn rough writing into outlines
- Refactor long notes into smaller linked notes
- Ask questions over the workspace with citations
- Convert imported Markdown or web pages into clean Opaline HTML

Success criteria:

> AI helps users find, understand, and reshape their own knowledge without taking control away from them.

### Phase 6: Publish

Goal: make selected notes public.

- Select notes for publishing
- Generate static HTML site
- Include assets
- Include search index
- Include backlinks and table of contents
- Support custom theme basics
- Preserve public/private boundaries

Success criteria:

> Users can publish selected notes as a useful website without exposing private content.

### Phase 7: Reader Search and Public Knowledge

Goal: make public notes queryable by readers.

- Select-to-search on published pages
- Search within the current author
- Show related public notes
- AI explanations with citations
- Public glossary or concept pages
- Optional Diandanr integration

Success criteria:

> Published knowledge becomes something readers can explore and question, not only browse.

### Phase 8: Sync, Mobile, Plugins

Goal: expand after the core is stable.

- Cloud-folder compatibility
- Git-friendly workflows
- Optional hosted sync
- Mobile exploration
- Web storage adapter
- Theme API
- Plugin API
- Workspace automation hooks

Success criteria:

> Opaline grows without compromising local trust.

## Early Technical Questions

- How strict should the first Opaline HTML Profile be?
- Should saved HTML be pretty-printed for human diffs or compact for stability?
- How should note IDs be generated and stored?
- Should aliases live in `<meta>` tags, JSON metadata, or visible note properties?
- How should assets move when a note moves?
- How should private links behave when exporting public notes?
- Should backlinks be computed eagerly or lazily?
- Which SQLite search strategy should be used first?
- Should embeddings be stored locally per workspace?
- How should AI adapters handle privacy and provider choice?

## Not Doing First

The early project should not try to build everything.

Not first:

- real-time multiplayer collaboration
- a full public forum
- a social recommendation feed
- a plugin marketplace
- Notion-style databases
- complex project management
- mobile-first editing
- hosted sync
- all-in-one website generation
- cross-user AI search

These may become possible later. They should not define the first working version.

## Short-Term Roadmap

1. Polish the serious workspace so the Obsidian-style file pane, side panels, and editor feel coherent.
2. Add workspace migration when users change locations.
3. Expand file context actions: rename, delete, move, reveal in system explorer, copy relative/absolute path, and open history.
4. Improve the graph view beyond the first neighborhood and edge-detail pass: better layout, saved graph presets, and clearer navigation from edges back to exact targets.
5. Fix block-link target highlighting so opening a target note, scrolling to the block, and showing a visible highlight become a stable flow.
6. Add ordinary-user creation flows for concept links and cross-note heading/block targets from the editor context menu.
7. Improve HTML-native editing affordances so columns, sidenotes, callouts, embeds, and disclosure blocks feel like interactive blocks rather than hidden markup.
8. Continue hardening the Opaline HTML Profile with parser-based validation and tests.
9. Deepen SQLite FTS search, metadata scanning, backlinks, and broken-link repair.
10. Add AI retrieval over local notes with visible sources before generated answers.
11. Add explicit AI-assisted note operations: summarize, extract tags, suggest links, split notes, and create outlines.
12. Later: static publishing and reader-facing concept search over public notes.

## License

Copyright (c) 2026 Enjun Lu.

Opaline is licensed under the PolyForm Noncommercial License 1.0.0.

Noncommercial use is permitted under the terms in [LICENSE](LICENSE). Commercial use requires a separate commercial license from the author.
