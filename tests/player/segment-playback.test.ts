/**
 * RF-04 under fake timers: a fake player and a fake clock, so the pause rules
 * measured in S-2 are tested without a video, an iframe or real time.
 */

import { describe, expect, it, vi } from 'vitest';
import { playSegment, type PlayerPort } from '@/lib/player/segment-playback';
import { playerErrorCode } from '@/lib/player/youtube-iframe';

type FakePlayer = PlayerPort & {
  readonly calls: string[];
  /** Moves the fake playhead, in seconds. */
  at(seconds: number): void;
};

function fakePlayer(startAt = 0): FakePlayer {
  let current = startAt;
  const calls: string[] = [];

  return {
    calls,
    at(seconds) {
      current = seconds;
    },
    seekTo(seconds) {
      calls.push(`seek:${seconds}`);
      // The real player does not move instantly — that is the S-2 trap.
    },
    playVideo() {
      calls.push('play');
    },
    pauseVideo() {
      calls.push('pause');
    },
    getCurrentTime() {
      return current;
    },
  };
}

const segment = { startMs: 10_000, endMs: 14_000 };

describe('playSegment', () => {
  it('seeks and plays straight away', () => {
    vi.useFakeTimers();
    const player = fakePlayer();

    playSegment(player, segment, { onEnd: () => undefined });

    expect(player.calls).toEqual(['seek:10', 'play']);
    vi.useRealTimers();
  });

  it('does not read the clock before the seek has settled', () => {
    vi.useFakeTimers();
    const player = fakePlayer(300); // Old position: way past the end mark.
    const onEnd = vi.fn();

    playSegment(player, segment, { onEnd });
    vi.advanceTimersByTime(500);

    expect(onEnd).not.toHaveBeenCalled();
    expect(player.calls).not.toContain('pause');
    vi.useRealTimers();
  });

  it('pauses when playback crosses the end mark', () => {
    vi.useFakeTimers();
    const player = fakePlayer();
    const onEnd = vi.fn();

    playSegment(player, segment, { onEnd });
    player.at(10.5);
    vi.advanceTimersByTime(600); // Seek settles.
    expect(onEnd).not.toHaveBeenCalled();

    player.at(13.9);
    vi.advanceTimersByTime(100);
    expect(onEnd).not.toHaveBeenCalled();

    player.at(14.02);
    vi.advanceTimersByTime(100);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(player.calls).toContain('pause');
    vi.useRealTimers();
  });

  it('polls every 100ms — the rate S-2 settled on', () => {
    vi.useFakeTimers();
    const player = fakePlayer();
    const spy = vi.spyOn(player, 'getCurrentTime');

    playSegment(player, segment, { onEnd: () => undefined });
    player.at(10.1);
    vi.advanceTimersByTime(600);
    spy.mockClear();
    vi.advanceTimersByTime(1000);

    expect(spy).toHaveBeenCalledTimes(10);
    vi.useRealTimers();
  });

  it('ignores an ad playing on its own clock (R-11)', () => {
    vi.useFakeTimers();
    const player = fakePlayer();
    const onEnd = vi.fn();

    playSegment(player, segment, { onEnd });
    // An ad runs from 0: past the end mark in *its* timeline, not the video's.
    player.at(30);
    vi.advanceTimersByTime(5000);
    expect(onEnd).not.toHaveBeenCalled();

    // The ad finishes and the video finally starts where we asked.
    player.at(10.2);
    vi.advanceTimersByTime(100);
    expect(onEnd).not.toHaveBeenCalled();

    player.at(14.1);
    vi.advanceTimersByTime(100);
    expect(onEnd).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('ends a segment that is already over when the seek settles', () => {
    vi.useFakeTimers();
    const player = fakePlayer();
    const onEnd = vi.fn();

    playSegment(player, { startMs: 10_000, endMs: 10_400 }, { onEnd });
    player.at(10.6);
    vi.advanceTimersByTime(600);

    expect(onEnd).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('fires once, however long the polling runs', () => {
    vi.useFakeTimers();
    const player = fakePlayer();
    const onEnd = vi.fn();

    playSegment(player, segment, { onEnd });
    player.at(14.5);
    vi.advanceTimersByTime(600 + 1000);

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(player.calls.filter((call) => call === 'pause')).toHaveLength(1);
    vi.useRealTimers();
  });

  it('cancelling stops the polling without pausing or ending', () => {
    vi.useFakeTimers();
    const player = fakePlayer();
    const onEnd = vi.fn();

    const playback = playSegment(player, segment, { onEnd });
    vi.advanceTimersByTime(600);
    playback.cancel();
    player.at(20);
    vi.advanceTimersByTime(1000);

    expect(onEnd).not.toHaveBeenCalled();
    expect(player.calls).not.toContain('pause');
    vi.useRealTimers();
  });

  it('cancelling before the seek settles stops it too', () => {
    vi.useFakeTimers();
    const player = fakePlayer();
    const onEnd = vi.fn();

    const playback = playSegment(player, segment, { onEnd });
    playback.cancel();
    player.at(20);
    vi.advanceTimersByTime(2000);

    expect(onEnd).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('accepts a lead for a player that pauses late', () => {
    vi.useFakeTimers();
    const player = fakePlayer();
    const onEnd = vi.fn();

    playSegment(player, segment, { onEnd, leadMs: 200 });
    player.at(13.85);
    vi.advanceTimersByTime(600);

    expect(onEnd).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('playerErrorCode (R-03)', () => {
  it.each([
    [101, 'embed-blocked'],
    [150, 'embed-blocked'],
    [100, 'video-not-found'],
    [2, 'bad-parameter'],
    [5, 'playback'],
  ])('%i → %s', (code, expected) => {
    expect(playerErrorCode(code)).toBe(expected);
  });
});
