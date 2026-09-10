# Exact issue navigation and source-accounting reader

2026-09-10, after `c0a3ac8e`. This is a verified continuation of main workflows
A/E, not completion of source coverage decisions, scoped approval or the goal.

## Boundary and rationale

**Shared path? No for these changes:** exact display selection, paging, focus,
draft retention, historical-context button availability and source-click UX are
surface-specific. They consume the unchanged `basSequenceView` and project issue
projection. No shared rule, extraction, VectorGrid, symbol, Python arithmetic,
workflow schema, source-coordinate or MCP transport behavior changed.

Rechecked official [Autodesk issue documentation](https://help.autodesk.com/cloudhelp/ENU/Build-Issues/files/Issues_Create.html):
issues retain source placement/references and activity. Our inference is to
preserve precise corrective context rather than navigate by a repeated title.
This is workflow research, not BAS engineering authority or hands-on competitor
testing. Existing BAS interpretation rules and applicability limits remain.

The failed-first route test reproduced the defect: clause/comparison navigation
did not carry an exact target. The fix resolves exact existing region/clause or
published comparison identity inside the shared result. It does not split opaque
IDs, fuzzy-match names, infer new associations or alter a finding. Removed or
foreign targets do not fall back to the first region. Historical capture routes
remain in issue history with an explicit notice. Historical decision contexts
cannot start new actions or submit a retained draft; the shared writer remains
the final authority. Page navigation resets stale display filters/paging.

The internal source reader exposes the shared discovery partition, with exact
page identity, original text, original citation, classification and 50-row paging.
It does **not** record a page review, decide applicability, make unsupported prose
interpreted, remove issues or approve a takeoff. Full evidence exports are unchanged.

## Tests and actual UI evidence

Focused `web/test/basIssueClient.test.ts` covers original adoption races plus
exact scope/assignment/component/check routes, real shared clause/comparison
results, region boundaries, removed/foreign comparisons, page ownership,
historical-capture preservation, stale display filters and action context.
Assertions preserve the original workflow and unrelated editor drafts.

Authoritative actual-browser proof: `evidence/issue-routes-browser-3/proof.json`.
Original Fort Sam PDF hash:
`c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`.
Input is the earlier committed actual UI backup
`evidence/issue-public-browser-3/reviewed.takeoff.json`, hash
`253b90a066a9a8b28e394873e7a5663710588649af801a4c598a618d7486d617`.

The fresh-profile run used ordinary PDF upload and archive import, selected a
later-page DOAS clause despite duplicate titles, preserved an unfinished link
draft, opened its exact original bbox, then created a comparison through the
actual form. That link is **controlled operator applicability**, not automated
equipment inference. The issue route selected its exact matrix comparison.
Page 9 accounting retained all 1,185 unassigned spans, rendering 50 at once;
paging/filtering changed no evidence. The actual UI export and ordinary reload
matched the saved workflow exactly. No browser errors.

Measured route times: clause **1,041 ms**, comparison **1,047 ms**, page **1,022 ms**,
within the previously declared 10-second public-operation limit. These are three
operations on a retained development fixture, not a p95/cold-extraction or maximum
capacity claim. The original M-512 highlight, comparison target and both themes
at 1280×800, 1440×900 and 1920×1080 were visually inspected. Tables scroll inside
the workspace; no horizontal page overflow. No injected domain outcomes.

Earlier browser run 1 passed assertions but its screenshot was captured while
the sheet still painted. It is not accepted as source visual proof. Added a
render-completion wait and inspected run 2; run 3 repeats the final code after
historical-context/filter guards. Failed attempts are retained locally, not
quietly counted as successful final evidence.

## Reproduction

From `opentakeoff/web`, with the isolated Vite instance at port 5177:

```sh
OT_BROWSER_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node --import tsx scripts/playwright-bas-issue-routes.mjs \
  '/Users/erikjohnstone/Documents/ChatGPT/MASTER PLAN/HVAC BAS Benchmark Collection/pdf/12__vol2__028__Fort_Sam_Houston_Building_615_Controls_Excerpt.pdf' \
  '../docs/bas-production/evidence/issue-public-browser-3/reviewed.takeoff.json' \
  '../docs/bas-production/evidence/issue-routes-new-run'
npm run check
```

Use a fresh output directory; do not overwrite an earlier proof. Final check
results: web session **67500 exit 0**, 2,825 pass / 13 existing skips, types/lint/
bench/build; same three canvas warnings, four legacy One-Click known-fails and
bundle/Agent-key notices. MCP **46682 exit 0**, typecheck plus ten tests in
`basIssueTransport`, `basProjectReview` and `basIssueReview` (2.307 s). Full web log:
`tmp/bas-issue-routes-web-final2.log`. Python/MCP source is unchanged; this
checkpoint does not claim a new full corpus or untouched-holdout result.

## Remaining required work

Coverage/applicability decisions and deliverable exclusions, selective dependency
closures/approvals, positive approved snapshot/source-inclusive export/recovery,
the remaining original A–D acceptance and final corpus/holdout gates remain.
Historical-context UI edge cases remain part of full release acceptance; the
focused guard test is not a substitute for that whole journey. Only after the
five workflows comes the appended deep symbol/installed-plan research phase.
No push, merge, deployment, publication or production-completion claim.
