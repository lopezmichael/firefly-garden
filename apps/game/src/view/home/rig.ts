import { Container, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import type { CastArt, RigPart, RigPivot } from './art.ts';
import type { RigMotion } from './cast.ts';

/**
 * A cut-out puppet of a lantern-bug (Pip or a friend): every part was painted alone, in place,
 * and baked (`art/home/bake.js`); here the parts are reassembled on their joints and moved live:
 * breathing, a swaying body, a tilting and nodding head, flapping wings, lagging antennae, a
 * swinging tassel, waving arms, blinks, wandering eyes and the odd grin. Coordinates are scene
 * pixels relative to the character's centre.
 */
export interface Rig {
  readonly root: Container;
  /** Pose at time `t` (seconds); `dt` is the step since the last call. */
  update(t: number, dt: number): void;
  /** End any blink or grin under way (before a still frame). */
  reset(): void;
}

export function buildRig(art: CastArt, motion: RigMotion, part: (name: RigPart) => Texture | null, glow: Sprite[]): Rig {
  const piv = (k: RigPivot) => art.pivots[k];
  const sprite = (name: RigPart): Sprite | null => {
    const tex = part(name), p = art.parts[name];
    if (!tex || !p) return null;
    const s = new Sprite(tex);
    s.position.set(p.dx, p.dy);
    return s;
  };
  /** A group that turns on joint `k`, its children still drawn in the character's own coordinates. */
  const joint = (k: RigPivot, ...kids: (Sprite | Container | null)[]): Container => {
    const c = new Container();
    const [px, py] = piv(k);
    c.pivot.set(px, py);
    c.position.set(px, py);
    for (const kid of kids) if (kid) c.addChild(kid);
    return c;
  };

  const root = new Container();
  for (const g of glow) root.addChild(g);
  const wingL = joint('wingL', sprite('wingL')), wingR = joint('wingR', sprite('wingR'));
  const armL = joint('armL', sprite('armL')), armR = joint('armR', sprite('armR')), tassel = joint('tassel', sprite('tassel'));
  const body = joint('body', armL, armR, sprite('lantern'), tassel, sprite('garlandBack'));
  const antL = joint('antL', sprite('antL')), antR = joint('antR', sprite('antR'));
  const pupils = sprite('pupils');
  const eyes = joint('eyes', sprite('eyes'), pupils);
  const mouth = sprite('mouth'), grin = sprite('grin');
  if (grin) grin.visible = false;
  const head = joint('neck', antL, antR, sprite('head'), eyes, mouth, grin);
  const front = joint('body', sprite('garlandFront'));
  root.addChild(wingL, wingR, body, head, front);

  const neckY = piv('neck')[1], bodyY = piv('body')[1];
  const pupilAt = pupils ? { x: pupils.x, y: pupils.y } : { x: 0, y: 0 };
  const m = motion, ph = m.phase;
  let nextBlink = 1 + Math.random() * 2, blinkEnd = -1, nextLook = 1, nextGrin = 4 + Math.random() * 4, grinEnd = -1;
  let lookX = 0, lookY = 0, toX = 0, toY = 0;
  const glowAlpha = glow.map((g) => g.alpha);

  return {
    root,
    reset() {
      blinkEnd = -1;
      grinEnd = -1;
    },
    update(t, dt) {
      // breathing: the lantern swells and narrows; the head rides on top of it
      const br = Math.sin(t * 2.2 + ph);
      body.scale.set(1 - 0.025 * br, 1 + 0.035 * br);
      front.scale.copyFrom(body.scale);
      body.skew.x = 0.05 * Math.sin(t * 1.7 + ph);
      front.skew.x = body.skew.x;
      head.position.y = neckY + (neckY - bodyY) * (body.scale.y - 1);
      head.rotation = (m.headTilt ?? 0) + 0.07 * Math.sin(t * 1.3 + ph) + (m.nod ? 0.05 * Math.max(0, Math.sin(t * 0.9 + ph)) ** 8 : 0);
      const flap = Math.sin(t * (m.flapSpeed ?? 15) + ph);
      wingL.rotation = 0.22 * flap - (m.wingUp ?? 0);
      wingR.rotation = -0.22 * flap + (m.wingUp ?? 0);
      // antennae trail the head; the tassel trails the body
      antL.rotation = 0.14 * Math.sin(t * 2.4 + ph - 0.7) - head.rotation * 0.4;
      antR.rotation = -0.14 * Math.sin(t * 2.4 + ph - 1) - head.rotation * 0.4;
      tassel.rotation = 0.22 * Math.sin(t * 1.9 + ph - 0.5) - body.skew.x * 2;
      armL.rotation = (m.armL ?? 0) + (m.armLWiggle ?? 0.08) * Math.sin(t * (m.armLSpeed ?? 2.4) + ph);
      armR.rotation = (m.armR ?? 0) + (m.armRWiggle ?? 0.08) * Math.sin(t * (m.armRSpeed ?? 2.4) + ph + 1);
      glow.forEach((g, i) => { g.alpha = glowAlpha[i]! * (0.82 + 0.18 * Math.sin(t * 3.1 + ph)); });
      if (!m.noBlink) {
        if (t > nextBlink) { blinkEnd = t + 0.14; nextBlink = t + 2.4 + Math.random() * 2.6; }
        eyes.scale.y = t < blinkEnd ? 0.12 : 1;
      }
      if (m.lookAt && t > nextLook) {
        const to = m.lookAt[Math.floor(Math.random() * m.lookAt.length)]!;
        toX = to[0]; toY = to[1];
        nextLook = t + 1.2 + Math.random() * 1.8;
      }
      const ease = Math.min(1, dt * 8);
      lookX += (toX - lookX) * ease;
      lookY += (toY - lookY) * ease;
      pupils?.position.set(pupilAt.x + lookX * art.u * 0.05, pupilAt.y + lookY * art.u * 0.05);
      if (m.grin && mouth && grin) {
        if (t > nextGrin) { grinEnd = t + 1.1; nextGrin = t + 5 + Math.random() * 4; }
        grin.visible = t < grinEnd;
        mouth.visible = !grin.visible;
      }
    },
  };
}
