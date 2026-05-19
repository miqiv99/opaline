# Opaline Site

Static website for Opaline, built as an independent Astro subproject.

## Local Development

```powershell
cd site
npm install
npm run dev
```

## Build

```powershell
cd site
npm run build
```

The generated static output is written to `site/dist/` and should not be committed.

## Cloudflare Pages

Suggested deployment settings:

- Root directory: `site`
- Build command: `npm run build`
- Build output: `dist`

The `/updates/alpha/` folder is reserved for a future updater manifest. Do not add
a fake `latest.json`; the updater needs real signing keys and release assets.
