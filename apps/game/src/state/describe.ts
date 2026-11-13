import type { Board, Evaluation } from '@firefly/core';

/**
 * Words for one cell, for screen readers following the keyboard focus ring.
 * Rows and columns are as drawn on screen (the caller maps rotation), counted
 * from 1. Pure so the wording is tested.
 */
export function describeCell(board: Board, ev: Evaluation, locked: ReadonlySet<number>, cell: number, row: number, col: number): string {
  const where = `Row ${row + 1}, column ${col + 1}`;
  const kind = board.kind[cell];
  if (kind === 'void') return `${where}: outside the garden`;
  if (kind === 'bush' || kind === 'mushroom') {
    const name = kind === 'bush' ? 'bush' : 'mushroom';
    const b = ev.bushes.find((s) => s.cell === cell);
    if (!b) return `${where}: ${name}`;
    const state = b.state === 'met' ? 'done' : b.state === 'over' ? 'too many' : `${b.have} so far`;
    return `${where}: ${name} wants ${b.want}, ${state}`;
  }
  const has = ev.fireflies.includes(cell);
  if (has) {
    const what = board.lantern[cell] ? 'lantern' : locked.has(cell) ? 'hint firefly, locked' : 'firefly';
    return `${where}: ${what}${ev.conflicts.includes(cell) ? ', sees another firefly' : ''}`;
  }
  return `${where}: ${ev.lit[cell] ? 'lit' : 'dark'} path`;
}
