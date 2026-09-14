# Legend Learn ground truth

This directory contains human-reviewed truth for Legend Learn. It is deliberately
separate from detector output: the corpus evaluator is read-only and never creates,
updates, or accepts expected rows from a run of the engine.

`manifest.json` declares all 30 frozen source PDFs, their hashes, candidate pages,
and review state. A case is scored only when `review_status` is `complete`.

Review states:

- `pending`: candidate identified but row-by-row review is not finished.
- `row_count_reconciled`: the visible row count has been reconciled, but exact
  caption, kind, and geometry truth is not yet frozen.
- `complete`: expected status and every expected row have been independently
  reviewed. Empty and unsupported cases are legitimate completed truth.

Completed positive rows may include `rect` and `caption_bbox`; when present, the
evaluator checks every coordinate within the manifest tolerance. `kind` is one of
`symbol`, `symbol_group`, `line_style`, `annotation`, or `control_function`.
`symbol_group` preserves a row that deliberately presents multiple alternative
glyphs, while `control_function` preserves BAS point, command, software, logic,
or sequence rows.
`seedable` is independently reviewed: only a single physical `symbol` can seed a
plan-scale Symbol Sweep; grouped alternatives, line keys, drafting annotations,
and control functions remain auditable but nonseedable.

Run the evaluator from `opentakeoff/mcp`:

```sh
node --import tsx scripts/legend-learn-corpus-eval.mjs \
  --corpus="../../HVAC BAS Benchmark Collection" --repeat=2
```

The document SHA-256 is checked before any case is scored, and each completed case
is run repeatedly to catch nondeterministic pairing or geometry.
