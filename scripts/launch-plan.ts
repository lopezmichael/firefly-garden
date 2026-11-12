// The launch pack plan: which chapters exist, what each one teaches, and the
// generator specs that make its candidate pool. Content decisions live here;
// the pipeline that runs them is generate-levels.ts.
//
// Shape (decided 2026-11-12): 40 chapters in 8 garden areas of 5, ~430 main-path
// levels, plus a reserve of ~250 short, twist-free levels for warm-ups and
// breathers (and the daily pool later). More areas arrive as content updates.
//
// Each area has an identity: a family of board shapes (the plan: "the area's
// layout sets the shape of its boards") and a headline twist or twist combination.
// - Rose Bed teaches the techniques: T2 in chapter 1, T3 (overlap) debuts in chapter 2,
//   T4 (lookahead) in chapter 3. T5 stays off the main path.
// - New twists debut in the plan's order, on the first chapter of their area, where
//   every level uses the twist and the opener is an easy board; then they join the mix.
// - Later areas hide more clues and use bigger boards, so difficulty keeps climbing.
import { DIFFICULTY_CONFIG, type ChapterSpec, type GenSpec, type ShapeId } from '../packages/core/src/index.ts';

export interface ChapterPlan {
  readonly spec: ChapterSpec;
  readonly area: string;
  /** The twist or technique this chapter introduces, if any. */
  readonly debut: string | null;
  readonly pool: readonly GenSpec[];
}

type Twist = 'mushrooms' | 'moonlit' | 'lanterns' | 'shaped';

interface AreaPlan {
  readonly name: string;
  /** Board shapes this area favors (rect boards still appear). */
  readonly shapes: readonly ShapeId[];
  /** Share of boards that use the area's shapes. */
  readonly shapeShare: number;
  /** The twist this area introduces in its first chapter, if any. */
  readonly debut?: Twist;
  /** Twists that headline the area: most levels use them. */
  readonly headline: readonly Twist[];
}

export const AREAS: readonly AreaPlan[] = [
  { name: 'Rose Bed', shapes: ['rect'], shapeShare: 0, headline: [] },
  { name: 'Orchard', shapes: ['L'], shapeShare: 0.7, debut: 'shaped', headline: ['shaped'] },
  { name: 'Mushroom Glade', shapes: ['crescent'], shapeShare: 0.5, debut: 'mushrooms', headline: ['mushrooms'] },
  { name: 'Moon Meadow', shapes: ['crescent', 'rect'], shapeShare: 0.4, debut: 'moonlit', headline: ['moonlit'] },
  { name: 'Lantern Walk', shapes: ['bridge'], shapeShare: 0.6, debut: 'lanterns', headline: ['lanterns'] },
  { name: 'Koi Pond', shapes: ['ring'], shapeShare: 0.75, headline: ['moonlit', 'mushrooms'] },
  { name: 'Stone Bridge', shapes: ['bridge'], shapeShare: 0.7, headline: ['lanterns', 'mushrooms'] },
  { name: 'Old Greenhouse', shapes: ['ring', 'L', 'bridge', 'crescent'], shapeShare: 0.6, headline: ['mushrooms', 'moonlit', 'lanterns'] },
];

export const CHAPTERS_PER_AREA = 5;
export const CHAPTER_COUNT = AREAS.length * CHAPTERS_PER_AREA;

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
  return DIFFICULTY_CONFIG.limits.maxSecondsMainPath;
}

/** Board edge range for chapter k. */
function edges(k: number): [number, number] {
  if (k === 1) return [4, 5];
  if (k === 2) return [5, 6];
  if (k === 3) return [6, 8];
  return [Math.min(7, 5 + Math.floor(k / 8)), Math.min(10, 7 + Math.floor(k / 5))];
}

const slug = (s: string) => s.toLowerCase().replace(/ /g, '-');

export function launchPlan(): ChapterPlan[] {
  const plans: ChapterPlan[] = [];
  const debutedBefore = new Set<Twist>();
  AREAS.forEach((area, a) => {
    for (let j = 0; j < CHAPTERS_PER_AREA; j++) {
      const k = a * CHAPTERS_PER_AREA + j + 1;
      const id = `c${k}`;
      const twistDebut: Twist | null = j === 0 && area.debut ? area.debut : null;
      if (twistDebut) debutedBefore.add(twistDebut);
      const active = new Set(debutedBefore);
      const debut = twistDebut ?? (k === 2 ? 'T3' : k === 3 ? 'T4' : null);
      const count = k <= 10 ? 10 : 11;
      // A new twist arrives on easier boards so only one new thing happens at a time.
      const [tlo, thi]: [number, number] = k === 1 ? [1, 2] : k === 2 ? [1, 3] : k === 3 ? [2, 4]
        : twistDebut && twistDebut !== 'shaped' ? [1, 3] : [2, 4];
      const [elo, ehi] = edges(k);
      const maxSeconds = chapterLimit(k);
      // Later areas hide more clues: difficulty keeps rising inside the tier bands.
      const hideShare = Math.min(0.85, 0.4 + a * 0.06);

      const pool: GenSpec[] = [];
      const candidates = count * 3;
      for (let i = 0; i < candidates; i++) {
        const r = (salt: number) => hash01(k * 1000 + i, salt);
        const w = elo + Math.floor(r(1) * (ehi - elo + 1));
        const h = Math.max(4, w - (k > 15 && r(2) < 0.4 ? 1 + Math.floor(r(3) * 2) : 0));
        const uses = (t: Twist) => twistDebut === t
          || (active.has(t) && r(10 + t.length) < (area.headline.includes(t) ? 0.75 : 0.25));
        const areaShape = area.shapes[Math.floor(r(4) * area.shapes.length)]!;
        const shaped = active.has('shaped') && areaShape !== 'rect' && w >= 5 && h >= 5
          && (twistDebut === 'shaped' || r(12) < area.shapeShare);
        pool.push({
          id: `${id}-${String(i).padStart(2, '0')}`,
          seed: k * 100_000 + i * 13,
          w, h,
          shape: shaped ? areaShape : 'rect',
          area: slug(area.name),
          bushDensity: 0.14 + r(5) * 0.08,
          hide: r(6) < hideShare ? 'max' : 'none',
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
            hide: 'none', maxTier: 1, targetTiers: [1, 1], maxSeconds, area: slug(area.name),
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
            maxHardestSteps: 1, maxSeconds, area: slug(area.name),
          });
        }
      }
      // Easy openers for a twist debut: the twist on a small, gentle board.
      if (twistDebut) {
        for (let i = 0; i < 6; i++) {
          pool.push({
            id: `${id}-open-${i}`, seed: k * 100_000 + 80_000 + i * 7, w: 5, h: 5,
            shape: twistDebut === 'shaped' ? (area.shapes[0] ?? 'rect') : 'rect',
            bushDensity: 0.18, hide: 'none', maxTier: 2, targetTiers: [1, 2], maxSeconds: 90, area: slug(area.name),
            ...(twistDebut === 'mushrooms' ? { mushrooms: 0.1 } : {}),
            ...(twistDebut === 'moonlit' ? { moonlit: 0.08 } : {}),
            ...(twistDebut === 'lanterns' ? { fixedLanterns: 2, lanterns: true } : {}),
          });
        }
      }

      plans.push({
        area: area.name,
        debut,
        pool,
        spec: {
          id, title: `${area.name} ${j + 1}`, count, tiers: [tlo, thi], maxSeconds, pool: id,
          mechanics: [...active], ...(twistDebut ? { requires: [twistDebut] } : {}),
        },
      });
    }
  });
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
