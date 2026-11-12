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
| `tier`, `score`, `techniques` | | Written by the grader |

Validation (`parseLevel`) rejects unknown keys, off-board or outside-mask
coordinates, two things on one cell (including a lantern on a moonlit tile),
clues outside 0 to 8 (0 to 4 for mushrooms), and solutions that sit on blockers, repeat a cell, or
omit a lantern. Coordinates are `[row, col]` with row 0 at the top.

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
animates the removal so the player sees what changed. In the rules engine a
locked hint firefly behaves like a lantern for that play (fixed, counts, can
conflict), so `canPlace` must refuse it; this needs a per-play "locked" set
alongside the level's lanterns when the game is built.

## Not yet implemented

- **Two-color fireflies** (late twist): needs a color per firefly and per-color
  bush clues. Will be added as a new twist key when its chapter is planned.
