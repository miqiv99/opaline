# Changelog

All notable public changes to Opaline will be documented here.

The format is intentionally simple while the project is in alpha.

## 0.1.2-alpha

- Unified editor command registry shared by toolbar actions, context menus, slash commands, the command palette, and future AI editing flows.
- Added slash command menu for common formatting, block, and insert actions.
- Added editor command palette, available from the toolbar and `Ctrl+Shift+P`.
- Expanded the AI editor tool protocol with command descriptors, JSON schema validation, permissions, preview metadata, confirmation gates, risk metadata, history-snapshot hooks, and rollback hooks.
- Updated public website and technical docs to describe the command layer and AI editing protocol foundation.

## 0.1.0-alpha

Initial public alpha preparation.

- Local-first Tauri desktop app shell.
- Clean HTML notes as the durable note format.
- Default local workspace under the user's documents folder.
- Focused note workspace with file pane, editor, inspector, and relationship views.
- Tiptap-based rich editor with headings, lists, links, images, tables, tasks, callouts, layouts, math, Mermaid, embeds, block IDs, and widgets.
- Lightweight document style system for body text, headings, callouts, and code blocks.
- Editor command layer shared by toolbar actions and future AI editing flows.
- AI editor tool protocol with command schemas, permission metadata, preview metadata, history-snapshot hooks, and rollback hooks.
- SQLite-backed metadata, search, note mentions, tags, headings, and link scanning.
- Local note history snapshots.
- AI settings for provider, base URL, model, API key, model tests, and model fetching.
- Experimental live widgets and extension folder support.
- Manual updater UI in Settings. Public update delivery still requires a real updater endpoint, signing key, and release assets.

Known alpha limitations:

- Release builds are unsigned unless a release explicitly says otherwise.
- Workspace migration still needs a complete user-facing flow.
- Block-link target highlighting is not yet fully reliable in the desktop editor.
- Updater configuration is intentionally inert until a real release channel is configured.
- Public publishing is planned but not included in the first alpha.
