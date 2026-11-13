// Pixi's CSP-safe shader path: our pages (and portals) forbid eval; this module replaces it.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { Board, Evaluation, Transform } from '@firefly/core';
import { fitBoard } from './layout.ts';
import type { BoardFit } from './layout.ts';
import type { Palette } from './theme.ts';
import { bushLayout, dotPositions, FACE_CENTER_Y, FLY_MOTION, outlinePolylines, pulse, ROSE_SLOTS, roseVariants, SWAY_ORIGIN, UNIT, WING_ROOT } from './art/geometry.ts';
import type { BushKind } from './art/geometry.ts';
import { drawBush, drawConflictTile, drawDarkTile, drawFlyBody, drawFlyGlow, drawFlyShadow, drawFlyWing, drawHintHalo, drawLitTile, drawRose, drawRuledCross } from './art/pieces.ts';
import type { FlyKind } from './art/pieces.ts';

/**
 * The PixiJS board: tiles, bushes, fireflies and hint marks, drawn in the
 * Phase 2 design's look (docs/design/phase-2/). It knows nothing about rules:
 * it draws a `BoardState` and reports taps as canonical cell indices, so the
 * level's on-screen rotation never leaks into game state, saves or events.
 */

export interface BoardState {
  readonly evaluation: Evaluation;
  readonly locked: ReadonlySet<number>;
  /** Cells a hint points at (dashed outline). */
  readonly because: ReadonlySet<number>;
  /** Cells a hint showed as "no firefly here". */
  readonly ruledOut: ReadonlySet<number>;
  readonly solved: boolean;
}

const TAU = Math.PI * 2;
const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

/** One cell size's firefly drawings, baked into the board's texture cache. */
interface FlyArt {
  readonly glow: Readonly<Record<FlyKind, Texture>>;
  readonly body: Readonly<Record<FlyKind, Texture>>;
  readonly wingL: Texture;
  readonly wingR: Texture;
  readonly shadow: Texture;
  readonly halo: Texture;
}

/**
 * Firefly C on a tile. Every part is a cell-sized sprite drawn in the canvas's
 * 84-unit tile space, so the root sits at the cell's top-left corner. Motion (all
 * dropped under reduced motion, the state stays): wings flap about their roots,
 * the body bobs, glow and shadow breathe, a conflict sways. The hint's halo and
 * seal stay still on the tile.
 */
class FlyView {
  readonly root = new Container();
  private readonly shadow: Sprite;
  private readonly halo: Sprite;
  private readonly body = new Container();
  private readonly glow: Sprite;
  private readonly wingL: Sprite;
  private readonly wingR: Sprite;
  private readonly core: Sprite;
  private readonly u: number;
  kind: FlyKind | null = null;
  phase: number;
  drop = 1;
  /** Milliseconds to stay invisible before dropping in (a firefly still flying from the jar). */
  wait = 0;

  constructor(private readonly size: number, private readonly art: FlyArt, phase: number) {
    this.phase = phase;
    this.u = size / UNIT;
    const full = (t: Texture) => {
      const sp = new Sprite(t);
      sp.width = sp.height = size;
      return sp;
    };
    /** A part that turns about `p` (units): anchored there, placed there. */
    const pivoted = (t: Texture, p: { x: number; y: number }) => {
      const sp = full(t);
      sp.anchor.set(p.x / UNIT, p.y / UNIT);
      sp.position.set(p.x * this.u, p.y * this.u);
      return sp;
    };
    this.shadow = pivoted(art.shadow, { x: 45, y: 68 });
    this.halo = full(art.halo);
    this.halo.visible = false;
    this.glow = full(art.glow.player);
    this.wingL = pivoted(art.wingL, WING_ROOT.left);
    this.wingR = pivoted(art.wingR, WING_ROOT.right);
    this.core = full(art.body.player);
    // The body turns about the sway origin, so its children are placed relative to it.
    this.body.pivot.set(SWAY_ORIGIN.x * this.u, SWAY_ORIGIN.y * this.u);
    this.body.position.set(SWAY_ORIGIN.x * this.u, SWAY_ORIGIN.y * this.u);
    this.body.addChild(this.glow, this.wingL, this.wingR, this.core);
    this.root.addChild(this.halo, this.shadow, this.body);
  }

  setKind(kind: FlyKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.glow.texture = this.art.glow[kind];
    this.core.texture = this.art.body[kind];
    this.halo.visible = kind === 'hint';
  }

  tick(t: number, motion: boolean, dt: number): void {
    if (this.wait > 0) {
      this.wait = motion ? this.wait - dt : 0;
      this.root.alpha = this.wait > 0 ? 0 : 1;
      if (this.wait > 0) return;
    }
    if (this.drop < 1) this.drop = motion ? Math.min(1, this.drop + dt / 480) : 1;
    const drop = (1 - easeOutBack(this.drop)) * -this.size * 0.8;
    const sway = SWAY_ORIGIN.y * this.u;
    if (!motion) {
      this.body.y = sway + drop;
      this.body.rotation = 0;
      this.body.scale.set(1);
      this.wingL.rotation = this.wingR.rotation = 0;
      this.glow.alpha = 1;
      this.shadow.scale.set(this.size / this.shadow.texture.width);
      this.shadow.alpha = 1;
      return;
    }
    const m = FLY_MOTION;
    const up = pulse(t, m.bobMs, this.phase);
    this.body.y = sway + drop - up * m.bobUnits * this.u;
    const flap = (pulse(t, m.flapMs, this.phase * 3) * m.flapDeg * Math.PI) / 180;
    this.wingL.rotation = -flap;
    this.wingR.rotation = flap;
    this.glow.alpha = 1 - 0.22 * up;
    const base = this.size / this.shadow.texture.width;
    this.shadow.scale.set(base * (1 - 0.2 * up));
    this.shadow.alpha = 1 - 0.33 * up;
    this.body.rotation = this.kind === 'conflict'
      ? (-Math.cos((2 * Math.PI * t) / m.swayMs + this.phase) * m.swayDeg * Math.PI) / 180 : 0;
    this.body.scale.set(this.drop < 1 ? 0.55 + 0.45 * Math.min(1, this.drop * 1.6) : 1);
  }
}

/** How a path tile is drawn: dark, lit, or lit under fireflies that see each other. */
type TileLook = 'dark' | 'lit' | 'conflict';

interface CellView {
  readonly cell: number;
  readonly root: Container;
  readonly kind: 'path' | 'bush' | 'void';
  /** Display row and column (after the level's on-screen rotation). */
  readonly dr: number;
  readonly dc: number;
  tile?: Sprite;
  look?: TileLook;
  fly?: FlyView;
  ruled?: Sprite;
  clue?: Text;
  pips?: Graphics;
  /** The bush drawing (swapped for the wilted one when it has too many). */
  bush?: Sprite;
  bushKind?: BushKind;
  /** The three roses a happy bush shows. */
  roses?: Container;
  bushKey?: string;
}

interface Ghost {
  readonly fly: FlyView;
  age: number;
}

export interface BoardViewOptions {
  readonly palette: Palette;
  readonly onTap: (cell: number) => void;
  readonly reducedMotion: boolean;
}

export class BoardView {
  private readonly app: Application;
  private readonly pal: Palette;
  private readonly onTap: (cell: number) => void;
  private motion: boolean;
  private readonly stage = new Container();
  private readonly cellsLayer = new Container();
  private readonly ghostLayer = new Container();
  /** The hint reason outline, one shape around every cell a hint names. */
  private readonly outline = new Graphics();
  private board: Board | null = null;
  private transform: Transform = 'identity';
  private fit: BoardFit | null = null;
  private art: FlyArt | null = null;
  private cells: CellView[] = [];
  private ghosts: Ghost[] = [];
  private textures = new Map<string, Texture>();
  private state: BoardState | null = null;
  private time = 0;
  private area = { w: 0, h: 0 };

  private constructor(app: Application, opts: BoardViewOptions) {
    this.app = app;
    this.pal = opts.palette;
    this.onTap = opts.onTap;
    this.motion = !opts.reducedMotion;
    this.stage.addChild(this.cellsLayer, this.outline, this.ghostLayer);
    app.stage.addChild(this.stage);
    app.ticker.add((ticker) => this.tick(ticker.deltaMS));
  }

  static async create(host: HTMLElement, opts: BoardViewOptions): Promise<BoardView> {
    const app = new Application();
    await app.init({
      width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight),
      backgroundAlpha: 0, antialias: true, autoDensity: true,
      resolution: Math.min(3, window.devicePixelRatio || 1),
      preference: 'webgl',
      hello: false,
    });
    app.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(app.canvas);
    return new BoardView(app, opts);
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  setReducedMotion(reduced: boolean): void {
    this.motion = !reduced;
  }

  setLevel(board: Board, transform: Transform): void {
    this.board = board;
    this.transform = transform;
    this.state = null;
    for (const g of this.ghosts) g.fly.root.destroy({ children: true });
    this.ghosts = [];
    this.build();
  }

  setTransform(transform: Transform): void {
    if (transform === this.transform || !this.board) return;
    this.transform = transform;
    this.build();
  }

  resize(w: number, h: number): void {
    if (w === this.area.w && h === this.area.h) return;
    this.area = { w, h };
    this.app.renderer.resize(Math.max(1, w), Math.max(1, h));
    this.build();
  }

  /** Display grid size for the current orientation. */
  private dims(): [cols: number, rows: number] {
    const b = this.board!;
    return this.transform === 'rot90' ? [b.h, b.w] : [b.w, b.h];
  }

  /** Display (row, col) → canonical cell index. */
  private canonical(dr: number, dc: number): number {
    const b = this.board!;
    return this.transform === 'rot90' ? (b.h - 1 - dc) * b.w + dr : dr * b.w + dc;
  }

  private texture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, px: number) => void): Texture {
    const res = Math.min(3, window.devicePixelRatio || 1);
    const k = `${key}:${size}:${res}`;
    let t = this.textures.get(k);
    if (!t) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = Math.ceil(size * res);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas unavailable');
      ctx.scale(res, res);
      draw(ctx, size);
      t = Texture.from(canvas);
      this.textures.set(k, t);
    }
    return t;
  }

  /** Free textures drawn for other cell sizes (resizes and folds would otherwise pile them up). */
  private pruneTextures(cell: number): void {
    const keep = new Set([`:${cell}:`, `:${this.roseSize(cell)}:`]);
    for (const [k, t] of this.textures) {
      if ([...keep].some((tag) => k.includes(tag))) continue;
      t.destroy(true);
      this.textures.delete(k);
    }
  }

  private tileTexture(cell: number, look: TileLook): Texture {
    const draw = look === 'lit' ? drawLitTile : look === 'conflict' ? drawConflictTile : drawDarkTile;
    return this.texture(`tile-${look}`, cell, (ctx) => draw(ctx, this.pal.css, cell));
  }

  private bushTexture(cell: number, kind: BushKind): Texture {
    return this.texture(`bush-${kind}`, cell, (ctx) => drawBush(ctx, this.pal.css, cell, kind));
  }

  /** Roses are drawn once at the largest slot size and scaled down for the smaller slots. */
  private roseSize(cell: number): number {
    return Math.max(6, Math.round((cell * Math.max(...ROSE_SLOTS.map((r) => r.size))) / UNIT));
  }

  private roseTexture(cell: number, variant: number): Texture {
    const px = this.roseSize(cell);
    return this.texture(`rose${variant}`, px, (ctx) => drawRose(ctx, this.pal.css, px, variant));
  }

  /** Every firefly part for one cell size (drawn once, then shared by all the cells). */
  private flyArt(cell: number): FlyArt {
    const c = this.pal.css;
    const kinds = ['player', 'hint', 'conflict'] as const;
    const per = (name: string, draw: (ctx: CanvasRenderingContext2D, kind: FlyKind) => void) =>
      Object.fromEntries(kinds.map((k) => [k, this.texture(`fly-${name}-${k}`, cell, (ctx) => draw(ctx, k))])) as Record<FlyKind, Texture>;
    return {
      glow: per('glow', (ctx, k) => drawFlyGlow(ctx, c, cell, k)),
      body: per('body', (ctx, k) => drawFlyBody(ctx, c, cell, k)),
      wingL: this.texture('fly-wing-l', cell, (ctx) => drawFlyWing(ctx, c, cell, 'left')),
      wingR: this.texture('fly-wing-r', cell, (ctx) => drawFlyWing(ctx, c, cell, 'right')),
      shadow: this.texture('fly-shadow', cell, (ctx) => drawFlyShadow(ctx, c, cell)),
      halo: this.texture('fly-halo', cell, (ctx) => drawHintHalo(ctx, c, cell)),
    };
  }

  private build(): void {
    this.cellsLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.cells = [];
    this.outline.clear();
    // Ghosts share the old size's textures, which the prune below frees: end them first.
    for (const g of this.ghosts) g.fly.root.destroy({ children: true });
    this.ghosts = [];
    if (!this.board || this.area.w < 10 || this.area.h < 10) return;
    const b = this.board;
    const [cols, rows] = this.dims();
    const fit = fitBoard(cols, rows, this.area.w, this.area.h);
    this.fit = fit;
    this.pruneTextures(fit.cell);
    const { cell, gap, pad } = fit;
    const u = cell / UNIT;
    this.stage.position.set(Math.round((this.area.w - fit.width) / 2), Math.round((this.area.h - fit.height) / 2));
    const art = this.flyArt(cell);
    this.art = art;
    for (let dr = 0; dr < rows; dr++) {
      for (let dc = 0; dc < cols; dc++) {
        const i = this.canonical(dr, dc);
        const kind = b.kind[i]!;
        const root = new Container();
        root.position.set(pad + dc * (cell + gap), pad + dr * (cell + gap));
        const v: CellView = { cell: i, dr, dc, root, kind: kind === 'path' ? 'path' : kind === 'void' ? 'void' : 'bush' };
        if (v.kind === 'path') {
          v.tile = new Sprite(this.tileTexture(cell, 'dark'));
          v.tile.width = v.tile.height = cell;
          v.look = 'dark';
          v.ruled = new Sprite(this.texture('ruled', cell, (ctx) => drawRuledCross(ctx, this.pal.css, cell)));
          v.ruled.width = v.ruled.height = cell;
          v.ruled.visible = false;
          v.fly = new FlyView(cell, art, ((dr * 7 + dc * 5) % 8) * 0.8);
          v.fly.root.visible = false;
          root.addChild(v.tile, v.ruled, v.fly.root);
          root.eventMode = 'static';
          root.cursor = 'pointer';
          root.hitArea = new Rectangle(-gap / 2, -gap / 2, cell + gap, cell + gap);
          root.on('pointertap', () => this.onTap(i));
        } else if (v.kind === 'bush') {
          const numbered = b.clue[i] !== null;
          v.bushKind = numbered ? 'numbered' : 'plain';
          v.bush = new Sprite(this.bushTexture(cell, v.bushKind));
          v.bush.width = v.bush.height = cell;
          root.addChild(v.bush);
          if (numbered) {
            v.roses = new Container();
            v.roses.visible = false;
            roseVariants(i).forEach((variant, k) => {
              const slot = ROSE_SLOTS[k]!;
              const rose = new Sprite(this.roseTexture(cell, variant));
              rose.position.set(slot.x * u, slot.y * u);
              rose.width = rose.height = slot.size * u;
              v.roses!.addChild(rose);
            });
            v.clue = new Text({
              text: String(b.clue[i]),
              style: { fontFamily: this.pal.fontDisplay, fontWeight: '400', fontSize: Math.round(30 * u), fill: this.pal.paper },
              resolution: Math.min(3, (window.devicePixelRatio || 1) * 1.5),
            });
            v.clue.anchor.set(0.5);
            v.clue.position.set(cell / 2, bushLayout('numbered').numberY * u);
            v.pips = new Graphics();
            root.addChild(v.roses, v.clue, v.pips);
          }
        }
        this.cellsLayer.addChild(root);
        this.cells.push(v);
      }
    }
    if (this.state) this.render(this.state, { quiet: true });
  }

  /**
   * Draw a position. `quiet` skips placement animations (resize, level load); `arriving`
   * is a cell whose firefly is still flying in from the jar, so it lands `arrivalMs` later.
   */
  render(state: BoardState, opts: { quiet?: boolean; removed?: number | null; arriving?: number | null; arrivalMs?: number } = {}): void {
    const prev = this.state;
    this.state = state;
    if (!this.board || !this.fit) return;
    const { cell } = this.fit;
    const u = cell / UNIT;
    const ev = state.evaluation;
    const flies = new Set(ev.fireflies);
    const conflicts = new Set(ev.conflicts);
    const bushes = new Map(ev.bushes.map((s) => [s.cell, s]));
    const prevFlies = prev ? new Set(prev.evaluation.fireflies) : flies;
    for (const v of this.cells) {
      if (v.kind === 'path') {
        const has = flies.has(v.cell);
        const look: TileLook = has && conflicts.has(v.cell) ? 'conflict' : (ev.lit[v.cell] ?? false) ? 'lit' : 'dark';
        if (look !== v.look) {
          v.tile!.texture = this.tileTexture(cell, look);
          v.look = look;
        }
        if (has) {
          v.fly!.setKind(conflicts.has(v.cell) ? 'conflict' : state.locked.has(v.cell) ? 'hint' : 'player');
          if (!v.fly!.root.visible) {
            v.fly!.root.visible = true;
            v.fly!.drop = opts.quiet || prevFlies.has(v.cell) ? 1 : 0;
            v.fly!.wait = opts.arriving === v.cell && !opts.quiet ? (opts.arrivalMs ?? 0) : 0;
            v.fly!.root.alpha = v.fly!.wait > 0 ? 0 : 1;
          }
        } else {
          v.fly!.root.visible = false;
        }
        v.ruled!.visible = state.ruledOut.has(v.cell) && !has;
      } else if (v.kind === 'bush' && v.clue && v.pips && v.bush && v.roses) {
        const s = bushes.get(v.cell);
        const want = s?.want ?? 0, have = s?.have ?? 0, st = s?.state ?? 'under';
        const key = `${have}:${st}`;
        if (key !== v.bushKey) {
          v.bushKey = key;
          // Too many: the bush wilts (shape) as well as turning the number and the extra dot warn (colour).
          const kind: BushKind = st === 'over' ? 'wilted' : 'numbered';
          if (kind !== v.bushKind) {
            v.bushKind = kind;
            v.bush.texture = this.bushTexture(cell, kind);
          }
          const { numberY, dotsY } = bushLayout(kind);
          v.clue.position.y = numberY * u;
          // Happy: the number turns gold and three roses open. A bush that wants none shows neither.
          v.clue.style.fill = st === 'over' ? this.pal.warn : st === 'met' && want > 0 ? this.pal.gold : this.pal.paper;
          v.roses.visible = st === 'met' && want > 0;
          // One dot per firefly wanted, filling gold one by one; with too many, the extras show in warn.
          v.pips.clear();
          dotPositions(Math.max(want, have), dotsY).forEach((d, k) => {
            const x = d.x * u, y = d.y * u;
            if (k < have) {
              v.pips!.circle(x, y, 3.6 * u).fill(k < want ? this.pal.gold : this.pal.warn).stroke({ width: Math.max(1, u), color: this.pal.sumi });
            } else {
              v.pips!.circle(x, y, 3.4 * u).stroke({ width: Math.max(1, 1.6 * u), color: this.pal.paper });
            }
          });
        }
      }
    }
    this.drawOutline(state.because);
    if (opts.removed !== undefined && opts.removed !== null) this.liftAway(opts.removed);
  }

  /** The dashed gold outline around the cells a hint names (one shape per touching group). */
  private drawOutline(because: ReadonlySet<number>): void {
    this.outline.clear();
    if (!this.fit || because.size === 0) return;
    const { cell } = this.fit;
    const u = cell / UNIT;
    const named = this.cells.filter((v) => because.has(v.cell)).map((v) => ({ r: v.dr, c: v.dc }));
    const dash = 6 * u, space = 4 * u;
    for (const line of outlinePolylines(named, this.fit, 8 * u)) dashed(this.outline, line, dash, space);
    this.outline.stroke({ width: Math.max(1.5, 2.6 * u), color: this.pal.gold, cap: 'round' });
  }

  /** A cell's centre in viewport pixels (for flights between the jar and the board). */
  cellScreenCenter(cell: number): { x: number; y: number } | null {
    const v = this.cells.find((c) => c.cell === cell);
    if (!v || !this.fit) return null;
    const r = this.app.canvas.getBoundingClientRect();
    const half = this.fit.cell / 2;
    return { x: r.left + this.stage.x + v.root.x + half, y: r.top + this.stage.y + v.root.y + FACE_CENTER_Y * (this.fit.cell / UNIT) };
  }

  private liftAway(cell: number): void {
    const v = this.cells.find((c) => c.cell === cell);
    if (!v || !this.fit || !this.motion) return;
    if (!this.art) return;
    const fly = new FlyView(this.fit.cell, this.art, 0);
    fly.setKind('conflict');
    fly.root.position.set(v.root.x, v.root.y);
    this.ghostLayer.addChild(fly.root);
    this.ghosts.push({ fly, age: 0 });
  }

  private tick(dt: number): void {
    this.time += dt;
    for (const v of this.cells) {
      if (v.fly?.root.visible) v.fly.tick(this.time, this.motion, dt);
    }
    // The reason outline breathes gently with motion on; still and full strength without.
    this.outline.alpha = this.motion ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((this.time / 1200) * TAU)) : 1;
    this.ghosts = this.ghosts.filter((g) => {
      g.age += dt;
      const t = Math.min(1, g.age / 1100);
      g.fly.root.y -= (dt / 1100) * (this.fit?.cell ?? 40) * 0.6;
      g.fly.root.alpha = 1 - t;
      g.fly.root.scale.set(1 - 0.3 * t);
      g.fly.tick(this.time, true, dt);
      if (t >= 1) {
        g.fly.root.destroy({ children: true });
        return false;
      }
      return true;
    });
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
    for (const t of this.textures.values()) t.destroy(true);
    this.textures.clear();
  }
}

/** Dash a flat [x0, y0, x1, y1, …] polyline into `g` (stroked by the caller). */
function dashed(g: Graphics, pts: readonly number[], dash: number, space: number): void {
  let on = true, left = dash;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    let x = pts[i]!, y = pts[i + 1]!;
    const x2 = pts[i + 2]!, y2 = pts[i + 3]!;
    let len = Math.hypot(x2 - x, y2 - y);
    while (len > 0) {
      const step = Math.min(left, len), t = step / len;
      const nx = x + (x2 - x) * t, ny = y + (y2 - y) * t;
      if (on) g.moveTo(x, y).lineTo(nx, ny);
      x = nx; y = ny; len -= step; left -= step;
      if (left <= 1e-9) { on = !on; left = on ? dash : space; }
    }
  }
}
