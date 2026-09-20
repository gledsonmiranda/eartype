# Spike results — 2026-09-20

Step 0 of `PLAN.md`. The code was throwaway and was deleted once it had turned
into this document and the decisions it carries; what survived is here.
Environment: Windows 11, Node 24.19, Python 3.12.10, Chrome.

---

## S-1 — Do the captions actually come?  🔴 → 🟢 (by another route)

### What failed: `youtubei.js`
The library **lists** the caption tracks but **cannot download them**:

| Attempt | Result |
|---|---|
| `info.getTranscript()` | HTTP **400** on the `youtubei/v1/get_transcript` endpoint |
| `fetch(track.base_url)` (`timedtext`) | HTTP **200 with 0 bytes** |
| Same, `&fmt=json3` / `&fmt=srv3` / default | **200 / 0 bytes** on all three |
| Same, on the `WEB`, `ANDROID`, `IOS`, `MWEB`, `TV_EMBEDDED`, `WEB_EMBEDDED` clients | **200 / 0 bytes** on all six |

A `200` with an empty body is the signature of the *proof-of-origin token* block: YouTube accepts the request and returns nothing. It is not a bug in the code nor a quirk of a particular video — it is a closed door.

**Trap found along the way:** with `retrieve_player: false`, `getInfo` returns `playability_status: UNPLAYABLE` and **zero tracks** — a false negative that makes it look like the video has no captions. With `retrieve_player: true`, the same video returns `OK` and the tracks `en(manual), de(manual)`. Any future diagnosis has to use `true`.

### What worked: `yt-dlp`
Version 2026.08.19, at the time installed in an isolated venv just for the spike (today the app expects `yt-dlp` on `PATH` or at `YT_DLP_PATH` — see the README):

```
yt-dlp --skip-download --write-sub --write-auto-sub --sub-lang "en.*" --sub-format vtt
```

It downloaded valid WEBVTT: 6 cues, a `WEBVTT / Kind: captions / Language: en` header, `00:00:01.200 --> 00:00:03.360` timestamps (`.` separator), no inline tags.

**Observations:**
- `WARNING: ... no impersonate target is available` — a warning, not an error; the download worked. Solvable with `curl_cffi` if it ever gets in the way.
- **HTTP 429 (Too Many Requests)** when pulling the third track of the same video in quick succession. Design consequence: **download exactly one track per video** and cache hard.

### S-1b — can Next.js do it, calling yt-dlp as a process?  🟢 YES

A question raised while deciding the architecture: *if Node is blocked, wouldn't the Next.js route be blocked too?*

**No.** The block is on **whoever makes the HTTP request**, not on the runtime. Tested with `child_process.execFile` firing yt-dlp from Node:

```json
{ "file": "jNQXAC9IVRw.en.vtt", "bytes": 440, "cues": 6, "ms": 2316 }
```

**Three conditions this imposes:**
1. **`--sub-lang en`, never `en.*`.** The glob matched `en`, `en-en` and `en-de`; the third request took a **429** and, since yt-dlp exits non-zero, it took the whole call down with it — including the two tracks that had already downloaded successfully.
2. **The route needs Next.js's Node runtime, not Edge** — Edge has no `child_process`.
3. **The IP still counts.** Localhost is fine; from a cloud server the block would be back.

**UX cost:** ~**2.3s** per video on the first lookup. It demands an explicit loading state, and it makes caching mandatory rather than optional.

### Verdict
The automatic route in plain Node is dead today. `yt-dlp` solves it — including when called from inside Next.js — at the cost of an **external (Python) binary**. See `PLAN.md` §T-06.

### S-1c — coverage across the 5 real videos  🟢 5/5

List in `videos-for-test.md`. One `en` track per video, `--write-sub --write-auto-sub`:

| # | kind | videoId | duration | captions | cues | VTT |
|---|---|---|---|---|---|---|
| 1 | manual (MKBHD) | `ohqxP8EEumo` | 18min | **manual** (`en`, +ja/pt/ru/tr/vi) | 431 | 31 KB |
| 2 | ASR only | `45oG6w7bvtM` | 19min | auto | 776 | 132 KB |
| 3 | long | `8dHEG7WxR4c` | **1h26** | auto | 5,334 | 918 KB |
| 4 | small channel (4k views) | `xxdlUHSWM7E` | 14min | auto | 798 | 137 KB |
| 5 | suspected restriction | `Fy291Q3a6zs` | 26min | auto | 1,180 | 187 KB |

No restriction showed up: all five downloaded in sequence, with no 429 and no cookies. Video 3 shows the real size ceiling — **918 KB and 5,334 cues** in a single response, which weighs on T-06's cache.

**A new block mid-way:** YouTube started answering `Sign in to confirm you're not a bot` for **every** video and **every** client (`tv`, `android_vr`, `web_embedded`, `mweb`) — an IP block, probably inherited from the previous day's 429. It cleared on its own within minutes, with no action on our part — none of the alternatives tried (another client, a JS runtime, cookies) had any effect. Two lessons:

1. **`--js-runtimes node` is now mandatory.** Without a JS runtime, yt-dlp falls into a deprecated path and loses metadata (`No title found in player responses`). Node is already a dependency of the project, so it costs nothing.
2. **Browser cookies are not a viable plan B on Windows.** `--cookies-from-browser chrome` fails with `Failed to decrypt with DPAPI` because of Chrome's App-Bound Encryption — not even with the browser closed. The real plan B remains RF-02b (paste the captions by hand).

### What the real captions revealed about the segmenter (T-04)

Running `parseCaptions` + `segment` over the five files, four defects the fixtures never caught:

| defect | where | example |
|---|---|---|
| **Rolling-text dedupe fails on a 1–2 word repetition** — `MIN_OVERLAP = 3` lets it through | every ASR file | `…upgrading the wrong things.` / `things. You end up spending` |
| **Segment blows past the 8s `maxMs`** — a single long cue is never split | #5 | a **21.1s** segment: `"for the rest of my life."` |
| **`>>` survives the cleanup** when it is not at the start of the cue | #4, #5 | a whole segment that is just `">>"` |
| **Segments under 1.5s** — when the next cue blows the word limit, the short pending one is emitted as is | #1 (15), #3 (120) | `"an S update."` (0.83s) |

Also: **5 segments exceed 15 words** in video 1, all of them from a single cue — the segmenter joins cues, but never splits one.

T-04's "done when" criteria hold against the fixtures, not against real captions. Fixed in **T-04b** (see `PLAN.md`), with the five files promoted to fixtures in `tests/fixtures/corpus/`:

| defect | how it ended up |
|---|---|
| 1–2 word rolling text | the 10ms **ghost cue** became the signal: whatever it showed is a structural prefix and gets cut at any length |
| the 21.1s segment | the parser records when the **last word starts** (`Cue.speechEndMs`, from the `<00:00:01.000>` marks) and the segmenter trims the trailing silence |
| `>>` mid-cue | global cleanup, not just at the start — along with any speaker tag that comes with it |
| segments < 1.5s | the limits **stretch to `maxWords + 5`** instead of emitting a fragment; whatever is left is merged with its neighbour |

Across the five videos, afterwards: **no** segment under 1.5s, **none** over 8s, and boundaries repeating 3+ words: **zero** (there had been dozens).

---

## S-2 — Is the pause precise enough?  🟢 GREEN

10 trials, `seekTo(target − 2s)` → `playVideo()` → polling → `pauseVideo()` at the target. Measured the real time the video stopped at.

| Configuration | Median | Worst case | Samples |
|---|---|---|---|
| poll 100ms, lead 0 | **+64ms** | +77ms | +62, +63, +60, +62, +65, +64, +77, +64 |
| poll 100ms, lead 60ms | −33ms | −37ms | −33, −35, −31, −32, −26, −37 |
| poll 50ms, lead 60ms | −38ms | −39ms | −36, −37, −38, −35, −39, −39 |

**Reading:**
- The error is **small and highly deterministic** — ±8ms of variation between trials. That is better than the spec assumed; it can be compensated for precisely.
- **50ms polling buys nothing** (−38 vs −33). It stays at 100ms, which is cheaper.
- A 60ms lead **over-corrects** and starts pausing *before* the target. For dictation, pausing early is worse than pausing late: it clips the last syllable. **Decision: lead 0**, accepting the extra ~64ms, which in practice land in the silence between sentences.

**A bug in the test itself (not in the mechanism):** the first version of the page timed out because it fired `playVideo()` without waiting for the `seekTo` to settle. Fixed with a 600ms wait after the seek — **this becomes a requirement of the player wrapper** (T-07): do not start counting before the seek completes.

---

## Impact on the plan

| | Before | After |
|---|---|---|
| T-06 (caption lookup) | `youtubei.js` in a Next.js route | **`yt-dlp` validated on all 5 videos** — and it needs `--js-runtimes node` and has to tolerate a temporary IP block |
| T-04 (segmenter) | closed | **reopens** — 4 defects visible only in real captions (see S-1c) |
| T-07 (player) | 100ms polling + ~120ms lead | 100ms polling, **lead 0**, and wait for the seek to settle before counting |
| T-03 (SRT/VTT parser) | plan B | **rises in importance** — it is the guaranteed path |
| §9 R-06 of the spec | a future risk | **a risk that materialised on day 1** |
