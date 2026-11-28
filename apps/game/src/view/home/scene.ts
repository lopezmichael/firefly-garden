import 'pixi.js/unsafe-eval';
import { Application, Container, ImageSource, Rectangle, Sprite, Texture } from 'pixi.js';
import castUrl from '../../assets/home/cast.webp';
import sceneUrl from '../../assets/home/scene.webp';
import type { HomeFit } from '../layout.ts';
import type { Palette } from '../theme.ts';
import { HOME_ART } from './art.ts';
import type { Rect4, RigPart } from './art.ts';
import { CAST } from './cast.ts';
import { buildRig } from './rig.ts';
import type { Rig } from './rig.ts';

/**
 * The home screen's living scene (docs/plans/2026-11-28-home-screen.md): the baked still plate,
 * the arch lantern's light flickering, fireflies drifting and blinking over the meadow, the friends
 * bobbing with every part moving, Pip waving from the arch with hearts rising, and petals falling.
 * Nothing is painted per frame: sprites from two images move. Under reduced motion it draws one
 * still frame (a natural pose, no drift) and stops. It stops drawing while the tab is hidden.
 */

const DOTS = 26;
const PETALS = 16;
const HEARTS = 4;

interface Dot { c: Container; halo: Sprite; core: Sprite; bx: number; by: number; ph: number; sp: number; bl: number }
interface Petal { s: Sprite; x: number; y: number; vx: number; vy: number; rot: number; vr: number; sway: number }
interface Heart { s: Sprite; life: number; x0: number; y0: number }
interface Friend { c: Container; flash: Sprite; rig: Rig; x: number; y: number; ph: number; bob: number; drift: number }

async function image(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** One soft round light, white so each use tints it: the painter's glow falloff. */
function glowTexture(c: Palette['css']): Texture {
  const px = 128, r = px / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, `${c.wing}ff`);
  g.addColorStop(0.22, `${c.wing}73`);
  g.addColorStop(0.6, `${c.wing}1f`);
  g.addColorStop(1, `${c.wing}00`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  return Texture.from(cv);
}

export class HomeScene {
  private readonly stage = new Container();
  private readonly dots: Dot[] = [];
  private readonly petals: Petal[] = [];
  private readonly hearts: Heart[] = [];
  private readonly friends: Friend[] = [];
  private readonly pip: { rig: Rig; c: Container; x: number; y: number } | null;
  private readonly lantern: { halo: Sprite; core: Sprite };
  /** Textures that own their image (destroyed with it), and the cuts that share the atlas (destroyed without). */
  private readonly owners: Texture[] = [];
  private readonly cuts: Texture[] = [];
  private motion: boolean;
  private visible = true;
  private t = 0;
  private nextHeart = 1;
  /** Frames drawn, for the end-to-end tests (a still scene draws none). */
  frames = 0;

  private constructor(private readonly app: Application, plate: HTMLImageElement, atlas: HTMLImageElement, palette: Palette, motion: boolean) {
    this.motion = motion;
    const sceneScale = HOME_ART.scene.scale, atlasScale = HOME_ART.atlas.scale;
    const glowTex = glowTexture(palette.css);
    const plateTex = new Texture({ source: new ImageSource({ resource: plate, resolution: sceneScale }) });
    const atlasSource = new ImageSource({ resource: atlas, resolution: atlasScale });
    const atlasTex = new Texture({ source: atlasSource });
    this.owners.push(glowTex, plateTex, atlasTex);
    const cut = (r: Rect4): Texture => {
      const t = new Texture({ source: atlasSource, frame: new Rectangle(r[0] / atlasScale, r[1] / atlasScale, r[2] / atlasScale, r[3] / atlasScale) });
      this.cuts.push(t);
      return t;
    };
    const glow = (x: number, y: number, radius: number, tint: number, alpha: number): Sprite => {
      const s = new Sprite(glowTex);
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.width = s.height = radius * 2;
      s.tint = tint;
      s.alpha = alpha;
      s.blendMode = 'add';
      return s;
    };
    const add = <T extends Container>(o: T): T => { this.stage.addChild(o); return o; };

    add(new Sprite(plateTex));
    const L = HOME_ART.lantern;
    this.lantern = { halo: add(glow(L.x, L.y + 9, 170, palette.lanternLight, 0.5)), core: add(glow(L.x, L.y, 26, palette.glowSoft, 0.55)) };

    // fireflies over the meadow, each drifting and blinking on its own (a fixed spread, not random)
    for (let i = 0; i < DOTS; i++) {
      const c = new Container();
      const halo = glow(0, 0, 22, palette.glowSoft, 0.35), core = glow(0, 0, 4, palette.glow, 1);
      c.addChild(halo, core);
      const bx = 20 + ((i * 137.5) % 350), by = 290 + ((i * 211.3) % 450);
      c.position.set(bx, by);
      add(c);
      this.dots.push({ c, halo, core, bx, by, ph: (i * 2.39) % 6.28, sp: 0.3 + ((i * 0.37) % 0.5), bl: (i * 1.71) % 6.28 });
    }

    // the cast: friends first, Pip on the arch in front
    let pip: HomeScene['pip'] = null;
    for (const art of HOME_ART.cast) {
      const member = CAST[art.id];
      if (!member) continue;
      const tint = palette[member.glow];
      const strength = art.id === 'pip' ? 1 : 0.9;
      const lights = [glow(0, 0.55 * art.u, 3.2 * art.u, tint, 0.34 * strength), glow(0, 0.6 * art.u, 1.3 * art.u, tint, 0.4 * strength)];
      const rig = buildRig(art, member.motion, (name: RigPart) => {
        const p = art.parts[name];
        return p ? cut(p.rect) : null;
      }, lights);
      if (art.id === 'pip') {
        add(rig.root).position.set(art.x, art.y);
        pip = { rig, c: rig.root, x: art.x, y: art.y };
      } else {
        const c = new Container();
        const flash = glow(0, 8, 60, tint, 0.2);
        c.addChild(flash, rig.root);
        c.position.set(art.x, art.y);
        add(c);
        this.friends.push({ c, flash, rig, x: art.x, y: art.y, ph: member.motion.phase, bob: member.bob, drift: member.drift });
      }
    }
    // Pip draws over the friends (it sits nearest, on the arch)
    if (pip) this.stage.addChild(pip.c);
    this.pip = pip;

    const petalTex = cut(HOME_ART.fx.petal), heartTex = cut(HOME_ART.fx.heart);
    for (let i = 0; i < PETALS; i++) {
      const s = add(new Sprite(petalTex));
      s.anchor.set(0.5);
      const p: Petal = { s, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, sway: 0 };
      this.resetPetal(p, true, i);
      this.petals.push(p);
    }
    for (let i = 0; i < HEARTS; i++) {
      const s = add(new Sprite(heartTex));
      s.anchor.set(0.5);
      s.alpha = 0;
      this.hearts.push({ s, life: -1, x0: 0, y0: 0 });
    }

    app.stage.addChild(this.stage);
    // While it moves, Pixi draws after this on its own ticker; a still frame is drawn by hand (draw()).
    app.ticker.add((tk) => this.step(tk.deltaMS));
    this.still();
    this.apply();
  }

  /** The scene in `host`, sized to `fit`. Rejects if its images can't load (the screen then shows without it). */
  static async create(host: HTMLElement, palette: Palette, fit: HomeFit, motion: boolean): Promise<HomeScene> {
    const [plate, atlas] = await Promise.all([image(sceneUrl), image(castUrl)]);
    const app = new Application();
    try {
      await app.init({
        width: Math.max(1, fit.w), height: Math.max(1, fit.h),
        backgroundAlpha: 0, antialias: true, autoDensity: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        preference: 'webgl', hello: false, autoStart: false,
      });
      app.canvas.setAttribute('aria-hidden', 'true');
      host.appendChild(app.canvas);
      const scene = new HomeScene(app, plate, atlas, palette, motion);
      scene.resize(fit);
      return scene;
    } catch (err) {
      // No WebGL, or a failed build: leave nothing behind (the screen works without its garden).
      app.destroy(true, { children: true });
      throw err;
    }
  }

  resize(fit: HomeFit): void {
    this.app.renderer.resize(Math.max(1, fit.w), Math.max(1, fit.h));
    this.stage.scale.set(fit.k);
    this.draw();
  }

  setMotion(on: boolean): void {
    this.motion = on;
    if (!on) this.still();
    this.apply();
  }

  /** The tab was hidden or shown: nothing is drawn while no one can see it. */
  setVisible(on: boolean): void {
    this.visible = on;
    this.apply();
  }

  destroy(): void {
    this.app.ticker.stop();
    this.app.destroy(true, { children: true });
    for (const t of this.cuts) t.destroy(false);
    for (const t of this.owners) t.destroy(true);
  }

  private apply(): void {
    if (this.motion && this.visible) this.app.ticker.start();
    else {
      this.app.ticker.stop();
      if (this.visible) this.draw();
    }
  }

  private draw(): void {
    this.app.render();
    this.frames++;
  }

  private step(deltaMS: number): void {
    const dt = Math.min(0.05, deltaMS / 1000);
    this.t += dt;
    this.pose(this.t, dt);
    this.frames++;
  }

  /** The still frame (reduced motion): a natural pose, eyes open, no grin, no hearts, petals at their fixed spread. */
  private still(): void {
    for (const f of this.friends) f.rig.reset();
    this.pip?.rig.reset();
    for (const h of this.hearts) h.life = -1;
    this.petals.forEach((p, i) => this.resetPetal(p, true, i));
    this.pose(0.6, 0);
  }

  /** Everything at time `t`. A still frame (reduced motion) is `pose(t, 0)`: no drift, no hearts. */
  private pose(t: number, dt: number): void {
    const live = dt > 0;
    this.lantern.halo.alpha = 0.45 + 0.07 * Math.sin(t * 7) + 0.04 * Math.sin(t * 13.3);
    this.lantern.core.alpha = 0.5 + 0.12 * Math.sin(t * 11);
    for (const d of this.dots) {
      d.c.x = d.bx + (live ? Math.sin(t * d.sp + d.ph) * 14 : 0);
      d.c.y = d.by + (live ? Math.cos(t * d.sp * 0.8 + d.ph) * 10 : 0);
      const b = live ? 0.5 + 0.5 * Math.sin(t * 1.7 + d.bl) : 0.7;
      d.core.alpha = 0.35 + 0.65 * b;
      d.halo.alpha = 0.1 + 0.3 * b;
    }
    // a slow wave of light passes across the friends, left to right
    const wave = (x: number) => { const p = (((t - x * 0.004) % 5) + 5) % 5; return p < 0.5 ? Math.sin((p / 0.5) * Math.PI) : 0; };
    for (const f of this.friends) {
      f.c.y = f.y + Math.sin(t * 1.6 + f.ph) * f.bob;
      f.c.x = f.x + Math.sin(t * 0.7 + f.ph) * f.drift;
      f.c.rotation = Math.sin(t * 1.1 + f.ph) * 0.05;
      f.flash.alpha = 0.18 + (live ? 0.6 * wave(f.x) : 0);
      f.rig.update(t, dt);
    }
    if (this.pip) {
      this.pip.rig.update(t, dt);
      this.pip.c.y = this.pip.y + Math.sin(t * 2) * 4;
      this.pip.c.rotation = Math.sin(t * 1.3) * 0.035;
    }
    if (live && this.pip && t > this.nextHeart) {
      const h = this.hearts.find((x) => x.life < 0);
      if (h) { h.life = 0; h.x0 = this.pip.c.x + 10 + Math.random() * 20; h.y0 = this.pip.c.y - 40; }
      this.nextHeart = t + 1.6 + Math.random();
    }
    for (const h of this.hearts) {
      if (h.life < 0) { h.s.alpha = 0; continue; }
      h.life += dt;
      const k = h.life / 1.6;
      h.s.position.set(h.x0 + Math.sin(k * 6) * 4, h.y0 - k * 34);
      h.s.alpha = k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.5) / 0.5);
      h.s.scale.set(0.6 + 0.4 * Math.min(1, k * 3));
      if (k >= 1) { h.life = -1; h.s.alpha = 0; }
    }
    for (const p of this.petals) {
      if (live) {
        p.sway += dt;
        p.x += (p.vx + Math.sin(p.sway * 1.3) * 10) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      p.s.position.set(p.x, p.y);
      p.s.rotation = p.rot;
      p.s.alpha = Math.max(0, Math.min(1, (760 - p.y) / 80));
      if (p.y > 770 || p.x < -20) this.resetPetal(p, false, 0);
    }
  }

  private resetPetal(p: Petal, first: boolean, i: number): void {
    // the first spread is fixed (a still frame always looks the same); later petals are random
    const r = first ? (a: number, b: number, k: number) => a + (b - a) * (((i + 1) * k) % 1) : (a: number, b: number) => a + Math.random() * (b - a);
    p.x = r(80, 460, 0.618);
    p.y = first ? r(260, 760, 0.414) : r(250, 330, 0);
    p.vx = r(-28, -14, 0.291);
    p.vy = r(16, 30, 0.733);
    p.rot = r(0, 6.28, 0.177);
    p.vr = r(-2, 2, 0.529);
    p.sway = r(0, 6.28, 0.871);
  }
}
