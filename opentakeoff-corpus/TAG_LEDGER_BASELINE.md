# Tag ledger — Phase 0 baseline (in progress)

Started 2026-09-16, executing Phase 0 of
`plans/03-schedule-row-to-drawn-tag-reconciliation-plan.md`. This file
records what Phase 0 has actually measured so far, session by session. It is
**not complete** — see "What remains" at the bottom before treating any
number here as a closed gate.

## Environment notes (affects every number below)

- Node pinned at `web/.nvmrc`/`mcp` = 24; this environment shipped Node 22, so
  Node 24.21.0 was installed via nvm for this session. `mcp/` had no
  `node_modules` at all (fresh checkout) and needed `npm install`. Both
  workspaces now typecheck and lint clean.
- `OPENTAKEOFF_BAS_PYTHON` requires `pydantic` and `pytest`, neither
  preinstalled; both were pip-installed this session. Unrelated to tag
  reconciliation, needed only to unblock the BAS pretest hook.
- **The 81-document bulk corpus cannot be staged in this environment.**
  `drive.google.com` returns a 403 from the network proxy (policy denial,
  confirmed via the proxy status endpoint, not a transient failure). Per
  `scripts/stage-bulk-corpus.sh`'s own documented contingency ("if it fails
  on egress: say so and continue"), Phase 0 in this session is scoped to the
  10 documents that exist in-repo (`opentakeoff-corpus/raw/` + the bessemer
  sample under `opentakeoff/samples/`). Roughly 90 tests in
  `mcp/test/reconcileWorkflow.test.mjs` skip for the same reason — this is
  expected and was true before this session too.
- **This session ran under severe, self-inflicted CPU contention**: four
  heavy jobs (full web test suite, two mcp test suites, full corpus eval)
  were launched concurrently with ground-truth authoring work. A schema
  round-trip test that normally completes in milliseconds
  (`detect_rooms assign mode`, in `test/conformance.test.ts`) took **99.8
  seconds** and still passed — direct evidence of the scale of the slowdown.
  Several test failures observed this session are very likely artifacts of
  that contention (see "Test suite findings" below) and need re-verification
  in isolation before being treated as real. This file says explicitly,
  per finding, which is which.

## Tooling built this session

- `Session.tagOccurrencesForKey` (`mcp/src/session.ts`) — a small, additive,
  public wrapper around the existing private `tagOccurrencesOnSheet` text
  ladder. No duplicated logic, no geometry.
- `mcp/scripts/tag-occurrence-baseline.mjs` — walks every schedule row's
  identity mark across every plan-role sheet and reports where that text is
  drawn (sheet, bbox, count), using only the wrapper above. This is the
  Phase 0.3 "pipeline occurrences" baseline, text-only per the plan's own
  rule.
- `mcp/scripts/tag-ledger-eval.mjs` — the ruler. Scores a
  `keys/<set>.tagocc.csv` occurrence key against the baseline above, in both
  directions (tag→row and row→tag), with binned misses. Not yet run against
  a real key in this session (no key was finished in time — see below); its
  own logic has not been exercised end-to-end yet and should be treated as
  unverified until it is.

Committed as `fba82a9` on `claude/tender-meitner-4efhoz`.

## Ground truth authored this session

**bessemer** (`opentakeoff/samples/bessemer-mechanical-bidset.pdf`, 8 pages)
— fully read by rendering every page and cross-referencing every schedule
against every plan sheet. `keys/bessemer.tagocc.csv` is **not yet written**
(blocked on exact-bbox grounding, see below) but the content is worked out:

| Sheet | Role | What's there |
|---|---|---|
| p1 (MP001) | legend | Abbreviations/symbol legend, no device tags |
| p2 (P100) | schedule (pipeline) / **actually a plan** | Underslab Plumbing Plan — misclassified role (see finding below); `FD-1` drawn 4×, `WB-1` 0× |
| p3 (P101) | plan | First Floor Plumbing Plan — `FD-1` ×4, `WB-1` ×1 |
| p4 (P102) | plan | Second Floor Plumbing Plan — `FD-1` ×4, `WB-1` ×1 |
| p5 (P501) | detail | Plumbing details, no device tags (only a "(SEE SCHEDULE)" note mention) |
| p6 (M101) | plan | First Floor Mechanical Plan — `SR-1`, `SR-2`, `TG-1`, `TG-2`, `HP-1`, `EF-1`, `EWH-1`, `EBB-1..4` all drawn here |
| p7 (M102) | plan | Second Floor Mechanical Plan — `EBB-5..8` only (ductwork for 2nd floor is routed in attic, no registers shown on this sheet — confirmed by the sheet's own note) |
| p8 (M601) | schedule | Mechanical Schedules — the row source for every mark above |

**Finding: page 2 (P100) is misclassified.** The pipeline's sheet-role
classifier calls it `schedule` (confidence 0.425); it is actually the
Underslab Plumbing Plan — a real plan sheet with 4 drawn `FD-1` instances.
Because my baseline producer only walks `plan`-role sheets (matching what
`sweepScheduleRow`/`countMarks` do), **this page's 4 `FD-1` occurrences are
invisible to every row-driven tool today.** This is a first, concrete,
real instance of finding H1 (tags on misclassified sheets are never
counted) — not hypothetical.

Cross-checking the baseline producer's own output against this reading:

| tag | table | baseline drawn_count | visual read | agreement |
|---|---|---|---|---|
| SR-1 | DIFFUSER, GRILLE, REGISTER SCHEDULE | 7 | not individually recounted (dense duct labels); page-6-only, plausible | pending exact grounding |
| SR-2 | " | 2 | same | pending |
| TG-1 | " | 6 | same | pending |
| TG-2 | " | 4 | same | pending |
| EF-1 | FAN SCHEDULE | 1 | confirmed, 1 (p6) | ✅ match |
| EWH-1 | ELECTRIC WALL HEATER SCHEDULE | 1 | confirmed, 1 (p6) | ✅ match |
| HP-1 | VARIABLE REFRIGERANT PACKAGED HEAT PUMP | 1 | confirmed, 1 (p6) | ✅ match |
| EBB-1 | ELECTRIC BASEBOARD HEATER SCHEDULE | **2** | confirmed, 1 (p6, near MECHANICAL) | ❌ **open discrepancy** |
| EBB-2..8 | " | 1 each | confirmed, 1 each (4 on p6, 4 on p7) | ✅ match |
| D-1, D-2, D-6 | DUCTWORK INSULATION TYPE SCHEDULE | 0 | confirmed — these are insulation TYPE codes referenced inside schedule table text only, never drawn as plan instance tags | ✅ match (correct zero) |

**Open discrepancy: `EBB-1` reports drawn_count 2, but a full-page visual
read found it once.** Not yet resolved — needs the exact-bbox grounding
pass (in progress, see below) to determine whether this is a real
duplicate-detection bug in the occurrence ladder (e.g., `compoundTagOcc`
double-counting against a nearby fragment) or a second real occurrence I
missed at this render resolution. **Do not treat `EBB-1`'s count as
verified until this is resolved.**

**bldg5406-hvac-demo** (`opentakeoff-corpus/raw/bldg5406-hvac-demo-mechanical.pdf`,
23 pages) — partially read (2 of 4 plan-role pages viewed). No key written
yet. One significant cross-check already done:

**Finding: the text-only baseline finds tags the full geometric pipeline
refuses.** The corpus's own committed evaluation report
(`reports/EVAL-2026-09-13_0024.txt`) lists `EF-1`, `EF-4`, `EF-5`, `CH-1`,
`AS-1` as the 5 `rowsym-missed` entries for this set — "real drawn symbols
NOT anchored by sweep_schedule_row." This session's text-only baseline
(`tag-occurrence-baseline.mjs`, zero geometry) finds **all five as drawn
exactly once each**, and a direct visual read of sheet M-101 (page 2)
confirms `EF-1`, `EF-4`, `EF-5`, `CH-1`, `AS-1`, and `AC-1`/`ACCU-1` are
genuinely drawn there. This is the plan's central thesis, independently
confirmed on a real, previously-scored document: **text-only tag discovery
can succeed exactly where the full geometric-fingerprint pipeline refuses**
— because `sweepScheduleRow`'s refusal is about failing to build/corroborate
a *geometric* fingerprint around the tag, which says nothing about whether
the tag's *text* is findable and resolvable to its row. A production ledger
that reports "text found, row resolved, geometry unverified" instead of a
bare refusal would recover exactly these 5 real installed items as
disclosed (not silently assumed) evidence.

## Hypothesis verdicts (H1–H8, from the audit)

| # | Hypothesis | Verdict this session |
|---|---|---|
| H1 | Tags on unknown/misclassified-role sheets are never counted | **Confirmed, concretely** — bessemer p2 (Underslab Plumbing Plan, misclassified `schedule`) carries 4 real `FD-1` instances invisible to every row-driven tool |
| H2 | Hyphen/space drawn-text variants are missed | Not yet measured — no variant-spelling case identified in bessemer or bldg5406 yet; needs a set with real spelling drift (itd-d1-lab is the flagged candidate, not yet examined this session) |
| H3 | First-non-empty ladder drops mixed split/whole tags on one sheet | Not yet measured directly; the `EBB-1` double-count (below) may be a related but different failure mode (over-count, not under-count) — needs resolution |
| H4 | Rotated tags are missed | Not yet measured — no rotated-tag case identified yet |
| H5 | Orphan tags (no schedule row) are invisible to row-driven tools | **Confirmed by construction** — the baseline producer is row-driven by design and cannot discover an orphan; this is inherent to every tool audited (`sweepScheduleRow`, `countMarks`, `buildPlanSetTakeoff`), not a bug found on a specific document |
| H6 | itd-d1-lab over-counts are cross-view redraws | Not yet measured — itd-d1-lab not examined this session |
| H7 | Note mentions/legend entries leak into counts | Partial negative signal: bessemer's `D-1`/`D-2`/`D-6` (schedule-internal type references) correctly report 0 plan instances, and the "(SEE SCHEDULE)" note on p5 was not picked up as a false instance — but this is a small, favorable sample, not a real stress test |
| H8 | Row lookup disagrees across the three duplicated implementations | Not yet measured — requires running `sweepScheduleRow`'s inline lookup, `uniqueFamily`, and `reconcileScheduleFamilyFromGraph` side by side on the same tag, not done this session |

**New finding not in the original audit:** the text-only occurrence ladder
can itself **over-count** a real single instance (the `EBB-1` = 2 vs.
visually-confirmed 1 discrepancy). If confirmed as a real bug rather than a
missed second instance, this is a **new, ninth hypothesis** for Phase 1 to
carry forward: the occurrence recovery ladder's dedup-by-distance step may
not cover every pair of recovery strategies.

## Test suite findings (from re-establishing Phase 0.1 baselines)

Ran under the CPU contention described above. Confidence noted per finding.

| Test | Result | Assessment |
|---|---|---|
| `web` (`npm run check`) | typecheck ✅, lint ✅ (3 pre-existing warnings, matches `PROGRESS.md`); full test run still in progress at time of writing | reliable so far |
| `mcp` typecheck | ✅ clean (both workspaces) | reliable |
| `test/conformance.test.ts` "sheet graph (#87)" | ✖ after 69.9s (normally sub-second) | **very likely contention timeout** — needs isolated re-run |
| `test/conformance.test.ts` "detect_rooms assign mode" | ✔ after 99.8s (normally sub-second) | same signature, passed anyway — direct proof of the scale of slowdown |
| `test/demoD04.regression.test.mjs` | ✖ in 128ms | **fast failure, not contention** — needs real investigation, not yet done |
| `test/demoD05.regression.test.mjs` | ✖ in 15.5s | ambiguous — could be genuine slowness or partial contention; needs isolated re-run |
| `test/demoD09.regression.test.mjs` | ✖ in 890ms — "packaged rooftop schedule must remain extractable" fails; every earlier assertion in the same test (room finish, diffuser/grille) passed | **likely a fixture-cache race**: `loadFixtureGraph` reads a shared, content-addressed on-disk cache (`cachedSheetGraph`), and this test ran concurrently with 3+ other suites reading/writing the same cache directory for overlapping fixture PDFs. Needs isolated re-run before treating as real. |
| `test/safewrite.test.ts` "an unreadable file fails CLOSED" | ✖ in 3.2ms | **root-cause identified, not a code bug**: the test `chmod`s a file to `0o000` and expects a read to be refused; this container runs every process as `root`, and root bypasses Linux DAC permission bits, so the file stays readable. Environment artifact, not a pipeline defect. |
| `test/takeoffHvac01.regression.test.mjs` "T-HVAC-01 … frozen truth" | ✖ **after 1,165,303ms (19.4 minutes)** — got 375, expected 396 (the exact number `STATE.md` documents as the current passing baseline) | **almost certainly contention-degraded, not a regression** — a single-document compile against this same NAVFAC set is documented elsewhere in this repo completing in 5–38 seconds with a warm graph cache; 19 minutes is 30–200× that. The compiler's own `INCOMPLETE_PLAN_SEARCH` disclosure path exists precisely for a sweep hitting a work/time cap, which is exactly what heavy multi-process contention would trigger. **Must be re-run in isolation before this 375 is reported anywhere as real.** |
| `test:shared-path` "WP1 keyed compile acceptance on ≥2 non-NAVFAC sets" | ✖ | **explained, not a regression**: the test needs ≥2 non-NAVFAC sets from the bulk corpus, which is entirely absent in this environment (see above); dozens of "no rejoined PDF" skip lines immediately precede the failure in the log, confirming the precondition, not the code, is what's unmet here |
| Full corpus eval (`corpus-eval.mjs --report`) | still running at time of writing; table-recall phase completed in 129.9s | too early to report — the takeoff/reference/graph phases for the 7 scored sets have not yet produced output |

**Action required before any of the fast-but-unexplained-by-contention
failures (`demoD04`, `demoD05`) can be called real or dismissed:** re-run
`node --import tsx --test test/demoD04.regression.test.mjs
test/demoD05.regression.test.mjs test/demoD09.regression.test.mjs
test/safewrite.test.ts` alone, on an otherwise idle machine, and read the
actual assertion diff (this session captured D09's diff and safewrite's
cause but not D04's or D05's full detail).

## What remains for Phase 0 (not done this session)

- `keys/bessemer.tagocc.csv` — content is determined (table above) but not
  yet written; blocked on resolving the `EBB-1` discrepancy with exact-bbox
  grounding (`find_text`-based, script written and queued, running slowly
  under contention).
- `keys/bldg5406-hvac-demo.tagocc.csv` — not started; 2 of 4 plan sheets read.
- 7 more sets from the plan's target list (baker-county-eoc, navfac,
  federal-mech, itd-d1-lab, plus 3+ held-out bulk documents — the last group
  blocked on bulk-corpus staging, which is blocked on network policy).
- `tag-ledger-eval.mjs` has not been run against a real key yet — its own
  logic is unverified end-to-end.
- H2, H3 (confirm/refute), H4, H6, H8 not yet measured.
- Isolated re-verification of every test-suite finding flagged above as
  contention-suspect.
- The full corpus-eval report (takeoff/reference/graph phases) had not
  finished at time of writing.

This file will be updated, not replaced, as those continue.
