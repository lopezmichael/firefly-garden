// The painter: washes, brush ink, light, paper. Shared by every pass.
const S = 2;
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const n1 = (x) => Math.sin(x * 1.7 + 1.3) * .5 + Math.sin(x * 3.1 + .7) * .3 + Math.sin(x * 7.3) * .2;
const curve = (f, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(f(i / n)); return o; };
const lerp = (a, b, t) => a + (b - a) * t;
const ring = (cx, cy, rx, ry, wob = .08, ph = 0, n = 28) => curve(t => [cx + Math.cos(t * 6.283) * rx * (1 + n1(t * 9 + ph) * wob), cy + Math.sin(t * 6.283) * ry * (1 + n1(t * 7 + ph + 3) * wob)], n);
function makeLayer(W, H, fn) { const t = document.createElement('canvas'); t.width = W * S; t.height = H * S; const x = t.getContext('2d'); x.scale(S, S); fn(x); return t; }
function put(g, t, op = 'source-over', a = 1) { g.save(); g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation = op; g.globalAlpha = a; g.drawImage(t, 0, 0); g.restore(); }
// Watercolour: translucent jittered passes, pigment pooled at the edge, granulation speckle inside.
function wash(x, pts, color, o = {}) {
  const passes = o.passes ?? 12, jit = o.jit ?? 4, a = o.a ?? .07, edge = o.edge ?? 1.2, gran = o.gran ?? 0;
  for (let p = 0; p < passes; p++) {
    x.beginPath(); pts.forEach(([px, py], i) => { const jx = px + (rnd() - .5) * jit, jy = py + (rnd() - .5) * jit; i ? x.lineTo(jx, jy) : x.moveTo(jx, jy); });
    x.closePath(); x.fillStyle = color; x.globalAlpha = a; x.fill();
    if (edge) { x.globalAlpha = a * edge; x.lineWidth = 1.1; x.strokeStyle = color; x.stroke(); }
  }
  if (gran) { // pigment settling in the paper's tooth
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9; pts.forEach(([px, py]) => { minx = Math.min(minx, px); maxx = Math.max(maxx, px); miny = Math.min(miny, py); maxy = Math.max(maxy, py); });
    x.save(); x.beginPath(); pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); x.clip();
    const count = Math.min(4000, (maxx - minx) * (maxy - miny) * gran);
    for (let i = 0; i < count; i++) { x.globalAlpha = .12 + rnd() * .22; x.fillStyle = o.granColor ?? color; x.fillRect(lerp(minx, maxx, rnd()), lerp(miny, maxy, rnd()), .5 + rnd() * .7, .5 + rnd() * .7); }
    x.restore();
  }
  x.globalAlpha = 1;
}
// Brush ink: swell and taper, wobble, dry-brush breaks toward the end.
function ink(x, path, w, o = {}) {
  const color = o.color ?? '#1a140f', dry = o.dry ?? .12, a = o.a ?? 1, taper = o.taper ?? 1;
  x.fillStyle = color;
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, y0] = path[i], [x1, y1] = path[i + 1], t = i / Math.max(1, path.length - 1);
    const press = (taper ? Math.sin(Math.PI * Math.min(1, .1 + t * 1.0)) : 1) * (.78 + .38 * n1(i * .41 + w));
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / .45);
    for (let s = 0; s < steps; s++) {
      if (rnd() < dry * t * t) continue;
      const u = s / steps; x.globalAlpha = a * (.6 + .4 * rnd());
      x.beginPath(); x.arc(lerp(x0, x1, u) + (rnd() - .5) * .3, lerp(y0, y1, u) + (rnd() - .5) * .3, Math.max(.2, w * press * .5), 0, 7); x.fill();
    }
  }
  x.globalAlpha = 1;
}
// A closed contour in ink, drawn as two or three overlapping strokes with gaps, like a hand would.
function contour(x, pts, w, o = {}) {
  const n = pts.length, starts = [0, Math.floor(n * .38), Math.floor(n * .7)];
  starts.forEach((s, k) => { const len = Math.floor(n * (.42 + rnd() * .12)); const seg = []; for (let i = 0; i <= len; i++) seg.push(pts[(s + i) % n]); ink(x, seg, w * (k === 0 ? 1 : .8), o); });
}
function glow(x, cx, cy, r, rgb, a) {
  x.save(); x.globalCompositeOperation = 'lighter'; const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(.22, `rgba(${rgb},${a * .45})`); gr.addColorStop(.6, `rgba(${rgb},${a * .12})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.restore();
}
function pool(x, cx, cy, rx, ry, rgb, a) { x.save(); x.globalCompositeOperation = 'lighter'; x.translate(cx, cy); x.scale(1, ry / rx); const gr = x.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, rx, 0, 7); x.fill(); x.restore(); }
function paper(g, W, H, alpha) {
  const t = document.createElement('canvas'); t.width = W * S; t.height = H * S; const x = t.getContext('2d'), d = x.createImageData(t.width, t.height);
  for (let i = 0; i < d.data.length; i += 4) { const v = 205 + rnd() * 50; d.data[i] = v; d.data[i + 1] = v - 3; d.data[i + 2] = v - 10; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); put(g, t, 'multiply', alpha);
  // fibres
  g.save(); g.setTransform(S,0,0,S,0,0); g.globalAlpha = .05; g.strokeStyle = '#f1e8d4'; g.lineWidth = .4;
  for (let i = 0; i < 260; i++) { const x0 = rnd() * W, y0 = rnd() * H, a = rnd() * 3; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + Math.cos(a) * 6, y0 + Math.sin(a) * 6 + 2, x0 + Math.cos(a) * 12, y0 + Math.sin(a) * 12); g.stroke(); }
  g.restore();
}
// A game-style bush: three plump lobes in moss, a light top, an ink contour, roses on top.
function bush(x, cx, cy, r, o = {}) {
  const lobes = [[-r * .55, r * .12, r * .62], [r * .55, r * .12, r * .62], [0, -r * .2, r * .74]];
  const outline = curve(t => { const a = t * 6.283; let best = 0; for (const [lx, ly, lr] of lobes) { const dx = Math.cos(a), dy = Math.sin(a); const b = lx * dx + ly * dy, cc = lx * lx + ly * ly - lr * lr; const d = b + Math.sqrt(Math.max(0, b * b - cc)); best = Math.max(best, d); } return [cx + Math.cos(a) * best, cy + Math.min(Math.sin(a) * best, r * .55)]; }, 60);
  wash(x, outline, '#2b5233', { passes: 10, jit: 1.5, a: .16, gran: .8, granColor: '#1c3a24' });
  wash(x, ring(cx, cy - r * .32, r * .75, r * .38, .12, cx), '#4f8a52', { passes: 6, jit: 1.5, a: .14, edge: .6 });
  wash(x, ring(cx - r * .25, cy - r * .5, r * .3, r * .14, .1, cy), '#8fc07a', { passes: 4, jit: 1, a: .16, edge: 0 });
  contour(x, outline, 1.6 * (r / 22));
  for (let k = 0; k < 4; k++) { const a = rnd() * 3, l = r * .3; ink(x, curve(t => [cx - r * .5 + k * r * .33 + Math.cos(a) * l * t * .3, cy - r * .1 - t * l * .5], 6), .7, { a: .5 }); }
  (o.roses ?? []).forEach(([dx, dy, rr], k) => rose(x, cx + dx, cy + dy, rr, k));
}
function rose(x, cx, cy, r, k = 0) {
  const base = ['#e98aa6', '#f2a7bd', '#f6bccc'][k % 3];
  wash(x, ring(cx, cy, r, r * .92, .08, k), '#b34d6a', { passes: 4, jit: .8, a: .3, edge: 0 });
  wash(x, ring(cx - .3, cy - .4, r * .86, r * .8, .08, k + 2), base, { passes: 6, jit: .7, a: .4, edge: .7 });
  wash(x, ring(cx - r * .3, cy - r * .35, r * .32, r * .22, .1, k + 4), '#ffe6ec', { passes: 3, jit: .5, a: .4, edge: 0 });
  contour(x, ring(cx, cy, r, r * .92, .08, k), .7, { color: '#5e1a2c', dry: .3 });
  ink(x, curve(t => [cx + Math.cos(t * 10 + k) * (r * .74 - t * r * .66), cy + Math.sin(t * 10 + k) * (r * .7 - t * r * .62)], 30), .7, { color: '#7a2238', dry: .05, a: .9 });
}
// A cute firefly friend: round glowing tail, little wings, a dark head with shiny eyes and a smile.
function friend(x, cx, cy, s, o = {}) {
  glow(x, cx, cy + s * .5, s * 7, '255,214,128', .45);
  for (const d of [-1, 1]) { // teardrop wings, lifted, translucent with a vein and a sheen
    const wing = curve(t => { const a = t * 6.283; const rr = s * (1.25 + .35 * Math.cos(a)); return [cx + d * (s * .5 + Math.cos(a) * rr * .62 + s * .55), cy - s * .95 + Math.sin(a) * rr * .42 - (d * Math.cos(a)) * s * .2]; }, 24);
    wash(x, wing, '#dfe9ff', { passes: 5, jit: .3, a: .22, edge: 1 });
    glow(x, cx + d * s * 1.2, cy - s * 1.05, s * 1.3, '235,243,255', .25);
    contour(x, wing, .55, { color: '#3a3f5a', dry: .2 });
    ink(x, [[cx + d * s * .5, cy - s * .8], [cx + d * s * 1.9, cy - s * 1.25]], .35, { color: '#6a7398', a: .7 }); }
  wash(x, ring(cx, cy + s * .55, s * .95, s * 1.05, .05, cx), '#fff0b0', { passes: 6, jit: .3, a: .45, edge: .4 });
  glow(x, cx, cy + s * .6, s * 1.6, '255,246,215', .7);
  wash(x, ring(cx, cy - s * .55, s * .85, s * .78, .05, cy), '#2a2018', { passes: 6, jit: .3, a: .5, edge: .4 });
  contour(x, ring(cx, cy - s * .55, s * .85, s * .78, .05, cy), .6);
  for (const d of [-1, 1]) { x.fillStyle = '#fff6d6'; x.beginPath(); x.ellipse(cx + d * s * .33, cy - s * .6, s * .17, s * .22, 0, 0, 7); x.fill(); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx + d * s * .3, cy - s * .68, s * .07, 0, 7); x.fill(); }
  x.strokeStyle = '#fff6d6'; x.lineWidth = s * .09; x.lineCap = 'round'; x.beginPath(); x.arc(cx, cy - s * .38, s * .16, .3, Math.PI - .3); x.stroke();
  x.fillStyle = 'rgba(242,167,189,.8)'; for (const d of [-1, 1]) { x.beginPath(); x.ellipse(cx + d * s * .58, cy - s * .38, s * .14, s * .09, 0, 0, 7); x.fill(); }
  for (const d of [-1, 1]) ink(x, curve(t => [cx + d * (s * .2 + t * s * .55), cy - s * 1.25 - Math.sin(t * 2.4) * s * .7], 8), .45);
}
function mushroom(x, cx, cy, s) {
  wash(x, [[cx - s * .3, cy], [cx + s * .3, cy], [cx + s * .24, cy - s * .9], [cx - s * .24, cy - s * .9]], '#efe4cc', { passes: 5, jit: .4, a: .4 });
  const cap = curve(t => [cx - s * 1.05 + t * s * 2.1, cy - s * .85 - Math.sin(t * Math.PI) * s * .95], 20).concat([[cx + s * 1.05, cy - s * .8], [cx - s * 1.05, cy - s * .8]]);
  wash(x, cap, '#c9503f', { passes: 7, jit: .5, a: .3, edge: 1, gran: .6, granColor: '#8e2f24' });
  for (const [dx, dy, r] of [[-.4, -1.25, .17], [.3, -1.45, .13], [.65, -1.05, .11], [-.75, -.98, .1]]) { x.fillStyle = '#f6eedb'; x.globalAlpha = .9; x.beginPath(); x.arc(cx + dx * s, cy + dy * s, r * s, 0, 7); x.fill(); } x.globalAlpha = 1;
  contour(x, cap, .9); ink(x, [[cx - s * .28, cy - s * .8], [cx - s * .3, cy]], .8); ink(x, [[cx + s * .28, cy - s * .8], [cx + s * .3, cy]], .8);
}
