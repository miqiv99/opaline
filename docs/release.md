# Build and Release Notes

Opaline is in public alpha. Release builds are currently intended for testing and early feedback.

## Local Development

```bash
npm install
npm run tauri:dev
```

## Production Build

```bash
npm run tauri:build
```

Tauri bundle outputs are written under:

```text
src-tauri/target/release/bundle/
```

## Manual Updates

The Settings page now includes a manual "check for updates" flow built on the Tauri updater plugin.

Current alpha behavior:

- Opaline checks only when the user clicks the update button.
- Installing an available update requires a second explicit confirmation.
- The active updater configuration is intentionally inert until a real release channel exists.
- Do not set `plugins.updater` to `null`; Tauri expects an updater config object and the app can panic during startup if the plugin config is `null`.
- Until GitHub release assets, `latest.json`, and the updater signing key are configured, update checks may report that the update source is not configured.

GitHub updater setup: [docs/updater-github.md](updater-github.md)

## Windows

Windows is the primary active development target right now.

Notes:

- Build Windows packages on Windows.
- Unsigned builds may trigger Windows SmartScreen warnings.
- A release should clearly say whether it is signed or unsigned.

## macOS

macOS packages should be built and tested on macOS.

Notes:

- Unsigned or unnotarized builds may be blocked by Gatekeeper.
- Public distribution usually needs Apple Developer signing and notarization.
- Do not imply macOS is fully supported until a macOS build has been tested on a Mac.

## Linux

Linux support is future-facing. Do not treat Linux packages as supported until they are explicitly tested and documented.

## Current Release Configuration Gaps

Before a stable public release, review:

- `src-tauri/tauri.conf.json` app identifier.
- Bundle icons.
- Windows installer metadata.
- Tauri updater signing key and endpoint.
- GitHub Release assets and `latest.json`.
- macOS signing and notarization.
- Release notes and checksums.
- Upgrade and migration behavior.
