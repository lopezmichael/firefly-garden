/**
 * A firefly flying between the jar (in the status card) and a tile on the
 * board: a small DOM sprite animated along a curved path above both, so it can
 * cross from the page into the canvas. Decorative: the state has already
 * changed when it starts, and reduced motion skips it entirely.
 */

import { flightPath } from '../view/layout.ts';
import type { Point } from '../view/layout.ts';

/** Flight length in milliseconds; the board delays the landing by about this much. */
export const FLIGHT_MS = 560;

// Constant markup, never game or player data. Colors come from CSS classes (theme tokens).
const FIREFLY_SVG = '<svg viewBox="-18 -18 36 36">'
  + '<circle class="ff-flier-halo" r="15"></circle>'
  + '<ellipse class="ff-flier-wing" cx="-7" cy="-5" rx="7.5" ry="5" transform="rotate(-25 -7 -5)"></ellipse>'
  + '<ellipse class="ff-flier-wing" cx="7" cy="-5" rx="7.5" ry="5" transform="rotate(25 7 -5)"></ellipse>'
  + '<circle class="ff-flier-body" cx="0" cy="3" r="8"></circle>'
  + '<circle class="ff-flier-head" cx="0" cy="-6" r="4.2"></circle></svg>';

const live = new Set<Animation>();

/** Stop every flight now (level change, resize): their screen positions no longer apply. */
export function cancelFlights(): void {
  for (const a of [...live]) a.cancel();
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
