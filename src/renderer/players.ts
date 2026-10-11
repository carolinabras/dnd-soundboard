import { Howl } from 'howler';

export interface PlayerEvents {
  /** playback finished and isn't looping */
  onEnd: () => void;
  /** duration is now known */
  onReady: () => void;
  onError: (message: string) => void;
}

/** What the soundboard needs from a playing sound, whatever its source. */
export interface Player {
  play(): void;
  pause(): void;
  /** stop and release everything */
  destroy(): void;
  setVolume(volume: number): void;
  setLoop(loop: boolean): void;
  seek(seconds: number): void;
  position(): number;
  duration(): number;
}

export class FilePlayer implements Player {
  private howl: Howl;

  constructor(src: string, volume: number, loop: boolean, events: PlayerEvents) {
    // master volume is applied globally via Howler.volume, so only the per-sound volume goes here
    this.howl = new Howl({
      src: [src],
      volume,
      loop,
      // onend also fires at the end of each loop iteration; read the live loop flag
      onend: () => { if (!this.howl.loop()) events.onEnd(); },
      onload: () => events.onReady(),
      onloaderror: (_id, err) => events.onError(String(err)),
    });
    this.howl.play();
  }

  play(): void { this.howl.play(); }
  pause(): void { this.howl.pause(); }
  destroy(): void { this.howl.stop(); this.howl.unload(); }
  setVolume(volume: number): void { this.howl.volume(volume); }
  setLoop(loop: boolean): void { this.howl.loop(loop); }
  seek(seconds: number): void { this.howl.seek(seconds); }

  position(): number {
    const pos = this.howl.seek();
    return typeof pos === 'number' ? pos : 0;
  }

  duration(): number { return this.howl.duration(); }
}

const YOUTUBE_ORIGIN = 'https://www.youtube.com';

const YOUTUBE_ERRORS: Record<number, string> = {
  2: 'invalid video link',
  5: 'the video can\'t be played here',
  100: 'the video was removed or is private',
  101: 'the owner doesn\'t allow this video to be embedded — try Download instead',
  150: 'the owner doesn\'t allow this video to be embedded — try Download instead',
  153: 'YouTube rejected the player',
};

let nextPlayerId = 1;

/**
 * Streams a YouTube video through its embed player, driven over postMessage
 * (the same protocol the official IFrame API uses, without loading its script).
 * YouTube requires the player to stay visible, so it is shown in the Now Playing panel.
 */
export class YoutubePlayer implements Player {
  /** Howler's master volume doesn't reach the iframes, so it is applied here. */
  private static masterVolume = 1;
  private static live = new Set<YoutubePlayer>();

  static setMasterVolume(volume: number): void {
    YoutubePlayer.masterVolume = volume;
    YoutubePlayer.live.forEach((p) => p.applyVolume());
  }

  private id = nextPlayerId++;
  private wrapper: HTMLElement;
  private iframe: HTMLIFrameElement;
  private handshake: number | undefined;
  private connected = false;
  private time = 0;
  private length = 0;
  private finished = false;

  constructor(
    videoId: string,
    label: string,
    dock: HTMLElement,
    private volume: number,
    private loop: boolean,
    private events: PlayerEvents,
  ) {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'yt-player';
    const caption = document.createElement('div');
    caption.className = 'yt-caption';
    caption.textContent = label;

    this.iframe = document.createElement('iframe');
    this.iframe.allow = 'autoplay; encrypted-media';
    this.iframe.src = `${YOUTUBE_ORIGIN}/embed/${encodeURIComponent(videoId)}`
      + '?enablejsapi=1&autoplay=1&playsinline=1&rel=0&controls=0&disablekb=1&iv_load_policy=3';
    this.iframe.addEventListener('load', () => {
      // the player only starts reporting state after it hears "listening"
      this.handshake = window.setInterval(() => this.post({ event: 'listening' }), 250);
    });

    window.addEventListener('message', this.onMessage);
    this.wrapper.append(caption, this.iframe);
    dock.appendChild(this.wrapper);
    YoutubePlayer.live.add(this);
  }

  private post(message: Record<string, unknown>): void {
    this.iframe.contentWindow?.postMessage(
      JSON.stringify({ ...message, id: this.id, channel: 'widget' }),
      YOUTUBE_ORIGIN,
    );
  }

  private command(func: string, args: unknown[] = []): void {
    this.post({ event: 'command', func, args });
  }

  private applyVolume(): void {
    this.command('setVolume', [Math.round(this.volume * YoutubePlayer.masterVolume * 100)]);
  }

  private onMessage = (e: MessageEvent): void => {
    if (e.source !== this.iframe.contentWindow || typeof e.data !== 'string') return;
    let data: { event?: string; info?: any };
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }

    if (!this.connected) {
      this.connected = true;
      window.clearInterval(this.handshake);
      this.command('addEventListener', ['onStateChange']);
      this.command('addEventListener', ['onError']);
      this.applyVolume();
    }

    if (data.event === 'infoDelivery' && data.info) {
      if (typeof data.info.currentTime === 'number') this.time = data.info.currentTime;
      if (typeof data.info.duration === 'number' && data.info.duration > 0 && !this.length) {
        this.length = data.info.duration;
        this.events.onReady();
      }
      if (data.info.playerState === 0) this.ended();
    } else if (data.event === 'onStateChange' && data.info === 0) {
      this.ended();
    } else if (data.event === 'onError') {
      this.events.onError(YOUTUBE_ERRORS[data.info] ?? `YouTube error ${data.info}`);
    }
  };

  private ended(): void {
    if (this.loop) {
      this.command('seekTo', [0, true]);
      this.command('playVideo');
    } else if (!this.finished) {
      this.finished = true;
      this.events.onEnd();
    }
  }

  play(): void { this.command('playVideo'); }
  pause(): void { this.command('pauseVideo'); }

  destroy(): void {
    window.clearInterval(this.handshake);
    window.removeEventListener('message', this.onMessage);
    this.wrapper.remove();
    YoutubePlayer.live.delete(this);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.applyVolume();
  }

  setLoop(loop: boolean): void { this.loop = loop; }

  seek(seconds: number): void {
    this.time = seconds;
    this.finished = false;
    this.command('seekTo', [seconds, true]);
  }

  position(): number { return this.time; }
  duration(): number { return this.length; }
}
