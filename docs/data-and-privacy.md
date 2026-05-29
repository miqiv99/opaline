# Data and Privacy

Opaline is designed as a local-first desktop knowledge workspace.

## Where Notes Live

By default, Opaline creates a workspace under the user's documents folder:

```text
Documents/
  Opaline/
    notes/
    assets/
    .opaline/
```

- `notes/` stores durable HTML notes.
- `assets/` stores images and attached files.
- `.opaline/` stores app metadata, indexes, settings, cache, and history snapshots.

HTML files are the source of truth. SQLite metadata should be rebuildable from notes whenever possible.

Workspace diagnostics are read-only: they inspect HTML notes, local asset references, and SQLite index state without rewriting notes or secretly updating the database.

The explicit index rebuild command only refreshes derived SQLite metadata such as note rows, full-text search content, tags, headings, and link relations. It does not modify HTML note files.

## Network Behavior

Opaline does not need a cloud account for local note editing.

Network access can happen when the user explicitly configures or uses features such as:

- AI providers.
- Model list fetching.
- Live scripts or extensions that call network APIs.
- Opening external links.

## AI Keys

AI provider settings are user-configured. API keys should be treated as secrets.

Public alpha builds should not be used with sensitive production credentials unless the user has reviewed the code and understands the risk.

## Extensions and Scripts

Live scripts and third-party extensions are experimental. They can expand what notes can do, but they also increase risk.

Only install extensions from sources you trust. Keep extension behavior explicit, visible, and reversible.

## Backups

Before testing alpha builds with important notes, back up the workspace folder.

Suggested backup targets:

- A normal folder copy.
- A cloud-synced folder you control.
- A private Git repository if your notes are suitable for Git.
