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

**Grading is count-aware (decided 2026-11-12).** The game will show how many fireflies each
garden needs (the jar lands with Phase 2 milestone 3) (the "firefly jar" countdown), so every shipped level is graded as players
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

A hint is the grader's next step on the player's current board: it either
places one correct firefly or removes one wrong one, with a one-line reason
("This tile can only be lit from here"). Hints are bought with coins or
granted by a rewarded ad; one ad grants **3 hints** (one used now, two saved),
because a single firefly is thin pay for a 30 to 60 second video.

**Presentation (Phase 2 requirement).** A firefly placed by a hint is locked:
the player cannot remove it, and it looks different from both their own
fireflies and lanterns (for example a gold ring or a small sparkle), so it is
always clear which move came from the hint. A "fix a wrong firefly" hint
animates the removal so the player sees what changed.

**As implemented (`packages/core/src/hints.ts`).** `hint(board, solution, placed, locked)`:

1. Any player firefly that is not in the solution is removed first: one that sees another
   firefly ("This firefly can see another one."), else one that gives a bush too many
   ("This firefly gives a bush too many."), else the lowest such cell ("This firefly can't
   be part of the answer.").
2. Otherwise the grader runs from the current position
   (`grade(board, { start, stopAtFirefly, knownCount })`, with the count shown on the jar, the
   solution's size, as the level was rated; every firefly on the board is then part of the
   answer, so its deductions are sound) and the
   first step that places a firefly is the hint, with a reason per technique (`HINT_REASONS`),
   e.g. "That dark tile can only be lit from here." The cell is placed only if it is a
   solution cell (defense in depth); otherwise step 3 applies.
   **Ruled-out cells.** Before that firefly the grader often decides cells empty that the
   player cannot see are empty yet (a satisfied bush's other neighbors, a bush-room, overlap
   or count step): 55% of place hints in the property test. The count techniques only ever
   rule cells out, so a count step is never the hinted firefly; it ends up in `ruledOut` and
   the grader carries on to the next firefly. The hint returns them as `ruledOut`, and the
   game must draw them as faint "no firefly here" marks while it shows the hint, or the reason
   can read false ("needs every open spot" while other spots still look open). `because` is the
   firefly step's own cells first (the bush or dark tile), then the cells behind each ruled-out
   step. A test checks the reason holds on the visible board plus these marks for every
   T1-needs-all and T2-one-source hint, and that every count step among the ruled-out cells
   reads true at its point in the trace (count bound: the bushes and dark tiles behind it need
   disjoint open cells whose needs add up to exactly the fireflies left on the jar).
3. If the grader is stuck from that position, a missing solution cell is placed anyway
   ("Try a firefly here."), so a paid hint always does something. On every chapter 1 to 3
   and reserve level this never happened in the property test.
4. A solved board gets `none`.

The player's cells passed to `hint` come from saved progress and must be validated first:
integers in 0..w*h-1 on path cells, no repeats, at most w*h. If that fails, drop the level's
placed set and keep only the valid locked cells.

Locked cells: `canPlace(board, cell, locked)` refuses them, `evaluate` counts them like any
firefly (they count for bushes and can conflict), and `hint` throws if a locked cell is not
a solution cell (saves are validated before this point). For analytics, `hintStep(grade, cell)`
is the index in the level's full grader trace (`gradeLevel(level, board)`, the count-aware
trace the level was rated with) of the step that decides the hinted cell.

**Rules for the game build (from the Phase 1 security review):**
- Saved progress stores the locked hint cells per level and the banked hint count, and
  a load validates both like `parseLevel` does: a locked cell must be a cell of the
  level's unique solution, and the bank is a small non-negative integer. A corrupt or
  edited save must never lock wrong cells or grant unlimited hints.
- Undo and reset never remove a locked hint firefly; a paid hint is never lost.
- Hints are credited only after `Platform.showRewarded()` resolves `true` (the ad
  finished). A failed or skipped ad credits nothing and charges nothing.

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

## Not yet implemented

- **Coloured beams** (candidate twist, from Michael's play feedback 2026-11-12): fireflies of two
  or more colours whose crossing beams mix (red + blue = purple); some tiles want a specific mix,
  others must not be mixed. Changes what "lit" means, so it needs new rules, solver propagation and
  grader techniques before any level uses it.

- **Two-color fireflies** (late twist): needs a color per firefly and per-color
  bush clues. Will be added as a new twist key when its chapter is planned.
