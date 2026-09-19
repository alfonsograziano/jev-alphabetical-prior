# Pre-registration

Written and committed **before** `data/raw.ndjson` existed. The point of putting
it in its own file is that git can prove the order.

## The gap

TypeSafe's Jev is a "System One" model: you send it a `state` and a map of typed
questions and it returns structured answers. For a `choice` question you supply
an option map and get back a probability distribution over the option names plus
a winner.

An earlier exploratory suite noticed something odd while testing for a
first-position bias. On a Choice where **nothing in the state favours any
option**, the probability mass did not go to the option written first. It went
to the option whose **name sorted first alphabetically** — 0.80 of the mass
against a uniform 0.125.

If that is real it is not a curiosity. Every Choice whose options are genuinely
close is then decided partly by whatever the developer happened to name things.
A router picking between `escalate`, `refund` and `acknowledge` has a thumb on
`acknowledge` that nobody put there.

The earlier suite could not settle it. Its evidence was 3 option sets for the
main effect, 6 pairs for the sort rule and 4 sets for the UUID control. Exact
intervals on those counts:

| Claim | Evidence | 95% CI (Clopper-Pearson) | Chance | Status |
| --- | --- | --- | --- | --- |
| Alpha-first wins (k=8) | 3/3 | [0.29, 1.00] | 0.125 | above chance |
| Survives meaningless keys (k=4) | 0/4 | [0.00, 0.60] | 0.25 | **straddles chance** |
| Byte order beats dictionary (k=2) | 1/6 | [0.00, 0.64] | 0.5 | **straddles chance** |

Two of the three claims had no statistical result at all. This repo is the
powered replacement.

## Hypotheses

**H1 — the alphabetical prior exists.** On an evidence-free Choice, the option
whose name sorts first in dictionary order wins more often than 1/k.

**H2 — it is a gradient, not a first-slot bonus.** Probability falls
monotonically with alphabetical rank across the whole option list, not just at
the top. Measured as Spearman rho between rank and probability; H2 predicts rho
is negative.

**H3 — it is the sort order, not the writing order.** Insertion rank explains
little or nothing once alphabetical rank is accounted for. This is the
confound that matters most, so insertion order is randomised independently of
alphabetical order in every set.

**H4 — it is the model reading the names, not a server-side sort.** A
`[].sort()` on the server would produce byte order: every capital and every
digit ahead of every lowercase letter. A model reading names as words produces
dictionary order. The `mixedcase` arm makes the two predict different rankings
and asks which one the mass follows.

**H5 — it does not survive semantically empty keys.** On UUID options there is
no word to read, so H4 predicts the effect disappears. This is an **absence**
claim, so it is tested by equivalence (TOST), not by a non-significant p-value.

**H6 — numbered keys sort lexicographically, not numerically.** `item10` outranks
`item2`. This is the practically nastiest version of the effect because numbered
options are the commonest naming scheme there is.

## Design

150 Choice questions: **5 arms x 30 option sets x 16 options**.

| Arm | Option names | Which hypothesis it serves |
| --- | --- | --- |
| `words` | 16 common English nouns | H1, H2, H3 |
| `nonsense` | 16 pronounceable non-words (`fepif`, `mupuz`) | H1 without word familiarity |
| `uuid` | 16 random UUIDs | H5 |
| `mixedcase` | nouns, some capitalised, some prefixed `_` or a digit | H4 |
| `numeric` | `item7` .. `item22` | H6 |

Every set's **insertion order is shuffled independently of its sort order** from
a fixed seed. Across each arm the correlation between the two is ~0, which is
what lets H3 be tested at all.

The state is the same string for all 150 questions
(`"There is no information here that favours any option."`) and so is the
instruction. Only the option names vary.

### Why 30, and why 16

Jev is **exactly deterministic** — identical requests return bit-identical
numbers. Repeating a request therefore yields no information. The sampling unit
is a *distinct option set*, and n is the number of sets, not the number of API
calls.

n = 30 comes from an exact binomial power calculation. At k=16 the null win rate
is 0.0625, so 30 sets give >99% power against a true rate of 0.50 and still
detect a rate as low as 0.23 at 80% power. It also clears Holm correction across
the six hypotheses, and gives the TOST in H5 an equivalence margin of +/-0.10
at 80% power.

k = 16 rather than 8 is for H2. A per-set Spearman on 8 options needs
|rho| >= 0.685 to reach p<0.05; the earlier suite's observed values were -0.64,
-0.70 and -0.73, straddling that line. At 16 options the bar drops to 0.497.

## Analysis plan

Fixed before the data existed.

1. **H1**: exact one-sided binomial test, successes = sets where the
   dictionary-first option won, n = 30, p0 = 1/16. Per arm.
2. **H2**: per-set Spearman rho between dictionary rank and probability, then a
   one-sample two-sided t-test of mean rho against 0.
3. **H3**: the same rho computed against insertion rank, tested the same way.
   H3 holds if the dictionary effect is large and the insertion effect is not.
4. **H4**: paired t-test on (|rho_dictionary| - |rho_byte|) within `mixedcase`,
   plus a straight count of which ordering's first option won.
5. **H5**: TOST on the `uuid` arm's excess-over-uniform for the
   dictionary-first option, equivalence margin +/-0.10.
6. **H6**: paired t-test on (|rho_lexicographic| - |rho_numeric|) within
   `numeric`.

**Multiplicity**: six families, Holm-Bonferroni at alpha = 0.05 family-wise.
Both raw and adjusted p-values are reported.

**Stopping rule**: 150 questions, collected once. No peeking, no top-up.

## What would falsify this

H1 fails if the dictionary-first option wins at roughly 1/16 across arms.
H3 fails — and takes the headline with it — if insertion rank predicts
probability as well as alphabetical rank does. H4 fails if `mixedcase` follows
byte order, which would mean the ordering happens in server code rather than in
the model.
