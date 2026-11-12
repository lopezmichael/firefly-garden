import type { Board } from '../src/index.ts';

/**
 * A deliberately naive solution counter: walk the path cells in order,
 * include or skip each one, prune only on obvious violations, and check the
 * full rules at the end. It shares no search logic with solver.ts, which is
 * the point: the two must agree on every board.
 */
export function bruteForceSolutions(board: Board): number[][] {
  const paths = board.paths;
  const chosen = new Set<number>();
  const out: number[][] = [];
  const position = new Map(paths.map((p, k) => [p, k]));

  const bushesOk = (k: number): boolean => {
    for (const b of board.numbered) {
      const want = board.clue[b]!;
      let have = 0;
      let remaining = 0;
      for (const j of board.around[b]!) {
        if (chosen.has(j)) have++;
        else if (position.get(j)! >= k) remaining++;
      }
      if (have > want || have + remaining < want) return false;
    }
    return true;
  };

  const rec = (k: number): void => {
    if (!bushesOk(k)) return;
    if (k === paths.length) {
      const lit = new Set<number>();
      for (const f of chosen) {
        lit.add(f);
        for (const j of board.rays[f]!) lit.add(j);
      }
      if (board.needsLight.every((p) => lit.has(p))) out.push([...chosen].sort((a, b) => a - b));
      return;
    }
    const p = paths[k]!;
    const seesFirefly = board.rays[p]!.some((j) => chosen.has(j));
    if (!seesFirefly && !board.noLand[p]) {
      chosen.add(p);
      rec(k + 1);
      chosen.delete(p);
    }
    if (!board.lantern[p]) rec(k + 1);
  };
  rec(0);
  return out;
}

/** Small seeded PRNG (mulberry32) so random tests are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
