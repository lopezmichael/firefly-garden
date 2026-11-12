import type { MotionSetting } from '../state/save.ts';

/**
 * Bottom sheets over the play screen: the hint sheet and settings with the
 * play log (design baseline: HintDialog and Settings artboards). Real
 * dialogs: focus moves in, Escape and the backdrop close, focus returns to the
 * button that opened them. Text is set with textContent only.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

class Sheet {
  readonly backdrop = el('div', 'ff-backdrop');
  protected readonly panel = el('div', 'ff-sheet');
  private returnFocus: HTMLElement | null = null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };
  onClose: (() => void) | null = null;
  /** Everything behind the sheet: made inert while it is open, so focus and taps stay in the dialog. */
  background: () => readonly HTMLElement[] = () => [];

  constructor(labelId: string) {
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-labelledby', labelId);
    const handle = el('span', 'ff-sheet-handle');
    handle.setAttribute('aria-hidden', 'true');
    this.panel.append(handle);
    this.backdrop.append(this.panel);
    this.backdrop.hidden = true;
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  protected show(focus: HTMLElement): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.backdrop.hidden = false;
    for (const el of this.background()) el.inert = true;
    document.addEventListener('keydown', this.onKey);
    focus.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.backdrop.hidden = true;
    for (const el of this.background()) el.inert = false;
    document.removeEventListener('keydown', this.onKey);
    this.returnFocus?.focus({ preventScroll: true });
    this.onClose?.();
  }
}

export interface HintOffer {
  readonly bank: number;
  readonly coins: number;
  readonly cost: number;
  readonly rewardedAds: boolean;
  readonly coinsPerSolve: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export class HintSheet extends Sheet {
  private readonly wallet = el('p', 'ff-sheet-line');
  private readonly primary: HTMLButtonElement;
  private readonly primaryCost = el('span');
  private readonly ad: HTMLButtonElement;
  private readonly note = el('p', 'ff-sheet-note');
  private readonly decline: HTMLButtonElement;
  private choice: ((how: 'pay' | 'ad' | null) => void) | null = null;

  constructor() {
    super('ff-hint-title');
    const head = el('div', 'ff-sheet-head');
    const text = el('div', 'ff-sheet-text');
    const title = el('h2', 'ff-sheet-title', 'Use a hint');
    title.id = 'ff-hint-title';
    text.append(title, el('p', 'ff-sheet-sub', "A hint places one firefly that's sure to be right, or lifts one that can't stay. Hint fireflies are locked in place."));
    head.append(text);


    this.primary = button('ff-sheet-primary', '', () => this.pick('pay'));
    this.ad = button('ff-sheet-ad', 'Watch a video for 3 hints', () => this.pick('ad'));
    this.decline = button('ff-sheet-quiet', 'No thanks', () => this.pick(null));
    this.panel.append(head, this.wallet, this.primary, this.ad, this.note, this.decline);
    this.onClose = () => this.settle(null);
  }

  /** Resolves with the player's choice; nothing is charged here. */
  ask(offer: HintOffer): Promise<'pay' | 'ad' | null> {
    this.settle(null);
    this.wallet.textContent = `${plural(offer.coins, 'coin', 'coins')} · ${offer.bank === 0 ? 'no saved hints' : plural(offer.bank, 'saved hint', 'saved hints')}`;
    const canPay = offer.bank > 0 || offer.coins >= offer.cost;
    this.primary.replaceChildren(document.createTextNode(offer.bank > 0 ? 'Use a saved hint' : 'Use a hint'));
    if (offer.bank === 0) {
      const cost = el('span', 'ff-cost');
      cost.append(el('span', 'ff-coin'), this.primaryCost);
      this.primaryCost.textContent = String(offer.cost);
      this.primary.append(cost);
    }
    this.primary.disabled = !canPay;
    this.ad.hidden = !offer.rewardedAds;
    this.note.hidden = canPay;
    this.note.textContent = `Not enough coins yet. Solve a garden to earn ${offer.coinsPerSolve} more.`;
    this.show(canPay ? this.primary : this.decline);
    return new Promise((resolve) => {
      this.choice = resolve;
    });
  }

  private pick(how: 'pay' | 'ad' | null): void {
    const resolve = this.choice;
    this.choice = null;
    this.close();
    resolve?.(how);
  }

  private settle(how: null): void {
    const resolve = this.choice;
    this.choice = null;
    resolve?.(how);
  }
}

export interface SettingsView {
  readonly motion: MotionSetting;
  readonly played: number;
  readonly solved: number;
  readonly hints: number;
}

export interface SettingsHandlers {
  motion(m: MotionSetting): void;
  copyLog(): Promise<boolean>;
}

const MOTION: readonly [MotionSetting, string][] = [['device', 'Device'], ['on', 'On'], ['off', 'Off']];

export class SettingsSheet extends Sheet {
  private readonly motionButtons = new Map<MotionSetting, HTMLButtonElement>();
  private readonly summary = el('p', 'ff-sheet-line');
  private readonly copy: HTMLButtonElement;

  constructor(private readonly handlers: SettingsHandlers) {
    super('ff-settings-title');
    const title = el('h2', 'ff-sheet-title', 'Settings');
    title.id = 'ff-settings-title';

    const motion = el('section', 'ff-section');
    motion.append(el('h3', 'ff-section-title', 'Reduce motion'),
      el('p', 'ff-sheet-sub', 'Keeps every change you make, drops the drifting, bobbing and sparkles.'));
    const group = el('div', 'ff-segments');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Reduce motion');
    for (const [value, label] of MOTION) {
      const b = button('ff-segment', label, () => {
        this.handlers.motion(value);
        this.setMotion(value);
      });
      b.setAttribute('role', 'radio');
      this.motionButtons.set(value, b);
      group.append(b);
    }
    motion.append(group);

    const log = el('section', 'ff-section');
    this.copy = button('ff-sheet-ad', 'Copy play log', () => void this.copyLog());
    log.append(el('h3', 'ff-section-title', 'Play log'), this.summary,
      el('p', 'ff-sheet-sub', 'Helping us test? Copy your play log and send it back. It holds level ids, times and counts, nothing about you, and it never leaves this device unless you send it.'),
      this.copy);

    this.panel.append(title, motion, log, button('ff-sheet-quiet', 'Done', () => this.close()));
  }

  open(view: SettingsView): void {
    this.setMotion(view.motion);
    this.summary.textContent = `${plural(view.played, 'garden played', 'gardens played')} · ${view.solved} solved · ${plural(view.hints, 'hint used', 'hints used')}`;
    this.copy.textContent = 'Copy play log';
    this.show(this.motionButtons.get(view.motion)!);
  }

  private setMotion(m: MotionSetting): void {
    for (const [value, b] of this.motionButtons) b.setAttribute('aria-checked', String(value === m));
  }

  private async copyLog(): Promise<void> {
    const ok = await this.handlers.copyLog();
    this.copy.textContent = ok ? 'Copied' : "Couldn't copy. Try again?";
  }
}
