# The home screen

Michael (2026-11-28): make a home screen that gets people invested: "crazy, exciting, cute",
"as magical as possible". Designed in the scratchpad painter over many rounds (the arch, Pip,
the friends, the meadow and the path weaving behind its folds), then brought into the game.

## Decisions (asked 2026-11-28)

1. **The art is baked offline, not painted at launch.** The painter (washes, brush ink, glows on
   a 2D canvas) takes about 400 ms for the scene on a desktop core, so 1.5 to 2 s on a mid phone,
   blocking the page. `npm run art:home` runs it once in headless Chromium and commits two WebP
   images and a manifest (about 180 KB together). The game never runs the painter. This is the
   one exception to "art is baked per size at runtime" (CLAUDE.md says so).
2. **Every player, every launch, opens on the home screen**, including the very first launch.
3. **First slice:** the scene and its living characters, a real caption, coins and working
   buttons, with a reduced-motion version. The first-launch intro and coin planting come later.

## How it is built

- `art/home/` holds the painter (`lib.js`, `pip.js`, `scene.js`) and the bake (`bake.js`): the
  still plate without anything that moves, and every moving part of Pip and the five friends
  painted alone in place, trimmed and packed into one atlas, with each part's offset and each
  joint's pivot in `home.json`. `scripts/bake-home.ts` runs it and writes
  `apps/game/src/assets/home/`.
- `view/home/rig.ts` reassembles a character on its joints and moves it (breathing, sway, head
  tilt and nod, wings, antennae, tassel, arms, blinks, wandering eyes, the odd grin);
  `view/home/cast.ts` says how each one moves; `view/home/scene.ts` is the PixiJS scene (the
  lantern's flicker, drifting fireflies, the friends, Pip, petals and hearts). Lights are one
  white glow texture tinted by colour tokens. A still scene (reduced motion) draws one frame
  and stops; nothing draws while the tab is hidden. The scene's WebGL context is let go when
  the home screen closes.
- `view/layout.ts` `homeFit`: a phone is covered edge to edge (a wider phone crops mostly the
  foreground under the buttons); a tablet or desktop shows the whole scene as a column whose
  edges melt into colour bands matching the painting; a short, wide screen (a phone on its
  side, a portal frame) splits: the arch, Pip and the friends beside a panel with the chrome.
- `state/home.ts` decides what Pip says and where the button goes: the first garden, back to an
  unfinished one, the map when a chapter's unlock flight is waiting or every garden glows, or
  the next garden. `ui/home.ts` lays the title, the caption (one bubble shape with its tail on
  Pip's mouth), the coins and the buttons over the scene.
- The map's "Welcome back" line is gone: the home screen welcomes.

## Order

- [x] Bake pipeline and assets (`npm run art:home`), tokens for the lights and the bands.
- [x] Rig, scene, layout (phone, column, split), home words, the screen and its wiring.
- [x] Tests: home words, the baked manifest, `homeFit`; e2e for the launch flow, journal and
  settings over home, reduced motion holding still, and the caption and buttons fitting at
  320 × 568, 390 × 844, 1280 × 720 and 844 × 390.
- [ ] A real-phone check of the frame rate (this container renders with SwiftShader).
- [ ] The first-launch intro (about 3 s, a tap skips it), kept short for portal time-to-play.
- [ ] Pip's lines from more events (a chapter's seal, a long absence, a hint-free streak).
- [ ] Friends tied to progress (one more lit friend per chapter), planting spots for coins
  (`2026-11-28-hints-coins-journal.md`, section 3).
- [ ] Polish noted in review: the lantern under the arch reads as a yellow egg; the arch's
  leaves and the bushes could sway; the friends' raised arms are small.
