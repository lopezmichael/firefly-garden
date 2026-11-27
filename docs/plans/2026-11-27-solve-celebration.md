# Solve celebration and luminous light

Michael (2026-11-27): the win moment's glow "is really basic and kinda ugly". Before: lit tiles
are flat gold cards, the firefly's own glow vanishes on them, and a solve only pops three small
roses per bush while the complete card appears at once and pulls the eye. Chosen direction
(asked 2026-11-27): **sync flash + release**, and **rework the in-play lit tile too**.

Rules this keeps: art baked per size with 2D canvas (`view/art/`), no live filters (glow is
additive-blended baked sprites), colours from tokens only, every moment has a reduced-motion path
that lands the state, a still board draws no frames, the status/complete card heights do not move.

## Lit tiles (in play)

- [x] Lit tile reads as paper lit from within: a luminous warm-white centre, gold only toward the
      pooled edge, lighter grain. One drawing per look.
- ~~Light spills past the card: a soft additive halo under each lit tile.~~ Tried and dropped
      2026-11-27: the gaps between tiles are narrow strips, so any spill read as yellow or muddy
      grey stripes. The halo at the solve glows round the board's outer edge only (its middle is
      cut out).
- [x] A firefly's glow is additive, so the tile it sits on is the brightest (the light's source).
- [x] Tiles lit by two or more beams are a touch brighter (`lightCounts`, from the 2026-11-12
      feedback: crossing reads as fine).

## The solve (motion on), times after the last firefly lands

- [x] 0.1–1.0 s: every firefly flashes together twice (real fireflies synchronise); a warm halo
      swells behind the whole board and settles into an afterglow that stays.
- [x] 0.3 s: a soft wave of light rolls across the lit tiles in rings from the last firefly
      (kept gentle: a strong one whited out the tiles and the fireflies on them).
- [x] 0.5 s: roses ripple open (as before). Petals burst from the roses and tumble down under
      gravity, turning over; sparks (a hard warm core, additive) rise from the leaves and twinkle
      out. Michael, same day: the old motes were milky smudges over the leaves and the petals rose
      in a stiff row.
- [x] 1.1 s: the fireflies lift off one by one and drift up into the night with fading gold
      trails; the garden keeps glowing without them.
- [x] 1.5 s: the complete card rises in (counted from the landing, so after the jar flight);
      the next garden opens 3 s after that.

Reduced motion: no flash, wave or flight; the roses, the afterglow and the card land at once and
the fireflies stay on their tiles.

## Checks

- [x] Unit tests for the new timing helpers; typecheck; build; bundle.
- [x] e2e smoke still passes (complete card, still board, keyboard Next), and checks the card is
      inert until its entrance (a mutation making it tappable fails the test).
- [x] Reviews (correctness, security): halo texture leak on same-cell relayouts, the inert card,
      a re-armed advance honouring the card's wait, releases landing on a mid-celebration
      rebuild, the ticker stopping with no halo, reduced motion keeping fireflies. All fixed.
- [x] Frames of the new sequence at 390 × 844, and a reduced-motion still.
- [x] CHANGELOG, `docs/design/assets.md` motion table.
