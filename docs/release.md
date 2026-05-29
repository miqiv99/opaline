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

Tauri bundle outputs are written under the target-specific release bundle directory, for example:

```text
src-tauri/target/release/bundle/
src-tauri/target/aarch64-apple-darwin/release/bundle/
```

## Manual Updates

The Settings page now includes a manual "check for updates" flow built on the Tauri updater plugin.

Current alpha behavior:

- Opaline checks only when the user clicks the update button.
- Installing an available update requires a second explicit confirmation.
- The active updater configuration points at GitHub Releases and is used by the manual update check.
- Do not set `plugins.updater` to `null`; Tauri expects an updater config object and the app can panic during startup if the plugin config is `null`.
- Current signed update metadata for v0.1.2 is tracked at `release-assets/v0.1.2/latest.json`.

GitHub updater setup: [docs/updater-github.md](updater-github.md)

## Windows

Windows remains the primary active development target right now.

Notes:

- Build Windows packages on Windows.
- Unsigned builds may trigger Windows SmartScreen warnings.
- A release should clearly say whether it is signed or unsigned.

## macOS

macOS Apple Silicon packages are built and tested on macOS.

Notes:

- The current macOS release asset is for Apple Silicon (`darwin-aarch64`).
- Unsigned or unnotarized builds may be blocked by Gatekeeper.
- Public distribution usually needs Apple Developer signing and notarization.
- Intel macOS builds should not be described as supported until they are explicitly built and tested.

## Linux

Linux support is future-facing. Do not treat Linux packages as supported until they are explicitly tested and documented.

## Current Release Configuration Gaps

Before a stable public release, review:

- `src-tauri/tauri.conf.json` app identifier.
- Bundle icons.
- Windows installer metadata.
- Broader updater install testing across Windows and macOS.
- macOS signing and notarization.
- Release notes and checksums.
- Upgrade and migration behavior.
