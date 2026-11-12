import type { BushSpec, Coord, Level, LevelTwists } from './types.ts';

/** Largest board edge we accept. Generous: phone layouts cap far lower. */
export const MAX_BOARD_EDGE = 32;
/** No list in a level can sensibly be longer than the largest board has cells. */
const MAX_LIST = MAX_BOARD_EDGE * MAX_BOARD_EDGE;
const MAX_TEXT = 128;

const TWIST_KEYS = ['mushrooms', 'moonlit', 'lanterns', 'toadstools', 'sporecaps'] as const;
const LEVEL_KEYS = new Set([
  'id', 'area', 'w', 'h', 'tier', 'score', 'mask', 'bushes', 'twists', 'solution', 'techniques',
]);

export class LevelError extends Error {
  readonly problems: readonly string[];
  constructor(id: string, problems: readonly string[]) {
    super(`Invalid level ${id}: ${problems.join('; ')}`);
    this.name = 'LevelError';
    this.problems = problems;
  }
}

/**
 * Turn untrusted JSON into a Level, or throw a LevelError listing every
 * problem found. Unknown keys are rejected so a typo'd or future twist can
 * never be silently ignored.
 */
export function parseLevel(json: unknown): Level {
  const problems: string[] = [];
  if (!isRecord(json)) throw new LevelError('?', ['level is not an object']);
  const id = typeof json.id === 'string' && json.id.length > 0 && json.id.length <= MAX_TEXT ? json.id : '?';
  if (id === '?') problems.push(`id must be a string of 1..${MAX_TEXT} chars`);

  // Size caps first, so oversized input is rejected before any per-item work.
  const lists: [string, unknown][] = [
    ['mask', json.mask], ['bushes', json.bushes], ['solution', json.solution], ['techniques', json.techniques],
    ...(isRecord(json.twists) ? Object.entries(json.twists).map(([k, v]): [string, unknown] => [`twists.${k}`, v]) : []),
  ];
  for (const [name, v] of lists) {
    if (Array.isArray(v) && v.length > MAX_LIST) problems.push(`${name} has more than ${MAX_LIST} entries`);
  }
  if (typeof json.area === 'string' && json.area.length > MAX_TEXT) problems.push(`area is longer than ${MAX_TEXT} chars`);
  if (Array.isArray(json.mask) && json.mask.some((row) => typeof row === 'string' && row.length > MAX_BOARD_EDGE)) {
    problems.push(`mask rows may not exceed ${MAX_BOARD_EDGE} chars`);
  }
  if (problems.length > 0) throw new LevelError(id, problems);

  for (const key of Object.keys(json)) {
    if (!LEVEL_KEYS.has(key)) problems.push(`unknown key "${key}"`);
  }

  const w = json.w, h = json.h;
  if (!isInt(w) || w < 1 || w > MAX_BOARD_EDGE) problems.push(`w must be an integer 1..${MAX_BOARD_EDGE}`);
  if (!isInt(h) || h < 1 || h > MAX_BOARD_EDGE) problems.push(`h must be an integer 1..${MAX_BOARD_EDGE}`);
  if (!isStringArray(json.mask)) problems.push('mask must be an array of strings');
  if (!Array.isArray(json.bushes) || !json.bushes.every(isBushSpec)) {
    problems.push('bushes must be an array of [row, col, number|null]');
  }
  for (const key of ['area'] as const) {
    if (json[key] !== undefined && typeof json[key] !== 'string') problems.push(`${key} must be a string`);
  }
  for (const key of ['tier', 'score'] as const) {
    if (json[key] !== undefined && !isFiniteNumber(json[key])) problems.push(`${key} must be a number`);
  }
  if (json.solution !== undefined && !isCoordArray(json.solution)) problems.push('solution must be an array of [row, col]');
  if (json.techniques !== undefined && !isStringArray(json.techniques)) problems.push('techniques must be an array of strings');

  if (json.twists !== undefined) {
    if (!isRecord(json.twists)) {
      problems.push('twists must be an object');
    } else {
      for (const key of Object.keys(json.twists)) {
        if (!(TWIST_KEYS as readonly string[]).includes(key)) problems.push(`unknown twist "${key}"`);
        else if (key === 'sporecaps') {
          const v = json.twists[key];
          if (!Array.isArray(v) || !v.every((e) => isBushSpec(e) && e[2] !== null)) {
            problems.push('twists.sporecaps must be an array of [row, col, number]');
          }
        } else if (!isCoordArray(json.twists[key])) problems.push(`twists.${key} must be an array of [row, col]`);
      }
    }
  }

  if (problems.length > 0) throw new LevelError(id, problems);

  // Shape is right; the casts below are what the checks above just proved.
  const level = json as unknown as Level;
  const semantic = validateLevel(level);
  if (semantic.length > 0) throw new LevelError(id, semantic);
  return level;
}

/**
 * Check a typed Level for consistency: mask dimensions, every bush and twist
 * on an active cell, no cell claimed twice, clue numbers 0..8, solution on
 * path cells. Returns the problems found (empty means valid).
 */
export function validateLevel(level: Level): string[] {
  const problems: string[] = [];
  const { w, h, mask } = level;

  if (mask.length !== h) problems.push(`mask has ${mask.length} rows, expected ${h}`);
  mask.forEach((row, r) => {
    if (row.length !== w) problems.push(`mask row ${r} has ${row.length} chars, expected ${w}`);
    if (!/^[#.]*$/.test(row)) problems.push(`mask row ${r} may only contain "#" and "."`);
  });
  if (problems.length > 0) return problems;

  const active = (r: number, c: number) => mask[r]?.[c] === '#';
  const claimed = new Map<string, string>();
  const claim = (what: string, [r, c]: Coord) => {
    if (!isInt(r) || !isInt(c) || r < 0 || r >= h || c < 0 || c >= w) {
      problems.push(`${what} at [${r}, ${c}] is off the board`);
      return;
    }
    if (!active(r, c)) {
      problems.push(`${what} at [${r}, ${c}] is outside the garden mask`);
      return;
    }
    const key = `${r},${c}`;
    const prev = claimed.get(key);
    if (prev !== undefined) problems.push(`${what} at [${r}, ${c}] overlaps a ${prev}`);
    else claimed.set(key, what);
  };

  for (const [r, c, clue] of level.bushes) {
    claim('bush', [r, c]);
    if (clue !== null && (!isInt(clue) || clue < 0 || clue > 8)) {
      problems.push(`bush at [${r}, ${c}] has clue ${clue}; must be 0..8 or null`);
    }
  }
  const twists: LevelTwists = level.twists ?? {};
  for (const m of twists.mushrooms ?? []) claim('mushroom', m);
  // Moonlit tiles and lanterns are both path tiles, so neither may share a
  // cell with a blocker, and a lantern on a moonlit tile is redundant.
  for (const m of twists.moonlit ?? []) claim('moonlit tile', m);
  for (const l of twists.lanterns ?? []) claim('lantern', l);
  for (const t of twists.toadstools ?? []) claim('toadstool', t);
  for (const [r, c, clue] of twists.sporecaps ?? []) {
    claim('sporecap', [r, c]);
    if (!isInt(clue) || clue < 0 || clue > 4) problems.push(`sporecap at [${r}, ${c}] has clue ${clue}; must be 0..4`);
  }

  if (level.solution) {
    const seen = new Set<string>();
    for (const [r, c] of level.solution) {
      const key = `${r},${c}`;
      const what = claimed.get(key);
      if (!isInt(r) || !isInt(c) || !active(r, c)) problems.push(`solution firefly at [${r}, ${c}] is not on an active cell`);
      else if (what === 'bush' || what === 'mushroom' || what === 'sporecap' || what === 'toadstool') {
        problems.push(`solution firefly at [${r}, ${c}] sits on a ${what}`);
      }
      if (seen.has(key)) problems.push(`solution lists [${r}, ${c}] twice`);
      seen.add(key);
    }
    for (const [r, c] of twists.lanterns ?? []) {
      if (!seen.has(`${r},${c}`)) problems.push(`solution is missing the lantern at [${r}, ${c}]`);
    }
  }
  return problems;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}
function isCoord(v: unknown): v is Coord {
  return Array.isArray(v) && v.length === 2 && isInt(v[0]) && isInt(v[1]);
}
function isCoordArray(v: unknown): v is Coord[] {
  return Array.isArray(v) && v.every(isCoord);
}
function isBushSpec(v: unknown): v is BushSpec {
  return Array.isArray(v) && v.length === 3 && isInt(v[0]) && isInt(v[1]) && (v[2] === null || isInt(v[2]));
}
