# OpenTakeoff HVAC/BAS Corpus — Goal, Method, and Current State

Last updated: 2026-09-03 — **THE ACTIVE GOAL, direct from the user,
overriding everything below it in this file, including the "Four
pillars" sequencing and the batch prewarm approach — read this before
anything else:**

> Disregard pillars A through D, they are bullshit. The only goal is
> finding all the bugs and making this platform production viable so
> that any estimator can upload a next pdf and get a takeoff. That's it.
> End of story. All the bugs need to be ironed out, the tail of this
> corpus complete. Verified takeoffs until it seems redundant... until we
> can run an accurate FULL TAKEOFF not "looks okay" this app is fucking
> useless.

**In practice:** pick one real set at a time, build it on demand (never
a batch prewarm — see below), render its real pages, verify every real
table cell-by-cell against them — not "compiled without error," not
"looks plausible" — find every real bug that way, root-cause it against
the actual page geometry, fix it minimally, write a regression test for
the exact real shape, run the full test suite (not just the new test) to
protect every set already working from the new fix, commit with the real
before/after evidence, move to the next set. Repeat until a verification
pass on a new set stops turning up anything the existing fixes don't
already handle. That is the only definition of done — a full, accurate,
correct takeoff on real, unfamiliar PDFs, not a metric or a pillar gate.

**No batch prewarm.** A batch prewarm across the whole corpus was tried
and killed same day — it's a production-speed optimization for a
*stable* codebase, and this phase is not that: every real fix (which
this loop produces on essentially every set) invalidates the whole
prewarm cache by design, so running one during active bug-hunting is
pure overhead that produces nothing but memory pressure (it caused two
real OOM kills) for sets nobody has even looked at yet. Build one set at
a time, only the one actually under the microscope, on demand.

Full detail, the complete reasoning, and the running log of real fixes
found this way live in **"THE REAL MANDATE" in §8 below** (search for
that heading) — this header is the short version; that section is the
authoritative one, plus rules 1-17 elsewhere in this file are the actual
running record of bugs found and fixed under it. The "Four pillars"
material still in this file (§8) is kept only as historical engineering-
shape reference — it is not the priority, it never resumes being the
priority unless the user says so again directly.

---

Last updated: 2026-09-01 — Pillar C raised to **corpus-complete** depth:
every BAS set + every valve set must be coordinator-verified and
pipeline-corroborated (see `takeoffs/NEXT_GOAL_LOOP.md`). A+B §6 MET;
Vol2 full 82 INDEX still in scope. Older keyed-corpus history retained.
**(Historical — see the active goal above.)**

## Platform mandate (2026-09-02 expansion) — read first, every session

**Read `takeoffs/HVAC_BAS_DOMAIN_MAP.md` before any valve/damper/actuator
or BAS points/SOO extraction or ground-truth work.** It is the real,
web-researched-plus-corpus-verified map of every place this information
actually lives on real jobs — dedicated schedules, embedded-in-equipment-
schedule coil data, riser diagrams, control schematics, drawn symbols, and
what's structurally out of reach (architectural sheets for fire/smoke
damper counts, a separate specifications book) and must be disclosed as an
exclusion rather than silently absorbed into a plausible-looking zero.
"Look for a table titled valve schedule" or "look for a table titled
points list" is not a complete model of where this data lives — treating
it as complete is a production-readiness bug.

The end goal is **not** "100% on this corpus." It is a **general-purpose,
production-grade HVAC/BAS takeoff platform** — valve/damper/actuator
takeoffs, BAS points-list takeoffs, and sequence-of-operations takeoffs, all
fully grounded (cite-backed to sheet+bbox) — that works on **any real
mechanical blueprint set** that carries this information, reachable
end-to-end through the agent path (UI Agent panel and MCP), not just the
named sets in this corpus. The corpus (now 100+ real vector PDFs across
Vol1+Vol2) is the proving ground and the source of real ground truth to
build against — it is explicitly not the finish line. A fix that only works
because it recognizes a specific PDF, tag, or corpus id is a regression
against this goal even if it raises a score.

**Two standing working rules, non-negotiable, apply to every future session
on this effort:**

1. **Regex is never the classification engine — structure is.** Table
   detection, family classification, and row admission must be decided by
   geometry and structure first: table shape, header/column layout, mark
   pattern *by position/shape* (column-0 admits a family, not a string
   match against a name list), cross-source corroboration (schedule ↔ plan
   ↔ SOO), and OCR/VLM assist when vector structure genuinely can't decide.
   Regex may **confirm** a structural finding (a title phrase, a header
   token) but must never be the sole thing standing between "found" and
   "not found." A fix that only adds a regex pattern without first
   establishing structural detection is treating a symptom, not the
   disease — see `takeoffs/VECTOR_TAKEOFF_ENGINE_RESEARCH.md` §1 for why
   this specifically was the original mistake being corrected.
2. **Audit before you build.** Before implementing anything for an
   uncertain requirement, search the actual codebase exhaustively first —
   this platform is large and mature, and the capability being reached for
   may already exist, partially or fully, under a name you didn't expect
   (e.g. `sequenceExtract.ts` already does real SOO section extraction with
   evidence; `estimatorTakeoffDocument.mjs`, `reconcileWorkflow`,
   `hvacTaxonomy.ts`, `gridClassify.mjs`, `queryTable.mjs` already carry
   real structure). Never re-implement or fork something that already
   exists, even partially — extend it on the shared path instead. Grep
   broadly, read the module, run its existing tests, before writing new
   code that might duplicate it.
3. **A census pass over `graph.tables` is not ground truth.** Real ground
   truth means an agent actually rendered the page and looked at it —
   `session.renderSheetPng`, eyes on the image, checked against what the
   compiler claims. The automated census/prewarm scripts prove the pipeline
   ran without crashing and report what the table-classifier found; they do
   **not** prove the finding is correct. Do not conflate "N sets have a
   `pipeline_harness` block" with "N sets have verified ground truth" —
   say which one you mean, every time.
4. **Fixed symbol libraries do not generalize — the legend-read path is the
   real design, use it first.** `match_reference_symbol` matches against a
   small, hand-seeded library built from ONE project's own drafting
   convention (originally Eglin AFB) — real, measured evidence
   (2026-09-02, `itd-d1-lab-mechanical.pdf`) shows it returns **zero**
   matches on a different drafter's real, correctly-drawn control-valve
   glyph (a bowtie body + **rounded dome actuator cap**, vs. the library's
   **square** M-box) even though the set has real, schedule-verified valve
   content. A zero from `match_reference_symbol` is not evidence of
   absence — it is evidence that the library doesn't cover this sheet's own
   convention. The actual generalized answer already exists in the
   codebase: `find_legend_symbols` (`findLegendGlyphs` in `session.ts`)
   auto-detects this **sheet's own** glyph+caption pairs from its own
   legend, no fixed library, no per-firm hardcoding — read the set's own
   legend first, then sweep from what it actually draws. Treat the fixed
   library as a fallback/corroboration signal, not the primary path, until
   this is fixed platform-wide. Real, measured evidence 2026-09-02 on
   `013_MO_T2523_01`'s own controls legend: `find_legend_symbols` correctly
   captured 26 distinct, correctly-labeled valve/actuator glyphs off one
   real legend sheet (`CONTROL VALVE (TWO-WAY, MOTORIZED)`,
   `PRESSURE REDUCING VALVE`, etc.) — the mechanism is real and rich, not
   theoretical. **But a captured legend rect cannot be fed straight into
   `symbol_sweep`'s seed** — confirmed by real refusal on two different
   sets (`itd-d1-lab-mechanical.pdf`, `013_MO_T2523_01`): a legend is drawn
   at its own illustrative scale, essentially never has a stated scale of
   its own, and `set_scale {use_detected:true}` fails on it for exactly
   that reason. This is the tool correctly refusing to guess, not a bug —
   the real workflow is legend-as-visual-reference (read the caption, look
   at the shape) → marquee ONE real instance actually drawn to scale on a
   plan sheet → sweep from that seed. Finding that real on-plan pixel
   location for a small, densely-packed CAD symbol is itself a real,
   unsolved friction point for anything without either an interactive
   agent-UI click or sharper-than-tonight's visual tooling — named
   honestly as still open, not silently worked around.
   **Real, measured follow-up (2026-09-02): the exact-geometry engine
   itself is NOT the "misses wide-open unambiguous symbols" gap.** Built a
   real seedRect (coordinate math done by hand: view-render px → zoom
   0.302469 → native image px, `session.viewSheet` used to visually
   verify the crop at every step before trusting it, not eyeballed
   blind) around one real "EH-1" electric-heater hexagon on
   `itd-d1-lab-mechanical.pdf#3`, then ran a real `scope: "sheet"`
   `symbolSweep`. Result: 29 matches at score **1.0**, 1 withheld at
   0.763. Manually confirmed by coordinate cross-check that both other
   real EH instances on the sheet (EH-2, sitting immediately adjacent —
   exactly the "nothing to confuse it" case — and EH-3, elsewhere on the
   sheet) are IN that 1.0 list, not missed. Manually inspected the one
   withheld hit: it is a genuinely different device (an "SA-1"
   supply-air hexagon with an attached tag circle) that legitimately
   shares EH's hexagon outline — correctly held back at 0.763, not
   falsely counted, not silently dropped. Conclusion: for a real, clean,
   correctly-seeded case, `symbol_sweep`'s matcher works exactly as
   designed. The real, demonstrated gap is upstream of the matcher — the
   manual, error-prone, three-coordinate-space seeding workflow this test
   itself had to do by hand (view px → zoom → native image px) — not the
   matching math. This does not prove there is no algorithmic miss
   anywhere in the corpus (rotated/mirrored/noisy/cross-scale cases were
   not tested here) — say that limit out loud too. Full result saved:
   `symbolsweep-result.json` pattern reproducible via
   `session.sheet(name).widthPx/heightPx` + `session.viewSheet` to
   iteratively narrow a region before calling `session.symbolSweep`.
   **The workflow gap itself is now closed, generalized, not patched
   one-off (2026-09-02):** `symbol_sweep` (MCP tool, session.ts,
   agentTools.js/TakeoffCanvas.jsx UI-agent path) now accepts `seed_point`
   as an alternative to `seed_rect` — one point (image px / normalized
   0..1 in the UI layer), no marqueeing, no manual coordinate math. It
   resolves via a new `findGlyphNear` (`legendlearn.ts`), which reuses
   `find_legend_symbols`' own real-junction-aware, grid-line-stripping
   `clusterSegments` union-find — the SAME connected-component engine,
   generalized off legend captions entirely (this is the actual answer to
   "would a graph library like networkx help": the graph technique
   — connected components over a segment-adjacency graph — was already
   the right idea and was already hand-implemented in-repo; a Python
   graph library would be the wrong language for this Node/TS pipeline
   AND would still need the same CAD-domain tuning — grid-line stripping,
   glyph-shape filtering, spatial bucketing — that `clusterSegments`
   already has, so reuse-and-generalize beat adding a dependency).
   Refuses (never guesses) when no compact glyph-shaped cluster sits
   within snapping range of the point. Downstream sweep logic (scoring,
   rotation/mirror, withheld/rejected, labels, scale, commit) is
   completely untouched — only the seeding step changed. 20 real tests
   (16 legendlearn.test.ts incl. 4 new `findGlyphNear` cases mirroring the
   real adjacent-EH-1/EH-2 case exactly — score 1.0 on the real twin,
   duct-line correctly excluded, null on a genuine miss, snap-from-a-
   rough-click; 3 new tools.test.ts MCP-layer cases incl. `seed_point`
   producing the IDENTICAL real sweep result as the hand-marqueed
   `seed_rect` on the same fixture) — all passing, zero regressions on
   the 18 pre-existing symbol_sweep tests.
5. **Schedule data is not always where you'd expect it, and this varies by
   drafter.** Valve/coil/actuator data can be (a) one fused, deeply
   merged-header AHU/RTU schedule with everything in it (a disclosed,
   still-unparsed gap on the Eglin AFB set — see `hvacTaxonomy.ts`'s AHU
   note), (b) split across several cross-referenced tables (D-1 Lab: `HOT
   WATER REHEAT COIL SCHEDULE` and `CONTROL VALVE SCHEDULE` are two
   separate tables joined by a `HOT WATER COIL` column, confirmed by direct
   inspection 2026-09-02), or (c) never tabulated at all, only drawn as
   symbols. Before writing or trusting ground truth for a family
   (valve/damper/actuator/BAS), check the corpus directly for how *this*
   drafter actually laid it out — do not assume the D-1 Lab shape, the
   Eglin AFB shape, or any other single set's shape is universal. Web
   research on real HVAC/BAS documentation conventions (ASHRAE-adjacent
   guidance, real spec/schedule examples) is required before writing GT for
   a new family or drafting convention the corpus hasn't already proven —
   corpus evidence beats generic web results when they conflict, but skip
   neither.
6. **A giant set is not a broken set — never assume a heavy PDF is a bug
   without a real, isolated retry.** `01_NY_VA_Northport_Dialysis_100CD`
   (162 sheets, 6-part rejoined) repeatedly OOM-killed itself and neighbor
   processes when built concurrently with anything else heavy. Retested
   2026-09-02 in genuine isolation (nothing else running): succeeded
   cleanly in ~36 minutes (162 sheets, 12 tables). It was never broken —
   it's real scale that needs real, uncontested compute time. Under this
   sandbox's ~4-core/15GB ceiling, do not run more than ~2 heavy
   Node+JVM(+Python gmft sidecar) processes concurrently, and pull a set
   this large out to run alone (`kill -STOP`/`-CONT` other shards to pause
   without losing their progress, don't kill them) before concluding it's
   a distinct bug rather than scale.
7. **A valve/damper/actuator or BAS takeoff is never "search for a table
   with a matching title" — that model is explicitly banned, not a
   simplification to fall back on under time pressure.** Real HVAC/BAS
   information lives in at least 8 real, distinct places — see
   `takeoffs/HVAC_BAS_DOMAIN_MAP.md`, required reading, not optional
   background: dedicated tagged schedules, coil data embedded inside a
   broader equipment schedule with zero separate valve schedule anywhere
   in the set (real, confirmed: `001_NC_FY20_P_228_ATC_Tower_and_Air_
   Operations`), tables cross-referenced by a join column, riser diagrams,
   control schematics, drawn plan/detail symbols, the architectural
   fire-rated wall plan (fire/smoke damper counts are NOT authoritative
   from mechanical sheets alone), and a separate specifications book (CSI
   23 09 00 / 23 09 93 — points lists and Sequences of Operation are
   real, standardized spec sections, not just drawing content). A "0
   found" answer is only honest when every reachable source was checked
   AND every source the platform structurally cannot reach (no
   architectural sheets attached, no spec book attached) is disclosed as
   an explicit exclusion on the output — never silently absorbed into a
   plausible-looking zero. Regressing to "did we find a table titled
   valve/points schedule" is exactly the failure this rule exists to
   prevent, and doing it again under time or resource pressure is not an
   acceptable shortcut.
8. **Never sit idle waiting on a background rebuild, census, or scan —
   there is always real platform work to do in parallel, and doing it is
   mandatory, not optional.** A cold graph rebuild, a corpus scan, a
   render — none of these need the coordinator's attention while they
   run; they need a monitor and nothing else. Real work that needs zero
   warm cache and zero corpus access is always available: write/extend a
   detector against a synthetic fixture built from real header text
   already seen tonight (exactly how `extractEmbeddedCoils` and
   `scopeExclusionsForGraph` were built and test-verified 2026-09-02,
   entirely offline, then spot-checked against one real set once
   something was actually warm), wire an already-built compile function
   into the MCP tool / CLI / UI agent paths it's still missing from, add
   the exclusion-disclosure a real finding calls for, tighten a test,
   read and act on `HVAC_BAS_DOMAIN_MAP.md`'s still-open items. Reporting
   "still waiting on X" with no code shipped in the same stretch is a
   failure mode this rule exists to name and prevent, not a status
   update — if nothing shippable came out of a wait, that wait was
   wasted, and the fix is to start the next real piece of work the
   moment a background job is kicked off, not after it reports back.

9. **A row's own `row.key` is an upstream banded GUESS, not ground truth —
   verify it against the row's own cells before trusting it as a tag.**
   Real, found-live bug (2026-09-02): `021_XX_Laboratory_building`'s real
   `AIR TERMINAL UNIT SCHEDULE` (sheet #13) has a REMARKS column that wraps
   across multiple physical text lines and incidentally mentions a
   cross-referenced PUMP tag ("P-1A,B") that is NOT the row's own
   equipment — `sheetgraph.ts`'s row-key banding (`rowKeyOf`/
   `keyColumnBand`) picked that up as `row.key`, even though the row's own
   real identity ("VVR2 - 12") sat right there in its own MARK cell,
   unused. Worse, the SAME real wrapped-REMARKS shape merged two real
   rows' worth of numeric-column data into one `TableRow` object elsewhere
   in the same table (`GPM: "0.7 1.2"`, two real units concatenated,
   unattributable to either). `corpusTakeoff.mjs`'s `extractEmbeddedCoils`
   was hardened at the point this was found — prefer an explicit
   TAG/MARK/SYMBOL cell over `row.key` when the row has one, and reject a
   numeric cell carrying more than one number token as evidence of a
   merged row rather than reporting an unattributable value — both real,
   tested (`corpusTakeoffHeaderGeometry.test.ts`), shipped fixes.
   **UPDATE, same day**: the deeper bug (row-banding/segmentation in
   `sheetgraph.ts` itself, `task_10174a20`) is now ALSO fixed, at its
   real source — traced with a temporary debug probe against the real
   corpus (not guessed), reverted before landing anything. The
   wrapped-REMARKS theory above was wrong: the real cause was `CODE_RE`'s
   own compound-tag prefix (`[A-Z]{1,6}`, letters only) rejecting a real
   letter+digit tag prefix (`VVR2-8`, a riser/zone-numbered terminal-unit
   convention) outright, which orphaned every one of those rows and let
   them glue onto whichever nearby row sat closest by y-position — the
   actual source of both symptoms described above. Fix is purely
   additive (existing letter-only prefix untouched, a second
   `[A-Z]{1,4}[0-9]{1,2}` shape added alongside it); 101/101 existing
   `sheetgraph.test.ts` tests still pass, 1 new one added, 102/102 total.
   Landed deliberately, not rushed under time pressure — sequenced this
   way specifically because the corpus cache was already mostly cold
   (2/116 warm, rule 10), so the marginal cost of one more L0-L4.5 edit
   was low; fixing known bugs now, before the eventual full re-prewarm,
   beats fixing them after and invalidating that prewarm too. The
   generalizable lesson: `row.key` earns trust from being
   usually-derived-from-the-real-tag-column, not from any guarantee — the
   moment a row also carries its own explicit TAG/MARK/SYMBOL cell, that
   cell is more directly grounded and any extractor reading tags should
   prefer it.

9a. **Two more real, shipped `extractEmbeddedCoils` fixes from the same
    verification stretch — written here because they'd only otherwise
    live in a commit message, and this file is the ledger, not `git log`.**
    (1) Real, found-live gap (2026-09-02, Eglin AFB's own
    `AIR HANDLING UNIT HYDRONIC COIL SCHEDULE`): a coil's serving
    equipment was right there in the row (`SYSTEM: "AHU-1"`, real and
    correct) but `served` came back null, because the detector only
    recognized `SERVED`/`AREA` as that column's name. Fixed by widening
    the header match to include `SYSTEM`, anchored to the exact header
    (never a bare substring test) for the same reason `TAG_CELL_RE` is
    anchored. (2) Real, found-live bug (2026-09-02,
    `05_MO_VA_StLouis_AHU_VAV_Replacement`'s own
    `SINGLE DUCT AIR TERMINAL UNIT SCHEDULE`): its real header row is
    `EWT HW | EWT ELEC | EWT NONE | EWT | GPM | EWT COIL` — three
    checkbox-style reheat-type indicator columns (real values YES/NO)
    sitting right next to the one real numeric EWT column, plus a fourth
    decoy after it. The detector took the FIRST header matching the EWT
    regex by column order and reported `ewt: "YES"` — a temperature
    field can never legitimately be that. Verified against the real raw
    row (`EWT HW=YES, EWT ELEC=NO, EWT NONE=NO, EWT=200, GPM=0.3,
    EWT COIL=NONE`) before and after the fix. Fixed by trying every
    header matching the regex in order but only accepting one whose own
    cell value actually looks numeric — applied to GPM too, same failure
    mode, not yet observed live for that field but the same fix covers
    it. Both real, both tested (`corpusTakeoffHeaderGeometry.test.ts`),
    both shipped.

10. **"Warm" is a claim about a specific codebase state, not a durable fact
    — a single L0-L4.5 edit invalidates it for every NEW process, silently.**
    Real, measured 2026-09-02: mid-session, `symbolSweep`'s `seed_point`
    feature required editing `mcp/src/session.ts` — an L0-L4.5 file, part
    of `sheetGraphCache.mjs`'s own `sourceDigest()` (every file under
    `mcp/src/**` is hashed into the cache key by design, so the cache
    *correctly* invalidates on a real pipeline change). The moment that
    commit landed, every previously-warm entry (a 76-of-116-set corpus
    scan had been running against, real progress, hours of real compute)
    became unreachable to any FRESH process computing the digest against
    the new file content — measured directly by probing all 116 real sets
    with `cachedSheetGraph`'s own real key logic afterward: only 2/116
    read as warm (the two sets a script happened to rebuild fresh AFTER
    the edit). A single already-running long-lived process is NOT
    affected — it memoizes `sourceDigest()` once at its own start and
    stays internally consistent for its own lifetime (confirmed: the
    76-set scan kept running fine, un-broken, on its own frozen digest) —
    but that process's own "warm" reads are then invisible/unreachable to
    every OTHER process, including a restart of the same scan. Real cost
    of not knowing this: reporting "76/116 sets are warm" as if durable,
    when the true, current, cross-process answer was "2/116," would have
    been a real false status report, not a rounding error. The rule: after
    ANY edit to `mcp/src/**`, `web/src/lib/sheetgraph.ts`, or
    `vectorTakeoffPipeline.ts`, treat the whole corpus as cold again for
    every process that hasn't rebuilt since that exact edit — verify real
    warm/cold state with a fresh, cross-process probe
    (`cachedSheetGraph(pdfPath, { identity, compute: () => { throw ... } })`
    — a compute that throws proves a MISS without ever doing real work;
    reaching the return means a real HIT) before reporting a warm count,
    never by re-quoting an earlier-session number or a still-running
    process's own progress log. Batch L0-L4.5 changes into one deliberate
    window, run the full re-prewarm once after, rather than bleeding this
    cost out edit by edit across a long session.

11. **OPEN, SCOPED, NOT STARTED: isolate graph-building code from feature
    code so an unrelated edit stops invalidating the whole corpus's cache.**
    Direct follow-on from rule 10's real incident. `session.ts` is 6,210
    lines — `graphForPipeline()` (the one method whose output the cache
    actually stores) sits in the same file as dozens of unrelated feature
    methods (`symbolSweep`, `findLegendGlyphs`, `placeCount`, `viewSheet`,
    `traceConnectivity`, ...). `sourceDigest()` hashes the whole file, so
    editing ANY of those unrelated methods (as `seed_point` did) busts the
    cache key for every one of the 116 real sets, exactly as rule 10
    describes. The naive fix — hand-pick a smaller file list — is NOT
    safe: that is literally what caused the FIRST invalidation incident
    this session (`vectorTakeoffPipeline.ts` missing from a manual list,
    the cache silently serving STALE graphs — worse than over-invalidating,
    because it fails silently). The real fix has to separate
    `graphForPipeline` and its true dependency chain into file(s) the
    digest can cover completely, without a fragile hand-maintained
    include list — likely extracting `graphForPipeline` out of the
    monolithic `Session` class, or moving the larger share of unrelated
    feature methods out into their own file(s) instead. Two attempts to
    queue this as a spawn_task both timed out (tool-side, not a content
    problem) — written here instead so it isn't lost. Test BOTH
    directions before landing it: a change to an extracted feature file
    must leave the cache key unchanged, and a change to the real
    graph-building file must still change it (that second case not
    changing would silently reintroduce the exact stale-graph bug rule
    10 already paid for once). Landing this fix is itself one more
    L0-L4.5 edit — do it as a single deliberate change, with the real
    full re-prewarm run immediately after under the new stable code, not
    bled out incrementally.

12. **FIXED 2026-09-03 (corrected once, then actually landed): steam
    heating coils were invisible to `extractEmbeddedCoils`, and the
    original diagnosis below (same day, 2026-09-02) was WRONG about
    where the bug lives.** Original
    text is preserved struck through further down for the record. Real,
    re-diagnosed via actual pipeline output (not code-reading alone) on
    `05_MO_VA_StLouis_AHU_VAV_Replacement.pdf#39`'s real
    `STEAM HEATING COIL SCHEDULE`, real column order confirmed by
    rendering the actual page with real coordinates:
    `MARK | TYPE | LOCATION | SERVICE | SYSTEM | AIRFLOW(CFM,[L/s]) |
    MAX FACE VELOCITY(FPM,[M/s]) | MAX APD(IN WC,[Pa]) | EAT(°F,[°C]) |
    MAX LAT(°F,[°C]) | TOTAL MIN CAPACITY(MBH,[kW]) | STEAM → {ENT CONT
    VALVE, ENT COIL, FLOW} → {PSIG[kPa], PSIG[kPa], LBS/HR[kg/HR]} (a
    genuine 3-tier nested sub-header) | STEAM TRAP MARK | COIL SIZE |
    NOTES` — 17 real columns, not the ~12 the original entry assumed.

    First real finding: this table's own leaf header row has TWO
    separate columns both literally labeled "MARK" (the row's own
    equipment tag, and — 100px away — "STEAM TRAP MARK", disambiguated
    only by a real parent phrase, "STEAM TRAP", sitting one tier above
    the second). Traced live in `findHeaderRow`'s own duplicate-label
    handling (sheetgraph.ts): the disambiguating parent lookup
    (`parentLabelOver`) only recognizes a VOCABULARY word as a parent —
    "STEAM TRAP" isn't in `EQUIPMENT_HEADERS`, so the lookup returns
    null, the second MARK collides with the first, and its whole column
    silently drops. The file's own comment on `parentPhraseOver` (the
    phrase-aware sibling function, already used elsewhere) explicitly
    named this exact call site as a known, deliberately-untested gap
    ("widening it there was never measured"). Fixed for real: switched
    that one call site to `parentPhraseOver`, with a real bug of its
    own caught and fixed along the way (its floor-bound parameter isn't
    computed the same way `parentLabelOver`'s is — the naive swap
    regressed the ROOM FINISH SCHEDULE's own FLOOR FINISH/CEILING
    FINISH duplicate-column test, caught by the full 102-test
    `sheetgraph.test.ts` suite, root-caused to an empty search-row
    range, fixed by replicating `parentLabelOver`'s own clamp at the
    call site). 102/102 `sheetgraph.test.ts` + 26/26
    `corpusTakeoffHeaderGeometry.test.ts` pass. This part is REAL and
    SHIPPED.

    Second, more important finding: that fix, real as it is, does
    **NOT** fix the actual corpus symptom — confirmed by re-running the
    real pipeline against the real PDF (cache-bypassed,
    `OPENTAKEOFF_GRAPH_NO_CACHE=1`, so this cost real build time, not
    guessed) before and after the fix: the extracted output is
    BYTE-IDENTICAL either way. Root cause: this table never reaches the
    equipment-kind vocabulary path (`findHeaderRow` with
    `EQUIPMENT_HEADERS`) at all — it's classified `kind: "reference"`,
    meaning it falls all the way through to the vocabulary-FREE
    structural fallback reader (`extractReferenceTableAt`, see the
    section above `extractAllTables` for what that kind is and why it
    exists). That reader's own header-block detection
    (`isGenericHeaderRow`/`expandGenericHeaderBlock`) settles on the
    WRONG tier as "the header" — the MID tier (`AIRFLOW | MAX FACE
    VELOCITY | MAX APD | EAT | MAX LAT | TOTAL MIN CAPACITY | STEAM`,
    7 cells) rather than the true LEAF tier underneath it (the one
    carrying MARK/TYPE/LOCATION/SERVICE/SYSTEM and every real unit
    sub-label) — confirmed directly: the extracted table's first "data"
    row is literally the leaf row's own units (`key: "CFM"`,
    `AIRFLOW: "CFM [L/s]"`), and neighboring header cells show real
    cross-column text bleed (`TOTAL MIN CAPACITY`'s own cell text comes
    back as `"ENT CONT VALVE MBH [kW] PSIG"`, sub-tier tokens from the
    ADJACENT STEAM group). Unlike the equipment-kind vocab path
    (`findHeaderRow`'s own explicit "the LOWEST tier defines the
    columns" descent loop), the structural reference reader has no
    proven analogous deepest-tier-wins mechanism for this shape — a
    genuinely different code path (`extractReferenceTableAt`/
    `clusterGenericColumns`) from the one the original entry (and this
    entry's first fix) targeted.

    THIRD finding, traced live while building the equipment-kind
    regression test above — this is the real, load-bearing reason the
    table never reaches equipment-kind at all: `CODE_RE` (and
    `rowKeyOf`'s equipment/finish branch generally) requires a row's key
    to START WITH A LETTER — every alternative in the regex begins
    `[A-Z]`. St Louis VA's own real equipment marks on THIS table are
    building-number-PREFIXED (`1-RH-1`, `1-AC-15`, `1-SHC-28`,
    `1-TP28-1` — a real, common VA/GSA numbered-building tagging
    convention, confirmed against the rendered page, not assumed).
    Confirmed directly: `CODE_RE.test("1-RH-1")` is `false` — a leading
    digit is rejected outright, unconditionally, for EVERY row on this
    table. `rowKeyOf` is handed `banded[0].str` with no upstream
    building-prefix stripping (`bandDataRows`'s own call site, no
    special-case). So every one of this table's rows fails to key,
    `isKeyedRow` fails table-wide, the equipment-kind candidate never
    qualifies at all, and the table falls through to the vocabulary-free
    "reference" reader entirely — tying together BOTH earlier symptoms
    (the missing MARK/TYPE/LOCATION/SERVICE/SYSTEM columns and the
    STEAM sub-tier text bleed) into this one, deeper cause. Reproduced
    directly, isolated from every other factor: an otherwise-identical
    synthetic fixture using `VVR1-5`-style (letter-first) keys extracts
    cleanly; swapping only the key shape to `1-RH-1`-style
    (digit-first) drops it to 0 tables. Confirmed NOT unique to this one
    table — the SAME real document's own `AIR HANDLING UNIT SCHEDULE`
    uses the identical `1-AC-15`/`1-AC-28`/`1-AC-36` convention and
    keyed only 1 of its real 4 rows (`AC-57`, the one row with no
    prefix) before this fix.

    FIXED, for real, and verified against the actual corpus, not just
    synthetic fixtures. `rowKeyOf`'s room-finish branch already solves
    the mirror-image shape (`QUALIFIED_KEY_RE`,
    `[A-Z]{1,2}-\d{1,3}[A-Z]{0,2}`, a LETTER-building before a digit
    room number, e.g. `A-134`) by requiring the prefix be a building
    this sheet's own text already confirmed exists
    (`buildings?.has(q[1])` — the `buildings` Set, built from real
    `BUILDING n`/`BLDG n` text mentions via `buildingMentions`/
    `BUILDING_RE`, already threaded through as a parameter every
    `rowKeyOf` call site). Extended the equipment/finish branch with the
    inverse: strip a leading `\d{1,2}-` prefix, require
    `buildings?.has(prefix)`, test `CODE_RE` against the REMAINDER only
    — keeping the FULL original string (prefix included) as the actual
    row key, since that is what is really drawn on the plan and what any
    cross-reference elsewhere in the pipeline needs to match against.

    Confirmed viable before writing a line of code, not assumed: real
    document text search found `"BUILDING 1"` 158 times across
    `05_MO_VA_StLouis_AHU_VAV_Replacement.pdf` (pdfplumber, independent
    of the pipeline). Landed with the same discipline as every other fix
    this session — synthetic-fixture regression test first (104/104
    `sheetgraph.test.ts`, including a real refusal-control asserting an
    UNCONFIRMED digit prefix must NOT be guessed at), then 272/272 across
    the broader targeted suite — and THEN, only after both, a real
    cache-bypassed rebuild (`OPENTAKEOFF_GRAPH_NO_CACHE=1`) against the
    actual PDF, before/after compared, not assumed:

    | Table | Before | After |
    |---|---|---|
    | `AIR HANDLING UNIT SCHEDULE` | `kind: equipment`, 1 row (`AC-57` only) | `kind: equipment`, **4** rows: `1-AC-15, 1-AC-28, 1-AC-36, AC-57` |
    | `STEAM HEATING COIL SCHEDULE` | `kind: reference` (garbled fallback, see the THIRD finding above), 14 corrupted rows | `kind: equipment`, **12** correctly-keyed rows: `1-RH-1`..`1-RH-9`, `1-SHC-28`, `1-SHC-36`, `1-SHC-57` |

    Both tables' real header sets are now rich and correct (MARK, TYPE,
    LOCATION, SERVICE, SYSTEM, AIRFLOW, MAX FACE VELOCITY, MAX APD, EAT,
    MAX LAT, TOTAL MIN CAPACITY, the full STEAM sub-tier, STEAM TRAP
    MARK, COIL SIZE, NOTES on the steam table) — this is the SAME fix
    that also resolved the earlier "reference"-kind fallback finding:
    once every row keys, the equipment-kind vocabulary path qualifies on
    its own merits and the table never falls through to the lower-
    fidelity structural reader at all, exactly as this rule's own "real
    next step" note predicted.

    One minor, honest residue, not hidden: the STEAM TRAP MARK column's
    real header now reads `"STEAM STEAM TRAP MARK"` — a doubled prefix
    from a separate, pre-existing, unrelated system-name-prefixing
    convention (applied to every column under a `STEAM`-titled table)
    layering on top of this rule's own `parentPhraseOver`/
    `phraseRunsInRow` fix, which already correctly names the column
    `"STEAM TRAP MARK"` on its own. This is a label duplication only —
    the real DATA under that column (`1-TP28-1` etc.) is present and
    correctly keyed, confirmed by the real row count and keys above. Not
    chased further this session (a different, unrelated code path, low
    severity, cosmetic); real next step if picked up: find where a
    STEAM-titled table's own column-naming applies its system prefix and
    make it idempotent against a label that already starts with the same
    word.

    Row-keying is genuinely shared code across the whole corpus (rule
    10's own caching lesson applies) — the real corpus rebuild above is
    real evidence this fix is additive and safe for the one document it
    was tested against, but the FULL 116-set prewarm (not yet run this
    session — see rule 10/11's own state) is the real, broader
    confirmation still owed before calling this corpus-wide-safe.

    <details><summary>Original 2026-09-02 diagnosis (kept for the
    record — wrong about WHERE the bug lives, not that a bug exists)</summary>

    ~~This is a genuine COLUMN-boundary bug in the upstream table
    structure recognition — the same class of defect as rule 3's
    row-banding bug (`task_10174a20`), just on the other axis.~~ The
    original entry described the symptom accurately (SYSTEM/MARK
    missing, TOTAL MIN CAPACITY cell corrupted) but assumed the
    equipment-kind vocabulary path was the one failing. It never was:
    that table falls through to the "reference" kind before the
    equipment path's own column-boundary logic even runs.
    </details>

13. **Correction, same day: the deterministic table/geometry engine was
    never the real gap — do not repeat the overstatement.** Mid-session,
    reasoning from rule 9/12's real bugs (`CODE_RE`, row-banding, the
    steam-coil columns), the case for training table-structure ML got
    overstated into "the deterministic table engine can't parse tables
    reliably." Real evidence says otherwise: a real user takeoff done on
    this platform BEFORE any of tonight's fixes was already, in the
    user's own words, "pretty solid" — and every real bug found tonight
    was narrow and bounded (a specific tag-prefix shape, a specific
    wrapped-cell layout), not a systemic failure. Checked directly
    against Kamai's own published technical description
    ([kamai.io/technology](https://kamai.io/technology)) rather than
    assumed: "Every measurement computed from the drawing's native
    geometry — not estimated. This deterministic approach is fundamental
    to their architecture, as opposed to probabilistic methods used by
    other takeoff tools." Their own trained models' stated job is
    narrower than "replace the table/geometry engine" — CLASSIFYING what
    a piece of vector geometry IS across drafting conventions ("a wall
    centerline from a gridline, a door swing from a decorative arc"),
    feeding a still-deterministic downstream computation, not an
    end-to-end learned replacement. The real, structural ML gap on this
    platform stays exactly what it was before this got overstated:
    cross-firm SYMBOL/element recognition without a seed (the
    `seed_point`/RT-DETR case) — never generalized into "therefore the
    table engine needs replacing too." Keep this distinction sharp going
    forward: a real, narrow, fixable bug found in the deterministic
    engine is evidence of exactly that — narrow and fixable — not
    evidence the architecture itself is inadequate.

14. **OPEN, SCOPED, NOT STARTED: the exploratory scan's own title net misses
    "AHU"-abbreviated schedule titles, and this likely under-covers the
    whole 76-set corpus, not just one set.** Found live 2026-09-03
    verifying `096_IN_Vermillion_County_Jail`'s real hit
    (`AIR HANDLING UNIT SYSTEM INDEX SCHEDULE`, correctly 0 coils — a
    real mark-cross-reference index table, same pattern as St Louis's
    own AHU summary). Digging further found the set's REAL coil data
    sitting in two separate, correctly-titled tables the scan's own
    `AHU_RTU_RE` (`/\bAIR\s+HANDLING\s+UNIT\b|.../i`) never matched at
    all — `AHU CHILLED WATER COOLING COIL SCHEDULE` and
    `AHU HEATING WATER COIL SCHEDULE` — because both use the abbreviation
    "AHU", never spelling out "AIR HANDLING UNIT". Confirmed the SHIPPED
    detector (`extractEmbeddedCoils`) is NOT the problem — it's
    title-agnostic by design (gates on header content only, never table
    title, per rule 7) — called directly against both real tables it
    correctly found all 4/4 real coils in each, real clean tags (CC-1
    through CC-4, PHC-1 through PHC-4) matching the index table's own
    cross-references, real plausible GPM values. The gap is entirely in
    the throwaway exploratory scan script's own loose net, which was
    never meant to be the real detection path (it exists to surface
    candidate sets for human/agent verification, `extractEmbeddedCoils`
    is the real, shipped detector) — but since that script is what
    picked which of the 76 sets got a real HIT line at all, any OTHER
    set in the corpus using "AHU" instead of spelling out "AIR HANDLING
    UNIT" in a table title likely never got flagged as a candidate in
    the first place, real coil data and all. Real fix: either widen the
    scan's own regex (cheap, but it's still just a candidate-surfacing
    net, not the real detector) or — better, and consistent with rule 7
    — stop relying on a title-gated scan to find candidates at all, and
    instead run the real, title-agnostic `extractEmbeddedCoils` header
    check directly across every table in the corpus once it's warm. The
    second option is the actually-correct one; the scan was always a
    stopgap for a cold corpus, not the real detection strategy.

15. **CLOSED, NOT A BUG: SDSU's all-dash
    `VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE-HOT WATER REHEAT` table is
    genuinely dashed on the real printed page.** Last of the 4 remaining
    unverified scan hits from rule 14's sweep. Verified via the gold
    standard, not inference: pulled real page text straight out of
    `11_CA_SDSU_EngSciences_Complex_100SD__part03_p65-96.pdf` (global page
    81, local index 16) with `pdfplumber`, no OpenTakeoff pipeline
    involved at all. The real page shows ~40 `VAV-*` rows (`VAV-NB-1`,
    `VAV-N1-1`, `VAV-SB-1` ... `VAV-S3-12`) each with a real TAG, real
    SPACE SERVED, and one real airflow number (e.g. `VAV-N1-1` `MEETING`
    `1,740`) — but every single COOL MAX/MIN, HEAT MAX, coil PD, WPD,
    valve PORTS/CV, and WT column is a literal `-` on the page itself, for
    every row, with no exceptions. This is a 100% Schematic Design
    submittal (filename ends `_100SD`) — the reheat-coil sizing/selection
    columns are placeholders because that engineering hasn't happened yet
    at SD phase, not a table our extraction is failing to read. Confirms:
    no fix needed here, and — same as rule 14 — the shipped detector
    logic was never in question; this was purely a "does the real drawing
    actually have the data" question, now answered directly from the
    drawing. This closes the 4-set verification sweep from rule 14 (Ames
    Laboratory: clean; ITD District 2: clean; Vermillion County Jail: real
    gap in the scan net, not the detector, see rule 14; SDSU: clean,
    genuinely incomplete SD-phase drawing).

16. **OPEN, SCOPED, NOT STARTED, PRE-EXISTING (not caused by this
    session's own work): finish-kind row keys don't include a real
    mark drawn as several glyph-split, abutting text spans across
    multiple hyphens.** Found while verifying rule 12's fix (below), NOT
    part of that fix — confirmed via `git stash`/checkout against
    commit `ee554e8` (before any of this rule's own changes touched
    `sheetgraph.ts`) that this failure already existed. Real, already-
    written test: `opentakeoff/web/test/equiptags.test.ts`, "extractTable:
    finish-table row keys include joined multi-hyphen marks". Fixture:
    a real glyph-split pump tag drawn as three abutting spans
    (`"PCHWP"` w=25, `"-"` w=4 at a 1px gap, `"MT1"` w=15) and a
    4-hyphen abbreviation stack similarly split — real drafting shapes
    this project already has other, working glyph-fragment-joining
    logic for elsewhere (`fragmentedTagOcc` et al. in symbolsweep.ts).
    Expected: `extractTable(sheet, "finish")`'s row keys include the
    JOINED marks (`"PCHWP-MT1"`, `"CV-CHW-BP-T"`), with the unjoined
    fragments (`"PCHWP"`, `"CV"`) explicitly NOT keying a row. Actual:
    the joined keys never appear. Confirmed NOT a `CODE_RE` problem —
    `CODE_RE.test("PCHWP-MT1")` is `true` in isolation — the failure is
    upstream, in whatever combines (or fails to combine) the raw
    abutting spans into one cell string before `rowKeyOf` ever sees it.
    Root cause not traced (out of scope for this rule's own
    investigation — spawn_task timed out twice trying to queue this as
    a separate task, same tool-side issue GOAL.md rule 11 already
    recorded, written here instead so it isn't lost). Real next step:
    trace where a table's own key-column spans get joined across a tight
    gap (`bandDataRows`'s own cell-assembly path is the likely site,
    parallel to the SAME session's own `splitOverflowWords`/`addOne`
    logic already read this session) with a real debug trace against
    this exact fixture, not a guess.

17. **OPEN, SCOPED, PARTIALLY REVERTED (2026-09-03): a real 2-word
    big-font title gap exists on `013_MO_T2523_01`'s own "CONTROL
    VALVES" table, and a fix was tried, found to cause a real regression
    elsewhere on the SAME sheet, and reverted rather than shipped.**
    Found doing genuinely verified per-set work (this session's own real
    mandate, see above) — not a synthetic exercise: extracted this real
    set's own `graph.tables`, found two tables with `title: null` and a
    third whose "title" was literally a stray NOTES sentence ("DESIGN
    PRESSURE DROP IS MINIMUM ALLOWABLE PRESSURE DROP THROUGH CONTROL
    VALVE. ACTUAL PRESSURE DROP MAY VARY."). Rendered the real page:
    the genuine title is "CONTROL VALVES" — 2 words, no "SCHEDULE" word,
    but confirmed BIG FONT (25px vs the header row's own 12.5px, ratio
    2.0, clearing `findHeaderRow`'s own `BIG_FONT_RATIO2=1.6` gate) —
    the title-shape fallback's 3-word floor was the only thing rejecting
    it, and real HVAC titles this short are common (CONTROL VALVES,
    EXHAUST FANS, HEAT PUMPS, UNIT HEATERS).

    First fix: loosened ONLY the already-big-font-gated STAGE 1 branch's
    floor from 3 words to 2. Tested clean (105/105 `sheetgraph.test.ts`,
    309/309 broader suite) and landed. Then, following through on the
    REAL mandate ("verified until it seems redundant" — not stopping at
    green tests), rebuilt the actual set fresh
    (`identity: [set_id, "onDemandVerify"]`, real PDF, not a synthetic
    fixture) to confirm the fix against the real document. It DID fix
    the intended table — but it ALSO broke a different, unrelated
    "FLOW METER DEVICES" table on the SAME sheet: that table is real,
    also big-font (25px), and was ALREADY 3+ words — it should never
    have been touched by a 2-word loosening at all — yet one of its own
    extraction fragments had its own real, closer title STOLEN by the
    farther, wrong "CONTROL VALVES" instead. A confidently wrong title
    on real data is strictly worse than the honest gap this was meant to
    close, so the word-count floor was reverted to 3 (restoring the
    pre-fix, safe-but-incomplete behavior), the regression test rewritten
    to assert the CURRENT correct-but-incomplete behavior (`title: null`,
    not a guess), and 105/105 + 309/309 reconfirmed clean post-revert.

    Real, not-yet-pinned-down suspect: this exact sheet's own page
    content is independently confirmed doubled and PART-MIRRORED — a
    real authoring artifact, verified directly (not assumed): whole text
    blocks on this page read backwards character-by-character when
    extracted in the obvious reading order (e.g. "HHWR" comes back as
    "RWHH", and the standard engineering professional-seal disclaimer
    block is fully reversed), and multiple real strings ("CONTROL
    VALVES" itself, "GAS CONNECTED", "HVAC MATERIAL") each appear at 2-4
    distinct coordinate clusters on the same page. The likely real
    mechanism: one of "FLOW METER DEVICES"'s own extraction fragments is
    anchored to a duplicate/ghost copy of its header row, at a position
    whose title-hunt lookback window no longer reaches its own real,
    closer title — reaching the wrong, farther "CONTROL VALVES" instead,
    which stays in reach regardless. Not confirmed by a real debug trace
    yet (out of scope for this rule's own investigation) — a real next
    step, not a guess to build on.

    STILL OPEN. Real next step, in order: (1) get a real debug trace of
    exactly which row/anchor `extractTableAt` starts its title-hunt scan
    from for the "FLOW METER DEVICES" fragment that loses its title, to
    confirm or refute the duplicate-anchor hypothesis above; (2) only
    once that's confirmed, design a fix that explains WHY a valid,
    closer, already-qualifying 3-word candidate got skipped — not another
    loosening of the word-count floor, which is not what's actually
    broken. This document's own doubled/mirrored-content structure may
    be a narrow, low-generalization edge case (one firm's export
    convention) rather than a corpus-wide pattern — worth confirming
    against a second affected set before investing in a general fix,
    per this session's own "verified until redundant" standard, not
    generalizing from a sample of one.

    **UPDATE 2026-09-03: a SECOND real corpus set confirmed with the same
    doubled/mirrored-content pattern —
    004_MO_T2504_03_Interior_and_Exterior_Renovation.pdf#31.** Real word
    coordinates (pdfplumber): this page's real THERMOSTATIC MIXING VALVE
    SCHEDULE title sits at `THERMOSTATIC`/`MIXING` x≈447/571, y≈1683 —
    directly above its own real table (MARK header at x≈230, y≈1713.5).
    The SAME "THERMOSTATIC"/"MIXING" text ALSO appears duplicated at
    negative x-coordinates (x≈-967/-905, y≈1620-1632) — off the visible
    page entirely, the same "content exists twice at distinct coordinate
    clusters" signature as 013_MO_T2523_01. And a genuinely UNRELATED
    phrase, "DESIGN"/"CONSTRUCTION" (the drawing title-block's own agency
    name — "…MANAGEMENT, DESIGN AND CONSTRUCTION…" — normally a rotated
    sidebar block), lands at x≈1040/1147, y≈1693.2 — only 10px below the
    real title's own y, roughly 600-700px to its right. This is real,
    live-measured evidence that the title-hunt's real bug (`extractTable`
    picking up "DESIGN AND CONSTRUCTION" as this table's title instead of
    "THERMOSTATIC MIXING VALVE SCHEDULE") is caused by the SAME doubled-
    content mechanism as 013_MO_T2523_01's own CONTROL VALVES/FLOW METER
    DEVICES case: a stray, unrelated title-block phrase gets planted at
    almost the exact same y as the real table's own title, close enough
    in the title-hunt's own lookback window to out-compete it. Both
    confirmed sets so far are Missouri "MO_T"-prefixed state projects
    (013 = MO_T2523, 004 = MO_T2504) — narrows the earlier "one firm's
    export convention" guess to "shared across at least Missouri state-
    agency CAD/plot toolchain projects," not proven corpus-wide but no
    longer a sample of one either. STILL NOT FIXED — this update is
    confirmation evidence for rule 17's own stated prerequisite, not a
    fix; the real next step (a debug trace of the title-hunt's own scan
    start point and lookback window, per rule 17's original text above)
    is still the right next move before attempting anything.

18. **028_TX_Renovation_of_Building_615: real "&" header-connector bug
    fixed (kept, general improvement) — but it does NOT fully recover
    this set's own NOISE CONTROL DUCT SILENCER SCHEDULE. The real
    blocker there is a deeper, confirmed, still-open 2-up table-merging
    issue in the structural (vocabulary-free) reference-kind reader.**

    Found doing genuinely verified per-set work on 028_TX's real page 1.
    `graph.tables` was missing this sheet's own real NOISE CONTROL DUCT
    SILENCER SCHEDULE entirely (7 tables extracted, silencer schedule not
    among them, zero disclosure/note).

    Fix #1 (real, tested, KEPT): `isGenericHeaderRow`/
    `isGenericHeaderToken` (the structural reference-kind reader, used
    when a table has no VOCABULARY match) required every header token to
    contain ≥1 letter A-Z. A bare "&" token (e.g. a header phrase like
    "LOCATION & SERVES" or "SYSTEM & TYPE" split into 3 separate spans by
    the extractor) has no letter, so it failed the check and silently
    killed the WHOLE header row — and with it, the whole table. Fixed
    narrowly in `isGenericHeaderToken`: `if (s === "&") return true;` as
    the first check. Regression test added (`sheetgraph.test.ts`, reuses
    the proven bessemer `REF_TABLE_SPANS` fixture with "SYSTEM TYPE" split
    into "SYSTEM"/"&"/"TYPE" to isolate the "&" token as the only
    variable). 106/106 `sheetgraph.test.ts` + 310/310 broader suite clean.
    This is a real, general correctness improvement — kept regardless of
    what follows below.

    Rebuilt the real 028_TX set fresh after landing the fix
    (`identity: [set_id, "onDemandVerify"]`) to confirm against the real
    document, per this session's own "don't trust green tests alone"
    standard. Result: **unchanged** — same 7 tables, silencer schedule
    still missing. So the "&" bug, while real, was not this set's actual
    blocker.

    Debug-traced the real extraction directly against 028_TX's own page 1
    (temporary `DEBUG_REF2` instrumentation around `isGenericHeaderRow`,
    fully reverted after use, confirmed via `git diff` + a clean 106/106
    rerun). Found the real cause:

    - pdf.js (the actual pipeline's own text extraction) merges
      "LOCATION & SERVES" into ONE combined span — unlike pdfplumber
      (used for my own ground-truth verification reads), which splits it
      into 3 separate word tokens. So on the real document, the "&" was
      never actually a standalone token in the first place — a useful
      methodology caveat: pdfplumber-based verification can show a
      different token shape than what the real pipeline sees.
    - The real NOISE CONTROL DUCT SILENCER SCHEDULE and a second,
      unrelated EXTERNAL STATIC PRESSURE SCHEDULE sit side-by-side on the
      same sheet, sharing the same row-cluster y-band. The header-row /
      block-detection step in `extractReferenceTableAt` merges BOTH
      tables' header rows into a single candidate block, because they
      cluster on the same y-band regardless of x-position.
    - The `alreadyVocab`/`blockHasCatalogAnchor` guard (skips a candidate
      block if it looks like it belongs to a VOCABULARY-driven table
      instead of the vocab-free structural reader) then checks vocabulary
      across the WHOLE merged block, not scoped to either table's own
      x-range. The ESP schedule's own portion legitimately has a MARK
      catalog-anchor and qualifies under EQUIPMENT_HEADERS — so the guard
      fires for the ENTIRE merged block, causing the reference-kind pass
      to skip BOTH tables. The silencer schedule has no vocabulary
      representation of its own, so it is dropped with zero disclosure.

    STILL OPEN — no fix attempted yet. Real next step: scope
    `alreadyVocab`'s vocabulary check to each table's own relevant
    x-range within the merged block (or investigate why `bandedSheets`
    doesn't already split this sheet into separate column-bands before
    block detection reaches this point) — not a workaround, an actual fix
    to the block-merging logic itself. Deferred rather than force-fixed
    this tick, per this session's own "don't sink unlimited time in one
    outlier, keep the per-set loop moving" discipline — revisit if a
    second corpus set shows the same 2-up side-by-side-schedule shape.

19. **FIXED 2026-09-03: 001_NC_FY20_P_228_ATC_Tower_and_Air_Operations's own
    VARIABLE AIR VOLUME TERMINAL BOX (25 real rows, sheet #46) had a garbled,
    duplicate "reference"-kind ghost sitting right alongside it in
    `graph.tables`, unlabeled and undisclosed.**

    Found doing genuinely verified per-set work (first set picked up under
    the real mandate's own per-set loop, tracked in the new
    `VERIFICATION_LEDGER.md`). `graph.tables` carried a
    `[reference] "(no title)" — 25 rows` entry alongside the real, correctly
    titled `[equipment] "VARIABLE AIR VOLUME TERMINAL BOX" — 25 rows` on the
    SAME sheet — same real row count, headers a garbled fragment of a real
    GENERAL NOTES sentence ("ABBREVIATIONS AND NOTES.") glued onto real
    column captions ("DESIGN OA", "FAN AIRFLOW", …), rows keyed by stray
    numeric fragments instead of real VAV marks. Confirmed against the real
    page (pdfplumber render): only ONE real VAV table exists there — this
    was a genuine duplicate extraction of the same physical table, not a
    second real table.

    Root cause, confirmed via `region` dumps of both fragments: a
    "reference"-kind (vocabulary-free structural) scan independently
    re-read the SAME physical table region, picking up a nearby GENERAL
    NOTES span as a phantom rightmost header column — which pulled its own
    bbox's right edge 412px past the real, correctly-extracted equipment
    table's own right edge. The existing region-containment dedup pass
    (pass 1c in `buildSheetGraph`, itself added for an earlier real
    duplicate-extraction bug) only collapses a "reference" fragment whose
    region is ≥98% contained within an already-kept real table's own — this
    one measured only 86.6% contained, so it survived untouched.

    Fix: an ADDITIONAL, narrowly-scoped signal in the same dedup pass — a
    "reference" fragment with an EXACT row-count match to a same-sheet
    non-reference claimer, combined with a lower (70%, not 98%) containment
    bar, is also collapsed. Two genuinely independent real tables sharing
    both an exact row count AND 70%+ of their own bbox area on one sheet is
    not a coincidence a real MEP sheet produces; row count is a signal the
    existing 98%-bar check has no access to. Scoped to `rows.length > 0` so
    it never fires on two unrelated 0-row tables.

    Verified against the real document (not just green tests): rebuilt
    001_NC_FY20_P_228_ATC_Tower_and_Air_Operations fresh before and after
    the fix — diffed the full 84-table list, and exactly one line changed:
    the garbled `(no title)` duplicate is gone, nothing else on any other
    sheet moved. 106/106 `sheetgraph.test.ts` clean, no regression.

    A from-scratch synthetic unit fixture for this exact interaction was
    attempted and abandoned after several tries: constructing two
    independently-extracting fragments (one equipment-kind, one
    reference-kind) that overlap by a controlled 70-98% turned out to
    fight the pipeline's own (correct) safeguards — a "reference" scan
    naturally refuses to fire at all over a region a vocabulary pass
    already claims cleanly (`alreadyVocab`), and a synthetic equipment
    table with few, widely-spaced anchors sweeps ANY nearby span into its
    own row scan as "unmodeled column bleed" rather than leaving it for a
    separate reference read to find — both real, existing, working
    behaviors this test would have needed to defeat non-representatively.
    Regression protection for this fix rests on the real-corpus before/after
    diff above (exact, minimal, confirmed) plus the full existing suite
    (106/106, unchanged) — not a synthetic fixture. Still open: the SAME
    sheet's own "VIBRATION ISOLATION SCHEDULE" (0-row phantom with
    unrelated ESP/MARK/TYPE/NOTES headers, sitting beside the correct
    11-row extraction) is a DIFFERENT real bug on this same sheet, not
    covered by this fix (0-row fragments are deliberately excluded from
    the new check). Root-caused (not yet fixed): confirmed via the real
    page's own word coordinates that "ESP" comes from a totally unrelated
    footnote 1400+ px to the LEFT — DEDICATED OUTDOOR AIR UNIT SCHEDULE's
    own note "4. ESP INCLUDES 0.5 IN WG FOR MERV 8 & 0.7 IN WG FOR MERV 13
    LOADING." — which happens to sit in the SAME y-band as the real
    VIBRATION ISOLATION SCHEDULE's own header row (both ~y=1013-1032 on
    the real page, in different page columns). The structural reference
    reader's header-row scan is not bounded to a plausible column width —
    it swept the ENTIRE page width at that y, mixed the stray "ESP" token
    with a SUBSET of the real header ("MARK"/"TYPE"/"NOTES", dropping
    "BASE"/"ISOLATOR"/"MINIMUM"/"DEFLECTION"), and produced a garbled,
    0-row phantom. Lower severity than the fix above (no real data is
    duplicated, since it has 0 rows) — pure noise in `graph.tables`, not a
    quantity-accuracy risk. Deferred to a future pass on this same set,
    per this session's "don't sink unlimited time in one outlier" — real
    next step: bound the structural header-row scan's own width to
    something tied to the candidate block's real column count/spacing,
    not the full page.

20. **OPEN, SCOPED, NOT STARTED: 004_MO_T2504_03's own real GAS WATER
    HEATER SCHEDULE loses 4 real columns entirely and shows a WRONG value
    in a real REMARKS cell — genuine data corruption, not just a cosmetic
    header issue.**

    Found doing genuinely verified per-set work, second set picked up
    this session (`VERIFICATION_LEDGER.md`). Real page 31 ground truth
    (pdfplumber): `MARK MANUFACTURER MODEL TANK VOLUME HEAT SOURCE MBH
    [ELECTRICAL: VOLTAGE, PHASE, FREQ] REMARKS` — real row `GWH-1
    LOCHINVAR AWN286PM ST-1 GAS 285 120 1 60 ALL`. Extracted:
    `headers: ["MARK","MANUFACTURER","MODEL","GAS WATER HEATER SCHEDULE
    MBH","REMARKS"]`, row cells `MODEL="AWN286PM"`, `MBH="285"`,
    `REMARKS="60"`. TANK VOLUME ("ST-1"), HEAT SOURCE ("GAS"), and the
    whole ELECTRICAL group (VOLTAGE "120", PHASE "1") are silently
    dropped — no column, no note, no disclosure — and REMARKS shows "60"
    (the real FREQ value) instead of the real REMARKS value "ALL": a
    genuinely WRONG value in a real, populated cell, not just a missing
    one. VOLTAGE and PHASE ARE in `EQUIPMENT_HEADERS` (unlike TANK VOLUME/
    HEAT SOURCE, which have no vocabulary representation at all) — so
    their own real un-recognized-parent ("ELECTRICAL") likely defeats
    anchor recognition here the same way ROOFTOP UNIT SCHEDULE on the
    SAME sheet correctly keeps its own "ELECTRICAL PHASE"/"ELECTRICAL
    MCA" parent — worth comparing the two tables' real column density/
    gap ratios directly (same shape as the already-fixed BYPASS CONTROL
    VALVE anchorRadii bug, rule in this file's own earlier history) before
    assuming a new root cause. The `"GAS WATER HEATER SCHEDULE MBH"`
    header (title text glued onto a real leaf column) is very likely the
    SAME parent-mislabeling family as rule 12's already-fixed
    `parentLabelOver`/`parentPhraseOver` bug, or a fresh variant of it
    where the table's own TITLE (not a neighbouring vocabulary word) gets
    picked as the wrong "parent" for an ambiguous/duplicate leaf — this
    set's own ROOFTOP UNIT SCHEDULE shows the identical shape
    (`"ROOFTOP UNIT SCHEDULE EAT"`/`"ROOFTOP UNIT SCHEDULE LAT"`, both
    real COOLING-tier EAT/LAT columns, while the real HEATING-tier
    EAT/LAT correctly keep "HEATING" as their own parent) — six of this
    one set's fourteen tables show some version of this pattern
    (WATER SOFTENER — clean; GAS WATER HEATER, GREASE INTERCEPTOR,
    NATURAL GAS UNIT HEATER, AIR DEVICE, ROOFTOP UNIT — all affected),
    so this is a real, systemic, high-value target, not a one-off. NOT
    STARTED: needs its own debug trace of `findHeaderRow`'s own duplicate-
    column disambiguation path against this real table before attempting
    a fix — the CONTROL VALVES precedent (rule 17) is the standing
    reminder that title-hunt/header-parent fixes are easy to get subtly
    wrong without one.

21. **OPEN, SCOPED, ATTEMPTED AND REVERTED (2026-09-03): a real, LOW-
    priority (non-HVAC) door-schedule bug —
    006_US_U2607_01_Interior_Renovations_C_Wing_Updates.pdf#17 merges TWO
    genuinely separate real door schedules into one `graph.tables` entry,
    and the second one's own repeated header row survives as a phantom
    row literally keyed "MARK".**

    Found doing genuinely verified per-set work, third set picked up this
    session. Real page ground truth (pdfplumber): the sheet draws "AREA
    1C16L DOOR SCHEDULE" (6 real doors, C105.1-C112) directly above "AREA
    1C16H DOOR SCHEDULE EXISTING WOOD FRAMED PARTITION" (its own real
    doors, C113 onward) — TWO real, differently-titled tables. This whole
    document has NO real HVAC/mechanical schedules at all (confirmed by
    scanning every page for "SCHEDULE" — only door/plumbing/architectural
    content), so this is real but lower-priority for this platform's
    actual HVAC/BAS takeoff scope than the equipment/reference bugs above.

    Extraction produces ONE combined `[finish] "(no title)"` table, 19
    rows, with the second schedule's own repeated header row surviving
    as a phantom row (`{"MARK":"MARK","WIDTH":"WIDTH",...}`) spliced
    between the two real groups — a real door literally tagged "MARK" is
    never real data.

    A fix was attempted: filter any row whose key exactly matches one of
    the table's own header labels, added at `extractTableAt`'s own final
    table-construction site. Tested against a synthetic fixture (didn't
    reproduce the real termination behavior — the row scan stopped
    early in the minimal fixture regardless of spacing, unlike the real
    document) and against the real document (rebuilt fresh, confirmed via
    debug instrumentation that the filter's own `headerLabelSet` DID
    contain "MARK" — but the phantom row survived anyway, meaning the
    row is not produced at the construction site the fix targeted;
    `extractAllTables`'s own multi-call structure — the primary
    `extractTableAt` scan, plus `extractSideTables`, both of which
    ultimately call `extractTableAt` and so should be covered — did not
    explain it either within the time spent). Rather than ship a fix
    that measurably does not change the real document's own output,
    reverted both the code change and its regression test cleanly
    (`git checkout HEAD --`), confirmed 106/106 clean afterward. NOT
    FIXED. Real next step: a proper debug trace (not assumption) of
    which extraction/merge pass actually produces this specific
    combined 19-row table, before attempting another fix — deferred as
    lower-priority given this document's own real scope is entirely
    outside HVAC/BAS.

    **CONFIRMED AGAIN, independently, 2026-09-03:**
    014_MT_USDA_Forest_Service_Missoula_Fire_Sciences.pdf#4's own real
    hot-water-unit-heater weight/area-served table (`(no title)`, 9 rows)
    carries the exact same shape — a literal `{"MARK":"MARK","MANF.":
    "THERMAL"}` phantom row bleeding through mid-table, plus two more
    stray note-fragment phantom rows (`"NOTES:"`/`"CONTROLS:"`). This is
    a genuinely SEPARATE HVAC-scope document (unlike 006's own door
    schedule, entirely outside this platform's real focus) — real
    evidence this bug is not narrow to one low-priority set, and worth
    real priority on a future pass, not further deferral once picked up
    again.

22. **OPEN, SCOPED, NOT STARTED, HIGH SEVERITY: `ROW_KEY_RE`'s digit-first
    requirement drops 11 of 12 real rooms (92% real row loss) from
    008_MO_T2331_01_Repair_to_Interior_Exterior_Unheated's own real
    ROOM FINISH SCHEDULE — every room in this real building is
    letter-keyed ("A" through "K"), not numbered.**

    Found doing genuinely verified per-set work, fourth set picked up
    this session. Real page 16 ground truth (pdfplumber): the real ROOM
    FINISH SCHEDULE lists room `101` (an access hallway) plus rooms `A`
    through `K` (11 real "STORAGE SPACE" rooms in this metal building,
    room `I` marked "NOT USED" with real dashed cells — still a real,
    disclosed row, not a gap) — 12 real rows total, real headers NUMBER/
    NAME/FLOOR/BASE/WALLS(N/S/E/W)/CEIL/NOTES all populated for every
    one of them. Extraction: `graph.tables` carries exactly ONE row
    (`101`) for this table — the other 11 are silently gone, no
    disclosure.

    Root cause, confirmed by reading `rowKeyOf`'s own room-finish branch:
    `ROW_KEY_RE = /^\d{1,3}[A-Z]{0,2}$/` requires a LEADING DIGIT (1-3
    digits, optional 0-2 trailing letters) — the mirror-image shape of
    rule 12's original bug (`CODE_RE`'s letter-first requirement
    rejecting digit-prefixed equipment marks). `QUALIFIED_KEY_RE =
    /^([A-Z]{1,2})-(\d{1,3}[A-Z]{0,2})$/` (the room-finish branch's own
    existing letter-BUILDING-before-digit-ROOM fallback) also requires a
    trailing digit after its dash. Neither pattern has any path for a
    bare letter-only room key ("A", "B", …, "K") — real, common in
    simple/small buildings (this one has no numbered rooms in its
    "STORAGE SPACE" wing at all), and this real gap is a genuine data-
    loss bug, not a cosmetic one: 92% of a real room finish schedule's
    own rows vanish with zero disclosure.

    NOT STARTED. Real next step, matching rule 12's own established
    discipline (never accept an unconfirmed shape without a
    corroborating signal, not a blanket loosening): a bare letter-only
    key is a much weaker signal on its own than a digit-prefixed one
    (far more likely to collide with a stray single-letter callout
    elsewhere on a sheet) — a naive `ROW_KEY_RE` loosening to accept any
    `[A-Z]{1,2}` risks real false positives on OTHER real room-finish
    tables that this session has not yet audited. Needs its own
    corroborating signal before shipping (e.g., scoped to rows already
    inside an already-qualified room-finish table's own confirmed row
    band with full column coverage — NAME/FLOOR/BASE/WALLS/CEIL all
    populated — rather than loosening the bare regex globally), and a
    regression test proving existing digit-numbered room-finish tables
    are unaffected before landing.

23. **OPEN, SCOPED, NOT STARTED, HIGH SEVERITY: an equipment table's own
    row-scan absorbs an ADJACENT, unrelated equipment table's own marks
    as fake extra rows once its own real rows run out —
    009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#18's own
    real AIR COOLED CHILLER SCHEDULE (1 real chiller) reports 5 rows,
    4 of them fabricated from the neighbouring FAN SCHEDULE's own real
    EF-1/EF-2/EF-3/EF-5 marks.**

    Found doing genuinely verified per-set work, fifth set picked up
    this session. Real page 18 ground truth (pdfplumber): `CH-1` (the
    real, only chiller) sits at x≈886, y≈644 — the CHILLER SCHEDULE's own
    real single row. `EF-1` through `EF-6` (the FAN SCHEDULE's own real
    marks) sit at a COMPLETELY DIFFERENT x≈1687, y≈698-778 — a separate
    table's own column, not this one's. Extraction: `graph.tables`
    carries `[equipment] "AIR COOLED CHILLER SCHEDULE"` with 5 rows —
    `CH-1` (real, populated) plus `EF-1`/`EF-2`/`EF-3` (empty `{}` cells,
    pure garbage) and `EF-5` (its own NOTES cell holds stray prose from a
    totally different note). A takeoff built on this counts 5 chillers
    where there is genuinely 1 — a severe, silent quantity-accuracy
    failure, not a cosmetic one.

    Root cause (not yet confirmed via a debug trace, inferred from the
    real coordinate evidence above): the chiller table's own row-scan
    does not stop once its own real rows are exhausted — it continues
    scanning DOWNWARD in y for more `CODE_RE`-shaped candidate key
    tokens, and a neighbouring, unrelated table's own real marks
    (`EF-1`, etc., which independently satisfy `CODE_RE`'s own generic
    equipment-tag shape) get accepted as additional rows of THIS table
    even though they sit at a wildly different x — nowhere near this
    table's own established MARK-anchor x. This looks like the KEY
    column has no equivalent of the DATA columns' own `anchorRadii`
    "anomalously wide gap" refusal (the real, already-shipped guard the
    BYPASS CONTROL VALVE SCHEDULE fix relies on) — that guard protects
    non-key columns from bleeding in un-modeled data, but apparently
    nothing bounds how far in x (or how far past the table's own real
    row extent) a NEW row's own key token is allowed to be found.

    NOT STARTED. Real next step: a debug trace of the row-scan's own
    termination/continuation logic (where a candidate row is accepted or
    the scan stops) to confirm this hypothesis before designing a fix —
    likely a distance-from-established-anchor bound on the KEY column
    itself, mirroring `anchorRadii`'s existing DATA-column guard. High
    value: this shape (two equipment schedules stacked/adjacent on one
    dense sheet, one shorter than the other) is a common real MEP-sheet
    layout, not a one-off — worth confirming against a second affected
    set once root-caused, same discipline as rules 17/18's own
    "don't generalize from one" standard.

24. **OPEN, SCOPED, NOT STARTED: two real, distinct bugs on
    011_IL_VA_Hines_Finance_Center_Renovation — a FALSE-POSITIVE
    fabricated "ROOM FINISH SCHEDULE" (a 1-row garbage table on a page
    that only references an external sheet this PDF export never
    included), and a phantom column on the real "EXISTING HEAT PUMP
    SCHEDULE" from a per-row repeated unit suffix.**

    Found doing genuinely verified per-set work, sixth set picked up
    this session.

    (a) `graph.tables` carries `[room-finish] "ROOM FINISH SCHEDULE"`
    with 1 nonsensical row (`key: "7"`, cells `{"NORTH":"7"}`) and an
    enormous ~3900px-tall region on sheet #8. Real page ground truth
    (pdfplumber): sheet #8 (and sheet #10) are architectural finish-
    LEGEND/floor-plan pages that each contain the sentence "REFERENCE
    SHEET AE-102 FOR ROOM FINISH SCHEDULE" — the real, tabular room
    finish schedule lives on sheet AE-102, which this corpus PDF simply
    does not include (a partial/MEP-focused export). There is no real
    table to find on either page — the extraction fabricated one from
    stray `ROOM_HEADERS`-vocabulary words (BASE/NORTH/EAST/SOUTH/WEST)
    scattered across the floor-plan graphic's own legend text, not a
    real header row. A false positive is a different, arguably worse
    failure mode than the row-loss bugs elsewhere in this file: it
    reports data that does not exist, rather than honestly showing
    nothing.

    (b) `[equipment] "EXISTING HEAT PUMP SCHEDULE"` (15 real rows,
    otherwise correctly keyed and populated) carries a genuine data
    column "AIRFLOW" (values like `"205 CFM"`, unit suffix included)
    directly followed by a SEPARATE, phantom "CFM" header holding small
    unrelated values (`"50"`, `"35"`, …) — real page coordinates confirm
    the word "CFM" is printed as a per-row UNIT SUFFIX directly under
    "AIRFLOW" at nearly the same x, repeated on every single data row
    (not a real second header), which got mistaken for its own column.
    The real column those small values (50/35/35/30/25…) actually belong
    to (likely FLA or MCA, not present in the extracted headers at all)
    is not yet identified.

    NOT STARTED. (a) is likely fixable narrowly — a candidate room-
    finish "table" whose own header-vocab hits are all scattered,
    non-adjacent single tokens with no real ruled/boxed structure near
    them should be held to a stricter bar before being emitted at all
    (this file's own comment history already applies a similar
    "reference never wins on ambiguous structural signal" principle
    elsewhere — worth reusing, not reinventing). (b) needs a debug trace
    of the real header-row token positions around "AIRFLOW"/"CFM" to
    confirm the per-row-unit-suffix hypothesis before designing a fix
    (e.g., treat a header token identical to a value seen printed
    beneath EVERY data row as a unit suffix, not a new column).

25. **OPEN, SCOPED, NOT STARTED, LOW SEVERITY: real NOTES-list text
    bleeds into MARK/TYPE/CFM cells on
    015_VA_P_095_Replace_Submarine_Pier_3_Utility's own real
    "GATEHOUSE MINI-SPLIT SYSTEM HEAT PUMP SCHEDULE" (mark DSS-4).**

    Found doing genuinely verified per-set work — otherwise this is one
    of the cleanest sets checked this session: 32 tables, every one
    correctly titled, no phantom rows, no 0-row entries. The single real
    exception: DSS-4's own row shows `MARK: "DSS-4 1. 2. 3. 4. 5."`,
    `TYPE: "WALL-MOUNTED GUARD BOOTH"`, `CFM: "370 PROVIDE POWER AND
    CONTROL WIRING FROM OUTDOOR UNIT TO INDOOR UNIT"` — the table's own
    numbered NOTES list underneath bled into 3 different cells. The
    SAME real table shape, correctly extracted for the main-building
    units (DSS-1/DSS-2/DSS-3, same sheet-family, real clean `NOTES:
    "1,2,3,4"` cells with no bleed), suggests this smaller "GATEHOUSE"
    variant table is missing some of the real columns the main version
    has (fewer real vocabulary anchors recognized), so the un-modeled
    NOTES text has nowhere safe to land and spills into whatever
    anchors DO exist — the same general "un-modeled column" bleed
    family `anchorRadii` already guards against elsewhere, evidently not
    covering this specific shape. Low severity (a single row, cosmetic
    corruption rather than a missing/fabricated quantity), documented
    for completeness rather than urgency. NOT STARTED.

26. **OPEN, SCOPED, NOT STARTED, LIKELY CORPUS-WIDE: the drawing's own
    title-block/approval-stamp area (present on essentially every real
    sheet) gets misread as a real data table by the structural
    (vocabulary-free) reference reader — confirmed 3 times across 2
    sheets on 016_NY_Alter_Repair_Building_1624_Irish_Hill_Test alone,
    and directly reinforces rule 24(a)'s independent finding on a
    different set.**

    Found doing genuinely verified per-set work.
    `graph.tables` carries `[reference] "Rome Research Site"` (2 rows,
    sheet #4) — "Rome Research Site" is the drawing's own PROJECT
    LOCATION name from its title block, not a real schedule title; its
    "rows" are really `DRAWING NO:`/`SHEET:`/`FACILITY NO:`/`DATE:`
    label:value pairs from the same title block, boxed the way a real
    ruled table is. A SECOND, `(no title)` fabricated table (2 rows,
    also sheet #4) reads the title block's own approval-routing stamp
    (`RIOCC:`/`RIOCO:`/`RIOCV:`/`DATE`, real Air Force base-level review
    codes, not project data) — and this EXACT same fabricated shape
    recurs VERBATIM on sheet #19 (the title block is drawn identically
    on every sheet of a real drawing set, so this false positive fires
    once per sheet, not once per document).

    Root cause hypothesis (not yet confirmed via debug trace): the
    structural reference reader gates on a boxed/ruled-line region with
    label:value-shaped rows — a title block satisfies both, purely
    structurally, with no real signal distinguishing "administrative
    metadata repeated on every sheet" from "a real schedule." Given a
    title block is close to universal on real AEC drawing sheets, this
    is very likely a corpus-wide source of false-positive "tables" (not
    a data-loss risk, but real noise a downstream consumer or estimator
    has to filter out by hand). NOT STARTED. Real next step: a debug
    trace of what structural signal fires for a title block region,
    then a refusal condition scoped to that signal (e.g., a candidate
    block sitting inside the sheet's own drawing-border/stamp region, or
    whose "rows" are single label:value pairs with no repeated real
    column structure across rows) — cross-reference with rule 24(a) once
    a fix is designed, since both are the same underlying false-positive
    class.

27. **HIGH-VALUE SYNTHESIS: rules 21, 23, and this new NOTES-caption
    finding are very likely THE SAME missing guard — `bandDataRows`'s
    own main row-scan has no distance-bounded stopping condition, so it
    keeps accepting anything `CODE_RE`-shaped anywhere below/near a
    table's real rows, regardless of how far away or how unrelated.**

    New finding (017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling.pdf,
    THREE separate tables — the heating coil table on #12, and two more
    on #13): each real table's own trailing "NOTES:" section caption
    gets swept in as a phantom LAST row, with `"NOTES:"` as literally
    every single column's value. Root cause, read directly in
    `bandDataRows`'s own main loop (`sheetgraph.ts`, the `for (let i =
    Math.max(cfg.fromIdx, 0); i < toIdx; i++)` loop): `rowKeyOf`'s
    `CODE_RE` first alternative (`[A-Z]{1,4}[A-Z0-9]{0,4}`) accepts
    "NOTES" (4 letters + 1 more) as a plausible equipment/finish code —
    the same over-permissive shape rule 12 already had to special-case
    once (digit-prefixed marks) — so a trailing caption reads as a valid
    new row's own key, and the loop has no independent check for "this
    candidate sits implausibly far past the table's own last real row"
    before accepting it.

    This is the SAME missing guard as rule 23 (the chiller schedule
    absorbing a neighbouring fan schedule's own marks — no x/y distance
    bound on what counts as "still this table") and very likely rule 21
    too (a repeated header row surviving as data — same "the scan never
    independently decides it has reached the real end of the table"
    gap). A single real fix — bound `bandDataRows`'s own row acceptance
    to a real distance from the table's own established row pitch/
    extent (not just "is this text CODE_RE-shaped"), mirroring the
    already-shipped `anchorRadii` DATA-column distance guard but applied
    to the ROW dimension instead of the column dimension — is a strong
    candidate to close three independently-found real bugs at once, not
    three separate patches. NOT STARTED, but this is now the single
    highest-priority architectural target from this session's own
    per-set verification work: a debug trace of `bandDataRows`'s own
    loop against ANY of the three real reproductions above (this one is
    the cleanest — a single, easily-isolated caption token) is the right
    starting point, before touching rules 21 or 23 individually.

## Current execution policy (supersedes older worker references below)

As explicitly directed on 2026-08-29 and reaffirmed 2026-09-02, this goal is
**coordinator-only — no subagents**. Do not dispatch worker agents, cloud
workers, or Cursor `Task` subagents (`explore`, `debug`, `computerUse`, etc.).
The coordinator implements, tests, profiles, and verifies changes directly in
this Cloud VM. Any worker that was already running when this policy was recorded
is not part of the critical path, and its output must not be integrated. This
policy supersedes the historical coordinator/worker descriptions retained later
in this file.

### Batch `out/*.takeoff.json` emit (116 compile keys) — prewarm-first

Bulk emit must **not** cold-build `graphForPipeline()` inline per set (that
path alone can stretch to many hours with restarts and no warm cache). Use this
order on the coordinator VM only:

1. **Prewarm** — four parallel shards, sidecar off:
   `OPENTAKEOFF_TABLE_SIDECAR=0 npm run prewarm:corpus:shard{0,1,2,3}` from
   `opentakeoff/` (cwd `mcp/` for `node --import tsx`). Finishes the
   content-addressed sheet-graph cache once per PDF.
2. **Emit** — four parallel shards, `--resume`, sidecar off:
   `npm run emit:corpus:shard{0,1,2,3}`. With warm cache this is seconds per
   set; writes `opentakeoff/out/<set_id>.takeoff.json`.
3. **Gap pass** — targeted compile-zero valve/BAS sets only:
   `npm run emit:gap` (`OPENTAKEOFF_TABLE_SIDECAR=1`, cache bust where needed
   for L2.5 pillar-gap recovery).

Do not interleave prewarm and emit on the same sets without `--resume`, and do
not restart workers mid-build (cache writes only after a full graph completes).
After all 116 files exist, run `npm run eval:corpus` for the scoreboard.

The user accepted the verified approximately 80-second forced-cold corpus
runtime on 2026-08-29; evaluator speed is no longer the priority. Proceed
directly to general multi-view deduplication and then the highest-impact
remaining deterministic accuracy gaps, driving every applicable metric toward
100%. Never trade accuracy or regression sensitivity for speed. Honest refusal on
structurally unextractable inputs remains correct behavior rather than a score
to manipulate. **OCR, raster vision, local VLM/AI, and learned symbol detection
are IN SCOPE** on the shared vector pipeline when they genuinely improve recall
or close gaps vector geometry alone cannot — always disclosed, always corroborated
against schedule/plan evidence when possible. Prefer vector text when present;
never hallucinate quantities without cites.

**Evaluation cadence:** do not run a corpus evaluation after every individual
fix. Work in batches of approximately five highest-impact, non-overlapping
accuracy fixes, using focused unit tests and typechecks while implementing,
then run one full corpus evaluation to measure the combined batch and detect
cross-set regressions. If a focused test exposes a defect before the batch is
complete, fix it immediately; the full scorer remains the batch-level gate.
After every evaluation—focused set or full corpus—report the measured result
to the user immediately. Full-corpus reports must always include all three
current metrics (takeoff, reference, and graph), never only the metric changed.

This file is the durable, single source of truth for "where are we and
why" on this effort — write here, not just in chat, so a fresh session
(or a fresh person) can pick this up without re-deriving it.

---

## 1. What the goal actually is (not just "100%")

**The corpus work is a proving ground, not the end product.** The real,
ultimate goal is: **a geometry-first vector takeoff pipeline that can answer real
HVAC/BAS (mechanical + building-automation-system) takeoff questions
against *any* real project's PDF drawing set** — "how many VAV boxes are
on this job," "what's the GPM on pump P-3," "is this control valve keyed
to a real device or is it a cross-reference row" — the same way a human
estimator would, by reading schedules and tracing tags to drawn symbols,
with **deterministic vector extraction as the core** and **OCR / raster /
local AI / VLM assist when that core alone cannot reach the answer.**
Every scored quantity must remain cite-backed and reproducible; assist layers
are disclosed in pipeline notes and corroborated against schedules/plans
whenever possible.

The **corpus** (`/Users/erikjohnstone/Desktop/MASTER PLAN/opentakeoff-corpus`,
outside git on purpose — see §5) is how we prove the pipeline actually
works, instead of just believing it does. It holds real, public HVAC/BAS
drawing sets (never Siemens-supplied, never fabricated) plus hand-verified
answer keys, and getting every set in it to 100% on all three scored
metrics is the concrete, falsifiable stand-in for "the pipeline is
actually good at this job," not a vanity number.

**"100% on the corpus" specifically means, per set, on all three metrics
in §2, simultaneously — a set that's 100% on takeoff but only 60% on
reference isn't done. It also requires the actual demo workflow to be
production-ready: an agent can ask for information from any extractable table
or request a trade/equipment takeoff (for example, "do a butterfly valve
takeoff") and receive deterministic quantities, locations, source cells, and
citations through the production API. A scorer that reaches 100% while an
unkeyed table or real workflow remains inaccessible is not complete. And even
100% on the corpus is a proxy, not the
actual finish line — the actual finish line is the pipeline holding up
against a *new* real set it's never seen, which is exactly why every fix
in this project is required to be general (see §4) rather than tuned to
whatever's currently in the corpus.

---

## 2. The three metrics, precisely

Every set is scored three separate, structurally different ways — kept
deliberately unblended (a set can be excellent on one and weak on another,
and hiding that behind one composite number would be exactly the kind of
self-flattering measurement this project explicitly refuses to do).

### 2.1 `takeoff-eval.mjs` — tag/quantity exact-match
For every real equipment tag a human-authored key says exists (e.g. "VAV-14,
expected quantity 1"), does the pipeline's own `buildPlanSetTakeoff` →
`sweep_schedule_row` chain find the *same* tag with the *same* quantity by
actually tracing it from its schedule row to its drawn symbol(s) on a plan
sheet? Scored as: exact matches / total tags, plus separately-tracked
Σ|Δqty| (how far off the misses are), MISSING (tag never even attempted —
its table was never found/classified), and FALSELY ADDED (pipeline invented
or double-counted a tag the key never mentions — always investigated as
either a real key gap or a real pipeline bug, never assumed).

### 2.2 `reference-eval.mjs` — structural reference-table cell exact-match
For a table that carries no per-instance drawn tag at all (a POINTS LIST,
a connection/calculation schedule, a BAS/DDC points table) — the
`kind: "reference"` path — does the pipeline capture every real
(row, column) cell correctly, verbatim? This is the metric that
specifically covers the **BAS half** of "HVAC/BAS": alarm/trend flags,
DDC point lists, sequences — content a pure equipment-tag takeoff would
never touch.

### 2.3 `graph-eval.mjs` — cell/tag recall + row-to-symbol (rowsym) recall
Two things bundled in one script: (a) room-finish cell/tag classification
recall (does a resolved room tag get the right floor/wall/ceiling finish
code, and is a real room correctly distinguished from a keynote/detail
bubble that only looks like one?), and (b) **rowsym recall** — given a
real schedule row, does `sweep_schedule_row` actually find that tag's
*own drawn symbol* on a plan sheet, geometrically, not just resolve the
row's text? rowsym is the metric that most directly tests "can this
system point at the real thing on the real drawing," which is the crux of
the whole deterministic (non-LLM) claim.

---

## 3. Current real state, per set, per metric

**The numbers below are the latest independently verified forced-cold
full-corpus gate**, run 2026-08-29 against commit `2cd532b` in 56.2 seconds.

| Set | takeoff-eval | reference-eval | graph-eval (rowsym) | Status |
|---|---|---|---|---|
| **bessemer** | **100.0%** (10/10) | **100.0%** (12/12) | rowsym 100.0% | Expected-tag takeoff and reference closed. |
| **itd-d1-lab** | **100.0%** (116/116) | **100.0%** (34/34) | rowsym 100.0% | Closed. Tight cross-sheet registration removes plumbing plan/foundation redraws without collapsing distinct locations. |
| **federal-mech** | **100.0%** (102/102) | **100.0%** (31/31) | rowsym 100.0% | Every audited extracted equipment row is now keyed; zero false additions remain. |
| **navfac-cherry-point-atc** | **100.0%** (217/217) | **100.0%** (31/31) | rowsym 100.0% | Every installed row is exact; schedule-only rows refuse rather than inventing locations. |
| **baker-county-eoc** | **100.0%** (40/40) | **100.0%** (21/21) | rowsym 100.0% | Closed. |
| **bldg5406-hvac-demo** | **100.0%** (28/28) | 0/0 vacuous | rowsym 100.0% | Every extractable row is exact; the two fully exploded fan tags are correctly refused. |
| **itd-d1-lab-raster** | **100.0%** (28/28 expected unavailable) | 0/0 cells, vacuous | rowsym vacuous | The zero-vector-text raster fixture is correctly unavailable without OCR; no value is invented. |

**Current corpus aggregate:** takeoff 541/541 outcomes exact (100.0%):
499/499 applicable installed rows exact, 14/14 honest refusals correct, and
28/28 intentionally raster-unavailable rows correctly absent. Quantity delta,
missing rows, and false additions are all zero. Reference is 129/129 exact
(100%); graph is 91/91 cells exact and 138/138 row-symbol outcomes (100%).
The goal in §1 is achieved for the current corpus.

---

## 4. How this has actually been getting built (method, not just outcome)

- **Historical coordinator/worker model (retired).** Earlier work used one
  coordinating session plus background workers. That model is no longer
  authorized; the current coordinator-only policy at the top of this file
  controls all future work. The enduring engineering rule is: **never
  hardcode corpus specifics (a filename, a tag, a sheet number) into
  production code** (`mcp/src`, `web/src/lib`, runners, verifiers, UI agent
  loop). Every fix has to be a general, real-world-shape-driven rule,
  because the actual goal (§1) is a pipeline that works on drawing sets
  it's never seen — a fix that only helps because it recognizes "navfac's
  own AHU-M1" by name would be actively counterproductive, even if it
  moved this session's own score. This applies equally to the production
  MCP/API path, stdio localhost path, and in-canvas Agent/UI path: same
  strict correctness bar, no answer-steering prompts, no demo-only
  special cases. User-facing workflows must be 100% correct for the same
  class of question on arbitrary blueprints uploaded to the platform as
  more sets are trained on; honest refusal when evidence is missing.
- **Independent re-verification, every single merge, no exceptions.**
  A worker's own claimed numbers are never taken on faith. Before merging:
  `tsc --noEmit` on both packages, the full test suite on both packages
  (`mcp/`: currently 242/242; `web/`: currently 1886/1886, 3 pre-existing
  skips), and the relevant eval script(s) re-run independently. **A fix
  that helps one set but regresses another does not count as done** —
  this was violated once tonight (see below) and the discipline caught it.
- **A real regression WAS shipped once tonight, caught, and fixed** — this
  is the single most important process story of the whole session, worth
  keeping in this file specifically so it's never repeated blind. A fix
  meant to help navfac's AHU-A1/AHU-A2 (commit `353a7fb`) subtly broke
  baker-county-eoc's RTU-1/EWH-1/CU-1/etc — not because anyone was careless,
  but because the fix was merged once under real system load pressure
  without the full corpus-wide check that same night's own standing rule
  requires. It was found by *insisting* on that full check anyway (baker-
  county-eoc dropped from 60.0% to 37.5%, an unmissable signal once
  actually measured), root-caused precisely (`isBareAnchorHeader` and
  `isQualifiedAnchorHeader` are NOT strict complements — a header can be
  neither, and the buggy code required bare-ness when it should have only
  excluded qualified-ness), and fixed with a one-line, precisely-reasoned
  change (commit `fb797e6`). The lesson kept as a standing rule since:
  **never skip the full corpus-wide check to save time under load
  pressure, ever, even once.**
- **A risky fix WAS built, found to regress something else, and correctly
  reverted rather than shipped** — twice tonight (commit `6eee55b`
  partially reverted in `d982172`; a separate pump/valve
  `fragmentedTagOcc` modification built, measured to regress itd-d1-lab
  98.3%→93.1%, and reverted before ever reaching main). Both are treated
  as *successes* of the process, not failures — an honest "found a real
  regression, didn't ship it" is explicitly a valued outcome here, not a
  wasted attempt.
- **Diagnostic tools used, real and specific:** direct PDF rendering to
  visually confirm a real tag/symbol exists before trusting any number;
  small throwaway Node scripts calling the pipeline's own `Session` class
  directly to get the *real* thrown error text (not just the takeoff-eval
  summary's classification of it); `git worktree` + real 3-way merges for
  before/after comparison (never `git stash` — a standing rule, because
  stash has bitten this kind of comparison work before); `repomix` to
  get a compressed structural view of the two largest files
  (`sheetgraph.ts`, `session.ts`, several thousand lines each) before a
  cold full read, purely as a token-cost measure.
- **Infrastructure investment, not just fixes:** a disk cache (`cacache`)
  for OpenDataLoader-PDF's own JSON output cut a repeat extraction from
  ~10s to ~15ms; a real multi-core parallel-eval fan-out (`p-limit`,
  spawning each set's own eval as a separate OS process) turned what used
  to be one long sequential eval into genuine concurrent wall-clock
  savings, deliberately tuned down from concurrency 3 to 2 after it was
  found to compound load spikes when multiple workers each ran their own
  eval fan-out simultaneously.

---

## 5. Where things live, and why

- **Repo** (real git history, real GitHub remote with unrelated ongoing
  work on it): `/Users/erikjohnstone/Desktop/MASTER PLAN/opentakeoff`
  — packages `mcp/` (the MCP server / CLI-facing pipeline) and `web/`
  (the browser canvas app + the shared `web/src/lib` extraction/matching
  logic both sides import from).
- **Corpus** (deliberately **NOT** a git repo, this file included):
  `/Users/erikjohnstone/Desktop/MASTER PLAN/opentakeoff-corpus`
  — `raw/` (the real source PDFs), `keys/` (hand-verified answer-key CSVs,
  one set of `{id}.takeoff.csv` / `.reference.csv` / `.csv`+`.tags.csv`
  (room-finish) / `.rowsym.csv` per set), `sets.json` (the corpus manifest
  with real provenance notes per set). Kept outside git specifically
  because most of these real drawing sets were downloaded from public
  bid-document hosts for local measurement, with redistribution rights
  not independently confirmed — this repo is never meant to republish them.
- A `retired/` entry in `sets.json` holds `weld-county-permit` — pulled
  from the active corpus because its real schedules turned out to be
  raster-embedded pictures, not vector text (confirmed via direct
  operator-list inspection, not assumed) — kept as the future seed of a
  separate OCR-specific corpus, not deleted.

---

## 6. What "independently verified" means, concretely

A number in §3 is only written down here after: (1) the exact eval script
was re-run by the coordinator itself (not just trusted from a worker's own
report) against the exact commit named, (2) both packages typechecked
clean, (3) both full test suites passed, and (4) for any change touching
shared extraction/matching code, the previously-passing baselines on
*every other* set were re-confirmed unmoved (see the regression story in
§4) — not just the set the fix targeted. "Real numbers only, never rounded
up, nothing is 'essentially closed'" has been an explicit, repeated
standing instruction all session — a set is at the exact percentage it's
at, stated plainly, or it isn't reported as a number at all.

---

## 7. Known, confirmed, genuine ceilings — not being chased further right now

Being honest about these here is itself part of the goal (§1) — a system
that silently claims 100% by ignoring what it can't do is worse than one
that discloses its real limits.

- **bldg5406-hvac-demo's EF-2 / EF-3.** Confirmed live via pdf.js
  operator-list + text-content inspection: these two tags are drawn entirely
  as raw vector-path letterforms ("explode text to polylines"). Neither the
  family prefix nor suffix is encoded as text anywhere in the PDF, so
  deterministic run stitching cannot recover them. VAV-6 was previously
  grouped into this ceiling, but its suffix remained searchable and is now
  safely recovered from a local quorum of eight complete sibling VAV tags.
  EF-2/EF-3 require OCR, vector glyph recognition, or a separate
  schedule/service-to-room association proof; none is silently guessed.
- **Resolved former ceilings.** Federal CH-1 now extracts after safe deep-
  header boundary recovery. Baker R1 resolves through compound-label
  ranking, and CD-1 resolves 21/21 through explicit `TYP N` multipliers.
  These are no longer ceilings and remain regression-protected.
- **itd-d1-lab-raster.** By design (see §3's own row) — this is the
  system's own honest raster-refusal path being exercised on purpose, not
  a gap to close. It only moves if OCR is added.

---

## 8. Completion state and next expansion

The **keyed corpus** goal is complete at 100% across takeoff outcomes,
reference cells, and graph row-symbol outcomes. That is a proving ground,
not the platform finish line — real shops upload unfamiliar blueprint sets
daily.

### THE REAL MANDATE (2026-09-03, supersedes the Pillar A–D framing below)

**The user overrode the Pillar A–D structure directly, in these words:**
"Disregard pillars a through d, they are bullshit... The only goal is
finding all the bugs and making this platform production viable so that
any estimator can upload a next pdf and get a takeoff. That's it. End of
story. All the bugs need to be ironed out, the tail of this corpus
complete. Verified takeoffs until it seems redundant. That's what we
need... until we can run an accurate FULL TAKEOFF not 'looks okay' this
app is fucking useless."

Pillars A–D (kept below for historical/structural reference only — the
WP7–WP9 depth criteria they point to are still real engineering shape, not
discarded busywork) were an AI-authored sequencing structure. The user's
own reason for wanting them — people actually trusting and using this
platform — is real and unchanged; what's rejected is treating pillar-gate
completion as a stand-in for that trust, when the real test is simpler and
harder: **does a genuinely verified, cell-by-cell-checked, cite-backed
takeoff come out the other end of an unfamiliar real PDF, every time.**

**The actual, sole, current goal:** corpus-complete bug eradication via
real verified takeoffs — not "compiled without error," not "looks
plausible" — the same standard this session's own St Louis investigation
set: render the actual page, compare cell-by-cell, find the real root
cause, fix it, prove the fix with a real before/after against the actual
PDF. Repeat per set, across the full corpus, until new bugs stop turning
up (redundancy is the actual stopping signal, not a metric threshold).
Production-viable means: any estimator uploads any real PDF — one this
project has never seen — and gets a correct, complete takeoff, full stop.

**What this changes in practice:**
- **CORRECTED same session, by direct user pushback — the batch 116-set
  prewarm was the WRONG infrastructure for this phase, and running it
  was a mistake, not a prerequisite.** The reasoning that killed it:
  `sourceDigest()` hashes the whole L0-L4.5 build path, so ANY real fix
  (and this phase produces one every single set-verification pass, by
  design — that's the whole point) invalidates every set warmed before
  it. A giant parallel batch-prewarm run during ACTIVE code-churn pays a
  huge, continuously-resetting cost for sets nobody has even looked at
  yet, while doing nothing to speed up the actual bottleneck (a human/
  agent's own verification time, not compute time) — and it was also
  the direct cause of two real OOM kills fighting for memory against
  itself. Both 2-shard processes were killed for good reason.
  The real, right-sized infrastructure for THIS phase: build **one set
  at a time**, only the set currently being verified, on demand
  (`OPENTAKEOFF_GRAPH_NO_CACHE=1` or a throwaway identity is fine — the
  ~10 minute cost is paid once, for the set actually under the
  microscope, not for 115 others nobody's looking at). A real batch
  prewarm across the full corpus is worth doing again ONLY once the code
  has genuinely stabilized — no more real bugs turning up — as a
  production/demo-speed optimization, not as bug-hunting infrastructure.
  Don't reach for it again until then.
- Stop treating "Pillar A largely complete" as license to move on to
  Pillar B/C/D-shaped work before the compile side is actually bug-clean.
  A table compiling without a crash is not the bar; a table whose every
  cell has been checked against the rendered page is.
- Bug-hunting priority is corpus coverage depth, not pillar sequencing —
  don't defer a real, findable table-extraction bug because it "belongs"
  to a later pillar. Rules 3, 9, 12, and 16 in this file are the real
  template: find it live, root-cause it against the real page, fix it,
  prove it, write it down — repeated across the whole corpus, not four
  sequenced phases.
- "Redundant" is the real stopping condition per set/table-shape: once a
  verification pass on a new set stops turning up anything the existing
  fixes don't already handle, that shape of the corpus is done. Not
  before.

<details><summary>Pillar A–D structure (superseded above; kept as
engineering-shape reference, not the driving priority)</summary>

**Foundation (non-negotiable):** **Trust and genuine agnostic blueprint
workflows are our main goal and our foundation.** Every answer must be
deterministic, cite-backed, and set-agnostic — the same shared Session+ODL
path for UI and MCP, honest refusal when evidence is missing, no
corpus-specific hardcodes, no answer-steering prompts, no inflated scores.
Portable schedule truth + accurate plan grounding + commercial-grade
deliverables on *any* real upload is the product bar; the corpus is how we
prove it.

**Authority:** `opentakeoff-corpus/takeoffs/NEXT_GOAL_LOOP.md` · **Coordinator-only**
(no cloud workers). **Shared path mandatory** — UI and MCP consume the same
Session + ODL pipeline.

**Four pillars (sequenced):**

| Pillar | Scope | Status |
|---|---|---|
| **A — Cross-set compile** | Set-agnostic HVAC/BAS/valve **schedule compile** across Vol1 (~31) + Vol2 (all 82 INDEX sets). Honest ZERO/WEAK when no extractable tables. | **Largely complete** — 82/82 Vol2 + Vol1 keyed; family/title/BAS depth continues on WEAK sets. |
| **B — Schedule↔plan reconcile** | Contractor-grade reconcile (`MATCH` / `SCHEDULE_ONLY` / `PLAN_ONLY` / honest refuse) with cites; `T-VALVE-01` N=5; inline motif; Session-unified plan tools + prewarm. | **In progress** — workflow shipped; deepening Vol2 MEAT rejoin locks. |
| **C — Valve + BAS workflow depth** | **Corpus-complete** estimator-deep takeoffs for **every** BAS-bearing set and **every** valve/damper/actuator-bearing set: equipment inventory → SOO/I/O model → typed points / contractor columns → plan paint. Each set must be **coordinator self-checked** against drawings **and** **pipeline-corroborated** (GT harness + locks). Not POINTS LIST scrape; not a sample of 3 demos. | **Active after A+B §6 MET** — plumbing only so far; see `NEXT_GOAL_LOOP.md` WP7–WP8 deep DoD. |
| **D — Plan grounding depth** | Go **deep on grounding**: symbol counts, mark sweeps, and “how many on plan” answers must be **highlighted and accurate** — every cited location visible, no legend-only overclaim, no silent misses. | **Queued after A+B bar met** — see `NEXT_GOAL_LOOP.md` WP9. |

**Bulk policy:** Batching is only an operational cadence for probe → key →
fix → negative-control. Scope is **not** “first 5–10 of Vol2.” Honest
ZERO/WEAK compile totals remain correct when a set has no extractable HVAC
schedule tables. Fixes stay set-agnostic on the shared path — never per-PDF
hardcodes or corpus-id special cases.

Future corpus keys expand the proving ground without weakening the outcome
model. Every gate remains forced-cold with full metric reporting. Continue
in the coordinator VM; do not dispatch workers or subagents.
</details>
