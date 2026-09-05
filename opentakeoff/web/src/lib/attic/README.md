# attic — retired extractors: unwired, not deleted

`vectorTakeoffPipeline.ts` no longer calls any of these. The files stay where
they are rather than moving here, for one reason: several of them export
helpers that LIVE code still imports (`sheetHasScheduleKeywords` from
`scheduleGridFallback.ts` is used by `scheduleLanguageScan.ts` and
`rasterTableAssist.ts`; `scheduleStreamFallback.ts` is imported by
`pillarGapRecovery.ts`). Moving them would drag working code into a folder
labelled unused, which is worse than leaving them in place. What matters is
that nothing runs them, and nothing does.

## Retired

| module | stage |
|---|---|
| `pageTileGrid.ts` | L1.5 tiling |
| `scheduleGridFallback.ts` | L2 line grid (`extractScheduleTablesFromLineGrid` only) |
| `scheduleStreamFallback.ts` | L2 stream grid |
| `scheduleTableSidecarAdapter.ts` + `tableSidecarClient.ts` | L2 Python sidecar |
| `pillarGapRecovery.ts` | L2.5 pillar-gap recovery |

## Why — the measurement, then the reading

`report.stage_contributions` counts, per stage, the tables that actually
entered the graph. Because vectorgrid runs first and every later stage returned
early once a sheet had tables, a stage's count WAS its residual reach. Across
30 keyed corpus sheets with the engine on:

    vectorgrid           65 tables
    stream-grid(tiled)    2
    pillar-gap            2
    line-grid(tiled)      1
    stream-grid           1
    python-sidecar        0

Six tables is small but it is not zero, so the six were read rather than
assumed. Not one was a real table vectorgrid had missed. All six were untitled.

- **014_MT#4** — pillar-gap returns two tables that DUPLICATE vectorgrid's own,
  with fewer headers: same keys `HWCH-A1..HWCH-B1`, 6 headers against 18; and
  `HWUH-A1..A4`, 6 against 14. A row key carried by two tables is the hard
  AMBIGUOUS refusal at `session.ts:3541`. That is not clutter, it is a live
  hazard, and it was firing on a real corpus sheet.
- **072_CA#25** — stream-grid, keys `SYMBOL | FD | M`: the header row read as
  data.
- **074_CA#24** — line-grid keyed `SYMBOL`; stream-grid keyed `D | I | QJ | II`,
  one region spanning nearly the whole sheet.

So retiring them removes a bug rather than a capability.

A first attempt at this retired the sidecar alone, on the strength of its zero.
That was wrong: `pillarGapRecovery.ts` imports `extractScheduleTablesFromSidecar`
directly, so the sidecar was reached THROUGH pillar-gap and its output was
counted under pillar-gap's name, not its own. A zero in a ledger means "did not
enter the graph under this label", not "was never called". It is retired now
because pillar-gap is too.

## Still wired, deliberately

- **ODL** (`mcp/src/opendataloader.ts`) — the only engine that reads a table
  with no drawn ruling at all. Vectorgrid reads ruling; a borderless schedule
  is exactly what it cannot see.
- **L4.5 OCR assist** (`rasterTableAssist.ts`) — vectorgrid REPORTS a raster
  region (`raster: true`, no cells) and cannot read it, because its text is
  ink. This is the path that can.
- **`sidecar/tables.py`** — not retired at all. It is the JSON-RPC server that
  hosts `extract_grid`, the vectorgrid method. Only the pdfplumber/camelot/gmft
  backends behind `extract_tables` are unreached.

## Putting one back

Re-add its import and its call in `vectorTakeoffPipeline.ts`. Every stage
below vectorgrid already self-suppresses on a sheet that has tables, so a
restored stage only ever sees what vectorgrid could not read.
