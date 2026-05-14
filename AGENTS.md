# AGENTS.md

This file is for AI coding agents working on opaline.

It is intentionally local-only for now and should not be committed.

## Project

opaline is a local-first note management app based on HTML notes.

Target stack:

- Tauri 2
- React
- Tiptap
- SQLite

The product direction is ambitious: start as a useful desktop HTML note app, then grow into a rich, AI-native personal knowledge base.

## Working Style

- Read the existing code before changing it.
- Prefer small, working increments over large speculative rewrites.
- Keep project decisions documented in `README.md` or future docs.
- Preserve user data and local files carefully.
- Avoid lock-in where possible.
- Do not introduce new frameworks unless the existing stack clearly needs them.

## Product Principles

- Local-first by default.
- HTML notes are durable user-owned files.
- SQLite is for metadata, indexes, backlinks, app state, and cache.
- Notes should remain useful outside the app.
- AI features should propose and explain changes, not silently rewrite user knowledge.
- Desktop comes first; mobile and web should be enabled by clean architecture.

## Architecture Principles

Keep platform-specific capabilities behind adapters:

```text
React UI
  -> Editor layer
  -> Domain layer
  -> Storage adapter
      -> Tauri desktop file system
      -> Tauri mobile file system
      -> Web IndexedDB or OPFS
```

Avoid mixing these concerns:

- UI components should not directly own file system logic.
- Editor extensions should not directly own workspace storage.
- SQLite schema and file-note format should be versioned deliberately.
- AI workflows should operate through explicit domain commands.

## Editor

Use Tiptap as the default editor unless the project later makes a deliberate decision to switch.

Expected editor features:

- Clean HTML output
- Headings
- Paragraphs
- Lists
- Links
- Images
- Tables
- Code blocks
- Callouts
- `[[note links]]`
- Tags

Do not save arbitrary noisy browser HTML if a cleaner schema can be maintained.

## Storage

Durable content:

- HTML notes
- Images
- Attachments

Derived or app-specific data:

- SQLite indexes
- Backlinks
- Tags
- Recent notes
- Favorites
- Embeddings
- Cache

Prefer rebuilding derived data from note files when possible.

## Licensing

opaline uses the PolyForm Noncommercial License 1.0.0.

Commercial use requires a separate license from the author.

Be careful when adding dependencies. Prefer dependencies with licenses compatible with commercial distribution and source-available/noncommercial project goals.

## Git

This file is local-only for now.

Do not commit:

- `AGENTS.md`
- local databases
- generated caches
- `.env` files
- build outputs

Commit when ready:

- source code
- README and docs meant for users
- `LICENSE`
- `NOTICE`
- lockfiles for reproducible application builds

