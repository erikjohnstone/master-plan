# Attribute-key transcriptions (WP0.3)

Each `<set>.transcription.txt` here is typed by hand from renders of that
set's schedule tables. `mcp/scripts/assemblies-key-transcribe.mjs` expands it
into `opentakeoff-corpus/keys/<set>.attrs.csv`. The transcription is the
auditable record of what was read; the key is derived from it mechanically.
The file format is documented at the top of that script.

## Protocol (every table, every time)

1. **Scope first.** The tables come from the seeded draw in
   `../01-split.json` (one table per document × family stratum). The covered
   attributes are the family's `KEY_ATTRIBUTES` in the script, committed
   before the census ran on any sheet. Nothing is added to the scope after
   the pipeline runs.
2. **Find the table without the pipeline.** Locate the printed title with
   the PDF's own text layer (pymupdf `search_for`), in the page's displayed
   (rotated) orientation. Never use the pipeline's table box, cells or rows.
3. **Render.** Take an overview at 0.5–0.6× to see the table's extent. Then
   crop the table at 3× with `mcp/scripts/render-page-crop.mjs --crop` (PDF
   points, displayed orientation). A table wider than about 700 pt is read in
   overlapping crops that repeat the tag column, so rows cannot slip between
   crops.
4. **Transcribe in printed order,** up to 30 rows per table (the draw's cap),
   every printed column mapped to a covered attribute or to `-`. What goes in
   the grid:
   - Numbers are typed as printed.
   - Enums are typed as `<canonical> (<printed>)`.
   - A cell that is not ONE value (a multi-speed "50-80-110", "SEE NOTE 3")
     is typed `?<printed>`.
   - A column whose header prints a unit other than the attribute's usual
     one gets `[<unit>]` on its `col:` line. Values are never converted.
5. **Table notes count, and are labelled.** A value an estimator reads
   from the schedule's own notes (e.g. "PROVIDE … BACnet/MSTP INTERFACE",
   note 2, applying to rows whose NOTES cell cites it) is keyed with a
   `derive:` line (or a per-row `[NOTE n]` column) whose header starts with
   `NOTE`. The scorer reports note-sourced attributes as their own slice,
   so a grid-cell reader is never mistaken for a notes reader, or the
   reverse.
6. **Judgments are marked.** An attribute read from the row's structure
   rather than from a single cell (for example `heat_type = hw` because the
   row prints a hot-water coil block) uses a bracketed `[…]` header, or a
   `derive:` line with its reason. The key notes it as the author's reading.
7. **Second read.** Re-render the crop and re-check at least three cells per
   table, chosen before looking: the first row, the last row, and one
   middle row. Record the check in the table's `render:` line.
8. **A schedule printed in parts is one table.** A title printed as
   "… 1 OF 2" and "… 2 OF 2" on the same sheet names one schedule (the
   compile strips that suffix too). Its key covers every printed part, and
   each part is its own `TABLE` block with the same `title:`, so no column
   of the unit is left out.
9. **Expand and commit** the transcription with its key. A key is never
   edited after the pipeline has run on that sheet; a key that later looks
   wrong is written up in `ASSEMBLIES_BUG_CATALOGUE.md`.

## How a key is scored (fixed before any normalizer exists)

A key covers an instance **as printed in one table**: the drawn table. Some
documents print one unit's attributes across several tables (federal-mech
prints an AHU's units, fans and hydronic coils as three schedules). So the
attribute eval (instrument 2) scores a normalized value against a key line
only when the value's cell cite lies in that key's table. A value cited from
another table is reported as "out of key scope", neither correct nor
invented. It needs that table's own key before it counts. Without this rule,
a correct cross-table join would score as "invented", and the metric would
reward not joining.

## What would make these keys lie (checked while authoring)

- Misread digits in small print (3/8, 5/6, 1/7): read at 3×, and at 4× when
  in doubt.
- Rows slipping between crops of a wide table: repeat the tag column in
  every crop.
- Multi-tier headers read as the wrong group (a "GPM" under the cooling coil
  keyed as heating): every `col:` line names the full header path as printed.
- Blank vs. dash vs. "N/A": typed exactly as printed; the helper keys a
  blank as `blank cell` and a dash as `printed '-'`.
