/**
 * Shared schedule/BAS/valve language scan — detects printed titles and keywords
 * Pillars A–D missed when geometric extraction returned zero tables.
 */
import type { GraphSpan } from "./sheetgraph.ts";

/** Valve / damper / actuator schedule language in vector text. */
export const VALVE_SCHEDULE_LANGUAGE_RE =
  /\b(VALVE\s+SCHEDULE|CONTROL\s+VALVE|CHW\s+VALVE|HHW\s+VALVE|GLOBE\s+VALVE|BUTTERFLY\s+VALVE|BALANCE\s+VALVE|ACTUATOR|MODULAT(?:ING|OR)|DAMPER\s+SCHEDULE|FIRE\s*SMOKE\s+DAMPER|SMOKE\s+DAMPER|BACKDRAFT|VOLUME\s+DAMPER)\b/i;

/** BAS / points-list language in vector text (title or body). */
export const BAS_POINTS_LANGUAGE_RE =
  /\b(POINTS?\s+LIST|DDC\s+POINTS?|I\s*\/\s*O\s+LIST|IO\s+LIST|HARD\s+POINTS?|SOFT\s+POINTS?|BAS\s+POINTS?|PLC\s+POINTS?|INPUT\s+OUTPUT|AI\s+AO\s+DI\s+DO)\b/i;

/** Broader schedule table gate — extends scheduleGridFallback keywords. */
export const PILLAR_GAP_KEYWORD_RE =
  /\b(SCHEDULE|SCHEDULES|POINTS?\s+LIST|DDC\s+POINTS?|CONTROL\s+VALVE|CHW|HHW|VAV|AHU|BOILER|PUMP|FAN|DIFFUSER|DAMPER|ACTUATOR|MODULAT(?:ING|OR)|GLOBE|BUTTERFLY|I\s*\/\s*O|BACNET|CONTROLS?\s+NARRATIVE|SEQUENCE\s+OF\s+OPERATION)\b/i;

export type PillarGapKind = "valve" | "bas" | "both" | "generic";

export interface PillarGapLanguageHit {
  kind: PillarGapKind;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function spanText(sp: GraphSpan): string {
  return String(sp.str || "").replace(/\s+/g, " ").trim();
}

export function scanPillarGapLanguage(spans: GraphSpan[]): PillarGapLanguageHit[] {
  const hits: PillarGapLanguageHit[] = [];
  for (const sp of spans) {
    const t = spanText(sp);
    if (t.length < 8 || t.length > 140) continue;
    const valve = VALVE_SCHEDULE_LANGUAGE_RE.test(t);
    const bas = BAS_POINTS_LANGUAGE_RE.test(t);
    if (!valve && !bas && !PILLAR_GAP_KEYWORD_RE.test(t)) continue;
    hits.push({
      kind: valve && bas ? "both" : valve ? "valve" : bas ? "bas" : "generic",
      text: t.slice(0, 120),
      x: sp.x,
      y: sp.y,
      w: sp.w,
      h: sp.h,
    });
  }
  return hits;
}

/** A PRINTED SCHEDULE CAPTION — a standalone, upper-case title line that ends
 *  in SCHEDULE. Deliberately much narrower than `sheetHasScheduleLanguage`,
 *  which is a keyword scan and therefore useless on a plan sheet: equipment
 *  words are everywhere on a floor plan, which is exactly why
 *  `isScheduleTarget` refused plan sheets outright.
 *
 *  A caption is different. A floor plan does not print "EQUIPMENT SCHEDULE" as
 *  a standalone heading unless it carries one — and plenty of them do, tucked
 *  in a corner beside the plan. Measured on 13_MI#10 (sheet A-003, FIRST FLOOR
 *  PLAN - AREA A): it prints EQUIPMENT SCHEDULE over a real 7-column ruled
 *  table, vectorgrid was never offered the sheet because its role is `plan`,
 *  and the geometric extractor's older, narrower read reached the estimator
 *  instead — 3 of 7 columns, box truncated at the MODEL column. vectorgrid,
 *  run on that page by hand, returns all 7 columns and 57 cells with 0
 *  orphans.
 *
 *  LEGEND / LIST / INDEX are excluded on purpose: a legend is not a schedule,
 *  and a drawing index is a table nobody takes off. */
const SCHEDULE_CAPTION_RE = /^[A-Z0-9][A-Z0-9 ,.'&/()#-]{4,70}SCHEDULES?$/;

/** A cross-reference is not a caption. Plan sheets are covered in notes like
 *  "SEE EQUIPMENT SCHEDULE" and "REFER TO PANEL SCHEDULE", which end in the
 *  same word and would otherwise offer every plan sheet in the set to
 *  vectorgrid. Offering a sheet costs precision — the sheet that motivated
 *  this picked up one junk 1x3 "A" region from its key plan alongside the
 *  correct table — so the gate stays as narrow as the evidence allows. */
const CAPTION_XREF_RE = /^(SEE|REFER|REFERENCE|PER|FOR|AS|NOTE|NOTES|CONTINUED|CONT)\b/;

/** A caption's own variable part — the panel/unit ID — is routinely drafted
 *  as its OWN text run, distinct from the fixed "EXISTING PANEL" / "SCHEDULE"
 *  wording around it (a template title with the tag substituted per
 *  instance). Measured on 009_FL#30: "EXISTING PANEL ELP SCHEDULE" comes back
 *  from pdf.js as three separate spans — "EXISTING PANEL", "ELP", "SCHEDULE"
 *  — none of which alone matches SCHEDULE_CAPTION_RE, so five real panel
 *  schedules on a `plan` sheet were invisible to the single-span scan below.
 *  Spans on the same printed line, close enough together to be one caption
 *  and not two unrelated ones, get joined before the regex ever sees them. */
function joinCaptionLines(spans: GraphSpan[], includeSingleSpans = false): string[] {
  const rows: GraphSpan[][] = [];
  for (const sp of [...spans].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const h = sp.h || 12;
    const row = rows.find((r) => Math.abs(r[0].y - sp.y) <= Math.max(2, 0.5 * Math.max(h, r[0].h || 12)));
    if (row) row.push(sp);
    else rows.push([sp]);
  }
  const lines: string[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cluster: GraphSpan[] = [row[0]];
    const flush = () => {
      if (includeSingleSpans || cluster.length > 1) lines.push(cluster.map(spanText).join(" ").replace(/\s+/g, " ").trim());
    };
    for (let i = 1; i < row.length; i++) {
      const prev = cluster[cluster.length - 1];
      const gap = row[i].x - (prev.x + (prev.w || 0));
      const maxGap = Math.max(60, 3 * Math.max(prev.h || 12, row[i].h || 12));
      if (gap <= maxGap) cluster.push(row[i]);
      else {
        flush();
        cluster = [row[i]];
      }
    }
    flush();
  }
  return lines;
}

export function sheetHasScheduleCaption(spans: GraphSpan[]): boolean {
  for (const sp of spans) {
    const t = spanText(sp).replace(/\s+/g, " ").trim();
    if (t.length < 8 || t.length > 78) continue;
    if (CAPTION_XREF_RE.test(t)) continue;
    if (SCHEDULE_CAPTION_RE.test(t)) return true;
  }
  for (const t of joinCaptionLines(spans)) {
    if (t.length < 8 || t.length > 78) continue;
    if (CAPTION_XREF_RE.test(t)) continue;
    if (SCHEDULE_CAPTION_RE.test(t)) return true;
  }
  return false;
}

/** Strict printed points-list caption for admitting an otherwise non-schedule
 * drawing. The older title hook deliberately remains broader for legend/unknown
 * pages. Admission only offers the page to the existing structural extractor;
 * it neither creates a table nor changes the sheet's role.
 *
 * Evaluate whole spatial lines, not each fragment independently: in a split
 * "SEE" + "POINTS LIST" reference, the second run is not a caption. */
export function sheetHasPointsListCaption(spans: GraphSpan[]): boolean {
  // Every accepted caption ends in LIST or POINT(S)LIST. Avoid assembling all
  // page lines when that terminal word is absent (the common non-BAS case).
  if (!spans.some(sp => /\b(?:LIST|POINTS?LIST)\b/.test(spanText(sp)))) return false;
  return joinCaptionLines(spans, true).some((text) => {
    if (text.length < 8 || text.length > 120) return false;
    if (/\b(SEE|REFER|REFERENCE|PER|AS|NOTE|NOTES|SHALL|PROVIDE)\b/.test(text)) return false;
    return /^(?:[A-Z0-9][A-Z0-9 ,.'&/()#-]* )?(?:POINTS? ?LIST|I\s*\/\s*O LIST|IO LIST)$/.test(text);
  });
}

/** Session hook: legend/unknown sheets with extractable POINTS/DDC list titles.
 *
 *  Single-span first (cheap, the common case), then the SAME joined-line pass
 *  `sheetHasScheduleCaption` already needed above — for the identical reason.
 *  Real, corpus-found (v3 full-corpus audit, 056_NY_VA_Project_632_19_106's
 *  own sheet #5, "AUTOMATIC TEMPERATURE CONTROL DIAGRAM"): a real, ruled
 *  "POINTS LIST" table for VAV AIR HANDLER AHU-1 — title, SYSTEM: subheader,
 *  ~20 real point rows (RELIEF AIR TEMPERATURE | AI-1 | RAT, …) — sits on a
 *  sheet whose role is `unknown` (no ROLE_SIGNALS entry matches a CONTROL
 *  DIAGRAM title) and whose own drafting split "POINTS LIST" across two
 *  separate pdf.js spans, the same CAD-export fragmentation
 *  `joinCaptionLines` was already written to survive for a schedule caption.
 *  Every regex here only ever saw ONE span at a time, so a split title was
 *  invisible to `isScheduleTarget`'s `role === "unknown"` fallback and the
 *  sheet was never offered to the table extractor at all — a real, ruled
 *  table read as zero tables, not a borderline case. */
export function sheetHasPointsListTitleSpans(spans: GraphSpan[]): boolean {
  const test = (t: string): boolean => {
    if (t.length < 10 || t.length > 120) return false;
    if (/\bPOINTS?\s+LIST\b/i.test(t)) return true;
    if (/\bFCU WITH\b.+\bDDC POINTS LIST$/i.test(t)) return true;
    if (/\bUNIT HEATER DDC POINTS LIST$/i.test(t)) return true;
    if (/^I\s*\/\s*O\s+LIST\b/i.test(t) || /^IO\s+LIST\b/i.test(t)) return true;
    if (/\b(DDC|BAS|PLC)\b.+\b(POINTS?|I\s*\/\s*O)\b/i.test(t)) return true;
    if (/\b(AHU|BOILER|VFD|FCU|RTU|PUMP|CHILLER)\b.+\bPOINTS?\s+LIST\b/i.test(t)) return true;
    return false;
  };
  for (const sp of spans) if (test(spanText(sp))) return true;
  for (const t of joinCaptionLines(spans)) if (test(t)) return true;
  return false;
}

/** A cover/index sheet's own DRAWING LIST / SHEET INDEX table — real, ruled,
 * genuinely a schedule (SHEET NUMBER | SHEET NAME | SCALE columns), on a
 * sheet classifySheetRole now correctly reads as `unknown` (see
 * sheetgraph.ts's own matching ROLE_SIGNALS entry — kept in sync with THIS
 * regex deliberately, not copy-pasted independently) rather than the false
 * "plan" a stray in-table row value ("FIRST FLOOR PLAN" as one of the 49
 * listed sheet names) used to produce. Role alone does not reach the table:
 * `isScheduleTarget`'s `unknown` fallback and enhanceTablesWithODL's own
 * scheduleSheets filter both still gate on a caption test, and
 * sheetHasPointsListTitleSpans is a different, narrower vocabulary (BAS/DDC
 * points, not a sheet index) that must not be widened to cover this — real,
 * found live: 08_ME's own cover sheet, 49 real rows, 0 extracted. */
export function sheetHasDrawingIndexTitleSpans(spans: GraphSpan[]): boolean {
  const test = (t: string): boolean => {
    if (t.length < 8 || t.length > 78) return false;
    return /^(?:[A-Z]+\s+)?(?:SHEET\s+INDEX|DRAWING\s+INDEX|INDEX\s+OF\s+DRAWINGS|DRAWING\s+LIST)$/i.test(t);
  };
  for (const sp of spans) if (test(spanText(sp))) return true;
  for (const t of joinCaptionLines(spans)) if (test(t)) return true;
  return false;
}

export function sheetHasScheduleLanguage(spans: GraphSpan[]): boolean {
  if (sheetHasPointsListTitleSpans(spans)) return true;
  return scanPillarGapLanguage(spans).length > 0;
}

/** Region below a title anchor for forced stream/sidecar recovery. */
export function titleAnchorRegion(
  hit: PillarGapLanguageHit,
  width: number,
  height: number,
): [number, number, number, number] {
  const padX = 56;
  const padTop = 8;
  const bandH = Math.min(1600, height - hit.y);
  return [
    Math.max(0, hit.x - padX),
    Math.max(0, hit.y + hit.h + padTop),
    Math.min(width, hit.x + hit.w + padX + 480),
    Math.min(height, hit.y + hit.h + padTop + bandH),
  ];
}

export function filterSpansToRegion(spans: GraphSpan[], region: [number, number, number, number]): GraphSpan[] {
  const [x0, y0, x1, y1] = region;
  return spans.filter((sp) => {
    const cx = sp.x + sp.w / 2;
    const cy = sp.y + sp.h / 2;
    return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
  });
}
