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

/** Every launch opens on the home screen: press its button to carry on into the garden. */
async function pastHome(page: Page): Promise<void> {
  await page.locator('.ff-home:not([hidden]) .ff-home-go').click();
  await page.waitForFunction(() => window.__ff?.level() != null);
}

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await pastHome(page);
  // Web fonts landing late can resize the card and move the board under a test's taps.
  await page.evaluate(() => document.fonts.ready);
}

const level = (page: Page) => page.evaluate(() => window.__ff.level()!);

/** A real pointer tap at a cell's centre on screen. */
async function tapCell(page: Page, cell: number): Promise<void> {
  const p = await page.evaluate((c) => window.__ff.cellPoint(c), cell);
  if (!p) throw new Error(`cell ${cell} is not on screen`);
  await page.mouse.click(p.x, p.y);
}

/**
 * Solve the garden on screen by real taps. A tap aims at where its cell is drawn now; if the board
 * moved between aiming and clicking (a late layout on a slow CI machine), the next round lifts any
 * stray firefly and places what's missing, so the test checks the game, not the timing.
 */
async function solveByTaps(page: Page): Promise<void> {
  for (let round = 0; round < 4 && !(await level(page)).solved; round++) {
    const l = await level(page);
    const answer = new Set(l.answer);
    // A tap on a stray firefly turns it into an X (never judged), which is as good as lifting it.
    for (const c of l.placed) if (!answer.has(c) && !l.locked.includes(c)) await tapCell(page, c);
    for (const c of l.answer) {
      const now = await level(page);
      if (now.solved) return;
      // A tile holding an X takes a tap to clear before the next places a firefly.
      if (now.marks.includes(c)) await tapCell(page, c);
      if (!now.placed.includes(c) && !now.locked.includes(c)) await tapCell(page, c);
    }
    await page.waitForTimeout(200);
  }
  await expect.poll(async () => (await level(page)).solved).toBe(true);
}

/** Answer cells the player places (lanterns are already on the board and can't be tapped). */
const answerCells = async (page: Page) => (await level(page)).answer;

test('solves the first garden by tapping its answer, the complete card credits the coins, and Next moves on', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.ff-home')).toBeVisible();
  expect((await page.evaluate(() => window.__ff.audio())).context).toBe('none'); // no sound before a gesture
  await pastHome(page);
  await page.evaluate(() => document.fonts.ready);
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
  // A garden whose next hint crosses tiles out after one firefly (a tap is the gesture that turns
  // sound on). After a cross, asking again always opens the sheet; a repeated point would not.
  const chapters = await page.evaluate(() => window.__ff.chapters());
  for (const id of chapters.slice(0, 3).flat()) {
    await page.evaluate((lid) => window.__ff.openLevel(lid), id);
    await tapCell(page, (await level(page)).answer[0]!);
    if ((await page.evaluate(() => window.__ff.peekHint())) === 'cross' && (await level(page)).placed.length === 1) break;
  }
  expect(await page.evaluate(() => window.__ff.peekHint())).toBe('cross');
  await page.getByRole('button', { name: /^Hint/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Use a hint/ }).click();
  await expect.poll(async () => (await level(page)).notice).toBe('hint');
  // A hint never places a firefly.
  expect((await level(page)).placed).toHaveLength(1);
  expect((await level(page)).locked).toEqual([]);
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
  expect((await level(page)).crossed).toEqual(afterPaid.crossed);
  expect((await page.evaluate(() => window.__ff.audio())).reasons).not.toContain('ad');

  // Finished ad: the hints are credited, one is used right away, the rest are banked.
  await page.getByRole('button', { name: /^Hint/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Watch a video/ }).click();
  await expect.poll(() => page.evaluate(() => window.__ff.wallet().bank)).toBe(hintsPerAd - 1);
});

/** Open the first garden of the first three chapters whose next hint is the kind asked for. */
async function openWhereHintIs(page: Page, kind: 'cross' | 'point'): Promise<string> {
  const chapters = await page.evaluate(() => window.__ff.chapters());
  for (const id of chapters.slice(0, 3).flat()) {
    await page.evaluate((lid) => window.__ff.openLevel(lid), id);
    if ((await page.evaluate(() => window.__ff.peekHint())) === kind) return id;
  }
  throw new Error(`no garden opens with a ${kind} hint`);
}

test('a hint crosses tiles out and says why; tapping a hint X says it again; undo, reset and reload keep them', async ({ page }) => {
  await open(page);
  const id = await openWhereHintIs(page, 'cross');
  await page.getByRole('button', { name: /^Hint/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Use a hint/ }).click();
  await expect.poll(async () => (await level(page)).crossed.length).toBeGreaterThan(0);
  const l = await level(page);
  expect(l.id).toBe(id);
  expect(l.placed).toEqual([]);
  // Every X is a tile outside the answer, and the card says so with the reason.
  for (const c of l.crossed) expect(l.answer).not.toContain(c);
  const status = page.locator('.ff-status-text');
  await expect(page.locator('.ff-status-title')).toHaveText(/^No fireflies? on th(is|ese) tiles?$/);
  const reason = (await status.textContent())!;
  // A move replaces the hint's line; tapping one of its X marks brings the reason back, and is not a move.
  const free = l.answer[0]!;
  await tapCell(page, free);
  await expect(status).not.toContainText(/No fireflies? on th/);
  const placedBefore = (await level(page)).placed;
  await tapCell(page, l.crossed[0]!);
  await expect.poll(async () => (await level(page)).notice).toBe('hint');
  await expect(status).toHaveText(reason);
  expect((await level(page)).placed).toEqual(placedBefore);
  // The paid X marks are locked: reset and undo leave them.
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await level(page)).placed).toEqual([free]);
  expect((await level(page)).crossed).toEqual(l.crossed);
  // And they are saved.
  await page.waitForTimeout(800);
  await page.reload();
  await pastHome(page);
  expect((await level(page)).crossed).toEqual(l.crossed);
});

test('a pointing hint rings a bush or tile and places nothing; asking again on the same board is free', async ({ page }) => {
  await open(page);
  await openWhereHintIs(page, 'point');
  await page.getByRole('button', { name: /^Hint/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Use a hint/ }).click();
  await expect(page.locator('.ff-status-title')).toHaveText(/^Look /);
  const l = await level(page);
  expect(l.placed).toEqual([]);
  expect(l.crossed).toEqual([]);
  const coins = (await page.evaluate(() => window.__ff.wallet())).coins;
  expect(coins).toBe(startingCoins - hintCost);
  // Again, with nothing changed: the same ring and line, no sheet, no charge.
  await page.getByRole('button', { name: /^Hint/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await page.evaluate(() => window.__ff.wallet())).coins).toBe(coins);
  expect((await level(page)).notice).toBe('hint');
});

test('a player cycles a tile by taps: firefly, X, empty; X marks are free, undoable and saved', async ({ page }) => {
  await open(page);
  const l = await level(page);
  const c = l.answer[0]!;
  await tapCell(page, c);
  expect(await level(page)).toMatchObject({ placed: [c], marks: [] });
  const jar = (await level(page)).remaining;
  await tapCell(page, c);
  expect(await level(page)).toMatchObject({ placed: [], marks: [c] });
  // An X takes nothing from the jar, and an X on an answer tile is never judged.
  expect((await level(page)).remaining).toBe(jar + 1);
  expect((await level(page)).notice).toBeNull();
  await tapCell(page, c);
  expect(await level(page)).toMatchObject({ placed: [], marks: [] });
  // Undo walks back through the cycle.
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await level(page)).marks).toEqual([c]);
  // The X is saved with the board.
  await page.waitForTimeout(800);
  await page.reload();
  await pastHome(page);
  expect((await level(page)).marks).toEqual([c]);
  // Reset clears the player's own X marks too.
  await page.getByRole('button', { name: 'Reset' }).click();
  expect((await level(page)).marks).toEqual([]);
});

test('a reload resumes the exact board', async ({ page }) => {
  await open(page);
  const [a] = await answerCells(page);
  await tapCell(page, a!);
  const before = await level(page);
  expect(before.placed).toEqual([a]);
  await page.waitForTimeout(500); // saves are batched (300 ms)
  await page.reload();
  await expect(page.locator('.ff-home-go')).toContainText('Back to garden 1');
  // A save while home is open (here the batched one after launch) keeps the board waiting.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('.ff-home-go')).toContainText('Back to garden 1');
  await pastHome(page);
  const after = await level(page);
  expect(after.id).toBe(before.id);
  expect(after.placed).toEqual(before.placed);
});

// No garden in this build is non-square (the Rose Bed and the reserve), so the board never turns
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

test('the keyboard plays: arrows move the ring, space cycles a tile, Z undoes, H opens the hint sheet', async ({ page }) => {
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
  // Space cycles like a tap: firefly, then the player's own X, then empty again.
  await page.keyboard.press('Space');
  expect((await level(page)).marks).toEqual([target]);
  await expect(page.locator('.ff-app > .ff-sr')).toContainText('marked with an X');
  await page.keyboard.press('Space');
  expect(await level(page)).toMatchObject({ placed: [], marks: [] });
  await page.keyboard.press('Space');
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
  await pastHome(page);
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
  await solveByTaps(page);
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
  // The optional double: a cancelled ad pays nothing and leaves the offer; a finished one pays the bonus again.
  const bonus = PLAYER_CONFIG.economy.chapterBonus!;
  const double = page.locator('.ff-chapter-double');
  const withBonus = (await page.evaluate(() => window.__ff.wallet())).coins;
  await page.evaluate(() => window.__ff.platform.queueRewarded('cancel', 'complete'));
  await double.click();
  await expect(double).toBeEnabled();
  expect((await page.evaluate(() => window.__ff.wallet())).coins).toBe(withBonus);
  await double.click();
  await expect(card).toContainText(`+${bonus * 2} chapter bonus`);
  await expect(double).toBeHidden();
  expect((await page.evaluate(() => window.__ff.wallet())).coins).toBe(withBonus + bonus);
  await expect(go).toBeFocused();
  // Tap 2: one firefly flies the path, then chapter 2's first garden opens.
  await go.click();
  await expect(page.locator('.ff-map-flier')).toHaveCount(1);
  await expect.poll(async () => (await level(page))?.id, { timeout: 10_000 }).toBe(next);
  await expect(page.locator('.ff-map')).toBeHidden();
  // The flight is seen: after a reload the home screen's button opens the new garden, never the flight again.
  await page.reload();
  await pastHome(page);
  expect((await level(page)).id).toBe(next);
  await expect(page.locator('.ff-map')).toBeHidden();
});

test('a reload on the chapter card: home sends you to the map, which plays the flight once', async ({ page }) => {
  await open(page);
  const { next } = await toChapterEnd(page);
  await solveByTaps(page);
  await page.locator('.ff-complete-next').click();
  await expect(page.locator('.ff-chapter-card')).toBeVisible();
  await page.reload();
  await expect(page.locator('.ff-home-say')).toContainText('Chapter 1 is glowing');
  await page.locator('.ff-home-go').click();
  await expect(page.locator('.ff-map')).toBeVisible();
  await expect(page.locator('.ff-map-flier')).toHaveCount(1);
  // The finished chapter's seal is stamped on the map.
  await expect(page.locator('.ff-mseal')).toHaveCount(1);
  // Seen once: next time home carries straight on into the new chapter.
  await page.reload();
  await expect(page.locator('.ff-home-go')).toContainText('Light garden 1');
  await pastHome(page);
  expect((await level(page)).id).toBe(next);
  await expect(page.locator('.ff-map')).toBeHidden();
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

test('a returning player is welcomed home, and a garden left unfinished is marked waiting on the map', async ({ page }) => {
  await open(page);
  await tapCell(page, (await level(page)).answer[0]!);
  await page.locator('.ff-top .ff-gear[aria-label="Garden map"]').click();
  await expect(page.locator('.ff-map-bed[data-waiting="true"]')).toContainText('a garden is waiting');
  await page.reload();
  await expect(page.locator('.ff-home-say-title')).toHaveText('Welcome back!');
  await expect(page.locator('.ff-home-say-line')).toHaveText('Your first garden is still waiting for you.');
  // The parked board comes back as it was left.
  await pastHome(page);
  expect((await level(page)).placed).toHaveLength(1);
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
  await solveByTaps(page);
  await page.locator('.ff-complete-next').click();
  const card = page.locator('.ff-chapter-card');
  await expect(card).toContainText('Every garden is glowing');
  await expect(card).toContainText('Thank you for playing');
  await page.locator('.ff-chapter-go').click();
  await expect(card).toBeHidden();
  await expect(page.locator('.ff-map')).toBeVisible();
  await expect(page.locator('.ff-map-flier')).toHaveCount(0);
  await expect(page.locator('.ff-map-top').getByRole('button', { name: 'Settings' })).toBeFocused();
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

test('a garden code carries the garden to another device, after a yes; a bad code changes nothing', async ({ browser }) => {
  // Device A: four gardens grown, a board in progress.
  const a = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const pa = await a.newPage();
  await open(pa);
  const ids = (await pa.evaluate(() => window.__ff.chapters()))[0]!.slice(0, 4);
  await pa.evaluate((list) => window.__ff.markSolved(list), ids);
  await pa.getByRole('button', { name: 'Settings' }).click();
  await pa.getByRole('button', { name: 'Copy my garden code' }).click();
  await expect(pa.getByRole('button', { name: /^Copied/ })).toBeVisible();
  const code = await pa.evaluate(() => navigator.clipboard.readText());
  expect(code).toMatch(/^FG1\./);
  // A refused clipboard (a portal's frame) shows the code to copy by hand instead.
  await pa.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); });
  await pa.getByRole('button', { name: /^Copied/ }).click();
  await expect(pa.getByRole('textbox', { name: 'Your garden code' })).toHaveValue(code);
  const installA = (await pa.evaluate(() => window.__ff.events()))[0]!.install;
  await a.close();

  // Device B: a new player.
  const b = await browser.newContext();
  const pb = await b.newPage();
  await open(pb);
  const installB = (await pb.evaluate(() => window.__ff.events()))[0]!.install;
  const solvedB = () => pb.evaluate(() => window.__ff.chapters()[0]!.filter((id) => window.__ff.isSolved(id)).length);
  expect(await solvedB()).toBe(0);
  await pb.getByRole('button', { name: 'Settings' }).click();
  await pb.getByRole('button', { name: 'Enter a garden code' }).click();
  const input = pb.getByRole('textbox', { name: 'Garden code' });
  // A cut-off code is caught and nothing changes.
  await input.fill(code.slice(0, -20));
  await pb.getByRole('button', { name: 'Open this garden' }).click();
  await expect(pb.getByRole('dialog').getByRole('status')).toHaveText(/missing or changed/);
  // The whole code, wrapped across lines as a chat app might: asks first, then replaces.
  await input.fill(code.match(/.{1,50}/g)!.join('\n'));
  await pb.getByRole('button', { name: 'Open this garden' }).click();
  await expect(pb.getByText(/The code holds 4 gardens grown/)).toBeVisible();
  await pb.getByRole('button', { name: 'Keep my garden' }).click();
  expect(await solvedB()).toBe(0);
  await pb.getByRole('button', { name: 'Open this garden' }).click();
  // Storage that refuses the new garden: nothing reloads, the garden here is unchanged, and it says so.
  await pb.evaluate(() => {
    const real = Storage.prototype.setItem;
    (window as unknown as { realSetItem: typeof real }).realSetItem = real;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k.endsWith(':progress')) throw new DOMException('full', 'QuotaExceededError');
      real.call(this, k, v);
    };
  });
  await pb.getByRole('button', { name: 'Replace my garden' }).click();
  await expect(pb.getByRole('dialog').getByRole('status')).toHaveText(/couldn't save the new garden/);
  expect(await solvedB()).toBe(0);
  await pb.evaluate(() => { Storage.prototype.setItem = (window as unknown as { realSetItem: Storage['setItem'] }).realSetItem; });
  await Promise.all([pb.waitForEvent('load'), pb.getByRole('button', { name: 'Replace my garden' }).click()]);
  await pb.waitForFunction(() => document.querySelector('.ff-home:not([hidden])') != null);
  await expect.poll(solvedB).toBe(4);
  // The garden moved; the device's analytics id did not.
  const after = await pb.evaluate(() => window.__ff.events());
  expect(after.every((e) => e.install === installB)).toBe(true);
  expect(installB).not.toBe(installA);
  // The garden it replaced waits in the backup slot.
  const backup = await pb.evaluate(() => localStorage.getItem('firefly-garden:progress-backup'));
  expect(JSON.parse(backup!).install).toBe(installB);
  await b.close();
});

test('the garden journal: a page per chapter with its seal and pressed gardens, opened from home and the map', async ({ page }) => {
  await open(page);
  const chapters = await page.evaluate(() => window.__ff.chapters());
  await page.evaluate((ids) => window.__ff.markSolved(ids), [...chapters[0]!, ...chapters[1]!.slice(0, 3)]);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.ff-home:not([hidden])') != null);
  const book = page.locator('.ff-home').getByRole('button', { name: 'Garden journal' });
  await book.click();
  const journal = page.getByRole('dialog', { name: 'Garden journal' });
  await expect(journal).toBeVisible();
  expect(await page.locator('.ff-home').evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  // It opens on the chapter in play: chapter 2, three gardens grown, its seal not stamped yet.
  await expect(journal.getByRole('button', { name: /^Chapter 2/ })).toHaveAttribute('aria-current', 'page');
  await expect(journal).toContainText('3 of 10');
  await expect(journal.locator('.ff-journal-sketch')).toHaveCount(3);
  await expect(journal.getByRole('img', { name: 'The seal, not stamped yet' })).toBeVisible();
  await expect(journal.getByRole('button', { name: 'Chapter 3, still dark' })).toBeDisabled();
  // Every garden carries its difficulty.
  await expect(journal.getByRole('listitem').first()).toHaveAccessibleName(/^Garden 1, (Easy|Medium|Hard|Expert), grown$/);
  // Back a page: chapter 1 is done, sealed, every garden pressed.
  await journal.getByRole('button', { name: 'Previous chapter' }).click();
  await expect(journal.getByRole('button', { name: /^Chapter 1/ })).toHaveAttribute('aria-current', 'page');
  await expect(journal.getByRole('img', { name: "Chapter 1's seal" })).toBeVisible();
  await expect(journal.locator('.ff-journal-sketch')).toHaveCount(chapters[0]!.length);
  await expect(journal.getByRole('button', { name: 'Next chapter' })).toBeFocused();
  // Escape closes it even after a tap on the page's text dropped focus, the map takes taps again
  // and focus goes back to the book.
  await journal.locator('.ff-journal-line').click();
  await page.keyboard.press('Escape');
  await expect(journal).toBeHidden();
  expect(await page.locator('.ff-home').evaluate((el) => (el as HTMLElement).inert)).toBe(false);
  await expect(book).toBeFocused();
  // Tab stays inside the journal and never lands on a dark chapter's tab.
  await book.click();
  for (let k = 0; k < 8; k++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('.ff-journal-layer') != null)).toBe(true);
    expect(await page.evaluate(() => (document.activeElement as HTMLButtonElement | null)?.disabled ?? false)).toBe(false);
  }
  await page.keyboard.press('Escape');
  // Chapter 1 glows and the map hasn't shown it yet: home's button opens the map, which has the book too.
  await page.locator('.ff-home-go').click();
  await expect(page.locator('.ff-map')).toBeVisible();
  await page.locator('.ff-map-top').getByRole('button', { name: 'Garden journal' }).click();
  await expect(journal).toBeVisible();
  expect(await page.locator('.ff-map').evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(journal).toBeHidden();
  expect(await page.locator('.ff-map').evaluate((el) => (el as HTMLElement).inert)).toBe(false);
  // The map's header fits the narrowest phones with a big balance.
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(300); // let the map's resize redraw land first: it rewrites the coin count
  // Set the balance and measure in one step, so no redraw can put the real count back in between.
  const fits = await page.evaluate(() => {
    const c = document.querySelector('.ff-map-top .ff-coins span:last-child')!;
    c.textContent = '9999';
    const top = document.querySelector('.ff-map-top')!, map = document.querySelector('.ff-map')!;
    return top.scrollWidth <= top.clientWidth + 1 && map.scrollWidth <= map.clientWidth + 1;
  });
  expect(fits).toBe(true);
});

test('the map gives every chapter room on a small phone: no label over a stop, the chapter in play on screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await open(page);
  const chapters = await page.evaluate(() => window.__ff.chapters());
  const last = chapters.length - 1;
  // Every chapter but the last finished, a few gardens into the last: the map's longest path.
  await page.evaluate((ids) => window.__ff.markSolved(ids), [...chapters.slice(0, last).flat(), ...chapters[last]!.slice(0, 3)]);
  await page.reload();
  await page.locator('.ff-home:not([hidden]) .ff-home-go').click();
  await expect(page.locator('.ff-map')).toBeVisible();
  await expect(page.locator('.ff-mstop-ring')).toHaveCount(chapters.length);
  const clash = await page.evaluate(() => {
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const rings = [...document.querySelectorAll('.ff-mstop-ring, .ff-mstop-teaser')].map((n) => n.getBoundingClientRect());
    const labels = [...document.querySelectorAll('.ff-map-bed, .ff-map-teaser')].map((n) => n.getBoundingClientRect());
    return labels.flatMap((l, i) => rings.flatMap((r, j) => (hit(l, r) ? [`label ${i} over stop ${j}`] : [])));
  });
  expect(clash).toEqual([]);
  // It opens scrolled to the chapter in play.
  const now = await page.locator('.ff-mstop-now .ff-mstop-ring').boundingBox();
  expect(now!.y).toBeGreaterThanOrEqual(0);
  expect(now!.y + now!.height).toBeLessThanOrEqual(568);
});

test('every garden shows its difficulty beside its place in the chapter', async ({ page }) => {
  await open(page);
  // The first garden is chapter 1's gentlest: one leaf of four, its word read out with its place.
  const row = page.locator('.ff-progress-row');
  await expect(row.locator('.ff-sr')).toHaveText('Garden 1 of 10');
  await expect(row.locator('[aria-hidden="true"]').first()).toHaveText('1 of 10');
  await expect(row.locator('.ff-difficulty-word')).toHaveText('Easy');
  await expect(row.locator('.ff-difficulty')).toHaveAttribute('data-leaves', '1');
  await expect(row.locator('.ff-leaf-on')).toHaveCount(1);
  // The build's hardest gardens read Expert, in red.
  const chapters = await page.evaluate(() => window.__ff.chapters());
  await page.evaluate((id) => window.__ff.openLevel(id), chapters[2]![9]!);
  await expect(row.locator('.ff-difficulty-word')).toHaveText('Expert');
  await expect(row.locator('.ff-leaf-on')).toHaveCount(4);
  // The row never runs under the coins, on the narrowest phones, with a big balance.
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 700 });
    await page.waitForTimeout(300);
    const fits = await page.evaluate(() => {
      document.querySelector('.ff-top .ff-coins span:last-child')!.textContent = '9999';
      const r = document.querySelector('.ff-progress-row')!, t = document.querySelector('.ff-top')!;
      return r.scrollWidth <= r.clientWidth + 1 && t.scrollWidth <= t.clientWidth + 1;
    });
    expect(fits, `${width} px`).toBe(true);
  }
});

test('the home screen opens every launch: Pip greets, the garden lives behind, journal and settings open over it', async ({ page }) => {
  await page.goto('/');
  const home = page.locator('.ff-home');
  await expect(home).toBeVisible();
  await expect(page.locator('.ff-home-say-title')).toHaveText("Hello, I'm Pip!");
  await expect(page.locator('.ff-home-go')).toContainText('Light the first garden');
  await expect(page.locator('.ff-home-go')).toBeFocused();
  await expect(home.locator('.ff-home-coins')).toHaveAccessibleName(`${startingCoins} coins`);
  // The garden is drawn and moving; the board waits behind, out of reach.
  await expect(home).toHaveAttribute('data-scene', 'ready');
  const f0 = await page.evaluate(() => window.__ff.homeFrames());
  await expect.poll(() => page.evaluate(() => window.__ff.homeFrames())).toBeGreaterThan(f0 + 5);
  expect(await page.evaluate(() => window.__ff.level())).toBeNull();
  expect(await page.locator('.ff-top').evaluate((el) => el.closest('[inert]') != null)).toBe(true);
  // Settings opens over it and gives it back, with the board still out of reach.
  await home.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(home).toBeVisible();
  expect(await page.locator('.ff-top').evaluate((el) => el.closest('[inert]') != null)).toBe(true);
  expect(await home.evaluate((el) => (el as HTMLElement).inert)).toBe(false);
  // The button carries on into the first garden; the home garden's canvas is let go.
  await pastHome(page);
  await expect(home).toBeHidden();
  await expect(home.locator('canvas')).toHaveCount(0);
  expect((await level(page)).id).toBe((await page.evaluate(() => window.__ff.chapters()))[0]![0]);
});

test('the home garden holds still under reduced motion', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('.ff-home')).toHaveAttribute('data-scene', 'ready');
  await page.waitForTimeout(300);
  const still = await page.evaluate(() => window.__ff.homeFrames());
  expect(still).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__ff.homeFrames())).toBe(still);
  await ctx.close();
});

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 720 }, { width: 844, height: 390 }]) {
  test(`the home screen fits at ${size.width} × ${size.height}: caption and buttons whole, on screen, apart`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.locator('.ff-home')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // The longest words the home screen can say.
    await page.evaluate(() => {
      document.querySelector('.ff-home-say-line')!.textContent = 'The garden\u2019s gone dark. Shall we light it?';
      document.querySelector('.ff-home-go-label')!.textContent = 'Light the first garden';
      document.querySelector('.ff-home-go-sub')!.textContent = 'Every garden is glowing';
      document.querySelector('.ff-home-coins-n')!.textContent = '9999';
    });
    const box = (sel: string) => page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
    const fits = await page.evaluate(() => {
      const words = document.querySelector('.ff-home-say-words')!, say = document.querySelector('.ff-home-say')!;
      const go = document.querySelector('.ff-home-go-label')!, sub = document.querySelector('.ff-home-go-sub')!, goB = document.querySelector('.ff-home-go')!;
      return {
        caption: words.getBoundingClientRect().bottom <= say.getBoundingClientRect().bottom - 2,
        label: go.getBoundingClientRect().width <= goB.getBoundingClientRect().width - 8,
        sub: sub.getBoundingClientRect().width <= goB.getBoundingClientRect().width - 8,
      };
    });
    expect(fits).toEqual({ caption: true, label: true, sub: true });
    const [title, say, actions, coins] = [await box('.ff-home-title'), await box('.ff-home-say'), await box('.ff-home-actions'), await box('.ff-home-coins')];
    for (const r of [say, actions, coins]) {
      expect(r.l).toBeGreaterThanOrEqual(0);
      expect(r.r).toBeLessThanOrEqual(size.width);
      expect(r.t).toBeGreaterThanOrEqual(0);
      expect(r.b).toBeLessThanOrEqual(size.height);
    }
    const apart = (a: typeof say, b: typeof say) => a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t;
    expect(apart(say, actions)).toBe(true);
    expect(apart(say, coins)).toBe(true);
    expect(apart(title, actions)).toBe(true);
    expect(apart(title, coins)).toBe(true);
    expect(say.t).toBeGreaterThanOrEqual(title.b - 6);
  });
}
