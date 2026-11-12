# Firefly Garden: working notes for Claude

A cozy Light Up (Akari) puzzle with an eight-neighbor clue rule. Web portals
first, iOS second, one codebase. The full vision lives in
`Firefly Garden Project Plan.md`; this file is how we work and what is true
about the code today.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install, and point git at `scripts/hooks` (pre-commit) |
| `npm run typecheck` | `tsc` for core, game and tests/tools; must stay at zero errors |
| `npm test` | Vitest: core unit tests plus architecture ratchets |
| `npm run build` | Production build of `apps/game` to `apps/game/dist` |
| `npm run check:bundle` | Fails if the build is over the 8 MB Poki budget |
| `npm run check` | All of the above, in order. The pre-commit hook runs this |
| `npm run dev` | Vite dev server for the game |
| `npm run levels` | Regenerate `levels/` (launch + reserve packs) and `reports/` (deterministic, ~30 s). Never hand-edit packs; change `scripts/launch-plan.ts` |

## Codebase facts

- npm workspaces: `packages/core` (`@firefly/core`) and `apps/game` (`@firefly/game`).
  The game imports core's TypeScript source directly; there is no core build step.
- TypeScript 7, strict plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  Imports use explicit `.ts` extensions.
- `packages/core` is pure: ES2022 lib only, no DOM, no `@types/node`, relative imports only.
  `tests/ratchets.test.ts` enforces this.
- Cells are addressed by index `r * w + c` once a `Level` is compiled into a `Board`
  (`buildBoard`). Coordinates in level files are `[row, col]`.
- `solve()` is the exact solver (uniqueness, validation). `grade()` is the human-style
  technique grader (difficulty, hints). Keep them separate.
- The generator, grader, difficulty model, ramp builder and player simulator are all
  seeded/pure; difficulty weights live only in `DIFFICULTY_CONFIG` (`difficulty.ts`), player
  model assumptions and the shipped economy only in `PLAYER_CONFIG` (`players.ts`).
- Scripts in `scripts/*.ts` run directly with Node's type stripping (`node scripts/x.ts`).
- The difficulty report (a claude.ai artifact) is fed by `reports/dash/*.json`, written by
  `npm run levels`. Re-upload those files to refresh it.
- `evaluate()` is the single source of truth for "is this position solved", used by
  tests and, later, by the game.
- Every SDK (portal, ads, purchases, Capacitor) is called only from
  `apps/game/src/platform/`. Ratchet-enforced.
- Colors and fonts come from tokens in `apps/game/src/theme.css`; never hardcode them.
- Rules and level format: `docs/references/rules.md`. Layers and data flow: `ARCHITECTURE.md`.

## How we work

- **Plan first, replan when it breaks.** Non-trivial work gets a plan; multi-session
  work gets a `docs/plans/YYYY-MM-DD-<topic>.md` with checkboxes, ticked as work lands.
- **Branching.** Feature branches into `develop`; Claude opens the `develop` → `main`
  release PR; Michael merges. Never merge to `main` locally. (`develop` does not exist yet;
  create it from `main` when the first feature branch is ready to land.)
  Conventional commits that explain why.
- **Commit or push only when asked.**
- **CI** (`.github/workflows/ci.yml`) on PRs and pushes to `main`/`develop`: typecheck,
  tests, build, bundle budget, `npm audit`.
- **Reviews before every substantive commit:** two parallel reviewer subagents
  (correctness, security) given the diff and untracked files. `/security-review` for
  anything touching ad SDKs, purchases, storage or external input.
- **Subagents** get a standalone brief and an explicit model, never an inherited one.
- **Root cause, simplest proper fix.** No `--no-verify`, no catch-and-ignore, no widening
  a ratchet baseline or raising the bundle budget.
- **Done means demonstrated:** tests, typecheck, build, plus evidence (a screenshot or clip
  of the behavior, a generated pack that validates, a mutation the tests catch).
- **Living docs:** update CHANGELOG, ARCHITECTURE and ROADMAP in the change that warrants it.
- **`npm audit` clean.** Never take `--force` fixes that downgrade core packages.
- **Lessons go to the highest rung:** a test or ratchet first, then this file or a
  reference doc, then a memory.

## Ratchets (tests that fail the build)

- `packages/core` imports nothing outside itself and compiles without DOM/Node types
- No portal or ad SDK mentioned outside `apps/game/src/platform/`
- Production bundle under 8 MB
- Every committed level re-solves to exactly one solution and re-grades to its stored
  tier and score; no level is a rotation or mirror of another; each chapter introduces at
  most one new tier and ends on its top score (`tests/levels.test.ts`)
- No level in chapter 1 requires a technique above T2
- Hint economy (simulated, `tests/economy.test.ts`): at most 5% of hint requests refused,
  at least 95% of players clear chapter 1, breathers under 5% hint use on average, no level
  above 40% hint use
- No committed level is estimated over 5:00; main-path levels stay under 4:00 and chapter 1
  under 1:00 (`DIFFICULTY_CONFIG.limits`)

## Security, scaled to a client-only game

- No secrets in the client bundle; ad unit IDs live in config, not scattered in code.
- Anything from storage, a portal SDK or a level file is untrusted: `parseLevel` validates
  levels; saved progress must be validated the same way before use.
- `.env*` files are denied to Claude in `.claude/settings.json`.
