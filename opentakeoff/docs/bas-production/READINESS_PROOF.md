# Scoped readiness implementation proof

2026-09-10, after `6192c488`, local `codex/bas-math-engine`. Internal shared
implementation checkpoint, **not a completed public approval workflow**. The
full objective remains active. Predeclared rules/budgets: `READINESS_CONTRACT.md`.

## What changed

`prepareBasScopeReadiness` replays the owned scope and active coverage with an
operation-local cache bounded to two projections. New shared `basReadiness`,
`basReadinessCoverage` and `basReadinessIssues` distinguish explicit reviewed
source accounting, mapped dependency evidence, actual original-byte identity,
actual Python replay, selective dependency changes and retained domain defects.
Every original issue remains available, including outside-scope findings. Unknown
codes block. Readiness never writes an approval, changes a calculation, mutates a
workflow, or claims installed quantity/project completeness.

No extraction, VectorGrid, symbol, bbox, source interpretation or Python
arithmetic change. One existing fixture gained optional byte/hash parameters;
its defaults/previous assertions remain unchanged. Normal web and MCP BAS gates
now include the new readiness tests/benchmark. No tool added/version published.

## Focused evidence

- `67096`, exit 0: 19 shared readiness/scope tests, 2.013 s. Positive source-backed
  scoped equipment readiness; missing/wrong originals; agent-only/withdrawn/stale
  reviews; conflicting coverage; complete versus incomplete span accounting;
  table-cell references without invented narrative IDs; exact mappings;
  unchanged unrelated versus changed relevant inputs; unknown issues; false
  receipts; adapter-copy mutation; cancellation and forged projection rejection.
- `82645`, exit 0: MCP typecheck and five actual-Python integration tests,
  4.900 s. Positive declared engineering, component quantities and all five
  responsibility activities; passing/failing/not-evaluable constraints; actual
  replay without freshness; failed excluded shared-resource prerequisites; and
  preserved ambiguous assigned observations/identity blockers.
- `38813`, exit 0: retained original-workflow readiness projection in
  **4.285 / 3.795 / 3.764 s**, **443,629,568-byte incremental peak RSS**, below
  the predeclared **10 s / 512 MiB** bounds. Eight included claims, 72 claim/page
  pairs, 456 original issues and 1,812 unresolved blocker entries. These are
  accounting/diagnostic counts, not accuracy or automatic-work-reduction scores.

The first MCP run (`92292`) was 4 pass / 1 fail: the unknown-rating fixture used
`{value:null,basis:…}` instead of the existing contract's `null` rating. Corrected
the fixture to the established contract; no production schema or assertion was
weakened. A first file-search command used a nonexistent glob/path; corrected
with repository file discovery. Neither failure was an extraction defect.

Reproduce from `opentakeoff/web`:

```sh
node --import tsx --test test/basReadiness.test.ts test/basScopeReview.test.ts
npm run bench:bas-readiness
npm run check
```

From `opentakeoff/mcp`:

```sh
npm run typecheck
node --import tsx --test test/basReadiness.test.ts
npm run test:bas
```

The benchmark retains the prior real-PDF workflow with deliberately withdrawn
coverage, rather than manufacturing a positive approval from it:
`evidence/scope-browser-7/reviewed.takeoff.json`, 3,528,351 bytes, SHA-256
`669c397133b88b7870e6e8027d28f7e3f2583b09a778b64ea14f0bd9b5fae156`.
Node v24.13.1, macOS arm64, Apple M2. It reruns no extraction, reads no holdout,
does not load original PDF bytes and does not execute Python; those are separate
gates. Unit fixtures use controlled bytes/source declarations, not real PDFs.

## Full gates

**Web `95900`, exit 0:** full `npm run check` — types, lint, 2,872 passing tests,
13 existing skips, zero failures, all configured benchmarks and build (8.72 s).
Tests took 83.360 s. The same three existing canvas warnings, four documented
legacy One-Click known-fails and bundle notices remain. Readiness in this full
gate: 4.063 / 3.916 / 3.858 s, 469,352,448-byte incremental peak RSS. Existing
scope-journal operations stayed at 1.366–1.777 s / 172,769,280-byte incremental RSS.
No existing threshold or golden was changed.

**MCP `6178`, exit 0:** typecheck; 128 BAS tests, 33 revision tests, six issue
tests, 16 scope/readiness tests; existing revision/issue benchmarks; four
packaging tests; 122 tool/staging/safe-write tests; 53-tool metadata check with
zero stale markers. Revision comparison stayed at 2.911–2.963 s / 155,631,616-byte
incremental RSS; revision journal 3.030–3.291 s / 227,393,536 bytes; issue journal
1.378–1.764 s / 461,291,520 bytes. All unchanged budgets pass. This was the
applicable BAS/packaging/tool gate, not a claim of rerunning every ordinary MCP
test or every corpus evaluator.

**Python `91952`, exit 0:** `OT_BAS_VERIFY_PACKAGE=1 .venv-bas/bin/python -m
pytest bas_engine/tests -q`: 453 passed, zero skipped, 12.24 s. Mypy with
`bas_engine/pyproject.toml`: 20 source files, no issues. No Python production code
changed. `node scripts/check-doc-links.mjs`: 31 checked files, paths/anchors pass;
`git diff --check` passes.

No new corpus/holdout or public UI/packaged-tool walkthrough result is claimed.
The historical non-green corpus baseline remains unchanged in progress.

## Remaining acceptance — do not mistake infrastructure for the whole takeoff

The current service is not yet exposed as an approval action in either public
surface. Explicit approval, atomic source-inclusive snapshots, guarded browser/
MCP transport, export/reopen and real positive public walkthroughs remain next.
Do not accept public ready flags/receipts or let an Agent impersonate a human seal.

The Agent integration audit is now explicit in `IMPLEMENTATION_PLAN.md`: browser
compile currently lacks the new workflow operations exposed by MCP/Takeoff.
An actual conversational supported-draft journey and measured workload reduction
remain mandatory before completion. No new model interpretation is authorized.

The existing assignment engine always retains unresolved unique-point identity
and project-total flags. This readiness increment does **not** waive those flags
or manufacture a positive complete assigned-point approval. Final A/B work must
resolve supported identities/reconciliation, with source-backed corrections and
negative controls. Four other claim-kind positives do not substitute for that
requirement. Remaining A–D corpus gates, final holdout/regressions and appended
symbol/installed-plan phase remain in the full goal. No push, merge or deployment.
