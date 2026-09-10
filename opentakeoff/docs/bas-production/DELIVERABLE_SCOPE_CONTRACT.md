# Deliverable scope and dependency preview

2026-09-10. Pre-implementation slice of `REVIEW_REVISION_CONTRACT.md`, not a
reduction of that contract or a production-completion report.

## Research and boundary

UFGS 23 09 93, November 2015 edition (retrieved 2026-09-10), requires project
tailoring and coordination of sequences, points schedules and control schematics.
Its optional filter-switch example is not a universal equipment requirement.
Our inference: applicability needs an explicit, source-bound scope; a generic
template cannot establish it. [Official guide, printed pages 8 and 17–18](https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2093.pdf).

Autodesk documents that saved workflow edits affect subsequent reviews, not
existing reviews. Our design similarly retains historical review inputs rather
than silently rebinding them. This is documentation research, not hands-on
competitor testing. [Official approval workflow documentation](https://help.autodesk.com/cloudhelp/ENU/Docs-Reviews/files/getting-started-reviews/Reviews_Create_Edit.html).

**Shared-path gate: yes.** Scope selection, dependencies, exclusion consequences
and fingerprints are shared truth in `web/src/lib`. Reuse the verified revision
inventory and its exact source/record ownership. Do not alter table extraction,
sequence/component interpretation, source bboxes, domain decisions, saved Python
results, or historical revision inventory semantics.

The current inventory baseline passed all 12 tests. On retained Fort Sam evidence
with disclosed controlled hardware decisions, three serial inventory builds took
838.526 / 819.070 / 832.220 ms, 496 items, 3,044,819 JSON bytes, no unresolved
references. The suspected missing component-clause reference was **not** a defect:
the component interpreter consumes the same sequence clauses. No fix is warranted.

## Input and output

A strict scope specification names a stable scope UUID, human-readable name,
reason, pinned complete drawing source-set/basis, and at least one included claim.
Targets use exact capture and subject IDs, never tag/title matching:

| Claim | Root | Additional required inventory |
|---|---|---|
| Scheduled equipment | Equipment record | Scope and original schedule bindings |
| Assigned points | Assignment | Matrix rows, linked sequences and saved assigned observations |
| Assembly components | Assembly component | Source requirements, members, conditions and saved quantity |
| Responsibilities | Assembly component | Original activity claims and selected resolutions |
| Declared engineering compatibility | Engineering check | Explicit resources, owners, source ratings, saved result and connected resource-sharing checks |

This phase does not create installed quantities or verify the physical design.
Engineering compatibility remains a claim about explicitly declared checks.
An empty list cannot masquerade as a complete project.

An exclusion names another exact claim plus a reason, consequence and at least
one owned page/span citation. It means **omit that deliverable claim**, not delete
the subject, suppress a finding, declare the evidence irrelevant, or subtract a
member from a saved calculation. A prerequisite needed by an included claim is
retained and exposed as `dependency_of`. To remove an actual assignment member,
the existing domain editor and Python recalculation must be used. Excluding
responsibility reporting alone does not remove an assembly quantity.

Preview returns the unchanged full inventory, per-claim dependency IDs and
content fingerprints, exact derived exclusion evidence and dependencies, and
all unselected inventory IDs. No quantity summation or replicated JavaScript
engineering math. Unknown remains unknown. Coverage, issue adjudication, original
PDF byte availability and Python replay are explicitly **not verified** here;
approval and project completeness remain false even if diagnostics are empty.

## Dependency algorithm

- Follow owned inventory references, preserving stale/missing pinned dependencies
  as diagnostics. Do not silently substitute a newer record for a pinned one.
- Include point rows and sequence clauses/requirements when their owning matrix
  or sequence is part of the claim. Include reviewed sequence/matrix links for
  assigned-point claims, and their existing applicability evidence.
- Assigned-point and assembly claims retain matching saved quantity records.
  A missing result is a diagnostic, never zero. Saved results require Python
  replay and keep existing whole-register staleness visible.
- Responsibility claims include every activity claim and resolution for that
  component, not just the currently selected outcome.
- Engineering closure follows the explicitly registered resource-sharing graph,
  including every connected check and its resources, even a check excluded in
  its original engineering target. Never infer a shared pool from similar names.
  A new connected check changes the closure; disconnected edits do not.
- Fingerprints include the claim, inventory/rule versions, exact item content,
  membership, source-boundary status and relevant explicit exclusions. Whole
  workflow hashes and incidental event-head changes are not the only key.
  Freshness diagnostics remain separate from content equality.
- Do not claim this graph is complete discovered project coverage. Source-bound
  coverage/applicability review is a separate next step and an approval gate.

## Falsifiable checks and predeclared budgets

Require positive ownership and exact evidence, deterministic replay, input
non-mutation, synchronous request ownership before asynchronous verification,
foreign/missing IDs, duplicate/included-and-excluded targets, empty scope,
page-boundary warnings, malformed citations, legacy unavailable sources, retained
stale calculations, unknown values, and abort-without-partial-result tests.

Prove that unrelated equipment edits preserve unaffected claim fingerprints;
changed member/scope/condition/claim/rating/resource membership changes affected
fingerprints; a shared prerequisite survives an exclusion; same IDs in different
captures remain distinct. Verify retained real-PDF input separately from synthetic
fixtures. Do not label controlled declarations automatic discovery.

Operational bounds, fixed before implementation: 2,000 total claim targets,
500,000 indexed graph relationships, 250,000 total returned dependency memberships,
16 MiB scope projection excluding the existing bounded inventory. Refuse rather
than truncate. Retain the existing 100,000-item/64 MiB inventory limits. On the
same real retained fixture, require total preview under 5 s and incremental RSS
under 512 MiB, with serial measurements. These are operational limits, not BAS
engineering thresholds or proof of performance at every permitted maximum.

## Remaining vertical workflow

This first internal compiler is not a shipped approval feature. Next, wire its
exact specification into a validated additive journal, source-bound coverage
decisions, shared issue/readiness assessment, the existing Review & changes UI
and MCP transport, selective approvals and atomic source-inclusive snapshots.
Require actual public UI/MCP create/edit/exclude/review/approve/export/reopen,
accessibility, race/retry/cancellation, preserved source navigation and complete
history verification before claiming the complete feature. No main merge or
deployment is authorized.
