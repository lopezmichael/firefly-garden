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

Every garden's stored tier (1 to 4, count-aware) as a word and leaves: Easy, Medium, Hard, Expert
(Michael, 2026-11-28: plain labels; leaves warm from moss and gold to amber and red). Shown on the complete card, the journal and the map; in play, small leaves beside the
garden title inside the status card's reserved height (measured, as `test/status.test.ts` does).

## Revision after playing the X marks (Michael, 2026-11-28, decided in conversation)

What playing #21 showed: a tap that lifts a firefly left an X, which is not a deduction the
player made; there was no deliberate way to place an X; asking for a hint took two taps; and most
hints pointed instead of crossing tiles out (in a hints-only run over the 50 played gardens, 348
pointed, 192 crossed, and most crosses were a single X).

Decisions:
1. **Tap is fireflies only; hold is the player's own X.** Holding a tile (320 ms) marks or clears
   an X, dragging on paints more, right-click and the X key do the same. The light preview once
   planned for press-and-hold is dropped. A one-time tip teaches the hold after the first hint
   that crosses tiles.
2. **Hints cross more, sized by the board.** A hint crosses everything the grader can rule out
   now (simplest first, any technique), up to 3 tiles up to 5×5, 4 up to 7×7, 6 above, never with
   a technique harder than the garden's own tier (an Easy garden never gets a lookahead X; without
   that limit 200 of 258 crossing hints led with a harder deduction than the next simple step).
   The status card shows the lead reason with its ring; tapping any X shows that X's own reason.
   It crosses only what it can explain from the board as it stands; when nothing can be ruled out
   it still points (pointing stays). In the hints-only run, crossing hints now carry 2.9 X on average.
3. **A wrong firefly comes off as an X:** the removal hint leaves a hint X on its tile.
4. **Three free hints per garden, then a video; coins only plant the map.** A hint is one tap
   while the free ones (or saved ones) last; then an optional video grants 3 more. Simulated
   (2026-11-28, 50 gardens): 2 free refused too many stuck players (7.6%); 5 left the video almost
   no role. With bigger hints, 3 free: 1.25% refused, 97.1% clear chapter 1, breathers 3.5%,
   busiest garden 26.2%, 77.1% finish all 50 (79.0% under the old coin economy).

## Order

- [x] Plan (this file) and the hint mock on the design canvas (with the X mark and its animation).
- [x] Journal. *Built 2026-11-28:* book button on the map header, a page per chapter, pressed sketches from each garden's own layout with its fireflies, unit and e2e tests. Follow-up: the history keeps only recent plays, so a page whose plays were trimmed shows a dash for time and hints; saving each chapter's totals when it finishes would keep them for good (a save field, validated).
- [x] Difficulty labels. *Built 2026-11-28:* leaves and the word beside the garden's place in the play header ("3 of 10"; the word drops on narrow phones), and under each garden in the journal. Not on the complete card (the header above it already shows the label, and the card's height must not change) or the map (a chapter mixes tiers).
- [x] Hints that rule out (core `hint`, reasons, game drawing, saves, simulation re-run). *Built 2026-11-28:* `hint` returns `remove`, `cross` (the first run of the grader's `empty` steps sharing a technique and reason cells, at most `HINT_CROSS_CAP` = 4) or `point` (the next step places a firefly, or the grader is stuck); `RULE_OUT_REASONS` next to `HINT_REASONS` (which now says what to look for), and a bush that wants none says so. The grader takes the hint's X marks as `startEmpty`. A repeated point on an unchanged board is shown again free. Saves keep hint X marks as groups (cells, technique, reason cells), validated: a hint X must be a non-answer path cell. The simulated players re-find, as the real hint does, the first empty steps still open on the board (not hint-crossed, not lit; the grader never reads the player's own marks) and point when nothing is left to rule out; a test holds them to the real hint (over the Rose Bed's 50 gardens, 632 and 535 of 653 positions agree on kind and on tiles). Every economy ratchet holds over those 50 gardens (0.65% refused, 96.4% clear chapter 1, breathers 3.5%, worst level 25.7%). A point whose reason is the firefly's own tile rings its row and column instead. Unit tests (groups, reasons, the cap, save validation and fuzz, the sim), e2e (a hint crossing tiles out, a pointing hint, the free repeat) and four caught mutations.
- [x] Player X marks. *Built 2026-11-28:* tap and Space cycle empty, firefly, X, empty (an empty jar sends an empty tile straight to X); undo and reset cover them; saved per garden and validated; the board draws them exactly like hint X marks (the coral X, a boop in, a puff of pollen out, instant under reduced motion). E2e: a player cycling a tile by taps, and the keyboard cycle.
- [x] Revision: hold for X, bigger hints sized by the board (never harder than the garden), a wrong firefly leaves an X, three free one-tap hints then a video, coins out of hints. *Built 2026-11-28:* core `hint` (`emptyOnly` grading, `hintCap`, `maxTier`, `parts`), the board's hold and drag, the one-tap hint button and video sheet, saves (`wrong` groups, up to 6 tiles), the simulation (`freeHints`, caps, tier limit) and the economy sweep; unit and e2e tests.
- [ ] Coins plant the map: mock, then build.

Each lands with tests, the two reviews (a security review where saves change) and a screenshot.
