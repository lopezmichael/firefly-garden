import type { Band } from '../view/layout.ts';
import { CompleteCard } from './complete.ts';
import type { CompleteView } from './complete.ts';
import { LANTERN_LIGHTS, coin, icon, lantern, leaves, moon } from './icons.ts';
import { MAX_LEAVES } from '../state/difficulty.ts';
import type { Difficulty } from '../state/difficulty.ts';
import { hillsFor, HILLS } from '../view/layout.ts';
import { drawScenery } from '../view/art/scenery.ts';
import { coinFlight, crossSky, SKY_MS } from './flight.ts';

/** How long the coins take to fly from the complete card's chip to the coin pill. */
const COIN_FLIGHT_MS = 560;
import type { Palette } from '../view/theme.ts';

/**
 * The play screen's DOM: top bar, title, status card and controls around the
 * board host (the PixiJS canvas lives in `boardHost`). Built with DOM calls;
 * game text is always set with `textContent`, never parsed as HTML.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export type StatusTone = 'plain' | 'warn' | 'glow' | 'solved';

export interface Status {
  readonly title: string;
  readonly sub: string;
  readonly tone: StatusTone;
}

export interface ScreenHandlers {
  undo(): void;
  reset(): void;
  hint(): void;
  next(): void;
  settings(): void;
  map(): void;
}

export class PlayScreen {
  readonly root = el('div', 'ff-app');
  readonly boardHost = el('div', 'ff-board');
  private readonly chapterLabel = el('span', 'ff-chapter-label');
  /** The garden's difficulty beside its place in the chapter: leaves and a word (Easy to Expert). */
  private readonly difficulty = el('span', 'ff-difficulty');
  private readonly dots = el('div', 'ff-dots');
  private readonly coins = el('span');
  private coinTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly title = el('h1', 'ff-title');
  private readonly status = el('div', 'ff-status');
  private readonly statusTitle = el('div', 'ff-status-title');
  private readonly statusSub = el('div', 'ff-status-sub');
  private readonly jar = el('div', 'ff-jar');
  private readonly jarLine = el('div', 'ff-jar-line');
  private readonly slots = el('div', 'ff-slots');
  private readonly undoButton = el('button', 'ff-quiet');
  private readonly resetButton = el('button', 'ff-quiet');
  private readonly hintButton = el('button', 'ff-hint');
  private readonly hintCount = el('span');
  private readonly announcer = el('div', 'ff-sr');
  private mapButton: HTMLButtonElement | null = null;
  private readonly complete: CompleteCard;
  private readonly scene = el('canvas', 'ff-scene');
  private readonly motes = el('div', 'ff-motes');
  /** The crescent moon: it travels across the sky through a chapter, and a tap sends a firefly by. */
  private readonly moon = moon();
  /** How far through its chapter the current garden is, 0 (first) to 1 (last). */
  private moonProgress = 0;
  /** A firefly is crossing the sky: a moon tap meanwhile does nothing (no pile-up from rapid taps). */
  private skyBusy = false;
  private sceneFrame = 0;
  private sceneDpr = 0;
  private resolutionQuery: MediaQueryList | null = null;

  constructor(handlers: ScreenHandlers, private readonly palette: Palette) {
    // The scenery (theme plan, milestone 6): night, grain and hills baked into one canvas,
    // the crescent moon and drifting motes as DOM over it.
    const sky = el('div', 'ff-sky');
    sky.setAttribute('aria-hidden', 'true');
    sky.append(this.scene, this.moon, this.motes);
    // The moon sits behind the play screen's layers, so a tap on it is found by where it lands.
    this.root.addEventListener('click', (e) => {
      // Only taps on the play screen itself: not controls, the board, or anything over it (the map,
      // the chapter card, a sheet's backdrop), all of which sit inside this root too.
      if (e.target instanceof Element && e.target.closest('button, a, input, .ff-board, .ff-map, .ff-chapter-layer, .ff-backdrop')) return;
      const r = this.moon.getBoundingClientRect(), pad = 10;
      if (e.clientX >= r.left - pad && e.clientX <= r.right + pad && e.clientY >= r.top - pad && e.clientY <= r.bottom + pad) this.moonTapped();
    });
    for (let i = 0; i < HILLS.motes; i++) {
      const m = el('span', 'ff-mote');
      m.style.setProperty('--ff-mote-delay', `${(-i * 1.3).toFixed(1)}s`);
      this.motes.append(m);
    }

    const side = el('section', 'ff-side');
    const top = el('header', 'ff-top');
    const chapter = el('div', 'ff-chapter');
    this.dots.setAttribute('aria-hidden', 'true');
    const progress = el('div', 'ff-progress-row');
    progress.append(this.chapterLabel, this.difficulty);
    chapter.append(progress, this.dots);
    const coinBox = el('div', 'ff-coins');
    coinBox.append(coin(), this.coins);
    const gear = el('button', 'ff-gear');
    gear.type = 'button';
    gear.setAttribute('aria-label', 'Settings');
    gear.append(icon('settings'));
    gear.addEventListener('click', () => handlers.settings());
    const mapButton = el('button', 'ff-gear');
    mapButton.type = 'button';
    mapButton.setAttribute('aria-label', 'Garden map');
    mapButton.append(icon('map'));
    mapButton.addEventListener('click', () => handlers.map());
    this.mapButton = mapButton;
    top.append(mapButton, chapter, coinBox, gear);

    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    // The firefly jar, a paper lantern (design: lantern plus a slot per firefly). The lantern is
    // where fireflies fly from and back to, with a light inside for each one left; the slots
    // make the count exact at a glance.
    this.jar.setAttribute('aria-hidden', 'true');
    this.jar.append(lantern());
    const count = el('div', 'ff-jar-count');
    this.slots.setAttribute('aria-hidden', 'true');
    count.append(this.jarLine, this.slots);
    const text = el('div', 'ff-status-text');
    text.append(this.statusTitle, this.statusSub);
    const column = el('div', 'ff-status-column');
    column.append(count, text);
    this.status.append(this.jar, column);
    // The level-complete card sits where the status card and moves are (see game.css).
    this.complete = new CompleteCard({ next: () => handlers.next(), map: () => handlers.map() });
    side.append(top, this.title, this.status, this.complete.root);

    this.boardHost.setAttribute('role', 'application');
    this.boardHost.setAttribute('aria-label', 'Garden board');

    const controls = el('nav', 'ff-controls');
    controls.setAttribute('aria-label', 'Moves');
    for (const [b, name, label, fn] of [
      [this.undoButton, 'undo', 'Undo', handlers.undo],
      [this.resetButton, 'reset', 'Reset', handlers.reset],
    ] as const) {
      b.type = 'button';
      b.append(icon(name), document.createTextNode(label));
      b.addEventListener('click', () => fn());
    }
    this.hintButton.type = 'button';
    // "Hint · 3": the garden's free hints left (or "2 saved" from a video; a video mark when none).
    const cost = el('span', 'ff-cost');
    cost.append(el('span', 'ff-cost-sep', '·'), this.hintCount);
    this.hintButton.append(icon('hint'), document.createTextNode('Hint'), cost);
    this.hintButton.addEventListener('click', () => handlers.hint());
    controls.append(this.hintButton, this.undoButton, this.resetButton);

    this.root.append(sky, side, this.boardHost, controls, this.announcer);
    this.setBand('tall');
    // Redraw the scenery when the screen or the card under the hills changes size or place.
    const watch = new ResizeObserver(() => this.queueScene());
    watch.observe(this.root);
    watch.observe(this.status);
    watch.observe(this.complete.root);
  }

  setBand(band: Band): void {
    this.root.dataset.band = band;
    this.queueScene();
    // Visual order differs by band: the hint comes first in the wide column, last in a row.
    const controls = this.hintButton.parentElement;
    if (!controls) return;
    if (band === 'wide') controls.prepend(this.hintButton);
    else controls.append(this.hintButton);
  }

  private queueScene(): void {
    if (this.sceneFrame) return;
    this.sceneFrame = requestAnimationFrame(() => {
      this.sceneFrame = 0;
      this.drawScene();
    });
  }

  /** Bake night, grain and hills for the current size; place the motes over the ridges. */
  private drawScene(): void {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (w < 1 || h < 1) return;
    const res = Math.min(2, window.devicePixelRatio || 1);
    // Reallocate the backing store only when the size changes; the scene repaints every pixel anyway.
    const cw = Math.round(w * res), ch = Math.round(h * res);
    if (this.scene.width !== cw) this.scene.width = cw;
    if (this.scene.height !== ch) this.scene.height = ch;
    const ctx = this.scene.getContext('2d');
    if (!ctx) return;
    const origin = this.root.getBoundingClientRect();
    const cardEl = this.status.offsetHeight > 0 ? this.status : this.complete.root;
    const r = cardEl.getBoundingClientRect();
    const card = { left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top };
    const band = (this.root.dataset.band ?? 'tall') as Band;
    const hills = hillsFor(band, w, h, card);
    ctx.setTransform(res, 0, 0, res, 0, 0);
    drawScenery(ctx, this.palette.css, w, h, hills);
    [...this.motes.children].forEach((m, i) => {
      const p = hills.motes[i];
      if (p && m instanceof HTMLElement) m.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
    });
    this.motes.dataset.placed = '';
    // The layout changed: the room between the title and the moon may have too.
    this.placeMoon();
    this.watchResolution();
  }

  /**
   * Redraw when the screen's pixel density changes (a window dragged between a 1x and a 2x
   * monitor changes it without resizing anything the ResizeObserver sees).
   */
  private watchResolution(): void {
    const dpr = window.devicePixelRatio || 1;
    if (this.sceneDpr === dpr) return;
    this.sceneDpr = dpr;
    this.resolutionQuery?.removeEventListener('change', this.onResolution);
    this.resolutionQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
    this.resolutionQuery.addEventListener('change', this.onResolution);
  }

  private readonly onResolution = () => this.queueScene();

  setReducedMotion(reduced: boolean): void {
    this.root.dataset.motion = reduced ? 'reduced' : 'full';
  }

  /**
   * The moon travels through a chapter (rewards plan, "the moon travels"): from its place at the
   * first garden, leftward toward the end of the area title and a little lower, garden by garden,
   * warming toward gold, so the chapter's end feels near without a bar. Measured, so it never
   * overlaps the title; it glides there (CSS), or lands there at once under reduced motion.
   */
  private placeMoon(): void {
    const p = this.moonProgress;
    // Its resting place, untouched by the travel transform (which may be mid-glide): the sky's
    // left edge plus the moon's own left offset, which transforms never change.
    const sky = this.moon.parentElement?.getBoundingClientRect();
    const baseLeft = sky ? sky.left + Number.parseFloat(getComputedStyle(this.moon).left) : NaN;
    const range = document.createRange();
    range.selectNodeContents(this.title);
    const titleRight = range.getBoundingClientRect().right;
    // Nothing to measure against (the title is hidden, as in the wide band under the complete card,
    // or nothing is laid out yet): leave the moon where it is rather than sending it home.
    if (!Number.isFinite(baseLeft) || titleRight <= 0 || this.moon.getBoundingClientRect().width === 0) return;
    // Room between the title's last letter and where the moon sits with no travel. Where there is
    // little (the wide band's side panel, the moon right beside the title), it sinks down the sky instead.
    const room = Math.max(0, baseLeft - titleRight - 16);
    const across = room >= 24;
    this.moon.style.setProperty('--ff-moon-x', `${(across ? -room * p : 0).toFixed(1)}px`);
    this.moon.style.setProperty('--ff-moon-y', `${(across ? 12 * p - 10 * Math.sin(Math.PI * p) : 64 * p).toFixed(1)}px`);
    this.moon.style.setProperty('--ff-moon-warm', p.toFixed(2));
  }

  /** Tap the moon: a firefly crosses the sky (with motion only; it changes nothing). */
  private moonTapped(): void {
    if (this.root.dataset.motion === 'reduced' || this.skyBusy) return;
    const r = this.moon.getBoundingClientRect(), w = this.root.clientWidth;
    const y = r.top + r.height * 0.6;
    const leftToRight = r.left + r.width / 2 > w / 2;
    const from = { x: leftToRight ? -30 : w + 30, y: y + 28 }, to = { x: leftToRight ? w + 30 : -30, y: y - 6 };
    this.skyBusy = true;
    crossSky(this.root, from, to, () => { this.skyBusy = false; });
    // A hidden tab can hold the animation: never leave the moon unresponsive.
    setTimeout(() => { this.skyBusy = false; }, SKY_MS + 800);
  }

  /** `spoken` is what screen readers hear in place of `label` ("Garden 3 of 10" for "3 of 10"). */
  setChapter(label: string, title: string, dots: readonly ('done' | 'now' | 'todo')[], difficulty?: Difficulty, spoken = label): void {
    const shown = el('span', undefined, label);
    if (spoken !== label) shown.setAttribute('aria-hidden', 'true');
    this.chapterLabel.replaceChildren(shown, ...(spoken !== label ? [el('span', 'ff-sr', spoken)] : []));
    this.difficulty.hidden = !difficulty;
    if (difficulty) {
      // The word is always there for screen readers; narrow phones show the leaves alone.
      this.difficulty.replaceChildren(leaves(difficulty.leaves, MAX_LEAVES), el('span', 'ff-difficulty-word', difficulty.word));
      this.difficulty.dataset.leaves = String(difficulty.leaves);
    }
    this.title.textContent = title;
    // The moon's place: the current garden's (or, for a bonus garden, the gardens done so far).
    const now = dots.indexOf('now');
    const at = now >= 0 ? now : dots.filter((d) => d === 'done').length;
    this.moonProgress = dots.length <= 1 ? 0 : Math.min(1, at / (dots.length - 1));
    this.placeMoon();
    this.dots.replaceChildren(...dots.map((d) => {
      const s = el('span', 'ff-dot');
      s.dataset.state = d;
      return s;
    }));
  }

  /** The current garden's dash in the progress track (viewport pixels), or null when there is none. */
  progressTarget(): { x: number; y: number } | null {
    const dot = this.dots.querySelector<HTMLElement>('.ff-dot[data-state="now"], .ff-dot[data-lit]');
    const r = dot?.getBoundingClientRect();
    return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }

  /** The solved garden's dash turns gold; `glint` flashes it (a released firefly landing). */
  lightProgress(glint: boolean): void {
    const dot = this.dots.querySelector<HTMLElement>('.ff-dot[data-state="now"], .ff-dot[data-lit]');
    if (!dot) return;
    dot.dataset.state = 'done';
    dot.dataset.lit = 'true';
    if (!glint) return;
    delete dot.dataset.arrive;
    void dot.offsetWidth; // restart the glint for each firefly that lands
    dot.dataset.arrive = 'true';
  }

  /**
   * The solve's coins land in the coin pill: it shows `before` until `afterMs` (as the card's +10
   * chip rises), then `after` with a small bump. 0 shows `after` now, still. (A chapter's bonus is
   * shown on its card and the map; the pill catches up at the next refresh.)
   */
  landCoins(before: number, after: number, afterMs: number): void {
    if (this.coinTimer !== null) clearTimeout(this.coinTimer);
    this.coinTimer = null;
    if (afterMs <= 0) {
      this.coins.textContent = String(after);
      return;
    }
    this.coins.textContent = String(before);
    // Coins fly from the card's chip into the pill (rewards plan), then the pill counts up.
    const flyAt = Math.max(0, afterMs - COIN_FLIGHT_MS);
    this.coinTimer = setTimeout(() => {
      const from = this.complete.chipCenter(), pill = this.coins.parentElement;
      const r = pill?.getBoundingClientRect();
      if (from && r && r.width > 0) coinFlight(this.root, from, { x: r.left + 18, y: r.top + r.height / 2 }, COIN_FLIGHT_MS);
      this.coinTimer = setTimeout(() => this.countUp(before, after), afterMs - flyAt);
    }, flyAt);
  }

  /** The pill counts up from `before` to `after` with a small bump (the coins have landed). */
  private countUp(before: number, after: number): void {
    const pill = this.coins.parentElement;
    if (pill) {
      delete pill.dataset.bump;
      void pill.offsetWidth;
      pill.dataset.bump = 'true';
    }
    const steps = Math.min(10, Math.max(1, after - before));
    let k = 0;
    const tick = () => {
      k++;
      this.coins.textContent = String(k >= steps ? after : Math.round(before + ((after - before) * k) / steps));
      this.coinTimer = k >= steps ? null : setTimeout(tick, 32);
    };
    tick();
  }

  setCoins(coins: number): void {
    // A pending landing is superseded by the real balance.
    if (this.coinTimer !== null) clearTimeout(this.coinTimer);
    this.coinTimer = null;
    this.coins.textContent = String(coins);
  }

  /** The hint button's count: this garden's free hints left, else hints saved from a video, else a video mark. */
  setHints(free: number, saved: number): void {
    if (free > 0) {
      this.hintCount.replaceChildren(String(free));
      this.hintButton.setAttribute('aria-label', `Hint, ${free} free left`);
    } else if (saved > 0) {
      this.hintCount.replaceChildren(`${saved} saved`);
      this.hintButton.setAttribute('aria-label', `Hint, ${saved} saved`);
    } else {
      this.hintCount.replaceChildren(icon('video'));
      this.hintButton.setAttribute('aria-label', 'Hint, watch a video for more');
    }
  }

  setStatus(s: Status): void {
    this.status.dataset.tone = s.tone;
    this.statusTitle.textContent = s.title;
    this.statusSub.textContent = s.sub;
  }

  /**
   * Swap the status card and moves for the level-complete card. The celebration itself is the
   * board's solve moment, so the card only rises in, `enterMs` later, and takes taps from
   * `readyMs` (it keeps its space meanwhile, so the board does not resize mid-celebration).
   */
  showComplete(view: CompleteView, enterMs = 0, readyMs = enterMs): void {
    this.root.dataset.complete = 'true';
    this.complete.show(view, enterMs, readyMs);
  }

  hideComplete(): void {
    delete this.root.dataset.complete;
    this.complete.hide();
  }


  /** The jar's count: one slot per firefly the garden needs, lit while it is still in the jar. */
  setJar(remaining: number, size: number): void {
    // No garden on the board (the end of the build): no jar.
    this.jar.parentElement!.hidden = size === 0;
    if (this.slots.childElementCount !== size) {
      this.slots.replaceChildren(...Array.from({ length: size }, () => el('span', 'ff-slot')));
    }
    [...this.slots.children].forEach((slot, i) => {
      (slot as HTMLElement).dataset.on = String(i < remaining);
    });
    this.jarLine.textContent = remaining === 0 ? `All ${size} fireflies are out` : `${remaining} of ${size} fireflies left`;
    this.jar.style.setProperty('--ff-jar-fill', String(size === 0 ? 0 : remaining / size));
    this.jar.dataset.empty = String(remaining === 0);
    // A light in the lantern for each firefly left (the slots carry the exact count past eight).
    this.jar.querySelectorAll('.ff-lantern-light').forEach((light, i) => {
      light.classList.toggle('ff-on', i < Math.min(remaining, LANTERN_LIGHTS.length));
    });
  }

  /** Lift the lantern's cap for a firefly leaving or coming home. */
  openJar(): void {
    if (!this.reduced()) this.restartClass(this.jar, 'ff-jar-open');
  }

  shakeJar(): void {
    if (!this.reduced()) this.restartClass(this.jar, 'ff-jar-shake');
  }

  /** Whether the screen is in reduced motion (device setting or the in-game one). */
  private reduced(): boolean {
    return this.root.dataset.motion === 'reduced';
  }

  /** The jar's mouth in viewport pixels: where flights start and end. */
  jarMouth(): { x: number; y: number } {
    const r = this.jar.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.3 };
  }

  private restartClass(node: HTMLElement, name: string): void {
    node.classList.remove(name);
    void node.offsetWidth; // restart the CSS animation
    node.classList.add(name);
  }

  setMoves(canUndo: boolean, canReset: boolean, solved: boolean): void {
    this.undoButton.disabled = !canUndo || solved;
    this.resetButton.disabled = !canReset || solved;
    this.hintButton.disabled = solved;
  }

  /** Put keyboard focus on the top bar's map button (after leaving the map). */
  focusMap(): void {
    this.mapButton?.focus({ preventScroll: true });
  }

  announce(text: string): void {
    this.announcer.textContent = text;
  }

  focusNext(): void {
    this.complete.focus();
  }

  /** Whether keyboard focus is on the level-complete card (a keyboard player pressing Next). */
  completeHasFocus(): boolean {
    return this.complete.root.contains(document.activeElement);
  }
}
