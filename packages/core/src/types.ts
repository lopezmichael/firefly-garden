/** A cell position as [row, col], row 0 at the top. */
export type Coord = readonly [row: number, col: number];

/** A bush: [row, col, number]. `null` means the number is hidden from the player. */
export type BushSpec = readonly [row: number, col: number, clue: number | null];

/**
 * Twist tiles layered on top of the base board. Every key is optional; an
 * absent key means the twist is not used in this level.
 */
export interface LevelTwists {
  /**
   * Mushrooms: numbered blockers that count only their 4 side neighbors (up,
   * down, left, right), unlike bushes, which count all 8. Entries are
   * [row, col, number 0..4]. Chosen in Phase 1 over a plain blocker (which
   * played exactly like a hidden bush) and a "toadstool" (rarely mattered).
   */
  readonly mushrooms?: readonly (readonly [row: number, col: number, clue: number])[];
  /** Pre-lit path tiles: they never need covering, fireflies may still sit on them. */
  readonly moonlit?: readonly Coord[];
  /** Fixed fireflies, placed before the player starts. */
  readonly lanterns?: readonly Coord[];
}

/** The on-disk level format. See docs/references/rules.md for the full spec. */
export interface Level {
  readonly id: string;
  readonly area?: string;
  readonly w: number;
  readonly h: number;
  readonly tier?: number;
  readonly score?: number;
  /** `h` strings of `w` chars: `#` is an active cell, `.` is outside the garden. */
  readonly mask: readonly string[];
  readonly bushes: readonly BushSpec[];
  readonly twists?: LevelTwists;
  /** Every firefly in the answer, lanterns included. */
  readonly solution?: readonly Coord[];
  readonly techniques?: readonly string[];
  /** Estimated solve time in whole seconds (`measure`), written by the generator. */
  readonly seconds?: number;
}
