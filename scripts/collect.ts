/**
 * Run the experiment and save every answer to data/raw.ndjson.
 *
 * Collection and analysis are separate programs on purpose. The raw file is the
 * artefact -- anyone can re-derive every number in RESULTS.md from it without an
 * API key, and a change to the analysis can never quietly change the data.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ask, defaultModel, usage } from "../src/client.ts";
import { NO_SIGNAL, PICK, buildAllArms, OPTIONS_PER_SET, SETS_PER_ARM, ARM_SEEDS } from "../src/design.ts";
import { bareOptions, choice } from "../src/questions.ts";
import { mulberry32, shuffle } from "../src/rng.ts";

/**
 * Questions per request.
 *
 * Questions batch for free and are evaluated in isolation, so this is purely
 * about round trips -- except that an answer can shift by about one 0.01 grid
 * step depending on what shares its envelope. The batches are drawn from a
 * shuffle of all 150 sets rather than arm by arm, so envelope composition is
 * decorrelated from arm and cannot masquerade as an arm effect.
 */
const BATCH_SIZE = 10;
const BATCH_SEED = 777_777;

const OUT = join(process.cwd(), "data");

async function main(): Promise<void> {
  const sets = shuffle(buildAllArms(), mulberry32(BATCH_SEED));
  const batches = Array.from({ length: Math.ceil(sets.length / BATCH_SIZE) }, (_, i) =>
    sets.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE),
  );

  console.log(`${sets.length} option sets, ${OPTIONS_PER_SET} options each, ${batches.length} requests`);

  const rows: string[] = [];
  let done = 0;

  for (const [batchIndex, batch] of batches.entries()) {
    // Question keys are deliberately opaque: `q0`..`q9` carry no information
    // about the arm, so nothing in the key map can leak the condition.
    const questions = Object.fromEntries(
      batch.map((set, i) => [`q${i}`, choice(PICK, bareOptions(set.written))]),
    );

    const res = await ask(NO_SIGNAL, questions);

    batch.forEach((set, i) => {
      const answer = res.answers[`q${i}`];
      if (!answer) throw new Error(`no answer for q${i} in batch ${batchIndex}`);
      rows.push(
        JSON.stringify({
          arm: set.arm,
          index: set.index,
          batch: batchIndex,
          slotInBatch: i,
          written: set.written,
          choice: answer.choice,
          confidence: answer.confidence,
          probabilities: answer.probabilities,
          model: res.model,
        }),
      );
    });

    done += batch.length;
    process.stdout.write(`\r  ${done}/${sets.length} sets collected`);
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "raw.ndjson"), rows.join("\n") + "\n");
  writeFileSync(
    join(OUT, "run.json"),
    JSON.stringify(
      {
        collectedAt: new Date().toISOString(),
        modelRequested: defaultModel(),
        modelsAnswered: [...usage.models],
        optionsPerSet: OPTIONS_PER_SET,
        setsPerArm: SETS_PER_ARM,
        armSeeds: ARM_SEEDS,
        batchSize: BATCH_SIZE,
        batchSeed: BATCH_SEED,
        state: NO_SIGNAL,
        instructions: PICK,
        liveRequests: usage.requests,
        cachedRequests: usage.cached,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`\n\nwrote data/raw.ndjson (${rows.length} rows)`);
  console.log(`model: ${[...usage.models].join(", ")}`);
  console.log(`${usage.requests} live requests, ${usage.cached} cached, ${usage.inputTokens} input tokens`);
}

await main();
