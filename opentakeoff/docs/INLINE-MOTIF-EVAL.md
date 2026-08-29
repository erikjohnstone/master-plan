# How sweep_inline_motif is tested

`sweep_inline_motif` (accuracy-hardening plan Phase 4) anchors a register/grille mark that is embedded WITHIN a duct run — a real, tapered, hatch-filled terminus with no independent whole-shape perimeter of its own — rather than the standalone-block shape `symbol_sweep`'s own whole-shape fingerprint assumes. This note records how that claim is measured, what it currently scores, and what it still cannot do, same discipline as `docs/SHEET-GRAPH-EVAL.md`/`docs/MEP-CONNECTIVITY-EVAL.md`.

## Why this tool exists — the real, measured problem

`bessemer`'s own row-to-symbol recall (Phase 1's own `graph-eval.mjs` metric) caps at 73.3% (11/15) because `SR-1`/`SR-2`/`TG-1`/`TG-2` never anchor. Measured live, before writing a line of this module: marqueeing a real `SR-1` register's own hatched box and running `symbol_sweep` (the existing whole-shape matcher) scores every real sibling instance of the SAME symbol type at only ~76-77% — under the 92% commit bar. This is not drafting noise: a register/grille's own real-world SIZE genuinely differs by CFM rating (a 145 CFM register is a visibly, measurably bigger hatched box than a 55 CFM one), so an exact-segment-count whole-shape fingerprint can never score two real, correct instances as "the same symbol." `sweep_inline_motif` matches on the hatch fill's own real-world size and pitch instead.

## The ruler

`mcp/scripts/inline-motif-eval.mjs` scores `sweep_inline_motif` against real plan sets on ONE metric: **recall** — of the real target instances the key says a given seed should find, how many did it actually report as a match within a real tolerance radius (60 image px) of the target's own center?

**The answer key is authored by rendering the real sheet (`view_sheet`) and looking at it directly** — never by trusting `sweep_inline_motif`'s own output as its own ground truth. Every key row's own `note` states how it was verified.

Key format — `keys/<id>.inlinemotif.csv`: `sheet, seed_x, seed_y, target_x, target_y, expect_status, note` (image px at RENDER_SCALE 2.0; `expect_status` is `matched` or `missed` — a real, disclosed limitation is scored as "missed" and the eval confirms it correctly STAYS missed, not silently dropped from the key).

## Current state

**One real, verified case, on `bessemer`** — seeding on one real `SR-1` register's own hatched fill (image px `[1093.6, 1693.4]`, the real 145 CFM box confirmed by rendering page 6 and looking at it directly) against 8 real target rows:

```
set                        cases   recall     disclosed-miss (correct/unexpected)
──────────────────────────────────────────────────────────────────────────
bessemer                      8   100.0%     1/0
```

**7/7 real target instances found, 0 missed** — every one independently visually confirmed before scoring, spanning real genuine size diversity: two more `SR-1 145 CFM` siblings (same convention as the seed), a real `SR-1 160 CFM` and `SR-1 55 CFM` and `SR-1 75 CFM` (three DIFFERENT real physical sizes than the seed's own 145 CFM box — the exact real problem this tool exists to solve), and two real `SR-2 0 CFM` instances (a genuinely different tag, dashed border, denser hatch — found because this tool matches by SHAPE/size, not by tag; `resolve_tag`/a schedule read is still needed to confirm which specific tag a match belongs to, same doctrine as `match_reference_symbol`).

**One real, disclosed limitation, correctly still a miss, not silently dropped**: a real `SR-1 145 CFM` instance drawn with a dashed border, mid-duct with a vertical riser crossing through it — a genuinely different real drawing convention than the tapered-terminus shape this tool's own hatch-cluster proximity model was built around. Named, not chased this session — see "Honestly scoped as remaining" below.

`TG-1`/`TG-2` (transfer grilles) are a **structurally different real motif**, confirmed by rendering and looking directly: a small bowtie/hourglass glyph sitting ON a wall line (with directional airflow-break-arrow annotations nearby), not a hatch-filled box terminating a duct at all. This tool was built for the register/grille hatched-box shape specifically; it does not attempt to anchor `TG-1`/`TG-2` and was never expected to — a real, separate remaining gap, not folded into this tool's own scope.

## What real corpus testing found that a synthetic fixture alone would not have

- **Real segment-count matching genuinely fails here — not a tuning problem.** The two real siblings' own STRUCTURAL (non-hatch) segments differ too, not just their hatch fill's segment count — they are simply different real sizes. No tolerance tweak to `symbol_sweep`'s own whole-shape scorer would fix this; a coarser, size/pitch-based comparison is the actual fix, not a patch.
- **Naive endpoint/connectivity clustering (reusing `legendlearn.ts`'s own `buildMepGraph`-based approach) does NOT work for hatch fill.** Tried first, on this exact real data: a real register's own hatch strokes are short, parallel, non-touching dashes — they never share an endpoint or cross each other, so connectivity-based clustering (JTS noding) produces only degenerate single-stroke "clusters," never the real compact box. Fixed by clustering on real 2-D PROXIMITY (expand each member's own bbox by a margin, union-find merge overlaps) instead — a genuinely different clustering primitive for a genuinely different real shape of problem.
- **A real, caught bug in that proximity margin, found live**: an initial 3× the hatch pitch as the merge margin correctly clustered the seed's own fill, but on a DIFFERENT real family (a different duct run) it also bridged a handful of unrelated marks (dimension ticks, wall dashes) sitting 9-14px away along the SAME duct run that happened to share the exact (angle, pitch) signature — chaining a real ~35×48px box into a false ~36×622px strip that then failed the aspect filter and silently dropped a real instance. Fixed by tightening the margin to 1.5× the pitch — measured directly against the real gap distribution (a clean break at ~9px vs ~14px) before picking the number, not guessed.
- **The sheet is genuinely full of visually-similar hatch texture** (walls, floor patterns) sharing near-identical (angle, pitch) signatures with the real register boxes — confirmed live: several other real hatch families on the same sheet span hundreds of members and 5-20+ real feet in size. The real-world SIZE filter (not just member count) is what correctly excludes these; a size-blind version of this tool would have to be far more conservative, or would false-positive on them.

## Honestly scoped as remaining, not silently dropped

- **Only ONE real, scored seed case exists**, covering the `SR` family only. `TG-1`/`TG-2` need their own, separately-designed motif detector (the wall-mounted bowtie/hourglass shape) — a real, different piece of work, not started here.
- **The dashed-border, mid-duct-riser `SR-1` case is a real, disclosed miss** — a genuinely different drawing convention (border style, position relative to the duct) than the tapered-terminus shape this tool's proximity-clustering model assumes. Extending coverage to it is real, scoped future work.
- **Not yet wired into `sweep_schedule_row`'s own corroboration/count path** — `graph-eval.mjs`'s own `rowsym` metric (bessemer's row-to-symbol recall) is NOT moved by this tool existing; that would need `sweepScheduleRow`'s own whole-shape `corroborateFingerprint` step to fall back to an inline-motif corroboration when the whole-shape one fails, then run the matching per-sheet loop through this module instead. `corroborateInlineMotif` (inlinemotif.ts) already exists as the building block for that integration, but the full `sweepScheduleRow`/`agentSweepScheduleRow` wiring (both MCP and browser, with commit/scoring semantics) was judged too large and risky to attempt safely alongside everything else this session already touched — real, valuable, precisely scoped remaining work, not silently assumed done.
- **Other corpus sets** (`itd-d1-lab`, `federal-mech`, `weld-county-permit`, `itd-d1-lab-raster`) have no `.inlinemotif.csv` key yet — each needs the same render-and-look-at-it discipline this one Bessemer seed got.
