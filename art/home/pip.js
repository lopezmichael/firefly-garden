// Pip, designed fresh: a firefly whose glowing tail is a little paper lantern.
// Shape language: a soft pear of light below, a round inky head above, petal wings, curly antennae.
function pipBelly(cx, cy, u) {
  const top = cy - .18 * u, bot = cy + 1.2 * u, pts = [];
  const w = (s) => u * .82 * Math.pow(Math.sin(Math.PI * Math.min(.999, .06 + s * .94)), .62) * (.72 + .4 * s);
  for (let i = 0; i <= 24; i++) { const s = i / 24; pts.push([cx + w(s), lerp(top, bot, s)]); }
  for (let i = 24; i >= 0; i--) { const s = i / 24; pts.push([cx - w(s), lerp(top, bot, s)]); }
  return { pts, top, bot, w };
}
const PIP_LANTERNS = {
  gold: { body: '#ffc35e', core: '#ffe7a0', hot: '#fff8dc', rib: '#c27a2c', gran: '#e09a3c', glow: '255,206,110', inner: '255,236,180' },
  rose: { body: '#e8705e', core: '#ffc3a0', hot: '#ffe9d6', rib: '#9e3326', gran: '#b8432c', glow: '255,160,120', inner: '255,214,180' },
  hybrid: { body: '#f2e6c4', core: '#ffd88a', hot: '#fff1c2', rib: '#c9a565', gran: '#d6c394', glow: '255,198,96', inner: '255,224,150' },
  moon: { body: '#efe4c8', core: '#fff8e8', hot: '#ffffff', rib: '#b9a77f', gran: '#cbbd98', glow: '255,238,200', inner: '255,250,230' },
};
function flower(x, fx, fy, r, kind, k, u) {
  if (kind === 'rose') { rose(x, fx, fy, r, k); return; }
  const petals = kind === 'daisy' ? 9 : 5, pc = kind === 'daisy' ? '#fbf6ea' : kind === 'forget' ? '#9fc2ea' : '#fbe3ec', cc = kind === 'daisy' ? '#f2c45c' : kind === 'forget' ? '#f6e08a' : '#f2a7bd';
  for (let p = 0; p < petals; p++) { const pa = p / petals * 6.283 + k; x.fillStyle = pc; x.globalAlpha = .96; x.beginPath(); x.ellipse(fx + Math.cos(pa) * r * .55, fy + Math.sin(pa) * r * .5, r * .55, r * .38, pa, 0, 7); x.fill();
    x.globalAlpha = .55; x.strokeStyle = '#2a211b'; x.lineWidth = .35 * u / 40; x.stroke(); }
  if (kind === 'forget') { x.globalAlpha = .5; x.fillStyle = '#6f97cc'; for (let p = 0; p < 5; p++) { const pa = p / 5 * 6.283 + k; x.beginPath(); x.ellipse(fx + Math.cos(pa) * r * .45, fy + Math.sin(pa) * r * .4, r * .18, r * .12, pa, 0, 7); x.fill(); } }
  x.globalAlpha = 1; x.fillStyle = cc; x.beginPath(); x.arc(fx, fy, r * .24, 0, 7); x.fill(); x.strokeStyle = '#2a211b'; x.lineWidth = .4 * u / 40; x.stroke();
}
// The wildflower garland as a ring in perspective around the neck: back half behind the head, front half over the chin.
function garlandItems(cx, ny, u) {
  const kinds = ['blossom', 'rose', 'forget', 'blossom', 'forget', 'rose', 'blossom', 'forget', 'rose', 'blossom', 'forget', 'rose', 'blossom', 'forget'];
  const items = [], n = 14;
  for (let k = 0; k < n; k++) { const th = k / n * 6.283 + .13; const depth = Math.sin(th); // +1 front, -1 back
    items.push({ fx: cx + Math.cos(th) * .64 * u, fy: ny + depth * .25 * u + Math.max(0, depth) ** 2 * .07 * u, r: u * (.135 + .05 * (depth + 1) / 2) * (k % 3 === 1 ? .92 : 1), kind: kinds[k], k, depth, th }); }
  return items;
}
function garlandBuds(x, items, u, front) {
  for (let i = 0; i < items.length; i++) { const a = items[i], b = items[(i + 1) % items.length]; if ((a.depth + b.depth > 0) !== front) continue;
    const mx = (a.fx + b.fx) / 2, my = (a.fy + b.fy) / 2 - .02 * u; x.fillStyle = i % 2 ? '#f6bccc' : '#fbf6ea'; x.globalAlpha = .95; x.beginPath(); x.arc(mx, my, .045 * u, 0, 7); x.fill(); x.globalAlpha = .5; x.strokeStyle = '#2a211b'; x.lineWidth = .3 * u / 40; x.stroke(); }
  x.globalAlpha = 1;
  if (front) for (const d of [-1, 1]) { const it = items.reduce((m, t) => (d * t.fx > d * m.fx ? t : m)); // a trailing leafy tendril at each side
    ink(x, curve(t => [it.fx + d * t * .22 * u, it.fy + t * .34 * u + Math.sin(t * 5) * .03 * u], 10), .7 * u / 40, { color: '#2f5636', dry: .1 });
    for (const t of [.35, .7, 1]) { x.fillStyle = '#4f8a52'; x.globalAlpha = .9; x.beginPath(); x.ellipse(it.fx + d * t * .22 * u + d * .05 * u, it.fy + t * .34 * u, .07 * u, .03 * u, d * .8, 0, 7); x.fill(); } x.globalAlpha = 1; }
}
function garlandLeaves(x, items, u, front) {
  for (const it of items) { if ((it.depth > 0) !== front) continue; const a = it.th + 1.9; for (const s2 of [-1, 1]) { const lx = it.fx + Math.cos(a) * it.r * .9 * s2, ly = it.fy + Math.sin(a) * it.r * .45 * s2 + it.r * .25;
    x.fillStyle = s2 > 0 ? '#4f8a52' : '#3d6b45'; x.globalAlpha = .92; x.beginPath(); x.ellipse(lx, ly, it.r * .75, it.r * .32, a, 0, 7); x.fill(); x.globalAlpha = .5; x.strokeStyle = '#14211a'; x.lineWidth = .35 * u / 40; x.stroke(); } }
  x.globalAlpha = 1;
}
function gateCtx(real) {
  const keep = new Set(['save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'setTransform', 'createRadialGradient', 'createLinearGradient', 'getTransform']);
  const local = {};
  return new Proxy(real, { get(t, p) { if (p in local) return local[p]; const v = real[p]; if (typeof v === 'function') return keep.has(p) ? v.bind(real) : () => {}; return v; }, set(t, p, v) { local[p] = v; return true; } });
}
function pip(x, cx, cy, u, o = {}) {
  const REAL = x, NULLX = gateCtx(x), only = o.only; let curSec = null;
  const sec = (name) => { curSec = name; x = !only || only.includes(name) ? REAL : NULLX; };
  const L = PIP_LANTERNS[o.lantern ?? 'gold'], acc = o.acc ?? null;
  const expr = o.expr ?? 'smile', tilt = o.tilt ?? 0, arms = o.arms ?? 'down', glowOn = o.glow ?? 1, wingUp = o.wingUp ?? 0;
  x.save(); x.translate(cx, cy); x.rotate(tilt); x.translate(-cx, -cy);
  const [ssx, ssy] = o.squash ?? [1, 1]; x.translate(cx, cy + .5 * u); x.scale(ssx, ssy); x.translate(-cx, -(cy + .5 * u));
  const hx = cx, hy = cy - (o.garland ? .64 : .78) * u, hr = (o.garland ? .6 : .64) * u, headTilt = o.headTilt ?? 0;
  const G = o.garland ? garlandItems(cx, cy - .2 * u, u) : null;
  // light first, so everything sits in it
  sec('glow');
  if (glowOn) { glow(x, cx, cy + .55 * u, u * 3.2, L.glow, .34 * glowOn); glow(x, cx, cy + .6 * u, u * 1.3, L.inner, .4 * glowOn); }
  // wings: two big petals and two small ones, rose-white, veined, behind the body
  const petal = (ax, ay, len, wid, ang) => curve(t => { const a = t * 6.283; const along = (1 - Math.cos(a)) / 2 * len; const across = Math.sin(a) * wid * Math.sin(Math.PI * (1 - Math.cos(a)) / 2) ** .8;
    return [ax + Math.cos(ang) * along - Math.sin(ang) * across, ay + Math.sin(ang) * along + Math.cos(ang) * across]; }, 30);
  if (o.part !== 'body') for (const d of [-1, 1]) {
    sec(d < 0 ? 'wingL' : 'wingR');
    const ws = o.wingScale ?? (o.garland ? .82 : 1);
    for (const [len, wid, ang, dy] of [[1.55 * u * ws, .5 * u * ws, -.55 - wingUp, -.15 * u], [1.05 * u * ws, .34 * u * ws, .1 - wingUp * .5, .12 * u]]) {
      const a = d < 0 ? Math.PI - ang : ang, ax = cx + d * .3 * u, ay = cy - .2 * u + dy;
      const P = petal(ax, ay, len, wid, a);
      if (o.wings === 'leaf') { wash(x, P, '#9fd08a', { passes: 6, jit: .4, a: .26, edge: 1.4 }); wash(x, petal(ax, ay, len * .4, wid * .5, a), '#5f9a5c', { passes: 3, jit: .3, a: .22, edge: 0 }); }
      else { wash(x, P, o.wingTint ?? '#f6c3d3', { passes: 6, jit: .4, a: .3, edge: 1.4 }); wash(x, petal(ax, ay, len * .35, wid * .6, a), '#e48aa8', { passes: 3, jit: .3, a: .28, edge: 0 }); }
      wash(x, petal(ax, ay, len * .55, wid * .45, a), '#ffffff', { passes: 3, jit: .3, a: .2, edge: 0 });
      contour(x, P, .7 * u / 40, { color: '#4a3a52', dry: .25 });
      ink(x, [[ax, ay], [ax + Math.cos(a) * len * .8, ay + Math.sin(a) * len * .8]], .45 * u / 40, { color: o.wings === 'leaf' ? '#3d6b45' : '#c48aa0', a: .8 });
      if (o.wings === 'leaf') for (let k = 1; k < 4; k++) { const bx = ax + Math.cos(a) * len * k * .2, by = ay + Math.sin(a) * len * k * .2; for (const side of [-1, 1]) ink(x, [[bx, by], [bx + Math.cos(a + side * .9) * wid * .7, by + Math.sin(a + side * .9) * wid * .7]], .35 * u / 40, { color: '#3d6b45', a: .6 }); }
    }
  }
  if (o.part === 'wings') { x.restore(); return; }
  x.save(); { const bt = cy - .18 * u; x.translate(cx, bt); x.transform(1, 0, o.bend ?? 0, 1, 0, 0); x.translate(-cx, -bt); }
  sec('lantern');
  // the lantern belly: warm paper lit from inside, ribs, a wooden cap ring, a red tassel
  const B = pipBelly(cx, cy, u);
  wash(x, B.pts, L.body, { passes: 9, jit: .5, a: .3, edge: 1.1, gran: .4, granColor: L.gran });
  wash(x, pipBelly(cx, cy + .14 * u, u * .7).pts, L.core, { passes: 6, jit: .4, a: .35, edge: 0 });
  wash(x, ring(cx - .12 * u, cy + .5 * u, .26 * u, .36 * u, .05), L.hot, { passes: 4, jit: .3, a: .45, edge: 0 });
  for (const k of [-.55, -.2, .2, .55]) ink(x, curve(t => { const y = lerp(B.top + .05 * u, B.bot - .05 * u, t), s = (y - B.top) / (B.bot - B.top); return [cx + k * B.w(s) * 1.05, y]; }, 14), .55 * u / 40, { color: L.rib, a: .6, dry: .1 });
  contour(x, B.pts, 1.5 * u / 40, { color: '#2a1d14' });
  // arms: little stubs from the belly's sides
  const arm = (d, up) => { const sx = cx + d * .62 * u, sy = cy + .25 * u; const ex = sx + d * .32 * u, ey = sy + (up ? -.55 : .25) * u;
    ink(x, curve(t => [lerp(sx, ex, t) + d * Math.sin(t * 3) * .05 * u, lerp(sy, ey, t)], 10), 4.4 * u / 40, { color: '#2c2a48', dry: 0, taper: 0 });
    ink(x, curve(t => [lerp(sx, ex, t) + d * Math.sin(t * 3) * .05 * u + d * .03 * u, lerp(sy, ey, t)], 10), 1 * u / 40, { color: '#14111f', dry: .2 });
    wash(x, ring(ex, ey, .13 * u, .11 * u, .05, ex), '#2c2a48', { passes: 4, jit: .2, a: .5, edge: 1 }); contour(x, ring(ex, ey, .13 * u, .11 * u, .05, ex), .9 * u / 40, { color: '#14111f', dry: 0 });
    wash(x, ring(ex + d * .09 * u, ey - .06 * u, .05 * u, .045 * u, .05), '#2c2a48', { passes: 3, jit: .1, a: .5, edge: 1 }); };
  sec('armL'); arm(-1, arms === 'up'); sec('armR'); arm(1, arms === 'up' || arms === 'wave');
  sec('lantern');
  x.fillStyle = '#4a2f1e'; x.beginPath(); x.ellipse(cx, B.top + .02 * u, .4 * u, .11 * u, 0, 0, 7); x.fill();
  ink(x, curve(t => [cx - .4 * u + t * .8 * u, B.top + .02 * u + Math.sin(t * Math.PI) * .06 * u], 10), 1.1 * u / 40, { taper: 0 });
  sec('tassel');
  x.save(); x.translate(cx, B.bot); x.rotate(o.swing ?? 0); x.translate(-cx, -B.bot);
  ink(x, [[cx, B.bot - .04 * u], [cx, B.bot + .22 * u]], 1.8 * u / 40, { color: '#8a2a1e', dry: 0, taper: 0 }); x.fillStyle = '#4a2f1e'; x.beginPath(); x.ellipse(cx, B.bot - .02 * u, .14 * u, .05 * u, 0, 0, 7); x.fill();
  if (false) { // a tiny rosebud hanging from the lantern, cupped in two sepals
    const by = B.bot + .36 * u;
    wash(x, ring(cx, by, .13 * u, .16 * u, .06, 3), '#ec8fab', { passes: 6, jit: .2, a: .45, edge: 1.2 });
    wash(x, ring(cx - .03 * u, by - .05 * u, .05 * u, .06 * u, .05), '#ffd6e2', { passes: 3, jit: .1, a: .4, edge: 0 });
    contour(x, ring(cx, by, .13 * u, .16 * u, .06, 3), .8 * u / 40, { color: '#5e1a2c', dry: .2 });
    ink(x, curve(t => [cx - .06 * u + t * .1 * u, by - .02 * u + Math.sin(t * 4) * .04 * u], 8), .55 * u / 40, { color: '#a8324f' });
    for (const d of [-1, 1]) { const sep = [[cx, by + .14 * u], [cx + d * .16 * u, by + .02 * u], [cx + d * .05 * u, by + .1 * u]]; wash(x, sep, '#4f8a52', { passes: 4, jit: .1, a: .55, edge: 1 }); }
  } else {
    wash(x, ring(cx, B.bot + .26 * u, .09 * u, .07 * u, .05), '#c8402e', { passes: 4, jit: .2, a: .6, edge: 1 });
    for (const dx of [-.06, 0, .06]) ink(x, [[cx + dx * u * .6, B.bot + .3 * u], [cx + dx * u, B.bot + .5 * u]], .9 * u / 40, { color: '#c8402e', dry: .2 });
  }
  x.restore();
  x.restore();
  if (o.collar) { // green sepals fanned over the lantern's shoulders, like a flower bud opening
    const n = 7;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1), ang = Math.PI * (.12 + t * .76), len = u * (.42 + .1 * Math.sin(t * Math.PI));
      const bx = cx + Math.cos(Math.PI - ang) * .34 * u, by = B.top + .02 * u;
      const tipx = bx + Math.cos(Math.PI - ang) * len * .7, tipy = by + Math.sin(ang) * len;
      const leaf = [[bx - .1 * u, by], [lerp(bx, tipx, .5) - .1 * u * Math.sin(ang), lerp(by, tipy, .5)], [tipx, tipy], [lerp(bx, tipx, .5) + .1 * u * Math.sin(ang), lerp(by, tipy, .5)], [bx + .1 * u, by]];
      wash(x, leaf, k % 2 ? '#4f8a52' : '#5f9a5c', { passes: 5, jit: .2, a: .5, edge: 1.2 });
      contour(x, leaf, .8 * u / 40, { color: '#14211a', dry: .3 });
      ink(x, [[bx, by], [lerp(bx, tipx, .8), lerp(by, tipy, .8)]], .4 * u / 40, { color: '#9fd08a', a: .7 });
    }
  }
  sec('garlandBack');
  if (G) { garlandLeaves(x, G, u, false); garlandBuds(x, G, u, false); G.filter(it => it.depth <= 0).sort((a, b) => a.depth - b.depth).forEach(it => flower(x, it.fx, it.fy, it.r * .9, it.kind, it.k, u)); }
  if (G) { x.save(); x.translate(cx, cy - .14 * u); x.scale(1, .32); const sh = x.createRadialGradient(0, 0, 0, 0, 0, .62 * u); sh.addColorStop(0, 'rgba(20,14,30,.55)'); sh.addColorStop(1, 'rgba(20,14,30,0)'); x.fillStyle = sh; x.beginPath(); x.arc(0, 0, .62 * u, 0, 7); x.fill(); x.restore(); }
  // the head rests on the neck and can tilt about it
  x.save(); x.translate(hx, hy + hr * .85); x.rotate(headTilt); x.translate(-hx, -(hy + hr * .85));
  sec('head');
  // head: a soft round ink-wash ball, cool indigo, with a highlight
  const H = ring(hx, hy, hr * (o.garland ? 1.1 : 1.04), hr * (o.garland ? .92 : .96), .025, 2, 36);
  wash(x, H, '#2c2a48', { passes: 10, jit: .4, a: .32, edge: 1, gran: .5, granColor: '#1b1a30' });
  wash(x, ring(hx - hr * .35, hy - hr * .45, hr * .32, hr * .18, .05), '#5a5a86', { passes: 4, jit: .3, a: .3, edge: 0 });
  glow(x, hx, hy + hr * .9, hr * 1.2, L.glow, .25 * glowOn); // the lantern lights her chin
  contour(x, H, 1.5 * u / 40, { color: '#14111f' });
  // antennae: curl outward, end in tiny lights
  for (const d of [-1, 1]) {
    sec(d < 0 ? 'antL' : 'antR');
    const pts = curve(t => [hx + d * (.16 * u + t * .42 * u + Math.sin(t * Math.PI * .9) * .22 * u - t * t * t * .12 * u), hy - hr * .8 - t * .8 * u + t * t * t * .26 * u], 18);
    ink(x, pts, 1.3 * u / 40, { color: '#14111f', dry: 0 });
    const [ex, ey] = pts[18]; glow(x, ex, ey, .28 * u, L.inner, .55 * glowOn);
    x.fillStyle = '#fff1bf'; x.beginPath(); x.arc(ex, ey, .06 * u, 0, 7); x.fill(); x.strokeStyle = '#14111f'; x.lineWidth = .8 * u / 40; x.stroke();
  }
  if (acc === 'hood') { // a rose-petal hood: two petals wrapping the crown, one tip flopping to the side
    const hood = curve(t => { const a = Math.PI + t * Math.PI; const r = hr * (1.12 + .06 * Math.sin(t * 9)); return [hx + Math.cos(a) * r, hy - hr * .05 + Math.sin(a) * r * 1.02]; }, 30)
      .concat([[hx + hr * 1.12, hy - hr * .02], [hx + hr * 1.5, hy + hr * .3], [hx + hr * .9, hy - hr * .22], [hx - hr * .9, hy - hr * .2]]);
    wash(x, hood, '#ec8fab', { passes: 8, jit: .4, a: .32, edge: 1.2, gran: .3, granColor: '#c95f80' });
    wash(x, curve(t => { const a = Math.PI * 1.15 + t * Math.PI * .5; return [hx + Math.cos(a) * hr * .8, hy - hr * .15 + Math.sin(a) * hr * .7]; }, 12).concat([[hx, hy - hr * .3]]), '#f8c6d6', { passes: 4, jit: .3, a: .35, edge: 0 });
    contour(x, hood, 1.3 * u / 40, { color: '#5e1a2c' });
    ink(x, curve(t => [hx - hr * .2 + t * hr * .5, hy - hr * 1.05 + Math.sin(t * 3) * hr * .08], 8), .7 * u / 40, { color: '#a8324f', a: .7 });
  }
  if (acc === 'leaf') { // a little leaf cap, tilted, with its stem and vein
    const lx = hx + hr * .15, ly = hy - hr * .92, ang = -.45;
    const leaf = curve(t => { const a = t * 6.283; const along = (1 - Math.cos(a)) / 2 * hr * 1.25, across = Math.sin(a) * hr * .42 * Math.sin(Math.PI * (1 - Math.cos(a)) / 2);
      return [lx + Math.cos(ang) * along - Math.sin(ang) * across - hr * .55, ly + Math.sin(ang) * along + Math.cos(ang) * across + hr * .1]; }, 28);
    wash(x, leaf, '#5f9a5c', { passes: 7, jit: .3, a: .35, edge: 1.2, gran: .4, granColor: '#3d6b45' });
    wash(x, leaf.slice(2, 12), '#9fd08a', { passes: 3, jit: .2, a: .3, edge: 0 });
    contour(x, leaf, 1.1 * u / 40, { color: '#14211a' });
    ink(x, [[lx - hr * .5, ly + hr * .12], [lx + hr * .55, ly - hr * .35]], .7 * u / 40, { color: '#2f5636', a: .8 });
    ink(x, curve(t => [lx - hr * .55 - t * hr * .2, ly + hr * .1 - Math.sin(t * 3) * hr * .15], 6), 1 * u / 40, { color: '#2f5636', dry: 0 });
  }
  if (o.flowers) { // a garland of little flowers where the head meets the lantern
    const n = o.flowers === 'roses' ? 7 : 8, ry = B.top + .03 * u;
    const kinds = { mixed: ['blossom', 'rose', 'forget', 'blossom', 'rose', 'forget', 'blossom', 'rose'], daisy: Array(8).fill('daisy'), roses: Array(7).fill('rose') }[o.flowers];
    // a few leaves tucked behind the flowers
    for (let k = 0; k < n + 1; k++) { const t = k / n, a = Math.PI * (1.05 - t * 1.1); const lx = cx + Math.cos(a) * .68 * u, ly = ry + Math.sin(a) * -.16 * u + .1 * u;
      x.fillStyle = k % 2 ? '#4f8a52' : '#3d6b45'; x.globalAlpha = .9; x.beginPath(); x.ellipse(lx, ly + .05 * u, .16 * u, .07 * u, a + 1.2, 0, 7); x.fill(); }
    x.globalAlpha = 1;
    for (let k = 0; k < n; k++) {
      const t = (k + .5) / n, a = Math.PI * (1 - t), fx = cx + Math.cos(a) * .62 * u, fy = ry - Math.sin(a) * .14 * u + .1 * u, r = .17 * u * (k % 2 ? .88 : 1.06), kind = kinds[k % kinds.length];
      if (kind === 'rose') { rose(x, fx, fy, r, k); continue; }
      const petals = kind === 'daisy' ? 9 : 5, pc = kind === 'daisy' ? '#fbf6ea' : kind === 'forget' ? '#9fc2ea' : '#fbe3ec', cc = kind === 'daisy' ? '#f2c45c' : kind === 'forget' ? '#f6e08a' : '#f2a7bd';
      for (let p = 0; p < petals; p++) { const pa = p / petals * 6.283 + k; x.fillStyle = pc; x.globalAlpha = .95; x.beginPath(); x.ellipse(fx + Math.cos(pa) * r * .55, fy + Math.sin(pa) * r * .55, r * (kind === 'daisy' ? .5 : .55), r * (kind === 'daisy' ? .2 : .38), pa, 0, 7); x.fill();
        x.globalAlpha = .6; x.strokeStyle = '#2a211b'; x.lineWidth = .35 * u / 40; x.stroke(); }
      x.globalAlpha = 1; x.fillStyle = cc; x.beginPath(); x.arc(fx, fy, r * .26, 0, 7); x.fill(); x.strokeStyle = '#2a211b'; x.lineWidth = .4 * u / 40; x.stroke();
    }
  }
  // face
  const ey = hy + .04 * u, ex = .25 * u;
  const [lkx, lky] = o.look ?? [0, 0];
  const eyeOpen = (d, big = 1) => { const was = curSec; sec('eyes'); x.fillStyle = '#fff6dc'; x.beginPath(); x.ellipse(hx + d * ex, ey, .14 * u * big, .18 * u * big, 0, 0, 7); x.fill();
    sec('pupils'); x.fillStyle = '#17121c'; x.beginPath(); x.ellipse(hx + d * ex + .01 * u + lkx * .04 * u, ey + .03 * u + lky * .04 * u, .1 * u * big, .13 * u * big, 0, 0, 7); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(hx + d * ex - .03 * u * big + lkx * .03 * u, ey - .04 * u * big + lky * .03 * u, .045 * u * big, 0, 7); x.fill(); x.beginPath(); x.arc(hx + d * ex + .04 * u * big, ey + .07 * u * big, .02 * u * big, 0, 7); x.fill(); sec(was); };
  const eyeArc = (d, up) => { const was = curSec; sec('eyes'); x.strokeStyle = '#fff6dc'; x.lineWidth = .06 * u; x.lineCap = 'round'; x.beginPath(); if (up) x.arc(hx + d * ex, ey + .06 * u, .12 * u, Math.PI + .5, -.5); else x.arc(hx + d * ex, ey - .05 * u, .12 * u, .5, Math.PI - .5); x.stroke(); sec(was); };
  const eyeLine = (d) => { const was = curSec; sec('eyes'); x.strokeStyle = '#fff6dc'; x.lineWidth = .05 * u; x.lineCap = 'round'; x.beginPath(); x.moveTo(hx + d * ex - .1 * u, ey + .02 * u); x.lineTo(hx + d * ex + .1 * u, ey + .02 * u); x.stroke(); sec(was); };
  const mouth = (kind) => { const was = curSec; sec('mouth'); const my = hy + .27 * u; x.strokeStyle = '#fff6dc'; x.fillStyle = '#f2788f'; x.lineWidth = .045 * u; x.lineCap = 'round'; x.beginPath();
    if (kind === 'smile') x.arc(hx, my - .03 * u, .08 * u, .25, Math.PI - .25);
    else if (kind === 'open') { x.ellipse(hx, my + .02 * u, .1 * u, .08 * u, 0, 0, Math.PI); x.closePath(); x.fill(); }
    else if (kind === 'o') { x.ellipse(hx, my + .02 * u, .05 * u, .06 * u, 0, 0, 7); x.fill(); sec(was); return; }
    else if (kind === 'w') { x.moveTo(hx - .09 * u, my - .02 * u); x.quadraticCurveTo(hx - .045 * u, my + .06 * u, hx, my - .01 * u); x.quadraticCurveTo(hx + .045 * u, my + .06 * u, hx + .09 * u, my - .02 * u); }
    x.stroke(); sec(was); };
  if (expr === 'smile') { eyeOpen(-1); eyeOpen(1); mouth('smile'); }
  if (expr === 'happy') { eyeArc(-1, true); eyeArc(1, true); mouth('open'); }
  if (expr === 'wonder') { eyeOpen(-1, 1.18); eyeOpen(1, 1.18); mouth('o'); }
  if (expr === 'sleepy') { eyeLine(-1); eyeLine(1); mouth('w'); }
  if (expr === 'blink') { eyeLine(-1); eyeLine(1); mouth('smile'); }
  if (expr === 'wink') { eyeOpen(-1); eyeArc(1, true); mouth('open'); }
  sec('mouth'); x.fillStyle = 'rgba(242,140,165,.75)'; for (const d of [-1, 1]) { x.beginPath(); x.ellipse(hx + d * .44 * u, hy + .2 * u, .11 * u, .065 * u, 0, 0, 7); x.fill(); }
  x.restore();
  sec('garlandFront');
  if (G) { garlandLeaves(x, G, u, true); garlandBuds(x, G, u, true); G.filter(it => it.depth > 0).sort((a, b) => a.depth - b.depth).forEach(it => flower(x, it.fx, it.fy, it.r, it.kind, it.k, u)); }
  sec('fx');
  if (expr === 'sleepy') { x.font = `700 ${.3 * u}px Georgia`; x.fillStyle = '#9fb0cf'; x.fillText('z', hx + .7 * u, hy - .5 * u); x.font = `700 ${.22 * u}px Georgia`; x.fillText('z', hx + .95 * u, hy - .8 * u); }
  x.restore();
  sec('fx'); const fx = o.fx;
  const star = (sx, sy, r, a = 1) => { glow(x, sx, sy, r * 3, '255,226,150', .4 * a); x.fillStyle = '#fff4cc'; x.globalAlpha = a; x.beginPath(); for (let k = 0; k < 8; k++) { const rr = k % 2 ? r * .35 : r, aa = k * Math.PI / 4 - Math.PI / 2; x.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr); } x.closePath(); x.fill(); x.globalAlpha = 1; };
  if (fx === 'sparkle') [[-1.3, -1.35, .26], [1.35, -1.15, .3], [-1.6, -.25, .18], [1.65, .1, .2], [0, -2.15, .2]].forEach(([dx, dy, r]) => star(cx + dx * u, cy + dy * u, r * u));
  if (fx === 'hearts') [[1.15, -1.6, .2], [1.55, -1.05, .15], [-1.3, -1.4, .16]].forEach(([dx, dy, r]) => { const hx2 = cx + dx * u, hy2 = cy + dy * u, k = r * u; x.fillStyle = '#f28ca5'; x.beginPath(); x.moveTo(hx2, hy2 + k * .9); x.bezierCurveTo(hx2 - k * 1.6, hy2 - k * .2, hx2 - k * .6, hy2 - k * 1.3, hx2, hy2 - k * .4); x.bezierCurveTo(hx2 + k * .6, hy2 - k * 1.3, hx2 + k * 1.6, hy2 - k * .2, hx2, hy2 + k * .9); x.fill(); x.strokeStyle = '#5e1a2c'; x.lineWidth = .5 * u / 40; x.stroke(); });
  if (fx === 'notice') { const nx = cx + 1.1 * u, ny = cy - 1.7 * u; glow(x, nx, ny, .75 * u, '255,226,150', .55); ink(x, [[nx, ny - .34 * u], [nx + .03 * u, ny + .09 * u]], 4.6 * u / 40, { color: '#fff1bf', dry: 0 }); x.fillStyle = '#fff1bf'; x.beginPath(); x.arc(nx + .03 * u, ny + .25 * u, .075 * u, 0, 7); x.fill(); }
  if (fx === 'motion') for (const d of [-1, 1]) for (let k = 0; k < 3; k++) ink(x, [[cx + d * (.9 + k * .12) * u, cy + (.9 + k * .22) * u], [cx + d * (.75 + k * .12) * u, cy + (1.25 + k * .22) * u]], 1.1 * u / 40, { color: '#d9cfb8', a: .7 });
}

const FRIEND_TINTS = {
  gold: { body: '#f2e6c4', core: '#ffd88a', hot: '#fff1c2', rib: '#c9a565', gran: '#d6c394', glow: '255,198,96', inner: '255,224,150' },
  peach: { body: '#f7dccb', core: '#ffb98e', hot: '#ffe6d6', rib: '#c98a64', gran: '#e0b398', glow: '255,160,110', inner: '255,200,160' },
  mint: { body: '#e0efdc', core: '#a8e6bb', hot: '#e6fbeb', rib: '#7fae8a', gran: '#b9d6bd', glow: '140,230,170', inner: '190,245,205' },
  lilac: { body: '#ebe2f4', core: '#cdb8ff', hot: '#f1eaff', rib: '#9f8bc4', gran: '#cbbfe0', glow: '190,165,255', inner: '220,205,255' },
  sky: { body: '#dfe9f4', core: '#a9cdff', hot: '#e8f2ff', rib: '#7f9cc4', gran: '#bccce0', glow: '140,190,255', inner: '200,225,255' },
};
function lanternBug(x, cx, cy, u, o = {}) {
  PIP_LANTERNS.friend = FRIEND_TINTS[o.tint ?? 'gold'];
  pip(x, cx, cy, u, { lantern: 'friend', expr: o.expr ?? 'smile', tilt: o.tilt ?? 0, wingScale: o.wingScale ?? .7, glow: .9, swing: o.swing ?? 0, bend: o.bend ?? 0, squash: o.squash, arms: o.arms, look: o.look, headTilt: o.headTilt ?? 0, wingTint: o.wingTint, wingUp: o.wingUp ?? 0, fx: o.fx });
}

function groundShadow(x, cx, groundY, u, height) {
  const k = Math.max(.25, 1 - height / (3.2 * u)); x.save(); x.translate(cx, groundY); x.scale(1, .22);
  const r = .8 * u * (.6 + .4 * k); const gr = x.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, `rgba(6,10,24,${.55 * k})`); gr.addColorStop(1, 'rgba(6,10,24,0)'); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore();
}

function pipPivots(cx, cy, u, o = {}) {
  const hy = cy - (o.garland ? .64 : .78) * u, hr = (o.garland ? .6 : .64) * u, bot = cy + 1.2 * u;
  return { wingL: [cx - .3 * u, cy - .28 * u], wingR: [cx + .3 * u, cy - .28 * u], body: [cx, cy + .5 * u], armL: [cx - .62 * u, cy + .25 * u], armR: [cx + .62 * u, cy + .25 * u],
    tassel: [cx, bot], neck: [cx, hy + hr * .85], antL: [cx - .16 * u, hy - hr * .8], antR: [cx + .16 * u, hy - hr * .8], eyes: [cx, hy + .04 * u] };
}
