# Issue decisions and corrective review

2026-09-10, before implementation, after `bb2df22c`. Implements the issue-action
portion of workflow E; does not replace its scoped approval/snapshot requirements.

Official [Autodesk issue documentation](https://help.autodesk.com/cloudhelp/ENU/Build-Issues/files/Issues_Create.html)
describes source placement, references and activity history.
[Approval workflows](https://help.autodesk.com/cloudhelp/ENU/Docs-Reviews/files/getting-started-reviews/Reviews_Create_Edit.html)
are separate explicit reviews; editing a workflow does not rewrite older reviews.
Rechecked today. Our inference: keep source-bound corrective history separate
from approval. This is not a BAS rule, authenticated-user claim, or competitor
hands-on test. BAS semantics remain in the existing domain engines.

## Contract and supported actions

**Shared path: yes** for issue identity, retained-history selection, decisions,
replay, current-state derivation and persistence validation. **Surface only** for
forms, paging, focus, return routes and IO delivery. No new extraction or math.

Add `bas_issues_9` and an append-only `issue_events` collection. Old writes,
JSON/IndexedDB restore and merge retain it; old revisions without it remain valid.
Each request owns a UUID, capture, expected journal head, six exact decision/
calculation heads, current finding-rule version, reason and self-declared reviewer
label. Entry points set operator-input versus agent-proposal origin. No trusted
identity, signature, timestamp or approval is implied.

- **Acknowledge**: observe an exact currently reported occurrence. No waiver,
  source edit, quantity edit, severity change, hidden row or release effect.
- **Begin correction**: retain the same exact occurrence before opening its
  existing domain editor. Starting does not mean the edit succeeded.
- **Record no longer reported**: reference the active earlier observation,
  replay that original finding, recompute at explicitly changed current inputs,
  and require no current finding under the same key. Retain both input versions
  and actual changed-record references. This can reflect removal/exclusion;
  it is not proof of physical correction or complete design verification.
- **Withdraw**: append a withdrawal of the current decision for that issue.
  Do not erase the old event or revive an older acknowledgement implicitly.

Original findings are reconstructed from immutable capture plus exact retained
history prefixes, not copied into editable notes or accepted from a caller.
Repeated same-payload/same-origin operation returns the original event and keeps
later history. Reused IDs, stale heads/bases, foreign subjects/events, divergent
chains and malformed input fail. A changed finding is not the old acknowledged
occurrence; a reappearing finding is open regardless of prior absence review.

Bound the journal to 10,000 events and 16 MiB encoded canonical JSON. List/history
metadata is lineage-checked but not a replay certificate. Reading one decision
replays its referenced observation/confirmation and compares current findings;
do not replay every historical version for every list render. Use operation-local
memoization only; no stale global truth cache. Cancellation produces no mutation.
Saved calculation inspection is not actual Python replay or byte availability.

## Acceptance before claiming this capability finished

1. Positive acknowledge, begin/edit/recompute/confirm, withdraw and reappearance
   journeys preserve every original source value and independent blocker.
2. Unknown codes and failed/excluded engineering constraints cannot be waived;
   unchanged or changed-but-still-reported issues cannot be confirmed absent.
3. Replay exact old evidence after later edits and canonical backup. Reject
   re-signed fabricated findings/confirmations when replayed, wrong capture/head,
   missing ancestry, future fields/rules and cross-journal operation reuse.
4. All older edit, merge, autosave, bundle restore and export paths retain revision
   9 and its journal. Competing histories fail rather than last-writer winning.
5. UI/MCP use the same decisions/replay. Actual public UI and packaged MCP must
   exercise correction, durable reload, original citation and complete export.
   Preserve draft/filter/return state and keyboard focus without nested modals.
6. Real retained Fort Sam baseline: 456 findings, 3.059-3.336 s shared read.
   Predeclare 6 s per shared single read/write and 8 s historical/current replay,
   512 MiB incremental RSS; public UI operation 10 s excluding file upload.
   Small-fixture 10,000-event structural validation: 2 s / 256 MiB incremental.
   Do not weaken these limits after observing results; investigate failures.
7. Focused schema/history/replay/persistence/negative tests, full relevant gates,
   real UI/MCP proofs, and the main goal's final corpus/holdout gate remain required.

Coverage/applicability review, deliverable exclusions, selective approvals and
approved snapshots remain separate required work. This journal never substitutes
an acknowledgement for any of those or changes `project_complete: false`.

## Implementation note — preservation and allocation

Historical selection and issue writes reuse the same complete workflow-reference
validator after incoming fields, hashes and domains have been verified. This
avoids another deep copy of unchanged PDF evidence; unowned public input cannot
use that internal seam. The verifier reuses one prepared engineering ownership
context for consecutive identical capture/equipment/assembly heads. It is bounded
to one entry, replaced on different heads, and discarded after each call. Every
engineering register and saved result still receives its original checks. No
extraction, interpretation, constraint arithmetic or evidence semantics changed.
