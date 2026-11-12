/**
 * Ramp builder: turns a pool of graded levels into chapters shaped like a
 * sawtooth. Each chapter climbs, dips for a breather every few levels, and
 * ends on its peak; the next chapter starts low again. Constant climbing
 * burns players out; the dips are where they relax and keep going.
 */

export interface RampLevel {
  readonly id: string;
  readonly tier: number;
  readonly score: number;
  readonly estimatedSeconds: number;
  readonly area: number;
  readonly mechanics: readonly string[];
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
  return specs.map((spec) => {
    const allowed = new Set(spec.mechanics ?? []);
    const [tlo, thi] = spec.tiers;
    const [alo, ahi] = spec.areas ?? [0, Infinity];
    const candidates = pool
      .filter((l) => !used.has(l.id))
      .filter((l) => l.tier >= tlo && l.tier <= thi && l.area >= alo && l.area <= ahi)
      .filter((l) => l.mechanics.every((m) => allowed.has(m)))
      .filter((l) => (spec.requires ?? []).every((m) => l.mechanics.includes(m)))
      .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));

    const picked = spreadPick(candidates, spec.count);
    for (const l of picked) used.add(l.id);
    return { id: spec.id, title: spec.title, levels: sawtooth(picked, spec.breatherEvery ?? 3), shortfall: spec.count - picked.length };
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
