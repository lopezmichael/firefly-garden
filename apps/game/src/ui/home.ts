import type { HomeWords } from '../state/home.ts';
import { HomeScene } from '../view/home/scene.ts';
import { homeFit } from '../view/layout.ts';
import type { HomeFit } from '../view/layout.ts';
import type { Palette } from '../view/theme.ts';
import { coin, icon } from './icons.ts';

/**
 * The home screen (docs/plans/2026-11-28-home-screen.md): shown on every launch, over everything.
 * The painted garden lives behind (`view/home/scene.ts`); over it, the title, Pip's caption
 * pointing at Pip, the coins, the big button that carries on, and the journal and settings. Text
 * is set with textContent; the only markup is constant SVG (the bubble, icons).
 */

export interface HomeView {
  readonly words: HomeWords;
  readonly coins: number;
  readonly motion: boolean;
}

export interface HomeHandlers {
  go(): void;
  journal(): void;
  settings(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Pip's speech bubble, one shape with its tail (so the tail always joins the box). */
const BUBBLE = { w: 222, h: 88, tipX: 220, tipY: 63, path: 'M20 2 H178 Q196 2 196 20 V44 Q204 52 220 63 Q204 62 196 59 V66 Q196 84 178 84 H20 Q2 84 2 66 V20 Q2 2 20 2 Z' } as const;
/** Where the tail points: Pip's mouth, in scene pixels. */
const PIP_MOUTH = { x: 214, y: 213 } as const;
/** The title's top in the scene, and the least room it keeps from the screen's top (the coins sit there). */
const TITLE = { sceneTop: 84, minTop: 56 } as const;
const EDGE = 8;
/** The panel beside the scene on a short, wide screen: the title's top, and the caption's place under it. */
const SPLIT = { titleTop: 22, sayBelow: 62, sayLeft: 2 } as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class HomeScreen {
  readonly root = el('section', 'ff-home');
  private readonly stage = el('div', 'ff-home-stage');
  private readonly ui = el('div', 'ff-home-ui');
  private readonly title = el('h1', 'ff-home-title', 'Firefly Garden');
  private readonly say = el('div', 'ff-home-say');
  private readonly sayTitle = el('p', 'ff-home-say-title');
  private readonly sayLine = el('p', 'ff-home-say-line');
  private readonly coins = el('span', 'ff-home-coins-n');
  private readonly coinPill = el('div', 'ff-home-coins');
  private readonly go = el('button', 'ff-home-go');
  private readonly goLabel = el('span', 'ff-home-go-label');
  private readonly goSub = el('span', 'ff-home-go-sub');
  private scene: HomeScene | null = null;
  /** Bumped by every show and hide, so a scene that finishes loading late is dropped. */
  private generation = 0;
  /** The generation a scene is loading for, or -1. */
  private loading = -1;
  private motion = true;
  private fit: HomeFit | null = null;

  constructor(private readonly handlers: HomeHandlers, private readonly palette: Palette) {
    this.root.hidden = true;
    this.root.setAttribute('aria-labelledby', 'ff-home-title');
    this.title.id = 'ff-home-title';

    const bubble = document.createElementNS(SVG_NS, 'svg');
    bubble.setAttribute('viewBox', `0 0 ${BUBBLE.w} ${BUBBLE.h}`);
    bubble.setAttribute('aria-hidden', 'true');
    bubble.classList.add('ff-home-bubble');
    const shape = document.createElementNS(SVG_NS, 'path');
    shape.setAttribute('d', BUBBLE.path);
    bubble.append(shape);
    const words = el('div', 'ff-home-say-words');
    words.append(this.sayTitle, this.sayLine);
    this.say.append(bubble, words);
    // Pip's line changes with each launch; it is read once, as the screen opens.
    this.say.setAttribute('role', 'status');

    this.coinPill.append(coin(), this.coins);
    this.go.type = 'button';
    this.go.append(this.goLabel, this.goSub);
    this.go.addEventListener('click', () => this.handlers.go());
    const journal = this.iconButton('book', 'Garden journal', () => this.handlers.journal());
    const settings = this.iconButton('settings', 'Settings', () => this.handlers.settings());
    const actions = el('div', 'ff-home-actions');
    actions.append(this.go, journal, settings);
    this.ui.append(this.coinPill, this.title, this.say, actions);
    this.root.append(this.stage, this.ui);

    new ResizeObserver(() => { if (this.isOpen) this.layout(); }).observe(this.root);
    document.addEventListener('visibilitychange', () => this.scene?.setVisible(!document.hidden));
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Frames the scene has drawn (for tests: a still scene draws no more). */
  get frames(): number {
    return this.scene?.frames ?? 0;
  }

  show(view: HomeView): void {
    ++this.generation;
    this.motion = view.motion;
    this.sayTitle.textContent = view.words.title;
    this.sayLine.textContent = view.words.line;
    this.goLabel.textContent = view.words.go;
    this.goSub.textContent = view.words.sub;
    this.coins.textContent = String(view.coins);
    this.coinPill.setAttribute('aria-label', `${view.coins} coins`);
    this.root.hidden = false;
    this.layout();
    this.go.focus({ preventScroll: true });
  }

  /**
   * The garden appears when its two images have loaded; until then (or if they never do) the
   * screen works over the plain bands of night and meadow. Started from the first layout with a
   * size (a frame hidden at launch has none yet).
   */
  private startScene(fit: HomeFit): void {
    if (this.scene || this.loading === this.generation) return;
    const gen = this.loading = this.generation;
    HomeScene.create(this.stage, this.palette, fit, this.motion).then((scene) => {
      if (gen !== this.generation || !this.isOpen) { scene.destroy(); return; }
      this.scene = scene;
      scene.setMotion(this.motion);
      scene.setVisible(!document.hidden);
      if (this.fit) scene.resize(this.fit);
      this.root.dataset.scene = 'ready';
    }, (err: unknown) => {
      if (this.loading === gen) this.loading = -1;
      console.warn('The home garden could not be drawn:', err);
    });
  }

  hide(): void {
    this.generation++;
    this.root.hidden = true;
    delete this.root.dataset.scene;
    // The scene's WebGL context and textures go with it: the board needs the memory more.
    this.scene?.destroy();
    this.scene = null;
  }

  setMotion(on: boolean): void {
    this.motion = on;
    this.scene?.setMotion(on);
  }

  private iconButton(name: 'book' | 'settings', label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'ff-home-icon');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.append(icon(name));
    b.addEventListener('click', onClick);
    return b;
  }

  private layout(): void {
    const vw = this.root.clientWidth, vh = this.root.clientHeight;
    if (vw === 0 || vh === 0) return;
    const f = homeFit(vw, vh);
    this.fit = f;
    this.root.dataset.column = String(f.column);
    this.root.dataset.split = String(f.split);
    Object.assign(this.stage.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
    const left = f.chrome.x;
    Object.assign(this.ui.style, { left: `${left}px`, width: `${f.chrome.w}px` });
    this.root.style.setProperty('--ff-home-text', String(f.text));
    if (f.split) {
      // Beside the scene: the title at the panel's top, the caption under it with its tail
      // reaching back into the scene (towards Pip), the buttons at the foot.
      this.title.style.top = `${SPLIT.titleTop}px`;
      Object.assign(this.say.style, {
        left: `${SPLIT.sayLeft}px`, top: `${SPLIT.titleTop + SPLIT.sayBelow}px`,
        transformOrigin: `${BUBBLE.w - BUBBLE.tipX}px ${BUBBLE.tipY}px`, transform: `rotate(1.5deg) scale(${f.text.toFixed(3)})`,
      });
    } else {
      this.title.style.top = `${Math.max(TITLE.minTop, f.y + TITLE.sceneTop * f.k)}px`;
      // Pip's caption: the tail's tip on Pip's mouth, shrunk only if a narrow screen would cut it off.
      const tipX = f.x + PIP_MOUTH.x * f.k - left, tipY = f.y + PIP_MOUTH.y * f.k;
      const s = Math.min(f.text, (tipX - EDGE) / BUBBLE.tipX);
      Object.assign(this.say.style, {
        left: `${tipX - BUBBLE.tipX}px`, top: `${tipY - BUBBLE.tipY}px`,
        transformOrigin: `${BUBBLE.tipX}px ${BUBBLE.tipY}px`, transform: `rotate(-1.5deg) scale(${s.toFixed(3)})`,
      });
    }
    if (this.scene) this.scene.resize(f);
    else this.startScene(f);
  }
}
