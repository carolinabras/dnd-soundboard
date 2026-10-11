import { Howler } from 'howler';
import { AppSettings, SoundConfig, SoundLibrary, YoutubeProgress, parseYoutubeId } from '../shared/types';
import { CustomizeModal } from './customize';
import { FilePlayer, Player, PlayerEvents, YoutubePlayer } from './players';
import { SOUND_ICON_PICKS, applySettings, mergeSettings } from './theme';

declare global {
  interface Window {
    getSoundsPath: () => Promise<string>;
  }
}

const DEFAULT_CATEGORIES = ['Music', 'Ambient', 'SFX'];

const DEFAULT_SOUNDS: SoundConfig[] = [];

const NEW_CATEGORY_VALUE = '__new__';
const UNCATEGORIZED_VALUE = '';

type ActiveSounds = Map<string, { player: Player; paused: boolean }>;

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Soundboard {
  private sounds: SoundConfig[] = [];
  private categories: string[] = [];
  private active: ActiveSounds = new Map();
  private soundsPath = '';
  private customSoundsPath = '';
  private masterVolume = 1.0;
  private activeCategory = 'All';
  private renderedCategory: string | null = null;
  private settings: AppSettings = mergeSettings();
  private customizeModal!: CustomizeModal;

  // Modal state
  private modalEl!: HTMLElement;
  private editingId: string | null = null;
  private pendingFile: string | null = null;
  private pendingFileIsNew = false;
  private pendingYoutubeId: string | null = null;
  /** bumped whenever the modal opens/closes so late YouTube results can tell they're stale */
  private modalSession = 0;

  // Built once and kept across render() so streaming YouTube iframes aren't reloaded
  private mainEl: HTMLElement | null = null;

  async init(): Promise<void> {
    this.soundsPath = await window.getSoundsPath();
    this.customSoundsPath = await window.soundboardAPI.getCustomSoundsPath();

    const library = await window.soundboardAPI.loadLibrary();
    if (library) {
      this.sounds = library.sounds;
      this.categories = library.categories;
      this.settings = mergeSettings(library.settings);
    } else {
      this.sounds = DEFAULT_SOUNDS;
      this.categories = DEFAULT_CATEGORIES;
      await this.persist();
    }

    applySettings(this.settings);
    this.buildModal();
    this.customizeModal = new CustomizeModal(
      (preview) => {
        this.settings = preview;
        applySettings(preview);
        this.render();
      },
      (saved) => {
        this.settings = saved;
        applySettings(saved);
        this.render();
        this.persist();
      },
    );
    this.render();
    this.registerHotkeys();
    setInterval(() => this.updateProgress(), 250);

    window.soundboardAPI.onHotkeyTriggered((soundId) => {
      this.toggleSound(soundId);
    });
  }

  private async persist(): Promise<void> {
    const library: SoundLibrary = { sounds: this.sounds, categories: this.categories, settings: this.settings };
    await window.soundboardAPI.saveLibrary(library);
  }

  private fileUrl(config: SoundConfig): string {
    const base = config.custom ? this.customSoundsPath : this.soundsPath;
    const normalized = base.replace(/\\/g, '/');
    return `file:///${normalized}/${config.file}`;
  }

  private toggleSound(soundId: string): void {
    const config = this.sounds.find((s) => s.id === soundId);
    if (!config) return;

    if (this.active.has(soundId)) {
      this.stopSound(soundId);
    } else {
      this.playSound(config);
    }
  }

  private playSound(config: SoundConfig): void {
    if (this.active.has(config.id)) return;

    const events: PlayerEvents = {
      onEnd: () => this.stopSound(config.id),
      onReady: () => this.renderNowPlaying(),
      onError: (message) => {
        console.warn(`Failed to play ${config.name}:`, message);
        this.stopSound(config.id);
        const status = document.querySelector('.status-text');
        if (status) status.textContent = `Couldn't play "${config.name}": ${message}`;
      },
    };

    const volume = config.volume ?? 1.0;
    const loop = config.loop ?? false;
    const player: Player = config.youtubeId
      ? new YoutubePlayer(config.youtubeId, config.name, this.streamDock(), volume, loop, events)
      : new FilePlayer(this.fileUrl(config), volume, loop, events);

    this.active.set(config.id, { player, paused: false });
    this.updateCardState(config.id, true);
    this.updateFooter();
    this.renderNowPlaying();
  }

  private stopSound(soundId: string): void {
    const entry = this.active.get(soundId);
    if (!entry) return;
    entry.player.destroy();
    this.active.delete(soundId);
    this.updateCardState(soundId, false);
    this.updateFooter();
    this.renderNowPlaying();
  }

  private togglePause(soundId: string): void {
    const entry = this.active.get(soundId);
    if (!entry) return;
    if (entry.paused) entry.player.play();
    else entry.player.pause();
    entry.paused = !entry.paused;
    this.renderNowPlaying();
  }

  private toggleLoop(soundId: string): void {
    const config = this.sounds.find((s) => s.id === soundId);
    if (!config) return;
    config.loop = !config.loop;
    this.active.get(soundId)?.player.setLoop(config.loop);
    document
      .querySelectorAll(`[data-sound-id="${soundId}"] .btn-loop, [data-np-id="${soundId}"] .np-loop`)
      .forEach((btn) => btn.classList.toggle('looping', !!config.loop));
    this.persist();
  }

  stopAll(): void {
    for (const [id] of this.active) {
      this.stopSound(id);
    }
  }

  private setVolume(soundId: string, volume: number): void {
    const config = this.sounds.find((s) => s.id === soundId);
    if (config) config.volume = volume;
    this.active.get(soundId)?.player.setVolume(volume);
    // keep the card slider and the Now Playing slider in sync
    document
      .querySelectorAll<HTMLInputElement>(`[data-sound-id="${soundId}"] .vol-slider, [data-np-id="${soundId}"] .np-vol`)
      .forEach((slider) => { slider.value = String(volume); });
  }

  private setMasterVolume(vol: number): void {
    this.masterVolume = vol;
    Howler.volume(vol);
    YoutubePlayer.setMasterVolume(vol);
  }

  private async registerHotkeys(): Promise<void> {
    for (const sound of this.sounds) {
      if (sound.hotkey) {
        await window.soundboardAPI.registerHotkey(sound);
      }
    }
  }

  // ── Sound / category mutation ───────────────────────────────────────────

  private async deleteSound(soundId: string): Promise<void> {
    const config = this.sounds.find((s) => s.id === soundId);
    if (!config) return;
    if (!confirm(`Delete "${config.name}"? This cannot be undone.`)) return;

    if (this.active.has(soundId)) this.stopSound(soundId);
    if (config.hotkey) await window.soundboardAPI.unregisterHotkey(config.hotkey);
    if (config.custom) await window.soundboardAPI.deleteSoundFile(config.file);

    this.sounds = this.sounds.filter((s) => s.id !== soundId);
    await this.persist();
    this.render();
  }

  private async deleteCategory(category: string): Promise<void> {
    const inUse = this.sounds.some((s) => s.category === category);
    const msg = inUse
      ? `Delete category "${category}"? Sounds in it will become Uncategorized.`
      : `Delete category "${category}"?`;
    if (!confirm(msg)) return;

    this.categories = this.categories.filter((c) => c !== category);
    this.sounds.forEach((s) => {
      if (s.category === category) s.category = undefined;
    });
    if (this.activeCategory === category) this.activeCategory = 'All';

    await this.persist();
    this.render();
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────

  private updateCardState(soundId: string, playing: boolean): void {
    const card = document.querySelector(`[data-sound-id="${soundId}"]`) as HTMLElement | null;
    if (!card) return;
    card.classList.toggle('playing', playing);
    const btn = card.querySelector('.btn-play') as HTMLButtonElement;
    if (btn) btn.textContent = this.playLabel(playing);
    this.updateFooter();
  }

  private playLabel(playing: boolean): string {
    const { icons } = this.settings;
    return playing ? `${icons.stop} Stop` : `${icons.play} Play`;
  }

  private updateFooter(): void {
    const status = document.querySelector('.status-text');
    if (status) {
      const count = this.active.size;
      status.textContent = count === 0
        ? 'No sounds playing'
        : `${count} sound${count > 1 ? 's' : ''} playing`;
    }
  }

  private filteredSounds(): SoundConfig[] {
    if (this.activeCategory === 'All') return this.sounds;
    return this.sounds.filter((s) => s.category === this.activeCategory);
  }

  render(): void {
    const app = document.getElementById('app')!;
    // keep the scroll position when re-rendering the same category (e.g. after editing a sound)
    const prevScroll = document.querySelector('.grid-container')?.scrollTop ?? 0;
    const prevCategory = this.renderedCategory;
    this.renderedCategory = this.activeCategory;

    // Everything except the persistent .main is rebuilt; detaching .main would reload YouTube iframes
    const main = this.ensureMain();
    Array.from(app.children).forEach((child) => {
      if (child !== main) child.remove();
    });
    main.querySelector('.grid-container')?.remove();

    // Header
    const { icons } = this.settings;
    const header = document.createElement('header');
    header.innerHTML = `
      <span class="app-title">${escapeHtml(`${this.settings.titleIcon} ${this.settings.title}`.trim())}</span>
      <div class="header-controls">
        <button class="btn-header btn-customize">${escapeHtml(icons.customize)} Customize</button>
        <button class="btn-header btn-add-sound">${escapeHtml(icons.add)} Add Sound</button>
        <div class="master-volume">
          <span>Master Volume</span>
          <input type="range" id="master-vol" min="0" max="1" step="0.01" value="${this.masterVolume}">
          <span id="master-vol-label">${Math.round(this.masterVolume * 100)}%</span>
        </div>
      </div>
    `;

    header.querySelector('#master-vol')!.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.setMasterVolume(val);
      (document.getElementById('master-vol-label') as HTMLElement).textContent = `${Math.round(val * 100)}%`;
    });

    header.querySelector('.btn-add-sound')!.addEventListener('click', () => this.openAddModal());
    header.querySelector('.btn-customize')!.addEventListener('click', () => this.customizeModal.open(this.settings));

    // Grid
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid-container';
    const grid = document.createElement('div');
    grid.className = 'sound-grid';

    const visible = this.filteredSounds();
    if (visible.length === 0) {
      const message = this.sounds.length === 0 ? 'No sounds yet.' : 'No sounds in this category.';
      grid.innerHTML = `<div class="empty-state">${message}<br>Click <strong>+ Add Sound</strong> to add one.</div>`;
    } else {
      visible.forEach((config) => {
        grid.appendChild(this.buildCard(config));
      });
    }

    gridContainer.appendChild(grid);
    main.prepend(gridContainer);

    // Footer
    const footer = document.createElement('footer');
    footer.innerHTML = `
      <span class="status-text">No sounds playing</span>
      <button class="btn-stop-all">${escapeHtml(icons.stopAll)} Stop All</button>
    `;
    footer.querySelector('.btn-stop-all')!.addEventListener('click', () => this.stopAll());

    if (main.parentElement === app) {
      app.insertBefore(header, main);
      app.insertBefore(this.buildTabs(), main);
      app.appendChild(footer);
    } else {
      app.append(header, this.buildTabs(), main, footer);
    }

    if (prevCategory === this.activeCategory) gridContainer.scrollTop = prevScroll;

    this.updateFooter();
    this.renderNowPlaying();

    // Restore playing state visual
    for (const [id] of this.active) {
      this.updateCardState(id, true);
    }
  }

  private buildTabs(): HTMLElement {
    const tabs = document.createElement('div');
    tabs.className = 'tabs';

    const allNames = ['All', ...this.categories];
    allNames.forEach((cat) => {
      const tab = document.createElement('span');
      tab.className = `tab${this.activeCategory === cat ? ' active' : ''}`;

      const label = document.createElement('button');
      label.className = 'tab-label';
      label.textContent = cat;
      label.addEventListener('click', () => {
        this.activeCategory = cat;
        this.render();
      });
      tab.appendChild(label);

      if (cat !== 'All') {
        const remove = document.createElement('button');
        remove.className = 'tab-remove';
        remove.textContent = '×';
        remove.title = `Delete category "${cat}"`;
        remove.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteCategory(cat);
        });
        tab.appendChild(remove);
      }

      tabs.appendChild(tab);
    });

    // "+" add-category control
    const addWrap = document.createElement('span');
    addWrap.className = 'tab tab-add-wrap';
    const addBtn = document.createElement('button');
    addBtn.className = 'tab-label tab-add';
    addBtn.textContent = '+';
    addBtn.title = 'Add category';
    addWrap.appendChild(addBtn);

    addBtn.addEventListener('click', () => {
      addWrap.innerHTML = '';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tab-add-input';
      input.placeholder = 'Category name';
      addWrap.appendChild(input);
      input.focus();

      const commit = () => {
        const name = input.value.trim();
        if (name && !this.categories.includes(name)) {
          this.categories.push(name);
          this.persist();
        }
        this.render();
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') this.render();
      });
      input.addEventListener('blur', commit);
    });

    tabs.appendChild(addWrap);
    return tabs;
  }

  private buildCard(config: SoundConfig): HTMLElement {
    const isPlaying = this.active.has(config.id);
    const card = document.createElement('div');
    card.className = `sound-card${isPlaying ? ' playing' : ''}`;
    card.dataset.soundId = config.id;
    if (config.color) card.style.setProperty('--card-color', config.color);

    const { icons } = this.settings;

    const categoryBadge = config.category
      ? `<span class="category-badge">${escapeHtml(config.category)}</span>`
      : '';

    const hotkeyBadge = config.hotkey
      ? `<span class="hotkey-badge">${escapeHtml(config.hotkey)}</span>`
      : '';

    const soundIcon = config.icon
      ? `<span class="sound-icon">${escapeHtml(config.icon)}</span>`
      : '';

    const streamBadge = config.youtubeId
      ? '<span class="stream-badge" title="Streams from YouTube (needs internet)">YouTube</span>'
      : '';

    card.innerHTML = `
      <div class="card-top">
        <span class="sound-name">${soundIcon}${escapeHtml(config.name)}</span>
        ${streamBadge}
        ${categoryBadge}
      </div>
      <div class="card-controls">
        <button class="btn-play">${escapeHtml(this.playLabel(isPlaying))}</button>
        <button class="btn-loop${config.loop ? ' looping' : ''}" title="Loop">${escapeHtml(icons.loop)}</button>
        ${hotkeyBadge}
        <button class="btn-edit" title="Edit">${escapeHtml(icons.edit)}</button>
        <button class="btn-delete" title="Delete">${escapeHtml(icons.delete)}</button>
      </div>
      <div class="volume-row">
        <span>${escapeHtml(icons.volume)}</span>
        <input type="range" class="vol-slider" min="0" max="1" step="0.01" value="${config.volume ?? 1.0}">
      </div>
    `;

    card.querySelector('.btn-play')!.addEventListener('click', () => this.toggleSound(config.id));

    card.querySelector('.btn-loop')!.addEventListener('click', () => this.toggleLoop(config.id));

    const volSlider = card.querySelector('.vol-slider') as HTMLInputElement;
    volSlider.addEventListener('input', () => {
      this.setVolume(config.id, parseFloat(volSlider.value));
    });
    volSlider.addEventListener('change', () => this.persist());

    card.querySelector('.btn-edit')!.addEventListener('click', () => this.openEditModal(config));
    card.querySelector('.btn-delete')!.addEventListener('click', () => this.deleteSound(config.id));

    return card;
  }

  // ── Now Playing panel ───────────────────────────────────────────────────

  private ensureMain(): HTMLElement {
    if (!this.mainEl) {
      const main = document.createElement('div');
      main.className = 'main';
      main.innerHTML = `
        <aside class="now-playing">
          <div class="np-header">Now Playing</div>
          <div class="np-streams"></div>
          <div class="np-list"></div>
        </aside>
      `;
      this.mainEl = main;
    }
    return this.mainEl;
  }

  /** Where streaming YouTube players live; YouTube requires them to stay visible. */
  private streamDock(): HTMLElement {
    return this.ensureMain().querySelector('.np-streams') as HTMLElement;
  }

  private renderNowPlaying(): void {
    const list = document.querySelector('.np-list');
    if (!list) return;
    list.innerHTML = '';

    const hasStreams = [...this.active.keys()].some((id) => this.sounds.find((s) => s.id === id)?.youtubeId);
    this.ensureMain().querySelector('.now-playing')!.classList.toggle('has-streams', hasStreams);

    const header = document.querySelector('.np-header');
    if (header) header.textContent = this.active.size ? `Now Playing (${this.active.size})` : 'Now Playing';

    if (this.active.size === 0) {
      list.innerHTML = '<div class="np-empty">Nothing playing.</div>';
      return;
    }

    for (const [id, entry] of this.active) {
      const config = this.sounds.find((s) => s.id === id);
      if (config) list.appendChild(this.buildNowPlayingItem(config, entry.paused));
    }
    this.updateProgress();
  }

  private buildNowPlayingItem(config: SoundConfig, paused: boolean): HTMLElement {
    const item = document.createElement('div');
    item.className = `np-item${paused ? ' paused' : ''}`;
    item.dataset.npId = config.id;
    if (config.color) item.style.setProperty('--card-color', config.color);
    const { icons } = this.settings;
    item.innerHTML = `
      <div class="np-top">
        <span class="np-name"></span>
        <span class="np-time">0:00</span>
      </div>
      <div class="np-progress" title="Click to seek"><div class="np-track"><div class="np-fill"></div></div></div>
      <div class="np-controls">
        <button class="np-btn np-pause" title="${paused ? 'Resume' : 'Pause'}">${escapeHtml(paused ? icons.play : icons.pause)}</button>
        <button class="np-btn np-stop" title="Stop">${escapeHtml(icons.stop)}</button>
        <button class="np-btn np-loop${config.loop ? ' looping' : ''}" title="Loop">${escapeHtml(icons.loop)}</button>
        <span>${escapeHtml(icons.volume)}</span>
        <input type="range" class="np-vol" min="0" max="1" step="0.01" value="${config.volume ?? 1.0}">
      </div>
    `;
    const nameEl = item.querySelector('.np-name') as HTMLElement;
    nameEl.textContent = config.icon ? `${config.icon} ${config.name}` : config.name;
    nameEl.title = config.name;

    item.querySelector('.np-pause')!.addEventListener('click', () => this.togglePause(config.id));
    item.querySelector('.np-stop')!.addEventListener('click', () => this.stopSound(config.id));
    item.querySelector('.np-loop')!.addEventListener('click', () => this.toggleLoop(config.id));

    const vol = item.querySelector('.np-vol') as HTMLInputElement;
    vol.addEventListener('input', () => this.setVolume(config.id, parseFloat(vol.value)));
    vol.addEventListener('change', () => this.persist());

    const progress = item.querySelector('.np-progress') as HTMLElement;
    progress.addEventListener('click', (e) => {
      const player = this.active.get(config.id)?.player;
      const duration = player?.duration() ?? 0;
      if (!player || !duration) return;
      const rect = progress.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      player.seek(ratio * duration);
      this.updateProgress();
    });

    return item;
  }

  private updateProgress(): void {
    for (const [id, entry] of this.active) {
      const item = document.querySelector(`[data-np-id="${id}"]`);
      if (!item) continue;
      const duration = entry.player.duration();
      const seconds = entry.player.position();
      (item.querySelector('.np-fill') as HTMLElement).style.width =
        duration ? `${Math.min(100, (seconds / duration) * 100)}%` : '0%';
      (item.querySelector('.np-time') as HTMLElement).textContent =
        duration ? `${formatTime(seconds)} / ${formatTime(duration)}` : 'Loading…';
    }
  }

  // ── Add / Edit Sound modal ──────────────────────────────────────────────

  private buildModal(): void {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">Add Sound</h2>
        <div class="modal-field">
          <label>Sound</label>
          <div class="modal-file-row">
            <button type="button" class="btn-choose-file btn-pick-file">Choose File…</button>
            <button type="button" class="btn-choose-file btn-youtube-toggle">From YouTube…</button>
          </div>
          <span class="modal-file-label">No file chosen</span>
          <div class="yt-box" style="display:none">
            <input type="text" id="yt-url" placeholder="Paste a YouTube link">
            <div class="yt-modes">
              <label><input type="radio" name="yt-mode" value="download" checked>
                <span><strong>Download audio</strong><small>Works offline, with every control. Personal use only.</small></span></label>
              <label><input type="radio" name="yt-mode" value="stream">
                <span><strong>Stream</strong><small>Needs internet; may show ads. Plays in the Now Playing panel.</small></span></label>
            </div>
            <div class="yt-actions">
              <button type="button" class="btn-choose-file btn-yt-go">Download</button>
              <span class="yt-status"></span>
            </div>
          </div>
        </div>
        <div class="modal-field">
          <label for="modal-name">Title</label>
          <input type="text" id="modal-name" placeholder="e.g. Goblin Ambush">
        </div>
        <div class="modal-field">
          <label for="modal-icon">Icon (optional)</label>
          <input type="text" id="modal-icon" class="modal-icon-input" placeholder="Pick one below or type any emoji" maxlength="8">
          <div class="icon-picks"></div>
        </div>
        <div class="modal-field modal-field-row">
          <label for="modal-color-on">Card color</label>
          <div class="modal-color-row">
            <input type="checkbox" id="modal-color-on" title="Use a custom color">
            <input type="color" id="modal-color" value="#c9a84c">
          </div>
        </div>
        <div class="modal-field">
          <label for="modal-category">Category</label>
          <select id="modal-category"></select>
          <input type="text" id="modal-new-category" class="modal-new-category" placeholder="New category name" style="display:none">
        </div>
        <div class="modal-field">
          <label for="modal-hotkey">Hotkey (optional)</label>
          <input type="text" id="modal-hotkey" placeholder="e.g. F1 or Ctrl+Shift+A">
        </div>
        <div class="modal-field modal-field-row">
          <label for="modal-volume">Default Volume</label>
          <input type="range" id="modal-volume" min="0" max="1" step="0.01" value="1">
        </div>
        <div class="modal-field modal-field-row">
          <label for="modal-loop">Loop by default</label>
          <input type="checkbox" id="modal-loop">
        </div>
        <div class="modal-error" style="display:none"></div>
        <div class="modal-actions">
          <button type="button" class="btn-modal-cancel">Cancel</button>
          <button type="button" class="btn-modal-save">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this.modalEl = overlay;

    const categorySelect = overlay.querySelector('#modal-category') as HTMLSelectElement;
    const newCategoryInput = overlay.querySelector('#modal-new-category') as HTMLInputElement;
    categorySelect.addEventListener('change', () => {
      newCategoryInput.style.display = categorySelect.value === NEW_CATEGORY_VALUE ? 'block' : 'none';
    });

    const iconInput = overlay.querySelector('#modal-icon') as HTMLInputElement;
    const picks = overlay.querySelector('.icon-picks')!;
    [...SOUND_ICON_PICKS, ''].forEach((icon) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-pick';
      btn.textContent = icon || '✕';
      btn.title = icon ? icon : 'No icon';
      btn.addEventListener('click', () => { iconInput.value = icon; });
      picks.appendChild(btn);
    });

    // picking a color implies the user wants one
    const colorOn = overlay.querySelector('#modal-color-on') as HTMLInputElement;
    overlay.querySelector('#modal-color')!.addEventListener('input', () => { colorOn.checked = true; });

    overlay.querySelector('.btn-pick-file')!.addEventListener('click', () => this.chooseFile());

    const ytBox = overlay.querySelector('.yt-box') as HTMLElement;
    const ytGo = overlay.querySelector('.btn-yt-go') as HTMLButtonElement;
    overlay.querySelector('.btn-youtube-toggle')!.addEventListener('click', () => {
      ytBox.style.display = ytBox.style.display === 'none' ? 'flex' : 'none';
      if (ytBox.style.display !== 'none') (overlay.querySelector('#yt-url') as HTMLInputElement).focus();
    });
    overlay.querySelectorAll<HTMLInputElement>('input[name="yt-mode"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        ytGo.textContent = this.youtubeMode() === 'stream' ? 'Use Link' : 'Download';
      });
    });
    ytGo.addEventListener('click', () => this.useYoutubeLink());
    (overlay.querySelector('#yt-url') as HTMLInputElement).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !ytGo.disabled) this.useYoutubeLink();
    });

    window.soundboardAPI.onYoutubeProgress((progress: YoutubeProgress) => {
      if (progress.stage === 'installing') {
        this.setYoutubeStatus('Setting up the YouTube downloader (first time only)…');
      } else if (progress.stage === 'updating') {
        this.setYoutubeStatus('Updating the YouTube downloader…');
      } else {
        this.setYoutubeStatus(`Downloading… ${Math.round(progress.percent ?? 0)}%`);
      }
    });
    overlay.querySelector('.btn-modal-cancel')!.addEventListener('click', () => this.closeModal());
    overlay.querySelector('.btn-modal-save')!.addEventListener('click', () => this.saveModal());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal();
    });
  }

  private populateCategorySelect(selected?: string): void {
    const select = this.modalEl.querySelector('#modal-category') as HTMLSelectElement;
    select.innerHTML = '';

    const uncategorized = document.createElement('option');
    uncategorized.value = UNCATEGORIZED_VALUE;
    uncategorized.textContent = 'Uncategorized';
    select.appendChild(uncategorized);

    this.categories.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    });

    const newOpt = document.createElement('option');
    newOpt.value = NEW_CATEGORY_VALUE;
    newOpt.textContent = '+ New category…';
    select.appendChild(newOpt);

    select.value = selected ?? UNCATEGORIZED_VALUE;
    (this.modalEl.querySelector('#modal-new-category') as HTMLInputElement).style.display = 'none';
  }

  private resetYoutubeBox(): void {
    this.modalSession++;
    (this.modalEl.querySelector('.yt-box') as HTMLElement).style.display = 'none';
    (this.modalEl.querySelector('#yt-url') as HTMLInputElement).value = '';
    (this.modalEl.querySelector('.btn-yt-go') as HTMLButtonElement).disabled = false;
    this.setYoutubeStatus('');
  }

  private openAddModal(): void {
    this.editingId = null;
    this.pendingFile = null;
    this.pendingFileIsNew = false;
    this.pendingYoutubeId = null;
    this.resetYoutubeBox();

    (this.modalEl.querySelector('.modal-title') as HTMLElement).textContent = 'Add Sound';
    (this.modalEl.querySelector('#modal-name') as HTMLInputElement).value = '';
    (this.modalEl.querySelector('#modal-hotkey') as HTMLInputElement).value = '';
    (this.modalEl.querySelector('#modal-volume') as HTMLInputElement).value = '1';
    (this.modalEl.querySelector('#modal-loop') as HTMLInputElement).checked = false;
    (this.modalEl.querySelector('#modal-icon') as HTMLInputElement).value = '';
    (this.modalEl.querySelector('#modal-color-on') as HTMLInputElement).checked = false;
    (this.modalEl.querySelector('#modal-color') as HTMLInputElement).value = this.settings.colors.accent;
    (this.modalEl.querySelector('.modal-file-label') as HTMLElement).textContent = 'No file chosen';
    this.populateCategorySelect();
    this.showModalError('');

    this.modalEl.style.display = 'flex';
  }

  private openEditModal(config: SoundConfig): void {
    this.editingId = config.id;
    this.pendingFile = config.youtubeId ? null : config.file;
    this.pendingFileIsNew = false;
    this.pendingYoutubeId = config.youtubeId ?? null;
    this.resetYoutubeBox();

    (this.modalEl.querySelector('.modal-title') as HTMLElement).textContent = 'Edit Sound';
    (this.modalEl.querySelector('#modal-name') as HTMLInputElement).value = config.name;
    (this.modalEl.querySelector('#modal-hotkey') as HTMLInputElement).value = config.hotkey ?? '';
    (this.modalEl.querySelector('#modal-volume') as HTMLInputElement).value = String(config.volume ?? 1);
    (this.modalEl.querySelector('#modal-loop') as HTMLInputElement).checked = !!config.loop;
    (this.modalEl.querySelector('#modal-icon') as HTMLInputElement).value = config.icon ?? '';
    (this.modalEl.querySelector('#modal-color-on') as HTMLInputElement).checked = !!config.color;
    (this.modalEl.querySelector('#modal-color') as HTMLInputElement).value = config.color ?? this.settings.colors.accent;
    (this.modalEl.querySelector('.modal-file-label') as HTMLElement).textContent = config.youtubeId
      ? `Streams from YouTube (${config.youtubeId})`
      : config.file;
    this.populateCategorySelect(config.category);
    this.showModalError('');

    this.modalEl.style.display = 'flex';
  }

  private async chooseFile(): Promise<void> {
    const result = await window.soundboardAPI.selectAndImportSound();
    if (!result) return;

    await this.discardPendingImport();
    this.pendingFile = result.file;
    this.pendingFileIsNew = true;
    this.pendingYoutubeId = null;
    (this.modalEl.querySelector('.modal-file-label') as HTMLElement).textContent = result.file;
    this.suggestName(result.suggestedName);
  }

  /** Drop a file imported in this modal session that hasn't been saved to a sound. */
  private async discardPendingImport(): Promise<void> {
    if (this.pendingFileIsNew && this.pendingFile) {
      await window.soundboardAPI.deleteSoundFile(this.pendingFile);
    }
    this.pendingFile = null;
    this.pendingFileIsNew = false;
  }

  private suggestName(name: string): void {
    const nameInput = this.modalEl.querySelector('#modal-name') as HTMLInputElement;
    if (!nameInput.value.trim()) nameInput.value = name;
  }

  private youtubeMode(): 'download' | 'stream' {
    const checked = this.modalEl.querySelector('input[name="yt-mode"]:checked') as HTMLInputElement;
    return checked.value === 'stream' ? 'stream' : 'download';
  }

  private setYoutubeStatus(message: string, isError = false): void {
    const el = this.modalEl.querySelector('.yt-status') as HTMLElement;
    el.textContent = message;
    el.classList.toggle('error', isError);
  }

  private async useYoutubeLink(): Promise<void> {
    const url = (this.modalEl.querySelector('#yt-url') as HTMLInputElement).value.trim();
    const videoId = parseYoutubeId(url);
    if (!videoId) {
      this.setYoutubeStatus("That doesn't look like a YouTube video link.", true);
      return;
    }

    const goBtn = this.modalEl.querySelector('.btn-yt-go') as HTMLButtonElement;
    const fileLabel = this.modalEl.querySelector('.modal-file-label') as HTMLElement;
    const session = this.modalSession;
    goBtn.disabled = true;

    try {
      if (this.youtubeMode() === 'stream') {
        this.setYoutubeStatus('Looking up the video…');
        const title = await window.soundboardAPI.youtubeTitle(videoId);
        if (session !== this.modalSession) return;

        await this.discardPendingImport();
        this.pendingYoutubeId = videoId;
        fileLabel.textContent = `Streams from YouTube: ${title ?? videoId}`;
        if (title) this.suggestName(title);
        this.setYoutubeStatus('Ready. Save to add it.');
      } else {
        this.setYoutubeStatus('Starting download…');
        const result = await window.soundboardAPI.youtubeDownload(url);
        if (session !== this.modalSession) {
          // the modal was closed or reopened mid-download; nobody will claim this file
          if ('file' in result) await window.soundboardAPI.deleteSoundFile(result.file);
          return;
        }
        if ('error' in result) {
          this.setYoutubeStatus(result.error, true);
          return;
        }

        await this.discardPendingImport();
        this.pendingFile = result.file;
        this.pendingFileIsNew = true;
        this.pendingYoutubeId = null;
        fileLabel.textContent = result.file;
        this.suggestName(result.suggestedName);
        this.setYoutubeStatus('Downloaded ✓ Save to add it.');
      }
    } finally {
      if (session === this.modalSession) goBtn.disabled = false;
    }
  }

  private showModalError(msg: string): void {
    const el = this.modalEl.querySelector('.modal-error') as HTMLElement;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  private async closeModal(): Promise<void> {
    this.modalSession++;
    if (this.pendingFileIsNew && this.pendingFile) {
      await window.soundboardAPI.deleteSoundFile(this.pendingFile);
    }
    this.pendingFile = null;
    this.pendingFileIsNew = false;
    this.modalEl.style.display = 'none';
  }

  private async saveModal(): Promise<void> {
    const name = (this.modalEl.querySelector('#modal-name') as HTMLInputElement).value.trim();
    const hotkey = (this.modalEl.querySelector('#modal-hotkey') as HTMLInputElement).value.trim();
    const volume = parseFloat((this.modalEl.querySelector('#modal-volume') as HTMLInputElement).value);
    const loop = (this.modalEl.querySelector('#modal-loop') as HTMLInputElement).checked;
    const icon = (this.modalEl.querySelector('#modal-icon') as HTMLInputElement).value.trim();
    const useColor = (this.modalEl.querySelector('#modal-color-on') as HTMLInputElement).checked;
    const color = (this.modalEl.querySelector('#modal-color') as HTMLInputElement).value;
    const categorySelect = this.modalEl.querySelector('#modal-category') as HTMLSelectElement;
    const newCategoryInput = this.modalEl.querySelector('#modal-new-category') as HTMLInputElement;

    if (!name) {
      this.showModalError('Please enter a title.');
      return;
    }
    if (!this.pendingFile && !this.pendingYoutubeId) {
      this.showModalError('Please choose an audio file or a YouTube link.');
      return;
    }

    let category: string | undefined;
    if (categorySelect.value === NEW_CATEGORY_VALUE) {
      const newCat = newCategoryInput.value.trim();
      if (!newCat) {
        this.showModalError('Please enter a name for the new category.');
        return;
      }
      category = newCat;
    } else if (categorySelect.value !== UNCATEGORIZED_VALUE) {
      category = categorySelect.value;
    }

    const existing = this.editingId ? this.sounds.find((s) => s.id === this.editingId) : undefined;
    const oldHotkey = existing?.hotkey;

    // unregister the old hotkey if it changed or was cleared
    if (oldHotkey && oldHotkey !== hotkey) {
      await window.soundboardAPI.unregisterHotkey(oldHotkey);
    }

    const config: SoundConfig = {
      id: existing?.id ?? crypto.randomUUID(),
      name,
      file: this.pendingFile ?? '',
      hotkey: hotkey || undefined,
      volume: isNaN(volume) ? 1 : volume,
      loop,
      category,
      custom: this.pendingYoutubeId ? undefined : this.pendingFileIsNew ? true : existing?.custom,
      youtubeId: this.pendingYoutubeId ?? undefined,
      icon: icon || undefined,
      color: useColor ? color : undefined,
    };

    if (hotkey) {
      const ok = await window.soundboardAPI.registerHotkey(config);
      if (!ok) {
        // restore the old binding since the new one failed
        if (oldHotkey) await window.soundboardAPI.registerHotkey({ ...config, hotkey: oldHotkey });
        this.showModalError(`Hotkey "${hotkey}" is invalid or already in use.`);
        return;
      }
    }

    // if editing and the file was replaced, drop the old custom file
    if (existing && existing.custom && existing.file !== config.file) {
      await window.soundboardAPI.deleteSoundFile(existing.file);
    }

    if (category && !this.categories.includes(category)) {
      this.categories.push(category);
    }

    if (existing) {
      const idx = this.sounds.findIndex((s) => s.id === existing.id);
      this.sounds[idx] = config;
    } else {
      this.sounds.push(config);
    }

    this.pendingFileIsNew = false; // now owned by the saved sound, don't discard on close
    this.modalSession++;
    await this.persist();

    this.modalEl.style.display = 'none';
    this.render();
  }
}
