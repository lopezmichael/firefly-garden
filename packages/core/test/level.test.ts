import { describe, expect, it } from 'vitest';
import { LevelError, parseLevel } from '../src/index.ts';

/** The draft level from the project plan, verbatim. */
const PLAN_SAMPLE = {
  id: 'c02-l07', area: 'koi-pond', w: 9, h: 5, tier: 2, score: 22,
  mask: ['#########', '###...###', '###...###', '###...###', '#########'],
  bushes: [[0, 4, 0], [2, 1, 2], [2, 7, 2], [4, 4, null]],
  twists: { moonlit: [[0, 8]] },
  solution: [[0, 0], [1, 1], [3, 1], [4, 2], [0, 6], [1, 7], [3, 7], [4, 8]],
  techniques: ['T1', 'T2'],
};

const problemsOf = (json: unknown): readonly string[] => {
  try {
    parseLevel(json);
  } catch (e) {
    if (e instanceof LevelError) return e.problems;
    throw e;
  }
  return [];
};

const withChanges = (changes: Record<string, unknown>) => ({ ...PLAN_SAMPLE, ...changes });

describe('parseLevel', () => {
  it('accepts the sample level from the project plan', () => {
    const level = parseLevel(PLAN_SAMPLE);
    expect(level.id).toBe('c02-l07');
    expect(level.bushes).toHaveLength(4);
  });

  it.each([
    ['a non-object', 42, /not an object/],
    ['a missing id', withChanges({ id: '' }), /id must be/],
    ['an unknown key', withChanges({ colour: 'red' }), /unknown key "colour"/],
    ['an unknown twist', withChanges({ twists: { ponds: [] } }), /unknown twist "ponds"/],
    ['a board edge over the cap', withChanges({ w: 33 }), /w must be/],
    ['a short mask row', withChanges({ mask: ['####', ...PLAN_SAMPLE.mask.slice(1)] }), /row 0 has 4 chars/],
    ['a bad mask char', withChanges({ mask: ['####x####', ...PLAN_SAMPLE.mask.slice(1)] }), /only contain/],
    ['a bush off the board', withChanges({ bushes: [[9, 9, 1]] }), /off the board/],
    ['a bush in the pond', withChanges({ bushes: [[2, 4, 1]] }), /outside the garden mask/],
    ['a clue above 8', withChanges({ bushes: [[0, 4, 9]] }), /must be 0\.\.8/],
    ['two bushes on one cell', withChanges({ bushes: [[0, 4, 0], [0, 4, 1]] }), /overlaps a bush/],
    ['a twist on a bush', withChanges({ twists: { moonlit: [[0, 4]] } }), /overlaps a bush/],
    ['a malformed bush', withChanges({ bushes: [[0, 4]] }), /bushes must be/],
    ['a solution firefly on a bush', withChanges({ solution: [[0, 4]] }), /sits on a bush/],
    ['a repeated solution cell', withChanges({ solution: [[0, 0], [0, 0]] }), /twice/],
    ['an oversized bush list', withChanges({ bushes: Array.from({ length: 1025 }, () => [0, 4, 0]) }), /more than 1024/],
    ['an overlong mask row', withChanges({ mask: ['#'.repeat(33), ...PLAN_SAMPLE.mask.slice(1)] }), /may not exceed 32/],
    ['an overlong id', withChanges({ id: 'x'.repeat(129) }), /id must be/],
    ['a solution missing a lantern', withChanges({ twists: { lanterns: [[0, 8]] } }), /missing the lantern/],
  ])('rejects %s', (_name, json, pattern) => {
    expect(problemsOf(json).join('\n')).toMatch(pattern);
  });

  it('reports every problem at once', () => {
    expect(problemsOf(withChanges({ colour: 'red', tier: 'hard' })).length).toBeGreaterThanOrEqual(2);
  });
});
