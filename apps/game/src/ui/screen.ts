import type { Band } from '../view/layout.ts';
import { CompleteCard } from './complete.ts';
import type { CompleteView } from './complete.ts';
import { coin, icon, LANTERN_LIGHTS, lantern, moon } from './icons.ts';
import { hillsFor, HILLS } from '../view/layout.ts';
import { drawScenery } from '../view/art/scenery.ts';
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
  private readonly chapterLabel = el('div', 'ff-chapter-label');
  private readonly dots = el('div', 'ff-dots');
  private readonly coins = el('span');
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
  private readonly hintCost = el('span');
  private readonly announcer = el('div', 'ff-sr');
  private mapButton: HTMLButtonElement | null = null;
  private readonly complete: CompleteCard;
  private readonly scene = el('canvas', 'ff-scene');
  private readonly motes = el('div', 'ff-motes');
  private sceneFrame = 0;
  private sceneDpr = 0;
  private resolutionQuery: MediaQueryList | null = null;

  constructor(handlers: ScreenHandlers, private readonly palette: Palette) {
    // The scenery (theme plan, milestone 6): night, grain and hills baked into one canvas,
    // the crescent moon and drifting motes as DOM over it.
    const sky = el('div', 'ff-sky');
    sky.setAttribute('aria-hidden', 'true');
    sky.append(this.scene, moon(), this.motes);
    for (let i = 0; i < HILLS.motes; i++) {
      const m = el('span', 'ff-mote');
      m.style.setProperty('--ff-mote-delay', `${(-i * 1.3).toFixed(1)}s`);
      this.motes.append(m);
    }

    const side = el('section', 'ff-side');
    const top = el('header', 'ff-top');
    const chapter = el('div', 'ff-chapter');
    this.dots.setAttribute('aria-hidden', 'true');
    chapter.append(this.chapterLabel, this.dots);
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
    // "Hint · 30" (or "Hint · 2 saved"), as on the canvas; the label says "coins" for screen readers.
    const cost = el('span', 'ff-cost');
    cost.append(el('span', 'ff-cost-sep', '·'), this.hintCost);
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

  setChapter(label: string, title: string, dots: readonly ('done' | 'now' | 'todo')[]): void {
    this.chapterLabel.textContent = label;
    this.title.textContent = title;
    this.dots.replaceChildren(...dots.map((d) => {
      const s = el('span', 'ff-dot');
      s.dataset.state = d;
      return s;
    }));
  }

  setCoins(coins: number, hintCost: number, bank: number): void {
    this.coins.textContent = String(coins);
    this.hintCost.textContent = bank > 0 ? `${bank} saved` : String(hintCost);
    this.hintButton.setAttribute('aria-label', bank > 0 ? `Hint, ${bank} saved` : `Hint, ${hintCost} coins`);
  }

  setStatus(s: Status): void {
    this.status.dataset.tone = s.tone;
    this.statusTitle.textContent = s.title;
    this.statusSub.textContent = s.sub;
  }

  /**
   * Swap the status card and moves for the level-complete card. The celebration itself is the
   * board's solve moment (the bloom ripple), so the card only slides in.
   */
  showComplete(view: CompleteView): void {
    this.root.dataset.complete = 'true';
    this.complete.show(view);
  }

  hideComplete(): void {
    delete this.root.dataset.complete;
    this.complete.hide();
  }

  countdown(ms: number): void {
    this.complete.countdown(ms);
  }

  holdCountdown(): void {
    this.complete.holdCountdown();
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
}
