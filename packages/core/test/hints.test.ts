import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildBoard, canPlace, cellIndex, createRng, evaluate, generate, grade, hint, HINT_CROSS_CAP, HINT_REASONS, hintCell, hintStep,
  parseLevel, REMOVE_REASONS, RULE_OUT_REASONS, ruleOutReason, STUCK_REASONS, TECHNIQUE_TIER, ZERO_BUSH_REASON, type Board, type Hint, type Level,
  type TechniqueId,
} from '../src/index.ts';

const LEVELS = join(import.meta.dirname, '..', '..', '..', 'levels');
const pack = (file: string): Level[] =>
  (JSON.parse(readFileSync(join(LEVELS, file), 'utf8')) as { levels: unknown[] }).levels.map((l) => parseLevel(l));
const manifest = JSON.parse(readFileSync(join(LEVELS, 'manifest.json'), 'utf8')) as { chapters: { id: string; levels: string[] }[] };
const launch = new Map(pack('launch.json').map((l) => [l.id, l]));
const firstChapters = manifest.chapters.slice(0, 3).flatMap((c) => c.levels.map((id) => launch.get(id)!));
const reserve = pack('reserve.json');

/** Generated boards with every twist (lanterns, moonlit, mushrooms), which chapters 1 to 3 do not have. */
const twisted: Level[] = [];
for (let i = 0; i < 12; i++) {
  const gen = generate({
    id: `tw${i}`, seed: 4200 + i, w: 5 + (i % 3), h: 5 + (i % 3), bushDensity: 0.18, hide: 'none',
    mushrooms: 0.06, moonlit: 0.06, lanterns: true,
  });
  if (gen) twisted.push(gen.level);
}

const answerOf = (board: Board, level: Level) => new Set(level.solution!.map((c) => cellIndex(board, c)));

/** Tallies for the "reason reads true" check, reported by the property test. */
const truth = {
  crosses: 0, satisfied: 0, bushRoom: 0, countBound: 0, grouped: 0, needsAll: 0, oneSource: 0, false: [] as string[],
};

/** What the player sees: fireflies (lanterns included), tiles they light, and the hint X marks. */
function visible(board: Board, on: ReadonlySet<number>, crossed: ReadonlySet<number>) {
  const fly = new Set([...on, ...board.lanterns]);
  const seen = new Set<number>();
  for (const f of fly) for (const j of board.rays[f]!) seen.add(j);
  const open = (c: number) => board.kind[c] === 'path' && !fly.has(c) && !seen.has(c) && !crossed.has(c);
  return { fly, seen, open };
}

/** Every set of `size` cells from `cells` that could all hold fireflies (no two see each other). */
function fits(board: Board, cells: readonly number[], size: number): number[][] {
  if (size === 0) return [[]];
  const out: number[][] = [];
  cells.forEach((c, i) => {
    for (const rest of fits(board, cells.slice(i + 1), size - 1)) {
      if (!rest.some((r) => board.rays[c]!.includes(r))) out.push([c, ...rest]);
    }
  });
  return out;
}

/** A cross hint's reason must hold on the board as the player sees it (fireflies plus hint X marks). */
function checkCross(level: Level, board: Board, on: ReadonlySet<number>, crossed: ReadonlySet<number>, h: Extract<Hint, { kind: 'cross' }>) {
  const { fly, seen, open } = visible(board, on, crossed);
  truth.crosses++;
  if (h.cells.length > 1) truth.grouped++;
  if (h.reason !== ruleOutReason(h.technique, h.cells.length, board, h.because)) truth.false.push(`${level.id}: reason is not the technique's`);
  if (h.cells.some((c) => !open(c))) truth.false.push(`${level.id}: crossed a tile the player already sees decided`);
  if (h.technique === 'T1-satisfied') {
    truth.satisfied++;
    const bush = h.because[0]!;
    const around = board.around[bush]!;
    if (around.filter((c) => fly.has(c)).length !== board.clue[bush] || h.cells.some((c) => !around.includes(c))) {
      truth.false.push(`${level.id}: "already has all its fireflies" is false for bush ${bush}`);
    }
  } else if (h.technique === 'T2-bush-room') {
    truth.bushRoom++;
    const bush = h.because[0]!;
    const around = board.around[bush]!;
    const need = board.clue[bush]! - around.filter((c) => fly.has(c)).length;
    const ways = fits(board, around.filter(open), need);
    if (ways.length === 0 || ways.some((w) => w.some((c) => h.cells.includes(c)))) {
      truth.false.push(`${level.id}: "never use these tiles" is false for bush ${bush}`);
    }
  } else if (h.technique === 'T3-count-bound') {
    truth.countBound++;
    const total = level.solution!.length;
    const needs = h.because.map((src) => {
      if (board.kind[src] === 'path') return { need: fly.has(src) || seen.has(src) ? 0 : 1, cells: [src, ...board.rays[src]!].filter(open) };
      const around = board.around[src]!;
      return { need: board.clue[src]! - around.filter((c) => fly.has(c)).length, cells: around.filter(open) };
    });
    const cells = needs.flatMap((n) => n.cells);
    const sum = needs.reduce((a, n) => a + n.need, 0);
    if (needs.some((n) => n.need <= 0 || n.cells.length < n.need) || new Set(cells).size !== cells.length
      || sum !== total - fly.size || h.cells.some((c) => cells.includes(c))) {
      truth.false.push(`${level.id}: "use up every firefly left" does not hold`);
    }
  }
}

/** A pointing hint's "what to look for" must hold on the board as the player sees it. */
function checkPoint(level: Level, board: Board, on: ReadonlySet<number>, crossed: ReadonlySet<number>, h: Extract<Hint, { kind: 'point' }>) {
  const { fly, open } = visible(board, on, crossed);
  if (h.technique === 'T1-needs-all') {
    truth.needsAll++;
    const bush = h.because[0]!;
    const around = board.around[bush]!;
    const opens = around.filter(open);
    if (!opens.includes(h.target) || around.filter((c) => fly.has(c)).length + opens.length !== board.clue[bush]) {
      truth.false.push(`${level.id}: "needs every open spot" is false for bush ${bush}`);
    }
  } else if (h.technique === 'T2-one-source' && h.because.length === 1) {
    truth.oneSource++;
    const dark = h.because[0]!;
    const sources = [dark, ...board.rays[dark]!].filter(open);
    if (!open(dark) && !sources.includes(dark) && sources.length !== 1) truth.false.push(`${level.id}: tile ${dark} is not dark`);
    if (sources.length !== 1 || sources[0] !== h.target) {
      truth.false.push(`${level.id}: "only lit from one spot" but tile ${dark} has ${sources.length}`);
    }
  }
}

describe('locked hint fireflies', () => {
  const level: Level = { id: 'lock', w: 3, h: 1, mask: ['###'], bushes: [], twists: { lanterns: [[0, 0]] } };
  const board = buildBoard(level);

  it('canPlace refuses locked cells and lanterns, allows the rest', () => {
    const locked = new Set([2]);
    expect(canPlace(board, 0, locked)).toBe(false);
    expect(canPlace(board, 2, locked)).toBe(false);
    expect(canPlace(board, 1, locked)).toBe(true);
    expect(canPlace(board, 2)).toBe(true);
  });

  it('a locked firefly counts like any other and can conflict', () => {
    const ev = evaluate(board, [2]);
    expect(ev.conflicts).toEqual([0, 2]);
  });
});

describe('grade from a position', () => {
  it('can stop at the first firefly step', () => {
    for (const level of firstChapters.slice(0, 10)) {
      const board = buildBoard(level);
      const full = grade(board).steps;
      const first = full.findIndex((st) => st.value === 'firefly');
      expect(grade(board, { stopAtFirefly: true }).steps).toEqual(full.slice(0, first + 1));
    }
  });

  it('is unchanged without a start and continues from one', () => {
    for (const level of firstChapters.slice(0, 10)) {
      const board = buildBoard(level);
      const full = grade(board);
      expect(grade(board, {})).toEqual(full);
      const answer = [...answerOf(board, level)];
      const fromHalf = grade(board, { start: answer.slice(0, Math.floor(answer.length / 2)) });
      expect(fromHalf.solved).toBe(true);
      expect(fromHalf.fireflies).toEqual(full.fireflies);
    }
  });

  it('rejects start cells that cannot hold a firefly or see each other', () => {
    const board = buildBoard({ id: 's', w: 3, h: 1, mask: ['###'], bushes: [[0, 1, null]] });
    expect(() => grade(board, { start: [1] })).toThrow(RangeError);
    const open = buildBoard({ id: 'o', w: 3, h: 1, mask: ['###'], bushes: [] });
    expect(() => grade(open, { start: [0, 2] })).toThrow(RangeError);
  });
});

describe('grade with known-empty tiles', () => {
  it('builds on them and rejects tiles that are not open paths', () => {
    // 0 1 2 in a row: crossing 0 and 2 leaves one source for every tile.
    const board = buildBoard({ id: 'e', w: 3, h: 1, mask: ['###'], bushes: [] });
    expect(grade(board, { startEmpty: [0, 2] }).steps[0]).toMatchObject({ cell: 1, value: 'firefly', technique: 'T2-one-source' });
    const bushy = buildBoard({ id: 'b', w: 3, h: 1, mask: ['###'], bushes: [[0, 1, null]] });
    expect(() => grade(bushy, { startEmpty: [1] })).toThrow(RangeError);
    expect(() => grade(board, { start: [0], startEmpty: [0] })).toThrow(RangeError);
  });
});

describe('hint', () => {
  // Five positions per level: a random part of the answer plus up to two wrong fireflies.
  const RUNS = 5;

  /**
   * Ask for hints until solved. A cross adds its X marks; a point is followed by the player
   * placing the firefly it was about (the hint itself never places one).
   */
  function play(level: Level, seed: number) {
    const board = buildBoard(level);
    const answer = answerOf(board, level);
    const rng = createRng(seed);
    const free = board.paths.filter((p) => !board.lantern[p]);
    const placed = new Set<number>();
    for (const c of answer) if (!board.lantern[c] && rng.next() < 0.5) placed.add(c);
    const wrongPool = free.filter((p) => !answer.has(p));
    for (let k = rng.int(3); k > 0 && wrongPool.length > 0; k--) placed.add(rng.pick(wrongPool));
    const crossed = new Set<number>();
    const problems: string[] = [];
    const kinds: string[] = [];
    const limit = 3 * board.paths.length + 4;
    for (let i = 0; i < limit; i++) {
      const h = hint(board, answer, placed, new Set(), crossed);
      kinds.push(h.kind === 'point' && h.technique === null ? 'stuck' : h.kind);
      if (h.kind === 'none') {
        if (!evaluate(board, placed).solved) problems.push(`${level.id}: "none" on an unsolved board`);
        return { problems, kinds };
      }
      if (h.kind === 'remove') {
        if (answer.has(h.cell)) problems.push(`${level.id}: removed answer cell ${h.cell}`);
        if (!placed.has(h.cell)) problems.push(`${level.id}: removed a cell that was not a player firefly`);
        placed.delete(h.cell);
      } else if (h.kind === 'cross') {
        if (h.cells.length === 0 || h.cells.length > HINT_CROSS_CAP) problems.push(`${level.id}: crossed ${h.cells.length} tiles`);
        for (const c of h.cells) {
          if (answer.has(c) || board.kind[c] !== 'path' || crossed.has(c) || placed.has(c)) problems.push(`${level.id}: crossed cell ${c}`);
        }
        checkCross(level, board, placed, crossed, h);
        for (const c of h.cells) crossed.add(c);
      } else {
        if (!answer.has(h.target) || placed.has(h.target)) problems.push(`${level.id}: pointed at a step for ${h.target}`);
        if (h.because.length === 0) problems.push(`${level.id}: a point with nothing to ring`);
        // Ringing the firefly's tile alone would all but place it.
        // (A tile boxed in on every side can only hold its own firefly, so ringing it reveals nothing.)
        if (h.because.length === 1 && h.because[0] === h.target && board.rays[h.target]!.length > 0) {
          problems.push(`${level.id}: a point rings only its target (${String(h.technique)})`);
        }
        checkPoint(level, board, placed, crossed, h);
        placed.add(h.target);
      }
    }
    problems.push(`${level.id}: not solved after ${limit} hints`);
    return { problems, kinds };
  }

  it('is always correct, its reasons read true, and repeated hints always finish the level (chapters 1 to 3, reserve, twists)', () => {
    const problems: string[] = [];
    const counts: Record<string, number> = {};
    const all = [...firstChapters, ...reserve, ...twisted];
    all.forEach((level, i) => {
      for (let r = 0; r < RUNS; r++) {
        const out = play(level, 1000 + i * RUNS + r);
        problems.push(...out.problems);
        for (const k of out.kinds) counts[k] = (counts[k] ?? 0) + 1;
      }
    });
    expect(all.length).toBeGreaterThanOrEqual(280);
    expect(problems).toEqual([]);
    expect(truth.false).toEqual([]);
    expect(truth.satisfied).toBeGreaterThan(100);
    expect(truth.grouped).toBeGreaterThan(100);
    expect(truth.bushRoom).toBeGreaterThan(0);
    expect(truth.needsAll).toBeGreaterThan(100);
    expect(truth.oneSource).toBeGreaterThan(100);
    // The count is shown, so hints use count deductions too (each checked above).
    expect(truth.countBound).toBeGreaterThan(0);
    // Hints come from the grader; the stuck fallback should be rare.
    expect(counts['cross']! + counts['point']!).toBeGreaterThan(20 * (counts['stuck'] ?? 0));
    expect(counts['remove']!).toBeGreaterThan(0);
  });

  it('removes conflicting fireflies first, then ones that overfill a bush, then any wrong one', () => {
    // Cells: 0 1 2 / 3 B 5, where B is a bush wanting 2. Answer: 0 and 5.
    const level: Level = { id: 'order', w: 3, h: 2, mask: ['###', '###'], bushes: [[1, 1, 2]], solution: [[0, 0], [1, 2]] };
    const board = buildBoard(level);
    const answer = answerOf(board, level);
    expect(hint(board, answer, [0, 5]).kind).toBe('none');
    // 1 and 2 see each other along the top row.
    expect(hint(board, answer, [1, 2])).toEqual({ kind: 'remove', cell: 1, reason: REMOVE_REASONS.conflict });
    // 1, 3 and 5 give the bush three; nothing conflicts (the bush blocks the bottom row).
    expect(hint(board, answer, [1, 3, 5])).toEqual({ kind: 'remove', cell: 1, reason: REMOVE_REASONS.overfull });
    // 2 alone overfills nothing.
    expect(hint(board, answer, [2])).toEqual({ kind: 'remove', cell: 2, reason: REMOVE_REASONS.wrong });
    // A wrong firefly comes off before anything is crossed out, even with X marks down.
    expect(hint(board, answer, [2], new Set(), [1])).toEqual({ kind: 'remove', cell: 2, reason: REMOVE_REASONS.wrong });
  });

  it('crosses out every open tile around a satisfied bush, as one group with one reason', () => {
    // Row 0: 0 1 2 3 4; row 1: 5 B 7 8 9 with B wanting 1, and the firefly at 0 already counts.
    // Columns are 5 wide, so B (6) touches 0 1 2 5 7 10 11 12.
    const level: Level = {
      id: 'sat', w: 5, h: 3, mask: ['#####', '#####', '#####'], bushes: [[1, 1, 1], [1, 4, null]],
      solution: [[0, 0], [2, 3]],
    };
    const board = buildBoard(level);
    const answer = answerOf(board, level);
    const h = hint(board, answer, [0]);
    expect(h.kind).toBe('cross');
    if (h.kind !== 'cross') return;
    expect(h.technique).toBe('T1-satisfied');
    expect(h.because).toEqual([6]);
    expect(h.reason).toBe(RULE_OUT_REASONS['T1-satisfied']);
    // 1, 2 and 5 are lit by the firefly at 0, so the open neighbours left are 7, 11 and 12.
    expect(h.cells).toEqual([7, 11, 12]);
    expect(h.cells.every((c) => !answer.has(c))).toBe(true);
    // With those crossed, the next hint is a different deduction.
    const next = hint(board, answer, [0], new Set(), h.cells);
    expect(next.kind === 'cross' && next.cells.some((c) => h.cells.includes(c))).toBe(false);
  });

  it(`never crosses more than ${HINT_CROSS_CAP} tiles at once; the rest come with the next hint`, () => {
    // A 0 bush in the middle of a 3x3 garden: all eight neighbours are out, but one hint takes four.
    const level: Level = {
      id: 'zero', w: 5, h: 5, mask: ['#####', '#####', '#####', '#####', '#####'],
      bushes: [[2, 2, 0], [0, 2, null], [4, 2, null], [2, 0, null], [2, 4, null]],
      solution: [[0, 0], [0, 4], [4, 0], [4, 4]],
    };
    const board = buildBoard(level);
    const answer = answerOf(board, level);
    const h = hint(board, answer, []);
    expect(h.kind === 'cross' && h.technique === 'T1-satisfied' && h.cells.length === HINT_CROSS_CAP).toBe(true);
    if (h.kind !== 'cross') return;
    // A bush that wants none says so, rather than "already has all its fireflies".
    expect(h.reason).toBe(ZERO_BUSH_REASON);
    const next = hint(board, answer, [], new Set(), h.cells);
    expect(next.kind === 'cross' && next.technique === 'T1-satisfied' && next.because[0] === h.because[0]).toBe(true);
    if (next.kind !== 'cross') return;
    expect(next.cells.some((c) => h.cells.includes(c))).toBe(false);
  });

  it('points at the bush or tile when the next deduction places a firefly, and never places it', () => {
    // 0 1 2 in a row with a bush wanting 1 at the end: 3 cells, B at 3. The bush needs its only open
    // neighbour (2), so the hint rings the bush and says so.
    const level: Level = { id: 'need', w: 4, h: 1, mask: ['####'], bushes: [[0, 3, 1]], solution: [[0, 2]] };
    const board = buildBoard(level);
    const answer = answerOf(board, level);
    const h = hint(board, answer, []);
    expect(h).toEqual({ kind: 'point', technique: 'T1-needs-all', reason: HINT_REASONS['T1-needs-all'], because: [3], target: 2 });
    expect(hintCell(h as Exclude<Hint, { kind: 'none' }>)).toBe(2);
  });

  it('builds only on hint X marks, and refuses one on an answer tile', () => {
    const level = firstChapters[0]!;
    const board = buildBoard(level);
    const answer = answerOf(board, level);
    const right = [...answer].find((c) => !board.lantern[c])!;
    expect(() => hint(board, answer, [], new Set(), [right])).toThrow(RangeError);
    const bush = board.numbered[0]!;
    expect(() => hint(board, answer, [], new Set(), [bush])).toThrow(RangeError);
  });

  it('throws for a locked cell outside the solution (hint fireflies from older saves)', () => {
    const level = firstChapters[0]!;
    const board = buildBoard(level);
    const answer = answerOf(board, level);
    const wrong = board.paths.find((p) => !answer.has(p))!;
    expect(() => hint(board, answer, [], new Set([wrong]))).toThrow(RangeError);
  });

  it('points along a row near a missing firefly when the grader is stuck, without placing it', () => {
    // An open row with no clues: the grader has nothing to go on, so the hint rings the row.
    const level: Level = { id: 'stuck', w: 4, h: 1, mask: ['####'], bushes: [], solution: [[0, 0]] };
    const board = buildBoard(level);
    const h = hint(board, answerOf(board, level), []);
    expect(h).toEqual({ kind: 'point', technique: null, reason: STUCK_REASONS.row, because: [0, 1, 2, 3], target: 0 });
  });
});

describe('hint wording', () => {
  it('every technique has a ruling-out line and a what-to-look-for line, naming one tile or several', () => {
    for (const t of Object.keys(TECHNIQUE_TIER) as TechniqueId[]) {
      expect(RULE_OUT_REASONS[t]).toBeTruthy();
      expect(HINT_REASONS[t]).toBeTruthy();
      expect(ruleOutReason(t, 1)).not.toContain('{tiles}');
      expect(ruleOutReason(t, 3)).not.toContain('{tiles}');
    }
    expect(ruleOutReason('T2-bush-room', 1)).toContain('this tile');
    expect(ruleOutReason('T2-bush-room', 2)).toContain('these tiles');
    expect(RULE_OUT_REASONS['T1-satisfied']).toMatch(/already has all its fireflies/);
  });
});

describe('hintStep', () => {
  it('is the index of the trace step that decides the cell, or the trace length', () => {
    const level = firstChapters[3]!;
    const board = buildBoard(level);
    const g = grade(board);
    g.steps.forEach((s, i) => {
      if (g.steps.findIndex((t) => t.cell === s.cell) === i) expect(hintStep(g, s.cell)).toBe(i);
    });
    const bush = board.numbered[0]!;
    expect(hintStep(g, bush)).toBe(g.steps.length);
  });
});
