# Assemblies goal — instrument 5, export validation (heldout)

Generated 2026-09-24T07:14:11.355Z. Documents: the frozen heldout split (6). Reproduce: `cd opentakeoff/mcp && node --import tsx scripts/assemblies-export-validate.mjs ../../opentakeoff-corpus --heldout --report`.

Per document: the starter applied to the compile, the CSV set built and checked (`exportSet.ts` `csvSetProblems`); the HIT rows built (coil-derived ones included) and filled into the template, each workbook read back.

## Totals

- documents: 6
- errored: 0
- documents_with_problems: 0
- csv_problems: 0
- hit_problems: 0
- units: 438
- lines: 6677
- hit_scheduled_rows: 163
- coil_derived_rows: 11
- coil_derived_with_gpm: 11
- coil_derived_with_system: 0
- wp0_coils_without_valve: 11
- documents_whose_coil_rows_differ_from_wp0: 0
- workbooks: 6

GATE 7 (heldout): export validation green; coil-derived rows 11 against 11 WP0 coils without a scheduled valve.
