// The "firefly jar" experiment (2026-11-12): how much easier does knowing the
// total number of fireflies make each shipped level under the grader?
//
//   node scripts/experiment-count.ts
//
// Grades every launch level (chapter order from levels/manifest.json) and every
// reserve level with and without `knownCount`, measures both with `measure`, and
// writes reports/archive/count-experiment-2026-11-12.json. Read-only on levels/.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBoard, grade, measure, parseLevel, rampRoles, type Difficulty, type Level } from '../packages/core/src/index.ts';
import { launchPlan } from './launch-plan.ts';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'reports', 'archive', 'count-experiment-2026-11-12.json');
const COUNT_TECHNIQUES = ['T1-count-complete', 'T3-count-bound'] as const;

const load = (file: string): Level[] =>
  (JSON.parse(readFileSync(join(ROOT, 'levels', file), 'utf8')) as { levels: unknown[] }).levels.map((l) => parseLevel(l));
const byId = new Map([...load('launch.json'), ...load('reserve.json')].map((l) => [l.id, l]));
const manifest = JSON.parse(readFileSync(join(ROOT, 'levels', 'manifest.json'), 'utf8')) as {
  chapters: { id: string; debut: string | null; levels: string[] }[];
};
const reserve = load('reserve.json');
const intended = new Map(launchPlan().map((p) => [p.spec.id, p.spec.tiers]));

interface Side { tier: number; score: number; seconds: number; steps: number }
interface Row {
  id: string;
  pack: 'launch' | 'reserve';
  chapter: string | null;
  inChapter: number | null;
  role: string | null;
  fireflies: number;
  without: Side;
  with: Side;
  /**
   * The count trace measured with its count steps free. Count steps mostly rule
   * out tiles that a later firefly would have lit anyway (no step, no time), and
   * the time model charges every step, so the true effect lies between `with`
   * and this.
   */
  withCountFree: Side;
  /** Tier 3 with the count only because of count-bound steps (would drop if it were tier 2). */
  t3OnlyViaCount: boolean;
  /** How often each count technique decided a cell. */
  countSteps: Record<string, number>;
  /** Index of the first count step in the trace, as a share of the trace (null if none fired). */
  firstCountAt: number | null;
}

const side = (d: Difficulty): Side => ({ tier: d.tier, score: d.score, seconds: d.estimatedSeconds, steps: d.features.steps });

function run(level: Level, pack: Row['pack'], chapter: string | null, inChapter: number | null, role: string | null): Row {
  const board = buildBoard(level);
  const total = level.solution!.length;
  const plain = grade(board);
  const counted = grade(board, { knownCount: total });
  if (!plain.solved || !counted.solved) throw new Error(`${level.id}: grader did not finish`);
  const countSteps: Record<string, number> = {};
  let first: number | null = null;
  counted.steps.forEach((s, i) => {
    if ((COUNT_TECHNIQUES as readonly string[]).includes(s.technique)) {
      countSteps[s.technique] = (countSteps[s.technique] ?? 0) + 1;
      first ??= i;
    }
  });
  return {
    id: level.id, pack, chapter, inChapter, role, fireflies: total,
    without: side(measure(level, board, plain)), with: side(measure(level, board, counted)),
    withCountFree: side(measure(level, board, {
      ...counted, steps: counted.steps.filter((s) => !(COUNT_TECHNIQUES as readonly string[]).includes(s.technique)),
    })),
    t3OnlyViaCount: counted.maxTier === 3 && counted.steps.every((s) => s.tier !== 3 || s.technique === 'T3-count-bound'),
    countSteps, firstCountAt: first === null ? null : Math.round((first / counted.steps.length) * 100) / 100,
  };
}

const rows: Row[] = [];
for (const c of manifest.chapters) {
  const levels = c.levels.map((id) => byId.get(id)!);
  const roles = rampRoles(levels.map((l) => ({ score: l.score! })));
  levels.forEach((l, i) => rows.push(run(l, 'launch', c.id, i + 1, roles[i]!)));
}
for (const l of reserve) rows.push(run(l, 'reserve', null, null, null));

// ---------------------------------------------------------------------------
// Summary

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

function tierHistogram(tiers: number[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const t of [...tiers].sort()) h[`T${t}`] = (h[`T${t}`] ?? 0) + 1;
  return h;
}

function group(rs: Row[]) {
  const transitions: Record<string, number> = {};
  for (const r of rs) {
    if (r.with.tier !== r.without.tier) {
      const k = `T${r.without.tier}->T${r.with.tier}`;
      transitions[k] = (transitions[k] ?? 0) + 1;
    }
  }
  const secWithout = mean(rs.map((r) => r.without.seconds));
  const secWith = mean(rs.map((r) => r.with.seconds));
  const secFree = mean(rs.map((r) => r.withCountFree.seconds));
  return {
    levels: rs.length,
    countFired: rs.filter((r) => Object.keys(r.countSteps).length > 0).length,
    countBoundFired: rs.filter((r) => r.countSteps['T3-count-bound'] !== undefined).length,
    tierChanged: rs.filter((r) => r.with.tier !== r.without.tier).length,
    transitions,
    scoreChanged: rs.filter((r) => r.with.score !== r.without.score).length,
    meanScoreWithout: round(mean(rs.map((r) => r.without.score))),
    meanScoreWith: round(mean(rs.map((r) => r.with.score))),
    meanScoreDelta: round(mean(rs.map((r) => r.with.score - r.without.score)), 2),
    meanSecondsWithout: round(secWithout),
    meanSecondsWith: round(secWith),
    meanSecondsDelta: round(secWith - secWithout, 2),
    secondsDeltaPct: round(secWithout === 0 ? 0 : ((secWith - secWithout) / secWithout) * 100, 1),
    meanScoreWithCountFree: round(mean(rs.map((r) => r.withCountFree.score))),
    meanSecondsWithCountFree: round(secFree),
    secondsDeltaPctCountFree: round(secWithout === 0 ? 0 : ((secFree - secWithout) / secWithout) * 100, 1),
    meanStepsWithout: round(mean(rs.map((r) => r.without.steps))),
    meanStepsWith: round(mean(rs.map((r) => r.with.steps))),
    levelsWithout: tierHistogram(rs.map((r) => r.without.tier)),
    levelsWith: tierHistogram(rs.map((r) => r.with.tier)),
    /** Sensitivity: T3 levels that would become T2 if count-bound were tier 2. */
    t3OnlyViaCount: rs.filter((r) => r.t3OnlyViaCount).length,
  };
}

/** The ratchet's view of a chapter: tiers new to the main path so far (above the chapter's easiest). */
function freshTiers(tiers: number[], seen: Set<number>): number[] {
  const base = Math.min(...tiers);
  return [...new Set(tiers)].filter((t) => t > base && !seen.has(t)).sort();
}

const seenWithout = new Set<number>();
const seenWith = new Set<number>();
const chapters = manifest.chapters.map((c) => {
  const rs = rows.filter((r) => r.chapter === c.id);
  const [lo, hi] = intended.get(c.id) ?? [0, 0];
  const tw = rs.map((r) => r.without.tier), tc = rs.map((r) => r.with.tier);
  const debutWithout = freshTiers(tw, seenWithout), debutWith = freshTiers(tc, seenWith);
  for (const t of tw) seenWithout.add(t);
  for (const t of tc) seenWith.add(t);
  const peakWith = Math.max(...rs.map((r) => r.with.score));
  const last = rs.at(-1)!;
  const debut = debutWithout[0];
  return {
    id: c.id,
    debut: c.debut,
    intendedTiers: [lo, hi],
    ...group(rs),
    maxTierWithout: Math.max(...tw),
    maxTierWith: Math.max(...tc),
    belowIntendedLow: rs.filter((r) => r.with.tier < lo).map((r) => r.id),
    droppedBelowOwnTier: rs.filter((r) => r.with.tier < r.without.tier).length,
    peak: last.id,
    peakStaysPeak: last.with.score === peakWith,
    peakScoreWithout: last.without.score,
    peakScoreWith: last.with.score,
    tierDebutWithout: debutWithout,
    tierDebutWith: debutWith,
    /** The chapter's own new tier (if any) still appears in it with the count known. */
    debutSurvives: debut === undefined ? null : tc.includes(debut),
    /** Levels at the debut tier without / with the count. */
    debutLevelsWithout: debut === undefined ? null : tw.filter((t) => t === debut).length,
    debutLevelsWith: debut === undefined ? null : tc.filter((t) => t === debut).length,
  };
});

const launchRows = rows.filter((r) => r.pack === 'launch');
const inChapters = (a: number, b: number) =>
  launchRows.filter((r) => { const k = Number(r.chapter!.slice(1)); return k >= a && k <= b; });
const ch1 = chapters[0]!;

const summary = {
  all: group(rows),
  launch: group(launchRows),
  reserve: group(rows.filter((r) => r.pack === 'reserve')),
  chapters1to3: group(inChapters(1, 3)),
  chapters4to20: group(inChapters(4, 20)),
  chapters21to40: group(inChapters(21, 40)),
  byRole: Object.fromEntries(['opener', 'climb', 'breather', 'peak'].map((role) => [role, group(launchRows.filter((r) => r.role === role))])),
  levelsBelowChapterIntendedLow: chapters.flatMap((c) => c.belowIntendedLow),
  chaptersWhosePeakTierDrops: chapters.filter((c) => c.maxTierWith < c.maxTierWithout).map((c) => c.id),
  chaptersWherePeakStopsBeingPeak: chapters.filter((c) => !c.peakStaysPeak).map((c) => c.id),
  tierDebuts: chapters.filter((c) => c.tierDebutWithout.length > 0).map((c) => ({
    chapter: c.id, tier: c.tierDebutWithout[0], survives: c.debutSurvives,
    levelsWithout: c.debutLevelsWithout, levelsWith: c.debutLevelsWith, newTiersWithCount: c.tierDebutWith,
  })),
  chapter1StaysAtMostT2: ch1.maxTierWith <= 2,
  /** How far into the trace the first count step lands, on levels where one fired. */
  meanFirstCountAt: round(mean(rows.filter((r) => r.firstCountAt !== null).map((r) => r.firstCountAt!)), 2),
};

// The archive is frozen: it records the pack as it was when the decision was made.
if (existsSync(OUT)) {
  console.error(`${OUT} exists and is archived; write a new dated file instead of overwriting it.`);
  process.exit(1);
}
writeFileSync(OUT, `${JSON.stringify({
  experiment: 'firefly jar: grading with the total firefly count known (GradeOptions.knownCount)',
  date: '2026-11-12',
  techniques: { 'T1-count-complete': 1, 'T3-count-bound': 3 },
  summary, chapters, rows,
}, null, 1)}\n`);

const s = summary;
console.log(`levels ${s.all.levels}; count techniques fired on ${s.all.countFired} (bound on ${s.all.countBoundFired})`);
for (const [k, g] of [['all', s.all], ['ch1-3', s.chapters1to3], ['ch4-20', s.chapters4to20], ['ch21-40', s.chapters21to40], ['reserve', s.reserve]] as const) {
  console.log(`${k}: tier changed ${g.tierChanged}/${g.levels} ${JSON.stringify(g.transitions)}; score ${g.meanScoreWithout} -> ${g.meanScoreWith}; seconds ${g.meanSecondsWithout} -> ${g.meanSecondsWith} (${g.secondsDeltaPct}%, count-free ${g.secondsDeltaPctCountFree}%, score ${g.meanScoreWithCountFree}); tiers ${JSON.stringify(g.levelsWithout)} -> ${JSON.stringify(g.levelsWith)}; t3OnlyViaCount ${g.t3OnlyViaCount}`);
}
console.log(`below intended low tier: ${s.levelsBelowChapterIntendedLow.length}; peak tier drops: ${s.chaptersWhosePeakTierDrops.join(', ') || 'none'}; peaks lost: ${s.chaptersWherePeakStopsBeingPeak.join(', ') || 'none'}`);
console.log(`tier debuts: ${JSON.stringify(s.tierDebuts)}`);
console.log(`wrote ${OUT}`);
