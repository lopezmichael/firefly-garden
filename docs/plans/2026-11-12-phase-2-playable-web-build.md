# Phase 2 · Playable web build

**Goal:** a build friends can open in a browser and want to keep playing:
chapters 1 to 3 of the launch pack on a PixiJS board with the full juice list,
coins and hints, the next-level policy deciding what comes next, progress that
survives a reload, and analytics events logged locally so their play becomes
the first real data.

**Gate:** friends play 20+ levels without being asked.

**Status:** all decisions made. Design approved 2026-11-12 as the Phase 2 baseline
(structure and behaviour locked, look open): [`docs/design/phase-2/`](../design/phase-2/README.md).
Milestone 1 in progress.

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

## Decisions

Reviewed with Michael on 2026-11-12.

1. **The mockup is the starting point, not the spec.** The "Puzzle Game Mockups" canvas
   (claude.ai artifact, boards "Firefly Garden" 390x844 and "landscape, shaped garden"
   844x390) sets the look; the game builds up from it. See "From the mockup" below.
2. **Leaving a level counts as a quit.** *Agreed.* Going back to the garden map mid-level
   ends the play as `quit` (the policy can serve a breather, then a retry), but the board
   is kept and the retry resumes it. Closing the tab mid-level resumes on reload and is not
   a quit. No "skip level" button.
3. **Rewarded ads in the friends build:** hidden; hints are coins-only there. *Decided (a).*
   Ad paths are covered by a scriptable test adapter in unit and Playwright tests.
4. **Playtest distribution:** an unlisted Vercel preview of `develop`. *Agreed.* Deploying
   is still done only when Michael gives the go for that specific deploy.
5. **Gate evidence:** a "Play log" panel in settings that copies the event log as JSON for
   friends to send back. *Agreed.*
6. **Playwright in CI** as a separate job, `@playwright/test` as a dev dependency. *Agreed.*
7. **PixiJS 8.23.0, pinned exactly.** *Decided:* it will be over two weeks old before any
   release. Fonts self-hosted from `@fontsource` (Latin subset, OFL) so the game works offline.
8. **Built with the iPhone Duo in mind.** *Added by Michael.* See "Foldables" below.

**Note on 3 (why rewarded ads need a decision).** Today the local adapter's
`showRewarded()` resolves `true` immediately. In a friends build that makes "Watch an ad
for 3 hints" a free button, so the hint and coin data the playtest produces would not
reflect the real economy, and the paths that matter most in Phase 3 (ad cancelled → no
credit, sound muted during the ad) would never run in front of real players. Two ways out:

- **(a) Hide the ad option in the friends build.** Coins only (60 to start, +10 per solve,
  30 per hint is plenty for 30 levels). Simplest. The ad paths are covered by unit tests
  and the Playwright test with a test adapter, not by friends.
- **(b) A placeholder ad card** (5 s, with cancel) so friends walk through the real flow.

Recommendation, taken: **(a)**. It keeps the playtest honest with less to build; the placeholder
card is only needed if we want to see whether friends choose ads over coins, and Phase 1's
simulation says they almost never need to this early.

## From the mockup

Keep (it already reads well):

- Night sky gradient, twinkling stars, a moon with craters; warm gold for everything lit
- Path tiles as raised rounded squares with a solid front edge (dark moss when unlit, a
  gold radial when lit), slight `rotateX` tilt on the board tray
- Bushes as moss-green blobs (irregular border radius) with the clue in Fredoka and a pip
  row that fills gold as fireflies land; pink number and pips when over; a twinkling star
  when met; flowers blooming on solve
- The firefly sprite: white wings that flutter, a cream body, a dark head with eyes, a
  halo that breathes, a shadow that breathes under it, drop-with-bounce on placement,
  nervous flicker and pink tint on conflict
- Light ripple: newly lit tiles brighten in order of distance from the new firefly
- Motes drifting up from lit tiles; a coloured sparkle burst on solve
- Status card under the board that teaches by reacting ("Two fireflies can see each
  other", "A bush has too many fireflies, diagonals count too", "3 path tiles still dark")
  plus a lit-tiles progress bar
- Controls: Undo, Reset, and a larger gold Hint; in landscape a left info panel and a
  right control column; the shaped-garden board's pond with lily pads and a koi

Build up (where the mockup stops):

- Rendered in PixiJS instead of DOM/CSS so glow, bloom and many particles stay at 60 fps;
  the CSS keyframes become the timing reference for each effect
- Light ripple along row and column with a bloom per tile, not just a brightness pop
- Hint fireflies (gold ring and sparkle, locked) and the hint dialog; the mockup's Hint
  button cheats from the stored answer, ours asks the grader
- Coins from `PLAYER_CONFIG` (the mockup shows 120 coins and +15 per solve; we ship 60 and +10)
- The level-dot row becomes chapter progress toward the next garden area; a garden map
  screen, level complete, settings and play log screens, which the mockup does not have
- The rules paragraph under the title shows on the first levels only, then gives way to
  the area name, as in the landscape board ("The Koi Pond")
- Every mockup color becomes a token in `theme.css`; nothing is copied in as a literal

## Foldables (iPhone Duo)

The iPhone Duo (September 2026) has a 7.6-inch inner screen and a 5.4-inch outer screen
with nearly the same aspect ratio, close to 4:3 (about 1.42:1 by one developer's count).
Derived sizes, not official: inner about 626x890 pt, outer about 470x670 pt. What
changes for us:

- **Layout follows aspect ratio, not orientation.** Phones are about 0.46 wide-to-tall;
  the Duo is about 0.70 in portrait and 1.42 in landscape. Three layout bands: tall
  (stacked, as the portrait mockup), near-square (board as large as possible, HUD in a
  compact strip on top, controls in a row below or a column beside, whichever leaves the
  bigger board), wide (side panels, as the landscape mockup). Band thresholds are chosen
  from screenshots at every target size, not guessed.
- **Folding and unfolding is a live resize.** The game must reflow mid-level without
  reloading, without losing the board, the undo stack or the active timer, and without
  replaying placement animations. The board's rotation (`transformLevel`) is picked when
  a level starts and kept through a resize unless the board would no longer fit with
  44 pt cells; then it re-fits with one short rotate animation (instant in reduced motion).
- **More room, bigger targets.** An 8x8 board gets about 55 pt cells on the outer screen
  and over 70 pt unfolded, so the Duo is not the tight case (360 pt-wide Android phones
  are), but large cells need the art to scale up cleanly: sprites and glow textures are
  generated at the device pixel ratio of the largest cell size, not stretched.
- **Crease.** The inner screen is one continuous display; the board will often sit over the
  fold. Nothing is done about it unless testing on a device shows taps or readability
  suffer there.
- **Checks:** Playwright screenshots at 626x890, 890x626 and 470x670, and a test that
  resizes from 470x670 to 626x890 mid-level and asserts the board, undo stack and timer
  survive. A real device check before the playtest if one is available.

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

- [x] **Locked cells in the rules.** `canPlace(board, cell, locked?)` refuses locked hint
      cells; `evaluate` treats them as fireflies (they already are, via `placed`). Test:
      a locked cell can never be toggled; it counts for bushes and can conflict.
- [x] **Grader from a position.** `grade(board, { start })` begins from a set of fireflies
      already placed (all must be solution cells), so a hint is "the next step from here".
- [x] **`hint(board, solution, placed, locked)`** in a new `hints.ts`:
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
- [x] **Hint step for analytics.** `hint.step` = the index in the level's full grader trace
      of the step that decides the hinted cell, so Phase 4 can tie hints to techniques.
- [x] **Policy from compact facts.** `PolicyInput` gains `playedReserve` and `quitMain`
      sets (rules.md: persist facts, don't truncate history), so history can be capped
      without detours repeating or retries being lost. Simulator and tests updated; the
      shipped policy numbers in `reports/dash/policy.json` must not move.
- [x] **Estimated seconds in level files.** Add an optional `seconds` key (written by the
      generator, validated by `parseLevel`, checked against a fresh `measure` in
      `tests/levels.test.ts`) so the game feeds `nextLevel` without grading 280 levels at
      startup. Regenerate packs with `npm run levels`; no level may change otherwise.

### B. Game state (`apps/game/src/state`, tested in `apps/game/test`)

- [x] Level catalog: parse chapters 1 to 3 and the reserve with `parseLevel` at startup,
      build boards lazily, main path from `levels/manifest.json`.
- [x] Play state: toggle, undo, reset (both never remove locked cells), solved via
      `evaluate`, counters for `level_end` (placements, undos, restarts, hints), active
      seconds that pause on hidden tab, menus and ads.
- [x] Wallet and hint bank driven by `PLAYER_CONFIG` economy: coins only change through
      one function that also emits the `coins` event; hints from the bank first, then coins
      or an ad; ad hints credited only after `showRewarded()` resolves `true`.
- [x] Orientation: pick the `transformLevel` that shows the board biggest for the current
      viewport; map taps back to canonical cells, so saves and events never depend on it.
- [x] Next level: call `nextLevel` after every solve or quit; after chapter 3, a
      "more gardens soon" screen.

### C. Saves (`state/save.ts`)

- [x] One versioned save document under one key: install id, session counter, coins, hint
      bank, solved set, capped history (last 50), played-reserve and quit-main sets,
      current level with its player and locked cells, settings.
- [x] `parseSave(json, catalog, now)` validates everything per rules.md: known level ids,
      known reasons, finite non-negative numbers, timestamps not in the future, locked cells
      must be cells of that level's unique solution, player cells must be path cells, coins
      and bank are small non-negative integers (bank capped). Invalid fields fall back to
      safe defaults field by field; a wholly invalid save starts fresh at the next unsolved
      main-path level. Never throws.
- [x] Fuzz test: random and hostile saves (prototype keys, huge numbers, wrong cells,
      unknown levels) never lock a wrong cell, never grant more than the cap, never crash.
- [ ] `/security-review` on the save and storage code before it lands.

### D. Board renderer and juice (`view/`)

- [x] Pixi app sized to the board area, devicePixelRatio-aware, paused when hidden.
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
- [x] Every color from `theme.css` tokens (read once into a Pixi palette); new tokens added
      there, none hardcoded (ratchet).
- [ ] Performance: object pools, a particle cap, an fps readout in dev builds; target
      60 fps at 4x CPU throttling in Chromium.

### E. UI, layout, accessibility (`ui/`)

- [ ] Tall band: top bar (area, chapter progress, coins) above the board, status card and
      controls (undo, reset, hint with bank count) below. Wide band: the same in side
      panels. Near-square band for foldables and tablets (see "Foldables").
- [ ] Safe-area insets; every button at least 44 px; the board's cells sized from the
      viewport. **Known squeeze:** 8x8 on a 360 px-wide phone gives about 42 px cells, so
      the board gets no outer gutter in portrait; checked in a 360x740 screenshot.
- [x] Garden map: the Rose Bed with chapter progress toward the next area, "Continue".
      *Done (milestone 3):* the top bar's map button leaves a level; an unsolved level counts as
      a quit and its board is parked (up to five) so the retry resumes it. First launch goes
      straight to garden 1; a returning player without an unfinished board opens on the map.
- [x] Hint dialog: bank count, "Use 30 coins", "Watch an ad for 3 hints" (video icon),
      equal-size "No thanks".
- [x] Level complete: celebration, +10 coins, auto-advance with the next board preloaded.
      *Done (milestone 3):* a card takes the place of the status card and moves (they keep their
      space, so the board never resizes): the garden, time and hints, a +10 chip, Garden map, and
      Next garden with a ring counting down the 3 s auto-advance. Sparks burst from the board. The
      countdown waits while a sheet is open or the tab is hidden and restarts from full. On the
      last garden there is no Next and no countdown. No preloading was needed: building the next
      board is synchronous and takes a frame.
      *Follow-up, done:* the status card could still grow on 320–360 px phones (long hint reasons
      were the card's title). Hints now have short one-line titles with the reason below; the card
      reserves three sub-lines when it is narrower than 290 px; a test holds every message to one
      title line and two sub-lines at a 360 px phone (72 characters, a proxy for width). Browser check at 320/360/390: no board change
      through a tap and two hints. Still to come: the same check in the CI browser smoke test.
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

- [x] Every event in `docs/references/analytics.md` emitted at its moment, built from
      schema fields only, validated with `validateEvent` (with the known level set) before
      it is stored; invalid events are dropped and counted, never stored.
- [x] Ring buffer (last 2,000 events) saved through `Platform.save`; random install id
      from `crypto.getRandomValues` on first launch.
- [x] Play log panel: levels played and solved, hints, copy-as-JSON.
- [ ] Test: a scripted play-through emits a valid event stream whose `level_end` rows
      match the play (counts, outcome, reason, attempt).

### H. Platform adapter

- [x] Local adapter: rewarded ads per decision 3, `gameplayStart/Stop` around active play,
      everything else unchanged. A scriptable test adapter (ad completes, ad cancelled)
      for unit and Playwright tests. Interface unchanged unless a need shows up.

### I. Evidence and checks

- [ ] Playwright smoke test (decision 6): load, solve level 1 by tapping its solution, buy a
      hint, cancel an ad with the test adapter (no credit), reload and resume, rotate to
      landscape, fold/unfold resize mid-level.
- [ ] Screenshots for review: 390x844, 360x740, 844x390, 1280x720, iPhone Duo inner
      626x890 and 890x626, outer 470x670; reduced motion on; each juice moment; a short
      clip of a solve; the fold/unfold resize test.
- [x] Bundle stays well under 8 MB (expect ~1 MB with Pixi and fonts).
- [x] New ratchets in `tests/ratchets.test.ts`:
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

## Michael's play feedback (2026-11-12)

Two things confused him on first play, plus two ideas worth keeping.

1. **Light crossing light reads as wrong.** It is allowed (only fireflies may not see each other),
   but the status line "Fireflies in the same row or column need a bush between them" invites the
   misreading "light can't overlap". Planned, all in the open look:
   - [ ] On a conflict, draw a pink beam between the two fireflies that see each other (the broken
         rule made visible), not only a pink tint on each.
   - [ ] Tiles lit by two beams look a touch brighter, so crossing reads as fine.
   - [ ] A one-line tip the first time beams cross in the opening levels: "Light can cross. Only
         fireflies can't see each other."
   - [ ] Optional: press-and-hold (hover on desktop) previews a firefly's light before placing it.
2. **No set number of fireflies.** Every level's count is fixed by its unique answer, but the game
   never says it. Michael wants a countdown ("firefly jar"). It is extra information, so it may make
   levels easier than their grade:
   - [x] Experiment: an opt-in known-count mode in the grader (default grading unchanged), all 680
         levels regraded with and without it; data in `reports/archive/count-experiment-2026-11-12.json`.
   - [x] Decide from the data: show the count everywhere, only early, or retune the ramp with it.
         **Decided (Michael, 2026-11-12): show the count on every level**, and grade every shipped
         level as players will experience it. `gradeLevel` (core) always passes the count; the
         generator, stored tiers/scores/seconds, ramp, simulated players, level ratchets and
         `hint` all use it, and the packs were regenerated. Before/after:
         `reports/archive/count-aware-pack-2026-11-12.json`. Chapter 1 is unchanged; c2 and c3
         swapped some levels (every ratchet holds). The game's `hintStep` trace uses `gradeLevel` too.
   - [x] Jar mock-up on the design canvas: row 3 (playable jar phone and a storyboard), with two
         decisions for Michael (does the jar cap placements; status card or top bar).
         *Decided:* the jar caps placements, and it lives in the status card. Open: jar with a
         number (A), jar plus a slot per firefly (B, recommended) or a lantern tube (C).
   - [x] **Ship the jar before the friends playtest.** *Done 2026-11-12 (milestone 3):* the jar
         plus a slot per firefly in the status card (design option B), capped placements with an
         empty-jar shake, fireflies flying out of the jar to the tile and home again (hints send a
         gold one), saves validated against the jar size. Follow-up for the juice pass: light the
         tile when the firefly lands, not on tap.
   - [ ] After launch, a level whose content changes gets a new id (saves also carry a level
         fingerprint, so a stale board is dropped, but `solved` would still credit the old one).
   - Framing to explore with it: the jar holds exactly the fireflies the garden needs; a hint sends
     one of them to the right spot (gold, locked). Hints must never be required to finish a level
     (portal rule), so a hint can't be the only way to get a firefly.
3. **Idea, Phase 4 twist: coloured beams.** Beams that cross mix colours; some tiles want a given
   mix (red + blue = purple), others must avoid one. Related to, but different from, the planned
   two-colour fireflies (there, bushes want a colour). Needs new rules in the solver and grader.
   Recorded in `docs/references/rules.md` ("Not yet implemented").

## Order of work

Each milestone ends with typecheck, tests, build, screenshots and a commit (when asked).

1. **Playable and plain:** A (locked cells, grader start, hints), B, the board drawn with
   flat shapes, tap to place, solve, auto-advance through chapter 1. Screenshot.
   *Done 2026-11-12:* built straight in the approved design's look (tiles, bushes, fireflies,
   hint ring, reason outlines, ruled-out marks, basic bob/drop/flutter); hints pay directly
   from coins until the hint sheet lands in milestone 2. Played in Chromium at all eight
   target sizes, including a fold from 470x670 to 626x890 mid-level.
2. **Economy and memory:** wallet, hint bank, hint dialog, rewarded-ad flow (decision 3), saves with
   validation, the policy (A's compact facts and `seconds`), analytics log.
   *Done 2026-11-12:* saves resume the exact board across reloads; corrupt saves (huge balances,
   locked cells outside the answer, unknown levels, garbage) were planted in the browser and each
   fell back safely. Settings sheet holds reduce motion and the play log. Quits arrive with the
   garden map (milestone 3): until then a play only ends by solving.
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
