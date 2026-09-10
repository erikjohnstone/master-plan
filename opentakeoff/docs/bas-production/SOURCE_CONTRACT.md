# BAS source identity and text contract

`Session.basSourcesForPipeline()` exposes the loaded PDFs to future shared BAS
workflow consumers. Its validator/builder is `web/src/lib/basSources.ts`.
It does not add a new agent tool, change graph/table extraction, or interpret
requirements. The five complete workflows remain under implementation.

## Guarantees

- `openPdf` records SHA-256 and byte length from the exact loaded bytes. It does
  not re-read a path when a later source record is requested.
- `bas_sources_v1` identifies each document by content hash, each page by that
  version and one-based page number, and each available span by its position in
  the existing `textSpans` adapter output. These are version-scoped evidence
  identities, not cross-revision equipment identities or raw PDF glyph IDs.
- Identical bytes loaded under different filenames share a source/page identity;
  display filenames and existing sheet keys remain aliases. Different content
  remains a different source even if text or tags repeat.
- Text, whitespace, punctuation, bbox values, optional span rotation, page size,
  and page rotation are preserved from the existing adapter. No clipping,
  reordering of source spans, OCR, geometry inference or text rewriting occurs.
- Empty/textless pages are retained as `no_text`; this is not a claim that they
  contain no BAS information. The declared scope is `available_pdf_text_only`.
- Every loaded page must be represented exactly once. Conflicting aliases,
  metadata or geometry, invalid hashes/numbers and unordered boxes fail loudly.
  The builder does not silently drop malformed evidence.
- Returned state is a fresh snapshot. It does not modify Session geometry,
  cached text, graph tables, legacy output, or the input objects.

The SHA field on an imported JSON object is not proof of source integrity by
itself. Future snapshot import/review must verify the referenced bytes and
dependencies; the current authoritative producer computes the hash at PDF load.
Local hashes are not authentication, signatures or server-enforced immutability.

## Tests and evidence

`web/test/basSources.test.ts` covers strict validation, same-source aliases,
different versions, empty pages, replay and mutation isolation.
`mcp/test/basSources.test.ts` checks real PDF data, existing sheet-context parity,
renamed files, changed disk paths and replacement with a textless source.
`npm run test:bas` runs the new integration tests and existing BAS math transport
tests; npm's `pretest` hook makes this part of the default MCP test command.

`mcp/scripts/verify-bas-source-corpus.mts` tests the 24 development focus PDFs
without opening the six new-workflow holdouts. Every source span/frame is
compared to a separately opened instance of the existing PDF adapter; every
document hash is compared to the independently inventoried source. It also
checks repeatability. This is adapter parity, not independent PDF interpretation
or takeoff accuracy. Detailed results and timings are in
`evidence/source-seam-final-corpus.json` after the final run completes.

The diagnostic's total time includes Session loading, a second independent
PDF-adapter read, validation and replay. Peak RSS is cumulative for that process.
Neither metric is a claimed cold/warm end-to-end extraction benchmark.
