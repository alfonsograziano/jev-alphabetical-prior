# Exploratory analysis

Everything in this file was decided **after** seeing the data. It is here to
generate the next hypothesis, not to confirm this one. The pre-registered
results are in [RESULTS.md](RESULTS.md).

## E1 — the effect tracks the absolute first character, not rank in the list

Every set has a dictionary-first option. If a **sort** were the mechanism, all
of them should get the same boost, whatever letter they happen to start with.
They do not.

| First letter of the dictionary-first option | Sets | Mean lift vs uniform |
| --- | --- | --- |
| `a` | 36 | 2.04x |
| `b` | 42 | 1.24x |
| `c` | 19 | 1.06x |
| `d` | 10 | 0.90x |
| `e` | 4 | 0.90x |
| `f` | 5 | 0.93x |
| `g` | 1 | 0.80x |
| `h` | 1 | 0.96x |
| `i` | 1 | 1.76x |
| `k` | 1 | 1.04x |

Dictionary-first starts with `a`: **2.04x** (n=36).
Dictionary-first starts with anything later: **1.12x** (n=84).
Difference 0.92, Welch t=4.73, p=2.3e-5.

And the second group is **indistinguishable from no effect at all**:
1.12x, 95% CI [0.98, 1.25], p=0.0853 against a null of 1.0x.

A sort cannot produce that. A preference for the literal letter `a` can.

## E2 — the same pattern in digits: `0` and `1`, not "low"

UUID options, by leading hex character (uniform = 1.00x):

| Leading char | Options | Mean lift |
| --- | --- | --- |
| `0` | 39 | 2.39x |
| `1` | 41 | 1.22x |
| `2` | 18 | 0.93x |
| `3` | 26 | 0.94x |
| `4` | 20 | 1.14x |
| `5` | 36 | 0.97x |
| `6` | 23 | 0.87x |
| `7` | 34 | 0.75x |
| `8` | 30 | 0.74x |
| `9` | 31 | 0.86x |
| `a` | 32 | 0.98x |
| `b` | 34 | 0.72x |
| `c` | 35 | 0.82x |
| `d` | 33 | 0.73x |
| `e` | 24 | 0.69x |
| `f` | 24 | 0.77x |

The `mixedcase` arm, by name style (uniform = 1.00x):

| Style | Options | Mean lift | 95% CI | p vs 1.0 |
| --- | --- | --- | --- | --- |
| Capitalised | 120 | 1.41x | [1.25, 1.57] | 1.3e-6 |
| underscore | 120 | 0.88x | [0.76, 1.00] | 0.0444 |
| digit-led | 120 | 0.63x | [0.52, 0.74] | 6.5e-10 |
| lowercase | 120 | 1.08x | [0.95, 1.22] | 0.2308 |

Byte order puts digit-led names at the very front of the list. They get the
**least** mass of any style. That is the cleanest single refutation of a
server-side sort in the whole experiment.

Within the digit-led names only:

| Leading digit | Options | Mean lift |
| --- | --- | --- |
| `1` | 14 | 1.79x |
| `2` | 12 | 0.51x |
| `3` | 12 | 0.53x |
| `4` | 12 | 0.53x |
| `5` | 15 | 0.44x |
| `6` | 11 | 0.54x |
| `7` | 16 | 0.45x |
| `8` | 13 | 0.43x |
| `9` | 15 | 0.43x |

`1` is favoured and `2` through `9` are flat. Again: a specific token, not a gradient.

## E3 — numbered options: a comparison and a token, stacked

Offset from the smallest number present in the set (uniform = 1.00x):

| Offset | Mean lift |
| --- | --- |
| +0 | 7.33x |
| +1 | 1.61x |
| +2 | 1.10x |
| +3 | 0.83x |
| +4 | 0.59x |
| +5 | 0.43x |
| +6 | 0.44x |
| +7 | 0.52x |
| +8 | 0.55x |
| +9 | 0.54x |
| +10 | 0.30x |
| +11 | 0.41x |
| +12 | 0.38x |
| +13 | 0.31x |
| +14 | 0.27x |
| +15 | 0.39x |

The runs do not all start at 1 -- each set begins at 1, 2 or 3 -- and that
splits the effect into two parts that stack:

| Run starts at | Sets | Lift on the smallest option | 95% CI |
| --- | --- | --- | --- |
| 1 | 10 | **13.3x** | [12.9, 13.7] |
| 2 | 10 | **4.4x** | [3.4, 5.3] |
| 3 | 10 | **4.3x** | [3.5, 5.2] |

Starting at 2 and starting at 3 are indistinguishable (4.4x and 4.3x),
so this is not a preference for small numbers in general. It is two things at once:

1. **A comparison.** The smallest number present wins even when it is 2 or 3 — 4.4x.
2. **A token.** The literal `1` is worth roughly 3.1x again on top of that
   (13.3x vs 4.4x, Welch t=27.1, p=<1e-12).

So an `item1 … item12` list is not a mild naming preference. `item1` takes
**83%** of the distribution on any question where the evidence is thin.

## E4 — why this run disagreed with the earlier suite

The earlier suite reported 0.787 for the alphabetically-first option at k=8.
The pre-registered arms here give 1.6x on ordinary words. Two things differed:
option count, and the fact that the old sets used names like `aaa`/`bbb` and
`tag_a`/`tag_b`, which differ **only** by one letter of the alphabet.

The follow-up crosses both factors, 30 sets per cell.

| | k=8 | k=16 |
| --- | --- | --- |
| **letters** (`aaa`, `bbb`) | 2.55x [1.71, 3.39] | 7.61x [5.86, 9.37] |
| **words** (`amber`, `basket`) | 1.17x [0.97, 1.37] | 1.58x [1.15, 2.02] |

Name style: 5.08x vs 1.38x, diff 3.70, p=3.0e-8.
Option count: 4.60x vs 1.86x, diff 2.74, p=4.3e-5.

Both matter and they compound, but style is the bigger term. The earlier
suite was not wrong — it happened to pick the option names that maximise the
effect, and then generalised from them.

## E5 — direct replication of the three original sets

The same option names the earlier suite used, sent again.

| Set | Alphabetically-first | Share now | Share reported then | Winner now |
| --- | --- | --- | --- | --- |
| `shuffledLetters` | `aaa` | 0.85 | 0.83 | `aaa` |
| `shuffledWords` | `apple` | 0.73 | 0.73 | `apple` |
| `shuffledTags` | `tag_a` | 0.82 | 0.80 | `tag_a` |

All three reproduce inside one 0.01 grid step or two. The original numbers
were correct measurements of those particular option sets.

## E6 — one mechanism behind all of it

Collecting the pieces:

| Observation | Favoured token |
| --- | --- |
| words | `a`-initial only (2.04x vs 1.12x for later letters) |
| letter-triples | `aaa` |
| tags | `tag_a` |
| UUIDs | leading `0` (2.39x), then `1` |
| digit-led names | `1` (1.79x), rest flat |
| numbered options | literal `1` (13.3x), then the smallest present (4.4x) |

The model is not sorting the option map. It is reaching for whatever token
**looks like the beginning of a familiar sequence** — the letter `a`, the
digits `0` and `1`, the lowest number in a run. On a list with no such token,
there is no measurable prior at all.

That reframes the practical advice. "Do not let your option names be
alphabetically ordered" is the wrong rule. The rule is: **do not give one
option a name that starts with `a`, `0` or `1`, or the lowest number in a
run, unless you mean to favour it.**

It also predicts something the data here cannot check: the same should hold
for other canonical firsts — `first`, `A`, `alpha`, `one`, Monday, January.
That is the next experiment, not a result of this one.
