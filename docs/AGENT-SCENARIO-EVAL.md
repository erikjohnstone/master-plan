# Agentic-loop scenario suite — Phase 5

Every agentic loop this maturity plan touches or built gets tested end to end before being called done — the explicit ask behind this phase. This note records the real scenarios run, how they were run, what passed, and what real friction they surfaced — a first real measurement, not a general accuracy claim (the same honesty Phase 3's own 5-item vision eval and Phase 4's own 1-case corpus eval already state about themselves).

## Method

Each scenario is a real goal typed into the live browser Agent panel (`web/src/pages/TakeoffCanvas.jsx`'s Agent UI), run against:

- the **real, committed Bessemer corpus set** (`samples/bessemer-mechanical-bidset.pdf`, loaded as its own real multi-sheet working set — M101/M102/M601/MP001/P101, the same tabs a real estimator would have open),
- the **real agentic loop** (`web/src/lib/agentLoop.js`'s `runAgentLoop`, unmodified — the exact code path a real user's session runs),
- the **real Cerebras endpoint** (the local `server/cerebras_proxy.py`, a real loaded key — confirmed via its own `/health` before any run), not a mock or stub.

Every transcript below is the ACTUAL tool-call sequence and ACTUAL final answer the model produced, read directly from the live DOM after the run completed — not summarized from memory, not cherry-picked mid-run. `0 shapes` / `local · saved` after every run confirms these were read-only queries; nothing was committed or needs reverting.

This is a live, browser-driven procedure, not (yet) a fully automated headless CLI harness — see "Honestly scoped as remaining" below.

## Scenarios run

### 1. Connectivity tracing — "what does X connect to"

> **Goal**: *"On this sheet, find the HP-1 heat pump and trace its duct connectivity — what does the duct near it actually connect to? Use trace_connectivity."*

**Tool sequence**: `list_sheets` → `sheet_graph` → `find_text {q:"HP-1"}` → `sweep_schedule_row {tag:"HP-1"}` → `view_region` → `trace_connectivity` (×2, refining its own seed point) → `find_text {q:"SR-1"}` → `read_sheet_text`.

**Final answer**: correctly named HP-1 as the source, **SR-1** (supply registers) and **TG-2** (return grilles, "635 CFM (HIGH)") as what the duct network serves — this **independently matches** the real duct network this session confirmed by rendering the sheet directly and looking at it (`docs/MEP-CONNECTIVITY-EVAL.md`'s own scored case).

**Verdict: PASS.** Right tools, right sequence (grounded the tag via schedule + text before tracing, looked at the region before concluding), a correct, citable, corroborated answer.

### 2. Connectivity tracing — a real negative (does NOT connect)

> **Goal**: *"Does EF-1 (the exhaust fan) connect to any other named equipment on this sheet through its ductwork? Use trace_connectivity and be honest about your confidence."*

**Tool sequence**: `list_sheets` → `sheet_graph` → `find_text {q:"EF-1"}` → `sweep_schedule_row {tag:"EF-1"}` → `find_text {q:"HP-1"}` → `trace_connectivity` → `view_region`.

**Final answer**: "EF-1 does not connect to any other named equipment," with visual corroboration (`view_region`) explicitly cross-checked against the trace result before concluding, and a stated "high confidence" reasoned from both signals together, not the trace alone.

**Verdict: PASS**, and a genuinely good real-world instance of the exact behavior the tool's own docstring asks for ("corroborate a trace... before trusting it as the whole story") — the model did not stop at the raw tool result. Worth flagging why this one's `reached: EF-1` (reaching only itself, over a 3-point path) is a real if trivial result, not a bug: the agent's own seed point and its own EF-1 placement estimate landed on two close-but-distinct points along the same short real duct stub — a different, more conservative seed choice than the one this session used manually earlier (which, on a DIFFERENT seed a bit further along the same riser, produced the disclosed 52-hop wall-conflation case in `docs/MEP-CONNECTIVITY-EVAL.md` / ledger item 24). Same tool, same equipment, two different real seed choices, two different real results — a live demonstration of exactly the seed-sensitivity risk that finding already named.

### 3. Honest refusal under real tool friction

> **Goal**: *"What is the total installed cooling capacity (tonnage) for the entire building on this sheet set? If you cannot determine this reliably, say so plainly rather than estimating."*

**Tool sequence**: `list_sheets` → `sheet_graph` → `find_schedule {kind:"equipment"}` (found the real "VARIABLE REFRIGERANT PACKAGED HEAT PUMP" table with a COOLING MBH column) → `read_schedule` with a region that reads like the known `find_schedule`/`read_schedule` region-space mismatch (ledger item 3) — **called 6 times, identical arguments, identical failure**, plus one `read_sheet_text` attempt on the same unopened sheet.

**Final answer**: correctly refused to state a tonnage number, named the real schedule table it found (by title and column), and explained (partially correctly — see below) why it couldn't finish.

**Verdict: PASS on the headline behavior (no fabricated number)**, but real, disclosed friction: 6 wasted iterations retrying an identical failing call, and the model's own stated reason ("the sheet isn't open on the canvas") is very likely NOT the actual root cause — the tool's own note text bundles "sheet not open" and "region matched nothing" into one sentence, and the real, more likely cause is the pixel-vs-normalized region mismatch already named in the ledger (item 3), now confirmed as a LIVE, reproducible agent failure mode rather than only a theorized one. See the ledger for the concrete repro and the two-part fix this suggests (unify the region convention; separate the two facts in the note text).

## Scoring, honestly

| category | scenarios | pass | notes |
|---|---|---|---|
| connectivity tracing (positive) | 1 | 1 | correct, corroborated, cited |
| connectivity tracing (negative / "does not connect") | 1 | 1 | correct, corroborated, appropriately hedged |
| refusal correctness under real tool friction | 1 | 1 (headline) | honest refusal, but a real, disclosed 6-retry inefficiency and a likely-wrong stated root cause |

**3/3 scenarios reached the right headline outcome** (a correct citable answer or an honest refusal, never a fabricated number). This is a small, real sample — not a general accuracy claim, same discipline as every other eval in this plan.

## What this real testing surfaced, not solved

- **The `read_schedule`/`find_schedule` region-space mismatch (ledger item 3)** went from "disclosed, theorized" to "confirmed live, with a concrete repro and a wasted-iteration cost" — the single highest-value fix this scenario suite's own results point to.
- **`trace_connectivity`'s seed-sensitivity** (ledger items 24-25) showed up naturally in scenario 2's own contrast with this session's earlier manual test — not a new finding, but a live, second confirmation from an independent (agent-chosen, not human-chosen) seed.

## Honestly scoped as remaining, not silently dropped

- **Only 3 scenarios, one category cluster (HVAC connectivity + one schedule query), one real corpus set.** A genuinely broad scenario suite (symbol ID, table-to-symbol linking, more schedule-grounded queries, multi-sheet goals, more refusal cases) across more of the corpus is real, valuable, future work.
- **This is a live, browser-driven procedure, not a repeatable headless CLI harness.** `web/src/lib/agentLoop.js`'s `runAgentLoop({cfg, goal, tools, execute, ...})` is provider-agnostic and pure — in principle a Node script could drive it headlessly against a ctx adapter backed by MCP's own `Session` (reusing `AGENT_TOOL_DEFS`/`executeAgentTool` from `agentTools.js` untouched), giving a real, repeatable, CI-able regression harness instead of a manually-driven browser session. Scoping and building that adapter (it needs to bridge the browser's normalized-0..1 tool convention to MCP's own image-px convention for every tool a scenario touches) is real, non-trivial work not attempted this session — every scenario above is still 100% real (real model, real corpus, real tool dispatch), just not yet automated into a rerunnable script.
