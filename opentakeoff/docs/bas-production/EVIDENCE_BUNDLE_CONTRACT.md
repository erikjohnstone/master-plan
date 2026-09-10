# Source-inclusive BAS evidence transport

2026-09-10, before implementation; extends `REVIEW_REVISION_CONTRACT.md` without
replacing its approved-snapshot requirements. Shared path: **yes** for manifest,
ownership, hashing, archive validation and archive contents. Browser Blob/file
delivery and Node staging are surface-specific. No extraction/math/schema rewrite.

The first transport carries the exact ordinary takeoff JSON and every original
PDF referenced by its complete saved BAS history, addressed by digest. It is an
explicit **unapproved evidence backup**, not the final approved deliverable.
It must not claim Python replay, revision correspondence or authenticated identity.
No sources are excluded because they belong to an older capture. No original is
replaced by a same-named revision. Ordinary JSON exports remain unchanged.

Use the existing fflate dependency's stored streaming ZIP entries, deterministic
file order and fixed ZIP metadata. Files are `manifest.json`, `takeoff.json`,
`README.txt`, and `sources/<sha256>.pdf`. No compression, encryption, links, user
paths, ZIP64, multi-disk archives or extra entries in this version. This is a
defined application archive format, not a general-purpose ZIP importer. Standard
ZIP programs can extract the originals and ordinary takeoff JSON manually.

Writer loads/verifies one source at a time and emits bounded chunks. Reader uses
bounded random reads, validates central/local headers and descriptors, rejects
duplicate/unsafe/overlapping/truncated entries and verifies CRC plus declared
SHA-256/length/ownership. No untrusted paths are written directly to disk.
Source lookups always return freshly verified bytes, including after initial
inspection. A changed workflow/project, cancellation or failed source prevents
publishing a complete archive. Node stages beside the target with atomic no-replace
by default. Existing output requires explicit overwrite. UI downloads only after
all entries complete and current saved state is rechecked.

Initial explicit resource limits: 10,000 originals, 512 MiB per PDF, 256 MiB
takeoff JSON, 16 MiB manifest, less than 2 GiB archive. Metadata-only filesystem
inspection of the actual 30-PDF focus folder found 551,119,404 bytes total and
165,589,793 bytes for its largest PDF. No holdout PDF bodies or keys were opened.
These limits cover those physical files, not a claim that every possible history
fits. Exceeding a limit must fail before allocation/writing, never silently omit.
Test a controlled large payload at least as large as the largest focus PDF and
record latency/memory; do not claim it represents PDF interpretation accuracy.
Before the large-payload experiment: require each export/verification phase under
20 seconds and process peak RSS under 1.25 GiB on this coordinator. These are
local transport regression budgets, not a cross-device performance guarantee.
Use a controlled 165,589,793-byte source, then repeat with a 551,119,404-byte
multi-source total; do not open holdout originals to manufacture this test.
Separately measure the actual browser Blob delivery strategy at that multi-source
size: each phase under 30 seconds, peak summed Chrome-process RSS under 2 GiB
on this coordinator. Include generated-source setup in peak memory sampling.
This is an isolated transport test, not a loaded/drawn 30-PDF canvas test.

Acceptance: deterministic exact round-trip (shared browser/Node); all historical
versions; hash/CRC/length/ownership corruption; encrypted/compressed/path/duplicate/
overlap/malformed archives; fake declared sizes; cancellation, stale state and
atomic output collisions. Public browser and packaged MCP must both create/read
the same format. Restore through existing merge rules, retain originals, preserve
source versions and rerun required shared calculations before any verified approval.
No approval may be imported by merely trusting a manifest flag. Failed restore
preserves prior state. Full approved-snapshot restore remains governed by E's
atomic source/snapshot/journal contract; do not mark it complete with backup alone.

Research: [fflate ZipPassThrough](https://github.com/101arrowz/fflate/blob/master/docs/classes/ZipPassThrough.md)
documents uncompressed streaming and CRC calculation; local installed version is
0.8.3. [PKWARE APPNOTE 6.3.10](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)
defines stored method 0, local/central records and bit-3 data descriptors. Using
the library for emission and a strict application-format reader is our design
inference, not a claim of universal ZIP compatibility or security certification.
# Additive saved-calculation preflight — 2026-09-10

Archive bytes, manifest and default inspection remain unchanged. The Original
PDFs browser view now offers **Replay saved calculations** after file verification;
MCP preflight accepts `replay_calculations: true`. Both use the same full-history
input reconstruction and existing Python calculators. The separate receipt binds
workflow identity and all checked B/C/D record IDs. No-saved-calculation status is
distinct from verified results. This does not restore a project or grant approval.
See [the replay contract](RESTORE_REPLAY_CONTRACT.md).
