// Generates the Phase 1 level pack, the chapter ramp, and the data behind the
// difficulty report. Deterministic: rerunning produces identical level files
// (the report data also records the date it was generated).
//
//   node scripts/generate-levels.ts
//
// Writes levels/spike.json, levels/manifest.json and reports/phase1-data.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  buildRamp, cellIndex, DIFFICULTY_CONFIG, generate, type ChapterSpec, type Generated, type GenSpec, type Level, type RampLevel, type ShapeId,
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
const CHAPTERS: ChapterSpec[] = [
  { id: 'c1', title: 'The Rose Bed', count: 10, tiers: [1, 2], areas: [16, 25], maxSeconds: DIFFICULTY_CONFIG.limits.maxSecondsChapter1 },
  { id: 'c2', title: 'The Orchard', count: 12, tiers: [1, 3], areas: [25, 49] },
  { id: 'c3', title: 'The Koi Pond', count: 12, tiers: [2, 4], areas: [36, 100] },
];
const pool: RampLevel[] = census.map(({ row: r }) => ({
  id: r.id, tier: r.tier, score: r.score, estimatedSeconds: r.estimatedSeconds, area: r.area, mechanics: [],
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
writeFileSync('reports/dash/ramp.json', JSON.stringify(chapters.flatMap((c) => c.levels.map((l, i) => ({
  position: ++position, chapter: c.id, title: c.title, inChapter: i + 1, id: l.id, size: sizeOf.get(l.id),
  tier: l.tier, score: l.score, seconds: l.estimatedSeconds,
})))));

console.log(`census: ${census.length} levels (${censusFailures} specs failed)`);
console.log(`chapters: ${chapters.map((c) => `${c.id}=${c.levels.length}${c.shortfall ? ` (short ${c.shortfall})` : ''}`).join(', ')}`);
console.log(`done in ${((performance.now() - started) / 1000).toFixed(1)}s`);
