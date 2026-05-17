# Opaline Language Packs

Opaline supports built-in interface languages and workspace-local community language packs.

Community packs live under:

```text
<workspace>/.opaline/language-packs/<pack-id>/
  manifest.json
  messages.json
```

`manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "example.ja",
  "locale": "ja",
  "name": "Japanese",
  "nativeName": "日本語",
  "version": "0.1.0",
  "author": "community",
  "fallback": "en"
}
```

`messages.json`:

```json
{
  "app.brand.subtitle": "Local HTML notes",
  "action.open": "Open",
  "action.create": "New"
}
```

Rules:

- `schemaVersion` must be `1`.
- `id`, `locale`, and `nativeName` are required.
- `messages.json` must be a JSON object whose values are strings.
- Missing keys fall back through the pack's `fallback`, then `en`, then `zh-Hans`.
- Language packs are data only. Opaline reads JSON but does not execute code from language packs.

