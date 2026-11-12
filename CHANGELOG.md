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

### Added (launch pack)
- Per-chapter generation (`scripts/launch-plan.ts`): 70 chapters in 12 garden areas, 760
  main-path levels plus a 250-level twist-free reserve for detours (1,010 total, ~440 KB).
  Twists debut one per chapter in the plan's order (mushrooms ch 7, moonlit ch 13, lanterns
  ch 19, shaped gardens ch 25), each on easy boards first; chapter 1 opens on T1 boards.
- Generator: `maxHardestSteps` (teaching levels that need the new technique once) and
  `fixedLanterns`; ramp builder: per-chapter `pool`.
- Report data for the whole pack: per-chapter summary and how far simulated players get
  (`reports/dash/chapters.json`, `journey.json`). The census is now report-only evidence.

### Added (analytics schema)
- `AnalyticsEvent` and `validateEvent` (`events.ts`): session, level, hint, ad and coin events
  with no personal data, validated before storage. `docs/references/analytics.md` maps each
  Phase 1 model assumption to the events that will measure it.

### Added (next-level policy)
- `nextLevel` (`policy.ts`): the main path by default, plus one detour from a reserve pool
  when needed: a warm-up after a break of 8+ hours, a breather after a quit (then the quit
  level returns), a long solve, or hints on two levels running. Never two detours in a row.
- `simulateWithPolicy`: the same players in 8 to 20 minute sittings, served by `nextLevel`.
  With no assumed effect on quitting, completion is unchanged but players get ~9 more
  minutes and ~2.4 more ad views each; assuming 30% fewer leave after a quit when a breather
  follows, 82.7% finish chapter 3 instead of 78.5% (newcomers 60% instead of 53%).
- `canonicalKey` and a level ratchet: no committed level is a rotation or mirror of another.

### Added (debut placement)
- Ramp builder places each new tier's debut about 30% into its chapter (`debutAt`), then
  alternates practice of the new tier (gentlest first) with easier levels before the peak,
  instead of stacking the new tier's levels at the end. Simulated breather hint use fell to
  4.5% (plan target: under 5%), now a CI guardrail; chapter 2's peak sits at 17% and later
  chapters' peaks average 12% (target 10 to 25%).

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
