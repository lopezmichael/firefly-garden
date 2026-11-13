import { drawScenery } from '../view/art/scenery.ts';
import { hillsFor, mapLayout, segmentPoints } from '../view/layout.ts';
import type { MapSegment, Point } from '../view/layout.ts';
import type { Palette } from '../view/theme.ts';
import { FIREFLY_SVG } from './flight.ts';
import { coin, icon, moon } from './icons.ts';

/**
 * The garden map (design canvas: "Garden map"): the area card with its progress,
 * the chapters as stops along a dotted ink path (glowing with a bush and roses,
 * current half-lit with a dashed gold ring and a hovering firefly, dark and
 * locked), the next area as a faded stop, Continue in seal red, and hills behind.
 * Fireflies circle every finished chapter; when a chapter is newly finished, one
 * firefly flies the path to the next stop, which lands with a gold ring. Under
 * reduced motion neither moves: the new stop simply appears lit. Text is set
 * with textContent; the drawing is built with DOM calls from computed numbers.
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
  /** Index of a newly finished chapter whose unlock flight plays now, or null. */
  readonly flyFrom: number | null;
  readonly motion: boolean;
}

export interface MapHandlers {
  continue(): void;
  settings(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Unlock flight timing: the firefly travels, then the stop it lands on rings gold. */
const FLIGHT = { delay: 500, travel: 2600, land: 900 } as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** An SVG element with numeric or constant attributes (never game or player text). */
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, className?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (className) e.setAttribute('class', className);
  return e;
}

const f = (n: number) => n.toFixed(1);
const pathOf = (segs: readonly MapSegment[]) =>
  segs.map((s, i) => `${i === 0 ? `M${f(s.from.x)} ${f(s.from.y)} ` : ''}C${f(s.c1.x)} ${f(s.c1.y)} ${f(s.c2.x)} ${f(s.c2.y)} ${f(s.to.x)} ${f(s.to.y)}`).join(' ');

/** A small firefly seen from above, facing up its path (for the orbits). */
function orbitFly(): SVGGElement {
  const g = svg('g');
  g.append(
    svg('circle', { r: 7 }, 'ff-mfly-glow'),
    svg('path', { d: 'M-1 -2 C-4 -6 -7 -4 -5.5 -2 Z M1 -2 C4 -6 7 -4 5.5 -2 Z' }, 'ff-mfly-wing'),
    svg('circle', { r: 2.6 }, 'ff-mfly-tail'),
    svg('circle', { cy: -3.4, r: 1.3 }, 'ff-mfly-head'),
  );
  return g;
}

/** The little bush on a stop, with `roses` roses. */
function bushlet(roses: number): SVGGElement {
  const g = svg('g');
  g.append(
    svg('circle', { cx: -8, cy: 4, r: 7 }, 'ff-mbush-lo'), svg('circle', { cx: 8, cy: 4, r: 7 }, 'ff-mbush-lo'),
    svg('circle', { cx: 0, cy: -2, r: 8 }, 'ff-mbush'),
    svg('path', { d: 'M-13 10 C-11 -4 -1 -12 9 -9 C14 -6 15 3 13 10' }, 'ff-mbush-line'),
  );
  for (const [x, y] of [[-8, -4], [5, -8], [9, 2]].slice(0, roses)) g.append(svg('circle', { cx: x!, cy: y!, r: 3.2 }, 'ff-mrose'));
  return g;
}

export class MapScreen {
  readonly root = el('section', 'ff-map');
  private readonly scene = el('canvas', 'ff-map-scene');
  private readonly coins = el('span');
  private readonly areaName = el('h2', 'ff-map-area');
  private readonly areaCount = el('span', 'ff-map-count');
  private readonly areaFill = el('div', 'ff-map-fill');
  private readonly field = el('div', 'ff-map-field');
  private readonly drawing = svg('svg', {}, 'ff-map-drawing');
  private readonly beds = el('ol', 'ff-map-beds');
  private readonly teaser = el('div', 'ff-map-teaser');
  private readonly continueButton = el('button', 'ff-map-continue');
  private readonly continueSub = el('span', 'ff-map-continue-sub');
  private readonly continueLabel = el('span');
  private view: MapView | null = null;
  private frame = 0;
  private flight: Animation | null = null;
  private flightTimer: ReturnType<typeof setTimeout> | null = null;
  /** The unlock flight has started for this open: a redraw (a resize) must never replay it. */
  private flown = false;

  constructor(handlers: MapHandlers, private readonly palette: Palette) {
    this.root.setAttribute('aria-labelledby', 'ff-map-title');
    this.root.hidden = true;
    const sky = el('div', 'ff-map-sky');
    sky.setAttribute('aria-hidden', 'true');
    sky.append(this.scene, moon());

    const top = el('header', 'ff-map-top');
    const title = el('h1', 'ff-map-title', 'Firefly Garden');
    title.id = 'ff-map-title';
    const coinBox = el('div', 'ff-coins');
    coinBox.append(coin(), this.coins);
    const gear = el('button', 'ff-gear');
    gear.type = 'button';
    gear.setAttribute('aria-label', 'Settings');
    gear.append(icon('settings'));
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

    this.drawing.setAttribute('aria-hidden', 'true');
    this.beds.setAttribute('aria-label', 'Chapters');
    this.teaser.append(el('strong', undefined, 'The Orchard'), el('span', undefined, 'More gardens soon'));
    this.field.append(this.drawing, this.beds, this.teaser);

    this.continueButton.type = 'button';
    this.continueButton.append(this.continueLabel, this.continueSub);
    this.continueButton.addEventListener('click', () => handlers.continue());

    this.root.append(sky, top, card, this.field, this.continueButton);
    const watch = new ResizeObserver(() => this.queue());
    watch.observe(this.root);
    watch.observe(this.field);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(view: MapView): void {
    this.view = view;
    this.coins.textContent = String(view.coins);
    this.areaName.textContent = `The ${view.area}`;
    this.areaCount.textContent = `${view.solved} of ${view.total}`;
    this.areaFill.style.width = `${view.total === 0 ? 0 : Math.round((view.solved / view.total) * 100)}%`;
    this.beds.replaceChildren(...view.beds.map((b) => {
      const li = el('li', 'ff-map-bed');
      li.dataset.state = b.state;
      const what = b.state === 'done' ? `${b.solved} of ${b.total} glowing`
        : b.state === 'now' ? `${b.solved} of ${b.total} · you are here` : 'Still dark';
      li.append(el('strong', undefined, b.title), el('span', undefined, what));
      return li;
    }));
    this.continueLabel.textContent = view.continueLabel;
    this.continueSub.textContent = view.continueSub;
    this.continueButton.disabled = view.finished;
    this.root.hidden = false;
    this.root.dataset.motion = view.motion ? 'full' : 'reduced';
    this.continueButton.focus({ preventScroll: true });
    this.stopFlight();
    this.flown = false;
    this.queue();
  }

  /** The motion setting changed while the map is open: orbits follow it, and a flight stops at once. */
  setMotion(on: boolean): void {
    this.root.dataset.motion = on ? 'full' : 'reduced';
    if (!on) this.stopFlight();
  }

  hide(): void {
    this.root.hidden = true;
    this.stopFlight();
  }

  private queue(): void {
    if (this.frame || this.root.hidden) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** Lay out and draw the path, stops, labels and scenery for the current size. */
  private draw(): void {
    const view = this.view;
    if (!view || this.root.hidden) return;
    const w = this.field.clientWidth, h = this.field.clientHeight;
    if (w < 1 || h < 1) return;
    const layout = mapLayout(view.beds.length + 1, w, 44, Math.max(88, h - 36));
    this.drawing.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.drawing.setAttribute('width', String(w));
    this.drawing.setAttribute('height', String(h));
    const parts: SVGElement[] = [svg('path', { d: pathOf(layout.segments) }, 'ff-map-path')];
    view.beds.forEach((b, i) => {
      const p = layout.stops[i]!;
      const g = svg('g', { transform: `translate(${p.x} ${p.y})` }, `ff-mstop ff-mstop-${b.state}`);
      if (b.state === 'done') g.append(svg('circle', { r: 40 }, 'ff-mstop-glow'));
      g.append(svg('circle', { r: 31 }, 'ff-mstop-ring'), svg('circle', { r: 25 }, 'ff-mstop-inner'));
      if (b.state === 'now') g.append(svg('path', { d: 'M-25 2 a25 25 0 0 0 50 0 Z' }, 'ff-mstop-half'));
      if (b.state === 'dark') {
        const lock = icon('locked');
        for (const [k, v] of [['x', -9], ['y', -11], ['width', 18], ['height', 18]] as const) lock.setAttribute(k, String(v));
        lock.setAttribute('class', 'ff-icon ff-mstop-lock');
        g.append(lock);
      } else {
        g.append(bushlet(b.state === 'done' ? 3 : 1));
      }
      if (b.state === 'now') g.append(svg('circle', { r: 38 }, 'ff-mstop-dash'));
      parts.push(g);
      if (b.state === 'done') parts.push(...this.orbits(p));
      if (b.state === 'now') parts.push(this.hover(p));
    });
    const t = layout.stops[view.beds.length]!;
    parts.push(svg('circle', { cx: t.x, cy: t.y, r: 20 }, 'ff-mstop-teaser'));
    this.drawing.replaceChildren(...parts);
    // Labels on the open side of each stop.
    [...this.beds.children].forEach((li, i) => {
      if (li instanceof HTMLElement) this.placeLabel(li, layout.stops[i]!, layout.labelRight[i]!, w);
    });
    this.placeLabel(this.teaser, t, layout.labelRight[view.beds.length]!, w);
    this.drawScene();
    if (view.flyFrom !== null && view.motion && !this.flown) {
      const seg = layout.segments[view.flyFrom];
      if (seg) {
        this.flown = true;
        this.fly(seg);
      }
    }
  }

  private placeLabel(node: HTMLElement, p: Point, right: boolean, w: number): void {
    node.style.top = `${Math.round(p.y - 24)}px`;
    node.style.left = right ? `${Math.round(p.x + 44)}px` : '';
    node.style.right = right ? '' : `${Math.round(w - p.x + 44)}px`;
  }

  /** Two rings of fireflies circling a finished stop, heads along their path, at different speeds. */
  private orbits(p: Point): SVGGElement[] {
    return [[46, 0, 200, 'ff-morbit'], [40, 110, 290, 'ff-morbit ff-morbit-2']].map(([r, a1, a2, cls]) => {
      const ring = svg('g', {}, cls as string);
      ring.style.transformOrigin = `${p.x}px ${p.y}px`;
      for (const a of [a1 as number, a2 as number]) {
        const fly = orbitFly();
        // On the circle at angle a, turned to face along it (clockwise).
        const rad = (a * Math.PI) / 180;
        fly.setAttribute('transform', `translate(${f(p.x + Math.cos(rad) * (r as number))} ${f(p.y + Math.sin(rad) * (r as number))}) rotate(${a + 180})`);
        ring.append(fly);
      }
      return ring;
    });
  }

  /** The current stop's firefly, hovering above it. */
  private hover(p: Point): SVGGElement {
    const g = svg('g', { transform: `translate(${p.x - 14} ${p.y - 68})` });
    const bob = svg('g', {}, 'ff-mhover');
    bob.append(
      svg('circle', { cx: 14, cy: 18, r: 16 }, 'ff-mfly-glow'),
      svg('path', { d: 'M12 13 C7 7 3 10 5 13.5 C7 16 10 15.5 12 14.5 Z M16 13 C21 7 25 10 23 13.5 C21 16 18 15.5 16 14.5 Z' }, 'ff-mfly-wing'),
      svg('circle', { cx: 14, cy: 19, r: 4.6 }, 'ff-mfly-tail'),
      svg('circle', { cx: 14, cy: 12.6, r: 2.3 }, 'ff-mfly-head'),
    );
    g.append(bob);
    return g;
  }

  /** The unlock flight: one firefly along the path to the next stop, which rings gold as it lands. */
  private fly(seg: MapSegment): void {
    const sprite = el('div', 'ff-flier ff-map-flier');
    sprite.setAttribute('aria-hidden', 'true');
    // Constant markup (firefly C), never game or player data.
    sprite.innerHTML = FIREFLY_SVG;
    this.field.append(sprite);
    const pts = segmentPoints(seg);
    const last = pts.length - 1;
    const frames = pts.map((p, i) => ({
      transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`,
      opacity: i === 0 ? 0 : i === last ? 0.9 : 1,
    }));
    this.flightTimer = setTimeout(() => {
      this.flightTimer = null;
      const anim = sprite.animate(frames, { duration: FLIGHT.travel, easing: 'ease-in-out', fill: 'forwards' });
      this.flight = anim;
      const done = () => {
        sprite.remove();
        if (this.flight === anim) this.flight = null;
      };
      anim.oncancel = done;
      anim.onfinish = () => {
        done();
        const ring = svg('circle', { cx: seg.to.x, cy: seg.to.y, r: 38 }, 'ff-mstop-land');
        this.drawing.append(ring);
        setTimeout(() => ring.remove(), FLIGHT.land + 100);
      };
    }, FLIGHT.delay);
  }

  private stopFlight(): void {
    if (this.flightTimer) clearTimeout(this.flightTimer);
    this.flightTimer = null;
    this.flight?.cancel();
    this.flight = null;
    this.field.querySelectorAll('.ff-map-flier').forEach((n) => n.remove());
  }

  /** Night, grain and hills behind the map, rising behind Continue. */
  private drawScene(): void {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const res = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(w * res), ch = Math.round(h * res);
    if (this.scene.width !== cw) this.scene.width = cw;
    if (this.scene.height !== ch) this.scene.height = ch;
    const ctx = this.scene.getContext('2d');
    if (!ctx) return;
    const o = this.root.getBoundingClientRect(), r = this.continueButton.getBoundingClientRect();
    const card = { left: r.left - o.left, top: r.top - o.top, right: r.right - o.left, bottom: r.bottom - o.top };
    ctx.setTransform(res, 0, 0, res, 0, 0);
    drawScenery(ctx, this.palette.css, w, h, { ...hillsFor('tall', w, h, card), motes: [] });
  }
}
