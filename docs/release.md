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
- macOS signing and notarization.
- Release notes and checksums.
- Upgrade and migration behavior.
