export interface SoundConfig {
  id: string;
  name: string;
  file: string;
  hotkey?: string;
  volume?: number;
  loop?: boolean;
  category?: SoundCategory;
  /** true if the file lives in the user-writable custom sounds dir (added via the UI) */
  custom?: boolean;
  /** emoji or short text shown before the name */
  icon?: string;
  /** #rrggbb accent stripe for the card */
  color?: string;
  /** set for sounds streamed from YouTube instead of played from a file (`file` is then empty) */
  youtubeId?: string;
}

export type SoundCategory = string;

export type ThemeColorKey =
  | 'background' | 'surface' | 'accent' | 'text' | 'textDim' | 'border' | 'playing' | 'danger';

export type UiIconKey =
  | 'play' | 'stop' | 'pause' | 'loop' | 'edit' | 'delete' | 'volume' | 'stopAll' | 'add' | 'customize';

export interface AppSettings {
  title: string;
  titleIcon: string;
  colors: Record<ThemeColorKey, string>;
  icons: Record<UiIconKey, string>;
  /** minimum sound card width in px */
  cardWidth: number;
  showNowPlaying: boolean;
}

export interface SoundLibrary {
  sounds: SoundConfig[];
  categories: string[];
  settings?: Partial<AppSettings>;
}

export const IPC_CHANNELS = {
  // Renderer → Main
  REGISTER_HOTKEY: 'register-hotkey',
  UNREGISTER_HOTKEY: 'unregister-hotkey',
  GET_SOUNDS_PATH: 'get-sounds-path',
  GET_CUSTOM_SOUNDS_PATH: 'get-custom-sounds-path',
  SELECT_AND_IMPORT_SOUND: 'select-and-import-sound',
  DELETE_SOUND_FILE: 'delete-sound-file',
  LOAD_LIBRARY: 'load-library',
  SAVE_LIBRARY: 'save-library',
  YOUTUBE_DOWNLOAD: 'youtube-download',
  YOUTUBE_TITLE: 'youtube-title',

  // Main → Renderer
  HOTKEY_TRIGGERED: 'hotkey-triggered',
  YOUTUBE_PROGRESS: 'youtube-progress',
} as const;

export type IpcChannels = typeof IPC_CHANNELS;

export interface ImportedSound {
  file: string;
  suggestedName: string;
}

export type YoutubeDownloadResult = ImportedSound | { error: string };

/** Progress of a YouTube download, shown in the Add Sound window. */
export interface YoutubeProgress {
  stage: 'installing' | 'updating' | 'downloading';
  percent?: number;
}

/** Pulls the video id out of any common YouTube URL shape; null if it isn't one. */
export function parseYoutubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v');
    const match = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
    if (!id && match) id = match[1];
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

// Shape exposed by preload via contextBridge
export interface SoundboardAPI {
  soundsPath: string;
  registerHotkey: (config: SoundConfig) => Promise<boolean>;
  unregisterHotkey: (hotkey: string) => Promise<void>;
  onHotkeyTriggered: (callback: (soundId: string) => void) => void;
  removeAllListeners: () => void;
  getCustomSoundsPath: () => Promise<string>;
  selectAndImportSound: () => Promise<ImportedSound | null>;
  deleteSoundFile: (file: string) => Promise<void>;
  loadLibrary: () => Promise<SoundLibrary | null>;
  saveLibrary: (library: SoundLibrary) => Promise<void>;
  youtubeDownload: (url: string) => Promise<YoutubeDownloadResult>;
  youtubeTitle: (videoId: string) => Promise<string | null>;
  onYoutubeProgress: (callback: (progress: YoutubeProgress) => void) => void;
}

declare global {
  interface Window {
    soundboardAPI: SoundboardAPI;
  }
}
