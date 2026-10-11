import { app, net, session } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { YoutubeDownloadResult, YoutubeProgress, parseYoutubeId } from '../shared/types';

const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
// YouTube changes often and a stale yt-dlp is the most common cause of failed downloads
const UPDATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type Reporter = (progress: YoutubeProgress) => void;

/**
 * YouTube refuses to play embeds (error 153) unless the request carries an http(s) Referer,
 * and pages loaded from file:// don't send one.
 */
export function allowYoutubeEmbeds(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://dnd-soundboard.app/';
      callback({ requestHeaders: details.requestHeaders });
    },
  );
}

function ytDlpPath(): string {
  return path.join(app.getPath('userData'), 'bin', 'yt-dlp.exe');
}

function run(
  exe: string,
  args: string[],
  onLine?: (line: string) => void,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stdout += text;
      text.split(/\r?\n/).forEach((line) => onLine?.(line));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderr += text;
      text.split(/\r?\n/).forEach((line) => onLine?.(line));
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function ensureYtDlp(report: Reporter): Promise<string> {
  const exe = ytDlpPath();
  if (!fs.existsSync(exe)) {
    report({ stage: 'installing' });
    fs.mkdirSync(path.dirname(exe), { recursive: true });
    const res = await net.fetch(YT_DLP_URL);
    if (!res.ok) throw new Error(`Couldn't download the YouTube downloader (HTTP ${res.status}).`);
    const partial = `${exe}.part`;
    fs.writeFileSync(partial, Buffer.from(await res.arrayBuffer()));
    fs.renameSync(partial, exe);
  } else if (Date.now() - fs.statSync(exe).mtimeMs > UPDATE_AFTER_MS) {
    report({ stage: 'updating' });
    await run(exe, ['-U']).catch(() => undefined);
    // touch it so a failed update isn't retried before every download
    fs.utimesSync(exe, new Date(), new Date());
  }
  return exe;
}

export async function downloadYoutubeAudio(
  url: string,
  destDir: string,
  report: Reporter,
): Promise<YoutubeDownloadResult> {
  const id = parseYoutubeId(url);
  if (!id) return { error: "That doesn't look like a YouTube video link." };

  try {
    const exe = await ensureYtDlp(report);
    report({ stage: 'downloading', percent: 0 });

    // unique name so the same video can back two sounds without one delete breaking the other
    const outTemplate = path.join(destDir, `yt-${id}-${Date.now()}.%(ext)s`);
    const { code, stdout, stderr } = await run(
      exe,
      [
        '--no-playlist',
        '--encoding', 'utf-8',
        '--no-mtime',
        // m4a/webm audio streams play directly in Chromium, so no ffmpeg is needed
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        '-o', outTemplate,
        '--print', 'title',
        '--print', 'after_move:filepath',
        '--no-simulate',
        '--progress',
        '--newline',
        '--',
        `https://www.youtube.com/watch?v=${id}`,
      ],
      (line) => {
        const match = line.match(/\[download\]\s+([\d.]+)%/);
        if (match) report({ stage: 'downloading', percent: parseFloat(match[1]) });
      },
    );

    if (code !== 0) {
      const errorLine = stderr.split(/\r?\n/).find((l) => l.startsWith('ERROR:'));
      return { error: errorLine ? errorLine.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '') : 'Download failed.' };
    }

    // --print output: title first, final file path last (progress lines start with "[")
    const printed = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('[') && !l.startsWith('WARNING'));
    const filePath = printed[printed.length - 1];
    if (!filePath || !fs.existsSync(filePath)) return { error: 'Download finished but the audio file is missing.' };

    return { file: path.basename(filePath), suggestedName: printed.length > 1 ? printed[0] : 'YouTube sound' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchYoutubeTitle(videoId: string): Promise<string | null> {
  try {
    const watchUrl = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
    const res = await net.fetch(`https://www.youtube.com/oembed?url=${watchUrl}&format=json`);
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title ?? null;
  } catch {
    return null;
  }
}
