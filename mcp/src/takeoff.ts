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
}

export interface PlanSetTakeoff {
  set_files: string[];
  family_filter: string[] | null;      // hvacTaxonomy category names this run was scoped to, or null for all
  items: TakeoffItem[];
  failures: TakeoffFailure[];
  tables_seen: Array<{ sheet: string; kind: string; title: string | null; rows: number }>;
  stats: {
    schedule_rows_total: number;
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
    failures: [],
    tables_seen: [],
    stats: { schedule_rows_total: 0, resolved: 0, refused: 0, errored: 0, total_drawn_instances: 0 },
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
  return out;
}
