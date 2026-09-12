# Driving OpenTakeoff from an AI agent (MCP)

OpenTakeoff ships an [MCP](https://modelcontextprotocol.io) server—[`mcp/`](../mcp/README.md)—that
puts the real takeoff engine on stdio for your MCP client. Not a wrapper around the UI: the server imports the same
`web/src/lib` modules the canvas runs, so One-Click Area, scale detection,
vertex snapping, and the totals math behave identically, and everything it
commits round-trips into the app as a normal saved takeoff.

This page walks the surface in depth, in the order an agent reaches for it. Two
shorter reads sit either side of it: [`AGENT_GUIDE.md`](AGENT_GUIDE.md) is the
operating manual—how a takeoff is run, what withholds, what refuses—and
[`mcp/README.md`](../mcp/README.md) is the tool-by-tool reference.

## Setup

Development `bas_scope_review` exposes retained-data catalogs, scope previews,
source-reference mapping candidates and append-only scope/coverage proposals.
Choose a reviewed source set, use exact returned targets/basis, inspect original
sources, then explicitly record applicability. A candidate is not a verdict;
an agent proposal is not human approval. `replay` compares original and current
dependencies. Bounded views/full operation exports are separate from normal
project backups. See [scope commands](../mcp/README.md#scope-and-source-coverage).

Development `bas_issue_review` exposes current findings and append-only corrective
history through shared BAS services. Inspect exact findings/head/basis, record an
observation, edit the underlying domain using its existing tools, then replay and
record no-longer-reported status only when changed inputs justify it. All decisions
are self-declared agent proposals, not waivers or approval. Bounded completed views
and full operation exports are separate from durable project backup. See
[issue commands](../mcp/README.md#issue-decisions).

Development `bas_drawing_review` works directly against retained BAS history,
including a restored session without active plans. Inspect captures/events in
bounded pages, prepare explicit source accounting, then record against the exact
returned head and dependency digest. Results are agent proposals, never approval
for page accounting. The additive `revision` command invokes shared requirement
and Python-backed quantity comparison, with explicit pinned inputs, paged reads,
full JSON export and replayed proposal history. Export afterward to persist
Session changes. See the
[drawing command contract](../mcp/README.md#drawing-correspondence).

Source-inclusive BAS recovery is a two-call `import_takeoff` operation:
preview `restore_evidence_bundle: {action: "preview"}`, then commit the returned
`preview_id` with `{action: "commit", preview_id, directory}`. The existing output
parent receives a new operation-owned directory containing all originals, previous
state and a re-importable merged backup. Shared merge/source rules and complete
Python replay gate Session adoption. Read-only `verify_evidence_bundle` remains
separate. See the [tool reference](../mcp/README.md) for limits and file guarantees.
No old PDF becomes active counting input. Use `load_plan merge:true` to add active
plans afterward; plain load replaces the Session. Recovery does not approve a
takeoff, establish source coverage, or certify the design.

For BAS engineering, install the [shared Python engine](../bas_engine/README.md).
UI and MCP use the same `productionTakeoff` orchestration and Python process;
there is no separate browser math implementation. `bas_math` is additive to the
existing BAS compile response. Never treat its conservative conflict envelope
as resolved drawing truth or its `calculated` status as project completeness.

The additive `bas_point_lists` record retains listed observations with source
versions/pages, original cells, sparse/uninterpreted columns and supported
controller notes. It does not establish installed quantity or field wiring.
Do not substitute alarm/trend flags for I/O, or an unobserved cell for a verified
zero. Its unavailable state is separate from math-policy failure. Durable
equipment assignment, review and approved snapshot integration remain in progress.

`bas_workflow` adds durable point-evidence captures with content fingerprints and
source manifests. `export_takeoff` carries the Session's captures; `import_takeoff`
validates and merges them without changing the operator's current selection.
Source PDFs are separate, and imported evidence is not an approved or freshly
recomputed result. A capture failure is disclosed as `bas_workflow_error` without
replacing source observations or engineering output.

Revision `bas_evidence_2` retains original positioned SOO text as well. The
optional `bas_review` input to BAS compile adds/removes explicit comparison
links with a reason, operation ID and expected review head. This option mutates
Session review history as `agent_proposal`; it never approves a takeoff.
Recompiles return retained history, and export/import preserves it. Stale heads,
invalid source references and divergent histories reject. Source text stays
immutable; matching a listed point is not verified wiring or installed quantity.
See [the workflow contract](bas-production/SEQUENCE_WORKFLOW_CONTRACT.md).

Development revision `bas_equipment_3` retains original equipment tables as well.
The additive `bas_equipment` index exposes occurrence/member IDs and the current
register/head. `bas_equipment_review` explicitly records scoped equipment and
matrix assignments, with reasons and per-equipment/system-once applicability.
This writes proposal history; omit it for a read/compile. Stale heads, foreign
members and duplicate applications reject before mutation. Full source tables
and old decisions survive export/import. No installed quantity, equipment demand
derivation or approval is implied. The Takeoff Equipment editor uses this same
service. Explicit SOO links add source-backed `sequence_comparisons` to the index;
equipment-capture failures return `bas_equipment_error` without erasing valid
point/SOO evidence. See
[equipment assignment inputs and limits](bas-production/EQUIPMENT_ASSIGNMENT_CONTRACT.md).

Optional `bas_assignment_demand: {capture_id, expected_equipment_head}` on the
same BAS compile invokes the shared Python assignment service. It retains a
`bas_assignment_4` calculation with original observations, exact selection,
exceptions, multiplication factors, source gaps and qualifiers. Known listed
subtotals are not unique requirements, installed quantities or field wiring;
no combined project total is invented. The UI's **Calculate assigned values**
uses this same service. Exact-dependency retries reuse the saved result. Stale
requests or concurrent Session changes reject before mutation. Export/import
preserves earlier results; their dependency heads determine whether they are
current, regardless of import order. Fingerprints are local corruption detection,
not authenticated provenance or engineering approval.

Development revision `bas_assembly_5` adds immutable assembly review and shared
Python quantity history. BAS compile returns `bas_assemblies`: owned drawing
declaration IDs, the saved register, dependency heads and unresolved findings.
Optional `bas_assembly_review` accepts
`{operation_id,capture_id,expected_head,expected_equipment_head,reason,register}`.
The register holds source-backed or explicit component decisions, scope/members,
conditions, lifecycle, separate activity claims and reasoned resolutions.
Optional `bas_assembly_quantities` accepts
`{capture_id,expected_equipment_head,expected_assembly_head}` and returns a saved
calculation with full original records and exact per-equipment/selected-group
contributions. Unknown is not zero; assigned is not installed. Stale/foreign
requests and concurrent workspace changes reject before mutation. Earlier
history survives export/import and equipment withdrawal. A read-only assembly
summary failure is reported as `bas_assembly_error` without discarding valid
point/SOO evidence; requested assembly writes fail rather than partly commit.
See [the assembly contract](bas-production/ASSEMBLY_REVIEW_CONTRACT.md).

Component rule v2 supports complete, explicitly singular lists of the reviewed
terminal-controller, occupancy-sensor, static-pressure-sensor and supply-air
damper roles. It is opt-in through a new reasoned `bas_assembly_review` event
with `register.source_rule_version: "explicit_component_declarations_2"` and
current expected heads. V1 history and source interpretation remain unchanged;
old calculations become stale. Inspect new declarations before separately
assigning equipment applicability. No default kit or extra installed count.
See [the versioned list contract](bas-production/COMPONENT_LIST_RULE_CONTRACT.md).

The development BAS compile accepts `bas_engineering_review` with operation and
capture IDs, expected engineering/equipment/assembly/SOO heads, a complete
declared-resource/check register and a reason. It records an Agent proposal
through the shared source-validation and Python service, not human approval.
`bas_engineering_inspect: {capture_id}` explicitly replays retained results.
The additive `bas_engineering` projection separates dependency freshness from
`requires_python_replay` / `verified_shared_python_replay`. Unknown ratings,
excluded failures and prior history remain visible. No installed quantities,
guessed routes or whole-project compatibility certification are produced.
See [the engineering input and evidence contract](bas-production/ENGINEERING_COMPATIBILITY_CONTRACT.md).

`export_takeoff {engineering_workbook_path: "/path/engineering-review.xlsx"}`
replays saved engineering history and writes the same non-commercial workbook
as the browser. It retains source locations, original inputs, exclusions and
stale/superseded decisions without approving them. The inline annotation payload
is unchanged. Use only one output path per call. Existing XLSX files require `overwrite: true`; no ZIP
signature is accepted as proof of ownership. Keep the JSON archive and source
PDFs for reimport. See [the export contract](bas-production/ENGINEERING_EXPORT_CONTRACT.md).

Alternatively, `export_takeoff {evidence_bundle_path: "/path/project.otbas.zip"}`
creates an unapproved evidence backup containing exact saved JSON and every
physical PDF version in BAS history. Missing historical originals can be supplied
in `original_pdf_paths`; hashes/lengths establish identity. Existing ZIP files
require `overwrite: true`; staging/cancellation/collisions preserve old outputs.
`import_takeoff {path: "/path/project.otbas.zip", verify_evidence_bundle: true}`
verifies all archive entries and original digests without loading, merging or
restoring anything. No plan is required. The optional `bas_evidence_bundle`
receipt explicitly reports `restored: false`, `source_byte_verification:
"verified_now"` and `calculation_verification: "not_python_replayed"`. These
unencrypted, unsigned archives do not grant approval or certify source completeness.
Add `replay_calculations: true` only with `verify_evidence_bundle: true` to also
replay every saved assignment, assembly and engineering result through the shared
Python calculators. The optional `workflow_replay` receipt binds the exact
workflow digest and all historical record IDs. `calculation_verification` then
reports `verified_shared_python_replay` or `no_saved_calculations`; empty history
is not calculation coverage. Wrong results, unsupported rules, runtime failure,
size limits and cancellation reject without a partial receipt. The service has
a 30-second replay deadline and bounded 1,000-record/30 MiB batches. Successful
historical replay does not mean current dependencies, approval or restoration.
See [format and bounded acceptance](bas-production/EVIDENCE_BUNDLE_CONTRACT.md).

For the development project review queue, add `bas_project_review: {capture_id}`
to `compile_corpus_takeoff` with `kind: "bas_points"`. It shares the browser's
source-linked saved-finding projection. Original failures, exclusions, unknown
codes and stale dependencies are retained. It does not change existing compile
fields, replay calculations, verify stored source bytes or approve a takeoff.
Findings are not a completeness score; readiness remains `not_evaluated`.
The current `saved_bas_findings_2` projection preserves occurrence identities
across canonical JSON restore; source evidence follows explicit table header
order without changing source values/boxes. Older standalone exports retain
their older rule/IDs and are not silently promoted to the current schema.
See [review and revision acceptance](bas-production/REVIEW_REVISION_CONTRACT.md)
for the remaining approval/source-retention work.

The additive internal `bas_issues_9` journal survives normal import/export and
older BAS writes. A retained acknowledgement is neither a waiver nor approval;
its finding and any recorded absence must be replayed against pinned inputs.
Public issue-action commands and approved snapshots remain in development.

To inspect a historical citation, call `view_sheet` with its saved BAS `page_id`
as `sheet` and optional `original_pdf_path` for missing original bytes. This
isolated read-only mode verifies source ownership, hash, page count and saved
frame, and never adds the old drawing to current extraction. `region` outlines
the supplied original box, while `region` in the reply describes the padded
display crop. Active overlays, grids and marks are refused. Whole-page review is
available for legacy histories lacking frames; located highlights require a
matching saved frame. Byte/frame verification does not approve a takeoff.

```bash
cd web && npm install        # the engine's pdf.js lives here
cd ../mcp && npm install
```

Register the server with your MCP client (any stdio client):

```json
{
  "mcpServers": {
    "opentakeoff": {
      "command": "node",
      "args": ["--import", "tsx", "/absolute/path/to/opentakeoff/mcp/server.ts"]
    }
  }
}
```

Never point a client config at `npm start`—npm's banner goes to stdout,
which is the MCP wire. `node --import tsx` is the whole invocation.

By default the server hands every client all 53 tool schemas at once. Set
`OPENTAKEOFF_MCP_STAGED_TOOLS=1` in the server's environment to stage the
surface instead: only the setup tools start enabled, and the agent opens the
`measure` / `revise` / `handoff` groups on demand with `open_tool_stage` as
the takeoff reaches them—details in
[`mcp/README.md`](../mcp/README.md#staged-tool-exposure-opt-in). Needs a
client that honors `tools/list_changed`; leave it unset otherwise.

## What the agent gets

Fifty tools, in the order an agent tends to reach for them:

- **Open and orient**—`load_plan`, `sheet_info` (including the sheet's PDF
  layer table—Optional Content Groups with a classified role, confidence,
  and default visibility per layer), `set_scale`, `sheet_context`
- **Load the set**—`load_plan` (default replaces; `merge: true` adds—plans +
  schedule + addenda as one working set, #152)
- **Navigate the set**—`sheet_graph` (the plan-set index: sheet roles with
  evidence, schedule tables found, every room tag with its name, detail
  callouts—how an agent decides *what* to measure without a human
  enumerating the rooms), `resolve_tag` (one room tag → its room-finish
  schedule row → each code's finish/material definition, every edge carrying
  a citation; unresolved comes back *with a reason*, never as silence),
  `find_schedule` (kind → sheet + title + headers + a `view_sheet`-ready
  region). Real-set shapes are handled natively (#87 phases 2–3): a
  schedule **continued across sheets** ("… SCHEDULE — CONT'D") reads as ONE
  table—rows resolve regardless of which sheet carries them, each citing
  the sheet the ink is on, and `find_schedule` returns one match whose
  `parts` list every fragment; **rotated column headers** (a quarter-turn
  header band) anchor the table and are flagged `rotated_headers`; and on a
  **multi-building set** the room key is (building, number), not the number
  alone—rooms and tables carry their building, an unqualified reused
  number refuses *listing the candidate rows per building* instead of
  first-matching, and a qualified tag (`"A-134"`) picks the building the
  set names; and **revision markers**—a text marker (`Δ2`, `REV 2`) or a
  **drawn delta** (a bare digit inside a digit-scale triangle of linework—the
  common CAD convention, proven from the sheet's vector geometry and
  flagged `drawn: true`) beside a schedule row or a room bubble attaches
  there and rides
  `resolve_tag` as `revisions` (the codes returned are the post-revision
  answer, but the ink changed under that delta—view the marker and check
  the addendum before pricing), the set-wide list is `sheet_graph.revisions`,
  `find_schedule` counts `revised_rows` per table, and a marker never bands
  into a cell or mints a room key. A revision **cloud** with no text marker
  is linework—invisible to this text-layer pass, and stated as such rather
  than guessed at. Real-set column shapes are read too (#87 phase 3b, every
  one of them found by running a real bid set): a **two-tier header**—a
  merged `WALLS (PLAN DIRECTION)` parent over `N | E | S | W`—anchors each
  sub-column under its parent as `WALLS N` … `WALLS W` with real bounds, so a
  left-aligned wall code never lands in the narrow BASE column beside it; a
  neighboring legend cannot bleed into the last column; finish tables headed
  `SYMBOL` (no CODE, no MARK) extract and chain; and a **DOOR / WINDOW /
  PARTITION schedule is refused as a finish table** by title—those carry a
  MARK column too, and a finish code chaining to a door mark is a confidently
    wrong product—with the refusal named in `notes`. How this is measured, what
  it scores, and what it still cannot read: [docs/SHEET-GRAPH-EVAL.md](SHEET-GRAPH-EVAL.md)
- **Schedule-driven takeoffs (HVAC/BAS)**—`compile_corpus_takeoff { kind }`
  reads an equipment, BAS-points, or control-valve schedule straight off the
  sheet graph—no shape-tracing—and returns one compiled envelope per kind
  (`categories`, `totals`, `page_accounting`, `exclusions`). Follow it with
  `reconcile_schedule_plan { family? }`, which cross-references those
  schedule rows against what a symbol sweep actually finds drawn on the plan
  sheets: one row per tag, carrying `scheduled_qty` (the printed schedule
  count), `installed_qty` (drawn instances swept from the plan), and a
  `status` (matched / schedule-only / plan-only / …), citing both the
  schedule row and the plan ink. Report both quantities and the status per
  line, never the schedule count alone—the same discipline as `export_report`
  below.
- **Measure**—`one_click`, `detect_rooms` (both take `layers {include,
  exclude}` to override the sheet's stated layer roles for a call),
  `measure_polygon`, `measure_line`, `measure_surface` (wall SF: an open run
  × the condition's height—the H knob), `place_count` (EA markers, no scale
  required)—all five of the engine's measure roles—plus `symbol_sweep`
  (marquee ONE example of a repeated plan symbol—a drain, a threshold
  marker—and every placement is found deterministically from the vector
  linework, under rotation and mirroring, scored against a commit bar with
  near-misses *withheld with reasons*; `affine` (ON by default—docs/SYMBOL-
  SWEEP-CLEAN-CORPUS-GOAL.md's default flip; pass `{enabled: false}` for the
  old rigid-only search) also searches continuous off-grid rotation and
  bounded anisotropic stretch/shear—a symbol drawn rotated ~37° or stretched
  to fit a tight run is otherwise invisible to the search entirely, not just
  low-scoring—and discloses the actual fit
  (`rotation_deg`/`scale_x`/`scale_y`/`shear_deg`/`mirrored`/`via`) on the
  row's `transform` field; a fit past `max_stretch`/`max_shear_deg` (default
  1.5×/10°) is never a silent match, it comes back `withheld` naming the
  measured distortion; `commit: true` places the matches as
  EA count markers in one undo step; `scope: "set"` sweeps the whole working
  set counting on plan-role sheets only, so the seed can be the assembly on a
  detail or legend sheet—the fingerprint source, itself never counted, its
  exclusion disclosed) and `sweep_schedule_row` (take a mark off from its
  schedule row: the row is read as the condition's cited source, the marker
  the tag is drawn as is fingerprinted at a drawn occurrence—corroborated
  at a second one where the set allows—and every plan sheet is swept, a
  match counting only where geometry AND the row's own tag text agree;
  markers labeled with a sibling key are excluded and say whose they are,
  unlabeled ones are withheld as questions, and a row whose tag cannot be
  geometrically anchored is *refused with the reason*—a fingerprint is
  never guessed from text alone). Scanned sheets work
  (#154): where vectors can't bound the room—an image-only scan, or a scan
  wrapper whose only linework is the title block—`one_click` and
  `detect_rooms` fall back automatically to flooding the sheet's rendered
  pixels with the same raster engine the canvas uses, disclosed as
  `raster_traced` on the reply and on the shape's origin; vector always wins
  where it works, and a raster ring's corners are unsnapped (a scan has no
  true endpoints)
- **Derive**—the quantities that follow from rooms already committed, instead
  of measuring them a second time. `derive_base` mints base LF per room
  (perimeter *minus the door openings you state*—your claim, recorded on
  `origin.derived`; the tool never guesses a door). `derive_transitions` mints
  the line where two finishes meet, and is built around a fact worth knowing
  before you call it: **flood-traced rooms do not share edges.** A trace fills
  to the wall linework, so two rooms across a partition sit four to eight inches
  apart and a shared-edge test finds nothing. What is there is proximity, in two
  kinds that are never conflated—a **butt joint** (rings running together
  inside one open space, within an inch) *is* the transition and commits; a
  **wall-separated** run means adjacent rooms whose transition is a threshold in
  a doorway, and nothing in the trace record locates a doorway (the flood engine
  reports how *much* boundary it sealed, never where). Those come back in
  `withheld` with their length, their gap in inches, and an `at` point to
  `view_sheet`—questions to answer by looking, and `withheld_lf` is never
  folded into `total_lf`. Both refuse all-or-nothing and land as one undo step.
  `apply_rules` re-runs the **correction rules** an estimator taught the canvas
  (#88)—"every room like this loses the mechanical chase"—which arrive with
  `import_takeoff` and are never minted over the wire (a rule *is* an
  estimator's correction; minting stays behind the canvas's human
  Preview→Apply gate). Evaluation is the same pure `rules.ts` engine the
  canvas Preview runs, the commit is the one batch its Apply makes
  (`reviewed: false`, one undo step), the per-rule disclosure in the reply is
  the preview an agent gets, and re-running is idempotent by construction—anything
  an existing deduct covers is dropped by the engine
- **Cut**—`cut_out` puts a real hole in a committed floor shape, the way the
  canvas's Eraser does (#137): the same `cutout.js` boolean subtract, so the
  parent's net is set subtraction (overlapping cuts never double-deduct) and a
  hole *adds* perimeter. The ring must sit fully inside the parent—an
  edge-crossing cut is a boundary correction and refuses (the canvas clips it;
  over the wire the rule is refusal-over-guessing). One undo step restores
  parent and hole together, and deleting the deduct later reverts the cut
  (multi-cut parents rebuild from the pristine snapshot minus survivors—the
  canvas's own delete semantics, ported as the spec)
- **Revise**—`edit_shape` (all five roles), `edit_materials`,
  `edit_condition` (waste %, ×N multiplier, `height_ft`, and the roll-goods
  `roll_setup` opt-in—the reply echoes the figured order), `delete_shape`,
  `undo_last`, with `list_shapes` as the mid-session inventory the mutating
  verbs assume you have
- **Condition twins**—`duplicate_condition` (the same finish measured
  somewhere else with its own preparation underneath: the twin arrives carrying
  the original's materials and keeps *following* them, so a coverage-rate fix on
  the original reaches every twin that hasn't touched that row) and
  `split_condition` (cut a twin loose—following rows freeze at their current
  values and the original stops reaching it). One finish in two areas is neither
  one condition nor two; both are reversible with `undo_last`
- **Read the sheet**—`read_sheet_text`, `find_text`, `view_sheet` (render a
  sheet or crop to PNG with an optional calibrated measuring grid and
  committed-shapes overlay—the agent's eyes and its self-check)
- **Annotate**—`annotate` (cloud, highlight, text, callout, arrow—plank/seam
  direction—keynote bubble, and dimension: two endpoints, drawn
  as a dimension line labeled with the measured length at the sheet's scale,
  refused on an unscaled sheet), `list_annotations`,
  `link_annotation` (notes *about* the work, never measurements of it;
  attaching one to a finish tag is what makes it part of that scope rather
  than a floating remark—it then wears the condition's color on the canvas
  and in the marked set)
- **Sign**—`mark_verdict`, `delete_verdict` (the agent half of the approval
  family: the graphite AGENT diamond, the agent's pencil-signature on work it
  checked—anchored on a committed shape or dropped at a sheet point, listed
  in `list_annotations`' `verdicts[]`. The estimator's APPROVED ring is the
  other half and stays human-only: these tools take no actor input, so no
  agent path can mint or lift the human's ink. A verdict touches no quantity)
- **Report**—`takeoff_summary` (quantities only—materials stripped),
  `export_takeoff` (the raw `opentakeoff.takeoff_canvas.v1` canvas payload—materials
  as config rows, importable by the app), `export_report` (the
  computed `opentakeoff.report.v1` Report document—waste-adjusted nets, the
  materials buy list as order quantities, per-sheet subtotals, scale
  provenance; the contract for pricing consumers), `export_marked_pdf` (**the
  marked-up planset**—the plan sheets vector-copied with shapes, hatches,
  quantity chips, and annotations burned in, plus a legend cover; the
  deliverable a human reviews, with machine-traced work disclosed as pending
  review on the document itself)

  All three write wherever you point them—`path` is not confined to a working
  directory, because the marked set belongs in the job folder. They will not
  overwrite a file they didn't write, though: a previous export of ours is
  replaced silently (the ordinary re-export loop), and anything else is refused
  until you pass `overwrite: true`. Data-loss protection, not a sandbox—see
  [`SECURITY.md`](../SECURITY.md).

The full reference—including the coordinate contract (image px at render
scale 2.0, origin top-left) and the scale-gate rules—is in
[`mcp/README.md`](../mcp/README.md), which is the list to trust: this page is
prose and `mcp/src/tools.ts` is the source of truth for what actually
registers.

Two rules carry over from the app unchanged:

- **The scale gate.** No quantity leaves the server without a scale on that
  sheet—and a scale the agent sets is **unconfirmed until a human confirms
  it in the canvas** (`confirmed: false` on the reply,
  `scale_unconfirmed` on the summary, `scale_confirmed` on the
  export/report). A detected scale note is a suggestion the agent must adopt
  explicitly (`set_scale { use_detected: true }`); measuring tools refuse
  with the exact hint (`Set the scale for <sheet> first—use set_scale
  (detected: 1/4" = 1'-0").`), and a bare `one_click` returns px-only numbers
  with a warning rather than fabricating square feet.
- **Provenance.** Every shape committed by `one_click`/`detect_rooms` carries
  the same `origin` receipt the canvas mints: method, normalized seed,
  hatch-filter flag—and `raster_traced` when the boundary came from scan
  pixels rather than vector linework, so a pixel-bounded trace is
  distinguishable from a vector-snapped one in the record. The sealed engine's
  own account of each trace rides too, stamped centrally at the commit so no
  flood path can ship without it: `confidence` (0–1, with
  `confidence_factors` naming every deduction) scores the trace from the
  engine's internal signals—`gap_sealed_px` when part of the boundary is a
  synthetic seal across a real opening, `door_wedges`/`ring_interiors` for
  annexed door swings and closed-ring interiors, `min_pass_px`/
  `min_pass_delta` when the feet-true minimum-passage rule changed the
  answer, `gap_bridged_px` for the pinhole rescue. Read the score as a review
  prioritizer, never a verification: 1.0 means every signal the engine can
  see came back clean, not that the trace is right, and a low-confidence
  trace is a `view_sheet {overlay: true}` audit prompt, not a fact. The same
  fields appear on the tool replies, so an agent can triage before it
  commits.

And one capability deliberately does **not** carry over: **stitching**. The
canvas can join sheets split at a match line into one composite surface, but
there is no agent verb for it—aligning the match line means clicking the
same drawn wall junction on both halves, a human-judgment act whose failure
mode (a subtly sloppy join) silently skews every quantity that crosses the
seam. Same doctrine as the scale gate, taken one step further: here the agent
doesn't even propose. A human stitches and aligns in the canvas; an agent
works the member sheets individually and leaves seam-crossing rooms to the
person at the screen. See the Limits section of
[`mcp/README.md`](../mcp/README.md) for the round-trip caveat that follows.

## An example session

An agent asked to *"take off the carpet on this floor plan"*—tool calls
verbatim, replies abridged:

```
▸ load_plan  { "path": "/plans/sample-plan.pdf" }
  { "file": "sample-plan.pdf", "page_count": 1,
    "sheets": [{ "sheet": "sample-plan.pdf", "width_px": 2448, "height_px": 1584,
                 "width_pt": 1224, "height_pt": 792,
                 "sheet_number": "A-101", "detected_scale": "1/4\" = 1'-0\"" }] }

▸ read_sheet_text  { "sheet": "sample-plan.pdf",
                     "region": { "x0": 1468, "y0": 871, "x1": 2448, "y1": 1584 } }
  { "items": [ { "str": "A-101", "x": 1970, "y": 1284 },
               { "str": "SCALE: 1/4\" = 1'-0\"", "x": 1730, "y": 1348 } ],
    "text": "A-101 SCALE: 1/4\" = 1'-0\"" }

    The title block confirms the detected scale — adopt it explicitly:

▸ set_scale  { "sheet": "sample-plan.pdf", "use_detected": true }
  { "sheet": "sample-plan.pdf", "upp": 0.02778, "label": "1/4\" = 1'-0\"", "source": "detected" }

    Room labels from the page text double as click targets (same px space):

▸ one_click  { "sheet": "sample-plan.pdf", "x": 600, "y": 1084, "condition": "CPT-1" }
  { "status": "ok", "area_sf": 437.98, "perimeter_lf": 86.61, "nverts": 4, "shape_id": "shp-…" }

▸ one_click  { "sheet": "sample-plan.pdf", "x": 1640, "y": 1084, "condition": "CPT-1" }
▸ one_click  { "sheet": "sample-plan.pdf", "x": 600,  "y": 464,  "condition": "CPT-1" }
▸ one_click  { "sheet": "sample-plan.pdf", "x": 1600, "y": 464,  "condition": "CPT-1" }
  … three more rooms, ~438 SF each …

    Two of those rooms are actually tile — reassign, then let the derivations
    do the work that follows from the rooms instead of measuring it again:

▸ edit_shape  { "shape_id": "shp-…", "condition": "PT-1" }     … and one more

▸ derive_transitions  { "condition_a": "CPT-1", "condition_b": "PT-1", "condition": "T-1" }
  { "between": ["CPT-1", "PT-1"], "committed": 2, "total_lf": 53.88,
    "runs": [{ "length_lf": 26.94, "gap_in": 0.3, "at": [725, 784], … },
             { "length_lf": 26.94, "gap_in": 0.3, "at": [1715, 784], … }],
    "withheld": [], "withheld_lf": 0 }

    Both runs are butt joints (gap under an inch — one open space). Had the
    rooms been a partition apart, they would have come back in `withheld`
    instead: adjacency across a wall is a threshold in a doorway this cannot
    locate, so it is handed back as a question with a point to look at.

▸ takeoff_summary  {}
  { "conditions": [{ "finish_tag": "CPT-1", "shape_count": 2, … },
                   { "finish_tag": "PT-1",  "shape_count": 2, … },
                   { "finish_tag": "T-1",   "shape_count": 2, "lf": 53.88, … }],
    "totals": { … } }

    Look before trusting any of it, then finish with the deliverable:

▸ view_sheet  { "sheet": "sample-plan.pdf", "overlay": true,
                "region": { "x0": 500, "y0": 600, "x1": 1900, "y1": 1000 } }
  … PNG: committed shapes burned in, unreviewed machine work dashed …

▸ export_marked_pdf  {}
  { "path": "/plans/sample-plan - marked set.pdf", "sheets": 1, … }

▸ export_report  { "path": "/plans/sample-report.json" }
  { "schema": "opentakeoff.report.v1", "conditions": [...], … }
```

A click that misses is a readable answer, not a stack trace—outside the
building: `That space isn't enclosed on the plan linework—the fill spilled
through a gap or opening.`; in dense hatching or a text block: `Landed in
dense linework (hatching or text).`

## Where this sits

- The **MCP server** is the agent-integration surface: real tools, real
  quantities, stdio.
- The **[AI sandbox](../server/README.md)** (`server/`) is the other socket—a
  FastAPI adapter interface for plugging your own local *vision model* under
  the canvas's suggestion endpoints.
- Scanned (raster-only) sheets **are** supported (#154): where vectors cannot
  bound a room, `one_click` and `detect_rooms` fall back automatically to
  flooding the sheet's rendered pixels with the same raster engine the canvas
  uses, disclosed as `raster_traced` on the reply and on the shape's origin.
  Vector wins wherever it works—a raster ring's corners are unsnapped,
  because a scan has no true endpoints to snap to.
