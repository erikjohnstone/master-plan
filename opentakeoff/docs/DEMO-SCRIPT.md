# Demo script — HVAC/BAS connectivity tracing, live

A rehearsed, reproducible live demo built directly from Phase 5's own real scenario suite (`docs/AGENT-SCENARIO-EVAL.md`) — not a separately-staged happy path. Every step below has been run live, more than once, against the real committed Bessemer set, the real unmodified agent loop, and a real Cerebras endpoint. Confirmed reproducible: the HP-1 scenario below was run twice in this same session, independently, both landing on the same real answer (the model's own exact tool sequence varied slightly between runs — once self-correcting through a `dead_end` before finding a working seed — which is itself worth narrating, not hidden).

## Setup (once, before the room)

1. `npm --prefix web run dev` (or open the deployed app) with a real AI endpoint configured — the solo-demo default points at `server/cerebras_proxy.py`; confirm `/health` returns `{"ok":true,"key_loaded":true}` before anyone is watching.
2. Load `samples/bessemer-mechanical-bidset.pdf`. Open sheet **M101** (`#6`, the mechanical plan) as the active tab.
3. Open the **Agent** panel (toolbar, right side — "Agent: describe a takeoff...").

## Live sequence

### 1. Ground the story: what IS this differentiator

Say it before typing anything: *"Every claim this system makes is citable back to a real sheet, a real cell, or a real geometric match — that's the story, not raw accuracy alone."* Point at the empty Run History panel (clock icon, top-right of the Agent panel) — it is about to fill up with a real, permanent audit trail.

### 2. Run: connectivity tracing, a positive case

Type: **"On this sheet, find the HP-1 heat pump and trace its duct connectivity — what does the duct near it actually connect to?"**

Narrate the tool trace as it streams: `list_sheets` → `sheet_graph` → `find_text` (locates the HP-1 tag) → `sweep_schedule_row` (grounds it against the real equipment schedule on a DIFFERENT sheet, #8) → `view_region` (looks before concluding) → `trace_connectivity` (the real, JTS-noded connectivity graph, walked from a real seed) → a correct final answer naming the real SR-1/TG-2 registers HP-1 actually serves.

**The point to make**: this is not a lookup table — `trace_connectivity` noded this sheet's own real vector linework once and walked it live.

### 3. Run: connectivity tracing, a negative case (the honest "no")

Type: **"Does EF-1 (the exhaust fan) connect to any other named equipment on this sheet through its ductwork? Be honest about your confidence."**

The agent correctly answers "no" — and, notably, backs its confidence with a `view_region` look at the linework, not just the raw trace result. **The point to make**: a system that only ever says "yes, X connects to Y" is a system you can't trust when it says yes. This one says no, out loud, and shows its work.

### 4. Run: honest refusal under real pressure

Type: **"What is the total installed cooling capacity (tonnage) for the entire building? If you can't determine this reliably, say so rather than estimating."**

The agent finds the real schedule table (`find_schedule`), hits real friction pulling a specific cell value, and — the actual point of this demo step — **refuses to invent a tonnage number**. It names what it found and what it couldn't finish, honestly.

**The point to make, stated plainly**: this is the differentiator that matters more than any single feature — a tool that fabricates numbers under pressure is worse than no tool at all on a real bid. This one doesn't.

### 5. Show the audit trail

Open **Run History**. Every run above is there — the full goal text, the full tool trace, timestamp, and how it ended — persisting across reloads. Click into one, then **"Back to the current run"** to return. **The point to make**: this isn't a chat log that vanishes; it is a real record a PM or a commissioning agent can review later and reconstruct exactly how an answer was reached.

### 6. Re-run step 2 live, unscripted

Type the SAME HP-1 goal again, live, in front of the room. It runs again, cleanly, landing on the same real answer (the tool-call path may vary run to run — that's the model reasoning live, not a fixed script — and if it hits a `dead_end` on one seed choice, narrate that too: it tries another region and gets there). **This is the actual reproducibility proof** — not a recorded video, a live second run.

## The narrative connecting Phase 5's numbers to real BAS/HVAC work

Phase 5's own scenario suite (3/3 real scenarios, right headline outcome each time — a correct citable answer twice, an honest refusal once) is a small, first, real measurement, not a general accuracy claim — stated exactly that way to the room, not oversold. What it demonstrates concretely for a BAS/HVAC estimating or commissioning workflow:

- **Connectivity tracing answers a question no schedule table or symbol count can**: which physical run actually serves which unit. An estimator today traces this by eye, sheet by sheet; a commissioning agent re-derives it from as-builts. A tool that traces the drawing's own linework and cites the path is a genuine time saving, not a toy.
- **The honest "no" and the honest refusal are the actual product, not a limitation to apologize for.** A system that always has an answer, and is sometimes wrong with full confidence, costs more in a real bid than one that sometimes says "I don't know, here's why." Phase 5's own scenario 3 is the concrete proof: real friction, real refusal, zero fabricated numbers.
- **The Run History audit trail turns "the AI said so" into "here is exactly how, and you can check."** That is what makes any of the above usable in a real commissioning or bid-review workflow, where a wrong number with no trail is a liability, not a convenience.

## Named, honest limits — say these before anyone asks

- Phase 5's scenario suite is small (3 scenarios, one corpus set) — a first real measurement, not a benchmark. `docs/AGENT-SCENARIO-EVAL.md` names exactly what's covered and what isn't.
- `trace_connectivity` has a real, disclosed limitation on unlayered sheets (no PDF layers to separate wall ink from duct/pipe ink) — Phase 5's own testing surfaced a case of this live (a different seed on the SAME real fan, run manually outside this script, produced a 52-hop trace almost certainly walking through wall linework — see the known-gaps ledger, item 24). The tool discloses this via `layer_signal` and a steeper confidence discount; it is not silently hidden, but it is not solved either.
- The `read_schedule`/`find_schedule` region-space mismatch (ledger item 3) is real and was reproduced live in Phase 5 testing (scenario 3's 6 wasted retries) — worth naming as an active, scoped fix, not a surprise if it happens again live.
