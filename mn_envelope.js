/* mn_envelope.js --------------------------------------------------------------
   M-N capacity of a rectangular section without tensile strength, load factor to the
   failure envelope along a load line.  Port of MN_envelope.m.

   Normalised forces n = N/(b t fcd), m = M/(b t^2 fcd), N positive in compression.
   Stage II, linear stresses, highest stress fcd:
     |m| = n/2 - 2 n^2/3, 0 <= n <= 0.5; (1 - n)/6, 0.5 <= n <= 1
   Stage III, mean stress alpha fcd over xc, resultant at beta xc:
     |m| = n/2 - (beta/alpha) n^2, 0 <= n <= alpha/(2 beta)
   Strain limit: plane sections, no tension, parabola-rectangle stress, EN 1992-1-1:2023 (8.4),
   eps_c2 = 0.002, edge strain eps_cu = 0.0035.
     xc <= t: n = (17/21) xc, resultant at (99/238) xc, |m| = n/2 - (2079/4046) n^2
     t < xc < 7/3 t: closed form in xc; n = 1, m = 0 at xc = 7/3 t
   Load factor psi = (n3 - n1)/(n2 - n1), p3 where the line p1 - p2 leaves the envelope.

   Andreas Andersson, 2026-11-05 (assisted by Claude)
---------------------------------------------------------------------------*/
(function (root) {
'use strict';

const MN = {};

MN.capII = function (n) {
    if (n < 0 || n > 1) return -1;
    return n <= 0.5 ? n / 2 - 2 * n * n / 3 : (1 - n) / 6;
};

MN.capIII = function (n, alpha, beta) {
    if (n < 0 || n > alpha / (2 * beta)) return -1;
    return n / 2 - (beta / alpha) * n * n;
};

// beyond xc = t a table in xc: plateau over u2 = 3 xc/7 from the edge, parabola s = 1 - (v/a)^2
// with a = 4 xc/7 over the rest L = 1 - u2
let nT = null, mT = null;
function table() {
    const N = 4001;
    nT = new Float64Array(N); mT = new Float64Array(N);
    for (let i = 0; i < N; i++) {
        const x = 1 + (7 / 3 - 1) * i / (N - 1);
        const u2 = 3 * x / 7, L = 1 - u2, a = 4 * x / 7;
        nT[i] = 1 - L * L * L / (3 * a * a);
        mT[i] = 0.5 * u2 - 0.5 * u2 * u2 + (0.5 - u2) * (L - L * L * L / (3 * a * a)) - (L * L / 2 - L * L * L * L / (4 * a * a));
    }
}
MN.capCu = function (n) {
    if (n < 0 || n > 1) return -1;
    if (n <= 17 / 21) return n / 2 - (2079 / 4046) * n * n;
    if (!nT) table();
    let lo = 0, hi = nT.length - 1;
    while (hi - lo > 1) { const c = (lo + hi) >> 1; if (nT[c] <= n) lo = c; else hi = c; }
    const d = nT[hi] - nT[lo];
    return d > 0 ? mT[lo] + (mT[hi] - mT[lo]) * (n - nT[lo]) / d : mT[lo];
};

function stressII(p) {
    const n = p[0], m = p[1];
    const S = { ok: n > 0 && Math.abs(m) / n < 0.5, e: NaN, xc: NaN, sMax: NaN, sMin: NaN, full: false };
    if (S.ok) {
        S.e = m / n;
        S.full = Math.abs(S.e) <= 1 / 6;
        if (S.full) {
            S.xc = 1;
            S.sMax = n + 6 * Math.abs(m);
            S.sMin = n - 6 * Math.abs(m);
        } else {
            S.xc = 3 * (0.5 - Math.abs(S.e));
            S.sMax = 2 * n / S.xc;
            S.sMin = 0;
        }
    }
    return S;
}

function stressIII(p) {
    const n = p[0], m = p[1];
    const S = { ok: n > 0 && Math.abs(m) / n < 0.5, e: NaN, y: NaN, sMax: NaN, sMin: 0, full: false };
    if (S.ok) {
        S.e = m / n;
        S.y = 1 - 2 * Math.abs(S.e);
        S.sMax = n / S.y;
    }
    return S;
}

// the load line from p1 through p2 to the envelope, by bisection; the region is convex
function loadFactor(p1, p2, cap) {
    const g = t => Math.abs(p1[1] + t * (p2[1] - p1[1])) - cap(p1[0] + t * (p2[0] - p1[0]));
    const out = { psi: NaN, p3: [NaN, NaN], in1: g(0) <= 0 };
    if (p1[0] === p2[0] && p1[1] === p2[1]) return out;
    if (!out.in1) { out.psi = 0; return out; }
    let b = 1;
    while (g(b) <= 0 && b < 1e9) b *= 2;
    if (g(b) <= 0) return out;
    let a = 0;
    for (let k = 0; k < 80; k++) {
        const c = (a + b) / 2;
        if (g(c) > 0) b = c; else a = c;
    }
    out.psi = a;
    out.p3 = [p1[0] + a * (p2[0] - p1[0]), p1[1] + a * (p2[1] - p1[1])];
    return out;
}

// p1, p2 [n m], alpha, beta, useCu: stage III also limited by the strain eps_cu
MN.run = function (p1, p2, alpha, beta, useCu) {
    const II = loadFactor(p1, p2, MN.capII);
    const capT = useCu ? n => Math.min(MN.capIII(n, alpha, beta), MN.capCu(n)) : n => MN.capIII(n, alpha, beta);
    const III = loadFactor(p1, p2, capT);
    const out = {
        psiII: II.psi, psiIII: III.psi, p3II: II.p3, p3III: III.p3, in1II: II.in1, in1III: III.in1,
        II: stressII(II.p3), III: stressIII(III.p3)
    };
    const n3 = III.p3[0];
    out.rotIII = !!useCu && !isNaN(n3) && MN.capCu(n3) < MN.capIII(n3, alpha, beta) - 1e-12;
    return out;
};

root.MN = MN;
})(typeof self !== 'undefined' ? self : this);
