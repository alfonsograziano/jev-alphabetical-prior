/**
 * Turn data/raw.ndjson into RESULTS.md and data/analysis.json.
 *
 * Implements the plan in PREREGISTRATION.md and nothing else. Needs no API key,
 * so any reader can re-derive every published number from the saved data.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ARM_SEEDS, OPTIONS_PER_SET, SETS_PER_ARM,
  byByte, byDictionary, byNumeric, ranksOf, type ArmName,
} from "../src/design.ts";
import {
  binomTest, clopperPearson, holm, mean, round, sd, spearman, tTest, tost,
} from "../src/stats.ts";

const ARMS: ArmName[] = ["words", "nonsense", "uuid", "mixedcase", "numeric"];
const UNIFORM = 1 / OPTIONS_PER_SET;
const EQUIVALENCE_MARGIN = 0.10;

interface Row {
  arm: ArmName; index: number; written: string[];
  choice: string; confidence: number; probabilities: Record<string, number>; model: string;
}

/** Everything derived from one option set. */
interface Derived extends Row {
  dictFirst: string; byteFirst: string; numFirst: string; insertFirst: string;
  dictFirstWon: boolean; insertFirstWon: boolean;
  dictFirstShare: number; excess: number;
  rhoDict: number; rhoByte: number; rhoNumeric: number; rhoInsert: number;
}

function derive(row: Row): Derived {
  const { written, probabilities } = row;
  const dictR = ranksOf(byDictionary(written));
  const byteR = ranksOf(byByte(written));
  const numR = ranksOf(byNumeric(written));
  const probs = written.map((n) => probabilities[n] ?? 0);
  const rho = (ranks: Record<string, number>) =>
    spearman(written.map((n) => ranks[n] as number), probs);

  const dictFirst = byDictionary(written)[0] as string;
  const share = probabilities[dictFirst] ?? 0;

  return {
    ...row,
    dictFirst,
    byteFirst: byByte(written)[0] as string,
    numFirst: byNumeric(written)[0] as string,
    insertFirst: written[0] as string,
    dictFirstWon: row.choice === dictFirst,
    insertFirstWon: row.choice === written[0],
    dictFirstShare: share,
    excess: share - UNIFORM,
    rhoDict: rho(dictR),
    rhoByte: rho(byteR),
    rhoNumeric: rho(numR),
    rhoInsert: spearman(written.map((_, i) => i), probs),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmtP = (p: number) =>
  !Number.isFinite(p) ? "n/a" : p < 1e-12 ? "<1e-12" : p < 0.001 ? p.toExponential(1) : p.toFixed(4);
const stars = (p: number) => (p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "ns");

/* ---------- load ---------- */

const raw = readFileSync(join(process.cwd(), "data", "raw.ndjson"), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);
const run = JSON.parse(readFileSync(join(process.cwd(), "data", "run.json"), "utf8"));
const all = raw.map(derive);
const byArm = Object.fromEntries(ARMS.map((a) => [a, all.filter((r) => r.arm === a)])) as Record<ArmName, Derived[]>;

/* ---------- H1: does the dictionary-first option win? ---------- */

const h1 = ARMS.map((arm) => {
  const rows = byArm[arm];
  const wins = rows.filter((r) => r.dictFirstWon).length;
  const [lo, hi] = clopperPearson(wins, rows.length);
  const shares = rows.map((r) => r.dictFirstShare);
  return {
    arm, wins, n: rows.length, rate: wins / rows.length, ci95: [lo, hi] as [number, number],
    p: binomTest(wins, rows.length, UNIFORM),
    meanShare: mean(shares), sdShare: sd(shares),
    meanExcess: mean(rows.map((r) => r.excess)),
    lift: mean(shares) / UNIFORM,
    insertionWins: rows.filter((r) => r.insertFirstWon).length,
  };
});

/* ---------- H2 / H3: gradient, and sort order vs writing order ---------- */

const h2h3 = ARMS.map((arm) => {
  const rows = byArm[arm];
  const dict = tTest(rows.map((r) => r.rhoDict), 0);
  const insert = tTest(rows.map((r) => r.rhoInsert), 0);
  const paired = tTest(rows.map((r) => Math.abs(r.rhoDict) - Math.abs(r.rhoInsert)), 0);
  return { arm, dict, insert, paired };
});

/* ---------- H4: byte order or dictionary order ---------- */

const mc = byArm.mixedcase;
const h4 = {
  n: mc.length,
  meanRhoDict: mean(mc.map((r) => r.rhoDict)),
  meanRhoByte: mean(mc.map((r) => r.rhoByte)),
  paired: tTest(mc.map((r) => Math.abs(r.rhoDict) - Math.abs(r.rhoByte)), 0),
  dictFirstWon: mc.filter((r) => r.choice === r.dictFirst).length,
  byteFirstWon: mc.filter((r) => r.choice === r.byteFirst).length,
  neither: mc.filter((r) => r.choice !== r.dictFirst && r.choice !== r.byteFirst).length,
  meanDictFirstShare: mean(mc.map((r) => r.probabilities[r.dictFirst] ?? 0)),
  meanByteFirstShare: mean(mc.map((r) => r.probabilities[r.byteFirst] ?? 0)),
};

/* ---------- H5: does it survive meaningless keys? ---------- */

const uu = byArm.uuid;
const h5 = {
  n: uu.length,
  wins: uu.filter((r) => r.dictFirstWon).length,
  meanShare: mean(uu.map((r) => r.dictFirstShare)),
  meanExcess: mean(uu.map((r) => r.excess)),
  ci95: tTest(uu.map((r) => r.excess), 0).ci95,
  superiority: binomTest(uu.filter((r) => r.dictFirstWon).length, uu.length, UNIFORM),
  tost: tost(uu.map((r) => r.excess), EQUIVALENCE_MARGIN),
  rho: tTest(uu.map((r) => r.rhoDict), 0),
};

/* ---------- H6: lexicographic or numeric ---------- */

const nu = byArm.numeric;
const h6 = {
  n: nu.length,
  meanRhoLexicographic: mean(nu.map((r) => r.rhoDict)),
  meanRhoNumeric: mean(nu.map((r) => r.rhoNumeric)),
  paired: tTest(nu.map((r) => Math.abs(r.rhoDict) - Math.abs(r.rhoNumeric)), 0),
  lexFirstWon: nu.filter((r) => r.choice === r.dictFirst).length,
  numFirstWon: nu.filter((r) => r.choice === r.numFirst).length,
  agreed: nu.filter((r) => r.dictFirst === r.numFirst).length,
};

/* ---------- multiplicity ---------- */

const family = [
  { key: "H1 alphabetical prior exists (words)", p: (h1.find((h) => h.arm === "words") as { p: number }).p },
  { key: "H2 gradient over rank (words)", p: (h2h3.find((h) => h.arm === "words") as { dict: { pTwoSided: number } }).dict.pTwoSided },
  { key: "H3 sort order beats writing order (words)", p: (h2h3.find((h) => h.arm === "words") as { paired: { pTwoSided: number } }).paired.pTwoSided },
  { key: "H4 dictionary order beats byte order", p: h4.paired.pTwoSided },
  { key: "H5 effect absent on UUID keys (TOST)", p: h5.tost.p },
  { key: "H6 lexicographic beats numeric", p: h6.paired.pTwoSided },
];
const adjusted = holm(family.map((f) => f.p));

/* ---------- write ---------- */

const L: string[] = [];
const w = (s = "") => L.push(s);

w("# Results");
w();
w(`Generated by \`npm run analyse\` from \`data/raw.ndjson\`. Model **${run.modelsAnswered.join(", ")}**, collected ${run.collectedAt.slice(0, 10)}.`);
w();
w(`${all.length} option sets, ${OPTIONS_PER_SET} options each, ${SETS_PER_ARM} per arm. Uniform share = **${UNIFORM.toFixed(4)}**.`);
w();

w("## H1 — does the alphabetically-first option win?");
w();
w("Exact one-sided binomial against a 1/16 null. Clopper-Pearson intervals.");
w();
w("| Arm | Won | Rate | 95% CI | p | | Mean share | Lift vs uniform | Written-first won |");
w("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const h of h1) {
  w(`| \`${h.arm}\` | ${h.wins}/${h.n} | ${pct(h.rate)} | [${pct(h.ci95[0])}, ${pct(h.ci95[1])}] | ${fmtP(h.p)} | ${stars(h.p)} | ${h.meanShare.toFixed(3)} | ${h.lift.toFixed(1)}x | ${h.insertionWins}/${h.n} |`);
}
w();

w("## H2 / H3 — a gradient, and which order drives it");
w();
w("Per-set Spearman rho between rank and probability, then a one-sample t-test of mean rho against 0. A negative rho means probability falls as rank rises.");
w();
w("| Arm | rho vs ALPHABETICAL rank | p | | rho vs INSERTION rank | p | | Paired \\|diff\\| | p |");
w("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const h of h2h3) {
  w(`| \`${h.arm}\` | ${h.dict.mean.toFixed(3)} [${h.dict.ci95[0].toFixed(2)}, ${h.dict.ci95[1].toFixed(2)}] | ${fmtP(h.dict.pTwoSided)} | ${stars(h.dict.pTwoSided)} | ${h.insert.mean.toFixed(3)} [${h.insert.ci95[0].toFixed(2)}, ${h.insert.ci95[1].toFixed(2)}] | ${fmtP(h.insert.pTwoSided)} | ${stars(h.insert.pTwoSided)} | ${h.paired.mean.toFixed(3)} | ${fmtP(h.paired.pTwoSided)} |`);
}
w();

w("## H4 — dictionary order or byte order");
w();
w("The `mixedcase` arm only. Byte order puts every capital and digit ahead of every lowercase letter; dictionary order folds case and skips the prefix. They disagree on the winner in all 30 sets.");
w();
w("| Quantity | Value |");
w("| --- | --- |");
w(`| mean rho vs dictionary rank | ${h4.meanRhoDict.toFixed(3)} |`);
w(`| mean rho vs byte rank | ${h4.meanRhoByte.toFixed(3)} |`);
w(`| paired \\|rho_dict\\| - \\|rho_byte\\| | ${h4.paired.mean.toFixed(3)} (95% CI [${h4.paired.ci95[0].toFixed(3)}, ${h4.paired.ci95[1].toFixed(3)}]) |`);
w(`| p | ${fmtP(h4.paired.pTwoSided)} ${stars(h4.paired.pTwoSided)} |`);
w(`| dictionary-first option won | ${h4.dictFirstWon}/${h4.n} |`);
w(`| byte-first option won | ${h4.byteFirstWon}/${h4.n} |`);
w(`| neither won | ${h4.neither}/${h4.n} |`);
w(`| mean share, dictionary-first | ${h4.meanDictFirstShare.toFixed(3)} |`);
w(`| mean share, byte-first | ${h4.meanByteFirstShare.toFixed(3)} |`);
w();

w("## H5 — does it survive keys with no meaning?");
w();
w(`The \`uuid\` arm. An absence claim, so the primary test is TOST equivalence at a +/-${EQUIVALENCE_MARGIN} margin on excess-over-uniform, not a non-significant p-value.`);
w();
w("| Quantity | Value |");
w("| --- | --- |");
w(`| dictionary-first won | ${h5.wins}/${h5.n} (chance would be ${(UNIFORM * h5.n).toFixed(1)}) |`);
w(`| mean share | ${h5.meanShare.toFixed(3)} vs uniform ${UNIFORM.toFixed(3)} |`);
w(`| mean excess over uniform | ${h5.meanExcess.toFixed(4)} (95% CI [${h5.ci95[0].toFixed(4)}, ${h5.ci95[1].toFixed(4)}]) |`);
w(`| superiority test (is it > chance?) | p = ${fmtP(h5.superiority)} ${stars(h5.superiority)} |`);
w(`| **TOST equivalence** (is it within +/-${EQUIVALENCE_MARGIN}?) | p = ${fmtP(h5.tost.p)} -> **${h5.tost.equivalent ? "EQUIVALENT" : "not shown equivalent"}** |`);
w(`| mean rho vs alphabetical rank | ${h5.rho.mean.toFixed(3)}, p = ${fmtP(h5.rho.pTwoSided)} ${stars(h5.rho.pTwoSided)} |`);
w();

w("## H6 — lexicographic or numeric, on numbered keys");
w();
w("The `numeric` arm: `item7` .. `item22`. Lexicographic order reads `item10` before `item7`; numeric order reads the trailing integer.");
w();
w("| Quantity | Value |");
w("| --- | --- |");
w(`| mean rho vs lexicographic rank | ${h6.meanRhoLexicographic.toFixed(3)} |`);
w(`| mean rho vs numeric rank | ${h6.meanRhoNumeric.toFixed(3)} |`);
w(`| paired \\|rho_lex\\| - \\|rho_num\\| | ${h6.paired.mean.toFixed(3)} (95% CI [${h6.paired.ci95[0].toFixed(3)}, ${h6.paired.ci95[1].toFixed(3)}]) |`);
w(`| p | ${fmtP(h6.paired.pTwoSided)} ${stars(h6.paired.pTwoSided)} |`);
w(`| lexicographic-first won | ${h6.lexFirstWon}/${h6.n} |`);
w(`| numeric-first won | ${h6.numFirstWon}/${h6.n} |`);
w(`| sets where the two agree | ${h6.agreed}/${h6.n} |`);
w();

w("## Multiplicity");
w();
w("Six pre-registered families, Holm-Bonferroni at a family-wise alpha of 0.05.");
w();
w("| Hypothesis | raw p | Holm-adjusted p | Survives |");
w("| --- | --- | --- | --- |");
family.forEach((f, i) => {
  const a = adjusted[i] as number;
  w(`| ${f.key} | ${fmtP(f.p)} | ${fmtP(a)} | ${a < 0.05 ? "yes" : "no"} |`);
});
w();

w("## Per-set data");
w();
w("Every set, so any row can be checked by hand against `data/raw.ndjson`.");
w();
for (const arm of ARMS) {
  w(`<details><summary><code>${arm}</code> — 30 sets</summary>`);
  w();
  w("| # | dictionary-first | won? | its share | written-first | rho(alpha) | rho(insertion) | winner |");
  w("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of byArm[arm]) {
    const t = (s: string) => (s.length > 14 ? s.slice(0, 12) + ".." : s);
    w(`| ${r.index} | \`${t(r.dictFirst)}\` | ${r.dictFirstWon ? "yes" : "no"} | ${r.dictFirstShare.toFixed(2)} | \`${t(r.insertFirst)}\` | ${r.rhoDict.toFixed(2)} | ${r.rhoInsert.toFixed(2)} | \`${t(r.choice)}\` |`);
  }
  w();
  w("</details>");
  w();
}

writeFileSync(join(process.cwd(), "RESULTS.md"), L.join("\n"));
writeFileSync(
  join(process.cwd(), "data", "analysis.json"),
  JSON.stringify(
    { run: { ...run, armSeeds: ARM_SEEDS }, uniform: UNIFORM, equivalenceMargin: EQUIVALENCE_MARGIN,
      h1, h2h3, h4, h5, h6,
      multiplicity: family.map((f, i) => ({ ...f, holm: adjusted[i] })),
      perSet: all.map((r) => ({
        arm: r.arm, index: r.index, dictFirst: r.dictFirst, byteFirst: r.byteFirst,
        numFirst: r.numFirst, insertFirst: r.insertFirst, choice: r.choice,
        dictFirstWon: r.dictFirstWon, dictFirstShare: round(r.dictFirstShare, 4),
        excess: round(r.excess, 4), confidence: r.confidence,
        rhoDict: round(r.rhoDict, 4), rhoByte: round(r.rhoByte, 4),
        rhoNumeric: round(r.rhoNumeric, 4), rhoInsert: round(r.rhoInsert, 4),
      })) },
    null, 2,
  ) + "\n",
);

console.log("wrote RESULTS.md and data/analysis.json\n");
for (const h of h1) {
  console.log(`${h.arm.padEnd(10)} ${String(h.wins).padStart(2)}/${h.n} won  mean share ${h.meanShare.toFixed(3)}  (uniform ${UNIFORM.toFixed(3)})  p=${fmtP(h.p)}`);
}
