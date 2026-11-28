// The home screen's bake (run by scripts/bake-home.ts in a headless browser, after lib.js, pip.js
// and scene.js). Paints the scene once without anything that moves, and every moving part of Pip
// and the friends alone, in place, so the game can reassemble them on their pivots and move them.
// The output is two images and a manifest; the game never runs this painter.

// The cast: where each character stands on the 390 x 844 scene, its size (u) and how it is painted.
// The game's motion for each lives in apps/game/src/view/home/cast.ts, keyed by the same id.
const CAST = [
  { id: 'pip', x: 240, y: 232, u: 35, frame: 260, o: { lantern: 'hybrid', garland: true, expr: 'smile' } },
  { id: 'gold', x: 92, y: 566, u: 18, frame: 150, tint: 'gold', o: { expr: 'happy', wingTint: '#f6d2a8' } },
  { id: 'mint', x: 312, y: 540, u: 16, frame: 150, tint: 'mint', o: { expr: 'wonder', wingTint: '#c9ecd6' } },
  { id: 'peach', x: 258, y: 664, u: 17, frame: 150, tint: 'peach', o: { expr: 'smile', wingTint: '#f7c8b8' } },
  { id: 'sky', x: 336, y: 632, u: 15, frame: 150, tint: 'sky', o: { expr: 'wink', wingTint: '#cfe0f6' } },
  { id: 'lilac', x: 76, y: 660, u: 15, frame: 150, tint: 'lilac', o: { expr: 'sleepy', wingTint: '#ddd0f6' } },
];
// Each rig part (the glow is not one: the game lights each character with one shared, tinted glow):
// the painter sections it is made of, and the pose it is painted in (arms hang down
// so the game can raise them; the second mouth is the grin it swaps in).
const PARTS = [
  ['wingL', ['wingL']], ['wingR', ['wingR']],
  ['armL', ['armL'], { arms: 'down' }], ['armR', ['armR'], { arms: 'down' }],
  ['lantern', ['lantern']], ['tassel', ['tassel']], ['garlandBack', ['garlandBack']],
  ['antL', ['antL']], ['antR', ['antR']], ['head', ['head']], ['eyes', ['eyes']], ['pupils', ['pupils']],
  ['mouth', ['mouth']], ['grin', ['mouth'], { expr: 'happy' }], ['garlandFront', ['garlandFront']],
];
const SCENE = { w: 390, h: 844 };
// The lantern under the arch: its light is live (it flickers), so it is left out of the plate.
const LANTERN = { x: 196, y: 321 };

function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w * S); c.height = Math.ceil(h * S); const x = c.getContext('2d'); x.scale(S, S); return [c, x]; }

/** The opaque-pixel bounds of a canvas (device pixels), padded by one, or null if it is empty. */
function trim(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(c.width - 1, x1 + 1); y1 = Math.min(c.height - 1, y1 + 1);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function bakeHome() {
  // 1. the plate: everything that stands still
  seed = 11;
  const [plate, pg] = canvas(SCENE.w, SCENE.h);
  paintScene(pg, SCENE.w, SCENE.h, { petals: 1, cast: 1, dots: 1, lantern: 1 });

  // 2. every moving part, painted alone in its character's frame, then trimmed
  const pieces = [];
  const cast = CAST.map((c) => {
    const fc = c.frame / 2;
    const o = c.tint ? { lantern: 'friend', wingScale: .7, glow: .9, ...c.o } : c.o;
    const neutral = { ...o, headTilt: 0, look: [0, 0], swing: 0, bend: 0, squash: [1, 1], tilt: 0, fx: null };
    if (c.tint) PIP_LANTERNS.friend = FRIEND_TINTS[c.tint];
    const parts = {};
    for (const [name, sections, extra] of PARTS) {
      seed = 11;
      const [pc, px] = canvas(c.frame, c.frame);
      pip(px, fc, fc, c.u, { ...neutral, ...(extra ?? {}), only: sections });
      const box = trim(pc);
      if (!box) continue; // a friend has no garland
      const piece = { canvas: pc, box, ref: null };
      pieces.push(piece);
      // where the trimmed piece's top-left sits, relative to the frame centre, in scene pixels
      parts[name] = { piece, dx: box.x / S - fc, dy: box.y / S - fc };
    }
    const P = pipPivots(fc, fc, c.u, o);
    const pivots = Object.fromEntries(Object.entries(P).map(([k, [x, y]]) => [k, [+(x - fc).toFixed(2), +(y - fc).toFixed(2)]]));
    return { id: c.id, x: c.x, y: c.y, u: c.u, pivots, parts };
  });

  // 3. the drifting petal and Pip's hearts
  const fx = {};
  { seed = 11; const [c, x] = canvas(12, 10); wash(x, curve(t => [6 + Math.cos(t * 6.283) * 4, 5 + Math.sin(t * 6.283) * 2.4 + Math.cos(t * 6.283) * 1], 12), '#f2a7bd', { passes: 3, jit: .3, a: .6, edge: .9 });
    const p = { canvas: c, box: trim(c) }; pieces.push(p); fx.petal = p; }
  { const [c, x] = canvas(16, 16); const k = 6, hx = 8, hy = 8; x.fillStyle = '#f28ca5'; x.beginPath(); x.moveTo(hx, hy + k * .9);
    x.bezierCurveTo(hx - k * 1.6, hy - k * .2, hx - k * .6, hy - k * 1.3, hx, hy - k * .4); x.bezierCurveTo(hx + k * .6, hy - k * 1.3, hx + k * 1.6, hy - k * .2, hx, hy + k * .9);
    x.fill(); x.strokeStyle = '#5e1a2c'; x.lineWidth = .7; x.stroke(); const p = { canvas: c, box: trim(c) }; pieces.push(p); fx.heart = p; }

  // 4. shelf-pack the pieces into one atlas, tallest first
  const W = 1024, GAP = 2; let x = GAP, y = GAP, row = 0;
  [...pieces].sort((a, b) => b.box.h - a.box.h).forEach((p) => {
    if (x + p.box.w + GAP > W) { x = GAP; y += row + GAP; row = 0; }
    p.at = { x, y }; x += p.box.w + GAP; row = Math.max(row, p.box.h);
  });
  const H = y + row + GAP;
  const atlas = document.createElement('canvas'); atlas.width = W; atlas.height = H;
  const ax = atlas.getContext('2d');
  for (const p of pieces) ax.drawImage(p.canvas, p.box.x, p.box.y, p.box.w, p.box.h, p.at.x, p.at.y, p.box.w, p.box.h);
  const rect = (p) => [p.at.x, p.at.y, p.box.w, p.box.h];

  const manifest = {
    scene: { w: SCENE.w, h: SCENE.h, scale: S },
    lantern: LANTERN,
    atlas: { w: W, h: H, scale: S },
    cast: cast.map((c) => ({
      id: c.id, x: c.x, y: c.y, u: c.u, pivots: c.pivots,
      parts: Object.fromEntries(Object.entries(c.parts).map(([k, v]) => [k, { rect: rect(v.piece), dx: +v.dx.toFixed(2), dy: +v.dy.toFixed(2) }])),
    })),
    fx: { petal: rect(fx.petal), heart: rect(fx.heart) },
  };
  return { plate: plate.toDataURL('image/webp', .86), atlas: atlas.toDataURL('image/webp', .92), manifest };
}
