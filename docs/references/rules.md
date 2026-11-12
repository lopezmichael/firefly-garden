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
| Mushroom (twist) | No | Yes | Never |

## Rules

1. A firefly lights its own tile and every tile along its row and column until
   a blocker, an outside cell or the edge stops the light.
2. Two fireflies may not see each other along a row or column (lanterns included).
3. A numbered bush wants exactly that many fireflies among its **8** surrounding
   tiles, diagonals included. (Standard Akari counts only the 4 orthogonal tiles.)
4. Solved: every path tile that is not moonlit is lit, no two fireflies see each
   other, and every numbered bush has exactly its number.

Fireflies may sit on moonlit tiles. Hidden bushes and mushrooms impose no count.

**Design note.** A hidden-number bush and a mushroom are identical to the rules:
both block light and carry no count. The difference is only what the player
sees (a bush that *has* a number they can't see, versus a plant that never has
one). Keep that distinction in the art, or the clue-removal difficulty lever
and the mushroom twist read as the same thing.

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
| `twists` | | `mushrooms`, `moonlit`, `lanterns`: arrays of `[row, col]`. Unknown keys are rejected |
| `solution` | | Every firefly in the answer, **lanterns included** |
| `tier`, `score`, `techniques` | | Written by the grader |

Validation (`parseLevel`) rejects unknown keys, off-board or outside-mask
coordinates, two things on one cell (including a lantern on a moonlit tile),
clues outside 0 to 8, and solutions that sit on blockers, repeat a cell, or
omit a lantern. Coordinates are `[row, col]` with row 0 at the top.

Levels are stored in one canonical orientation. `transformLevel` gives any of
the 8 rotations/mirrors; the rules are symmetric, so the solution count never
changes.

## Not yet implemented

- **Two-color fireflies** (late twist): needs a color per firefly and per-color
  bush clues. Will be added as a new twist key when its chapter is planned.
