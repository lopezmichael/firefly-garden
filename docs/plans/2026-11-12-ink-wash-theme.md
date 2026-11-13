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

- [ ] `apps/game/src/view/art/noise.ts`: seeded value noise (pure, no DOM), with unit tests for
      determinism and range in `apps/game/test/`
- [ ] `apps/game/src/view/art/textures.ts`: paper grain, card fibre (the same noise stretched),
      wobbled wash edge and pooled edge, drawn into the board's existing `texture(key, size, draw)`
      cache so they're baked once per tile size and pruned on resize
- [ ] One small paper texture baked at startup for the DOM chrome (status card, sheets,
      buttons), applied as a CSS background image
- [ ] Evidence: generation time measured on a 4× CPU-throttled profile; target under 30 ms for
      a 7×7 board's full set

### 3. Board: tiles, bushes, roses, numbers

- [ ] Dark tile (fibre card, front edge, dusk wash) and lit tile (paper rim, gold wash, pooled
      edge, warm centre); a tile lit twice looks the same as lit once
- [ ] Bushes: numbered, no-number, wants-none, wilted (too many); numbers in Young Serif; dots
      fill gold one by one; happy number turns gold
- [ ] Roses: one drawing, three per happy bush, variant chosen from the cell index so a garden
      always looks the same; placed inside the leaf mass, clear of number and dots
- [ ] Remove the tray and the tilt
- [ ] Evidence: the state sheet reproduced in the real build (a dev-only route or test page that
      renders every state), compared side by side with the Components board

### 4. Fireflies and board states

- [ ] `FlyView` redrawn as firefly C: glowing tail with lantern ribs, head, curled antennae,
      wings as separate graphics for the flap (about twice a second), a 3 px bob over 2.4 s,
      breathing shadow and glow
- [ ] Hint firefly: gold tail, dashed seal-red halo at body height, small seal with a plus
- [ ] Conflict: rose tail and glow, sumi shiver lines, soft rose hatching on the tile, slow
      sway (still under reduced motion, marks stay)
- [ ] Ruled-out brush cross and the dashed gold hint reason outline
- [ ] `ui/flight.ts`: the DOM flier redrawn to match firefly C (classes only, no hex)
- [ ] Evidence: clips of place, call back, hint and conflict, motion on and off

### 5. Chrome and sheets

- [ ] Status card: paper card, the paper lantern jar replacing `JAR_SVG` in `ui/screen.ts`
      (lights inside = fireflies left, dim and shaking when empty), slot row unchanged
- [ ] Top bar: coin pill with the rose-stamp coin, settings button with the rose cog, progress
      dashes
- [ ] Controls: paper buttons, Hint as the one seal-red filled action, icons from the Components
      board as inline SVG with CSS classes
- [ ] Hint sheet and settings sheet in paper; settings toggles keep their current behaviour; the
      play log stays one line
- [ ] Evidence: screenshots of every sheet in all three bands; 44 px targets measured

### 6. Scenery

- [ ] Background layer behind the DOM chrome: night with grain, the crescent moon, and the hills
      (dusk and moss ridges, dot texture, roses along the ridge, drifting firefly motes) behind
      the status card, positioned per band from `view/layout.ts`
- [ ] Motes drift only with motion on
- [ ] Evidence: tall, square and wide screenshots matching the canvas boards

### 7. Solve moment and motion pass

- [ ] Solve: bushes bloom in a ripple from the last firefly placed, petals and motes rise, then
      the existing auto-advance
- [ ] Walk the motion table in `docs/design/assets.md` row by row with motion on and off; add
      tests where the state layer can show it (e.g. reduced motion skips flights and blooms but
      every state change still lands)
- [ ] Performance: 60 fps check on a throttled profile with the largest launch board

### 7b. Level complete (restyle `ui/complete.ts`)

The card exists: garden, time and hints, a +10 chip, Garden map, and Next garden with a ring
counting down the auto-advance, plus a spark burst; it covers the status card so the board never
resizes, and the last garden shows no Next. Restyle it to the canvas board "Level complete":

- [ ] Paper card, "The garden is glowing" in Young Serif, the sub-line with garden, area and
      time, the coin badge with the rose-stamp coin, Garden map (paper, map icon) and Next garden
      (seal red, next arrow); the countdown becomes the thin seal-red bar (keep the ring if
      playtests prefer it), with "The next garden opens by itself in a moment."
- [ ] The spark burst becomes the solve moment from milestone 7 (bloom ripple, petals, motes)
- [ ] Behaviour unchanged: timing, hidden-tab and settings-sheet waits, last-garden rule
- [ ] Evidence: clips of solve to card to next garden, motion on and off, in all three bands

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
