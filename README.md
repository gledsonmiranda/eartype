# Eartype

A listening trainer built on **dictation**. You paste a YouTube URL; the app
cuts the captions into 3-to-8-second segments, plays one, **pauses exactly at
its end**, and compares what you typed against the real caption, word by word.

The idea is simple: understanding a video with the subtitles on is easy, and it
lies to you. Typing what you heard does not forgive — either the word reached
your ear or it did not.

Personal tool, runs on `localhost`. Language and other engineering conventions
are in `docs/RULES.md`.

## How it works

```
URL  →  captions (yt-dlp, or pasted by hand)  →  cues  →  practisable segments
                                                              ↓
   word-by-word diff  ←  what you typed  ←  plays and pauses at the end
```

Five decisions shape everything else:

- **The pause is polled.** The YouTube IFrame API never says "I reached time X",
  so the app reads `getCurrentTime()` every 100ms and pauses on crossing the
  mark. Measured: it stops **~64ms late**, with ±8ms of spread. Pausing early
  would clip the last syllable, so there is no compensation — 64ms late lands in
  the silence between sentences.
- **Correction is lenient by default.** Case and punctuation do not count;
  `"I'm gonna go"` and `"I am going to go"` are the same answer. Strict mode is
  a checkbox, offered only when the captions are manual and have punctuation
  worth enforcing.
- **Raw captions are unusable as they come.** A 0.8s cue, a cue that lingers 20s
  after the speech ended, `[Music]`, `>>`, and the *rolling text* of
  auto-generated captions (YouTube repeats the previous line in the next cue).
  The segmenter exists for that.
- **Pasting captions by hand is a first-class path**, not an error screen. It is
  the only route that does not depend on an undocumented endpoint staying up.
- **The transcript sits alongside, blurred.** Each segment leaves the blur when
  you answer it, so the filled-in panel is your progress — and one button lifts
  the blur entirely when you would rather read along.

## Running

```bash
npm install
npm run dev      # http://localhost:3000
npm run check    # typecheck + lint + tests — what runs before a commit
npm test         # tests only
npm run corpus   # downloads the real captions one of the tests uses (optional)
```

On the practice screen your hands never have to leave the keyboard:

| shortcut | action |
| --- | --- |
| `Enter` | check; after a miss, accept and move on |
| `Shift+Enter` | line break |
| `Ctrl+Enter` | replay the segment |
| `Ctrl+→` | reveal the answer and move on |
| `Alt+←` / `Alt+→` | previous / next segment |

Get it exactly right and **"✓ acertou"** appears; the segment advances on its
own after 1.2s.

## External prerequisite: `yt-dlp`

Automatic caption lookup depends on the **`yt-dlp`** binary. Plain Node calls are
blocked by YouTube (200 with an empty body — see `docs/SPIKE-RESULTS.md`), and
`yt-dlp` as a child process is currently the only automatic route that works.

```bash
pipx install yt-dlp          # recommended
pip install --user yt-dlp    # alternative
yt-dlp -U                    # every so often, whenever YouTube changes
```

On Windows the executable usually lands outside `PATH`. Point at it from a
`.env.local` (Next loads it on its own, and the file stays out of git):

```
YT_DLP_PATH=C:\Users\you\AppData\Roaming\Python\Python312\Scripts\yt-dlp.exe
```

`yt-dlp` also needs a **JavaScript runtime**; the app passes `--js-runtimes
node`, and you already have Node. Older versions that do not know the option
work all the same — the app retries the call without it.

**Without `yt-dlp` the app stays usable:** you can paste SRT/VTT captions by
hand, on the same entry screen.

### Cache

Each lookup costs ~3s and counts against YouTube's rate limit, so captions are
kept in memory and in `.cache/transcripts/` (outside git) for 30 days.
`TRANSCRIPT_CACHE=off` disables the on-disk cache; `?force=1` on the route
repeats the lookup.

> If YouTube answers **`Sign in to confirm you're not a bot`**, the IP took a
> temporary block for too many requests. There is nothing to fix: wait a few
> minutes or paste the captions by hand. The app treats this as an error of its
> own (`rate-limited`), distinct from "video has no captions".

## Structure

```
app/
  api/transcript/      route that shells out to yt-dlp
  components/          screens and components (client)
lib/
  captions/            SRT/VTT parser and segmenter
  correction/          normalization and word-by-word diff
  player/              polled pause (pure) + IFrame API (DOM)
  practice/            practice session state
  youtube/             URL parsing and caption lookup
types/                 shared contracts (Cue, Segment, DiffResult)
tests/                 Vitest, mirroring the lib/ tree
scripts/               development utilities
docs/                  SPEC (what), PLAN (in what order), SPIKE-RESULTS, DESIGN
```

The architecture boundary holding the design up lives in `docs/RULES.md`. That is
why the tests run in ~2s without touching the network.

## Tests

335 tests, all offline. Whatever is pure logic — parser, segmenter,
normalization, diff, session — is tested directly; the player runs under *fake
timers* against a fake player; caption lookup injects the command executor, so
neither the binary nor a video is needed.

One test is different: `tests/captions/segmenter-corpus.test.ts` runs
**invariants over five real caption files** (manual, auto-generated, a 1h26
video, a small channel, a video suspected of being restricted) — no segment
under 1.5s, none over 8s, no boundary repeating 3 words, no leftover markup.

Those captions are third-party content and are **not in git**; only the
`videoId`s are versioned. `npm run corpus` downloads them. Without them the
suite declares itself skipped rather than failing a clean clone.

They earned their place the hard way: written from the spec, the small fixtures
stayed green while real captions broke four segmenter invariants at once.

## Status

**Phase 1 (MVP) complete**, verified in the browser: paste the URL and do ten
segments in a row without touching the mouse. No persistence — close the tab and
the session is gone.

What comes next lives in §11 of `docs/SPEC.md`: resuming where you left off, a
session summary with the most troublesome words, speed control, hints and a
review mode.

Known limitations today:

- it only asks for the exact `en` track — a video whose only English is `en-US`
  falls through to the paste-by-hand path (asking for more than one track earns
  a 429);
- manual vs. auto-generated is detected by the presence of per-word timings,
  which is a heuristic;
- when auto-generated captions rewrite their own transcript, the repetition
  escapes the dedupe in ~0.5% of segments;
- the React wiring has no automated test — it was verified by hand.

## Documentation

| file | what it is |
| --- | --- |
| `docs/RULES.md` | code rules: naming, architecture boundary, errors, language |
| `docs/SPEC.md` | what and why: requirements, normalization rules, risks |
| `docs/PLAN.md` | in what order, with a "done when" per task |
| `docs/SPIKE-RESULTS.md` | what was measured before writing the app — and what broke |
| `docs/DESIGN.md` | interface scales and patterns |
