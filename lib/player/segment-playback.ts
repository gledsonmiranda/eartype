/**
 * RF-04 — plays exactly one segment and pauses at its end.
 *
 * The IFrame API has no "wake me at time X" event, so the only way to stop on
 * a word is to poll `getCurrentTime()` and call `pauseVideo()` when it crosses
 * the mark. Everything here comes from the S-2 spike, measured rather than
 * guessed:
 *
 * - **polling at 100ms** stops the video ~64ms late, with ±8ms of spread.
 *   50ms polling does not improve it, so it is not worth the wake-ups.
 * - **lead 0.** Compensating the 64ms made it pause *before* the last word;
 *   for dictation, late is cheap (it lands in the silence between sentences)
 *   and early cuts a syllable.
 * - **wait for the seek to settle** before counting. Polling straight after
 *   `seekTo` reads the *old* position, the end mark looks long past, and the
 *   segment never pauses.
 *
 * And from R-11: an ad plays on the same player, with its own clock, so the
 * end mark only counts once playback has actually reached the segment.
 *
 * No DOM and no YouTube here — a port and a clock, so the whole thing runs
 * under fake timers.
 */

export type PlayerPort = {
  seekTo(seconds: number): void;
  playVideo(): void;
  pauseVideo(): void;
  /** Seconds, fractional. */
  getCurrentTime(): number;
};

export type Timers = {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
  setInterval(handler: () => void, ms: number): number;
  clearInterval(handle: number): void;
};

const browserTimers: Timers = {
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms) as unknown as number,
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  setInterval: (handler, ms) => globalThis.setInterval(handler, ms) as unknown as number,
  clearInterval: (handle) => globalThis.clearInterval(handle),
};

export const PLAYBACK_DEFAULTS = {
  pollMs: 100,
  /** How long `seekTo` needs before `getCurrentTime()` tells the truth. */
  settleMs: 600,
  /** Measured at +64ms late; correcting it pauses too early. */
  leadMs: 0,
  /** Playback has "arrived" once it is within this much of the start mark. */
  arrivalToleranceMs: 250,
  /**
   * How far past the end mark a reading may be and still be *our* playback.
   * An ad runs on its own clock, and that clock crossing the end mark must
   * not end the segment (R-11).
   */
  arrivalWindowMs: 3000,
} as const;

export type PlaySegmentOptions = {
  onEnd: () => void;
  pollMs?: number;
  settleMs?: number;
  leadMs?: number;
  arrivalToleranceMs?: number;
  arrivalWindowMs?: number;
  timers?: Timers;
};

export type Playback = {
  /** Stops polling without pausing the video and without firing `onEnd`. */
  cancel(): void;
};

export function playSegment(
  player: PlayerPort,
  segment: { startMs: number; endMs: number },
  options: PlaySegmentOptions,
): Playback {
  const timers = options.timers ?? browserTimers;
  const pollMs = options.pollMs ?? PLAYBACK_DEFAULTS.pollMs;
  const settleMs = options.settleMs ?? PLAYBACK_DEFAULTS.settleMs;
  const leadMs = options.leadMs ?? PLAYBACK_DEFAULTS.leadMs;
  const arrivalToleranceMs = options.arrivalToleranceMs ?? PLAYBACK_DEFAULTS.arrivalToleranceMs;
  const arrivalWindowMs = options.arrivalWindowMs ?? PLAYBACK_DEFAULTS.arrivalWindowMs;

  let settleHandle: number | null = null;
  let pollHandle: number | null = null;
  let done = false;
  /** Guards against an ad's clock: nothing ends before playback got here. */
  let arrived = false;

  const stopTimers = () => {
    if (settleHandle !== null) timers.clearTimeout(settleHandle);
    if (pollHandle !== null) timers.clearInterval(pollHandle);
    settleHandle = null;
    pollHandle = null;
  };

  const finish = () => {
    if (done) return;
    done = true;
    stopTimers();
    player.pauseVideo();
    options.onEnd();
  };

  const tick = () => {
    if (done) return;
    const nowMs = player.getCurrentTime() * 1000;

    if (!arrived) {
      const tooEarly = nowMs < segment.startMs - arrivalToleranceMs;
      // Far past the end before we ever saw the segment: someone else's clock.
      const notOurs = nowMs > segment.endMs + arrivalWindowMs;
      if (tooEarly || notOurs) return;
      arrived = true;
    }

    if (nowMs >= segment.endMs - leadMs) finish();
  };

  player.seekTo(segment.startMs / 1000);
  player.playVideo();

  settleHandle = timers.setTimeout(() => {
    settleHandle = null;
    if (done) return;
    tick(); // A very short segment can already be over by now.
    if (!done) pollHandle = timers.setInterval(tick, pollMs);
  }, settleMs);

  return {
    cancel() {
      if (done) return;
      done = true;
      stopTimers();
    },
  };
}
