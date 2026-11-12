/**
 * Ramp builder: turns a pool of graded levels into chapters shaped like a
 * sawtooth. Each chapter climbs, dips for a breather every few levels, and
 * ends on its peak; the next chapter starts low again. Constant climbing
 * burns players out; the dips are where they relax and keep going.
 *
 * The first level that needs a tier the player has not met yet is swapped
 * for a teaching level: the candidate that needs that tier's technique the
 * fewest times. Simulated players showed hint demand spiking where a new
 * technique first appears, not at chapter peaks.
 */

export interface RampLevel {
  readonly id: string;
  readonly tier: number;
  readonly score: number;
  readonly estimatedSeconds: number;
  readonly area: number;
  readonly mechanics: readonly string[];
  /** Grader steps per tier, indexed by tier (index 0 unused). Enables teaching levels. */
  readonly tierSteps?: readonly number[];
}

export interface ChapterSpec {
  readonly id: string;
  readonly title: string;
  readonly count: number;
  /** Inclusive tier range. */
  readonly tiers: readonly [number, number];
  /** Inclusive board-area range (w × h). */
  readonly areas?: readonly [number, number];
  /** Twists allowed in this chapter; a level may use any subset. Default: none. */
  readonly mechanics?: readonly string[];
  /** Twists every level in this chapter must use (the chapter's debut twist). */
  readonly requires?: readonly string[];
  /** Longest estimated solve time allowed in this chapter, in seconds. */
  readonly maxSeconds?: number;
  /** A breather after every `breatherEvery` climbing levels. Default 3. */
  readonly breatherEvery?: number;
}

export interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly levels: readonly RampLevel[];
  /** How many levels were asked for but not available in the pool. */
  readonly shortfall: number;
}

export function buildRamp(pool: readonly RampLevel[], specs: readonly ChapterSpec[]): Chapter[] {
  const used = new Set<string>();
  let seenTier = 0;
  return specs.map((spec) => {
    const allowed = new Set(spec.mechanics ?? []);
    const [tlo, thi] = spec.tiers;
    const [alo, ahi] = spec.areas ?? [0, Infinity];
    const candidates = pool
      .filter((l) => !used.has(l.id))
      .filter((l) => l.tier >= tlo && l.tier <= thi && l.area >= alo && l.area <= ahi)
      .filter((l) => l.estimatedSeconds <= (spec.maxSeconds ?? Infinity))
      .filter((l) => l.mechanics.every((m) => allowed.has(m)))
      .filter((l) => (spec.requires ?? []).every((m) => l.mechanics.includes(m)))
      .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));

    const picked = spreadPick(candidates, spec.count);
    for (const l of picked) used.add(l.id);
    const ordered = sawtooth(picked, spec.breatherEvery ?? 3);

    // Teaching levels: the first appearance of each new tier gets the gentlest
    // available introduction to it.
    for (let i = 0; i < ordered.length; i++) {
      const level = ordered[i]!;
      if (level.tier <= seenTier) continue;
      const teachers = candidates
        .filter((c) => c.tier === level.tier && c.tierSteps && (!used.has(c.id) || c.id === level.id))
        .sort((a, b) => (a.tierSteps![a.tier] ?? 0) - (b.tierSteps![b.tier] ?? 0) || a.score - b.score || a.id.localeCompare(b.id));
      const teacher = teachers[0];
      if (teacher && teacher.id !== level.id) {
        used.delete(level.id);
        used.add(teacher.id);
        ordered[i] = teacher;
      }
      seenTier = level.tier;
    }
    return { id: spec.id, title: spec.title, levels: ordered, shortfall: spec.count - picked.length };
  });
}

/** Pick `n` levels spread evenly across the difficulty range of a sorted list. */
function spreadPick<T>(sorted: readonly T[], n: number): T[] {
  if (sorted.length <= n) return sorted.slice();
  const out: T[] = [];
  for (let k = 0; k < n; k++) out.push(sorted[Math.round((k * (sorted.length - 1)) / Math.max(1, n - 1))]!);
  return out;
}

/**
 * Order one chapter: climb in score order, slot an easy level in after every
 * `every` climbing levels, and finish on the hardest.
 */
export function sawtooth<T extends { readonly score: number }>(levels: readonly T[], every: number): T[] {
  if (levels.length <= 2) return levels.slice().sort((a, b) => a.score - b.score);
  const asc = levels.slice().sort((a, b) => a.score - b.score);
  const peak = asc.pop()!;
  const breatherCount = Math.floor(asc.length / (every + 1));
  // Breathers come from just above the easiest levels, so the opener stays the easiest.
  const breathers = asc.splice(1, breatherCount);
  const out: T[] = [];
  let climbed = 0;
  for (const l of asc) {
    out.push(l);
    if (++climbed % every === 0 && breathers.length > 0) out.push(breathers.shift()!);
  }
  out.push(...breathers, peak);
  return out;
}

/**
 * The role each level plays in one chapter's curve: the opener, the peak (the
 * last level), breathers (easier than the level before) and climbs.
 */
export function rampRoles(levels: readonly { readonly score: number }[]): ('opener' | 'climb' | 'breather' | 'peak')[] {
  return levels.map((l, i) => {
    if (i === 0) return 'opener';
    if (i === levels.length - 1) return 'peak';
    return l.score < levels[i - 1]!.score ? 'breather' : 'climb';
  });
}
