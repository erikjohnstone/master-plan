/**
 * The set-wide drawn-tag census (plans/03-drawing-tag-recognition-audit.md
 * §3.3 WP2). Pure — spans and tables in, drawn tags out — so Session (MCP)
 * and the canvas share one census, the same discipline every other module
 * on this shared path already follows (equiptags.ts, markid.ts,
 * symbollabels.ts).
 *
 * This is the module the earlier tag-recognition audit found missing:
 * every existing tag finder (sweep_schedule_row, count_marks,
 * tagOccurrencesOnSheet) answers "where is THIS known tag drawn" — none of
 * them answers "what tags are drawn on this sheet / this set" at all. This
 * module is that answer, built entirely from already-audited recognisers
 * (labelTokens, isEquipTag, joinHyphenatedTags, the key-free compound-run
 * recogniser added alongside compoundTagOcc in symbolsweep.ts) — no new
 * regex beyond that one small addition.
 */
import type { Bbox, ScheduleTable, SheetRole, SheetSpans } from "./sheetgraph.ts";
import { classifySheetRole } from "./sheetgraph.ts";
import { labelTokens, canonicalLabelFamily, type LabelSpan } from "./symbollabels.ts";
import { isEquipTag, joinHyphenatedTags } from "./equiptags.ts";
import { compoundRunLeadTag } from "./symbolsweep.ts";
import { markKey } from "./markid.ts";
import { scheduleCountMultiplier } from "./schedulePlanReconcile.mjs";

export interface DrawnTag {
  sheet: string;
  role: SheetRole;
  /** As drawn, joined/reconstructed — never re-derived from `key`. */
  text: string;
  /** markKey(text) — hyphen/space-insensitive identity (markid.ts). */
  key: string;
  /** canonicalLabelFamily(text) — the instance-stripped family (symbollabels.ts). */
  family: string;
  bbox: Bbox;
  rot: number;
  source: "exact" | "joined" | "stacked" | "compound" | "count_prefixed";
  /** An authored drafting multiplier ("TYP 8", "(8)") beside this tag. Default 1. */
  multiplier: number;
  /** The table this tag's own text sits inside, or null when it is drawn
   * outside every extracted table region. A schedule-role sheet's own text
   * outside every extracted region still gets a synthetic entry here
   * (`title: null`) — table-region coverage is incomplete on real sets
   * (federal-mech: 645 label tokens on schedule-role sheets, outside every
   * extracted region, are still schedule content, not drawn plan tags),
   * never a drawn field instance to count. */
  in_table: { sheet: string; title: string | null } | null;
  /** True when this text equals one of the SET's own sheet numbers — a
   * cross-reference callout ("SEE M-501"), never a device tag. */
  sheet_callout: boolean;
}

const toLabelSpan = (s: { str: string; x: number; y: number; w: number; h: number; rot?: number }): LabelSpan => ({
  str: s.str,
  x0: s.x,
  y0: s.y,
  x1: s.x + (s.w || 0),
  y1: s.y + (s.h || 0),
  ...(s.rot ? { rot: s.rot } : {}),
});

const inRegion = (cx: number, cy: number, r: Bbox): boolean =>
  cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3];

/** A drawn key must carry both a letter and a digit — the same shape the
 * WP0 census harness requires (plans §3.1), so the two never disagree on
 * what counts as a tag-shaped key. */
const isValidKey = (raw: string): boolean => {
  const k = markKey(raw);
  return k.length > 0 && /[A-Z]/.test(k) && /\d/.test(k);
};

const boxId = (b: Bbox): string => `${Math.round(b[0])},${Math.round(b[1])},${Math.round(b[2])},${Math.round(b[3])}`;

/**
 * The set-wide census. `sheetNumbers` is every SheetSpans.sheet_number the
 * set carries (the caller's own already-collected list — this module never
 * re-derives it), used only to flag sheet-callout entries.
 */
export function buildTagIndex(sheets: SheetSpans[], tables: ScheduleTable[], sheetNumbers: string[]): DrawnTag[] {
  const calloutKeys = new Set(sheetNumbers.map((n) => markKey(n)).filter(Boolean));
  const tablesBySheet = new Map<string, ScheduleTable[]>();
  for (const tb of tables) {
    const arr = tablesBySheet.get(tb.sheet) ?? [];
    arr.push(tb);
    tablesBySheet.set(tb.sheet, arr);
  }

  const out: DrawnTag[] = [];
  for (const sheet of sheets) {
    const role = classifySheetRole(sheet).role;
    const labelSpans = sheet.spans.map(toLabelSpan);
    const flatSpans = labelSpans.map((s) => ({ str: s.str, x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1 }));
    const sheetTables = tablesBySheet.get(sheet.key) ?? [];
    const tableFor = (cx: number, cy: number): ScheduleTable | null =>
      sheetTables.find((tb) => inRegion(cx, cy, tb.region)) ?? null;

    // Same drawn run reached by more than one recognition pass (e.g. a
    // joined glyph-split run that labelTokens ALSO reassembles the same
    // way) must contribute exactly one DrawnTag, never two.
    const seen = new Set<string>();

    const addTag = (text: string, bbox: Bbox, rot: number, source: DrawnTag["source"]) => {
      const trimmed = (text || "").trim().toUpperCase();
      if (!isValidKey(trimmed)) return;
      const id = `${boxId(bbox)}|${trimmed}`;
      if (seen.has(id)) return;
      seen.add(id);

      const cx = (bbox[0] + bbox[2]) / 2;
      const cy = (bbox[1] + bbox[3]) / 2;
      const tb = tableFor(cx, cy);
      let inTable: DrawnTag["in_table"] = tb ? { sheet: sheet.key, title: tb.title?.text ?? null } : null;
      if (!inTable && role === "schedule") inTable = { sheet: sheet.key, title: null };

      const multiplier = scheduleCountMultiplier(flatSpans, bbox);
      out.push({
        sheet: sheet.key,
        role,
        text: trimmed,
        key: markKey(trimmed),
        family: canonicalLabelFamily(trimmed),
        bbox,
        rot,
        source: multiplier > 1 ? "count_prefixed" : source,
        multiplier,
        in_table: inTable,
        sheet_callout: calloutKeys.has(markKey(trimmed)),
      });
    };

    // Pass 1 — labelTokens: the richest recogniser already on the shared
    // path (exact runs, glyph-split joins, stacked prefix-over-number
    // bubbles, stacked BAS points, inline airflow families). A token whose
    // box matches an ORIGINAL span exactly (same text, same box) is a
    // plain single-run match ("exact"); a hyphenated result that does not
    // is a glyph-split rejoin ("joined"); anything else is a multi-run
    // reconstruction (a stacked bubble) — "stacked".
    const byBox = new Map<string, LabelSpan>();
    for (const s of labelSpans) byBox.set(boxId([s.x0, s.y0, s.x1, s.y1]), s);
    for (const tok of labelTokens(labelSpans)) {
      const box: Bbox = [tok.x0, tok.y0, tok.x1, tok.y1];
      const orig = byBox.get(boxId(box));
      const exact = !!orig && orig.str.trim().toUpperCase() === tok.str.trim().toUpperCase();
      const source: DrawnTag["source"] = exact ? "exact" : /-/.test(tok.str) ? "joined" : "stacked";
      addTag(tok.str, box, tok.rot ?? 0, source);
    }

    // Pass 2 — isEquipTag on glyph-joined runs. labelTokens's own admission
    // rule exists to feed symbol-sweep label ATTACHMENT (narrower than a
    // census: it excludes note-shaped and ambiguous tokens a census must
    // still see), so a pure `isEquipTag` pass over the same joined spans
    // recovers tags labelTokens itself declines to admit.
    for (const s of joinHyphenatedTags(labelSpans)) {
      const t = s.str.trim().toUpperCase();
      if (/\s/.test(t) || !isEquipTag(t)) continue;
      addTag(t, [s.x0, s.y0, s.x1, s.y1], s.rot ?? 0, "joined");
    }

    // Pass 3 — key-free compound runs ("R1 /C-11") with no known target key.
    for (const s of labelSpans) {
      const lead = compoundRunLeadTag(s.str);
      if (!lead) continue;
      addTag(lead, [s.x0, s.y0, s.x1, s.y1], s.rot ?? 0, "compound");
    }
  }
  return out;
}

/** Every occurrence of one drawn key (markKey-based identity). */
export function tagIndexFor(index: readonly DrawnTag[], key: string): DrawnTag[] {
  const k = markKey(key);
  return index.filter((t) => t.key === k);
}

/** Real, drawn plan-sheet instances only — never a sheet-callout, never
 * text sitting inside a table's own region (a schedule row label, even
 * one printed in the corner of an otherwise plan-role sheet). */
export function planTags(graph: { tags?: readonly DrawnTag[] }): DrawnTag[] {
  return (graph.tags ?? []).filter((t) => t.role === "plan" && !t.sheet_callout && !t.in_table);
}

/** Every other real, drawn instance — schematic/legend/schedule/detail/
 * elevation/demolition/unknown roles — still never a sheet-callout or a
 * table-region row label. This is disclosure, never installed-work
 * evidence: sweeps still gate on role === "plan" only. */
export function referenceTags(graph: { tags?: readonly DrawnTag[] }): DrawnTag[] {
  return (graph.tags ?? []).filter((t) => t.role !== "plan" && !t.sheet_callout && !t.in_table);
}
