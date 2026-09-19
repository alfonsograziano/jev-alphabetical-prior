/**
 * The inference for this experiment. Exact where exact is available.
 *
 * n is 30 per arm, which is small enough that a normal approximation to the
 * binomial is visibly wrong at the tails, and the tails are where the verdicts
 * live. So the binomial tests here are exact and the intervals are
 * Clopper-Pearson rather than Wald.
 */

export const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length;

export function sd(xs: readonly number[]): number {
  if (xs.length < 2) return Number.NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export const round = (x: number, places = 3): number =>
  Number.isFinite(x) ? Number(x.toFixed(places)) : x;

/* ---------- special functions ---------- */

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < 8; i++) x += (LANCZOS[i] as number) / (z + i + 1);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

const lchoose = (n: number, k: number) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);

/** Continued-fraction expansion behind the regularized incomplete beta. */
function betacf(x: number, a: number, b: number): number {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;  if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;  if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-13) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(x, a, b)) / a : 1 - (bt * betacf(1 - x, b, a)) / b;
}

/** Inverse of ibeta in x, by bisection. Used for Clopper-Pearson limits. */
export function ibetaInv(p: number, a: number, b: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (ibeta(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Two-sided Student t CDF complement: P(|T| > |t|) with df degrees of freedom. */
export function tTailTwoSided(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return Number.NaN;
  return ibeta(df / (df + t * t), df / 2, 0.5);
}

/** One-sided upper tail: P(T > t). */
export const tTailUpper = (t: number, df: number): number =>
  t >= 0 ? tTailTwoSided(t, df) / 2 : 1 - tTailTwoSided(t, df) / 2;

/* ---------- binomial ---------- */

export const binomPMF = (k: number, n: number, p: number): number => {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(lchoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
};

/** P(X >= k). Exact, one-sided upper tail. */
export function binomUpper(k: number, n: number, p: number): number {
  let s = 0;
  for (let i = Math.max(0, k); i <= n; i++) s += binomPMF(i, n, p);
  return Math.min(1, s);
}

/** Exact one-sided binomial test of H0: rate = p0 against rate > p0. */
export const binomTest = (successes: number, n: number, p0: number): number =>
  binomUpper(successes, n, p0);

/** Clopper-Pearson exact interval. Never leaves [0, 1], never zero-width at 0/n. */
export function clopperPearson(k: number, n: number, conf = 0.95): [number, number] {
  const a = (1 - conf) / 2;
  return [
    k === 0 ? 0 : ibetaInv(a, k, n - k + 1),
    k === n ? 1 : ibetaInv(1 - a, k + 1, n - k),
  ];
}

/* ---------- t tests ---------- */

export interface TTest {
  n: number;
  mean: number;
  sd: number;
  t: number;
  df: number;
  pTwoSided: number;
  pUpper: number;
  cohensD: number;
  ci95: [number, number];
}

/** One-sample t-test of H0: mean = mu0. */
export function tTest(xs: readonly number[], mu0 = 0): TTest {
  const n = xs.length;
  const m = mean(xs);
  const s = sd(xs);
  const se = s / Math.sqrt(n);
  const t = (m - mu0) / se;
  const df = n - 1;
  // Critical t for a 95% interval, recovered by bisecting the t tail.
  let lo = 0, hi = 100;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tTailTwoSided(mid, df) > 0.05) lo = mid; else hi = mid;
  }
  const tCrit = (lo + hi) / 2;
  return {
    n, mean: m, sd: s, t, df,
    pTwoSided: tTailTwoSided(t, df),
    pUpper: tTailUpper(t, df),
    cohensD: (m - mu0) / s,
    ci95: [m - tCrit * se, m + tCrit * se],
  };
}

/**
 * Two one-sided tests. Evidence that the true mean sits inside +/- margin.
 *
 * A large p-value from tTest says "we did not detect an effect", which is not
 * the same claim as "there is no effect". Only this function makes the second
 * claim, and the UUID arm is the reason the experiment needs it.
 */
export interface TOST { n: number; mean: number; margin: number; pLower: number; pUpper: number; p: number; equivalent: boolean }

export function tost(xs: readonly number[], margin: number, alpha = 0.05): TOST {
  const n = xs.length, m = mean(xs), se = sd(xs) / Math.sqrt(n), df = n - 1;
  // H0a: mu <= -margin, rejected when the mean sits clearly above -margin.
  const pLower = tTailUpper((m + margin) / se, df);
  // H0b: mu >= +margin, rejected when the mean sits clearly below +margin.
  const pUpper = 1 - tTailUpper((m - margin) / se, df);
  const p = Math.max(pLower, pUpper);
  return { n, mean: m, margin, pLower, pUpper, p, equivalent: p < alpha };
}

/* ---------- rank correlation ---------- */

/** Ranks with ties averaged. */
export function rank(xs: readonly number[]): number[] {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && (order[j + 1] as { v: number }).v === (order[i] as { v: number }).v) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[(order[k] as { i: number }).i] = r;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation, tie-safe (Pearson on the ranks). */
export function spearman(a: readonly number[], b: readonly number[]): number {
  const ra = rank(a), rb = rank(b), n = a.length;
  const ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = (ra[i] as number) - ma, y = (rb[i] as number) - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/* ---------- multiplicity ---------- */

/** Holm-Bonferroni. Returns adjusted p-values in the caller's original order. */
export function holm(ps: readonly number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const adj = new Array<number>(m);
  let running = 0;
  order.forEach(({ p, i }, rank_) => {
    running = Math.max(running, Math.min(1, (m - rank_) * p));
    adj[i] = running;
  });
  return adj;
}
