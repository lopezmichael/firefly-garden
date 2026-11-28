import type { JournalPage, Sketch } from '../state/journal.ts';
import { formatDuration } from '../state/chapters.ts';
import { SEAL_SVG } from './chapter.ts';
import { icon, leaves } from './icons.ts';
import { difficultyOf, MAX_LEAVES } from '../state/difficulty.ts';

/**
 * The garden journal (design canvas "Garden journal: a page per chapter"): a paper book over the
 * map, a page per chapter. Ribbon tabs and arrows turn pages; a dark chapter's tab can't be opened.
 * A modal dialog: Escape and the close button shut it, Tab stays inside, focus returns to the book
 * button. Text is set with textContent; the only markup is constant SVG (the seal, icons); garden
 * sketches are built element by element from the level's own geometry.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function svgEl(tag: string, attrs: Record<string, string | number>, className?: string): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (className) e.setAttribute('class', className);
  return e;
}

/** A garden pressed into the page: path tiles, bushes and the fireflies that lit it. */
function sketchSvg(s: Sketch): SVGElement {
  const g = svgEl('svg', { viewBox: `0 0 ${s.w} ${s.h}`, 'aria-hidden': 'true' }, 'ff-journal-sketch');
  s.cells.forEach((c, i) => {
    if (!c) return;
    const x = i % s.w, y = Math.floor(i / s.w);
    if (c === 'bush') {
      g.append(svgEl('circle', { cx: x + 0.5, cy: y + 0.5, r: 0.42 }, 'ff-js-bush'));
      return;
    }
    g.append(svgEl('rect', { x: x + 0.07, y: y + 0.07, width: 0.86, height: 0.86, rx: 0.12 }, 'ff-js-path'));
    if (c === 'firefly') g.append(svgEl('circle', { cx: x + 0.5, cy: y + 0.5, r: 0.3 }, 'ff-js-fly'));
    if (c === 'lantern') g.append(svgEl('rect', { x: x + 0.3, y: y + 0.28, width: 0.4, height: 0.46, rx: 0.08 }, 'ff-js-lantern'));
  });
  return g;
}

/** A slight tilt per garden, like flowers pressed by hand (fixed per slot, so a page never shuffles). */
const TILT = [-2, 1.5, -1, 2, -1.5, 1, -2.5, 1.5, -1, 2, -1.5];

export class Journal {
  readonly root = el('div', 'ff-journal-layer');
  private readonly book = el('section', 'ff-journal');
  private readonly tabs = el('nav', 'ff-journal-tabs');
  private readonly page = el('div', 'ff-journal-page');
  private readonly closeButton = el('button', 'ff-journal-close');
  private pages: readonly JournalPage[] = [];
  private at = 0;
  private sketch: (id: string) => Sketch | null = () => null;
  private returnFocus: HTMLElement | null = null;
  private reduced = false;
  onClose: (() => void) | null = null;

  constructor() {
    this.root.hidden = true;
    // The whole layer is the dialog, so its title and close button are inside it for screen readers.
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'ff-journal-title');
    const head = el('header', 'ff-journal-head');
    const title = el('h1', 'ff-journal-title', 'Garden journal');
    title.id = 'ff-journal-title';
    this.closeButton.type = 'button';
    this.closeButton.setAttribute('aria-label', 'Close the journal');
    this.closeButton.append(icon('close'));
    this.closeButton.addEventListener('click', () => this.close());
    head.append(title, this.closeButton);
    this.tabs.setAttribute('aria-label', 'Chapters');
    this.book.append(this.tabs, this.page);
    this.root.append(head, this.book);
  }

  /** On the document, not the layer: a tap on the page's text drops focus to <body>, and Escape must still close. */
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'Tab') {
      // A modal: Tab and Shift+Tab cycle through the journal's own controls.
      const live = [...this.root.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.disabled && b.offsetParent !== null);
      if (live.length === 0) return;
      e.preventDefault();
      const i = live.indexOf(document.activeElement as HTMLButtonElement);
      const next = i < 0 ? (e.shiftKey ? live.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + live.length) % live.length;
      live[next]!.focus({ preventScroll: true });
    }
  };

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  setMotion(on: boolean): void {
    this.reduced = !on;
  }

  /** Open on page `start` (the first chapter still growing, see `openingPage`). `sketch` draws a grown garden. */
  open(pages: readonly JournalPage[], start: number, sketch: (id: string) => Sketch | null): void {
    this.pages = pages;
    this.sketch = sketch;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.hidden = false;
    document.addEventListener('keydown', this.onKey);
    this.turnTo(start, 0);
    this.closeButton.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    document.removeEventListener('keydown', this.onKey);
    this.page.replaceChildren();
    // The map comes back to life first, or focus can't return to its book button.
    this.onClose?.();
    this.returnFocus?.focus({ preventScroll: true });
  }

  /** The page shown now (for tests). */
  get current(): number {
    return this.at;
  }

  private turnTo(index: number, dir: number): void {
    const p = this.pages[index];
    if (!p || p.state === 'dark') return;
    this.at = index;
    this.renderTabs();
    this.renderPage(p);
    if (dir !== 0 && !this.reduced) {
      // A page turn: the new page slides in from the side it comes from.
      this.page.animate([{ transform: `translateX(${dir * 24}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' });
    }
  }

  private renderTabs(): void {
    this.tabs.replaceChildren(...this.pages.map((p, i) => {
      const b = el('button', 'ff-journal-tab', String(p.number));
      b.type = 'button';
      b.dataset.state = p.state;
      b.setAttribute('aria-label', p.state === 'dark' ? `Chapter ${p.number}, still dark` : `Chapter ${p.number}, ${p.area}`);
      if (i === this.at) b.setAttribute('aria-current', 'page');
      b.disabled = p.state === 'dark';
      b.addEventListener('click', () => {
        if (i === this.at) return;
        this.turnTo(i, i > this.at ? 1 : -1);
        // The tabs were redrawn: keep focus on the tab that was pressed.
        (this.tabs.children[i] as HTMLElement | undefined)?.focus({ preventScroll: true });
      });
      return b;
    }));
  }

  private renderPage(p: JournalPage): void {
    const top = el('div', 'ff-journal-top');
    const words = el('div', 'ff-journal-words');
    words.append(el('span', 'ff-journal-kicker', `Chapter ${p.number}`), el('h2', 'ff-journal-area', p.area), el('p', 'ff-journal-line', p.line));
    const seal = el('div', p.state === 'done' ? 'ff-journal-seal' : 'ff-journal-seal ff-journal-seal-empty');
    if (p.state === 'done') {
      seal.innerHTML = SEAL_SVG; // constant markup, never data
      seal.setAttribute('role', 'img');
      seal.setAttribute('aria-label', `Chapter ${p.number}'s seal`);
    } else {
      seal.setAttribute('role', 'img');
      seal.setAttribute('aria-label', 'The seal, not stamped yet');
    }
    top.append(words, seal);

    const stats = el('div', 'ff-journal-stats');
    for (const [value, label] of [
      [p.state === 'done' ? String(p.grown) : `${p.grown} of ${p.gardens.length}`, 'gardens grown'],
      // History keeps only recent plays: once older ones are trimmed the totals would undercount, so they show a dash.
      [p.totalsKnown ? formatDuration(p.seconds) : '–', 'in the garden'],
      [p.totalsKnown ? String(p.hints) : '–', p.hints === 1 && p.totalsKnown ? 'hint used' : 'hints used'],
    ] as const) {
      const s = el('div', 'ff-journal-stat');
      s.append(el('span', 'ff-journal-num', value), el('span', 'ff-journal-label', label));
      stats.append(s);
    }

    const grid = el('ul', 'ff-journal-gardens');
    p.gardens.forEach((g, i) => {
      const li = el('li', 'ff-journal-garden');
      const frame = el('div', 'ff-journal-frame');
      const sk = g.grown ? this.sketch(g.id) : null;
      if (sk) {
        frame.style.setProperty('--ff-tilt', `${TILT[i % TILT.length]}deg`);
        frame.append(sketchSvg(sk));
      } else {
        frame.classList.add('ff-journal-frame-empty');
      }
      const d = difficultyOf(g.tier);
      li.setAttribute('aria-label', `Garden ${i + 1}, ${d.word}, ${g.grown ? 'grown' : 'not grown yet'}`);
      const lv = leaves(d.leaves, MAX_LEAVES);
      lv.dataset.leaves = String(d.leaves);
      li.append(frame, el('span', 'ff-journal-garden-n', String(i + 1)), lv);
      grid.append(li);
    });

    const pager = el('div', 'ff-journal-pager');
    const prev = this.arrow('prev', 'Previous chapter', -1);
    const next = this.arrow('forward', 'Next chapter', 1);
    pager.append(prev, el('span', 'ff-journal-where', `Chapter ${p.number} of ${this.pages.length}`), next);

    this.page.replaceChildren(top, stats, el('h3', 'ff-journal-sub', p.grown > 0 ? 'Pressed from your gardens' : 'Your gardens will be pressed here'), grid, pager);
  }

  private arrow(name: 'prev' | 'forward', label: string, dir: number): HTMLButtonElement {
    const b = el('button', 'ff-journal-arrow');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.append(icon(name));
    const target = this.at + dir;
    b.disabled = !this.pages[target] || this.pages[target]!.state === 'dark';
    b.addEventListener('click', () => {
      this.turnTo(target, dir);
      // The page was redrawn: keep focus on the same arrow, or the other one at the book's end.
      const arrows = [...this.page.querySelectorAll<HTMLButtonElement>('.ff-journal-arrow')];
      const same = arrows[dir < 0 ? 0 : 1];
      (same && !same.disabled ? same : arrows.find((a) => !a.disabled) ?? this.closeButton).focus({ preventScroll: true });
    });
    return b;
  }
}
