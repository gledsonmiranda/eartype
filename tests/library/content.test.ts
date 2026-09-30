/**
 * Guard for the real library: every video added to content/library must have
 * valid meta and captions that segment into something practiceable.
 */

import { readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { segment } from '@/lib/captions/segmenter';
import { DEFAULT_LIBRARY_DIR, listLibrary, loadLibraryVideo } from '@/lib/library/catalog';

const folders = (await readdir(DEFAULT_LIBRARY_DIR, { withFileTypes: true }))
  .filter((item) => item.isDirectory())
  .map((item) => item.name);

describe('content/library', () => {
  it('lists every folder (none skipped for bad meta or a bad name)', async () => {
    const ids = (await listLibrary()).map((entry) => entry.videoId);
    expect(ids.sort()).toEqual([...folders].sort());
  });

  it.each(folders)('%s loads and segments', async (videoId) => {
    const video = await loadLibraryVideo(videoId);
    expect(video).not.toBeNull();
    expect(segment(video!.cues).length).toBeGreaterThan(0);
  });
});
