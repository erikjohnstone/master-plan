# Scoped snapshot and archive core — verification ledger

Base: `ac879e3e`, isolated `codex/bas-math-engine`. Contract and primary-source
research: `SNAPSHOT_CONTRACT.md`. This is an internal implementation increment,
not workflow E completion, a public human approval or complete conversational
BAS takeoff. No source/extraction/VectorGrid/symbol/bbox/Python-math edits.

Follow-up to checkpoint `b6249700`: `REGISTER_VERIFICATION_PROOF.md` records
measured history-validation improvements, historical-view parity, the rejected
serializer trial and the still-open combined snapshot memory gate.

## Implementation

`basSnapshot.ts` owns a strict explicit-operator declaration, exact takeoff digest,
canonical full readiness (scope, dependencies, source inventory, retained issues
and replay), separate content-hashed initial seal and opaque preparation/reopen
plans. Preview copies cannot mutate commit authority. Neither a saved `ready`
flag nor a rehashed false readiness object can replace full recomputation.
Identity is self-declared; timestamp is local/untrusted. No authenticated identity,
server immutability, installed quantity or project-completeness claim is made.

`basEvidenceBundle.ts` reuses the strict stored-ZIP writer/parser for an explicitly
different snapshot manifest and `snapshot.json`. All original PDFs remain hash-
addressed. Ordinary v1 backup output and returned fields remain unchanged; each
reader rejects the other purpose so old restore cannot accidentally adopt an
approval. Snapshot opening verifies exact hashes and original bytes and invokes
actual configured shared Python replay before returning a historical verified
plan. It does not restore annotations or approve the current working project.
The lifetime guard remains active even with an additional caller stream guard;
per-chunk checks are O(1), not repeated snapshot clones.

## Focused gates and failure ledger

- First web snapshot/backup gate **12097 exit 0**: types + 13 tests, 1.315 s.
- Archive test typecheck **30519 exit 2**: three test-only references confused
  narrative context with physical-source metadata. Corrected the test to compute
  the original digest from fixture bytes, not read it from production output.
- Final focused web **8432 exit 0**: types + 18 tests, 1.681 s. Ten new snapshot/
  archive tests and eight existing backup tests. Controlled source declarations,
  not real-PDF extraction accuracy. No assertion or production contract weakened.
- Focused MCP **14050 exit 0**: types + ten tests, 21.184 s. One new actual-Python
  snapshot test plus existing backup/replay tests. Creation and reopening execute
  Python separately; unavailable/false receipts fail. No public snapshot MCP verb
  or UI approval is exercised by these tests.
- First real-history core probe **60965 exit 1**: correctly blocked by
  `issue:equipment:scope_partly_unknown`. The retained operator review explicitly
  leaves building, level and phase unknown. Kept `tmp/bas-snapshot-core.log`.
  The positive format/runtime probe separately adds visibly CONTROLLED declarations
  via the real review service, with no extracted source-span claim. It does not
  revise the real retained fixture or weaken readiness. Empty output from two
  preceding discovery commands was a wrong-path/no-match `rg`, not a running probe.

## Required next work

Atomic project-scoped IDB source/snapshot/seal delivery with race/quota/retry tests;
append-only revoke/supersede and selective current-state comparison; readable
non-commercial result/issue/decision tables; internal Approved snapshots UI and
packaged MCP verification/export; actual real-PDF human-reviewed approval/export/
source reopen with visual checks. Remaining A–D source and unique-point identity
acceptance, browser Agent orchestration, workload-reduction measurements, full
corpus/holdout and appended symbol phase remain required. No push/merge/deployment.

Full regression and source-backed positive probe results are recorded below as
they finish; none is implied by the focused gates above.

## Source-backed probe and open performance gate

`mcp/scripts/verify-bas-snapshot-core.mts` takes the exact original PDF path.
Fixture SHA-256 `669c397133b88b7870e6e8027d28f7e3f2583b09a778b64ea14f0bd9b5fae156`,
3,528,351 bytes; original SHA-256
`c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`, 924,578 bytes.
Two scheduled-equipment claims, 458 retained issues, three assembly and 28
engineering calculations. Archive 7,875,906 bytes. Apple M2, Node v24.13.1,
macOS arm64. Controlled scope declarations are separately labeled; original
unknown decisions remain in the workflow. No source file or retained fixture changed.

- **73584 exit 1**, `bas-snapshot-core-2.log`: positive exact archive/source/math
  roundtrip, but failed the predeclared 512 MiB incremental peak RSS gate:
  **736,526,336 bytes**. Setup 38.414 s, preparation 7.354 s, archive 1.509 s,
  reopen 8.749 s. Do not report this as a performance pass.
- **9915 exit 1**, stage-profile repeat `bas-snapshot-core-3.log`: setup peak
  432,504,832; preparation 576,438,272; archive 608,829,440; reopening 713,621,504
  incremental bytes. This localizes the over-budget growth after setup; the
  measured setup remains part of the fixed gate, not excluded retrospectively.
- Shared readiness now reuses its already owned/verified history for source
  inventory and receipt identity. Previously it redundantly cloned and audited
  the complete history twice more. All public wrappers still verify raw history;
  original-byte hashing and actual Python execution remain required. No skip-
  verification request option or different calculation path was introduced.
- After that composition-only optimization, **29656 exit 0**: web types and
  28 focused tests, 3.457 s. **63647 exit 1**, `bas-snapshot-core-4.log`: preparation
  **4.599 s**, reopen **6.004 s**, archive 1.523 s; exact result/source/math checks
  still pass, but **711,458,816-byte** incremental peak RSS still fails. The
  optimization improves runtime, not enough memory to close the gate.
- **11139 exit 1**, heap-profile repetition, `bas-snapshot-core-profile.log` /
  `bas-snapshot-core.heapprofile`: 715,980,800-byte incremental peak. Exit profile
  principally retains module/text buffers and is not a precise peak-allocation
  attribution; do not claim it proves a leak.
- **10373 exit 0**, separate-process canonical serialization experiment:
  baseline 30 serializations **666.812 ms / 208,486,400-byte** incremental RSS;
  bounded candidate **729.359 ms / 167,215,104-byte** RSS. Both emit 1,476,032 bytes,
  SHA `19dcf3ba79fdbb7d6257587aea80a09d4e57a723a670716754e0b04131c64fcb`;
  deterministic/adversarial equivalence test passes. **Not integrated**: the
  isolated reduction is insufficient evidence that it solves the full snapshot
  memory defect, and it is slower. Prototype remains test-only for reproduction.

The snapshot memory gate is OPEN. No threshold, input scope, declaration mapping,
issue, original, calculation or stage was removed to make the measurement pass.
Do not present this increment as a finished enterprise snapshot workflow.

## Full web regression

**57886 exit 0**, `tmp/bas-snapshot-web-check.log`: `npm run check` completed
types/lint/tests/all configured benchmarks/build. **2,884 pass / 13 existing
skips / zero failures**, 99.633 s tests, 15.59 s build. Existing canvas warnings,
legacy One-Click limitations and bundle-size/dynamic-import notices remain.
The unchanged readiness benchmark reports **2.572–3.877 s** and **377,454,592-byte**
incremental peak RSS, below its 10 s/512 MiB limits. Scope-review operations
1.363–2.911 s and 99,614,720-byte incremental RSS are also within existing gates.
This is distinct from the new combined source-backed snapshot probe, whose
memory failure remains open and is not part of the existing `check` command.

## Full applicable MCP regression

**84419 exit 0**: typecheck; `test:bas` including posttests (**128 BAS, 33 revision,
six issue, 17 scope/readiness/snapshot tests**); packaging build and four tests;
122 staging/safe-write/tool tests; 53-tool metadata check (three markers, zero
stale). Logs: `tmp/bas-snapshot-mcp-{types,bas,pack,tools,count}.log`.
Existing Node/pdf.js warnings remain. Revision-journal operations 3.093–3.279 s,
242,827,264-byte incremental RSS; issue-journal operations 1.456–1.991 s,
443,596,800-byte incremental RSS. Existing limits all pass. This is the applicable
BAS/package/tool chain, not a new full corpus run or public snapshot walkthrough.

## Final checkpoint

**59068 exit 0**: `OT_BAS_VERIFY_PACKAGE=1 .venv-bas/bin/python -m pytest
bas_engine/tests -q` — **453 pass / zero skips**, 12.28 s. Mypy using
`bas_engine/pyproject.toml` — 20 source files, no issues. Doc-link check: 31 files
pass; `git diff --check` passes. All test/probe handles are terminal. The local
checkpoint preserves the open snapshot memory gate and the required storage/UI/
MCP/Agent integration work; it is not a completed E feature or production release.
No full corpus/holdout rerun or new corpus score is claimed. Historical baseline
remains 505/541 takeoff, 99/129 reference, 78/91 graph cells, 133/138 anchors with
the previously recorded missing-path failures. No merge/push/deploy/publication.
