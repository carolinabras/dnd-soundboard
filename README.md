# D&D Soundboard

A desktop soundboard for tabletop RPG sessions. Play ambient sounds, music and sound effects, organise them into categories, and trigger them with global hotkeys (they work even when the app is not focused).

Built with Electron, TypeScript, webpack and [Howler.js](https://howlerjs.com/).

## Features

- **Sound grid** with category tabs, per-sound volume, loop and global hotkeys.
- **Now Playing panel** listing everything that's playing, with a seekable progress bar, pause/resume, stop, loop and volume for each sound.
- **Sounds from YouTube**: paste a link and either download the audio (works offline) or stream the video.
- **Customize window**: theme presets, every color, the app title and icon, button icons, card size, and showing/hiding the Now Playing panel.
- **Per-sound icon and card color** to tell sounds apart at a glance.

## Download

Get the installer for your system from [Releases](https://github.com/carolinabras/dnd-soundboard/releases):

| System | File | First run |
| --- | --- | --- |
| Windows 10/11 (x64) | `DnD-Soundboard-Setup-<version>.exe` | Unsigned: on the SmartScreen warning, click **More info** → **Run anyway**. |
| macOS (Intel and Apple Silicon) | `DnD-Soundboard-<version>-mac.dmg` | Unsigned: drag the app to Applications, then right-click it → **Open** → **Open**. |
| Linux (x64) | `DnD-Soundboard-<version>-linux-x86_64.AppImage` | `chmod +x` the file, then run it. Some distributions need `libfuse2` installed. |

Platform notes:

- **Global hotkeys** work on Windows and macOS. On Linux they work under X11 but are usually blocked under Wayland (the default on many current distributions); they still work while the app is focused.
- Only the Windows build is tested by hand; the macOS and Linux builds are produced automatically and haven't been tried on real machines yet.

## Requirements (to build from source)

- [Node.js](https://nodejs.org/) 20 or newer (includes npm)
- Windows, macOS or Linux. Each system can build its own installer; macOS installers can only be built on a Mac.

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
| `npm run dist:mac` | Builds a macOS `.dmg` (Intel + Apple Silicon) into `release/`. Must run on a Mac. |
| `npm run dist:linux` | Builds a Linux AppImage into `release/`. Run on Linux (or WSL). |

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

- **Download** uses [yt-dlp](https://github.com/yt-dlp/yt-dlp). The first download fetches the yt-dlp program for your system (~15–35 MB) automatically, and it updates itself weekly. Downloading goes against YouTube's Terms of Service, so keep it to personal use. Long videos download in full, so a multi-hour ambience track can be several hundred MB.
- **Stream** sounds show a **YouTube** badge on their card. Some videos don't allow embedding; download those instead.

## Customizing the look

Click **⚙ Customize** in the header. Changes preview live; **Save** keeps them, **Cancel** reverts, and **Reset to defaults** restores the original theme. Presets: Gold & Night (default), Crimson Keep, Elven Forest, Arcane, Frost and Parchment (light).

In the button icon fields, open your system's emoji picker: `Win` + `.` on Windows, `Ctrl` + `Cmd` + `Space` on macOS.

## Where data is stored

Your library and imported sound files live in Electron's user data folder:

| System | Folder |
| --- | --- |
| Windows | `%APPDATA%\dnd-soundboard\` |
| macOS | `~/Library/Application Support/dnd-soundboard/` |
| Linux | `~/.config/dnd-soundboard/` |

Inside it:

- `library.json`: the saved library (sounds, categories, hotkeys, volumes) and your Customize settings
- `sounds/`: sounds imported through the app, including YouTube downloads
- `bin/`: the YouTube downloader (yt-dlp), fetched on first use

Delete `library.json` to reset to an empty library and the default theme.

## Packaging notes

Installers are written to `release/` with names like `DnD-Soundboard-Setup-<version>.exe`. Each is a single file containing the compiled app, not the TypeScript source (source maps are excluded).

The default Electron icon is used. To use a custom one, add `build/icon.ico` (Windows), `build/icon.icns` (macOS) and `build/icon.png` (Linux, 512×512) and uncomment the `icon` line in `electron-builder.yml`.

### Publishing a release

Installers are published as [GitHub Releases](https://github.com/carolinabras/dnd-soundboard/releases), not committed to git (that would add ~75 MB to every clone per version). GitHub Actions builds them for you:

1. Bump the version: `npm version 1.0.3 --no-git-tag-version`, then commit and push.
2. Publish the release:
   ```sh
   gh release create v1.0.3 --title "v1.0.3" --notes "What changed"
   ```
3. The [Build installers](.github/workflows/release.yml) workflow builds the Windows, macOS and Linux installers (about 10 minutes) and attaches them to the release. Follow it in the repository's **Actions** tab.

The workflow refuses to run if the tag doesn't match the version in `package.json`. To rebuild an existing release, run the workflow from the Actions tab and enter its tag.

`signAndEditExecutable` is turned off because electron-builder's signing tools fail on Windows without symlink privileges. The installer is unsigned, so Windows SmartScreen will warn on first run.

## Project structure

```
.github/workflows/
  release.yml      Builds installers for all three systems when a release is published
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
