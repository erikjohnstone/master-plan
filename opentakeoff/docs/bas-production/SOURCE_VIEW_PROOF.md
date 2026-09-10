# Exact original-source review — 2026-09-10

Workflow E checkpoint after `628f047c`. Retained originals can now be read at
their exact saved page/frame without adding historical drawings to the active
takeoff set. This closes source reopening, not ZIP restoration, revision pairing,
review journals, approval, full-project interpretation or the overall goal.

## Shared path and research

**Shared:** source ownership, historical metadata consistency, page identity,
saved frame checks, and unchanged requested box versus padded display region.
`basSourceView.ts` uses the existing complete history/byte validators. A single
verified history inspection returns both owned history and source inventory;
it does not skip validation or trust a cached mutable workflow. Quantities,
original text/coordinates, VectorGrid, existing Python math and extraction rules
are unchanged. No model, OCR, raster interpretation or trained detector is used.

**Surface-specific:** browser PDF rendering, focus/scroll/navigation, source
lookup, Node filesystem reads and image delivery. The browser holds a separate
PDF document and never registers it as an active sheet. Node uses the existing
PDF adapter with an owned-byte entry point and destroys its isolated document.
Neither reader writes annotations, current source sets, review or approvals.

Mozilla's [PDF.js examples](https://mozilla.github.io/pdf.js/examples/) document
the scale/rotation viewport and the need to avoid simultaneous renders into one
canvas. Its [API documentation](https://mozilla.github.io/pdf.js/api/draft/api.js.html)
documents worker ownership of transferred byte buffers. Checked 2026-09-10
against the installed 4.10.38 API. These support using owned bytes, the existing
render scale, isolated canvases and cancellation cleanup. Hash/frame refusal and
separating historical documents from the active set are this project's design
decisions, not claims of PDF authenticity, engineering approval or vendor guarantees.

## User/API behavior

- **Original PDFs → Open original** provides page navigation, full-page/focused
  views, 100%/200% scrollable display and an inspectable source identity/box.
- Existing live-sheet citations still use their original canvas navigation and
  markup path. An unavailable historical BAS citation falls back to the isolated
  original reader. Underlying Takeoff views remain mounted; Back/Escape restores
  keyboard focus without dropping filters or selection.
- Exact source digest/length, ownership, page count and saved dimensions/rotation
  must match. Bboxes are not clipped, guessed, rotated or rescaled to conceal a
  mismatch. Display padding is separate and cannot change the source box.
- Legacy history without retained frames supports full-page inspection, not a
  located highlight. Corrupt/missing originals and conflicting frames refuse.
  Password-protected PDFs cannot be opened by the browser reader. Original PDF
  size is limited to 512 MiB; the display canvas/image long edge is capped at
  2,000 px. These are bounds, not a measured worst-case PDF memory/latency promise.
- Public MCP `view_sheet` accepts the saved `page_id` as `sheet` and optional
  explicit `original_pdf_path`. It does not crawl paths from imported metadata.
  Current overlays, grids and marks are refused in this isolated mode. Existing
  normal sheet rendering is unchanged. Version **0.9.73**, still **50 tools**;
  package/registry/locks and instructions agree. Nothing published.

## Verified checks

- Full web check **62763 exit 0**: **2,702 pass / 13 existing skips / 0 fail**,
  28.642 s tests; types/lint/bench/build pass, build 5.62 s. Existing three lint
  warnings, known One-Click benchmark limitations and chunk warnings remain.
  The final unverified-page label and added source-size boundary test then pass
  types/lint/build and **19 focused tests**, **41356 exit 0**.
- BAS MCP **38175 exit 0**: **107 pass / 0 skip/fail**, 74.553 s, plus typecheck,
  **4 packaging tests** and tool-count check. Existing tool/session/staging/
  safe-write/transition regressions **56848 exit 0**: **155 pass**, 38.928 s.
  Focused source/render/source-seam tests also passed **10/10**.
- Python with packaged-runtime gate **87696 exit 0**: **443 pass**, 11.67 s;
  configured mypy passes **19 source files**. No calculator changes.
- Actual retained Fort Sam source is SHA-256
  `c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`,
  924,578 bytes, nine pages. UI tests use ordinary PDF upload, saved-history
  import, retention and citation controls. Replacing the active file with a
  different same-named PDF is explicitly controlled storage fault injection,
  not a real addendum. The original page 8 VFD requirement opens from the vault
  at `[947,1824.4,2159.6,1852.6]` without adding old pages or changing history.
- Final UI checks include whole-page/focus/zoom, six light/dark 1280/1440/1920
  layouts, keyboard focus/Escape, a cancelled pending retained-byte read, and
  corrupt-source refusal without substituting the newer namesake. Evidence:
  `evidence/source-view-browser-4/proof.json` and its screenshots.
- Built public MCP **71644 exit 0** uses the same real history/citation with a
  controlled different same-named current PDF. Exact shared region/box and source
  frame agree, missing/wrong originals and active overlays refuse, and complete
  exported state is unchanged. Original view **3,610 ms**; this is one observation,
  not p95. Evidence: `evidence/source-view-mcp-1/proof.json` and PNG.
- The prior, unchanged live-citation/retention browser harness **21856 exit 0**
  still passes: **456 exact saved findings**, live source markup coordinates,
  domain/filter/focus return, retention/download/reload; zero page errors.
  Evidence: `evidence/source-view-live-regression-1/checks.json`.

First browser attempt found a genuine focus-return race: requestAnimationFrame
could run before hidden content was exposed. Returning focus after the committed
layout fixes it; subsequent whole journeys pass. Visual review also caught an
unclear unverified page readout and long error wrapping, corrected before the
final proof. Repeated complete history validation initially cost 7,958 ms to
open; returning the inventory and verified history together removes that duplicate
work without bypassing validation. Subsequent observations were about 4–5 s,
not a general performance guarantee. All accepted screenshots were inspected.

No scorer/key/threshold or symbol/legend/VectorGrid changes, holdout access, or
new full-corpus quantity/reference/graph gate. Historical metrics and 23 old-path
failures remain as previously recorded; these source-view tests do not replace
the final corpus/holdout acceptance.

## Reproduce

From `web`, run `scripts/playwright-bas-source-view.mjs` using Node + tsx, the
real PDF path above, tracked
`docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json`
(relative to the package root), and a new output folder. Set `OT_BROWSER_PATH`
to the installed Chrome binary and optionally `OT_UI_URL` (default port 5177).
For current-sheet regression use `scripts/playwright-bas-project-review.mjs`
with the same PDF/history and another new folder.

From `mcp`, build, then run `scripts/verify-bas-source-view.mts` with the original
PDF, tracked history, browser proof JSON, and a new output folder. Its copied
same-named current PDF is a **controlled replacement**, never a ground-truth PDF.

## Still required

Atomic source-inclusive ZIP restoration and stale-autosave fencing; reviewed
source correspondence, revision/review journals and dependency-scoped approved
snapshots; remaining A–D corpus acceptance and full/holdout gates. Then the
user-appended research-gated symbol deformation/installed-plan phase. The five
main workflows remain first. No push, merge, deployment or external provisioning.
