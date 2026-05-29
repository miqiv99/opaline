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

The site serves English at root paths such as `/docs/` and Chinese at `/zh/`.
Cloudflare Pages middleware redirects `/en/*` legacy paths back to root English
paths, and uses the saved language cookie, Cloudflare country metadata, or
`Accept-Language` to route first-time root visitors. The built HTML also includes
a browser-language fallback for static previews.

## Cloudflare Pages

Suggested deployment settings:

- Root directory: `site`
- Build command: `npm run build`
- Build output: `dist`

## Cloudflare Workers Static Assets

Cloudflare's current Workers and Pages dashboard may create a Worker-backed
static deployment from a Git repository. Use these settings:

- Path: `site`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Non-production deploy command: `npx wrangler versions upload`

The Worker configuration lives in `wrangler.toml` and uploads Astro's `dist/`
folder as static assets. `src/worker.ts` mirrors the Pages middleware language
redirects before serving static assets.

The `/updates/alpha/` folder is reserved for a future site-hosted updater
manifest. The current public alpha uses GitHub Releases for updater metadata;
the repository copy of the current manifest lives under `release-assets/`.
