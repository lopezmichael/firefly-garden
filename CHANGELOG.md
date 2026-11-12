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
- Experimental mushroom variants: toadstool and sporecap, compared in the difficulty report.
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

### Security
- `parseLevel` caps list lengths, mask row width and text fields before any per-item work.
- `solve` takes an optional `maxNodes` budget for levels generated on the fly.
- CI checkout no longer persists credentials; job timeout added.

### Changed
- Gate 0 reworded: the mockup gardens are not unique, so the gate checks correct counting
  plus known-unique boards (see ROADMAP.md).
