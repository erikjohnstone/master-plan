/**
 * P2 — grid typing for schedule tables (shared Session path).
 * Scores header lexicon + content signals; no corpus-specific hardcoding.
 */
import {
  isBasPointsListTable,
  isBasPointsListTitle,
  isControlValveHeaderShape,
  tableHeaderBlob,
} from "./corpusTakeoff.mjs";
import { compareSheetKeys } from "./sheetKey.ts";

/** @typedef {"VALVE_SCHEDULE"|"DAMPER_SCHEDULE"|"ACTUATOR_SCHEDULE"|"POINTS_LIST"|"EQUIPMENT_SCHEDULE"|"LEGEND"|"OTHER"} GridType */

const VALVE_LEX =
  /\b(CV|Cv|GPM|SIZE|BODY|2[\-\s]?WAY|3[\-\s]?WAY|GLOBE|BALL|BUTTERFLY|FAIL|N\.?O\.?|N\.?C\.?|CLOSE[\-\s]?OFF|ACTUATOR|SPRING|FLOW|SERVED|MANUFACTURER|MODEL)\b/i;
const DAMPER_LEX =
  /\b(DAMPER|BLADE|OPPOSED|PARALLEL|SMOKE|FSD|FIRE[\-\s]?SMOKE|BACKDRAFT|TORQUE|IN[\-\s]?LB|CFM|AIRFLOW)\b/i;
const ACTUATOR_LEX = /\b(ACTUATOR|ACTUATION|TORQUE|SPRING[\-\s]?RETURN|MODULATING|TWO[\-\s]?POSITION|FLOATING|0[\-\s]?10|4[\-\s]?20)\b/i;
const POINTS_LEX =
  /\b(AI|AO|DI|DO|BI|BO|UI|UO|ALARM|TREND|SOFTWARE|NETWORK|POINT\s*TYPE|I\s*\/\s*O)\b/i;
const LEGEND_LEX = /\b(LEGEND|SYMBOL|DESCRIPTION|ABBREVIATION)\b/i;
const EQUIP_LEX =
  /\b(AHU|RTU|FCU|VAV|DOAS|BOILER|CHILLER|PUMP|FAN|DIFFUSER|GRILLE|CONDENSING|HEAT\s*PUMP)\b/i;

const MARK_RE = /\b[A-Z]{1,5}[- .]?\d+(?:[- .]\d+[A-Z]?)*\b/i;

function scoreLex(blob, re) {
  const hits = blob.match(new RegExp(re.source, re.flags + "g"));
  return hits ? hits.length : 0;
}

function pointsMarkDensity(table) {
  let markCols = 0;
  let xMarks = 0;
  const blob = tableHeaderBlob(table);
  if (/AI|AO|DI|DO|BI|BO|UI|UO/i.test(blob)) markCols += 1;
  for (const row of table?.rows || []) {
    for (const cell of Object.values(row.cells || {})) {
      const t = String(cell?.text || "").trim();
      if (/^[Xx✓•●]$/.test(t)) xMarks += 1;
      if (/^(AI|AO|DI|DO|BI|BO|UI|UO)$/i.test(t)) markCols += 1;
    }
  }
  return { markCols, xMarks };
}

/**
 * @param {import("./sheetgraph.ts").ScheduleTable} table
 * @returns {{ type: GridType, score: number, signals: string[] }}
 */
export function classifyGrid(table) {
  const title = String(table?.title?.text || "").trim();
  const blob = tableHeaderBlob(table);
  const signals = [];

  if (isBasPointsListTitle(title) || isBasPointsListTable(table)) {
    signals.push("bas_title_or_header_shape");
    return { type: "POINTS_LIST", score: 0.95, signals };
  }
  if (isControlValveHeaderShape(table)) {
    signals.push("control_valve_header_shape");
    return { type: "VALVE_SCHEDULE", score: 0.92, signals };
  }

  const scores = {
    VALVE_SCHEDULE: scoreLex(blob, VALVE_LEX),
    DAMPER_SCHEDULE: scoreLex(blob, DAMPER_LEX),
    ACTUATOR_SCHEDULE: scoreLex(blob, ACTUATOR_LEX),
    POINTS_LIST: scoreLex(blob, POINTS_LEX),
    LEGEND: scoreLex(blob, LEGEND_LEX),
    EQUIPMENT_SCHEDULE: scoreLex(blob, EQUIP_LEX),
    OTHER: 0,
  };

  const { markCols, xMarks } = pointsMarkDensity(table);
  if (markCols >= 2 || xMarks >= 3) {
    scores.POINTS_LIST += 3 + Math.min(xMarks, 6) * 0.2;
    signals.push(`points_marks:${xMarks}`);
  }

  if (/CONTROL\s+VALVE|CHW|HHW|HYDRONIC\s+VALVE/i.test(title + " " + blob)) {
    scores.VALVE_SCHEDULE += 2;
    signals.push("title_valve");
  }
  if (/DAMPER|SMOKE|FIRE[\-\s]?SMOKE|BACKDRAFT/i.test(title)) {
    scores.DAMPER_SCHEDULE += 2;
    signals.push("title_damper");
  }
  if (/LEGEND/i.test(title)) {
    scores.LEGEND += 3;
    signals.push("title_legend");
  }
  if (/I\s*\/\s*O|POINTS?\s+LIST|DDC/i.test(title)) {
    scores.POINTS_LIST += 2;
    signals.push("title_points");
  }

  let markHits = 0;
  for (const row of table?.rows || []) {
    const tag = String(row.key || "").trim();
    if (MARK_RE.test(tag)) markHits += 1;
  }
  if (markHits >= 2) {
    scores.VALVE_SCHEDULE += 0.5;
    scores.DAMPER_SCHEDULE += 0.5;
    scores.EQUIPMENT_SCHEDULE += 0.3;
  }

  const ranked = Object.entries(scores)
    .filter(([k]) => k !== "OTHER")
    .sort((a, b) => b[1] - a[1]);
  const [bestType, bestScore] = ranked[0] || ["OTHER", 0];
  const secondScore = ranked[1]?.[1] ?? 0;

  if (bestScore < 2 || bestScore - secondScore < 0.5) {
    if (table?.kind === "equipment" && markHits >= 1) {
      return { type: "EQUIPMENT_SCHEDULE", score: 0.55, signals: [...signals, "fallback_equipment"] };
    }
    return { type: "OTHER", score: 0.4, signals: [...signals, "low_confidence"] };
  }

  const norm = Math.min(1, 0.55 + bestScore * 0.08);
  return { type: /** @type {GridType} */ (bestType), score: norm, signals };
}

export function classifyAllGrids(graph) {
  const tables = [...(graph?.tables || [])].sort((a, b) =>
    compareSheetKeys(a.sheet, b.sheet) || String(a.title?.text || "").localeCompare(String(b.title?.text || "")),
  );
  return tables.map((table, id) => {
    const g = classifyGrid(table);
    return {
      tableId: id,
      sheet: table.sheet,
      title: table.title?.text || "",
      kind: table.kind,
      type: g.type,
      score: g.score,
      signals: g.signals,
    };
  });
}

export { VALVE_LEX, DAMPER_LEX, POINTS_LEX };
