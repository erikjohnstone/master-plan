# Public scope and source-coverage workflow

2026-09-10, before implementation after `371ec826`. Completes public access to
the existing shared scope/coverage journal; readiness, approval and approved
snapshots remain required subsequent integration, not replaced by this reader.

## Research and interface decisions

Rechecked the official [Autodesk approval-workflow documentation](https://help.autodesk.com/cloudhelp/ENU/Docs-Reviews/files/getting-started-reviews/Reviews_Create_Edit.html)
on 2026-09-10: draft and finalized workflows are distinct, edits apply to future
reviews, and finalized workflows cannot simply be deleted. Design inference for
this local-first application: separate a working draft from retained review
history, preserve prior inputs, and never present a saved scope as approval.
This is documentation research, not hands-on Autodesk testing; its authenticated
roles and administrator controls are not capabilities of this platform.

The real 1280-pixel walkthrough reproduced a 1,299-pixel scroll width inside a
1,218-pixel workspace: a nested fieldset retained its intrinsic `min-content`
minimum. [MDN's fieldset rendering reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/fieldset)
was checked on 2026-09-10. Scope-only minimum sizing and a bounded grid track
correct the layout; no hidden overflow or evidence truncation substitutes for
the unchanged layout assertion. Explicit control labels survive remounting with
filled textarea content. Dense historical mappings use a paged table, not a
concatenated paragraph.

Reuse the project-tailored-sequence/points evidence in
`DELIVERABLE_SCOPE_CONTRACT.md`. Mapping a retained source reference can save
searching but cannot prove that all project-specific requirements were found.

Place **Scope & coverage** inside **Review & changes**, not in a new permanent
canvas toolbar. Present existing source sets and saved scopes, then a full-width
catalog populated from exact retained equipment, assignments, components,
responsibilities and checks. No user types internal IDs. Show original source
status and evidence; never pretend catalog availability is coverage completeness.

## Shared semantics and useful automation

**Shared-path gate: yes** for catalogs, source ownership, mappings, preview and
record/replay. UI selection/drafts/paging and Session delivery/adoption remain
surface-specific. Reuse the committed journal and scope compiler; no quantity,
extraction or matching change.

- Generate available claims from current pinned inventory roots, not names or
  heuristic searches. Surface inside/outside/unlocated evidence rather than
  dropping it. Users can populate a draft from available claims or choose a
  subset. Enforce the existing 2,000-target cap; never truncate an over-limit
  selection. Exclusions require reason, consequence and exact source evidence.
- Save only an explicitly named, reasoned scope using fresh selectors and the
  current journal/predecessor. Preserve all prior scope versions and coverage.
- For coverage, pick an included claim and a source page or exact span subset.
  Offer mapping candidates from that claim's existing dependency references on
  the same original page/span. This is source-reference intersection only, not
  semantic interpretation or a coverage verdict. No bbox guessing. A lack of
  suggestions never means no requirement or not applicable.
- Show the full original source in a paged reader and preserve citation return.
  Require explicit assessment, source-inspection attestation, reviewer and reason.
  Do not preselect "not applicable" or silently accept all suggestions. Users
  can select other owned dependency items; shared validation remains authoritative.
- Read historical scope and coverage through exact replay. Show supersession,
  withdrawal, changed/unavailable dependencies and potential overlapping conflicts.
  Agent-origin records remain proposals. No automatic waiver or approval.

## Transport and persistence

Browser writes use the existing annotation workflow/adoption guard, rejecting
changed workflow, PDF set, restore epoch or storage adapter. Drafts are separate
from saved history; source navigation preserves them. Cancellation and stale
responses must not adopt or download partial state.

MCP uses the same shared services via `bas_scope_review`; no arithmetic in its
transport. Read-only catalog/preview/coverage preparation do not mutate history.
All writes are agent proposals. Reuse bounded exact-field paging and atomic full
JSON exports, with one expiring view per Session. Full project persistence stays
in normal takeoff/evidence-bundle export and existing restore—not an operation
view mistaken for a backup. Include metadata that cached read is not new replay.

## Acceptance before completion

Test exact catalog ownership across captures and repeated labels; source-set
boundaries; mapping suggestions and missing/foreign spans; strict request capture
before awaits; preserved quantities/unknowns; cancellation; unsafe draft/late
response rejection; actual tool registration and complete paging/export; expired
or invalidated views; old/new journal persistence and independent findings.

Use actual original-PDF UI/MCP journeys: populate a scope from retained data,
review explicit exclusions and source coverage, follow original citations, retain
draft and keyboard context, save, reload, replay, change related/unrelated inputs,
withdraw and export/reopen. Inspect both themes at 1280/1440/1920 widths. Clearly
label controlled applicability/engineering inputs. No claims of new automatic
source interpretation, real addendum validation or installed quantity.

Keep internal operation gates at 5 s/512 MiB on the retained fixture. Public
single catalog/prepare/record/replay operations must be below 10 s, matching
existing issue actions' budget; capture actual elapsed time rather than masking
it with a loading indicator. New complete-path proof precedes any public
completion claim. No corpus/holdout access is needed for UI plumbing; final full
goal gates remain intact.
