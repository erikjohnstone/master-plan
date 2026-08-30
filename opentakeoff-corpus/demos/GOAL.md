# HVAC/BAS Takeoff Demo Suite

## Mission

Ship ten demos covering the real work of an HVAC/BAS estimator. Each demo must
be proven on the hardest suitable blueprint set, run through the production API
and a locally hosted environment, and locked by a regression test that fails
loudly if the API drifts.

In a live review, each demo must answer these questions on the cited sheet in
under ten seconds:

1. How do we know the system did not invent the answer?
2. Does it work on difficult real drawings rather than one clean sample?
3. What happens when the evidence is missing, ambiguous, or wrong?

The suite must include a full HVAC/BAS takeoff, symbol/tag highlighting linked
to table data, a cross-sheet workflow, a multi-building workflow where the
corpus supports one, and other difficult high-frequency estimating workflows.
Every demo must connect a symbol or tag to useful presented data and connect
multiple parts of a drawing set or span multiple sheets.

## Required loop for every demo

1. **Select.** Take the next entry from `SLATE.md`. Independently verify its
   hardness claims and that its required stress condition is present. Replace
   an easy target with a harder suitable set before spending verification runs.
2. **Build ground truth before any model run.** Rasterize and read the relevant
   sheets. Record typed expected values, explicit tolerances, sheet IDs, answer
   regions, and one-line re-derivation notes in `truth.json`. For D03, D04,
   D08, and D10, independently hand-count and reconcile at least 20% of every
   rollup before trusting the total.
3. **Freeze one prompt.** Save one natural estimator question verbatim in
   `prompt.txt`. Do not edit it after runs begin.
4. **Run N=5.** Use the same prompt for five runs. Force cold cache on at least
   runs 1 and 5. Save the raw response, latency, full citation payload,
   model/version identifier, timestamp, and request ID for every run in
   `runs/`.
5. **Verify every run without compression.**
   - Value and every rollup component match `truth.json` within its stated
     tolerance.
   - Every cited sheet and table exists; every bbox is finite,
     non-degenerate, and inside page bounds.
   - A reusable checker crops every cited bbox from the rendered page, OCRs
     the crop, and confirms the returned value appears in the evidence.
6. **Gate.** Five of five runs must pass all three assertions. Four of five is
   not working. Record latency; fail if p95 exceeds 15 seconds. Classify a
   failure before changing code as `RETRIEVAL`, `PARSE`, `VALUE`,
   `CITE_FORM`, `CITE_GROUND`, `LATENCY`, or `REFUSAL`. Fix the system and
   restart the demo at zero of five.
7. **Lock.** Write the demo card, add its fixture pointer and regression test,
   and commit. Only then does it count toward ten.

## Required per-demo layout

```text
demos/DNN-name/
  CARD.md
  prompt.txt
  truth.json
  runs/
    run-1.json
    run-2.json
    run-3.json
    run-4.json
    run-5.json
```

`WORKING` is a measured state, never a planning label. A demo card must show
the hard-set evidence, 5/5 assertion matrix, p95 latency, local-host proof,
failure/refusal behavior, and the exact regression command.
