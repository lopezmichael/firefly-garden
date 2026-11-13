/**
 * The ink and wash icon set, coin and paper lantern (design canvas:
 * "Components · states, icons, coin"): ink line on a 24 px grid. Lines are
 * `currentColor`, so one icon reads in sumi on paper and in cream on the seal
 * button; accents use classes whose colours are theme tokens (game.css). All
 * markup here is constant, never game or player data.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  undo: '<path d="M9 7 L4 11 L9 15" stroke-width="2"></path><path d="M4.5 11 H14 C17.5 11 20 13.2 20 16 C20 18.8 17.5 20 15 20 H12" stroke-width="2"></path>',
  reset: '<path d="M19 12 A7 7 0 1 1 16.8 6.9" stroke-width="2"></path><path d="M15.7 3.6 L17.2 7.3 L13.3 7.4" stroke-width="2"></path><circle class="ff-i-seal" cx="12" cy="12" r="1.6"></circle>',
  hint: '<path d="M11 9.5 C8 5.5 5.5 7.5 6.8 9.6 C7.8 11 10 10.8 11 10.2 Z M13 9.5 C16 5.5 18.5 7.5 17.2 9.6 C16.2 11 14 10.8 13 10.2 Z" stroke-width="1.6"></path>'
    + '<circle class="ff-i-gold" cx="12" cy="14.5" r="4" stroke-width="1.8"></circle><circle class="ff-i-ink" cx="12" cy="8.6" r="1.9"></circle>'
    + '<path d="M11.3 7 q-1 -3 -3 -3.4 M12.7 7 q1 -3 3 -3.4" stroke-width="1.3"></path>',
  // The rose cog.
  settings: '<path d="M12 3.2 l1.6 2.4 l2.8 -0.7 l0.5 2.8 l2.7 1 l-1.2 2.6 l1.6 2.4 l-2.6 1.3 l0.1 2.9 l-2.9 -0.2 l-1.5 2.5 l-2.2 -1.9 l-2.6 1.3 l-0.8 -2.8 l-2.8 -0.7 l1 -2.7 l-1.9 -2.2 l2.5 -1.5 l-0.2 -2.9 l2.9 0.1 Z" stroke-width="1.7"></path><circle cx="12" cy="12" r="3.2" stroke-width="1.8"></circle>',
  sound: '<path d="M7 16 C7 9 8.5 6 12 6 C15.5 6 17 9 17 16 Z" stroke-width="1.9"></path><path d="M5.5 16 H18.5 M12 3.5 V6" stroke-width="1.9"></path><circle class="ff-i-ink" cx="12" cy="18.6" r="1.6"></circle>',
  muted: '<g opacity="0.55"><path d="M7 16 C7 9 8.5 6 12 6 C15.5 6 17 9 17 16 Z" stroke-width="1.9"></path><path d="M5.5 16 H18.5" stroke-width="1.9"></path></g><path class="ff-i-slash" d="M4 4 L20 20" stroke-width="2.2"></path>',
  map: '<path d="M5 19 C9 19 7 13 12 13 C17 13 15 7 19 7" stroke-width="1.9" stroke-dasharray="0.1 3.4"></path><circle class="ff-i-gold" cx="5" cy="19" r="2.2" stroke-width="1.5"></circle><circle cx="19" cy="7" r="2.2" stroke-width="1.5"></circle>',
  next: '<path d="M5 12 H18 M13 7 L18.5 12 L13 17" stroke-width="2"></path>',
  close: '<path d="M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5" stroke-width="2"></path>',
  locked: '<rect x="6" y="11" width="12" height="9" rx="2" stroke-width="1.9"></rect><path d="M8.5 11 V8.5 a3.5 3.5 0 0 1 7 0 V11" stroke-width="1.9"></path><circle class="ff-i-ink" cx="12" cy="15.5" r="1.3"></circle>',
  motion: '<path d="M4 16 C6 8 10 8 11 12 C12 16 16 16 18 9" stroke-width="1.9"></path><circle class="ff-i-gold" cx="19" cy="7.5" r="2.2" stroke-width="1.4"></circle>',
  log: '<path d="M6 3.5 H14.5 L18.5 7.5 V20.5 H6 Z" stroke-width="1.9"></path><path d="M14.5 3.5 V7.5 H18.5 M9 12 H15.5 M9 15.5 H14" stroke-width="1.7"></path>',
  // Not one of the twelve: the hint sheet's rewarded-video button.
  video: '<rect x="3" y="5" width="18" height="14" rx="3" stroke-width="1.9"></rect><path class="ff-i-ink" d="M10 9 L15 12 L10 15 Z"></path>',
} as const;

export type IconName = keyof typeof ICONS;

function svg(viewBox: string, className: string, markup: string): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', className);
  // Constant markup from this module, never game or player data.
  s.innerHTML = markup;
  return s;
}

/** An icon: ink line in the current text colour. */
export function icon(name: IconName): SVGSVGElement {
  return svg('0 0 24 24', 'ff-icon', ICONS[name]);
}

/** The coin: a gold wash disc stamped with the rose's spiral. */
export function coin(): SVGSVGElement {
  return svg('0 0 24 24', 'ff-coin',
    '<circle class="ff-coin-disc" cx="12" cy="12" r="10"></circle><circle class="ff-coin-rim" cx="12" cy="12" r="7.6"></circle>'
    + '<path class="ff-coin-spiral" d="M12 12 m-0.8 0 a1.2 1.2 0 1 1 2 1 a2.4 2.4 0 1 1 -3.7 -2.1 a3.7 3.7 0 1 1 5.5 3.5"></path>');
}

/** Where the lights sit inside the lantern (one per firefly left, up to this many). */
export const LANTERN_LIGHTS: readonly (readonly [number, number])[] = [
  [17, 26], [30, 24], [24, 34], [16, 42], [31, 43], [24, 18], [23, 49], [33, 33],
];

/**
 * The paper lantern (the firefly jar): gold paper, warm ribs, sumi caps, seal-red
 * tassel, and a light inside for each firefly left. The top cap lifts when a
 * firefly leaves or comes home (`.ff-jar-lid`).
 */
export function lantern(): SVGSVGElement {
  const lights = LANTERN_LIGHTS.map(([x, y]) => `<circle class="ff-lantern-light" cx="${x}" cy="${y}" r="3.4"></circle>`).join('');
  return svg('0 0 48 66', 'ff-lantern',
    '<circle class="ff-lantern-halo" cx="24" cy="33" r="26"></circle>'
    + '<path class="ff-lantern-paper" d="M14 10 C2 16 2 50 14 56 H34 C46 50 46 16 34 10 Z"></path>'
    + '<path class="ff-lantern-inner" d="M12 14 C6 22 6 44 12 52 H36 C42 44 42 22 36 14 Z"></path>'
    + '<path class="ff-lantern-ribs" d="M7 20 Q24 16 41 20 M5 33 Q24 29 43 33 M7 46 Q24 42 41 46"></path>'
    + `<g class="ff-lantern-lights">${lights}</g>`
    + '<rect class="ff-lantern-cap" x="15" y="56" width="18" height="5" rx="1"></rect>'
    + '<path class="ff-lantern-tassel" d="M24 61 v5"></path>'
    + '<g class="ff-jar-lid"><path class="ff-lantern-hook" d="M24 0 v4"></path><rect class="ff-lantern-cap" x="14" y="4" width="20" height="6" rx="1"></rect></g>');
}
