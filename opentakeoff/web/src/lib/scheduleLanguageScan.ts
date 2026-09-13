/**
 * Shared schedule/BAS/valve language scan — detects printed titles and keywords
 * Pillars A–D missed when geometric extraction returned zero tables.
 */
import type { GraphSpan, Bbox } from "./sheetgraph.ts";

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
const SCHEDULE_CAPTION_RE = /^[A-Z0-9][A-Z0-9 ,.'&/()#-]{4,70}SCHEDULES?(?: \([A-Z0-9 &'/-]{2,30}\))?$/;

/** Some equipment tables are captioned as the collection they enumerate,
 * without the literal word SCHEDULE. This is intentionally available only
 * to `nearbyScheduleCaption`, after a real grid has already been detected;
 * it does NOT widen the plan-sheet routing gate above. The terminal
 * UNITS/EQUIPMENT noun plus an HVAC-system noun keeps ordinary drawing prose
 * and callouts out. Real example: `SPLIT SYSTEM AIR CONDITIONING UNITS` on
 * bldg5406 M-601, immediately beside a separately titled chiller schedule. */
const EQUIPMENT_TABLE_CAPTION_RE = /^(?=[A-Z0-9 ,.'&/()#-]{8,78}$)(?=.*\b(?:AIR\s+CONDITIONING|AIR\s+HANDLING|FAN\s+COIL|CONDENSING|ROOFTOP|PACKAGED|CHILLER|BOILER|PUMP|VARIABLE\s+AIR\s+VOLUME|TERMINAL)\b)[A-Z0-9 ,.'&/()#-]*\b(?:UNITS?|EQUIPMENT)$/;

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
function isDrawingIndexTitle(t: string): boolean {
  if (t.length < 8 || t.length > 78) return false;
  return /^(?:[A-Z]+\s+)?(?:SHEET\s+INDEX|DRAWING\s+INDEX|INDEX\s+OF\s+DRAWINGS|DRAWING\s+LIST)$/i.test(t);
}

export function sheetHasDrawingIndexTitleSpans(spans: GraphSpan[]): boolean {
  for (const sp of spans) if (isDrawingIndexTitle(spanText(sp))) return true;
  for (const t of joinCaptionLines(spans)) if (isDrawingIndexTitle(t)) return true;
  return false;
}

/** `sheetHasDrawingIndexTitleSpans` answers "does this SHEET carry a drawing-
 *  index caption anywhere" — the routing question `isScheduleTarget` needed.
 *  It closed the recall half of the 08_ME bug (STATE.md §2a / goal
 *  VECTORGRID_TABLE_BOXES.md, 2026-09-12): the sheet gets offered to
 *  vectorgrid now. It never closed the other half — `scheduleTableFromODL`'s
 *  own title search only ever looks INSIDE the ruled grid's own row 0 for a
 *  spanning title cell, which is the shape a schedule whose name is drawn as
 *  its own header ROW has, but not the shape a cover-sheet caption has: a
 *  free-floating text run sitting ABOVE and OUTSIDE the ruled grid, on its
 *  own underline, never a cell of the table at all. Measured live: vectorgrid
 *  finds 08_ME's own DRAWING LIST grid exactly (52x8, matching its 49 real
 *  sheet rows), and it is still refused with reason "unknown kind and no
 *  title" — the SAME table, offered correctly, declined for a completely
 *  different reason once it arrives.
 *
 *  This is that other half: given the table's own bounding box (already in
 *  project space — the same space GraphSpan.x/y already use, see
 *  odlBboxToProjectSpace's own callers), look for the SAME proven caption
 *  vocabulary as sheetHasDrawingIndexTitleSpans, but only among spans sitting
 *  in the band directly above the table (captions are drawn above what they
 *  name, never below or beside it on the sheets this vocabulary was built
 *  from) and roughly over its own horizontal extent. Scoped to this one
 *  proven vocabulary, not sheetHasScheduleCaption's broader one, so a busy
 *  cover sheet's unrelated "X SCHEDULE" caption elsewhere on the page can
 *  never be borrowed by a table it doesn't belong to. */
export function nearbyDrawingIndexCaptionText(spans: GraphSpan[], region: Bbox): string | null {
  const [rx0, ry0, rx1, ry1] = region;
  const w = rx1 - rx0;
  const marginX = Math.max(40, w * 0.5);
  const bandTop = ry0 - 260;
  const bandBottom = ry0 + (ry1 - ry0) * 0.15;
  const near = spans.filter((sp) => {
    const cx = sp.x + sp.w / 2;
    const sy1 = sp.y + sp.h;
    return sy1 >= bandTop && sp.y <= bandBottom && cx >= rx0 - marginX && cx <= rx1 + marginX;
  });
  if (!near.length) return null;
  for (const sp of near) { const t = spanText(sp); if (isDrawingIndexTitle(t)) return t; }
  for (const t of joinCaptionLines(near)) if (isDrawingIndexTitle(t)) return t;
  return null;
}

export interface NearbyScheduleCaption {
  text: string;
  bbox: Bbox;
}

const bboxForSpans = (spans: GraphSpan[]): Bbox => [
  Math.min(...spans.map((sp) => sp.x)),
  Math.min(...spans.map((sp) => sp.y)),
  Math.max(...spans.map((sp) => sp.x + sp.w)),
  Math.max(...spans.map((sp) => sp.y + sp.h)),
];

const compactCaption = (text: string): string => text.toUpperCase().replace(/[^A-Z0-9]+/g, "");

function isScheduleCaptionText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length >= 8
    && normalized.length <= 78
    && !CAPTION_XREF_RE.test(normalized)
    && (SCHEDULE_CAPTION_RE.test(normalized) || EQUIPMENT_TABLE_CAPTION_RE.test(normalized));
}

const COMPLETE_CAPTION_HEAD_RE = /^(?:AIR|PACKAGED|SPLIT|FAN|PUMP|CHILLER|BOILER|GRILLE|REGISTER|DIFFUSER|LOUVER|EXPANSION|COMPRESSION|CONTROL|BAS|DDC|HVAC|VARIABLE|SUPPLY|RETURN|EXHAUST|HEATING|COOLING|CONDENSING|WATER|STEAM|ELECTRIC|GAS|ROOFTOP|UNIT|EQUIPMENT|MECHANICAL)\b/;

function hasCompleteCaptionHead(text: string): boolean {
  return COMPLETE_CAPTION_HEAD_RE.test(text.replace(/\s+/g, " ").trim());
}

function isVerticalCaptionSpan(sp: GraphSpan): boolean {
  if (sp.rot != null) return Math.abs(sp.rot % 180) === 90;
  return spanText(sp).length >= 2 && sp.h > Math.max(12, 1.8 * sp.w);
}

/** Recover the printed title physically attached to one already-detected
 * schedule grid. CAD exports routinely place that title outside the ruled
 * table and, for narrow schedule strips, rotate it 90 degrees and split it
 * into several source runs ("PU" + "P SCHEDULE", "LOU" +
 * "ER SCHEDULE"). ODL can therefore find the grid and rows correctly while
 * naming it only MARK, P SCHEDULE, or nothing at all.
 *
 * This does not discover tables or alter cells. It only associates a strict,
 * standalone, upper-case `... SCHEDULE` caption with a grid that has already
 * been found, and returns the exact source bbox as evidence. Candidates must
 * overlap the grid on the axis perpendicular to the caption and sit in a
 * narrow band above/beside it; unrelated schedule titles elsewhere on a busy
 * sheet cannot compete. */
export function nearbyScheduleCaption(
  spans: GraphSpan[],
  region: Bbox,
  currentTitle = "",
): NearbyScheduleCaption | null {
  const [rx0, ry0, rx1, ry1] = region;
  const rw = Math.max(1, rx1 - rx0);
  const rh = Math.max(1, ry1 - ry0);
  const candidates: Array<NearbyScheduleCaption & { vertical: boolean; parts: number; strongHead: boolean }> = [];
  const seen = new Set<string>();

  const add = (parts: GraphSpan[], vertical: boolean) => {
    if (!parts.length) return;
    const text = parts.map(spanText).join(" ").replace(/\s+/g, " ").trim();
    if (!isScheduleCaptionText(text)) return;
    const bbox = bboxForSpans(parts);
    const key = `${compactCaption(text)}|${bbox.map((n) => Math.round(n)).join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ text, bbox, vertical, parts: parts.length, strongHead: hasCompleteCaptionHead(text) });
  };

  for (const sp of spans) add([sp], isVerticalCaptionSpan(sp));

  // Horizontal captions split into template/tag/template runs on one line.
  const horizontal = spans.filter((sp) => !isVerticalCaptionSpan(sp));
  const rows: GraphSpan[][] = [];
  for (const sp of [...horizontal].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r[0].y - sp.y) <= Math.max(2, 0.5 * Math.max(r[0].h || 12, sp.h || 12)));
    if (row) row.push(sp); else rows.push([sp]);
  }
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cluster: GraphSpan[] = [];
    const flush = () => {
      if (cluster.length) add(cluster, false);
      cluster = [];
    };
    for (const sp of row) {
      if (!cluster.length) {
        cluster = [sp];
        continue;
      }
      const prev = cluster[cluster.length - 1];
      const gap = sp.x - (prev.x + prev.w);
      const maxGap = Math.max(60, 3 * Math.max(prev.h || 12, sp.h || 12));
      if (gap <= maxGap) cluster.push(sp); else { flush(); cluster = [sp]; }
    }
    flush();
  }

  // Vertical captions are commonly split along the reading axis. Anchor each
  // possible terminal `SCHEDULE` run, then prepend only tightly aligned runs.
  const vertical = spans.filter(isVerticalCaptionSpan).sort((a, b) => a.x - b.x || a.y - b.y);
  for (const terminal of vertical.filter((sp) => /SCHEDULES?\s*$/i.test(spanText(sp)))) {
    const aligned = vertical
      .filter((sp) => {
        const terminalCx = terminal.x + terminal.w / 2;
        const cx = sp.x + sp.w / 2;
        // Split runs of one vertical title share essentially the same text
        // axis. An 18px allowance was wide enough to pull an adjacent
        // attribute tier into a complete caption (real chiller grid:
        // OPERATING at x=634.5, title at x=649.1). Eight pixels still covers
        // ordinary CAD run jitter while keeping neighboring columns apart.
        return Math.abs(cx - terminalCx) <= Math.max(8, 0.75 * Math.max(terminal.w, sp.w));
      })
      .sort((a, b) => a.y - b.y);
    const terminalIndex = aligned.indexOf(terminal);
    if (terminalIndex < 0) continue;
    let parts: GraphSpan[] = [terminal];
    add(parts, true);
    for (let i = terminalIndex - 1; i >= 0 && parts.length < 5; i--) {
      const next = parts[0];
      const gap = next.y - (aligned[i].y + aligned[i].h);
      if (gap < -Math.max(4, 0.2 * Math.min(aligned[i].h, next.h)) || gap > 32) break;
      parts = [aligned[i], ...parts];
      add(parts, true);
    }
  }

  const currentCompact = compactCaption(currentTitle);
  const currentIsGeneric = /^(?:MARK|TAG|SYMBOL|ID|KEY|NO|NUMBER)$/.test(currentCompact);
  // Length alone cannot distinguish a truncated source run ("P SCHEDULE")
  // from a deliberately short but complete engineering title ("UNIT HEATER
  // SCHEDULE"). Only the former is eligible to grow into a longer suffix
  // match. Real NAVFAC M-602 otherwise borrowed CABINET UNIT HEATER SCHEDULE
  // from the table above and its five UH-A rows were later collapsed as a
  // duplicate of the genuinely separate cabinet-heater schedule.
  const currentIsWeakSchedule = currentCompact.endsWith("SCHEDULE")
    && currentCompact.length <= 18
    && !hasCompleteCaptionHead(currentTitle);
  const eligible = candidates.filter((candidate) => {
    const compact = compactCaption(candidate.text);
    if (currentCompact) {
      if (!currentIsGeneric
        && !(currentIsWeakSchedule && compact.length > currentCompact.length && compact.endsWith(currentCompact))) return false;
    }
    const [x0, y0, x1, y1] = candidate.bbox;
    const xOverlap = Math.max(0, Math.min(x1, rx1) - Math.max(x0, rx0));
    const yOverlap = Math.max(0, Math.min(y1, ry1) - Math.max(y0, ry0));
    const dx = Math.max(0, rx0 - x1, x0 - rx1);
    const dy = Math.max(0, ry0 - y1, y0 - ry1);
    if (candidate.vertical) {
      const overlapRatio = yOverlap / Math.max(1, y1 - y0);
      return overlapRatio >= 0.3 && dx <= Math.max(120, 0.2 * rw);
    }
    const overlapRatio = xOverlap / Math.max(1, x1 - x0);
    // A horizontal schedule caption belongs above (or in the shallow title
    // tier at the top of) its grid. A caption deep inside this region is the
    // title of a table below it, not this table. Real multi-table schedule
    // pages exposed that lower-neighbour theft when a large rooftop schedule
    // contained a tall remarks tier before its first ruled data row. Allow
    // that wider authored title-to-header gap, but only in the correct
    // direction.
    const shallowTitleTier = y0 <= ry0 + Math.max(36, 0.1 * rh);
    return overlapRatio >= 0.3
      && shallowTitleTier
      && dy <= Math.max(360, 0.75 * rh);
  });
  if (!eligible.length) return null;

  eligible.sort((a, b) => {
    const gap = (candidate: NearbyScheduleCaption & { vertical: boolean; parts: number; strongHead: boolean }): number => {
      const [x0, y0, x1, y1] = candidate.bbox;
      const dx = Math.max(0, rx0 - x1, x0 - rx1);
      const dy = Math.max(0, ry0 - y1, y0 - ry1);
      return candidate.vertical ? dx : dy;
    };
    // A complete engineering-title head wins over a truncated suffix. This
    // distinguishes a genuine one-span `PACKAGED ... CHILLER SCHEDULE` from
    // both (a) an aligned attribute prepended to it (`OPERATING PACKAGED…`)
    // and (b) the last source run of a split title (`PRESSION TANK SCHEDULE`,
    // `ER AND DIFFUSER SCHEDULE`, `P SCHEDULE`). When neither candidate has
    // a complete head, prefer the more fully reconstructed run.
    const head = Number(b.strongHead) - Number(a.strongHead);
    if (head) return gap(a) - gap(b) || head;
    return gap(a) - gap(b) || b.parts - a.parts || compactCaption(b.text).length - compactCaption(a.text).length;
  });
  const { text, bbox } = eligible[0];
  return { text, bbox };
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
