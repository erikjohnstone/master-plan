# Shared narrative discovery: source layout, not requirement interpretation

`Session.basNarrativesForPipeline()` calls the single shared
`web/src/lib/basNarratives.ts` implementation with the validated source snapshot.
No UI/MCP-specific interpretation branch, graph/table mutation, OCR, raster
inference or model calls. This is an internal building block for the five
workflows; it is not yet wired into a new persisted UI/MCP BAS result.

## What the v1 output means

- Every loaded page is represented, including textless pages.
- Explicit horizontal sequence/control-narrative headings create candidates.
  Nearby aligned text is assembled by source geometry, not PDF array order or
  whole-page concatenation. Large horizontal gaps split independent columns.
- An adjacent, similarly sized uppercase heading line can supply title context.
  Original heading lines and span IDs remain available separately.
- Numbered/lettered paragraphs preserve their original marker and line order.
  Parenthetical words such as `(ADJUSTABLE)` are not section markers.
- Small repeated-column insets retain row/cell layout separately from prose.
  They remain uninterpreted source-layout candidates, not normalized schedules,
  computed reset curves, I/O or device counts.
- Raw span text and bboxes remain immutable. Reconstructed reading text inserts
  inter-fragment spaces; it is not a replacement for the cited source spans.
  Slight colon-delimited inline-label bbox overlap is explicitly labeled, not
  misrepresented as non-overlapping geometry. Substantial overlapping text is
  unresolved, including contradictory overlaid sentences.
- Repeated titles never imply identical templates or cross-page continuity.
  IDs remain source-version scoped. Equipment applicability is not inferred.

Region status is `body_detected`, `heading_only` or `segmentation_conflict`.
**Every region still requires boundary review and is uninterpreted.** A detected
body may be truncated by an unsupported layout; the status is not a completeness
claim. The stop reason is retained. `discovery_complete` and
`interpretation_complete` remain false.

Every source span belongs to exactly one accounting bucket: body region,
heading only, ambiguous, unassigned horizontal, unsupported, or blank. The
unassigned bucket can contain important notes/requirements; it is never called
irrelevant or empty. Unsupported includes rotated/degenerate text and severe
overlap. The source snapshot retains every original span for subsequent review.

## Independently reviewed positive controls

Fixtures in `web/test/fixtures/` were authored from the original drawing renders
and raw positioned text, not serialized parser output:

- Fort Sam: eight primary sequence bodies across five pages, exact source-span
  membership; two repeated lower captions stay heading-only. Similar DOAS
  headings have different occupancy behavior and remain distinct.
- Behavioral Medicine M701: the complete right-hand CHW sequence region, two-line
  heading, twelve lettered sections, and two three-row/two-column reset insets.
  The neighboring 101-row point matrix is not spliced into the narrative.

The initial Fort Sam page-6 rectangle had a 14-pixel undershoot that excluded
the end of the independently visible cooling clause (source span 141 ends at
x=3754). The authored margin was corrected after checking the original source;
the fixture records that correction. No legacy corpus key/scorer was changed.

## Verification on this candidate

- Ten focused web tests pass, including rotated/textless/unassigned sources,
  independent columns, captions, conflicting overlaps, inset separation,
  exact source membership and paragraph markers.
- Real Session audit: 24 development PDFs, 1,253 pages, 563,248 spans. Every
  span partition and replay check passes; nine source-region assertions pass.
  Six reserved new-workflow holdouts are not opened.
- Audit discovery observations: 54 bodies, 62 heading-only candidates, one
  segmentation conflict. Only nine bodies have the source-region accuracy
  keys above; the other counts are **not validated accuracy/recall**.
- Discovery alone summed to 637 ms. Complete diagnostic loading/validation/
  replay summed to 54,715 ms, cumulative peak RSS 1,062,305,792 bytes. These
  are not whole-takeoff cold/warm performance metrics.
- Final web check: 2,567 pass, 13 existing skips, zero failures; benchmarks and
  build pass. MCP typecheck/build and nine BAS transport/Session tests pass.

Evidence: `evidence/narrative-discovery-release/summary.json`, the two complete
source-linked results in that directory, `evidence/narrative-release-web-check.log`
and `evidence/narrative-release-mcp.log`. Here “release” labels the locally
verified candidate artifacts; no workflow approval, merge or deployment occurred.
The earlier discovery audit is retained: Behavioral was heading-only before
large-heading, inline-label and inset support. A final adversarial caption test
reproduced and fixed accepting `NOT DRAWN TO SCALE` as a body start; the real
rank-25 audit also changed one such body candidate to heading-only. That does
not establish full discovery of the actual sequences on that sheet. Legacy full-corpus quantity,
reference and graph gates are still required; this audit does not substitute
for them. No production-complete claim is made.

Reproduce from `web/`: `node --import tsx --test test/basNarratives.test.ts`
and `npm run check`. From `mcp/`:

```sh
node --import tsx scripts/audit-bas-narratives.mts ../docs/bas-production/corpus-inventory.json ../docs/bas-production/evidence/narrative-rerun
npm run typecheck
npm run test:bas
npm run build
```

## Remaining work

Broaden independent source keys and improve segmentation against the development
corpus before frozen holdout evaluation. Explicit continuation, source-bound
user corrections, general/unheaded controls notes, semantic requirements,
equipment/template joins, persistence and the UI/export journeys remain required.
No physical/soft point or installed-equipment quantities are created here.
