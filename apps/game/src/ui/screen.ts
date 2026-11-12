import type { Band } from '../view/layout.ts';

/**
 * The play screen's DOM: top bar, title, status card and controls around the
 * board host (the PixiJS canvas lives in `boardHost`). Built with DOM calls;
 * game text is always set with `textContent`, never parsed as HTML.
 */

const ICONS = {
  undo: '<path d="M9 14L4 9l5-5"></path><path d="M4 9h10a6 6 0 0 1 0 12h-3"></path>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path>',
  gear: '<circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"></path>',
  // The game's firefly, not a stock star: wings, body, head.
  hint: '<ellipse cx="7.5" cy="9" rx="4.5" ry="3" transform="rotate(-25 7.5 9)"></ellipse><ellipse cx="16.5" cy="9" rx="4.5" ry="3" transform="rotate(25 16.5 9)"></ellipse><circle cx="12" cy="15" r="4.6" fill="currentColor"></circle><circle cx="12" cy="8.6" r="2.4" fill="currentColor" stroke="none"></circle>',
} as const;

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
  private readonly nextButton = el('button', 'ff-next', 'Next garden');
  private readonly barFill = el('div', 'ff-bar-fill');
  private readonly undoButton = el('button', 'ff-quiet');
  private readonly resetButton = el('button', 'ff-quiet');
  private readonly hintButton = el('button', 'ff-hint');
  private readonly hintCost = el('span');
  private readonly announcer = el('div', 'ff-sr');

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
    top.append(chapter, coinBox, gear);

    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    const row = el('div', 'ff-status-row');
    const text = el('div', 'ff-status-text');
    text.append(this.statusTitle, this.statusSub);
    this.nextButton.type = 'button';
    this.nextButton.hidden = true;
    this.nextButton.addEventListener('click', () => handlers.next());
    row.append(text, this.nextButton);
    const bar = el('div', 'ff-bar');
    bar.append(this.barFill);
    this.status.append(row, bar);
    side.append(top, this.title, this.status);

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

  setStatus(s: Status, litPercent: number, solved: boolean): void {
    this.status.dataset.tone = s.tone;
    this.statusTitle.textContent = s.title;
    this.statusSub.textContent = s.sub;
    this.barFill.style.width = `${Math.max(0, Math.min(100, litPercent))}%`;
    this.nextButton.hidden = !solved;
  }

  setMoves(canUndo: boolean, canReset: boolean, solved: boolean): void {
    this.undoButton.disabled = !canUndo || solved;
    this.resetButton.disabled = !canReset || solved;
    this.hintButton.disabled = solved;
  }

  announce(text: string): void {
    this.announcer.textContent = text;
  }

  focusNext(): void {
    this.nextButton.focus({ preventScroll: true });
  }
}
