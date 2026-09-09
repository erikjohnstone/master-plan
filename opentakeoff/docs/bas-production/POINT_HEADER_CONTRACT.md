# Explicit point-list parent headings

## Pre-change contract (2026-09-09)

**Should this be on the shared path? Yes.** Interpret recovered indexed headers
in the existing shared Python consumer. Do not change the graph, VectorGrid,
source cells or legacy table/citation contracts. This step does not complete
workflow A or replace the remaining versioned BAS workflow model.

Input: existing `BlueprintInput.tables`, including a first retained child-header
row under explicit HARDWARE POINTS / SOFTWARE POINTS parents. Existing direct
AI/AO/DI/DO, hardwired, network and integration patterns continue to work.

Supported addition: literal HARDWARE establishes physical-column scope and
SOFTWARE establishes software-column scope. A directional child label is still
required for I/O; AV/BV/MV establish software values. A first row is consumed
only under the existing identity-header and two-typed-child structural gate.
Alarm, trend, adjustable, read-only and graphics flags are not additional I/O
channels or software values. Contradictory explicit physical/software scope
does not become a valid channel merely through precedence in a regex.

This is a table-local declared-cell projection, not a project physical-terminal
or installed-equipment count. No protocol, address, replication, responsibility,
controller or license entitlement is inferred. Controller footnote qualifiers
and source-bound user review remain required in the full workflow; don't use
the legacy adapter's unqualified totals as complete engineered demand.

Independent expected evidence: Fort Sam M-506 meter/global matrices, visually
rechecked from the original PDF page and compared with the pre-existing authored
`points_m506_meter_global_templates.json`. Water/gas each mark AI in row 1;
electric marks AV in rows 1-15; global marks AI in rows 1-2 and leaves numbered
rows 4-6 blank. The source's unusual water-table "GAS METER FAILURE" wording is
retained, not corrected. Expected memberships are authored in
`bas_engine/tests/test_point_headers.py`; graph output supplies only test input.

Primary research corroborates the separation, but is not project authority:
[UFGS 23 09 00](https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2000.pdf),
sections 3.3.10.6-13 distinguish I/O, object/property, trend, alarm and
configuration information. Accessed 2026-09-09. No guide defaults are imported.

Falsifiable checks: exact typed columns; preserved child-header citations; exact
positive row memberships; no alarm/trend-only additions; all original cells
unchanged; missing structural identity refused; contradictory scope refused;
existing Python suite and transport still pass. Real recovered table projection
is tested separately from source-table recovery and from installed quantities.

Baseline reproduced: six failures / six passes in `evidence/point-header-before.log`.
The current graph/takeoff/reference evaluators don't call the BAS Python adapter,
so this consumer-only edit cannot mix revisions in those live graph comparisons.

Verified candidate: 73 Python tests pass (all original 61 plus the new 12),
mypy passes nine source files, seven BAS transport tests pass; MCP typecheck
and build pass. Fresh real CLI compile preserves every non-`bas_math` field,
and the entire earlier EngineResult is unchanged for both original fixtures
when compared by invoking baseline/current Python directly with identical input.
Four previously untyped matrices now contribute four declared AI rows and
fifteen software-value rows. Full result remains explicitly review-required.
