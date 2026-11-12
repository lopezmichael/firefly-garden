// Firefly Garden difficulty report: calcs and drawings.

const TECH_LABEL = {
  'T1-satisfied': 'T1 bush satisfied',
  'T1-needs-all': 'T1 bush needs all',
  'T2-one-source': 'T2 one light source',
  'T2-bush-room': 'T2 bush room',
  'T3-overlap': 'T3 overlapping bushes',
  'T4-lookahead': 'T4 lookahead',
  'T5-trial': 'T5 deep trial',
};
const TIERS = [1, 2, 3, 4, 5];
// Content policy chosen on 2026-11-12 (DIFFICULTY_CONFIG.limits in the repo).
const CAP_SECONDS = 300;
const CAP_CHAPTER1_SECONDS = 60;
const CAP_CHAPTER3_SECONDS = 240;
// Shipped hints per rewarded ad (PLAYER_CONFIG.economy in the repo).
const CHOSEN_HINTS_PER_AD = 3;

// ---- Calcs --------------------------------------------------------------

dash.calc('gate', {
  title: 'Share of levels needing T3 or harder',
  description: 'Levels whose hardest technique is T3 or above, for 8x8 and up, for 4x4 and 5x5, and overall.',
  inputs: ['census'],
  fn: (census) => {
    const lvls = census.map((r) => ({ size: +r.size, tier: +r.tier }));
    const group = (key, rows) => ({
      key, n: rows.length,
      hard: rows.filter((r) => r.tier >= 3).length,
      share: rows.length ? rows.filter((r) => r.tier >= 3).length / rows.length : 0,
    });
    return [
      group('large', lvls.filter((r) => r.size >= 8)),
      group('small', lvls.filter((r) => r.size <= 5)),
      group('all', lvls),
    ];
  },
});

dash.calc('tierBySize', {
  title: 'Levels by size, clue mode and hardest tier',
  description: 'Count and share of levels at each tier for each board size and clue mode.',
  inputs: ['census'],
  fn: (census) => {
    const out = [];
    for (const mode of ['All clues', 'Hidden clues']) {
      const sizes = [...new Set(census.map((r) => +r.size))].sort((a, b) => a - b);
      for (const size of sizes) {
        const rows = census.filter((r) => r.mode === mode && +r.size === size);
        for (const tier of [1, 2, 3, 4, 5, 6]) {
          const count = rows.filter((r) => +r.tier === tier).length;
          out.push({ key: `${mode}|${size}|${tier}`, mode, size, tier, count, total: rows.length, share: rows.length ? count / rows.length : 0 });
        }
      }
    }
    return out;
  },
});

dash.calc('medianTime', {
  title: 'Median estimated solve time by size',
  description: 'Median of the estimated solve time in seconds, per board size (both clue modes) and per size and mode.',
  inputs: ['census'],
  fn: (census) => {
    const med = (xs) => {
      const s = xs.slice().sort((a, b) => a - b);
      const m = s.length >> 1;
      return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
    };
    const sizes = [...new Set(census.map((r) => +r.size))].sort((a, b) => a - b);
    const out = sizes.map((size) => ({ key: String(size), size, mode: 'Both', median: med(census.filter((r) => +r.size === size).map((r) => +r.seconds)) }));
    for (const mode of ['All clues', 'Hidden clues']) {
      for (const size of sizes) {
        out.push({ key: `${size}|${mode}`, size, mode, median: med(census.filter((r) => +r.size === size && r.mode === mode).map((r) => +r.seconds)) });
      }
    }
    return out;
  },
});

dash.calc('techniques', {
  title: 'Deduction steps by technique',
  description: 'Total grader steps per technique across all census levels.',
  inputs: ['census'],
  fn: (census) => {
    const keys = ['T1-satisfied', 'T1-needs-all', 'T2-one-source', 'T2-bush-room', 'T3-overlap', 'T4-lookahead', 'T5-trial'];
    const total = census.reduce((a, r) => a + keys.reduce((b, k) => b + (+r[k] || 0), 0), 0);
    return keys.map((k) => {
      const steps = census.reduce((a, r) => a + (+r[k] || 0), 0);
      return { technique: k, tier: +k[1], steps, share: total ? steps / total : 0 };
    });
  },
});

dash.calc('timeStats', {
  title: 'Longest and median estimated solve time',
  description: 'The longest and the median estimated solve time across all census levels, in seconds.',
  inputs: ['census'],
  fn: (census) => {
    const s = census.map((r) => +r.seconds).sort((a, b) => a - b);
    return [
      { key: 'longest', seconds: s.length ? s[s.length - 1] : null },
      { key: 'median', seconds: s.length ? s[s.length >> 1] : null },
    ];
  },
});

dash.calc('simSummary', {
  title: 'Simulation summary',
  description: 'From the simulated players: share who solved the last level of chapter 1 and of chapter 3, and mean hint use by level role.',
  inputs: ['players'],
  fn: (players) => {
    const all = players.filter((r) => r.profile === 'all').sort((a, b) => a.position - b.position);
    const out = [];
    // "Cleared" is the share of all simulated players who solved that level.
    const lastC1 = all.filter((r) => r.chapter === 'c1').pop();
    if (lastC1) out.push({ key: 'ch1-all', value: lastC1.cleared });
    const finalOf = (profile) => {
      const rows = players.filter((r) => r.profile === profile).sort((a, b) => a.position - b.position);
      const last = rows[rows.length - 1];
      return last ? last.cleared : null;
    };
    for (const p of ['all', 'newcomer', 'casual', 'puzzler', 'expert']) out.push({ key: `final-${p}`, value: finalOf(p) });
    for (const role of ['opener', 'climb', 'breather', 'peak']) {
      const rows = all.filter((r) => r.role === role);
      out.push({ key: `hint-${role}`, value: rows.length ? rows.reduce((a, r) => a + r.hintRate, 0) / rows.length : null });
    }
    out.push({ key: 'hint-worst', value: all.reduce((m, r) => Math.max(m, r.hintRate), 0) });
    const laterPeaks = all.filter((r) => r.role === 'peak' && r.chapter !== 'c1');
    out.push({ key: 'hint-peak-later', value: laterPeaks.length ? laterPeaks.reduce((a, r) => a + r.hintRate, 0) / laterPeaks.length : null });
    return out;
  },
});

dash.calc('policyDelta', {
  title: 'Policy effect with no assumed change in quitting',
  description: 'Everyone: minutes played and ad views with the policy (no assumed effect) minus without it.',
  inputs: ['policy'],
  fn: (policy) => {
    const get = (k) => policy.find((r) => r.key === k);
    const a = get('none|all'), b = get('policy|all');
    if (!a || !b) return [];
    return [
      { key: 'minutes', value: b.minutes - a.minutes },
      { key: 'adViews', value: b.adViews - a.adViews },
      { key: 'finished', value: b.finished - a.finished },
    ];
  },
});

dash.calc('variants', {
  title: 'Mushroom variant averages',
  description: 'Per variant: level count, mean estimated time, steps, T3+ steps, share needing T3+, and mean twist participation.',
  inputs: ['experiment'],
  fn: (experiment) => {
    const ids = ['base', 'A', 'B', 'C'];
    return ids.map((variant) => {
      const rows = experiment.filter((r) => r.variant === variant);
      const mean = (f) => (rows.length ? rows.reduce((a, r) => a + f(r), 0) / rows.length : null);
      const parts = rows.map((r) => r.participation).filter((p) => p !== null && p !== '' && p !== undefined);
      return {
        variant, label: rows[0] ? rows[0].label : variant, n: rows.length,
        seconds: Math.round(mean((r) => +r.seconds)),
        steps: Math.round(mean((r) => +r.steps) * 10) / 10,
        t3: Math.round(mean((r) => +r.t3PlusSteps) * 10) / 10,
        hardShare: mean((r) => (+r.tier >= 3 ? 1 : 0)),
        participation: parts.length ? parts.reduce((a, p) => a + +p, 0) / parts.length : null,
      };
    });
  },
});

dash.calc('chapters', {
  title: 'Chapter summary',
  description: 'Per chapter: level count, total estimated minutes, first and peak difficulty score.',
  inputs: ['ramp'],
  fn: (ramp) => {
    const ids = [...new Set(ramp.map((r) => r.chapter))];
    return ids.map((chapter) => {
      const rows = ramp.filter((r) => r.chapter === chapter).sort((a, b) => +a.inChapter - +b.inChapter);
      return {
        chapter, title: rows[0].title, levels: rows.length,
        minutes: Math.round(rows.reduce((a, r) => a + +r.seconds, 0) / 6) / 10,
        first: +rows[0].score, peak: Math.max(...rows.map((r) => +r.score)),
      };
    });
  },
});

// ---- Helpers ------------------------------------------------------------

const FMT = {
  pct: (v) => d3.format('.0%')(v),
  int: (v) => d3.format(',')(Math.round(v)),
  time: (v) => {
    const s = Math.round(v);
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },
  num: (v) => d3.format(',.1f')(v),
  pct1: (v) => d3.format('.1%')(v),
  num2: (v) => d3.format(',.2f')(v),
};

function tierColor(t) {
  const pct = [0, 28, 46, 64, 82, 100, 100][t] ?? 100;
  return `color-mix(in oklab, ${dash.colors[0]} ${pct}%, var(--color-panel))`;
}

function findRow(rows, where) {
  if (!where) return rows[0];
  const conds = where.split('&').map((p) => p.split('=').map(decodeURIComponent));
  return rows.find((r) => conds.every(([k, v]) => String(r[k]) === v));
}

function failed(el, msg) {
  const p = document.createElement('p');
  p.className = 'fg-muted';
  p.textContent = msg;
  el.replaceChildren(p);
}

/** Prepare a chart element: returns null (and shows state) unless every source is ok. */
function ready(el, ids) {
  const states = ids.map((id) => dash.data(id));
  if (states.some((s) => s.status === 'error' || s.status === 'missing')) {
    failed(el, 'Failed to load');
    return null;
  }
  if (states.some((s) => s.status !== 'ok' || !s.data)) {
    el.replaceChildren();
    el.classList.add('dash-skeleton');
    return null;
  }
  el.classList.remove('dash-skeleton');
  return states.map((s) => s.data);
}

function measureText(svg, texts, cls) {
  const g = svg.append('g').attr('class', cls || 'tick');
  let max = 0;
  for (const t of texts) {
    const n = g.append('text').attr('class', cls || '').text(t);
    max = Math.max(max, n.node().getComputedTextLength());
  }
  g.remove();
  return Math.ceil(max);
}

function makeTip(el) {
  const tip = document.createElement('div');
  tip.className = 'fg-tip';
  tip.hidden = true;
  el.appendChild(tip);
  return {
    show(event, head, lines) {
      const h = document.createElement('div');
      h.className = 'fg-tip-head';
      h.textContent = head;
      tip.replaceChildren(h, ...lines.map((l) => {
        const d = document.createElement('div');
        d.className = 'fg-tip-sub';
        d.textContent = l;
        return d;
      }));
      tip.hidden = false;
      const box = el.getBoundingClientRect();
      const x = event.clientX - box.left, y = event.clientY - box.top;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      const left = Math.min(Math.max(0, x + 12), Math.max(0, box.width - tw));
      const top = y - th - 10 < 0 ? y + 14 : y - th - 10;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    },
    hide() { tip.hidden = true; },
  };
}

/** Horizontal bar path with 4px rounded data end (right), square at the baseline. */
function hBar(x0, y, w, h, r = 4) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (w <= 0) return '';
  return `M${x0},${y}H${x0 + w - rr}Q${x0 + w},${y} ${x0 + w},${y + rr}V${y + h - rr}Q${x0 + w},${y + h} ${x0 + w - rr},${y + h}H${x0}Z`;
}

/** Vertical bar path with 4px rounded top, square at the baseline. */
function vBar(x, y0, w, h, r = 4) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (h <= 0) return '';
  return `M${x},${y0}V${y0 - h + rr}Q${x},${y0 - h} ${x + rr},${y0 - h}H${x + w - rr}Q${x + w},${y0 - h} ${x + w},${y0 - h + rr}V${y0}Z`;
}

/** 100% stacked tier bars, one row per group. */
function stackedTiers(el, groups, rowLabel, tipHead) {
  const W = el.clientWidth || 600;
  const rowH = 22, gap = 10;
  const H = groups.length * (rowH + gap) + 24;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img');
  el.replaceChildren(svg.node());
  const ml = measureText(svg, groups.map(rowLabel)) + 10;
  const mr = measureText(svg, groups.map((g) => `${FMT.pct(g.hard)} T3+`), 'fg-end') + 10;
  const x = d3.scaleLinear([0, 1], [ml, Math.max(ml + 40, W - mr)]);
  const tip = makeTip(el);
  groups.forEach((g, i) => {
    const y = i * (rowH + gap);
    svg.append('text').attr('x', ml - 8).attr('y', y + rowH / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
      .attr('class', 'fg-axis-label').text(rowLabel(g));
    let acc = 0;
    for (const t of TIERS) {
      const c = g.counts[t] || 0;
      if (!c) continue;
      const share = c / g.total;
      const x0 = x(acc), x1 = x(acc + share);
      svg.append('rect').attr('x', x0).attr('y', y).attr('width', Math.max(0, x1 - x0 - 2)).attr('height', rowH)
        .style('fill', tierColor(t))
        .on('pointermove', (ev) => tip.show(ev, tipHead(g), [`T${t}: ${c} of ${g.total} levels (${FMT.pct(share)})`]))
        .on('pointerleave', () => tip.hide());
      acc += share;
    }
    svg.append('text').attr('class', 'fg-end').attr('x', x(1) + 8).attr('y', y + rowH / 2).attr('dy', '0.35em')
      .text(`${FMT.pct(g.hard)} T3+`);
  });
  const axis = svg.append('g').attr('transform', `translate(0,${groups.length * (rowH + gap)})`)
    .call(d3.axisBottom(x).ticks(4).tickFormat(d3.format('.0%')).tickSize(0).tickPadding(6));
  axis.select('.domain').remove();
  svg.attr('aria-label', `Share of levels by hardest tier for ${groups.length} groups`);
}

// ---- Drawings -----------------------------------------------------------

// Any single value marked with data-source / data-field / data-where.
dash.draw('val', (el) => {
  const src = el.getAttribute('data-source');
  const s = dash.data(src);
  if (s.status !== 'ok' || !s.data) {
    el.textContent = '—';
    return;
  }
  const row = findRow(s.data, el.getAttribute('data-where'));
  const v = row ? row[el.getAttribute('data-field')] : null;
  const fmt = FMT[el.getAttribute('data-fmt')] || String;
  el.textContent = v === null || v === undefined || v === '' ? '—' : fmt(+v);
});

dash.draw('capText', (el) => { el.textContent = FMT.time(CAP_SECONDS); });
dash.draw('cap1Text', (el) => { el.textContent = FMT.time(CAP_CHAPTER1_SECONDS); });
dash.draw('cap3Text', (el) => { el.textContent = FMT.time(CAP_CHAPTER3_SECONDS); });

dash.draw('gateVerdict', (el) => {
  const s = dash.data('gate');
  if (s.status !== 'ok' || !s.data) return;
  const large = findRow(s.data, 'key=large');
  const pass = large && large.share >= 0.5;
  for (const p of document.querySelectorAll('.gate-pass')) p.hidden = !pass;
  for (const f of document.querySelectorAll('.gate-fail')) f.hidden = !!pass;
  el.textContent = '';
});

dash.draw('tierBySize', (el) => {
  const d = ready(el, ['tierBySize']);
  if (!d) return;
  const mode = el.getAttribute('data-mode');
  const rows = d[0].filter((r) => r.mode === mode);
  const sizes = [...new Set(rows.map((r) => r.size))].sort((a, b) => a - b);
  const groups = sizes.map((size) => {
    const counts = {};
    let total = 0, hard = 0;
    for (const r of rows.filter((q) => q.size === size)) {
      counts[r.tier] = r.count;
      total = r.total;
      if (r.tier >= 3) hard += r.count;
    }
    return { size, counts, total, hard: total ? hard / total : 0 };
  });
  stackedTiers(el, groups, (g) => `${g.size}x${g.size}`, (g) => `${g.size}x${g.size} · ${mode}`);
});

dash.draw('timeStrip', (el) => {
  const d = ready(el, ['census', 'medianTime']);
  if (!d) return;
  const [census, medians] = d;
  const W = el.clientWidth || 600;
  const sizes = [...new Set(census.map((r) => +r.size))].sort((a, b) => a - b);
  const rowH = 30;
  const top = 18;
  const H = sizes.length * rowH + 30 + top;
  const svg = d3.create('svg').attr('viewBox', `0 ${-top} ${W} ${H}`).attr('height', H).attr('role', 'img')
    .attr('aria-label', 'Estimated solve time per level by board size and clue mode, with the five-minute limit');
  el.replaceChildren(svg.node());
  const ml = measureText(svg, sizes.map((s) => `${s}x${s}`)) + 12;
  const maxS = Math.max(d3.max(census, (r) => +r.seconds) || 60, CAP_SECONDS);
  const x = d3.scaleLinear([0, maxS], [ml, W - 12]).nice();
  const y = d3.scaleBand(sizes, [0, sizes.length * rowH]).padding(0.15);
  const modes = ['All clues', 'Hidden clues'];
  const offset = (m) => (m === modes[0] ? -0.22 : 0.22) * y.bandwidth();
  const tip = makeTip(el);
  const ax = svg.append('g').attr('transform', `translate(0,${sizes.length * rowH})`)
    .call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(W / 110))).tickFormat((v) => FMT.time(v)).tickSize(-sizes.length * rowH).tickPadding(6));
  ax.select('.domain').remove();
  // The five-minute limit.
  svg.append('line').attr('x1', x(CAP_SECONDS)).attr('x2', x(CAP_SECONDS)).attr('y1', -6).attr('y2', sizes.length * rowH)
    .style('stroke', 'var(--cds-chart-reference)').style('stroke-width', 1.5).style('stroke-dasharray', '4 3');
  svg.append('text').attr('class', 'fg-end').attr('x', x(CAP_SECONDS) - 4).attr('y', -10).attr('text-anchor', 'end')
    .text(`${FMT.time(CAP_SECONDS)} limit`);
  svg.append('g').selectAll('text').data(sizes).join('text')
    .attr('class', 'fg-axis-label').attr('x', ml - 10).attr('y', (s) => y(s) + y.bandwidth() / 2).attr('dy', '0.35em')
    .attr('text-anchor', 'end').text((s) => `${s}x${s}`);
  // Deterministic jitter so redraws do not shuffle.
  const jitter = (id) => {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return ((h % 1000) / 1000 - 0.5) * y.bandwidth() * 0.32;
  };
  svg.append('g').selectAll('circle').data(census).join('circle')
    .attr('cx', (r) => x(+r.seconds))
    .attr('cy', (r) => y(+r.size) + y.bandwidth() / 2 + offset(r.mode) + jitter(r.id))
    .attr('r', 3.5)
    .style('fill', (r) => dash.colors[modes.indexOf(r.mode)])
    .style('fill-opacity', 0.75)
    .style('stroke', 'var(--color-panel)').style('stroke-width', 1)
    .on('pointermove', (ev, r) => tip.show(ev, `${r.size}x${r.size} · ${r.mode}`, [`${FMT.time(+r.seconds)} estimated`, `Tier T${r.tier} · score ${r.score} · ${r.steps} steps`, `Shape: ${r.shape}`]))
    .on('pointerleave', () => tip.hide());
  const meds = medians.filter((m) => m.mode !== 'Both' && m.median !== null);
  svg.append('g').selectAll('line').data(meds).join('line')
    .attr('x1', (m) => x(m.median)).attr('x2', (m) => x(m.median))
    .attr('y1', (m) => y(m.size) + y.bandwidth() / 2 + offset(m.mode) - 7)
    .attr('y2', (m) => y(m.size) + y.bandwidth() / 2 + offset(m.mode) + 7)
    .style('stroke', 'var(--color-fg)').style('stroke-width', 2).style('stroke-linecap', 'round')
    .on('pointermove', (ev, m) => tip.show(ev, `${m.size}x${m.size} · ${m.mode}`, [`Median ${FMT.time(m.median)}`]))
    .on('pointerleave', () => tip.hide());
});

dash.draw('techniques', (el) => {
  const d = ready(el, ['techniques']);
  if (!d) return;
  const rows = d[0];
  const W = el.clientWidth || 600;
  const rowH = 20, gap = 8;
  const H = rows.length * (rowH + gap) + 4;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img')
    .attr('aria-label', 'Deduction steps by technique across all census levels');
  el.replaceChildren(svg.node());
  const labels = rows.map((r) => TECH_LABEL[r.technique] || r.technique);
  const ml = measureText(svg, labels) + 12;
  const ends = rows.map((r) => `${FMT.int(r.steps)} · ${FMT.pct(r.share)}`);
  const mr = measureText(svg, ends, 'fg-end') + 10;
  const x = d3.scaleLinear([0, d3.max(rows, (r) => r.steps) || 1], [ml, Math.max(ml + 40, W - mr)]);
  const tip = makeTip(el);
  rows.forEach((r, i) => {
    const y = i * (rowH + gap);
    svg.append('text').attr('class', 'fg-axis-label').attr('x', ml - 8).attr('y', y + rowH / 2).attr('dy', '0.35em')
      .attr('text-anchor', 'end').text(labels[i]);
    const w = Math.max(r.steps > 0 ? 2 : 0, x(r.steps) - ml);
    svg.append('path').attr('d', hBar(ml, y, w, rowH)).style('fill', tierColor(r.tier))
      .on('pointermove', (ev) => tip.show(ev, labels[i], [`${FMT.int(r.steps)} steps (${FMT.pct(r.share)} of all steps)`]))
      .on('pointerleave', () => tip.hide());
    svg.append('text').attr('class', 'fg-end').attr('x', ml + w + 6).attr('y', y + rowH / 2).attr('dy', '0.35em').text(ends[i]);
  });
});

dash.draw('variantTiers', (el) => {
  const d = ready(el, ['experiment', 'variants']);
  if (!d) return;
  const [exp, variants] = d;
  const groups = variants.map((v) => {
    const rows = exp.filter((r) => r.variant === v.variant);
    const counts = {};
    for (const r of rows) counts[+r.tier] = (counts[+r.tier] || 0) + 1;
    return { label: v.label, counts, total: rows.length, hard: v.hardShare || 0 };
  });
  stackedTiers(el, groups, (g) => g.label, (g) => g.label);
});

dash.draw('variantRows', (tbody) => {
  const s = dash.data('variants');
  tbody.replaceChildren();
  if (s.status !== 'ok' || !s.data) return;
  for (const v of s.data) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-key', v.variant);
    const cells = [
      v.label, FMT.time(v.seconds), FMT.num(v.steps), FMT.num(v.t3),
      v.participation === null ? 'n/a' : FMT.pct(v.participation),
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
});

dash.draw('ramp', (el) => {
  const d = ready(el, ['ramp']);
  if (!d) return;
  const rows = d[0].map((r) => ({ ...r, position: +r.position, score: +r.score, tier: +r.tier, seconds: +r.seconds }))
    .sort((a, b) => a.position - b.position);
  const W = el.clientWidth || 600;
  const H = 260, mt = 28, mb = 26;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img')
    .attr('aria-label', 'Difficulty score of each level in play order across the first three chapters');
  el.replaceChildren(svg.node());
  const y = d3.scaleLinear([0, d3.max(rows, (r) => r.score) || 1], [H - mb, mt]).nice();
  const ml = measureText(svg, y.ticks(4).map(String)) + 12;
  const x = d3.scaleLinear([0.5, rows.length + 0.5], [ml, W - 10]);
  // Chapter bands.
  const chapters = [...new Set(rows.map((r) => r.chapter))];
  chapters.forEach((c, i) => {
    const cr = rows.filter((r) => r.chapter === c);
    const x0 = x(cr[0].position - 0.5), x1 = x(cr[cr.length - 1].position + 0.5);
    if (i % 2 === 0) svg.append('rect').attr('x', x0).attr('y', mt - 6).attr('width', x1 - x0).attr('height', H - mb - mt + 6)
      .style('fill', 'var(--cds-chart-grid)').style('fill-opacity', 0.35);
    // Full chapter name if it fits its band, else "Ch 2", else nothing.
    const room = x1 - x0 - 10;
    const label = svg.append('text').attr('class', 'fg-band-label').attr('x', x0 + 6).attr('y', mt - 12).text(cr[0].title);
    if (label.node().getComputedTextLength() > room) label.text(`Ch ${i + 1}`);
    if (label.node().getComputedTextLength() > room) label.remove();
  });
  const ay = svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - 10 - ml)).tickPadding(6));
  ay.select('.domain').remove();
  const ax = svg.append('g').attr('transform', `translate(0,${H - mb})`)
    .call(d3.axisBottom(x).ticks(Math.min(rows.length, Math.floor(W / 50))).tickFormat(d3.format('d')).tickSize(0).tickPadding(8));
  ax.select('.domain').style('stroke', 'var(--cds-chart-axis)');
  const line = d3.line().x((r) => x(r.position)).y((r) => y(r.score));
  for (const c of chapters) {
    svg.append('path').datum(rows.filter((r) => r.chapter === c)).attr('d', line)
      .style('fill', 'none').style('stroke', dash.colors[0]).style('stroke-width', 2).style('stroke-linejoin', 'round');
  }
  const tip = makeTip(el);
  svg.append('g').selectAll('circle').data(rows).join('circle')
    .attr('cx', (r) => x(r.position)).attr('cy', (r) => y(r.score)).attr('r', 4.5)
    .style('fill', dash.colors[0]).style('stroke', 'var(--color-bg)').style('stroke-width', 2);
  // Larger invisible hit targets.
  svg.append('g').selectAll('circle').data(rows).join('circle')
    .attr('cx', (r) => x(r.position)).attr('cy', (r) => y(r.score)).attr('r', 11).style('fill', 'transparent')
    .on('pointermove', (ev, r) => tip.show(ev, `Level ${r.inChapter} of ${r.title}`, [`Score ${r.score} · T${r.tier} · ${r.size}`, `${FMT.time(r.seconds)} estimated`]))
    .on('pointerleave', () => tip.hide());
});

dash.draw('chapterRows', (tbody) => {
  const s = dash.data('chapters');
  tbody.replaceChildren();
  if (s.status !== 'ok' || !s.data) return;
  for (const c of s.data) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-key', c.chapter);
    for (const v of [c.title, FMT.int(c.levels), FMT.num(c.minutes), FMT.int(c.first), FMT.int(c.peak)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
});

const ROLE_COLOR = {
  climb: () => dash.colors[0],
  breather: () => dash.colors[1],
  peak: () => dash.colors[2],
  opener: () => 'var(--cds-chart-muted)',
};

function chapterBands(svg, rows, x, top, bottom) {
  const chapters = [...new Set(rows.map((r) => r.chapter))];
  chapters.forEach((c, i) => {
    const cr = rows.filter((r) => r.chapter === c);
    const x0 = x(cr[0].position - 0.5), x1 = x(cr[cr.length - 1].position + 0.5);
    if (i % 2 === 0) svg.append('rect').attr('x', x0).attr('y', top).attr('width', x1 - x0).attr('height', bottom - top)
      .style('fill', 'var(--cds-chart-grid)').style('fill-opacity', 0.35);
    const label = svg.append('text').attr('class', 'fg-band-label').attr('x', x0 + 6).attr('y', top - 6).text(`Ch ${i + 1}`);
    if (label.node().getComputedTextLength() > x1 - x0 - 10) label.remove();
  });
}

dash.draw('survival', (el) => {
  const d = ready(el, ['players']);
  if (!d) return;
  const rows = d[0];
  const profiles = ['newcomer', 'casual', 'puzzler', 'expert', 'all'];
  const W = el.clientWidth || 600, H = 260, mt = 22, mb = 26;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img')
    .attr('aria-label', 'Share of simulated players still playing at each level, by kind of player');
  el.replaceChildren(svg.node());
  const y = d3.scaleLinear([0, 1], [H - mb, mt]);
  const ml = measureText(svg, ['100%']) + 12;
  const allRows = rows.filter((r) => r.profile === 'all').sort((a, b) => a.position - b.position);
  const n = allRows.length;
  const x = d3.scaleLinear([0.5, n + 0.5], [ml, W - 10]);
  chapterBands(svg, allRows, x, mt, H - mb);
  const ay = svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0%')).tickSize(-(W - 10 - ml)).tickPadding(6));
  ay.select('.domain').remove();
  const ax = svg.append('g').attr('transform', `translate(0,${H - mb})`).call(d3.axisBottom(x).ticks(Math.min(n, Math.floor(W / 50))).tickFormat(d3.format('d')).tickSize(0).tickPadding(8));
  ax.select('.domain').style('stroke', 'var(--cds-chart-axis)');
  const line = d3.line().x((r) => x(r.position)).y((r) => y(r.survival));
  profiles.forEach((p, k) => {
    const pr = rows.filter((r) => r.profile === p).sort((a, b) => a.position - b.position);
    svg.append('path').datum(pr).attr('d', line).style('fill', 'none')
      .style('stroke', p === 'all' ? 'var(--color-fg)' : dash.colors[k]).style('stroke-width', p === 'all' ? 2.5 : 2)
      .style('stroke-dasharray', p === 'all' ? '5 3' : null).style('stroke-linejoin', 'round');
  });
  // Hover column: every kind's value at the level under the pointer.
  const tip = makeTip(el);
  const guide = svg.append('line').attr('y1', mt).attr('y2', H - mb).style('stroke', 'var(--cds-chart-reference)').style('stroke-width', 1);
  guide.attr('hidden', true);
  svg.append('rect').attr('x', ml).attr('y', mt).attr('width', W - 10 - ml).attr('height', H - mb - mt).style('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [px] = d3.pointer(ev);
      const pos = Math.max(1, Math.min(n, Math.round(x.invert(px))));
      guide.attr('x1', x(pos)).attr('x2', x(pos)).attr('hidden', null);
      const at = rows.filter((r) => r.position === pos);
      const lines = profiles.map((p) => {
        const r = at.find((q) => q.profile === p);
        return r ? `${r.label}: ${FMT.pct(r.survival)} still playing` : '';
      }).filter(Boolean);
      tip.show(ev, `Level ${pos} (${at[0] ? at[0].chapter.replace('c', 'chapter ') : ''})`, lines);
    })
    .on('pointerleave', () => { tip.hide(); guide.attr('hidden', true); });
});

dash.draw('hintBars', (el) => {
  const d = ready(el, ['players']);
  if (!d) return;
  const rows = d[0].filter((r) => r.profile === 'all').sort((a, b) => a.position - b.position);
  const W = el.clientWidth || 600, H = 240, mt = 22, mb = 26;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img')
    .attr('aria-label', 'Share of plays using a hint at each level, colored by the level\'s role, with the plan targets');
  el.replaceChildren(svg.node());
  const maxV = Math.max(0.3, d3.max(rows, (r) => r.hintRate) || 0);
  const y = d3.scaleLinear([0, maxV], [H - mb, mt]).nice();
  const ml = measureText(svg, y.ticks(4).map(d3.format('.0%'))) + 12;
  const n = rows.length;
  const x = d3.scaleLinear([0.5, n + 0.5], [ml, W - 10]);
  chapterBands(svg, rows, x, mt, H - mb);
  // Plan targets: peak band 10-25%, breather ceiling 5%.
  svg.append('rect').attr('x', ml).attr('width', W - 10 - ml).attr('y', y(0.25)).attr('height', y(0.10) - y(0.25))
    .style('fill', 'var(--cds-chart-reference)').style('fill-opacity', 0.12);
  svg.append('line').attr('x1', ml).attr('x2', W - 10).attr('y1', y(0.05)).attr('y2', y(0.05))
    .style('stroke', 'var(--cds-chart-reference)').style('stroke-width', 1.5).style('stroke-dasharray', '4 3');
  const ay = svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0%')).tickSize(-(W - 10 - ml)).tickPadding(6));
  ay.select('.domain').remove();
  const ax = svg.append('g').attr('transform', `translate(0,${H - mb})`).call(d3.axisBottom(x).ticks(Math.min(n, Math.floor(W / 50))).tickFormat(d3.format('d')).tickSize(0).tickPadding(8));
  ax.select('.domain').style('stroke', 'var(--cds-chart-axis)');
  const bw = Math.max(2, (x(2) - x(1)) * 0.7);
  const tip = makeTip(el);
  for (const r of rows) {
    const color = (ROLE_COLOR[r.role] || ROLE_COLOR.climb)();
    svg.append('path').attr('d', vBar(x(r.position) - bw / 2, H - mb, bw, (H - mb) - y(r.hintRate), 2)).style('fill', color);
    svg.append('rect').attr('x', x(r.position) - bw / 2 - 2).attr('width', bw + 4).attr('y', mt).attr('height', H - mb - mt).style('fill', 'transparent')
      .on('pointermove', (ev) => tip.show(ev, `Level ${r.position} · ${r.role}`, [`${FMT.pct(r.hintRate)} of plays used a hint`, `${FMT.pct(r.quitRate)} of plays ended in a quit`]))
      .on('pointerleave', () => tip.hide());
  }
});

dash.draw('economyRows', (tbody) => {
  const s = dash.data('economy');
  tbody.replaceChildren();
  if (s.status !== 'ok' || !s.data) return;
  const rows = s.data.filter((e) => e.group === 'sweep').sort((a, b) => b.newcomerFinish - a.newcomerFinish || a.hintCost - b.hintCost);
  for (const e of rows) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-key', e.key);
    if (e.shipped === true || e.shipped === 'true') tr.className = 'fg-shipped';
    for (const v of [FMT.int(e.startingCoins), FMT.int(e.coinsPerSolve), FMT.int(e.hintCost), FMT.pct(e.newcomerFinish), FMT.pct(e.finish),
      FMT.pct(e.coinShare), FMT.pct1(e.adShare), FMT.pct1(e.refusedShare), FMT.int(e.casualEndCoins), FMT.num(e.adViewsPerPlayer)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
});

dash.draw('perAdRows', (tbody) => {
  const s = dash.data('economy');
  tbody.replaceChildren();
  if (s.status !== 'ok' || !s.data) return;
  const rows = s.data.filter((e) => e.group === 'perAd-tight').sort((a, b) => a.hintsPerAd - b.hintsPerAd);
  for (const e of rows) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-key', e.key);
    if (+e.hintsPerAd === CHOSEN_HINTS_PER_AD) tr.className = 'fg-shipped';
    for (const v of [FMT.int(e.hintsPerAd), FMT.pct(e.newcomerFinish), FMT.pct1(e.refusedShare), FMT.pct1(e.bankedShare), FMT.num2(e.rewardedPerPlayer)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
});

dash.draw('adBars', (el) => {
  const d = ready(el, ['ads']);
  if (!d) return;
  const order = ['newcomer', 'casual', 'puzzler', 'expert', 'all'];
  const rows = order.map((p) => d[0].find((r) => r.profile === p)).filter(Boolean);
  const W = el.clientWidth || 600, rowH = 20, gap = 10;
  const H = rows.length * (rowH + gap) + 22;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img')
    .attr('aria-label', 'Ad views per simulated player by kind of player: midgame ads and rewarded hint ads');
  el.replaceChildren(svg.node());
  const ml = measureText(svg, rows.map((r) => r.label)) + 12;
  const ends = rows.map((r) => FMT.num(+r.interstitials + +r.rewarded));
  const mr = measureText(svg, ends, 'fg-end') + 10;
  const x = d3.scaleLinear([0, d3.max(rows, (r) => +r.interstitials + +r.rewarded) || 1], [ml, Math.max(ml + 40, W - mr)]).nice();
  const tip = makeTip(el);
  rows.forEach((r, i) => {
    const y = i * (rowH + gap);
    svg.append('text').attr('class', 'fg-axis-label').attr('x', ml - 8).attr('y', y + rowH / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text(r.label);
    const wI = x(+r.interstitials) - ml, wR = x(+r.interstitials + +r.rewarded) - x(+r.interstitials);
    const lines = [`${FMT.num(+r.interstitials)} midgame ads`, `${FMT.num2(+r.rewarded)} rewarded hint ads`, `${FMT.num(+r.minutes)} minutes played`];
    svg.append('rect').attr('x', ml).attr('y', y).attr('width', Math.max(0, wI - (wR > 2 ? 2 : 0))).attr('height', rowH)
      .style('fill', r.profile === 'all' ? 'var(--color-fg)' : dash.colors[0])
      .on('pointermove', (ev) => tip.show(ev, r.label, lines)).on('pointerleave', () => tip.hide());
    if (wR > 0.5) svg.append('path').attr('d', hBar(ml + wI, y, wR, rowH)).style('fill', dash.colors[1])
      .on('pointermove', (ev) => tip.show(ev, r.label, lines)).on('pointerleave', () => tip.hide());
    svg.append('text').attr('class', 'fg-end').attr('x', x(+r.interstitials + +r.rewarded) + 6).attr('y', y + rowH / 2).attr('dy', '0.35em').text(ends[i]);
  });
  const ax = svg.append('g').attr('transform', `translate(0,${rows.length * (rowH + gap)})`).call(d3.axisBottom(x).ticks(4).tickSize(0).tickPadding(6));
  ax.select('.domain').remove();
});

const POLICY_VARIANTS = ['none', 'policy', 'policy-assumed'];

dash.draw('policyRows', (tbody) => {
  const s = dash.data('policy');
  tbody.replaceChildren();
  if (s.status !== 'ok' || !s.data) return;
  for (const v of POLICY_VARIANTS) {
    const r = s.data.find((x) => x.key === `${v}|all`);
    if (!r) continue;
    const tr = document.createElement('tr');
    tr.setAttribute('data-key', r.key);
    for (const c of [r.variantLabel, FMT.pct(r.finished), FMT.int(r.minutes), FMT.num(r.adViews), FMT.num(r.warmups), FMT.num(r.breathers)]) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
});

dash.draw('policyBars', (el) => {
  const d = ready(el, ['policy']);
  if (!d) return;
  const rows = d[0];
  const kinds = ['newcomer', 'casual', 'puzzler', 'expert', 'all'];
  const labelOf = (k) => (rows.find((r) => r.profile === k) || {}).label || k;
  const W = el.clientWidth || 600, H = 230, mt = 10, mb = 26;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img')
    .attr('aria-label', 'Share of simulated players reaching the end of chapter 3, by kind of player, without and with the next-level policy');
  el.replaceChildren(svg.node());
  const y = d3.scaleLinear([0, 1], [H - mb, mt]);
  const ml = measureText(svg, ['100%']) + 12;
  const x = d3.scaleBand(kinds, [ml, W - 8]).padding(0.25);
  const xi = d3.scaleBand(POLICY_VARIANTS, [0, x.bandwidth()]).padding(0.1);
  const ay = svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0%')).tickSize(-(W - 8 - ml)).tickPadding(6));
  ay.select('.domain').remove();
  const ax = svg.append('g').attr('transform', `translate(0,${H - mb})`).call(d3.axisBottom(x).tickFormat(labelOf).tickSize(0).tickPadding(8));
  ax.select('.domain').style('stroke', 'var(--cds-chart-axis)');
  const tip = makeTip(el);
  for (const k of kinds) {
    POLICY_VARIANTS.forEach((v, si) => {
      const r = rows.find((q) => q.key === `${v}|${k}`);
      if (!r) return;
      svg.append('path').attr('d', vBar(x(k) + xi(v), H - mb, xi.bandwidth(), (H - mb) - y(r.finished)))
        .style('fill', dash.colors[si])
        .on('pointermove', (ev) => tip.show(ev, `${r.label} · ${r.variantLabel}`, [`${FMT.pct(r.finished)} reach the end of chapter 3`, `${FMT.int(r.minutes)} minutes, ${FMT.num(r.adViews)} ad views`]))
        .on('pointerleave', () => tip.hide());
    });
  }
});

function areaBands(svg, rows, x, top, bottom) {
  const areas = [...new Set(rows.map((r) => r.area))];
  areas.forEach((a, i) => {
    const ar = rows.filter((r) => r.area === a);
    const x0 = x(ar[0].index - 0.5), x1 = x(ar[ar.length - 1].index + 0.5);
    if (i % 2 === 0) svg.append('rect').attr('x', x0).attr('y', top).attr('width', x1 - x0).attr('height', bottom - top)
      .style('fill', 'var(--cds-chart-grid)').style('fill-opacity', 0.35);
    const label = svg.append('text').attr('class', 'fg-band-label').attr('x', x0 + 4).attr('y', top - 6).text(a);
    if (label.node().getComputedTextLength() > x1 - x0 - 6) label.text(a.split(' ')[0]);
    if (label.node().getComputedTextLength() > x1 - x0 - 6) label.remove();
  });
}

dash.draw('chapterCurve', (el) => {
  const d = ready(el, ['packChapters']);
  if (!d) return;
  const rows = d[0].map((r) => ({ ...r, index: +r.index, meanScore: +r.meanScore, peakScore: +r.peakScore })).sort((a, b) => a.index - b.index);
  const W = el.clientWidth || 600, H = 260, mt = 26, mb = 26;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img')
    .attr('aria-label', 'Mean and peak difficulty score of each chapter, grouped by garden area, with debuts marked');
  el.replaceChildren(svg.node());
  const y = d3.scaleLinear([0, d3.max(rows, (r) => r.peakScore) || 1], [H - mb, mt]).nice();
  const ml = measureText(svg, y.ticks(4).map(String)) + 12;
  const x = d3.scaleLinear([0.5, rows.length + 0.5], [ml, W - 10]);
  areaBands(svg, rows, x, mt, H - mb);
  const ay = svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - 10 - ml)).tickPadding(6));
  ay.select('.domain').remove();
  const ax = svg.append('g').attr('transform', `translate(0,${H - mb})`).call(d3.axisBottom(x).ticks(Math.min(rows.length, Math.floor(W / 50))).tickFormat(d3.format('d')).tickSize(0).tickPadding(8));
  ax.select('.domain').style('stroke', 'var(--cds-chart-axis)');
  svg.append('path').datum(rows).attr('d', d3.line().x((r) => x(r.index)).y((r) => y(r.meanScore)))
    .style('fill', 'none').style('stroke', dash.colors[0]).style('stroke-width', 2).style('stroke-linejoin', 'round');
  svg.append('g').selectAll('circle').data(rows).join('circle').attr('cx', (r) => x(r.index)).attr('cy', (r) => y(r.peakScore)).attr('r', 3)
    .style('fill', 'var(--color-panel)').style('stroke', dash.colors[0]).style('stroke-width', 1.5);
  // Debut markers: a small diamond on the mean line.
  svg.append('g').selectAll('path').data(rows.filter((r) => r.debut)).join('path')
    .attr('d', (r) => `M${x(r.index)},${y(r.meanScore) - 6}l5,6l-5,6l-5,-6z`).style('fill', dash.colors[1]);
  const tip = makeTip(el);
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r.index - 0.5)).attr('width', (r) => x(r.index + 0.5) - x(r.index - 0.5)).attr('y', mt).attr('height', H - mb - mt).style('fill', 'transparent')
    .on('pointermove', (ev, r) => tip.show(ev, `${r.title} (chapter ${r.index})`, [
      `Mean score ${FMT.int(r.meanScore)}, peak ${FMT.int(r.peakScore)}, up to T${r.maxTier}`,
      `${FMT.num(+r.minutes)} minutes estimated`,
      r.debut ? `Debut: ${r.debut}` : 'No debut',
    ].filter(Boolean)))
    .on('pointerleave', () => tip.hide());
});

dash.draw('journeyLines', (el) => {
  const d = ready(el, ['journey']);
  if (!d) return;
  const rows = d[0].map((r) => ({ ...r, index: +r.index, cleared: +r.cleared }));
  const profiles = ['newcomer', 'casual', 'puzzler', 'expert', 'all'];
  const n = Math.max(...rows.map((r) => r.index));
  const W = el.clientWidth || 600, H = 250, mt = 10, mb = 26;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img')
    .attr('aria-label', 'Share of simulated players who cleared each chapter of the launch pack, by kind of player');
  el.replaceChildren(svg.node());
  const y = d3.scaleLinear([0, 1], [H - mb, mt]);
  const ml = measureText(svg, ['100%']) + 12;
  const x = d3.scaleLinear([1, n], [ml, W - 10]);
  const ay = svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0%')).tickSize(-(W - 10 - ml)).tickPadding(6));
  ay.select('.domain').remove();
  const ax = svg.append('g').attr('transform', `translate(0,${H - mb})`).call(d3.axisBottom(x).ticks(Math.min(n, Math.floor(W / 50))).tickFormat(d3.format('d')).tickSize(0).tickPadding(8));
  ax.select('.domain').style('stroke', 'var(--cds-chart-axis)');
  const line = d3.line().x((r) => x(r.index)).y((r) => y(r.cleared));
  profiles.forEach((p, k) => {
    const pr = rows.filter((r) => r.profile === p).sort((a, b) => a.index - b.index);
    svg.append('path').datum(pr).attr('d', line).style('fill', 'none')
      .style('stroke', p === 'all' ? 'var(--color-fg)' : dash.colors[k]).style('stroke-width', p === 'all' ? 2.5 : 2)
      .style('stroke-dasharray', p === 'all' ? '5 3' : null).style('stroke-linejoin', 'round');
  });
  const tip = makeTip(el);
  const guide = svg.append('line').attr('y1', mt).attr('y2', H - mb).style('stroke', 'var(--cds-chart-reference)').attr('hidden', true);
  svg.append('rect').attr('x', ml).attr('y', mt).attr('width', W - 10 - ml).attr('height', H - mb - mt).style('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [px] = d3.pointer(ev);
      const idx = Math.max(1, Math.min(n, Math.round(x.invert(px))));
      guide.attr('x1', x(idx)).attr('x2', x(idx)).attr('hidden', null);
      const at = rows.filter((r) => r.index === idx);
      tip.show(ev, at[0] ? `${at[0].title} (chapter ${idx})` : `Chapter ${idx}`,
        profiles.map((p) => { const r = at.find((q) => q.profile === p); return r ? `${r.label}: ${FMT.pct(r.cleared)} cleared it` : ''; }).filter(Boolean));
    })
    .on('pointerleave', () => { tip.hide(); guide.attr('hidden', true); });
});

// Legend swatches take the chart colors (style only, outside drawings).
dash.onData(() => {
  for (const sw of document.querySelectorAll('.fg-sw[data-tier]')) sw.style.background = tierColor(+sw.getAttribute('data-tier'));
  for (const sw of document.querySelectorAll('.fg-sw[data-series]')) sw.style.background = dash.colors[+sw.getAttribute('data-series')];
  for (const sw of document.querySelectorAll('.fg-sw[data-role]')) sw.style.background = (ROLE_COLOR[sw.getAttribute('data-role')] || ROLE_COLOR.climb)();
  for (const sw of document.querySelectorAll('.fg-sw[data-everyone]')) sw.style.background = 'var(--color-fg)';
});
