/**
 * Exploratory analysis. Everything here was decided AFTER seeing the data and
 * is reported as exploratory: it generates the next hypothesis, it does not
 * confirm this one.
 *
 * The pre-registered run left three things unexplained, and they turn out to
 * have one answer. Writes EXPLORATORY.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { byDictionary, ranksOf } from "../src/design.ts";
import { mean, round, sd, spearman, tTailTwoSided, tTest } from "../src/stats.ts";

interface Row {
  arm?: string; condition?: string; k?: number; index: number;
  written: string[]; choice: string; probabilities: Record<string, number>;
}

const read = (f: string) =>
  readFileSync(join(process.cwd(), "data", f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);

const main = read("raw.ndjson").map((r) => ({ ...r, k: 16, group: r.arm as string }));
const follow = read("followup.ndjson").map((r) => ({ ...r, group: r.condition as string }));
const all = [...main, ...follow];

/** Lift: the option's share divided by what a uniform distribution would give. */
const liftOf = (r: { probabilities: Record<string, number>; k?: number }, name: string) =>
  (r.probabilities[name] ?? 0) * (r.k ?? 16);

/** Welch two-sample t-test, reported as mean / diff / p. */
function welch(a: readonly number[], b: readonly number[]) {
  const ma = mean(a), mb = mean(b);
  const se = Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);
  const t = (ma - mb) / se;
  const va = sd(a) ** 2 / a.length, vb = sd(b) ** 2 / b.length;
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  return { ma, mb, diff: ma - mb, t, df, p: tTailTwoSided(t, df), na: a.length, nb: b.length };
}

const fmtP = (p: number) => (!Number.isFinite(p) ? "n/a" : p < 1e-12 ? "<1e-12" : p < 0.001 ? p.toExponential(1) : p.toFixed(4));

const L: string[] = [];
const w = (s = "") => L.push(s);

w("# Exploratory analysis");
w();
w("Everything in this file was decided **after** seeing the data. It is here to");
w("generate the next hypothesis, not to confirm this one. The pre-registered");
w("results are in [RESULTS.md](RESULTS.md).");
w();

/* ---------- E1: absolute letter, not relative rank ---------- */

w("## E1 — the effect tracks the absolute first character, not rank in the list");
w();
w("Every set has a dictionary-first option. If a **sort** were the mechanism, all");
w("of them should get the same boost, whatever letter they happen to start with.");
w("They do not.");
w();

const wordish = all.filter((r) => ["words", "nonsense", "words8", "words16"].includes(r.group));
const byFirstChar = new Map<string, number[]>();
for (const r of wordish) {
  const first = byDictionary(r.written)[0] as string;
  const c = (first[0] as string).toLowerCase();
  if (!byFirstChar.has(c)) byFirstChar.set(c, []);
  (byFirstChar.get(c) as number[]).push(liftOf(r, first));
}

w("| First letter of the dictionary-first option | Sets | Mean lift vs uniform |");
w("| --- | --- | --- |");
for (const c of [...byFirstChar.keys()].sort()) {
  const xs = byFirstChar.get(c) as number[];
  w(`| \`${c}\` | ${xs.length} | ${mean(xs).toFixed(2)}x |`);
}
w();

const aStart = wordish.filter((r) => (byDictionary(r.written)[0] as string).startsWith("a"))
  .map((r) => liftOf(r, byDictionary(r.written)[0] as string));
const notA = wordish.filter((r) => !(byDictionary(r.written)[0] as string).startsWith("a"))
  .map((r) => liftOf(r, byDictionary(r.written)[0] as string));
const e1 = welch(aStart, notA);
const notAvs1 = tTest(notA, 1);

w(`Dictionary-first starts with \`a\`: **${e1.ma.toFixed(2)}x** (n=${e1.na}).`);
w(`Dictionary-first starts with anything later: **${e1.mb.toFixed(2)}x** (n=${e1.nb}).`);
w(`Difference ${e1.diff.toFixed(2)}, Welch t=${e1.t.toFixed(2)}, p=${fmtP(e1.p)}.`);
w();
w(`And the second group is **indistinguishable from no effect at all**:`);
w(`${notAvs1.mean.toFixed(2)}x, 95% CI [${notAvs1.ci95[0].toFixed(2)}, ${notAvs1.ci95[1].toFixed(2)}], p=${fmtP(notAvs1.pTwoSided)} against a null of 1.0x.`);
w();
w("A sort cannot produce that. A preference for the literal letter `a` can.");
w();

/* ---------- E2: the same thing in digits ---------- */

w("## E2 — the same pattern in digits: `0` and `1`, not \"low\"");
w();

const uuid = main.filter((r) => r.group === "uuid");
const leadHex = new Map<string, number[]>();
for (const r of uuid) for (const n of r.written) {
  const c = n[0] as string;
  if (!leadHex.has(c)) leadHex.set(c, []);
  (leadHex.get(c) as number[]).push(liftOf(r, n));
}
w("UUID options, by leading hex character (uniform = 1.00x):");
w();
w("| Leading char | Options | Mean lift |");
w("| --- | --- | --- |");
for (const c of "0123456789abcdef") {
  const xs = leadHex.get(c);
  if (xs) w(`| \`${c}\` | ${xs.length} | ${mean(xs).toFixed(2)}x |`);
}
w();

const mc = main.filter((r) => r.group === "mixedcase");
const styles: Record<string, number[]> = { Capitalised: [], underscore: [], "digit-led": [], lowercase: [] };
for (const r of mc) for (const n of r.written) {
  const lift = liftOf(r, n);
  if (/^[A-Z]/.test(n)) styles.Capitalised?.push(lift);
  else if (n.startsWith("_")) styles.underscore?.push(lift);
  else if (/^[0-9]/.test(n)) styles["digit-led"]?.push(lift);
  else styles.lowercase?.push(lift);
}
w("The `mixedcase` arm, by name style (uniform = 1.00x):");
w();
w("| Style | Options | Mean lift | 95% CI | p vs 1.0 |");
w("| --- | --- | --- | --- | --- |");
for (const [k, xs] of Object.entries(styles)) {
  const t = tTest(xs, 1);
  w(`| ${k} | ${xs.length} | ${t.mean.toFixed(2)}x | [${t.ci95[0].toFixed(2)}, ${t.ci95[1].toFixed(2)}] | ${fmtP(t.pTwoSided)} |`);
}
w();
w("Byte order puts digit-led names at the very front of the list. They get the");
w("**least** mass of any style. That is the cleanest single refutation of a");
w("server-side sort in the whole experiment.");
w();

const digitLead = new Map<string, number[]>();
for (const r of mc) for (const n of r.written) {
  const m = n.match(/^([0-9])/);
  if (!m) continue;
  const c = m[1] as string;
  if (!digitLead.has(c)) digitLead.set(c, []);
  (digitLead.get(c) as number[]).push(liftOf(r, n));
}
w("Within the digit-led names only:");
w();
w("| Leading digit | Options | Mean lift |");
w("| --- | --- | --- |");
for (const c of [...digitLead.keys()].sort()) {
  const xs = digitLead.get(c) as number[];
  w(`| \`${c}\` | ${xs.length} | ${mean(xs).toFixed(2)}x |`);
}
w();
w("`1` is favoured and `2` through `9` are flat. Again: a specific token, not a gradient.");
w();

/* ---------- E3: the numeric arm ---------- */

w("## E3 — numbered options: a comparison and a token, stacked");
w();
const numeric = main.filter((r) => r.group === "numeric");
const byOffset = new Map<number, number[]>();
for (const r of numeric) {
  const nums = r.written.map((n) => Number(n.match(/\d+$/)?.[0]));
  const lo = Math.min(...nums);
  for (const n of r.written) {
    const off = Number(n.match(/\d+$/)?.[0]) - lo;
    if (!byOffset.has(off)) byOffset.set(off, []);
    (byOffset.get(off) as number[]).push(liftOf(r, n));
  }
}
w("Offset from the smallest number present in the set (uniform = 1.00x):");
w();
w("| Offset | Mean lift |");
w("| --- | --- |");
for (const k of [...byOffset.keys()].sort((a, b) => a - b)) {
  w(`| +${k} | ${mean(byOffset.get(k) as number[]).toFixed(2)}x |`);
}
w();
w("The runs do not all start at 1 -- each set begins at 1, 2 or 3 -- and that");
w("splits the effect into two parts that stack:");
w();
const byStart = new Map<number, number[]>();
for (const r of numeric) {
  const nums = r.written.map((n) => Number(n.match(/\d+$/)?.[0]));
  const lo = Math.min(...nums);
  const smallest = r.written.find((n) => Number(n.match(/\d+$/)?.[0]) === lo) as string;
  if (!byStart.has(lo)) byStart.set(lo, []);
  (byStart.get(lo) as number[]).push(liftOf(r, smallest));
}
w("| Run starts at | Sets | Lift on the smallest option | 95% CI |");
w("| --- | --- | --- | --- |");
for (const k of [...byStart.keys()].sort((a, b) => a - b)) {
  const t = tTest(byStart.get(k) as number[], 1);
  w(`| ${k} | ${t.n} | **${t.mean.toFixed(1)}x** | [${t.ci95[0].toFixed(1)}, ${t.ci95[1].toFixed(1)}] |`);
}
w();
const one = byStart.get(1) ?? [];
const notOne = [...(byStart.get(2) ?? []), ...(byStart.get(3) ?? [])];
const e3 = welch(one, notOne);
w(`Starting at 2 and starting at 3 are indistinguishable (${mean(byStart.get(2) ?? []).toFixed(1)}x and ${mean(byStart.get(3) ?? []).toFixed(1)}x),`);
w(`so this is not a preference for small numbers in general. It is two things at once:`);
w();
w(`1. **A comparison.** The smallest number present wins even when it is 2 or 3 — ${mean(notOne).toFixed(1)}x.`);
w(`2. **A token.** The literal \`1\` is worth roughly ${(e3.ma / e3.mb).toFixed(1)}x again on top of that`);
w(`   (${e3.ma.toFixed(1)}x vs ${e3.mb.toFixed(1)}x, Welch t=${e3.t.toFixed(1)}, p=${fmtP(e3.p)}).`);
w();
w("So an `item1 … item12` list is not a mild naming preference. `item1` takes");
w(`**${((byStart.get(1) ?? []).reduce((a, b) => a + b, 0) / (byStart.get(1) ?? [1]).length / 16 * 100).toFixed(0)}%** of the distribution on any question where the evidence is thin.`);
w();

/* ---------- E4: the 2x2 ---------- */

w("## E4 — why this run disagreed with the earlier suite");
w();
w("The earlier suite reported 0.787 for the alphabetically-first option at k=8.");
w("The pre-registered arms here give 1.6x on ordinary words. Two things differed:");
w("option count, and the fact that the old sets used names like `aaa`/`bbb` and");
w("`tag_a`/`tag_b`, which differ **only** by one letter of the alphabet.");
w();
w("The follow-up crosses both factors, 30 sets per cell.");
w();
w("| | k=8 | k=16 |");
w("| --- | --- | --- |");
const cell = (c: string) => {
  const rs = follow.filter((r) => r.group === c);
  const xs = rs.map((r) => liftOf(r, byDictionary(r.written)[0] as string));
  const t = tTest(xs, 1);
  return `${t.mean.toFixed(2)}x [${t.ci95[0].toFixed(2)}, ${t.ci95[1].toFixed(2)}]`;
};
w(`| **letters** (\`aaa\`, \`bbb\`) | ${cell("letters8")} | ${cell("letters16")} |`);
w(`| **words** (\`amber\`, \`basket\`) | ${cell("words8")} | ${cell("words16")} |`);
w();
const liftsOf = (c: string) => follow.filter((r) => r.group === c).map((r) => liftOf(r, byDictionary(r.written)[0] as string));
const style = welch([...liftsOf("letters8"), ...liftsOf("letters16")], [...liftsOf("words8"), ...liftsOf("words16")]);
const count = welch([...liftsOf("letters16"), ...liftsOf("words16")], [...liftsOf("letters8"), ...liftsOf("words8")]);
w(`Name style: ${style.ma.toFixed(2)}x vs ${style.mb.toFixed(2)}x, diff ${style.diff.toFixed(2)}, p=${fmtP(style.p)}.`);
w(`Option count: ${count.ma.toFixed(2)}x vs ${count.mb.toFixed(2)}x, diff ${count.diff.toFixed(2)}, p=${fmtP(count.p)}.`);
w();
w("Both matter and they compound, but style is the bigger term. The earlier");
w("suite was not wrong — it happened to pick the option names that maximise the");
w("effect, and then generalised from them.");
w();

/* ---------- E5: replication ---------- */

w("## E5 — direct replication of the three original sets");
w();
w("The same option names the earlier suite used, sent again.");
w();
w("| Set | Alphabetically-first | Share now | Share reported then | Winner now |");
w("| --- | --- | --- | --- | --- |");
const reported: Record<string, number> = {
  original_shuffledWords: 0.73, original_shuffledLetters: 0.83, original_shuffledTags: 0.8,
};
for (const r of follow.filter((x) => x.group.startsWith("original_"))) {
  const first = byDictionary(r.written)[0] as string;
  w(`| \`${r.group.replace("original_", "")}\` | \`${first}\` | ${(r.probabilities[first] ?? 0).toFixed(2)} | ${reported[r.group]?.toFixed(2)} | \`${r.choice}\` |`);
}
w();
w("All three reproduce inside one 0.01 grid step or two. The original numbers");
w("were correct measurements of those particular option sets.");
w();

/* ---------- E6: the unified account ---------- */

w("## E6 — one mechanism behind all of it");
w();
w("Collecting the pieces:");
w();
w("| Observation | Favoured token |");
w("| --- | --- |");
w(`| words | \`a\`-initial only (${e1.ma.toFixed(2)}x vs ${e1.mb.toFixed(2)}x for later letters) |`);
w(`| letter-triples | \`aaa\` |`);
w(`| tags | \`tag_a\` |`);
w(`| UUIDs | leading \`0\` (${mean(leadHex.get("0") ?? [0]).toFixed(2)}x), then \`1\` |`);
w(`| digit-led names | \`1\` (${mean(digitLead.get("1") ?? [0]).toFixed(2)}x), rest flat |`);
w(`| numbered options | literal \`1\` (${mean(byStart.get(1) ?? [0]).toFixed(1)}x), then the smallest present (${mean([...(byStart.get(2) ?? []), ...(byStart.get(3) ?? [])]).toFixed(1)}x) |`);
w();
w("The model is not sorting the option map. It is reaching for whatever token");
w("**looks like the beginning of a familiar sequence** — the letter `a`, the");
w("digits `0` and `1`, the lowest number in a run. On a list with no such token,");
w("there is no measurable prior at all.");
w();
w("That reframes the practical advice. \"Do not let your option names be");
w("alphabetically ordered\" is the wrong rule. The rule is: **do not give one");
w("option a name that starts with `a`, `0` or `1`, or the lowest number in a");
w("run, unless you mean to favour it.**");
w();
w("It also predicts something the data here cannot check: the same should hold");
w("for other canonical firsts — `first`, `A`, `alpha`, `one`, Monday, January.");
w("That is the next experiment, not a result of this one.");

writeFileSync(join(process.cwd(), "EXPLORATORY.md"), L.join("\n") + "\n");
console.log("wrote EXPLORATORY.md");
console.log(`\nE1  a-initial ${e1.ma.toFixed(2)}x vs later-letter ${e1.mb.toFixed(2)}x, p=${fmtP(e1.p)}`);
console.log(`    later-letter vs no effect: ${notAvs1.mean.toFixed(2)}x, p=${fmtP(notAvs1.pTwoSided)}`);
console.log(`E4  style p=${fmtP(style.p)}, count p=${fmtP(count.p)}`);
