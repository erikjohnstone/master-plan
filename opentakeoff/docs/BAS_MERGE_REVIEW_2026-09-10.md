# BAS branch merge review — 2026-09-10

This reviews the complete `codex/bas-math-engine` change set requested for merge,
not only the final snapshot screen. The comparison starts at main
`61698a0ba8817e0e9266607d7d48b8476e8796f6`. Merge confirmation and final checks are
reported in the accompanying GitHub pull request and task handoff.

## What this changes for users

The platform gains a source-backed, persistent BAS review and calculation
workflow. Estimators can retain point matrices and sequence text, associate them
with scheduled equipment, review component/responsibility scope, evaluate
declared engineering constraints, track changes, and preserve a reviewed
deliverable with its original PDFs.

It is **not yet a complete conversational BAS takeoff**. The browser Agent does
not orchestrate every new workflow. Unique-point reconciliation and reliable
deformation-tolerant plan quantities remain unfinished. A scheduled unit, listed
point, software value, physical device and installed instance remain different
things; the application must not present one as another.

## 1. Shared deterministic BAS calculations

One Python engine is consumed by browser and MCP integrations. It handles typed
point demand, explicitly configured capacity/spares and network constraints,
independent software capacity/licensing counts, equipment assignments, assembly
quantities and engineering comparisons. Licensing counts here are non-commercial
engineering capacity, not licensing prices or purchasing.

User impact: results have structured inputs and reproducible calculations rather
than separate UI/server arithmetic. Missing inputs, ambiguous identities and
source discrepancies remain visible instead of becoming plausible totals.
No costing, pricing, labor rates/hours or supplier selection was added.

## 2. Point-list grounding and digital matrices

The Point lists workspace retains original cells, nested heading meaning,
source-bound row interpretation and supported controller notes. It separates
hardware/software columns and avoids interpreting alarm/trend flags as extra
physical I/O. Captures persist through project saves and evidence export/import.

A shared routing correction admits explicit points-list captions on detail/plan
sheets that were previously screened out before table extraction. In the
documented Fort Sam control, authored listed-row coverage improved from **79/193
to 193/193**. This is one verified source control, not a corpus-wide accuracy
claim, and 193 listed rows are not 193 devices or installed points.

User impact: more relevant listed evidence reaches the estimator, with original
locations available for verification, without changing the VectorGrid table
algorithm. See [routing evidence](bas-production/POINT_ROUTING_CONTRACT.md).

## 3. Sequence text and point-list comparison

A separate vector/text path retains SOO narrative regions, original wording,
headings and source locations alongside the table pipeline. Supported explicit
requirements have deterministic interpretation; difficult/unsupported clauses
remain visible. A reviewer can associate a sequence with a point matrix using
source-bound applicability evidence and inspect both sides of the comparison.

User impact: the workflow no longer depends exclusively on finding sequence
information inside tables. Reviewed links, revisions and removals are retained
without editing the original extracted text. This is bounded interpretation,
not arbitrary SOO comprehension or automatic discovery of every engineering duty.

## 4. Scheduled equipment and template assignments

Equipment retains source-backed identities and explicit scope. A reviewer can
make per-equipment or system-once template assignments, record exceptions, and
calculate assigned listed values. Saved calculations retain source cells,
multipliers, inputs and results; changed dependencies make prior results stale.

User impact: reusable controls requirements can be connected to actual named
scheduled equipment rather than manually copying tables. Users must still
establish applicability and resolve ambiguous duplicates; scheduled membership
does not prove the number of installed plan instances. The existing unresolved
unique-point flags and withheld complete project totals have not been hidden.

## 5. Assemblies and independent responsibilities

Selected equipment opens Assembly & responsibilities. Supported explicit
component declarations and reasoned operator decisions retain their evidence.
Shared Python computes declared per-equipment or selected-group contributions.
Furnish, install, wire/connect, program and test are separate activities, with
factory/existing/by-others/unknown scope retained as appropriate.

User impact: an estimator can distinguish what belongs in a controls assembly
and who owns each activity. Factory furnishing does not silently assign wiring,
installation or testing. There are no arbitrary default kits, automatic
one-device-per-point conversions or commercial labor calculations.

## 6. Engineering compatibility with explicit inputs

The equipment engineering workspace accepts source transcriptions or disclosed
operator inputs for signal direction/modes, analog ranges/excitation, resistive
loading, contacts/pulses, operating/startup power, mechanical ratings, physical
terminal allocation, expansion pools, and declared serial/IP constraints.

Checks preserve units, original values, governing rules and pass/fail/not-
evaluable outcomes. W/VA conversion needs the relevant explicit power factor;
unknown ratings do not become passing checks. Shared-pool, terminal exclusivity
and ownership checks prevent some misleading split-input comparisons.

User impact: estimators can document and reproduce applicable compatibility
checks and export saved engineering evidence to a non-commercial workbook.
The tool does not automatically discover every hardware capability, select
manufacturer products, infer hidden routes, or certify an entire design.

## 7. Issue review and source coverage

One internal Review & changes workspace gathers findings across sources,
points/SOO, equipment, assemblies and engineering. Findings link to original
evidence and the appropriate correction workspace. Reasons and decision history
persist; acknowledgement is not a waiver and exclusions do not erase failures.

Scope & coverage identifies included claims, explicit source-cited exclusions,
consequences, and reviewed page/span applicability. Source-reference suggestions
are candidates, not automatic coverage decisions.

User impact: review is organized around inspectable exceptions rather than a
generic green check. However, substantial applicability review is still manual;
the planned Agent-driven automation of the full journey is not complete.

## 8. Drawing versions and revision comparisons

Immutable source-byte identities distinguish old and new PDFs even when names
are reused. Drawing changes supports source-set selection and explicit page
correspondence for replacements, additions and removals. Ambiguous pairing
remains unresolved. Requirement/quantity comparisons retain pinned before/after
inputs, explicit item pairing and replayable decisions.

User impact: estimators can inspect what changed without losing the earlier
evidence or silently transferring decisions to different drawings. These are
reviewed comparisons, not a universal automatic addendum matcher. Some revision
tests are controlled source-derived fixtures, not independent real addenda.

## 9. Evidence retention, recovery and sync safety

Original PDF bytes can be retained separately from active counting sheets. The
isolated reader opens exact historical sources and citations. Source-inclusive
backups preserve workflow data and all referenced originals; verification and
explicit restore use shared history/calculation checks and atomic storage.

Stale editor generations, conflicting history and project changes are checked
instead of silently overwriting another saved state. Compatible BAS histories
survive local-first sync; conflicting branches require review.

User impact: evidence and decisions are harder to lose or misattribute during
reloads, imports and revisions. Important limit: retained originals and snapshots
are browser-local, not automatically synced. Browser clearing/eviction/device
loss remains possible. Keep source-inclusive ZIPs outside browser storage.

## 10. Explicit scoped snapshots

Review & changes → Snapshots lets an estimator select reviewed scope, verify
originals/coverage/findings and actual Python replay, inspect retained claims,
and explicitly approve with a self-declared name, reason and confirmation.
Saving publishes the exact snapshot and originals together without replacing
working annotations. Reopen and ZIP import/export reverify historical evidence.
Import also works in an empty project without adding active counting sheets.

User impact: a reviewed deliverable can travel with the exact supporting files,
decisions, findings and calculation inputs. Historical validity is explicitly
separate from current applicability. Records are unsigned local declarations,
not authenticated identities or server-enforced immutability.

Still unfinished: selective snapshot currentness, revocation/supersession,
public MCP snapshot commands and readable non-commercial snapshot result tables.
The existing ZIP is an evidence archive, not a polished estimating deliverable.

## Backend and extraction boundary

This entire branch is **not UI-only**: it adds the requested deterministic BAS
engine, shared workflow contracts, service/MCP operations, persistence, review
and source handling. Browser-only layout/interaction consumes those shared rules.

VectorGrid's Python table algorithms and adapter are not rewritten. Relevant
changes are upstream points-caption routing and packaged runtime resolution/
shipping of existing Python dependencies. The symbol-sweep/legend engine is not
made deformation-tolerant by this merge. No new trained model, OCR/raster
interpretation, speculative installed quantity or pricing implementation is added.

The current GitHub main is an ancestor of this branch at the initial merge check,
so no divergent source changes needed conflict resolution then. The separate
user working checkouts are not reset or overwritten by the GitHub merge.

## Verification and honest limits

- The final snapshot client/storage set passes 26 tests, including caller
  mutation/forgery, stale/dirty work, missing originals, unavailable/false replay,
  cancellation, project isolation, atomic rollback and historical-only import.
- Two public real-PDF snapshot walkthroughs used actual Python, with controlled
  reviewer/applicability declarations. The final run includes keyboard/source
  focus return, reload, export/reimport and empty-browser import/source rendering.
  Latest observed readiness/save/export/reopen: **3.721/5.819/5.168/5.191 seconds**.
  Desktop light/dark screenshots were inspected. This is not independent
  full-takeoff ground truth. See [snapshot proof](bas-production/SNAPSHOT_UI_PROOF.md).
- Final full web, MCP/package and Python check results are recorded in the PR
  and progress ledger. Existing skips/warnings are disclosed, not weakened.
- A separate combined snapshot core probe still exceeds its **512 MiB**
  incremental-memory budget (latest retained result: **648,708,096 bytes**).
  Passing individual preview benchmarks does not close that failure.
- Final full corpus/holdout acceptance, useful Agent orchestration, unique-point
  reconciliation and the appended researched symbol/installed-plan phase remain
  unfinished. Historical corpus baseline failures remain documented; no universal
  accuracy or production-completeness claim follows from this merge.

## Practical expectation after merging

Users get substantially more structured BAS evidence, deterministic calculations,
source inspection, durable review and recovery—not a one-prompt autonomous BAS
takeoff. The correct workflow is supported extraction and retained drafts →
estimator applicability/correction → calculation and evidence review → explicitly
scoped historical snapshot. The remaining automation and quantity-reconciliation
work is documented for a later continuation, not declared finished to close the task.

The shared Python runtime must be available in the environment used by the
browser/MCP. Merging GitHub does not itself update an already running development
checkout or prove a hosted deployment has the service configured.
