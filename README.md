# D&D Soundboard

A desktop soundboard for tabletop RPG sessions. Play ambient sounds, music and sound effects, organise them into categories, and trigger them with global hotkeys (they work even when the app is not focused).

Built with Electron, TypeScript, webpack and [Howler.js](https://howlerjs.com/).

## Features

- **Sound grid** with category tabs, per-sound volume, loop and global hotkeys.
- **Now Playing panel** listing everything that's playing, with a seekable progress bar, pause/resume, stop, loop and volume for each sound.
- **Sounds from YouTube**: paste a link and either download the audio (works offline) or stream the video.
- **Customize window**: theme presets, every color, the app title and icon, button icons, card size, and showing/hiding the Now Playing panel.
- **Per-sound icon and card color** to tell sounds apart at a glance.

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

The app starts with an empty library. Click **+ Add Sound** and either:

- **Choose File…** to pick an audio file (`mp3`, `wav`, `ogg`, `m4a`, `flac`, `aac`). The file is copied into your user data folder, so the original can be moved or deleted.
- **From YouTube…** to paste a YouTube link (normal, `youtu.be`, Shorts and live links work). The title is filled in for you.

You can give each sound a name, icon, card color, category, volume, loop setting and hotkey.

Hotkeys are registered globally, so they work while the app is in the background. Another app that already uses the same key may prevent registration.

### YouTube: download or stream

| | Download audio | Stream |
| --- | --- | --- |
| Internet during play | Not needed | Needed |
| Ads | None | Possible |
| How it plays | Like any other file | Through YouTube's embedded player, shown in the Now Playing panel (YouTube requires it to be visible) |

- **Download** uses [yt-dlp](https://github.com/yt-dlp/yt-dlp). The first download fetches `yt-dlp.exe` (~15 MB) automatically, and it updates itself weekly. Downloading goes against YouTube's Terms of Service, so keep it to personal use. Long videos download in full, so a multi-hour ambience track can be several hundred MB.
- **Stream** sounds show a **YouTube** badge on their card. Some videos don't allow embedding; download those instead.

## Customizing the look

Click **⚙ Customize** in the header. Changes preview live; **Save** keeps them, **Cancel** reverts, and **Reset to defaults** restores the original theme. Presets: Gold & Night (default), Crimson Keep, Elven Forest, Arcane, Frost and Parchment (light).

In the button icon fields, press `Win` + `.` to open the Windows emoji picker.

## Where data is stored

Your library and imported sound files live in Electron's user data folder:

- Windows: `%APPDATA%\dnd-soundboard\`
  - `library.json`: the saved library (sounds, categories, hotkeys, volumes) and your Customize settings
  - `sounds\`: sounds imported through the app, including YouTube downloads
  - `bin\yt-dlp.exe`: the YouTube downloader, fetched on first use

Delete `library.json` to reset to an empty library and the default theme.

## Packaging notes

The installer is written to `release/D&D Soundboard Setup <version>.exe`. That single file is all you need to share; it contains the compiled app, not the TypeScript source (source maps are excluded).

The default Electron icon is used. To use a custom one, add `build/icon.ico` (256×256 recommended) and uncomment the `icon` line in `electron-builder.yml`.

`signAndEditExecutable` is turned off because electron-builder's signing tools fail on Windows without symlink privileges. The installer is unsigned, so Windows SmartScreen will warn on first run.

## Project structure

```
src/
  main/
    index.ts       Electron main process (window, global hotkeys, file I/O)
    preload.ts     Bridge exposing the main-process API to the UI
    youtube.ts     yt-dlp downloads, title lookup, and the Referer fix YouTube embeds need
  renderer/
    index.html     Page layout and all styles
    soundboard.ts  Sound grid, Now Playing panel, Add/Edit Sound window
    players.ts     Playback for files (Howler) and YouTube streams behind one interface
    customize.ts   Customize window
    theme.ts       Default settings, theme presets, and applying them to the page
  shared/          Types, IPC channel names and YouTube link parsing shared by both processes
assets/sounds/ Test sound for development (not included in the installer)
dist/          Build output (generated)
release/       Packaged installers (generated)
```
