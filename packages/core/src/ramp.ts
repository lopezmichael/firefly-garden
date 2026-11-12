/**
 * Ramp builder: turns a pool of graded levels into chapters shaped like a
 * sawtooth. Each chapter climbs, dips for a breather every few levels, and
 * ends on its peak; the next chapter starts low again. Constant climbing
 * burns players out; the dips are where they relax and keep going.
 *
 * The first level that needs a tier the player has not met yet is swapped
 * for a teaching level: the candidate that needs that tier's technique the
 * fewest times. Simulated players showed hint demand spiking where a new
 * technique first appears, not at chapter peaks. That debut is then moved
 * early in the chapter (`debutAt`), with practice of the new tier alternating
 * with easier levels before the peak, instead of the new tier's levels piling
 * up at the end in score order.
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
  /**
   * Where a new tier debuts, as a fraction of the chapter (default 0.3). After
   * the debut, practice levels of the new tier alternate with easier ones,
   * and the chapter still ends on its hardest level.
   */
  readonly debutAt?: number;
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
  const introduced = new Set<number>();
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
    const introducedBefore = new Set(introduced);

    // Teaching levels: the first appearance of each new tier gets the gentlest
    // available introduction to it. A debut on the chapter's peak keeps the
    // peak and puts the teaching level just before it instead.
    const last = ordered.length - 1;
    for (let i = 0; i < ordered.length; i++) {
      const level = ordered[i]!;
      if (introduced.has(level.tier)) continue;
      introduced.add(level.tier);
      if (!level.tierSteps) continue;
      const slot = i === last && last > 0 ? i - 1 : i;
      const displaced = ordered[slot]!;
      // A teacher may come from the unused pool, or from later in this chapter (then the two swap places).
      const laterHere = new Set(ordered.slice(slot + 1, last >= 0 && slot < last ? last : ordered.length).map((l) => l.id));
      const teachers = candidates
        .filter((c) => c.tier === level.tier && c.tierSteps && (!used.has(c.id) || c.id === displaced.id || laterHere.has(c.id)))
        .sort((a, b) => (a.tierSteps![a.tier] ?? 0) - (b.tierSteps![b.tier] ?? 0) || a.score - b.score || a.id.localeCompare(b.id));
      const teacher = teachers[0];
      if (teacher && teacher.id !== displaced.id) {
        const j = ordered.findIndex((l) => l.id === teacher.id);
        if (j >= 0) {
          ordered[j] = displaced; // swap within the chapter
        } else {
          used.delete(displaced.id);
          used.add(teacher.id);
        }
        ordered[slot] = teacher;
      }
    }
    const minTier = Math.min(...ordered.map((l) => l.tier));
    const newTiers = [...new Set(ordered.map((l) => l.tier))]
      .filter((t) => t > minTier && !introducedBefore.has(t))
      .sort((a, b) => a - b);
    let levels = ordered;
    for (const t of newTiers) levels = placeDebut(levels, t, spec.debutAt ?? 0.3);
    return { id: spec.id, title: spec.title, levels, shortfall: spec.count - picked.length };
  });
}

/**
 * Reorder one chapter around the debut of tier `t`: easier levels first, the
 * teaching level (the first level of tier `t`) at `debutAt` of the way in,
 * then practice of the new tier (gentlest first: fewest steps needing it)
 * alternating with easier levels, and the hardest level last. Leaves the chapter alone if the new tier has only its
 * teaching level, or there is nothing easier to open with.
 */
export function placeDebut<T extends { readonly id: string; readonly tier: number; readonly score: number }>(
  levels: readonly T[], t: number, debutAt: number,
): T[] {
  const teacher = levels.find((l) => l.tier === t);
  if (!teacher) return levels.slice();
  const byScore = (a: T, b: T) => a.score - b.score || a.id.localeCompare(b.id);
  const easier = levels.filter((l) => l.tier < t).sort(byScore);
  const harderByScore = levels.filter((l) => l.tier >= t && l.id !== teacher.id).sort(byScore);
  if (harderByScore.length === 0 || easier.length === 0) return levels.slice();
  const peak = harderByScore.pop()!;
  const steps = (l: T) => ((l as { tierSteps?: readonly number[] }).tierSteps?.[t] ?? 0);
  const harder = harderByScore.sort((a, b) => steps(a) - steps(b) || byScore(a, b));

  const p = Math.min(easier.length, Math.max(1, Math.round(debutAt * (levels.length - 1))));
  const out: T[] = [...easier.slice(0, p), teacher];
  const restEasy = easier.slice(p);
  // After the debut: an easier level, then practice of the new tier, alternating.
  while (restEasy.length > 0 || harder.length > 0) {
    if (restEasy.length > 0) out.push(restEasy.shift()!);
    if (harder.length > 0) out.push(harder.shift()!);
  }
  out.push(peak);
  return out;
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
