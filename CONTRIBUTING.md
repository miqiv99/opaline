# Contributing to Opaline

Thanks for taking a look at Opaline. The project is still in public alpha, so small, focused contributions are the most useful.

## Good First Contributions

- Reproduce and narrow bugs.
- Improve documentation.
- Add small tests around existing behavior.
- Polish UI issues without changing product direction.
- Improve Windows development and packaging notes.

## Development Setup

```bash
npm install
npm run tauri:dev
```

Validation:

```bash
npm run build
cd src-tauri
cargo test
```

## Project Boundaries

- Opaline is local-first by default.
- HTML notes are the durable source of truth.
- SQLite is for rebuildable metadata, indexes, backlinks, app state, and cache.
- AI features should propose and explain changes, not silently rewrite user knowledge.
- Do not introduce a new framework unless the existing stack clearly needs it.

## Pull Requests

- Keep pull requests small and focused.
- Describe user-facing behavior, not only implementation details.
- Mention any data migration or file format impact.
- Include screenshots for visible UI changes.
- Run `npm run build`; run `cargo test` when Rust or storage behavior changes.

## Licensing

By contributing, you agree that your contribution is provided under the project's license terms. Opaline uses the PolyForm Noncommercial License 1.0.0. Commercial use requires a separate license from the author.
