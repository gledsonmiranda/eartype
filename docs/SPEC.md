# Spec — Eartype (dictation trainer)

> Status: **draft v1** · Date: 2026-09-20 · Author: Gledson Miranda
> Phase 1 (MVP) implemented — see `PLAN.md` for what each task delivered.

---

## 1. Overview

A personal English-study tool built on **dictation**: you paste a YouTube URL, the app loads the video and its English captions, and then plays the video **in short chunks**. At the end of each chunk the video **pauses automatically** and only resumes once you have **typed what you heard**. The app compares what you wrote against the real caption, shows word by word what you got right and wrong, and moves on to the next chunk.

The goal is not to memorise the video, it is to **train listening/comprehension**: to force the ear to resolve connected speech, contractions, reductions and vocabulary at native speed.

### 1.1 Product principles
1. **The loop is sacred.** Listen → type → check → repeat. Anything that does not serve that loop is secondary.
2. **Keyboard first.** Your hands should not leave the keyboard during a session. The mouse is optional.
3. **A mistake is information, not punishment.** The feedback shows exactly which word failed, not just "wrong".
4. **A personal tool.** Single-user, runs locally. No login, no multi-tenancy, no third-party analytics.
5. **Fail gracefully.** A video with no captions, bad captions or a blocked embed must give a clear message, never a blank screen.

### 1.2 Out of scope (v1)
- User accounts, cross-device sync, a database backend.
- Speech recognition (speaking instead of typing).
- Translation to Portuguese, a built-in dictionary, flashcards/SRS.
- Languages other than English.
- Sources other than YouTube (Vimeo, local files, streaming services).
- Native mobile (a responsive layout is desirable, but typing long text on a phone is not the use case).

---

## 2. Decisions already made

| Topic | Decision | Consequence |
|---|---|---|
| Stack | **Next.js (App Router) + TypeScript** | It has a server: caption lookup happens in a route handler, with no CORS. A future deploy is trivial. |
| Captions | **YouTube's own captions** | Free, and they already come with timestamps. Limitation: a video with no English captions is unsupported in v1. |
| Correction | **Lenient, configurable** | Normalises case/punctuation by default; strict mode is an option. Word-by-word diff. |
| Persistence | **Browser only (IndexedDB)** | Zero infrastructure. JSON export/import as a manual backup. |
| Visual identity | **Our own** | From `DESIGN.md` only the *structure* is reused (spacing scale, type hierarchy, radii, component patterns); the palette and fonts are our own. The name is **Eartype**. |
| Contractions and reductions | **Accept every equivalent form** | `don't` = `do not`, and also `gonna` = `going to`, `wanna` = `want to`. Requires a bidirectional equivalence table and multi-token alignment (§5.1). |
| MVP cut | **Phase 1: the bare loop, no persistence** | Closing the tab loses your progress. Persistence arrives in Phase 2. |
| Segment size | **3–8s, up to ~15 words** | A fixed value in the MVP; becomes a setting in Phase 2. |
| Numbers | **Digit = spelled out** | A limited table (0–100, round numbers, years, common ordinals). See §5.2. |
| Caption fallback | **Manual SRT/VTT already in v1** | Lands in Phase 1: parser + textarea. Never get stuck if the automatic route goes down. |
| Replay shortcut | **`Ctrl/Cmd + Enter`** | No conflict with the browser, no breakage of keyboard navigation. |
| Execution | **`localhost` only** | No deploy. Avoids a datacenter IP on caption lookup and keeps the use clearly personal. |

---

## 3. Persona and use case

**Sole user:** an intermediate (B1–B2) English learner who understands written text far better than audio. Sits down 15–30 min a day with a video they actually care about (a podcast, a talk, a tech review) and takes dictation from a stretch of it.

**A typical session:**
1. Pastes the URL of a ~10 min video.
2. The app confirms English captions exist and how many segments will be generated.
3. Chooses to start from the beginning (or to jump to 03:20, where they stopped yesterday).
4. Practises 20 segments, missing a lot of contractions and numbers.
5. Sees the summary: 78% accuracy, 12 troublesome words listed.
6. Closes it. The next day they reopen the same video and the app offers to continue where they left off.

---

## 4. Functional requirements

### RF-01 — Video entry
- A single field accepting: a full URL (`youtube.com/watch?v=ID`), `youtu.be/ID`, a URL with `&t=`, an embed URL, or the bare ID (11 characters).
- Extracts the `videoId`; if invalid, an immediate inline error ("Não consegui identificar um vídeo do YouTube nessa URL").
- If the URL carries `t=`/`start=`, the app offers to start from that point.
- A history of recently practised videos is listed on the home screen, clickable.

### RF-02 — Getting the captions
- On submit, the server fetches the video's caption track list and picks, in this order:
  1. **Manual** English captions (`en`, `en-US`, `en-GB`);
  2. **Auto-generated** (ASR) English captions;
  3. Failure, with a specific message.
- The app makes clear which one was used, because it changes the experience:
  - **Manual:** has punctuation and capitalisation; strict mode makes sense.
  - **Auto-generated:** usually no punctuation, no capitalisation, ASR errors and overlapping/duplicated cues. Lenient mode is mandatory here.
- If there is more than one English track, the user can choose which to use.
- The captions obtained are **cached** (see §7.3) so the request is not repeated on every visit.
- If the video only has captions in another language, the app says so and does not allow practice (out of scope).

### RF-02b — Manual captions (SRT/VTT) — a first-class path, already in v1
It is not just an error screen: it is an option that is **always visible** on entry, next to the URL field. After the spike this stopped being a luxury — it is the only route that does not depend on an undocumented endpoint continuing to work.

Whenever the automatic lookup fails (no captions, an outdated yt-dlp, a rate limit), the error comes with that way out: **paste the captions by hand**.
- A textarea accepting **SRT** and **WebVTT** (the two formats you meet in practice), detecting the format automatically.
- The parser validates and shows a preview: cue count, duration covered, first and last line — so you can confirm you pasted the right captions before starting.
- Timestamps in `HH:MM:SS,mmm` (SRT) and `HH:MM:SS.mmm` (VTT); indices, `WEBVTT`, `NOTE`, `STYLE` and inline tags (`<i>`, `<c>`, `<00:00:01.000>`) are ignored.
- From there, pasted captions follow exactly the same path as automatic ones (segmentation, correction), and are treated as **manual** for the purposes of strict mode.
- Also reachable on purpose, not only on error: a "paste captions" link always available on the entry screen.

### RF-03 — Segmentation
Raw captions arrive as *cues* of irregular size (sometimes 1s, sometimes a lone word). They have to be regrouped into **practisable segments**.

Segmenter rules:
- Target: **3–8 seconds** of audio per segment, **at most ~15 words**.
- Prefer breaking on sentence-final punctuation (`.`, `?`, `!`), then on `,`/`;`, then on a silent gap of ≥ 0.7s between cues.
- Never break in the middle of a cue.
- Join consecutive cues while the segment is below the minimum target.
- Remove non-spoken cues: `[Music]`, `[Applause]`, `[Laughter]`, `>>`, speaker tags of the `NAME:` kind (configurable — see §10).
- Deduplicate the *rolling text* of auto-generated captions (YouTube repeats the previous line in the next cue).
- The user can adjust the target segment size (short / medium / long) in settings; regenerating segments does not lose progress already made, because progress is anchored to a timestamp.

Each final segment has: `{ index, startMs, endMs, referenceText, sourceCueIds }`.

### RF-04 — Playback and automatic pause
- Player embedded through the **YouTube IFrame Player API**.
- When starting a segment: `seekTo(startMs)` + `playVideo()`.
- The API does **not** fire a "reached time X" event, so the app **polls `getCurrentTime()` every 100ms** and calls `pauseVideo()` on crossing `endMs`.
- **Measured in spike S-2:** the video stops ~**64ms after** the target, with only ±8ms of spread; 50ms polling does not improve it. **Lead stays at 0** — pausing early would clip the last syllable, and pausing 64ms late lands in the silence between sentences.
- **Requirement discovered in S-2:** wait for the `seekTo` to settle (~600ms) before starting to count. Without that, the polling reads the old time and the segment never pauses.
- After pausing, focus moves automatically to the typing field.
- The video **does not advance** until the segment is answered (or explicitly skipped).
- Controls available during dictation:
  - **Replay segment** (as many times as you like; counted in the stats).
  - **Speed** 1x / 0.75x / 0.5x (via `setPlaybackRate`).
  - **Replay just the last 2 seconds** of the segment.
  - **Skip segment** (marks it skipped, reveals the answer).
- YouTube's native captions (CC) are **off** in the player (`cc_load_policy: 0`) — seeing the caption defeats the exercise. The player UI must also be reduced enough that CC cannot be turned on by accident (see §9, risk R-04).

### RF-05 — Typing and checking
- A one/two-line textarea, autofocused, with `spellcheck`, `autocorrect` and `autocapitalize` **off** — the browser must not correct on your behalf.
- **Enter** checks. **Shift+Enter** breaks the line.
- Comparison (pipeline):
  1. Normalise both sides according to the mode (see §5).
  2. Tokenise into words.
  3. Align with a word-by-word diff (LCS + per-token Levenshtein).
  4. Classify each token: **correct**, **typo**, **wrong word**, **missing**, **extra**.
- The result shows the reference sentence with coloured markup and your attempt aligned to it.
- Segment accuracy = correct tokens / reference tokens.
- On a perfect answer: show **"✓ acertou"** with the sentence in green and advance on its own after ~1.2s. (It was 700ms; in real use the hit left the screen before it registered — and seeing that you got it right is half of what brings someone back to the exercise.)
- On a miss: show the diff and wait for an action — **try again** (clears the field, automatic audio replay) or **accept and move on**.
- A configurable attempt limit before the answer is revealed (default: 3; 0 = unlimited).

### RF-06 — Hints
Available before checking, each one recorded in the stats:
- **Reveal the word count** (shows `_ _ _ _` with each word's length).
- **Reveal the first letter** of each word.
- **Reveal the next word** (the first one not yet typed).
- **Reveal everything** (equivalent to skipping).

### RF-07 — Progress and navigation
- A progress bar by segment (X of N) and by video time.
- Navigate to the previous/next segment manually.
- Automatically resume from the last unfinished segment when reopening the video.
- Review mode: walk only through the missed/skipped segments of a previous session.

### RF-08 — Session summary
On finishing (or on ending manually):
- Overall accuracy, segment count, time spent, replay count, hint count.
- A list of the **most troublesome words** (aggregated in lowercase, ordered by error frequency) — that list is the main learning value.
- A button to copy/export the summary as Markdown.

### RF-09 — Settings
Persisted locally: correction mode (lenient/strict), segment size, default speed, automatic replay on a miss, attempt limit, non-spoken cue filter, theme (light/dark).

### RF-10 — Keyboard shortcuts
| Shortcut | Action |
|---|---|
| `Enter` | Check |
| `Shift+Enter` | New line |
| `Ctrl/Cmd + Enter` | Replay the segment |
| `Ctrl/Cmd + Shift + Enter` | Replay just the last 2s |
| `Ctrl/Cmd + ↓` / `↑` | Decrease / increase speed |
| `Ctrl/Cmd + H` | Next hint |
| `Ctrl/Cmd + →` | Skip segment |
| `Esc` | Pause the session |

The shortcut rule is in `RULES.md`: none of these may conflict with a browser command. `Ctrl+R` (reload) was avoided for exactly that reason — see `RULES.md` for why.

### RF-11 — Transcript panel
A column to the right of the practice area, listing every segment with its start timestamp and the current one highlighted.

- **Every segment is born blurred** (`blur`). Reading the caption defeats the exercise (§9, R-04), and the panel is literally the answer sheet.
- **A segment leaves the blur when it is answered** — got right, accepted with errors, or revealed. In the latter two the answer has already been shown anyway; in the first, un-blurring is the reward, and the filled-in panel becomes the visible record of progress.
- **A "show all" button** lifts the blur at once, including on what has not been practised yet. This is deliberate: reading along is a legitimate way to attack a hard video. The default is off.
- Clicking a segment jumps to it. The lines stay out of the tab order — with hundreds of segments, tabbing through them would get in the way more than it helps.
- The blur is discipline, not a lock: anyone who opens the inspector can read it. That is not what it exists to prevent.

---

## 5. Normalization rules (lenient correction)

**Lenient mode (default)** — ignores:
- Case (`The` = `the`).
- Punctuation and symbols at word edges (`don't,` = `dont` = `don't`).
- Straight vs. curly apostrophes.
- Multiple spaces and non-breaking spaces.
- US/UK spelling differences from a short list (`color`/`colour`, `realize`/`realise`, `traveling`/`travelling`).
- **Numbers** spelled out vs. as digits — see §5.2.
- **Spoken contractions and reductions** — see §5.1, the most delicate part of the correction.
- Filler words from ASR captions (`uh`, `um`, `mm`, `hmm`) — omitting them is not an error, and neither is typing them.

**Typo:** a token within a Levenshtein distance of ≤ 1 (words up to 5 letters) or ≤ 2 (longer words) is marked **amber** and counts as a partial hit (0.5) — the idea is to separate "I did not understand the word" from "my fingers slipped".

### 5.1 Spoken contractions and reductions

**The real problem:** YouTube captions frequently write the *orthographic* form even when the speaker used the *reduced* one. The person says "gonna", the caption writes "going to". Someone transcribing by ear writes "gonna" — and would be marked wrong, when in fact they heard **better** than the caption recorded. The same holds in reverse (an ASR caption writes "wanna", you write "want to").

**Rule:** equivalent forms are accepted **both ways**, in both directions of the comparison.

Categories covered by the equivalence table:

| Category | Examples |
|---|---|
| Standard contractions | `don't`/`do not`, `I'm`/`I am`, `they're`/`they are`, `won't`/`will not`, `can't`/`cannot`/`can not` |
| Colloquial reductions | `gonna`/`going to`, `wanna`/`want to`, `gotta`/`got to`, `hafta`/`have to`, `tryna`/`trying to` |
| `of` reductions | `kinda`/`kind of`, `sorta`/`sort of`, `outta`/`out of`, `lotta`/`lot of`, `cuppa`/`cup of` |
| Modal + have | `shoulda`/`should have`/`should've`, `woulda`, `coulda`, `musta` |
| Reduced pronouns | `lemme`/`let me`, `gimme`/`give me`, `'em`/`them`, `y'all`/`you all`, `dunno`/`don't know` |
| Others | `'cause`/`because`/`cuz`, `ya`/`you`, `ain't` (see the ambiguity below) |

**Technical implication — multi-token alignment.** `gonna` is 1 token and `going to` is 2. A naive word-by-word diff misaligns the whole sentence from there on and paints everything red. Two consequences for the implementation:

1. Normalization runs in **two passes**: first a *sentence pre-pass* that canonicalises multi-word expressions (the expanded form becomes canonical: `gonna` → `going to`), then tokenisation. That way both sides reach the diff with the same token count.
2. The matcher compares **sets of accepted variants** per position, not strings: two tokens match if their sets intersect. That settles the ambiguous cases, where expanding would mean *choosing wrong*:
   - `he's` = `he is` **or** `he has`
   - `I'd` = `I would` **or** `I had`
   - `ain't` = `am not` / `is not` / `are not` / `has not`
   - the possessive `'s` (`John's car`) is **not** a contraction and must never be expanded.

**Mandatory tests** (§7.5) for this module: `"I'm gonna go"` vs `"I am going to go"` vs `"Im gonna go"` — all three must score 100%; and `"the dog's bone"` vs `"the dog is bone"` must be an **error**, to prove the possessive was not expanded.

**Known limit:** the table is finite and does not cover accents or rare reductions (`whatcha`, `betcha`, `innit`). It starts at ~40 entries and grows with use — when an unfair error shows up, the fix is to add a row to the table and a test.

### 5.2 Numbers

Digits and spelled-out forms are **equivalent both ways**, with a deliberately limited table (this is not a complete conversion library):

| Covers | Examples |
|---|---|
| Cardinals 0–100 | `5` = `five`, `21` = `twenty-one` = `twenty one` |
| Round numbers | `200`, `1000`, `1500` = `fifteen hundred` = `one thousand five hundred` |
| Years | `1990` = `nineteen ninety`, `2024` = `twenty twenty-four` = `two thousand twenty-four` |
| Common ordinals | `1st` = `first`, `3rd` = `third` |
| Percentages | `10%` = `ten percent` |

Not covered (compared literally): decimals, currency, arbitrary large numbers, phone numbers, times of day. As in §5.1, canonicalisation happens in the sentence pre-pass — `twenty one` is 2 tokens and `21` is 1.

**Acronyms:** compared ignoring dots and case (`NASA` = `nasa` = `N.A.S.A.`). Spelling an acronym out in full is not accepted.

**Strict mode:** normalises whitespace only; everything else has to match. It is disabled automatically when the captions are auto-generated (there is no sense in demanding punctuation from a text that has none).

---

## 6. Flow / state machine

```
idle
  └─(submit URL)→ resolving        # extract videoId, fetch caption tracks
        ├─(failure)→ error         # no captions / video unavailable / embed blocked
        └─(ok)→ ready              # segments generated, player loaded
              └─(start)→ playing   # playing the current segment
                    └─(reaches endMs)→ awaiting_input   # paused, focus in the textarea
                          ├─(Enter)→ checking → feedback
                          │      ├─(correct)→ next
                          │      └─(wrong)→ awaiting_input (retry) | next (accept)
                          ├─(replay)→ playing
                          └─(skip)→ next
                                └─ next: any segments left? playing : session_summary
```

Extra states: `paused` (Esc), `seeking` (the user navigated manually).

---

## 7. Technical architecture

### 7.1 Stack
- **Next.js (App Router) + TypeScript (strict)**
- **Tailwind CSS**, with tokens derived from `DESIGN.md` (see §8)
- **Zustand** (or `useReducer` + Context) for the session state machine
- **Dexie** over IndexedDB for persistence
- **Zod** to validate route handler payloads
- **Vitest** for unit tests (segmenter, normalizer, diff) + **Playwright** for 1–2 E2E flows
- No heavyweight component library; our own components

### 7.2 Folder structure (proposed)
```
app/
  page.tsx                     # home: URL input + history
  practice/[videoId]/page.tsx  # dictation session
  api/transcript/route.ts      # GET ?videoId= → tracks + cues
  api/video/route.ts           # GET ?videoId= → metadata (title, duration, thumb)
components/
  YouTubePlayer.tsx            # IFrame API wrapper
  DictationInput.tsx
  DiffResult.tsx
  SegmentProgress.tsx
  SessionSummary.tsx
lib/
  youtube/parse-url.ts
  youtube/transcript.ts        # fetch + parse of the tracks (isolated, swappable layer)
  captions/parse-srt.ts        # plan B: hand-pasted SRT/VTT
  segmenter.ts                 # cues → segments
  normalize.ts                 # §5 rules
  diff.ts                      # word-by-word alignment
  stats.ts
  db.ts                        # Dexie
types/
```

### 7.3 Getting the captions (the critical point)
There is no public, official YouTube API that returns the **text** of a third party's video captions — the Data API v3 (`captions.download`) only works for videos on your own authenticated channel. In practice the options are:

- **A.** Read the video page on the server, extract `captionTracks` from `ytInitialPlayerResponse` and download the track through the `timedtext` endpoint.
- **B.** Use a library that wraps this (`youtube-transcript`, `youtubei.js`).

- **C.** Delegate to `yt-dlp` (a Python binary), called from the route handler.

> ⚠️ **Updated by the spike (2026-09-20, see `SPIKE-RESULTS.md`): A and B are blocked today.** `timedtext` returns **200 with an empty body** on all six internal clients tested — a *proof-of-origin token* block. Only option **C (`yt-dlp`)** delivered captions.

**Decision: C — `yt-dlp` called from the route handler, with the manual path (RF-02b) as a first-class option in the UI, not merely an error screen.** The block is on *whoever makes the request*, not on the runtime: with yt-dlp as a child process, Next.js gets the captions normally (validated in S-1b, ~2.3s per video). The price: a dependency on an external binary, documented in the README, and an occasional `yt-dlp -U`.

**Constraints the spike imposed, whichever option is used:**
- Download **exactly one track per video** — asking for the second in quick succession earned an **HTTP 429**.
- Cache hard; treat captions as expensive to obtain.
- When diagnosing with `youtubei.js`, always use `retrieve_player: true` — with `false` the video shows up as `UNPLAYABLE` and with no tracks, a false negative.

**Accepted risks:** it is an undocumented endpoint; YouTube changes the format periodically and applies per-IP rate limiting. Personal, non-commercial use. Plan B — pasting SRT/VTT by hand (RF-02b) — stopped being a luxury and became the only guaranteed route.

**Cache:** the response is kept in IndexedDB by `videoId` (with the lookup date) and, in development, optionally on disk on the server. A "reload captions" button forces a refetch.

### 7.4 Data model (IndexedDB)
```ts
type Video = {
  videoId: string; title: string; durationSec: number; thumbnailUrl: string;
  captionKind: 'manual' | 'asr'; captionLang: string;
  cues: Cue[];            // raw captions, as they came
  fetchedAt: number;
};

type Cue = { id: string; startMs: number; endMs: number; text: string };

type Segment = {
  videoId: string; index: number;
  startMs: number; endMs: number;
  referenceText: string;
};

type Attempt = {
  id: string; videoId: string; segmentIndex: number;
  typedText: string; accuracy: number;     // 0..1
  status: 'correct' | 'partial' | 'skipped';
  replays: number; hintsUsed: number;
  durationMs: number; createdAt: number;
  wrongWords: string[];                    // feeds the hard-words aggregate
};

type Session = {
  id: string; videoId: string;
  startedAt: number; endedAt?: number;
  lastSegmentIndex: number;
  settingsSnapshot: Settings;
};

type Settings = { /* §RF-09 */ };
```

### 7.5 Test strategy
- **Unit (the heart):** `normalize`, `diff` and `segmenter` against a table of cases — contractions and reductions (§5.1), numbers (§5.2), typos, duplicated ASR cues, `[Music]`, a 0.3s cue, a 30s cue.
- **SRT/VTT parser:** a well-formed file, a file with CRLF, timestamps in both separators (`,` and `.`), inline tags, invalid input (must give a readable error, not crash).
- **Fixtures:** 2–3 real caption files saved as JSON (one manual, one auto-generated) so the tests do not depend on the network.
- **E2E:** "paste URL → first segment pauses → type it right → advance", with the transcript route mocked.

---

## 8. UI / Design

The repository contains `DESIGN.md`, a design system extracted from a brand's site. **Decision: our own identity.** Only its *structure* is reused, which is generic and well resolved:
- the spacing scale (4/8/16/24/32/48/64/96);
- the type hierarchy (sizes in closed increments, body at line-height 1.5);
- the radius scale (small input, medium card, pill button);
- the component state patterns (default / hover / pressed / disabled / focus).

The palette and fonts are our own — no brand colour, logo or third-party name in the app. Fonts: a system sans for UI and a **monospace** for the dictation text (the word-by-word diff alignment is far more readable in mono).

Other guidelines:
- Dark mode as the default (watching video against a light ground is tiring).
- The player takes the top/centre; the typing field sits **immediately below** the video, with no need to scroll the page at 1366×768.
- Coloured diff: green = correct, amber = typo, red = wrong, dashed grey = missing, struck through = extra. Colour is **never** the only indicator (an icon/underline too), for accessibility.
- A 3-zone layout: player (top) · input + feedback (middle) · progress and shortcuts (footer).
- No long animation between segments — the rhythm of the loop is the product.

> Settled: the app is called **Eartype**. Still pending: the palette (it does not block Phase 1 — the MVP can be born in neutral grey).

---

## 9. Risks and edge cases

| ID | Risk / case | Handling |
|---|---|---|
| R-01 | Video with **no English captions** | A clear message when resolving the URL, before loading the player. |
| R-02 | **Bad auto-generated captions** (no punctuation, ASR errors) | Lenient mode forced; a "these captions are wrong, skip" button that does not count as an error. |
| R-03 | **Embed disabled**, age restriction or regional block | The player emits an error (100/101/150). Detect it and show a specific message with a link to open on YouTube. |
| R-04 | The user turns **CC** on in the player and sees the answer | `cc_load_policy: 0`, reduced `controls` and an optional overlay covering the lower band of the video during dictation. |
| R-05 | Captions **out of sync** with the audio | A global offset adjustment (±ms) in settings, applied to both the seek and the pause. |
| R-06 | The caption endpoint **breaks** (a YouTube change) | An isolated layer + the manual SRT/VTT fallback (RF-02b), available since v1 — the app is never left unusable. |
| R-07 | A **very long video** (2h+) generates hundreds of segments | Select a time range (e.g. 05:00–15:00) before starting. |
| R-08 | A **live stream** or a video with no fixed duration | Block it with a message. |
| R-09 | An imprecise pause (clipping the last syllable) | A configurable lead time and ~150ms of padding at the end of the segment. |
| R-10 | Data loss in IndexedDB (clearing the browser) | Manual JSON export/import + a warning on the first session. |
| R-11 | An ad plays before the video and the polling pauses at the wrong time | Only start polling after the `PLAYING` state and once `getCurrentTime()` is within the expected range. |
| R-12 | YouTube's terms of service regarding access to captions through an unofficial route | Personal, local use; do not redistribute captions; review before hosting publicly. |

---

## 10. Open questions

### Resolved
- ~~**Q-01 — Visual identity.**~~ → Our own identity; from `DESIGN.md`, only the structure (§8).
- ~~**Q-02 — Segment size.**~~ → 3–8s / up to ~15 words, fixed in the MVP.
- ~~**Q-04 — Contractions.**~~ → Accept every equivalent form, including spoken reductions (`gonna`, `wanna`). Detail in §5.1.
- ~~**Q-07 — MVP scope.**~~ → Phase 1: the bare loop, no persistence.

- ~~**Q-03 — Caption fallback.**~~ → Pasting SRT/VTT already in v1 (RF-02b), in Phase 1.
- ~~**Q-05 — Shortcuts.**~~ → `Ctrl/Cmd + Enter` to replay; `Ctrl+R` avoided on purpose.
- ~~**Q-06 — Numbers and acronyms.**~~ → Digit = spelled out, with a limited table (§5.2).
- ~~**Q-08 — Deploy.**~~ → `localhost` only, no deploy.

### Open
- **Q-09 — Vocabulary.** Should the "troublesome words" list (§RF-08) become something actionable — export to Anki/CSV — or is seeing it in the session summary enough? It blocks nothing: Phase 2 onwards.

---

## 11. Roadmap

### Phase 1 — MVP (the loop works end to end)
1. Setup: Next.js + TS + Tailwind + Vitest.
2. `parse-url` + the `/api/transcript` route fetching the English captions.
3. SRT/VTT parser + the screen for pasting captions by hand (RF-02b).
4. `segmenter`, with tests.
5. Player with the IFrame API + automatic pause at the end of the segment.
6. `normalize` (§5, §5.1, §5.2) + `diff` + word-by-word visual feedback.
7. Advance / replay / skip a segment. Progress X of N. The essential shortcuts (`Enter`, `Ctrl+Enter`).

**Done criterion:** paste the URL of a video with manual captions and do 10 segments in a row without touching the mouse.

### Phase 2 — Usable day to day
8. Persistence (Dexie): resume where you left off, video history.
9. Session summary + troublesome words.
10. Settings (§RF-09) + speed control + replay of the last 2s.
11. Decent support for auto-generated captions (dedupe, filler words).

### Phase 3 — Refinement
12. Hints (§RF-06) and the attempt limit.
13. Review mode for missed segments.
14. Time-range selection for long videos.
15. Sync offset adjustment.
16. JSON export/import.
17. Full shortcuts + accessibility (visible focus, feedback announced by a screen reader).

### Ideas for later (not committed)
- A Whisper transcription fallback for videos with no captions.
- Export hard words to Anki/CSV.
- A "shadowing" mode (repeat out loud, with recording).
- Statistics over time (an accuracy-per-week chart).

---

## 12. Success metrics (personal)
- Practise for 15 minutes with no UI friction (no reloading, no mouse).
- Average accuracy rising over the weeks on the same kind of content.
- The troublesome-words list actually pointing at patterns (e.g. always missing a final `-ed`, always confusing `can` with `can't`).
