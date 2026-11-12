// Generates the launch pack (main-path chapters plus the reserve), and the data
// behind the difficulty report. Deterministic: rerunning produces identical
// level files (the report data also records the date it was generated).
//
//   node scripts/generate-levels.ts
//
// Writes levels/launch.json, levels/reserve.json, levels/manifest.json and
// reports/ (census gate evidence, simulations, report tables).
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  buildBoard, buildRamp, canonicalKey, cellIndex, combine, DIFFICULTY_CONFIG, generate, grade, measure, PLAYER_CONFIG, rampRoles,
  simulate, simulateWithPolicy,
  type Economy, type SimLevel, type Generated, type GenSpec, type Level, type RampLevel, type ShapeId,
} from '../packages/core/src/index.ts';
import { launchPlan, reservePlan } from './launch-plan.ts';

const SIZES = [4, 5, 6, 7, 8, 9, 10];
const PER_SIZE_PER_MODE = 18;
const MODES = ['none', 'max'] as const;
const SHAPE_CYCLE: ShapeId[] = ['rect', 'rect', 'ring', 'L', 'bridge', 'crescent'];

interface Row {
  id: string;
  set: string;
  w: number;
  h: number;
  area: number;
  shape: ShapeId;
  mode: 'none' | 'max';
  variant: string;
  tier: number;
  score: number;
  estimatedSeconds: number;
  steps: number;
  t3PlusSteps: number;
  narrowSteps: number;
  minWidth: number | null;
  bushes: number;
  hiddenBushes: number;
  fireflies: number;
  tierCounts: number[];
  techniques: Record<string, number>;
  /** Share of steps whose justification involves a mushroom (null without mushrooms). */
  twistParticipation: number | null;
  attempts: number;
  repairs: number;
}

function row(gen: Generated, set: string, spec: GenSpec, variant: string): Row {
  const d = gen.difficulty;
  const techniques: Record<string, number> = {};
  for (const s of gen.grade.steps) techniques[s.technique] = (techniques[s.technique] ?? 0) + 1;

  let twistParticipation: number | null = null;
  const t = gen.level.twists;
  const twistCells = new Set<number>((t?.mushrooms ?? []).map(([r, c]) => cellIndex(gen.board, [r, c])));
  if (twistCells.size > 0 && gen.grade.steps.length > 0) {
    const involved = gen.grade.steps.filter((s) => s.because.some((b) => twistCells.has(b))).length;
    twistParticipation = involved / gen.grade.steps.length;
  }

  return {
    id: gen.level.id, set, w: spec.w, h: spec.h, area: spec.w * spec.h, shape: spec.shape ?? 'rect',
    mode: spec.hide ?? 'none', variant, tier: d.tier, score: d.score, estimatedSeconds: d.estimatedSeconds,
    steps: d.features.steps, t3PlusSteps: d.features.t3PlusSteps, narrowSteps: d.features.narrowSteps,
    minWidth: Number.isFinite(d.features.minWidth) ? d.features.minWidth : null,
    bushes: d.features.bushes, hiddenBushes: d.features.hiddenBushes, fireflies: d.features.fireflies,
    tierCounts: gen.grade.tierCounts.slice(1, 6), techniques, twistParticipation,
    attempts: gen.attempts, repairs: gen.repairs,
  };
}

const started = performance.now();

// 1. Census: the Phase 1 gate evidence (sizes 4 to 10, all clues and hidden clues).
// Report data only; it is not shipped.
const census: { level: Level; row: Row }[] = [];
let censusFailures = 0;
for (const size of SIZES) {
  for (const mode of MODES) {
    for (let i = 0; i < PER_SIZE_PER_MODE; i++) {
      const shape = size >= 6 ? SHAPE_CYCLE[i % SHAPE_CYCLE.length]! : 'rect';
      const spec: GenSpec = {
        id: `spike-${size}x${size}-${mode}-${String(i).padStart(2, '0')}`,
        seed: size * 10_000 + i * 7 + (mode === 'max' ? 1 : 0),
        w: size, h: size, shape, bushDensity: 0.14 + (i % 5) * 0.02, hide: mode,
        maxSeconds: DIFFICULTY_CONFIG.limits.maxSecondsAnyLevel,
        symmetric: i % 3 === 0,
      };
      const gen = generate(spec);
      if (!gen) {
        censusFailures++;
        continue;
      }
      census.push({ level: gen.level, row: row(gen, 'census', spec, 'base') });
    }
  }
}

// 2. The three-way mushroom experiment that chose the 4-neighbor mushroom is
// archived in reports/archive/mushroom-experiment-2026-11-12.json; the losing
// variants no longer exist in core, so it is not regenerated.

// 3. The launch pack: each chapter's own candidate pool, then the ramp builder
// picks and orders each chapter. Rotations and mirrors of an earlier level are skipped.
const plans = launchPlan();
const seenKeys = new Set<string>();
interface Made { level: Level; size: string; ramp: RampLevel }
const made = new Map<string, Made>();
let launchFailures = 0;
let duplicatesSkipped = 0;
const mechanicsOf = (l: Level, shape: ShapeId) => [
  ...Object.entries(l.twists ?? {}).filter(([, v]) => Array.isArray(v) && v.length > 0).map(([k]) => k),
  ...(shape === 'rect' ? [] : ['shaped']),
].sort();
for (const plan of plans) {
  for (const spec of plan.pool) {
    const gen = generate(spec);
    if (!gen) {
      launchFailures++;
      continue;
    }
    const key = canonicalKey(gen.level);
    if (seenKeys.has(key)) {
      duplicatesSkipped++;
      continue;
    }
    seenKeys.add(key);
    const d = gen.difficulty;
    made.set(gen.level.id, {
      level: gen.level, size: `${spec.w}x${spec.h}`,
      ramp: {
        id: gen.level.id, tier: d.tier, score: d.score, estimatedSeconds: d.estimatedSeconds, area: spec.w * spec.h,
        mechanics: mechanicsOf(gen.level, spec.shape ?? 'rect'), tierSteps: [0, ...gen.grade.tierCounts.slice(1, 6)], pool: plan.spec.id,
      },
    });
  }
}
const chapters = buildRamp([...made.values()].map((m) => m.ramp), plans.map((p) => p.spec));
const planById = new Map(plans.map((p) => [p.spec.id, p]));

const RESERVE_SIZE = 250;
const reserveLevels: Level[] = [];
for (const spec of reservePlan()) {
  if (reserveLevels.length >= RESERVE_SIZE) break;
  const gen = generate(spec);
  if (!gen) continue;
  const key = canonicalKey(gen.level);
  if (seenKeys.has(key)) {
    duplicatesSkipped++;
    continue;
  }
  seenKeys.add(key);
  reserveLevels.push(gen.level);
}

// Write outputs.
mkdirSync('levels', { recursive: true });
mkdirSync('reports', { recursive: true });
const launchLevels = chapters.flatMap((c) => c.levels.map((l) => made.get(l.id)!.level));
writeFileSync('levels/launch.json', JSON.stringify({ pack: 'launch', levels: launchLevels }) + '\n');
writeFileSync('levels/reserve.json', JSON.stringify({ pack: 'reserve', levels: reserveLevels }) + '\n');
writeFileSync('levels/manifest.json', JSON.stringify({
  packs: [{ file: 'launch.json', count: launchLevels.length }, { file: 'reserve.json', count: reserveLevels.length }],
  chapters: chapters.map((c) => ({
    id: c.id, title: c.title, area: planById.get(c.id)!.area, debut: planById.get(c.id)!.debut, levels: c.levels.map((l) => l.id),
  })),
}, null, 2) + '\n');
writeFileSync('reports/phase1-data.json', JSON.stringify({
  generatedAt: new Date().toISOString().slice(0, 10),
  census: census.map((c) => c.row),
  censusFailures,
  launch: { chapters: chapters.length, levels: launchLevels.length, reserve: reserveLevels.length, launchFailures, duplicatesSkipped },
  chapters: chapters.map((c) => ({ id: c.id, title: c.title, shortfall: c.shortfall, levels: c.levels })),
}) + '\n');

// Flat, chart-ready tables for the difficulty report (attached to it as files).
mkdirSync('reports/dash', { recursive: true });
const TECHS = ['T1-satisfied', 'T1-needs-all', 'T2-one-source', 'T2-bush-room', 'T3-overlap', 'T4-lookahead', 'T5-trial'];
const modeLabel = (m: string) => (m === 'max' ? 'Hidden clues' : 'All clues');
writeFileSync('reports/dash/census.json', JSON.stringify(census.map(({ row: r }) => ({
  id: r.id, size: r.w, mode: modeLabel(r.mode), shape: r.shape, tier: r.tier,
  score: r.score, seconds: r.estimatedSeconds, steps: r.steps, t3PlusSteps: r.t3PlusSteps,
  bushes: r.bushes, hiddenBushes: r.hiddenBushes,
  ...Object.fromEntries(TECHS.map((t) => [t, r.techniques[t] ?? 0])),
}))));
let position = 0;
const sizeOf = new Map([...made.values()].map((m) => [m.level.id, m.size]));
const firstChapters = chapters.slice(0, 3);
const roles = new Map(chapters.flatMap((c) => {
  const r = rampRoles(c.levels);
  return c.levels.map((l, i) => [l.id, r[i]!] as const);
}));
writeFileSync('reports/dash/ramp.json', JSON.stringify(firstChapters.flatMap((c) => c.levels.map((l, i) => ({
  position: ++position, chapter: c.id, title: c.title, inChapter: i + 1, id: l.id, size: sizeOf.get(l.id),
  tier: l.tier, score: l.score, seconds: l.estimatedSeconds, role: roles.get(l.id),
})))));

// 4. Simulated players through chapters 1 to 3, and the hint-economy sweep.
const levelById = new Map([...launchLevels, ...reserveLevels].map((l) => [l.id, l]));
const toSim = (id: string, chapter: string, role: SimLevel['role']): SimLevel => {
  const level = levelById.get(id)!;
  const board = buildBoard(level);
  const g = grade(board);
  const d = measure(level, board, g);
  return {
    id, chapter, role, steps: g.steps.map((s) => ({ tier: s.tier, width: s.width })), fireflies: g.fireflies.length,
    tier: d.tier, score: d.score, estimatedSeconds: d.estimatedSeconds,
  };
};
const simLevels: SimLevel[] = firstChapters.flatMap((c) => c.levels.map((l) => toSim(l.id, c.id, roles.get(l.id)!)));
const runAll = (economy: Economy) => PLAYER_CONFIG.profiles.map((p, k) => simulate(simLevels, p, economy, PLAYER_CONFIG.runs, 4242 + k));
const shipped = runAll(PLAYER_CONFIG.economy);
const pop = combine(shipped, PLAYER_CONFIG.profiles);
let simPosition = 0;
writeFileSync('reports/dash/players.json', JSON.stringify(simLevels.flatMap((l, i) => {
  simPosition++;
  const rows = shipped.map((r, k) => {
    const o = r.levels[i]!;
    return {
      key: `${l.id}|${r.profile}`, position: simPosition, id: l.id, chapter: l.chapter, role: l.role,
      profile: r.profile, label: PLAYER_CONFIG.profiles[k]!.label,
      survival: o.reached / r.runs, cleared: o.solved / r.runs,
      hintRate: o.plays ? o.hintedPlays / o.plays : 0, quitRate: o.plays ? o.quits / o.plays : 0,
    };
  });
  const p = pop[i]!;
  const cleared = rows.reduce((a, r, k) => a + PLAYER_CONFIG.profiles[k]!.share * r.cleared, 0);
  return [...rows, {
    key: `${l.id}|all`, position: simPosition, id: l.id, chapter: l.chapter, role: l.role,
    profile: 'all', label: 'Everyone', survival: p.survival, cleared, hintRate: p.hintRate, quitRate: p.quitRate,
  }];
})));
/** Population-weighted summary of one economy across every profile. */
function summarize(economy: Economy, canBeShipped = true) {
  const res = runAll(economy);
  let coin = 0, ad = 0, refused = 0, banked = 0, finish = 0, interstitials = 0, rewarded = 0, minutes = 0;
  res.forEach((r, k) => {
    const w = PLAYER_CONFIG.profiles[k]!.share;
    finish += (w * r.finished) / r.runs;
    interstitials += w * r.interstitialsPerPlayer;
    rewarded += w * r.rewardedPerPlayer;
    minutes += w * r.minutesPerPlayer;
    for (const o of r.levels) {
      coin += (w * o.coinHints) / r.runs;
      ad += (w * o.adHints) / r.runs;
      refused += (w * o.refusedHints) / r.runs;
      banked += (w * o.bankedHints) / r.runs;
    }
  });
  const asked = coin + ad + refused + banked;
  const s = PLAYER_CONFIG.economy;
  return {
    ...economy,
    shipped: canBeShipped && economy.startingCoins === s.startingCoins && economy.coinsPerSolve === s.coinsPerSolve
      && economy.hintCost === s.hintCost && economy.hintsPerAd === s.hintsPerAd,
    finish, newcomerFinish: res[0]!.finished / res[0]!.runs,
    coinShare: asked ? coin / asked : 0, adShare: asked ? ad / asked : 0,
    bankedShare: asked ? banked / asked : 0, refusedShare: asked ? refused / asked : 0,
    casualEndCoins: Math.round(res[1]!.meanEndCoins),
    interstitialsPerPlayer: interstitials, rewardedPerPlayer: rewarded,
    adViewsPerPlayer: interstitials + rewarded, minutesPerPlayer: minutes,
  };
}

const hintsPerAd = PLAYER_CONFIG.economy.hintsPerAd;
const economyRows = [];
for (const startingCoins of PLAYER_CONFIG.sweep.startingCoins) {
  for (const coinsPerSolve of PLAYER_CONFIG.sweep.coinsPerSolve) {
    for (const hintCost of PLAYER_CONFIG.sweep.hintCost) {
      economyRows.push({ key: `${startingCoins}-${coinsPerSolve}-${hintCost}`, group: 'sweep', ...summarize({ startingCoins, coinsPerSolve, hintCost, hintsPerAd }) });
    }
  }
}
// Hints per rewarded ad, at the shipped economy and at a tight one where ads matter.
const TIGHT: Omit<Economy, 'hintsPerAd'> = { startingCoins: 30, coinsPerSolve: 10, hintCost: 60 };
for (const [name, base] of [['shipped', PLAYER_CONFIG.economy], ['tight', TIGHT]] as const) {
  for (const n of PLAYER_CONFIG.sweep.hintsPerAd) {
    // Only the sweep row carries the shipped flag, so it is unique across the file.
    economyRows.push({ key: `perAd-${name}-${n}`, group: `perAd-${name}`, ...summarize({ ...base, hintsPerAd: n }, false) });
  }
}
// 5. Next-level policy: the same players with detours (warm-ups, breathers) from
// the reserve pack, with no assumed effect on quitting and with an assumed one.
const reserve = reserveLevels.map((l) => toSim(l.id, 'extra', 'climb'));
const ASSUMED_CHURN_FACTOR = 0.7;
const policyRows = [];
for (const [variant, label, run] of [
  ['none', 'No policy', () => shipped],
  ['policy', 'Policy, no assumed effect', () => PLAYER_CONFIG.profiles.map((p, k) =>
    simulateWithPolicy(simLevels, p, PLAYER_CONFIG.economy, PLAYER_CONFIG.runs, 4242 + k, { reserve, churnFactorWithBreather: 1 }))],
  ['policy-assumed', `Policy, ${Math.round((1 - ASSUMED_CHURN_FACTOR) * 100)}% fewer leave after a quit (assumed)`, () => PLAYER_CONFIG.profiles.map((p, k) =>
    simulateWithPolicy(simLevels, p, PLAYER_CONFIG.economy, PLAYER_CONFIG.runs, 4242 + k, { reserve, churnFactorWithBreather: ASSUMED_CHURN_FACTOR }))],
] as const) {
  const res = run();
  const rows = res.map((r, k) => {
    const detours = 'detoursPerPlayer' in r ? (r as { detoursPerPlayer: Record<string, number> }).detoursPerPlayer : {};
    return {
      key: `${variant}|${r.profile}`, variant, variantLabel: label, profile: r.profile, label: PLAYER_CONFIG.profiles[k]!.label,
      share: PLAYER_CONFIG.profiles[k]!.share, finished: r.finished / r.runs, minutes: r.minutesPerPlayer,
      adViews: r.interstitialsPerPlayer + r.rewardedPerPlayer,
      warmups: detours['warm-up'] ?? 0,
      breathers: (detours['breather-after-quit'] ?? 0) + (detours['breather-after-long'] ?? 0) + (detours['breather-after-hints'] ?? 0),
    };
  });
  const w = (f: (x: (typeof rows)[number]) => number) => rows.reduce((a, x) => a + x.share * f(x), 0);
  policyRows.push(...rows, {
    key: `${variant}|all`, variant, variantLabel: label, profile: 'all', label: 'Everyone', share: 1,
    finished: w((x) => x.finished), minutes: w((x) => x.minutes), adViews: w((x) => x.adViews),
    warmups: w((x) => x.warmups), breathers: w((x) => x.breathers),
  });
}
writeFileSync('reports/dash/policy.json', JSON.stringify(policyRows));

// Ad views per player under the shipped economy, by kind of player.
writeFileSync('reports/dash/ads.json', JSON.stringify([
  ...shipped.map((r, k) => ({
    profile: r.profile, label: PLAYER_CONFIG.profiles[k]!.label, share: PLAYER_CONFIG.profiles[k]!.share,
    interstitials: r.interstitialsPerPlayer, rewarded: r.rewardedPerPlayer, minutes: r.minutesPerPlayer,
    finished: r.finished / r.runs,
  })),
  (() => {
    const w = (f: (r: (typeof shipped)[number]) => number) => shipped.reduce((a, r, k) => a + PLAYER_CONFIG.profiles[k]!.share * f(r), 0);
    return {
      profile: 'all', label: 'Everyone', share: 1, interstitials: w((r) => r.interstitialsPerPlayer),
      rewarded: w((r) => r.rewardedPerPlayer), minutes: w((r) => r.minutesPerPlayer), finished: w((r) => r.finished / r.runs),
    };
  })(),
]));
writeFileSync('reports/dash/economy.json', JSON.stringify(economyRows));

// 6. The whole launch pack: per-chapter summary, and how far simulated players get
// through all of it (shipped economy, next-level policy on, no assumed effect).
const chapterRows = chapters.map((c, k) => {
  const ls = c.levels;
  const plan = planById.get(c.id)!;
  const has = (m: string) => ls.filter((l) => l.mechanics.includes(m)).length / Math.max(1, ls.length);
  return {
    index: k + 1, id: c.id, title: c.title, area: plan.area, debut: plan.debut ?? '', levels: ls.length, shortfall: c.shortfall,
    meanScore: ls.reduce((a, l) => a + l.score, 0) / Math.max(1, ls.length), peakScore: Math.max(...ls.map((l) => l.score)),
    minutes: ls.reduce((a, l) => a + l.estimatedSeconds, 0) / 60,
    maxTier: Math.max(...ls.map((l) => l.tier)), maxArea: Math.max(...ls.map((l) => l.area)),
    mushrooms: has('mushrooms'), moonlit: has('moonlit'), lanterns: has('lanterns'), shaped: has('shaped'),
  };
});
writeFileSync('reports/dash/chapters.json', JSON.stringify(chapterRows));
const journeyLevels: SimLevel[] = chapters.flatMap((c) => c.levels.map((l) => toSim(l.id, c.id, roles.get(l.id)!)));
const JOURNEY_RUNS = 300;
const journey = PLAYER_CONFIG.profiles.map((p, k) =>
  simulateWithPolicy(journeyLevels, p, PLAYER_CONFIG.economy, JOURNEY_RUNS, 9090 + k, { reserve, churnFactorWithBreather: 1 }));
const lastIndexOf = new Map(chapters.map((c) => [c.id, journeyLevels.map((l) => l.chapter).lastIndexOf(c.id)]));
const journeyRows = chapters.flatMap((c, ci) => {
  const i = lastIndexOf.get(c.id)!;
  const rows = journey.map((r, k) => ({
    key: `${c.id}|${r.profile}`, index: ci + 1, chapter: c.id, title: c.title, profile: r.profile,
    label: PLAYER_CONFIG.profiles[k]!.label, cleared: r.levels[i]!.solved / r.runs,
  }));
  const all = rows.reduce((a, row, k) => a + PLAYER_CONFIG.profiles[k]!.share * row.cleared, 0);
  return [...rows, { key: `${c.id}|all`, index: ci + 1, chapter: c.id, title: c.title, profile: 'all', label: 'Everyone', cleared: all }];
});
writeFileSync('reports/dash/journey.json', JSON.stringify(journeyRows));
const journeySummary = PLAYER_CONFIG.profiles.map((p, k) => ({
  profile: p.id, minutes: journey[k]!.minutesPerPlayer, adViews: journey[k]!.interstitialsPerPlayer + journey[k]!.rewardedPerPlayer,
}));

console.log(`census: ${census.length} levels (${censusFailures} specs failed)`);
console.log(`launch: ${chapters.length} chapters, ${launchLevels.length} main levels, ${reserveLevels.length} reserve (${launchFailures} specs failed, ${duplicatesSkipped} duplicates skipped)`);
const short = chapters.filter((c) => c.shortfall > 0);
if (short.length) console.log(`short chapters: ${short.map((c) => `${c.id}-${c.shortfall}`).join(', ')}`);
console.log(`journey: ${journeySummary.map((j) => `${j.profile} ${j.minutes.toFixed(0)}min`).join(', ')}`);
console.log(`simulated: ${PLAYER_CONFIG.profiles.length} profiles x ${PLAYER_CONFIG.runs} players, ${economyRows.length} economies`);
console.log(`done in ${((performance.now() - started) / 1000).toFixed(1)}s`);
