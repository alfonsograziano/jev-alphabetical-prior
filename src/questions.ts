import type { ChoiceQuestion, Entry } from "./types.ts";

/** Pick one option from a set. `criteria` maps option name to its description. */
export function choice(instructions: Entry, criteria: Record<string, Entry>): ChoiceQuestion {
  return { type: "choice", instructions, criteria };
}

/**
 * Turn a list of option names into the `{ name: null }` criteria map.
 *
 * Insertion order is the order of `names`, and JSON.stringify preserves it, so
 * this is the knob the design uses to decorrelate writing order from sort order.
 */
export function bareOptions(names: readonly string[]): Record<string, Entry> {
  return Object.fromEntries(names.map((n) => [n, null]));
}
