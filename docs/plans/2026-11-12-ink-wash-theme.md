# Ink and wash theme: implementation plan

**Status:** approved by Michael (2026-11-12), ready to start. **Owner:** Michael. **Written:** 2026-11-12.
**Source of truth:** the "Firefly Garden · Character" canvas
(https://claude.ai/artifact/JYTEsJmpHaWKATru6UMvDG): Round 4 (locked), Components, Twists, the
four screens and the three play bands; the asset list, tokens and motion table in
`docs/design/assets.md`. Exploration history: `docs/plans/2026-11-12-character-exploration.md`.

## Goal and scope

Turn the locked ink and wash design into the game's look as a **theme change**: new tokens,
fonts, procedural textures and code-drawn sprites behind the existing seams. Game logic, state,
levels, layout bands, the screen flow and the hint flow do not change.

In scope (screens that exist in the build today):

- Play in all three bands (tall, square, wide): board, status card with the lantern jar, top
  bar, controls, scenery
- Every board state on the Components board: dark, lit, firefly, hint firefly, conflict,
  ruled out, bushes (wanting, happy with roses, too many, no number, wants none), hint reason
  outline, solve moment
- Hint sheet and settings sheet, icons, coin, the jar-to-tile flight
- **Level complete** and the **garden map**: both were built in the old look on `develop`
  (`ui/complete.ts`, `ui/map.ts`, PR #4) while this exploration ran; here they are restyled,
  and the map gains its two designed motions
- Reduced motion per the motion table

Out of scope here (each gets its own plan, using the designs already on the canvas):

- **Sound** (a separate chat with fresh context; `docs/design/assets.md` lists the planned set)
- **Twist art** (mushrooms, moonlit, lanterns, ponds, two-colour fireflies, chapter blooms):
  Phase 4, with the twist chapters
- Michael's optional painting kit

## Decisions (confirmed by Michael, 2026-11-12)

1. **Board tilt.** The board is drawn with a slight downward camera tilt today (`TILT = 0.94` in
   `view/board.ts`). The ink and wash designs are flat-on with a visible front edge on each tile.
   **Decided: drop the tilt**; the front edge carries the 2.5D.
2. **The tray goes.** The board currently sits on a dark rounded tray. The designs put tiles
   straight onto the night with hills behind the status card. **Decided: remove the tray.**
3. **Copy changes that come with the look:** "A bush blooms when all its dots are gold." (was
   "is done"), and the hint sheet keeps its current wording. Everything else stays as written.
   **Decided: make the change.**

## Constraints and how each is kept

| Constraint | How |
| --- | --- |
| No colour literals outside `theme.css` (ratchet) | All colours become tokens; the board reads them through `view/theme.ts`; inline SVG markup in TS uses CSS classes, never hex |
| SDKs only in `apps/game/src/platform/` (ratchet) | Untouched; no SDK work in this plan |
| Strict CSP, offline | Fonts self-hosted woff2; textures generated at runtime to canvas (`blob:`/`data:` are already allowed for images); no outside origins |
| 8 MB bundle (ratchet) | Expect about −20 KB: fonts shrink, art is code |
| 60 fps on a 4 GB Chromebook | No live SVG filters on screen: all grain, fibre and wash edges are baked once per tile size into textures, as the board already does; DOM chrome uses plain CSS plus one baked paper texture |
| Reduced motion keeps every state change | Every animation is gated by the existing motion setting; the motion table becomes checks in tests where it can |
| 44 px targets, contrast 4.5:1 (3:1 for large numbers and graphics) | New contrast ratchet (milestone 1) over the token pairs that carry text and states |

## Milestones

Branch: `feature/ink-wash-theme` from `develop`, one commit per milestone at least, each with
`npm run check` green. Screenshots in all three bands, with and without reduced motion, at every
milestone that changes what's on screen.

### 0. Baseline

- [x] Screenshot the current build in tall, square and wide, motion on and off, for the
      before/after record (2026-11-13: 9 states per band and motion setting: play, placed,
      conflict, hint sheet, hint used, settings, solve, complete, map)
- [x] Michael confirms the three decisions above (2026-11-12: drop tilt, remove tray, copy change)

### 1. Tokens, fonts and a contrast ratchet

- [x] Replace the look pass 1 tokens in `apps/game/src/theme.css` with the ink and wash set from
      `docs/design/assets.md` (each multi-value row becomes separate tokens, e.g. `--ff-moss` and
      `--ff-moss-lo`). Keep token names stable where the meaning is unchanged so `ui/game.css`
      churns less
- [x] Update `view/theme.ts` `TOKENS` to the new names; `readPalette` stays as is (the board's
      existing palette keys point at the nearest new token until milestones 3 and 4 redraw it)
- [x] Fonts: add `@fontsource/young-serif` and `@fontsource/figtree` (both OFL-1.1); write our
      own `@font-face` rules importing only the woff2 files (Young Serif 400; Figtree 400, 600,
      700) instead of the package CSS, so no woff fallbacks ship; remove Fredoka and Nunito
- [x] Ship the two OFL licence texts under `apps/game/public/licenses/` and record them in the
      licence log
- [x] **Ratchet:** `tests/contrast.test.ts` reads `theme.css` and asserts WCAG contrast for the
      pairs that carry meaning (paper on night, sumi on paper, paper and gold numbers on moss,
      warn on wilt, paper on seal red, ruled-out and reason outline on dusk). A token change
      that breaks contrast fails the build. (Paper on seal red is 4.44:1 and fails; the canvas
      sets the button text in a lighter `#f8f0dd`, now `--ff-on-seal` at 4.77:1, and that is
      the pair the ratchet checks)
- [x] Evidence: build passes, bundle size reported, the ratchet catches a deliberately bad token
      (2026-11-13: 1.10 → 1.04 MB; fonts 62 KB woff2; `--ff-sumi-quiet` lightened to `#8a7f73`
      fails two pairs at 3.21:1 and 2.46:1)

### 2. Procedural texture kit

- [x] `apps/game/src/view/art/noise.ts`: seeded value noise (pure, no DOM), with unit tests for
      determinism and range in `apps/game/test/` (also continuity, seamless tiling with a control
      that sees a seam, fibre direction, and the fast lattice path matching `fbm()` pixel by pixel)
- [x] `apps/game/src/view/art/textures.ts`: paper grain, card fibre (the same noise stretched),
      wobbled wash edge and pooled edge, drawn into the board's existing `texture(key, size, draw)`
      cache so they're baked once per tile size and pruned on resize. Grain and fibre are baked
      once as small tileable squares (grain 64 px, fibre 64×128) and laid as canvas patterns, so a
      resize only redraws. Grain uses two octaves, not the canvas's three (the third is finer than
      a pixel). The current tiles already use them; milestone 3 draws the real tiles
- [x] One small paper texture baked at startup for the DOM chrome (status card, sheets,
      buttons), applied as a CSS background image: `--ff-paper-texture`, a 128 px tileable
      `blob:` URL encoded off the main thread; milestone 5 puts it on the chrome
- [x] Evidence: generation time measured on a 4× CPU-throttled profile; target under 30 ms for
      a 7×7 board's full set (2026-11-13, 45 px cells at 3×: 7 to 18 ms cold, about 3 ms warm,
      also about 3 ms at 60 px; the startup chrome paper costs 16 to 29 ms of main thread once,
      including the shared grain tile). Dev specimen and bench: `/dev/textures.html`

### 3. Board: tiles, bushes, roses, numbers

- [x] Dark tile (fibre card, front edge, dusk wash) and lit tile (paper rim, gold wash, pooled
      edge, warm centre); a tile lit twice looks the same as lit once. Drawn in `view/art/pieces.ts`
      in the canvas's 84-unit tile space (face 82×76, front edge inside the cell); placement maths
      in `view/art/geometry.ts`, unit-tested
- [x] Bushes: numbered, no-number, wants-none, wilted (too many); numbers in Young Serif; dots
      fill gold one by one; happy number turns gold. Too many swaps in the wilted drawing and shows
      the extra dots in warn; more than five dots wrap to two rows (a bush can want 8)
- [x] Roses: one drawing, three per happy bush, variant chosen from the cell index so a garden
      always looks the same; placed inside the leaf mass, clear of number and dots
- [x] Remove the tray and the tilt (tiles now sit 0.07 of a cell apart, the canvas's spacing,
      so cells grow a little in every band)
- [x] Evidence: the state sheet reproduced in the real build (a dev-only route or test page that
      renders every state), compared side by side with the Components board: `/dev/states.html`
      (real `BoardView`, real core evaluations); `?level=<id>` shows a launch level at phone width,
      checked on the 10×10 boards (still readable at 34 px cells)

### 4. Fireflies and board states

- [x] `FlyView` redrawn as firefly C: glowing tail with lantern ribs, head, curled antennae,
      wings as separate graphics for the flap (about twice a second), a 3 px bob over 2.4 s,
      breathing shadow and glow
- [x] Hint firefly: gold tail, dashed seal-red halo at body height, small seal with a plus
- [x] Conflict: rose tail and glow, sumi shiver lines, soft rose hatching on the tile, slow
      sway (still under reduced motion, marks stay)
- [x] Ruled-out brush cross and the dashed gold hint reason outline (one rounded outline around
      each touching group of named cells, `outlinePolylines` in `view/art/geometry.ts`, tested)
- [x] `ui/flight.ts`: the DOM flier redrawn to match firefly C (classes only, no hex)
- [x] Evidence: clips of place, call back, hint and conflict, motion on and off. Found on the way:
      the flight from the jar was being cancelled on the first move, because Young Serif's taller
      line box let the status card change height (a resize cancels flights). The status title now
      has an explicit line height, and `apps/game/test/status-css.test.ts` keeps the card's
      reserved height in step with it

### 5. Chrome and sheets

- [x] Status card: paper card, the paper lantern jar replacing `JAR_SVG` in `ui/screen.ts`
      (lights inside = fireflies left, dim and shaking when empty), slot row unchanged
- [x] Top bar: coin pill with the rose-stamp coin, settings button with the rose cog, progress
      dashes
- [x] Controls: paper buttons, Hint as the one seal-red filled action, icons from the Components
      board as inline SVG with CSS classes (`ui/icons.ts`: the twelve icons, coin and lantern;
      lines in `currentColor`, accents by token classes)
- [x] Hint sheet and settings sheet in paper; settings toggles keep their current behaviour; the
      play log stays one line. (Settings keeps its Done button and its bottom-sheet shape; no Sound
      control yet, that comes with sound. Status titles on paper: warn in `--ff-rose-spiral`, hint
      in the new `--ff-seal-ink`, both in the contrast ratchet)
- [x] Evidence: screenshots of every sheet in all three bands; 44 px targets measured (every
      button on the play screen and in both sheets, at 390×844, 360×740, 820×1000, 1280×720 and
      844×390: smallest 44 px). The status card keeps one height through all 34 status messages at
      360, 375, 390, 430, 600 and 820 px wide (measured live): Young Serif titles need 264 px of
      text, so narrow cards shrink the lantern a little and then the title (container queries in
      `game.css`), and the count line and slots always sit on their own rows

### 6. Scenery

- [x] Background layer behind the DOM chrome: night with grain, the crescent moon, and the hills
      (dusk and moss ridges, dot texture, roses along the ridge, drifting firefly motes) behind
      the status card, positioned per band from `view/layout.ts` (`hillsFor`, tested; drawn by
      `view/art/scenery.ts` into one canvas, redrawn when the screen or the card moves: 2 to 6 ms
      at 4× throttle, 40 ms the very first time). The twinkling stars are gone (Round 4 has a flat,
      grained night); disabled buttons stay opaque paper so the hills never show through
- [x] Motes drift only with motion on
- [x] Evidence: tall, square and wide screenshots matching the canvas boards

### 7. Solve moment and motion pass

- [x] Solve: bushes bloom in a ripple from the last firefly placed, petals and motes rise, then
      the existing auto-advance (every bush re-opens its roses, plain ones too; the old spark burst
      over the board is gone)
- [x] Walk the motion table in `docs/design/assets.md` row by row with motion on and off; add
      tests where the state layer can show it (e.g. reduced motion skips flights and blooms but
      every state change still lands). New moments: the light's wash spreads tile by tile, roses
      open when a bush is satisfied, an overfull bush slumps and drops petals. Timing is pure and
      tested (`rippleDelays`: without motion every moment lands at once); turning motion off
      mid-moment finishes them all; `apps/game/test/motion-css.test.ts` fails if any CSS
      animation or transition lacks a reduced-motion rule (caught two deliberate removals)
- [x] Performance: 60 fps check on a throttled profile with the largest launch board (c17-28,
      10×10, 4× CPU throttle: 60 fps idle and 59.6 during the solve moment at 1×). The container's
      WebGL is SwiftShader (software), so 2× runs at 28 to 33 fps here; the board's own script is
      about 0.3% of the frame, the rest is rasterising. That led to baking each firefly part tight
      (`FLY_BOXES`): fireflies' share of the frame fell from 38% to 13%
- [ ] Real-device check: 60 fps on a 4 GB Chromebook or a mid-range phone at 2× and 3× (this
      container has no GPU)

### 7b. Level complete (restyle `ui/complete.ts`)

The card exists: garden, time and hints, a +10 chip, Garden map, and Next garden with a ring
counting down the auto-advance, plus a spark burst; it covers the status card so the board never
resizes, and the last garden shows no Next. Restyle it to the canvas board "Level complete":

- [x] Paper card, "The garden is glowing" in Young Serif, the sub-line with garden, area and
      time, the coin badge with the rose-stamp coin, Garden map (paper, map icon) and Next garden
      (seal red, next arrow); the countdown becomes the thin seal-red bar (keep the ring if
      playtests prefer it), with "The next garden opens by itself in a moment." (The title keeps its
      "!": only the bush copy was cleared to change. The bar fills toward the next garden and stays
      still under reduced motion; the last garden shows Garden map alone and no bar)
- [x] The spark burst becomes the solve moment from milestone 7 (bloom ripple, petals, motes)
- [x] Behaviour unchanged: timing, hidden-tab and settings-sheet waits, last-garden rule
- [x] Evidence: clips of solve to card to next garden, motion on and off, in all three bands
      (and measured: at 360×640, 375×667, 390×844 and 820×1000 the canvas layout was 4 to 54 px
      taller than the space the card takes over, so where that space is short the card goes
      compact, title on one line and no note; it fits everywhere measured)

### 7c. Garden map (restyle `ui/map.ts`) and its motion

The map exists: area card with gardens solved ("15 of 30"), one bed per chapter (glowing,
you are here, still dark), the next area as a teaser, Continue; the top bar's map button leaves
a level (a quit, as decided in the Phase 2 plan). Restyle it to the canvas board "Garden map":

- [ ] Paper area card with the rose-pink progress bar; chapter stops along a dotted ink path
      (glowing with a bush and roses, current half-lit with a dashed gold ring and a hovering
      firefly, dark and locked); the teaser as a faded stop; Continue in seal red; hills behind
- [ ] Top bar map button uses the map icon from the Components board
- [ ] **New motion:** fireflies circle every finished chapter, heads along their path, two rings
      at different speeds; when a chapter is newly finished, the first map open after it plays
      one firefly flying the path to the next stop, which lights with a gold ring as it lands
      (needs a "seen" flag per chapter in the save, validated like the rest of it)
- [ ] Reduced motion: no circling, no flight; the new stop simply appears lit
- [ ] Evidence: screenshots in all three bands; a clip of the unlock flight; a test that the
      flight plays once per newly finished chapter

### 8. Ship

- [ ] Two parallel reviewer subagents (correctness, security) over the full diff;
      `/security-review` is not needed (no SDK, storage or input changes) unless the diff grows
- [ ] Living docs: CHANGELOG (look pass 2: ink and wash), ARCHITECTURE (the `view/art/` module
      and the scenery layer), ROADMAP (Phase 2 status), `docs/design/phase-2/README.md` (the open
      half is now ink and wash), CLAUDE.md if a lesson belongs there
- [ ] PR from `feature/ink-wash-theme` into `develop` with before/after screenshots

## Risks

| Risk | Mitigation |
| --- | --- |
| Texture baking slows startup on low-end devices | Bake lazily per tile size, cache, prune on resize (existing pattern); measure in milestone 2 |
| The board gets busy at 8×8 and above (roses, grain, glow) | Check the largest launch boards early in milestone 3; roses and grain scale down with tile size |
| Token churn breaks `ui/game.css` subtly | Keep names where meaning is unchanged; screenshot diff each band per milestone |
| Contrast regressions as tokens get tuned | The new contrast ratchet |
| Fonts render differently from the canvas | Same files (Google Fonts there, `@fontsource` here); compare titles and numbers at milestone 1 |
