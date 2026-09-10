# BAS math engine

The same bounded Python transport also accepts an exclusive `point_lists`
envelope containing Session source context and indexed tables. It returns
`bas_point_lists_v1`: source-bound listed observations, sparse/uninterpreted
column accounting and supported explicit controller footnotes, with no installed
quantity total. Both UI production compile and MCP return this additive record.
See [point evidence contract](../docs/bas-production/POINT_REVIEW_CONTRACT.md)
for supported patterns, limits and unfinished review/persistence integration.

An exclusive `assignment_demand` envelope accepts a verified capture/head,
retained point observations and explicit scoped assignments. The shared workflow
service establishes source membership before invoking Python. Output
`bas_assignment_demand_v1` retains each original observation, multiplication
factor, assigned listed value, qualifications and unobserved cells. Attributes
are not quantities. Known subtotals are not unique requirements or field-wiring
counts; project/installed totals stay unresolved. This path uses existing I/O
vector arithmetic without supplying default hardware, protocol, spare or license
policies. It does not change legacy `calculate` or indexed table results.

The UI's `/__ot/bas-assignment-demand` and MCP compile option invoke the same
service and persist `bas_assignment_4` calculations. Inputs/outputs are bounded
to 32 MiB; Python is bounded to 30 seconds and the HTTP process to 45 seconds.
Cancellation propagates to the owned Python process. A rejected/late response
does not overwrite changed workspace state. There is no static-host or browser
fallback, authenticated reviewer identity, approval or deployment provisioned
by this feature.

The exclusive `assembly_quantities` envelope carries a validated
`assembly_register`, equipment-ID/scope projection and capture/equipment/assembly
heads. `assemblies.py` calculates declared physical component contributions:
per included equipment or once for a nonempty selected group. It retains original
conditions, lifecycle, quantities, responsibility claims and source IDs. Unknown
quantity is null even under exclusion; an unresolved applicable condition cannot
produce a known contribution. There is no project, unique-device or installed
total. Shared source/ownership validation runs before Python; Python also rejects
foreign members, overlapping source consumption and malformed decisions.

`/__ot/bas-assembly-quantities` and the MCP option call this same bounded service
and append `bas_assembly_5` history. Dependency changes invalidate calculations;
they do not delete them. Exact retries reuse retained results. Browser code does
not reimplement multiplication. The existing 32-MiB/30-second Python and 45-second
HTTP limits apply; unsafe JavaScript-range results reject rather than round.

One deterministic implementation for the existing Takeoff UI and MCP compile
path. No product catalog, model calls, PDF parsing, or project-spec ingestion.
See [the research and mathematical proofs](../docs/BAS_MATH_RESEARCH.md) and
[real-blueprint verification](../docs/BAS_MATH_PROOF.md).

## Install and verify

From `opentakeoff/`, using Python 3.11 or newer:

```sh
python3 -m venv .venv-bas
.venv-bas/bin/python -m pip install './bas_engine[test]'
.venv-bas/bin/python -m pytest bas_engine/tests -q
.venv-bas/bin/python -m mypy --config-file bas_engine/pyproject.toml bas_engine
```

The Node bridge uses `OPENTAKEOFF_BAS_PYTHON`, then the checkout's
`.venv-bas/bin/python`, then `python3` on PATH. For a Windows virtual environment,
set `OPENTAKEOFF_BAS_PYTHON` to its `Scripts/python.exe`. Runtime needs Pydantic
V2; pandas, pytest and mypy are development/dataframe-adapter dependencies.
MCP builds package the same Python sources under `dist/python/bas_engine`.
They do not package an interpreter or install system dependencies for you.
With that runtime configured, `node scripts/smoke-bas-dist.mjs` from `mcp/`
verifies the built server's actual BAS tool response over MCP stdio.

The browser uses its existing local production-compile endpoint. A static-only
host cannot launch Python; it needs that existing server-capable endpoint and
the configured runtime. There is no client-side fallback math engine. Missing
Python or dependencies yields an explicit `bas_math.status="unavailable"` while
preserving the original compile result. This branch does not provision a cloud
service or change the optional AI sandbox.

## Typed Python API

```python
from bas_engine import EngineRequest, calculate

request = EngineRequest.model_validate({
    "groups": [{"group_id": "AHU", "quantity": 3}],
    "point_list": [
        {"group_id": "AHU", "point_id": "SAT", "physical": {"AI": 1}},
        {"group_id": "AHU", "point_id": "fan", "physical": {"DO": 1}},
    ],
    "hardware": {
        "profile_id": "abstract-block",
        "rigid": {"AI": 2, "AO": 2, "DI": 2, "DO": 2},
        "universal_inputs": 4,
    },
    "spare": {"basis": "demand_addon", "numerator": 15, "denominator": 100},
})
result = calculate(request)
assert result.physical_total.AI == 3
assert result.hardware[0].blocks_total == 3
```

This is an abstract example, not a controller selection. `rigid` inputs exclude
the additional UI pool. Instances cannot share terminals unless the group
explicitly declares `allocation="shared_pool"`. That option is valid only when
the physical architecture permits pooling. The returned assignment reserves UI
once across AI and DI; it cannot cover AO or DO.

The indexed-table adapter accepts explicit HARDWARE POINTS / SOFTWARE POINTS
parents with retained directional/value subheadings. It preserves the indexed
cells and subheader evidence; trend, alarm and graphics flags do not create
extra channels or variables. Conflicting physical/software scope is unresolved.
This projection covers each table once. It does not interpret every controller
footnote, establish installed equipment, or prove source completeness. See the
[header contract and source-based tests](../docs/bas-production/POINT_HEADER_CONTRACT.md).

For SOO-only, use `soo` instead of `point_list`. For both, supply both arrays and
align the same `group_id` and `point_id` explicitly. Never align unrelated points
by row order or label similarity. Each row is per equipment instance; group
quantity applies exactly once. Reconciliation preserves the identity union and
forms the elementwise maximum **capacity envelope**, with warnings on conflicts.
It is not an RFI resolution or permission to purchase both contradictory devices.

`None`/omitted sources differ from an explicit `[]`. Every point needs a defined
group. Duplicate point identities within a source, duplicate policy/network
identities, negative/fractional/bool counts, unknown fields, and invalid boxes
are rejected. `calculate` revalidates nested model state at its boundary.

For a dataframe with explicitly mapped physical-count columns:

```python
from bas_engine.adapters import DataframeColumns, dataframe_requirements
rows = dataframe_requirements(frame, DataframeColumns(
    group_id="equipment", point_id="signal", AI="ai", AO="ao", DI="di", DO="do"
))
```

Dataframes must provide integer cells in all four physical columns. Missing,
NaN or ambiguous cells do not become zero. Software variables belong in the
typed `soft` list, not a physical column.

## Process interface and integration

Run `python -m bas_engine` from `opentakeoff/` (or anywhere after installation),
passing one JSON object on stdin: `{"request": <EngineRequest>}` or
`{"blueprint": <BlueprintInput>}`. Exactly one is required. Output is one
Pydantic-validated `EngineResult`; validation failures return exit code 2 and a
structured error, without echoing offending source text. Request/response size
is capped at 32 MiB. Node imposes a 30-second timeout and rejects integers outside
JavaScript's exact range rather than displaying rounded counts. Python itself
uses arbitrary-precision integer arithmetic.

The existing `compile_corpus_takeoff(kind="bas_points")` calls
`mcp/src/productionTakeoff.ts` from both MCP and the UI's production CLI. Its
optional `bas_math` options are:

- `hardware`, `spare`, `licenses`, `serial_routes`, `ip_closets`;
- `group_overrides`, using group IDs returned by a prior compile;
- `soo`, explicitly typed, cite-backed SOO requirements. Additional SOO-only
  groups require a matching group override.

No default hardware, spare percentage, endpoint placement or equipment
replication is guessed. Indexed tables are read once per table scope. A strong
directional point-matrix shape can establish scope without a standard title.
Explicit nested hardwired/integration subheadings may be read from the first
indexed row; generic ANALOG/DIGITAL headings do not establish direction.
Ambiguous cells/duplicate channel mappings are withheld with diagnostics.
Trend, alarm and read/write flags do not create copper or extra soft variables.
The original graph, compiler, cells, citations and quantities are not mutated.

## Engineering policies and limits

- Spare add-on: `ceil(live * (denominator+numerator)/denominator)` per type.
  Installed-unused: `ceil(live*denominator/(denominator-numerator))`. The two are
  intentionally distinct. `minimum` is an optional absolute channel minimum per
  allocation pool, not an additional percentage or an inferred minimum device.
- Serial networks require ordered nodes, explicit device/address, electrical
  micro-unit-load and millimetre distance limits. Greedy splitting is exact only
  for a contiguous linear route with a permitted local head end at each segment
  start. Unknown distance returns `capacity_only`, not verified wiring. MS/TP
  manager budgets and Modbus addressed-server limits differ. This is not an
  arbitrary floor-plan cable-routing solver.
- IP uses explicit fixed closets, available switch ports and per-link limits.
  An overlength link is infeasible even if more same-closet switches would have
  spare ports. Upstream hierarchy, bandwidth, PoE and security need separate
  engineering evidence.
- Soft identity includes pool, scope, protocol and declared device/object
  identity. `equipment_group` scope replicates with quantity; `project` scope
  deduplicates across groups. Zero equipment never creates soft demand. License
  weight and multiplicity are independent integers. Policies use base-plus-packs
  or ascending absolute tiers. Missing policies and overflow are explicit.
- `project_complete` is always false: these equations cannot certify that all
  blueprint requirements, installation details or contractual scope were found.
  `status="calculated"` means the supplied constraints were calculable, not a
  complete project takeoff. Warnings/errors yield `review_required`.

Schema sources are `models.py` and `adapters.py`. Programmatic JSON Schema is
available via their Pydantic `model_json_schema()` methods. Tests include exact
small-vector/route enumeration, huge replication without materializing devices,
negative controls, transport failures and source-reviewed real table fixtures.
