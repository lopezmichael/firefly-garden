# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Phase 1: technique grader (`grade`) with T1 bookkeeping, T2 one source and bush room,
  T3 one-step lookahead, T4 overlapping bushes, T5 deep trial; difficulty model (`measure`)
  with score, tier and estimated solve time; seeded generator (`generate`) with garden shapes,
  uniqueness repair and clue removal; ramp builder (`buildRamp`).
- 252 generated, unique, graded levels (`levels/spike.json`) and chapters 1 to 3
  (`levels/manifest.json`), re-validated by `tests/levels.test.ts`.
- `npm run levels` regenerates packs and report data.
- Phase 0 foundation: npm workspaces (`packages/core`, `apps/game`), strict TypeScript 7,
  Vitest, Vite build, CI workflow, pre-commit hook, Claude Code typecheck hook.
- `@firefly/core`: level format and validation (`parseLevel`), board compiler
  (`buildBoard`), rules engine (`evaluate`, `canPlace`), exact solver (`solve`,
  `isUnique`), and the eight rotations/mirrors (`transformLevel`). Twists supported
  by the rules and solver: mushrooms, moonlit tiles, lanterns, and shaped gardens via
  the mask (ponds are mask holes).
- Phase 0 gate tests over the four mockup gardens (9, 40, 2 and 289 solutions) and two
  repaired, known-unique boards; solver cross-checked against a naive enumerator on 300
  random boards.
- Architecture ratchets: core purity, SDKs only behind the platform adapter, 8 MB bundle budget.
- `Platform` adapter interface and a local development adapter.
- Docs: CLAUDE.md, ARCHITECTURE.md, ROADMAP.md, rules reference, Phase 0 and Phase 1 plans.

### Added (simulated players and hint economy)
- `simulate`/`combine` (`players.ts`): four kinds of portal player (newcomer, casual, puzzler,
  expert) play the chapters along each level's grader trace, with skill, learning, patience,
  hints paid by coins or ads, quits and churn. Seeded and deterministic.
- Ramp builder places a teaching level (fewest steps of the new technique) where each new
  tier first appears (a debut on a chapter peak keeps the peak and teaches just before it);
  hint demand at chapter 3's T4 debut dropped from 39% to 22%.
- Shipped economy: 60 starting coins, 10 per solve, 30 per hint (best newcomer retention in an
  18-economy sweep, almost no refused hints). Economy guardrails in `tests/economy.test.ts`.
- `reports/dash/players.json` and `economy.json` feed the report's new sections.
- Ad views per player in the simulation: midgame ads paced as in the plan (none in the first
  five levels, at most one per three minutes) and rewarded hint ads. About 14 midgame ads per
  player through chapter 3 against 0.01 rewarded hint ads; a tight economy loses ad views
  overall because fewer players keep playing (`reports/dash/ads.json`).
- A rewarded ad grants 3 hints (one now, two saved); at a tight economy this keeps more
  newcomers than one per ad, and five adds nothing over three.

### Changed (Phase 1 decisions, 2026-11-12)
- Technique tiers: overlapping bushes is now T3 and one-step lookahead T4.
- Mushrooms are numbered blockers counting only their 4 side neighbors
  (`twists.mushrooms: [row, col, n]`). The toadstool and sporecap experiments are removed.
- Shipped levels are capped at an estimated five minutes, and chapter 1 at one minute
  (`DIFFICULTY_CONFIG.limits`), enforced by the generator, the ramp builder and CI.
  Chapter 3 is capped at four minutes.
- Difficulty score v1: the hardest tier picks a 25-point band and search effort places the
  level inside it on a log scale, so levels of the same tier are told apart (T2 now spans
  50 to 74 instead of 51 to 56).

### Security
- `parseLevel` caps list lengths, mask row width and text fields before any per-item work.
- `solve` takes an optional `maxNodes` budget for levels generated on the fly.
- CI checkout no longer persists credentials; job timeout added.

### Changed
- Gate 0 reworded: the mockup gardens are not unique, so the gate checks correct counting
  plus known-unique boards (see ROADMAP.md).
