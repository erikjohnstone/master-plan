# Unapproved evidence backup — 2026-09-10

Scope: a source-inclusive **backup**, not completed workflow E. Shared path:
manifest, canonical takeoff JSON, original ownership, ZIP validation, CRC and
SHA-256 checks. Surface-specific: browser Blob/picker/download and Node staged
filesystem delivery. No VectorGrid algorithm, threshold, table/quantity/citation
interpretation, Python math, old workflow schema or default JSON behavior changed.

The browser Original PDFs view and existing MCP tools can create and verify the
same `bas_evidence_bundle_v1` / `zip_store_1` format. Every physical original in
saved history is required, including historical versions. Archives contain no
untrusted source filenames as paths. Readers reject unsafe/duplicate/compressed/
encrypted/unlisted entries, overlaps, malformed local/central/descriptor records,
CRC/hash/length disagreement, noncanonical JSON and ownership inconsistency.
Validation precedes any possible restore; the implemented preflight is read-only.

The MCP ZIP writer retrieves loaded originals from the loaded PDF handle, not a
possibly replaced disk path. Explicit historical paths are indexed by size and
digest without retaining all files. Output is staged beside its destination,
fsynced, checked against current Session state and published with atomic no-replace
unless overwrite was explicitly requested. The browser requires the whole saved
annotation payload still to match before download. Neither transport grants
approval or claims calculation replay. See [pre-change contract and primary
sources](EVIDENCE_BUNDLE_CONTRACT.md).

## Evidence

- Shared unit tests cover exact deterministic round-trip; independent standard-ZIP
  reading; two historical versions with one name; metadata/loader mutation;
  missing/changed originals; unsafe/duplicate/compressed/encrypted entries;
  declared size, local header, offset, CRC and truncation failures; source/README
  corruption; canonical payload/hash binding; and cancelled/short reads.
- Focused MCP/storage/workbook run **22421: 20 pass**, 2.611 s. Public MCP exact
  archive parity; missing source and output collision refusal; original loaded
  bytes survive a disk-path replacement; in-place Session mutation blocks final
  publication; old workbook and unrelated exports remain protected. Latest
  focused bundle **23355: 2 pass**, 1.036 s, plus typecheck.
- Full first web **13208 exit 0: 2,695 pass / 13 existing skips / 0 failures**,
  types/lint/benchmark/build pass (5.63 s build). Two additional negative tests
  were then added; the final gate is recorded below.
- Full first BAS MCP **25699: 95 pass / 0 failures/skips**, 20.193 s.
- Real Fort Sam browser **56332 exit 0**: actual PDF upload and ordinary saved
  engineering-history import; exact shared ZIP bytes, payload and original PDF;
  actual file-picker verification; cancelled operation and corrupt archive
  leave persisted history unchanged. Export 2.081 s, zero page errors.
- Expanded real browser **13501 exit 0**: also verifies the built MCP archive and
  rejects a controlled concurrent persisted save at the publication boundary.
  Export 2.132 s, zero page errors. Adapter delay/concurrent-save injections are
  transport fault tests, not ordinary extraction inputs or user actions.
- Built public **dist/server.js** MCP **45611 exit 0** accepts the browser ZIP
  without a loaded plan; ordinary JSON import retains all BAS history; export
  matches the shared writer byte-for-byte; all original versions/ownership match
  browser output; rejected collisions and preflight preserve Session state.
  Export 3.601 s. This is a built artifact walkthrough, not an installed remote
  service. Browser/MCP full payload IDs may differ because existing JSON merge
  rules preserve surface-specific annotation fields; sources/history are exact.

Real PDF: Fort Sam focus 12, source SHA-256
`c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`,
924,578 bytes / 9 pages. Reviewed engineering history contains explicitly
declared controlled hardware inputs; archive success is not automatic capability
discovery or proof of engineering correctness. No holdout content or keys opened.

## Capacity, not extraction accuracy

Final gates: **1355 exit 0**, full web **2,697 pass / 13 existing skips /
0 fail**, types/lint/benchmark/build pass; tests 27.564 s, build 5.75 s. Existing
three lint warnings, mixed static/dynamic-import and chunk-size warnings remain.
**16081 exit 0**: MCP types, full BAS **95 pass** (27.444 s), packaged-runtime
checks **4 pass** (0.174 s), 50 tool names/current. Final browser **22305 exit 0**
repeats all five cross-surface and fault-injection checks, export 2.283 s, zero
page errors. Six final screenshots at 1280×800/1440×900/1920×1080, both themes,
were visually inspected. No new full extraction-corpus run is claimed.
Latest full BAS run **72396 exit 0: 95 pass / 0 fail/skip**, 12.264 s,
adds a three-version same-name/same-size historical lookup case to the public
bundle test. Final built public MCP **38156 exit 0** repeats all parity/state
checks against browser-4 output, export 3.067 s. Final ordinary One-Click cross
probes: 16, zero disagreements, pair-IoU floor 0.994 / mean 0.999; nine
single-resolution cases are not cross-checked. No threshold/key was changed.

Predeclared budgets are in the contract. Controlled binary sources are not valid
PDF interpretation fixtures. No holdout originals were used.

| Sink | Source bytes | Export | Verify | Memory observation |
| --- | ---: | ---: | ---: | ---: |
| Node atomic file, one source | 165,589,793 | 1.383 s | 0.657 s | 853,770,240 B peak process RSS |
| Node atomic file, four sources | 551,119,404 | 3.559 s | 2.376 s | 1,067,974,656 B peak process RSS |
| Actual browser Blob helper, four sources | 551,119,404 | 2.858 s | 3.648 s | 1,569,177,600 B peak **sampled** summed Chrome RSS |

Node **11595 exit 0** passes both cases with one source load at a time and
64 KiB maximum output chunks in these cases. Browser **87517 exit 0** passes,
65 memory samples, zero page errors. Sampling every 100 ms is not an exact
instantaneous peak. Source-generation setup is included in memory observations.
These are local, isolated transport runs, not a loaded/drawn 30-PDF canvas,
cross-device speed claim, or proof at the archive format's maximum limits.

## Reproduction and boundaries

From `web/`, run `node --import tsx scripts/playwright-bas-evidence-bundle.mjs
<original.pdf> <saved.takeoff.json> <new-output-dir> [mcp.otbas.zip]` with
`OT_BROWSER_PATH` and `OT_UI_URL` for the isolated browser. From `mcp/`, build
then run `scripts/verify-bas-evidence-bundle.mts <original.pdf> <browser.otbas.zip>
<new-output-dir>` with `node --import tsx`. Capacity scripts are
`mcp/scripts/verify-bas-bundle-capacity.mts single|multi <new-output-dir>` and
`web/scripts/playwright-bas-bundle-capacity.mjs <new-output-dir>`.
Proof JSON and selected screenshots/logs reside under `evidence/evidence-bundle-*`.
Generated archives and large synthetic files are deliberately not committed.

Unfinished: automatic complete-project ZIP restore and archived-source citation
reopening; source/page correspondence; revision and finding decision journal;
selective stale-dependency rules; scoped human approvals and atomic approved
snapshot/seal; full corpus/holdout/release acceptance. Backup preflight does not
replay Python, clear review findings, select the current source set or authorize
an installed/as-built count. Archives are unencrypted and unsigned.

Historical corpus baseline remains 505/541 takeoff, 99/129 reference, 78/91 graph
cells, 133/138 anchors plus 23 old-path ENOENTs—not new green corpus results.
The original five BAS workflows precede the appended deformation-tolerant symbol
and installed-plan research phase. No push, merge, deployment or new model.
