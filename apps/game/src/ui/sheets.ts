import type { MotionSetting } from '../state/save.ts';
import { coin, icon } from './icons.ts';
import type { IconName } from './icons.ts';

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

/** A settings section heading with its icon. */
function sectionTitle(name: IconName, text: string): HTMLHeadingElement {
  const h = el('h3', 'ff-section-title');
  h.append(icon(name), document.createTextNode(text));
  return h;
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

  private wasInert = new Map<HTMLElement, boolean>();

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  protected show(focus: HTMLElement): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.backdrop.hidden = false;
    // Remember what was inert already (the board under the home screen or the map), to give it back.
    this.wasInert = new Map(this.background().map((el) => [el, el.inert]));
    for (const el of this.wasInert.keys()) el.inert = true;
    document.addEventListener('keydown', this.onKey);
    focus.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.backdrop.hidden = true;
    for (const [el, was] of this.wasInert) el.inert = was;
    this.wasInert = new Map();
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
    const title = el('h2', 'ff-sheet-title', 'Use a hint');
    title.id = 'ff-hint-title';
    // The hint's mark: firefly with a dashed seal-red ring, as on the board's hint firefly.
    const badge = el('span', 'ff-sheet-badge');
    badge.append(icon('hint'));
    head.append(badge, title);
    const sub = el('p', 'ff-sheet-sub', "A hint places one firefly that's sure to be right, or lifts one that can't stay. Hint fireflies are locked in place.");

    this.primary = button('ff-sheet-primary', '', () => this.pick('pay'));
    this.ad = button('ff-sheet-ad', 'Watch a video for 3 hints', () => this.pick('ad'));
    this.ad.prepend(icon('video'));
    this.decline = button('ff-sheet-link', 'No thanks', () => this.pick(null));
    this.panel.append(head, sub, this.wallet, this.primary, this.ad, this.note, this.decline);
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
      cost.append(coin(), this.primaryCost);
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
  readonly sound: boolean;
  readonly motion: MotionSetting;
  readonly played: number;
  readonly solved: number;
  readonly hints: number;
  /** Anything to carry in a garden code yet (a garden played or solved). */
  readonly canCarry: boolean;
  /** This browser can make and read garden codes (CompressionStream). */
  readonly codes: boolean;
}

/** A garden in a few figures, for the garden code's confirmation. */
export interface GardenSummary {
  readonly solved: number;
  readonly coins: number;
}

export type CodeCheck =
  | { readonly ok: true; readonly here: GardenSummary; readonly there: GardenSummary }
  | { readonly ok: false; readonly message: string };

export interface SettingsHandlers {
  sound(on: boolean): void;
  motion(m: MotionSetting): void;
  copyLog(): Promise<boolean>;
  /** This garden as a code, and whether it reached the clipboard (null: no code could be made). */
  copyCode(): Promise<{ readonly code: string; readonly copied: boolean } | null>;
  /** Read a pasted code (nothing changes yet). */
  checkCode(text: string): Promise<CodeCheck>;
  /** Replace this device's garden with the last code that checked out; false if storage refused (else the game reloads). */
  useCode(): Promise<boolean>;
  /** Drop a checked code (the sheet closed, or the text changed). */
  forgetCode(): void;
}

const gardens = (g: GardenSummary) => `${plural(g.solved, 'garden', 'gardens')} grown, ${plural(g.coins, 'coin', 'coins')}`;

const MOTION: readonly [MotionSetting, string][] = [['device', 'Device'], ['on', 'On'], ['off', 'Off']];
const SOUND: readonly [boolean, string][] = [[true, 'On'], [false, 'Off']];

export class SettingsSheet extends Sheet {
  private readonly motionButtons = new Map<MotionSetting, HTMLButtonElement>();
  private readonly soundButtons = new Map<boolean, HTMLButtonElement>();
  private readonly summary = el('p', 'ff-sheet-line');
  private readonly copy: HTMLButtonElement;
  /** The garden code: copy this garden's, or paste another device's and confirm. */
  private readonly codeCopy: HTMLButtonElement;
  private readonly codeEnter: HTMLButtonElement;
  private readonly codeShown = el('textarea', 'ff-code-text');
  private readonly codeForm = el('div', 'ff-code-form');
  private readonly codeInput = el('textarea', 'ff-code-text');
  private readonly codeCheck: HTMLButtonElement;
  private readonly codeNote = el('p', 'ff-sheet-note');
  private readonly codeConfirm = el('div', 'ff-code-form');
  private readonly codeConfirmLine = el('p', 'ff-sheet-sub');
  private readonly codeUse: HTMLButtonElement;
  private codeBusy = false;
  /** Bumped whenever the sheet opens, closes or the pasted text changes: a check that comes back late is dropped. */
  private codeGen = 0;

  constructor(private readonly handlers: SettingsHandlers) {
    super('ff-settings-title');
    const title = el('h2', 'ff-sheet-title', 'Settings');
    title.id = 'ff-settings-title';

    const sound = el('section', 'ff-section');
    sound.append(sectionTitle('sound', 'Sound'));
    const soundGroup = el('div', 'ff-segments');
    soundGroup.setAttribute('role', 'radiogroup');
    soundGroup.setAttribute('aria-label', 'Sound');
    for (const [value, label] of SOUND) {
      const b = button('ff-segment', label, () => {
        this.handlers.sound(value);
        this.setSound(value);
      });
      b.setAttribute('role', 'radio');
      this.soundButtons.set(value, b);
      soundGroup.append(b);
    }
    sound.append(soundGroup);

    const motion = el('section', 'ff-section');
    motion.append(sectionTitle('motion', 'Reduce motion'),
      el('p', 'ff-sheet-sub', 'Keeps every change you make, drops the drifting, bobbing and flying.'));
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
    log.append(sectionTitle('log', 'Play log'), this.summary,
      el('p', 'ff-sheet-sub', 'Helping us test? Copy your play log and send it back. It holds level ids, times and counts, nothing about you, and it never leaves this device unless you send it.'),
      this.copy);

    const code = el('section', 'ff-section');
    this.codeCopy = button('ff-sheet-ad', 'Copy my garden code', () => void this.copyCode());
    this.codeEnter = button('ff-sheet-quiet', 'Enter a garden code', () => this.openCodeForm());
    this.codeShown.readOnly = true;
    this.codeShown.rows = 3;
    this.codeShown.hidden = true;
    this.codeShown.setAttribute('aria-label', 'Your garden code');
    // setSelectionRange: select() on a read-only field is unreliable on iOS.
    this.codeShown.addEventListener('focus', () => this.codeShown.setSelectionRange(0, this.codeShown.value.length));
    this.codeInput.rows = 3;
    this.codeInput.classList.add('ff-code-input');
    this.codeInput.placeholder = 'FG1.…';
    this.codeInput.spellcheck = false;
    this.codeInput.autocomplete = 'off';
    this.codeInput.setAttribute('autocapitalize', 'off');
    this.codeInput.setAttribute('aria-label', 'Garden code');
    this.codeInput.addEventListener('input', () => this.resetCodeCheck());
    this.codeCheck = button('ff-sheet-quiet', 'Open this garden', () => void this.checkCode());
    // Always rendered (an empty note takes no room): a live region shown from hidden is often not announced.
    this.codeNote.classList.add('ff-code-note');
    this.codeNote.setAttribute('role', 'status');
    this.codeUse = button('ff-sheet-primary', 'Replace my garden', () => void this.useCode());
    this.codeConfirm.append(this.codeConfirmLine, this.codeUse, button('ff-sheet-link', 'Keep my garden', () => this.resetCodeCheck()));
    this.codeForm.append(this.codeInput, this.codeCheck);
    code.append(sectionTitle('code', 'Garden code'),
      el('p', 'ff-sheet-sub', 'Playing on another device? Copy your garden code here and enter it there. Your gardens, coins and hints come with it.'),
      this.codeCopy, this.codeShown, this.codeEnter, this.codeForm, this.codeNote, this.codeConfirm);

    const rule = el('hr', 'ff-rule');
    rule.setAttribute('aria-hidden', 'true');
    const rule2 = el('hr', 'ff-rule');
    rule2.setAttribute('aria-hidden', 'true');
    this.panel.append(title, sound, motion, rule, code, rule2, log, button('ff-sheet-quiet', 'Done', () => this.close()));
  }

  override close(): void {
    // onClose belongs to the app (it resumes the clock), so the sheet's own cleanup lives here.
    if (this.isOpen) this.forgetCode();
    super.close();
  }

  /** Any check in flight is dropped, and a checked code is forgotten. */
  private forgetCode(): void {
    this.codeGen++;
    this.codeBusy = false;
    this.codeInput.readOnly = false;
    this.handlers.forgetCode();
  }

  private async copyCode(): Promise<void> {
    if (this.codeBusy) return;
    this.codeBusy = true;
    const gen = this.codeGen;
    let got: Awaited<ReturnType<SettingsHandlers['copyCode']>> = null;
    try {
      got = await this.handlers.copyCode();
    } finally {
      if (gen === this.codeGen) this.codeBusy = false;
    }
    if (gen !== this.codeGen) return;
    if (!got) {
      this.codeCopy.textContent = "Couldn't make a code. Try again?";
      return;
    }
    // Copied: say so. Refused (a portal's frame, permissions): show the code to copy by hand.
    this.codeCopy.textContent = got.copied ? 'Copied. Paste it on your other device' : 'Select the code below and copy it';
    this.codeShown.value = got.code;
    this.codeShown.hidden = got.copied;
    if (!got.copied) this.codeShown.focus({ preventScroll: true });
  }

  private openCodeForm(): void {
    this.codeEnter.hidden = true;
    this.codeForm.hidden = false;
    this.codeInput.focus({ preventScroll: true });
  }

  private resetCodeCheck(): void {
    const wasConfirming = !this.codeConfirm.hidden;
    this.forgetCode();
    this.codeConfirm.hidden = true;
    this.codeNote.textContent = '';
    this.codeCheck.hidden = false;
    if (wasConfirming) this.codeInput.focus({ preventScroll: true });
  }

  private async checkCode(): Promise<void> {
    if (this.codeBusy) return;
    this.codeBusy = true;
    const gen = ++this.codeGen;
    // The text can't change under a check (a result must match what's in the box).
    this.codeInput.readOnly = true;
    let r: CodeCheck;
    try {
      r = await this.handlers.checkCode(this.codeInput.value);
    } catch {
      r = { ok: false, message: "That code couldn't be read. Copy the whole code again." };
    }
    if (gen !== this.codeGen) return; // the sheet closed or reopened meanwhile
    this.codeBusy = false;
    this.codeInput.readOnly = false;
    if (!r.ok) {
      this.codeNote.textContent = r.message;
      return;
    }
    this.codeNote.textContent = '';
    this.codeCheck.hidden = true;
    const fewer = r.there.solved < r.here.solved ? ' That is fewer gardens than this device has.' : '';
    this.codeConfirmLine.textContent = `The code holds ${gardens(r.there)}. It replaces the garden on this device (${gardens(r.here)}).${fewer}`;
    this.codeConfirm.hidden = false;
    this.codeUse.focus({ preventScroll: true });
  }

  private async useCode(): Promise<void> {
    if (this.codeBusy) return;
    this.codeBusy = true;
    this.codeUse.disabled = true;
    this.codeUse.textContent = 'Opening your garden…';
    const gen = this.codeGen;
    const done = await this.handlers.useCode().catch(() => false);
    if (done || gen !== this.codeGen) return;
    // Storage refused the new garden: this one is untouched; say so and offer the button again.
    this.codeBusy = false;
    this.codeUse.disabled = false;
    this.codeUse.textContent = 'Replace my garden';
    this.codeNote.textContent = "This device couldn't save the new garden. Your garden here is unchanged.";
  }

  open(view: SettingsView): void {
    this.setSound(view.sound);
    this.setMotion(view.motion);
    this.summary.textContent = `${plural(view.played, 'garden played', 'gardens played')} · ${view.solved} solved · ${plural(view.hints, 'hint used', 'hints used')}`;
    this.copy.textContent = 'Copy play log';
    // A new player has nothing to carry yet (a code with no gardens would be refused on the other end).
    this.forgetCode();
    this.codeCopy.disabled = !view.canCarry || !view.codes;
    this.codeCopy.textContent = !view.codes ? "This browser can't make garden codes" : !view.canCarry ? 'Grow a garden first' : 'Copy my garden code';
    this.codeEnter.disabled = !view.codes;
    this.codeShown.hidden = true;
    this.codeShown.value = '';
    this.codeEnter.hidden = false;
    this.codeForm.hidden = true;
    this.codeInput.value = '';
    this.codeNote.textContent = '';
    this.codeConfirm.hidden = true;
    this.codeUse.disabled = false;
    this.codeUse.textContent = 'Replace my garden';
    this.show(this.soundButtons.get(view.sound)!);
  }

  private setSound(on: boolean): void {
    for (const [value, b] of this.soundButtons) b.setAttribute('aria-checked', String(value === on));
  }

  private setMotion(m: MotionSetting): void {
    for (const [value, b] of this.motionButtons) b.setAttribute('aria-checked', String(value === m));
  }

  private async copyLog(): Promise<void> {
    const ok = await this.handlers.copyLog();
    this.copy.textContent = ok ? 'Copied' : "Couldn't copy. Try again?";
  }
}
