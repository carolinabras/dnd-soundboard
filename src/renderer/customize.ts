import { AppSettings, ThemeColorKey, UiIconKey } from '../shared/types';
import { COLOR_LABELS, DEFAULT_SETTINGS, ICON_LABELS, PRESETS, cloneSettings } from './theme';

/**
 * The Customize window. Every edit is previewed live through `onPreview`;
 * Cancel previews the original settings again, Save hands the draft to `onSave`.
 */
export class CustomizeModal {
  private el: HTMLElement;
  private draft: AppSettings = cloneSettings(DEFAULT_SETTINGS);
  private original: AppSettings = cloneSettings(DEFAULT_SETTINGS);

  constructor(
    private onPreview: (settings: AppSettings) => void,
    private onSave: (settings: AppSettings) => void,
  ) {
    this.el = this.build();
    document.body.appendChild(this.el);
  }

  open(current: AppSettings): void {
    this.original = cloneSettings(current);
    this.draft = cloneSettings(current);
    this.fillFields();
    this.el.style.display = 'flex';
  }

  private close(): void {
    this.el.style.display = 'none';
  }

  private cancel(): void {
    this.onPreview(this.original);
    this.close();
  }

  private changed(): void {
    this.onPreview(cloneSettings(this.draft));
  }

  private build(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="modal modal-wide">
        <h2 class="modal-title">Customize</h2>

        <section class="cz-section">
          <h3>Theme presets</h3>
          <div class="cz-presets"></div>
        </section>

        <section class="cz-section">
          <h3>Colors</h3>
          <div class="cz-grid cz-colors"></div>
        </section>

        <section class="cz-section">
          <h3>Title</h3>
          <div class="cz-grid">
            <label class="cz-field"><span>Icon</span><input type="text" class="cz-icon-input" data-setting="titleIcon" maxlength="8"></label>
            <label class="cz-field"><span>Text</span><input type="text" data-setting="title"></label>
          </div>
        </section>

        <section class="cz-section">
          <h3>Button icons</h3>
          <p class="cz-hint">Type any emoji or symbol. Press <kbd>Win</kbd> + <kbd>.</kbd> to open the Windows emoji picker.</p>
          <div class="cz-grid cz-icons"></div>
        </section>

        <section class="cz-section">
          <h3>Layout</h3>
          <div class="cz-grid">
            <label class="cz-field"><span>Card size</span><input type="range" data-setting="cardWidth" min="160" max="360" step="10"></label>
            <label class="cz-field"><span>Show Now Playing panel</span><input type="checkbox" data-setting="showNowPlaying"></label>
          </div>
        </section>

        <div class="modal-actions">
          <button type="button" class="btn-modal-cancel cz-reset">Reset to defaults</button>
          <button type="button" class="btn-modal-cancel cz-cancel">Cancel</button>
          <button type="button" class="btn-modal-save cz-save">Save</button>
        </div>
      </div>
    `;

    const presets = overlay.querySelector('.cz-presets')!;
    PRESETS.forEach((preset) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cz-preset';
      btn.innerHTML = `
        <span class="cz-swatches">
          <span style="background:${preset.colors.background}"></span>
          <span style="background:${preset.colors.surface}"></span>
          <span style="background:${preset.colors.accent}"></span>
        </span>
      `;
      btn.append(preset.name);
      btn.addEventListener('click', () => {
        this.draft.colors = { ...preset.colors };
        this.fillFields();
        this.changed();
      });
      presets.appendChild(btn);
    });

    const colors = overlay.querySelector('.cz-colors')!;
    (Object.keys(COLOR_LABELS) as ThemeColorKey[]).forEach((key) => {
      const field = document.createElement('label');
      field.className = 'cz-field';
      field.innerHTML = `<span>${COLOR_LABELS[key]}</span><input type="color" data-color="${key}">`;
      field.querySelector('input')!.addEventListener('input', (e) => {
        this.draft.colors[key] = (e.target as HTMLInputElement).value;
        this.changed();
      });
      colors.appendChild(field);
    });

    const icons = overlay.querySelector('.cz-icons')!;
    (Object.keys(ICON_LABELS) as UiIconKey[]).forEach((key) => {
      const field = document.createElement('label');
      field.className = 'cz-field';
      field.innerHTML = `<span>${ICON_LABELS[key]}</span><input type="text" class="cz-icon-input" data-icon="${key}" maxlength="8">`;
      field.querySelector('input')!.addEventListener('input', (e) => {
        this.draft.icons[key] = (e.target as HTMLInputElement).value;
        this.changed();
      });
      icons.appendChild(field);
    });

    overlay.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.setting!;
        if (key === 'title') this.draft.title = input.value;
        else if (key === 'titleIcon') this.draft.titleIcon = input.value;
        else if (key === 'cardWidth') this.draft.cardWidth = parseInt(input.value, 10);
        else if (key === 'showNowPlaying') this.draft.showNowPlaying = input.checked;
        this.changed();
      });
    });

    overlay.querySelector('.cz-reset')!.addEventListener('click', () => {
      this.draft = cloneSettings(DEFAULT_SETTINGS);
      this.fillFields();
      this.changed();
    });
    overlay.querySelector('.cz-cancel')!.addEventListener('click', () => this.cancel());
    overlay.querySelector('.cz-save')!.addEventListener('click', () => {
      this.onSave(cloneSettings(this.draft));
      this.close();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.cancel();
    });

    return overlay;
  }

  private fillFields(): void {
    this.el.querySelectorAll<HTMLInputElement>('[data-color]').forEach((input) => {
      input.value = this.draft.colors[input.dataset.color as ThemeColorKey];
    });
    this.el.querySelectorAll<HTMLInputElement>('[data-icon]').forEach((input) => {
      input.value = this.draft.icons[input.dataset.icon as UiIconKey];
    });
    this.el.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
      const key = input.dataset.setting!;
      if (key === 'title') input.value = this.draft.title;
      else if (key === 'titleIcon') input.value = this.draft.titleIcon;
      else if (key === 'cardWidth') input.value = String(this.draft.cardWidth);
      else if (key === 'showNowPlaying') input.checked = this.draft.showNowPlaying;
    });
  }
}
