/**
 * The garden map (design baseline: Map artboard): the area's progress, one bed
 * per chapter (glowing, in progress, still dark), the next area as a teaser,
 * and Continue. A screen over the play screen; text is set with textContent.
 */

export interface BedView {
  readonly title: string;
  readonly solved: number;
  readonly total: number;
  readonly state: 'done' | 'now' | 'dark';
}

export interface MapView {
  readonly area: string;
  readonly solved: number;
  readonly total: number;
  readonly beds: readonly BedView[];
  readonly coins: number;
  readonly continueLabel: string;
  readonly continueSub: string;
  readonly finished: boolean;
}

export interface MapHandlers {
  continue(): void;
  settings(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class MapScreen {
  readonly root = el('section', 'ff-map');
  private readonly coins = el('span');
  private readonly areaName = el('h2', 'ff-map-area');
  private readonly areaCount = el('span', 'ff-map-count');
  private readonly areaFill = el('div', 'ff-map-fill');
  private readonly beds = el('ol', 'ff-map-beds');
  private readonly continueButton = el('button', 'ff-map-continue');
  private readonly continueSub = el('span', 'ff-map-continue-sub');
  private readonly continueLabel = el('span');

  constructor(handlers: MapHandlers) {
    this.root.setAttribute('aria-labelledby', 'ff-map-title');
    this.root.hidden = true;
    const top = el('header', 'ff-map-top');
    const title = el('h1', 'ff-map-title', 'Firefly Garden');
    title.id = 'ff-map-title';
    const coinBox = el('div', 'ff-coins');
    coinBox.append(el('span', 'ff-coin'), this.coins);
    const gear = el('button', 'ff-gear');
    gear.type = 'button';
    gear.setAttribute('aria-label', 'Settings');
    // Same cog as the play screen's settings button (constant markup, never game data).
    gear.innerHTML = '<svg class="ff-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"></path></svg>';
    gear.addEventListener('click', () => handlers.settings());
    const right = el('div', 'ff-map-top-right');
    right.append(coinBox, gear);
    top.append(title, right);

    const card = el('div', 'ff-map-card');
    const head = el('div', 'ff-map-card-head');
    head.append(this.areaName, this.areaCount);
    const bar = el('div', 'ff-map-bar');
    bar.append(this.areaFill);
    card.append(head, bar, el('p', 'ff-map-note', 'Each garden you light brings more roses back.'));

    this.beds.setAttribute('aria-label', 'Chapters');
    const teaser = el('div', 'ff-map-teaser');
    teaser.append(el('strong', undefined, 'The Orchard'), el('span', undefined, 'More gardens soon'));

    this.continueButton.type = 'button';
    this.continueButton.append(this.continueLabel, this.continueSub);
    this.continueButton.addEventListener('click', () => handlers.continue());

    this.root.append(top, card, this.beds, teaser, this.continueButton);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(view: MapView): void {
    this.coins.textContent = String(view.coins);
    this.areaName.textContent = `The ${view.area}`;
    this.areaCount.textContent = `${view.solved} of ${view.total}`;
    this.areaFill.style.width = `${view.total === 0 ? 0 : Math.round((view.solved / view.total) * 100)}%`;
    this.beds.replaceChildren(...view.beds.map((b) => {
      const li = el('li', 'ff-map-bed');
      li.dataset.state = b.state;
      const patch = el('span', 'ff-map-patch');
      patch.setAttribute('aria-hidden', 'true');
      const text = el('span', 'ff-map-bed-text');
      const what = b.state === 'done' ? `${b.solved} of ${b.total} glowing`
        : b.state === 'now' ? `${b.solved} of ${b.total} · you are here` : 'Still dark';
      text.append(el('strong', undefined, b.title), el('span', undefined, what));
      li.append(patch, text);
      return li;
    }));
    this.continueLabel.textContent = view.continueLabel;
    this.continueSub.textContent = view.continueSub;
    this.continueButton.disabled = view.finished;
    this.root.hidden = false;
    this.continueButton.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.hidden = true;
  }
}
