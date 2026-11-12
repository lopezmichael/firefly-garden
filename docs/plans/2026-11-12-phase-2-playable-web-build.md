# Phase 2 · Playable web build

**Goal:** a build friends can open in a browser and want to keep playing:
chapters 1 to 3 of the launch pack on a PixiJS board with the full juice list,
coins and hints, the next-level policy deciding what comes next, progress that
survives a reload, and analytics events logged locally so their play becomes
the first real data.

**Gate:** friends play 20+ levels without being asked.

**Status:** draft, waiting for Michael's review (see "Decisions to confirm").

## Scope

In:

- PixiJS board renderer, mockup look, full juice list (project plan, "Effects")
- Chapters 1 to 3 from `levels/launch.json` (30 levels, 4x4 to 8x8, no twists) plus
  `levels/reserve.json` for policy detours
- Coins and hints: 60 starting, +10 per solve, 30 per hint, 3 hints per rewarded ad
  (one now, two banked), all from `PLAYER_CONFIG`, nothing restated in game code
- Hints from the grader on the player's current board; locked, visually distinct hint
  fireflies; animated removal for "fix a wrong firefly"
- `nextLevel` deciding every level after the first
- Local saves through `Platform.save/load`, validated before use
- Analytics events validated with `validateEvent` and kept in a local log
- Portrait and landscape layouts, safe areas, 44 pt targets, reduced motion
- Synthesized audio (chimes, solve flourish), mutable, muted during ads

Out (later phases): portal SDK adapters and real ads, ad pacing beyond the
first-session rule (Phase 3); coin doubler, streak saver, daily puzzle, painted
art, chapters 4+ (Phase 4); haptics and purchases (Phase 5). Ambient night loop
is a stretch goal for this phase.

## Decisions to confirm

1. **The mockup.** The "Puzzle Game Mockups" canvas is not in the repo (only its boards,
   as test fixtures). Please share it (HTML, screenshots or an export) so the port matches
   it. Without it I build from the project plan's art direction (dusky teal/plum/moss,
   warm gold light, raised 2.5D tiles, Fredoka and Nunito) and show screenshots early.
2. **Leaving a level counts as a quit.** Going back to the garden map mid-level ends the
   play as `quit` (so the policy can serve a breather and then a retry), but the board is
   kept and the retry resumes it. Closing the tab mid-level resumes on reload and is not a
   quit. There is no "skip level" button.
3. **Fake ads in the friends build.** The local adapter shows a 5-second placeholder card
   ("an ad would play here") with a cancel button, instead of resolving instantly, so hint
   flows, the no-credit-on-cancel rule and audio muting are exercised and rewarded hints
   are not free. Midgame placeholders follow the plan's rule: none in the first session's
   first 5 levels.
4. **Playtest distribution.** Friends need a URL. Recommendation: a Vercel preview of the
   `develop` branch (the plan already picks Vercel for the own site), password-free but
   unlisted. Alternative: GitHub Pages. This is outward-facing, so it waits for your go.
5. **How we see the gate.** No backend, so play logs stay on each friend's device. A
   "Play log" panel in settings shows levels played and copies the event log as JSON for
   friends to send back. The gate is judged from those logs plus what friends tell us.
6. **Playwright in CI.** An end-to-end smoke test (load, solve level 1 by tapping, take a
   hint, reload and resume) in CI needs `@playwright/test` as a dev dependency and a
   browser download in the CI job (~1 minute). Recommendation: yes, as a separate CI job.
7. **PixiJS 8.22.0, pinned exactly** (8.23.0 shipped yesterday; we take the newest
   release at least two weeks old). Fonts self-hosted from `@fontsource` (Latin subset,
   OFL), since levels and everything else must work offline.

## Architecture for the game app

Three layers inside `apps/game/src`, so the parts with rules in them can be
unit-tested in Node:

| Folder | Holds | May import |
| --- | --- | --- |
| `state/` | Play state (fireflies, locked set, undo stack, timers), wallet and hint bank, progress, save schema and validation, event log, level catalog | `@firefly/core` only. No DOM, no Pixi (ratchet) |
| `view/` | Pixi board scene, effects, layout math, theme bridge (reads CSS tokens into numbers for Pixi) | `state/`, `pixi.js` |
| `ui/` | DOM HUD and screens: map, top bar, hint dialog, level complete, settings, play log | `state/`, `view/` |
| `audio/` | Web Audio synth: chimes, flourish, master mute, ad ducking | nothing game-specific |
| `platform/` | Unchanged role: the only door to SDKs and storage | |

`main.ts` wires them. Game flow is a small explicit state machine
(`map → playing → solved → (midgame?) → playing …`), driven from `state/`, so
the same transitions are tested in Node and in Playwright.

## Work plan

### A. Core additions (pure, tested in `packages/core/test`)

- [ ] **Locked cells in the rules.** `canPlace(board, cell, locked?)` refuses locked hint
      cells; `evaluate` treats them as fireflies (they already are, via `placed`). Test:
      a locked cell can never be toggled; it counts for bushes and can conflict.
- [ ] **Grader from a position.** `grade(board, { start })` begins from a set of fireflies
      already placed (all must be solution cells), so a hint is "the next step from here".
- [ ] **`hint(board, solution, placed, locked)`** in a new `hints.ts`:
      - any player firefly not in the solution → remove one (conflicting ones first, then
        ones that overfill a bush, then any), reason "This firefly can't be part of the answer";
      - otherwise run the grader from the position and return the first step that places a
        firefly, with a one-line reason per technique ("This tile can only be lit from here",
        "This bush needs every open spot around it", …) and the `because` cells to highlight;
      - if the grader is stuck from that position, place a solution cell anyway (reason:
        "Try here") so a paid hint always does something.
      - Property test over every chapter 1 to 3 and reserve level: from random partial and
        wrong positions, every hint is correct, and repeated hints always finish the level.
      - Mutation check: a hint that skips the wrong-firefly branch must fail a test.
- [ ] **Hint step for analytics.** `hint.step` = the index in the level's full grader trace
      of the step that decides the hinted cell, so Phase 4 can tie hints to techniques.
- [ ] **Policy from compact facts.** `PolicyInput` gains `playedReserve` and `quitMain`
      sets (rules.md: persist facts, don't truncate history), so history can be capped
      without detours repeating or retries being lost. Simulator and tests updated; the
      shipped policy numbers in `reports/dash/policy.json` must not move.
- [ ] **Estimated seconds in level files.** Add an optional `seconds` key (written by the
      generator, validated by `parseLevel`, checked against a fresh `measure` in
      `tests/levels.test.ts`) so the game feeds `nextLevel` without grading 280 levels at
      startup. Regenerate packs with `npm run levels`; no level may change otherwise.

### B. Game state (`apps/game/src/state`, tested in `apps/game/test`)

- [ ] Level catalog: parse chapters 1 to 3 and the reserve with `parseLevel` at startup,
      build boards lazily, main path from `levels/manifest.json`.
- [ ] Play state: toggle, undo, reset (both never remove locked cells), solved via
      `evaluate`, counters for `level_end` (placements, undos, restarts, hints), active
      seconds that pause on hidden tab, menus and ads.
- [ ] Wallet and hint bank driven by `PLAYER_CONFIG` economy: coins only change through
      one function that also emits the `coins` event; hints from the bank first, then coins
      or an ad; ad hints credited only after `showRewarded()` resolves `true`.
- [ ] Orientation: pick the `transformLevel` that shows the board biggest for the current
      viewport; map taps back to canonical cells, so saves and events never depend on it.
- [ ] Next level: call `nextLevel` after every solve or quit; after chapter 3, a
      "more gardens soon" screen.

### C. Saves (`state/save.ts`)

- [ ] One versioned save document under one key: install id, session counter, coins, hint
      bank, solved set, capped history (last 50), played-reserve and quit-main sets,
      current level with its player and locked cells, settings.
- [ ] `parseSave(json, catalog, now)` validates everything per rules.md: known level ids,
      known reasons, finite non-negative numbers, timestamps not in the future, locked cells
      must be cells of that level's unique solution, player cells must be path cells, coins
      and bank are small non-negative integers (bank capped). Invalid fields fall back to
      safe defaults field by field; a wholly invalid save starts fresh at the next unsolved
      main-path level. Never throws.
- [ ] Fuzz test: random and hostile saves (prototype keys, huge numbers, wrong cells,
      unknown levels) never lock a wrong cell, never grant more than the cap, never crash.
- [ ] `/security-review` on the save and storage code before it lands.

### D. Board renderer and juice (`view/`)

- [ ] Pixi app sized to the board area, devicePixelRatio-aware, paused when hidden.
- [ ] 2.5D board: raised tiles with a front edge, slight downward tilt (vertical squash
      plus front edges, no 3D camera), bushes standing off the board with soft shadows,
      dot rows that fill as fireflies land.
- [ ] Glow without a filter stack: additive-blended radial sprites generated once at
      startup (cheap on a Chromebook); WebGL first, Pixi's fallback chain otherwise.
- [ ] Juice list, each item a separate effect that reduced motion can switch off:
      - [ ] firefly drop with bounce, hover bob, wing flutter, breathing shadow
      - [ ] light ripples tile by tile along row and column with a bloom per tile
      - [ ] motes drifting up from lit tiles (pooled, capped)
      - [ ] bush satisfied: dots glow gold, star twinkle, chime
      - [ ] conflict: nervous flicker and pink tint
      - [ ] solve: flowers pop on bushes, sparkle burst, then auto-advance
      - [ ] ambient: twinkling stars, moon, slow parallax
- [ ] **Hint fireflies:** gold ring and a small sparkle, distinct from player fireflies and
      lanterns; the `because` cells pulse briefly; a removal hint lifts the wrong firefly
      away visibly. A tap on a locked firefly gives a small "locked" wiggle, nothing else.
- [ ] Every color from `theme.css` tokens (read once into a Pixi palette); new tokens added
      there, none hardcoded (ratchet).
- [ ] Performance: object pools, a particle cap, an fps readout in dev builds; target
      60 fps at 4x CPU throttling in Chromium.

### E. UI, layout, accessibility (`ui/`)

- [ ] Portrait: top bar (area, chapter progress, coins) above the board, controls (undo,
      reset, hint with bank count) below. Landscape: the same in side panels.
- [ ] Safe-area insets; every button at least 44 px; the board's cells sized from the
      viewport. **Known squeeze:** 8x8 on a 360 px-wide phone gives about 42 px cells, so
      the board gets no outer gutter in portrait; checked in a 360x740 screenshot.
- [ ] Garden map: the Rose Bed with chapter progress toward the next area, "Continue".
- [ ] Hint dialog: bank count, "Use 30 coins", "Watch an ad for 3 hints" (video icon),
      equal-size "No thanks".
- [ ] Level complete: celebration, +10 coins, auto-advance with the next board preloaded.
- [ ] Settings: sound, reduced motion (defaults to `prefers-reduced-motion`, overridable),
      play log.
- [ ] First-level teaching: the one-line hint from the plan ("Tap a tile to place a
      firefly"), no text tutorial.
- [ ] Keyboard for desktop portals: arrows move a focus ring, space/enter toggles, Z undo,
      H hint. Board has an accessible label and a live region announcing "solved".

### F. Audio (`audio/`)

- [ ] Synthesized with Web Audio (no audio files, nothing added to the bundle): placement
      chime pitched by row, bush-satisfied chime, solve flourish, soft conflict tone.
- [ ] Starts on first user gesture; master mute in settings and saved; muted while any ad
      placeholder is up and while the tab is hidden.
- [ ] Stretch: ambient night loop (crickets, wind), off by default.

### G. Analytics, logged locally (`state/events.ts`)

- [ ] Every event in `docs/references/analytics.md` emitted at its moment, built from
      schema fields only, validated with `validateEvent` (with the known level set) before
      it is stored; invalid events are dropped and counted, never stored.
- [ ] Ring buffer (last 2,000 events) saved through `Platform.save`; random install id
      from `crypto.getRandomValues` on first launch.
- [ ] Play log panel: levels played and solved, hints, copy-as-JSON.
- [ ] Test: a scripted play-through emits a valid event stream whose `level_end` rows
      match the play (counts, outcome, reason, attempt).

### H. Platform adapter

- [ ] Local adapter: placeholder ad card (decision 3), `gameplayStart/Stop` around active
      play, everything else unchanged. Interface unchanged unless a need shows up.

### I. Evidence and checks

- [ ] Playwright smoke test (decision 6): load, solve level 1 by tapping its solution, buy a
      hint, cancel an ad (no credit), reload and resume, rotate to landscape.
- [ ] Screenshots for review: portrait 390x844 and 360x740, landscape 1280x720, reduced
      motion on, each juice moment; a short clip of a solve.
- [ ] Bundle stays well under 8 MB (expect ~1 MB with Pixi and fonts).
- [ ] New ratchets in `tests/ratchets.test.ts`:
      - `apps/game/src/state` imports only `@firefly/core` and itself
      - no color literals (`#rrggbb`, `0xrrggbb`, `rgb(`) in `apps/game/src` outside `theme.css`
      - economy numbers appear only in `PLAYER_CONFIG` (game reads, never restates)
- [ ] Reviews per CLAUDE.md before each substantive commit; `/security-review` for saves,
      storage and the ad placeholder flow.
- [ ] Living docs: ARCHITECTURE (game layers), rules.md (hint reasons, locked cells as
      implemented), analytics.md (where the local log lives), CHANGELOG, ROADMAP.

### J. Playtest and gate

- [ ] Deploy the playtest build (decision 4) once milestones 1 to 3 are done.
- [ ] Brief friends with nothing more than the link; collect play logs after a few days.
- [ ] Gate read-out: how many friends passed 20 levels unprompted, where they stopped,
      hint and quit rates per level against the Phase 1 simulation. Findings go in this file.

## Order of work

Each milestone ends with typecheck, tests, build, screenshots and a commit (when asked).

1. **Playable and plain:** A (locked cells, grader start, hints), B, the board drawn with
   flat shapes, tap to place, solve, auto-advance through chapter 1. Screenshot.
2. **Economy and memory:** wallet, hint bank, hint dialog, placeholder ads, saves with
   validation, the policy (A's compact facts and `seconds`), analytics log.
3. **Look and juice:** the mockup look, every juice item, audio, reduced motion, both
   layouts, keyboard.
4. **Polish and playtest:** Playwright in CI, performance pass, docs, deploy, friends.

## Risks

- **Grader from mid-game positions** is new ground: the grader was only ever run from an
  empty board. The property test in A is the guard; the "Try here" fallback keeps paid
  hints from ever doing nothing.
- **Glow cost on low-end devices.** Additive sprites instead of filters; reduced motion
  doubles as a low-power mode if the fps check fails.
- **Small phones.** 8x8 is the largest board in chapters 1 to 3 and sits right at the
  tap-target limit in portrait; later 10x10 chapters will need the per-orientation cap
  from the plan (a Phase 4 concern, noted here).
- **Friends' data stays on their devices.** Gate evidence depends on them sending logs;
  if that proves unreliable, a tiny opt-in endpoint is a Phase 3 question, not this phase.
