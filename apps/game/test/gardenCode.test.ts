import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createRng } from '@firefly/core';
import { PLAYED_CHAPTERS } from '../src/build.ts';
import { createCatalog } from '../src/state/catalog.ts';
import { checksum, fromBase64Url, MAX_CODE_CHARS, readGardenCode, toBase64Url, writeGardenCode } from '../src/state/gardenCode.ts';
import { browserCodec } from '../src/ui/deflate.ts';
import type { DeviceFields } from '../src/state/gardenCode.ts';
import { MAX_COINS, MAX_SAVE_CHARS } from '../src/state/save.ts';
import type { SaveData } from '../src/state/save.ts';

const LEVELS = join(import.meta.dirname, '../../../levels');
const read = (f: string): unknown => JSON.parse(readFileSync(join(LEVELS, f), 'utf8'));
const catalog = createCatalog({ launch: read('launch.json'), reserve: read('reserve.json'), manifest: read('manifest.json') }, PLAYED_CHAPTERS);
const NOW = Date.UTC(2026, 10, 27, 18);
const id = catalog.mainPath[4]!;
const solution = [...catalog.solution(id)];
const wrong = catalog.board(id).paths.find((c) => !catalog.solution(id).has(c))!;
const device: DeviceFields = { install: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', session: 9, settings: { sound: true, motion: 'device' } };

function garden(): SaveData {
  return {
    install: '0123456789abcdef0123456789abcdef', session: 3, coins: 70, bank: 2,
    solved: new Set(catalog.mainPath.slice(0, 4)),
    history: catalog.mainPath.slice(0, 4).map((l, i) => ({ levelId: l, reason: 'main' as const, solved: true, seconds: 30 + i, hints: 0, endedAt: NOW - 1000 * (4 - i) })),
    playedReserve: new Set(), quitMain: new Set(),
    current: { levelId: id, key: catalog.levelKey(id), reason: 'main', placed: [solution[1]!], locked: [solution[0]!], crossed: [], marks: [], seconds: 12, placements: 3, undos: 1, restarts: 0, hints: 1, priorHints: 0 },
    parked: [], settings: { sound: false, motion: 'off' }, tips: new Set(['cross']), mapSeen: new Set(),
  };
}

/** A well-formed code around any text: what an attacker who knows the format can make. */
function codeOf(json: string | Uint8Array): string {
  const payload = Buffer.from(deflateRawSync(typeof json === 'string' ? Buffer.from(json) : json)).toString('base64url');
  return `FG1.${payload}.${checksum(payload)}`;
}

describe('garden code', () => {
  it('carries the garden across, keeping this device’s id, sitting count and settings', async () => {
    const code = await writeGardenCode(garden(), catalog, browserCodec);
    expect(code).toMatch(/^FG1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
    const r = await readGardenCode(code, catalog, NOW, device, browserCodec);
    if (!r.ok) throw new Error(r.why);
    expect(r.problems).toEqual([]);
    const g = garden();
    expect([...r.save.solved]).toEqual([...g.solved]);
    expect(r.save.coins).toBe(70);
    expect(r.save.bank).toBe(2);
    expect(r.save.current).toEqual(g.current);
    expect(r.save.install).toBe(device.install);
    expect(r.save.session).toBe(9);
    expect(r.save.settings).toEqual(device.settings);
  });

  it('never carries the install id (two devices must not share one)', async () => {
    const code = await writeGardenCode(garden(), catalog, browserCodec);
    const json = Buffer.from(code.split('.')[1]!, 'base64url');
    const text = (await import('node:zlib')).inflateRawSync(json).toString();
    expect(text).not.toContain('0123456789abcdef');
    expect(text).not.toContain('"settings"');
  });

  it('is short enough to paste: a long-played garden stays a few KB', async () => {
    const g = garden();
    const lots = catalog.mainPath.slice(0, 30);
    const big: SaveData = {
      ...g, solved: new Set(lots),
      history: Array.from({ length: 60 }, (_, i) => ({ levelId: lots[i % 30]!, reason: 'main' as const, solved: true, seconds: 40 + i, hints: i % 3, endedAt: NOW - 1000 * (60 - i) })),
    };
    expect((await writeGardenCode(big, catalog, browserCodec)).length).toBeLessThan(4000);
  });

  it('ignores spaces and line breaks from a chat app', async () => {
    const code = await writeGardenCode(garden(), catalog, browserCodec);
    const wrapped = `  ${code.match(/.{1,40}/g)!.join('\n')} \n`;
    expect((await readGardenCode(wrapped, catalog, NOW, device, browserCodec)).ok).toBe(true);
  });

  it('refuses empty, foreign, cut-off and mistyped codes without decoding them', async () => {
    const code = await writeGardenCode(garden(), catalog, browserCodec);
    const why = async (t: string) => { const r = await readGardenCode(t, catalog, NOW, device, browserCodec); return r.ok ? 'ok' : r.why; };
    expect(await why('   ')).toBe('empty');
    expect(await why('hello')).toBe('not-a-code');
    expect(await why(code.replace('FG1', 'FG2'))).toBe('not-a-code');
    expect(await why(code.slice(0, -12) + code.slice(-9))).toBe('damaged');
    expect(await why(code.slice(0, -20))).toBe('damaged');
    expect(await why(`${code} ${code}`)).toBe('damaged');
    const k = 10, flipped = code[k] === 'A' ? 'B' : 'A';
    expect(await why(code.slice(0, k) + flipped + code.slice(k + 1))).toBe('damaged');
    expect(await why(`FG1.${'A'.repeat(MAX_CODE_CHARS)}.00000000`)).toBe('not-a-code');
    expect(await why('x'.repeat(MAX_CODE_CHARS * 3))).toBe('not-a-code');
  });

  it('refuses a deflate bomb while it streams (a small code can’t expand past the save limit)', async () => {
    const bomb = codeOf(new Uint8Array(MAX_SAVE_CHARS + 10).fill(32));
    expect(bomb.length).toBeLessThan(2000);
    expect(await readGardenCode(bomb, catalog, NOW, device, browserCodec)).toEqual({ ok: false, why: 'unreadable' });
  });

  it('refuses garbage inside a well-formed code', async () => {
    for (const json of ['not json', '[1,2]', 'null', '"text"', '{"v":2}', 'ÿþ']) {
      expect((await readGardenCode(codeOf(json), catalog, NOW, device, browserCodec)).ok).toBe(false);
    }
    // Random bytes that are not deflate data.
    const payload = Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 97 + 13) % 256)).toString('base64url');
    expect(await readGardenCode(`FG1.${payload}.${checksum(payload)}`, catalog, NOW, device, browserCodec)).toMatchObject({ ok: false });
  });

  it('refuses JSON nested too deep to handle, without throwing', async () => {
    const deep = `{"v":1,"x":${'['.repeat(150_000)}${']'.repeat(150_000)}}`;
    await expect(readGardenCode(codeOf(deep), catalog, NOW, device, browserCodec)).resolves.toEqual({ ok: false, why: 'unreadable' });
  });

  it('keeps when each garden was played only to the day (a code may be posted publicly)', async () => {
    const r = await readGardenCode(await writeGardenCode(garden(), catalog, browserCodec), catalog, NOW, device, browserCodec);
    if (!r.ok) throw new Error(r.why);
    for (const h of r.save.history) expect(h.endedAt % 86_400_000).toBe(0);
  });

  it('refuses a code with no gardens in it', async () => {
    expect(await readGardenCode(codeOf('{"v":1,"coins":5000}'), catalog, NOW, device, browserCodec)).toEqual({ ok: false, why: 'no-gardens' });
  });

  it('validates what it carries exactly like a save: no wrong locked cells, no free coins, no hijacked id', async () => {
    const json = JSON.parse((await import('node:zlib')).inflateRawSync(Buffer.from((await writeGardenCode(garden(), catalog, browserCodec)).split('.')[1]!, 'base64url')).toString()) as Record<string, unknown>;
    const cur = json.current as Record<string, unknown>;
    const coord = (c: number) => [Math.floor(c / catalog.board(id).w), c % catalog.board(id).w];
    const evil = {
      ...json, coins: MAX_COINS * 10, bank: 999, install: 'ffffffffffffffffffffffffffffffff', session: 5,
      settings: { sound: false, motion: 'off' }, solved: [...(json.solved as string[]), 'not-a-level', '__proto__'],
      current: { ...cur, locked: [coord(wrong)] }, ['__proto__']: { polluted: true },
    };
    const r = await readGardenCode(codeOf(JSON.stringify(evil)), catalog, NOW, device, browserCodec);
    if (!r.ok) throw new Error(r.why);
    expect(r.save.coins).toBe(0);
    expect(r.save.bank).toBe(0);
    expect(r.save.install).toBe(device.install);
    expect(r.save.session).toBe(9);
    expect(r.save.settings).toEqual(device.settings);
    expect([...r.save.solved]).toEqual([...garden().solved]);
    expect(r.save.current?.locked ?? []).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(r.problems.length).toBeGreaterThan(0);
  });

  it('never throws on hostile text', async () => {
    const rng = createRng(11);
    for (let k = 0; k < 200; k++) {
      const len = Math.floor(rng.next() * 80);
      const t = Array.from({ length: len }, () => String.fromCharCode(Math.floor(rng.next() * 128))).join('');
      await expect(readGardenCode(`FG1.${t}`, catalog, NOW, device, browserCodec)).resolves.toMatchObject({ ok: false });
      const payload = t.replace(/[^A-Za-z0-9_-]/g, 'A') || 'A';
      await expect(readGardenCode(`FG1.${payload}.${checksum(payload)}`, catalog, NOW, device, browserCodec)).resolves.toMatchObject({ ok: false });
    }
  });
});

describe('base64url', () => {
  it('round-trips every length and byte, and matches Node', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 73 + n * 31) % 256);
      const text = toBase64Url(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64url'));
      expect([...fromBase64Url(text)!]).toEqual([...bytes]);
    }
  });

  it('refuses impossible text', () => {
    expect(fromBase64Url('A')).toBeNull();
    expect(fromBase64Url('AB=C')).toBeNull();
    expect(fromBase64Url('AB+C')).toBeNull();
  });
});

describe('a browser without CompressionStream', () => {
  it('says so instead of failing', async () => {
    const code = await writeGardenCode(garden(), catalog, browserCodec);
    const none = { ...browserCodec, supported: false };
    expect(await readGardenCode(code, catalog, NOW, device, none)).toEqual({ ok: false, why: 'unsupported' });
  });
});
