import type { Board } from './board.ts';

/**
 * Exact solver: finds every solution (up to a limit) by constraint
 * propagation plus backtracking. This is the uniqueness checker, the CI
 * validator and the source of truth for hints. It is deliberately not
 * "human-like"; the technique grader (Phase 1) is a separate solver.
 */

export interface SolveOptions {
  /** Stop after this many solutions. Default 2, which is all a uniqueness check needs. */
  readonly limit?: number;
  /**
   * Give up after visiting this many search nodes. Unset means no budget,
   * which is right for shipped levels; set it for anything generated on the
   * fly so a pathological board cannot hang the caller.
   */
  readonly maxNodes?: number;
}

export interface SolveResult {
  /** Each solution is every firefly cell (lanterns included), ascending. */
  readonly solutions: readonly (readonly number[])[];
  /** Number of solutions found (equals `solutions.length`). */
  readonly count: number;
  /**
   * True if the search finished, so `count` is the exact total. False once
   * `count` reaches the limit (even if no more solutions exist) or the node
   * budget runs out; then `count` is only a lower bound.
   */
  readonly exhaustive: boolean;
  /** True if the search stopped because `maxNodes` ran out. */
  readonly budgetExceeded: boolean;
  /** Search nodes visited; a rough cost measure for comparing boards. */
  readonly nodes: number;
}

const UNK = 0;
const FLY = 1;
const NO = 2;

interface State {
  /** Per cell: UNK, FLY or NO. Only meaningful for path cells. */
  st: Int8Array;
  /** Per cell: 1 if a firefly lights it. */
  lit: Uint8Array;
}

export function solve(board: Board, options: SolveOptions = {}): SolveResult {
  const limit = options.limit ?? 2;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be a positive integer');
  const maxNodes = options.maxNodes ?? Infinity;
  if (maxNodes !== Infinity && (!Number.isInteger(maxNodes) || maxNodes < 1)) {
    throw new RangeError('maxNodes must be a positive integer');
  }
  let budgetExceeded = false;

  const solutions: number[][] = [];
  let nodes = 0;
  let stopped = false;

  const place = (s: State, i: number): boolean => {
    const cur = s.st[i];
    if (cur === FLY) return true;
    if (cur === NO) return false;
    s.st[i] = FLY;
    s.lit[i] = 1;
    for (const j of board.rays[i]!) {
      // A firefly already in view means this placement conflicts. Placing
      // always marks its rays NO, so this only guards against misuse.
      if (s.st[j] === FLY) return false;
      s.st[j] = NO;
      s.lit[j] = 1;
    }
    return true;
  };

  const exclude = (s: State, i: number): boolean => {
    if (s.st[i] === FLY) return false;
    s.st[i] = NO;
    return true;
  };

  /** Cells that could still light `p`: itself and its ray cells, if undecided. */
  const candidates = (s: State, p: number): number[] => {
    const out: number[] = [];
    if (s.st[p] === UNK) out.push(p);
    for (const j of board.rays[p]!) if (s.st[j] === UNK) out.push(j);
    return out;
  };

  /** Apply forced moves until nothing changes. False on contradiction. */
  const propagate = (s: State): boolean => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const b of board.numbered) {
        const want = board.clue[b]!;
        let have = 0;
        let open = 0;
        for (const j of board.around[b]!) {
          if (s.st[j] === FLY) have++;
          else if (s.st[j] === UNK) open++;
        }
        if (have > want || have + open < want) return false;
        if (open === 0) continue;
        if (have === want) {
          for (const j of board.around[b]!) if (s.st[j] === UNK) s.st[j] = NO;
          changed = true;
        } else if (have + open === want) {
          for (const j of board.around[b]!) if (s.st[j] === UNK && !place(s, j)) return false;
          changed = true;
        }
      }
      for (const p of board.needsLight) {
        if (s.lit[p]) continue;
        const c = candidates(s, p);
        if (c.length === 0) return false;
        if (c.length === 1) {
          if (!place(s, c[0]!)) return false;
          changed = true;
        }
      }
    }
    return true;
  };

  const clone = (s: State): State => ({ st: s.st.slice(), lit: s.lit.slice() });

  const search = (s: State): void => {
    if (stopped) return;
    if (nodes >= maxNodes) {
      budgetExceeded = true;
      stopped = true;
      return;
    }
    nodes++;
    if (!propagate(s)) return;

    // Branch on the dark tile with the fewest ways to light it. Branch k
    // means "candidate k is the first, in order, to hold a firefly", so
    // the branches are disjoint and together cover every solution.
    let best: number[] | null = null;
    for (const p of board.needsLight) {
      if (s.lit[p]) continue;
      const c = candidates(s, p);
      if (best === null || c.length < best.length) best = c;
      if (best.length === 2) break;
    }
    if (best !== null) {
      for (let k = 0; k < best.length && !stopped; k++) {
        const next = clone(s);
        let ok = true;
        for (let m = 0; m < k && ok; m++) ok = exclude(next, best[m]!);
        if (ok && place(next, best[k]!)) search(next);
      }
      return;
    }

    // Everything that needs light is lit. Any undecided cell left is an unlit
    // moonlit tile; a firefly there is optional unless a bush needs it.
    const open = board.paths.find((p) => s.st[p] === UNK);
    if (open === undefined) {
      solutions.push(board.paths.filter((p) => s.st[p] === FLY));
      if (solutions.length >= limit) stopped = true;
      return;
    }
    const withFly = clone(s);
    if (place(withFly, open)) search(withFly);
    if (stopped) return;
    const without = clone(s);
    if (exclude(without, open)) search(without);
  };

  const n = board.w * board.h;
  const start: State = { st: new Int8Array(n), lit: new Uint8Array(n) };
  let ok = true;
  for (const l of board.lanterns) ok = ok && place(start, l);
  if (ok) search(start);

  return { solutions, count: solutions.length, exhaustive: !stopped, budgetExceeded, nodes };
}

/** True if the board has exactly one solution. */
export function isUnique(board: Board): boolean {
  const result = solve(board, { limit: 2 });
  return result.count === 1 && result.exhaustive;
}
