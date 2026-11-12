# Archived report data

Frozen datasets behind past decisions. They are not regenerated.

- `mushroom-experiment-2026-11-12.json`: the same 40 seeds on 7x7 boards with
  no twist and with three mushroom rules (A blocker, B toadstool, C sporecap).
  C took part in 33% of deduction steps and won; it became the `mushrooms`
  twist (a numbered blocker counting its 4 side neighbors). Technique names in
  this file use the old order (T3 lookahead, T4 overlap).
- `count-experiment-2026-11-12.json`: every launch and reserve level graded with and
  without the total firefly count known (`grade(board, { knownCount })`, the "firefly jar"),
  by `node scripts/experiment-count.ts`. Only T4 levels move: 53 of 159 drop to T3, none in
  chapters 1 and 2, and 14 chapters would lose their peak. Rows carry both measures plus a
  "count steps free" bracket, since the time model charges every count step.
