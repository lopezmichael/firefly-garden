import { buildBoard, type Board } from './board.ts';
import { MAX_LEVEL_SECONDS } from './level.ts';
import { measure, type Difficulty } from './difficulty.ts';
import { grade, type Grade } from './grader.ts';
import { createRng, deriveSeed, type Rng } from './rng.ts';
import { evaluate } from './rules.ts';
import { makeMask, type ShapeId } from './shapes.ts';
import { isUnique, solve } from './solver.ts';
import type { BushSpec, Coord, Level, LevelTwists } from './types.ts';

/**
 * Level generator (project plan, "Generator pipeline"):
 *  1. board size, shape and densities from the spec
 *  2. place bushes and twist tiles at random (optionally point-symmetric)
 *  3. place a hidden answer that lights every tile with no conflicts
 *  4. derive each bush's number from the answer
 *  5. uniqueness via the exact solver; repair by adding a bush (or a lantern)
 *  6. clue removal: hide numbers while the level stays unique (and under maxTier)
 *  7. grade with the technique grader and keep it if it hits the target tiers
 * Deterministic: the same spec always yields the same level.
 */
export interface GenSpec {
  readonly id: string;
  readonly seed: number;
  readonly w: number;
  readonly h: number;
  readonly shape?: ShapeId;
  readonly area?: string;
  /** Fraction of active cells that become bushes. */
  readonly bushDensity: number;
  /** Fractions of active cells for each twist. Mushrooms are numbered (4-neighbor) blockers. */
  readonly mushrooms?: number;
  readonly moonlit?: number;
  /** Allow lanterns as a uniqueness repair (a twist; off for early chapters). */
  readonly lanterns?: boolean;
  /** Place this many lanterns (fixed fireflies) from the hidden answer up front. */
  readonly fixedLanterns?: number;
  /**
   * Teaching levels: reject a level whose hardest technique is needed more
   * than this many times (e.g. 1 = "needs T3 exactly once").
   */
  readonly maxHardestSteps?: number;
  /** Clue removal: 'none' keeps every number, 'max' hides all it can. */
  readonly hide?: 'none' | 'max';
  /** With hide: never hide a number if that pushes the tier above this. */
  readonly maxTier?: number;
  /**
   * Longest estimated solve time allowed, in seconds. Clue hiding stops short
   * of it, and a level still over it is rejected.
   */
  readonly maxSeconds?: number;
  readonly symmetric?: boolean;
  /** Accept only levels whose tier is within [min, max]. */
  readonly targetTiers?: readonly [number, number];
  /** Attempts before giving up (each attempt uses a derived seed). Default 40. */
  readonly attempts?: number;
}

export interface Generated {
  readonly level: Level;
  readonly board: Board;
  readonly grade: Grade;
  readonly difficulty: Difficulty;
  /** Attempts used, including the successful one. */
  readonly attempts: number;
  /** Uniqueness repairs applied in the successful attempt. */
  readonly repairs: number;
}

const SOLVER_BUDGET = 200_000;
const MAX_REPAIRS = 16;

export function generate(spec: GenSpec): Generated | null {
  const attempts = spec.attempts ?? 40;
  for (let a = 0; a < attempts; a++) {
    const result = attempt(spec, createRng(deriveSeed(spec.seed, a)));
    if (result) return { ...result, attempts: a + 1 };
  }
  return null;
}

interface Parts {
  mask: string[];
  bushes: Coord[];
  hidden: Set<string>;
  mushrooms: Coord[];
  moonlit: Coord[];
  lanterns: Coord[];
}

const key = ([r, c]: Coord) => `${r},${c}`;

function attempt(spec: GenSpec, rng: Rng): Omit<Generated, 'attempts'> | null {
  const { w, h } = spec;
  const mask = makeMask(spec.shape ?? 'rect', w, h);
  const active: Coord[] = [];
  mask.forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && active.push([r, c])));
  if (active.length < 4) return null;

  // Steps 1-2: scatter bushes and twist tiles.
  const used = new Set<string>();
  const pool = rng.shuffle(active);
  const take = (count: number, symmetric = false): Coord[] => {
    const out: Coord[] = [];
    for (const cell of pool) {
      if (out.length >= count) break;
      if (used.has(key(cell))) continue;
      const mate: Coord = [h - 1 - cell[0], w - 1 - cell[1]];
      const pair = symmetric && mask[mate[0]]?.[mate[1]] === '#' && !used.has(key(mate)) ? [cell, mate] : [cell];
      for (const p of pair) {
        if (!used.has(key(p))) {
          used.add(key(p));
          out.push(p);
        }
      }
    }
    return out;
  };
  const count = (fraction: number | undefined) => Math.round((fraction ?? 0) * active.length);
  const parts: Parts = {
    mask,
    bushes: take(Math.max(1, count(spec.bushDensity)), spec.symmetric ?? false),
    hidden: new Set(),
    mushrooms: take(count(spec.mushrooms)),
    moonlit: take(count(spec.moonlit)),
    lanterns: [],
  };

  // Step 3: a hidden answer that lights everything.
  const shell = buildBoard(toLevel(spec, parts, null));
  const answer = placeAnswer(shell, rng);
  if (!answer) return null;

  // Optional fixed lanterns, chosen from the answer.
  if (spec.fixedLanterns) {
    const moonlitKeys = new Set(parts.moonlit.map(key));
    const spots = rng.shuffle(answer).map((i) => [Math.floor(i / w), i % w] as Coord).filter((c) => !moonlitKeys.has(key(c)));
    parts.lanterns.push(...spots.slice(0, spec.fixedLanterns));
  }

  // Step 4 happens inside toLevel: numbers are derived from the answer.
  let level = toLevel(spec, parts, answer.map((i) => [Math.floor(i / w), i % w] as Coord));
  let board = buildBoard(level);
  const answerKey = answer.join(',');

  // Step 5: make it unique.
  let repairs = 0;
  for (;;) {
    const res = solve(board, { limit: 2, maxNodes: SOLVER_BUDGET });
    if (res.budgetExceeded || res.count === 0) return null;
    if (res.count === 1) break;
    if (++repairs > MAX_REPAIRS) return null;
    const other = res.solutions.find((s) => s.join(',') !== answerKey) ?? res.solutions[0]!;
    const inAnswer = new Set(answer);
    const inOther = new Set(other);
    const repaired = repair(spec, parts, board, answer, rng,
      other.filter((c) => !inAnswer.has(c)), answer.filter((c) => !inOther.has(c)));
    if (!repaired) return null;
    ({ level, board } = repaired);
  }

  // Step 6: clue removal.
  if (spec.hide === 'max') {
    const solution = level.solution!;
    for (const b of rng.shuffle(parts.bushes)) {
      parts.hidden.add(key(b));
      const trial = toLevel(spec, parts, solution);
      const trialBoard = buildBoard(trial);
      let keep = isUnique(trialBoard);
      if (keep && (spec.maxTier !== undefined || spec.maxSeconds !== undefined)) {
        const tg = grade(trialBoard);
        if (spec.maxTier !== undefined && tg.maxTier > spec.maxTier) keep = false;
        if (keep && spec.maxSeconds !== undefined && measure(trial, trialBoard, tg).estimatedSeconds > spec.maxSeconds) keep = false;
      }
      if (keep) {
        level = trial;
        board = trialBoard;
      } else {
        parts.hidden.delete(key(b));
      }
    }
  }

  // Step 7: grade and file.
  const g = grade(board);
  if (g.solved && g.fireflies.join(',') !== answerKey) {
    throw new Error(`grader reached a different solution on unique level ${spec.id}; a technique is unsound`);
  }
  const difficulty = measure(level, board, g);
  const [lo, hi] = spec.targetTiers ?? [1, 5];
  if (difficulty.tier < lo || difficulty.tier > hi) return null;
  if (spec.maxSeconds !== undefined && difficulty.estimatedSeconds > spec.maxSeconds) return null;
  if (spec.maxHardestSteps !== undefined && (g.tierCounts[difficulty.tier] ?? 0) > spec.maxHardestSteps) return null;

  const techniques = [...new Set(g.steps.map((s) => s.technique))].sort();
  // Clamped into the range parseLevel accepts, so a written pack always parses.
  const seconds = Math.min(MAX_LEVEL_SECONDS, Math.max(1, difficulty.estimatedSeconds));
  const graded: Level = { ...level, tier: difficulty.tier, score: difficulty.score, techniques, seconds };
  return { level: graded, board, grade: g, difficulty, repairs };
}

/** Random answer: visit dark tiles in random order, light each from a random legal cell. */
function placeAnswer(board: Board, rng: Rng): number[] | null {
  const n = board.w * board.h;
  const lit = new Uint8Array(n);
  const fly: number[] = [];
  for (const p of board.lanterns) {
    fly.push(p);
    lit[p] = 1;
    for (const j of board.rays[p]!) lit[j] = 1;
  }
  for (const p of rng.shuffle(board.needsLight)) {
    if (lit[p]) continue;
    // An unlit cell sees no firefly, so any unlit landable cell in view is legal.
    const options = [p, ...board.rays[p]!].filter((c) => !lit[c]);
    if (options.length === 0) return null;
    const c = rng.pick(options);
    fly.push(c);
    lit[c] = 1;
    for (const j of board.rays[c]!) lit[j] = 1;
  }
  return fly.sort((a, b) => a - b);
}

/**
 * Break a tie between the answer and another solution. Prefer turning a cell
 * the other solution uses (and the answer leaves empty) into a numbered bush,
 * as long as the answer still lights everything. Fall back to a lantern on a
 * cell only the answer uses, if the spec allows lanterns.
 */
function repair(
  spec: GenSpec, parts: Parts, board: Board, answer: readonly number[], rng: Rng,
  otherOnly: readonly number[], answerOnly: readonly number[],
): { level: Level; board: Board } | null {
  const w = board.w;
  const coord = (i: number): Coord => [Math.floor(i / w), i % w];
  const solution = answer.map(coord);
  const moonlit = new Set(parts.moonlit.map(key));
  for (const c of rng.shuffle(otherOnly)) {
    if (moonlit.has(key(coord(c)))) continue; // one thing per cell
    parts.bushes.push(coord(c));
    const level = toLevel(spec, parts, solution);
    const next = buildBoard(level);
    if (evaluate(next, answer.filter((i) => !next.lantern[i])).solved) return { level, board: next };
    parts.bushes.pop();
  }
  const lanternSpots = answerOnly.filter((c) => !moonlit.has(key(coord(c))));
  if (spec.lanterns && lanternSpots.length > 0) {
    parts.lanterns.push(coord(rng.pick(lanternSpots)));
    const level = toLevel(spec, parts, solution);
    return { level, board: buildBoard(level) };
  }
  return null;
}

/** Assemble a Level. With a solution, bush numbers are derived from it; without, they are 0. */
function toLevel(spec: GenSpec, parts: Parts, solution: readonly Coord[] | null): Level {
  const fly = new Set((solution ?? []).map(key));
  const count = ([r, c]: Coord, eight: boolean) => {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if ((dr === 0 && dc === 0) || (!eight && dr !== 0 && dc !== 0)) continue;
        if (fly.has(`${r + dr},${c + dc}`)) n++;
      }
    }
    return n;
  };
  const bushes: BushSpec[] = parts.bushes.map((b) => [b[0], b[1], parts.hidden.has(key(b)) ? null : count(b, true)]);
  const twists: { -readonly [K in keyof LevelTwists]: LevelTwists[K] } = {};
  if (parts.mushrooms.length) twists.mushrooms = parts.mushrooms.map((m) => [m[0], m[1], count(m, false)] as const);
  if (parts.moonlit.length) twists.moonlit = parts.moonlit;
  if (parts.lanterns.length) twists.lanterns = parts.lanterns;

  const level: { -readonly [K in keyof Level]: Level[K] } = { id: spec.id, w: spec.w, h: spec.h, mask: parts.mask, bushes };
  if (spec.area) level.area = spec.area;
  if (Object.keys(twists).length > 0) level.twists = twists;
  if (solution) level.solution = solution;
  return level;
}
