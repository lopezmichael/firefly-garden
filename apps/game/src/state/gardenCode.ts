import type { Catalog } from './catalog.ts';
import { MAX_SAVE_CHARS, parseSave, serializeSave } from './save.ts';
import type { SaveData, Settings } from './save.ts';

/**
 * Deflate and inflate, done by the browser (`ui/deflate.ts`): this module stays free of DOM types.
 * `unpack` must give up (null) once the text passes `cap` characters, and reject on bad data.
 */
export interface Codec {
  pack(text: string): Promise<Uint8Array>;
  unpack(bytes: Uint8Array, cap: number): Promise<string | null>;
  readonly supported: boolean;
}

/**
 * The garden code: a player's progress as one line of text, to carry a garden to another device
 * or browser by copy and paste (there is no account and no server). Phase 2 plan, "garden code".
 *
 * Format: `FG1.<payload>.<check>`. The payload is the save's JSON (as `serializeSave` writes it,
 * minus this device's own fields), deflated and base64url-encoded; the check is an FNV-1a hash of
 * the payload, so a mistyped or cut-off code is caught before anything is decoded.
 *
 * A code is untrusted input, exactly like a save read from storage: the code is length-capped, the
 * inflated text is capped at the save's own size limit while it streams (a small code can't expand
 * into a huge one), and what comes out goes through `parseSave`, field by field. What stays with
 * the device: the analytics install id and sitting count (a code never carries them, so two devices
 * never share an id) and the sound and motion settings (preferences of the device, not the garden).
 */

const PREFIX = 'FG1';
const DAY_MS = 86_400_000;
/** Well above any real code (a long-played save is a few thousand characters) and small enough to refuse junk fast. */
export const MAX_CODE_CHARS = 20_000;

export type CodeProblem = 'empty' | 'not-a-code' | 'damaged' | 'unsupported' | 'unreadable' | 'no-gardens';

export type ReadCode =
  | { readonly ok: true; readonly save: SaveData; readonly problems: readonly string[] }
  | { readonly ok: false; readonly why: CodeProblem };

/** What a code keeps of this device when it is loaded. */
export interface DeviceFields {
  readonly install: string;
  readonly session: number;
  readonly settings: Settings;
}

/** The player-facing line for each problem (plain, never blaming). */
export const CODE_MESSAGES: Readonly<Record<CodeProblem, string>> = {
  empty: 'Paste a garden code first.',
  'not-a-code': "That doesn't look like a garden code. It starts with FG1.",
  damaged: 'Part of that code is missing or changed. Copy the whole code again.',
  unsupported: "This browser can't open garden codes. Try another browser.",
  unreadable: "That code couldn't be read. Copy the whole code again.",
  'no-gardens': 'That code holds no gardens yet.',
};

/** FNV-1a, 32 bits, as 8 hex digits: a typo check, not security (the payload is validated anyway). */
export function checksum(text: string): string {
  let h = 2166136261; // the FNV offset basis
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k);
    h = Math.imul(h, 16777619) >>> 0; // the FNV prime
  }
  return h.toString(16).padStart(8, '0');
}

/** The garden as a code. Async: deflating uses the browser's CompressionStream. */
export async function writeGardenCode(d: SaveData, catalog: Catalog, codec: Codec): Promise<string> {
  const json = JSON.parse(serializeSave(d, catalog)) as Record<string, unknown>;
  delete json.install;
  delete json.session;
  delete json.settings;
  // A code may be posted publicly: when each garden was played is kept only to the day.
  if (Array.isArray(json.history)) {
    for (const h of json.history as Record<string, unknown>[]) if (typeof h.endedAt === 'number') h.endedAt = h.endedAt - (h.endedAt % DAY_MS);
  }
  const payload = toBase64Url(await codec.pack(JSON.stringify(json)));
  return `${PREFIX}.${payload}.${checksum(payload)}`;
}

/**
 * Read a pasted code into a validated save for this device. Never throws: every failure is a
 * `why` the sheet can show. Spaces and line breaks (from a chat app or an email) are ignored.
 */
export async function readGardenCode(text: string, catalog: Catalog, now: number, device: DeviceFields, codec: Codec): Promise<ReadCode> {
  if (text.length > MAX_CODE_CHARS * 2) return { ok: false, why: 'not-a-code' };
  const code = text.replace(/\s+/g, '');
  if (code === '') return { ok: false, why: 'empty' };
  const parts = code.split('.');
  if (code.length > MAX_CODE_CHARS || parts[0] !== PREFIX) return { ok: false, why: 'not-a-code' };
  // Ours, but cut short or run together with other text.
  if (parts.length !== 3) return { ok: false, why: 'damaged' };
  const [, payload = '', check = ''] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || check.toLowerCase() !== checksum(payload)) return { ok: false, why: 'damaged' };
  if (!codec.supported) return { ok: false, why: 'unsupported' };
  let raw: string;
  try {
    const bytes = fromBase64Url(payload);
    const text = bytes && await codec.unpack(bytes, MAX_SAVE_CHARS);
    if (!text) return { ok: false, why: 'unreadable' };
    raw = text;
  } catch {
    // Bad deflate data or bad UTF-8: an outcome of untrusted input, reported, never thrown.
    return { ok: false, why: 'unreadable' };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, why: 'unreadable' };
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return { ok: false, why: 'unreadable' };
  // This device's own fields win over anything the code carries. Spreading a JSON.parse result only
  // copies own data properties (a "__proto__" key stays a plain key), and parseSave reads own keys only.
  let merged: string;
  try {
    merged = JSON.stringify({
      ...json, install: device.install, session: device.session,
      settings: { sound: device.settings.sound, motion: device.settings.motion },
    });
  } catch {
    // JSON nested deep enough to overflow the stack (it parses, but won't stringify back).
    return { ok: false, why: 'unreadable' };
  }
  const parsed = parseSave(merged, catalog, now, () => device.install);
  if (!parsed.data) return { ok: false, why: 'unreadable' };
  if (parsed.data.solved.size === 0 && parsed.data.history.length === 0) return { ok: false, why: 'no-gardens' };
  return { ok: true, save: parsed.data, problems: parsed.problems };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding (written out: `btoa` is a DOM global). */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let k = 0; k < bytes.length; k += 3) {
    const n = (bytes[k]! << 16) | ((bytes[k + 1] ?? 0) << 8) | (bytes[k + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - k) * 8) / 6));
    for (let j = 0; j < chars; j++) out += B64[(n >> (18 - 6 * j)) & 63];
  }
  return out;
}

/** The bytes of a base64url text, or null if it can't be one (a stray character, an impossible length). */
export function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((text.length * 6) / 8));
  let acc = 0, bits = 0, at = 0;
  for (let k = 0; k < text.length; k++) {
    const v = B64.indexOf(text[k]!);
    if (v < 0) return null;
    acc = ((acc << 6) | v) & 16777215; // keep 24 bits
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >> bits) & 255;
    }
  }
  return out;
}
