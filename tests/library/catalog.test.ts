/**
 * The library is plain folders; these run against fixtures for reading and a
 * temp dir for writing, never the real content/library.
 */

import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteLibraryVideo,
  isVideoId,
  listLibrary,
  loadLibraryVideo,
  saveLibraryVideo,
} from '@/lib/library/catalog';

const FIXTURES = join(__dirname, '..', 'fixtures', 'library');

describe('listLibrary', () => {
  it('lists valid entries, newest first', async () => {
    expect(await listLibrary(FIXTURES)).toEqual([
      { videoId: 'bbbbbbbbbbb', title: 'Newer video', kind: 'asr', addedAt: '2026-05-01' },
      { videoId: 'aaaaaaaaaaa', title: 'Older video', kind: 'manual', addedAt: '2026-01-01' },
    ]);
  });

  it('skips bad meta and folders that are not a videoId', async () => {
    const ids = (await listLibrary(FIXTURES)).map((entry) => entry.videoId);
    expect(ids).not.toContain('ccccccccccc');
    expect(ids).not.toContain('not-a-video-id');
  });

  it('is empty when the folder does not exist', async () => {
    expect(await listLibrary(join(FIXTURES, 'nope'))).toEqual([]);
  });
});

describe('loadLibraryVideo', () => {
  it('loads SRT captions', async () => {
    const video = await loadLibraryVideo('aaaaaaaaaaa', FIXTURES);
    expect(video?.entry.title).toBe('Older video');
    expect(video?.cues).toHaveLength(2);
  });

  it('loads VTT captions', async () => {
    const video = await loadLibraryVideo('bbbbbbbbbbb', FIXTURES);
    expect(video?.cues[0].text).toContain('vtt file');
  });

  it('is null for unknown, broken or invalid ids', async () => {
    expect(await loadLibraryVideo('zzzzzzzzzzz', FIXTURES)).toBeNull();
    expect(await loadLibraryVideo('ccccccccccc', FIXTURES)).toBeNull();
    expect(await loadLibraryVideo('../library', FIXTURES)).toBeNull();
  });
});

describe('saving and deleting', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'eartype-library-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const cues = [
    { id: '1', startMs: 1000, endMs: 3000, text: 'Hello there, how are you?' },
    { id: '2', startMs: 3500, endMs: 6000, text: 'Fine, thanks.' },
  ];

  it('saves an entry that lists and loads back', async () => {
    const entry = await saveLibraryVideo(
      { videoId: 'dQw4w9WgXcQ', title: '  A title  ', kind: 'manual', cues },
      dir,
      () => new Date('2026-09-29T12:00:00Z'),
    );
    expect(entry).toEqual({
      videoId: 'dQw4w9WgXcQ',
      title: 'A title',
      kind: 'manual',
      addedAt: '2026-09-29',
    });

    expect(await listLibrary(dir)).toEqual([entry]);
    const video = await loadLibraryVideo('dQw4w9WgXcQ', dir);
    expect(video?.cues.map((cue) => cue.text)).toEqual(cues.map((cue) => cue.text));
    expect(JSON.parse(await readFile(join(dir, 'dQw4w9WgXcQ', 'meta.json'), 'utf8'))).toEqual({
      title: 'A title',
      kind: 'manual',
      addedAt: '2026-09-29',
    });
  });

  it('replaces an existing entry, including a .vtt caption file', async () => {
    await cp(join(FIXTURES, 'bbbbbbbbbbb'), join(dir, 'bbbbbbbbbbb'), { recursive: true });
    await saveLibraryVideo({ videoId: 'bbbbbbbbbbb', title: 'Replaced', kind: 'asr', cues }, dir);
    expect((await readdir(join(dir, 'bbbbbbbbbbb'))).sort()).toEqual(['captions.srt', 'meta.json']);
    expect((await loadLibraryVideo('bbbbbbbbbbb', dir))?.entry.title).toBe('Replaced');
  });

  it('falls back to the videoId for an empty title', async () => {
    const entry = await saveLibraryVideo(
      { videoId: 'dQw4w9WgXcQ', title: ' ', kind: 'asr', cues },
      dir,
    );
    expect(entry.title).toBe('dQw4w9WgXcQ');
  });

  it('deletes only that folder', async () => {
    await saveLibraryVideo({ videoId: 'aaaaaaaaaaa', title: 'a', kind: 'manual', cues }, dir);
    await saveLibraryVideo({ videoId: 'bbbbbbbbbbb', title: 'b', kind: 'manual', cues }, dir);
    await deleteLibraryVideo('aaaaaaaaaaa', dir);
    expect((await listLibrary(dir)).map((entry) => entry.videoId)).toEqual(['bbbbbbbbbbb']);
  });

  it.each(['../x', 'abc', '', '..\\..\\etc12', 'aaaaaaaaaa/'])('rejects the id %j', async (videoId) => {
    expect(isVideoId(videoId)).toBe(false);
    await expect(
      saveLibraryVideo({ videoId, title: 't', kind: 'manual', cues }, dir),
    ).rejects.toThrow();
    await expect(deleteLibraryVideo(videoId, dir)).rejects.toThrow();
  });

  it('refuses to save no captions', async () => {
    await expect(
      saveLibraryVideo({ videoId: 'dQw4w9WgXcQ', title: 't', kind: 'manual', cues: [] }, dir),
    ).rejects.toThrow();
  });
});
