import { coin, icon } from './icons.ts';
/**
 * The level-complete card (design canvas: "Level complete"): it takes the
 * place of the status card and the move buttons once a garden is solved. Paper,
 * the title, what was solved and how fast, the coin badge, Garden map, and Next
 * garden in seal red. Nothing moves on by itself: the player taps to continue.
 * Text is set with textContent; the only markup is the constant icons.
 */

export interface CompleteView {
  /** "Garden 6 of 10 in the Rose Bed. Solved in 0:48." */
  readonly sub: string;
  readonly coins: number;
  /** Whether another garden follows (false on the last one: no Next). */
  readonly more: boolean;
  /** The Next button's words, when not "Next garden" ("Finish the chapter"). */
  readonly nextLabel?: string;
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
  private readonly nextButton = el('button', 'ff-complete-next');
  private readonly note = el('p', 'ff-complete-note');
  private readonly nextText = document.createTextNode('Next garden');
  /** Until the card is ready it is inert (no taps, no focus); this ends the wait. */
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  /** Focus asked for while the card was still waiting: given once it is ready. */
  private focusWanted = false;

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
    this.nextButton.append(this.nextText, icon('next'));
    this.nextButton.addEventListener('click', () => handlers.next());
    buttons.append(map, this.nextButton);

    this.panel.append(head, buttons, this.note);
    this.root.append(this.panel);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /**
   * Show the card: it rises in after `enterMs` (with the board's bloom) and takes taps and focus
   * from `readyMs` (once the fireflies lift off), so a tap where the moves were, or a second key
   * press, can't skip the garden mid-celebration.
   */
  show(view: CompleteView, enterMs = 0, readyMs = enterMs): void {
    this.root.style.setProperty('--ff-complete-delay', `${enterMs}ms`);
    this.clearWait();
    this.panel.inert = readyMs > 0;
    if (readyMs > 0) {
      this.readyTimer = setTimeout(() => {
        this.readyTimer = null;
        this.panel.inert = false;
        if (this.focusWanted) this.focus();
      }, readyMs);
    }
    this.sub.textContent = view.sub;
    this.chipText.textContent = `+${view.coins}`;
    this.chipSr.textContent = `${view.coins} coins earned`;
    this.nextButton.hidden = !view.more;
    this.nextText.textContent = view.nextLabel ?? 'Next garden';
    this.note.textContent = view.more ? '' : 'You lit every garden in this build.';
    this.note.hidden = view.more;
    this.root.dataset.more = String(view.more);
    this.root.hidden = false;
    // Replay the entrance (the coin chip rises) each time a garden is solved.
    this.root.classList.remove('ff-enter');
    void this.root.offsetWidth;
    this.root.classList.add('ff-enter');
  }

  hide(): void {
    this.root.hidden = true;
    this.clearWait();
    this.panel.inert = false;
  }

  private clearWait(): void {
    if (this.readyTimer !== null) clearTimeout(this.readyTimer);
    this.readyTimer = null;
    this.focusWanted = false;
  }

  /** The +coins chip's centre (viewport pixels), or null while it isn't laid out. */
  chipCenter(): { x: number; y: number } | null {
    const r = this.chip.getBoundingClientRect();
    return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }

  /** Focus Next, or Garden map on the last garden. */
  focus(): void {
    if (this.panel.inert) {
      this.focusWanted = true;
      return;
    }
    this.focusWanted = false;
    (this.nextButton.hidden ? this.mapButton : this.nextButton).focus({ preventScroll: true });
  }
}
