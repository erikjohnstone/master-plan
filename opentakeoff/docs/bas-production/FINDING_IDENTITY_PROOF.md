# Finding identity across backup and restore

2026-09-10, after `01094715`. This is a workflow-E prerequisite, not an issue
decision journal, approval implementation or completed BAS production goal.

## Reproduced defect and correction

The retained Fort Sam workflow at
`evidence/engineering-families-browser-3/ip-reviewed.takeoff.json` is 3,511,836
bytes, SHA-256
`afa01b4ab892d3e0c112c9b6d8137e4c90afba8013b0ffd184c6c25e4bda15f5`.
It contains real drawing evidence and explicitly declared controlled hardware
inputs, not automatically extracted hardware capabilities.

The old `saved_bas_findings_1` projection returned 456 findings. Canonical JSON
serialization alone changed 236 occurrence identities because `Object.values`
enumerated cell dictionaries in a different order. The added regression failed
first with **236 !== 0**; it now passes with **zero changed occurrences**.

**SHOULD THIS BE ON THE SHARED PATH? Yes.** The single browser/MCP finding
projection now gathers row evidence in the table's explicit header order.
Cells absent from the header list are retained afterward in sorted key order;
missing cells are not invented. Repeated headers do not duplicate a reference.
Blank text, null locations and different boxes containing the same text survive.
Narrative span order, raw tables, captures, results and original findings are
not modified. The rule is explicitly `saved_bas_findings_2`; older standalone
exports retain their original rule/IDs and are not rewritten.

A separate comparison against the exact previous implementation confirms all
456 original findings, statuses, subjects, text and bbox multisets are equal
after excluding versioned IDs and reference order. The entire input workflow is
unchanged. MCP production compile before/after canonical restore equals both its
prior complete output and the shared browser projection, not just a count.

## Focused verification and performance

From `web/`: `node --import tsx --test test/basProjectReview.test.ts`.
From `mcp/`: `node --import tsx --test test/basProjectReview.test.ts`.
The controlled negative test retains unlisted columns, repeated headers, blanks,
unlocated cells and equal text in distinct boxes. Existing tests retain unknown
blocking codes, failed/excluded constraints, changed relevant inputs, source
tamper rejection and shared compile parity. No scorer/key/threshold changed.

Serial three-read measurement on Node 24.13.1 / Apple M2, with no competing
test job: before **3,307 / 3,034 / 3,030 ms**, after **3,336 / 3,179 / 3,059 ms**.
Incremental peak RSS was **467,877,888** before and **475,693,056 bytes** after.
The post-change check passes the predeclared **5 s / 512 MiB** envelope. These
measurements include retained-history verification, not fresh PDF extraction or
Python replay; no speed improvement is claimed.

Logs in `tmp/`: `bas-issue-canonical-failing-test.log`,
`bas-issue-order-focused.log`, `bas-issue-mcp-focused.log`,
`bas-issue-facts-parity.log`, `bas-issue-serial-before.log`,
`bas-issue-serial-after.log`.

## Full web and public browser proof

`web/npm run check` completed successfully: **2,806 pass / 13 existing skips /
zero failures**, 31.886 s tests, 5.47 s build. Types, lint and all existing
benchmark gates pass. The same three lint warnings, four tracked legacy
One-Click benchmark failures and bundle/Agent-key warnings remain disclosed.
This is not a new full-corpus score or an Agent-model test.

The existing public walkthrough completed in 56.705 s with **456 findings**,
**zero browser errors**, exact shared export, keyboard selection/paging, correct
original source bbox, source/domain return context, retain/verify/download and
reload. Original bytes also survive the separately labeled `removePdf`
transport test. First review open was **4.298 s**; original retention **2.122 s**.
No injected finding/outcome or backend/extraction change. Browser checked all
six theme/viewport combinations; visual inspection included the 1280 light
queue, 1920 dark detail, and the actual M-512 source highlight.

Reproduce from `web/`, with a fresh output directory:

```sh
OT_BROWSER_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node --import tsx scripts/playwright-bas-project-review.mjs '/Users/erikjohnstone/Documents/ChatGPT/MASTER PLAN/HVAC BAS Benchmark Collection/pdf/12__vol2__028__Fort_Sam_Houston_Building_615_Controls_Excerpt.pdf' ../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json ../docs/bas-production/evidence/issue-order-browser-N
```

The local companion at `http://127.0.0.1:5177` was used, not a deployed website.
Proof: `evidence/issue-order-browser-1/checks.json`; screenshots, finding export,
source markup and recovered original remain alongside it. Logs:
`tmp/bas-issue-web-check.log`, `tmp/bas-issue-browser.log`.

The walkthrough now generates a canonical JSON backup of the supplied archive
and imports that file through the ordinary file input. The second run,
`evidence/issue-order-browser-2/checks.json`, passed in **56.124 s**, with **456
findings**, **zero browser errors**, **4.241 s** first open and **2.133 s** original
retention. Its export equals the shared projection of the original-order archive.
The new 1280 dark queue, 1280 light / 1440 dark details, original-source controls
and actual source highlight were visually inspected.
At 1280, detail evidence requires internal scrolling; this is not a claim that
all detail content fits in the first viewport. Log:
`tmp/bas-issue-browser-canonical.log`. No PDF or raw capture was edited.

MCP types, **128 BAS + 33 revision + four packaging tests** pass, with the
unchanged 51-tool check. Comparison runs took 3.966-4.050 s; journal operations
4.046-4.180 s, within unchanged 6 s gates. Packaged VectorGrid runtime dependencies
remain byte-identical to source. Log: `tmp/bas-issue-mcp-check.log`. No published
package or deployment is implied.

Final unchanged-engine checks: **452 Python tests pass / one explicit packaging
skip** in 6.28 s; mypy passes for 20 source files; the separately enabled
packaging test passes in 0.90 s. **122 MCP staging/safe-write/tool tests pass** in
29.386 s. Logs: `tmp/bas-issue-pytest.log`, `tmp/bas-issue-mypy.log`,
`tmp/bas-issue-python-pack.log`, `tmp/bas-issue-mcp-tools.log`.

The original five workflows remain the completion target; issue decisions, selective approvals and
approved snapshots plus final applicable corpus/holdout gates remain. The
appended deep symbol/installed-plan phase comes afterward. No extraction,
VectorGrid, Python math, symbol logic, models, pricing/labor or external writes.
