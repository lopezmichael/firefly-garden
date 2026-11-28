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
  /** "Chapter 1 complete", or "Every garden is glowing" for the build's ending. */
  readonly title: string;
  readonly line: string;
  /** Three figures under the line: "10" gardens grown, "9:24" in the garden, "2" hints used. */
  readonly stats: readonly [ChapterStat, ChapterStat, ChapterStat];
  /** Coins credited for the chapter (0: no chip). */
  readonly bonus: number;
  /** Offer the optional rewarded ad that doubles the bonus (only where rewarded ads exist). */
  readonly doubler: boolean;
  /** "Start chapter 2", or "See the garden map" after the last chapter. */
  readonly action: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface ChapterStat {
  readonly value: string;
  readonly label: string;
}

// Constant markup, never game or player data: the chapter's seal, a rose stamped in seal ink.
export const SEAL_SVG = '<svg viewBox="0 0 76 76" aria-hidden="true">'
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
  private readonly nums = [el('span', 'ff-chapter-num'), el('span', 'ff-chapter-num'), el('span', 'ff-chapter-num')] as const;
  private readonly labels = [el('span', 'ff-chapter-label'), el('span', 'ff-chapter-label'), el('span', 'ff-chapter-label')] as const;
  private readonly bonus = el('div', 'ff-chapter-bonus');
  private readonly bonusText = el('span');
  private readonly button = el('button', 'ff-chapter-go');
  /** The optional rewarded double, under the bonus: always secondary to the card's main button. */
  private readonly double = el('button', 'ff-chapter-double');
  private readonly buttonLabel = el('span');

  constructor(onGo: () => void, onDouble: () => void) {
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
    const stats = el('div', 'ff-chapter-stats');
    this.nums.forEach((num, k) => {
      const s = el('div', 'ff-chapter-stat');
      s.append(num, this.labels[k]!);
      stats.append(s);
    });
    this.bonus.append(coin(), this.bonusText);
    this.button.type = 'button';
    this.button.append(this.buttonLabel, icon('next'));
    this.button.addEventListener('click', () => onGo());
    this.double.type = 'button';
    this.double.append(icon('video'), el('span', undefined, 'Watch a video to double it'));
    this.double.addEventListener('click', () => onDouble());
    // A modal: Tab and Shift+Tab move between its buttons and never leave it.
    this.card.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const live = [this.double, this.button].filter((b) => !b.hidden && !b.disabled);
      const at = live.indexOf(document.activeElement as HTMLButtonElement);
      live[(at + (e.shiftKey ? -1 : 1) + live.length) % live.length]?.focus({ preventScroll: true });
    });
    this.card.append(seal, this.title, this.line, stats, this.bonus, this.double, this.button);
    this.root.append(scrim, this.card);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(view: ChapterCardView): void {
    this.title.textContent = view.title;
    this.line.textContent = view.line;
    view.stats.forEach((st, k) => {
      this.nums[k]!.textContent = st.value;
      this.labels[k]!.textContent = st.label;
    });
    this.bonus.hidden = view.bonus <= 0;
    this.bonusText.textContent = `+${view.bonus} chapter bonus`;
    this.double.hidden = !view.doubler;
    this.double.disabled = false;
    this.button.disabled = false;
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

  /** The double's ad is playing (the button waits) or came back without finishing (offer it again). */
  doubling(on: boolean): void {
    // Both wait while the ad plays: nothing on the card may start the next garden under it.
    this.double.disabled = on;
    this.button.disabled = on;
  }

  /** The double paid: the chip shows the new total and the offer goes (and a coins figure, if shown, catches up). */
  doubled(total: number, coins: number): void {
    this.bonusText.textContent = `+${total} chapter bonus`;
    this.labels.forEach((label, k) => {
      if (label.textContent === 'coins saved') this.nums[k]!.textContent = String(coins);
    });
    this.double.hidden = true;
    this.button.disabled = false;
    this.button.focus({ preventScroll: true });
  }
}
