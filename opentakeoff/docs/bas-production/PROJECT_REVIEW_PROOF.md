# Saved project findings — first workflow-E slice

2026-09-10, after `0357cada`. Development-only checkpoint, not workflow-E or
main-goal completion. The five workflows still precede the appended symbol phase.

## Scope and safety

Shared-path gate: **yes** for the issue catalog, saved-finding projection and
strict public MCP input/output. **No** for the internal Takeoff route, table
layout, filtering, focus, pagination and download. UI and MCP consume
`basProjectReview.ts`; no alternate quantity or compatibility engine was added.
The catalog preserves original codes and defaults unknown codes to visible
blockers. The reader retains source wording/coordinates, typed subjects, affected
equipment, original decision inputs, exclusions and saved dependency status.

This is deliberately read-only. No schema-7 journal, dismissal, source-byte
archive, drawing correspondence, approval or snapshot is implemented here.
`readiness: not_evaluated`, `project_complete: false` and saved-not-replayed
calculation status remain explicit. An empty filtered table is not readiness.
The domain button opens the existing workspace; it does not auto-correct inputs
or yet deep-link every assignment/component/check editor. Existing extraction,
VectorGrid, Python arithmetic, citations and default compile fields are unchanged.

## Real source and reproducible public paths

Original: Fort Sam Houston Building 615 Controls Excerpt, focus rank 12.
SHA-256: `c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`.
Input archive: `evidence/engineering-families-browser-3/ip-reviewed.takeoff.json`.
It contains actual reviewed source equipment plus explicitly controlled declared
engineering capabilities, not automatically discovered hardware ratings.

Browser script: `web/scripts/playwright-bas-project-review.mjs` takes original
PDF, ordinary archive and new output directory; use `OT_UI_URL` for the running
app and `OT_BROWSER_PATH` for the installed Chrome executable. Final browser
**19202 exit 0**, `evidence/project-review-browser-4/checks.json`: **37,561 ms**
total, **4,740 ms** first queue open, zero page errors. Actual upload/import,
full JSON download, 50-row pagination, filters, keyboard activation/focus return,
source click, return to selection and existing assembly route passed. Six list
and six detail screenshots cover both themes at 1280×800, 1440×900, 1920×1080;
the list pager is asserted inside the viewport. Tall detail text scrolls inside
the reader; not every detail is visible simultaneously at 1280×800.

The selected VFD-program-responsibility finding links to M-512 / original PDF
page 8. Original bbox `[947,1824.4,2159.6,1852.6]` is divided by the original
4896×3168 page frame and equals the existing canvas highlight exactly. The
source screenshot shows the actual supply/exhaust VFD clause highlighted, not
a nearby invented location. Source and decision history remain exact.

Packaged script: `mcp/scripts/verify-bas-project-review.mts` takes original PDF,
archive, browser findings JSON and new output directory after `npm run build`.
Final public client **6687 exit 0**, `evidence/project-review-mcp-2/checks.json`:
**38,951 ms** total, **6,063 ms** warm full compile plus requested inspection.
Text/structured results agree. Every existing full-compile field is identical
with/without the option; retained Session state is unchanged by inspection.
Foreign capture rejection also preserves state. Browser 2/3/4 and MCP 1/2 exports
were independently compared: all five are exactly equal.

The queue contains **456 findings**: sequences 186, points 194, equipment 51,
assemblies 23, source inventory 1, engineering replay 1; 456 distinct keys and
occurrence IDs, no unclassified codes in this archive. These are saved diagnostics,
not 456 independently verified design defects or a source-completeness score.
Historical failed engineering events remain in the archive; the current register
is the later passing IP configuration. A separate actual-Python regression tests
current failed and excluded constraints, not this archive's current register.

## Failed-first regressions and gates

- Catalog test initially failed on `FIELD_WIRING_NOT_ESTABLISHED` (**633f4c**).
  Added explicit field-wiring/unique-identity policies; unknown fallback was already
  blocking, never hidden. The test now audits assignment-demand literals too.
- Actual Python assignment calculation reproduced the same source-wide coverage
  finding twice (**11749 exit 1**, expected 1, actual 2). The shared projection
  now emits that exact capture-wide code once, retaining calculation-specific
  findings separately. No input, result, scorer or extraction adjustment.
- Browser 1 (**96245 exit 1**) passed exact export, then failed filter lookup.
  Its saved failure is retained. Explicit accessible select labels and return
  focus were added. Browser 2 passed, but visual inspection showed pagination
  below the viewport at smaller sizes. A review-only flexible table region and
  a new viewport assertion fixed this; browser 3/4 passed. No timeout relaxation.
- Web shared queue tests: **5 pass**. MCP focused actual-Python/public-wrapper
  tests: **3 pass**. Full BAS gate **38494 exit 0**: **93 pass**, zero skips or
  failures, **13,410.90375 ms**. Tests run in the normal `test:bas` gate now.
- Full web **6893 exit 0**, `evidence/project-review-web-check-final.log`:
  **2,675 pass / 13 existing skips / 0 failures**, 11,841.286459 ms test phase;
  typecheck, lint (three existing warnings), bench and build pass, build 5.32 s.
  Final review layout also passed subsequent type/lint **63956 exit 0** and the
  real browser harness. Existing bundle-size/Agent-key warnings are unchanged.
- MCP typecheck, build, unchanged 50-tool check and package suite **30387 exit 0**:
  **4 pass** including byte-identical packaged VectorGrid runtime dependencies.
  Doc-link check passes for its existing 31-file scope; no push/merge/deploy.

## Research and remaining acceptance

The existing E contract uses official Bluebeam/Procore revision documentation and
MDN transactional-storage guidance. This slice also checked the W3C
[tables tutorial](https://www.w3.org/WAI/tutorials/tables/) and
[dialog focus guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
on 2026-09-10: preserve real header associations and deliberate focus return.
Our internal reader's focus behavior is an application of those principles, not
a claim that it is a nested modal or that all accessibility is certified.

Performance remains unfinished. A same-archive standalone projection measured
3,231.5 ms without concurrent test work. Three later calls while browser/MCP work
ran measured 5,849.3 / 5,366.5 / 5,271.6 ms on Node 24.13.1, Darwin arm64. RSS
after those calls was 426,262,528 / 362,479,616 / 503,955,456 bytes; these are
point-in-time readings, **not peak memory** or isolated cold/warm benchmarks.
Do not call the queue fast or treat these samples as a p95. Before optimizing,
freeze an isolated profile and regression output. Provisional interactive targets
for this 9-page archive are ≤100 ms loading feedback, ≤500 ms unchanged reopen,
≤1 s warm projection after source/history verification, and no UI long task over
50 ms. Targets are not met/verified by this checkpoint and must not justify
skipping source validation or weakening result equality.

Next: complete E's bounded source retention, correspondence, project decisions,
selective dependencies, positive approval and source-inclusive export journey;
broaden exact corrective navigation, failure/cancellation/large-data UI tests and
all A–D real-corpus gates. Cross-domain duplicate aggregation beyond this tested
source-wide case is still part of the full E acceptance, not assumed proved.
No new blind holdout was opened. No full extraction-corpus score was rerun for
this checkpoint; the old 505/541 takeoff, 99/129 reference, graph 78/91 cells and
133/138 anchors, including 23 old-path ENOENTs, remain the disclosed historical
baseline. Public Fort Sam parity is not a replacement for the final corpus gate.
