import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PLAYER_CONFIG } from '@firefly/core';
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

test('solves the first garden by tapping its answer, and the complete card credits the coins', async ({ page }) => {
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
  expect((await page.evaluate(() => window.__ff.wallet())).coins).toBe(startingCoins + coinsPerSolve);
  // The taps unlocked sound and played it (the landing chimes and the flourish).
  const audio = await page.evaluate(() => window.__ff.audio());
  expect(audio.context).toBe('running');
  expect(audio.played).toBeGreaterThan(0);
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
