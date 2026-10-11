import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, SoundConfig, SoundboardAPI, SoundLibrary, YoutubeProgress } from '../shared/types';

const api: SoundboardAPI = {
  // Resolved synchronously at preload time via IPC sync would be complex;
  // instead we expose an empty string and fill it async in the renderer.
  // The actual path is fetched via registerHotkey flow. We expose a getter instead.
  soundsPath: '',

  registerHotkey: (config: SoundConfig) =>
    ipcRenderer.invoke(IPC_CHANNELS.REGISTER_HOTKEY, config),

  unregisterHotkey: (hotkey: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.UNREGISTER_HOTKEY, hotkey),

  onHotkeyTriggered: (callback: (soundId: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.HOTKEY_TRIGGERED, (_event, soundId: string) => {
      callback(soundId);
    });
  },

  removeAllListeners: () => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.HOTKEY_TRIGGERED);
  },

  getCustomSoundsPath: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CUSTOM_SOUNDS_PATH),

  selectAndImportSound: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_AND_IMPORT_SOUND),

  deleteSoundFile: (file: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_SOUND_FILE, file),

  loadLibrary: () => ipcRenderer.invoke(IPC_CHANNELS.LOAD_LIBRARY),

  saveLibrary: (library: SoundLibrary) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_LIBRARY, library),

  youtubeDownload: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_DOWNLOAD, url),

  youtubeTitle: (videoId: string) => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_TITLE, videoId),

  onYoutubeProgress: (callback: (progress: YoutubeProgress) => void) => {
    ipcRenderer.on(IPC_CHANNELS.YOUTUBE_PROGRESS, (_event, progress: YoutubeProgress) => callback(progress));
  },
};

contextBridge.exposeInMainWorld('soundboardAPI', api);

// Expose sounds path separately so the renderer can await it once
contextBridge.exposeInMainWorld('getSoundsPath', (): Promise<string> =>
  ipcRenderer.invoke(IPC_CHANNELS.GET_SOUNDS_PATH)
);
