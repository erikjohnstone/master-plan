# Shared history validation — allocation and parity evidence

2026-09-10, base `b6249700`, isolated `codex/bas-math-engine`. This is a
performance/integrity increment toward workflow E, not snapshot completion or
Agent integration. The intervening user status question confirmed that the
browser Agent still lacks the new five-workflow orchestration; that remains a
required acceptance gate, not a future optional enhancement.

## Research and implementation boundary

[V8 sampling documentation](https://chromedevtools.github.io/devtools-protocol/v8/HeapProfiler/#method-startSampling)
distinguishes live sampled objects from allocations collected by minor/major GC.
[Node's inspector session API](https://nodejs.org/api/inspector.html#heap-profiler)
allows profiling the current process without opening a network inspector port.
The optional diagnostic uses both collected-object flags and 32,768-byte sampling.
Estimated allocated bytes describe churn, **not retained memory or peak RSS**.
Profiler timings are not acceptance-performance measurements.

Profile **80892 exit 1**, `tmp/bas-snapshot-allocations-1.log`, showed estimated
48.764 GB allocation during controlled setup, 5.654 GB preparation, 2.035 GB
archive, and 7.718 GB reopening. Repeated equipment validation, candidate building,
component interpretation and assembly validation dominate the source-owned
allocations. This is evidence for safe reuse of immutable prerequisites, not for
skipping decision validation or changing source interpretation.

SHOULD THIS BE ON THE SHARED PATH? **Yes.** Shared equipment/assembly validators
now offer prepared, privately owned contexts. Workflow verification retains only
one context per type within one invocation. Capture/equipment-head changes replace
it; assembly interpretation changes replace the one cached rule result. Source
inputs are owned before asynchronous work; returned views are independent copies.
Every event is still hashed, every register checked, every interpretation identity
compared, and every calculation result/input fingerprint verified. There is no
global result cache or public `skip_validation` flag. Public quantity input builders
still validate sources; only the history verifier projects an exact register it
has already validated. Python remains the arithmetic authority.

No VectorGrid, table/legend/symbol extraction, source interpretation grammar,
quantity arithmetic, bbox, persisted schema, scoring key or threshold changed.
`basCanonical.ts` remains byte-for-byte identical to the base commit.

## Focused and historical parity checks

- **72615 exit 2:** new test fixture inferred an empty `source_span_ids` array as
  `never[]`. Explicit test register typing fixed it; production types unchanged.
- **8842 exit 1:** 44 pass, one new test failure. Adding test passthrough metadata
  correctly changed the source occurrence identity. Rebuilt that fixture's bindings
  from its changed evidence; did not relax the ownership assertion.
- **98144 exit 0:** 45 tests, 12.498 s. **85916 exit 0:** 48 tests, 13.005 s.
- **61485 exit 0:** 49 tests, 14.408 s. This command also named a nonexistent
  `basAssemblyQuantityContract.test.ts`; Node did not execute such a test. Actual
  Python assembly coverage belongs to MCP `basAssemblyQuantities.test.ts` and is
  required in the broader gate. A subsequent projection-parity test is included
  in the final full web run.
- New tests cover input and returned-view mutation, preserved nested passthrough
  evidence, real-source clause mutation, rejected-call isolation, mixed rule
  versions, rehashed counterfeit later events, foreign capture members, changed
  equipment heads, and parity of public versus already-validated input projection.
- Historical full-view comparison **9227 exit 0** compares every field of both
  equipment events and all five assembly events in the retained development
  history with the old `b6249700` validators. Views match exactly. Combined view
  SHA-256: `19386883899646efc28f6a5b0c081c75d2ce4ce346c59d99009f5696d925fa73`.
  Fixture SHA-256: `669c397133b88b7870e6e8027d28f7e3f2583b09a778b64ea14f0bd9b5fae156`.
  This is compatibility evidence, not fresh extraction or independent ground truth.

`mcp/scripts/verify-bas-register-parity.mts` takes a directory containing the two
historical validators. For this run, `git show b6249700:opentakeoff/web/src/lib/…`
provided their exact source. Only imports were resolved to the unchanged shared
dependencies, including the historical equipment module for historical assembly
validation and the installed web Zod module. Local baseline copies are under
`tmp/bas-validator-parity.PgAhCr`; log `tmp/bas-register-parity-2.log`. The first
attempt failed module resolution for Zod before comparing any views; retained as
`tmp/bas-register-parity.log`.

## Fixed snapshot probe — memory gate remains open

Same command/input/original as `SNAPSHOT_CORE_PROOF.md`. No claim, retained issue,
calculation, source, setup stage or fixed 25-second/512-MiB limit was removed.
All runs preserve two included claims, 458 retained issues and 31 actual-Python
calculation replays. These are controlled applicability/approval declarations,
not a real user approval or public UI/MCP workflow.

| Run | Setup | Prepare | Archive | Reopen | Incremental peak RSS | Outcome |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Base composition optimization, 63647 | 40.404 s | 4.599 s | 1.523 s | 6.004 s | 711,458,816 B | Memory fail |
| Prepared validators, 45938 | 21.182 s | 3.169 s | 0.806 s | 3.799 s | 683,147,264 B | Memory fail |
| Plus serializer experiment, 33041 | 23.378 s | 3.226 s | 0.888 s | 4.494 s | 651,870,208 B | Memory fail; serializer rejected |
| Validated calculation projection, 27046 | 16.389 s | 2.616 s | 0.614 s | 3.079 s | 648,708,096 B | Memory fail |

Logs: `tmp/bas-snapshot-core-prepared-{1,2,3}.log`. All three runs exit 1.
The serializer experiment passed historical bytes/rejections and 48 focused
tests but did not solve the memory gate and slowed reopening. Its production
change was reverted; the isolated test-only experiment remains reproducible.
These single-run figures are not p95 or a universal performance claim.

## Remaining acceptance

Broader web/MCP/Python gates are recorded below when terminal. The performance
improvement does not waive the failing combined memory gate. Continue atomic
source/snapshot/seal storage and public approval/export/reopen, then complete
Agent orchestration and supported point identity reconciliation. Recheck memory
before accepting that complete public journey. All original A–D, full corpus,
blind holdout and appended researched symbol/installed-plan gates remain required.
No push, merge, deployment, publication or complete-production claim.

## Final verification for this increment

- **34523 exit 0:** web types, lint, 2,892 tests passed / 13 existing skips /
  zero failures, all configured benchmarks and build. Tests 64.177 s; build
  17.67 s. Existing canvas warnings, four One-Click limits and bundle notices
  remain. Readiness 1.356–1.409 s / 400,818,176 B incremental peak RSS; its
  unchanged 10-second/512-MiB projection gate passes, not the combined gate above.
- **41130 exit 0:** MCP types; 128 BAS, 33 revision, six issue, 17 scope/snapshot,
  four packaging and 122 tool/staging/safe-write tests; configured benchmarks
  and 53-tool metadata checks pass. Packaging verifies byte-identical VectorGrid
  runtime dependencies. Logs: `tmp/bas-prepared-register-mcp-{types,bas,pack,tools,count}.log`.
- **66195 exit 0:** package-enabled Python pytest 453 pass / zero skips,
  12.32 s; mypy passes all 20 files.
- The isolated application loaded at `127.0.0.1:5177`. This is a smoke load,
  not the still-required actual snapshot approval/reopen walkthrough.

Previous goal turn produced evidence: MCP handle 41130 was revalidated terminal
and its complete successful chain inspected. No blocker or process restart.
The next implementation is browser persistence consuming shared owned plans.
