import { app, BrowserWindow, ipcMain, globalShortcut, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IPC_CHANNELS, SoundConfig, SoundLibrary } from '../shared/types';
import { allowYoutubeEmbeds, downloadYoutubeAudio, fetchYoutubeTitle } from './youtube';

let mainWindow: BrowserWindow | null = null;

// hotkey → soundId map so we can unregister by hotkey
const registeredHotkeys = new Map<string, string>();

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];

function getCustomSoundsDir(): string {
  const dir = path.join(app.getPath('userData'), 'sounds');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getLibraryPath(): string {
  return path.join(app.getPath('userData'), 'library.json');
}

function prettifyName(base: string): string {
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // required for __dirname in preload
    },
    title: 'D&D Soundboard',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  allowYoutubeEmbeds();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

// Register a global hotkey that fires the sound in the renderer
ipcMain.handle(IPC_CHANNELS.REGISTER_HOTKEY, (_event, config: SoundConfig): boolean => {
  if (!config.hotkey) return false;

  // Unregister previous binding for this hotkey if it exists
  if (registeredHotkeys.has(config.hotkey)) {
    globalShortcut.unregister(config.hotkey);
  }

  try {
    const ok = globalShortcut.register(config.hotkey, () => {
      mainWindow?.webContents.send(IPC_CHANNELS.HOTKEY_TRIGGERED, config.id);
    });
    if (ok) registeredHotkeys.set(config.hotkey, config.id);
    return ok;
  } catch {
    return false;
  }
});

ipcMain.handle(IPC_CHANNELS.UNREGISTER_HOTKEY, (_event, hotkey: string): void => {
  globalShortcut.unregister(hotkey);
  registeredHotkeys.delete(hotkey);
});

ipcMain.handle(IPC_CHANNELS.GET_SOUNDS_PATH, (): string => {
  // In production, sounds are copied to resources/sounds by electron-builder extraResources
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'sounds');
  }
  return path.join(app.getAppPath(), 'assets', 'sounds');
});

ipcMain.handle(IPC_CHANNELS.GET_CUSTOM_SOUNDS_PATH, (): string => getCustomSoundsDir());

ipcMain.handle(IPC_CHANNELS.SELECT_AND_IMPORT_SOUND, async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose an audio file',
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const src = result.filePaths[0];
  const ext = path.extname(src);
  const safeBase = path.basename(src, ext).replace(/[^a-z0-9_-]/gi, '_') || 'sound';
  const destDir = getCustomSoundsDir();

  let filename = `${safeBase}${ext}`;
  let counter = 1;
  while (fs.existsSync(path.join(destDir, filename))) {
    filename = `${safeBase}-${counter++}${ext}`;
  }

  fs.copyFileSync(src, path.join(destDir, filename));

  return { file: filename, suggestedName: prettifyName(path.basename(src, ext)) };
});

ipcMain.handle(IPC_CHANNELS.DELETE_SOUND_FILE, (_event, file: string): void => {
  // path.basename strips any directory traversal so this always stays inside the custom dir
  const target = path.join(getCustomSoundsDir(), path.basename(file));
  if (fs.existsSync(target)) fs.unlinkSync(target);
});

ipcMain.handle(IPC_CHANNELS.YOUTUBE_DOWNLOAD, (event, url: string) =>
  downloadYoutubeAudio(url, getCustomSoundsDir(), (progress) => {
    event.sender.send(IPC_CHANNELS.YOUTUBE_PROGRESS, progress);
  }),
);

ipcMain.handle(IPC_CHANNELS.YOUTUBE_TITLE, (_event, videoId: string) => fetchYoutubeTitle(videoId));

ipcMain.handle(IPC_CHANNELS.LOAD_LIBRARY, (): SoundLibrary | null => {
  const libPath = getLibraryPath();
  if (!fs.existsSync(libPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(libPath, 'utf-8'));
  } catch {
    return null;
  }
});

ipcMain.handle(IPC_CHANNELS.SAVE_LIBRARY, (_event, library: SoundLibrary): void => {
  fs.writeFileSync(getLibraryPath(), JSON.stringify(library, null, 2));
});
