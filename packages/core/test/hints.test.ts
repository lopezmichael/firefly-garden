import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildBoard, canPlace, cellIndex, createRng, evaluate, generate, grade, hint, HINT_REASONS, hintStep, parseLevel,
  REMOVE_REASONS, type Board, type Hint, type Level,
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
const truth = { checked: 0, needsAll: 0, oneSource: 0, withRuledOut: 0, false: [] as string[] };

/**
 * A place hint's reason must hold on what the player sees once the hint's
 * ruled-out cells are marked: a cell is open if it holds no firefly, no
 * firefly sees it, and it is not ruled out.
 */
function checkReason(level: Level, board: Board, on: ReadonlySet<number>, h: Extract<Hint, { kind: 'place' }>) {
  const fly = new Set([...on, ...board.lanterns]);
  const seen = new Set<number>();
  for (const f of fly) for (const j of board.rays[f]!) seen.add(j);
  const ruled = new Set(h.ruledOut);
  const open = (c: number) => !fly.has(c) && !seen.has(c) && !ruled.has(c);
  truth.checked++;
  if (h.ruledOut.length > 0) truth.withRuledOut++;
  if (h.ruledOut.some((c) => fly.has(c) || seen.has(c))) truth.false.push(`${level.id}: ruled out a cell already decided`);
  if (h.technique === 'T1-needs-all') {
    truth.needsAll++;
    const bush = h.because[0]!;
    const around = board.around[bush]!;
    const have = around.filter((c) => fly.has(c)).length;
    const opens = around.filter(open);
    if (!opens.includes(h.cell) || have + opens.length !== board.clue[bush]) {
      truth.false.push(`${level.id}: "needs every open spot" but bush ${bush} has ${have} + ${opens.length} open of ${board.clue[bush]}`);
    }
  } else if (h.technique === 'T2-one-source') {
    truth.oneSource++;
    const dark = h.because[0]!;
    const sources = [dark, ...board.rays[dark]!].filter(open);
    if (seen.has(dark) || fly.has(dark) || sources.length !== 1 || sources[0] !== h.cell) {
      truth.false.push(`${level.id}: "only lit from here" but tile ${dark} has sources ${sources.join(',')}`);
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

describe('hint', () => {
  // Five positions per level: a random part of the answer plus up to two wrong fireflies.
  const RUNS = 5;

  function play(level: Level, seed: number) {
    const board = buildBoard(level);
    const answer = answerOf(board, level);
    const rng = createRng(seed);
    const free = board.paths.filter((p) => !board.lantern[p]);
    const placed = new Set<number>();
    for (const c of answer) if (!board.lantern[c] && rng.next() < 0.5) placed.add(c);
    const wrongPool = free.filter((p) => !answer.has(p));
    for (let k = rng.int(3); k > 0 && wrongPool.length > 0; k--) placed.add(rng.pick(wrongPool));
    const locked = new Set<number>();
    const problems: string[] = [];
    const kinds: string[] = [];
    const limit = 2 * board.paths.length + 4;
    for (let i = 0; i < limit; i++) {
      const h = hint(board, answer, placed, locked);
      kinds.push(h.kind);
      if (h.kind === 'none') {
        if (!evaluate(board, placed).solved) problems.push(`${level.id}: "none" on an unsolved board`);
        return { problems, kinds };
      }
      if (h.kind === 'remove') {
        if (answer.has(h.cell)) problems.push(`${level.id}: removed answer cell ${h.cell}`);
        if (!placed.has(h.cell) || locked.has(h.cell)) problems.push(`${level.id}: removed a cell that was not a player firefly`);
        placed.delete(h.cell);
      } else {
        if (!answer.has(h.cell)) problems.push(`${level.id}: ${h.kind} on non-answer cell ${h.cell}`);
        if (placed.has(h.cell) || board.lantern[h.cell]) problems.push(`${level.id}: ${h.kind} on an occupied cell`);
        if (h.kind === 'place') checkReason(level, board, placed, h);
        placed.add(h.cell);
        locked.add(h.cell);
      }
    }
    problems.push(`${level.id}: not solved after ${limit} hints`);
    return { problems, kinds };
  }

  it('is always correct and repeated hints always finish the level (chapters 1 to 3, reserve, twists)', () => {
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
    expect(truth.needsAll).toBeGreaterThan(100);
    expect(truth.oneSource).toBeGreaterThan(100);
    // Hints come from the grader; the stuck fallback should be rare.
    expect(counts['place']!).toBeGreaterThan(20 * (counts['try-here'] ?? 0));
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
  });

  it('places the grader\'s next firefly with its reason, and never touches locked cells', () => {
    const level = firstChapters[0]!;
    const board = buildBoard(level);
    const answer = answerOf(board, level);
    const h = hint(board, answer, []);
    expect(h.kind).toBe('place');
    if (h.kind !== 'place') return;
    expect(h.reason).toBe(HINT_REASONS[h.technique]);
    expect(h.because.length).toBeGreaterThan(0);
    const lockedOne = new Set([h.cell]);
    const next = hint(board, answer, [], lockedOne);
    expect(next.kind !== 'none' && next.kind !== 'remove' && next.cell !== h.cell).toBe(true);
  });

  it('throws for a locked cell outside the solution', () => {
    const level = firstChapters[0]!;
    const board = buildBoard(level);
    const answer = answerOf(board, level);
    const wrong = board.paths.find((p) => !answer.has(p))!;
    expect(() => hint(board, answer, [], new Set([wrong]))).toThrow(RangeError);
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
