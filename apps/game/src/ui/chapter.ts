import { coin, icon } from './icons.ts';

/**
 * The chapter card (flow plan B; design canvas "Chapter finished: two taps, into the map
 * world"): paper over the dimmed map once the board has shrunk into its stop. A red ink seal,
 * "Chapter 1 complete", a line about the chapter, its totals, the chapter bonus, and one
 * button: Start chapter 2 (or See the garden map after the build's last chapter). It is a
 * modal dialog: focus stays on its button, the map behind it is inert. Text is set with
 * textContent; the only markup is constant SVG.
 */

export interface ChapterCardView {
  /** "Chapter 1 complete". */
  readonly title: string;
  readonly line: string;
  readonly gardens: number;
  /** "9:24". */
  readonly time: string;
  readonly hints: number;
  /** Coins credited for the chapter (0: no chip). */
  readonly bonus: number;
  /** "Start chapter 2", or "See the garden map" after the last chapter. */
  readonly action: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Constant markup, never game or player data: the chapter's seal, a rose stamped in seal ink.
const SEAL_SVG = '<svg viewBox="0 0 76 76" aria-hidden="true">'
  + '<circle class="ff-seal-disc" cx="38" cy="38" r="33"></circle>'
  + '<circle class="ff-seal-rim" cx="38" cy="38" r="27"></circle>'
  + '<path class="ff-seal-rose" d="M38 38 m-3 0 a4.5 4.5 0 1 1 7.5 3.6 a9 9 0 1 1 -13.8 -7.8 a13.8 13.8 0 1 1 20.4 13.2"></path>'
  + '<circle class="ff-seal-fleck" cx="21" cy="22" r="1.6"></circle><circle class="ff-seal-fleck" cx="56" cy="57" r="1.2"></circle>'
  + '</svg>';

export class ChapterCard {
  /** The scrim and the card; sits over the map. */
  readonly root = el('div', 'ff-chapter-layer');
  private readonly card = el('section', 'ff-chapter-card');
  private readonly title = el('h2', 'ff-chapter-title');
  private readonly line = el('p', 'ff-chapter-line');
  private readonly gardens = el('span', 'ff-chapter-num');
  private readonly time = el('span', 'ff-chapter-num');
  private readonly hints = el('span', 'ff-chapter-num');
  private readonly bonus = el('div', 'ff-chapter-bonus');
  private readonly bonusText = el('span');
  private readonly button = el('button', 'ff-chapter-go');
  private readonly buttonLabel = el('span');

  constructor(onGo: () => void) {
    this.root.hidden = true;
    const scrim = el('div', 'ff-chapter-scrim');
    scrim.setAttribute('aria-hidden', 'true');
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.card.setAttribute('aria-labelledby', 'ff-chapter-title');
    this.card.setAttribute('aria-describedby', 'ff-chapter-line');
    this.title.id = 'ff-chapter-title';
    this.line.id = 'ff-chapter-line';
    const seal = el('div', 'ff-chapter-seal');
    seal.innerHTML = SEAL_SVG;
    const stat = (num: HTMLElement, label: string) => {
      const s = el('div', 'ff-chapter-stat');
      s.append(num, el('span', 'ff-chapter-label', label));
      return s;
    };
    const stats = el('div', 'ff-chapter-stats');
    stats.append(stat(this.gardens, 'gardens grown'), stat(this.time, 'in the garden'), stat(this.hints, 'hints used'));
    this.bonus.append(coin(), this.bonusText);
    this.button.type = 'button';
    this.button.append(this.buttonLabel, icon('next'));
    this.button.addEventListener('click', () => onGo());
    // A modal with one action: Tab and Shift+Tab stay on it.
    this.card.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.button.focus({ preventScroll: true });
      }
    });
    this.card.append(seal, this.title, this.line, stats, this.bonus, this.button);
    this.root.append(scrim, this.card);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(view: ChapterCardView): void {
    this.title.textContent = view.title;
    this.line.textContent = view.line;
    this.gardens.textContent = String(view.gardens);
    this.time.textContent = view.time;
    this.hints.textContent = String(view.hints);
    this.bonus.hidden = view.bonus <= 0;
    this.bonusText.textContent = `+${view.bonus} chapter bonus`;
    this.buttonLabel.textContent = view.action;
    this.root.hidden = false;
    // Replay the entrance each time.
    this.root.classList.remove('ff-enter');
    void this.root.offsetWidth;
    this.root.classList.add('ff-enter');
    this.button.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
  }
}
