/**
 * The yt-dlp side of RF-02, without yt-dlp: the command runner is injected,
 * so every branch that matters — a track downloaded, a video with no English
 * captions, a rate limit, a missing binary, the cache — runs offline.
 */

import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  classifyFailure,
  clearTranscriptMemory,
  CommandFailure,
  detectCaptionKind,
  fetchTranscript,
  getTranscript,
  languageFromFilename,
  TranscriptError,
  type CommandRunner,
} from '@/lib/youtube/transcript';

const MANUAL_VTT = [
  'WEBVTT',
  'Kind: captions',
  'Language: en',
  '',
  '00:00:16.720 --> 00:00:18.146',
  'So if this were back in',
  '',
  '00:00:18.348 --> 00:00:19.178',
  '2011,',
  '',
].join('\n');

const ASR_VTT = [
  'WEBVTT',
  'Kind: captions',
  'Language: en',
  '',
  '00:00:00.080 --> 00:00:02.790 align:start position:0%',
  ' ',
  'Once<00:00:00.480><c> you</c><00:00:00.719><c> start</c>',
  '',
].join('\n');

/** A runner that writes the caption file yt-dlp would have written. */
const runnerWriting = (name: string, content: string): CommandRunner => {
  return async (_binary, args) => {
    const output = args[args.indexOf('-o') + 1];
    const directory = output.slice(0, output.lastIndexOf('\\') + 1 || output.lastIndexOf('/') + 1);
    await writeFile(join(directory, name), content, 'utf8');
    return { stdout: '', stderr: '' };
  };
};

/** A runner that succeeds and writes nothing — a video with no English track. */
const runnerWritingNothing: CommandRunner = async () => ({ stdout: '', stderr: '' });

const runnerFailing = (failure: CommandFailure): CommandRunner => {
  return async () => {
    throw failure;
  };
};

describe('detectCaptionKind', () => {
  it('reads word-level timings as the ASR signature', () => {
    expect(detectCaptionKind(ASR_VTT)).toBe('asr');
  });

  it('calls a track without them manual', () => {
    expect(detectCaptionKind(MANUAL_VTT)).toBe('manual');
  });
});

describe('languageFromFilename', () => {
  it.each([
    ['ohqxP8EEumo.en.vtt', 'en'],
    ['ohqxP8EEumo.en-US.vtt', 'en-US'],
    ['weird-name.vtt', 'en'],
  ])('%s → %s', (name, expected) => {
    expect(languageFromFilename(name)).toBe(expected);
  });
});

describe('classifyFailure', () => {
  it.each([
    ['ERROR: [youtube] abc: Sign in to confirm you’re not a bot.', 'rate-limited'],
    ['ERROR: unable to download: HTTP Error 429: Too Many Requests', 'rate-limited'],
    ['ERROR: [youtube] abc: Video unavailable', 'video-unavailable'],
    // What a wrong ID actually produces, checked against the binary.
    ['ERROR: [youtube] aaaaaaaaaaa: This video is unavailable', 'video-unavailable'],
    ['ERROR: [youtube] abc: Sign in to confirm your age', 'video-unavailable'],
    ['ERROR: [youtube] abc: Private video. Sign in if you have been granted access', 'video-unavailable'],
    ['ERROR: [youtube] abc: Join this channel to get access to members-only content', 'video-unavailable'],
    ["WARNING: [youtube] abc: There are no subtitles for the requested languages", 'no-english-captions'],
    ['ERROR: something nobody has seen before', 'provider-failed'],
  ])('%s → %s', (stderr, expected) => {
    expect(classifyFailure(new CommandFailure({ stderr }))).toBe(expected);
  });

  it('a binary that is not there is a setup problem, not a video problem', () => {
    expect(classifyFailure(new CommandFailure({ stderr: '', spawnCode: 'ENOENT' }))).toBe(
      'tool-missing',
    );
  });
});

describe('fetchTranscript', () => {
  it('parses the track yt-dlp wrote and says which kind it is', async () => {
    const transcript = await fetchTranscript('ohqxP8EEumo', {
      run: runnerWriting('ohqxP8EEumo.en.vtt', MANUAL_VTT),
      now: () => new Date('2026-09-20T10:00:00.000Z'),
    });

    expect(transcript).toMatchObject({
      videoId: 'ohqxP8EEumo',
      kind: 'manual',
      lang: 'en',
      format: 'vtt',
      fetchedAt: '2026-09-20T10:00:00.000Z',
    });
    expect(transcript.cues.map((cue) => cue.text)).toEqual(['So if this were back in', '2011,']);
  });

  it('asks for exactly one track — a glob takes a 429 (S-1b)', async () => {
    let captured: string[] = [];
    await fetchTranscript('abc', {
      run: async (_binary, args) => {
        captured = args;
        return runnerWriting('abc.en.vtt', ASR_VTT)(_binary, args, { timeoutMs: 0 });
      },
    });

    expect(captured[captured.indexOf('--sub-lang') + 1]).toBe('en');
    expect(captured).toContain('--skip-download');
  });

  it('no file written means no English captions', async () => {
    await expect(fetchTranscript('abc', { run: runnerWritingNothing })).rejects.toMatchObject({
      code: 'no-english-captions',
    });
  });

  it('retries without --js-runtimes when yt-dlp is too old to know it', async () => {
    const calls: string[][] = [];
    const transcript = await fetchTranscript('abc', {
      run: async (binary, args, options) => {
        calls.push(args);
        if (args.includes('--js-runtimes')) {
          throw new CommandFailure({ stderr: 'Usage: yt-dlp [OPTIONS] URL\nno such option' });
        }
        return runnerWriting('abc.en.vtt', ASR_VTT)(binary, args, options);
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]).not.toContain('--js-runtimes');
    expect(transcript.kind).toBe('asr');
  });

  it('translates a failure instead of leaking stderr to the screen', async () => {
    const failing = runnerFailing(
      new CommandFailure({ stderr: 'ERROR: [youtube] abc: Sign in to confirm you’re not a bot.' }),
    );

    const error = await fetchTranscript('abc', { run: failing }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TranscriptError);
    expect((error as TranscriptError).code).toBe('rate-limited');
    expect((error as TranscriptError).message).not.toMatch(/ERROR|yt-dlp|stderr/);
  });

  it('leaves no temporary directory behind, success or failure', async () => {
    const before = (await readdir(tmpdir())).filter((name) => name.startsWith('pwv-captions-'));

    await fetchTranscript('abc', { run: runnerWriting('abc.en.vtt', ASR_VTT) });
    await fetchTranscript('abc', { run: runnerWritingNothing }).catch(() => undefined);

    const after = (await readdir(tmpdir())).filter((name) => name.startsWith('pwv-captions-'));
    expect(after).toEqual(before);
  });
});

describe('getTranscript — cache', () => {
  let cacheDir: string;

  beforeEach(async () => {
    clearTranscriptMemory();
    cacheDir = await mkdtemp(join(tmpdir(), 'pwv-cache-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  const countingRunner = (): { run: CommandRunner; calls: () => number } => {
    let calls = 0;
    const write = runnerWriting('abc.en.vtt', ASR_VTT);
    return {
      run: async (binary, args, options) => {
        calls++;
        return write(binary, args, options);
      },
      calls: () => calls,
    };
  };

  it('fetches once and answers from memory after that', async () => {
    const { run, calls } = countingRunner();

    const first = await getTranscript('abc', { run, cacheDir });
    const second = await getTranscript('abc', { run, cacheDir });

    expect(calls()).toBe(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.cues).toEqual(first.cues);
  });

  it('survives a restart by reading the disk', async () => {
    const { run, calls } = countingRunner();

    await getTranscript('abc', { run, cacheDir });
    clearTranscriptMemory(); // As if the dev server had restarted.
    const again = await getTranscript('abc', { run, cacheDir });

    expect(calls()).toBe(1);
    expect(again.cached).toBe(true);
  });

  it('refetches when asked to force it', async () => {
    const { run, calls } = countingRunner();

    await getTranscript('abc', { run, cacheDir });
    const forced = await getTranscript('abc', { run, cacheDir, force: true });

    expect(calls()).toBe(2);
    expect(forced.cached).toBe(false);
  });

  it('ignores an entry older than the TTL', async () => {
    const { run, calls } = countingRunner();
    const old = new Date('2020-01-01T00:00:00.000Z');

    await getTranscript('abc', { run, cacheDir, now: () => old });
    clearTranscriptMemory();
    await getTranscript('abc', { run, cacheDir });

    expect(calls()).toBe(2);
  });

  it('writes nothing to disk when the cache is off', async () => {
    const { run } = countingRunner();

    await getTranscript('abc', { run, cacheDir: null });

    await expect(readdir(cacheDir)).resolves.toEqual([]);
  });
});
