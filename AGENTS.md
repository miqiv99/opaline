# AGENTS.md

This file is for AI coding agents working on opaline.

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
- The app should auto-initialize a sensible default workspace instead of making first-run users choose a folder.
- Changing workspace location should preserve user trust; migration support is the next expected step.
- The Today conversation is a capture surface: user text should be recorded locally before AI continues the conversation.
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

## Windows Development Notes

Current active development is on Windows.

- Use PowerShell commands by default, and prefer explicit `-LiteralPath` when touching local files.
- The workspace root is usually `D:\diorite`; commands should set `workdir` there unless they specifically need `src-tauri`.
- Frontend dev server:
  - `npm run dev` serves Vite on `http://127.0.0.1:1420/`.
  - To check whether it is running: `Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue`.
  - To stop it, stop the owning process from that command. Avoid broad Node process kills unless the user explicitly asks.
- If `Start-Process npm ...` fails with `Item has already been added. Key in dictionary: 'Path' Key being added: 'PATH'`, it is a Windows environment-variable casing issue in the current shell. A workable fallback is launching through `cmd /c start "" /B cmd /c "cd /d D:\diorite && npm run dev > tmp-dev-server.log 2> tmp-dev-server.err.log"`.
- If Vite fails with `Error: spawn EPERM` while loading `vite.config.ts`, retry outside the sandbox/with approval. This is usually an esbuild child process spawn permission issue, not an app code issue.
- Temporary dev logs such as `tmp-dev-server.log` and `tmp-dev-server.err.log` are ignored by `*.log`; do not commit them.
- Validation commands used so far:
  - From `D:\diorite`: `npm run build`
  - From `D:\diorite\src-tauri`: `cargo test`
  - Optional Tauri smoke build: `npm run tauri -- build --debug --no-bundle`
- Tauri icon generation on Windows is sensitive to valid `.ico` structure. If the app icon is regenerated, verify with a Tauri debug/no-bundle build rather than trusting file existence alone.
- Local app/workspace data such as `.opaline/`, `notes/`, and `assets/` must remain uncommitted and should be treated as user data.

## Licensing

opaline uses the PolyForm Noncommercial License 1.0.0.

Commercial use requires a separate license from the author.

Be careful when adding dependencies. Prefer dependencies with licenses compatible with commercial distribution and source-available/noncommercial project goals.

## Git

Do not commit:

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

