// Generates the Phase 1 level pack, the chapter ramp, and the data behind the
// difficulty report. Deterministic: rerunning produces identical level files
// (the report data also records the date it was generated).
//
//   node scripts/generate-levels.ts
//
// Writes levels/spike.json, levels/manifest.json and reports/phase1-data.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  buildBoard, buildRamp, cellIndex, combine, DIFFICULTY_CONFIG, generate, grade, PLAYER_CONFIG, rampRoles, simulate,
  type ChapterSpec, type Economy, type SimLevel, type Generated, type GenSpec, type Level, type RampLevel, type ShapeId,
} from '../packages/core/src/index.ts';

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

// 1. Census: the committed pack and the gate evidence.
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

// 3. Ramp: the first three chapters, built from the census pool.
const chapterLimit = (id: string) =>
  DIFFICULTY_CONFIG.limits.chapterMaxSeconds[id] ?? DIFFICULTY_CONFIG.limits.maxSecondsAnyLevel;
const CHAPTERS: ChapterSpec[] = [
  { id: 'c1', title: 'The Rose Bed', count: 10, tiers: [1, 2], areas: [16, 25], maxSeconds: chapterLimit('c1') },
  { id: 'c2', title: 'The Orchard', count: 12, tiers: [1, 3], areas: [25, 49], maxSeconds: chapterLimit('c2') },
  { id: 'c3', title: 'The Koi Pond', count: 12, tiers: [2, 4], areas: [36, 100], maxSeconds: chapterLimit('c3') },
];
const pool: RampLevel[] = census.map(({ row: r }) => ({
  id: r.id, tier: r.tier, score: r.score, estimatedSeconds: r.estimatedSeconds, area: r.area, mechanics: [],
  tierSteps: [0, ...r.tierCounts],
}));
const chapters = buildRamp(pool, CHAPTERS);

// Write outputs.
mkdirSync('levels', { recursive: true });
mkdirSync('reports', { recursive: true });
writeFileSync('levels/spike.json', JSON.stringify({ pack: 'spike', levels: census.map((c) => c.level) }) + '\n');
writeFileSync('levels/manifest.json', JSON.stringify({
  packs: [{ file: 'spike.json', count: census.length }],
  chapters: chapters.map((c) => ({ id: c.id, title: c.title, levels: c.levels.map((l) => l.id) })),
}, null, 2) + '\n');
writeFileSync('reports/phase1-data.json', JSON.stringify({
  generatedAt: new Date().toISOString().slice(0, 10),
  census: census.map((c) => c.row),
  censusFailures,
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
const sizeOf = new Map(census.map(({ row: r }) => [r.id, `${r.w}x${r.h}`]));
const roles = new Map(chapters.flatMap((c) => {
  const r = rampRoles(c.levels);
  return c.levels.map((l, i) => [l.id, r[i]!] as const);
}));
writeFileSync('reports/dash/ramp.json', JSON.stringify(chapters.flatMap((c) => c.levels.map((l, i) => ({
  position: ++position, chapter: c.id, title: c.title, inChapter: i + 1, id: l.id, size: sizeOf.get(l.id),
  tier: l.tier, score: l.score, seconds: l.estimatedSeconds, role: roles.get(l.id),
})))));

// 4. Simulated players through chapters 1 to 3, and the hint-economy sweep.
const levelById = new Map(census.map((c) => [c.level.id, c.level]));
const simLevels: SimLevel[] = chapters.flatMap((c) => c.levels.map((l) => {
  const g = grade(buildBoard(levelById.get(l.id)!));
  return { id: l.id, chapter: c.id, role: roles.get(l.id)!, steps: g.steps.map((s) => ({ tier: s.tier, width: s.width })), fireflies: g.fireflies.length };
}));
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
function summarize(economy: Economy) {
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
    shipped: economy.startingCoins === s.startingCoins && economy.coinsPerSolve === s.coinsPerSolve
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
    economyRows.push({ key: `perAd-${name}-${n}`, group: `perAd-${name}`, ...summarize({ ...base, hintsPerAd: n }) });
  }
}
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

console.log(`census: ${census.length} levels (${censusFailures} specs failed)`);
console.log(`chapters: ${chapters.map((c) => `${c.id}=${c.levels.length}${c.shortfall ? ` (short ${c.shortfall})` : ''}`).join(', ')}`);
console.log(`simulated: ${PLAYER_CONFIG.profiles.length} profiles x ${PLAYER_CONFIG.runs} players, ${economyRows.length} economies`);
console.log(`done in ${((performance.now() - started) / 1000).toFixed(1)}s`);
