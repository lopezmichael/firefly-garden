import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PLAYER_CONFIG, validateEvent } from '@firefly/core';
import type { E2EHooks } from '../src/ui/app.ts';
import { everyStatus } from '../test/status-samples.ts';
import { displayCell } from '../src/view/layout.ts';

/**
 * Smoke test for the friends build (Phase 2 plan, I): the game loads, a garden
 * is solved by real pointer taps on the canvas, a hint is bought, a cancelled
 * ad credits nothing, the board survives a reload, a rotation and a fold, the
 * keyboard plays, sound follows its mute rules, and the status card never
 * changes height on the narrowest phones.
 */

declare global {
  interface Window {
    __ff: E2EHooks;
  }
}

const { startingCoins, hintCost, coinsPerSolve, hintsPerAd } = PLAYER_CONFIG.economy;

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__ff?.level() != null);
}

const level = (page: Page) => page.evaluate(() => window.__ff.level()!);

/** A real pointer tap at a cell's centre on screen. */
async function tapCell(page: Page, cell: number): Promise<void> {
  const p = await page.evaluate((c) => window.__ff.cellPoint(c), cell);
  if (!p) throw new Error(`cell ${cell} is not on screen`);
  await page.mouse.click(p.x, p.y);
}

/** Answer cells the player places (lanterns are already on the board and can't be tapped). */
const answerCells = async (page: Page) => (await level(page)).answer;

test('solves the first garden by tapping its answer, the complete card credits the coins, and Next moves on', async ({ page }) => {
  await open(page);
  expect((await page.evaluate(() => window.__ff.audio())).context).toBe('none'); // no sound before a gesture
  const start = await page.evaluate(() => window.__ff.wallet());
  expect(start.coins).toBe(startingCoins);
  const l = await level(page);
  for (const c of l.answer) {
    if ((await level(page)).solved) break;
    await tapCell(page, c);
  }
  await expect.poll(async () => (await level(page)).solved).toBe(true);
  await expect(page.locator('.ff-complete')).toBeVisible();
  // The card waits out the board's celebration inert (a stray tap can't skip the garden), then
  // takes taps and focus.
  const panel = page.locator('.ff-complete-panel');
  expect(await panel.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  await expect.poll(() => panel.evaluate((el) => (el as HTMLElement).inert)).toBe(false);
  await expect(page.locator('.ff-complete-next')).toBeFocused();
  expect((await page.evaluate(() => window.__ff.wallet())).coins).toBe(startingCoins + coinsPerSolve);
  // The taps unlocked sound and played it (the landing chimes and the flourish).
  const audio = await page.evaluate(() => window.__ff.audio());
  expect(audio.context).toBe('running');
  expect(audio.played).toBeGreaterThan(0);
  // Tap to continue: nothing moves on by itself, Next does, and the wait is logged.
  await page.waitForTimeout(4500);
  expect((await level(page)).id).toBe(l.id);
  await page.locator('.ff-complete-next').click();
  await expect.poll(async () => (await level(page)).id).not.toBe(l.id);
  const moves = (await page.evaluate(() => window.__ff.events())).filter((e) => e.type === 'continue');
  expect(moves).toEqual([expect.objectContaining({ level: l.id, choice: 'next' })]);
});

test('buys a hint with coins; a cancelled ad credits nothing and is silent; a finished ad credits hints', async ({ page }) => {
  await open(page);
  await tapCell(page, (await level(page)).answer[0]!); // a gesture, so sound is on
  await page.getByRole('button', { name: /^Hint/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Use a hint/ }).click();
  await expect.poll(async () => (await level(page)).locked.length + (await level(page)).placed.length).toBeGreaterThan(0);
  expect((await page.evaluate(() => window.__ff.wallet())).coins).toBe(startingCoins - hintCost);
  const afterPaid = await level(page);

  // Cancelled ad: no credit, no hint, coins untouched, and sound muted while it shows.
  await page.evaluate(() => {
    window.__ff.platform.adMs = 1200;
    window.__ff.platform.queueRewarded('cancel', 'complete');
  });
  await page.getByRole('button', { name: /^Hint/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Watch a video/ }).click();
  await expect.poll(() => page.evaluate(() => window.__ff.platform.adShowing)).toBe(true);
  expect((await page.evaluate(() => window.__ff.audio())).reasons).toContain('ad');
  await expect.poll(async () => (await page.evaluate(() => window.__ff.audio())).context).not.toBe('running');
  await expect.poll(() => page.evaluate(() => window.__ff.platform.adShowing)).toBe(false);
  expect(await page.evaluate(() => window.__ff.wallet())).toEqual({ coins: startingCoins - hintCost, bank: 0 });
  expect((await level(page)).locked).toEqual(afterPaid.locked);
  expect((await page.evaluate(() => window.__ff.audio())).reasons).not.toContain('ad');

  // Finished ad: the hints are credited, one is used right away, the rest are banked.
  await page.getByRole('button', { name: /^Hint/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Watch a video/ }).click();
  await expect.poll(() => page.evaluate(() => window.__ff.wallet().bank)).toBe(hintsPerAd - 1);
});

test('a reload resumes the exact board', async ({ page }) => {
  await open(page);
  const [a] = await answerCells(page);
  await tapCell(page, a!);
  const before = await level(page);
  expect(before.placed).toEqual([a]);
  await page.waitForTimeout(500); // saves are batched (300 ms)
  await page.reload();
  await page.waitForFunction(() => window.__ff?.level() != null);
  const after = await level(page);
  expect(after.id).toBe(before.id);
  expect(after.placed).toEqual(before.placed);
});

// No garden in this build is non-square (chapters 1 to 3 and the reserve), so the board never turns
// (rot90 is covered by the unit tests of the display mapping). This holds the board, undo and clock
// through landscape and a fold, and says so if a non-square garden ever ships.
test('landscape and a fold mid-level keep the board, the undo stack and the clock', async ({ page }) => {
  await open(page);
  const cells = await answerCells(page);
  await tapCell(page, cells[0]!);
  await tapCell(page, cells[1]!);
  const before = await level(page);
  for (const size of [{ width: 844, height: 390 }, { width: 470, height: 670 }, { width: 626, height: 890 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    const now = await level(page);
    expect(now.id).toBe(before.id);
    expect(now.transform).toBe('identity');
    expect(now.placed.sort()).toEqual([...before.placed].sort());
    expect(now.canUndo).toBe(true);
    expect(now.seconds).toBeGreaterThanOrEqual(before.seconds);
    // Every placed firefly is still on screen and tappable.
    for (const c of now.placed) expect(await page.evaluate((cell) => window.__ff.cellPoint(cell), c)).not.toBeNull();
  }
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await level(page)).placed).toHaveLength(before.placed.length - 1);
});

test('the keyboard plays: arrows move the ring, space toggles, Z undoes, H opens the hint sheet', async ({ page }) => {
  await open(page);
  const board = page.locator('.ff-board');
  for (let i = 0; i < 12 && !(await board.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(board).toBeFocused();
  const l = await level(page);
  expect(l.focus).not.toBeNull();
  // Steer to the first answer tile with the arrows, as drawn on screen.
  const target = l.answer[0]!;
  const [tr, tc] = displayCell(l.transform, l.w, l.h, target);
  for (let step = 0; step < 4 * (l.w + l.h); step++) {
    const f = (await level(page)).focus!;
    if (f === target) break;
    const [fr, fc] = displayCell(l.transform, l.w, l.h, f);
    await page.keyboard.press(fr < tr ? 'ArrowDown' : fr > tr ? 'ArrowUp' : fc < tc ? 'ArrowRight' : 'ArrowLeft');
  }
  expect((await level(page)).focus).toBe(target);
  await expect(page.locator('.ff-app > .ff-sr')).toContainText(`Row ${tr + 1}, column ${tc + 1}`);
  await page.keyboard.press('Space');
  expect((await level(page)).placed).toEqual([target]);
  await expect(page.locator('.ff-app > .ff-sr')).toContainText('firefly');
  await page.keyboard.press('z');
  expect((await level(page)).placed).toEqual([]);
  await page.keyboard.press('Space');
  await page.keyboard.press('Control+Shift+z'); // redo chord: not an undo
  expect((await level(page)).placed).toEqual([target]);
  await page.keyboard.press('h');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('sound: silent while the tab is hidden, and the setting holds across a reload', async ({ page }) => {
  await open(page);
  await tapCell(page, (await level(page)).answer[0]!);
  await expect.poll(async () => (await page.evaluate(() => window.__ff.audio())).context).toBe('running');
  const setHidden = (hidden: boolean) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  await expect.poll(async () => (await page.evaluate(() => window.__ff.audio())).context).toBe('suspended');
  await setHidden(false);
  await expect.poll(async () => (await page.evaluate(() => window.__ff.audio())).context).toBe('running');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radiogroup', { name: 'Sound' }).getByRole('radio', { name: 'Off' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  expect((await page.evaluate(() => window.__ff.audio())).reasons).toEqual(['setting']);
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => window.__ff?.level() != null);
  expect((await page.evaluate(() => window.__ff.audio())).reasons).toContain('setting');
});

for (const size of [{ width: 320, height: 640 }, { width: 360, height: 740 }]) {
  test(`the status card keeps one height for every message at ${size.width} px`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page);
    const measure = () => page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('.ff-status')!;
      const board = document.querySelector<HTMLElement>('.ff-board')!;
      const overflow = [...card.querySelectorAll<HTMLElement>('.ff-status-title, .ff-status-sub')]
        .some((el) => el.scrollHeight > el.clientHeight + 1);
      return { card: card.getBoundingClientRect().height, board: board.getBoundingClientRect().height, overflow };
    });
    const base = await measure();
    // The control row fits the screen too (Hint with its cost is the widest button).
    const offscreen = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.ff-controls button')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > window.innerWidth || el.scrollWidth > el.clientWidth + 1; })
      .map((el) => el.textContent));
    expect(offscreen, 'control buttons running off screen or clipping their label').toEqual([]);
    const samples = everyStatus();
    expect(samples.length).toBeGreaterThan(30);
    for (const s of samples) {
      await page.evaluate((st) => window.__ff.setStatus(st), s);
      const m = await measure();
      expect.soft(m.card, `card height for "${s.title}"`).toBe(base.card);
      expect.soft(m.board, `board height for "${s.title}"`).toBe(base.board);
      expect.soft(m.overflow, `text clipped for "${s.title}" / "${s.sub}"`).toBe(false);
    }
  });
}

test('a still board stops drawing frames (reduced motion as the low-power mode), and a move wakes it', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await open(page);
  const frames = () => page.evaluate(() => window.__ff.frames().count);
  await page.waitForTimeout(500);
  const idle = await frames();
  await page.waitForTimeout(1000);
  expect(await frames()).toBe(idle);
  await tapCell(page, (await level(page)).answer[0]!);
  await expect.poll(frames).toBeGreaterThan(idle);
  const settled = await frames();
  await page.waitForTimeout(1000);
  expect(await frames()).toBe(settled);
  await ctx.close();
});

/** Solve every garden of chapter 1 but its last through the hooks, then open that last one. */
async function toChapterEnd(page: Page): Promise<{ last: string; next: string }> {
  const chapters = await page.evaluate(() => window.__ff.chapters());
  const ch1 = chapters[0]!;
  const last = ch1[ch1.length - 1]!;
  await page.evaluate(({ ids, id }) => {
    window.__ff.markSolved(ids);
    window.__ff.openLevel(id);
  }, { ids: ch1.slice(0, -1), id: last });
  return { last, next: chapters[1]![0]! };
}

test('finishing a chapter: Finish the chapter, the card over the map with its bonus, then Start chapter 2', async ({ page }) => {
  await open(page);
  const { last, next } = await toChapterEnd(page);
  await expect.poll(async () => (await level(page)).id).toBe(last);
  const coins = (await page.evaluate(() => window.__ff.wallet())).coins;
  for (const c of (await level(page)).answer) await tapCell(page, c);
  const nextButton = page.locator('.ff-complete-next');
  await expect(nextButton).toHaveText(/Finish the chapter/);
  await expect(nextButton).toBeFocused();
  expect((await page.evaluate(() => window.__ff.wallet())).coins).toBe(coins + coinsPerSolve + PLAYER_CONFIG.economy.chapterBonus!);
  await nextButton.click();
  // Tap 1: the map opens and the chapter card settles over it.
  const card = page.locator('.ff-chapter-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Chapter 1 complete');
  await expect(card).toContainText(`+${PLAYER_CONFIG.economy.chapterBonus} chapter bonus`);
  await expect(page.locator('.ff-map')).toBeVisible();
  // Only the card acts: the map behind it (Continue, Settings) is inert through both moves.
  expect(await page.locator('.ff-map').evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  const go = page.locator('.ff-chapter-go');
  await expect(go).toHaveText(/Start chapter 2/);
  await expect(go).toBeFocused();
  // Tap 2: one firefly flies the path, then chapter 2's first garden opens.
  await go.click();
  await expect(page.locator('.ff-map-flier')).toHaveCount(1);
  await expect.poll(async () => (await level(page))?.id, { timeout: 10_000 }).toBe(next);
  await expect(page.locator('.ff-map')).toBeHidden();
  // The flight is seen: a reload opens the new garden, never the flight again.
  await page.reload();
  await page.waitForFunction(() => window.__ff?.level() != null);
  expect((await level(page)).id).toBe(next);
});

test('a reload on the chapter card opens the map and plays the flight once', async ({ page }) => {
  await open(page);
  await toChapterEnd(page);
  for (const c of (await level(page)).answer) await tapCell(page, c);
  await page.locator('.ff-complete-next').click();
  await expect(page.locator('.ff-chapter-card')).toBeVisible();
  await page.reload();
  await expect(page.locator('.ff-map')).toBeVisible();
  await expect(page.locator('.ff-map-flier')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.ff-map')).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.locator('.ff-map-flier')).toHaveCount(0);
});

test('opening lines: the first garden teaches the goal, a chapter\'s first garden says what it brings', async ({ page }) => {
  await open(page);
  await expect(page.locator('.ff-status-title')).toHaveText('Light up every dark path');
  await tapCell(page, (await level(page)).answer[0]!);
  await expect(page.locator('.ff-status-title')).not.toHaveText('Light up every dark path');
  const chapters = await page.evaluate(() => window.__ff.chapters());
  await page.evaluate((id) => window.__ff.openLevel(id), chapters[1]![0]!);
  await expect(page.locator('.ff-status-title')).toHaveText(/^New: /);
});

test('a returning player is welcomed on the map, and a garden left unfinished is marked waiting', async ({ page }) => {
  await open(page);
  await tapCell(page, (await level(page)).answer[0]!);
  await page.locator('.ff-top .ff-gear[aria-label="Garden map"]').click();
  await expect(page.locator('.ff-map-bed[data-waiting="true"]')).toContainText('a garden is waiting');
  await page.reload();
  await expect(page.locator('.ff-map-note')).toContainText('Welcome back.');
});

test('the build\'s last chapter ends on the ending card, then the finished map', async ({ page }) => {
  await open(page);
  const chapters = await page.evaluate(() => window.__ff.chapters());
  const all = chapters.flat();
  const last = all[all.length - 1]!;
  await page.evaluate(({ ids, id }) => {
    window.__ff.markSolved(ids);
    window.__ff.openLevel(id);
  }, { ids: all.slice(0, -1), id: last });
  await expect.poll(async () => (await level(page)).id).toBe(last);
  for (const c of (await level(page)).answer) await tapCell(page, c);
  await page.locator('.ff-complete-next').click();
  const card = page.locator('.ff-chapter-card');
  await expect(card).toContainText('Every garden is glowing');
  await expect(card).toContainText('Thank you for playing');
  await page.locator('.ff-chapter-go').click();
  await expect(card).toBeHidden();
  await expect(page.locator('.ff-map')).toBeVisible();
  await expect(page.locator('.ff-map-flier')).toHaveCount(0);
  await expect(page.locator('.ff-map-top .ff-gear')).toBeFocused();
});

test('every voice makes a sound and none clips (rendered offline)', async ({ page }) => {
  await open(page);
  const voices = await page.evaluate(() => window.__ff.voices());
  expect(Object.keys(voices)).toHaveLength(10);
  for (const [name, v] of Object.entries(voices)) {
    expect(v.rms, `${name} is silent`).toBeGreaterThan(0.001);
    expect(v.peak, `${name} clips`).toBeLessThan(0.9);
  }
});

test('a scripted play-through logs an event stream that matches the play', async ({ page }) => {
  await open(page);
  const first = await level(page);
  // Place, undo it, place it again, then the rest: one undo, every answer cell placed.
  await tapCell(page, first.answer[0]!);
  await page.getByRole('button', { name: 'Undo' }).click();
  for (const c of first.answer) await tapCell(page, c);
  await expect.poll(async () => (await level(page)).solved).toBe(true);
  const nextButton = page.locator('.ff-complete-next');
  await expect(nextButton).toBeFocused();
  await nextButton.click();
  await expect.poll(async () => (await level(page)).id).not.toBe(first.id);
  const second = await level(page);
  // Leave the second garden for the map after one move: a quit.
  await tapCell(page, second.answer[0]!);
  await page.locator('.ff-top .ff-gear[aria-label="Garden map"]').click();
  await expect(page.locator('.ff-map')).toBeVisible();

  const events = await page.evaluate(() => window.__ff.events());
  // Every stored event is a valid schema event.
  for (const e of events) expect(validateEvent(e), JSON.stringify(e)).toEqual([]);
  const of = (type: string) => events.filter((e) => e.type === type);
  expect(of('session_start')).toHaveLength(1);
  expect(of('level_start').map((e) => [e.level, e.reason, e.attempt])).toEqual([[first.id, 'main', 1], [second.id, 'main', 1]]);
  const [solved, quit] = of('level_end');
  expect(solved).toMatchObject({ level: first.id, reason: 'main', attempt: 1, outcome: 'solved', undos: 1, restarts: 0, hints: 0 });
  expect(solved!.placements).toBe(first.answer.length + 1);
  expect(quit).toMatchObject({ level: second.id, outcome: 'quit', placements: 1, undos: 0, hints: 0 });
  expect(of('continue')).toEqual([expect.objectContaining({ level: first.id, choice: 'next' })]);
  expect(of('coins').map((e) => e.why)).toEqual(['start', 'solve']);
});

test('small delights change nothing: the moon follows the chapter, a bush tap is not a move', async ({ page }) => {
  await open(page);
  const chapters = await page.evaluate(() => window.__ff.chapters());
  const warmth = () => page.evaluate(() => (document.querySelector('.ff-sky .ff-moon') as SVGElement).style.getPropertyValue('--ff-moon-warm'));
  await page.evaluate((id) => window.__ff.openLevel(id), chapters[0]![0]!);
  await expect.poll(warmth).toBe('0.00');
  await page.evaluate((id) => window.__ff.openLevel(id), chapters[0]!.at(-1)!);
  await expect.poll(warmth).toBe('1.00');
  // A bush: a cell outside the answer that a tap doesn't place a firefly on.
  const l = await level(page);
  const events = (await page.evaluate(() => window.__ff.events())).length;
  let tapped = false;
  for (let c = 0; c < l.w * l.h && !tapped; c++) {
    if (l.answer.includes(c)) continue;
    await tapCell(page, c);
    if ((await level(page)).placed.length > 0) { await tapCell(page, c); continue; }
    tapped = true;
  }
  expect(tapped).toBe(true);
  expect((await level(page)).placed).toEqual([]);
  // Only a placement and its removal while searching may have been logged: never by the bush itself.
  const after = await page.evaluate(() => window.__ff.events());
  expect(after.slice(events).every((e) => e.type !== 'level_end')).toBe(true);
});
