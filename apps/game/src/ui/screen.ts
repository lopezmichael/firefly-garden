import type { Band } from '../view/layout.ts';
import { CompleteCard } from './complete.ts';
import type { CompleteView } from './complete.ts';

/**
 * The play screen's DOM: top bar, title, status card and controls around the
 * board host (the PixiJS canvas lives in `boardHost`). Built with DOM calls;
 * game text is always set with `textContent`, never parsed as HTML.
 */

const ICONS = {
  undo: '<path d="M9 14L4 9l5-5"></path><path d="M4 9h10a6 6 0 0 1 0 12h-3"></path>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"></path><path d="M9 4v14"></path><path d="M15 6v14"></path>',
  gear: '<circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"></path>',
  // The game's firefly, not a stock star: wings, body, head.
  hint: '<ellipse cx="7.5" cy="9" rx="4.5" ry="3" transform="rotate(-25 7.5 9)"></ellipse><ellipse cx="16.5" cy="9" rx="4.5" ry="3" transform="rotate(25 16.5 9)"></ellipse><circle cx="12" cy="15" r="4.6" fill="currentColor"></circle><circle cx="12" cy="8.6" r="2.4" fill="currentColor" stroke="none"></circle>',
} as const;

const JAR_SVG = '<svg viewBox="0 0 64 80"><ellipse class="ff-jar-glow" cx="32" cy="52" rx="26" ry="24"></ellipse>'
  + '<path class="ff-jar-glass" d="M18 18 h28 v6 c8 4 12 12 12 22 v18 c0 8 -6 13 -14 13 h-24 c-8 0 -14 -5 -14 -13 v-18 c0 -10 4 -18 12 -22 z"></path>'
  + '<path class="ff-jar-shine" d="M14 40 c0 -6 2 -10 6 -13"></path>'
  + '<g class="ff-jar-lid"><rect class="ff-jar-cork" x="16" y="9" width="32" height="10" rx="3"></rect><rect class="ff-jar-cork-hi" x="16" y="9" width="32" height="4" rx="2"></rect></g></svg>';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function icon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ff-icon');
  // Constant markup from ICONS above, never game or player data.
  svg.innerHTML = ICONS[name];
  return svg;
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

  constructor(handlers: ScreenHandlers) {
    const sky = el('div', 'ff-sky');
    sky.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 16; i++) {
      const s = el('span', 'ff-star');
      const size = i % 3 === 0 ? 3 : 2;
      s.style.cssText = `left:${(i * 89 + 23) % 100}%;top:${(i * 47 + 11) % 30}%;width:${size}px;height:${size}px;--dur:${(2 + (i % 4) * 0.7).toFixed(1)}s;--delay:${((i * 0.37) % 3).toFixed(2)}s`;
      sky.append(s);
    }
    sky.append(el('div', 'ff-moon'));

    const side = el('section', 'ff-side');
    const top = el('header', 'ff-top');
    const chapter = el('div', 'ff-chapter');
    this.dots.setAttribute('aria-hidden', 'true');
    chapter.append(this.chapterLabel, this.dots);
    const coinBox = el('div', 'ff-coins');
    coinBox.append(el('span', 'ff-coin'), this.coins);
    const gear = el('button', 'ff-gear');
    gear.type = 'button';
    gear.setAttribute('aria-label', 'Settings');
    gear.append(icon('gear'));
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
    // The firefly jar (design: jar plus a slot per firefly). The jar is where fireflies fly
    // from and back to; the slots make the count exact at a glance.
    this.jar.setAttribute('aria-hidden', 'true');
    // Constant markup, never game or player data.
    this.jar.innerHTML = JAR_SVG;
    const count = el('div', 'ff-jar-count');
    this.slots.setAttribute('aria-hidden', 'true');
    count.append(this.jarLine, this.slots);
    const row = el('div', 'ff-status-row');
    row.append(this.jar, count);
    const text = el('div', 'ff-status-text');
    text.append(this.statusTitle, this.statusSub);
    this.status.append(row, text);
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
    const cost = el('span', 'ff-cost');
    cost.append(el('span', 'ff-coin'), this.hintCost);
    this.hintButton.append(icon('hint'), document.createTextNode('Hint'), cost);
    this.hintButton.addEventListener('click', () => handlers.hint());
    controls.append(this.hintButton, this.undoButton, this.resetButton);

    this.root.append(sky, side, this.boardHost, controls, this.announcer);
    this.setBand('tall');
  }

  setBand(band: Band): void {
    this.root.dataset.band = band;
    // Visual order differs by band: the hint comes first in the wide column, last in a row.
    const controls = this.hintButton.parentElement;
    if (!controls) return;
    if (band === 'wide') controls.prepend(this.hintButton);
    else controls.append(this.hintButton);
  }

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

  /** Swap the status card and moves for the level-complete card; `burst` throws sparks. */
  showComplete(view: CompleteView, withBurst: boolean): void {
    this.root.dataset.complete = 'true';
    this.complete.show(view);
    if (withBurst && !this.reduced()) this.complete.burst(this.boardHost);
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
  }

  /** Lift the cork for a firefly leaving or coming home. */
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
