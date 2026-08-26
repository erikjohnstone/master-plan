# How vision-assisted symbol classification is tested

`classify_symbol` (maturity plan Phase 3, #HVAC-4) asks the user's own configured vision model to name an HVAC/BAS symbol it's shown, grounded in this project's own real taxonomy (`web/src/lib/hvacTaxonomy.ts`), for the case the geometric matcher (`symbol_sweep`) can't confidently place — a genuinely novel shape, or a raster/scanned sheet with no vector geometry to fingerprint at all. This note records how that claim is measured, what it currently scores, and what it does not yet answer — so the next person to extend it starts from the number, not from scratch.

## The ruler

`web/scripts/vision-classify-eval.mjs` scores `classify_symbol`'s own prompt/parse pipeline (`classifySymbolPrompt`/`parseClassifyResponse`, `ai.js`) against a real, independently-keyed corpus of cropped symbols — **two variants of the same crops**, one rendered from the source PDF's real vector geometry, one from a synthetically-flattened raster version of the identical page (`mcp/scripts/make-corpus-raster-variant.mjs`), so vector and raster are scored on the exact same underlying symbols, not two different populations.

```bash
VISION_ENDPOINT=http://127.0.0.1:8811 VISION_MODEL=gemma-4-31b \
  node --import tsx scripts/vision-classify-eval.mjs <corpus-dir>/vision-eval
```

The corpus directory (external, never committed — same convention as `mcp/scripts/graph-eval.mjs`'s own corpus): `key.csv` (`crop,expected,note`) plus `crops/<vector|raster>_<crop>.png`.

## What makes the score mean anything

**The key is a real caption read directly off the source legend sheet** (Eglin AFB's own "MECHANICAL CONTROLS - LEGEND", `federal-attachment4-mechanical.pdf#17` in this session's corpus) — cropped OUT of the image before it's ever sent to the model, and never derived from `classify_symbol`'s own output. Same discipline `docs/SHEET-GRAPH-EVAL.md` already states for its own keys: a key built from the tool's own output measures nothing at all.

**Scoring is loose-match, not exact-string, and that's a real, disclosed methodological choice, not hidden in the script**: every significant word (3+ letters) in the key's expected name must appear in the model's answer. This matters concretely — the taxonomy's own vocabulary has one generic `"Control valve (2-way or 3-way, electric or pneumatic)"` entry, not separate `"2-way electric control valve"`/`"3-way electric control valve"` entries, so a model that correctly recognizes the family but not the specific port-count scores as correct here. That's a real, stated limitation of the CURRENT taxonomy's granularity (see "known gaps" below), not the eval script papering over a wrong answer.

## Current state (2026-08-26, gemma-4-31b via the local Cerebras proxy)

5 real symbols, both vector- and raster-sourced:

| crop | expected | vector | raster |
|---|---|---|---|
| a_2way_electric | 2-way electric control valve | ✓ (generic "control valve" family, conf 0.95) | ✓ (conf 0.90) |
| b_3way_electric | 3-way electric control valve | ✓ (generic "control valve" family, conf 0.90) | ✓ (conf 0.90) |
| c_butterfly_electric | butterfly valve electric actuator | ✗ — called "unit heater" | ✗ — called "space temperature sensor / thermostat" |
| d_ball_electric | segmented ball valve electric actuator | ✗ — called generic "control valve" | ✗ — called generic "control valve" |
| e_3way_pneumatic_1 | 3-way pneumatic control valve | ✗ — called "gate valve" | ✗ — called "gate valve" |

**vector: 2/5 correct. raster: 2/5 correct — identical.** Every reply carried a stated confidence (0.80–0.95) and a real, specific one-sentence reason citing what it saw — never a bare label, matching this project's own evidence-citation doctrine. No parse failures on either path (5/5 replies were valid `{classification, confidence, reasoning}` JSON both times).

**Five items is a small sample. Treat this as "a real, honest first measurement," not a general accuracy claim** — the same caution `docs/SHEET-GRAPH-EVAL.md` states about its own four-set corpus.

## What the failures actually show

Every failure has a real, legible pattern, not noise:

- **Actuator sub-type is invisible past "there's a square box."** Both butterfly (a distinct feather/blade glyph) and segmented-ball (a distinct cross-hatch glyph) actuators get read as "there's an M/U-marked actuator box" and then guessed generically or wrongly (once as a unit heater, once as a thermostat) — the model is reading the ACTUATOR indicator correctly but not the valve-body glyph beneath it closely enough to distinguish the type.
- **Pneumatic dome vs. gate-valve handwheel is a real, repeated confusion**, on both vector and raster: the rounded pneumatic-actuator dome above a bowtie body was read as a gate valve's stem/handwheel twice, independently. A real, specific, fixable-or-not-fixable-by-prompting question, not a fluke.
- **Raster costs nothing extra here** — unlike geometric fingerprinting (`symbol_sweep`), which cannot run on a raster sheet at all (`has_vector_linework: false` refuses it outright), vision classification scored identically on both sources. This is the real, positive finding this whole phase existed to check: vision is a genuine fallback for the case geometry structurally can't reach.

## What this does — and does not — decide

Per the maturity plan's own gate: this number is what decides whether a training phase is ever justified, not written unconditionally regardless of the result. **This first measurement does not clear that bar on its own** (40% on 5 items, with a legible, real sub-type-confusion pattern) — but it also doesn't yet rule out a cheaper fix than training: a richer, more specifically-worded prompt (naming the exact distinguishing visual features — hatch pattern for ball valves, a feather-blade glyph for butterfly valves, dome-vs-handwheel for pneumatic-vs-gate) has not been tried yet, and untried prompting is a real, cheaper lever to pull before treating this as evidence for training work.

## Known gaps, named rather than papered over

- **5 items, one source sheet, one model.** Real conclusions need a larger, multi-firm eval set — the same "small corpus, no known failure, not a general claim" caution the room-finish/row-symbol eval already states.
- **The taxonomy's own port-count granularity (2-way vs. 3-way) isn't separately nameable yet** — `hvacTaxonomy.ts`'s `VALVES` list has one generic "control valve" entry; a model that gets the family right and the port count wrong currently scores as correct here. Splitting that entry (and re-scoring) is real future work, not done this session.
- **No richer, iterated prompt was tried.** This is the FIRST prompt, not a tuned one — before this result should be read as "vision alone tops out around 40% on hard sub-type distinctions," a few real prompt-engineering iterations (more specific per-category visual cues, or few-shot examples drawn from the taxonomy's own notes) should be tried and re-scored.
- **Corroboration against schedule/tag evidence (the doctrine `classify_symbol`'s own tool description already states) was not exercised in this eval** — it tests the vision call in isolation, not the full "propose a hypothesis, then corroborate against `resolve_tag`/`sweep_schedule_row`" loop an agent would actually run. That end-to-end loop is Phase 5's own scope.
