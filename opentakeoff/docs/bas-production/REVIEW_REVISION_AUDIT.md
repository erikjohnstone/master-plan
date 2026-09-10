# Review, revision and approved-takeoff audit

2026-09-10, source checkpoint `eb18c7ad`. This is the continuing workflow E
audit, not a claim that E is implemented and not a substitute for the complete
acceptance contract in `../BAS_PRODUCTION_GOAL.md` and `IMPLEMENTATION_PLAN.md`.
Engineering complex-form verification completed alongside this read-only audit;
the exact result and limits are in `PROGRESS.md`. No extraction, source coordinates
or existing approval behavior changed.

## Primary-source workflow findings

- Bluebeam distinguishes difference markups from colored page overlays. It
  exposes page, automatic and manual alignment, and produces a separate
  difference document with navigable markups. This supports explicit pairing,
  preserved originals and a change list, not the inference that every changed
  mark is a changed BAS quantity. [Official comparison/overlay documentation](https://support.bluebeam.com/revu/features/compare-documents-vs-overlay-pages.html).
- Procore's documented revision import uses drawing number within a drawing
  area and includes review/confirmation. Its visual comparison can compare one
  drawing or a set. Our inference: contextual identities and explicit confirmation
  matter; a filename or bare sheet number must not identify equipment across
  buildings. We are not copying its OCR-based upload implementation or claiming
  to have operated Procore. [Revision upload](https://en-gb.support.procore.com/products/online/user-guide/project-level/drawings/tutorials/upload-drawing-revisions),
  [revision comparison](https://support.procore.com/products/online/user-guide/project-level/drawings/tutorials/compare-drawing-revisions).

Sources rechecked 2026-09-10. These are documented product workflows, not project
requirements, an engineering standard or verified hands-on competitor tests.

## Existing code to reuse, and what it does not establish

| Existing path | Verified responsibility | Remaining boundary |
| --- | --- | --- |
| `web/src/lib/basSources.ts` | SHA-256 document identity, full page inventory, original spans/coordinates, aliases separate from identity | Available PDF text only; no cross-version page pairing or vector-ink equivalence. |
| `web/src/lib/basWorkflow.ts` | Capture fingerprints, per-workflow event chains, source ownership, additive merge, retained history | No BAS issue disposition, release snapshot, page correspondence or release readiness record. It correctly rejects divergent engineering branches. |
| `web/src/lib/basWorkflowRevision.ts` | Six additive persistence revisions through engineering | The next revision must preserve all six; lower-level edits cannot downgrade it. |
| `basReview.ts` / `basReviewContract.ts` | SOO-to-matrix association decisions and history | Despite its general name, this is not the project issue/release system. Do not repurpose its event meaning. |
| `basPointLists.ts`, `basSequenceReconciliation.ts` | Raw/typed rows, unresolved columns/regions, compared requirements and citations | Existing discovery is bounded; lack of a detected requirement is not project coverage. |
| `basEquipmentRegister.ts`, `basAssemblyRegister.ts` | Scoped equipment, template applicability, component derivation and independent responsibility issues | Issues are domain-specific records, not one project issue queue. Unknown scope/responsibility must not become green by omission. |
| `basEngineeringRegister.ts` / `basEngineeringReview.ts` | Source/owner checks, retained failures and exclusions, stale dependency heads | Whole-register currentness is not selective per-item approval invalidation. A numeric pass is not coverage or approval. |
| `mcp/src/basEngineeringReview.ts` | Actual Python replay and strict response/history acceptance | Browser integrity hashes alone do not verify saved arithmetic. Release must use the existing service, not a JS calculator. |
| `web/src/lib/store.js` PDF revisions | Same-name changed bytes are archived atomically; exact-byte re-drop is a no-op | `removePdf` deletes both current and archived bytes. Release evidence cannot rely solely on this removable filename trail. |
| `store.js` generic snapshots | Scoped snapshot save/load, id-preserving upsert, list metadata | These are mutable/deletable local records, not authenticated or immutable BAS releases. |
| `web/src/lib/revisions.js` / `snapshotDiff.js` | Existing annotation/condition quantity comparison | Flooring/material/waste semantics are not BAS requirement or point identities. Preserve commercial behavior; do not route BAS through it. |
| `web/src/lib/approvals.js` | Canvas approval seals attached to paper/shape locations and undo/redo | Not scoped BAS release approval; no source/rule/dependency fingerprint. Preserve existing seals and their meaning. |

The current BAS projection search found the existing sequence/matrix comparison,
not a cross-version BAS correspondence engine. A capture selector/history reader
must not be relabeled revision reconciliation.

## Implications to carry into the implementation contract

1. Aggregate the existing domain findings into one shared issue view with explicit
   provenance and stable subjects; do not recalculate their quantities in UI.
   An unknown issue code must remain visible and block unsupported readiness,
   not silently fall outside a severity allowlist.
2. Separate a corrected underlying input from an operator acknowledgement,
   explicit scope exclusion and an unresolved issue. A failed engineering check
   is never changed to pass by dismissal. Source/coverage claims need their own
   evidence and review meaning; generic acknowledgement is not a substitute.
3. Separate byte identity, page correspondence, source-evidence changes, semantic
   requirement changes and quantity deltas. Text equivalence alone cannot prove
   identical drawing geometry or unchanged installed quantity. Partial addenda
   require explicit retained-page accounting; omitted pages are not removals.
4. Retain original source versions for source navigation and deliverable replay.
   Define quota/failure behavior before adding retention: no successful approval
   when its evidence archive could not be written. Local integrity checks cannot
   prevent an operator from deleting browser storage or authenticate identity.
5. Define scoped snapshots and a dependency closure that includes relevant
   source/rule/input evidence. Unrelated item edits must not invalidate an
   unaffected item's review, but a new dependency set cannot silently inherit
   approval. Existing coarse engineering-head staleness stays visible until that
   new release-specific dependency logic has been verified.
6. Use one internal full-width Review & changes workspace; preserve equipment
   and source return context. Do not add new permanent canvas rails or convert
   the existing paper-approval tool into release approval.

The subsequent pre-implementation design and acceptance gates are recorded in
[Review/revision contract](REVIEW_REVISION_CONTRACT.md). Exact schema/code catalog
work must implement that contract, using current event/Python and storage
transport patterns; no new authentication or external infrastructure.

## Revision-pair inventory leads, not validation

Metadata-only development-set titles identify these possible addenda: Klamath CC
Learning Center (vol1 14, Addendum 4); VA 598-19-118 Replace 21 Air Handling
(vol2 037, revised design/two parts); VA 673-20-107 EHRM (vol2 055, Addendum 1);
Contra Costa Early Learning Center (vol2 086, Addendum 2); Guaranteed Rate Field
HVAC AHU Renovation (vol2 091, Addendum 01). No paired original versions have yet
been established. Do not report these five titles as five verified revision pairs.
No holdout source bodies or ground-truth keys were opened in this search.
