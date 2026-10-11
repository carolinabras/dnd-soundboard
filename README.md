# D&D Soundboard

A desktop soundboard for tabletop RPG sessions. Play ambient sounds, music and sound effects, organise them into categories, and trigger them with global hotkeys (they work even when the app is not focused).

Built with Electron, TypeScript, webpack and [Howler.js](https://howlerjs.com/).

## Requirements

- [Node.js](https://nodejs.org/) 20 or newer (includes npm)
- Windows (the packaging scripts build a Windows installer; running from source also works on macOS and Linux)

## Getting started

Install dependencies:

```sh
npm install
```

Build and launch the app:

```sh
npm start
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Builds the main and renderer bundles into `dist/`, then launches Electron. |
| `npm run dev` | Watches the source, rebuilds on change, and launches Electron with `--inspect`. Reload the window (`Ctrl+R`) to pick up renderer changes; restart for main-process changes. |
| `npm run build` | Builds both bundles without launching. |
| `npm run build:main` / `npm run build:renderer` | Builds one bundle only. |
| `npm run dist` | Builds and packages a Windows x64 installer into `release/`. |
| `npm run dist:dir` | Builds an unpacked Windows app into `release/` (faster, useful for testing the packaged build). |

## Adding sounds

The app starts with an empty library. Click **+ Add Sound** to pick an audio file (`mp3`, `wav`, `ogg`, `m4a`, `flac`, `aac`). The file is copied into your user data folder, so the original can be moved or deleted. You can give each sound a name, category, volume, loop setting and hotkey.

Hotkeys are registered globally, so they work while the app is in the background. Another app that already uses the same key may prevent registration.

## Where data is stored

Your library (sounds, categories, hotkeys, volumes) and imported sound files live in Electron's user data folder:

- Windows: `%APPDATA%\dnd-soundboard\`
  - `library.json` — the saved library
  - `sounds\` — sounds imported through the app

Delete `library.json` to reset to an empty library.

## Packaging notes

The installer is written to `release/D&D Soundboard Setup <version>.exe`. That single file is all you need to share; it contains the compiled app, not the TypeScript source (source maps are excluded).

The default Electron icon is used. To use a custom one, add `build/icon.ico` (256×256 recommended) and uncomment the `icon` line in `electron-builder.yml`.

`signAndEditExecutable` is turned off because electron-builder's signing tools fail on Windows without symlink privileges. The installer is unsigned, so Windows SmartScreen will warn on first run.

## Project structure

```
src/
  main/        Electron main process (window, global hotkeys, file I/O) and preload bridge
  renderer/    UI (index.html) and soundboard logic
  shared/      Types and IPC channel names shared by both processes
assets/sounds/ Test sound for development (not included in the installer)
dist/          Build output (generated)
release/       Packaged installers (generated)
```
