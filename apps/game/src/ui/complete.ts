import { coin, icon } from './icons.ts';
/**
 * The level-complete card (design canvas: "Level complete"): it takes the
 * place of the status card and the move buttons once a garden is solved. Paper,
 * the title, what was solved and how fast, the coin badge, Garden map, Next
 * garden in seal red, and a thin bar that fills as the auto-advance comes.
 * Text is set with textContent; the only markup is the constant icons.
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
  /** The countdown: a thin bar that fills over the wait before the next garden opens. */
  private readonly bar = el('div', 'ff-complete-bar');
  private readonly nextButton = el('button', 'ff-complete-next');
  private readonly note = el('p', 'ff-complete-note');

  constructor(handlers: CompleteHandlers) {
    this.root.hidden = true;
    this.root.setAttribute('aria-labelledby', 'ff-complete-title');
    const head = el('div', 'ff-complete-head');
    const words = el('div', 'ff-complete-words');
    const title = el('h2', 'ff-complete-title', 'The garden is glowing!');
    title.id = 'ff-complete-title';
    words.append(title, this.sub);
    this.chipText.setAttribute('aria-hidden', 'true');
    this.chip.append(coin(), this.chipText, this.chipSr);
    head.append(words, this.chip);

    const buttons = el('div', 'ff-complete-buttons');
    const map = this.mapButton;
    map.type = 'button';
    map.setAttribute('aria-label', 'Garden map');
    // The wide band's narrow panel shows the icon alone; elsewhere the words too.
    map.append(icon('map'), el('span', 'ff-complete-map-label', 'Garden map'));
    map.addEventListener('click', () => handlers.map());
    this.nextButton.type = 'button';
    this.nextButton.append(document.createTextNode('Next garden'), icon('next'));
    this.nextButton.addEventListener('click', () => handlers.next());
    buttons.append(map, this.nextButton);

    const foot = el('div', 'ff-complete-foot');
    const track = el('div', 'ff-complete-track');
    track.setAttribute('aria-hidden', 'true');
    track.append(this.bar);
    foot.append(track, this.note);
    this.panel.append(head, buttons, foot);
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
    this.root.dataset.more = String(view.more);
    this.bar.classList.remove('ff-counting');
    this.root.hidden = false;
    // Replay the entrance (the coin chip rises) each time a garden is solved.
    this.root.classList.remove('ff-enter');
    void this.root.offsetWidth;
    this.root.classList.add('ff-enter');
  }

  hide(): void {
    this.root.hidden = true;
    this.bar.classList.remove('ff-counting');
  }

  /** Fill the bar over `ms` (restarted from empty each time the auto-advance is armed). */
  countdown(ms: number): void {
    this.bar.style.setProperty('--ff-countdown', `${ms}ms`);
    this.bar.classList.remove('ff-counting');
    void this.bar.getBoundingClientRect();
    this.bar.classList.add('ff-counting');
  }

  /** The auto-advance is on hold (a sheet is open, the tab is hidden): the bar waits empty. */
  holdCountdown(): void {
    this.bar.classList.remove('ff-counting');
  }

  /** Focus Next, or Garden map on the last garden. */
  focus(): void {
    (this.nextButton.hidden ? this.mapButton : this.nextButton).focus({ preventScroll: true });
  }
}
