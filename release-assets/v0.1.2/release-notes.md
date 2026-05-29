# Opaline v0.1.2 Public Alpha

This release expands the editor foundation and adds a macOS Apple Silicon build alongside the existing Windows alpha package.

## Downloads

- Windows x64 installer: `Opaline_0.1.2_x64-setup.exe`
- macOS Apple Silicon disk image: `Opaline_0.1.2_aarch64.dmg`

macOS Intel builds are not included in this release.

## What's New

- Added a unified editor command registry shared by toolbar actions, context menus, slash commands, the command palette, and future AI editing flows.
- Added the editor slash command menu for common formatting, block, and insert actions.
- Added the editor command palette, available from the toolbar and `Ctrl+Shift+P`.
- Expanded the AI editor tool protocol with command descriptors, JSON schema validation, permissions, preview metadata, confirmation gates, risk metadata, history-snapshot hooks, and rollback hooks.
- Updated public website and technical docs for the command layer, AI editing protocol foundation, macOS alpha package, and GitHub Release updater metadata.

## Updates

- The GitHub Release `latest.json` now includes signed update metadata for both `windows-x86_64` and `darwin-aarch64`.
- Opaline still checks for updates only when the user explicitly clicks the update button in Settings.

## Alpha Notes

- Back up your workspace before testing with important notes.
- Windows remains the primary active development target.
- macOS packages are built and tested on macOS, but may still be unsigned or unnotarized.
- Unsigned or unnotarized packages can trigger Windows SmartScreen, macOS Gatekeeper, or other platform warnings.
