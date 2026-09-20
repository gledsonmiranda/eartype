import { describe, expect, it } from 'vitest';
import { parseTimeParam, parseYouTubeUrl } from '@/lib/youtube/parse-url';

const ID = 'jNQXAC9IVRw';

describe('parseYouTubeUrl — URL shapes', () => {
  const accepted: [string, string][] = [
    ['classic watch', `https://www.youtube.com/watch?v=${ID}`],
    ['no www', `https://youtube.com/watch?v=${ID}`],
    ['http', `http://www.youtube.com/watch?v=${ID}`],
    ['no scheme', `youtube.com/watch?v=${ID}`],
    ['mobile', `https://m.youtube.com/watch?v=${ID}`],
    ['music', `https://music.youtube.com/watch?v=${ID}`],
    ['nocookie embed', `https://www.youtube-nocookie.com/embed/${ID}`],
    ['youtu.be', `https://youtu.be/${ID}`],
    ['embed', `https://www.youtube.com/embed/${ID}`],
    ['shorts', `https://www.youtube.com/shorts/${ID}`],
    ['live', `https://www.youtube.com/live/${ID}`],
    ['legacy /v/', `https://www.youtube.com/v/${ID}`],
    ['surrounded by spaces', `   https://youtu.be/${ID}   `],
    ['bare ID', ID],
  ];

  it.each(accepted)('extracts the videoId: %s', (_name, input) => {
    expect(parseYouTubeUrl(input)?.videoId).toBe(ID);
  });

  it('ignores playlist and index', () => {
    const parsed = parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&list=PLabc123&index=4`);
    expect(parsed).toEqual({ videoId: ID });
  });

  it('prefers v= even on a playlist URL', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?list=PLabc&v=${ID}`)?.videoId).toBe(ID);
  });
});

describe('parseYouTubeUrl — start time', () => {
  it('reads t in seconds', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90`)).toEqual({ videoId: ID, startSec: 90 });
  });

  it('reads t with a trailing s', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90s`)?.startSec).toBe(90);
  });

  it('reads t as 1m30s', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)?.startSec).toBe(90);
  });

  it('reads t with hours', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`)?.startSec).toBe(3723);
  });

  it('reads start= from the embed form', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/embed/${ID}?start=45`)?.startSec).toBe(45);
  });

  it('omits startSec when t is garbage', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=abc`)).toEqual({ videoId: ID });
  });

  it('t=0 is a valid start, not a missing one', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=0`)?.startSec).toBe(0);
  });
});

describe('parseYouTubeUrl — invalid input', () => {
  const invalid: [string, string][] = [
    ['empty string', ''],
    ['only spaces', '   '],
    ['loose text', 'not a url at all'],
    ['another domain', 'https://vimeo.com/123456789'],
    ['look-alike domain', `https://youtube.com.evil.com/watch?v=${ID}`],
    ['youtube without an id', 'https://www.youtube.com/'],
    ['channel', 'https://www.youtube.com/@somechannel'],
    ['playlist without a video', 'https://www.youtube.com/playlist?list=PLabc123'],
    ['id too short', 'https://youtu.be/abc123'],
    ['id too long', `https://youtu.be/${ID}XYZ`],
    ['id with an invalid character', 'https://www.youtube.com/watch?v=jNQXAC9IV!w'],
    ['embed without an id', 'https://www.youtube.com/embed/'],
  ];

  it.each(invalid)('returns null: %s', (_name, input) => {
    expect(parseYouTubeUrl(input)).toBeNull();
  });
});

describe('parseTimeParam', () => {
  it.each([
    ['90', 90],
    ['90s', 90],
    ['1m', 60],
    ['1m30s', 90],
    ['2h', 7200],
    ['1h2m3s', 3723],
    ['0', 0],
  ])('%s → %i', (input, expected) => {
    expect(parseTimeParam(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', 'm30s', '1x', null, undefined])('undefined for %s', (input) => {
    expect(parseTimeParam(input)).toBeUndefined();
  });
});
