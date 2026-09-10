# Shared issue-history foundation

2026-09-10, after `bb2df22c`. **Internal foundation, not completion of workflow E.**
The original five-workflow BAS goal remains first; the appended symbol/installed-
plan phase remains last. No merge, deployment or publication.

## What is implemented

- Additive `bas_issues_9` history, exact capture and six decision/calculation
  selectors, operation/head ownership, reasons and self-declared reviewer labels.
- Acknowledge, begin correction, record no longer reported and withdraw. None
  dismisses a blocker, changes quantities, grants approval or certifies a design.
- Original observations and recorded absence independently replay against their
  pinned evidence. An actual changed register is required for absence review.
  Reappearing findings reopen; withdrawn decisions do not revive older ones.
- Journal metadata is lineage-only until selected replay. Forged/re-signed issue
  observations and confirmations are rejected by replay, not treated as proof
  merely because their JSON hashes agree.
- Normal JSON/IndexedDB and source-inclusive evidence ZIP preserve the journal.
  Older sequence/equipment/assembly/engineering/drawing/comparison writers and
  real Python assignment/assembly calculations retain revision 9 and old replay.
- Strict 10,000-event / 16 MiB UTF-8 journal limits; Unicode, future fields,
  foreign subjects, stale heads, conflicting branches, retry and cancellation
  checks. Full incoming metadata is owned before the verifier's first await.

All interpretation and truth remain shared. UI controls and public MCP issue
commands are **not yet wired**. No claim of a new public issue-action walkthrough.
The existing review queue remains unchanged by acknowledgements.

## Reproduced failures and fixes

The initial retained-project run met latency limits but failed the predeclared
512 MiB incremental RSS bound: **549,109,760 bytes**; repeated profiling reached
559,087,616 bytes. Removing duplicate deep copies alone was not sufficient:
one repeated candidate still reached **544,489,472 bytes**. These failures are
retained in `tmp/bas-issues-serial-initial.log`, `-profile.log` and
`tmp/bas-issues-serial-final-3.log`; no budget was raised.
An additional owned-input repeat still reached **555,368,448 bytes**
(`tmp/bas-issues-owner-bench-2.log`). Assembly-backed engineering validation was
still repeating identical equipment validation. It now consumes the equipment
issues already produced by that assembly check and a schema-owned register.
The no-assembly path still runs the equipment validator. No check was removed.

The shared verifier was repeatedly validating identical equipment/assembly inputs
for consecutive engineering records. It now retains one prepared ownership
validator for the exact capture/equipment/assembly heads, replacing it on a new
tuple and discarding it after the operation. Every engineering register, event
hash, saved result and dependency check still runs. No new arithmetic, extraction
algorithm, interpretation rule or cross-request cache.

Failed-first async metadata tests also reproduced a caller-aliasing defect:
Zod passthrough metadata retained nested objects. The common verifier now takes
an owned snapshot before asynchronous work. Inspect, record and historical-read
tests keep the original metadata even if the caller changes its copy mid-request.
Logs: `tmp/bas-issues-metadata-failed-first.log`,
`tmp/bas-issues-common-owner-failed-first.log`, `tmp/bas-issues-owner-focused.log`.

## Real retained source versus controlled decisions

Fixture: `evidence/engineering-families-browser-3/ip-reviewed.takeoff.json`,
3,511,836 bytes, SHA-256
`afa01b4ab892d3e0c112c9b6d8137e4c90afba8013b0ffd184c6c25e4bda15f5`.
It retains Fort Sam drawing evidence plus explicitly controlled hardware inputs.
The benchmark supplies **controlled** building/level/phase values; it does not
claim those values were extracted from the PDF or that an installed design changed.

The original queue contains 456 findings. The controlled scope edit removes the
selected unknown-scope finding but causes other dependency findings: the resulting
queue has 458, not a fabricated green result. Original capture bytes/values and
the selected old finding replay exactly after canonical backup. No PDF extraction,
source-byte verification, Python arithmetic replay or public walkthrough is
claimed by this benchmark itself; separate tests exercise Python-backed writers.

## Reproduction and remaining gates

Final coordinated check **34704 exited 0**:

- Web: **2,821 pass / 13 existing skips / zero fail**; types, lint, benchmarks
  and build pass. Same three lint warnings, four pre-existing legacy One-Click
  benchmark failures and bundle/Agent-key notices remain.
- MCP: types, **128 BAS + 33 revision + two issue integration + four packaging
  + 122 staging/safe-write/tool tests pass**. Unchanged 51 tools; local version
  0.9.76 remains unpublished.
- Python: **452 pass / one explicit packaging skip** in 6.36 s; mypy passes
  20 source files; separately enabled packaging passes in 0.90 s.
- Three final serial repeats plus the integrated gate meet the original limits:
  **0.838–1.124 s** per operation, maximum **521,912,320 bytes** incremental peak
  RSS versus 536,870,912 allowed. These are M2/Node 24 fixture measurements,
  not universal guarantees.
- Integrated 10,000-event structural gate: **128.279 ms**, **33,325,056 bytes**
  incremental RSS, 12,189,939 journal bytes. Not 10,000-version finding replay
  or interactive UI performance.

Full logs: `tmp/bas-issues-final-*`. Source hashes, failed measurements and final
serial repeats: `evidence/issue-journal-shared.json`.

From `web/`: `npm run check`. From `mcp/`: `npm run typecheck`,
`npm run test:bas` (includes serial revision and issue gates),
`npm run test:packaging`, `npm run check:tool-count`.
`npm run test:bas-issues` alone runs old-writer integration, bounded structural
history and retained-source read/write/replay measurements.

Predeclared limits remain in `ISSUE_DECISION_CONTRACT.md`: 6 s shared read/write,
8 s historical/current read, 512 MiB incremental RSS; 2 s / 256 MiB for the
controlled 10,000-event structural check. UI operation budget remains 10 s,
excluding upload; it has not yet been exercised for the new controls.

Next: shared-backed public UI/MCP issue actions, exact corrective routing, safe
adoption, original-source inspection, durable reload and full export. Then
coverage/applicability decisions, dependency-bound selective approvals and a
positive approved snapshot journey. Remaining A-D and full corpus/holdout gates
are still required before the appended research-gated symbol phase. No new
models, OCR/raster interpretation, costing, labor, VectorGrid/symbol changes,
holdout opening or claim of complete BAS production readiness.
