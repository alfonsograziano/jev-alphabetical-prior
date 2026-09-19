/**
 * Follow-up experiment. NOT pre-registered -- it exists because the main run
 * produced a discrepancy that needed explaining.
 *
 * The earlier exploratory suite measured a 0.787 share for the
 * alphabetically-first option at k=8. The main run here measures 0.102 at k=16
 * on ordinary words: a lift of 1.6x where the old number implies 6.3x. Two
 * things changed at once, so neither can be blamed yet.
 *
 *   - k went from 8 to 16.
 *   - The old option sets were `aaa/bbb/ccc` and `tag_a/tag_b/tag_c`, names
 *     that differ ONLY by one letter of the alphabet. The new ones are ordinary
 *     nouns, where alphabetical position is incidental to the word.
 *
 * This run crosses those two factors, plus a direct replication of the three
 * original sets. If name style is what matters, `letters16` looks like the old
 * result and `words8` looks like the new one.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ask, defaultModel, usage } from "../src/client.ts";
import { NO_SIGNAL, PICK } from "../src/design.ts";
import { bareOptions, choice } from "../src/questions.ts";
import { mulberry32, sample, shuffle } from "../src/rng.ts";

const SETS = 30;
const SEED = 909_090;

const NOUNS = `anchor amber almond bridge basket beacon candle cactus canyon dagger damson desert
ember engine emblem falcon fabric ferry garden gravel glacier harbour hammer hollow island ingot
ivory jacket jungle jasper kettle kernel kitten ladder lantern lagoon mantle marble meadow nectar
needle nutmeg orchid otter onyx pebble pigeon prairie quarry quiver quince ribbon rocket rubble
saddle silver summit tandem timber tunnel umbrella urchin utensil velvet vessel violet walnut
willow wagon yarrow yonder yeast zenith zephyr zircon`.split(/\s+/).filter(Boolean);

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

/** The three option sets the original suite used, verbatim. */
const ORIGINAL: Record<string, string[]> = {
  original_shuffledWords: ["mango", "cherry", "quince", "apple", "walnut", "fig", "sorrel", "damson"],
  original_shuffledLetters: ["ttt", "bbb", "www", "aaa", "mmm", "ddd", "qqq", "fff"],
  original_shuffledTags: ["tag_h", "tag_c", "tag_g", "tag_a", "tag_e", "tag_b", "tag_f", "tag_d"],
};

type Condition = "letters8" | "words8" | "letters16" | "words16";

const CONDITIONS: Record<Condition, { k: number; kind: "letters" | "words" }> = {
  letters8:  { k: 8,  kind: "letters" },
  words8:    { k: 8,  kind: "words" },
  letters16: { k: 16, kind: "letters" },
  words16:   { k: 16, kind: "words" },
};

interface Set_ { condition: string; index: number; k: number; written: string[] }

function build(): Set_[] {
  const rand = mulberry32(SEED);
  const out: Set_[] = [];

  for (const [condition, { k, kind }] of Object.entries(CONDITIONS) as [Condition, { k: number; kind: string }][]) {
    for (let index = 0; index < SETS; index++) {
      // A letter tripled -- `aaa`, `bbb` -- is a name whose ONLY content is its
      // position in the alphabet. A noun is a name where that position is
      // incidental. That contrast is the whole point of this run.
      const names = kind === "letters"
        ? sample(ALPHABET, k, rand).map((c) => c.repeat(3))
        : sample(NOUNS, k, rand);
      out.push({ condition, index, k, written: shuffle(names, rand) });
    }
  }

  Object.entries(ORIGINAL).forEach(([condition, written], index) =>
    out.push({ condition, index, k: written.length, written }),
  );

  return out;
}

async function main(): Promise<void> {
  const sets = shuffle(build(), mulberry32(SEED + 1));
  const batches = Array.from({ length: Math.ceil(sets.length / 10) }, (_, i) => sets.slice(i * 10, i * 10 + 10));
  console.log(`${sets.length} sets, ${batches.length} requests`);

  const rows: string[] = [];
  for (const batch of batches) {
    const questions = Object.fromEntries(batch.map((s, i) => [`q${i}`, choice(PICK, bareOptions(s.written))]));
    const res = await ask(NO_SIGNAL, questions);
    batch.forEach((set, i) => {
      const a = res.answers[`q${i}`];
      if (!a) throw new Error(`no answer for q${i}`);
      rows.push(JSON.stringify({ ...set, choice: a.choice, confidence: a.confidence, probabilities: a.probabilities, model: res.model }));
    });
    process.stdout.write(`\r  ${rows.length}/${sets.length}`);
  }

  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(join(process.cwd(), "data", "followup.ndjson"), rows.join("\n") + "\n");
  console.log(`\n\nwrote data/followup.ndjson (${rows.length} rows)`);
  console.log(`model ${[...usage.models].join(", ")} | requested ${defaultModel()} | ${usage.requests} live requests, ${usage.inputTokens} input tokens`);
}

await main();
