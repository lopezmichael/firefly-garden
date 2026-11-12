import { buildBoard, cellIndex, gradeLevel, parseLevel } from '@firefly/core';
import type { Board, Grade, Level, PolicyLevel } from '@firefly/core';

/**
 * The levels this build plays: the chosen chapters of the launch pack (the main
 * path, in order) and the reserve pack (policy detours). Packs ship inside the
 * bundle but still go through `parseLevel`, so a bad regeneration fails loudly
 * at startup instead of drawing a broken board.
 */

export interface ChapterInfo {
  readonly id: string;
  readonly title: string;
  readonly area: string;
  readonly levels: readonly string[];
}

export interface Catalog {
  readonly chapters: readonly ChapterInfo[];
  /** Main-path level ids, in play order. */
  readonly mainPath: readonly string[];
  readonly reserve: readonly PolicyLevel[];
  /** Every playable level (main path and reserve), for the policy. */
  readonly levels: ReadonlyMap<string, PolicyLevel>;
  /** Main-path ids, for save validation. */
  readonly mainIds: ReadonlySet<string>;
  /** Reserve ids, for save validation. */
  readonly reserveIds: ReadonlySet<string>;
  has(id: string): boolean;
  level(id: string): Level;
  board(id: string): Board;
  /** The unique answer as cell indices (lanterns included). */
  solution(id: string): ReadonlySet<number>;
  /** The level's full grader trace from an empty board, graded as shipped (count known), for `hintStep`. */
  grade(id: string): Grade;
  /**
   * A short fingerprint of a level's content. Saves carry it with the level on the board, so a
   * level regenerated under the same id never resumes an old board onto a new layout.
   */
  levelKey(id: string): string;
  /** Where a main-path level sits: its chapter and 0-based index in it. */
  place(id: string): { readonly chapter: ChapterInfo; readonly index: number } | undefined;
}

export interface PackData {
  readonly launch: unknown;
  readonly reserve: unknown;
  readonly manifest: unknown;
}

export class CatalogError extends Error {}

function levelsOf(pack: unknown, name: string): unknown[] {
  if (typeof pack !== 'object' || pack === null || !Array.isArray((pack as { levels?: unknown }).levels)) {
    throw new CatalogError(`${name} pack has no levels array`);
  }
  return (pack as { levels: unknown[] }).levels;
}

function chaptersOf(manifest: unknown): ChapterInfo[] {
  const raw = (manifest as { chapters?: unknown } | null)?.chapters;
  if (!Array.isArray(raw)) throw new CatalogError('manifest has no chapters array');
  return raw.map((c: unknown, i) => {
    if (typeof c !== 'object' || c === null) throw new CatalogError(`manifest chapter ${i} is not an object`);
    const o = c as Record<string, unknown>;
    const levels = o.levels;
    if (typeof o.id !== 'string' || typeof o.title !== 'string' || typeof o.area !== 'string'
      || !Array.isArray(levels) || !levels.every((l) => typeof l === 'string')) {
      throw new CatalogError(`manifest chapter ${i} is malformed`);
    }
    return { id: o.id, title: o.title, area: o.area, levels: levels as string[] };
  });
}

function seconds(level: Level): number {
  if (level.seconds === undefined) throw new CatalogError(`${level.id} has no estimated seconds`);
  return level.seconds;
}

function policyLevel(level: Level): PolicyLevel {
  if (level.tier === undefined || level.score === undefined) throw new CatalogError(`${level.id} is not graded`);
  return { id: level.id, tier: level.tier, score: level.score, estimatedSeconds: seconds(level) };
}

/** Build the catalog for the given chapter ids (in play order). */
export function createCatalog(data: PackData, chapterIds: readonly string[]): Catalog {
  const allChapters = chaptersOf(data.manifest);
  const chapters = chapterIds.map((id) => {
    const ch = allChapters.find((c) => c.id === id);
    if (!ch) throw new CatalogError(`chapter ${id} is not in the manifest`);
    return ch;
  });
  const mainPath = chapters.flatMap((c) => c.levels);
  const wanted = new Set(mainPath);

  const parsed = new Map<string, Level>();
  for (const raw of levelsOf(data.launch, 'launch')) {
    const id = (raw as { id?: unknown } | null)?.id;
    if (typeof id === 'string' && wanted.has(id)) parsed.set(id, parseLevel(raw));
  }
  for (const id of mainPath) if (!parsed.has(id)) throw new CatalogError(`main-path level ${id} is missing from the launch pack`);

  const reserveLevels = levelsOf(data.reserve, 'reserve').map((raw) => parseLevel(raw));
  for (const l of reserveLevels) {
    if (parsed.has(l.id)) throw new CatalogError(`level id ${l.id} appears twice`);
    parsed.set(l.id, l);
  }

  const levels = new Map<string, PolicyLevel>();
  for (const l of parsed.values()) levels.set(l.id, policyLevel(l));
  const reserve = reserveLevels.map((l) => levels.get(l.id)!);

  const boards = new Map<string, Board>();
  const solutions = new Map<string, ReadonlySet<number>>();
  const grades = new Map<string, Grade>();
  const places = new Map<string, { chapter: ChapterInfo; index: number }>();
  chapters.forEach((chapter) => chapter.levels.forEach((id, index) => places.set(id, { chapter, index })));

  const level = (id: string): Level => {
    const l = parsed.get(id);
    if (!l) throw new CatalogError(`unknown level ${id}`);
    return l;
  };
  const board = (id: string): Board => {
    let b = boards.get(id);
    if (!b) {
      b = buildBoard(level(id));
      boards.set(id, b);
    }
    return b;
  };

  return {
    chapters,
    mainPath,
    reserve,
    levels,
    mainIds: wanted,
    reserveIds: new Set(reserve.map((l) => l.id)),
    has: (id) => parsed.has(id),
    level,
    board,
    solution(id) {
      let s = solutions.get(id);
      if (!s) {
        const l = level(id);
        if (!l.solution) throw new CatalogError(`${id} has no stored solution`);
        const b = board(id);
        s = new Set(l.solution.map((p) => cellIndex(b, p)));
        solutions.set(id, s);
      }
      return s;
    },
    grade(id) {
      let g = grades.get(id);
      if (!g) {
        g = gradeLevel(level(id), board(id));
        grades.set(id, g);
      }
      return g;
    },
    levelKey: (id) => {
      const l = level(id);
      return fnv1a(JSON.stringify([l.w, l.h, l.mask, l.bushes, l.twists ?? null, l.solution ?? null]));
    },
    place: (id) => places.get(id),
  };
}

/** FNV-1a, 32-bit, as 8 hex digits: a fingerprint for change detection, not security. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
