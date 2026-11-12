import type { Board } from './board.ts';

/**
 * The technique grader: solves the way a person would, always trying the
 * simplest technique first, one deduction at a time, and records the trace.
 * It is intentionally separate from the exact solver (solver.ts); the exact
 * solver decides uniqueness, this one decides how hard a level feels.
 *
 * Tiers (from the project plan):
 *   T1 bush bookkeeping   a bush has its number (others empty) or needs every open neighbor
 *   T2 only one source    a dark tile with exactly one cell left that can light it
 *      bush room          a bush's open spots that can all hold fireflies together leave no choice
 *   T3 one-step lookahead assuming a cell leads straight to a contradiction
 *   T4 overlapping bushes two bushes share neighbors; their numbers pin the shared/unshared parts
 *   T5 deep trial         an assumption followed several deductions ahead to a contradiction
 * A level the grader cannot finish even with T5 is graded tier 6 ("beyond").
 */

export type TechniqueId =
  | 'T1-satisfied' | 'T1-needs-all' | 'T2-one-source' | 'T2-bush-room' | 'T3-lookahead' | 'T4-overlap' | 'T5-trial';

export const TECHNIQUE_TIER: Readonly<Record<TechniqueId, number>> = {
  'T1-satisfied': 1,
  'T1-needs-all': 1,
  'T2-one-source': 2,
  'T2-bush-room': 2,
  'T3-lookahead': 3,
  'T4-overlap': 4,
  'T5-trial': 5,
};

export interface Step {
  readonly technique: TechniqueId;
  readonly tier: number;
  /** The cell decided this step. */
  readonly cell: number;
  readonly value: 'firefly' | 'empty';
  /**
   * How many distinct cells this technique could have decided at this point.
   * Few options means the move is hard to spot.
   */
  readonly width: number;
  /** Cells that justify the deduction (the bush, the dark tile...), for hints. */
  readonly because: readonly number[];
}

export interface Grade {
  /** True if the techniques reached a solved position. */
  readonly solved: boolean;
  readonly steps: readonly Step[];
  /** Hardest tier used, 0 if nothing needed deducing, 6 if stuck. */
  readonly maxTier: number;
  /** Steps per tier, index 1..5. */
  readonly tierCounts: readonly number[];
  /** Fireflies on the board at the end, ascending. */
  readonly fireflies: readonly number[];
}

const UNK = 0;
const FLY = 1;
const NO = 2;

interface State {
  st: Int8Array;
  lit: Uint8Array;
}

interface Deduction {
  readonly technique: TechniqueId;
  readonly cell: number;
  readonly value: 'firefly' | 'empty';
  readonly because: readonly number[];
}

export interface GradeOptions {
  /** Stop after this many steps (safety net). Default: 4 × cell count. */
  readonly maxSteps?: number;
  /**
   * Try overlapping-bush reasoning (T4) before one-step lookahead (T3).
   * Default false, matching the plan's tier order. Used to test how
   * sensitive the grades are to that ordering.
   */
  readonly overlapFirst?: boolean;
}

export function grade(board: Board, options: GradeOptions = {}): Grade {
  const n = board.w * board.h;
  const s: State = { st: new Int8Array(n), lit: new Uint8Array(n) };
  for (const p of board.paths) if (board.noLand[p]) s.st[p] = NO;
  for (const l of board.lanterns) place(board, s, l);

  const steps: Step[] = [];
  const maxSteps = options.maxSteps ?? 4 * n;
  let stuck = false;

  while (!isSolved(board, s) && steps.length < maxSteps) {
    let found: Deduction[] = [];
    for (const finder of options.overlapFirst ? FINDERS_OVERLAP_FIRST : FINDERS) {
      found = finder(board, s);
      if (found.length > 0) break;
    }
    if (found.length === 0) {
      stuck = true;
      break;
    }
    const width = new Set(found.map((d) => d.cell)).size;
    const d = found[0]!;
    if (d.value === 'firefly') {
      if (!place(board, s, d.cell)) {
        stuck = true; // a sound technique never does this; treat as a grader bug signal
        break;
      }
    } else {
      s.st[d.cell] = NO;
    }
    steps.push({ technique: d.technique, tier: TECHNIQUE_TIER[d.technique], cell: d.cell, value: d.value, width, because: d.because });
  }

  const solved = !stuck && isSolved(board, s);
  const tierCounts = [0, 0, 0, 0, 0, 0];
  for (const st of steps) tierCounts[st.tier]!++;
  const maxTier = solved ? steps.reduce((m, st) => Math.max(m, st.tier), 0) : 6;
  const fireflies = board.paths.filter((p) => s.st[p] === FLY);
  return { solved, steps, maxTier, tierCounts, fireflies };
}

// ---------------------------------------------------------------------------
// State helpers

function place(board: Board, s: State, i: number): boolean {
  if (s.st[i] === FLY) return true;
  if (s.st[i] === NO) return false;
  s.st[i] = FLY;
  s.lit[i] = 1;
  for (const j of board.rays[i]!) {
    if (s.st[j] === FLY) return false;
    s.st[j] = NO; // the player sees it lit and knows no firefly can go there
    s.lit[j] = 1;
  }
  return true;
}

function clone(s: State): State {
  return { st: s.st.slice(), lit: s.lit.slice() };
}

function candidates(board: Board, s: State, p: number): number[] {
  const out: number[] = [];
  if (s.st[p] === UNK) out.push(p);
  for (const j of board.rays[p]!) if (s.st[j] === UNK) out.push(j);
  return out;
}

function bushCounts(board: Board, s: State, b: number): { have: number; open: number[] } {
  let have = 0;
  const open: number[] = [];
  for (const j of board.around[b]!) {
    if (s.st[j] === FLY) have++;
    else if (s.st[j] === UNK) open.push(j);
  }
  return { have, open };
}

function isSolved(board: Board, s: State): boolean {
  for (const p of board.needsLight) if (!s.lit[p]) return false;
  for (const b of board.numbered) if (bushCounts(board, s, b).have !== board.clue[b]) return false;
  return true;
}

/**
 * Every set of `size` open cells that could all hold fireflies at once (no
 * two in view of each other). A bush has at most 8 neighbors, so brute force
 * over subsets is cheap.
 */
function independentSets(board: Board, open: readonly number[], size: number): number[][] {
  const out: number[][] = [];
  const pick: number[] = [];
  const rec = (start: number) => {
    if (pick.length === size) {
      out.push(pick.slice());
      return;
    }
    for (let i = start; i < open.length; i++) {
      const c = open[i]!;
      if (pick.some((p) => board.rays[p]!.includes(c))) continue;
      pick.push(c);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return out;
}

/** An immediately visible contradiction: a bush over or without room, or a dark tile nothing can light. */
function contradiction(board: Board, s: State): boolean {
  for (const b of board.numbered) {
    const { have, open } = bushCounts(board, s, b);
    const need = board.clue[b]! - have;
    if (need < 0 || open.length < need) return true;
    if (need > 1 && independentSets(board, open, need).length === 0) return true;
  }
  for (const p of board.needsLight) if (!s.lit[p] && candidates(board, s, p).length === 0) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Techniques, simplest first

type Finder = (board: Board, s: State) => Deduction[];

const t1: Finder = (board, s) => {
  const out: Deduction[] = [];
  for (const b of board.numbered) {
    const { have, open } = bushCounts(board, s, b);
    if (open.length === 0) continue;
    const want = board.clue[b]!;
    if (have === want) for (const c of open) out.push({ technique: 'T1-satisfied', cell: c, value: 'empty', because: [b] });
    else if (have + open.length === want) for (const c of open) out.push({ technique: 'T1-needs-all', cell: c, value: 'firefly', because: [b] });
  }
  return out;
};

const t2: Finder = (board, s) => {
  const out: Deduction[] = [];
  for (const p of board.needsLight) {
    if (s.lit[p]) continue;
    const c = candidates(board, s, p);
    if (c.length === 1) out.push({ technique: 'T2-one-source', cell: c[0]!, value: 'firefly', because: [p] });
  }
  return out;
};

/** A bush that needs k more: cells in every way to seat k non-conflicting fireflies are forced; cells in none are out. */
const t2room: Finder = (board, s) => {
  const out: Deduction[] = [];
  for (const b of board.numbered) {
    const { have, open } = bushCounts(board, s, b);
    const need = board.clue[b]! - have;
    if (need <= 0 || open.length <= need) continue; // T1's cases
    const sets = independentSets(board, open, need);
    if (sets.length === 0) continue;
    for (const c of open) {
      const inCount = sets.filter((set) => set.includes(c)).length;
      if (inCount === sets.length) out.push({ technique: 'T2-bush-room', cell: c, value: 'firefly', because: [b] });
      else if (inCount === 0) out.push({ technique: 'T2-bush-room', cell: c, value: 'empty', because: [b] });
    }
  }
  return out;
};

/** Try each assumption for one undecided cell; report the cells where one side fails. */
function lookahead(board: Board, s: State, technique: TechniqueId, settle: (s: State) => boolean): Deduction[] {
  const out: Deduction[] = [];
  for (const x of board.paths) {
    if (s.st[x] !== UNK) continue;
    const asFly = clone(s);
    if (!place(board, asFly, x) || !settle(asFly) || contradiction(board, asFly)) {
      out.push({ technique, cell: x, value: 'empty', because: [x] });
      continue;
    }
    const asEmpty = clone(s);
    asEmpty.st[x] = NO;
    if (!settle(asEmpty) || contradiction(board, asEmpty)) out.push({ technique, cell: x, value: 'firefly', because: [x] });
  }
  return out;
}

/**
 * One step ahead: after the assumption, apply every T1/T2 move visible at
 * that moment, once, and look for a contradiction. (T5 keeps going.)
 */
function settleOneRound(board: Board, s: State): boolean {
  const ds = [...t1(board, s), ...t2(board, s)];
  return applyAll(board, s, ds);
}

const t3: Finder = (board, s) => lookahead(board, s, 'T3-lookahead', (x) => settleOneRound(board, x));

const t4: Finder = (board, s) => {
  const out: Deduction[] = [];
  const nb = board.numbered;
  for (let i = 0; i < nb.length; i++) {
    for (let k = i + 1; k < nb.length; k++) {
      const a = nb[i]!, b = nb[k]!;
      const A = bushCounts(board, s, a), B = bushCounts(board, s, b);
      const bSet = new Set(B.open);
      const shared = A.open.filter((c) => bSet.has(c));
      if (shared.length === 0) continue;
      const sharedSet = new Set(shared);
      const aOnly = A.open.filter((c) => !sharedSet.has(c));
      const bOnly = B.open.filter((c) => !sharedSet.has(c));
      const needA = board.clue[a]! - A.have, needB = board.clue[b]! - B.have;
      // Fireflies in the shared cells: at least what each bush can't get elsewhere,
      // at most what either still needs.
      const lo = Math.max(0, needA - aOnly.length, needB - bOnly.length);
      const hi = Math.min(needA, needB, shared.length);
      if (lo > hi) continue; // contradiction; T3 or the exact solver will see it
      const because = [a, b];
      const all = (cells: number[], value: 'firefly' | 'empty') => {
        for (const c of cells) out.push({ technique: 'T4-overlap', cell: c, value, because });
      };
      if (hi === 0) all(shared, 'empty');
      if (lo === shared.length) all(shared, 'firefly');
      if (needA - lo === 0) all(aOnly, 'empty');
      else if (needA - hi === aOnly.length) all(aOnly, 'firefly');
      if (needB - lo === 0) all(bOnly, 'empty');
      else if (needB - hi === bOnly.length) all(bOnly, 'firefly');
    }
  }
  return out;
};

/** Apply T1, T2 and T4 to a fixpoint. False if a placement fails along the way. */
function settleWithBasics(board: Board, s: State, budget = 60): boolean {
  for (let round = 0; round < budget; round++) {
    let ds = t1(board, s);
    if (ds.length === 0) ds = t2(board, s);
    if (ds.length === 0) ds = t2room(board, s);
    if (ds.length === 0) ds = t4(board, s);
    if (ds.length === 0) return true;
    if (!applyAll(board, s, ds) || contradiction(board, s)) return false;
  }
  return true;
}

/** Apply deductions made on a hypothetical state. False if two of them clash. */
function applyAll(board: Board, s: State, ds: readonly Deduction[]): boolean {
  for (const d of ds) {
    if (d.value === 'firefly') {
      if (!place(board, s, d.cell)) return false;
    } else if (s.st[d.cell] === FLY) {
      return false;
    } else {
      s.st[d.cell] = NO;
    }
  }
  return true;
}

const t5: Finder = (board, s) => lookahead(board, s, 'T5-trial', (x) => settleWithBasics(board, x));

const FINDERS: readonly Finder[] = [t1, t2, t2room, t3, t4, t5];
const FINDERS_OVERLAP_FIRST: readonly Finder[] = [t1, t2, t2room, t4, t3, t5];
