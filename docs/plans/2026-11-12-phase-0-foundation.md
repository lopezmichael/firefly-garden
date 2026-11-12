# Phase 0 · Foundation

**Goal:** a repo with the working loop in place (CI, hooks, docs, ratchets) and
a correct core: rules engine plus exact solver.

**Gate (reworded 2026-11-12):** the solver finds every solution of the mockup
gardens, matches an independent count, flags them as non-unique, and confirms
a set of known-unique boards. The original gate ("each mockup has exactly one
solution") could not pass: the mockups have 9, 40, 2 and 289 solutions.

## Repo and workflow

- [x] npm workspaces: `packages/core`, `apps/game`
- [x] Strict TypeScript (`tsc` at zero errors), Vitest, Vite build
- [x] CI: typecheck, tests, build, bundle budget, `npm audit`
- [x] Pre-commit hook (`npm run check`), installed by `npm install`
- [x] Claude Code PostToolUse hook typechecks each edited `.ts` file; `.env` deny rules
- [x] CLAUDE.md, ARCHITECTURE.md, ROADMAP.md, CHANGELOG.md, `docs/references/rules.md`
- [x] Ratchets: core purity, SDKs only in `apps/game/src/platform/`, 8 MB bundle

## Core

- [x] Level type matching the plan's draft format, plus `parseLevel` validation of untrusted JSON
- [x] `buildBoard`: masks (shaped gardens, ponds), bushes, mushrooms, moonlit tiles, lanterns
- [x] `evaluate`: lit, conflicts, bush states, solved
- [x] `solve` / `isUnique`: exact, limit-aware, reports whether the count is exhaustive
- [x] `transformLevel`: 8 symmetries, solution count invariant

## Gate evidence

- [x] Mockup gardens: 9 / 40 / 2 / 289 solutions, all exhaustive, matching an independent
      brute-force script; each mockup's intended answer is among them
- [x] Known-unique boards: 4x4 and 6x6 mockups plus a corner lantern each solve uniquely
      to the intended answer
- [x] Solver agrees with a naive enumerator on 300 seeded random boards (all twists)
- [x] Mutation check: disabling branch exclusion fails 3 tests; counting 4 neighbors
      instead of 8 fails 16

## Left for later

- Two-color fireflies (Phase 4 twist chapter)
- `develop` branch: create from `main` when the first feature branch is ready
