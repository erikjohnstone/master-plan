# Symbol-sweep ground truth

This directory is a separate, symbol-only benchmark. It does not modify or
reinterpret the document/table ground-truth records in `../records/`.

Each case freezes one visually reviewed seed and every installed instance of
that same symbol on either the stated page (`scope: "sheet"`, the default) or
all plan-role pages in the file (`scope: "set"`). A case records:

- the immutable source PDF hash, page, printed sheet, and image-pixel size;
- the exact seed rectangle and seed tag text-run box;
- one physical-symbol center and tolerance per non-seed instance;
- the source page for every expected instance in a set-wide case;
- the exact PDF text-run box that names each expected instance; and
- retained full-page visual evidence plus review notes.

The first 30 cases are the one-case-per-document baseline. Cases carrying
`"campaign": "extended"` deliberately exercise additional, different symbol
families on those same source documents. The expanded campaign is cumulative:
new discoveries never replace the baseline and every fix must keep all prior
cases passing.

When a PDF has exploded its printed title-block text into raw vector paths,
`sheet_number` remains the visually audited printed truth and the optional
`engine_sheet_number` records the current core sheet-number extractor output.
This keeps a symbol-only case honest without silently redefining a VAV tag as
the printed sheet number or expanding the symbol-sweep task into unrelated
title-block OCR work.

Set-wide cases also fail when any plan-role page is skipped. Legends,
schedules, details, and cover sheets must be reported in `skipped` and are
intentionally excluded because their symbols are reference graphics, not
installed work.

The center tolerance is a *physical containment* tolerance, not permission to
count nearby linework. It accounts for a symbol fingerprint's length-weighted
centroid moving toward its duct/pipe connector under rotation. The expected
center is the visually reviewed center of the symbol body. Every returned
marker must fall within that body's stated tolerance, and the one-to-one
assignment must consume every expected and returned placement exactly once.

Run from `opentakeoff/mcp`:

```sh
node --import tsx scripts/symbol-sweep-corpus.mjs
```

Optional case ids may follow the command. The process exits nonzero on any
hash, sheet, count, completeness, localization, tag-family, or tag-box error.

`cases.json` is authored ground truth. The runner is evaluation code only: it
must never infer or rewrite expected answers from production output.
