function paintScene(g, W, H, skip = {}) {
const pathZ = (y) => Math.max(.02, (y - 440) / 404);                                  // 0 far (the glasshouse) .. 1 near (the buttons)
// beyond the arch the path swings wide from side to side (so it can duck behind the knolls and come out offset)
const pathNear = (y) => { const z = pathZ(y); return 196 + (4 + 52 * Math.pow(z, 1.2)) * Math.sin(11 * Math.sqrt(z) + .3); };
// past the arch the path snakes right, left, right, narrowing with distance, so it can slip behind a knoll on each swing
const pathX = (y) => { if (y >= 552) return pathNear(y); const u = Math.min(1, (552 - y) / 94), ramp = Math.min(1, u / .22) ** 2 * (3 - 2 * Math.min(1, u / .22));
  return pathNear(552) + 38 * (1 - .55 * u) * ramp * Math.sin(u * 3 * Math.PI); };
const pathHalf = (y) => 1.2 + 100 * Math.pow(pathZ(y), 1.6);

const ridge = (y0, amp, f, ph, tilt = 0) => curve(t => [t * 430 - 20, y0 + n1(t * f + ph) * amp + Math.sin(t * 2.2 + ph) * amp * .6 - t * tilt], 60);
const below = (pts) => pts.concat([[430, H + 20], [-20, H + 20]]);

// SKY: deeper at the top (title sits here), cloud washes with backruns
const sky = g.createLinearGradient(0, 0, 0, 520); sky.addColorStop(0, '#0a1029'); sky.addColorStop(.6, '#18264c'); sky.addColorStop(1, '#2f4672');
g.fillStyle = sky; g.fillRect(0, 0, W, H);
for (const [cx, cy, rx, ry, col] of [[70, 230, 120, 18, '#2a3b66'], [330, 122, 90, 10, '#3a5084'], [250, 300, 170, 18, '#2f4472'], [50, 380, 120, 14, '#3b5283']]) {
  wash(g, ring(cx, cy, rx, ry, .22, cx), col, { passes: 8, jit: 9, a: .05, edge: 1.2, gran: 0 });
}
glow(g, 246, 50, 150, '215,225,255', .22); glow(g, 246, 50, 40, '255,250,230', .35);
wash(g, ring(246, 50, 22, 22, .03, 1, 40), '#fbf4e0', { passes: 10, jit: .8, a: .3, edge: .5 }); wash(g, ring(240, 46, 6, 5, .1), '#e3d8bd', { passes: 4, jit: .6, a: .25, edge: 0 }); wash(g, ring(253, 58, 4, 3.5, .1), '#e3d8bd', { passes: 4, jit: .6, a: .25, edge: 0 });
contour(g, ring(246, 50, 22, 22, .03, 1, 40), .6, { color: '#a89a7c', a: .5 });
for (let i = 0; i < 130; i++) { const x = rnd() * W, y = rnd() * 400, b = rnd(); if (Math.hypot(x - 246, y - 50) < 36) continue;
  g.fillStyle = b > .9 ? '#fff4c8' : '#e8ecff'; g.globalAlpha = .25 + b * .75; g.beginPath(); g.arc(x, y, b > .93 ? 1.4 : .4 + b * .7, 0, 7); g.fill();
  if (b > .965) { g.globalAlpha = .55; g.fillRect(x - 3.5, y - .25, 7, .5); g.fillRect(x - .25, y - 3.5, .5, 7); } }
g.globalAlpha = 1;

// CONSTELLATIONS: your chapters in the sky (the Rose Bed sealed in gold, the next still gathering)
const consts = [[[40, 360], [66, 338], [94, 350], [88, 378], [58, 384], [40, 360]], [[300, 352], [322, 332], [346, 342], [350, 368], [326, 380]]];
consts.forEach((pts, k) => {
  const lit = k === 0;
  for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
    for (let j = 1; j < n; j += 2) { g.fillStyle = lit ? '#f3c55e' : '#8fa2c8'; g.globalAlpha = lit ? .55 : .3; g.beginPath(); g.arc(lerp(x0, x1, j / n), lerp(y0, y1, j / n), .55, 0, 7); g.fill(); } }
  g.globalAlpha = 1;
  pts.slice(0, lit ? 5 : 5).forEach(([x, y]) => { if (lit) glow(g, x, y, 10, '255,214,128', .5); g.fillStyle = lit ? '#ffe9a8' : '#b9c6dc'; g.beginPath(); g.arc(x, y, lit ? 1.8 : 1.2, 0, 7); g.fill(); });
});
// HILLS with ink ridges (the game's sumi line), atmospheric value steps
const farR = ridge(408, 9, 5, 1, 8);
wash(g, below(farR), '#42597f', { passes: 10, jit: 3, a: .09, gran: .15 });
for (let i = 0; i < 150; i++) { const t = rnd(), [x, y] = farR[Math.floor(t * 60)]; const h = 6 + rnd() * 12; g.fillStyle = rnd() > .5 ? '#33496e' : '#2c4166'; g.globalAlpha = .5; g.beginPath(); g.ellipse(x, y - h * .4, 3 + rnd() * 3, h * .55, 0, 0, 7); g.fill(); }
g.globalAlpha = 1;
ink(g, farR, .7, { color: '#22304e', a: .55, dry: .4 });
// MID HILLS: rolling humps that overlap, each with a moonlit crest and an inked top (no flat band)
const hump = (cx, cy, rx, ry, ph) => { const top = curve(t => { const dx = (t * 2 - 1); return [cx + dx * rx, cy - ry * Math.sqrt(Math.max(0, 1 - dx * dx)) * (1 + n1(t * 6 + ph) * .06)]; }, 40); return top; };
const humps = [[60, 478, 150, 44, '#2a4a52', 1], [330, 470, 170, 52, '#2c4c55', 2], [190, 486, 130, 30, '#305256', 3]];
humps.forEach(([cx, cy, rx, ry, col, ph]) => {
  const top = hump(cx, cy, rx, ry, ph);
  wash(g, top.concat([[cx + rx, cy + 60], [cx - rx, cy + 60]]), col, { passes: 12, jit: 3, a: .1, edge: 1, gran: .2, granColor: '#1b3237' });
  wash(g, hump(cx - rx * .15, cy - ry * .55, rx * .55, ry * .4, ph + 2).concat([[cx + rx * .4, cy - ry * .4], [cx - rx * .7, cy - ry * .4]]), '#46707a', { passes: 5, jit: 3, a: .06, edge: 0 });
  // the shadowed far side and the moonlit near face, then grass strokes following the slope
  wash(g, hump(cx + rx * .35, cy - ry * .2, rx * .6, ry * .7, ph + 4).concat([[cx + rx, cy + 10], [cx - rx * .25, cy + 10]]), '#1d3439', { passes: 5, jit: 3, a: .07, edge: 0 });
  for (let k = 0; k < 90; k++) { const t = rnd(), [tx, ty] = top[Math.floor(t * 40)]; const d = rnd() * 40; const gx = tx + (rnd() - .5) * 6, gy = ty + d; if (gy > cy + 40) continue;
    ink(g, [[gx, gy], [gx + (t - .5) * 3, gy - 2.5 - rnd() * 2]], .45, { color: t < .5 ? '#5d8a8c' : '#1f383c', a: .5, dry: 0 }); }
  ink(g, top.slice(4, 22), .8, { color: '#b3c7e2', a: .35, dry: .2 });                      // moonlight on the crest
  ink(g, top.slice(2, 38), 1.2, { color: '#13221f', a: .75, dry: .35 });
});
// trees on the hills: round oaks, tall poplars and a weeping willow, paler and bluer the farther they stand
const treeCol = (far) => far ? ['#2f4d4a', '#355650', '#294641', '#46686a'] : ['#21402f', '#284a36', '#1c3829', '#3d6650'];
const oak = (tx, ty, r, far) => { const c = treeCol(far);
  ink(g, curve(t => [tx + Math.sin(t * 3) * r * .08, ty - t * r * 1.1], 8), r * .16, { color: '#1a140f', dry: 0, taper: 0 });
  for (let k = 0; k < 60; k++) { const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * r; const px = tx + Math.cos(a) * rr * 1.1, py = ty - r * 1.45 + Math.sin(a) * rr * .85;
    g.fillStyle = py < ty - r * 1.6 && px < tx - r * .2 ? c[3] : c[k % 3]; g.globalAlpha = .75; g.beginPath(); g.ellipse(px, py, r * .26, r * .18, rnd() * 3, 0, 7); g.fill(); }
  g.globalAlpha = 1; contour(g, ring(tx, ty - r * 1.45, r * 1.12, r * .88, .14, tx), .7, { color: '#0e1a14', dry: .5, a: far ? .5 : .85 }); };
const poplar = (tx, ty, h, far) => { const c = treeCol(far);
  ink(g, [[tx, ty], [tx, ty - h * .25]], 1.4, { color: '#1a140f', dry: 0, taper: 0 });
  const shape = curve(t => { const a = t * 6.283; return [tx + Math.sin(a) * h * .16 * Math.sin(Math.PI * (1 - Math.cos(a)) / 2) ** .6, ty - h * .2 - (1 - Math.cos(a)) / 2 * h]; }, 30);
  wash(g, shape, c[1], { passes: 6, jit: .8, a: .32, edge: 1, gran: .5, granColor: c[2] });
  wash(g, shape.slice(16, 28), c[3], { passes: 3, jit: .5, a: .18, edge: 0 });
  contour(g, shape, .7, { color: '#0e1a14', dry: .4, a: far ? .5 : .85 }); };
const willow = (tx, ty, r) => { const c = treeCol(false);
  ink(g, curve(t => [tx + Math.sin(t * 2.4) * 3, ty - t * r * 1.3], 10), r * .14, { color: '#1a140f', dry: 0, taper: 0 });
  for (let k = 0; k < 26; k++) { const a = -Math.PI + (k / 25) * Math.PI, sx = tx + Math.cos(a) * r * .9, sy = ty - r * 1.3 + Math.sin(a) * r * .5;
    const len = r * (.9 + rnd() * .6); ink(g, curve(t => [sx + Math.cos(a) * t * r * .3, sy + t * len], 8), .7, { color: c[k % 3], dry: .2, a: .9 });
    for (let j = 0; j < 4; j++) { const t = rnd(); g.fillStyle = c[(k + j) % 3]; g.globalAlpha = .8; g.beginPath(); g.ellipse(sx + Math.cos(a) * t * r * .3, sy + t * len, 1.6, .9, 1.4, 0, 7); g.fill(); } }
  g.globalAlpha = 1; };
// left grove
poplar(18, 452, 44, true); oak(40, 454, 13, true); oak(64, 450, 11, true); poplar(82, 456, 34, true); oak(100, 458, 9, true);
// behind the cottage, so it nestles into the hill
oak(176, 452, 12, true); poplar(190, 444, 30, true); oak(232, 450, 13, true); poplar(246, 452, 26, true);
// right grove
oak(328, 444, 15, true); poplar(350, 440, 42, true); oak(372, 446, 12, true); poplar(392, 450, 30, true);
// the little glasshouse: an old greenhouse glowing from inside, plants pressed to the panes
(() => { const cx = pathX(458), cy = 456, w = 26, h = 18;
  glow(g, cx, cy - 14, 64, '255,206,120', .26);
  const body = [[cx - w, cy], [cx + w, cy], [cx + w, cy - h], [cx - w, cy - h]];
  wash(g, body, '#ffe1a0', { passes: 5, jit: .3, a: .45, edge: 0 });
  // plants inside, silhouetted against the light
  for (let k2 = 0; k2 < 50; k2++) { const px = cx - w + 3 + rnd() * (w * 2 - 6), py = cy - 2 - rnd() * h * .7; g.fillStyle = ['#3d6b45', '#2f5636', '#4f8256'][k2 % 3]; g.globalAlpha = .75; g.beginPath(); g.ellipse(px, py, 2.6, 1.6, rnd() * 3, 0, 7); g.fill(); }
  for (let k2 = 0; k2 < 6; k2++) { g.fillStyle = ['#f2a7bd', '#fbe3ec', '#9fc2ea'][k2 % 3]; g.globalAlpha = .9; g.beginPath(); g.arc(cx - w + 6 + rnd() * (w * 2 - 12), cy - 4 - rnd() * 10, 1.4, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  // a curved glass roof with a little cupola
  const roof = curve(t => [cx - w - 2 + t * (w * 2 + 4), cy - h - Math.sin(t * Math.PI) * 14], 24);
  wash(g, roof.concat([[cx + w + 2, cy - h], [cx - w - 2, cy - h]]), '#ffe9b8', { passes: 4, jit: .3, a: .4, edge: 0 });
  wash(g, ring(cx, cy - h - 16, 5, 4, .05), '#ffe9b8', { passes: 3, jit: .2, a: .5, edge: 0 });
  // the iron frame in ink
  for (let i = 0; i <= 6; i++) { const x = cx - w + i * (w * 2 / 6); ink(g, [[x, cy], [x, cy - h]], .7, { color: '#24302e', dry: 0, taper: 0 }); ink(g, [[x, cy - h], [lerp(x, cx, .35), cy - h - Math.sin((i / 6) * Math.PI) * 14]], .6, { color: '#24302e', dry: 0 }); }
  ink(g, [[cx - w, cy - h * .5], [cx + w, cy - h * .5]], .6, { color: '#24302e', dry: 0, taper: 0 });
  ink(g, roof, 1, { color: '#1a1f1e', dry: .1 }); contour(g, body, 1, { color: '#1a1f1e', dry: .2 }); contour(g, ring(cx, cy - h - 16, 5, 4, .05), .7, { color: '#1a1f1e' });
  glow(g, cx, cy - 8, 30, '255,214,128', .35); pool(g, cx, cy + 4, 30, 7, '255,200,110', .3);
})();
const nearR = ridge(492, 8, 3, 7);
wash(g, below(nearR), '#22432e', { passes: 14, jit: 4, a: .12, gran: .35, granColor: '#14291b' });
ink(g, nearR.filter(([x]) => x < 112), 1.6, { color: '#0e1a12', a: .85, dry: .3 }); ink(g, nearR.filter(([x]) => x > 272), 1.6, { color: '#0e1a12', a: .85, dry: .3 });
for (let i = 0; i < 1100; i++) { const x = rnd() * W, y = 486 + rnd() * 360; g.fillStyle = ['#2d5236', '#1d3a26', '#355f3c', '#41704a'][Math.floor(rnd() * 4)]; g.globalAlpha = .07 + rnd() * .13; g.beginPath(); g.ellipse(x, y, 2 + rnd() * 5, .8 + rnd() * 1.6, 0, 0, 7); g.fill(); }
g.globalAlpha = 1;
for (let i = 0; i < 30; i++) { const mx = rnd() * 430 - 20, my = 488 + rnd() * 24, rx = 30 + rnd() * 50; g.save(); g.translate(mx, my); g.scale(1, .22); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, 'rgba(200,212,236,.16)'); gr.addColorStop(1, 'rgba(200,212,236,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore(); }

// THE FAR PATH: the same cobbled walk, continuing through the arch and up the hill to the destination.
// Same base, cobbles, edge stones and grass as the near path, only smaller with distance and fading into the night air.
// It is painted on its own sheet, then laid down in pieces by distance, with each knoll between the piece behind it and the
// piece in front of it: the knolls hide what's behind them, and nothing is veiled or printed across a slope.
const gMain = g, farSheet = document.createElement('canvas'); farSheet.width = g.canvas.width; farSheet.height = g.canvas.height;
g = farSheet.getContext('2d'); g.setTransform(gMain.getTransform());
const fY = (s) => lerp(552, 458, s), fCentre = (s) => pathX(fY(s)), fHalf = (s) => pathHalf(fY(s));
{ const fl = curve(s => [fCentre(s) - fHalf(s), fY(s)], 50), fr = curve(s => [fCentre(s) + fHalf(s), fY(s)], 50).reverse();
  wash(g, fl.concat(fr), '#3e3024', { passes: 14, jit: 1.2, a: .1, edge: 1, gran: .3, granColor: '#22301e' });
  const fc = [];
  for (let i = 0; i < 420; i++) { const s = Math.pow(rnd(), 1.15), hw = fHalf(s) * .9; fc.push([fCentre(s) + (rnd() - .5) * 2 * hw, fY(s), (1.6 * (.55 + rnd() * .55)) * (fHalf(s) / 16) * 1.1 + .25, s]); }
  fc.sort((p, q) => q[3] - p[3]).forEach(([x, y, r, s2], i) => { // far first, so nearer cobbles overlap them
    const near = Math.max(0, 1 - Math.hypot(x - 196, y - 572) / 110), air = Math.min(1, s2 * 1.1);
    const col = near > .25 ? ['#d3b282', '#c9a777'][i % 2] : ['#8f816c', '#a09380', '#7c705f', '#968a74'][i % 4];
    g.fillStyle = '#1a140f'; g.globalAlpha = .35 * (1 - air * .5); g.beginPath(); g.ellipse(x + .3, y + r * .3, r * .95, r * .2, 0, 0, 7); g.fill();
    g.fillStyle = col; g.globalAlpha = .8 * (1 - air * .45); g.beginPath(); g.ellipse(x, y, r * (.85 + n1(i) * .15), r * .45, (rnd() - .5) * .5, 0, 7); g.fill();
    if (air > .2) { g.fillStyle = '#3d5070'; g.globalAlpha = air * .3; g.beginPath(); g.ellipse(x, y, r * .9, r * .45, 0, 0, 7); g.fill(); } // the night air cools what's far
    g.fillStyle = '#efe6d2'; g.globalAlpha = (.25 + near * .2) * (1 - air * .6); g.beginPath(); g.ellipse(x - r * .25, y - r * .15, r * .35, r * .12, 0, 0, 7); g.fill(); });
  g.globalAlpha = 1;
  for (const side of [-1, 1]) for (let s2 = .02; s2 < .92; s2 += .03 + (1 - s2) * .025) { const y = fY(s2), x = fCentre(s2) + side * (fHalf(s2) + 1), r = Math.max(.5, 2 * (1 - s2) + .4), air = s2;
    wash(g, ring(x, y, r, r * .55, .15, x + y), air > .5 ? '#7d7a76' : '#b5aa93', { passes: 3, jit: .3, a: .4 * (1 - air * .4), edge: .8 });
    ink(g, curve(u => [x + Math.cos(.2 + u * 2.8) * r, y + Math.sin(.2 + u * 2.8) * r * .55], 6), .5 * (1 - air * .5) + .15, { a: .7 * (1 - air * .5), dry: .3 }); }
  for (let i = 0; i < 160; i++) { const s2 = rnd() * .95, side = rnd() > .5 ? 1 : -1, y = fY(s2), x = fCentre(s2) + side * (fHalf(s2) + (rnd() - .2) * 4 * (1 - s2) + .5), h = (1 + rnd() * 3) * (1 - s2 * .7);
    ink(g, [[x, y], [x + side * rnd() * 1.5, y - h]], .5 * (1 - s2 * .5) + .2, { color: ['#2f5a37', '#4a7b4f', '#1d3a26'][Math.floor(rnd() * 3)], a: .8, dry: 0 }); }
  for (let s2 = .22; s2 < .9; s2 += .17) { const x = fCentre(s2) + fHalf(s2) + 4 * (1 - s2) + 2, y = fY(s2), hh = 7 * (1 - s2 * .6); // little lantern posts along the way
    ink(g, [[x, y + 1], [x, y - hh]], .6, { color: '#1a140f', dry: 0 }); glow(g, x, y - hh, 10 * (1 - s2 * .5), '255,206,120', .5); g.fillStyle = '#fff1bf'; g.beginPath(); g.arc(x, y - hh, 1.1 * (1 - s2 * .4), 0, 7); g.fill(); } }
// tufts and flowers edging the climb, and fireflies by the cottage
for (let i = 0; i < 40; i++) { const t = .3 + rnd() * .6, x = fCentre(t) + (rnd() > .5 ? 1 : -1) * (fHalf(t) + 2 + rnd() * 5 * (1 - t)), y = fY(t);
  ink(g, [[x, y], [x + (rnd() - .5) * 2, y - 2 - rnd() * 3]], .5, { color: '#3d6b45', dry: 0, a: .8 }); if (rnd() > .6) { g.fillStyle = ['#f2a7bd', '#fbe3ec', '#9fc2ea'][i % 3]; g.beginPath(); g.arc(x, y - 3, .8, 0, 7); g.fill(); } }
g = gMain;
const farPiece = (y0, y1) => { g.save(); g.beginPath(); g.rect(-20, y0, W + 40, y1 - y0); g.clip(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(farSheet, 0, 0); g.restore(); };
for (const [fx, fy] of [[176, 436], [238, 430], [224, 462], [186, 470]]) { glow(g, fx, fy, 8, '255,214,128', .5); g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(fx, fy, .9, 0, 7); g.fill(); }
// FOLDS: the meadow rolls in long folds, each running in from one edge and tapering down into the grass near the middle,
// alternating sides as they recede. The path winds round the end of each fold and goes behind it at its foot.
const hexA = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
const foldEnv = (d, taper) => { const q = Math.min(1, Math.max(0, d / taper)); return .5 - .5 * Math.cos(Math.PI * q); };
const fold = (side, edge, taper, base, h, ph, col, far, peak = 0) => {
  const x0 = side < 0 ? -24 : edge, x1 = side < 0 ? edge : W + 24;
  const topY = (x) => { const d = side < 0 ? edge - x : x - edge; return base - h * foldEnv(d, taper) * (.8 + .2 * Math.cos((x - peak) * .03)) * (.94 + .06 * Math.sin(x * .07 + ph)) + n1(x * .09 + ph) * .7; };  // rolls along its length, full height at `peak`
  const top = curve(t => { const x = lerp(x0, x1, t); return [x, topY(x)]; }, 90);
  const foot = base + 50, crest = base - h;
  // the fold's own ground runs across the whole meadow in front of it, until a nearer fold covers it (no corner at the tip)
  const shape = (side < 0 ? top.concat([[W + 24, base + .5]]) : [[-24, base + .5]].concat(top)).concat([[side < 0 ? W + 24 : W + 24, foot], [-24, foot]]);
  if (side > 0) shape.splice(shape.length - 2, 2, [W + 24, foot], [-24, foot]);
  // an opaque body (hides what's behind it) whose foot fades into the meadow, then washes for texture
  const gr = g.createLinearGradient(0, crest, 0, foot); gr.addColorStop(0, col[0]); gr.addColorStop((base - crest) / (foot - crest), col[1]); gr.addColorStop((base + 16 - crest) / (foot - crest), col[1]); gr.addColorStop(1, col[1].replace('#', '') && hexA(col[1], 0));
  g.fillStyle = gr; g.beginPath(); shape.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
  const tex = g.createLinearGradient(0, crest, 0, foot); tex.addColorStop(0, col[2]); tex.addColorStop((base - crest) / (foot - crest), hexA(col[1], .3)); tex.addColorStop(1, 'rgba(46,72,50,0)');
  wash(g, shape, tex, { passes: 6, jit: 1.6, a: .1, edge: 0, gran: .22, granColor: '#1d3326' });
  // moonlight lying along the crest, and shadow pooling where the fold meets the ground in front
  g.save(); g.beginPath(); shape.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.clip();
  for (let k = 0; k < 14; k++) { const [tx, ty] = top[8 + Math.floor(rnd() * 74)]; const r = 18 + rnd() * 26; g.save(); g.translate(tx, ty + 3); g.scale(1, .28);
    const lt = g.createRadialGradient(0, 0, 0, 0, 0, r); lt.addColorStop(0, `rgba(160,196,190,${.12 * (1 - far * .4)})`); lt.addColorStop(1, 'rgba(160,196,190,0)'); g.fillStyle = lt; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.restore(); }
  const sh = g.createLinearGradient(0, base - 6, 0, base + 3); sh.addColorStop(0, 'rgba(18,34,24,0)'); sh.addColorStop(.7, 'rgba(18,34,24,.28)'); sh.addColorStop(1, 'rgba(18,34,24,0)');
  g.fillStyle = sh; for (const [x, y] of top) if (y < base - 2) g.fillRect(x - 2.5, base - 6, 5, 9);
  g.restore();
  // grass along the crest, thinning down the face; a few wildflowers
  for (let k = 0; k < 110 * (1 - far * .55); k++) { const [tx, ty] = top[Math.floor(rnd() * 90)]; if (ty > base - 1.5) continue; const gy = ty + rnd() ** 3 * (base - ty) * .7;
    ink(g, [[tx + (rnd() - .5) * 3, gy + 1], [tx + (rnd() - .5) * 4, gy - 1.2 - rnd() * 2.2 * (1 - far * .4)]], .42, { color: far ? ['#3f6b5a', '#4f7c68', '#365e4f'][k % 3] : ['#3d6b45', '#4a7a50', '#5a8a5e'][k % 3], a: .65, dry: 0 }); }
  for (let k = 0; k < 14; k++) { const [tx, ty] = top[Math.floor(rnd() * 90)]; if (ty > base - 3) continue; g.fillStyle = ['#f2a7bd', '#fbe3ec', '#9fc2ea'][k % 3]; g.globalAlpha = .85 - far * .3; g.beginPath(); g.arc(tx, ty + 1.5 + rnd() * 3, .75, 0, 7); g.fill(); g.globalAlpha = 1; }
  // moonlit edge and ink along the silhouette, wherever it stands up off the ground (so a hidden path has a drawn edge)
  const run = top.filter(([, y]) => y < base - 1);
  if (run.length > 3) { ink(g, run, .7, { color: '#b4cfd2', a: .22 * (1 - far * .4), dry: .3 }); ink(g, run.map(([x, y]) => [x, y + .4]), .9, { color: '#132519', a: .55 - far * .15, dry: .3 }); }
  // shadow and grass tufts along the foot, in front of it: where the path goes behind, the grass overlaps its cut edge
  for (let k = 0; k < 40; k++) { const x = pathX(base) + (rnd() - .5) * 44, ty = topY(x); if (ty > base - 2.5) continue; /* only where the path goes behind */ const y = base + rnd() * 2.5;
    g.fillStyle = '#16281b'; g.globalAlpha = .18; g.beginPath(); g.ellipse(x, y, 3 + rnd() * 3, .8, 0, 0, 7); g.fill(); g.globalAlpha = 1;
    for (let j = 0; j < 3; j++) ink(g, [[x + j * 1.2 - 1.2, y], [x + j * 1.6 - 1.6 + (rnd() - .5), y - 1.6 - rnd() * 2.4 * (1 - far * .4)]], .45, { color: ['#2f5a37', '#3d6b45', '#4f8256'][(k + j) % 3], a: .8, dry: 0 }); }
};
// far to near, the path laid in pieces between them
fold(-1, 150, 50, 488, 14, 4, ['#30504a', '#2c4a42', '#3e6460'], 1, 30);   // a low far fold on the left, to the hills
farPiece(-20, 497);
fold(1, 160, 40, 497, 28, 2, ['#31523f', '#2c4a39', '#40685a'], .6, 212);   // from the right: the path passes its tip, then goes behind it to the glasshouse
farPiece(497, 536);
fold(-1, 232, 40, 536, 26, 1, ['#34543c', '#2e4a34', '#44694e'], 0, 185);    // from the left: the path rounds its tip just past the arch and crosses behind it
fold(1, 262, 46, 550, 16, 3, ['#33523a', '#2d4832', '#44694e'], 0, 380);    // a low near fold on the right, filling the meadow
farPiece(536, 900);
// PATH: an S-curve from the arch down to the buttons, cobbles with ink, moss in the joints
const centre = (t) => pathX(552 + t * 292);
const half = (t) => pathHalf(552 + t * 292);
const Y0 = 552, YL = 292;
const pl = curve(t => [centre(t) - half(t) + n1(t * 5) * 3, Y0 + t * YL], 50), pr = curve(t => [centre(t) + half(t) + n1(t * 5 + 2) * 3, Y0 + t * YL], 50).reverse();
wash(g, pl.concat(pr), '#3e3024', { passes: 16, jit: 3, a: .09, edge: 1, gran: .5, granColor: '#22301e' });
const cobbles = [];
for (let i = 0; i < 520; i++) { const t = Math.pow(rnd(), .85), y = Y0 + t * YL, hw = half(t) * .9, x = centre(t) + (rnd() - .5) * 2 * hw; cobbles.push([x, y, 1.6 + t * 7 * (.55 + rnd() * .55), t]); }
cobbles.sort((a, b) => a[1] - b[1]).forEach(([x, y, r, t], i) => {
  const near = Math.max(0, 1 - Math.hypot(x - 196, y - 572) / 110);
  const col = near > .25 ? ['#d3b282', '#c9a777'][i % 2] : ['#8f816c', '#a09380', '#7c705f', '#968a74'][i % 4];
  g.fillStyle = '#1a140f'; g.globalAlpha = .35; g.beginPath(); g.ellipse(x + .4, y + r * .3, r * .95, r * .2, 0, 0, 7); g.fill();
  g.fillStyle = col; g.globalAlpha = .8; g.beginPath(); g.ellipse(x, y, r * (.85 + n1(i) * .15), r * .45, (rnd() - .5) * .5, 0, 7); g.fill();
  g.fillStyle = '#efe6d2'; g.globalAlpha = .25 + near * .2; g.beginPath(); g.ellipse(x - r * .25, y - r * .15, r * .35, r * .12, 0, 0, 7); g.fill();
  if (t > .35 && rnd() > .5) ink(g, curve(u => [x + Math.cos(.3 + u * 2.4) * r * .85, y + Math.sin(.3 + u * 2.4) * r * .4], 8), .55 + t * .4, { a: .6, dry: .5 });
});
g.globalAlpha = 1;
for (const side of [-1, 1]) for (let t = .04; t < 1; t += .035 + t * .02) { const y = Y0 + t * YL, x = centre(t) + side * (half(t) + 1.5), r = 2 + t * 6;
  wash(g, ring(x, y, r, r * .55, .15, x + y), '#b5aa93', { passes: 4, jit: .4, a: .4, edge: .8 });
  wash(g, ring(x - r * .2, y - r * .2, r * .45, r * .2, .1), '#e7decb', { passes: 2, jit: .3, a: .3, edge: 0 });
  ink(g, curve(u => [x + Math.cos(.2 + u * 2.8) * r, y + Math.sin(.2 + u * 2.8) * r * .55], 8), .6 + t * .5, { a: .75, dry: .3 }); }
for (let i = 0; i < 380; i++) { const t = rnd(), side = rnd() > .5 ? 1 : -1, y = Y0 + 2 + t * YL, x = centre(t) + side * (half(t) + (rnd() - .3) * 6), h = 4 + t * 16 * rnd();
  ink(g, [[x, y], [x + side * rnd() * 3, y - h]], .7 + t * .9, { color: ['#2f5a37', '#4a7b4f', '#1d3a26', '#6fa765'][Math.floor(rnd() * 4)], a: .85, dry: 0 }); }

// MIDGROUND: game-style bushes with roses, mushrooms by the path
bush(g, 58, 600, 30, { roses: [[-14, -14, 4.6], [6, -22, 5], [20, -10, 4.2]] });
bush(g, 340, 590, 28, { roses: [[-8, -18, 4.4], [12, -12, 4]] });
bush(g, 44, 700, 42, { roses: [[-18, -22, 5.6], [8, -32, 6], [26, -16, 5]] });
bush(g, 352, 716, 46, { roses: [[-20, -26, 6], [6, -34, 6.4], [28, -18, 5.4]] });
mushroom(g, 118, 646, 10); mushroom(g, 133, 654, 6.5); mushroom(g, 290, 676, 8.5);
for (let i = 0; i < 50; i++) { const fx = rnd() * W, fy = 500 + rnd() * 220; const t = Math.max(0, (fy - Y0) / YL); if (Math.abs(fx - centre(t)) < half(t) + 14) continue; g.fillStyle = rnd() > .5 ? '#f1e8d4' : '#f2a7bd'; g.globalAlpha = .75; g.beginPath(); g.arc(fx, fy, .9 + rnd() * .8, 0, 7); g.fill(); }
g.globalAlpha = 1;

// ARCH (pass 3, moved down and inked harder at its outer edges)
g.save(); g.translate(196, 560); g.scale(1.4, 1.4); g.translate(-196, -346);
const bow = (t, lift) => [140 + t * 112, 196 - Math.sin(t * Math.PI) * (52 + lift) + n1(t * 7 + lift) * 1.5];
for (let i = 0; i < 130; i++) { const s = rnd(); let px, py; if (s < .3) { py = 186 + rnd() * 156; px = 142 + (rnd() - .5) * 22; } else if (s < .6) { py = 186 + rnd() * 156; px = 248 + (rnd() - .5) * 22; } else { [px, py] = bow(rnd(), rnd() * 14); px += (rnd() - .5) * 12; py += (rnd() - .5) * 12; }
  g.fillStyle = ['#1f3b27', '#264a30', '#1a3322'][Math.floor(rnd() * 3)]; g.globalAlpha = .8; g.beginPath(); g.ellipse(px, py, 3 + rnd() * 3, 1.6 + rnd() * 1.4, rnd() * 3, 0, 7); g.fill(); }
g.globalAlpha = 1;
for (const px of [134, 240]) { wash(g, [[px, 344], [px + 16, 344], [px + 15, 190], [px + 1, 190]], '#5a3e2c', { passes: 12, jit: 1.2, a: .18, gran: .8, granColor: '#3a281c' }); for (let k = 0; k < 5; k++) ink(g, curve(t => [px + 3 + k * 2 + n1(t * 6 + k) * .8, 340 - t * 146], 20), .5, { color: '#3a281c', dry: .4, a: .6 }); }
ink(g, curve(t => [137.5 + n1(t * 4) * 1.2, 346 - t * 156], 30), 3.4); ink(g, curve(t => [148 + n1(t * 4 + 2) * 1.2, 344 - t * 154], 30), 1.4, { dry: .3 });
ink(g, curve(t => [244 + n1(t * 4 + 5) * 1.2, 344 - t * 154], 30), 1.4, { dry: .3 }); ink(g, curve(t => [254.5 + n1(t * 4 + 7) * 1.2, 346 - t * 156], 30), 3.4);
for (const lift of [0, 5, 10]) ink(g, curve(t => bow(t, lift), 60), lift ? 1.5 : 3.2, { dry: .15 });
for (let k = 0; k < 9; k++) { const t = .08 + k * .1, [bx, by] = bow(t, 6); ink(g, [[bx, by], [bx + (rnd() - .5) * 10, by - 5 - rnd() * 6]], .8, { dry: 0 }); }
for (const t0 of [.18, .34, .5, .66, .82]) { const [tx, ty] = bow(t0, 0); const len = 18 + rnd() * 26; ink(g, curve(t => [tx + Math.sin(t * 4 + t0 * 9) * 3, ty + t * len], 14), .7, { color: '#2f5636', dry: .2 });
  for (let k = 0; k < 5; k++) { const yy = ty + rnd() * len; g.fillStyle = '#4f8256'; g.globalAlpha = .85; g.beginPath(); g.ellipse(tx + Math.sin(yy * .3) * 3, yy, 2.2, 1.1, rnd() * 3, 0, 7); g.fill(); } }
g.globalAlpha = 1;
for (let i = 0; i < 300; i++) { const s = rnd(); let px, py; if (s < .3) { py = 190 + rnd() * 150; px = 142 + (rnd() - .5) * 16; } else if (s < .6) { py = 190 + rnd() * 150; px = 248 + (rnd() - .5) * 16; } else { [px, py] = bow(rnd(), rnd() * 12); px += (rnd() - .5) * 9; py += (rnd() - .5) * 9; }
  const lit = rnd() > .75, a = rnd() * 3, rx = 2.4 + rnd() * 3.2; // leaves vary in size and get a tip
  g.fillStyle = lit ? '#8fc07a' : ['#3d6b45', '#4f8256', '#2f5636'][Math.floor(rnd() * 3)]; g.globalAlpha = lit ? .9 : .75;
  g.beginPath(); g.moveTo(px - Math.cos(a) * rx, py - Math.sin(a) * rx); g.quadraticCurveTo(px + Math.cos(a + 1.4) * rx * .5, py + Math.sin(a + 1.4) * rx * .5, px + Math.cos(a) * rx, py + Math.sin(a) * rx); g.quadraticCurveTo(px + Math.cos(a - 1.4) * rx * .5, py + Math.sin(a - 1.4) * rx * .5, px - Math.cos(a) * rx, py - Math.sin(a) * rx); g.fill();
  if (rnd() > .65) { g.globalAlpha = .55; g.strokeStyle = '#1a140f'; g.lineWidth = .45; g.stroke(); } }
g.globalAlpha = 1;
// roots: a leafy clump with roses at each post's foot
for (const fx of [142, 248]) { for (let i = 0; i < 70; i++) { const a = Math.PI + rnd() * Math.PI, r = Math.sqrt(rnd()) * 15; g.fillStyle = ['#2f5636', '#3d6b45', '#4f8256', '#6fa765'][Math.floor(rnd() * 4)]; g.globalAlpha = .85;
  g.beginPath(); g.ellipse(fx + Math.cos(a) * r * 1.3, 344 + Math.sin(a) * r * .7, 2.6 + rnd() * 2, 1.3 + rnd(), rnd() * 3, 0, 7); g.fill(); }
  g.globalAlpha = 1; rose(g, fx - 7, 336, 3.6, 1); rose(g, fx + 6, 332, 3.2, 2); }
[[146, 304, 5.2], [139, 262, 4.6], [151, 222, 5], [166, 176, 4.4], [186, 152, 5.4], [212, 150, 4.8], [234, 170, 5], [250, 214, 4.6], [244, 258, 5.2], [253, 300, 4.4], [200, 146, 3.6]].forEach(([rx, ry, r], k) => rose(g, rx, ry, r, k));
ink(g, [[196, 141], [196, 166]], .8, { dry: 0 });
wash(g, ring(196, 174, 7.5, 9.5, .03), '#ffb547', { passes: 8, jit: .8, a: .35, edge: .9 }); wash(g, ring(196, 175, 4, 6, .03), '#fff1b8', { passes: 6, jit: .6, a: .45, edge: 0 });
for (const dx of [-3.5, 0, 3.5]) ink(g, curve(t => [196 + dx * Math.sin(t * Math.PI), 166 + t * 17], 10), .45, { color: '#8a5a2b', dry: 0, a: .8 });
ink(g, [[191, 166], [201, 166]], 1.4, { taper: 0 }); ink(g, [[192, 183], [200, 183]], 1.4, { taper: 0 });
g.restore();

// LIGHT
const L = makeLayer(W, H, x => {
  glow(x, 196, 398, 220, '255,200,110', .16); if (!skip.lantern) { glow(x, 196, 319, 120, '255,196,100', .62); glow(x, 196, 321, 15, '255,240,200', .9); }
  for (const [px, py, rx, ry, a] of [[196, 574, 140, 36, .32], [168, 626, 90, 26, .18], [240, 604, 80, 22, .15], [70, 600, 60, 24, .1], [330, 590, 56, 22, .1]]) pool(x, px, py, rx, ry, '255,190,110', a);
  x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = .4; x.strokeStyle = '#ffcf7a'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(129.5, 552); x.lineTo(129.5, 350); x.moveTo(262.5, 552); x.lineTo(262.5, 350); x.stroke(); x.restore();
  const dots = [[96, 380], [298, 352], [160, 300], [238, 292], [84, 520], [44, 470], [330, 500], [300, 640], [90, 650], [226, 720], [160, 728], [350, 650], [196, 250]];
  if (!skip.dots) dots.forEach(([fx, fy]) => { glow(x, fx, fy, 44, '255,214,128', .3); glow(x, fx, fy, 7, '255,248,225', .95); x.fillStyle = '#fffcef'; x.beginPath(); x.arc(fx, fy, 1.5, 0, 7); x.fill(); });
});
put(g, L);
if (!skip.petals) for (let i = 0; i < 14; i++) { const px = 30 + rnd() * 330, py = 360 + rnd() * 320, a = rnd() * 6.28, r = 2.4 + rnd() * 1.6; g.save(); g.translate(px, py); g.rotate(a);
  wash(g, curve(t => [Math.cos(t * 6.283) * r, Math.sin(t * 6.283) * r * .55 + Math.cos(t * 6.283) * r * .25], 12), i % 2 ? '#f2a7bd' : '#f6bccc', { passes: 3, jit: .3, a: .5, edge: .8 }); g.restore(); }
// the friends: a few fireflies with faces, close enough to be characters
// their shadows stay on the ground even when the figures themselves are live sprites (skip.cast)
groundShadow(g, 92, 640, 18, 40); groundShadow(g, 312, 610, 16, 50); groundShadow(g, 258, 724, 17, 30); groundShadow(g, 336, 690, 15, 26); groundShadow(g, 76, 712, 15, 26);
if (!skip.cast) {
lanternBug(g, 92, 566, 18, { tint: 'gold', expr: 'happy', arms: 'up', squash: [.92, 1.08], wingUp: .3, wingTint: '#f6d2a8' });
lanternBug(g, 312, 540, 16, { tint: 'mint', expr: 'wonder', headTilt: -.25, look: [-.8, -.8], wingTint: '#c9ecd6', bend: .12 });
lanternBug(g, 258, 664, 17, { tint: 'peach', expr: 'smile', tilt: .22, headTilt: .3, look: [-.9, .4], wingTint: '#f7c8b8' });
lanternBug(g, 336, 632, 15, { tint: 'sky', expr: 'wink', arms: 'wave', tilt: -.18, bend: -.2, wingTint: '#cfe0f6' });
lanternBug(g, 76, 660, 15, { tint: 'lilac', expr: 'sleepy', headTilt: .4, tilt: .12, wingUp: -.2, wingTint: '#ddd0f6' });
// Pip, perched on top of the arch, waving hello
pip(g, 240, 232, 35, { lantern: 'hybrid', garland: true, expr: 'smile', arms: 'wave', headTilt: -.14, look: [-.7, .2], swing: -.2, bend: -.08, fx: 'hearts' });

}
// FOREGROUND: dark leafy shrubs, kept low so the buttons sit on calm dark
const F = makeLayer(W, H, x => {
  for (const [bx, by, rad] of [[-14, 860, 120], [404, 866, 130]]) {
    for (let k = 0; k < 520; k++) { const a2 = Math.PI + rnd() * Math.PI, rr = Math.sqrt(rnd()) * rad; const px = bx + Math.cos(a2) * rr * .9, py = by + Math.sin(a2) * rr;
      x.fillStyle = rr > rad * .8 ? '#16271b' : '#0a140d'; x.globalAlpha = .92; x.beginPath(); x.ellipse(px, py, 3.5 + rnd() * 3.5, 1.7 + rnd() * 1.6, rnd() * 3, 0, 7); x.fill(); }
    for (let k = 0; k < 30; k++) { const a2 = Math.PI * 1.1 + rnd() * Math.PI * .8, px = bx + Math.cos(a2) * rad * .86, py = by + Math.sin(a2) * rad * .9; x.fillStyle = '#5f9a5c'; x.globalAlpha = .5; x.beginPath(); x.ellipse(px, py, 3, 1.4, rnd() * 3, 0, 7); x.fill(); }
  }
  x.globalAlpha = 1;
  const fade = x.createLinearGradient(0, 700, 0, H); fade.addColorStop(0, 'rgba(8,12,22,0)'); fade.addColorStop(1, 'rgba(8,12,22,.75)'); x.fillStyle = fade; x.fillRect(0, 700, W, H - 700);
});
put(g, F);
const v = g.createRadialGradient(W / 2, H * .5, H * .3, W / 2, H * .5, H * .78); v.addColorStop(0, 'rgba(5,8,20,0)'); v.addColorStop(1, 'rgba(5,8,20,.5)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
paper(g, W, H, .2);

}
