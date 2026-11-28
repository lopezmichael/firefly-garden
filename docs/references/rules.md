# Rules and level format

The precise rules the core implements. If this file and the code disagree,
that is a bug in one of them; fix it and add a test.

## Board

A level is a `w × h` grid. The **mask** marks which cells are in the garden
(`#`) and which are outside it (`.`). Outside cells behave exactly like the
board edge: light stops there and they hold nothing. Ponds are mask holes.

Every active cell is one of:

| Cell | Holds a firefly? | Blocks light? | Clue? |
| --- | --- | --- | --- |
| Path tile | Yes | No | |
| Moonlit tile (twist) | Yes | No | Starts lit; never needs covering |
| Lantern (twist) | Already has one, fixed | No | |
| Bush | No | Yes | A number 0 to 8, or hidden (`null`) |
| Mushroom (twist) | No | Yes | A number 0 to 4, counting only its 4 side neighbors |

## Rules

1. A firefly lights its own tile and every tile along its row and column until
   a blocker, an outside cell or the edge stops the light.
2. Two fireflies may not see each other along a row or column (lanterns included).
3. A numbered bush wants exactly that many fireflies among its **8** surrounding
   tiles, diagonals included. (Standard Akari counts only the 4 orthogonal tiles.)
   A mushroom wants exactly its number among its **4** side tiles (up, down,
   left, right); diagonals do not count.
4. Solved: every path tile that is not moonlit is lit, no two fireflies see each
   other, and every numbered bush has exactly its number.

Fireflies may sit on moonlit tiles. Hidden bushes impose no count.

**Design note.** Mushrooms read differently from bushes on purpose: the same
tile can count for a bush (diagonal) and not for a mushroom. The art must make
each one's counting area obvious (for example, a mushroom's glow shaped like a
plus sign). A plain blocker with no number plays exactly like a hidden bush,
which is why the original mushroom was replaced (see below); if scenery such as
rocks is wanted later, it is a skin for a hidden bush, not a new rule.

## Level file

```json
{"id": "c02-l07", "area": "koi-pond", "w": 9, "h": 5, "tier": 2, "score": 22,
 "mask": ["#########", "###...###", "###...###", "###...###", "#########"],
 "bushes": [[0, 4, 0], [2, 1, 2], [2, 7, 2], [4, 4, null]],
 "twists": {"moonlit": [[0, 8]]},
 "solution": [[0, 0], [1, 1], [3, 1], [4, 2], [0, 6], [1, 7], [3, 7], [4, 8]],
 "techniques": ["T1", "T2"]}
```

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | Unique, non-empty |
| `area` | | Garden area this board belongs to |
| `w`, `h` | Yes | 1 to 32 |
| `mask` | Yes | `h` strings of `w` chars, `#` or `.` |
| `bushes` | Yes | `[row, col, clue]`, clue 0 to 8 or `null` (hidden) |
| `twists` | | `mushrooms`: `[row, col, n]` with n 0 to 4; `moonlit`, `lanterns`: `[row, col]`. Unknown keys are rejected |
| `solution` | | Every firefly in the answer, **lanterns included** |
| `tier`, `score`, `techniques` | | Written by the grader, count-aware (see below) |
| `seconds` | | Estimated solve time, whole seconds 1 to 3600 (`measure`); written by the generator, checked against a fresh grade in CI. The game feeds it to the next-level policy |

Validation (`parseLevel`) rejects unknown keys, off-board or outside-mask
coordinates, two things on one cell (including a lantern on a moonlit tile),
clues outside 0 to 8 (0 to 4 for mushrooms), and solutions that sit on blockers, repeat a cell, or
omit a lantern. Coordinates are `[row, col]` with row 0 at the top.

**Grading is count-aware (decided 2026-11-12).** The game shows how many fireflies each
garden needs (the firefly jar) (the "firefly jar" countdown), so every shipped level is graded as players
experience it: `gradeLevel(level, board)`, which is `grade` with `knownCount` set to the
length of `solution` (lanterns included). That enables the count techniques
(T1 count complete, T3 count bound). The generator (clue removal and tier targeting), the
stored `tier`/`score`/`techniques`/`seconds`, the ramp builder's inputs, the simulated
players and the level ratchets all use it. Plain `grade(board)` stays the count-free
default for other callers. Evidence: `reports/archive/count-experiment-2026-11-12.json`
(the experiment) and `reports/archive/count-aware-pack-2026-11-12.json` (the regenerated pack).

Levels are stored in one canonical orientation. `transformLevel` gives any of
the 8 rotations/mirrors; the rules are symmetric, so the solution count never
changes.

## Mushroom redesign (decided 2026-11-12)

The original mushroom (blocks light, no number) played exactly like a hidden
bush. Phase 1 compared it with a "toadstool" (needs light, no firefly may
land) and a "sporecap" (a 4-neighbor numbered blocker) on the same 40 seeds.
The sporecap took part in 33% of deduction steps, the toadstool in 2%, so the
sporecap became the mushroom. Data: `reports/archive/mushroom-experiment-2026-11-12.json`.

## Hints

A hint is the grader's next step on the player's current board, and it never places a firefly
(decided 2026-11-28, plan `docs/plans/2026-11-28-hints-coins-journal.md`): it removes one wrong
firefly (leaving a hint X on its tile), crosses out tiles that can't hold one, or points at
what to look at, always with a one-line reason per X.

**Free hints (decided 2026-11-28).** Each garden starts with **3 free hints**
(`PLAYER_CONFIG.economy.freeHints`), and a hint is one tap: no sheet, no price. They are counted per
garden board, not per play: a quit board resumed as a retry starts its own counters but keeps its
free hints used (`CurrentPlay.priorHints`), so leaving and coming back never refills them. Once they are
used, hints saved from an earlier video come next; after that the Hint button offers an optional
rewarded video for **3 more** (one used now, two saved). Coins never buy hints: they only plant the
garden map. Where the platform has no rewarded ads, the card says the garden's hints are used.
The button shows the free hints left ("Hint · 3"), then saved ones ("2 saved"), then a video mark.

**Presentation.** A hint's X marks are locked: the player cannot remove them, and undo and reset
keep them (a paid hint is never lost). They look exactly like the player's own X (one hand-drawn
coral X in two soft strokes that lands with a small boop and lifts away with a puff of pollen;
under reduced motion it appears and goes). A ring goes round the hint's reason cells and the
status card gives the reason; tapping a hint X shows its reason again. A "fix a wrong firefly"
hint flies the wrong firefly home to the jar so the player sees what changed.

**As implemented (`packages/core/src/hints.ts`).** `hint(board, solution, placed, locked, crossed)`:

1. Any player firefly that is not in the solution is removed first: one that sees another
   firefly ("This firefly can see another one."), else one that gives a bush too many
   ("This firefly gives a bush too many."), else the lowest such cell ("This firefly can't
   be part of the answer.").
2. Otherwise the grader runs from the current position
   (`grade(board, { start, startEmpty: crossed, stopAtFirefly, knownCount })`, with the count
   shown on the jar, the solution's size, as the level was rated). Every firefly on the board is
   then part of the answer and every hint X is outside it, so its deductions are sound. The
   player's own X marks are never passed: they may be wrong.
   - **Cross (before pointing):** the grader runs again ruling tiles out only
     (`GradeOptions.emptyOnly`), simplest technique first, and the hint crosses every tile it
     reaches, up to the board's cap (`hintCap`: 3 up to 5×5, 4 up to 7×7, 6 above; bigger gardens
     get bigger hints) and never with a technique harder than the garden's own tier (or than the
     next step, if that is harder still; `HintOptions.maxTier`), so an Easy garden never gets a
     lookahead X. Every tile gets a hint X. The tiles split into `parts`, one per technique and
     reason cells, each with its own line (`RULE_OUT_REASONS`, `{tiles}` read as "this tile" or
     "these tiles"; a satisfied bush that wants none says so); a later part may rest on an earlier
     part's X marks. The status card shows the lead part's line and rings its reason cells together
     with its X marks (so "this tile" in the line is the ringed one); tapping any X shows its own
     part's line and ring. Answer cells are filtered out (defense in depth).
   - **Point:** if nothing can be ruled out and the next step places a firefly, the hint rings
     the step's reason cells (the bush, the dark tile, two overlapping bushes) and says what to look
     for. When the reason is the firefly's own tile (lookahead and trial, or a dark tile only it can
     light), ringing it alone would all but place the firefly, so the ring takes its whole row and
     column (a tile boxed in on every side is ringed alone: it can only light itself) (`HINT_REASONS`, e.g. "This dark tile can only be lit
     from one spot. Which?"). `target`, the firefly cell, is for analytics only and never shown.
     Asking again on an unchanged position (fireflies and hint X marks) shows the same point free
     (`Play.repeatsPoint`).
   A property test checks, on every played, reserve and twisted board, that each cross stays within
   the cap and the garden's tier and that each part reads true on the visible board (fireflies, the
   tiles they light, earlier hint X marks, the hint's earlier parts): a
   satisfied bush really has its number, no way to seat a bush's fireflies uses a bush-room tile,
   a count bound's needs are disjoint and use up the jar exactly; and that each T1-needs-all and
   T2-one-source point reads true the same way.
3. If the grader is stuck from that position, the hint still points: at a numbered bush next to
   the lowest missing answer firefly, else at that firefly's run of tiles along its row (never the
   tile alone). On every chapter 1 to 3 and reserve level this never happened in the property test.
4. A solved board gets `none`.

The player's cells passed to `hint` come from saved progress and must be validated first:
integers in 0..w*h-1 on path cells, no repeats, at most w*h. If that fails, drop the level's
placed set and keep only the valid locked cells and hint X marks.

Locked cells (hint fireflies from saves made before 2026-11-28): `canPlace(board, cell, locked)`
refuses them, `evaluate` counts them like any firefly, and `hint` throws if a locked cell is not a
solution cell. `hint` also throws if a hint X is a solution cell or not a path cell (saves are
validated before this point). For analytics, `hintStep(grade, hintCell(h))` is the index in the
level's full grader trace (`gradeLevel(level, board)`, the count-aware trace the level was rated
with) of the step that decides the hinted cell (the removed firefly, the first crossed tile, or a
point's target).

**The player's own X marks (revised 2026-11-28).** A tap places or lifts a firefly and never
leaves an X (lifting a firefly is not a deduction). **Holding** a tile for 320 ms (`HOLD_MS`)
marks it with the player's own X, or clears one; a firefly there goes home first. Dragging on
after a hold paints the same change over every tile passed (fireflies and hint X marks are passed
over). On desktop, right-click does what a hold does; on the keyboard, X does (Space places or
lifts a firefly). A tap on the player's own X clears it. An X is free, never judged and takes
nothing from the jar; undo covers it, reset clears it with the player's fireflies, and it is saved
per garden. Tapping a hint X shows its reason instead; a hint that crosses a tile the player had
marked takes the X over (locked) and drops the player's undo steps on that tile. After the first
hint that crosses tiles, the player's next move shows a one-time tip: "Hold a tile to mark it with
an X." (The light preview once planned for press-and-hold is dropped.)

**Simulated players (`players.ts`, `simHintGroup`).** A stuck player's hint crosses out, in trace
order, the empty steps still open on the board (not crossed by a hint and not lit by a firefly
already down, `SimStep.litAt`), up to the level's cap (`SimLevel.hintCap`) and its tier, looking
past at most the next two fireflies still to place. The grader never reads the player's own marks,
so those may be tiles the player worked out long ago, and they stay stuck and ask again. When
nothing is open, the hint points and the player finds it (`pointedTimeFactor`). Hints are free up
to `freeHints` a play, then saved, then a video (each profile's `adWillingness`), else refused.
`tests/economy.test.ts` holds the model to the real `hint`: from every step of every played garden
the two agree on crossing versus pointing at least 95% of the time (626 of 653 over the Rose Bed on
2026-11-28; the exact tiles match less often, 313, since the real grader orders deductions from the
real position). Economy guardrails (`tests/economy.test.ts`) hold with this model.

**The firefly jar (Phase 2, milestone 3).** The game shows how many fireflies the garden needs:
the jar holds the answer's count minus its lanterns (which are already on the board). Player and
locked hint fireflies together never exceed it: a tap with an empty jar places nothing, undo
brings back only what fits, and a saved board holding more than the jar is dropped on load.
A full but wrong jar always gets a removal hint first, so hints never overfill it.

**Quitting and parked boards (Phase 2, milestone 3).** Leaving a level for the garden map ends
the play as a quit, unless the board is untouched (no placement, undo, reset or hint): then it
just waits behind the map and Continue returns to it. A quit main-path level's board is parked in
the save (up to five, oldest dropped), validated on load exactly like the current board, and
resumed when the policy serves that level as a retry; the retry keeps the fireflies but starts
its own counters. A quit detour is never served again, so its board is not parked.

**Rules for the game build (from the Phase 1 security review):**
- Saved progress stores the hint X marks per level (as groups: cells, technique or `wrong` for a
  lifted wrong firefly's single tile, reason cells),
  any old locked hint fireflies, the player's own X marks and the banked hint count, and a load
  validates them like `parseLevel` does: a hint X must be a path cell outside the level's unique
  solution, in one group of 1 to 6 tiles (`HINT_CROSS_MAX`) with a known technique (the reason's words come from the
  technique, never from the save); a locked cell must be a cell of the solution; a player firefly
  or X must sit on a free path tile (not a lantern, locked cell or hint X); the bank is a small
  non-negative integer. Any bad tile drops that whole set. A corrupt or edited save must never put
  a hint X on an answer tile, lock wrong cells or grant unlimited hints.
- Undo and reset never remove a hint X or a locked hint firefly; a paid hint is never lost.
- Hints, and the chapter card's bonus double, are credited only after
  `Platform.showRewarded()` resolves `true` (the ad finished). A failed, skipped or rejected ad
  credits nothing and charges nothing. Nothing on the chapter card can start the next garden
  while its ad plays.
- Phase 3: a portal adapter must resolve `showRewarded()` (false on a timeout) rather than hang;
  the game blocks play while an ad is up, so an ad that never resolves would freeze it.

## Saved progress and the next-level policy (Phase 2 requirements)

`nextLevel` (see `packages/core/src/policy.ts`) takes the player's history from saved
progress, which is untrusted. Before calling it the game must:

- schema-validate the save: `history` is an array of objects with a capped length; each
  `levelId` is a known level, `reason` is a known value, `solved` is a boolean, `seconds`
  and `hints` are finite and non-negative, and `endedAt` is finite and no later than now;
  the `solved` set holds only known level ids.
- persist compact facts rather than truncating history: the set of reserve levels already
  played (so detours never repeat) and the main levels quit at least once (for "retry").
  `PolicyInput.playedReserve` and `PolicyInput.quitMain` take them. Validate them like the
  rest of the save: `playedReserve` holds only known reserve ids, `quitMain` only known
  main-path ids, both capped at their pool's size.
- keep at least `POLICY_CONFIG.minHistory` (8) records when capping history: the hint
  streak and the last hint breather are read from history alone. The warm-up tier is also
  read from the capped history, i.e. from recent plays.
- fall back to the next unsolved main-path level if validation fails.
- `tips` (one-time tips already shown, e.g. `cross` for "Light can cross") holds only known tip
  ids; anything else is dropped, and a missing field means none were shown.

**The garden code (`state/gardenCode.ts`).** A player can carry their garden to another device
as one line of text: `FG1.<payload>.<check>`, where the payload is the save's JSON (deflated,
base64url) and the check an FNV-1a hash of the payload. A code is untrusted input exactly like a
save: at most 20,000 characters, the check must match before anything is decoded, inflation stops
past the save's size limit (256,000), and the result goes through `parseSave`. A code never
carries the install id, the sitting count or the settings; loading keeps this device's. A code
with no gardens is refused, and play times travel only to the day (a code may be posted publicly).
Loading asks first (and warns when the code has fewer gardens), keeps this device's garden in the
`progress-backup` slot, writes the new save, reads it back, and only then reloads, so the game
opens it through the normal load path; nothing else may save in between. If storage refuses the
write, nothing reloads and the garden is unchanged. Known limit: a second tab of the game still
open will save its old garden over the new one; close other tabs first.

Light crossing light is allowed: a path tile lit by a row beam and a column beam is fine (only
fireflies may not see each other). `crossings` (core) finds those tiles and `conflictPairs` the
pairs of fireflies that do see each other, nearest neighbours only, so the game can show the
broken rule itself rather than only the fireflies breaking it.

## Not yet implemented

- **Coloured beams** (candidate twist, from Michael's play feedback 2026-11-12): fireflies of two
  or more colours whose crossing beams mix (red + blue = purple); some tiles want a specific mix,
  others must not be mixed. Changes what "lit" means, so it needs new rules, solver propagation and
  grader techniques before any level uses it.

- **Two-color fireflies** (late twist): needs a color per firefly and per-color
  bush clues. Will be added as a new twist key when its chapter is planned.
