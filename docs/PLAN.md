# Implementation plan — Phase 1 (MVP)

> Complements `SPEC.md`. The spec says **what**; this document says **in what order**, **under which contracts** and **done when**.
> Scope: Phase 1 only (§11 of the spec) — the bare loop, no persistence.

---

## Step 0 — Validation spike (do this BEFORE anything else)

Throwaway code, outside the final structure (`/spike`, deleted afterwards). Two questions only the machine can answer:

### S-1 — Do the captions actually come?
A Node script that takes a `videoId` and prints the available tracks plus the first 10 cues.

Test against **5 real videos of yours** — the kind you would actually use:
- one with manual captions (professional channel);
- one with auto-generated captions only;
- a long video (1h+);
- one from a small channel;
- one you suspect is restricted.

**Decides:** if it fails on 3 of the 5, `youtubei.js` is not a trustworthy base → invert the Phase 1 priority (manual SRT becomes the main path, automatic lookup becomes a convenience). If it passes, follow the plan.

### S-2 — Is the pause precise enough?
A single HTML page with the YouTube player, a `setInterval(100ms)` reading `getCurrentTime()` and pausing at a fixed timestamp.

**Measure:** how far past the target it went, over 10 attempts. Test right after a `seekTo` too, which is the worst case.

**Decides:** typical error < 150ms → 100ms polling will do. Between 150–400ms → drop to 50ms and/or increase the *lead*. Consistently > 400ms → the loop needs another approach (e.g. segments with slack at the end and a pause anchored on silence), and that changes the segmenter.

> **Only after S-1 and S-2 is the rest of the plan trustworthy.** Everything below assumes both are green.

---

## Task order

Each task is a commit. Tasks 1–4 are **pure TypeScript with no UI** — everything can be tested with Vitest before a screen exists, and that is where the project's real complexity lives.

### T-01 — Setup
Next.js (App Router) + TS strict + Tailwind + Vitest. No UI yet.
**Done when:** `npm run dev` comes up and `npm test` runs a trivial test.

### T-02 — `parse-url`
```ts
parseYouTubeUrl(input: string): { videoId: string; startSec?: number } | null
```
**Done when:** tests cover `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, a bare ID, `&t=90`, `&t=1m30s`, a URL with a playlist, and garbage (returns `null`).

### T-03 — SRT/VTT parser  ·  *no network dependency — which is why it comes early*
```ts
parseCaptions(raw: string): { cues: Cue[]; format: 'srt' | 'vtt' }   // throws a readable error if invalid
```
**Done when:** the tests in §7.5 of the spec pass (CRLF, `,` vs `.` in the timestamp, inline tags, `NOTE`/`STYLE`, invalid input with a clear message).
**Why before the automatic lookup:** it gives real cues to feed T-04 and T-05 without depending on YouTube, and it already ships the spec's plan B.

### T-04 — `segmenter`
```ts
segment(cues: Cue[], opts?: { minMs?; maxMs?; maxWords? }): Segment[]
```
Rules in §RF-03. **Done when:** run over both fixtures (manual and ASR), no segment exceeds 15 words, none falls under 1.5s, the ASR rolling text does not show up duplicated, and `[Music]` is gone.

### T-04b — the segmenter against real captions
The criteria above were written against fixtures made from the spec, and so contained only the problems we had already imagined. The five real caption files from S-1c broke four of them (details in `SPIKE-RESULTS.md`): repeated rolling text of 1–2 words, a 21s segment coming from a cue that lingers on screen after the speech ended, `>>` surviving mid-cue, and segments under 1.5s.

The corpus becomes a fixture (`tests/fixtures/corpus/`) and the criteria become **invariants over the whole video**, not hand-picked cases.

**Done when:** across the five videos, no segment falls under 1.5s, none exceeds `maxMs + minMs`, no grouping exceeds `maxWords + 5`, no boundary between segments repeats 3 words or more, and no markup is left over (`[`, `]`, `♪`, `>>`).

**Two deliberate concessions:**
- **A cue is never split** (§RF-03), so an 18-word cue becomes an 18-word segment. The word cap only applies to segments that group more than one cue.
- **The limits stretch rather than leave a scrap behind.** Emitting 0.8s of audio is not practisable, so the segment extends to `maxWords + 5` instead of spitting out a fragment. In exchange, ~6% of the longest video's segments land between 16 and 20 words.

**Known limit:** when the ASR *rewrites* its own transcript while redrawing the line (`…is important to you.` / `You know this is important to your life…`), the repetition gets through. That is 8 cases in 1,557 segments on the 1h26 video; a 1–2 word repetition at the boundary can also be real speech (`blah, / blah, blah…`), which is why the cut-off sits at 3 words.

### T-05 — `normalize` + `diff`  ·  **the heart of the project**
```ts
canonicalize(text: string, mode: 'lenient' | 'strict'): Token[]   // sentence pre-pass, then tokens
compare(reference: string, typed: string, mode): DiffResult
```
Home of §5, §5.1 (contractions/reductions, multi-token alignment, variant sets) and §5.2 (numbers).
**Done when:** the test table passes, including the spec's two mandatory cases — `"I'm gonna go"` = `"I am going to go"` scores 100%, and `"the dog's bone"` ≠ `"the dog is bone"` is an error.
**Watch out:** this is the longest task. If it overruns, cut §5.2 (numbers) to Phase 2 — contractions are far more frequent in speech than numbers.

### T-06 — Automatic caption lookup via `yt-dlp`  ·  ✅ unblocked (S-1b)
`youtubei.js` no longer downloads captions (200 with an empty body on every client); `yt-dlp` does, including when called from inside Node. See `SPIKE-RESULTS.md`.

Route `GET /api/transcript?videoId=`, isolated in `lib/youtube/transcript.ts`, firing the binary through `child_process.execFile`:
```
yt-dlp --skip-download --write-sub --write-auto-sub --sub-lang en --sub-format vtt --no-warnings -o <tmp>/%(id)s.%(ext)s <url>
```
**Non-negotiable** constraints, all measured in the spike:
- `--sub-lang en` and never a glob — `en.*` earns a 429 on the third track and takes the whole call down with it.
- ~~`export const runtime = 'nodejs'` on the route~~ — **dropped**: in this version of Next, `nodejs` is already the default and the Edge runtime is deprecated; the docs themselves say to remove the export (`node_modules/next/dist/docs/.../runtime.md`). The route still needs Node, it just no longer has to declare it.
- A timeout on `execFile` (60s) and cleanup of the temp directory in `finally`.
- Caching is mandatory: ~2.3s per lookup.
- Errors follow the convention in `RULES.md`: typed error codes out, never yt-dlp's raw stderr.

- **`--js-runtimes node`** (discovered in S-1c): without a JS runtime, yt-dlp falls into a deprecated extraction path and loses metadata. An old version that does not know the option rejects the call, and then it is retried without the flag.

**Done when:** it returns cues for the 5 spike videos and gives a **typed, distinguishable** error for: no English captions / video unavailable / yt-dlp missing or failing. The UI needs to know which one happened in order to pick the message.

**External prerequisite documented in the README:** the app depends on `yt-dlp` being installed, and on the occasional `yt-dlp -U` whenever YouTube changes.

**How it turned out:** five error codes instead of three, because a temporary IP block (`rate-limited`) deserves a different message from "there are no captions" — it clears on its own, and the right action is to wait, not to paste captions. The others: `no-english-captions`, `video-unavailable`, `tool-missing`, `provider-failed`.

**Verified live** (not only in tests): the five videos come back with captions in 3.0–3.5s, the kind (manual/ASR) is right on all five, the second lookup comes off disk in ~1ms, a nonexistent ID gives `video-unavailable` and a misplaced binary gives `tool-missing`.

### T-07 — Player with automatic pause  ·  ✅ validated in S-2
A wrapper over the IFrame API: `seekTo` + `play` + polling + `pause` at the end of the segment, with `cc_load_policy: 0`.
Parameters measured in the spike: **100ms polling, lead 0** (real error +64ms, spread ±8ms). Requirement discovered in S-2: **wait for the `seekTo` to settle (~600ms) before starting to count** — without that, counting starts at the old time and the segment never pauses.
**Done when:** it plays segment 3, pauses at the end, and replaying 5 times in a row always stops in the same place (no accumulated drift). Player errors 100/101/150 map to a specific message.

**Verified in the browser:** the replay of segment 1 sought to **16.720s** and stopped at **20.951s** — the segment ends at 20.883s, i.e. **+68ms**, within the +64ms ±8ms that S-2 measured.

### T-08 — Practice screen
Puts it all together: player + input + diff + progress X of N. Shortcuts `Enter` (check) and `Ctrl+Enter` (replay). Neutral grey, no visual identity yet.
**Done when:** the Phase 1 done criterion — paste a URL and do **10 segments in a row without touching the mouse**.

**Verified in the browser:** ten segments chained with nothing but typing and Enter, ending at "trecho 11 de 279", without a single error message in the console. An exact hit advances on its own; a miss shows the diff and a second Enter accepts and moves on.

**Course correction:** the first version forced strict mode on manual captions, contradicting the decision in §2 of the spec (*lenient by default, strict is an option*). Now the default is lenient always, and strict is a checkbox — offered only where there is punctuation to enforce, i.e. on manual captions.

### T-09 — Entry screen + paste captions
Home with the URL field, handling of T-06's typed errors, and the "paste captions" path (RF-02b) always visible.
**Done when:** a video with no captions leads, in two clicks, to practising with a hand-pasted SRT.

**Verified in the browser:** URL + "colar legenda à mão" + a hand-typed SRT → practice running off the pasted timestamps, with a preview (`2 cues · cobre 0min25`) before starting. A `t=90` in the URL drops you straight into segment 22.

---

## Contracts (define in T-01, do not renegotiate afterwards)

```ts
type Cue     = { id: string; startMs: number; endMs: number; text: string };
type Segment = { index: number; startMs: number; endMs: number; referenceText: string };

type TokenStatus = 'correct' | 'typo' | 'wrong' | 'missing' | 'extra';
type DiffResult  = { tokens: { text: string; status: TokenStatus; expected?: string }[]; accuracy: number };
```

The architecture boundary these rely on is in `RULES.md`: they take data and return data. That is what keeps the test suite fast, and what allows swapping the caption source without touching the correction logic.

---

## Visual sequencing

```
S-1 ─┐
S-2 ─┴→ T-01 ─┬→ T-02 ─────────────────┬→ T-09
              ├→ T-03 ─┬→ T-04 ─┐      │
              │        └────────┤      │
              ├→ T-05 ──────────┼→ T-08
              ├→ T-06 ──────────┘      │
              └→ T-07 ─────────────────┘
```
T-02 through T-07 do not depend on one another (apart from T-04, which wants cues from T-03) — the order above is suggested by risk, not required.

---

## What does NOT go into Phase 1
Persistence, session summary, hints, settings, playback speed, review mode, visual identity, sync offset, time-range selection. All of them already have a home in Phases 2 and 3 of the spec — the temptation will be to pull "just one" forward.

---

## Plan risks (≠ product risks, §9 of the spec)
- **T-05 overruns.** It is the task with the most edge cases. Planned cut: defer §5.2 (numbers).
- **S-1 fails.** That is not a problem, it is information — it swaps the order of T-06 and T-09 and the MVP still stands, thanks to manual SRT.
- **Perfectionism in the segmenter.** T-04 has fast-diminishing returns: "good enough to practise with" ends the task; fine-tuning comes from real use, not from imagination.
