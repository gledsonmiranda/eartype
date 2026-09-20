# Code rules

Engineering conventions for this repo, collected in one place instead of
scattered as asides through `docs/`. `docs/SPEC.md` and `docs/PLAN.md` say
*what* the product does and *in what order* it was built; this file says *how*
the code is written, and takes precedence when the two disagree.

## Naming

- **Components** each get their own **PascalCase folder** under
  `app/components/`, with the component in `index.tsx`:
  `app/components/VideoPlayer/index.tsx`, `app/components/EntryScreen/index.tsx`.
  The folder name matches the exported identifier (`VideoPlayer`,
  `EntryScreen`) — import it by the folder (`@/app/components/VideoPlayer`),
  never by `.../index`. A component that grows supporting files (styles,
  sub-components, a hook) gets them as siblings inside that same folder.
- Next.js route files keep the framework's own convention (`page.tsx`,
  `layout.tsx`, `route.ts`) — this rule does not apply to those.
- `lib/` modules and `tests/` files stay **kebab-case**
  (`parse-captions.ts`, `segment-playback.ts`), mirrored 1:1 between the two
  trees.

## Architecture boundary

`lib/` — specifically `segmenter`, `normalize`, `diff` and `session` — **knows
nothing about React, the DOM or YouTube**. Each takes data and returns data.
The one deliberate exception is `lib/player/youtube-iframe.ts`, which exists
precisely to isolate the parts only a browser can solve.

This is what keeps the test suite fast (~2s, no network) and what lets the
caption source be swapped without touching the correction logic.

## Errors

Internal/process failures (a failing `yt-dlp` call, a malformed pasted
caption file, a player error code) are translated into **typed, distinguishable
error codes** before they reach a component. Never surface a raw stderr
string or exception message on screen.

## Keyboard shortcuts

A new shortcut must never collide with a native browser command. `Ctrl+R`
(reload) is deliberately avoided: if `preventDefault` ever failed to fire, the
page would reload and — with no persistence — the whole session would be
lost.

## Language

Code, comments, docs and commit messages are in **English**. User-facing UI
copy is in **Portuguese** — this is a personal, single-user tool for a
Portuguese-speaking learner.

## TypeScript

Strict mode, no relaxed compiler flags.
