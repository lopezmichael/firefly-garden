# Character exploration (design brief: `docs/design/brief-character.md`)

**Status:** draft, waiting for Michael's OK on the plan and his references.
**Branch:** `claude/inspiring-wright-0jb8lu`, from `develop` (Phase 2 and the jar are merged).
**Scope:** brief deliverables 1 to 5: references, style tiles, the pick, a full screen set, the
asset plan. Deliverable 6 (building it as a theme change) is a later plan, written once a
direction is chosen.

## What the build looks like today (phone, 390×844, chapter 1)

These are first-hand notes from the build, to check against the critiques:

- The board is a dark rounded tray filling the width. About 60 px of dead night sits between
  the tray and the status card, and the sky above the title is mostly empty. It reads as a grid on
  a tray, as the critiques said.
- The bushes are green blobs with a Fredoka number and ring dots. They read clearly and the
  dots that fill work well. Keep the information; redraw the object.
- Lit tiles are flat saturated yellow with a darker front edge. They are the most vivid thing on
  screen, which is right, but they have no surface. The firefly's face is the most charming thing
  in the game.
- The jar is a small icon inside a dark card, so the status card reads as an app panel. The slot
  row works.
- Undo, Reset and Hint are three equal outlined buttons in a row, which is app chrome. The hint
  sheet is a standard bottom sheet.
- The wide band (controls beside the board) already has a better balance than tall.
- There is no sound yet, though settings has a sound toggle. Sound direction is in scope here.

## Phases and checkpoints

Each checkpoint is a stop: I show the work and wait.

### 1. References (now)

- [x] **Michael's references first.** Hunting list: `docs/design/reference-sources.md`.
      Michael's picks (2026-11-12), all board games: **Arboretum, Kanagawa, Photosynthesis, Root,
      Lanterns: The Harvest Festival, Parks.** Proposed reading of them, waiting for his OK:
  - Ink and wash (direction 1, from Kanagawa and Arboretum): cream paper, ink line, controlled
    washes and seal stamps, instead of loose wet watercolour
  - Stand-up diorama (direction 2, from Photosynthesis): bushes as stand-up card pieces whose
    shadows react to firefly light
  - Night print (direction 3, from Parks, Lanterns and Root): screenprint with a few inks plus gold,
    print grain and bold silhouettes, instead of heavy woodcut gouges
- [ ] Gather a moodboard per direction, 10 to 15 images each, covering four things: a palette
      and light, surface and material, how creatures, plants and objects are drawn, and game UI
      that treats the interface as part of the world.
- [ ] Source rules for the moodboard:
  - Public domain and CC0 works (Rackham, Dulac, Nielsen, Potter; Hiroshige and Hokusai from
    the Rijksmuseum and the Met; BHL botanical and insect plates) are downloaded and placed on the
    canvas with credit and link.
  - Copyrighted work (game screenshots, contemporary illustrators) is **linked, not copied**:
    a card with title, link and one line on what to take from it. It is for feel only and never
    ends up in the build.
- [x] Put the boards on a **new design canvas, "Firefly Garden · Character"**:
      https://claude.ai/artifact/JYTEsJmpHaWKATru6UMvDG . A start board, then one reference board
      per direction (Michael's picks, public-domain companions, take and avoid, a code sketch and
      a first palette guess); the phase 2 canvas stays as the locked baseline.
- [ ] For each direction, write one paragraph naming what it takes from the references and
      what it avoids.
- [ ] **Checkpoint A:** Michael reacts (more of this, none of that) and adds his own references.

### 2. Technique spike (scratch only, nothing in the repo)

The style tiles should be drawn with the techniques we would actually ship, so we judge what's
really buildable and not a painting we can't reproduce. A short spike in the scratchpad:

- [ ] Procedural textures to canvas: paper grain and a wet-edge wash (watercolor), a fibrous
      card edge with a cast shadow (papercraft), and gouge marks with an ink-roller texture
      (woodcut). Each is checked for generation time at startup and for 60 fps on a throttled
      CPU in Pixi.
- [ ] A synthesized sound sketch per direction using WebAudio: place, call back, a bush
      satisfied, solve, an empty-jar shake, and an optional ambient bed. Each direction gets a
      different instrument family, for example glass and soft bells for watercolor, wooden and
      paper taps for papercraft, a koto-like plucked string and wood block for woodcut.

### 3. Style tiles, one per direction (canvas row 2)

- [x] Drafted 2026-11-12, after studying Michael's 19 screenshots: TileInk, TileDiorama and
      TilePrint on the character canvas, all showing the same game state so only the look differs.
      Contrast checked per tile. The sound audition pages come after the pick, for the chosen
      direction (or the two finalists) only, so sound effort isn't spent on a direction that loses.

Contents, from the brief: a palette with names, the type pairing, a tile (dark and lit), a bush
(wanting, happy, too many), a player firefly and a hint firefly (the hint shown by shape: ring
plus mark), the jar with its slots, one button, one sheet, and one full tall-phone play screen.

- [ ] Each tile also notes contrast results (text at 4.5:1 or better), what reduced motion keeps,
      and the 44 px targets drawn to scale.
- [ ] Each tile gets a small **sound audition page** (an artifact page with play buttons). The
      canvas format isn't built for audio.
- [ ] Fonts: OFL or similar only, self-hosted later. Two candidates per direction, chosen once
      the references are agreed, so they come from the look and not the other way round.
- [x] Round 2 (2026-11-12), from Michael's feedback: finalists ink and wash and night print; the
      diorama is parked but lends its paper lantern jar and its fibre-card empty tiles. Both
      finalists get 2.5D fireflies, light that flows out along row and column as beams with
      sparkles instead of filling whole tiles (lit tiles still change visibly), roses on a happy
      bush and a wilt for too many. Boards R2Ink and R2Print on the canvas.
- [x] Round 3 (2026-11-12). **Decided (Michael):** ink and wash is the main style; it takes the
      night print paper lantern jar (in ink colours) and printed-style hills behind the status card
      (Michael asked for them, so this scenery is approved). Round 2's fireflies read as bees and
      too large: three slimmer, smaller firefly variants (A slim, B slim with a face, C mostly
      light), B on the board. Roses moved inside the bush. Light: back to filling the whole tile,
      improved (paper card with a 2.5D edge, brush grain along the light, a bright lane, bloom
      under each firefly); the round 2 flow is kept only as the spreading animation. Board R3Ink.
- [x] Round 4 (2026-11-12). **Decided (Michael):** firefly C (mostly light) is the one; refined
      with lantern-rib lines on the tail, wing veins and curled antennae, and animated (wing flap
      about twice a second, a 3 px bob over 2.4 s with a breathing shadow and glow; still under
      reduced motion). Hills lose the pines and gain small roses plus drifting firefly lights.
      Directional strokes in lit tiles are out; four calmer lit-tile options (A pooled wash, B
      dimmer with distance, C each tile glows, D rim light), A on the board. Board R4Ink.
- [x] **Locked (Michael, 2026-11-12):** firefly C as refined and animated in round 4; lit tiles
      are A + C (pooled wash with a soft warm centre in each tile). Roses: one rose in variations
      (three shades, a bud of it, one with a leaf, each turned and sized differently); each happy
      bush picks three by board position so a garden always looks the same. Hint marker: the
      ground ring sat too close to the tile's bottom edge; options A (dashed halo at body height
      plus the small seal), B (bigger corner seal), C (red knot on the tail); **Michael chose A.**
- [x] **Checkpoint B passed (2026-11-12):** ink and wash, as locked across rounds 3 and 4, is the
      direction. Rounds 1 to 4 stay on the canvas as history.
- [x] **Checkpoint B:** Michael picks a direction or a blend.

### 3b. Design elements in the locked style

- [x] Components board (2026-11-12): every remaining board state (conflict, too many, ruled
      out, lit twice, no-number bush, wants-none bush, hint reason outline, solve moment) and the
      icon set (undo, reset, hint, settings, sound on/off, map, next, close, locked, motion, play
      log) plus the coin, all in ink line on a 24 px grid. Reviewed: reset arrowhead realigned,
      conflict fireflies softened from "electric" to worried (shiver lines, slow sway).

- [x] Screens in ink and wash (2026-11-12): garden map, level complete (the board's real unique
      solution, all bushes blooming), hint sheet and settings with play log. Same contents and
      copy as the Phase 2 baseline; the play log stays one line (look pass 1 decision).

### 4. Full screen set, chosen direction (canvas row 3)

- [ ] Play in all three bands: tall (390×844), square (iPhone Duo inner, 626×890) and wide
      (844×390 and Duo landscape).
- [ ] The hint sheet, level complete, the garden map, and settings with the play log.
- [ ] The state sheet: every tile, bush and firefly state, plus the motion table (what reduced
      motion keeps and what it drops), mirroring the phase 2 `States` board.
- [ ] A motion note: timings and easing for drop, bob, light ripple, motes, bloom and the jar
      flight, in the direction's own character.
- [ ] Copy voice: a short voice note and a pass over the existing strings (wording only, same
      places).
- [ ] **Checkpoint C:** Michael signs off the set.

### 5. Asset plan (`docs/design/assets.md`)

- [ ] Every asset: what it is, how it's made (code / procedural / drawn by Michael / sourced),
      source and licence if sourced, format, size budget, and which seam it goes in
      (`theme.css`, `view/theme.ts`, the board's texture builders, `ui/`).
- [ ] A painting kit for Michael: what to paint, at what size, on what paper or brush, how to
      scan or export, and how a swatch becomes a tileable texture.
- [ ] A bundle budget table against the 8 MB Poki limit (today about 1.1 MB).
- [ ] A licence log, started in phase 1 and kept for every sourced file (moodboard sources
      included, marked "reference only").
- [ ] **Checkpoint D:** sign-off, then a separate implementation plan for deliverable 6.

## Structure

Nothing is planned to change. Two things the directions will push on; I'll raise them as
proposals with a mockup and wait:

1. **Scenery in the empty space on tall phones.** Hedges, a path or a pond edge drawn around
   the board, behind it, without moving the board, the status card or the controls. I think this
   is look, not structure, because nothing moves. The README listed "filling the empty sky" under
   structure, so I'll treat it as needing a yes.
2. **Chrome as garden objects.** For example, the status card as a painted sign, a paper card or
   a carved plaque, and the buttons as stones or tags. The places, labels and 44 px targets stay;
   only the drawing changes. Look only, unless a direction wants to move something.

## How we work on this

- Reviews: the canvas and docs are design work. The two-reviewer pass (correctness and security)
  applies when the asset plan and any licence log are committed, and fully at implementation.
- Commits only when Michael asks: the plan, the reference log and `assets.md` are the repo
  artefacts. Canvas work lives on the canvas.
- Subagents, if used for reference gathering (one per direction, in parallel), get a standalone
  brief and an explicit model.
