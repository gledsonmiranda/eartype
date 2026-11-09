# Eartype

An English listening trainer with two ways to practise:

- **Video dictation.** Pick a YouTube video; the app cuts its captions into
  3-to-8-second segments, plays one, **pauses exactly at its end**, and compares
  what you typed against the real caption, word by word.
- **Vocabulary.** A flip-card deck: a Portuguese word on the front, the English
  typed (or spoken) back. A daily session is suggested from how each word has
  gone so far.

The idea behind dictation is simple: understanding a video with the subtitles
on is easy, and it lies to you. Typing what you heard does not forgive — either
the word reached your ear or it did not.

It is a personal tool: UI in Portuguese, no login, progress kept in the browser.
Engineering conventions are in `docs/RULES.md`; agent instructions are in
`AGENTS.md`.

## Video dictation

```
library video, or URL + .srt/.vtt, or URL alone (yt-dlp)  →  cues  →  segments
                                                                         ↓
          word-by-word diff  ←  what you typed  ←  plays and pauses at the end
```

The way in, on `/videos`, goes in the order that works:

1. **The library** — videos whose captions ship with the project
   (`content/library/`). They open straight into practice, no download.
2. **A new video with its caption file** — paste the URL and drop an `.srt` or
   `.vtt`. Links to third-party caption download sites are offered, already
   filled in for that video. From here the video can be **added to the
   library** in one click.
3. **Automatic lookup through `yt-dlp`** — convenient when it works, but YouTube
   blocks it often, so it is the last option, not the first.

Five decisions shape everything else:

- **The pause is polled.** The YouTube IFrame API never says "I reached time X",
  so the app reads `getCurrentTime()` every 100ms and pauses on crossing the
  mark. Measured: it stops **~64ms late**, with ±8ms of spread. Pausing early
  would clip the last syllable, so there is no compensation — 64ms late lands in
  the silence between sentences.
- **Correction is lenient by default.** Case and punctuation do not count;
  `"I'm gonna go"` and `"I am going to go"` are the same answer, and `we'll`
  typed as `well` is accepted. Strict mode is a toggle, offered only when the
  captions are manual and have punctuation worth enforcing.
- **Raw captions are unusable as they come.** A 0.8s cue, a cue that lingers 20s
  after the speech ended, `[Music]`, `>>`, the *rolling text* of auto-generated
  captions, a 20-word cue holding three sentences. Cues are split at sentence
  and clause breaks, then regrouped by the segmenter. When both tracks exist,
  hand-written captions are **re-timed against the ASR word timings**, because
  hand-typed timings wander by up to ~2s.
- **Bringing your own caption file is a first-class path**, not an error
  screen. It is the only route that does not depend on an undocumented
  endpoint staying up.
- **The transcript sits alongside, blurred.** Each line leaves the blur when
  you answer its segment, so the filled-in panel is your progress.

Around the loop:

- **Word slots** ("Dica de letras") — the input draws one blank per letter of
  each word, filled as you type, so you know how many words there are and how long each one is.
  `Ctrl+↓` reveals just the next word when you are stuck.
- **Transcript panel** — lift the blur entirely, change the subtitle size
  (− / +), copy a line, or **translate a line to Portuguese** on request
  (Google Translate's free endpoint, through `/api/translate`).
- **Video settings** (gear icon) — the word-slots hint and strict mode on or
  off, mark every remaining segment done, or restart the run. The actions that rewrite the run ask first.
- **Progress is kept per video** in localStorage: close the tab and you come
  back to where you stopped. Outcomes are keyed by the segment's start time, so
  re-segmented captions keep what still lines up.

### Shortcuts

Your hands never have to leave the keyboard:

| shortcut | action |
| --- | --- |
| `Enter` | check; after a miss, accept and move on |
| `Shift+Enter` | line break |
| `Ctrl+Enter` | replay the segment |
| `Ctrl+Space` | pause / resume |
| `Ctrl+↓` | reveal the next word |
| `Ctrl+→` | reveal the answer and move on |
| `Alt+←` / `Alt+→` | previous / next segment |

Get it exactly right and **"✓ acertou"** appears; the segment advances on its
own after 1.2s.

### The library

One folder per video in `content/library/<videoId>/`, with `captions.srt` (or
`.vtt`) and a `meta.json`. Instructions, including adding by hand, are in
`content/library/README.md`. Library pages are prerendered at build.

When running locally the library is writable: cards can be added from the
practice screen and deleted from their card. A production build is read-only
unless `LIBRARY_WRITABLE=1` is set.

If a new video's subtitles run early or late, the YouTube upload usually has an
intro the caption file lacks (TED: ~12s). Compare a line at the start and one at
the end against YouTube's transcript; if the gap is the same, shift every
timestamp in `captions.srt` by that amount.

## Vocabulary

On `/vocabulary`:

- **Today's session** comes first, worked out from each word's stats: words you
  keep missing, then words you have not seen in a while, then new ones. Or pick
  a subject (category) yourself.
- **Typing or voice.** Typing is lenient about case, articles and accepted
  synonyms, strict about spelling — a one-letter slip shows as "almost" but
  counts as a miss. In voice mode the browser's speech recognition fills the
  field and you confirm the answer yourself. The choice sticks between visits.
- **Past-tense verbs** are their own deck, asked in English: the present on the
  card, the past typed back. Always typed — a recognizer hears the past of
  `read` as `red`.
- Every answer is saved as you go, so stopping loses nothing.

`/vocabulary/words` is the word list: search, filter by category, add, edit and
delete. Built-in words (`content/vocabulary/words.json`, ~535 words, and
`past-tense.json`, ~150 verbs) can be edited too — the change lives in a
localStorage overlay, and "Restaurar" brings the shipped version back.

## Progress backup

Everything lives in this browser only, so clearing site data would take it all.
The home has a **backup** card: export one file with video and vocabulary
progress, and import it back (or on another browser).

## Running

```bash
npm install
npm run dev      # http://localhost:3000
npm run check    # typecheck + lint + tests — what runs before a commit
npm test         # tests only
npm run corpus   # downloads the real captions one of the tests uses (optional)
npm run build && npm start   # production build
```

### Environment

Set in `.env.local` (loaded by Next, kept out of git):

| variable | effect |
| --- | --- |
| `YT_DLP_PATH` | path to the `yt-dlp` executable, when it is not on `PATH` |
| `TRANSCRIPT_CACHE=off` | disables the on-disk caption cache |
| `LIBRARY_WRITABLE=1` | allows library writes in a production build |

Google Analytics 4 loads only in production builds, after hydration.

## Optional: `yt-dlp`

Automatic caption lookup depends on the **`yt-dlp`** binary. Plain Node calls are
blocked by YouTube (200 with an empty body — see `docs/SPIKE-RESULTS.md`), and
`yt-dlp` as a child process is the only automatic route that still works.

```bash
pipx install yt-dlp          # recommended
pip install --user yt-dlp    # alternative
yt-dlp -U                    # every so often, whenever YouTube changes
```

On Windows the executable usually lands outside `PATH`; point `YT_DLP_PATH` at
it. `yt-dlp` also needs a **JavaScript runtime**; the app passes `--js-runtimes
node`, and older versions that do not know the option are retried without it.

**Without `yt-dlp` the app is fully usable** through the library and your own
caption files.

Each lookup costs ~3s and counts against YouTube's rate limit, so captions are
kept in memory and in `.cache/transcripts/` (outside git) for 30 days; `?force=1`
on the route repeats the lookup.

> If YouTube answers **`Sign in to confirm you're not a bot`**, the IP took a
> temporary block for too many requests. Wait a few minutes or use a caption
> file. The app reports this as its own error (`rate-limited`), distinct from
> "video has no captions".

## Structure

```
app/
  page.tsx               home: the two features and the progress backup
  videos/                video dictation entry (library + new video)
  library/[videoId]/     a library video, segmented on the server
  library/actions.ts     server actions: add / remove library videos
  vocabulary/            vocabulary practice and the word list (words/)
  api/transcript/        route that shells out to yt-dlp
  api/translate/         route that translates one subtitle line
  components/            one PascalCase folder per component
content/
  library/               shipped videos: captions + meta.json per videoId
  vocabulary/            words.json, past-tense.json
lib/
  captions/              SRT/VTT parser, cue splitter, re-timing, segmenter, SRT writer
  correction/            normalization and word-by-word diff
  library/               reads the library from disk
  player/                polled pause (pure) + IFrame API (DOM)
  practice/              session state, saved progress, word slots
  storage/               safe localStorage wrapper
  translate/             Google Translate client
  vocabulary/            word list + overlay, answer check, daily pick, session
  youtube/               URL parsing, caption lookup, caption download sites
types/                   shared contracts (Cue, Segment, DiffResult)
tests/                   Vitest, mirroring the lib/ tree
scripts/                 development utilities
docs/                    SPEC, PLAN, SPIKE-RESULTS, DESIGN, RULES, todo
```

The architecture boundary that holds the design up lives in `docs/RULES.md`:
`lib/` knows nothing about React, the DOM or the network. That is why the tests
run in seconds without touching the network.

## Tests

548 tests in 24 files, all offline. Pure logic — parser, splitter, re-timing,
segmenter, normalization, diff, sessions, vocabulary checks — is tested
directly; the player runs under *fake timers* against a fake player; caption
lookup and translation inject their executor / `fetch`. Two content tests check
that every folder in `content/library/` and every word in `content/vocabulary/`
is valid.

One test is different: `tests/captions/segmenter-corpus.test.ts` runs
**invariants over five real caption files** (manual, auto-generated, a 1h26
video, a small channel, a video suspected of being restricted) — no segment
under 1.5s, none over 8s, no boundary repeating 3 words, no leftover markup.
Those captions are third-party content and are **not in git**; `npm run corpus`
downloads them. Without them the suite declares itself skipped rather than
failing a clean clone.

## Status

Video dictation (MVP plus library, saved progress, translation, hints and
settings) and vocabulary practice (typing, voice, daily session, word list) are
both in daily use. Ideas still open are in `docs/todo.md` and §11 of
`docs/SPEC.md`.

Known limitations:

- automatic lookup only asks for the exact `en` track — a video whose only
  English is `en-US` needs a caption file (asking for more than one track earns
  a 429);
- manual vs. auto-generated is detected by the presence of per-word timings,
  which is a heuristic;
- when auto-generated captions rewrite their own transcript, the repetition
  escapes the dedupe in ~0.5% of segments;
- line translation uses an undocumented Google endpoint that can rate-limit;
- the React wiring has no automated test — it is verified by hand in the
  browser.

## Documentation

| file | what it is |
| --- | --- |
| `AGENTS.md` | instructions for coding agents working in this repo |
| `docs/RULES.md` | code rules: naming, architecture boundary, errors, language |
| `docs/SPEC.md` | what and why: requirements, normalization rules, risks |
| `docs/PLAN.md` | in what order, with a "done when" per task |
| `docs/SPIKE-RESULTS.md` | what was measured before writing the app — and what broke |
| `docs/DESIGN.md` | interface scales and patterns |
| `docs/todo.md` | open ideas |
| `content/library/README.md` | adding and removing library videos |
