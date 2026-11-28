// Pixi's CSP-safe shader path: our pages (and portals) forbid eval; this module replaces it.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { conflictPairs, lightCounts } from '@firefly/core';
import type { Board, Evaluation, Transform } from '@firefly/core';
import { canonicalCell, displayDims, fitBoard } from './layout.ts';
import type { BoardFit } from './layout.ts';
import type { Palette } from './theme.ts';
import { BEAM, BEAM_SOURCE, beamEnds, beamRetract, beamReveal, bushLayout, gazeMotes, quiver, dotPositions, FACE_CENTER_Y, bloomDelays, cappedRipple, CELEBRATION, flightAt, FLY_BOXES, FLY_MOTION, haloStrength, MOTION_TIMING, outlinePolylines, pulse, rippleDelays, ROSE_SLOTS, roseVariants, SWAY_ORIGIN, syncFlash, UNIT, WING_ROOT } from './art/geometry.ts';
import type { BushKind, UnitBox } from './art/geometry.ts';
import { drawBush, drawConflictTile, drawMote, drawPetal, drawDarkTile, drawFlyBody, drawFlyGlow, drawFlyShadow, drawFlyWing, drawHintHalo, drawLitTile, drawPollen, drawRose, drawXMark, drawHalo, drawSpark } from './art/pieces.ts';
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
  /** Cells a hint points at, or whose reason a hint X shows (the ring). */
  readonly because: ReadonlySet<number>;
  /** Hint X marks (locked). Drawn exactly like the player's own. */
  readonly crossed: ReadonlySet<number>;
  /** The player's own X marks. */
  readonly marks: ReadonlySet<number>;
  readonly solved: boolean;
}

const TAU = Math.PI * 2;
/** The X's pivot: the tile face's centre (38 of 84 units down), so it boops from the middle. */
const X_PIVOT_Y = 38 / 84;
/** How long a press on a tile lasts before it is a hold (the player's own X) rather than a tap. */
export const HOLD_MS = 320;
/** The X mark's moments, in ms (skipped under reduced motion: it simply appears and goes). */
const X_MOTION = { boopMs: 300, liftMs: 380, puffMs: 620, grains: 7 } as const;
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
  /** The shadow's resting scale (the breath shrinks it from here). */
  private readonly shadowScale: number;
  /** The glow's resting scale (the solve's synchronised flash swells it from here). */
  private readonly glowScale: number;
  kind: FlyKind | null = null;
  /** 0..1: the solve's synchronised flash (set by the board's moment, 0 otherwise). */
  flash = 0;
  phase: number;
  drop = 1;
  /** Milliseconds to stay invisible before dropping in (a firefly still flying from the jar). */
  wait = 0;

  constructor(private readonly size: number, private readonly art: FlyArt, phase: number) {
    this.phase = phase;
    this.u = size / UNIT;
    /** A part baked in `b` (units), turning about `p` (defaults to its corner): anchored and placed there. */
    const part = (t: Texture, b: UnitBox, p: { x: number; y: number } = { x: b.x, y: b.y }) => {
      const sp = new Sprite(t);
      sp.width = b.w * this.u;
      sp.height = b.h * this.u;
      sp.anchor.set((p.x - b.x) / b.w, (p.y - b.y) / b.h);
      sp.position.set(p.x * this.u, p.y * this.u);
      return sp;
    };
    this.shadow = part(art.shadow, FLY_BOXES.shadow, { x: 45, y: 68 });
    this.shadowScale = this.shadow.scale.x;
    this.halo = part(art.halo, FLY_BOXES.halo);
    this.halo.visible = false;
    this.glow = part(art.glow.player, FLY_BOXES.glow, { x: 42, y: 46 });
    // Additive: the glow brightens what it sits on, so a firefly's tile is the light's source.
    this.glow.blendMode = 'add';
    this.glowScale = this.glow.scale.x;
    this.wingL = part(art.wingL, FLY_BOXES.wingL, WING_ROOT.left);
    this.wingR = part(art.wingR, FLY_BOXES.wingR, WING_ROOT.right);
    this.core = part(art.body.player, FLY_BOXES.body);
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
      this.glow.scale.set(this.glowScale);
      this.shadow.scale.set(this.shadowScale);
      this.shadow.alpha = 1;
      return;
    }
    const m = FLY_MOTION;
    const up = pulse(t, m.bobMs, this.phase);
    this.body.y = sway + drop - up * m.bobUnits * this.u;
    const flap = (pulse(t, m.flapMs, this.phase * 3) * m.flapDeg * Math.PI) / 180;
    this.wingL.rotation = -flap;
    this.wingR.rotation = flap;
    this.glow.alpha = Math.min(1, 1 - 0.22 * up + this.flash);
    this.glow.scale.set(this.glowScale * (1 + 0.9 * this.flash));
    this.shadow.scale.set(this.shadowScale * (1 - 0.2 * up));
    this.shadow.alpha = 1 - 0.33 * up;
    this.body.rotation = this.kind === 'conflict'
      ? (-Math.cos((2 * Math.PI * t) / m.swayMs + this.phase) * m.swayDeg * Math.PI) / 180 : 0;
    this.body.scale.set(this.drop < 1 ? 0.55 + 0.45 * Math.min(1, this.drop * 1.6) : 1);
  }
}

/** How a path tile is drawn: dark, lit, lit by two or more beams, or under fireflies that see each other. */
type TileLook = 'dark' | 'lit' | 'bright' | 'conflict';
const glows = (look: TileLook | undefined) => look === 'lit' || look === 'bright';

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
  /** The X mark, anchored at the face's centre so it boops from the middle. */
  mark?: Sprite;
  clue?: Text;
  pips?: Graphics;
  /** The bush drawing (swapped for the wilted one when it has too many). */
  bush?: Sprite;
  bushKind?: BushKind;
  /** A tap's rustle is still running (a second tap waits for it). */
  rustling?: boolean;
  /** The three roses a happy bush shows (and every bush, plain ones too, once the garden is solved). */
  roses?: Container;
  /** A tile look still on its way (the light's wash travelling from the firefly), and its move. */
  pendingLook?: TileLook;
  pendingToken?: object;
  bushKey?: string;
}

/** A moment on the board's clock: `step` gets 0..1 from `start` (ms) over `dur`, and 1 last. */
interface Tween {
  readonly start: number;
  readonly dur: number;
  readonly step: (t: number) => void;
}

interface Ghost {
  readonly fly: FlyView;
  age: number;
}

/** A firefly released at the solve, drifting up into the night (positions in stage pixels). */
interface Flier {
  readonly fly: FlyView;
  readonly x0: number;
  readonly y0: number;
  readonly phase: number;
  /** Cells to climb: enough to leave the canvas at the top. */
  readonly rise: number;
  age: number;
  lastTrail: number;
}

/** A fading gold mote a flier leaves behind. */
interface Trail {
  readonly sp: Sprite;
  /** The sprite's starting scale (it shrinks from here) and alpha (it fades from here). */
  readonly scale: number;
  readonly alpha: number;
  age: number;
}

export interface BoardViewOptions {
  readonly palette: Palette;
  readonly onTap: (cell: number) => void;
  /** A tile held for `HOLD_MS` (or right-clicked): the player's own X. */
  readonly onHold?: (cell: number) => void;
  /** Dragging on after a hold: set (`on`) or clear the X on one more tile, as the hold did. */
  readonly onPaint?: (cell: number, on: boolean) => void;
  readonly reducedMotion: boolean;
  /**
   * At the solve, a firefly leaves its tile from `from` (viewport pixels). Return true when the
   * page flies it on (to the progress track); otherwise the board flies it up off the canvas.
   */
  readonly onRelease?: (from: { x: number; y: number }, gold: boolean, phase: number, cellPx: number) => boolean;
}

export class BoardView {
  private readonly app: Application;
  private readonly pal: Palette;
  private readonly onTap: (cell: number) => void;
  private readonly onHold: BoardViewOptions['onHold'];
  private readonly onPaint: BoardViewOptions['onPaint'];
  /**
   * A press in progress: which tile, its hold timer, and once held, whether the drag sets or
   * clears X marks and the tiles it has passed. `swallowTap`: the press became a hold, so the
   * tap Pixi reports on release is not a tap.
   */
  private press: { cell: number; timer: ReturnType<typeof setTimeout> | null; held: boolean; on: boolean | null; seen: Set<number> } | null = null;
  private swallowTap = false;
  private readonly onRelease: BoardViewOptions['onRelease'];
  private motion: boolean;
  private readonly stage = new Container();
  private readonly cellsLayer = new Container();
  private readonly ghostLayer = new Container();
  /** Keyboard focus ring (desktop portals): drawn only while the board has keyboard focus. */
  private readonly focusRing = new Graphics();
  private focusCell: number | null = null;
  /** The hint reason outline, one shape around every cell a hint names. */
  private readonly outline = new Graphics();
  /** The cells `outline` currently surrounds (sorted, joined), or null after a rebuild. */
  private outlineKey: string | null = null;
  private board: Board | null = null;
  private transform: Transform = 'identity';
  private fit: BoardFit | null = null;
  private art: FlyArt | null = null;
  private cells: CellView[] = [];
  private ghosts: Ghost[] = [];
  /** Running moments (light spreading, roses opening, a slump, the bloom); never filled without motion. */
  private tweens: Tween[] = [];
  private readonly particleLayer = new Container();
  /** Under the tiles: the solved garden's halo. */
  private readonly glowLayer = new Container();
  /**
   * Fireflies that see each other: a pink beam between each pair (the broken rule made visible,
   * from Michael's 2026-11-12 feedback), over the tiles, pulled in clear of the fireflies.
   */
  private readonly beams = new Graphics();
  /** The beams on the board now (board pixels), each with when it appeared (board clock), for its motion. */
  private beamSegs: { key: string; x0: number; y0: number; x1: number; y1: number; born: number; gone?: number }[] = [];
  /** Over the tiles, additive: the solve's wave of light. */
  private readonly flashLayer = new Container();
  /** Released fireflies and their trails. */
  private readonly flightLayer = new Container();
  private halo: Sprite | null = null;
  /**
   * The halo's texture, owned here rather than cached: its size follows the whole board and the
   * space above it, which change without the cell size changing (a height-only resize, a fold),
   * so the cell-keyed prune would never free old ones. Freed on every layout.
   */
  private haloTexture: Texture | null = null;
  private fliers: Flier[] = [];
  private trails: Trail[] = [];
  /** Cells whose firefly has flown off this level (a rebuild keeps them gone). */
  private readonly released = new Set<number>();
  /** The board clock's time of the current solve's start, while its halo is still swelling. */
  private haloFrom: number | null = null;
  /** The board clock's time the current level's solve celebration started (null: none). */
  private celebrateAt: number | null = null;
  private textures = new Map<string, Texture>();
  private state: BoardState | null = null;
  private time = 0;
  private area = { w: 0, h: 0 };
  /** Frames drawn and milliseconds elapsed since load, for the fps readout and the perf check. */
  private readonly frames = { count: 0, ms: 0 };

  private constructor(app: Application, opts: BoardViewOptions) {
    this.app = app;
    this.pal = opts.palette;
    this.onTap = opts.onTap;
    this.onHold = opts.onHold;
    this.onPaint = opts.onPaint;
    this.onRelease = opts.onRelease;
    this.motion = !opts.reducedMotion;
    this.stage.addChild(this.glowLayer, this.cellsLayer, this.beams, this.flashLayer, this.outline, this.particleLayer, this.ghostLayer, this.flightLayer, this.focusRing);
    app.stage.addChild(this.stage);
    app.ticker.add((ticker) => this.tick(ticker.deltaMS));
    // A lost and restored WebGL context (common on phones in the background) needs a fresh frame.
    app.canvas.addEventListener('webglcontextrestored', () => this.wake());
    // Right-click marks an X (desktop), so the browser's menu stays away from the board.
    app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // A press ends wherever the pointer is let go (on the board or off it).
    for (const type of ['pointerup', 'pointercancel', 'blur'] as const) window.addEventListener(type, () => this.endPress());
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
    // Turning motion off mid-moment: every running moment lands now.
    if (reduced) {
      this.finishMoments();
      this.endFlights();
      if (this.haloFrom !== null) this.haloFrom = this.time - 1e9;
    }
    // Beams land in their still form (or start moving again) at once.
    this.paintBeams();
    this.wake();
  }

  private finishMoments(): void {
    const running = this.tweens;
    this.tweens = [];
    for (const tw of running) tw.step(1);
  }

  /**
   * Frames are drawn only while something moves (a bobbing firefly, a moment
   * such as a spreading wash or opening roses, a pulsing hint outline, a
   * firefly lifting away). A still board, which is every board in reduced
   * motion once its moments land and an empty one otherwise, draws once per
   * change and then stops the ticker: no GPU or battery spent on identical frames.
   */
  /** Draw at least one more frame (the tab came back, the context was restored). */
  redraw(): void {
    this.wake();
  }

  private wake(): void {
    if (!this.app.ticker.started) this.app.ticker.start();
  }

  private animating(): boolean {
    if (this.ghosts.length > 0 || this.tweens.length > 0 || this.fliers.length > 0 || this.trails.length > 0) return true;
    if (this.beamSegs.some((b) => b.gone !== undefined)) return true;
    if (this.haloFrom !== null) return true;
    if (!this.motion) return false;
    if ((this.state?.because.size ?? 0) > 0) return true;
    return this.cells.some((v) => v.fly?.root.visible === true);
  }

  setLevel(board: Board, transform: Transform): void {
    this.board = board;
    this.transform = transform;
    this.state = null;
    for (const g of this.ghosts) g.fly.root.destroy({ children: true });
    this.ghosts = [];
    this.released.clear();
    this.haloFrom = null;
    this.celebrateAt = null;
    this.beamSegs = [];
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

  /** Show the keyboard focus ring on a canonical cell, or hide it (null). */
  setFocus(cell: number | null): void {
    this.focusCell = cell;
    this.drawFocus();
  }

  private drawFocus(): void {
    this.wake();
    this.focusRing.clear();
    const v = this.focusCell === null ? undefined : this.cells.find((c) => c.cell === this.focusCell);
    if (!v || !this.fit) return;
    const { cell } = this.fit;
    const inset = -Math.max(3, Math.round(cell * 0.07));
    this.focusRing.roundRect(v.root.x + inset, v.root.y + inset, cell - 2 * inset, cell - 2 * inset, cell * 0.3)
      .stroke({ width: 3, color: this.pal.glow });
  }

  /**
   * A baked texture, cached by key, size and resolution. `size` is also what a resize prunes
   * by; `box` (CSS pixels) gives a canvas other than size × size, for parts drawn tight.
   */
  private texture(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, px: number) => void, box?: { w: number; h: number }): Texture {
    const res = Math.min(3, window.devicePixelRatio || 1);
    const k = `${key}:${size}:${res}`;
    let t = this.textures.get(k);
    if (!t) {
      t = bake(size, draw, box);
      this.textures.set(k, t);
    }
    return t;
  }

  /** A press on a tile: a hold if it lasts `HOLD_MS` on that tile, else the tap Pixi reports. */
  private startPress(cell: number): void {
    this.endPress();
    this.swallowTap = false;
    const press = { cell, timer: null as ReturnType<typeof setTimeout> | null, held: false, on: null as boolean | null, seen: new Set([cell]) };
    press.timer = setTimeout(() => {
      if (this.press !== press) return;
      press.timer = null;
      press.held = true;
      this.swallowTap = true;
      const before = this.state?.marks.has(cell) ?? false;
      this.onHold?.(cell);
      const after = this.state?.marks.has(cell) ?? false;
      // The drag carries on what the hold did: set X marks if it set one, clear them if it cleared
      // one, and nothing if it did neither (a hint's X, a lantern, a board that was busy).
      press.on = after === before ? null : after;
    }, HOLD_MS);
    this.press = press;
  }

  /** The pointer moves onto a tile: paint it if a hold is dragging, or cancel a press that wandered off. */
  private pressOver(cell: number, buttons: number): void {
    const press = this.press;
    if (!press || press.seen.has(cell)) return;
    // No button down: the release happened somewhere we never heard about (another window).
    if (buttons === 0) {
      this.endPress();
      return;
    }
    press.seen.add(cell);
    if (!press.held) this.endPress();
    else if (press.on !== null) this.onPaint?.(cell, press.on);
  }

  private endPress(): void {
    if (this.press?.timer) clearTimeout(this.press.timer);
    this.press = null;
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
    const c = this.pal.css;
    return this.texture(`tile-${look}`, cell, (ctx) => {
      if (glows(look)) drawLitTile(ctx, c, cell, look === 'bright');
      else if (look === 'conflict') drawConflictTile(ctx, c, cell);
      else drawDarkTile(ctx, c, cell);
    });
  }

  private markTexture(cell: number): Texture {
    return this.texture('x-mark', cell, (ctx) => drawXMark(ctx, this.pal.css, cell));
  }

  /** The X sprite's resting scale (its texture is baked at the cell size). */
  private markScale(): number {
    const tex = this.fit ? this.markTexture(this.fit.cell) : null;
    return tex && this.fit ? this.fit.cell / tex.width : 1;
  }

  /** An X lands: it pops up from nothing, overshoots a little and settles (a small boop). */
  private boop(v: CellView, at: number): void {
    const sp = v.mark!, base = this.markScale();
    sp.scale.set(0);
    this.tweens.push({
      start: at, dur: X_MOTION.boopMs,
      step: (t) => {
        const k = easeOutBack(t);
        // A touch wider than tall on the way in, like a stamp pressed down.
        sp.scale.set(base * k * (1 + 0.08 * Math.sin(t * Math.PI)), base * k * (1 - 0.06 * Math.sin(t * Math.PI)));
        if (t >= 1) sp.scale.set(base);
      },
    });
  }

  /** An X lifts away: a fading copy rises and shrinks while a puff of pollen drifts off. */
  private puff(v: CellView): void {
    if (!this.fit) return;
    const cell = this.fit.cell, base = this.markScale(), at = this.time;
    const ghost = new Sprite(this.markTexture(cell));
    ghost.anchor.set(0.5, X_PIVOT_Y);
    const x0 = v.root.x + cell / 2, y0 = v.root.y + cell * X_PIVOT_Y;
    ghost.position.set(x0, y0);
    ghost.scale.set(base);
    this.particleLayer.addChild(ghost);
    this.tweens.push({
      start: at, dur: X_MOTION.liftMs,
      step: (t) => {
        ghost.alpha = 1 - t;
        ghost.y = y0 - cell * 0.12 * t;
        ghost.scale.set(base * (1 - 0.35 * t));
        if (t >= 1) ghost.destroy();
      },
    });
    const px = Math.max(4, Math.round(cell * 0.12));
    const tex = this.texture('pollen', px, (ctx) => drawPollen(ctx, this.pal.css, px));
    const rnd = (k: number, n: number) => (Math.imul(v.cell * 97 + k * 31 + n * 13 + 5, 0x9e3779b1) >>> 0) / 4294967296;
    for (let k = 0; k < X_MOTION.grains; k++) {
      const angle = (k / X_MOTION.grains) * TAU + rnd(k, 1) * 0.8;
      const reach = cell * (0.22 + 0.16 * rnd(k, 2)), dur = X_MOTION.puffMs * (0.8 + 0.4 * rnd(k, 3));
      const sp = new Sprite(tex);
      sp.anchor.set(0.5);
      sp.width = sp.height = px * (0.7 + 0.6 * rnd(k, 4));
      const s0 = sp.scale.x;
      sp.position.set(x0, y0);
      this.particleLayer.addChild(sp);
      this.tweens.push({
        start: at + k * 18, dur,
        step: (t) => {
          const e = 1 - (1 - t) * (1 - t);
          sp.x = x0 + Math.cos(angle) * reach * e;
          // Pollen drifts: out first, then a little upward float.
          sp.y = y0 + Math.sin(angle) * reach * e - cell * 0.1 * t;
          sp.alpha = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
          sp.scale.set(s0 * (1 - 0.4 * t));
          if (t >= 1) sp.destroy();
        },
      });
    }
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

  /** Every firefly part for one cell size, each baked tight around its drawing (FLY_BOXES). */
  private flyArt(cell: number): FlyArt {
    const c = this.pal.css, u = cell / UNIT;
    const tight = (key: string, b: UnitBox, draw: (ctx: CanvasRenderingContext2D) => void) =>
      this.texture(key, cell, (ctx) => {
        ctx.translate(-b.x * u, -b.y * u);
        draw(ctx);
      }, { w: b.w * u, h: b.h * u });
    const kinds = ['player', 'hint', 'conflict'] as const;
    const per = (name: string, b: UnitBox, draw: (ctx: CanvasRenderingContext2D, kind: FlyKind) => void) =>
      Object.fromEntries(kinds.map((k) => [k, tight(`fly-${name}-${k}`, b, (ctx) => draw(ctx, k))])) as Record<FlyKind, Texture>;
    return {
      glow: per('glow', FLY_BOXES.glow, (ctx, k) => drawFlyGlow(ctx, c, cell, k)),
      body: per('body', FLY_BOXES.body, (ctx, k) => drawFlyBody(ctx, c, cell, k)),
      wingL: tight('fly-wing-l', FLY_BOXES.wingL, (ctx) => drawFlyWing(ctx, c, cell, 'left')),
      wingR: tight('fly-wing-r', FLY_BOXES.wingR, (ctx) => drawFlyWing(ctx, c, cell, 'right')),
      shadow: tight('fly-shadow', FLY_BOXES.shadow, (ctx) => drawFlyShadow(ctx, c, cell)),
      halo: tight('fly-halo', FLY_BOXES.halo, (ctx) => drawHintHalo(ctx, c, cell)),
    };
  }

  private build(): void {
    this.wake();
    // A press belongs to the tiles it started on: a rebuild (a new garden, a resize) ends it.
    this.endPress();
    this.cellsLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.cells = [];
    this.outline.clear();
    this.outlineKey = null;
    this.beams.clear();
    // Beams keep their start times through a rebuild (a resize or fold doesn't replay the shoot-in);
    // their positions are worked out again by the render below.
    // Ghosts, moments and particles use the old size's sprites and textures, which the
    // prune below frees: end them first (a rebuild redraws the position at rest).
    for (const g of this.ghosts) g.fly.root.destroy({ children: true });
    this.ghosts = [];
    this.tweens = [];
    this.particleLayer.removeChildren().forEach((p) => p.destroy());
    this.flashLayer.removeChildren().forEach((p) => p.destroy());
    this.glowLayer.removeChildren().forEach((p) => p.destroy());
    this.halo = null;
    this.haloTexture?.destroy(true);
    this.haloTexture = null;
    this.endFlights();
    if (!this.board || this.area.w < 10 || this.area.h < 10) return;
    const b = this.board;
    const [cols, rows] = displayDims(this.transform, b.w, b.h);
    const fit = fitBoard(cols, rows, this.area.w, this.area.h);
    this.fit = fit;
    this.pruneTextures(fit.cell);
    const { cell, gap, pad } = fit;
    const u = cell / UNIT;
    this.stage.position.set(Math.round((this.area.w - fit.width) / 2), Math.round((this.area.h - fit.height) / 2));
    const art = this.flyArt(cell);
    this.art = art;
    // The solved garden's halo: warm light round the whole board, under the tiles. Its reach
    // stays inside the room between the board and each canvas edge that sits on screen, so no
    // edge cuts it off in a hard line; an edge on the viewport's own edge doesn't limit it.
    // With too little room (a desktop board that fills its canvas) a halo would only be a hard
    // thin outline, so there is none: the lit garden carries the moment alone.
    const reach = Math.min(cell * 0.55, 0.42 * this.haloRoom(fit));
    if (reach >= 10) {
      const hm = Math.ceil(reach * 1.6);
      this.haloTexture = bake(cell,
        (ctx) => drawHalo(ctx, this.pal.css, fit.width - 2 * pad, fit.height - 2 * pad, hm + pad, cell * 0.08, reach),
        { w: fit.width + 2 * hm, h: fit.height + 2 * hm });
      this.halo = new Sprite(this.haloTexture);
      this.halo.position.set(-hm, -hm);
      this.halo.blendMode = 'add';
      this.halo.visible = false;
      this.glowLayer.addChild(this.halo);
    }
    for (let dr = 0; dr < rows; dr++) {
      for (let dc = 0; dc < cols; dc++) {
        const i = canonicalCell(this.transform, b.w, b.h, dr, dc);
        const kind = b.kind[i]!;
        const root = new Container();
        root.position.set(pad + dc * (cell + gap), pad + dr * (cell + gap));
        const v: CellView = { cell: i, dr, dc, root, kind: kind === 'path' ? 'path' : kind === 'void' ? 'void' : 'bush' };
        if (v.kind === 'path') {
          v.tile = new Sprite(this.tileTexture(cell, 'dark'));
          v.tile.width = v.tile.height = cell;
          v.look = 'dark';
          v.mark = new Sprite(this.markTexture(cell));
          v.mark.anchor.set(0.5, X_PIVOT_Y);
          v.mark.width = v.mark.height = cell;
          v.mark.position.set(cell / 2, cell * X_PIVOT_Y);
          v.mark.visible = false;
          v.fly = new FlyView(cell, art, ((dr * 7 + dc * 5) % 8) * 0.8);
          v.fly.root.visible = false;
          root.addChild(v.tile, v.mark, v.fly.root);
          root.eventMode = 'static';
          root.cursor = 'pointer';
          root.hitArea = new Rectangle(-gap / 2, -gap / 2, cell + gap, cell + gap);
          root.on('pointertap', (e) => {
            if (e.button !== 0) return;
            if (this.swallowTap) {
              this.swallowTap = false;
              return;
            }
            // Ctrl+click (a Mac's right-click) marks, as right-click does.
            if (e.ctrlKey) this.onHold?.(i);
            else this.onTap(i);
          });
          root.on('pointerdown', (e) => {
            if (e.button === 0 && !e.ctrlKey) this.startPress(i);
          });
          root.on('pointerover', (e) => this.pressOver(i, e.buttons));
          // Sliding off the tile before the hold lands cancels it (a held drag carries on).
          root.on('pointerout', () => {
            if (this.press && !this.press.held && this.press.cell === i) this.endPress();
          });
          root.on('rightclick', () => this.onHold?.(i));
        } else if (v.kind === 'bush') {
          const numbered = b.clue[i] !== null;
          v.bushKind = numbered ? 'numbered' : 'plain';
          v.bush = new Sprite(this.bushTexture(cell, v.bushKind));
          v.bush.width = v.bush.height = cell;
          root.addChild(v.bush);
          // Tap a bush: it rustles (rewards plan, small interactions). Not a move; reveals nothing.
          root.eventMode = 'static';
          root.hitArea = new Rectangle(-gap / 2, -gap / 2, cell + gap, cell + gap);
          root.on('pointertap', () => this.rustle(v));
          v.roses = new Container();
          v.roses.visible = false;
          roseVariants(i).forEach((variant, k) => {
            const slot = ROSE_SLOTS[k]!;
            const rose = new Sprite(this.roseTexture(cell, variant));
            // Anchored at its centre, so opening scales it from the middle.
            rose.anchor.set(0.5);
            rose.position.set((slot.x + slot.size / 2) * u, (slot.y + slot.size / 2) * u);
            rose.width = rose.height = slot.size * u;
            v.roses!.addChild(rose);
          });
          root.addChild(v.roses);
          if (numbered) {
            v.clue = new Text({
              text: String(b.clue[i]),
              style: { fontFamily: this.pal.fontDisplay, fontWeight: '400', fontSize: Math.round(30 * u), fill: this.pal.paper },
              resolution: Math.min(3, (window.devicePixelRatio || 1) * 1.5),
            });
            v.clue.anchor.set(0.5);
            v.clue.position.set(cell / 2, bushLayout('numbered').numberY * u);
            v.pips = new Graphics();
            root.addChild(v.clue, v.pips);
          }
        }
        this.cellsLayer.addChild(root);
        this.cells.push(v);
      }
    }
    // A rebuild mid-celebration drops the pending releases: land them, so no firefly is left
    // behind while the others have flown (only with motion; reduced motion keeps them all).
    if (this.motion && this.state?.solved && (this.celebrateAt !== null || this.released.size > 0)) {
      for (const f of this.state.evaluation.fireflies) this.released.add(f);
    }
    if (this.state) this.render(this.state, { quiet: true });
    this.drawFocus();
  }

  /**
   * Draw a position. `quiet` skips placement animations (resize, level load); `arriving`
   * is a cell whose firefly is still flying in from the jar, so it lands `arrivalMs` later.
   * With motion on, a new firefly's light spreads tile by tile, roses open as a bush is
   * satisfied, an overfull bush slumps, and a solve blooms every bush in a ripple. Without
   * motion, or `quiet`, every change lands at once: the state is always the same.
   */
  render(state: BoardState, opts: { quiet?: boolean; removed?: number | null; arriving?: number | null; arrivalMs?: number } = {}): void {
    const prev = this.state;
    this.state = state;
    this.wake();
    if (!this.board || !this.fit) return;
    const { cell } = this.fit;
    const u = cell / UNIT;
    const ev = state.evaluation;
    const flies = new Set(ev.fireflies);
    const conflicts = new Set(ev.conflicts);
    const bushes = new Map(ev.bushes.map((s) => [s.cell, s]));
    const prevFlies = prev ? new Set(prev.evaluation.fireflies) : flies;
    const beams = lightCounts(this.board, ev.fireflies);
    const animate = this.motion && !opts.quiet && prev !== null;
    // The firefly that just landed: where the light and the solve ripple start, and when.
    const origin = animate ? ev.fireflies.find((f) => !prevFlies.has(f)) : undefined;
    const landAt = this.time + (origin !== undefined && opts.arriving === origin ? (opts.arrivalMs ?? 0) : 0);
    const w = this.board.w;
    const spread = origin === undefined ? null
      : rippleDelays(this.cells.filter((v) => v.kind === 'path').map((v) => v.cell), origin, w, MOTION_TIMING.spreadPerCell, true, true);
    // The solve ripple's timing for every bush at once, so the whole bloom fits the solve's moment.
    const solvingNow = animate && origin !== undefined && state.solved && !(prev?.solved ?? false);
    const bloomAt = solvingNow
      ? bloomDelays(this.cells.filter((v) => v.kind === 'bush').map((v) => v.cell), origin, w, true) : null;
    for (const v of this.cells) {
      if (v.kind === 'path') {
        const has = flies.has(v.cell);
        const look: TileLook = has && conflicts.has(v.cell) ? 'conflict'
          : !(ev.lit[v.cell] ?? false) ? 'dark' : (beams[v.cell] ?? 0) >= 2 ? 'bright' : 'lit';
        const target = v.pendingLook ?? v.look;
        if (look !== target) {
          // Light arriving travels from the firefly; light leaving (or no motion) is instant.
          if (spread && glows(look) && v.look === 'dark') this.spreadTo(v, look, landAt + (spread.get(v.cell) ?? 0));
          else this.setLook(v, look);
        }
        if (has && this.released.has(v.cell)) {
          // Flown off at the solve: the garden glows on without it.
          v.fly!.root.visible = false;
        } else if (has) {
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
        const marked = (state.crossed.has(v.cell) || state.marks.has(v.cell)) && !has;
        if (marked !== v.mark!.visible) {
          v.mark!.visible = marked;
          if (animate) {
            if (marked) this.boop(v, landAt);
            else this.puff(v);
          } else {
            v.mark!.scale.set(this.markScale());
          }
        }
      } else if (v.kind === 'bush' && v.bush && v.roses) {
        const s = bushes.get(v.cell);
        const want = s?.want ?? 0, have = s?.have ?? 0, st = s?.state ?? 'under';
        const numbered = v.clue !== undefined;
        // Roses: a happy numbered bush, and every bush once the garden is solved.
        const bloom = state.solved || (numbered && st === 'met' && want > 0);
        const key = `${have}:${st}:${state.solved}`;
        if (key === v.bushKey) continue;
        const was = v.bushKey;
        v.bushKey = key;
        // The solve re-opens every bush's roses, happy ones too, in one ripple from the last firefly.
        const solving = state.solved && !(prev?.solved ?? false);
        if (bloom && (!v.roses.visible || solving)) {
          v.roses.visible = true;
          if (animate && was !== undefined) {
            const delay = solving && bloomAt ? MOTION_TIMING.bloomStart + (bloomAt.get(v.cell) ?? 0) : 0;
            this.openRoses(v, landAt + delay, solving);
          }
        } else if (!bloom) {
          v.roses.visible = false;
        }
        if (!numbered || !v.clue || !v.pips) continue;
        // Too many: the bush wilts (shape) as well as turning the number and the extra dot warn (colour).
        const kind: BushKind = st === 'over' ? 'wilted' : 'numbered';
        if (kind !== v.bushKind) {
          v.bushKind = kind;
          v.bush.texture = this.bushTexture(cell, kind);
          if (kind === 'wilted' && animate) this.slump(v, landAt);
        }
        const { numberY, dotsY } = bushLayout(kind);
        v.clue.position.y = numberY * u;
        // Happy: the number turns gold. A bush that wants none shows neither gold nor roses.
        v.clue.style.fill = st === 'over' ? this.pal.warn : st === 'met' && want > 0 ? this.pal.gold : this.pal.paper;
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
    this.drawOutline(state.because);
    // A new beam waits for its firefly to land (it may still be flying in from the jar).
    this.drawBeams(ev, landAt);
    if (opts.removed !== undefined && opts.removed !== null) this.liftAway(opts.removed);
    if (solvingNow) this.celebrate(origin, landAt);
    else if (!state.solved) this.haloFrom = this.celebrateAt = null;
    this.drawHalo();
  }

  /** CSS pixels between the board and the nearest canvas edge that is inside the viewport. */
  private haloRoom(fit: BoardFit): number {
    const r = this.app.canvas.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const x = this.stage.x, y = this.stage.y;
    const sides: [number, boolean][] = [
      [y, r.top > 1],
      [this.area.h - y - fit.height, r.bottom < vh - 1],
      [x, r.left > 1],
      [this.area.w - x - fit.width, r.right < vw - 1],
    ];
    return Math.min(Infinity, ...sides.filter(([, onScreen]) => onScreen).map(([room]) => room));
  }

  /** The garden's halo: hidden until solved, swelling at the solve, then a steady afterglow. */
  private drawHalo(): void {
    if (!this.halo) {
      // No layout to draw on (a rebuild bailed out): the swell is over, so the ticker can stop.
      this.haloFrom = null;
      return;
    }
    const solved = this.state?.solved ?? false;
    this.halo.visible = solved;
    if (!solved) return;
    if (this.haloFrom === null) {
      this.halo.alpha = CELEBRATION.afterglow;
      return;
    }
    const ms = this.time - this.haloFrom;
    this.halo.alpha = haloStrength(ms);
    if (ms >= CELEBRATION.haloRise + CELEBRATION.haloSettle) this.haloFrom = null;
  }

  /**
   * The solve, from the last firefly's landing (`at`): every firefly flashes together twice,
   * the halo swells, a wave of light rolls out in rings across the lit tiles, then the
   * fireflies lift off one by one and drift up into the night (the roses are opened by
   * `render`). Only ever called with motion on; reduced motion lands the afterglow at once.
   */
  private celebrate(origin: number, at: number): void {
    const T = CELEBRATION, board = this.board!, cell = this.fit!.cell;
    const flying = this.cells.filter((v) => v.fly?.root.visible === true);
    this.haloFrom = at;
    this.celebrateAt = at;
    this.tweens.push({
      start: at + T.flashStart, dur: T.flashDur,
      step: (t) => {
        const f = syncFlash(t);
        for (const v of flying) v.fly!.flash = f;
      },
    });
    // The wave: a soft burst of light over each lit tile, in rings from the last firefly.
    const lit = this.cells.filter((v) => v.kind === 'path' && glows(v.pendingLook ?? v.look));
    const wave = cappedRipple(lit.map((v) => v.cell), origin, board.w, T.wavePerCell, T.waveSpan, true);
    const moteTex = this.texture('wave', cell, (ctx) => drawMote(ctx, this.pal.css, cell));
    for (const v of lit) {
      const sp = new Sprite(moteTex);
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      sp.position.set(v.root.x + cell / 2, v.root.y + FACE_CENTER_Y * (cell / UNIT));
      sp.visible = false;
      this.flashLayer.addChild(sp);
      const size = cell * 1.25;
      this.tweens.push({
        start: at + T.waveStart + (wave.get(v.cell) ?? 0), dur: T.waveDur,
        step: (t) => {
          sp.visible = t < 1;
          sp.alpha = Math.sin(t * Math.PI) * 0.4;
          sp.width = sp.height = size * (0.75 + 0.35 * t);
          if (t >= 1) sp.destroy();
        },
      });
    }
    // The release: nearest the last firefly first.
    const order = cappedRipple(flying.map((v) => v.cell), origin, board.w, T.releasePerCell, T.releaseSpan, true);
    for (const v of flying) {
      this.tweens.push({ start: at + T.releaseStart + (order.get(v.cell) ?? 0), dur: 1, step: (t) => { if (t >= 1) this.release(v); } });
    }
  }

  /** A firefly leaves its tile for the night sky (its tile stays lit). */
  private release(v: CellView): void {
    // Reduced motion (also when it is switched on mid-celebration) keeps fireflies on their tiles.
    if (!this.fit || !this.art || !v.fly?.root.visible || !this.motion) return;
    const from = this.cellScreenCenter(v.cell);
    const gold = v.fly.kind === 'hint', phase = (v.cell * 2.39) % TAU;
    this.released.add(v.cell);
    v.fly.root.visible = false;
    // The page takes it from here when it can (up to the progress track, past the canvas edge).
    if (from && this.onRelease?.(from, gold, phase, this.fit.cell)) return;
    const cell = this.fit.cell;
    const fly = new FlyView(cell, this.art, v.fly.phase);
    fly.setKind(gold ? 'hint' : 'player');
    // Scaled about the firefly's centre as it goes away.
    const cx = cell / 2, cy = FACE_CENTER_Y * (cell / UNIT);
    fly.root.pivot.set(cx, cy);
    const x0 = v.root.x + cx, y0 = v.root.y + cy;
    fly.root.position.set(x0, y0);
    this.flightLayer.addChild(fly.root);
    // Climb past the canvas top (the stage sits `stage.y` below it), plus a cell to spare.
    const rise = (y0 + this.stage.y) / cell + 1;
    this.fliers.push({ fly, x0, y0, phase, rise, age: 0, lastTrail: 0 });
  }

  private endFlights(): void {
    for (const f of this.fliers) f.fly.root.destroy({ children: true });
    for (const t of this.trails) t.sp.destroy();
    this.fliers = [];
    this.trails = [];
  }

  private tickFlights(dt: number): void {
    if (!this.fit) return;
    const T = CELEBRATION, cell = this.fit.cell;
    const px = Math.max(6, Math.round(cell * 0.26));
    const moteTex = this.fliers.length > 0 ? this.texture('trail', px, (ctx) => drawMote(ctx, this.pal.css, px)) : null;
    this.fliers = this.fliers.filter((f) => {
      f.age += dt;
      const t = Math.min(1, f.age / T.flight);
      const p = flightAt(t, f.phase, f.rise);
      const x = f.x0 + p.x * cell, y = f.y0 + p.y * cell;
      f.fly.root.position.set(x, y);
      f.fly.root.scale.set(p.scale);
      f.fly.root.alpha = p.alpha;
      f.fly.tick(this.time, true, dt);
      // A mote every `trailEvery` ms where the firefly was, fading behind it.
      if (moteTex && f.age - f.lastTrail >= T.trailEvery && t < 0.9 && this.trails.length < T.trailCap) {
        f.lastTrail = f.age;
        const sp = new Sprite(moteTex);
        sp.anchor.set(0.5);
        sp.blendMode = 'add';
        sp.position.set(x, y + cell * 0.06);
        sp.width = sp.height = px * p.scale;
        sp.alpha = 0.9 * p.alpha;
        this.flightLayer.addChildAt(sp, 0);
        this.trails.push({ sp, scale: sp.scale.x, alpha: sp.alpha, age: 0 });
      }
      if (t >= 1) {
        f.fly.root.destroy({ children: true });
        return false;
      }
      return true;
    });
    this.trails = this.trails.filter((tr) => {
      tr.age += dt;
      const k = Math.min(1, tr.age / T.trailLife);
      tr.sp.alpha = tr.alpha * (1 - k);
      tr.sp.scale.set(tr.scale * (1 - 0.6 * k));
      tr.sp.y -= (dt / 1000) * cell * 0.1;
      if (k >= 1) {
        tr.sp.destroy();
        return false;
      }
      return true;
    });
  }

  private setLook(v: CellView, look: TileLook): void {
    delete v.pendingLook;
    delete v.pendingToken;
    v.look = look;
    v.tile!.texture = this.tileTexture(this.fit!.cell, look);
    v.tile!.alpha = 1;
  }

  /** The light's wash reaches this tile at `at`: it brightens in over a short fade. */
  private spreadTo(v: CellView, look: TileLook, at: number): void {
    const token = {};
    v.pendingLook = look;
    v.pendingToken = token;
    this.tweens.push({
      start: at, dur: MOTION_TIMING.spreadFade,
      step: (t) => {
        if (v.pendingToken !== token) return; // superseded by a later move
        if (v.look !== look) {
          v.look = look;
          v.tile!.texture = this.tileTexture(this.fit!.cell, look);
        }
        v.tile!.alpha = 0.55 + 0.45 * t;
        if (t >= 1) {
          delete v.pendingLook;
          delete v.pendingToken;
        }
      },
    });
  }

  /** Roses open one after another; at the solve, petals and motes rise from the bush. */
  private openRoses(v: CellView, at: number, solving: boolean): void {
    const roses = v.roses!.children as Sprite[];
    const u = this.fit!.cell / UNIT;
    roses.forEach((rose, k) => {
      const base = (ROSE_SLOTS[k]!.size * u) / rose.texture.width;
      rose.scale.set(0);
      this.tweens.push({
        start: at + k * MOTION_TIMING.roseStagger, dur: MOTION_TIMING.roseOpen,
        step: (t) => rose.scale.set(base * easeOutBack(t)),
      });
    });
    if (solving) this.particles(v, at, 5, 4, true);
  }

  /**
   * A tapped bush rustles: it shivers down and up, its roses bob one after another, and its dots
   * pulse once (they already show its count, so nothing new is revealed). Motion only; a tap while
   * it is still rustling waits for the next.
   */
  private rustle(v: CellView): void {
    if (!this.motion || !this.fit || !v.bush || v.rustling) return;
    v.rustling = true;
    const bush = v.bush, size = this.fit.cell, start = this.time;
    this.tweens.push({
      start, dur: 520,
      step: (t) => {
        const k = Math.sin(t * Math.PI * 3) * (1 - t) * 0.045;
        bush.scale.y = (size / bush.texture.height) * (1 - k);
        bush.y = size * k;
        if (t >= 1) v.rustling = false;
      },
    });
    if (v.roses?.visible) {
      const u = size / UNIT;
      (v.roses.children as Sprite[]).forEach((rose, k) => {
        // Its resting size (as openRoses sets it), never its scale now: it may still be opening.
        const base = (ROSE_SLOTS[k]!.size * u) / rose.texture.width;
        // Still opening (or waiting to): leave it to its own tween.
        if (rose.scale.x < base * 0.95) return;
        this.tweens.push({ start: start + k * 70, dur: 380, step: (t) => rose.scale.set(base * (1 + 0.22 * Math.sin(t * Math.PI))) });
      });
    }
    const pips = v.pips;
    if (pips) this.tweens.push({ start: start + 60, dur: 420, step: (t) => { pips.alpha = 1 - 0.55 * Math.sin(t * Math.PI); } });
    this.wake();
  }

  /** Too many: the bush sinks a little and springs back, and two petals fall. */
  private slump(v: CellView, at: number): void {
    const bush = v.bush!, size = this.fit!.cell;
    this.tweens.push({
      start: at, dur: MOTION_TIMING.slump,
      step: (t) => {
        const k = Math.sin(t * Math.PI) * 0.08;
        bush.scale.y = (size / bush.texture.height) * (1 - k);
        bush.y = size * k;
      },
    });
    this.particles(v, at, 2, 0, false);
  }

  /**
   * Petals and sparks leaving a bush. Purely decorative. A `burst` (the solve's bloom) throws
   * petals up and out from the roses; they tumble back down under gravity, fluttering, while
   * small sparks of light rise from the leaves and twinkle out. Without a burst (a slump) the
   * petals just fall. Seeded by cell, so a garden always plays the same.
   */
  private particles(v: CellView, at: number, petals: number, sparks: number, burst: boolean): void {
    const size = this.fit!.cell, c = this.pal.css, u = size / UNIT;
    const petalPx = Math.max(5, Math.round(size * 0.13)), sparkPx = Math.max(8, Math.round(size * 0.3));
    const petalTex = this.texture('petal', petalPx, (ctx) => drawPetal(ctx, c, petalPx));
    const sparkTex = this.texture('spark', sparkPx, (ctx) => drawSpark(ctx, c, sparkPx));
    const rnd = (k: number, n: number) => (Math.imul(v.cell * 131 + k * 17 + n * 7 + 1, 0x9e3779b1) >>> 0) / 4294967296;
    for (let k = 0; k < petals; k++) {
      const slot = ROSE_SLOTS[k % ROSE_SLOTS.length]!;
      const x0 = v.root.x + (slot.x + slot.size / 2) * u, y0 = v.root.y + (slot.y + slot.size / 2) * u;
      // Velocities in cells per second, gravity in cells per second squared.
      const vx = burst ? (rnd(k, 1) - 0.5) * 1.3 : (rnd(k, 1) - 0.5) * 0.3;
      const vy = burst ? -(0.85 + 0.55 * rnd(k, 2)) : 0.15;
      const g = burst ? 3 : 1.1;
      const spin = (rnd(k, 3) - 0.5) * 9, flutter = 7 + 5 * rnd(k, 4), dur = burst ? 1300 : 1100;
      const sp = new Sprite(petalTex);
      sp.anchor.set(0.5);
      sp.width = sp.height = petalPx;
      const base = sp.scale.x;
      sp.visible = false;
      this.particleLayer.addChild(sp);
      this.tweens.push({
        start: at + k * 60 + rnd(k, 5) * 80, dur,
        step: (t) => {
          const sec = (t * dur) / 1000;
          sp.visible = t < 1;
          sp.x = x0 + (vx * sec + Math.sin(sec * 5 + k) * 0.04) * size;
          sp.y = y0 + (vy * sec + 0.5 * g * sec * sec) * size;
          sp.rotation = spin * sec;
          // The petal turning over as it falls: its width swings through edge-on and back.
          sp.scale.set(base * (0.35 + 0.65 * Math.abs(Math.cos(sec * flutter))), base);
          sp.alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
          if (t >= 1) sp.destroy();
        },
      });
    }
    for (let k = 0; k < sparks; k++) {
      const x0 = v.root.x + size * (0.2 + 0.6 * rnd(k, 11)), y0 = v.root.y + size * (0.22 + 0.32 * rnd(k, 12));
      const rise = size * (0.6 + 0.45 * rnd(k, 13)), sway = (rnd(k, 14) - 0.5) * size * 0.3, dur = 1500 + 400 * rnd(k, 15);
      const sp = new Sprite(sparkTex);
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      sp.width = sp.height = sparkPx;
      const base = sp.scale.x;
      sp.visible = false;
      this.particleLayer.addChild(sp);
      this.tweens.push({
        start: at + 120 + k * 110 + rnd(k, 16) * 90, dur,
        step: (t) => {
          sp.visible = t < 1;
          sp.x = x0 + Math.sin(t * Math.PI * 1.5) * sway;
          sp.y = y0 - rise * (1 - (1 - t) * (1 - t));
          // Rises in, twinkles, and goes out.
          const twinkle = 0.7 + 0.3 * Math.sin(t * 28 + k * 2);
          sp.alpha = Math.sin(t * Math.PI) * twinkle;
          sp.scale.set(base * (0.6 + 0.5 * Math.sin(t * Math.PI)));
          if (t >= 1) sp.destroy();
        },
      });
    }
  }

  /**
   * Work out which beams the board shows: one per pair of fireflies that see each other, pulled
   * clear of both. A beam that was already showing keeps its start time; a new one starts now.
   */
  private drawBeams(ev: Evaluation, bornAt = this.time): void {
    const before = this.beamSegs;
    const was = new Map(before.filter((b) => b.gone === undefined).map((b) => [b.key, b.born]));
    const next: typeof this.beamSegs = [];
    if (this.board && this.fit && ev.conflicts.length > 0) {
      const { cell } = this.fit;
      const u = cell / UNIT;
      // Each end leaves from the firefly's glowing tail, pulled out just clear of its body.
      const at = new Map(this.cells.map((v) => [v.cell, { x: v.root.x + BEAM_SOURCE.x * u, y: v.root.y + BEAM_SOURCE.y * u }]));
      for (const [a, b] of conflictPairs(this.board, ev.fireflies)) {
        const pa = at.get(a), pb = at.get(b);
        const ends = pa && pb ? beamEnds(pa, pb, BEAM_SOURCE.inset * u) : null;
        if (!ends) continue;
        const key = `${a}-${b}`;
        const [x0, y0, x1, y1] = ends;
        // Without motion a beam is simply there; with it, a new beam shoots in from both fireflies.
        next.push({ key, x0, y0, x1, y1, born: was.get(key) ?? (this.motion ? bornAt : -Infinity) });
      }
    }
    // A beam whose conflict is over pulls back into its fireflies (with motion); without, it just goes.
    if (this.motion) {
      const live = new Set(next.map((b) => b.key));
      for (const b of before) {
        if (live.has(b.key)) continue;
        if (b.gone === undefined) next.push({ ...b, gone: this.time });
        else if (this.time - b.gone < BEAM.retractMs) next.push(b);
      }
    }
    this.beamSegs = next;
    this.paintBeams();
  }

  /**
   * "Crossed gazes": two streaks race from the fireflies to meet in the middle; then sparks stream
   * from each firefly toward the meeting point, the line between quivers like a plucked string, and
   * a small star flickers where the gazes clash. Reduced motion: the line and the star, still.
   */
  private paintBeams(): void {
    const g = this.beams;
    g.clear();
    if (!this.fit || this.beamSegs.length === 0) return;
    const cell = this.fit.cell, t = this.time, warn = this.pal.warn, hot = this.pal.warnGlow;
    // Retracted beams are done.
    this.beamSegs = this.beamSegs.filter((b) => b.gone === undefined || (this.motion && t - b.gone < BEAM.retractMs));
    for (const b of this.beamSegs) {
      const reveal = b.gone !== undefined ? Math.min(beamReveal(t - b.born), beamRetract(t - b.gone))
        : this.motion ? beamReveal(t - b.born) : 1;
      if (reveal <= 0) continue;
      const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      const len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
      const nx = -(b.y1 - b.y0) / len, ny = (b.x1 - b.x0) / len;
      // Each half grows from its firefly toward the middle.
      const halves: [number, number, number, number][] = [
        [b.x0, b.y0, b.x0 + (mx - b.x0) * reveal, b.y0 + (my - b.y0) * reveal],
        [b.x1, b.y1, b.x1 + (mx - b.x1) * reveal, b.y1 + (my - b.y1) * reveal],
      ];
      // Where each gaze leaves its firefly: a small glow, breathing with motion.
      const breath = this.motion ? 0.85 + 0.15 * Math.sin(t / 160) : 1;
      for (const [ax, ay] of halves) {
        g.circle(ax, ay, cell * 0.1 * breath * Math.min(1, reveal * 2)).fill({ color: hot, alpha: 0.45 });
        g.circle(ax, ay, cell * 0.045 * Math.min(1, reveal * 2)).fill({ color: hot, alpha: 0.9 });
      }
      // A soft glow under the line.
      for (const [ax, ay, bx, by] of halves) g.moveTo(ax, ay).lineTo(bx, by);
      g.stroke({ width: cell * 0.16, color: warn, alpha: 0.2, cap: 'round' });
      // The taut string, quivering (still without motion).
      const amp = this.motion && reveal >= 1 ? cell * 0.05 * (0.65 + 0.35 * Math.sin((t / BEAM.swellMs) * Math.PI)) : 0;
      halves.forEach(([ax, ay], h) => {
        const steps = 10;
        for (let k = 0; k <= steps; k++) {
          const f = (k / steps) * reveal; // 0 at the firefly, `reveal` at the furthest point
          const s = h === 0 ? f / 2 : 1 - f / 2; // position along the whole beam
          const off = amp * quiver(s, t);
          const x = ax + (mx - ax) * f + nx * off, y = ay + (my - ay) * f + ny * off;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      });
      g.stroke({ width: Math.max(1.5, cell * 0.038), color: warn, alpha: 0.9, cap: 'round', join: 'round' });
      if (reveal < 1) {
        // The streaks' leading sparks while they race in (or pull back out).
        for (const [, , bx, by] of halves) g.circle(bx, by, cell * 0.055).fill({ color: hot, alpha: 0.95 });
        continue;
      }
      // Sparks streaming from each firefly toward the meeting point, brightest midway.
      if (this.motion) {
        for (const [ax, ay] of halves) {
          for (const s of gazeMotes(t)) {
            const x = ax + (mx - ax) * s, y = ay + (my - ay) * s;
            const a = Math.sin(Math.PI * s);
            g.circle(x, y, cell * (0.035 + 0.04 * a)).fill({ color: hot, alpha: 0.95 * a });
            g.circle(x, y, cell * 0.022 * a).fill({ color: warn, alpha: a });
          }
        }
      }
      // The clash: a small star where the gazes meet, flickering and turning with motion.
      const flick = this.motion ? 0.75 + 0.25 * Math.sin(t / 47) * Math.sin(t / 131) : 1;
      const turn = this.motion ? t / 900 : Math.PI / 4;
      const ray = cell * 0.19 * flick;
      for (let k = 0; k < 4; k++) {
        const ang = turn + (k * Math.PI) / 2;
        g.moveTo(mx + Math.cos(ang) * ray * 0.35, my + Math.sin(ang) * ray * 0.35).lineTo(mx + Math.cos(ang) * ray, my + Math.sin(ang) * ray);
      }
      g.stroke({ width: Math.max(2, cell * 0.04), color: warn, alpha: 0.95, cap: 'round' });
      g.circle(mx, my, cell * 0.16 * flick).fill({ color: hot, alpha: 0.35 });
      g.circle(mx, my, cell * 0.085 * flick).fill({ color: hot, alpha: 0.95 });
      g.circle(mx, my, cell * 0.04).fill({ color: warn, alpha: 1 });
    }
  }

  /** The dashed gold outline around the cells a hint names (one shape per touching group). */
  private drawOutline(because: ReadonlySet<number>): void {
    // Redraw only when the named cells change (a move with the same hint showing keeps its shape).
    const key = [...because].sort((x, y) => x - y).join(',');
    if (key === this.outlineKey) return;
    this.outlineKey = key;
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

  /**
   * Milliseconds until the solve's celebration starts on the board (the last firefly may still be
   * flying in from the jar), or null when there is none (reduced motion, or no fresh solve).
   */
  celebrationStartsIn(): number | null {
    return this.celebrateAt === null ? null : Math.max(0, this.celebrateAt - this.time);
  }

  /** Frames drawn and time elapsed since load (dev readout, e2e perf check). */
  frameStats(): { count: number; ms: number } {
    return { ...this.frames };
  }

  private tick(dt: number): void {
    this.frames.count++;
    this.frames.ms += dt;
    this.time += dt;
    if (this.tweens.length > 0) {
      this.tweens = this.tweens.filter((tw) => {
        if (this.time < tw.start) return true;
        const t = Math.min(1, (this.time - tw.start) / tw.dur);
        tw.step(t);
        return t < 1;
      });
    }
    for (const v of this.cells) {
      if (v.fly?.root.visible) v.fly.tick(this.time, this.motion, dt);
    }
    if (this.fliers.length > 0 || this.trails.length > 0) this.tickFlights(dt);
    if (this.haloFrom !== null) this.drawHalo();
    // Conflict beams move every frame with motion on (fireflies are bobbing then anyway); still without.
    if (this.beamSegs.length > 0 && (this.motion || this.beamSegs.some((b) => b.gone !== undefined))) this.paintBeams();
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
    // This frame still draws (the app renders after this listener); later ones wait for a change.
    if (!this.animating()) this.app.ticker.stop();
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
    for (const t of this.textures.values()) t.destroy(true);
    this.textures.clear();
    this.haloTexture?.destroy(true);
    this.haloTexture = null;
  }
}

/** Draw into a fresh canvas at the device's resolution (capped at 3×) and wrap it as a texture. */
function bake(size: number, draw: (ctx: CanvasRenderingContext2D, px: number) => void, box?: { w: number; h: number }): Texture {
  const res = Math.min(3, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((box?.w ?? size) * res);
  canvas.height = Math.ceil((box?.h ?? size) * res);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.scale(res, res);
  draw(ctx, size);
  return Texture.from(canvas);
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
