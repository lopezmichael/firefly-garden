// The launch pack plan: which chapters exist, what each one teaches, and the
// generator specs that make its candidate pool. Content decisions live here;
// the pipeline that runs them is generate-levels.ts.
//
// Shape (project plan + Phase 1 findings):
// - 70 chapters, ~760 main-path levels, grouped into garden areas of 6.
// - Chapters 1 to 3 teach the techniques: T2 by chapter 1, T3 (overlap) debuts in
//   chapter 2, T4 (lookahead) in chapter 3. T5 stays off the main path.
// - Twists debut in the plan's order, one per chapter, each in a chapter where every
//   level uses it and the opener is an easy board, then join the mix:
//   mushrooms (ch 7), moonlit tiles (ch 13), lanterns (ch 19), shaped gardens (ch 25).
// - Boards grow from 4x4 to 10x10 (wider rectangles later) within the time limits.
// - A reserve of ~250 short, twist-free levels feeds warm-ups and breathers.
import { DIFFICULTY_CONFIG, type ChapterSpec, type GenSpec, type ShapeId } from '../packages/core/src/index.ts';

export interface ChapterPlan {
  readonly spec: ChapterSpec;
  readonly area: string;
  /** The twist or technique this chapter introduces, if any. */
  readonly debut: string | null;
  readonly pool: readonly GenSpec[];
}

export const AREAS = [
  'Rose Bed', 'Orchard', 'Koi Pond', 'Herb Spiral', 'Mushroom Glade', 'Willow Bend',
  'Moon Meadow', 'Fern Hollow', 'Lantern Walk', 'Lily Terrace', 'Stone Bridge', 'Old Greenhouse',
] as const;

export const CHAPTER_COUNT = 70;
const TWIST_DEBUTS: Readonly<Record<number, string>> = { 7: 'mushrooms', 13: 'moonlit', 19: 'lanterns', 25: 'shaped' };
const TWIST_START: Readonly<Record<string, number>> = { mushrooms: 7, moonlit: 13, lanterns: 19, shaped: 25 };
const SHAPES: readonly ShapeId[] = ['ring', 'L', 'bridge', 'crescent'];

/** Deterministic pseudo-random in [0, 1) from integers (no shared RNG state across chapters). */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function chapterLimit(k: number): number {
  const byId = DIFFICULTY_CONFIG.limits.chapterMaxSeconds[`c${k}`];
  if (byId !== undefined) return byId;
  // Keep the early game gentle: four minutes through chapter 10, five after.
  return k <= 10 ? 240 : DIFFICULTY_CONFIG.limits.maxSecondsAnyLevel;
}

/** Board edge range for chapter k. */
function edges(k: number): [number, number] {
  if (k === 1) return [4, 5];
  if (k === 2) return [5, 6];
  if (k === 3) return [6, 8];
  return [Math.min(7, 5 + Math.floor(k / 12)), Math.min(10, 7 + Math.floor(k / 8))];
}

function tiers(k: number, debut: string | null): [number, number] {
  if (k === 1) return [1, 2];
  if (k === 2) return [1, 3];
  if (k === 3) return [2, 4];
  // A new twist arrives on easier boards so only one new thing happens at a time.
  if (debut && debut !== 'shaped') return [1, 3];
  return [2, 4];
}

export function launchPlan(): ChapterPlan[] {
  const plans: ChapterPlan[] = [];
  for (let k = 1; k <= CHAPTER_COUNT; k++) {
    const id = `c${k}`;
    const debut = TWIST_DEBUTS[k] ?? (k === 2 ? 'T3' : k === 3 ? 'T4' : null);
    const area = AREAS[Math.floor((k - 1) / 6) % AREAS.length]!;
    const count = k <= 10 ? 10 : 11;
    const [tlo, thi] = tiers(k, TWIST_DEBUTS[k] ?? null);
    const [elo, ehi] = edges(k);
    const maxSeconds = chapterLimit(k);
    const active = (t: string) => k >= (TWIST_START[t] ?? Infinity);
    const twistDebut = TWIST_DEBUTS[k] ?? null;

    const pool: GenSpec[] = [];
    const candidates = count * 3;
    for (let i = 0; i < candidates; i++) {
      const r = (salt: number) => hash01(k * 1000 + i, salt);
      const w = elo + Math.floor(r(1) * (ehi - elo + 1));
      const h = Math.max(4, w - (k > 20 && r(2) < 0.4 ? 1 + Math.floor(r(3) * 2) : 0));
      const uses = (t: string) => twistDebut === t || (active(t) && r(10 + t.length) < 0.3);
      const shaped = uses('shaped') && w >= 5 && h >= 5;
      pool.push({
        id: `${id}-${String(i).padStart(2, '0')}`,
        seed: k * 100_000 + i * 13,
        w, h,
        shape: shaped ? SHAPES[Math.floor(r(4) * SHAPES.length)]! : 'rect',
        area: area.toLowerCase().replace(/ /g, '-'),
        bushDensity: 0.14 + r(5) * 0.08,
        hide: r(6) < 0.5 ? 'max' : 'none',
        maxTier: thi,
        targetTiers: [tlo, thi],
        maxSeconds,
        symmetric: r(7) < 0.3,
        ...(uses('mushrooms') ? { mushrooms: 0.06 + r(8) * 0.04 } : {}),
        ...(uses('moonlit') ? { moonlit: 0.05 + r(9) * 0.04 } : {}),
        ...(uses('lanterns') ? { fixedLanterns: 1 + Math.floor(r(11) * 2), lanterns: true } : {}),
      });
    }
    // Chapter 1 opens on pure bookkeeping (T1) boards, so newcomers have a few
    // easy wins before T2 arrives.
    if (k === 1) {
      for (let i = 0; i < 10; i++) {
        pool.push({
          id: `${id}-t1-${i}`, seed: k * 100_000 + 70_000 + i * 7, w: 4, h: 4, bushDensity: 0.2 + (i % 3) * 0.03,
          hide: 'none', maxTier: 1, targetTiers: [1, 1], maxSeconds, area: area.toLowerCase().replace(/ /g, '-'),
        });
      }
    }
    // Teaching candidates for a technique debut: needs it exactly once, small board.
    const techDebut = k === 1 ? 2 : k === 2 ? 3 : k === 3 ? 4 : null;
    if (techDebut) {
      for (let i = 0; i < 8; i++) {
        pool.push({
          id: `${id}-teach-${i}`, seed: k * 100_000 + 90_000 + i * 7, w: elo, h: elo,
          bushDensity: 0.16 + (i % 3) * 0.02, hide: 'max', maxTier: techDebut, targetTiers: [techDebut, techDebut],
          maxHardestSteps: 1, maxSeconds, area: area.toLowerCase().replace(/ /g, '-'),
        });
      }
    }
    // Easy openers for a twist debut: the twist on a small, gentle board.
    if (twistDebut) {
      for (let i = 0; i < 6; i++) {
        pool.push({
          id: `${id}-open-${i}`, seed: k * 100_000 + 80_000 + i * 7, w: 5, h: 5,
          shape: twistDebut === 'shaped' ? 'ring' : 'rect', bushDensity: 0.18, hide: 'none', maxTier: 2, targetTiers: [1, 2],
          maxSeconds: 90, area: area.toLowerCase().replace(/ /g, '-'),
          ...(twistDebut === 'mushrooms' ? { mushrooms: 0.1 } : {}),
          ...(twistDebut === 'moonlit' ? { moonlit: 0.08 } : {}),
          ...(twistDebut === 'lanterns' ? { fixedLanterns: 2, lanterns: true } : {}),
        });
      }
    }

    const mechanics = ['mushrooms', 'moonlit', 'lanterns', 'shaped'].filter(active);
    plans.push({
      area,
      debut,
      pool,
      spec: {
        id, title: `${area} ${((k - 1) % 6) + 1}`, count, tiers: [tlo, thi], maxSeconds, pool: id,
        mechanics, ...(twistDebut ? { requires: [twistDebut] } : {}),
      },
    });
  }
  return plans;
}

/** Short, twist-free levels for warm-ups and breathers (and the daily pool later). */
export function reservePlan(): GenSpec[] {
  const out: GenSpec[] = [];
  for (let i = 0; i < 330; i++) {
    const r = (salt: number) => hash01(777_000 + i, salt);
    const w = 4 + Math.floor(r(1) * 4);
    out.push({
      id: `x-${String(i).padStart(3, '0')}`, seed: 7_000_000 + i * 11, w, h: w,
      bushDensity: 0.14 + r(2) * 0.08, hide: r(3) < 0.4 ? 'max' : 'none', maxTier: 3, targetTiers: [1, 3],
      maxSeconds: 120, area: 'reserve',
    });
  }
  return out;
}
