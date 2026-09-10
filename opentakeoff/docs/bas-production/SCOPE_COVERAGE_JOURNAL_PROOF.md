# Durable scope and coverage journal checkpoint

2026-09-10, after `7751d132`. Internal shared implementation of
`SCOPE_COVERAGE_JOURNAL_CONTRACT.md`; not yet a public review, readiness or
approved-release feature. No VectorGrid, symbol algorithm, extraction rule,
Python production math or citation-coordinate changes.

## Implemented

Additive `bas_scope_10` retains saved exact-ID scope specifications, source-bound
coverage decisions and append-only withdrawals. Whole-page or exact-span review
binds one included claim, original source and its relevant dependency content.
Unrelated equipment edits and scope renaming preserve unchanged coverage review;
related changes stale it. Removed claims are unavailable, not rebound. Contradictory
overlapping assessments remain visible as potential conflicts. Mapping is an
explicit applicability judgment, not automatic comprehension or discovery proof.

Shared loading validates lineage/hash; explicit readers replay the saved result
fingerprint. Agent-origin records are proposals. Self-declared human identity is
not authenticated. Nothing waives existing findings or grants approval. Generic
old editors, merge/import, IndexedDB and evidence backups preserve the journal.
The public UI/MCP and readiness consumers remain next work.

The user's clarified production target is human-in-the-loop with substantial
automatic workload reduction, not a manual editor or universal unattended design
certification. This is reflected in `BAS_PRODUCTION_GOAL.md`. No scope was removed.

## Verification

From `opentakeoff/web`:

```
node --import tsx --test test/basScopeReview.test.ts
node --import tsx --test test/basScopePersistence.test.ts
npm run check
```

- Focused review **71916 exit 0: 9 pass**, 2.188 s.
- Final persistence **32207 exit 0: 8 pass**, 10.035 s. Includes nine prior
  revisions, exact source/mapping ownership, canonical restore, older editor
  preservation, conflicting branches, typed selectors, multibyte byte limits,
  retained real-source workflow roundtrip and controlled-byte evidence archive.
- Final full web **4354 exit 0: 2,852 pass / 13 existing skips / zero failures**,
  2,865 tests total. Typecheck/lint/all benchmarks/build pass. Tests 103.458 s,
  build 15.26 s. Same three canvas warnings, four disclosed legacy One-Click
  known-fails and existing bundle/Agent-key notices. This run was slower than
  the prior checkpoint; system load averages were 11.46/8.12/5.16 during the
  serial benchmark stage. Do not infer a speed improvement or attribute the
  entire variance to this change without a controlled comparison.
- Log: `tmp/bas-scope-journal-web-final.log`.

The initial persistence harness failed on a nonportable real-PDF path. Portable
CI now separately tests retained real evidence and controlled hashed archive
bytes; an explicit-path real-original proof ran below. Two subsequent harness
assertions incorrectly assumed import omitted default empty collections and the
archive resolver received a string rather than its documented source entry.
Corrected these test assumptions, without changing production behavior, then
reran all eight tests. Earlier failed runs are not called passing evidence.

From `opentakeoff/mcp`:

```
npx tsc --noEmit
node --import tsx --test test/basScopeReview.test.ts test/basDeliverableScope.test.ts test/basProjectReview.test.ts
```

**12331 exit 0: types and 10 pass**, 8.146 s. Two new tests use actual shared
Python assignment and engineering calculations: AI 4 / unknown DI remain exact,
full saved-calculation replay includes the newer workflow identity, coverage
does not waive actual failures, and a later Python change stales the dependent
review without rewriting its original failed inputs. Existing shared-pool,
scope/exclusion, production compile and restoration parity cases also pass.
Log: `tmp/bas-scope-journal-mcp-final.log`. No full Python suite or public
transport integration was changed or claimed here.

## Predeclared performance and actual original backup

The fixture remains 3,511,836 bytes, SHA-256
`afa01b4ab892d3e0c112c9b6d8137e4c90afba8013b0ffd184c6c25e4bda15f5`:
retained Fort Sam source plus controlled prior hardware decisions. Node24.13.1,
macOS arm64, Apple M2. Nine selected claims. Unchanged predeclared limits:
5 s per internal operation / 512 MiB incremental peak RSS.

Final full-check benchmark:
- Save: 2,174.538 / 1,890.011 / 1,794.718 ms.
- Whole-page coverage: 1,690.450 / 1,738.276 / 1,802.089 ms.
- Historical/current read after unrelated edit: 3,070.932 / 2,567.515 /
  2,618.699 ms; review correctly remains current.
- Incremental peak RSS: 96,059,392 bytes. All limits pass.

Earlier explicit real-original proof **86100 exit 0**:

```
npm run bench:bas-scope-review -- '/Users/erikjohnstone/Documents/ChatGPT/MASTER PLAN/HVAC BAS Benchmark Collection/pdf/12__vol2__028__Fort_Sam_Houston_Building_615_Controls_Excerpt.pdf'
```

Same operations 1,427.409–2,374.786 ms, 134,922,240-byte incremental peak RSS.
Original SHA-256 `c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`,
924,578 bytes; archive 2,397,075 bytes. Original bytes, full workflow and replayed
decision survived the source-inclusive backup roundtrip exactly. This is an
unapproved backup; no new PDF extraction, screenshot, public UI/MCP journey,
corpus/holdout run, installed-count proof or broad workload-reduction percentage.

## Next

Populate public scope/coverage choices from existing exact evidence, integrate
the shared decisions into Review & changes and MCP, and verify actual source
navigation, durable adoption, export/reopen and stale-input handling. Then finish
shared readiness, explicit dependency-bound approval and source-inclusive approved
snapshots; remaining original A–D and final corpus/holdout acceptance. The appended
symbol/installed-plan phase remains last. Goal active; no blocker or completion
claim; no push, merge, deployment, publication or external provisioning.
