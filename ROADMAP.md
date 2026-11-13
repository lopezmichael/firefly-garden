# Roadmap

Six phases, each closed by a gate that has to pass before the next starts.
Phase 1 is the real risk check: it proves the eight-neighbor rule makes good
puzzles at scale before any art or SDK work. Each phase gets a
`docs/plans/` file with checkboxes when it starts.

| Phase | Work | Gate | Status |
| --- | --- | --- | --- |
| **0 · Foundation** | Repo, CLAUDE.md, CI (typecheck, tests, build), review workflow. Core rules engine and exact solver, with unit tests | The solver finds every solution of the mockup gardens, matches an independent count, flags them non-unique, and confirms a set of known-unique boards | Done ([plan](docs/plans/2026-11-12-phase-0-foundation.md)) |
| **1 · Generator spike** | Generator, clue removal, technique grader. Difficulty model across mechanics. Engagement model and ramp builder. First 200 graded levels, 4x4 to 10x10 | 8x8 and larger boards still need T3 or T4 deductions under the eight-neighbor rule | Done; gate passed, launch pack generated ([plan](docs/plans/2026-11-12-phase-1-generator-spike.md)) |
| **2 · Playable web build** | Port the mockup to the real renderer with the full juice list. Chapters 1 to 3, coins, hints from the solver, local save | Friends play 20+ levels without being asked | In progress: the ink and wash look, keyboard, sound plumbing and the browser smoke test are released (#9). Next: the moments between gardens, i.e. tap to continue and the chapter transition ([plan](docs/plans/2026-11-13-flow-and-transitions.md)), then the friends playtest |
| **3 · Portal launch** | Pitch Poki, or ship to CrazyGames and Playgama together. Portal SDK adapters, ad pacing, analytics events | Passes a Web Fit Test or reaches CrazyGames Full Launch | |
| **4 · Grow** | Twist chapters, daily puzzle, painted art pass. Retune the ramp from solve time, hint and quit data | Day-1 return and session length hold steady | |
| **5 · iOS and Android** | Capacitor shell, AdMob, remove-ads purchase. App Store and Play Store release | | |

**Gate 0 was reworded on 2026-11-12.** The original read "the solver confirms
the three mockup gardens each have exactly one solution". The mockups were
drawn for look and feel and none is unique (9, 40, 2 and 289 solutions), so
the gate now checks that the solver counts them correctly and confirms
repaired, known-unique versions instead.
