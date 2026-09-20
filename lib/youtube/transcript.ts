/**
 * RF-02 — fetches a video's English captions by driving `yt-dlp`.
 *
 * Node in-process cannot do this any more: the `timedtext` endpoint answers
 * `200` with an empty body to anything without a proof-of-origin token. The
 * yt-dlp binary still gets through, and a child process is not subject to the
 * block (measured in docs/SPIKE-RESULTS.md §S-1b, ~2,3s per video).
 *
 * What the spike forces on this module:
 * - **one caption track per video** — the third request in a row took a 429,
 *   and yt-dlp exits non-zero, losing the tracks it had already downloaded;
 * - **`--sub-lang en`, never a glob**, for the same reason;
 * - **cache everything**, because a fetch is slow and rate-limited;
 * - the YouTube block can also be a plain `Sign in to confirm you're not a
 *   bot` on an IP that asked too much — temporary, and worth its own message.
 *
 * The command runner is injectable so the whole module can be tested without
 * a binary, a network or a video.
 */

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCaptions } from '@/lib/captions/parse-captions';
import type { CaptionFormat, CaptionKind, Cue } from '@/types';

export type TranscriptErrorCode =
  /** The video has no English track at all — the paste path (RF-02b) is the way out. */
  | 'no-english-captions'
  /** Private, removed, age-gated: nothing to fetch, ever. */
  | 'video-unavailable'
  /** 429 or the bot check. Same request works again later. */
  | 'rate-limited'
  /** `yt-dlp` is not installed or not on the PATH. A setup problem, not a video problem. */
  | 'tool-missing'
  /** Anything else the provider did: a crash, a timeout, a format change. */
  | 'provider-failed';

export class TranscriptError extends Error {
  readonly code: TranscriptErrorCode;

  constructor(code: TranscriptErrorCode, message: string) {
    super(message);
    this.name = 'TranscriptError';
    this.code = code;
  }
}

export type Transcript = {
  videoId: string;
  /** Manual captions are punctuated, so strict mode makes sense on them (RF-02). */
  kind: CaptionKind;
  lang: string;
  format: CaptionFormat;
  cues: Cue[];
  /** ISO 8601 — how the cache knows how old this is. */
  fetchedAt: string;
};

// ------------------------------------------------------------- the process

export class CommandFailure extends Error {
  readonly stderr: string;
  /** `ENOENT` when the binary is missing, `ETIMEDOUT` when it hung. */
  readonly spawnCode?: string;
  readonly exitCode?: number;

  constructor(options: { stderr: string; spawnCode?: string; exitCode?: number }) {
    super(options.stderr || options.spawnCode || 'yt-dlp failed');
    this.name = 'CommandFailure';
    this.stderr = options.stderr;
    this.spawnCode = options.spawnCode;
    this.exitCode = options.exitCode;
  }
}

export type CommandRunner = (
  binary: string,
  args: string[],
  options: { timeoutMs: number },
) => Promise<{ stdout: string; stderr: string }>;

const runCommand: CommandRunner = (binary, args, { timeoutMs }) =>
  new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error === null) {
        resolve({ stdout, stderr });
        return;
      }

      const failure = error as NodeJS.ErrnoException & { code?: string | number; killed?: boolean };
      reject(
        new CommandFailure({
          stderr: stderr || failure.message,
          spawnCode:
            typeof failure.code === 'string'
              ? failure.code
              : failure.killed
                ? 'ETIMEDOUT'
                : undefined,
          exitCode: typeof failure.code === 'number' ? failure.code : undefined,
        }),
      );
    });
  });

// ------------------------------------------------------------ reading them

/**
 * Only the ASR track carries word-level timings, so their presence is what
 * tells an auto-generated track from a hand-written one. Both arrive with the
 * same `Kind: captions` header and the same file name, which is why the file
 * cannot answer this on its own.
 */
const INLINE_TIMING = /<\d{1,3}:\d{2}:\d{2}[.,]\d{1,3}>/;

export function detectCaptionKind(raw: string): CaptionKind {
  return INLINE_TIMING.test(raw) ? 'asr' : 'manual';
}

/** `abc123.en.vtt` → `en`; anything unexpected → `en`, which is all we ask for. */
export function languageFromFilename(name: string): string {
  const match = /\.([A-Za-z-]+)\.[a-z0-9]+$/.exec(name);
  return match ? match[1] : 'en';
}

const NO_CAPTIONS = /no subtitle|there are no subtitles|requested (subtitle )?languages?/i;
const RATE_LIMITED =
  /not a bot|HTTP Error 429|Too Many Requests|rate.?limit|confirm you.{0,3}re not a bot/i;
const UNAVAILABLE = new RegExp(
  [
    'video (is )?unavailable', // "This video is unavailable" — a wrong or dead ID
    'private video',
    'has been removed',
    'members-only|join this channel',
    'confirm your age|age.?restricted|inappropriate for some users',
    'not available in your country|blocked it in your country',
    'account associated with this video has been terminated',
  ].join('|'),
  'i',
);
const TOOL_MISSING = /no such file or directory|is not recognized|command not found|No module named/i;

export function classifyFailure(failure: CommandFailure): TranscriptErrorCode {
  if (failure.spawnCode === 'ENOENT' || TOOL_MISSING.test(failure.stderr)) return 'tool-missing';
  if (RATE_LIMITED.test(failure.stderr)) return 'rate-limited';
  if (UNAVAILABLE.test(failure.stderr)) return 'video-unavailable';
  if (NO_CAPTIONS.test(failure.stderr)) return 'no-english-captions';
  return 'provider-failed';
}

/** User-facing, in Portuguese: these strings reach the screen as they are. */
const MESSAGES: Record<TranscriptErrorCode, string> = {
  'no-english-captions':
    'este vídeo não tem legenda em inglês — cole a legenda à mão para praticar mesmo assim',
  'video-unavailable': 'o YouTube não deixa acessar este vídeo (privado, removido ou restrito)',
  'rate-limited':
    'o YouTube está bloqueando as buscas deste computador por excesso de requisições — espere alguns minutos ou cole a legenda à mão',
  'tool-missing':
    'o yt-dlp não foi encontrado — instale-o (veja o README) ou cole a legenda à mão',
  'provider-failed':
    'a busca automática falhou — tente de novo, rode `yt-dlp -U`, ou cole a legenda à mão',
};

export function transcriptError(code: TranscriptErrorCode): TranscriptError {
  return new TranscriptError(code, MESSAGES[code]);
}

// ----------------------------------------------------------------- fetching

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Without a JavaScript runtime yt-dlp falls back to a deprecated extraction
 * path and loses metadata. Older builds do not know the flag, so a rejection
 * of the option itself is retried without it rather than reported.
 */
const JS_RUNTIME_ARGS = ['--js-runtimes', 'node'];
const UNKNOWN_OPTION = /no such option|unrecognized arguments|Usage: yt-dlp/i;

function downloadArgs(videoId: string, outputDir: string): string[] {
  return [
    '--skip-download',
    '--write-sub',
    '--write-auto-sub',
    // One track. A glob asks for three and the third takes a 429.
    '--sub-lang',
    'en',
    '--sub-format',
    'vtt',
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '-o',
    join(outputDir, '%(id)s.%(ext)s'),
    `https://www.youtube.com/watch?v=${videoId}`,
  ];
}

export type FetchOptions = {
  /** Injected in tests; defaults to `execFile`. */
  run?: CommandRunner;
  /** Defaults to `$YT_DLP_PATH`, then plain `yt-dlp` from the PATH. */
  binary?: string;
  timeoutMs?: number;
  now?: () => Date;
};

/**
 * Downloads one English caption track and parses it. Throws `TranscriptError`
 * — never a raw yt-dlp message, which is not something to put on screen.
 */
export async function fetchTranscript(
  videoId: string,
  options: FetchOptions = {},
): Promise<Transcript> {
  const run = options.run ?? runCommand;
  const binary = options.binary ?? process.env.YT_DLP_PATH ?? 'yt-dlp';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());

  const directory = await mkdtemp(join(tmpdir(), 'pwv-captions-'));
  try {
    const args = downloadArgs(videoId, directory);
    try {
      await run(binary, [...JS_RUNTIME_ARGS, ...args], { timeoutMs });
    } catch (error) {
      if (!(error instanceof CommandFailure)) throw error;
      // An old yt-dlp rejects the flag; anything else is a real failure.
      if (!UNKNOWN_OPTION.test(error.stderr)) throw transcriptError(classifyFailure(error));
      await run(binary, args, { timeoutMs }).catch((retryError: unknown) => {
        if (retryError instanceof CommandFailure) throw transcriptError(classifyFailure(retryError));
        throw retryError;
      });
    }

    const files = (await readdir(directory)).filter((file) => file.endsWith('.vtt'));
    // yt-dlp exits 0 and writes nothing when the video has no English track.
    if (files.length === 0) throw transcriptError('no-english-captions');

    const raw = await readFile(join(directory, files[0]), 'utf8');
    const { cues, format } = parseCaptions(raw);

    return {
      videoId,
      kind: detectCaptionKind(raw),
      lang: languageFromFilename(files[0]),
      format,
      cues,
      fetchedAt: now().toISOString(),
    };
  } catch (error) {
    if (error instanceof TranscriptError) throw error;
    // A caption file yt-dlp wrote but we cannot read is still a provider problem.
    throw transcriptError('provider-failed');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// -------------------------------------------------------------------- cache

/**
 * A fetch costs ~2,3s and counts against a rate limit, so nothing is fetched
 * twice: once in memory for the process, once on disk so a dev-server restart
 * does not go back to YouTube. Captions do not change after upload; the TTL is
 * there to eventually pick up a track that was added later.
 */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_DIR = join(process.cwd(), '.cache', 'transcripts');

const memory = new Map<string, Transcript>();

export type CachedFetchOptions = FetchOptions & {
  cacheDir?: string | null;
  /** Skips the cache and replaces what is in it — the "reload captions" button. */
  force?: boolean;
};

function isFresh(transcript: Transcript, now: Date): boolean {
  const age = now.getTime() - new Date(transcript.fetchedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS;
}

async function readFromDisk(directory: string, videoId: string): Promise<Transcript | null> {
  try {
    const file = join(directory, `${videoId}.json`);
    await stat(file);
    return JSON.parse(await readFile(file, 'utf8')) as Transcript;
  } catch {
    return null; // A missing or corrupt cache entry is not an error.
  }
}

async function writeToDisk(
  directory: string,
  transcript: Transcript,
): Promise<void> {
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, `${transcript.videoId}.json`),
      JSON.stringify(transcript),
      'utf8',
    );
  } catch {
    // A read-only disk costs performance, never correctness.
  }
}

export type CachedTranscript = Transcript & { cached: boolean };

export async function getTranscript(
  videoId: string,
  options: CachedFetchOptions = {},
): Promise<CachedTranscript> {
  const now = options.now ?? (() => new Date());
  const directory =
    options.cacheDir === undefined
      ? process.env.TRANSCRIPT_CACHE === 'off'
        ? null
        : DEFAULT_CACHE_DIR
      : options.cacheDir;

  if (!options.force) {
    const remembered = memory.get(videoId);
    if (remembered && isFresh(remembered, now())) return { ...remembered, cached: true };

    if (directory !== null) {
      const stored = await readFromDisk(directory, videoId);
      if (stored && isFresh(stored, now())) {
        memory.set(videoId, stored);
        return { ...stored, cached: true };
      }
    }
  }

  const transcript = await fetchTranscript(videoId, options);
  memory.set(videoId, transcript);
  if (directory !== null) await writeToDisk(directory, transcript);

  return { ...transcript, cached: false };
}

/** Tests and the "reload captions" path need the process cache to be forgettable. */
export function clearTranscriptMemory(): void {
  memory.clear();
}
