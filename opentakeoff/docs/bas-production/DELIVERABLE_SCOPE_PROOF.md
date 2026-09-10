# Shared deliverable scope compiler checkpoint

2026-09-10, after `c1a7fcea`. Internal foundation for the original review/release
workflow, **not** a finished public scope, coverage or approval feature.
Predeclared design, primary-source research, limits and acceptance:
`DELIVERABLE_SCOPE_CONTRACT.md`.

## Implemented and protected

`web/src/lib/basDeliverableScope{,Contract}.ts` accepts strict exact-ID claims
and source-cited exclusions against the existing pinned revision basis. It owns
the request before awaits, verifies the workflow and reuses the unchanged shared
inventory. It retains full original items, source text/bboxes, declared conditions,
responsibility decisions and saved results. It computes no BAS quantity.

Per-claim dependency membership and content fingerprints support selective
review: unrelated edits preserve unaffected fingerprints; related scope,
responsibility, condition and resource changes alter them. Existing stale pinned
records remain explicitly stale even when item content is unchanged. Historical
bases never silently adopt new heads. Missing and actually calculated empty
point results are distinct diagnostics, neither an authoritative zero.

Exclusions omit named report claims, not source evidence or underlying shared
loads/assignment members. Excluded prerequisites and resource-connected failed
checks remain visible. Unknown values stay null. Unselected inventory remains
available. Preview always reports approval/project completeness false, installed
quantity null, and coverage/issues/source bytes/Python replay unverified.

No extraction, VectorGrid, symbol, existing domain rule, Python arithmetic,
persistence schema, UI or public MCP contract was changed. No new user-facing
control or tool was introduced in this internal slice. All public wiring,
durable decision history and actual approval remain required next steps.

## Reproduced checks

Working directory: `opentakeoff/web` unless stated otherwise.

```
node --import tsx --test test/basRevisionInventory.test.ts
node --import tsx --test test/basDeliverableScope.test.ts test/basRevisionInventory.test.ts
npm run check
```

- Baseline **33339 exit 0**, 12 inventory tests.
- Focused **43111 exit 0**, typecheck, 22 scope/inventory tests and scope benchmark.
- Final full web **5760 exit 0**, **2,835 pass / 13 existing skips / 0 failures**,
  2,848 tests total, 21.964 s test duration. Typecheck/lint/all existing and new
  benchmarks/build passed; build 5.40 s.
- Same three canvas lint warnings, four disclosed legacy One-Click known-fails,
  existing bundle-size warning and Agent-key build notice remain. No live Agent
  call was needed or claimed. Log: `tmp/bas-deliverable-scope-web-final.log`.

Working directory: `opentakeoff/mcp`:

```
npx tsc --noEmit
node --import tsx --test test/basDeliverableScope.test.ts test/basProjectReview.test.ts
```

Final **15294 exit 0**, typecheck and **8 pass**, 3.054 s. Four new scope tests
use the actual shared Python service, and four existing project-review tests
retain production compile/shared/browser-projection/restore parity. Tests prove:

1. A disconnected engineering edit preserves an unaffected scope fingerprint;
   an added connected, excluded failure remains an included prerequisite.
2. An excluded equipment report claim leaves both actual assignment members and
   the Python-produced AI value 4 intact; unknown DI remains null.
3. An actual empty-template calculation is distinguished from no calculation.
4. Adding a third 25 VA operating load to the explicitly declared 50 VA pool
   changes the actual power and dependent expansion results from pass to fail.
   The load owner's report exclusion removes neither that member nor its failure.

These are controlled input/ownership cases, not automatically discovered hardware
capabilities. Log: `tmp/bas-deliverable-scope-mcp-final2.log`. Earlier seven-test
gate passed before adding the dedicated shared-pool test; it is not the final
eight-test result. No full Python-suite run is claimed; Python production source
is unchanged.

## Real retained input and performance

Original Fort Sam PDF SHA-256:
`c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`.
Retained input `evidence/engineering-families-browser-3/ip-reviewed.takeoff.json`,
3,511,836 bytes, SHA-256:
`afa01b4ab892d3e0c112c9b6d8137e4c90afba8013b0ffd184c6c25e4bda15f5`.
Original PDF evidence plus explicitly controlled equipment/hardware decisions;
not a new PDF extraction, installed count or physical-design proof.

`npm run bench:bas-deliverable-scope` is now in the full check. Final serial runs:
**833.571 / 836.404 / 832.851 ms**, incremental peak RSS **31,391,744 bytes**,
under the predeclared 5 s / 512 MiB limits. Node 24.13.1, macOS arm64, Apple M2;
496 unchanged inventory items, nine selected claims, 205 dependency memberships,
50,571-byte scope projection. Three repeated in-process runs are not a broad
cold/warm or p95 production study. Operational maximums are guarded, not a claim
that every maximum-size input satisfies this fixture's timing.

No corpus/holdout rerun, new UI screenshots, packaged MCP tool journey, source-byte
availability verification or approved snapshot is claimed. Prior real-PDF UI
proof remains unchanged. The new retained-input test confirms original inventory
and workflow values are unchanged through preview and canonical restoration.

## Next, still inside the main goal

Add the validated scope/coverage journal and exact applicability decisions,
shared issue/readiness assessment, public Review & changes/MCP integration,
selective explicit approvals, atomic source-inclusive snapshots and positive
export/reopen proof. Finish remaining A–D acceptance and final applicable corpus /
untouched-holdout gates. Only afterward execute the appended researched symbol /
installed-plan phase. No main merge, publication or deployment.
