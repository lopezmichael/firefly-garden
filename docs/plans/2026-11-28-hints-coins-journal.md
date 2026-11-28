# Hints that rule out, coins worth earning, the journal and difficulty labels

Michael (2026-11-28), after the playtest release (#14):
- a hint dropping a firefly straight onto the answer "doesn't feel as rewarding" as crossing
  squares out;
- coins pile up and feel useless;
- yes to the journal (book button on the map header; pressed gardens show their fireflies), to
  difficulty labels on every garden, and to the player's own X marks;
- no per-garden hint limit or fail state (the rewards plan's reasons stand).

The data agrees about coins: in the shipped economy (`reports/dash/economy.json`, key `60-10-30`)
a simulated casual player ends on about 370 coins, 99.7% of hints are paid with coins and the
rewarded hint ad is watched 0.0015 times per player. Coins buy nothing, and the ad never shows.

## Decisions (asked 2026-11-28)

1. **Hints only ever rule tiles out.** A hint puts X marks on tiles that can't hold a firefly,
   several at once when one reason covers them, and says why ("This bush already has all its
   fireflies, so the tiles around it stay dark"). It never places a firefly. Tapping a hint X
   shows its reason again (Michael's reference: hints in the style of Meowdoku, which explain why a
   space doesn't work).
2. **Coins plant the garden map** (decided 2026-11-28, after Michael questioned a cosmetics shop:
   would it make the game better, or keep people playing?). Coins buy plants, lanterns and
   fixtures placed in the map's areas, so the world fills in as you play (section 3).
3. **One X for hints and the player's own marks** (as Meowdoku does): hand-drawn, soft and cute,
   with an animation for adding and lifting (canvas: "The X mark").

## 1. Hints that rule out (core, game, simulation)

What a hint does, in order:
- A wrong firefly of the player's still comes off first, with its reason (removing is not placing;
  a full jar of wrong fireflies must still be helpable).
- Otherwise the grader runs from the board as the player sees it (their fireflies plus every X,
  theirs and the hint's) and the hint is the first group of `empty` steps that share a technique
  and a reason cell (for example all the open neighbours of a satisfied bush): every cell in it
  gets a hint X. Capped (about 4) so one hint never clears half the board.
- If the next deduction is a placement with nothing to rule out (the T1-needs-all and
  T2-one-source steps, about 45% of today's place hints), the hint points instead: it highlights
  the bush or dark tile the step is about and says what to look for ("This dark tile can only be
  lit from one spot. Which?"). Still no firefly.
- Never stuck: if the grader has nothing from that position, the hint points at an answer cell's
  bush or row as today's "Try a firefly here" fallback does, without placing.

Reasons get a "ruling out" wording per technique (`HINT_REASONS` today explains placements).
Hint X marks are locked like hint fireflies were (undo and reset keep them; the player paid). They
look exactly like the player's own X (one hand-drawn coral X in two soft strokes that lands with a
small boop and lifts away with a puff of pollen; reduced motion: it appears and goes). The ring on
the reason cell and the status card say which tiles the hint crossed. They are saved and validated (a hint X must be a non-answer path
cell). The `hint` event's `step` keeps pointing at the grader step it revealed.

The simulated players (`packages/core/src/players.ts`) model a hint as a placed firefly today;
they must model a ruled-out group instead (weaker help per hint, so more hints per stuck spot).
Re-run the economy and hold every ratchet: at most 5% of hint requests refused, 95% clear
chapter 1, breathers under 5% hint use, no level over 40%.

## 2. The player's own X marks

Tapping cycles a tile: empty, firefly, X, empty. Free, never checked, never a move the game
judges; undo covers them; saved per garden and validated. The grader in a hint reads only the
hint's X marks (a player's X could be wrong). Keyboard: the same toggle cycles. This takes the
tap gesture; press-and-hold stays free for the light preview.

## 3. Coins plant the garden map

Coins buy plants, lanterns and fixtures for the map's areas (a rose arch, a lantern by the path, a
pond, a bridge), placed at fixed spots in each area so the world fills in as you play. It is the
theme, it is seen between every chapter, and a half-planted area is a reason to come back. Each
area offers its own set; an area's last piece could complete it with a small flourish. Prices come
from the simulation so a player who never hints plants an area's set by about the end of its
chapters, and hints stay affordable. Planted pieces are saved and validated (known ids only).
Mock on the canvas first (an area before and after planting, and the planting sheet).

Superseded idea, kept for the record (a cosmetics shop):

Mock first on the canvas (firefly colours as baked variants of firefly C; lantern styles for the
status card's jar). Prices set from the simulation so a player who never hints can buy the first
item around the end of chapter 2 and every item by the end of the build. Owned and worn items are
saved and validated (known ids only). Rewarded ads stay optional; "try a colour for a day after an
ad" is the rewards plan's later idea, not this step.

## 4. The journal (mocked 2026-11-27: canvas "Garden journal: a page per chapter")

Book button on the map header; opens on the current chapter; a page per chapter with its seal,
line, totals and a pressed sketch of each grown garden (its layout with the fireflies). Dark
chapters can't be opened. Reduced motion: pages swap without the turn.

## 5. Difficulty labels

Every garden's stored tier (1 to 4, count-aware) as a word and leaves: Gentle, Steady, Tricky,
Thorny. Shown on the complete card, the journal and the map; in play, small leaves beside the
garden title inside the status card's reserved height (measured, as `test/status.test.ts` does).

## Order

- [x] Plan (this file) and the hint mock on the design canvas (with the X mark and its animation).
- [x] Journal. *Built 2026-11-28:* book button on the map header, a page per chapter, pressed sketches from each garden's own layout with its fireflies, unit and e2e tests. Follow-up: the history keeps only recent plays, so a page whose plays were trimmed shows a dash for time and hints; saving each chapter's totals when it finishes would keep them for good (a save field, validated).
- [ ] Difficulty labels.
- [ ] Hints that rule out (core `hint`, reasons, game drawing, saves, simulation re-run).
- [ ] Player X marks.
- [ ] Coins plant the map: mock, then build.

Each lands with tests, the two reviews (a security review where saves change) and a screenshot.
