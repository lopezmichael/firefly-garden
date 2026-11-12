# Phase 2 design baseline

The "Firefly Garden Phase 2 Design" canvas (claude.ai artifact, private):
https://claude.ai/artifact/4qpwUFQiM1daNKeHPWkuf7

Approved by Michael on 2026-11-12 as the **Phase 2 baseline**: the structure and
behaviour are locked, the look is not.

**Locked** (change only with a reason and a note in the Phase 2 plan):

- What each screen holds and where: top bar, board, status card, controls; tall,
  near-square (iPhone Duo, tablets) and wide layouts
- Every tile and bush state, and that hint fireflies differ by shape (ring and sparkle),
  not only color
- The hint flow: sheet, locked fireflies, dashed reason outlines, ruled-out marks
- The screen flow: map → play → complete → auto-advance; settings and play log
- What reduced motion keeps and drops (the motion table on the state sheet)

**Open** (expected to change, cheaply, through `apps/game/src/theme.css` tokens):

- Sprites, textures, exact colors, the map illustration (painted art pass, Phase 4)
- Animation timings and particle counts (tuned on device)
- Copy wording (tested in the friends playtest)

`project/` holds source copies of the canvas files (`canvas.json` and one `.dc.html` per
artboard). They are reference only; the game does not load them. If the canvas changes,
re-read it and refresh these copies in the same commit.
