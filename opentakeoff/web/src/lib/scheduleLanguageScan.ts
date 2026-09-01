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

/** Session hook: legend/unknown sheets with extractable POINTS/DDC list titles. */
export function sheetHasPointsListTitleSpans(spans: GraphSpan[]): boolean {
  for (const sp of spans) {
    const t = spanText(sp);
    if (t.length < 10 || t.length > 120) continue;
    if (/\bPOINTS?\s+LIST\b/i.test(t)) return true;
    if (/\bFCU WITH\b.+\bDDC POINTS LIST$/i.test(t)) return true;
    if (/\bUNIT HEATER DDC POINTS LIST$/i.test(t)) return true;
    if (/^I\s*\/\s*O\s+LIST\b/i.test(t) || /^IO\s+LIST\b/i.test(t)) return true;
    if (/\b(DDC|BAS|PLC)\b.+\b(POINTS?|I\s*\/\s*O)\b/i.test(t)) return true;
    if (/\b(AHU|BOILER|VFD|FCU|RTU|PUMP|CHILLER)\b.+\bPOINTS?\s+LIST\b/i.test(t)) return true;
  }
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
