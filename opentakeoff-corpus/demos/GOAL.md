# HVAC/BAS Takeoff Demo Suite

## Mission

Ship ten demos covering the real work of an HVAC/BAS estimator. Each demo must
be proven on the hardest suitable blueprint set, run through the production API
and a locally hosted environment, and locked by a regression test that fails
loudly if the API drifts.

Every local-host proof must be shown live in a saved screen recording of the
actual OpenTakeoff UI. The recording must visibly show the real blueprint
loaded in the canvas, the frozen prompt being run in the in-canvas Agent panel,
tool activity, the final answer, and the cited plan/schedule regions highlighted
on the blueprint. A terminal-only recording, backend process log, or written
claim that localhost ran is not sufficient evidence.

## Paint answers on the sheets (product rule)

OpenTakeoff must be as interactive and easy as possible. Whenever an estimator
asks for information in the Agent, the product must **paint the cited evidence
on the real blueprints** via `highlight_citation` (visible highlight markups,
plus navigate/fly to those sheets). Agent-panel text alone is incomplete.

This applies to **every** factual question that uses tool evidence
(`query_table`, `find_text`, `sweep_schedule_row`, and similar) — not only
prompts that say "show me" or "cite the exact". UI recordings must show the
highlights on the canvas. Evidence gates and the system prompt must enforce
this on the production UI path for arbitrary uploaded sets.

## Estimator-clarity UX (non-negotiable, going forward)

Demos and the production Agent must stay readable for a real estimator — not
an engineer watching a tool trace. Apply on every new demo and every UI proof:

1. **Answer first in the Agent panel.** The usable answer (every requested
   field, evidence-backed) is the primary surface. Plain-language status
   ("Reading schedules…") may show while working. Raw tool names, JSON dumps,
   and internal gate chatter are secondary — collapsed — never the thing the
   eye lands on.
2. **No automatic fly-around.** Do **not** yank the viewport across sheets
   while the agent runs. Paint highlights quietly on the sheets. Surface each
   cited value as a **clickable source card/stamp in the Agent panel**; the
   estimator reads the answer, then clicks a card when they want to jump to
   that sheet/region. Auto fly-to thrash is a fail.
3. **Highlights must not cover the value.** Citation highlight boxes are a
   translucent frame around the answering cell/text. Do **not** draw label
   words inside the box that obscure the schedule value or drawing text being
   cited. The blueprint value stays readable through the paint.
4. **Conversational follow-ups — answered correctly.** After an answer, the
   estimator must be able to keep chatting in the same Agent thread — ask why
   a value was chosen, what a field means, where else it appears, what to
   check next, or another data question about the same workflow — and get a
   **correct**, plain-language reply grounded in the run's evidence (and fresh
   tools when needed). One-shot dump-and-done is incomplete. Wrong, empty,
   evasive, or placeholder follow-up replies are a **fail**.

These rules are product behavior for arbitrary uploads, not demo polish.

## Per-demo advance rule (non-negotiable)

Do **not** mark a demo locked or move on to the next slate entry until **all**
gates for the current demo are clear:

1. Ground truth before model runs (including 20% hand-count where required)
2. Frozen prompt; N=5 API / verify; localhost/stdio when required
3. Generalized production correctness (no corpus hardcoding / answer-steering)
4. UI proof: answer-first panel, source cards, readable paints (no auto-fly)
5. **At least one real follow-up in the same Agent thread is asked,
   answered correctly, and verified** — whether it is a data question or a
   workflow/clarification ask — with evidence-backed content matching what a
   competent estimator would accept. The follow-up must be **explicitly asked**
   after the primary answer (frozen `truth.follow_up.prompt` or equivalent),
   the reply must be checked against expected values/evidence (not vibes),
   and the UI recording must show both the ask and the correct Answer. Skipping
   the follow-up, assuming primary-only is enough, or locking without
   verification is a **fail**.

A demo that passes the primary ask but fails the follow-up is **not** locked.
Fix production behavior, re-prove the UI recording (primary ask + correct
verified follow-up), then advance.

**After D10 is locked**, the suite still requires the **Final suite gate**
below (durable engine regressions + frozen golden verify via
`npm run test:demos`). Live 50 API / 30 UI re-runs are demoted. Per-demo lock
alone is not suite completion.

## Demo quality bar (non-negotiable)

Demos are not tag flybys. They must look like a competent estimator using the
product — and the product must be **extremely, genuinely useful**.

### Do exactly what the user asks — and give them more than enough

Whatever the user asks for — a whole takeoff, an AHU characteristic, counting
all the valves, a BAS point→equipment trace, schedule row data, cross-sheet
joins, or any other real estimating ask — the software MUST:

1. **Do that ask end-to-end.** Execute the workflow the question implies; do
   not substitute a weaker tag-lookup or a partial answer.
2. **Return more than enough correct information in chat** so the answer is
   immediately usable: every requested field, evidence-backed values, units,
   schedule titles/sheets, and enough workflow context to trust and act —
   not a fragment list, not tool-dump residue, and not “boxes painted, see
   Sources.” An estimator reading **only** the Agent Answer must understand
   what was found, why it matters, and how to check it.
3. **Paint ALL answering evidence on the sheets** via `highlight_citation`
   (value cells, row data, drawing text, counted marks — not lonely tag
   marks). Do **not** auto-fly the viewport. Put clickable source cards in
   the Agent panel so the estimator jumps on demand. Highlight frames must
   leave the underlying value readable — no label text on top of the cell.
4. **Source cards must be useful at scale.** Each card needs a human-readable
   title (`equipment/tag · field · value`) and an **expandable dropdown**
   with full detail (schedule title, sheet id, column/header, value, why it
   was cited). Naked fragments like `350`, `PRICE;`, or `SDV.` as the only
   card content are a **fail**. Highlights corroborate the chat answer; they
   are not a substitute for a usable chat answer. Unexplained highlight spam
   is a **fail**.

Agent-panel text alone is incomplete. Mark-only sheet flybys are incomplete.
Partial answers, wrong sibling rows, or “flying around tags” without the
asked-for data are a **fail**. Bar: ask → complete useful answer in chat →
rich source cards → full paint on the drawings. Make OpenTakeoff the tool an
estimator actually wants open.

**Honesty rule:** Do not mark a demo locked because a harness scraped DOM
text while the visible UI still looks like highlight spam or fragment cards.
If a live reviewer cannot understand the workflow from chat + expandable
cards, the demo is not locked — fix production UX/answer quality and re-prove.

### Prompt and recording rules

1. **Intelligent prompts.** Frozen `prompt.txt` values must ask what an
   intelligent user would actually ask — natural, multi-field, useful
   questions — not toy “find this tag” lookups.
2. **Do what the prompt says.** The answer must return every requested field
   with correct, evidence-backed values. Missing row data, wrong sibling
   points, or placeholder prose is a fail.
3. **Highlight answering evidence.** Paint the schedule row / cells / drawing
   text that support the answer. Highlighting only a tag mark while the prompt
   asked for corresponding row values is a fail. Flying between sheets without
   showing the answering cells is a fail.
4. **UI recording.** Must show: real blueprint → frozen prompt → complete
   usable answer + clickable source cards in the Agent panel → at least one
   conversational follow-up whose reply is **correct and useful** (data or
   otherwise) → calm on-sheet highlights with values still readable (opened
   via source cards, not auto-fly). Auto fly-around videos, label-obscured
   highlights, or a wrong/empty follow-up are a fail.

If a recording cannot demonstrate those points, the demo is not locked —
including demos previously marked locked that fail this bar (re-prove them).
Do not start the next demo until the current one clears every gate above,
including the correct follow-up.

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

## Generalized production correctness (all paths)

These demos exist so that, as more blueprints are trained on and uploaded to
the platform, the same workflows remain correct on every real set — not only
on the slate's current PDFs.

The same strict demo gates apply on every surface that estimators use:

- production MCP / API path (`run:demo`, `verify:demo`, stdio localhost)
- production in-canvas Agent / UI path (live tool loop, evidence gates,
  highlights, saved UI recording)
- any shared library, runner, verifier, or tool implementation behind those
  paths

Fixes that clear a demo gate must be **generalized and deterministic**. They
must encode real drawing/tool methodology (for example: cite `hit.str`, do not
launder schedule LOCATION into a serves claim, omit sheet for set-wide
`find_text`, refuse when evidence is missing). They must **not**:

- hardcode a corpus filename, sheet number, tag, table title, or expected
  answer value into production code or prompts
- steer the model toward a known demo answer
- special-case one blueprint so the gate passes while other uploads would fail
- leave the UI path weaker or looser than the API path (or the reverse)

If the UI answer, localhost answer, or API answer disagrees with `truth.json`
or with each other, the demo is not locked — fix the shared production behavior
and redo the failing path, including the UI recording when the UI was wrong.
"Works on this demo PDF" is insufficient. The bar is **100% correct user-facing
workflow behavior** for the same class of question on arbitrary blueprints
uploaded to the platform, with honest refusal when evidence is absent.

## Execution policy

Do not dispatch subagents of any kind. The active coordinator performs all
research, implementation, model runs, debugging, review, and verification
directly. This prohibition includes local workers, cloud workers, background
agents, exploration agents, debug agents, review agents, and computer-use
agents. Keep the full ten-demo goal active and make progress serially in this
workspace.

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
   restart the demo at zero of five. Fixes must satisfy **Generalized
   production correctness** above before the restart counts.
7. **Lock.** Write the demo card, add its fixture pointer and regression test,
   prove the production UI path with a saved recording that matches the same
   truth **and** shows at least one correctly answered follow-up in-thread,
   and commit. Only then does it count toward ten. Do not begin the next
   slate demo until this lock is complete.

## Final suite gate (after D10 lock)

Locking D01–D10 one-by-one is **not** the finish line. Immediately after the
**10th demo is locked**, before declaring the suite complete, re-prove the
**entire** slate with the **durable regression suite** (no live 50× LLM /
30× UI re-burn required):

1. **Engine regressions (D01–D10).** Every demo has a
   `demoDNN.regression.test.mjs` that loads the pinned PDF via `Session`,
   asserts schedule/graph evidence against `truth.json`, and calls **no**
   model. `npm run test:demos` must pass all ten.
2. **Frozen-answer verify.** Each demo keeps a slim checked-in
   `golden/answer.json` (final `status` + `answer` only — not raw tool
   dumps). `verify:demo` against that golden must pass value / cite-form /
   cite-ground. No new model calls. Full `runs/run-*.json` dumps stay local
   / gitignored.
3. **Optional UI smoke (when UI wiring changes).** Run each existing
   `opentakeoff/web/scripts/demo-ui-proof-dXX.mjs` **once**, headed or
   headless, **no video required**. Skip on pure engine-only changes.

**Demoted (not required for suite completion):** re-running live N=5 for
every demo (50 API) and 3× UI per demo (30). Those remain available as a
rare release / provider-drift check, not the finish line.

The suite is complete when `npm run test:demos` is green after D10 lock
(engine + golden verify). Partial credit from earlier per-demo locks does
not skip a failing demo in that command.

## Required per-demo layout

```text
demos/DNN-name/
  CARD.md
  prompt.txt
  truth.json
  fixture.json
  golden/
    answer.json          # slim final answer for verify:demo (checked in)
  runs/                  # local-only full dumps (gitignored)
    run-1.json …
```

`WORKING` is a measured state, never a planning label. A demo card must show
the hard-set evidence, 5/5 assertion matrix, p95 latency, local-host proof,
validated UI recording path, failure/refusal behavior, and the exact
regression command.
