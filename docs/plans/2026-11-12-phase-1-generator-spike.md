# Phase 1 · Generator spike, difficulty model, engagement model

**Goal:** prove the eight-neighbor rule makes good puzzles at scale, and build
the machinery that decides what a player sees next: a generator, a grader that
measures difficulty per mechanic, and an engagement model that turns graded
levels into a ramp people want to keep climbing. All of it is pure TypeScript
in `packages/core` plus offline scripts. No UI.

**Gate:** 8x8 and larger boards still need T3 or T4 deductions under the
eight-neighbor rule. (If they don't, we learn it here, before art or SDK work,
and change the rule or the board mix.)

## Why this can be built before any UI

Most of what makes a puzzle game "one more level" is decided by *which* level
comes next and *how long* it takes, not by how it looks. Those are properties
of levels and sequences, so they can be computed, simulated and tested now:

| Hook | Lives in | Buildable in Phase 1? |
| --- | --- | --- |
| Difficulty that tracks skill (flow) | Grader + ramp builder | Yes |
| Sawtooth pacing: climb, peak, breather | Ramp builder | Yes |
| "Aha" moments: a new technique taught on its own level | Grader + generator (technique-targeted levels) | Yes |
| Short levels, quick early wins | Grader's time estimate + ramp rules | Yes |
| Session shape: warm-up on return, peak before a natural stop | Next-level policy | Yes (as a pure function, simulated) |
| Hint moments placed where the curve peaks | Ramp builder + hint demand estimate | Yes (estimated), tuned with data in Phase 4 |
| Visible progress toward the next garden area | Ramp metadata (levels per area) | Data yes, display Phase 2 |
| Juice, celebration, chimes | Renderer/audio | Phase 2 |
| Streaks, daily puzzle, collectibles | Meta layer | Rules now, UI Phase 2 to 4 |
| Measured retention (day-1 return, session length, quits) | Analytics | Event schema now; real data Phase 3+ |

So in Phase 1 we build the parts that are math, and define the interfaces
(event schema, next-level policy) that Phase 2 and 3 plug into. What needs real
players gets a **simulated player model** now and is replaced by measured data later.

## 1. Technique grader (human-style solver)

A second solver that only uses deductions a person would make, simplest first,
and records the trace. Kept separate from the exact solver.

- [x] `Technique` interface: `{ id, tier, mechanic, apply(state) → Deduction[] }`.
      Techniques are pluggable, so each twist can register its own.
- [x] Base techniques from the plan: T1 bush bookkeeping, T2 only one light source,
      T3 overlapping bushes, T4 one-step lookahead (swapped from the plan's order on
      2026-11-12), T5 deep trial, plus T2 "bush room"
- [ ] Twist techniques, tagged by mechanic, e.g. lantern exclusion (T1), moonlit
      "doesn't need light" reads (T2), pond/neck region splitting (T3), shape-forced
      placements at narrow necks (T2). The grader tells us which ones actually matter.
- [x] Trace output: the ordered steps, and at each step how many deductions were
      available (**width**). Few available moves is a strong signal of hardness, often
      stronger than the hardest technique alone.
- [x] A level the grader can't finish without T5 is "expert only" or rejected.
- [ ] Hint function: the first step of the trace, explained in words ("This tile can
      only be lit from here"). Same code the game will call.

## 2. Difficulty model

Difficulty comes from which deductions a level forces, not from board size.

- [x] Feature vector per level: hardest tier, count of T3+ steps, minimum width
      along the trace, total steps, board area, clue density, hidden-clue ratio,
      mechanics present, shape features (necks, regions)
- [x] Score v0 = hardest tier (dominant) + T3+ count + low-width penalty, with
      size and steps as tie-breakers. Weights live in one config, not scattered.
- [x] **Estimated solve time** from steps × per-technique cost. This drives level
      length targets (early levels under a minute) and session pacing.
- [x] Per-mechanic report: does a twist make levels harder, easier, or just different?
      (e.g. moonlit tiles probably ease T2 but enable new T3 patterns)
- [ ] Calibration hook: the score is a model, and Phase 4 fits its weights to real
      solve times and quit rates. Keep it a pure function of features so refitting is cheap.

## 3. Generator

The pipeline from the project plan, seeded and reproducible.

- [x] Seeded RNG in core; a level id encodes its seed and spec so any level can be regenerated
- [x] Spec: size, mask shape, bush density, twist mix, symmetry, target tier range
- [x] Shape library: rectangle, L-bed, ring around a pond, crescent, two plots and a bridge
- [x] Steps: place bushes/twists → place a hidden answer that lights everything →
      derive clues (8-neighbor) → uniqueness via `solve(limit 2)` → repair (reveal a clue
      or add a lantern) → clue removal toward the target tier → grade → file
- [ ] **Technique-targeted generation**: "give me a 5x5 that needs T3 exactly once and
      nothing harder". This is how each new idea gets its own teaching level.
- [x] Performance budget: a 10x10 uniqueness check fast enough to generate hundreds of
      levels in minutes; record solver `nodes` per level as a cost metric
- [x] `scripts/generate-levels`: writes `levels/<pack>.json` plus a manifest
- [x] Level ratchets in `tests/levels.test.ts` (no separate script needed): every committed level is unique and its stored
      tier matches a fresh grade; chapter 1 uses nothing above T2

## 4. Engagement model and ramp builder

This is where we design the pull of the game while it is still cheap to change.

- [x] **Ramp builder**: from a pool of graded levels, assemble chapters as sawtooth
      curves (8 to 12 levels climbing to a peak, then a breather). Each chapter
      introduces at most one new technique or twist, first on a T1 board.
- [ ] **First-session script**: levels 1 to 10 hand-checked from generated
      candidates: T1 to T2 only, 4x4 to 5x5, each under a minute, each teaching one idea.
      The first session protects the hook (no ads before level 5 per the plan).
- [x] **Next-level policy** (pure function of player history → next level): warm-up
      level when returning after a gap, an easier breather after a quit or a long
      solve, steady climb otherwise. Simulated now, wired into the game in Phase 2.
- [x] **Simulated players**: models with a skill level (highest technique mastered),
      speed, and a patience budget. Run them through a ramp to estimate solve time,
      hint demand and quit points per level. This lets us compare ramps before anyone plays.
- [x] **Hint economy check**: estimated hint demand of 10 to 25% on peak levels and
      under 5% on breathers (the plan's targets), and coins earned covering normal hint use
      so rewarded ads stay optional.
- [ ] **Analytics event schema** (types only, in core): level start/solve/quit, time,
      undos, hints, restarts, session start/end. Phase 2 logs locally, Phase 3 sends
      to portal analytics. Same schema feeds the Phase 4 refit.
- [ ] Meta hooks recorded as data, displayed later: levels per garden area (visible
      progress), daily puzzle pool a year ahead, collectible drop cadence.

**Guardrails.** Make it compelling through flow, fairness and progress. Avoid
manipulation: every level solvable by deduction alone (no hint required), no
punishing streak mechanics beyond the weekly streak saver, ads only where the
plan puts them. Portal rules require most of this anyway, and it makes for a
better game.

## Deliverables and gate evidence

- [x] 200+ generated, graded, unique levels from 4x4 to 10x10, committed under `levels/`
- [x] Report (the "Firefly Garden difficulty report" artifact, fed by `reports/dash/`): tier histogram by board size and
      mechanic, technique frequency, estimated solve times. Answers the gate question:
      do 8x8+ boards still need T3/T4?
- [x] A first ramp for chapters 1 to 3 with simulated-player curves
- [x] Open question resolved: does the eight-neighbor rule hold up at 8x8+? If not,
      options to test: more hidden clues, more mushrooms/voids, larger necked shapes,
      or a 4-neighbor variant for some bushes

## Open questions for this phase

- How much faster does T4 show up under the eight-neighbor rule than in standard Akari?
- Is "minimum width" a better difficulty predictor than hardest technique? (Measure once
  Phase 2 playtests produce solve times.)
- Is a mushroom worth shipping as a twist given it plays like a hidden bush? (See the
  design note in `docs/references/rules.md`.)

## Findings so far (first census, 2026-11-12)

- **Gate passes:** 74% of 8x8+ levels need T3 or harder (67 to 83% by size and clue mode).
- **Two techniques were missing** and made the grader over-rate levels as T5: "bush room"
  (a bush's open spots that see each other can't both hold fireflies) and following one round
  of forced moves inside a lookahead. Both are now in, as T2 and T3.
- **T4 almost never fired** in the plan's order: one-step lookahead caught the same moves.
  With overlap tried first, 79 of 142 T3 levels became T4. **Decided:** overlap is T3,
  lookahead T4.
- **Mushroom:** the sporecap (4-neighbor numbered mushroom) took part in 33% of steps; the
  toadstool in 2%; the old blocker is rules-identical to a hidden bush. **Decided:** the
  mushroom is now the 4-neighbor numbered blocker; the other variants were removed.
- **Length:** the first census had levels estimated up to 9:23. **Decided:** five-minute
  limit on every level, one minute in chapter 1, enforced by the generator and CI.
  After regenerating: longest 4:59, gate still passes (73% of 8x8+ need T3+).
- **Score resolution:** chapter 1 was flat (all T2, scores 51 to 56). **Done:** score v1 bands
  by tier and places each level inside its band by log search effort. T2 now spans 50 to 74,
  distinct scores went from 40 to 75, and chapter 1 climbs 50 to 59 after its T1 opener.
  Chapter 3 capped at four minutes (peak now 3:55).
- **Review (2026-11-12):** grader fuzzed on ~29,000 boards in both technique orders with zero
  unsound steps. Fixed: a repair lantern could land on a moonlit tile (latent; no current spec
  combines them), and the grader now needs every tile decided before calling a board solved.
  Hardening to do if levels ever come from players: node/step budgets on `isUnique` and `grade`.
- **Simulated players (2026-11-12):** 78% of the simulated population clears chapter 3,
  96% clears chapter 1; newcomers 54%. Hint demand spikes where a new tier first appears,
  not at peaks: breathers average 5.4% (target under 5%) and peaks 8.3% (target 10 to 25%). Teaching levels at each tier debut are in; next is placing debuts
  early in a chapter with practice before the peak.
- **Hint economy:** price barely moves hint demand; it moves who pays. Shipped 60 starting
  coins, 10 per solve, 30 per hint (retention first). Tradeoff for later: established players
  bank coins and rarely watch rewarded ads for hints, so a coin sink matters.
- **Ad views (2026-11-12):** about 14 midgame ads per simulated player through chapter 3,
  0.01 rewarded hint ads. A tight economy (30 starting coins, 60 per hint) gains ~0.2
  rewarded ads per player but loses ~0.8 to 1.0 midgame ads because fewer keep playing, so
  the generous economy wins on revenue too. Rewarded ads grant 3 hints (one now, two saved).
- **Note for Phase 2:** hint-placed fireflies are locked and visually distinct; see the Hints
  section of `docs/references/rules.md`.
- **Debut placement (2026-11-12):** each new tier debuts ~30% into its chapter on its
  gentlest level, then practice of it (gentlest first) alternates with easier levels before
  the peak. Breathers 4.5% (target met; now a CI guardrail). Peaks 8.8% overall: chapter 1's
  is kept easy for the first session (3%); later chapters average 12% (target 10 to 25%).
  Debut levels still draw about a third of plays to a hint; that is where help belongs and
  it stays under the 40% guardrail. Placing debuts alone barely moved the numbers; ordering
  practice gentlest-first is what brought breathers under 5%.
- **Next-level policy (2026-11-12):** `nextLevel` in core, used by the simulator now and by
  the game in Phase 2. Detours average ~6.6 per player over chapters 1 to 3 (3.4 warm-ups,
  3.2 breathers). No assumed effect: completion unchanged, +10 minutes and +2.4 ad views per
  player. Assumed 30% fewer leave after a quit with a breather next: 83% finish (from
  78.5%), newcomers 62% (from 53%). The real effect is a Phase 3 measurement.

## Launch pack size (target 500 to 1,000 levels)

- Generation is cheap (252 graded levels in ~2 s), and 1,000 levels is ~400 KB of JSON
  against the 8 MB budget; CI validation of 1,000 levels takes seconds.
- Shape: roughly 600 to 750 main-path levels in chapters of 8 to 12 (60 to 80 chapters),
  plus 250 to 300 reserve levels for warm-ups and breathers (and the daily puzzle pool).
- Variety at that size needs the twist chapters (moonlit, lanterns, mushrooms, shapes) and a
  duplicate guard: `canonicalKey` now rejects rotations and mirrors of existing levels.
- Content limits seen so far (few T1 openers, few T3 practice levels) disappear with a
  larger, targeted pool: generate per-chapter specs instead of one census.

