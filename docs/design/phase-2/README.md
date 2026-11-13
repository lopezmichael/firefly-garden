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

## Look pass 2: ink and wash (2026-11-13)

The open half is now the ink and wash look, chosen in the character exploration
(`docs/plans/2026-11-12-character-exploration.md`) and built in
`docs/plans/2026-11-12-ink-wash-theme.md`; tokens, fonts, assets and the motion table are in
`docs/design/assets.md`, the source of truth is the "Firefly Garden · Character" canvas. The
locked half holds, with three decided changes: the board's tilt and tray are gone (tiles sit on
the night with a front edge), and the copy reads "A bush blooms when all its dots are gold."
Look pass 1 below is superseded.

## Look pass 1 (2026-11-12)

The first iteration on the open half, from an Impeccable and a Taste Skill critique (both
applied as read-only rubrics). Structure is unchanged. Applied to the build and to every
canvas artboard (canvas version "Look pass 1"), so the two match again.

- Night and panel tokens moved from navy to the brief's teal and plum; secondary text is tinted, not grey
- Glow only on the board and fireflies: no halos on the title, dots, progress bar or buttons
- One filled gold action per view: Hint is outlined and dims once a garden is solved
- Sentence-case labels; the chapter label reads "Garden 1 of 10" (the title already names the bed)
- Sheet numbers as one line ("70 coins · no saved hints") instead of stat tiles; body text 15 px
- A satisfied bush's number turns full gold (it was invisible); lilac petals became cream
- The four-point sparkle became the game's own mark, a firefly light with a short trail; the Hint
  button uses a firefly icon; the moon is a crescent placed clear of the board in every band
- Copy: "Use a hint" (was "Need a nudge?"), "A bush is done when all its dots are gold.", hint
  sub-lines show progress instead of repeating "locked in place", fewer exclamation marks

Not taken yet (structure, needs Michael): filling the empty sky on tall phones, keeping the wide
band's controls beside the board, moving the chapter label under the title.

## Firefly jar proposal (2026-11-12)

Michael chose to show each garden's firefly count (option 1 of the count experiment: every level
is graded count-aware). Canvas row 3 holds the proposal: a playable phone with the jar in the
status card (tap to release a firefly, which flies out of the jar to the tile; tap a firefly to
call it back) and a storyboard with the release timing, the jar's states and two open decisions:
whether the jar caps placements (recommended) and where the jar lives (status card proposed, top
bar the alternative). Both change the locked layout and wait for Michael's sign-off.

**Decided (Michael, 2026-11-12):** the jar caps placements (no more fireflies than it holds; a tap
with an empty jar shakes it and places nothing), and it lives in the status card. Open: how the
count reads at a glance. The jar's dots can't be counted past about four, so the canvas board
"how to show the count" compares A (jar with a number), B (jar plus a row of one slot per firefly,
recommended) and C (a lantern tube: the slot row as the container).
