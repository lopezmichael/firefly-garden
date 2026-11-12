// Pixi's CSP-safe shader path: our pages (and portals) forbid eval; this module replaces it.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { Board, Evaluation, Transform } from '@firefly/core';
import { fitBoard } from './layout.ts';
import type { BoardFit } from './layout.ts';
import type { Palette } from './theme.ts';

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

type FlyKind = 'player' | 'hint' | 'conflict';

const TAU = Math.PI * 2;
/** Vertical squash standing in for the mockup's rotateX tilt. */
const TILT = 0.94;
const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

class FlyView {
  readonly root = new Container();
  private readonly shadow = new Graphics();
  private readonly halo: Sprite;
  private readonly body = new Container();
  private readonly wingL = new Graphics();
  private readonly wingR = new Graphics();
  private readonly core = new Graphics();
  private readonly ring = new Graphics();
  private readonly sparkle = new Graphics();
  kind: FlyKind | null = null;
  phase: number;
  drop = 1;

  constructor(private readonly size: number, private readonly pal: Palette, haloTex: Texture, phase: number) {
    this.phase = phase;
    this.halo = new Sprite(haloTex);
    this.halo.anchor.set(0.5);
    this.halo.blendMode = 'add';
    this.halo.width = this.halo.height = size * 1.25;
    const s = size * 0.78 / 36; // the mockup's firefly is drawn on a 36-unit grid
    this.wingL.ellipse(0, 0, 7.5 * s, 5 * s).fill({ color: pal.wing, alpha: 0.85 });
    this.wingL.position.set(-7 * s, -5 * s);
    this.wingL.rotation = -0.44;
    this.wingR.ellipse(0, 0, 7.5 * s, 5 * s).fill({ color: pal.wing, alpha: 0.85 });
    this.wingR.position.set(7 * s, -5 * s);
    this.wingR.rotation = 0.44;
    this.shadow.ellipse(0, size * 0.33, size * 0.18, size * 0.045).fill({ color: pal.shadow, alpha: 0.55 });
    this.body.addChild(this.halo, this.wingL, this.wingR, this.core);
    this.root.addChild(this.ring, this.shadow, this.body, this.sparkle);
  }

  setKind(kind: FlyKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    const p = this.pal, s = this.size * 0.78 / 36;
    const [fill, edge, halo] = kind === 'hint' ? [p.hintFirefly, p.hintFireflyEdge, p.gold]
      : kind === 'conflict' ? [p.conflict, p.conflictEdge, p.conflict] : [p.firefly, p.fireflyEdge, p.glow];
    this.core.clear()
      .circle(0, 3 * s, 8 * s).fill(fill).stroke({ width: 1.5 * s, color: edge })
      .circle(0, -6 * s, 4.2 * s).fill(p.head)
      .circle(-1.5 * s, -7 * s, 1.1 * s).fill(p.wing)
      .circle(1.5 * s, -7 * s, 1.1 * s).fill(p.wing);
    this.halo.tint = halo;
    this.ring.clear();
    this.sparkle.clear();
    if (kind === 'hint') {
      const r = this.size * 0.44;
      this.ring.circle(0, 0, r).stroke({ width: Math.max(2, this.size * 0.045), color: p.glow });
      this.ring.circle(0, 0, r).stroke({ width: Math.max(4, this.size * 0.12), color: p.glow, alpha: 0.18 });
      star(this.sparkle, 0, 0, this.size * 0.12, p.star);
      this.sparkle.position.set(r * 0.72, -r * 0.72);
    }
  }

  tick(t: number, motion: boolean, dt: number): void {
    if (this.drop < 1) this.drop = motion ? Math.min(1, this.drop + dt / 480) : 1;
    const drop = (1 - easeOutBack(this.drop)) * -this.size * 0.8;
    if (!motion) {
      this.body.y = drop;
      this.body.alpha = 1;
      this.wingL.scale.y = this.wingR.scale.y = 1;
      this.halo.alpha = 0.8;
      this.shadow.scale.set(1);
      this.sparkle.rotation = 0;
      this.body.scale.set(1);
      return;
    }
    const bob = Math.sin((t / 2600) * TAU + this.phase);
    this.body.y = drop + bob * this.size * 0.06;
    const flutter = 0.725 + 0.275 * Math.cos((t / 160) * TAU);
    this.wingL.scale.y = this.wingR.scale.y = flutter;
    this.halo.alpha = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin((t / 2600) * TAU + this.phase));
    this.halo.scale.set((this.size * 1.25 / this.halo.texture.width) * (0.85 + 0.3 * (0.5 + 0.5 * Math.sin((t / 2600) * TAU))));
    this.shadow.scale.set(0.75 + 0.25 * (0.5 - 0.5 * bob));
    this.body.alpha = this.kind === 'conflict' ? 0.65 + 0.35 * Math.abs(Math.sin((t / 900) * TAU * 1.5)) : 1;
    this.sparkle.rotation = (t / 6000) * TAU;
    if (this.drop < 1) this.body.scale.set(0.55 + 0.45 * Math.min(1, this.drop * 1.6));
    else this.body.scale.set(1);
  }
}

function star(g: Graphics, x: number, y: number, r: number, color: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.28;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts).fill(color);
}

function dashedRect(g: Graphics, x: number, y: number, w: number, h: number, dash: number, color: number, width: number): void {
  const edges: [number, number, number, number][] = [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]];
  for (const [x1, y1, x2, y2] of edges) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let d = 0; d < len; d += dash * 2) {
      const a = d / len, b = Math.min(len, d + dash) / len;
      g.moveTo(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a).lineTo(x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
    }
  }
  g.stroke({ width, color, cap: 'round' });
}

interface CellView {
  readonly cell: number;
  readonly root: Container;
  readonly kind: 'path' | 'bush' | 'void';
  tile?: Sprite;
  lit?: boolean;
  fly?: FlyView;
  ruled?: Graphics;
  outline?: Graphics;
  clue?: Text;
  pips?: Graphics;
  extras?: Graphics;
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
  private readonly tray = new Graphics();
  private readonly cellsLayer = new Container();
  private readonly ghostLayer = new Container();
  private board: Board | null = null;
  private transform: Transform = 'identity';
  private fit: BoardFit | null = null;
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
    this.stage.addChild(this.tray, this.cellsLayer, this.ghostLayer);
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
    const keep = `:${cell + Math.max(3, Math.round(cell * 0.1))}:`;
    for (const [k, t] of this.textures) {
      if (k.startsWith('halo:') || k.includes(keep)) continue;
      t.destroy(true);
      this.textures.delete(k);
    }
  }

  private tileTexture(cell: number, lit: boolean): Texture {
    const c = this.pal.css;
    const edge = Math.max(3, Math.round(cell * 0.1));
    return this.texture(lit ? 'tile-lit' : 'tile-dark', cell + edge, (ctx, px) => {
      const r = cell * 0.24;
      ctx.fillStyle = lit ? c.tileLitEdge : c.tileDarkEdge;
      roundRect(ctx, 0, edge, cell, cell, r);
      ctx.fill();
      const g = lit
        ? ctx.createRadialGradient(cell * 0.5, cell * 0.42, 0, cell * 0.5, cell * 0.42, cell * 0.72)
        : ctx.createRadialGradient(cell * 0.3, cell * 0.25, 0, cell * 0.3, cell * 0.25, cell * 0.95);
      g.addColorStop(0, lit ? c.tileLitHi : c.tileDarkHi);
      g.addColorStop(0.6, lit ? c.tileLit : c.tileDark);
      g.addColorStop(1, lit ? c.tileLitLo : c.tileDarkLo);
      ctx.fillStyle = g;
      roundRect(ctx, 0, 0, cell, cell, r);
      ctx.fill();
      void px;
    });
  }

  private bushTexture(cell: number, hidden: boolean): Texture {
    const c = this.pal.css;
    const edge = Math.max(3, Math.round(cell * 0.1));
    return this.texture(hidden ? 'bush-hidden' : 'bush', cell + edge, (ctx) => {
      const blob = (y: number) => {
        ctx.beginPath();
        ctx.moveTo(cell * 0.5, y);
        ctx.bezierCurveTo(cell * 0.85, y, cell, y + cell * 0.18, cell, y + cell * 0.48);
        ctx.bezierCurveTo(cell, y + cell * 0.84, cell * 0.8, y + cell, cell * 0.48, y + cell);
        ctx.bezierCurveTo(cell * 0.14, y + cell, 0, y + cell * 0.8, 0, y + cell * 0.52);
        ctx.bezierCurveTo(0, y + cell * 0.2, cell * 0.18, y, cell * 0.5, y);
        ctx.closePath();
      };
      ctx.fillStyle = c.mossEdge;
      blob(edge);
      ctx.fill();
      const g = ctx.createRadialGradient(cell * 0.34, cell * 0.28, 0, cell * 0.34, cell * 0.28, cell * 0.9);
      g.addColorStop(0, hidden ? c.mossHiddenHi : c.mossHi);
      g.addColorStop(0.55, hidden ? c.mossHidden : c.moss);
      g.addColorStop(1, c.mossLo);
      ctx.fillStyle = g;
      blob(0);
      ctx.fill();
    });
  }

  private haloTexture(): Texture {
    return this.texture('halo', 64, (ctx, px) => {
      const g = ctx.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
      // White (tinted per firefly at draw time), fading out: token plus alpha digits.
      g.addColorStop(0, `${this.pal.css.wing}d9`);
      g.addColorStop(0.7, `${this.pal.css.wing}00`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, px, px);
    });
  }

  private build(): void {
    this.cellsLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.cells = [];
    this.tray.clear();
    if (!this.board || this.area.w < 10 || this.area.h < 10) return;
    const b = this.board;
    const [cols, rows] = this.dims();
    const fit = fitBoard(cols, rows, this.area.w, this.area.h / TILT);
    this.fit = fit;
    this.pruneTextures(fit.cell);
    const { cell, gap, pad } = fit;
    this.stage.scale.set(1, TILT);
    this.stage.position.set(Math.round((this.area.w - fit.width) / 2), Math.round((this.area.h - fit.height * TILT) / 2));
    this.tray.roundRect(0, 0, fit.width, fit.height, cell * 0.4).fill(this.pal.tray)
      .roundRect(1, 1, fit.width - 2, fit.height - 2, cell * 0.4).stroke({ width: 2, color: this.pal.trayEdge });
    const halo = this.haloTexture();
    for (let dr = 0; dr < rows; dr++) {
      for (let dc = 0; dc < cols; dc++) {
        const i = this.canonical(dr, dc);
        const kind = b.kind[i]!;
        const root = new Container();
        root.position.set(pad + dc * (cell + gap), pad + dr * (cell + gap));
        const v: CellView = { cell: i, root, kind: kind === 'path' ? 'path' : kind === 'void' ? 'void' : 'bush' };
        if (v.kind === 'path') {
          v.tile = new Sprite(this.tileTexture(cell, false));
          v.tile.width = v.tile.height = cell + Math.max(3, Math.round(cell * 0.1));
          v.lit = false;
          v.ruled = new Graphics();
          v.outline = new Graphics();
          v.fly = new FlyView(cell, this.pal, halo, ((dr * 7 + dc * 5) % 8) * 0.8);
          v.fly.root.position.set(cell / 2, cell / 2);
          v.fly.root.visible = false;
          root.addChild(v.tile, v.ruled, v.fly.root, v.outline);
          root.eventMode = 'static';
          root.cursor = 'pointer';
          root.hitArea = new Rectangle(-gap / 2, -gap / 2, cell + gap, cell + gap);
          root.on('pointertap', () => this.onTap(i));
        } else if (v.kind === 'bush') {
          const hidden = b.clue[i] === null;
          const sprite = new Sprite(this.bushTexture(cell, hidden));
          sprite.width = sprite.height = cell + Math.max(3, Math.round(cell * 0.1));
          v.outline = new Graphics();
          v.extras = new Graphics();
          root.addChild(sprite, v.extras, v.outline);
          if (hidden) {
            const leaf = new Graphics();
            const s = cell * 0.38 / 24, ox = cell / 2 - 12 * s, oy = cell / 2 - 12 * s;
            leaf.moveTo(ox + 5 * s, oy + 19 * s).bezierCurveTo(ox + 5 * s, oy + 10 * s, ox + 11 * s, oy + 5 * s, ox + 20 * s, oy + 4 * s)
              .bezierCurveTo(ox + 19 * s, oy + 13 * s, ox + 14 * s, oy + 19 * s, ox + 5 * s, oy + 19 * s).closePath()
              .fill(this.pal.leaf).stroke({ width: 1.5 * s, color: this.pal.mossEdge })
              .moveTo(ox + 5 * s, oy + 19 * s).lineTo(ox + 14 * s, oy + 10 * s).stroke({ width: 1.5 * s, color: this.pal.mossEdge });
            root.addChild(leaf);
          } else {
            v.clue = new Text({
              text: String(b.clue[i]),
              style: { fontFamily: this.pal.fontDisplay, fontWeight: '700', fontSize: Math.round(cell * 0.44), fill: this.pal.ink },
              resolution: Math.min(3, (window.devicePixelRatio || 1) * 1.5),
            });
            v.clue.anchor.set(0.5);
            v.clue.position.set(cell / 2, cell * (b.kind[i] === 'mushroom' ? 0.5 : 0.42));
            v.pips = new Graphics();
            root.addChild(v.clue, v.pips);
          }
        }
        this.cellsLayer.addChild(root);
        this.cells.push(v);
      }
    }
    if (this.state) this.render(this.state, { quiet: true });
  }

  /** Draw a position. `quiet` skips placement animations (resize, level load). */
  render(state: BoardState, opts: { quiet?: boolean; removed?: number | null } = {}): void {
    const prev = this.state;
    this.state = state;
    if (!this.board || !this.fit) return;
    const { cell } = this.fit;
    const ev = state.evaluation;
    const flies = new Set(ev.fireflies);
    const conflicts = new Set(ev.conflicts);
    const bushes = new Map(ev.bushes.map((s) => [s.cell, s]));
    const prevFlies = prev ? new Set(prev.evaluation.fireflies) : flies;
    for (const v of this.cells) {
      if (v.kind === 'path') {
        const lit = ev.lit[v.cell] ?? false;
        if (lit !== v.lit) {
          v.tile!.texture = this.tileTexture(cell, lit);
          v.lit = lit;
        }
        const has = flies.has(v.cell);
        if (has) {
          v.fly!.setKind(conflicts.has(v.cell) ? 'conflict' : state.locked.has(v.cell) ? 'hint' : 'player');
          if (!v.fly!.root.visible) {
            v.fly!.root.visible = true;
            v.fly!.drop = opts.quiet || prevFlies.has(v.cell) ? 1 : 0;
          }
        } else {
          v.fly!.root.visible = false;
        }
        v.ruled!.clear();
        if (state.ruledOut.has(v.cell) && !has) {
          const r = cell * 0.18, cx = cell / 2, cy = cell / 2;
          v.ruled!.circle(cx, cy, r).stroke({ width: Math.max(2, cell * 0.035), color: this.pal.ruled, alpha: 0.9 })
            .moveTo(cx - r * 0.7, cy + r * 0.7).lineTo(cx + r * 0.7, cy - r * 0.7).stroke({ width: Math.max(2, cell * 0.035), color: this.pal.ruled, cap: 'round' });
        }
      } else if (v.kind === 'bush' && v.clue && v.pips) {
        const s = bushes.get(v.cell);
        const want = s?.want ?? 0, have = s?.have ?? 0, st = s?.state ?? 'under';
        const key = `${have}:${st}:${state.solved}`;
        if (key !== v.bushKey) {
          v.bushKey = key;
          v.clue.style.fill = st === 'over' ? this.pal.warn : st === 'met' ? this.pal.glow : this.pal.ink;
          const pip = Math.max(5, Math.round(cell * 0.12)), gap = Math.max(2, Math.round(cell * 0.05));
          const total = want * pip + (want - 1) * gap;
          v.pips.clear();
          for (let k = 0; k < want; k++) {
            const x = cell / 2 - total / 2 + k * (pip + gap) + pip / 2, y = cell * 0.72;
            const on = k < have;
            const color = st === 'over' ? this.pal.warn : this.pal.glow;
            v.pips.circle(x, y, pip / 2 - 0.75).stroke({ width: 1.5, color });
            if (on || st === 'over') v.pips.circle(x, y, pip / 2 - 0.75).fill(color);
          }
          v.extras!.clear();
          if (st === 'met' && want > 0) star(v.extras!, cell * 0.92, cell * 0.04, cell * 0.16, this.pal.glow);
          if (state.solved) {
            flower(v.extras!, cell * 0.18, cell * 0.16, cell * 0.12, this.pal.petalPink, this.pal.glow);
            flower(v.extras!, cell * 0.8, cell * 0.8, cell * 0.1, this.pal.petalLilac, this.pal.star);
          }
        }
      } else if (v.kind === 'bush' && v.extras) {
        v.extras.clear();
        if (state.solved) flower(v.extras, cell * 0.18, cell * 0.16, cell * 0.12, this.pal.petalPink, this.pal.glow);
      }
      if (v.outline) {
        v.outline.clear();
        if (state.because.has(v.cell)) dashedRect(v.outline, -3, -3, cell + 6, cell + 6, Math.max(4, cell * 0.08), this.pal.glow, 2);
      }
    }
    if (opts.removed !== undefined && opts.removed !== null) this.liftAway(opts.removed);
  }

  private liftAway(cell: number): void {
    const v = this.cells.find((c) => c.cell === cell);
    if (!v || !this.fit || !this.motion) return;
    const fly = new FlyView(this.fit.cell, this.pal, this.haloTexture(), 0);
    fly.setKind('conflict');
    fly.root.position.set(v.root.x + this.fit.cell / 2, v.root.y + this.fit.cell / 2);
    this.ghostLayer.addChild(fly.root);
    this.ghosts.push({ fly, age: 0 });
  }

  private tick(dt: number): void {
    this.time += dt;
    for (const v of this.cells) {
      if (v.fly?.root.visible) v.fly.tick(this.time, this.motion, dt);
      if (v.outline && this.state?.because.has(v.cell)) {
        v.outline.alpha = this.motion ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((this.time / 1200) * TAU)) : 1;
      }
    }
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

function flower(g: Graphics, x: number, y: number, r: number, petal: number, center: number): void {
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    g.circle(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.4).fill(petal);
  }
  g.circle(x, y, r * 0.3).fill(center);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
