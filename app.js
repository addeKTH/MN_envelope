/* app.js ----------------------------------------------------------------------
   GUI of the M-N interaction capacity page: input, tick box, plot and section drawing.
   Port of Main_gui.m; the same drawing coordinates, so the two look alike.
   Pointer events: a mouse and a finger drag p1 and p2 the same way.  Print: a one page report
   in a hidden frame, printed with the browser (Save as PDF), as in BeamStat_road.

   Andreas Andersson, 2026-11-05 (assisted by Claude)
---------------------------------------------------------------------------*/
(function () {
'use strict';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const FONT = '"Times New Roman", Times, serif';
const DEF = { n1: '0.30', m1: '0.01', n2: '0.50', m2: '0.04', rot: false };
const ALPHA = 0.8, BETA = 0.4;
const LIMS = [0, 1, -0.2, 0.2];
const C_BAD = '#b30000', C_PINK = '#ffccdb', C_LIM = '#bf3366';
const C_P1 = '#0072bd', C_P2 = '#006b21', C_P3II = '#e06b00', C_P3III = '#d90000';
const LW = 4 / 3;                     // MATLAB points to pixels

const inp = { p1: [0.30, 0.01], p2: [0.50, 0.04], rot: false };
let drag = 0;

// ------------------------------------------------------------------ SVG helpers
function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
}

// a small LaTeX subset: $...$ with italic letters, \mathrm{}, _ and ^, a few symbols
const SYM = { '\\sigma': 'σ', '\\psi': 'ψ' };
function texRuns(s) {
    const runs = [];
    const push = (t, it, lvl) => {
        if (!t) return;
        const last = runs[runs.length - 1];
        if (last && last.it === it && last.lvl === lvl) last.t += t; else runs.push({ t, it, lvl });
    };
    const groupIn = (txt, j) => {
        if (txt[j] === '{') {
            let d = 1, k = j + 1;
            while (k < txt.length && d) { if (txt[k] === '{') d++; else if (txt[k] === '}') d--; k++; }
            return [txt.slice(j + 1, k - 1), k];
        }
        if (txt[j] === '\\') {                      // \mathrm{...} or a symbol as a whole
            const e = j + /^\\[a-zA-Z]+/.exec(txt.slice(j))[0].length;
            if (txt[e] === '{') { const r = groupIn(txt, e); return [txt.slice(j, r[1]), r[1]]; }
            return [txt.slice(j, e), e];
        }
        return [txt[j] || '', j + 1];
    };
    const emit = (txt, lvl, upright) => {
        let k = 0;
        while (k < txt.length) {
            const c = txt[k];
            if (c === '\\') {
                const cmd = /^\\[a-zA-Z]+/.exec(txt.slice(k))[0];
                if (cmd === '\\mathrm') { const [g, k2] = groupIn(txt, k + 7); emit(g, lvl, true); k = k2; continue; }
                push(SYM[cmd] || '', !upright, lvl); k += cmd.length; continue;
            }
            if (c === '_' || c === '^') { const [g, k2] = groupIn(txt, k + 1); emit(g, lvl + (c === '_' ? -1 : 1), upright); k = k2; continue; }
            if (c === '-') { push('−', false, lvl); k++; continue; }
            push(c, !upright && /[a-zA-Z]/.test(c), lvl); k++;
        }
    };
    let math = false, buf = '';
    for (const c of s) {
        if (c === '$') { if (math) emit(buf, 0, false); else push(buf, false, 0); buf = ''; math = !math; } else buf += c;
    }
    if (math) emit(buf, 0, false); else push(buf, false, 0);
    return runs;
}

function text(parent, s, x, y, opt) {
    opt = opt || {};
    const size = opt.size || 14.7;
    const t = el('text', { x, y, 'font-family': FONT, 'font-size': size, fill: opt.fill || '#000',
                           'text-anchor': opt.anchor || 'start', 'dominant-baseline': opt.baseline || 'middle' }, parent);
    if (opt.rotate) t.setAttribute('transform', `rotate(${opt.rotate} ${x} ${y})`);
    if (opt.pass !== false) t.style.pointerEvents = 'none';
    setText(t, s, size);
    return t;
}
function setText(t, s, size) {
    while (t.firstChild) t.removeChild(t.firstChild);
    let lvl = 0;
    for (const r of texRuns(s)) {
        const ts = el('tspan', {}, t);
        if (r.it) ts.setAttribute('font-style', 'italic');
        if (r.lvl !== lvl) { ts.setAttribute('dy', ((lvl - r.lvl) * size * 0.3).toFixed(2)); lvl = r.lvl; }
        if (r.lvl) ts.setAttribute('font-size', (size * 0.72).toFixed(1));
        ts.textContent = r.t;
    }
    if (lvl) { const ts = el('tspan', { dy: (lvl * size * 0.3).toFixed(2) }, t); ts.textContent = '​'; }
}

// ------------------------------------------------------- the symbols, as BeamStat_road
function drawSymbols() {
    $('sRst').innerHTML = '<svg viewBox="0 0 24 24"><path d="M18.06 8.5 A7 7 0 1 1 12 5" fill="none" stroke="#cc2626" stroke-width="3"/><polygon points="12,0.8 12,9.2 17.5,5" fill="#cc2626"/></svg>';
    $('sRep').innerHTML = '<svg viewBox="0 0 24 24"><rect x="7.5" y="3" width="9" height="6.5" fill="#fff" stroke="#737373"/><rect x="2" y="8" width="20" height="10" rx="2" fill="#666b73"/>' +
        '<rect x="6" y="14" width="12" height="1.5" fill="#333338"/><rect x="7.5" y="15" width="9" height="6" fill="#fff" stroke="#737373"/>' +
        '<path d="M9 17.5H15M9 19.5H15" stroke="#737373"/><circle cx="18.5" cy="11" r="1" fill="#4dbf59"/></svg>';
}

// ------------------------------------------------------------------ the result plot
const AX = { x: 58, y: 34, w: 400, h: 300 };      // in the svg, top 420 px in the figure
const X = n => AX.x + (n - LIMS[0]) / (LIMS[1] - LIMS[0]) * AX.w;
const Y = m => AX.y + AX.h - (m - LIMS[2]) / (LIMS[3] - LIMS[2]) * AX.h;
const P = {};

function pathOf(xs, ys) {
    let d = '', pen = false;
    for (let i = 0; i < xs.length; i++) {
        if (!isFinite(ys[i])) { pen = false; continue; }
        d += (pen ? 'L' : 'M') + X(xs[i]).toFixed(2) + ' ' + Y(ys[i]).toFixed(2);
        pen = true;
    }
    return d;
}
function linspace(a, b, n) { const v = []; for (let i = 0; i < n; i++) v.push(a + (b - a) * i / (n - 1)); return v; }

function buildPlot() {
    const svg = $('res');
    const defs = el('defs', {}, svg);
    el('rect', { x: AX.x, y: AX.y, width: AX.w, height: AX.h }, el('clipPath', { id: 'clipR' }, defs));
    const g = el('g', { 'clip-path': 'url(#clipR)' }, svg);
    P.fill = el('path', { fill: '#fff', stroke: 'none' }, g);
    P.pink = el('path', { fill: C_PINK, stroke: 'none' }, g);
    const curve = (dash, w, col) => el('path', { fill: 'none', stroke: col || '#000', 'stroke-width': w * LW, 'stroke-dasharray': dash || 'none', 'stroke-linejoin': 'round' }, g);
    P.lII = curve(null, 1); P.lIII = curve('8 4', 1); P.core = curve('1.5 3', 0.8);
    P.lim = curve(null, 0.8, C_LIM);
    P.line = el('line', { stroke: '#000', 'stroke-width': 0.5 * LW, 'stroke-dasharray': '8 3 1.5 3' }, g);
    const dot = c => el('circle', { r: 4, fill: c, stroke: c, 'stroke-width': 0.5 }, g);
    P.p3 = [dot(C_P3II), dot(C_P3III)];
    P.pt = [dot(C_P1), dot(C_P2)];
    // axes: left and bottom only, ticks inwards
    const ax = (x1, y1, x2, y2) => el('line', { x1, y1, x2, y2, stroke: '#000', 'stroke-width': 0.7 }, svg);
    ax(AX.x, AX.y, AX.x, AX.y + AX.h); ax(AX.x, AX.y + AX.h, AX.x + AX.w, AX.y + AX.h);
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
        ax(X(v), AX.y + AX.h, X(v), AX.y + AX.h - 4);
        text(svg, v.toFixed(2), X(v), AX.y + AX.h + 12, { size: 14.7, anchor: 'middle' });
    }
    for (let k = -4; k <= 4; k++) {
        const v = k * 0.05;
        ax(AX.x, Y(v), AX.x + 4, Y(v));
        const s = (k < 0 ? '−' : '') + Math.abs(v).toFixed(2);
        text(svg, s, AX.x - 5, Y(v), { size: 14.7, anchor: 'end' });
    }
    text(svg, '$n$', AX.x + AX.w / 2, AX.y + AX.h + 31, { anchor: 'middle' });
    text(svg, '$m$', 13, AX.y + AX.h / 2, { anchor: 'middle', rotate: -90 });
    // labels, then the load factors to the right
    P.tP = [text(svg, '$p_1$', 0, 0, { anchor: 'middle' }), text(svg, '$p_2$', 0, 0, { anchor: 'middle' })];
    P.t3 = [text(svg, '$p_{3,\\mathrm{II}}$', 0, 0), text(svg, '$p_{3,\\mathrm{III}}$', 0, 0)];
    P.tV = [text(svg, '', 474, AX.y + 20), text(svg, '', 474, AX.y + 46)];
    P.tV.forEach(t => t.setAttribute('class', 'tv'));
    P.legend = el('g', { class: 'lgd' }, svg);
    // the grips: larger than the markers, so that a finger finds them; p2 on top, as in MATLAB
    const r = window.matchMedia && matchMedia('(pointer: coarse)').matches ? 24 : 10;
    P.hit = [0, 1].map(k => {
        const c = el('circle', { class: 'hit', r }, svg);
        c.addEventListener('pointerdown', ev => onDown(k + 1, ev));
        c.addEventListener('pointermove', onMove);
        c.addEventListener('pointerup', onUp);
        c.addEventListener('pointercancel', onUp);
        return c;
    });
}

function setLegend(withLim) {
    const g = P.legend;
    while (g.firstChild) g.removeChild(g.firstChild);
    const rows = [['Stage II', null, 'none'], ['Stage III', null, '8 4'], ['Core limit', null, '1.5 3']];
    if (withLim) rows.push(['Rot. limit', C_PINK, 'none']);
    const top = 800 - 420 - 76 - 18 * rows.length;
    rows.forEach((r, i) => {
        const y = top + 18 * i + 9;
        if (r[1]) el('rect', { x: 472, y: y - 6, width: 22, height: 12, fill: r[1], stroke: 'none' }, g);
        else el('line', { x1: 472, y1: y, x2: 494, y2: y, stroke: '#000', 'stroke-width': (i === 2 ? 0.8 : 1) * LW, 'stroke-dasharray': r[2] }, g);
        text(g, r[0], 498, y, { size: 13.3 });
    });
}

function drawEnvelopes() {
    const n2 = linspace(0, 1, 401), n3 = linspace(0, ALPHA / (2 * BETA), 401);
    const m2 = n2.map(MN.capII), m3 = n3.map(n => MN.capIII(n, ALPHA, BETA));
    P.lII.setAttribute('d', pathOf(n2, m2) + pathOf(n2, m2.map(v => -v)));
    P.lIII.setAttribute('d', pathOf(n3, m3) + pathOf(n3, m3.map(v => -v)));
    const rev = a => a.slice().reverse();
    P.fill.setAttribute('d', pathOf(n3.concat(rev(n3)), m3.concat(rev(m3).map(v => -v))) + 'Z');
    const nc = Math.max(0.5, Math.min(ALPHA / (3 * BETA), ALPHA / (2 * BETA)));
    P.core.setAttribute('d', pathOf([0, nc], [0, nc / 6]) + pathOf([0, nc], [0, -nc / 6]));
    if (inp.rot) {
        const mc = n3.map(n => Math.max(MN.capCu(n), 0));
        const lo = mc.map((v, i) => Math.min(v, m3[i]));
        const band = s => pathOf(n3.concat(rev(n3)), m3.map(v => s * v).concat(rev(lo).map(v => s * v))) + 'Z';
        P.pink.setAttribute('d', band(1) + band(-1));
        const ml = mc.map((v, i) => (v >= m3[i] ? NaN : v));
        P.lim.setAttribute('d', pathOf(n3, ml) + pathOf(n3, ml.map(v => -v)));
    } else {
        P.pink.setAttribute('d', ''); P.lim.setAttribute('d', '');
    }
    setLegend(inp.rot);
}

const inAxes = p => p[0] >= LIMS[0] && p[0] <= LIMS[1] && p[1] >= LIMS[2] && p[1] <= LIMS[3];
function place(c, p) {
    if (isFinite(p[0]) && isFinite(p[1])) { c.setAttribute('cx', X(p[0])); c.setAttribute('cy', Y(p[1])); }
    c.style.display = inAxes(p) ? '' : 'none';
}
function placeText(t, x, y, anchor) {
    t.setAttribute('x', X(x)); t.setAttribute('y', Y(y));
    if (anchor) t.setAttribute('text-anchor', anchor);
}

// beside the point, square to the load line, below it, within the axes
function labelAt(k) {
    const p = k === 1 ? inp.p2 : inp.p1;
    const sc = [LIMS[1] - LIMS[0], LIMS[3] - LIMS[2]];
    let d = [(inp.p2[0] - inp.p1[0]) / sc[0], (inp.p2[1] - inp.p1[1]) / sc[1]];
    if (d[0] === 0 && d[1] === 0) d = [1, 0];
    const h = Math.hypot(d[0], d[1]);
    let nv = [-d[1] / h, d[0] / h];
    if (nv[1] > 0) nv = [-nv[0], -nv[1]];
    let xy = [p[0] + 0.05 * nv[0] * sc[0], p[1] + 0.05 * nv[1] * sc[1]];
    if (xy[1] < LIMS[2] + 0.015) xy = [p[0] - 0.05 * nv[0] * sc[0], p[1] - 0.05 * nv[1] * sc[1]];
    xy[0] = Math.min(Math.max(xy[0], LIMS[0] + 0.02), LIMS[1] - 0.02);
    return xy;
}

const psiText = (st, v) => `$\\psi_\\mathrm{${st}}$ = ` + (isNaN(v) ? '--' : v.toFixed(2));

function update() {
    const res = MN.run(inp.p1, inp.p2, ALPHA, BETA, inp.rot);
    res.rot = inp.rot;
    window.res = res;
    const t = Math.max(1, isNaN(res.psiII) ? 1 : res.psiII, isNaN(res.psiIII) ? 1 : res.psiIII);
    P.line.setAttribute('x1', X(inp.p1[0])); P.line.setAttribute('y1', Y(inp.p1[1]));
    P.line.setAttribute('x2', X(inp.p1[0] + t * (inp.p2[0] - inp.p1[0])));
    P.line.setAttribute('y2', Y(inp.p1[1] + t * (inp.p2[1] - inp.p1[1])));
    place(P.pt[0], inp.p1); place(P.pt[1], inp.p2);
    place(P.hit[0], inp.p1); place(P.hit[1], inp.p2);
    const p3 = [res.p3II, res.p3III];
    for (let k = 0; k < 2; k++) {
        place(P.p3[k], p3[k]);
        const pk = k === 0 ? inp.p1 : inp.p2;
        const xy = labelAt(k);
        placeText(P.tP[k], xy[0], xy[1]);
        P.tP[k].style.display = inAxes(pk) ? '' : 'none';
        if (!inAxes(p3[k])) {
            P.t3[k].style.display = 'none';
        } else {
            const sg = Math.sign(p3[k][1] + (p3[k][1] === 0 ? 1 : 0));
            const off = k === 0 ? [0.05, 0.002 * sg] : [0.012, 0.014 * sg];
            let anchor = 'start';
            if (p3[k][0] > 0.82) { off[0] = -off[0]; anchor = 'end'; }
            placeText(P.t3[k], p3[k][0] + off[0], p3[k][1] + off[1], anchor);
            P.t3[k].style.display = '';
        }
    }
    setText(P.tV[0], psiText('II', res.psiII), 14.7);
    setText(P.tV[1], psiText('III', res.psiIII), 14.7);
    drawSection(res.II, res.III, res.p3II, res.p3III);
}

// --------------------------------------------------------------- the section drawing
const K = 142 / 3.95;                 // px per drawing unit, the axes of the MATLAB figure
const SX = x => (540 - 14.9 * K) / 2 + x * K;
const SY = y => (2.95 - y) * K;

function drawSection(II, III, pII, pIII) {
    const g = $('model');
    while (g.firstChild) g.removeChild(g.firstChild);
    const line = (xs, ys, w, col, dash) => el('polyline', {
        points: xs.map((x, i) => SX(x).toFixed(2) + ',' + SY(ys[i]).toFixed(2)).join(' '), fill: 'none',
        stroke: col || '#000', 'stroke-width': w * LW, 'stroke-dasharray': dash || 'none' }, g);
    const patch = (xs, ys, fill, w) => el('polygon', {
        points: xs.map((x, i) => SX(x).toFixed(2) + ',' + SY(ys[i]).toFixed(2)).join(' '), fill,
        stroke: w ? '#000' : 'none', 'stroke-width': (w || 0) * LW }, g);
    const tx = (s, x, y, o) => text(g, s, SX(x), SY(y), o);
    const tip = (x, y, dx, dy, c) => {
        const L = 0.2, W = 0.055, h = Math.hypot(dx, dy), u = [dx / h, dy / h], v = [-u[1], u[0]];
        patch([x, x - L * u[0] + W * v[0], x - L * u[0] - W * v[0]], [y, y - L * u[1] + W * v[1], y - L * u[1] - W * v[1]], c || '#000');
    };
    const arrowH = (x1, x2, y, c) => { line([x1, x2], [y, y], 1, c); tip(x2, y, Math.sign(x2 - x1), 0, c); };
    const stressArrows = (xb, f, y) => {
        const L = 0.17, W = 0.06;
        f.forEach((fi, i) => {
            if (Math.abs(fi) < 1.3 * L) return;
            line([xb, xb + fi], [y[i], y[i]], 0.3);
            const s = Math.sign(fi);
            line([xb + s * L, xb, xb + s * L], [y[i] + W, y[i], y[i] - W], 0.5);
        });
    };
    const dimV = (x, y1, y2, lab, xObj, yLab) => {
        if (yLab === undefined) yLab = (y1 + y2) / 2;
        line([x, x], [y1, y2], 0.4);
        if (y2 - y1 > 0.45) { tip(x, y1, 0, -1); tip(x, y2, 0, 1); }
        const s = Math.sign(x - xObj);
        for (const y of [y1, y2]) line([xObj + s * 0.08, x + s * 0.1], [y, y], 0.3);
        if (lab) tx(lab, x + 0.1, yLab, { size: 14 });
    };
    const dimH = (x1, x2, y, lab, yObj) => {
        line([x1, x2], [y, y], 0.4);
        tip(x1, y, -1, 0); tip(x2, y, 1, 0);
        for (const x of [x1, x2]) line([x, x], [y - 0.1, yObj], 0.3);
        tx(lab, (x1 + x2) / 2, y - 0.22, { size: 14, anchor: 'middle' });
    };
    const eqLine = (x, y, lhs, rhs) => {
        const dx = 0.2;
        tx(lhs, x - dx, y, { size: 12.7, anchor: 'end' });
        tx('$=$', x, y, { size: 12.7, anchor: 'middle' });
        tx(rhs, x + dx, y, { size: 12.7 });
    };
    const stageText = (x, st, S) => {
        tx('Stage ' + st, x, -0.25, { size: 14, anchor: 'middle' });
        if (S.full) tx('fully compressed', x, -0.65, { size: 12.7, anchor: 'middle' });
        else if (st === 'III') eqLine(x, -0.65, '$y$', S.y.toFixed(2) + ' $t$');
        else eqLine(x, -0.65, '$x_\\mathrm{c}$', S.xc.toFixed(2) + ' $t$');
    };

    const n = pII[0];
    let m = pII[1];
    if (!II.ok) m = pIII[1];                         // the direction of M, if only stage III
    const tH = 2.3, yA = tH / 2;
    const sg = m < 0 ? -1 : 1;                       // m < 0: compressed at the bottom
    const Yu = u => yA + sg * tH * (0.5 - u);
    const S = 1.05;                                  // drawing width of fcd
    // section
    const x0 = 2.0, bW = 1.35;
    patch([x0, x0 + bW, x0 + bW, x0], [0, 0, tH, tH], '#ccc', 0.8);
    for (const sc of [-1, 1]) line([x0, x0 + bW], [yA + sc * tH / 6, yA + sc * tH / 6], 0.8, '#000', '1.5 3');
    tx('$+t/6$', x0 + bW / 2, yA + tH / 6 + 0.21, { size: 12.7, anchor: 'middle' });
    tx('$-t/6$', x0 + bW / 2, yA - tH / 6 - 0.21, { size: 12.7, anchor: 'middle' });
    arrowH(0.55, 1.35, yA);
    tx('$N$', 0.98, yA + 0.22, { size: 14 });
    const ax = [], ay = [];
    for (let i = 0; i <= 40; i++) { const th = (100 + 160 * i / 40) * Math.PI / 180; ax.push(0.6 + 0.33 * Math.cos(th)); ay.push(yA + sg * 0.33 * Math.sin(th)); }
    line(ax, ay, 1);
    tip(ax[0], ay[0], 1, sg * 0.25);
    tx('$M$', 0.12, yA + sg * 0.48, { size: 14 });
    dimV(x0 + bW + 0.45, 0, tH, '$t$', x0 + bW + 0.1, yA - 0.5);
    dimH(x0, x0 + bW, -0.35, '$b$', -0.08);

    // sigma_M, sigma_N
    let yT = Yu(0);
    const yB = Yu(1);                                // compressed and other edge
    if (II.ok) {
        let xb = 5.0;
        const aM = Math.min(6 * Math.abs(m) * S, 0.62);
        patch([xb, xb + aM, xb - aM, xb], [yT, yT, yB, yB], '#fff', 0.8);
        line([xb, xb], [0, tH], 0.6);
        tx('$\\sigma_M$', xb, tH + 0.25, { size: 14, anchor: 'middle' });
        stressArrows(xb, [aM, -aM], [yT, yB]);
        xb = 5.95;
        const aN = Math.min(Math.max(n, 0) * S, 0.9);
        patch([xb, xb + aN, xb + aN, xb], [0, 0, tH, tH], '#fff', 0.8);
        tx('$\\sigma_N$', xb + 0.21, tH + 0.25, { size: 14, anchor: 'middle' });
        stressArrows(xb, [aN, aN], [0, tH]);
    }

    // sigma_M + sigma_N, stage II
    let xb = 8.4;
    const capL = 1.5;
    if (II.ok) {
        tx('$\\sigma_M + \\sigma_N$', xb + 0.55, tH + 0.25, { size: 14, anchor: 'middle' });
        const a1 = Math.min(II.sMax * S, capL), yZ = Yu(II.xc);
        if (II.full) {
            const a0 = a1 * II.sMin / II.sMax;
            patch([xb, xb + a1, xb + a0, xb], [yT, yT, yB, yB], '#fff', 0.8);
            stressArrows(xb, [a1, a0], [yT, yB]);
        } else {
            patch([xb, xb + a1, xb], [yT, yT, yZ], '#fff', 0.8);
            stressArrows(xb, [a1], [yT]);
        }
        // resultant at the eccentricity, from the centre line
        const yR = yA + II.e * tH;
        const frac = II.full ? a1 * (1 - Math.abs(II.e) * 6) : a1 / 3;
        const xR = xb + Math.max(frac, 0.1);
        const cN = II.full ? '#000' : C_BAD;           // red: the resultant outside the core
        el('circle', { cx: SX(xR), cy: SY(yR), r: 2, fill: cN }, g);
        arrowH(xR + 1.0, xR + 0.08, yR, cN);
        tx('$N$', xR + 0.85, yR + 0.24, { size: 14, anchor: 'middle', fill: cN });
        if (!II.full) {
            dimV(10.15, Math.min(yR, yT), Math.max(yR, yT), '$x_\\mathrm{c}/3$', 9.6);
            dimV(8.1, Math.min(yZ, yT), Math.max(yZ, yT), '', 8.3);
            tx('$x_\\mathrm{c}$', 7.97, (yZ + yT) / 2, { size: 14, anchor: 'end' });
        }
        stageText(xb + 0.5, 'II', II);
    }

    // stage III: stress block
    xb = 12.1;
    if (III.ok) {
        const sg3 = pIII[1] < 0 ? -1 : 1;
        const Yu3 = u => yA + sg3 * tH * (0.5 - u);
        yT = Yu3(0);
        tx('$f_\\mathrm{cd}$', xb + 0.42, tH + 0.25, { size: 14, anchor: 'middle' });
        const aB = Math.min(III.sMax * S, 1.1), yZ = Yu3(III.y);
        patch([xb, xb + aB, xb + aB, xb], [yT, yT, yZ, yZ], '#fff', 0.8);
        stressArrows(xb, [aB, aB], [yT, yZ]);
        const yR = yA + III.e * tH;
        const cN = Math.abs(III.e) > 1 / 6 ? C_BAD : '#000';
        el('circle', { cx: SX(xb + aB / 2), cy: SY(yR), r: 2, fill: cN }, g);
        arrowH(xb + aB / 2 + 0.85, xb + aB / 2 + 0.08, yR, cN);
        tx('$N$', xb + aB / 2 + 0.6, yR + 0.22, { size: 14, anchor: 'middle', fill: cN });
        dimV(13.6, Math.min(yR, yT), Math.max(yR, yT), '$y/2$', 13.5);
        dimV(11.8, Math.min(yZ, yT), Math.max(yZ, yT), '', 12.0);
        tx('$y$', 11.67, (yZ + yT) / 2, { size: 14, anchor: 'end' });
        stageText(xb + 0.4, 'III', III);
    }
    // the base lines over the whole depth, always, and the centre line on top
    line([8.4, 8.4], [0, tH], 0.6);
    line([12.1, 12.1], [0, tH], 0.6);
    line([1.45, 13.65], [yA, yA], 0.4, '#595959', '7 3 1.5 3');
}

// ------------------------------------------------------------------------ callbacks
// one finite number from a box, simple expressions allowed, as MATLAB's str2num; NaN if not
function readNum(s) {
    s = String(s).trim();
    if (!s || !/^[-+*/().\deE\s]+$/.test(s)) return NaN;
    try {
        const v = Function('"use strict"; return (' + s + ');')();
        return typeof v === 'number' && isFinite(v) ? v : NaN;
    } catch (e) { return NaN; }
}
const fmt = v => String(Number(v.toPrecision(4)));

function setMsg(s, note) {
    $('msg').textContent = s;
    $('msg').className = note ? 'note' : '';
}

function clampP1(p) {
    const q = p.slice();
    const nm = ALPHA / (2 * BETA);
    if (q[0] < 0) q[0] = 0; else if (q[0] > nm) q[0] = Math.floor(nm * 1000) / 1000;
    let c = Math.max(MN.capIII(q[0], ALPHA, BETA), 0), atLim = false;
    if (inp.rot) {
        const cu = Math.max(MN.capCu(q[0]), 0);
        atLim = cu < c && Math.abs(q[1]) > cu;
        c = Math.min(c, cu);
    }
    if (Math.abs(q[1]) > c) q[1] = Math.sign(q[1]) * Math.floor(c * 1000) / 1000;
    return { p: q, moved: q[0] !== p[0] || q[1] !== p[1], atLim };
}

function syncBoxes() {
    $('n1').value = fmt(inp.p1[0]); $('m1').value = fmt(inp.p1[1]);
    $('n2').value = fmt(inp.p2[0]); $('m2').value = fmt(inp.p2[1]);
    setMsg('');
}

let envRot = null;
function onInput() {
    const v = ['n1', 'm1', 'n2', 'm2'].map(id => readNum($(id).value));
    inp.rot = $('iRot').checked;
    $('rotBox').classList.toggle('on', inp.rot);
    if (v.some(isNaN)) { setMsg('input error'); return; }
    setMsg('');
    inp.p1 = [v[0], v[1]]; inp.p2 = [v[2], v[3]];
    const c = clampP1(inp.p1);
    inp.p1 = c.p;
    if (c.moved) {
        $('n1').value = fmt(inp.p1[0]); $('m1').value = fmt(inp.p1[1]);
        setMsg(c.atLim ? 'p1 moved onto the rotation limit' : 'p1 moved onto the stage III envelope', true);
    }
    if (envRot !== inp.rot) { drawEnvelopes(); envRot = inp.rot; }
    update();
}

function onReset() {
    $('n1').value = DEF.n1; $('m1').value = DEF.m1;
    $('n2').value = DEF.n2; $('m2').value = DEF.m2;
    $('iRot').checked = DEF.rot;
    onInput();
}

function onDown(k, ev) {
    ev.preventDefault();
    drag = k;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
function onMove(ev) {
    if (!drag) return;
    ev.preventDefault();
    const svg = $('res'), pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    const r3 = v => Math.round(v * 1000) / 1000;
    const p = [r3(Math.min(Math.max(LIMS[0] + (q.x - AX.x) / AX.w * (LIMS[1] - LIMS[0]), LIMS[0]), LIMS[1])),
               r3(Math.min(Math.max(LIMS[2] + (AX.y + AX.h - q.y) / AX.h * (LIMS[3] - LIMS[2]), LIMS[2]), LIMS[3]))];
    if (drag === 1) inp.p1 = clampP1(p).p; else inp.p2 = p;
    syncBoxes();
    update();
}
function onUp() { drag = 0; }

// ------------------------------------------------------------------------- report
const SPAN = (a, b) => `<i>${a}</i><sub>${b}</sub>`;
const FCD = SPAN('f', 'cd');
const FRAC = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
const num3 = v => (isNaN(v) ? '–' : v.toFixed(3).replace('-', '−'));

// the plot, from the page, with the legend on one line under it, in the proportions of the GUI
function reportPlot() {
    const c = $('res').cloneNode(true);
    c.querySelectorAll('.hit, .tv, .lgd').forEach(o => o.remove());
    c.removeAttribute('class'); c.removeAttribute('style');
    c.setAttribute('viewBox', '0 22 470 376');
    c.setAttribute('width', '120mm'); c.setAttribute('height', (120 * 376 / 470) + 'mm');
    const g = el('g', {}, c);
    const rows = [['Stage II', null, 'none', 1], ['Stage III', null, '8 4', 1], ['Core limit', null, '1.5 3', 0.8]];
    if (inp.rot) rows.push(['Rot. limit', C_PINK, 'none', 1]);
    let x = 58;
    const y = 388;
    for (const r of rows) {
        if (r[1]) el('rect', { x, y: y - 6, width: 22, height: 12, fill: r[1], stroke: 'none' }, g);
        else el('line', { x1: x, y1: y, x2: x + 22, y2: y, stroke: '#000', 'stroke-width': r[3] * LW, 'stroke-dasharray': r[2] }, g);
        text(g, r[0], x + 26, y, { size: 13.3 });
        x += 26 + 62;
    }
    return c.outerHTML;
}

function reportModel() {
    const c = $('model').cloneNode(true);
    c.removeAttribute('class'); c.removeAttribute('style');
    c.setAttribute('viewBox', '-4 0 548 142');
    c.setAttribute('width', '160mm'); c.setAttribute('height', (160 * 142 / 548) + 'mm');
    return c.outerHTML;
}

function reportHTML() {
    const res = window.res;
    const row = (a, p, last) => `<tr><td>${a}</td><td class="r">${num3(p[0])}</td><td class="r">${num3(p[1])}</td><td${last.r ? ' class="r"' : ''}>${last.t}</td></tr>`;
    const psi = v => (isNaN(v) ? '–' : v.toFixed(2));
    const P1 = '<i>p</i><sub>1</sub>', P2 = '<i>p</i><sub>2</sub>', P3 = '<i>p</i><sub>3</sub>';
    const ep = SPAN('ε', 'cu');
    return `<h1>M-N interaction capacity</h1>
<h2>Basis</h2>
<ul>
<li>Unreinforced rectangular cross-section <i>b</i>&#8201;×&#8201;<i>t</i>, no tensile strength, plane sections; <i>n</i> and <i>m</i> normalised by ${FCD}.</li>
<li>Stage II: linear stresses, ${FCD} at the compressed edge. Stage III: uniform ${FCD} over <i>y</i> = 0.8&#8201;${SPAN('x', 'c')} from that edge.</li>
<li>Load line from ${P1} through ${P2}; ${P3}, where it leaves the envelope, gives the load factor <i>ψ</i>. Stresses at ${P3}.</li>
${inp.rot ? `<li>Rotation limit: edge strain ${ep} = 3.5&nbsp;‰, parabola-rectangle, EN&nbsp;1992-1-1:2023 (8.4), ${SPAN('ε', 'c2')} = 2&nbsp;‰; limits <i>ψ</i><sub>III</sub>.</li>` : ''}
</ul>
<h2>Input</h2>
<table><thead><tr><th>Point</th><th class="r"><i>n</i></th><th class="r"><i>m</i></th><th>Load</th></tr></thead><tbody>
${row(P1, inp.p1, { t: SPAN('Q', 'perm') })}
${row(P2, inp.p2, { t: SPAN('Q', 'perm') + ' + ' + SPAN('Q', 'live') })}
</tbody></table>
<h2>Model</h2>
<figure>${reportModel()}<figcaption>Figure 1: &nbsp; Section and stresses at ${P3}.</figcaption></figure>
<div class="eqs">
<div><i>n</i> = ${FRAC('<i>N</i>', '<i>b</i>&#8201;<i>t</i>&#8201;' + FCD)}, &nbsp; <i>m</i> = ${FRAC('<i>M</i>', '<i>b</i>&#8201;<i>t</i><sup>2</sup>&#8201;' + FCD)}</div>
<div><i>ψ</i> = ${FRAC('<i>n</i><sub>3</sub> − <i>n</i><sub>1</sub>', '<i>n</i><sub>2</sub> − <i>n</i><sub>1</sub>')}</div>
<div>|<i>m</i>|<sub>II</sub> ≤ <span class="brace">{</span><span class="rows"><span><i>n</i>/2 − 2<i>n</i><sup>2</sup>/3,</span><span>0 ≤ <i>n</i> ≤ 0.5</span><span>(1 − <i>n</i>)/6,</span><span>0.5 ≤ <i>n</i> ≤ 1</span></span></div>
<div>|<i>m</i>|<sub>III</sub> ≤ <i>n</i>/2 − (<i>β</i>/<i>α</i>)&#8201;<i>n</i><sup>2</sup>, &nbsp; 0 ≤ <i>n</i> ≤ 1, &nbsp; <i>α</i> = 0.8, <i>β</i> = 0.4</div>
${inp.rot ? `<div>${SPAN('θ', 'cap')} = <span class="par">(</span>${FRAC(ep, SPAN('x', 'cu'))} − ${FRAC(FCD, SPAN('E', 'c') + '&#8201;' + SPAN('x', 'c'))}<span class="par">)</span>&#8201;${SPAN('l', 'p')}</div>
<div>${SPAN('x', 'cu')}, ${SPAN('x', 'c')}: depth to the neutral axis at ${ep} and at stage II</div>` : ''}
</div>
<h2>Results</h2>
<div class="side">
<figure>${reportPlot()}<figcaption>Figure 2: &nbsp; Envelopes and load line.</figcaption></figure>
<div>
<table><thead><tr><th>Point</th><th class="r"><i>n</i></th><th class="r"><i>m</i></th><th class="r"><i>ψ</i></th></tr></thead><tbody>
${row('<i>p</i><sub>3,II</sub>', res.p3II, { t: psi(res.psiII), r: 1 })}
${row('<i>p</i><sub>3,III</sub>', res.p3III, { t: psi(res.psiIII), r: 1 })}
</tbody></table>
${res.rotIII ? '<div class="note"><i>p</i><sub>3,III</sub> lies on the rotation limit.</div>' : ''}
</div>
</div>`;
}

function printHTML(title, body) {
    const today = new Date().toISOString().slice(0, 10);
    const css = `@page { size: A4; margin: 15mm 20mm 8mm 20mm;
        @top-right { content: "${today}"; font: 11pt "Times New Roman", Times, serif; } }
      body { margin: 0; font: 11pt/1.15 "Times New Roman", Times, serif; color: #000; }
      h1 { font-size: 16pt; font-weight: normal; margin: 0 0 3pt; }
      h2 { font-size: 12pt; margin: 7pt 0 2pt; break-after: avoid; }
      ul { margin: 0 0 3pt; padding-left: 1.2em; }
      li { margin: 0 0 1pt; }
      sub, sup { font-size: 72%; line-height: 0; }
      table { border-collapse: collapse; margin: 2pt auto 3pt; }
      th, td { padding: 1pt 7pt; text-align: left; font-weight: normal; }
      td.r, th.r { text-align: right; }
      thead tr { border-top: 0.8pt solid #000; border-bottom: 0.8pt solid #000; }
      tbody tr:last-child { border-bottom: 0.8pt solid #000; }
      figure { margin: 2pt 0; text-align: center; }
      figcaption { font-size: 10pt; margin-top: 2pt; }
      svg { display: block; margin: 0 auto; }
      svg text { pointer-events: none; }
      .eqs { display: grid; grid-template-columns: 1fr 1.25fr; align-items: center; gap: 4pt 10pt; margin: 3pt 6mm; }
      .eqs > div { white-space: nowrap; }
      .frac { display: inline-flex; flex-direction: column; text-align: center; line-height: 1.12; margin: 0 1pt; vertical-align: middle; }
      .frac > span:first-child { border-bottom: 0.6pt solid #000; padding: 0 2pt 1pt; }
      .frac > span:last-child { padding: 1pt 2pt 0; }
      .par { font-size: 28pt; font-weight: 200; line-height: 1; transform: scaleX(0.65); display: inline-block; margin: 0 -2pt; vertical-align: middle; }
      .brace { font-size: 30pt; font-weight: 200; line-height: 1; transform: scaleX(0.6); display: inline-block; margin: 0 -1pt; vertical-align: middle; }
      .rows { display: inline-grid; grid-template-columns: auto auto; column-gap: 9pt; row-gap: 1pt; vertical-align: middle; }
      .side { display: flex; align-items: center; justify-content: space-between; }
      .side figure { flex: none; width: 120mm; }
      .side > div { flex: none; width: 48mm; }
      .note { font-size: 10pt; text-align: center; }`;
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0';
    document.body.appendChild(fr);
    const doc = fr.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body>${body}</body></html>`);
    doc.close();
    if (window.__printHook) { window.__printHook(fr, title); return; }
    const t0 = document.title;
    document.title = title;
    setTimeout(() => {
        fr.contentWindow.focus(); fr.contentWindow.print();
        document.title = t0;
        setTimeout(() => fr.remove(), 1000);
    }, 300);
}

function onReport() {
    if (['n1', 'm1', 'n2', 'm2'].some(id => isNaN(readNum($(id).value)))) { setMsg('input error'); return; }
    onInput();
    printHTML('MN_envelope', reportHTML());
    setMsg('print dialog: Save as PDF', true);
}

// -------------------------------------------------------------------------- start
drawSymbols();
buildPlot();
$('n1').value = DEF.n1; $('m1').value = DEF.m1;
$('n2').value = DEF.n2; $('m2').value = DEF.m2;
for (const id of ['n1', 'm1', 'n2', 'm2']) {
    $(id).addEventListener('change', onInput);
    $(id).addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); onInput(); ev.target.blur(); } });
}
$('iRot').addEventListener('change', onInput);
$('sRst').addEventListener('click', onReset);
$('sRep').addEventListener('click', onReport);
onInput();
})();
