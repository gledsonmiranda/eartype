<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Eartype — guide for agents

A personal English listening trainer for a Portuguese-speaking learner, with
two features:

- **Video dictation** (`/videos`, `/library/<videoId>`): a YouTube video is cut
  into 3–8s segments; each plays, pauses at its end, and what you typed is
  graded word by word against the caption.
- **Vocabulary** (`/vocabulary`, `/vocabulary/words`): a flip-card deck — a
  Portuguese word on the front, the English typed (or spoken) back, with a
  suggested daily session built from each word's stats.

Read `README.md` for the overview and `docs/RULES.md` for the code rules —
**`docs/RULES.md` wins** when docs disagree. `docs/SPEC.md` holds requirement
IDs (`RF-xx`, `R-xx`) that comments cite; keep citing them.

## Before you finish any change

```bash
npm run check    # typecheck + lint + all tests (offline, a few seconds)
```

UI changes are verified in the browser (`.claude/launch.json` has `dev` on
:3000 and `prod` on :3001). The React wiring has no automated tests, so a
browser check is the only proof a screen works.

## Rules that are easy to break

- **Language:** code, comments, docs and commits in **English**; every
  user-facing string in **Portuguese** (pt-BR). Error messages shown in the UI
  are Portuguese too.
- **Architecture boundary:** `lib/` is pure — no React, no DOM, no YouTube,
  no network calls made directly. Side effects are injected (`fetch`, the
  command executor, the random source, the library directory) so tests run
  without them. The single exception is `lib/player/youtube-iframe.ts`.
- **Tests mirror `lib/`** 1:1 under `tests/` (kebab-case file names). New
  logic in `lib/` gets a test; fixtures go in `tests/fixtures/`.
- **Components:** one PascalCase folder per component in `app/components/`,
  code in `index.tsx`, helpers and hooks as siblings; import by the folder.
- **Errors** become typed codes before they reach a component — never put a
  raw exception or stderr on screen.
- **Shortcuts** must not collide with browser commands (no `Ctrl+R`, etc.).
  Practice screen shortcuts live in `app/components/PracticeScreen/index.tsx`
  and are listed in the README; update both together.
- **Persistence is localStorage only**, through `lib/storage/local.ts`, which
  turns every failure into "nothing saved". Video progress is keyed by segment
  `startMs`, not index. There is no backend database and no login.
- **Icons:** Phosphor (`@phosphor-icons/react`). Styling: Tailwind v4, scales
  in `docs/DESIGN.md`.
- `next` is 16.x — check `node_modules/next/dist/docs/` before using a Next API
  (e.g. no `export const runtime` on routes; Node is the default).

## Content you will be asked to edit

### Library videos — `content/library/<videoId>/`

`captions.srt` (or `.vtt`) + `meta.json` (`title`, `kind: manual|asr`,
`addedAt: YYYY-MM-DD`). The folder name is the 11-char YouTube id.
`tests/library/content.test.ts` validates every folder. See
`content/library/README.md`.

**Out-of-sync subtitles** are the usual problem with a newly added video —
typically the YouTube upload has an intro (TED: ~12s) that the caption file
does not. To fix:

1. Get reference times from the YouTube version: open the watch page and read
   the transcript panel (`ytd-transcript-segment-renderer` elements). Fetching
   `captionTracks[].baseUrl` returns an empty body, and `yt-dlp` may not be
   installed.
2. Compare a few lines at the **start and the end**. If the gap is the same,
   it is a constant offset; intersect the ranges (the transcript shows whole
   seconds) to get the value.
3. Shift every `HH:MM:SS,mmm` in the file by that amount with a small Node
   script; keep cue numbering and text untouched. Check that the last cue ends
   before the video length (`ytInitialPlayerResponse.videoDetails.lengthSeconds`).
4. If the gap grows or shrinks over the video, it is not an offset — the
   captions belong to a different cut; say so instead of shifting.

Small text fixes to captions (misheard words) are fine as `chore:` commits.

### Vocabulary — `content/vocabulary/`

`words.json` (`{ id, portuguese, english, alternatives?, category }`, ids
`w_0001`…) and `past-tense.json` (present on the card, past as the answer).
User changes live in a localStorage overlay, so shipped ids must never be
reused or renumbered. `tests/vocabulary/content.test.ts` validates the files.

## Environment

| variable | effect |
| --- | --- |
| `YT_DLP_PATH` | path to the `yt-dlp` binary (Windows: usually outside `PATH`) |
| `TRANSCRIPT_CACHE=off` | disables the on-disk caption cache in `.cache/` |
| `LIBRARY_WRITABLE=1` | allows adding/removing library videos in a production build |

Google Analytics loads only in production builds.

## Git

Conventional commits (`feat:`, `fix:`, `chore:`), one feature per branch
(`feat/<name>`), merged to `main` through a PR. Adding a library video is a
`chore: add a new video` commit straight to `main`.
