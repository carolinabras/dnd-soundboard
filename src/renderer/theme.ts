import { AppSettings, ThemeColorKey, UiIconKey } from '../shared/types';

export const COLOR_LABELS: Record<ThemeColorKey, string> = {
  background: 'Background',
  surface: 'Panels & cards',
  accent: 'Accent',
  text: 'Text',
  textDim: 'Secondary text',
  border: 'Borders',
  playing: 'Playing card',
  danger: 'Stop / delete',
};

// theme color → CSS custom property it drives (see :root in index.html)
const COLOR_VARS: Record<ThemeColorKey, string> = {
  background: '--bg-dark',
  surface: '--bg-card',
  accent: '--accent',
  text: '--text',
  textDim: '--text-dim',
  border: '--border',
  playing: '--bg-playing',
  danger: '--red',
};

export const ICON_LABELS: Record<UiIconKey, string> = {
  play: 'Play',
  stop: 'Stop',
  pause: 'Pause',
  loop: 'Loop',
  edit: 'Edit',
  delete: 'Delete',
  volume: 'Volume',
  stopAll: 'Stop All',
  add: 'Add Sound',
  customize: 'Customize',
};

export const DEFAULT_SETTINGS: AppSettings = {
  title: 'D&D Soundboard',
  titleIcon: '⚔️',
  colors: {
    background: '#0d0d1a',
    surface: '#1a1a2e',
    accent: '#c9a84c',
    text: '#e8e0d0',
    textDim: '#9e9880',
    border: '#2e2e4a',
    playing: '#16213e',
    danger: '#8b1a1a',
  },
  icons: {
    play: '▶',
    stop: '■',
    pause: '❚❚',
    loop: '↺',
    edit: '✏️',
    delete: '🗑',
    volume: '🔊',
    stopAll: '■',
    add: '+',
    customize: '⚙',
  },
  cardWidth: 200,
  showNowPlaying: true,
};

export const PRESETS: { name: string; colors: Record<ThemeColorKey, string> }[] = [
  { name: 'Gold & Night', colors: DEFAULT_SETTINGS.colors },
  {
    name: 'Crimson Keep',
    colors: { background: '#140a0a', surface: '#241313', accent: '#e0605a', text: '#f0e0dc', textDim: '#a68c88', border: '#422424', playing: '#3a1818', danger: '#9b2c2c' },
  },
  {
    name: 'Elven Forest',
    colors: { background: '#0b140f', surface: '#15241b', accent: '#82c98d', text: '#e2eee2', textDim: '#8fa694', border: '#26402e', playing: '#1b3324', danger: '#8b1a1a' },
  },
  {
    name: 'Arcane',
    colors: { background: '#0e0a1a', surface: '#1c1530', accent: '#a98bff', text: '#ebe5ff', textDim: '#9a90b8', border: '#33295a', playing: '#261c48', danger: '#8b1a3a' },
  },
  {
    name: 'Frost',
    colors: { background: '#0a1218', surface: '#13202b', accent: '#7cc4e8', text: '#e3eef5', textDim: '#8aa2b2', border: '#24394a', playing: '#173044', danger: '#8b1a1a' },
  },
  {
    name: 'Parchment',
    colors: { background: '#ebe1cb', surface: '#f8f1e1', accent: '#8a5a1f', text: '#2e2418', textDim: '#76664e', border: '#d2c2a0', playing: '#f0dcb0', danger: '#a32020' },
  },
];

/** Suggested icons for sounds, offered in the Add/Edit Sound window. */
export const SOUND_ICON_PICKS = [
  '⚔️', '🛡️', '🏹', '🐉', '🔥', '⚡', '✨', '🌧️', '🌲', '🌊', '🍺', '🏰', '💀', '👻', '🐺', '🧙', '🎵', '🥁', '🎲', '🚪',
];

function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

export function cloneSettings(s: AppSettings): AppSettings {
  return { ...s, colors: { ...s.colors }, icons: { ...s.icons } };
}

/** Fill in anything missing from saved settings (e.g. keys added in a newer version). */
export function mergeSettings(saved?: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    colors: { ...DEFAULT_SETTINGS.colors, ...saved?.colors },
    icons: { ...DEFAULT_SETTINGS.icons, ...saved?.icons },
  };
}

export function applySettings(s: AppSettings): void {
  const root = document.documentElement.style;
  (Object.keys(COLOR_VARS) as ThemeColorKey[]).forEach((key) => {
    root.setProperty(COLOR_VARS[key], s.colors[key]);
  });
  // pick readable text for things drawn on top of the accent / danger colors
  root.setProperty('--on-accent', isDark(s.colors.accent) ? '#ffffff' : '#000000');
  root.setProperty(
    '--danger-text',
    isDark(s.colors.background)
      ? 'color-mix(in srgb, var(--red) 25%, #ff9a9a)'
      : 'color-mix(in srgb, var(--red) 85%, black)',
  );
  root.setProperty('--card-min-width', `${s.cardWidth}px`);
  document.body.classList.toggle('hide-now-playing', !s.showNowPlaying);
  document.title = s.title;
}
