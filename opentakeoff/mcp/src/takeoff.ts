// Project-level takeoff pipeline (new initiative, this session) — the piece
// that did NOT exist before this: every other schedule/symbol capability in
// this project (sheetgraph.ts's table extraction, symbolsweep.ts's
// fingerprint matching, sweep_schedule_row's row↔drawn-instance
// corroboration) is real and already deterministic, but only ever exercised
// ONE tag at a time, through an agent tool call an LLM chooses to make.
// Nothing before this walked an ENTIRE plan set, unattended, and produced a
// single structured, typed, project-level takeoff — every scheduled tag,
// its real extracted row data, and every real drawn location, aggregated —
// the way an estimator actually needs the output.
//
// Deliberately reuses the existing engine wholesale rather than
// reimplementing anything: `sheetGraph()` for table discovery,
// `sweepScheduleRow()` for the row↔geometry corroboration (tag
// normalization, cross-sheet occurrence search, fingerprint matching, plan-
// role gating — all of it, unchanged). This module is the ORCHESTRATION
// layer on top: walk every equipment-kind row across the whole set, call
// the existing tool for each, and assemble the result into the typed
// schema + failure taxonomy a real takeoff report needs. No new detection
// or matching logic lives here — if a real bug is found running this, the
// fix belongs in sheetgraph.ts/symbolsweep.ts/session.ts, not here.
import type { Session } from "./session.ts";
import { HVAC_TAXONOMY, type HvacComponent } from "../../web/src/lib/hvacTaxonomy.ts";
import type { Point } from "../../web/src/lib/oneclick.ts";
import type { ScheduleTable, TableRow } from "../../web/src/lib/sheetgraph.ts";

/** The structured failure taxonomy requested for this pipeline — classifies
 * WHY a tag's takeoff came out the way it did, distinct from a raw error
 * message, so a corpus-wide report can be aggregated by failure TYPE rather
 * than read as free text. Deliberately a closed set matching the exact
 * categories asked for; a failure that doesn't fit one of these is real
 * evidence this taxonomy itself needs a new member, not a reason to force
 * it into the nearest label. */
export type FailureType =
  | "TABLE_DISCOVERY_FAILURE"
  | "TABLE_STRUCTURE_FAILURE"
  | "OCR_FAILURE"
  | "SYMBOL_FALSE_NEGATIVE"
  | "TAG_EXTRACTION_FAILURE"
  | "TAG_NORMALIZATION_FAILURE"
  | "TABLE_MATCH_FAILURE"
  | "CROSS_SHEET_ASSOCIATION_FAILURE"
  | "REFUSED_NO_SCALE"
  | "REFUSED_NO_LINEWORK"
  | "AMBIGUOUS_ROW_KEY"
  | "UNCLASSIFIED";

export interface TakeoffFailure {
  type: FailureType;
  tag: string;
  sheet?: string;
  detail: string;
}

/** One resolved (or attempted) equipment item in the project-level takeoff.
 * `quantity`/`drawing_locations` come STRAIGHT from sweep_schedule_row's own
 * real, geometrically-corroborated occurrence count — never estimated,
 * never the schedule's own row count (a schedule lists TYPES, not
 * installed quantity; the plan sheets are the only real source of
 * quantity). `schedule_row` is the raw extracted cell data verbatim, so
 * nothing here fabricates or normalizes a spec value the schedule itself
 * didn't state. */
export interface TakeoffItem {
  tag: string;
  equipment_type: string | null;       // matched hvacTaxonomy component name, or null if unclassified
  category: string | null;             // HvacCategory, or null
  schedule: { sheet: string; kind: string; title: string | null } | null;
  schedule_row: Record<string, string> | null;
  quantity: number;
  drawing_locations: Array<{ sheet: string; at: [number, number] }>;
  siblings_excluded: string[];         // other real tags this sweep explicitly did NOT count as this one
  corroborated: boolean;               // whether the fingerprint match had 2+ real instances to cross-check
  status: "resolved" | "refused" | "error";
  reason?: string;                     // present when status !== "resolved"
  /** Which detection path produced this item — the two passes carry
   * structurally different confidence: a `schedule_row` item is anchored to
   * a real tag an estimator can read on the drawing; a `legend_symbol` item
   * has no per-instance tag at all — it exists only because a legend glyph's
   * own geometry was found repeated on plan sheets (buildLegendTakeoff
   * below). Never merge counts across the two without checking this field
   * first — see PlanSetTakeoff's own `items` vs `legend_items` split. */
  source: "schedule_row" | "legend_symbol";
  /** Present only for source: "legend_symbol" — the real legend sheet and
   * caption text this item's synthetic tag was derived from, so a reader
   * can go look at the row this came from instead of trusting the
   * normalized tag alone. `at` is the glyph's OWN center on that legend
   * sheet (find_legend_symbols' own detected rect, never estimated) —
   * populated unconditionally, including on a "refused"/"error" item: the
   * legend DEFINITION's own location is real, always-available data
   * regardless of whether its whole-set installed count could be verified,
   * so a REFUSED_NO_SCALE item still hands back a real place to go look,
   * not just an opaque wall (this session's own disclosure-quality pass —
   * see buildLegendTakeoff's header comment for why the count itself stays
   * refused rather than guessed). */
  legend?: { sheet: string; caption: string; at: [number, number] };
}

/** One real "reference"-kind table's raw extracted data (full-coverage-
 * standard work: sheetgraph.ts's own structural, vocabulary-free fourth
 * table kind — SYSTEM TYPE/INSULATION TYPE-keyed spec/calculation tables,
 * not equipment schedules). No `quantity`/`drawing_locations`: these tables
 * have no per-instance drawn-symbol tag at all — a sweep_schedule_row call
 * would have nothing to chase (no schedule row here ever answers for a
 * SYMBOL/ID/TAG a plan sheet draws). The row is captured verbatim instead,
 * so the real data ("D-1 → ASTM C1290, TYPE III, ...") is still reachable —
 * "pull ANY INFORMATION out of these sets", not just tag counts. */
export interface ReferenceTableRow {
  key: string;
  cells: Record<string, string>;
}
export interface ReferenceTable {
  sheet: string;
  title: string | null;
  headers: string[];
  rows: ReferenceTableRow[];
}
export interface ExtractedTable extends ReferenceTable {
  kind: string;
}

export interface PlanSetTakeoff {
  set_files: string[];
  family_filter: string[] | null;      // hvacTaxonomy category names this run was scoped to, or null for all
  items: TakeoffItem[];                // source: "schedule_row" — tagged, schedule-anchored
  /** source: "legend_symbol" — untagged, legend-glyph-anchored (buildLegendTakeoff).
   * Deliberately a SEPARATE array, never pre-merged into `items`: a tagged
   * schedule-row count and an untagged legend-geometry count are two
   * structurally different confidence levels (a tag an estimator can read
   * on the sheet vs. a shape a matcher recognized), and collapsing them
   * into one list would hide which is which — see TakeoffItem.source. */
  legend_items: TakeoffItem[];
  /** kind: "reference" tables' own raw extracted data — see ReferenceTable's
   * own doc comment for why this is a THIRD, separate array rather than
   * merged into `items`/`legend_items`: neither a per-instance drawn
   * quantity nor a legend-glyph match applies here at all, a structurally
   * different shape from both, same "never silently blend different-
   * confidence/different-shape data into one list" doctrine already
   * established for those two this session. */
  reference_tables: ReferenceTable[];
  /** Complete deterministic table-query surface across every extracted kind. */
  extracted_tables: ExtractedTable[];
  failures: TakeoffFailure[];
  tables_seen: Array<{ sheet: string; kind: string; title: string | null; rows: number }>;
  legend_sheets_seen: Array<{ sheet: string; glyphs_detected: number }>;
  stats: {
    schedule_rows_total: number;
    resolved: number;
    refused: number;
    errored: number;
    total_drawn_instances: number;
  };
  legend_stats: {
    glyphs_seen: number;              // every (glyph, caption) row find_legend_symbols detected, on-taxonomy or not
    glyphs_matched: number;           // of those, how many plausibly named a valve/actuator/damper (or other in-scope) family
    resolved: number;
    refused: number;
    errored: number;
    total_drawn_instances: number;
  };
}

/** Real tag-prefix hypotheses from hvacTaxonomy, flattened for matching —
 * see that module's own header for why this is a HYPOTHESIS to corroborate,
 * never an assertion from tag text alone. Longest-prefix-first so "CV-"
 * doesn't shadow a more specific "PICV-" match. */
function taxonomyPrefixIndex(categories: string[] | null): HvacComponent[] {
  const all: HvacComponent[] = [
    ...HVAC_TAXONOMY.VALVES, ...HVAC_TAXONOMY.ACTUATORS, ...HVAC_TAXONOMY.DAMPERS,
    ...HVAC_TAXONOMY.AIR_TERMINALS, ...HVAC_TAXONOMY.MAJOR_EQUIPMENT, ...HVAC_TAXONOMY.SENSORS,
  ];
  const pool = categories ? all.filter((c) => categories.includes(c.category)) : all;
  return [...pool].sort((a, b) => Math.max(...b.tagPrefixes.map((p) => p.length)) - Math.max(...a.tagPrefixes.map((p) => p.length)));
}

/** Classify a tag against the taxonomy's own real prefix hypotheses —
 * returns the first (longest-prefix) match, or null if nothing recognized
 * this tag's shape at all. This is deliberately a hint for the OUTPUT
 * report's `equipment_type` field, not a gate: a tag the taxonomy doesn't
 * recognize is still swept and reported, just with `equipment_type: null`
 * — an unrecognized real tag is real corpus evidence the taxonomy is
 * incomplete, not a reason to drop the row. */
function classifyTag(tag: string, index: HvacComponent[]): HvacComponent | null {
  const t = tag.toUpperCase();
  for (const c of index) {
    for (const p of c.tagPrefixes) if (t.startsWith(p)) return c;
  }
  return null;
}

/** Map a thrown sweep_schedule_row UserError's own message text to a
 * taxonomy FailureType — matching its own real, hand-written refusal
 * sentences (session.ts's sweepScheduleRow), not guessing at new ones. A
 * message that matches none of these is real, disclosed evidence this
 * taxonomy needs to grow, not silently swallowed — it lands as
 * UNCLASSIFIED, with the full original message kept in `detail`. */
function classifyError(message: string): FailureType {
  if (/no schedule row ".*" in the set/i.test(message)) return "TABLE_MATCH_FAILURE";
  if (/ambiguous:.*schedule rows carry the key/i.test(message)) return "AMBIGUOUS_ROW_KEY";
  if (/cannot be geometrically anchored/i.test(message)) return "SYMBOL_FALSE_NEGATIVE";
  // A different real refusal shape (found live, baker-county-eoc-bidset.pdf's
  // real LUMINAIRE SCHEDULE, tags R1/X1): the tag TEXT is drawn, but the
  // linework around it doesn't recur at its other occurrence(s) — no
  // repeatable marker geometry to fingerprint. Distinct wording from "not
  // drawn at all" above, but the same real outcome for a takeoff: a symbol
  // this pipeline could not confirm, not a crash.
  if (/cannot be anchored:.*does not recur|no fingerprintable marker linework/i.test(message)) return "SYMBOL_FALSE_NEGATIVE";
  if (/no vector linework/i.test(message)) return "REFUSED_NO_LINEWORK";
  if (/no text layer/i.test(message)) return "TABLE_DISCOVERY_FAILURE";
  return "UNCLASSIFIED";
}

/** Auto-commit scale ONLY from each sheet's own detected title-block note
 * (session.setScale's `use_detected` — never a guessed or corpus-specific
 * value) wherever it isn't already set — the same thing an agent would do
 * by hand after reading a cross-scale refusal message. Shared by both
 * takeoff passes below (originally lived only in buildLegendTakeoff) so a
 * sheet's own detected scale gets committed identically wherever either
 * pass needs it, rather than one pass silently doing this and the other
 * not. Returns the keys that could NOT be resolved (no committed scale and
 * either no detected note or the commit itself failed) — callers that gate
 * on scale (buildLegendTakeoff) use this to refuse honestly per-sheet;
 * callers that don't hard-gate on scale (buildPlanSetTakeoff's own
 * sweep_schedule_row pass, which stays permissive plan-to-plan) call this
 * purely so any cross-sheet ratio math downstream sees a real committed
 * scale instead of an unset one, and can ignore the return value. */
async function commitDetectedScale(session: Session, keys: Iterable<string>): Promise<string[]> {
  const scaleGap: string[] = [];
  for (const key of new Set(keys)) {
    const info = await session.sheetInfo(key);
    if (info.scale_set) continue;
    if (!info.detected_scale) { scaleGap.push(key); continue; }
    try { session.setScale(key, { use_detected: true }); } catch { scaleGap.push(key); }
  }
  return scaleGap;
}

/** Build a full project-level takeoff for every equipment-kind schedule row
 * across the WHOLE already-loaded set, optionally scoped to specific
 * hvacTaxonomy categories (e.g. ["valve","actuator","damper"] per this
 * initiative's own progressive-expansion instruction). Deterministic, no
 * LLM involved — every real decision was already made by sheetgraph.ts's
 * extraction and sweep_schedule_row's corroboration; this only walks and
 * assembles. */
export async function buildPlanSetTakeoff(session: Session, opts: {
  categories?: string[] | null;
  /** Corpus scorer optimization: preserve counted row-tag matches while
   * omitting whole-sheet unlabeled/other-tag disclosure that no metric reads. */
  evaluationFast?: boolean;
} = {}): Promise<PlanSetTakeoff> {
  const categories = opts.categories ?? null;
  const graph = await session.graphForPipeline();
  const out: PlanSetTakeoff = {
    set_files: [],
    family_filter: categories,
    items: [],
    legend_items: [],
    reference_tables: [],
    extracted_tables: [],
    failures: [],
    tables_seen: [],
    legend_sheets_seen: [],
    stats: { schedule_rows_total: 0, resolved: 0, refused: 0, errored: 0, total_drawn_instances: 0 },
    legend_stats: { glyphs_seen: 0, glyphs_matched: 0, resolved: 0, refused: 0, errored: 0, total_drawn_instances: 0 },
  };
  if (!graph.available) {
    out.failures.push({ type: "TABLE_DISCOVERY_FAILURE", tag: "(whole set)", detail: "No text layer anywhere in this set — sheet graph unavailable." });
    return out;
  }

  // Real, found live running this pipeline against weld-county-mechanical-
  // permit.pdf: a "schedule"-role sheet with ZERO extracted tables reads,
  // on its own, as indistinguishable from "this sheet legitimately has no
  // schedule" — but `sheetGraph()`'s own existing raster-schedule detector
  // (rasterScheduleNotes, session.ts) already knows the real difference:
  // that sheet's own real image-area fraction says the schedule is very
  // likely pasted in as a picture (or scanned), invisible to text-based
  // extraction no matter the vocabulary — a real, structural OCR/vision gap,
  // not a "nothing to find here" case. Surfacing it here so a takeoff run
  // over a real permit set doesn't silently read as complete when a whole
  // real schedule was never even reachable.
  const wire = await session.sheetGraph();
  for (const note of wire.notes || []) {
    const m = /^(\S+) is classified as a schedule sheet but 0 tables extracted.*pasted in as a picture/.exec(note);
    if (m) out.failures.push({ type: "OCR_FAILURE", tag: "(whole sheet)", sheet: m[1], detail: note });
  }

  // Real gap this pipeline shipped with: sweep_schedule_row's own cross-
  // sheet corroboration/matching (session.ts) reads each plan sheet's real
  // committed scale (`.upp`) to ratio a fingerprint from the anchor sheet
  // onto a DIFFERENT plan sheet drawn at a different real scale — plan-to-
  // plan sweeps stay permissive rather than hard-refuse when scale is
  // missing (requireCrossScale's own doc comment), but "permissive" means
  // "assumes 1:1", which is silently wrong whenever two plan sheets in the
  // set are genuinely drawn at different scales (this corpus's own
  // itd-d1-lab-mechanical.pdf has plan sheets at both 3/16"=1'-0" and
  // 3/8"=1'-0"). buildLegendTakeoff already committed each sheet's own
  // detected title-block scale for exactly this reason, but only ran as
  // this function's OWN second pass, AFTER the equipment loop below had
  // already swept every schedule row against unscaled sheets — too late to
  // help its own results. Committing up front, before the loop, fixes the
  // ordering without duplicating the logic (shared commitDetectedScale
  // above). Scoped to this pass's OWN real sheet need — plan sheets only,
  // since sweep_schedule_row's occurrences and corroboration never read a
  // legend/detail/schedule sheet's geometry — not a copy of
  // buildLegendTakeoff's legend+plan set.
  const planSheetKeysForScale = graph.sheets.filter((s) => s.role === "plan").map((s) => s.key);
  await commitDetectedScale(session, planSheetKeysForScale);

  const index = taxonomyPrefixIndex(categories);
  const seenTags = new Set<string>();

  // Shared per-row resolver — the SAME sweep_schedule_row call, item shape,
  // and stats bookkeeping for every row this pipeline attempts, whichever
  // table `kind` it came from. Pulled out so the "reference"-kind pass below
  // (deferredReferenceRows) can reuse it verbatim instead of re-deriving the
  // same try/catch/classifyError bookkeeping a second time.
  async function resolveRow(tb: ScheduleTable, row: TableRow, tag: string, cls: HvacComponent | null): Promise<void> {
    out.stats.schedule_rows_total++;
    const cellsRaw: Record<string, string> = {};
    for (const [label, cell] of Object.entries(row.cells || {})) if (cell?.text) cellsRaw[label] = cell.text;

    const item: TakeoffItem = {
      tag,
      equipment_type: cls?.name ?? null,
      category: cls?.category ?? null,
      schedule: { sheet: tb.sheet, kind: tb.kind, title: tb.title?.text ?? null },
      schedule_row: cellsRaw,
      quantity: 0,
      drawing_locations: [],
      siblings_excluded: [],
      corroborated: false,
      status: "error",
      source: "schedule_row",
    };

    try {
      let r;
      try {
        r = await session.sweepScheduleRow(tag, { commit: false, evaluationFast: opts.evaluationFast });
      } catch (primary: any) {
        // Some drawings omit a schedule's redundant trailing unit digit
        // when only one device exists at that site (schedule ...-A1, plan
        // ...-A). sweepScheduleRow owns the conservative proof: it accepts
        // the base only when exactly one strict numbered extension exists.
        // The project walker must try that real plan mark too; otherwise the
        // one-tag API can resolve it while the unattended takeoff silently
        // cannot.
        const alias = /[A-Z]\d$/i.test(tag) ? tag.slice(0, -1) : null;
        if (!alias || !/tag is not drawn on any plan sheet/i.test(primary?.message || String(primary))) throw primary;
        try {
          r = await session.sweepScheduleRow(alias, { commit: false, evaluationFast: opts.evaluationFast });
        } catch {
          // Alias lookup is an optional recovery attempt. If it cannot prove
          // a unique row and plan anchor, retain the original no-plan-tag
          // refusal instead of replacing it with an incidental alias error.
          throw primary;
        }
        item.tag = alias;
      }
      item.quantity = r.found ?? 0;
      item.drawing_locations = (r.sheets || []).flatMap((ps: any) =>
        (ps.matches || []).map((m: any) => ({ sheet: ps.sheet, at: m.at as [number, number] })));
      item.corroborated = !!r.anchor?.corroborated;
      item.status = "resolved";
      out.stats.resolved++;
      out.stats.total_drawn_instances += item.quantity;
    } catch (e: any) {
      const msg = e?.message || String(e);
      const installationNotes = await session.explicitInstallationNotes(tag);
      if (installationNotes.length === 1) {
        item.quantity = 1;
        item.drawing_locations = [{
          sheet: installationNotes[0].sheet,
          at: installationNotes[0].at,
        }];
        item.status = "resolved";
        item.reason = `Counted from explicit installation note: "${installationNotes[0].text}"`;
        out.stats.resolved++;
        out.stats.total_drawn_instances++;
        out.items.push(item);
        return;
      }
      const ft = classifyError(msg);
      item.status = ft === "SYMBOL_FALSE_NEGATIVE" || ft === "AMBIGUOUS_ROW_KEY" ? "refused" : "error";
      item.reason = msg;
      if (item.status === "refused") out.stats.refused++; else out.stats.errored++;
      out.failures.push({ type: ft, tag: item.tag, sheet: tb.sheet, detail: msg });
    }
    out.items.push(item);
  }

  // "reference"-kind tables (full-coverage-standard work) mostly have no
  // per-instance drawn-symbol tag at all — nothing for sweep_schedule_row to
  // chase — so their raw data is captured verbatim into reference_tables[]
  // rather than walking the equipment tag-sweep loop, matching
  // ReferenceTable's own doc comment. But a real, corpus-found exception:
  // some reference-kind tables (a real CALCULATION table, e.g. baker-county-
  // eoc-bidset.pdf#41's own NATURAL GAS CALCULATION) are keyed by real
  // equipment tags too — a mix of tags genuinely never drawn on a plan sheet
  // (existing equipment cited only for load accounting) and tags that ARE
  // drawn but already own a real "equipment"-kind schedule elsewhere. Such a
  // row deserves the SAME honest sweep_schedule_row attempt (and the SAME
  // real resolved/refused/error verdict) as any other tagged row — silently
  // omitting it entirely (the previous behavior) reads as "never even
  // looked", which is worse than a disclosed refusal. Deferred to its own
  // pass, run AFTER every "equipment"-kind table below, so a proper
  // equipment schedule's own row always wins `seenTags` first — this pass
  // only ever fills a genuine gap, never shadows or double-counts a tag a
  // real equipment schedule already answers for. Gated on classifyTag()
  // recognizing the tag (unlike the main loop's own permissive "all"-scope
  // behavior) specifically because most reference-table rows are NOT
  // equipment tags at all (spec/insulation/connection keys) — attempting
  // every one of those would just manufacture noise, not real evidence.
  const deferredReferenceRows: { tb: ScheduleTable; row: TableRow; tag: string; cls: HvacComponent }[] = [];

  for (const tb of graph.tables) {
    out.tables_seen.push({ sheet: tb.sheet, kind: tb.kind, title: tb.title?.text ?? null, rows: tb.rows.length });
    const extracted: ExtractedTable = {
      sheet: tb.sheet,
      kind: tb.kind,
      title: tb.title?.text ?? null,
      headers: tb.headers,
      rows: tb.rows.map((row) => {
        const cells: Record<string, string> = {};
        for (const [label, cell] of Object.entries(row.cells || {})) if (cell?.text) cells[label] = cell.text;
        return { key: row.key, cells };
      }),
    };
    out.extracted_tables.push(extracted);
    if (tb.kind === "reference") {
      out.reference_tables.push(extracted);
      for (const row of tb.rows) {
        const tag = (row.key || "").trim();
        if (!tag) continue;
        const cls = classifyTag(tag, index.length ? index : taxonomyPrefixIndex(null));
        if (!cls) continue; // no real taxonomy hypothesis for this row's tag — not equipment-shaped, leave it to reference_tables[] alone
        if (categories && !categories.includes(cls.category)) continue; // out of this run's own declared scope
        deferredReferenceRows.push({ tb, row, tag, cls });
      }
      continue;
    }
    if (tb.kind !== "equipment") continue; // this pipeline's own scope, matching hvacTaxonomy's scheduleKind convention
    for (const row of tb.rows) {
      const tag = (row.key || "").trim();
      if (!tag) continue;
      const canon = tag.toUpperCase().replace(/\s+/g, "");
      if (seenTags.has(canon)) continue; // a compound "R1/E1" key answers once, not once per mark — sweep_schedule_row itself dedupes marks; this dedupes the OUTER loop only
      seenTags.add(canon);

      const cls = classifyTag(tag, index.length ? index : taxonomyPrefixIndex(null));
      if (categories && (!cls || !categories.includes(cls.category))) continue; // out of this run's own declared scope — not a failure, just not requested; not counted in stats either
      await resolveRow(tb, row, tag, cls);
    }
  }

  for (const { tb, row, tag, cls } of deferredReferenceRows) {
    const canon = tag.toUpperCase().replace(/\s+/g, "");
    if (seenTags.has(canon)) continue; // a real "equipment"-kind schedule elsewhere already answered for this exact tag — never shadow or double-count it
    // Bare-vs-suffixed twin/triplet guard — real, corpus-found (navfac-
    // cherry-point-atc-mechanical.pdf's own AHU-T1/AHU-T1A/AHU-T1B): a
    // reference-kind table (a FAN SOUND POWER LEVEL SCHEDULE, here) routinely
    // shares identical performance data across a redundant pair/triplet of
    // real units and prints ONE row for it under the bare mark ("AHU-T1")
    // rather than repeating the row once per suffixed unit — while the real
    // primary equipment schedule elsewhere already lists each unit under its
    // OWN letter-suffixed tag ("AHU-T1A", "AHU-T1B"). That bare row is not a
    // THIRD physical asset; resolving it as its own new tag double-counts
    // the same already-seen equipment under a second, generic name. Detected
    // the same way MEP drafters actually draw the convention — this bare
    // tag is a strict prefix of an already-resolved tag whose ONLY remaining
    // suffix is a single letter (A, B, C, …) — never a digit (a genuinely
    // different tag, "AHU-1" vs "AHU-10") and never more than one character
    // (also a genuinely different tag). No project-specific string: this is
    // the general lettered-twin-unit shape, not a navfac-cherry-point literal.
    const isTwinAlias = [...seenTags].some((s) => s.startsWith(canon) && /^[A-Z]$/.test(s.slice(canon.length)));
    if (isTwinAlias) continue;
    seenTags.add(canon);
    await resolveRow(tb, row, tag, cls);
  }

  // Second pass (accuracy-hardening plan, this session's own progressive-
  // build directive: "begin with HVAC control/hydronic components") — real
  // valves/dampers/actuators drawn as an untagged LEGEND SYMBOL, never a
  // schedule row, are structurally invisible to the pass above (it only
  // ever walks `graph.tables`). Wired in here by default so a plan-set
  // takeoff is complete without a second CLI invocation; kept as its own
  // exported function (below) so it stays independently callable/testable.
  const legend = await buildLegendTakeoff(session, { categories });
  out.legend_items = legend.items;
  out.legend_sheets_seen = legend.legend_sheets_seen;
  out.legend_stats = legend.stats;
  out.failures.push(...legend.failures);

  return out;
}

// ── legend-glyph pass (untagged valves/dampers/actuators) ──────────────────

/** Words worth comparing between a legend caption and an hvacTaxonomy
 * component name — connector/filler words dropped so "3-way, 2-way control
 * valve" vs. "2-way electric control valve" compares on the words that
 * actually carry meaning. Deliberately generic (not corpus vocabulary). */
const CAPTION_STOPWORDS = new Set(["OR", "AND", "WITH", "THE", "A", "AN", "OF", "TO", "FOR"]);

// A real legend routinely spells a port count out ("THREE-WAY CONTROL
// VALVE") on one sheet and uses the numeral ("3-WAY...") on another —
// observed live, same set, two different legend sheets (itd-d1-lab's own
// general legend vs. its "CONTROLS LEGEND"). hvacTaxonomy's own component
// names always use the numeral. Without this, "THREE"/"3" compare as
// different words and a specific match can lose to an unrelated, shorter
// name purely on word-count ratio — found and fixed live, not theoretical:
// "THREE-WAY CONTROL VALVE" scored higher against "Bypass control valve"
// (2 of 3 words hit) than against "3-way electric control valve" (3 of 5,
// missing only "THREE"↔"3") before this. Generic English number words,
// never a corpus-specific string.
const NUMBER_WORDS: Record<string, string> = { ONE: "1", TWO: "2", THREE: "3", FOUR: "4", FIVE: "5", SIX: "6", SEVEN: "7", EIGHT: "8", NINE: "9", TEN: "10" };

function captionWords(s: string): string[] {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").split(/\s+/)
    .filter((w) => w && !CAPTION_STOPWORDS.has(w))
    .map((w) => NUMBER_WORDS[w] ?? w);
}

/** For each HvacCategory present in `pool`, the word(s) that appear in a
 * strong majority (>=50%) of that category's OWN component names — derived
 * live from hvacTaxonomy.ts's real data, never hand-picked here. Every
 * VALVES entry's name literally ends in "valve", every DAMPERS entry in
 * "damper", every ACTUATORS entry in "actuator" — so this naturally reduces
 * to exactly those words without this module hardcoding any of them, and it
 * re-derives itself automatically if the taxonomy grows a category whose
 * shared noun differs (e.g. a fifth valve variant with a different name
 * shape). This is the "hvacTaxonomy's own real component names/categories
 * as the matching vocabulary, not hardcoded per-file strings" requirement,
 * made literal. */
function categoryFamilyWords(pool: HvacComponent[]): Map<string, Set<string>> {
  const byCat = new Map<string, HvacComponent[]>();
  for (const c of pool) {
    if (!byCat.has(c.category)) byCat.set(c.category, []);
    byCat.get(c.category)!.push(c);
  }
  const out = new Map<string, Set<string>>();
  for (const [cat, comps] of byCat) {
    const freq = new Map<string, number>();
    for (const c of comps) for (const w of new Set(captionWords(c.name))) freq.set(w, (freq.get(w) ?? 0) + 1);
    const words = new Set<string>();
    for (const [w, n] of freq) if (n / comps.length >= 0.5) words.add(w);
    out.set(cat, words);
  }
  return out;
}

export interface LegendCaptionMatch {
  category: string | null;
  equipment_type: string | null;   // best-matched, UNAMBIGUOUS specific component name, or null
  ambiguous_with?: string[];       // present when 2+ candidates tied for best score — named rather than silently picking one
}

/** Classify a legend glyph's own caption text against hvacTaxonomy's real
 * vocabulary — never a hardcoded per-file caption string. Two levels:
 * (1) CATEGORY — does the caption contain every one of a category's own
 * derived family word(s) (e.g. "VALVE")? This is deliberately generous: a
 * real legend caption this taxonomy has no specific entry for at all (e.g.
 * "TRIPLE DUTY VALVE" — a real device, not yet a named VALVES entry) still
 * classifies at the category level, exactly like classifyTag's own
 * "unrecognized tag is corpus evidence, not a reason to drop the row"
 * doctrine above.
 * (2) SPECIFIC COMPONENT — the best word-overlap match among that
 * category's own entries, ONLY when it's a clear, unique winner; a tie
 * (e.g. "3-WAY, 2-WAY CONTROL VALVE" scores identically against BOTH the
 * 2-way and 3-way electric variants) is reported as ambiguous, never
 * silently resolved by picking the first one. */
export function classifyLegendCaption(caption: string, categories: string[] | null): LegendCaptionMatch {
  const all: HvacComponent[] = [
    ...HVAC_TAXONOMY.VALVES, ...HVAC_TAXONOMY.ACTUATORS, ...HVAC_TAXONOMY.DAMPERS,
    ...HVAC_TAXONOMY.AIR_TERMINALS, ...HVAC_TAXONOMY.MAJOR_EQUIPMENT, ...HVAC_TAXONOMY.SENSORS,
  ];
  const pool = categories ? all.filter((c) => categories.includes(c.category)) : all;
  if (!pool.length) return { category: null, equipment_type: null };
  const famWords = categoryFamilyWords(pool);
  const capWords = new Set(captionWords(caption));

  let matchedCategory: string | null = null;
  for (const [cat, words] of famWords) {
    if (!words.size) continue;
    if ([...words].every((w) => capWords.has(w))) { matchedCategory = cat; break; }
  }
  if (!matchedCategory) return { category: null, equipment_type: null };

  const scored: { name: string; score: number }[] = [];
  for (const c of pool) {
    if (c.category !== matchedCategory) continue;
    // deduped: a component name that repeats a word (e.g. "Solenoid valve
    // (2-way OR 3-way)" repeats "way") must not score higher purely for
    // saying the same word twice — every word counts once, same as capWords.
    const cw = [...new Set(captionWords(c.name))];
    if (!cw.length) continue;
    const hits = cw.filter((w) => capWords.has(w)).length;
    scored.push({ name: c.name, score: hits / cw.length });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.5) return { category: matchedCategory, equipment_type: null };
  const tied = scored.filter((s) => Math.abs(s.score - best.score) < 1e-9).map((s) => s.name);
  if (tied.length > 1) return { category: matchedCategory, equipment_type: null, ambiguous_with: tied };
  return { category: matchedCategory, equipment_type: best.name };
}

export interface LegendTakeoffResult {
  items: TakeoffItem[];
  legend_sheets_seen: Array<{ sheet: string; glyphs_detected: number }>;
  failures: TakeoffFailure[];
  stats: { glyphs_seen: number; glyphs_matched: number; resolved: number; refused: number; errored: number; total_drawn_instances: number };
}

/** The untagged-legend-symbol takeoff pass: every real legend/controls-
 * legend sheet in the set (found via sheetGraph's own sheet ROLE, never a
 * hardcoded page number), every glyph find_legend_symbols detects on it,
 * matched against hvacTaxonomy's own vocabulary, swept whole-set via the
 * EXISTING symbol_sweep(scope:"set") mechanism — the identical detected-
 * rect-to-symbol_sweep gesture the browser's own legend-learning workflow
 * already uses (legendlearn.ts's header comment, web/src/pages/
 * TakeoffCanvas.jsx's agentFindLegendSymbols). No new detection/matching
 * logic here — a real bug in that path (the noded-bbox padding gap this
 * session found and fixed) belongs in legendlearn.ts, not here.
 *
 * A legend/detail sheet is drawn at its OWN scale (or, commonly, no stated
 * scale at all — a schematic symbol key, not drawn to any real-world
 * ratio) — session.ts's symbolSweep refuses a set-wide sweep seeded off one
 * without a committed real-world scale on BOTH ends (requireCrossScale),
 * by design, rather than guess a size ratio. This pass tries the one
 * legitimate, non-guessing unblock — set_scale({use_detected:true}) wherever
 * a sheet's own title block states a real scale note — and otherwise
 * refuses that glyph honestly (REFUSED_NO_SCALE), never hardcoding or
 * brute-force-searching a ratio. */
export async function buildLegendTakeoff(session: Session, opts: { categories?: string[] | null } = {}): Promise<LegendTakeoffResult> {
  const categories = opts.categories ?? null;
  const graph = await session.graphForPipeline();
  const result: LegendTakeoffResult = {
    items: [], legend_sheets_seen: [], failures: [],
    stats: { glyphs_seen: 0, glyphs_matched: 0, resolved: 0, refused: 0, errored: 0, total_drawn_instances: 0 },
  };
  if (!graph.available) return result;

  const legendSheetKeys = graph.sheets.filter((s) => s.role === "legend").map((s) => s.key);
  const planSheetKeys = graph.sheets.filter((s) => s.role === "plan").map((s) => s.key);

  // Auto-commit scale ONLY from each sheet's own detected title-block note —
  // shared with buildPlanSetTakeoff's own pass (commitDetectedScale above),
  // which now does the identical commit for its own plan-sheet need before
  // this function even runs; calling it again here for legendSheetKeys ∪
  // planSheetKeys is a no-op on any sheet already resolved (info.scale_set
  // check inside), and is what actually resolves the legend sheets, which
  // the plan-only pass never touches.
  const scaleGap = await commitDetectedScale(session, [...legendSheetKeys, ...planSheetKeys]);

  const seenTags = new Set<string>();

  for (const sheetKey of legendSheetKeys) {
    let detected: Awaited<ReturnType<Session["findLegendGlyphs"]>>;
    try {
      detected = await session.findLegendGlyphs(sheetKey);
    } catch (e: any) {
      const msg = e?.message || String(e);
      result.failures.push({ type: "REFUSED_NO_LINEWORK", tag: "(whole sheet)", sheet: sheetKey, detail: msg });
      result.legend_sheets_seen.push({ sheet: sheetKey, glyphs_detected: 0 });
      continue;
    }
    result.legend_sheets_seen.push({ sheet: sheetKey, glyphs_detected: detected.glyphs.length });
    result.stats.glyphs_seen += detected.glyphs.length;

    for (const g of detected.glyphs) {
      const match = classifyLegendCaption(g.caption, categories);
      if (!match.category) continue; // not a valve/actuator/damper (or other in-scope) family per taxonomy's own vocabulary — out of scope, not a failure
      if (categories && !categories.includes(match.category)) continue;

      const canon = `${sheetKey}::${g.caption.toUpperCase().replace(/\s+/g, " ").trim()}`;
      if (seenTags.has(canon)) continue; // the exact same (sheet, caption) glyph reported twice — legendlearn.ts's own table-grid recovery pass can do this; a real, disclosed dedupe, not a silent one
      seenTags.add(canon);
      result.stats.glyphs_matched++;

      const tag = `LEGEND:${g.caption.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
      // The glyph's OWN location on the legend sheet — real, always-known
      // (find_legend_symbols' own detected rect), independent of whether the
      // whole-set installed count below can be verified. Populated
      // unconditionally so a REFUSED_NO_SCALE item still hands back a real
      // "go look here" pointer to the definition, not just an opaque wall
      // (see TakeoffItem.legend's own doc comment).
      const glyphAt: [number, number] = [Math.round((g.rect[0] + g.rect[2]) / 2 * 10) / 10, Math.round((g.rect[1] + g.rect[3]) / 2 * 10) / 10];
      const item: TakeoffItem = {
        tag,
        equipment_type: match.equipment_type,
        category: match.category,
        schedule: { sheet: sheetKey, kind: "legend", title: null },
        schedule_row: null,
        quantity: 0,
        drawing_locations: [],
        siblings_excluded: match.ambiguous_with && match.ambiguous_with.length > 1 ? match.ambiguous_with : [],
        corroborated: false,
        status: "error",
        source: "legend_symbol",
        legend: { sheet: sheetKey, caption: g.caption, at: glyphAt },
      };

      const seedIsGap = scaleGap.includes(sheetKey);
      const planGapAlso = planSheetKeys.filter((k) => scaleGap.includes(k));
      if (seedIsGap || planGapAlso.length) {
        item.status = "refused";
        // Named, precise about WHICH sheet(s) are the real gap — never a
        // blanket "(or a plan sheet in the set)" hedge when only one side is
        // actually missing. A seed-sheet gap gets an extra, honest caveat:
        // this project's own real corpus evidence (this session's direct
        // render + text sweep of itd-d1-lab-mechanical.pdf's own legend
        // sheets, and an empirical same-ratio-assumed test that produced
        // thousands of garbage matches) is that a legend/controls-legend
        // sheet routinely carries NO real-world scale by DESIGN — a
        // schematic symbol-key chart, not a to-scale drawing of the device
        // — so this is frequently a permanent limitation for this glyph,
        // not merely an unset value a human can always fill in.
        const parts: string[] = [];
        if (seedIsGap) parts.push(`the legend sheet itself (${sheetKey})`);
        if (planGapAlso.length) parts.push(`plan sheet(s) in the set (${planGapAlso.join(", ")})`);
        item.reason = `No committed real-world scale on ${parts.join(" and ")} — a set-wide sweep seeded from a legend glyph refuses rather than guess the size ratio between the legend's own icon and its real drawn size on the plans (session.ts's requireCrossScale). No corpus-specific ratio was assumed.` +
          (seedIsGap
            ? ` Note: a legend/symbol-key sheet frequently carries no real-world scale at all BY DESIGN (a schematic reference chart, not a scaled drawing) — set_scale may not be answerable here even by a human, in which case this glyph's whole-set count is a genuine, permanent limitation, not a pending fix. The glyph itself is real and located at ${sheetKey} (${glyphAt[0]}, ${glyphAt[1]}) even though its installed count could not be verified.`
            : ` A human can set_scale (label/upp/calibrate) on: ${planGapAlso.join(", ")}.`);
        result.stats.refused++;
        result.failures.push({ type: "REFUSED_NO_SCALE", tag, sheet: sheetKey, detail: item.reason });
        result.items.push(item);
        continue;
      }

      try {
        const rect: [Point, Point] = [[g.rect[0], g.rect[1]], [g.rect[2], g.rect[3]]];
        const sw: any = await session.symbolSweep(sheetKey, { seedRect: rect, scope: "set", commit: false });
        item.quantity = sw.found ?? 0;
        item.drawing_locations = (sw.sheets || []).flatMap((ps: any) =>
          (ps.matches || []).map((m: any) => ({ sheet: ps.sheet, at: m.at as [number, number] })));
        item.corroborated = item.quantity >= 2;
        item.status = "resolved";
        result.stats.resolved++;
        result.stats.total_drawn_instances += item.quantity;
      } catch (e: any) {
        const msg = e?.message || String(e);
        const ft = classifyError(msg);
        item.status = ft === "SYMBOL_FALSE_NEGATIVE" ? "refused" : "error";
        item.reason = msg;
        if (item.status === "refused") result.stats.refused++; else result.stats.errored++;
        result.failures.push({ type: ft, tag, sheet: sheetKey, detail: msg });
      }
      result.items.push(item);
    }
  }
  return result;
}
