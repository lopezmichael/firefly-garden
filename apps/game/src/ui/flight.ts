/**
 * A firefly flying between the jar (in the status card) and a tile on the
 * board: a small DOM sprite animated along a curved path above both, so it can
 * cross from the page into the canvas. Decorative: the state has already
 * changed when it starts, and reduced motion skips it entirely.
 */

import { flightPath, releasePath } from '../view/layout.ts';
import type { Point } from '../view/layout.ts';

/** Flight length in milliseconds; the board delays the landing by about this much. */
export const FLIGHT_MS = 560;

// Constant markup, never game or player data: firefly C from the design canvas, seen in
// flight. Colors come from CSS classes (theme tokens); the glow is the sprite's own
// CSS background, so no SVG gradient ids can clash between two fliers.
export const FIREFLY_SVG = '<svg viewBox="0 0 30 30">'
  + '<path class="ff-flier-wing ff-flier-wing-l" d="M13.5 12 C9 7 5.5 9.5 7.5 12.5 C9 14.5 12 14 13.5 13 Z"></path>'
  + '<path class="ff-flier-wing ff-flier-wing-r" d="M16.5 12 C21 7 24.5 9.5 22.5 12.5 C21 14.5 18 14 16.5 13 Z"></path>'
  + '<circle class="ff-flier-tail" cx="15" cy="17" r="4.4"></circle>'
  + '<path class="ff-flier-ribs" d="M11.2 16 q3.8 1.8 7.6 0 M11.2 18.6 q3.8 1.8 7.6 0"></path>'
  + '<circle class="ff-flier-head" cx="15" cy="10.8" r="2.2"></circle>'
  + '<path class="ff-flier-feelers" d="M14.3 9 q-0.8 -3 -3 -3.4 q-1 0 -0.6 0.8 M15.7 9 q0.8 -3 3 -3.4 q1 0 0.6 0.8"></path>'
  + '</svg>';

const live = new Set<Animation>();

/** Stop every flight now (level change, resize): their screen positions no longer apply. */
export function cancelFlights(): void {
  for (const a of [...live]) a.cancel();
}

/** A released firefly's flight from its tile to the garden progress track, in milliseconds. */
export const RELEASE_MS = 1400;
/** Glints in a released firefly's comet trail, each a little later, smaller and fainter. */
const TRAIL = 6;

/**
 * At the solve: one firefly flies from its tile (`from`) up to the garden progress track (`to`),
 * a short comet trail of glints behind it, and dissolves into the track; `arrive` runs when it
 * lands (not when cancelled). Viewport pixels. Every sprite removes itself.
 */
export function release(layer: HTMLElement, from: Point, to: Point, gold: boolean, phase: number, cellPx: number, arrive: () => void): void {
  // Leave the tile at the board firefly's size (its drawing spans about 0.75 of a cell, the
  // flier's 34 px box about 0.9 of its own), and shrink to a small light by the track.
  const start = Math.max(1, (cellPx * 0.75) / (34 * 0.9)), end = 0.35;
  const path = releasePath(from, to, phase);
  const last = path.length - 1;
  const at = (p: Point, scale: number) => `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${scale.toFixed(2)})`;
  const sprites: HTMLElement[] = [];
  const easing = 'cubic-bezier(0.45, 0, 0.55, 1)';
  for (let k = TRAIL; k >= 1; k--) {
    const glint = document.createElement('div');
    glint.className = 'ff-trail';
    glint.setAttribute('aria-hidden', 'true');
    layer.append(glint);
    sprites.push(glint);
    const fade = 0.75 * (1 - k / (TRAIL + 1));
    const frames = path.map((p, i) => ({
      transform: at(p, (1 - k / (TRAIL + 2)) * (i === last ? 0.4 : 1)),
      opacity: i === 0 || i === last ? 0 : fade,
    }));
    const a = glint.animate(frames, { duration: RELEASE_MS, delay: k * 38, easing, fill: 'both' });
    track(a, () => glint.remove());
  }
  const sprite = document.createElement('div');
  sprite.className = 'ff-flier';
  sprite.dataset.gold = String(gold);
  sprite.setAttribute('aria-hidden', 'true');
  sprite.innerHTML = FIREFLY_SVG;
  layer.append(sprite);
  sprites.push(sprite);
  const frames = path.map((p, i) => ({
    transform: at(p, start + (end - start) * Math.pow(i / last, 0.6)),
    opacity: i === last ? 0 : 1,
  }));
  const anim = sprite.animate(frames, { duration: RELEASE_MS, easing });
  anim.onfinish = () => arrive();
  track(anim, () => sprite.remove());
  // Backstop: a hidden tab can hold the animation timeline; never leave a sprite behind.
  setTimeout(() => sprites.forEach((s) => s.remove()), RELEASE_MS + TRAIL * 38 + 600);
}

/** Keep `anim` cancellable by `cancelFlights`, running `done` once it finishes or is cancelled. */
function track(anim: Animation, done: () => void): void {
  live.add(anim);
  const end = () => {
    live.delete(anim);
    done();
  };
  anim.addEventListener('finish', end);
  anim.addEventListener('cancel', end);
}

/** Fly one firefly from `from` to `to` (viewport pixels). The sprite removes itself. */
export function fly(layer: HTMLElement, from: Point, to: Point, gold: boolean): void {
  const sprite = document.createElement('div');
  sprite.className = 'ff-flier';
  sprite.dataset.gold = String(gold);
  sprite.setAttribute('aria-hidden', 'true');
  sprite.innerHTML = FIREFLY_SVG;
  layer.append(sprite);
  const path = flightPath(from, to);
  const last = path.length - 1;
  const frames = path.map((p, i) => ({
    transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${i === 0 ? 0.55 : i === last ? 0.9 : 1})`,
    opacity: i === 0 ? 0 : i >= last - 1 ? (i === last ? 0 : 0.8) : 1,
  }));
  const anim = sprite.animate(frames, { duration: FLIGHT_MS, easing: 'ease-in-out' });
  live.add(anim);
  const done = () => {
    live.delete(anim);
    sprite.remove();
  };
  anim.onfinish = done;
  anim.oncancel = done;
  // Backstop: a hidden tab can hold the animation timeline; never leave a sprite behind.
  setTimeout(done, FLIGHT_MS + 500);
}
