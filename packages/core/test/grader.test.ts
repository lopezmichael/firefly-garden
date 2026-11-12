import { describe, expect, it } from 'vitest';
import { buildBoard, cellIndex, generate, grade, measure, type GenSpec, type Level } from '../src/index.ts';
import { MOCKUPS, UNIQUE } from './fixtures.ts';

/** A spread of specs covering sizes, shapes and every twist. */
const SPECS: GenSpec[] = [];
for (let i = 0; i < 60; i++) {
  const size = 4 + (i % 6);
  SPECS.push({
    id: `g${i}`, seed: 900 + i, w: size, h: size - (i % 3 === 0 ? 1 : 0), bushDensity: 0.15 + (i % 4) * 0.03,
    shape: (['rect', 'ring', 'L', 'bridge', 'crescent'] as const)[i % 5]!,
    hide: i % 2 === 0 ? 'max' : 'none',
    ...(i % 6 === 1 ? { mushrooms: 0.06 } : {}),
    ...(i % 6 === 2 ? { moonlit: 0.08 } : {}),
    ...(i % 6 === 3 ? { toadstools: 0.06 } : {}),
    ...(i % 6 === 4 ? { sporecaps: 0.06 } : {}),
    ...(i % 6 === 5 ? { lanterns: true } : {}),
  });
}

describe('grade', () => {
  it('only ever makes deductions that agree with the unique solution', () => {
    let checked = 0;
    for (const spec of SPECS) {
      const gen = generate(spec);
      if (!gen) continue;
      const board = gen.board;
      const answer = new Set(gen.level.solution!.map((c) => cellIndex(board, c)));
      const g = grade(board);
      for (const step of g.steps) {
        expect(answer.has(step.cell), `${spec.id} ${step.technique} on ${step.cell}`).toBe(step.value === 'firefly');
      }
      if (g.solved) expect(new Set(g.fireflies)).toEqual(answer);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it.each(UNIQUE)('solves the known-unique board $level.id with techniques alone', (f) => {
    const g = grade(buildBoard(f.level));
    expect(g.solved).toBe(true);
    expect(g.maxTier).toBeGreaterThanOrEqual(1);
    expect(g.maxTier).toBeLessThanOrEqual(5);
  });

  it.each(MOCKUPS)('gets stuck (tier 6) on the non-unique board $level.id instead of guessing', (f) => {
    const g = grade(buildBoard(f.level));
    expect(g.solved).toBe(false);
    expect(g.maxTier).toBe(6);
  });

  it('grades a pure bookkeeping board as T1', () => {
    // The bush wants 2 and has exactly 2 open neighbors, which light everything.
    const level: Level = { id: 't1', w: 3, h: 1, mask: ['###'], bushes: [[0, 1, 2]] };
    const g = grade(buildBoard(level));
    expect(g).toMatchObject({ solved: true, maxTier: 1 });
    expect(g.steps.every((s) => s.technique === 'T1-needs-all')).toBe(true);
  });

  it('records every technique tier across a varied batch of generated levels', () => {
    const used = new Set<string>();
    for (const spec of SPECS) {
      const gen = generate(spec);
      if (gen) for (const st of gen.grade.steps) used.add(st.technique);
    }
    for (const t of ['T1-satisfied', 'T1-needs-all', 'T2-one-source', 'T2-bush-room', 'T3-lookahead']) {
      expect(used, t).toContain(t);
    }
  });
});

describe('measure', () => {
  it('scores harder traces higher and estimates longer solves', () => {
    const easy = generate({ id: 'e', seed: 1, w: 4, h: 4, bushDensity: 0.2, hide: 'none', targetTiers: [1, 2] })!;
    const hard = generate({ id: 'h', seed: 2, w: 8, h: 8, bushDensity: 0.18, hide: 'max', targetTiers: [3, 5] })!;
    expect(hard.difficulty.score).toBeGreaterThan(easy.difficulty.score);
    expect(hard.difficulty.estimatedSeconds).toBeGreaterThan(easy.difficulty.estimatedSeconds);
    expect(measure(easy.level, easy.board, easy.grade)).toEqual(easy.difficulty);
  });
});
