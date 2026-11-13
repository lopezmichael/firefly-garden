import { coin } from './icons.ts';
/**
 * The level-complete card (design baseline: Complete artboard): it takes the
 * place of the status card and the move buttons once a garden is solved. The
 * title, what was solved and how fast, the coins earned, Garden map, and Next
 * garden with a ring that counts down to the auto-advance. Text is set with
 * textContent; the only markup strings are constant icons.
 */

export interface CompleteView {
  /** "Garden 6 of 10 in the Rose Bed. Solved in 0:48." */
  readonly sub: string;
  readonly coins: number;
  /** Whether another garden follows (false on the last one: no Next, no countdown). */
  readonly more: boolean;
}

export interface CompleteHandlers {
  next(): void;
  map(): void;
}

/** 2πr for the ring's r = 20: a full dash is one full turn. */
const RING_LENGTH = 126;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class CompleteCard {
  /** Fills the space the status card and moves keep; the panel sits at its foot. */
  readonly root = el('section', 'ff-complete');
  private readonly panel = el('div', 'ff-complete-panel');
  private readonly sub = el('p', 'ff-complete-sub');
  private readonly chip = el('div', 'ff-complete-chip');
  private readonly chipText = el('span');
  private readonly chipSr = el('span', 'ff-sr');
  private readonly mapButton = el('button', 'ff-complete-map');
  private layer: HTMLElement | null = null;
  private readonly ring: SVGSVGElement;
  private readonly nextButton = el('button', 'ff-complete-next');
  private readonly note = el('p', 'ff-complete-note');

  constructor(handlers: CompleteHandlers) {
    this.root.hidden = true;
    this.root.setAttribute('aria-labelledby', 'ff-complete-title');
    const head = el('div', 'ff-complete-head');
    const title = el('h2', 'ff-complete-title', 'The garden is glowing!');
    title.id = 'ff-complete-title';
    this.chipText.setAttribute('aria-hidden', 'true');
    this.chip.append(coin(), this.chipText, this.chipSr);
    head.append(title, this.chip);

    const buttons = el('div', 'ff-complete-buttons');
    const map = this.mapButton;
    map.type = 'button';
    map.setAttribute('aria-label', 'Garden map');
    const mapIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mapIcon.setAttribute('viewBox', '0 0 24 24');
    mapIcon.setAttribute('aria-hidden', 'true');
    mapIcon.classList.add('ff-icon', 'ff-complete-map-icon');
    // Constant markup (the top bar's map icon), never game or player data.
    mapIcon.innerHTML = '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"></path><path d="M9 4v14"></path><path d="M15 6v14"></path>';
    // The wide band's narrow panel shows the icon alone; elsewhere the words.
    map.append(mapIcon, el('span', 'ff-complete-map-label', 'Garden map'));
    map.addEventListener('click', () => handlers.map());
    this.nextButton.type = 'button';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('ff-complete-ring');
    // Constant markup, never game or player data.
    svg.innerHTML = `<circle class="ff-ring-track" cx="24" cy="24" r="20"></circle><circle class="ff-ring-fill" cx="24" cy="24" r="20" stroke-dasharray="${RING_LENGTH}"></circle>`;
    this.ring = svg;
    this.nextButton.append(svg, document.createTextNode('Next garden'));
    this.nextButton.addEventListener('click', () => handlers.next());
    buttons.append(map, this.nextButton);

    this.panel.append(head, this.sub, buttons, this.note);
    this.root.append(this.panel);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(view: CompleteView): void {
    this.sub.textContent = view.sub;
    this.chipText.textContent = `+${view.coins}`;
    this.chipSr.textContent = `${view.coins} coins earned`;
    this.nextButton.hidden = !view.more;
    this.note.textContent = view.more ? 'The next garden opens by itself in a moment.' : 'You lit every garden in this build.';
    this.ring.classList.remove('ff-counting');
    this.root.hidden = false;
    // Replay the entrance (the coin chip rises) each time a garden is solved.
    this.root.classList.remove('ff-enter');
    void this.root.offsetWidth;
    this.root.classList.add('ff-enter');
  }

  hide(): void {
    this.root.hidden = true;
    this.ring.classList.remove('ff-counting');
    this.layer?.remove();
    this.layer = null;
  }

  /** Throw the solve burst over `host`; it goes by itself, or with the card. */
  burst(host: HTMLElement): void {
    this.layer?.remove();
    this.layer = burst(host);
  }

  /** Run the ring down over `ms` (restarted from full each time the auto-advance is armed). */
  countdown(ms: number): void {
    this.ring.style.setProperty('--ff-countdown', `${ms}ms`);
    this.ring.classList.remove('ff-counting');
    void this.ring.getBoundingClientRect();
    this.ring.classList.add('ff-counting');
  }

  /** The auto-advance is on hold (a sheet is open, the tab is hidden): the ring waits full. */
  holdCountdown(): void {
    this.ring.classList.remove('ff-counting');
  }

  /** Focus Next, or Garden map on the last garden. */
  focus(): void {
    (this.nextButton.hidden ? this.mapButton : this.nextButton).focus({ preventScroll: true });
  }
}

/** Sparks thrown from the board's centre when a garden is solved. Purely decorative. */
function burst(host: HTMLElement): HTMLElement {
  const layer = el('div', 'ff-burst');
  layer.setAttribute('aria-hidden', 'true');
  const count = 18;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const radius = 70 + (i % 4) * 22;
    const s = el('span', `ff-spark ff-spark-${i % 4}`);
    s.style.setProperty('--dx', `${Math.round(Math.cos(angle) * radius)}px`);
    s.style.setProperty('--dy', `${Math.round(Math.sin(angle) * radius - 40)}px`);
    s.style.setProperty('--size', `${5 + (i % 3) * 2}px`);
    s.style.setProperty('--delay', `${(i % 5) * 60}ms`);
    layer.append(s);
  }
  host.append(layer);
  // The longest spark is 1.4 s plus its 240 ms delay; a timer (not animationend) so the layer
  // goes even if animations never run (a hidden tab).
  setTimeout(() => layer.remove(), 1800);
  return layer;
}
