# Does the option name that sorts first win?

A powered experiment on one behaviour of [TypeSafe's](https://docs.typesafe.ai) Jev
model: when a `choice` question has no evidence to go on, what decides which
option wins?

An earlier exploratory suite found that the mass did not go to the option
written first. It went to the option whose **name sorted first alphabetically** —
0.80 against a uniform 0.125. That result rested on 3 option sets. This repo
runs it properly: 273 option sets, a pre-registered analysis plan, and exact
tests.

📊 **[Read the technical review →](https://alfonsograziano.github.io/jev-alphabetical-prior/)**

**The short version.** The effect is real, it is not alphabetical, and the
practical advice that follows from it is different from what the original
finding implied.

---

## The experiment

Every question is the same shape. The state says there is nothing to go on:

```json
{
  "state": "There is no information here that favours any option.",
  "questions": {
    "q0": {
      "type": "choice",
      "instructions": "Pick one of the options. Nothing in the state favours any of them.",
      "criteria": { "timber": null, "quiver": null, "kettle": null, "...": null }
    }
  }
}
```

With sixteen interchangeable options and no information, a well-behaved model
returns 0.0625 for each. Anything else is a prior, and the only thing left that
could carry one is the option **names**.

### The control the whole thing rests on

Alphabetical rank and writing order are trivially confounded — if you write
options in alphabetical order you cannot tell which one the model followed. So
in every set the insertion order is shuffled independently of the sort order
from a fixed seed. Across each arm the correlation between the two is ~0
(all |rho| < 0.04, all p > 0.39), which is what makes the two separable.

### Why 30 sets, and why 16 options

Jev is **exactly deterministic**: identical requests return bit-identical
numbers. Repeating a request therefore adds no information. The sampling unit is
a *distinct option set*, and n counts sets, not API calls.

n=30 comes from an exact binomial power calculation at a 1/16 null: >99% power
against a true rate of 0.50, 80% power down to 0.23, enough headroom for Holm
correction across six hypotheses, and an equivalence margin of +/-0.10 for the
one hypothesis that claims an absence. k=16 rather than 8 is for the gradient
test: a per-set Spearman on 8 options needs |rho| >= 0.685, on 16 options only
0.497.

### The five arms

150 questions, 5 arms x 30 sets x 16 options.

| Arm | Option names | Question it answers |
| --- | --- | --- |
| `words` | common English nouns | Is there an effect at all? |
| `nonsense` | pronounceable non-words (`fepif`, `mupuz`) | Does it need real words? |
| `uuid` | random UUIDs | Does it survive names with no meaning? |
| `mixedcase` | nouns, some capitalised, some prefixed `_` or a digit | Byte order, or dictionary order? |
| `numeric` | `item7` .. `item22` | Does `item10` outrank `item7`? |

A follow-up run adds 123 more sets to explain a discrepancy the first run threw
up. See [EXPLORATORY.md](EXPLORATORY.md).

## The hypotheses

Stated in full, before any data, in [PREREGISTRATION.md](PREREGISTRATION.md).

- **H1** The dictionary-first option wins more often than 1/k.
- **H2** It is a gradient over rank, not a bonus for one slot.
- **H3** It is the sort order, not the writing order.
- **H4** It is the model reading the names, not a server-side `[].sort()`.
- **H5** It disappears on UUIDs, which have no word to read.
- **H6** Numbered keys sort lexicographically, so `item10` beats `item7`.

## What happened

| | Verdict |
| --- | --- |
| **H1** exists | **Holds, but small.** 1.6x on words, 1.2x on nonsense, 1.0x on mixed case. Not the 6.3x the original implies. |
| **H2** gradient | **Holds** (rho = -0.176, p=5e-4) — but see H3. |
| **H3** sort order, not writing order | **Fails.** Insertion rank predicts the mass *better* than alphabetical rank (-0.290 vs -0.176). |
| **H4** dictionary, not byte | **Not established.** Both orderings fit badly; digit-led names get the *least* mass despite sorting first. |
| **H5** absent on UUIDs | **Fails, backwards.** UUIDs show the *strongest* ordering effect in the experiment (rho = -0.555, 17/30 wins, p<1e-12). |
| **H6** lexicographic | **Fails.** Numeric order wins decisively: rho = -0.682 against +0.106, p<1e-12. `item7` beats `item10`. |

Full tables, intervals and per-set data: [RESULTS.md](RESULTS.md).

### The finding

Two hypotheses failed in the same direction, and that turned out to be the
result rather than a disappointment.

**The effect tracks the absolute first character, not rank in the list.** Every
set has a dictionary-first option. If a sort were the mechanism they should all
get the same boost. They do not:

| Dictionary-first option starts with | Sets | Mean lift vs uniform |
| --- | --- | --- |
| `a` | 36 | **2.04x** |
| anything later | 54 | 1.12x — 95% CI [0.98, 1.26], p=0.085 **against no effect at all** |

The same shape appears everywhere once you look for it:

| Where | Favoured token | Lift |
| --- | --- | --- |
| words | `a`-initial only | 2.04x |
| letter triples | `aaa` | 7.6x |
| UUIDs | leading `0` | 2.39x |
| digit-prefixed names | `1`, with `2`-`9` flat | 1.79x |
| numbered options | literal `1` | **13.3x** |
| numbered options starting at 2 or 3 | the smallest present | 4.3x |

Jev is not sorting your option map. It reaches for whatever token **looks like
the beginning of a familiar sequence** — the letter `a`, the digits `0` and `1`,
the lowest number in a run. Give it a list with no such token and there is no
measurable prior left.

That also explains why the `mixedcase` arm looked backwards. Byte order puts
digit-led names at the very front, and digit-led names get the *least* mass of
any style (0.63x, p<1e-6) while capitalised names get the most (1.41x). No sort
produces that.

### Why this disagreed with the earlier suite

Not because the old numbers were wrong. Re-sending the three original option
sets reproduces them inside a grid step or two (0.85 / 0.73 / 0.82 against 0.83 /
0.73 / 0.80). They were correct measurements of those particular sets.

The old sets used names like `aaa`/`bbb` and `tag_a`/`tag_b`, which differ
*only* by one letter of the alphabet. Crossing name style against option count,
30 sets per cell:

| | k=8 | k=16 |
| --- | --- | --- |
| **letters** (`aaa`, `bbb`) | 2.55x | **7.61x** |
| **words** (`amber`, `basket`) | 1.17x | 1.58x |

Name style p=3.0e-8, option count p=4.3e-5. Both matter, style more. The earlier
suite picked, by chance, the option names that maximise the effect, and
generalised from three of them.

### What to do about it

The rule the original finding suggests — "watch out for alphabetically ordered
option names" — is the wrong rule. Alphabetical position past `a` buys nothing.

The rule that fits the data:

> Do not give one option a name beginning with `a`, `0` or `1`, or the lowest
> number in a run, unless you mean to favour it.

The numbered case is the one to take seriously. Two effects stack there: the
smallest number present wins on comparison (4.3x even when the run starts at 2
or 3), and the literal token `1` is worth roughly 3x again on top. If your
options are `item1 … item16`, `item1` takes **83% of the distribution** on any
question where the evidence is thin.

## Running it

```bash
npm install
cp .env.example .env   # point TYPESAFE_API_KEY_FILE at your key
npm run collect        # 150 questions, 15 requests -> data/raw.ndjson
npm run followup       # 123 more -> data/followup.ndjson
npm run analyse        # -> RESULTS.md
npm run explore        # -> EXPLORATORY.md
```

Analysis needs no API key: every published number re-derives from the saved
NDJSON. Collection and analysis are separate programs so that a change to the
analysis can never quietly change the data.

The full run is 28 requests and about 56k input tokens.

## Layout

```
PREREGISTRATION.md   hypotheses and analysis plan, committed before any data
RESULTS.md           the pre-registered tests
EXPLORATORY.md       post-hoc analysis, labelled as such
docs/index.html      the technical review, served by GitHub Pages
data/
  raw.ndjson         150 sets: names, winner, full distribution
  followup.ndjson    123 sets: the 2x2 and the replication
  analysis.json      every computed statistic
  run.json           model version, seeds, token counts
src/
  design.ts          the option sets and the four candidate orderings
  stats.ts           exact binomial, Clopper-Pearson, t, TOST, Spearman, Holm
  rng.ts             seeded PRNG, so the shuffles are reproducible
  client.ts          HTTP, retries, disk cache
scripts/
  collect.ts         runs the pre-registered experiment
  followup.ts        runs the 2x2 and the replication
  analyse.ts         raw.ndjson -> RESULTS.md
  explore.ts         both files -> EXPLORATORY.md
```

## Caveats

- One model version, `jev-1.13.0`, one day. The effect sizes are properties of
  that snapshot.
- Answers are quantised to a 0.01 grid, and an answer can move by about one grid
  step depending on which other questions share its request. Batches were drawn
  from a shuffle of all sets so that envelope composition is decorrelated from
  arm, but it is not zero.
- Everything after "The finding" is exploratory. It was decided after seeing the
  data, and the `a`/`0`/`1` account needs its own pre-registered run before it
  should be called established.
- Only one state string was tested. Whether the prior shrinks when the state
  carries real evidence is not measured here, and it is the question that
  decides how much any of this matters in production.
