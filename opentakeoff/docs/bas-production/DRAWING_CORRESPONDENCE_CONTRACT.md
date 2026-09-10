# Drawing correspondence — implementation slice

2026-09-10. Part of workflow E, not its completion or an approval feature.
The full `REVIEW_REVISION_CONTRACT.md` remains authoritative.

Shared source-set and page-accounting truth goes in `web/src/lib`. Browser
interaction and persistence transport remain surface-specific. No changes to
VectorGrid, symbol matching, existing capture fingerprints, or Python arithmetic.

## Inputs and guarantees

- Add `drawing_events` under additive workflow revision `bas_review_7`.
  Existing journals retain their meanings and all lower-level writes/imports
  preserve the extension. Invalid/unknown fields and divergent histories fail.
- Requests carry a UUID, global expected drawing head, exact dependency digest,
  reason and self-declared reviewer. Origins are supplied by the entry point.
  Initial source sets select owned `(capture_id, page_id)` pairs in explicit
  source order. Never include the same physical source page twice.
- A revision names an existing complete source set, incoming retained capture,
  and replacement-set or partial-addendum mode. Every baseline and incoming
  page is explicitly accounted for. Replacements are reciprocal one-to-one.
  Same-byte redundant uploads must reference the identical retained physical
  page. They do not replace its old interpretation capture silently.
- Exact-source pairing may be suggested; changed-byte pairings require a
  recorded decision. Partial-addendum omissions are suggested retained, subject
  to confirmation. Replacement-set omissions remain unresolved. Suggestions
  are not events, approvals, or published source sets.
- Unresolved accounting can be saved as review history, but produces no complete
  source set. A later decision appends another full accounting event. Existing
  sets/events remain unchanged. Split/combined pages require explicit removals
  and additions; downstream item correspondence is still unassessed.
- Complete sets derive from the event digest, retain baseline page order, replace
  in place, then append additions in incoming source order. Old capture selection
  and old bboxes remain intact. They establish page accounting only, never
  interpretation coverage, quantity completeness, source-byte availability or
  approval. An Agent proposal is labeled as such, not operator approval.
- Comparison reports physical source identity and exact available retained
  text/frame/geometry separately. Empty/missing text is unavailable, not equal
  drawing content. Available text equality is not full-PDF ink equivalence.
  Semantic, quantity and approval-impact comparison are subsequent required
  integrations, not fabricated zero deltas in this slice.

## Limits and predeclared verification

Each source set/capture inventory is limited to 25,000 pages; a drawing journal
retains at most 10,000 events and 250,000 explicit page-accounting entries across
its events. These are explicit refusal limits, not silent truncation. Source PDF
bytes are still retained through the existing history/vault paths.

Before declaring the slice integrated, test positive initial/replacement/addendum
journeys; duplicate/renamed uploads; changed-byte unchanged-text re-export;
reordering/renumbering; duplicate numbers across documents; split/remove/add;
unresolved entries; reciprocal/foreign/duplicate reference attacks; digest/head/
operation conflicts; all six older revision round trips; IDB and JSON retention;
public UI and MCP, plus source-link restoration. Controlled cases are labeled.
No blind corpus bodies are opened for journal development.

The existing 5-second real-history validation benchmark remains unchanged.
For added journal work, the initial gate is 1,000 pages and 100 revision events
(201,000 page references including the initial set), with synchronous replay
under 2,000 ms and incremental process RSS under 256 MiB on the current Node 24
coordinator. Measure three runs, report all runs. This measures journal validation
only, not extraction, source rendering, or end-to-end approval. Browser rendering
and end-to-end budgets require their own measured baseline before optimization.

Work remains incomplete until public delivery and the broader E gates pass.

## Shared implementation checkpoint

The shared contract, journal replay/append service, exact retained-text comparison
and version-preserving workflow merge are implemented. No caller changes an
existing capture, active takeoff selection, extracted table or quantity. Pending
requests own their parsed content before awaiting workflow verification.

Seventeen focused tests cover source-set creation, duplicate/renamed originals,
new interpretation capture with old physical bytes, replacement/addendum/split
accounting, reordering, malicious ownership/pairing/head/digest/operation edits,
strict and aggregate limits, all six prior revisions, and old equipment/assembly
edits. A retained real Fort Sam/controlled-hardware history survives actual IDB
save/load and JSON round trip with all original captures and engineering records
unchanged. Its whole-workflow replay receipt identity changes; historical
calculation-record identities do not. This is a persistence proof using retained
real-PDF evidence, not a new PDF extraction or actual revision-pair walkthrough.

Public integration must follow. The existing MCP `Session.retainBasWorkflow`
requires the active loaded PDF set; it cannot deliver a history-only revision
editor correctly. Use a dedicated, exact-state-guarded review entry point over
retained history, not a recompile workaround or fabricated loaded originals.
The UI should expose this inside the existing Review & changes workspace,
persist drafts/return state, retain source-version links, and use the same
append/preview service. No public revision UI or new MCP verb is claimed yet.

Verified final candidate: focused **86629 exit 0**, 17 pass, 12.388 s. Full web
**56770 exit 0**, 2,771 pass / 13 existing skips, 24.245 s tests, 5.06 s build.
Typecheck/lint pass with three existing warnings; legacy One-Click known failure
cases and large-chunk warnings remain, not new corpus accuracy claims. Existing
real-history gate is **3.052 / 2.968 / 2.957 s**, unchanged 5 s budget.

New journal replay: **50.182 / 43.148 / 33.095 ms**, 201,000 page entries,
**149,536,768 bytes incremental peak RSS** against the predeclared 2,000 ms /
268,435,456-byte limits. Initial standalone run: 51.218 / 40.970 / 31.960 ms,
145,866,752-byte increment; first full check: 56.179 / 44.819 / 34.103 ms,
137,003,008-byte increment. No limits changed after measurements.

MCP **38438 exit 0**: typecheck, **119 BAS tests** (59.543 s), build and
**four packaging/proof tests** (96.884 ms). Public verb count/version remain
50 / 0.9.74. This regression pass is not a new public revision walkthrough.
Full standalone Python, full corpus and blind holdout were not rerun.
Compact committed report: `evidence/drawing-shared-1/proof.json`; raw local logs
are `tmp/bas-drawing-{shared-tests-final,web-final,mcp-packaging,bench}.log`.

## Public editor and history-only MCP integration — 2026-09-10

After `79868930`, the browser exposes **Review & changes → Drawing changes**.
It selects retained source pages, creates a source set, reviews baseline/incoming
page dispositions and reciprocal replacements, previews through the shared
append validator, and records operator decisions through the existing autosave
path. Selection order is explicit: reselecting a page appends it. Page links use
the isolated original-source reader; drafts, page/scroll and history selection
survive source inspection. Neither the form nor Session transport computes BAS
quantities. Unsupported capture inventories show the shared limit instead of
crashing or silently dropping pages.

MCP `bas_drawing_review` exposes `inspect`, `prepare`, `record` and `compare` over
the same retained journal, including with no active PDFs. Inspection pages each
collection at 1–50 entries with explicit totals. Preparation saves nothing;
recording stamps `agent_proposal`, checks exact workflow/load state and rejects
concurrent mutation or cancellation. Exact retries retain later history and
return the requested event's accounting, not the latest event's page count.
Session-only changes require export for durable storage. Agent proposals do not
become operator approvals or active counting input.

### Research recheck and limits

Official documentation rechecked 2026-09-10: Autodesk distinguishes visual sheet
comparison from inventory quantity comparison and supports explicit version/
snapshot selection. Its version UI warns about takeoff on previous file versions.
Bluebeam describes page/automatic/manual alignment for PDF overlays. These are
documented workflows, not hands-on competitor tests. Our inference is to keep
source correspondence, interpreted changes, quantity changes and approval
invalidation separate. The current text/frame comparator is deliberately not
presented as a full-ink overlay or a quantity-difference implementation.

- [Autodesk sheet and quantity comparison](https://help.autodesk.com/cloudhelp/ENU/Takeoff-Files/files/Compare_Sheets.html)
- [Autodesk version indicators](https://help.autodesk.com/cloudhelp/ENU/Takeoff-Files/files/Version_in_Sheets_Models.html)
- [Bluebeam overlay alignment](https://support.bluebeam.com/user-manual/menus/document/overlay-pages.html)

### Actual browser proof and rejected runs

`evidence/drawing-browser-2/proof.json`: actual nine-page Fort Sam upload plus
retained real-PDF/controlled-hardware history, then an actual compiled PDF with
original pages 9 and 8 copied in that order. This is **not an issued addendum**.
PDF skill render checks confirm the copied M-601 schedule and M-512 points/SOO
pages remain visually intact. Original bytes are untouched. The derivative
source SHA-256 is `03398b9ba57fb5492c5ada6e38ef606df4e2b0cae766f84f2afa386f6e484053`;
its actual shared compile took 2,811.443 ms and produced one point matrix.

The browser explicitly pairs old page 8 to incoming page 2 and old page 9 to
incoming page 1, retains pages 1–7, records two decisions, preserves every old
capture/engineering record, opens the exact source, reloads and exports unchanged
history. Six layouts (1280×800, 1440×900, 1920×1080 in both themes) have no horizontal
workspace overflow or page errors; source and preview screenshots are retained.
Measured preview→record→durable save: 8,423 / 8,446 ms. These are first measured
end-to-end baselines, not predeclared speed gates or production-speed claims.

Final browser run `81444` is the successful rerun; preceding `47273` failed
because the test reselected the first page (appending it) but then assumed order
1–9. The comparison correctly returned `changed`. The corrected test toggles the
last page and explicitly asserts source order; no scorer or production comparison
was weakened. Initial fixture generation left a worker alive after writing;
`shutdownVectorGrid` cleanup was added and the final generator exited zero.
The first MCP surface check failed only its mandatory coordinate-contract
description assertion (106 pass / 1 fail); the description was fixed, not the test.

Reproduce with `mcp/scripts/build-bas-drawing-revision-fixture.mjs` (original PDF,
new directory, page order `9 8`), `web/scripts/playwright-bas-drawings.mjs` (original,
retained history JSON, fixture directory, new output directory), and
`mcp/scripts/verify-bas-drawings.mts` (browser JSON, original, derivative, new output).
Generated PDF metadata may produce a different source hash on another run; each
run records its exact bytes/capture IDs. This is not a byte-identical fixture
generator or a held-out accuracy test.

Semantic/quantity-impact comparison, issue decisions, selective approval
dependencies and approved snapshots remain required. The main five workflows
and their final corpus gates are not complete; researched symbol/installed-plan
hardening remains the additive last phase. No VectorGrid algorithms, thresholds,
table/citation/bbox semantics, symbols, Python arithmetic, costs or labor changed.

### Final verification checkpoint

Web **11736 exit 0**: typecheck/lint (three existing warnings), **2,771 pass /
13 existing skips**, 25.659 s tests, 5.46 s build. Real-history validation
3.069 / 2.987 / 2.996 s under the unchanged 5 s gate; 201,000-entry journal
51.757 / 40.825 / 32.441 ms, 146,309,120-byte incremental peak RSS under the
unchanged 2 s / 256 MiB gate. Existing One-Click known failures and chunk-size
warnings remain; this is not full-corpus accuracy verification.

MCP **59493 exit 0**: types/count parity, **126 BAS pass** (43.844 s), **4
packaging/proof pass**, **107 public-tool/staging pass** (28.754 s). Seven new
MCP tests cover guarded public delivery, old-event retries after later reviews
and explicit oversized inventory refusal. Version 0.9.75 / 51 tools is local
development only, not published.

Final built public MCP **41483 exit 0**, `evidence/drawing-mcp-2/proof.json`:
browser export restored exactly with no active plans, one duplicate-delivery
proposal appended without adding pages, comparison exactly matches the shared
browser helper, both original PDFs render, and exported source-inclusive history
recovers exactly in a new process. Three assembly and 28 engineering records
actually replay through Python during restore. Measured restore 24.288 s,
prepare+record 6.721 s, fresh-process restore 26.954 s. Earlier successful built
walkthrough measured 24.465 / 6.075 / 23.968 s; not a before/after speed claim.
Repeated validation latency needs further work before a production-speed claim.

Compact gate evidence: `evidence/drawing-public-1/proof.json`. Full corpus,
blind holdout and standalone full Python suite were not rerun. Goal remains
active, with no scope reduction or completion/approval claim.
