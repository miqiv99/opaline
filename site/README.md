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

The site has localized routes at `/zh/` and `/en/`. Root and legacy paths use a
small Cloudflare Pages middleware to redirect from the saved language cookie,
Cloudflare country metadata, or `Accept-Language`; the built HTML also includes a
browser-language fallback for static previews.

## Cloudflare Pages

Suggested deployment settings:

- Root directory: `site`
- Build command: `npm run build`
- Build output: `dist`

The `/updates/alpha/` folder is reserved for a future updater manifest. Do not add
a fake `latest.json`; the updater needs real signing keys and release assets.
