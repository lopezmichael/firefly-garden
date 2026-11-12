# Firefly Garden: Project Plan

Nov 11, 2026 · @Michael Lopez

## Overview

Firefly Garden is a cozy, glowing logic puzzle where players place fireflies to light every path of a night garden. It is a side income project: ship to web game portals first, earn on ads, then port to iOS once a level template proves itself. Built solo, scoped small, and designed so a second game (Paint the Kingdom) can reuse the same codebase.

**Goals**

- Earn steady ad revenue from a small, polished catalog rather than betting on one hit
- Keep scope tight enough to ship a first playable build in weeks, not months
- Make every early decision (renderer, input, layout, save data) compatible with a later iOS release

**What success looks like**

- Passes a Poki Web Fit Test or a CrazyGames Full Launch review
- Players come back: day-1 return rate and average session length are the numbers to watch
- A generator that can produce hundreds of levels on a smooth difficulty ramp without hand design

**Positioning.** The Light Up (Akari) mechanic is proven but nobody owns it: existing apps are minimal number grids with little traction, and one firefly-themed daily puzzle (Glow) exists with a different clue rule. Firefly Garden wins on feel (2.5D, glow, sparkle), our own eight-neighbor clue rule, twists, and a growing-garden meta layer.

## Game design

The core is settled: Light Up with an eight-neighbor clue rule, short early levels, and a twist introduced every chapter or so.

**Core rules**

1. Tap a path tile to place a firefly. It lights its whole row and column until a bush blocks the light.
2. Two fireflies may not see each other along a row or column.
3. A numbered bush wants exactly that many fireflies in the 8 tiles around it, diagonals included. This is our variant; standard Akari counts only the 4 orthogonal tiles.
4. The garden is solved when every path tile is lit, no fireflies conflict, and every bush is satisfied.

**Teaching the rules.** Bushes show a row of dots, one per firefly wanted, that fill as fireflies land around them. Level 1 is a 4x4 with two bushes that takes under a minute. No text tutorial beyond a one-line hint.

**Progression**

- Boards grow from 4x4 squares to rectangles, then to shaped gardens, over the first few chapters
- Auto-advance: solve, short celebration, next board already loaded
- Every level has exactly one solution (enforced by the generator)
- A new twist arrives on its own easy level, then gets mixed into the pool

**Garden shapes.** Boards don't have to be squares. A level is a mask of active cells, so a garden can be an L-shaped bed, a ring around a koi pond, a crescent, or two plots joined by a narrow bridge. Missing cells behave like the edge of the board: light stops there. Shapes give later levels variety with no new rules, act as a difficulty lever (narrow necks force placements, wide open areas create long-range interactions), and tie each board to a place in the garden.

**Twists (introduced in roughly this order)**

| Twist | Rule | Why it's fun |
| --- | --- | --- |
| Mushrooms | Block light and carry a number that counts only the 4 side tiles (bushes count all 8) | A second way of counting on the same board; a new skill without new controls. (Changed 2026-11-12: the original no-number mushroom played exactly like a hidden bush) |
| Moonlit tiles | Pre-lit; never need covering | Frees up placements, changes deductions |
| Lanterns | Fixed fireflies already placed | Starting constraints you work around |
| Ponds | Light can't cross; fireflies can't see across either | Splits the board into regions |
| Two-color fireflies | Some bushes want a specific color | A late-game layer of depth |

**Meta layer.** Each chapter restores one area of the garden (the rose bed, the orchard, the koi pond), borrowing Project Makeover's loop: solving levels brings that area back to life, and the area's layout sets the shape of its boards. A daily puzzle with a streak. A later option: a critter or sticker collection earned every few levels.

## Art direction and feel

The look is a glowy storybook diorama: a painted, tactile little garden at night where the light is the most vivid thing on screen. Nothing flat. The current mockup (placeholder shapes and gradients) is the reference for motion and depth.

**Visual pillars**

- **2.5D board.** Raised tiles with a visible front edge, bushes that stand off the board with soft shadows, a slight downward camera tilt. Meowdoku's tactile feel is the benchmark.
- **Watercolor surfaces.** Painted paper and grass textures on tiles, soft bleeding edges, gentle tile-to-tile variation.
- **Dusky palette, warm light.** Deep teal, plum and moss for the night; warm gold for anything lit.
- **Type.** Rounded display face for titles and numbers (Fredoka in the mockup), friendly sans for body (Nunito).

**Effects (the juice list)**

| Moment | Effect |
| --- | --- |
| Place a firefly | Drops in with a bounce, then hovers and bobs; wings flutter; a soft shadow breathes under it |
| Light spreads | Ripples outward tile by tile along row and column, with a warm bloom per tile |
| Lit tiles | Tiny motes drift up |
| Bush satisfied | Its dots glow gold, a star twinkles, a soft chime |
| Conflict | Fireflies flicker nervously and tint pink |
| Solve | Flowers pop open on bushes, a sparkle burst rises off the board, then auto-advance |
| Ambient | Twinkling stars, a moon, slow parallax |

Respect `prefers-reduced-motion`: keep state changes, drop the decorative motion.

**Audio.** Soft chimes on placement and satisfaction, a gentle solve flourish, an optional ambient night loop (crickets, wind). Every sound mutable; portals require muting during ads.

**Art pipeline: placeholder now, painted later**

1. Ship the prototype on code-drawn shapes (as in the mockup)
2. Make watercolor textures ourselves: paint swatches on paper and scan, or use watercolor brushes in Procreate or Krita
3. Draw a small sprite set: firefly (2 to 3 poses), bush variants, flowers, mushroom, pond, lantern
4. Commission a watercolor artist for a polish pass only once the game earns

Keep every asset behind a theme layer so swapping placeholder for painted art is a file change, not a code change.

## Platforms and distribution

Web portals first, iOS second, one codebase for both. The web build is the product; iOS is the same build in a native shell.

| Phase | Platform | Monetization | Why this order |
| --- | --- | --- | --- |
| 1 | Poki (pitch first) | Portal ad SDK, revenue share | Curated, real traffic if it passes the Web Fit Test; 100% of revenue on traffic we bring |
| 1 alt | CrazyGames, Playgama | Portal ad SDK, revenue share | If Poki passes: go wide, non-exclusive |
| 2 | The game's own domain | Optional, light | A home for the daily puzzle and a link to share |
| 3 | iOS (App Store) | AdMob rewarded and interstitial ads + a cheap remove-ads purchase | Proven game, bigger per-user revenue, different audience |
| 4 | Android (Play Store) | Same as iOS | Nearly free once the iOS shell exists |

**The exclusivity decision.** Poki prefers web exclusivity (no other web portals) but still allows app stores. Pitch Poki first; if they decline, ship to CrazyGames and Playgama together. Decide before the first public build goes anywhere, since CrazyGames' best terms favor games that debut there.

**Built for iOS from day one**

- **Native shell: Capacitor.** Wraps the web build in an iOS app, with plugins for ads (AdMob), purchases (StoreKit, likely via RevenueCat), haptics and local storage. No rewrite.
- **Touch-first input.** Tap only, 44 pt minimum targets, no hover-dependent UI, no keyboard required (keyboard support is a bonus for desktop portals).
- **Portrait and landscape layouts** on phones and desktop. Portrait stacks the UI above and below the board; landscape moves it to side panels. Light Up puzzles keep the same logic when rotated or mirrored, so the game rotates a level to whichever orientation shows it bigger, and one level pack serves both. Cap board dimensions per orientation so tap targets stay at 44 pt or more.
- **Safe areas.** Respect notch and home-indicator insets from the start.
- **Offline by default.** Levels ship inside the build; nothing needs a network to play.
- **Performance budget.** 60 fps on a mid-range phone and a 4 GB Chromebook; initial download under 8 MB for Poki (under 20 MB for the CrazyGames mobile homepage).
- **Haptics** on placement and solve (iOS only, behind the platform layer).
- **App Store needs to plan for:** Apple Developer account ($99/year), privacy nutrition label, App Tracking Transparency prompt if ads use tracking, age rating.

## Technical architecture

A pure TypeScript core holds the rules, solvers and generator; one Vite app renders the game; every platform difference sits behind a single adapter. Switching from a web portal to iOS means writing a new adapter, not touching game code.

The diagram (shared core, one game app, one adapter per platform) lives in [ARCHITECTURE.md](ARCHITECTURE.md).

The core feeds both the offline level script and the game itself, so hints and validation always match how levels were built. Everything below the adapter line is swappable.

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript, strict | Same as digilab-web; `tsc` kept at zero errors |
| Build | Vite | Small bundles, fast dev loop, static output |
| Renderer | PixiJS | WebGL for glow, bloom and particles; Canvas 2D fallback |
| UI | Plain DOM, or Preact for menus | Keep the board in the renderer, menus in the DOM |
| Audio | Web Audio (or Howler.js) | Must mute on ad start, unmute on finish |
| Tests | Vitest | Core gets heavy unit coverage; solver correctness is the product |
| iOS shell | Capacitor | Plugins for AdMob, StoreKit, haptics, preferences |
| Own-site hosting | Vercel | Static deploy; no functions needed in v1 |
| CI | GitHub Actions | Typecheck, tests, level validation, build |

**Platform adapter interface (draft)**

```ts
interface Platform {
  init(): Promise<void>;
  gameplayStart(): void;
  gameplayStop(): void;
  showMidgame(): Promise<void>;            // resolves after the ad or on no-fill
  showRewarded(): Promise<boolean>;        // true only if the ad finished
  save(key: string, value: string): Promise<void>;
  load(key: string): Promise<string | null>;
  haptic?(kind: 'light' | 'success'): void;
  purchaseRemoveAds?(): Promise<boolean>;  // iOS and Android only
}
```

One implementation per target (`poki.ts`, `crazygames.ts`, `playgama.ts`, `capacitor.ts`, plus a `local.ts` that fakes ads in development).

## Level generation and difficulty

Levels are generated offline, graded by a human-style solver, and shipped as static JSON packs sorted into a sawtooth ramp. Difficulty comes from which deductions a level forces, not from board size alone.

**Generator pipeline**

1. Pick a board size and bush density for the target tier.
2. Place bushes (and any twist tiles) at random, optionally with mirror symmetry for nicer-looking boards.
3. Place fireflies until every path tile is lit with no conflicts. This is the hidden answer.
4. Derive each bush's number from the answer using the eight-neighbor rule.
5. Check uniqueness with an exhaustive solver that stops at 2 solutions. Not unique: reveal another bush's number or add a lantern, then check again.
6. Tune difficulty by clue removal: hide bush numbers one at a time while the puzzle stays unique. More hidden numbers means harder.
7. Grade it with the technique solver (below) and file it into a tier.

The rules engine, both solvers and the generator live in one pure TypeScript package with no DOM, so the game uses the same code for validation and hints that the generator used to build the level.

**Technique solver (the difficulty grader)**

It solves the way a person would, always trying the simplest technique first, and records which ones it needed.

| Tier | Technique | Example |
| --- | --- | --- |
| T1 | Bush bookkeeping | A bush already has its number: its other neighbors stay empty. It needs every open neighbor: fill them all |
| T2 | Only one light source | A dark tile that only one open tile can light: put a firefly there |
| T3 | Overlapping bushes | Two bushes share neighbors; their numbers together pin down the shared tiles |
| T4 | One-step lookahead | Placing here would leave some tile impossible to light: never place here |
| T5 | Deep trial | Needs a guess followed several steps ahead; reserve for late, optional "expert" gardens |

**Difficulty score** = the hardest technique required (dominant), plus how many times T3 or higher was needed, plus board size and step count as tie-breakers. The eight-neighbor rule makes bushes interact more than in standard Akari; the Phase 1 grader confirmed it, so overlapping bushes moved to T3, ahead of lookahead (changed 2026-11-12).

**Length limit.** No shipped level is estimated over five minutes, and the first chapter stays under one; the generator and CI enforce both (`DIFFICULTY_CONFIG.limits`).

**The ramp**

- **Sawtooth, not a straight line.** Each chapter climbs over 8 to 12 levels, ends on a peak, then drops to a breather. Constant climbing burns players out.
- **First 10 levels are T1 to T2 only**, 4x4 to 5x5, under a minute each.
- **New twist = new chapter.** The twist debuts on a T1 board, then joins the mix.
- **Never require a hint.** Every level is solvable by deduction alone (portal rules forbid levels that need a rewarded ad, and it feels bad).

**Tuning with real data.** Log per level: solve time, hints used, undos, restarts and quits. A level whose quit rate or hint rate is out of line with its tier gets moved, regenerated or cut. This is where the data background pays off: the ramp becomes a measured curve, not a guess.

## Monetization

Ads earn on session length, so the money follows retention: a game people keep playing out-earns one that squeezes every level. Monetize lightly, lean on rewarded ads, and let the difficulty ramp create natural hint moments instead of forcing them.

**Ad placements**

| Placement | When | Rules |
| --- | --- | --- |
| Midgame (interstitial) | On the level-complete screen, before the next board | None in the first session's first 5 levels. Request at every completion; the portal SDK enforces its own cap (CrazyGames: at most 1 per 3 minutes). Never on menu buttons |
| Rewarded: hint | Player taps Hint | Fixes one wrong firefly or places one correct one. Optional, clearly marked with a video icon, equal-size "no thanks" |
| Rewarded: coin doubler | Level-complete screen, occasionally | Never in the same break as a midgame ad (portal rule) |
| Rewarded: streak saver | Daily puzzle missed | Keeps the streak once per week |
| Banner | Not in v1 | Allowed only on screens open 5+ seconds, never during play; low value for this game |

**Coins keep rewarded ads optional.** Portals require an alternative to watching an ad, so players earn a few coins per solve and can buy hints with them. Coins also feed cosmetics later (garden decorations, firefly colors).

**How difficulty and ads interact**

- **Hint demand rises with difficulty.** The sawtooth peaks are where rewarded hints get used; the breathers are where players relax and keep going. That rhythm is the monetization curve.
- **Harder is not automatically better.** More hint views per level, but higher quit rates. Tune each tier against both numbers.
- **Targets to start with, then tune from data:** hint use around 10 to 25% of plays on peak levels, under 5% on breathers; quit rate on any level no worse than its tier's median by a wide margin.
- **Hints come from the solver,** so a hint is always a correct, explainable move, never a random reveal.
- **First session is protected.** No interstitials until the player has solved several levels and is clearly hooked. Meowdoku's biggest complaint is an ad after almost every level; we avoid that.

**By platform**

- **Web portals:** ad revenue share only (no purchases at first; CrazyGames offers purchases to invited games later).
- **iOS and Android:** AdMob rewarded and interstitial ads, plus a one-time **remove ads** purchase (forced ads off; rewarded hints stay available as an option). Later options: hint packs, a cosmetic garden pack.

## Data and storage

No database for v1. Levels are static files generated offline and shipped inside the build; player progress lives on the device. A backend only earns its place later, for features that genuinely need shared state.

| Data | Where it lives | Why |
| --- | --- | --- |
| Level packs | JSON files in the repo, generated by a script, bundled into the build | Thousands of small levels are a few hundred KB; works offline; versioned in git; no server to run |
| Level metadata (tier, score, techniques) | Same JSON, plus a manifest per pack | The ramp is a sorted list, built at generation time |
| Player progress, coins, settings | `localStorage` on web; the portal SDK's cloud save where offered (CrazyGames and Poki both have one); Capacitor Preferences on iOS | Per player, no account needed |
| Daily puzzle | Pre-generated a year ahead, picked by date in the client | Same puzzle for everyone without a server |
| Analytics (solve time, hints, quits) | Portal dashboards first; a lightweight event pipeline later | Needed for ramp tuning, not for play |

**Level file shape (draft)**

```json
{"id": "c02-l07", "area": "koi-pond", "w": 9, "h": 5, "tier": 2, "score": 22,
 "mask": ["#########", "###...###", "###...###", "###...###", "#########"],
 "bushes": [[0, 4, 0], [2, 1, 2], [2, 7, 2], [4, 4, null]],
 "twists": {"moonlit": [[0, 8]]},
 "solution": [[0, 0], [1, 1], [3, 1], [4, 2], [0, 6], [1, 7], [3, 7], [4, 8]],
 "techniques": ["T1", "T2"]}
```

`null` = a bush whose number is hidden. In the mask, # is an active cell and . is outside the garden (here, the pond). Levels are stored in one canonical orientation; the game rotates or mirrors them at load time. Every pack gets a CI check that re-solves each level and confirms exactly one solution.

**When a database would make sense (later, optional)**

- Global daily-puzzle leaderboards or "X% solved today" stats
- Cross-device progress on our own site, outside portal cloud saves
- Our own analytics events, if portal dashboards prove too coarse for ramp tuning

If we get there, reuse the DigiLab stack: Neon Postgres behind a few Vercel functions, with the same API hardening (rate limits, first-party checks, CORS allowlist). Until then, no server means no attack surface, no hosting bill and nothing to keep running.

## Repo setup and development principles

Carry over digilab-web's working loop almost unchanged; it already encodes the hard-won lessons. Trim what a no-backend game doesn't need (prod DB consent, admin roles, API key tiers) and add ratchets for game-specific invariants.

**Proposed structure**

```
firefly-garden/
  CLAUDE.md              how we work + codebase facts (start from digilab-web's)
  ARCHITECTURE.md        layers, adapters, data flow
  CHANGELOG.md  ROADMAP.md
  docs/plans/            YYYY-MM-DD-<topic>.md, checkboxes ticked as work lands
  docs/references/       rules spec, technique list, theme/asset contract
  packages/core/         rules, solvers, generator, grader (pure TS, no DOM)
  apps/game/             Vite + TS app: renderer, UI, audio, platform adapters
  levels/                generated packs + manifests (committed)
  scripts/               generate-levels, validate-levels, build-portal-zips
  ios/                   Capacitor project (added in phase 3)
  .github/workflows/ci.yml
  .claude/settings.json
```

**Carried over from digilab-web**

- **Plan first, replan when it breaks.** Non-trivial work gets a plan; multi-session work gets a `docs/plans/` file with checkboxes.
- **Branching.** Feature branches into `develop`; Claude opens the `develop` to `main` release PR; Michael merges. Never merge to `main` locally. Conventional commits that explain why.
- **Commit or push only when asked.**
- **CI on every release PR and `develop` push:** typecheck (`tsc --noEmit`, kept at zero errors), vitest, production build.
- **Pre-commit hook** runs the build; a Claude Code PostToolUse hook typechecks each edited `.ts` file (copy digilab-web's `.claude/settings.json`, including the `.env` deny rules).
- **Reviews before every substantive commit:** two parallel reviewer subagents, correctness and security, with the diff and untracked files; `/security-review` for anything that touches ad SDKs, purchases, storage or external input. Record the review the way digilab-web's `record-review.mjs` does.
- **Subagents** get a standalone brief and an explicit model, never an inherited one.
- **Root cause, simplest proper fix.** No `--no-verify`, no catch-and-ignore, no widening a ratchet baseline.
- **Done means demonstrated:** tests, typecheck, build, plus evidence (a screenshot or clip of the behavior, a generated pack that validates).
- **Living docs:** update CHANGELOG, ARCHITECTURE and ROADMAP with the change that warrants it.
- **Design tokens, never hardcoded colors or fonts,** so the placeholder-to-painted art swap is a theme change.
- **`npm audit` clean,** with the same refusal to take `--force` fixes that downgrade core packages.
- **Lessons go to the highest rung:** a test or ratchet first, then CLAUDE.md or a reference doc, then a memory.

**New, game-specific ratchets (tests that fail the build)**

- Every committed level re-solves to exactly one solution and matches its stored tier
- `packages/core` imports nothing from the DOM, the renderer or any SDK
- No portal or ad SDK is called outside `apps/game/src/platform/` (the adapter layer)
- Initial bundle stays under the size budget (8 MB for Poki)
- No level in the first chapter requires a technique above T2

**Security, scaled to a client-only game**

- No secrets in the client bundle; ad unit IDs are not secret but live in config, not scattered in code
- CSP on our own site, allowlisting only the ad SDK origins we use
- Treat anything from storage or a portal SDK as untrusted input (validate saved progress before using it)
- On iOS: purchase receipts validated by StoreKit or RevenueCat, never trusted from the client alone

## Milestones and roadmap

Six phases, each closed by a gate that has to pass before the next starts. Phase 1 is the real risk check: it proves the eight-neighbor rule makes good puzzles at scale before any art or SDK work.

The phases and gates (6 phases, 5 gates) live in [ROADMAP.md](ROADMAP.md). Gate 0 was reworded on 2026-11-12 because the mockup gardens turned out not to be unique.

No dates yet; each phase becomes a `docs/plans/` file with checkboxes when it starts. The first Claude Code session should cover Phase 0 and open the plan for Phase 1.

## Open questions

- [ ] Does the eight-neighbor rule produce enough distinct, interesting deductions at 8x8 and up, or do the bush numbers make bigger boards too easy? (The generator spike answers this.)
- [ ] Poki exclusive pitch, or go wide on CrazyGames and Playgama from day one? Note: Poki's web exclusivity means the game's own domain could only be a landing page, not a second playable copy.
- [ ] Run a trademark and App Store search on "Firefly Garden", then register the domain.
- [ ] Which analytics: portal dashboards only at first, or GA4 events from day one for ramp tuning?

**Decided**

- **Name:** Firefly Garden, pending the search above.
- **Own site:** the game gets its own domain. A playable copy if we go non-exclusive; a landing page with portal and App Store links if we sign with Poki.
- **Renderer:** PixiJS for the board and effects, plain DOM for menus and panels.
- **Paint the Kingdom:** a separate second game later, reusing the core package structure and platform adapters.
