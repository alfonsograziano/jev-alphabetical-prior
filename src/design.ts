import { mulberry32, sample, shuffle } from "./rng.ts";

/**
 * The option sets the experiment runs on.
 *
 * Everything here is a pure function of ARM_SEEDS, so two people running this
 * repo send byte-identical requests and can compare numbers directly. That
 * matters more than usual because Jev is exactly deterministic: there is no
 * run-to-run noise to average away, so a difference in results can only come
 * from a difference in inputs.
 *
 * The one control that the whole experiment rests on: within every set, the
 * order the options are WRITTEN IN is shuffled independently of the order they
 * SORT IN. Without that, alphabetical rank and insertion rank are confounded and
 * no arm can tell you which one the model is following.
 */

export const OPTIONS_PER_SET = 16;
export const SETS_PER_ARM = 30;

export const NO_SIGNAL = "There is no information here that favours any option.";
export const PICK = "Pick one of the options. Nothing in the state favours any of them.";

export type ArmName = "words" | "nonsense" | "uuid" | "mixedcase" | "numeric";

/** One seed per arm, fixed. Changing these changes the experiment. */
export const ARM_SEEDS: Record<ArmName, number> = {
  words: 1_000_001,
  nonsense: 2_000_002,
  uuid: 3_000_003,
  mixedcase: 4_000_004,
  numeric: 5_000_005,
};

export interface OptionSet {
  arm: ArmName;
  index: number;
  /** Insertion order: exactly the order these go into the JSON criteria map. */
  written: string[];
}

/* ---------- vocabularies ---------- */

const NOUNS = `anchor amber almond bridge basket beacon candle cactus canyon dagger damson desert
ember engine emblem falcon fabric ferry garden gravel glacier harbour hammer hollow island ingot
ivory jacket jungle jasper kettle kernel kitten ladder lantern lagoon mantle marble meadow nectar
needle nutmeg orchid otter onyx pebble pigeon prairie quarry quiver quince ribbon rocket rubble
saddle silver summit tandem timber tunnel umbrella urchin utensil velvet vessel violet walnut
willow wagon yarrow yonder yeast zenith zephyr zircon`.split(/\s+/).filter(Boolean);

const CONSONANTS = "bdfgklmnprstvz".split("");
const VOWELS = "aeiou".split("");

/** A pronounceable nonsense word, so familiarity cannot explain a preference. */
function nonsenseWord(rand: () => number): string {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)] as T;
  return pick(CONSONANTS) + pick(VOWELS) + pick(CONSONANTS) + pick(VOWELS) + pick(CONSONANTS);
}

function uuidLike(rand: () => number): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(rand() * 16)]).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

const NUMERIC_PREFIXES = ["item", "row", "doc", "node", "step", "case", "rec", "slot", "unit", "page"];

/* ---------- arms ---------- */

/**
 * Build every set for one arm.
 *
 * Each arm varies one property of the KEY STRINGS while holding the rest of the
 * request fixed, so whatever moves the distribution has to be that property.
 */
export function buildArm(arm: ArmName): OptionSet[] {
  const rand = mulberry32(ARM_SEEDS[arm]);
  const sets: OptionSet[] = [];

  for (let index = 0; index < SETS_PER_ARM; index++) {
    let names: string[];

    switch (arm) {
      case "words":
        names = sample(NOUNS, OPTIONS_PER_SET, rand);
        break;

      case "nonsense": {
        const seen = new Set<string>();
        while (seen.size < OPTIONS_PER_SET) seen.add(nonsenseWord(rand));
        names = [...seen];
        break;
      }

      case "uuid": {
        const seen = new Set<string>();
        while (seen.size < OPTIONS_PER_SET) seen.add(uuidLike(rand));
        names = [...seen];
        break;
      }

      case "mixedcase": {
        // Byte order puts every capital and every punctuation mark ahead of
        // every lowercase letter; a dictionary collation folds case and skips
        // the punctuation. Mixing all three makes the two rules predict very
        // different rankings, which is what makes the arm diagnostic.
        const base = sample(NOUNS, OPTIONS_PER_SET, rand);
        names = base.map((w, i) => {
          const style = i % 4;
          if (style === 0) return (w[0] as string).toUpperCase() + w.slice(1);
          if (style === 1) return "_" + w;
          if (style === 2) return String(Math.floor(rand() * 9) + 1) + w;
          return w;
        });
        break;
      }

      case "numeric": {
        // item1 .. item16. Lexicographic order is 1, 10, 11 ... 2, 3; numeric
        // order is 1, 2, 3 ... The two rank the same strings very differently.
        const prefix = NUMERIC_PREFIXES[index % NUMERIC_PREFIXES.length] as string;
        const offset = Math.floor(rand() * 3); // 0, 1 or 2, so the run does not always start at 1
        names = Array.from({ length: OPTIONS_PER_SET }, (_, i) => `${prefix}${i + 1 + offset}`);
        break;
      }
    }

    // THE CONTROL. Insertion order is drawn independently of sort order, so the
    // two are decorrelated across the arm and the analysis can separate them.
    sets.push({ arm, index, written: shuffle(names, rand) });
  }

  return sets;
}

export const buildAllArms = (): OptionSet[] =>
  (Object.keys(ARM_SEEDS) as ArmName[]).flatMap(buildArm);

/* ---------- the four orderings under test ---------- */

/** Byte-wise: `!` < digits < capitals < `_` < lowercase. What `[].sort()` does. */
export const byByte = (names: readonly string[]): string[] =>
  [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** Dictionary: case folded, punctuation and accents treated as secondary. */
export const byDictionary = (names: readonly string[]): string[] =>
  [...names].sort((a, b) => a.localeCompare(b, "en"));

/** Numeric: the trailing integer, read as a number. Falls back to dictionary. */
export const byNumeric = (names: readonly string[]): string[] =>
  [...names].sort((a, b) => {
    const na = Number(a.match(/\d+$/)?.[0] ?? Number.NaN);
    const nb = Number(b.match(/\d+$/)?.[0] ?? Number.NaN);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b, "en");
  });

/** Map each name to its 0-based rank under one ordering. */
export function ranksOf(order: readonly string[]): Record<string, number> {
  return Object.fromEntries(order.map((name, i) => [name, i]));
}
