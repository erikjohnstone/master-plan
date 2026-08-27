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
   * normalized tag alone. */
  legend?: { sheet: string; caption: string };
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
  if (/no vector linework/i.test(message)) return "REFUSED_NO_LINEWORK";
  if (/no text layer/i.test(message)) return "TABLE_DISCOVERY_FAILURE";
  return "UNCLASSIFIED";
}

/** Build a full project-level takeoff for every equipment-kind schedule row
 * across the WHOLE already-loaded set, optionally scoped to specific
 * hvacTaxonomy categories (e.g. ["valve","actuator","damper"] per this
 * initiative's own progressive-expansion instruction). Deterministic, no
 * LLM involved — every real decision was already made by sheetgraph.ts's
 * extraction and sweep_schedule_row's corroboration; this only walks and
 * assembles. */
export async function buildPlanSetTakeoff(session: Session, opts: { categories?: string[] | null } = {}): Promise<PlanSetTakeoff> {
  const categories = opts.categories ?? null;
  const graph = await session.graphForPipeline();
  const out: PlanSetTakeoff = {
    set_files: [],
    family_filter: categories,
    items: [],
    legend_items: [],
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

  const index = taxonomyPrefixIndex(categories);
  const seenTags = new Set<string>();

  for (const tb of graph.tables) {
    out.tables_seen.push({ sheet: tb.sheet, kind: tb.kind, title: tb.title?.text ?? null, rows: tb.rows.length });
    if (tb.kind !== "equipment") continue; // this pipeline's own scope, matching hvacTaxonomy's scheduleKind convention
    for (const row of tb.rows) {
      const tag = (row.key || "").trim();
      if (!tag) continue;
      const canon = tag.toUpperCase().replace(/\s+/g, "");
      if (seenTags.has(canon)) continue; // a compound "R1/E1" key answers once, not once per mark — sweep_schedule_row itself dedupes marks; this dedupes the OUTER loop only
      seenTags.add(canon);

      const cls = classifyTag(tag, index.length ? index : taxonomyPrefixIndex(null));
      if (categories && (!cls || !categories.includes(cls.category))) continue; // out of this run's own declared scope — not a failure, just not requested; not counted in stats either
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
        const r = await session.sweepScheduleRow(tag, { commit: false });
        item.quantity = r.found ?? 0;
        item.drawing_locations = (r.sheets || []).flatMap((ps: any) =>
          (ps.matches || []).map((m: any) => ({ sheet: ps.sheet, at: m.at as [number, number] })));
        item.corroborated = !!r.anchor?.corroborated;
        item.status = "resolved";
        out.stats.resolved++;
        out.stats.total_drawn_instances += item.quantity;
      } catch (e: any) {
        const msg = e?.message || String(e);
        const ft = classifyError(msg);
        item.status = ft === "SYMBOL_FALSE_NEGATIVE" ? "refused" : "error";
        item.reason = msg;
        if (item.status === "refused") out.stats.refused++; else out.stats.errored++;
        out.failures.push({ type: ft, tag, sheet: tb.sheet, detail: msg });
      }
      out.items.push(item);
    }
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

  // Auto-commit scale ONLY from each sheet's own detected title-block note
  // (session.setScale's `use_detected` — never a guessed or corpus-specific
  // value) wherever it isn't already set — the same thing an agent would do
  // by hand after reading symbolSweep's own cross-scale refusal message.
  const scaleGap: string[] = [];
  for (const key of new Set([...legendSheetKeys, ...planSheetKeys])) {
    const info = await session.sheetInfo(key);
    if (info.scale_set) continue;
    if (!info.detected_scale) { scaleGap.push(key); continue; }
    try { session.setScale(key, { use_detected: true }); } catch { scaleGap.push(key); }
  }

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
        legend: { sheet: sheetKey, caption: g.caption },
      };

      if (scaleGap.includes(sheetKey) || planSheetKeys.some((k) => scaleGap.includes(k))) {
        item.status = "refused";
        item.reason = `This legend sheet (or a plan sheet in the set) carries no real-world scale, detected or committed — a set-wide sweep seeded from a legend glyph refuses rather than guess the size ratio between the legend's own icon and its real drawn size on the plans (session.ts's requireCrossScale). No corpus-specific ratio was assumed. A human needs to set_scale (label/upp/calibrate) on: ${scaleGap.join(", ")}.`;
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
