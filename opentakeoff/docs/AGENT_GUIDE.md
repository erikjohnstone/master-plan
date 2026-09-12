# OpenTakeoff — The Agent Manual

The counterpart to the [user manual](USER_GUIDE.md). That one is written for the estimator at
the canvas; this one is written for the agent driving the same engine over
[MCP](https://modelcontextprotocol.io), and for the person wiring one up.

Everything an estimator does with a mouse, an agent does with a tool call, against identical
geometry: the server imports `web/src/lib/{oneclick,sheets,geometry,totals}` directly, so a room
you flood over stdio measures the same square footage as the same click on the canvas. There is
no second implementation to drift.

Development BAS evidence backup: `export_takeoff` accepts
`evidence_bundle_path: "/path/project.otbas.zip"`, mutually exclusive with JSON
`path` and `engineering_workbook_path`. It includes every physical original in
saved BAS history; use `original_pdf_paths` for unavailable historical files.
Matching is by SHA-256 and byte length, not filename. Existing ZIP files require
explicit `overwrite: true`. `import_takeoff {path: "/path/project.otbas.zip",
verify_evidence_bundle: true}` performs read-only preflight even without a loaded
plan. Its default receipt says `restored: false`: no merge, Python replay or approval.
Add `replay_calculations: true` to that preflight to check every saved assignment,
assembly and engineering result through the shared Python engine. Read the exact
`workflow_replay` receipt; `no_saved_calculations` is not a successful audit of
project calculations. Historical inputs remain historical. Replay does not repair
freshness, review coverage, approve a deliverable or restore anything.
For actual ZIP restoration use `restore_evidence_bundle: {action: "preview"}`,
read its merge counts and source requirements, then commit that `preview_id`
with an explicit existing `directory`. Do not mix this with read-only flags.
Commit always replays the complete merged history, retains all originals and
previous state, and adopts the shared merge. No loaded plan is needed for BAS-only
history. Filename-bound ink requires its exact original active. Use `load_plan`
with `merge: true` to add active plans after recovery; plain load still replaces
the Session. Restore is a new undo boundary, not `undo_last`. It does not approve
a deliverable, select current source scope or verify installed quantity.
Unencrypted local recovery files are not authenticated or guaranteed permanent.
Ordinary JSON import retains its previous semantics.

Development deliverable scope: use `bas_scope_review` to obtain source sets,
current pinned targets and available original pages. Explicitly select claims
and evidence-backed exclusions, preview, then record a proposed scope. Inspect
original pages before making applicability proposals; exact page/span-reference
suggestions are mapping candidates, never automatic interpretation or proof of
completeness. Replay historical reviews to expose changed dependencies and
overlapping contradictions. No scope or coverage action waives findings or
approves a takeoff. Persist the project journal and originals through normal
export/restore, not only the cached operation-result export.

Development issue review: use `bas_issue_review` to inspect current findings and
record exact observations with a reason and self-declared reviewer. Starting a
correction is not the correction itself; use the relevant existing domain tools.
After changing inputs, the shared service must replay the original finding and
confirm absence before recording no-longer-reported status. Reappearing findings
stay open. Acknowledgement/withdrawal never waive blockers or alter quantities.
History lists are lineage-only; selected `replay` verifies original occurrences
and recorded absence. PDF availability and Python replay remain separate checks.
Save Session history using `export_takeoff`; an exported operation result alone is
not a project backup. No issue action approves a deliverable.

Development drawing review: use `bas_drawing_review` directly on retained history,
including without active PDFs. Inspect paginated captures/events, prepare exact
page accounting, then record with the returned head/dependency digest, UUID,
reason and self-declared reviewer. MCP records are `agent_proposal`, never human
approval. Export Session changes explicitly. Incomplete page decisions retain
history without establishing a complete source set. Exact retained-text equality
does not establish unchanged drawing ink, requirements or quantities. Original
page IDs remain source-viewable; changing source correspondence does not rebind
old calculations or make stale decisions current. Use the additive `revision`
command for shared requirement/declared-quantity comparison: inspect versions,
run an explicit comparison, read its bounded view, and record against the exact
preview fingerprint. Saved comparisons replay pinned inputs; mismatches are not
accepted as previous review. A cached view is a completed operation, not another
Python replay; any BAS/load/restore change invalidates it. Export full comparison
JSON and Session evidence. Approved takeoff snapshots remain unfinished.

Inspect historical BAS evidence using `view_sheet` with the exact saved `page_id`
as `sheet`, and `original_pdf_path` when its bytes are not currently loaded. Do not
add old versions to the current drawing set merely to inspect them: that can
pollute future quantities. The isolated reader verifies source bytes and page
frame, refuses active overlays/grids/marks, and returns `added_to_active_set: false`.
An image verifies neither requirement interpretation nor takeoff completeness.

**Contents**

1. [Connect in 60 seconds](#1-connect-in-60-seconds)
2. [The operating model—six facts before your first call](#2-the-operating-model--six-facts-before-your-first-call)
3. [The standard finish—how a takeoff ends](#3-the-standard-finish--how-a-takeoff-ends)
4. [Withheld is not a failure—it is the answer](#4-withheld-is-not-a-failure--it-is-the-answer)
5. [What has no agent verb, and why](#5-what-has-no-agent-verb-and-why)
6. [Staged tool exposure](#6-staged-tool-exposure)
7. [A worked session](#7-a-worked-session)
8. [Refusals, and the move that answers each one](#8-refusals-and-the-move-that-answers-each-one)
9. [Where to look next](#9-where-to-look-next)

---

## 1. Connect in 60 seconds

Node 20+. No clone, no build:

```json
{
  "mcpServers": {
    "opentakeoff": {
      "command": "npx",
      "args": ["-y", "opentakeoff-mcp"]
    }
  }
}
```

Claude Code: `claude mcp add opentakeoff -- npx -y opentakeoff-mcp`. Claude Desktop: double-click
the `opentakeoff-mcp.mcpb` bundle from the
[latest release](https://github.com/Kentucky-ai/opentakeoff/releases). Docker, a local clone, and
the debugging trace flag are in [`mcp/README.md`](../mcp/README.md).

Confirm you're live by reading the `takeoff://sheets` resource before any plan loads—it answers
with what it is and points at `load_plan`, which is a cheaper handshake than a failed tool call.

## 2. The operating model — six facts before your first call

**One coordinate frame, stated everywhere.** Image pixels at render scale 2.0—PDF points × 2,
origin top-left, y down. That is the browser canvas's native space, so a coordinate round-trips
1:1 with the app. Every sheet payload carries dims in px *and* pt. Text positions from
`read_sheet_text` come back in the same space, which makes a room label directly usable as a
`one_click` seed. No tool takes a coordinate in units it has to infer.

**Scale is a gate, not a default.** The drawn scale note is read off the sheet and handed to you
as a suggestion; adopting it is always an explicit `set_scale { use_detected: true }`. Measuring
tools refuse an unscaled sheet, and a bare `one_click` returns px-only numbers with a warning
rather than fabricating square feet. Pixels × a wrong scale² is every number on the bid wrong at
once, which is why the engine would rather stop than guess.

**The scale you set is unconfirmed until a human confirms it.** `set_scale` returns
`confirmed: false`, `takeoff_summary` names those sheets in `scale_unconfirmed`, and the exports
carry `scale_confirmed` so the canvas can ask the estimator. Quantities still flow—the flag is
disclosure, not a second refusal—but say so when you hand the work over.

**The engine traces; you don't invent.** `one_click` returns the ring the flood fill produced
from the seed point you named. There is no tool that accepts a polygon you imagined and counts
it. `measure_polygon` exists for geometry you can defend, and everything it commits is stamped
with how it was made.

**Every commit carries provenance.** Method, normalized seed, whether hatch filtering engaged,
`raster_traced` when the boundary came from scan pixels instead of vector linework, and
`confidence` 0–1 with `confidence_factors` naming each deduction (`gap_sealed_px`, `door_wedges`,
`min_pass_delta`, …). Read confidence as a review prioritizer, never a verification: 1.0 means
every signal the engine can see came back clean, not that the trace is right. A low score is a
`view_sheet { overlay: true }` prompt.

**Your work is pencil until a person inks it.** Everything you commit lands in the canvas as a
dashed proposal. `mark_verdict` lets you sign work you checked as a graphite `AGENT` diamond; the
green `APPROVED` seal has exactly one code path and it is the toolbar button under a human hand.
`edit_shape` refuses a shape a human already affirmed, and self-revision bumps
`origin.agent_edits` rather than touching the human-correction fields—merging those would
corrupt the one signal that measures whether the machine is getting better.

## 3. The standard finish — how a takeoff ends

These five steps are served to every client in the `initialize` instructions, so they are the
contract rather than a suggestion. **A takeoff's deliverable is the marked-up planset, not a
numbers report.**

1. **Open and scale.** `load_plan`, then `set_scale` on each sheet you intend to measure. Use
   `load_plan { merge: true }` to add the schedule sheet and the addenda—a bid set is plans
   *plus* schedule *plus* addenda, and merging leaves existing scales, conditions, and shapes
   alone.
2. **Commit shapes under finish-tag conditions.** `one_click` / `detect_rooms` /
   `measure_polygon` / `measure_line` with `condition`. When the set carries a room-finish
   schedule, prefer `detect_rooms { assign_from_schedule: true }` so each room commits under its
   *own* row instead of one tag you picked for all of them.
3. **Derive what follows from the rooms.** `derive_base` for base LF (each room's perimeter minus
   the door openings *you state*—the tool never guesses a door), `derive_transitions` for the
   line where two finishes meet. Both read committed floor shapes, so they come after step 2, and
   you audit their output in step 4 like anything else.
4. **Look at what landed.** `view_sheet { overlay: true }` and fix misses with `edit_shape` before
   trusting a total. Crop the work region tight—a full-sheet render downsamples too far to
   audit a ring. Solid outlines are human-affirmed, dashed are unreviewed.
5. **Write the planset.** `export_marked_pdf`, and give the user the file path. (`export_dxf` when the takeoff is going back into CAD — one sheet per drawing.) `export_report`
   alongside it for the numbers. Never end a takeoff with numbers alone: a takeoff nobody can
   check is not a takeoff.

Between steps 3 and 4, `list_shapes` is the cheap inventory—ids, sheets, conditions,
quantities, room labels, review state, and where each finish tag came from (`schedule` or
`asserted`)—without pulling a whole `export_takeoff` payload.

**A schedule-driven HVAC/BAS document is a different path, not a variant of the five steps
above.** It never traces shapes: `compile_corpus_takeoff { kind }` reads the equipment/BAS/valve
schedule tables directly off the sheet graph and returns one compiled envelope (`categories`,
`totals`, `page_accounting`, `exclusions`) per kind. Follow it with `reconcile_schedule_plan
{ family? }`, which cross-references the compiled schedule rows against what is actually swept
drawn on the plan sheets and returns one row per tag carrying `scheduled_qty`, `installed_qty`,
and a `status` (matched / schedule-only / plan-only / …) with citations both ways. Report both
quantities and the status per line — never just the schedule count — the same "never a numbers
report alone" discipline as the standard finish above.

## 4. Withheld is not a failure — it is the answer

Four tools measure things they then decline to commit, and say why. The arrays they hand back are
the most valuable output on the call, because each one is a question an estimator would have
asked.

| Tool | What it withholds | What it means | Your move |
|---|---|---|---|
| `detect_rooms` | rooms in `withheld` (degenerate, duplicate, implausible) and `unresolved[]` | the flood failed, or the schedule can't answer for that room | re-seed the coordinates it hands back, or state the condition yourself and say you did |
| `symbol_sweep` | matches scoring 0.75–0.92 | a near-match the fingerprint can't call | `view_sheet` the coordinates; commit the real ones by hand |
| `symbol_sweep` | placements your own counter-example rejected, in `rejected[]` — which negative, its mode (shape / crossing), and the fraction of its evidence found | the geometry accepted it and your exclusion refused it: an exclusion is a judgement, and judgements get revised | look at each; `place_count` at its `at` reinstates one you disagree with, no re-run |
| `symbol_sweep` | placements your stated `luminance_tolerance` pulled under the commit bar, in `lum_gate.at` — with the tolerance and the seed's own luminance band | the geometry would have committed it and the pen refused it: a symbol redrawn in a different pen fails the gate honestly | look at each; `place_count` reinstates, or widen the stated tolerance |
| `symbol_sweep` | the drawing's own tag on every row (`label`/`label_via`, #308) — and the note's three flags: a match with NO label in a labeled family, a withheld row carrying the seed's own tag, a row named a different tag | shape says "looks like one"; the label says what the drafter called it — identity in both directions | trust tag-confirmed rows more; LOOK at unlabeled matches first (measured case: two 0.97 "drains" that were valve internals); `place_count` a withheld row the drawing vouches for |
| `symbol_sweep` (on by default, docs/SYMBOL-SWEEP-CLEAN-CORPUS-GOAL.md's default flip; `sweep_schedule_row`'s own `affine` stays opt-in) | placements withheld with a distortion beyond the stated bounds — the reason names the measured stretch/shear (e.g. `1.6× / 1× stretch and 0° shear`) against the bar (default 1.5× / 10°) | the geometry fit but the distortion is large enough that this may be a different device drawn to look alike, not the seed rotated/resized on the sheet | `view_sheet` the coordinates and decide by looking; raise `affine.max_stretch`/`max_shear_deg` only if this drawing set genuinely stretches its symbols that much, or pass `affine: {enabled: false}` for the old rigid-only search |
| `sweep_schedule_row` | `excluded` (labeled with a sibling key), `withheld` (unlabeled), `text_only` (a tag with no marker) | drafting reuses one bubble shape across many marks, so geometry alone would over-count | look at each; the exclusions are usually right and the unlabeled ones are usually yours |
| `derive_transitions` | wall-separated runs, in `withheld` with a length, a gap in inches, and an `at` point | the two rooms are adjacent across a partition, so the real transition is a threshold in a doorway that nothing in the trace record locates | measure the threshold at the door with `measure_line`, or hand the run to the estimator |

`withheld_lf` is never folded into `total_lf`. A withheld item you ignore is a hole in the bid;
one you never mention is worse. Report them in your summary even when you can't resolve them.

With affine search active (the `symbol_sweep` default; opt-in via `affine.enabled: true` for
`sweep_schedule_row`), any row (match or withheld) that was found by rotation/stretch search — not
the plain 90°-multiple rigid search — carries a `transform` object: `rotation_deg` (continuous, not
just 0/90/180/270), `scale_x`/`scale_y`, `shear_deg`, `mirrored`, and `via` (which mechanism found
it — `rigid`, `rotation`, or `affine`). Absent on a row the rigid path committed without help, so
a placement the rigid search already nailed reports exactly what it always has; pass
`affine: {enabled: false}` on `symbol_sweep` to go back to the plain rigid-only search entirely.

And SHOW them (#297): `view_sheet` takes `marks` — pass `withheld` coordinates as `question`,
`rejected[]`/`lum_gate.at` as `struck`, and the sweep's `seed.center` as `ring` — so the render
the estimator audits carries every disclosure, in colors no CAD pen uses. An overlay without
marks shows committed ink only; on a real validation sheet that read as "it missed 37 fittings"
when all 37 were disclosed questions. In sheet scope, remember the seed is installed work:
`commit_seed: true` puts it in the count (#296), and the reply reminds you when it is left out.

The reason `derive_transitions` behaves this way is worth carrying into every judgment you make
here: **flood-traced rooms do not share edges.** A trace fills to the wall linework, so two rooms
across a partition sit four to eight inches apart. Committing 34 LF of threshold because two
rooms share 34 LF of wall would be a wrong number with a machine's confidence behind it.

## 5. What has no agent verb, and why

- **Stitching.** The canvas joins 2–4 sheets split at a match line into one composite surface. No
  MCP verb creates, aligns, or addresses a stitch, and this is not staged for later exposure.
  Aligning a match line means clicking the same drawn wall junction on both halves—judgment
  whose failure mode is a subtly sloppy join that silently skews every quantity crossing the seam.
  On a split floor: measure each member sheet as its own surface, and tell the user a
  seam-crossing room needs their stitch in the app. Never approximate one by combining sheets
  yourself. (A stitched takeoff round-tripped through `import_takeoff` → `export_takeoff` comes
  back without its stitches; when a stitch is in play, the app's own save is the one to keep.)
- **The estimator's `APPROVED` seal.** `mark_verdict` takes no actor argument, so there is no
  input to misuse; `delete_verdict` refuses a human seal outright.
- **Confirming a scale.** Only a human act in the canvas clears `confirmed: false`.
- **Minting a correction rule.** `apply_rules` re-runs the rules an estimator taught the canvas,
  and rules arrive only through `import_takeoff`. A rule *is* an estimator's correction, so minting
  one stays behind the canvas's human Preview→Apply gate.
- **Touching human-affirmed work.** `edit_shape` refuses a shape carrying
  `origin.reviewed === true`.

## 6. Staged tool exposure

By default every client gets all 53 tool schemas on `tools/list`—the flat contract every
published client already expects.

Forty descriptions is real token weight for a session that may never touch half of them, so the
server can stage the surface along the workflow it already teaches:

```bash
OPENTAKEOFF_MCP_STAGED_TOOLS=1 npx -y opentakeoff-mcp
```

Staged, only the **setup** stage starts enabled—10 tools that orient you: `load_plan`,
`sheet_info`, `set_scale`, `sheet_graph`, `resolve_tag`, `find_schedule`, `read_sheet_text`,
`find_text`, `sheet_context`, `view_sheet`—plus one opener, `open_tool_stage`. Call it with
`"measure"`, `"revise"`, or `"handoff"` and that group's tools enable and fire
`tools/list_changed`. Opening is instant, idempotent, and never closes anything: the surface only
grows, and the reply names exactly which tools just appeared.

The stages are the same phase structure the instructions already describe in prose:

| Stage | Tools | Opened when |
|---|---|---|
| `setup` (always on) | load, scale, read the set, look at it | — |
| `measure` | `one_click`, `detect_rooms`, `measure_*`, `cut_out`, `place_count`, the sweeps, the derives | you're about to commit a shape |
| `revise` | `list_shapes`, `edit_*`, `duplicate_condition`, `split_condition`, `delete_shape`, `undo_last`, the annotation and verdict family | you're auditing or correcting |
| `handoff` | `takeoff_summary`, `export_*`, `import_takeoff`, `apply_rules` | you're finishing |

**When to turn it on:** your client honors `tools/list_changed` (Claude Code, Claude Desktop,
anything built against the current spec) *and* you care about the context cost of the tool list.
**When to leave it off:** a client that reads the tool list once at startup—there, a staged
server looks like a server with 11 tools that refuses everything else.

Staging is context economy, not a permission boundary. Nothing is safer when a stage is closed;
the safety lives in the refusals, the scale gate, and the pencil-vs-ink split, all of which hold
identically in both modes.

## 7. A worked session

*"Take off the carpet on this floor plan"*—tool calls verbatim, replies abridged.

```
▸ load_plan  { "path": "/plans/sample-plan.pdf" }
  { "sheets": [{ "sheet": "sample-plan.pdf", "width_px": 2448, "height_px": 1584,
                 "sheet_number": "A-101", "detected_scale": "1/4\" = 1'-0\"" }] }

▸ read_sheet_text  { "sheet": "sample-plan.pdf",
                     "region": { "x0": 1468, "y0": 871, "x1": 2448, "y1": 1584 } }
  { "text": "A-101 SCALE: 1/4\" = 1'-0\"" }

    The title block confirms the detected note. Adopt it explicitly — never silently.

▸ set_scale  { "sheet": "sample-plan.pdf", "use_detected": true }
  { "upp": 0.02778, "label": "1/4\" = 1'-0\"", "source": "detected", "confirmed": false }

▸ one_click  { "sheet": "sample-plan.pdf", "x": 600, "y": 1084, "condition": "CPT-1" }
  { "status": "ok", "area_sf": 437.98, "perimeter_lf": 86.61, "confidence": 1, "shape_id": "shp-…" }
  … three more rooms …

    Two of those are actually tile. Reassign, then derive instead of re-measuring:

▸ edit_shape  { "shape_id": "shp-…", "condition": "PT-1" }

▸ derive_transitions  { "condition_a": "CPT-1", "condition_b": "PT-1", "condition": "T-1" }
  { "committed": 2, "total_lf": 53.88, "withheld": [], "withheld_lf": 0 }

    Both runs came back butt joints — gap under an inch, one open space. Across a
    partition they would have landed in `withheld` instead, as questions.

▸ view_sheet  { "sheet": "sample-plan.pdf", "overlay": true,
                "region": { "x0": 500, "y0": 600, "x1": 1900, "y1": 1000 } }
  … PNG: committed shapes burned in, unreviewed machine work dashed …

▸ export_marked_pdf  {}
  { "path": "/plans/sample-plan - marked set.pdf", "sheets": 1 }

▸ export_report  { "path": "/plans/sample-report.json" }
  { "schema": "opentakeoff.report.v1", … }
```

Hand back both paths, the totals, anything `withheld`, and the fact that the scale is
agent-set and awaiting the estimator's confirmation.

## 8. Refusals, and the move that answers each one

Refusals are actionable strings by design—*"a silent zero doesn't tell a model what to do
next."*

| What you get | What it means | Next move |
|---|---|---|
| `Set the scale for <sheet> first — use set_scale (detected: 1/4" = 1'-0").` | the scale gate | adopt the detected note, or calibrate from a known dimension |
| *That space isn't enclosed on the plan linework — the fill spilled.* | a real gap: an open doorway, a break in the wall | seed a more enclosed spot, or `measure_polygon` it |
| *Landed in dense linework (hatching or text).* | the seed landed on a text block or heavy hatch | `view_sheet` a crop, pick open floor, re-seed |
| a ring not fully inside the parent (`cut_out`) | an edge-crossing cut is a boundary correction, not a hole | fix the parent with `edit_shape` instead |
| `measure_surface` refuses with no height | wall SF = traced LF × the condition's height | `edit_condition { height_ft }`, then retrace |
| an export refuses a path | OpenTakeoff didn't write that file, and overwriting it would destroy someone's work | pass `overwrite: true`, or pick another path |
| a `sweep_schedule_row` key that won't anchor | a fingerprint is never guessed from text alone | anchor it yourself: `find_text` the tag, `view_sheet` the marker, count by hand |

## 9. Where to look next

- [`mcp/README.md`](../mcp/README.md)—the tool-by-tool reference, the resource URIs, the
  coordinate contract, the write-to-disk rules, and the v1 limits. This is the list to trust.
- [`docs/MCP.md`](MCP.md)—the same surface in prose, ordered the way an agent reaches for it,
  with the sheet-graph and sweep behavior in depth.
- [`docs/USER_GUIDE.md`](USER_GUIDE.md)—the human half. Worth reading the parts you hand work
  to: proposals, the Accept pill, and how an estimator confirms your scale.
- [`docs/SHEET-GRAPH-EVAL.md`](SHEET-GRAPH-EVAL.md)—what the plan-set reader scores on real
  bid sets, and what it still cannot read.
- [**OpenTakeoff Academy**](https://aec.kentucky-ai.com)—an open benchmark for agents that do
  takeoff. Bring any model and your own harness; you're scored on operating a real tool against
  geometry you don't control.
# BAS engineering boundary

For BAS `compile_corpus_takeoff`, inspect the additive `bas_math` result separately
from original printed totals. Supply only evidenced abstract hardware, spare,
license, topology and equipment-group policies. Typed SOO inputs need explicit
identity alignment and source citations. Missing narrative typing, unavailable
Python, unverified replication and conflicting types are not successful zero
takeoffs. `project_complete` remains false. Export the BAS JSON for the full
engineering audit; existing schedule exports are unchanged. See
[the contract](../bas_engine/README.md).

The additive `bas_workflow` retains source-bound point evidence captures.
`export_takeoff` and `import_takeoff` round-trip them; importing evidence never
approves it or establishes an installed count. Fingerprints detect changed
capture data, not authenticated authorship. Source navigation requires the exact
original PDF bytes. JSON carries source identities, not historical PDFs; retain
those separately. SOO/equipment reconciliation and approved BAS snapshots are
not implied by a successful capture or export.

New `bas_evidence_2` captures additionally retain full positioned drawing text
and its interpretation rule version. Optional `bas_review` on
`compile_corpus_takeoff(kind:"bas_points")` records an explicit sequence/matrix
association or removal. First obtain the capture ID and source references from
a compile, then supply a unique `operation_id`, `capture_id`, `expected_head`
(last event ID for that capture, or null), and an action with a reason.
Upserts require a region ID, matrix ID and literal source-span equipment
references; optional scope is a disclosed input, not inferred installation.
These events are `agent_proposal`, never human approval. Exact retries are
idempotent; stale heads, reused operation IDs with changed requests and invalid
references reject. Ordinary recompiles and exports retain prior history.
The shared bounded monitoring comparison does not infer typed I/O, verify
applicability, replicate templates or establish actual equipment quantities.

The separate equipment register records explicit source-bound assignments and
exceptions. After reviewing it, `bas_assignment_demand` on the BAS compile accepts
`capture_id` and `expected_equipment_head` and saves shared-Python listed-value
derivations. Report their basis: per included named member or system once. Cite
the original row/column and retain controller qualifiers. Never call a known
subtotal complete when cells were unavailable, add alarm/trend attributes as
terminals, or treat repeated source requirements as unique physical devices.
Different templates may describe the same point; no project total resolves that
ambiguity automatically. A source/decision change makes previous calculations
stale, not approved. The saved source evidence and earlier results remain
exportable. Missing Python, validation failure, timeout or stale response must
not be described as a successful zero takeoff.

For assembly scope, use `bas_assemblies` to obtain source requirement IDs,
current equipment/assembly heads and retained decisions. `bas_assembly_review`
records explicit source-owned component applicability, quantities, conditions,
lifecycle, separate activity claims and resolutions. Supply both expected heads
and a unique operation ID; this records an Agent proposal, never human approval.
Original declarations are reconstructed from the pinned rule and retained source,
not trusted caller-authored summaries. Factory furnishing says nothing about
installation, wiring, programming or testing. Point rows are not extra devices.

Rule `explicit_component_declarations_1` remains the default and is replayable.
To review expanded singular component lists, submit a new complete
`bas_assembly_review.register` with `source_rule_version` set to
`explicit_component_declarations_2`, an explicit reason and current expected
heads. Preserve the existing components unless separately reviewing a change.
Inspect the resulting `bas_assemblies.source_requirements`; new sensor roles
are distinct requirements, not interchangeable `sensor` counts. The transition
does not establish applicability or revise earlier events. Recalculate after
review; do not silently migrate old state during compile or import.

`bas_assembly_quantities` invokes shared Python against the exact capture and
review heads. It returns declared component contributions for the selected
members, not unique-device, installed or whole-project totals. Unknown quantities
remain unknown even if excluded. An unresolved applicable condition prevents a
known contribution. A changed equipment head makes old assembly decisions stale;
repair the complete register against current equipment before recalculating.
Old records remain readable/exportable. Do not remove conflicting evidence or
describe an explicit resolution as a source correction or commissioning signoff.

For declared engineering checks, `bas_engineering_review` on BAS compile takes
the complete input/resource/target register plus the expected engineering,
equipment, assembly and SOO review heads. Obtain original source references and
explicit applicability before proposing ratings; an equipment power-supply
schedule does not automatically rate its actuator control interface. The shared
service validates exact retained wording, equipment/resource ownership and all
previous calculations before recording a new `agent_proposal`. Do not invent
values to make the schema pass. Null means unknown, not zero or not applicable.

Inspect `bas_engineering` outcomes and missing inputs, not just the top-level
status. To verify imported calculations, request
`bas_engineering_inspect: {capture_id}`. Ordinary read summaries deliberately
remain `requires_python_replay`. A replayed result can still have
`stale_dependencies`; repair current assignments explicitly instead of relabeling
the old decision. Exclusions retain their failures. Selected constraints never
establish installed quantities, universal coverage or authenticated approval.

Use optional `bas_project_review: {capture_id}` on BAS compile to inspect the
same saved-finding queue as **Takeoff → Review & changes**. Keep original codes,
evidence, affected scope and dependency status when explaining a finding.
Unknown codes and excluded failures are not permission to skip review. A warning
about incomplete source discovery is not proof that a requirement is absent.
Correct inputs in their existing domain workflow and recompute; this read-only
queue has no dismiss/approve action and does not replay Python or verify PDF
availability. It deliberately does not evaluate release readiness.
