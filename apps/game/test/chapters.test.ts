import { describe, expect, it } from 'vitest';
import { PLAYED_CHAPTERS } from '../src/build.ts';
import { chapterFinishedBy, chapterLine, chapterTotals, formatDuration } from '../src/state/chapters.ts';

const chapters = [
  { id: 'c1', levels: ['a', 'b', 'c'] },
  { id: 'c2', levels: ['d', 'e'] },
];
const solved = (ids: string[]) => (id: string) => ids.includes(id);

describe('the solve that finishes a chapter', () => {
  it('is the last unsolved level of its chapter', () => {
    expect(chapterFinishedBy(chapters, 'c', solved(['a', 'b']))).toBe(0);
    expect(chapterFinishedBy(chapters, 'a', solved(['b', 'c']))).toBe(0); // order doesn't matter
    expect(chapterFinishedBy(chapters, 'e', solved(['a', 'b', 'c', 'd']))).toBe(1);
  });

  it('is not any other solve', () => {
    expect(chapterFinishedBy(chapters, 'b', solved(['a']))).toBeNull(); // c still open
    expect(chapterFinishedBy(chapters, 'c', solved(['a', 'b', 'c']))).toBeNull(); // a replay: already finished
    expect(chapterFinishedBy(chapters, 'x', solved(['a', 'b', 'c']))).toBeNull(); // a detour, in no chapter
    expect(chapterFinishedBy(chapters, 'd', solved(['a', 'b', 'c']))).toBeNull(); // the next chapter starts
  });
});

describe('the chapter card', () => {
  it('totals every attempt on the chapter and nothing else', () => {
    const history = [
      { levelId: 'a', seconds: 30.4, hints: 0 },
      { levelId: 'b', seconds: 20, hints: 1 }, // a quit
      { levelId: 'b', seconds: 40, hints: 1 },
      { levelId: 'x', seconds: 99, hints: 3 }, // a detour
      { levelId: 'c', seconds: 50, hints: 0 },
    ];
    expect(chapterTotals(chapters[0]!, history)).toEqual({ gardens: 3, seconds: 140, hints: 2 });
  });

  it('has a line for every chapter, with a fallback', () => {
    expect(chapterLine('c1')).toMatch(/glowing/);
    expect(chapterLine('c99')).toBe('Every garden in this bed is glowing.');
  });

  it('every chapter the build plays has its own line, never the fallback', () => {
    const lines = PLAYED_CHAPTERS.map((id) => chapterLine(id));
    for (const line of lines) expect(line).not.toBe(chapterLine('c99'));
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('formats durations as minutes and seconds', () => {
    expect(formatDuration(564)).toBe('9:24');
    expect(formatDuration(4445)).toBe('74:05');
    expect(formatDuration(-3)).toBe('0:00');
  });
});
