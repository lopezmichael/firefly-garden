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

// Constant markup, never game or player data: firefly C from the design canvas, seen in
// flight. Colors come from CSS classes (theme tokens); the glow is the sprite's own
// CSS background, so no SVG gradient ids can clash between two fliers.
const FIREFLY_SVG = '<svg viewBox="0 0 30 30">'
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
