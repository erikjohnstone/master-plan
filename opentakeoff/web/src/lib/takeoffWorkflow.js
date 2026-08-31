/**
 * Durable takeoff workflow router (LangGraph-style state machine without
 * taking a hard dependency on LangGraph Platform / ELv2 runtime).
 *
 * Classifies estimator intents and advances through deterministic phases.
 * The agent loop uses this to:
 *  - narrow tool allowlists per phase
 *  - inject the next legal tool move
 *  - refuse illegal transitions (e.g. cell_contains type-filters before
 *    title-scan counts exist on a points-list takeoff)
 *
 * Extensible: add intents/phases here; do not special-case corpus answers.
 * All patterns are set-agnostic — corpus fixtures prove them; they must not
 * hardcode sheet numbers, building names, or locked counts.
 */

/** @typedef {"corpus_hvac"|"corpus_bas"|"corpus_valves"|"points_takeoff"|"fcu_buildings"|"valve_join"|"project_takeoff"|"equipment_plan_join"|"cross_discipline_join"|"plan_link_refuse"|"schedule_plan_reconcile"|"equipment_schedule"|"room_coordination"|"bas_point_trace"|"symbol_sweep"|"connectivity"|"scale_refuse"|"generic"} TakeoffIntent */

/** Estimator phrasing: "takeoff", "take off", counts, rollups. */
export function goalAsksTakeoff(g) {
  return /\b(?:take\s*offs?|takeoff|quantity\s+takeoff|counts?|how many|totals?|rollup|scheduled)\b/i.test(String(g || ""));
}

/** Loaded set / these drawings / this blueprint — not a named corpus set. */
export function goalNamesLoadedSet(g) {
  const s = String(g || "");
  return /\b(?:this|these|the)\s+(?:blueprint\s+|plan\s+|drawing\s+)?(?:set|drawings|plans|pdf|project)\b/i.test(s)
    || /\bon this (?:blueprint|plan)\s+set\b/i.test(s)
    || /\bof this set\b/i.test(s)
    || /\b(?:loaded|current|open)\s+(?:set|project|drawings|plan)\b/i.test(s)
    || /\bacross (?:this|the)\s+(?:set|project|drawings)\b/i.test(s);
}

/**
 * Set-wide finished takeoff intent (complete/full/entire, or a set-scoped
 * valve/HVAC/BAS takeoff where "complete" is implied by scope).
 */
export function goalAsksCompleteSetTakeoff(g) {
  const s = String(g || "");
  if (!goalAsksTakeoff(s) || !goalNamesLoadedSet(s)) return false;
  if (/\b(?:complete|full|entire|whole)\b/i.test(s)) return true;
  if (/\b(?:control\s+)?valves?\b/i.test(s)) return true;
  if (/\b(?:BAS|DDC)\b/i.test(s) && /\bpoints?\b/i.test(s)) return true;
  if (/\bHVAC\b/i.test(s) && /\bequipment\b/i.test(s)) return true;
  return false;
}

/** Hydronic service filter from goal phrasing (CHW vs HHW only). */
export function valveServiceFromGoal(goal) {
  const g = String(goal || "");
  const chw = /\b(?:CHW|chilled[\s\-]*water)\b/i.test(g);
  const hhw = /\b(?:HHW|hot[\s\-]*water|heating[\s\-]*water)\b/i.test(g);
  if (chw && hhw) return null;
  if (chw) return "CHW";
  if (hhw) return "HHW";
  return null;
}

/** Count distinct HVAC equipment family mentions (set-agnostic). */
export function namedEquipmentFamilyCount(goal) {
  const g = String(goal || "");
  let n = 0;
  if (/\bAHUs?\b/i.test(g)) n += 1;
  if (/\bDOAH\b|dedicated\s+outdoor/i.test(g)) n += 1;
  if (/\bFCUs?\b|fan[\s\-]*coil/i.test(g)) n += 1;
  if (/\bVAVs?\b|volume\s+control\s+box|air\s+terminal\s+box/i.test(g)) n += 1;
  if (/\bchillers?\b/i.test(g)) n += 1;
  if (/\bboilers?\b/i.test(g)) n += 1;
  if (/\bpumps?\b/i.test(g)) n += 1;
  if (/\bRTUs?\b|rooftop/i.test(g)) n += 1;
  if (/\b(?:exhaust\s+)?fans?\b/i.test(g) && !/\bfan[\s\-]*coil/i.test(g)) n += 1;
  return n;
}

/** @typedef {"survey"|"compile"|"title_scans"|"spot_cites"|"paint"|"answer"|"done"} WorkflowPhase */

/**
 * Complete set-wide HVAC / BAS / control-valve takeoffs.
 * @param {string} goal
 * @returns {"hvac_equipment"|"bas_points"|"control_valves"|null}
 */
export function corpusCompileKind(goal) {
  const g = String(goal || "");
  // Named multi-list demos stay on the points_takeoff title-scan path.
  if (namedPointsListTitles(g).length >= 2) return null;
  // Generic "point(s) list takeoff" / "DDC points takeoff" with no named list
  // titles → compile path. Without this, points_takeoff skips title_scans
  // (empty namedTitles) and deadlocks in spot_cites while the evidence gate
  // still demands query_table title="POINTS LIST".
  // Do NOT steal multi-family project_takeoff prompts (D03) that mention a
  // points list alongside HVAC equipment families.
  if (namedPointsListTitles(g).length === 0
    && namedEquipmentFamilyCount(g) === 0
    && /\b(?:points?\s*list|DDC\s+points?(?:\s*list)?)\b/i.test(g)
    && goalAsksTakeoff(g)) {
    return "bas_points";
  }
  if (!goalAsksCompleteSetTakeoff(g)) return null;
  if (/\b(?:BAS|DDC)\b/i.test(g) && /\bpoints?\b/i.test(g)) return "bas_points";
  if (/\b(?:control\s+)?valves?\b/i.test(g)) return "control_valves";
  if (/\bHVAC\b/i.test(g) && /\bequipment\b/i.test(g)) return "hvac_equipment";
  return null;
}

/**
 * @param {string} goal
 * @returns {TakeoffIntent}
 */
export function classifyTakeoffIntent(goal) {
  const g = String(goal || "");
  const corpusKind = corpusCompileKind(g);
  if (corpusKind === "hvac_equipment") return "corpus_hvac";
  if (corpusKind === "bas_points") return "corpus_bas";
  if (corpusKind === "control_valves") return "corpus_valves";

  // Named multi-list points takeoff before multi-family project rollup —
  // list titles often embed AHU/FCU/DOAH tokens that would otherwise trip
  // project_takeoff (e.g. "POINTS LIST AHU-…" / "FCU WITH … DDC POINTS LIST").
  if (namedPointsListTitles(g).length >= 2) {
    return "points_takeoff";
  }

  // Multi-family HVAC (+ optional one points list) project rollup.
  if (namedEquipmentFamilyCount(g) >= 3 && goalAsksTakeoff(g)
    && (/\bHVAC\b/i.test(g) || /\bscheduled\s+unit\s+counts?\b/i.test(g)
      || /\bequipment\b.{0,48}\btakeoff\b|\btakeoff\b.{0,48}\bequipment\b/i.test(g))) {
    return "project_takeoff";
  }

  const pointsListTakeoff = /\b(?:points?\s*list|DDC\s+points?(?:\s*list)?)\b/i.test(g)
    && (/\b(?:AI|AO|BI|BO)\b/i.test(g) || /\bpoint[-\s]?type/i.test(g) || goalAsksTakeoff(g))
    && (/\b(?:row\s+counts?|breakdown|totals?|counts?)\b/i.test(g) || goalAsksTakeoff(g));
  if (pointsListTakeoff) return "points_takeoff";

  if (/\bfan[\s\-]*coil|\bFCUs?\b/i.test(g)
    && /\b(?:buildings?|splits?|cross[- ]building|across\b)/i.test(g)
    && goalAsksTakeoff(g)) {
    return "fcu_buildings";
  }

  if (/\bcontrol\s+valves?\b/i.test(g)
    && /\bschedule\b/i.test(g)
    && goalAsksTakeoff(g)
    && (/\bsweep\b|\binstalled\b|\bplan\b|\bBYPASS\b/i.test(g) || /\bCV-\d|\bBCV-\d/i.test(g))) {
    return "valve_join";
  }

  // Equipment on plan + schedule attrs + related valve/coil.
  if (/\b(?:find|locate)\b/i.test(g)
    && /\b(?:plan|drawings?|installed)\b/i.test(g)
    && /\b(?:schedule|valve|capacity|GPM|CFM|temperature)\b/i.test(g)
    && /\b(?:CH-|AHU-|FCU-|RTU-|VAV-|B-|PUMP-|DOAH-)[A-Z0-9]/i.test(g)) {
    return "equipment_plan_join";
  }

  // Mech schedule ↔ electrical connection schedule.
  if (/\b(?:MCA|MOCP|circuit|connection\s+schedule|electrical)\b/i.test(g)
    && /\b(?:RTU|rooftop|packaged|mechanical|EQUIP)\b/i.test(g)
    && /\b(?:join|matching|connection|voltage|phases?)\b/i.test(g)) {
    return "cross_discipline_join";
  }

  // Schedule ↔ plan reconciliation (Pillar B) — before ad-hoc plan_link_refuse.
  if (/\breconcile\b/i.test(g)
    && /\b(?:plan|drawings?|installed|schedule|scheduled)\b/i.test(g)) {
    return "schedule_plan_reconcile";
  }
  if (/\bscheduled\s+vs\s+installed\b/i.test(g)
    || /\bon the schedule but not drawn\b/i.test(g)
    || /\bwhich equipment is on the schedule but not drawn\b/i.test(g)
    || /\bschedule[\s-]*only\b/i.test(g) && /\bplan[\s-]*only\b/i.test(g)) {
    return "schedule_plan_reconcile";
  }

  // Schedule attrs + plan sweep with honest refuse when not drawn.
  if (/\b(?:sweep|plan)\b/i.test(g)
    && /\b(?:refuse|not drawn|honest|invent plan)\b/i.test(g)
    && /\b(?:schedule|VAV|fan|EF-)\b/i.test(g)) {
    return "plan_link_refuse";
  }

  if (/\broom\b/i.test(g) && /\b(?:finish|diffuser|grille|coordination|RTU)\b/i.test(g)) {
    return "room_coordination";
  }

  if ((/\bpoint mark\b|\bBAS\b.{0,40}\bpoint\b|\balarm\b.{0,40}\btrend\b|\bpoints?\s*list\b/i.test(g))
    && /\b(?:serves|location|section|trace)\b/i.test(g)) {
    return "bas_point_trace";
  }

  // Every placement of one plan symbol from a seed marquee (not schedule MARK sweep).
  if (/\bsymbol[_\s-]*sweep\b/i.test(g)
    || (/\bsymbol\b/i.test(g) && /\b(?:seed|marquee|every\s+instance|every\s+placement|find\s+every)\b/i.test(g))
    || /\bfind\s+every\s+instance\b/i.test(g)) {
    return "symbol_sweep";
  }

  // Valve↔equipment (or pipe/duct) connectivity via drawn linework — not proximity.
  if (/\bconnectivity\b/i.test(g)
    || (/\btrace\b/i.test(g) && /\b(?:valve|pipe|duct|equipment|connect)\b/i.test(g)
      && !/\bpoints?\s*list\b/i.test(g))) {
    return "connectivity";
  }

  // Real-world installed qty / measure that must refuse when the sheet is unscaled.
  if (/\b(?:unscaled|no\s+scale|set_scale|scale\s+first)\b/i.test(g)
    || (/\b(?:installed\s+(?:qty|quantity|length)|linear\s+feet|\bLF\b|measure|duct\s+length)\b/i.test(g)
      && /\b(?:scale|refuse|calibrat)\b/i.test(g))) {
    return "scale_refuse";
  }

  // Named HVAC schedule-family takeoffs (pump, CRAH, diffuser, …) — phrase
  // robust; industry family words, not set-specific schedule titles.
  if (goalAsksTakeoff(g) && (
    /\bschedule\b/i.test(g)
    || /\b(?:AHUs?|DOAHs?|DOAS|VAVs?|FCUs?|RTUs?|CRAHs?|CUHs?|UHs?)\b/i.test(g)
    || /\b(?:chillers?|boilers?|pumps?|humidifiers?|dehumidifiers?)\b/i.test(g)
    || /\b(?:diffusers?|grilles?|registers?|air\s+separators?|expansion\s+tanks?)\b/i.test(g)
    || /\b(?:unit\s+heaters?|cabinet\s+unit\s+heaters?|fan[\s\-]*coils?|rooftop)\b/i.test(g)
    || /\b(?:dedicated\s+outdoor|computer[\s\-]*room)\b/i.test(g)
  )) {
    return "equipment_schedule";
  }

  return "generic";
}

/** Honest unscaled-sheet refusal — same wording Session scaleGate uses. */
export function scaleRefuseMessage(sheetKey, detectedLabel) {
  const key = String(sheetKey || "this sheet");
  const detected = detectedLabel ? ` (detected: ${detectedLabel})` : "";
  return `Set the scale for ${key} first — use set_scale${detected}.`;
}

/** Extract explicit POINTS LIST / DDC list titles named in the goal. */
export function namedPointsListTitles(goal) {
  const titles = [];
  // FCU WITH … must not span a comma into the next sibling title.
  const re = /\b((?:POINTS\s+LIST|UNIT\s+HEATER\s+DDC\s+POINTS\s+LIST|FCU\s+WITH[^,.\n?]{0,80}DDC\s+POINTS\s+LIST)[A-Z0-9\s\-\/]*)/gi;
  for (const m of String(goal || "").matchAll(re)) {
    const t = m[1].replace(/\s+/g, " ").trim().replace(/[,:;]+$/, "");
    if (t.length >= 12) titles.push(t);
  }
  return [...new Set(titles.map((t) => t.toUpperCase()))].map((u) => {
    const orig = titles.find((t) => t.toUpperCase() === u);
    return orig || u;
  });
}

/**
 * Suggest schedule title needles from goal family words (industry schedule
 * naming patterns — not corpus-set hardcoding).
 * @param {string} goal
 * @returns {string[]}
 */
/**
 * Schedule-family title-scan needles from goal phrasing.
 * Titles must be long enough for query_table matching (≥12 chars / full
 * industry schedule names) — short tokens like "CRAH"/"DIFFUSER" miss.
 * @param {string} goal
 * @returns {Array<{label:string,title:string,titleRe:RegExp,exclude?:RegExp,minCount?:number}>}
 */
export function scheduleFamilyNeedles(goal) {
  const g = String(goal || "");
  /** @type {Array<{label:string,title:string,titleRe:RegExp,exclude?:RegExp,minCount?:number}>} */
  const out = [];
  const add = (needle) => {
    if (!out.some((n) => n.label === needle.label && n.title === needle.title)) out.push(needle);
  };
  if (/\bAHUs?\b/i.test(g)) {
    add({
      label: "AHU",
      title: "AIR HANDLING UNIT SCHEDULE",
      titleRe: /AIR HANDLING UNIT/i,
      exclude: /DEDICATED/i,
    });
  }
  if (/\bDOAH\b|dedicated\s+outdoor|DOAS\b/i.test(g)) {
    add({
      label: "DOAH unit",
      title: "DEDICATED OUTDOOR AIR UNIT SCHEDULE",
      titleRe: /DEDICATED OUTDOOR AIR UNIT/i,
      exclude: /HANDLING/i,
    });
  }
  if (/\bFCUs?\b|fan[\s\-]*coil/i.test(g)) {
    add({
      label: "FCU",
      title: "FAN COIL UNIT SCHEDULE",
      titleRe: /FAN\s*COIL/i,
      exclude: /POINTS\s*LIST|DDC\s+POINTS/i,
    });
  }
  if (/\bVAVs?\b|volume\s+control\s+box|air\s+terminal\s+box/i.test(g)) {
    add({
      label: "VAV",
      title: "VOLUME CONTROL BOX SCHEDULE",
      titleRe: /VARIABLE AIR VOLUME|VOLUME CONTROL BOX|AIR TERMINAL BOX/i,
    });
  }
  if (/\bair[\s\-]*cooled\s+chiller/i.test(g)) {
    add({
      label: "air-cooled chiller",
      title: "AIR COOLED CHILLER SCHEDULE",
      titleRe: /AIR COOLED CHILLER/i,
      exclude: /HEAT RECOVERY/i,
      minCount: 1,
    });
  }
  if (/\bheat[\s\-]*recovery\s+chiller/i.test(g)) {
    add({
      label: "heat-recovery chiller",
      title: "AIR COOLED HEAT RECOVERY CHILLER",
      titleRe: /HEAT RECOVERY/i,
      minCount: 1,
    });
  }
  if (/\bchillers?\b/i.test(g) && !/\bair[\s\-]*cooled|heat[\s\-]*recovery/i.test(g)) {
    add({ label: "chiller", title: "CHILLER SCHEDULE", titleRe: /CHILLER SCHEDULE/i });
  }
  if (/\bboilers?\b/i.test(g)) {
    add({ label: "boiler", title: "BOILER SCHEDULE", titleRe: /BOILER/i });
  }
  if (/\bpumps?\b/i.test(g)) {
    add({ label: "pump", title: "PUMP SCHEDULE", titleRe: /PUMP SCHEDULE/i });
  }
  if (/\bRTUs?\b|rooftop|packaged|roof[\s\-]*top\s+unit/i.test(g)) {
    add({ label: "RTU", title: "ROOF TOP UNIT SCHEDULE", titleRe: /ROOF[\s\-]*TOP|PACKAGED\s+ROOFTOP|RTU\s+SCHEDULE/i });
  }
  if (/\bERVs?\b|energy\s+recovery/i.test(g)) {
    add({
      label: "ERV",
      title: "ENERGY RECOVERY VENTILATOR SCHEDULE",
      titleRe: /ENERGY\s+RECOVERY\s+VENTILATOR|ENERGY\s+RECOVERY\s+UNIT|\bERV\s+SCHEDULE/i,
    });
  }
  if (/\bfurnaces?\b/i.test(g)) {
    add({ label: "furnace", title: "FURNACE SCHEDULE", titleRe: /FURNACE\s+SCHEDULE|GAS[\s\-]*FIRED\s+.*FURNACE/i });
  }
  if (/\bcondensing\s+units?\b/i.test(g)) {
    add({ label: "condensing unit", title: "CONDENSING UNIT SCHEDULE", titleRe: /CONDENSING\s+UNIT\s+SCHEDULE/i });
  }
  if (/\bheat\s+pumps?\b/i.test(g)) {
    add({ label: "heat pump", title: "HEAT PUMP SCHEDULE", titleRe: /HEAT\s+PUMP/i });
  }
  if (/\boutdoor\s+air\s+units?\b|\bOAUs?\b/i.test(g) && !/\bDOAH\b|dedicated\s+outdoor/i.test(g)) {
    add({
      label: "outdoor air unit",
      title: "OUTDOOR AIR UNIT SCHEDULE",
      titleRe: /OUTDOOR\s+AIR\s+UNIT\s+SCHEDULE/i,
      exclude: /DEDICATED\s+OUTDOOR\s+AIR/i,
    });
  }
  if (/\b(?:exhaust\s+)?fans?\b/i.test(g) && !/\bfan[\s\-]*coil/i.test(g)) {
    add({ label: "fan", title: "FAN SCHEDULE", titleRe: /FAN SCHEDULE/i });
  }
  if (/\bdiffuser|grille|register|GRD\b/i.test(g)) {
    add({
      label: "diffuser",
      title: "GRILLE, REGISTER, AND DIFFUSER SCHEDULE",
      titleRe: /GRILLE,\s*REGISTER,\s*AND\s*DIFFUSER|DIFFUSER[\s\-]*GRILLE/i,
    });
  }
  if (/\bdehumidif/i.test(g)) {
    add({
      label: "dehumidifier",
      title: "DEHUMIDIFIER SCHEDULE",
      titleRe: /DEHUMIDIFIER SCHEDULE/i,
    });
  } else if (/\bhumidif/i.test(g)) {
    add({
      label: "humidifier",
      title: "HUMIDIFIER SCHEDULE",
      titleRe: /HUMIDIFIER SCHEDULE/i,
    });
  }
  if (/\bCRAH\b|computer[\s\-]*room/i.test(g)) {
    add({
      label: "CRAH",
      title: "COMPUTER ROOM AIR HANDLER",
      titleRe: /COMPUTER ROOM AIR HANDLER|\bCRAH\b/i,
    });
  }
  if (/\bcabinet\s+unit\s+heater|\bCUHs?\b/i.test(g)) {
    add({
      label: "cabinet unit heater",
      title: "CABINET UNIT HEATER SCHEDULE",
      titleRe: /CABINET UNIT HEATER/i,
    });
  }
  if (
    (/\bunit\s+heater/i.test(g) && !/\bcabinet\s+unit\s+heater/i.test(g))
    || (/\bUHs?\b/i.test(g) && !/\bCUHs?\b/i.test(g))
  ) {
    add({
      label: "unit heater",
      title: "UNIT HEATER SCHEDULE",
      titleRe: /UNIT HEATER SCHEDULE/i,
      exclude: /CABINET|DDC|POINTS/i,
    });
  }
  if (/\bair\s+separator/i.test(g)) {
    add({
      label: "air separator",
      title: "AIR SEPARATOR SCHEDULE",
      titleRe: /AIR SEPARATOR SCHEDULE/i,
    });
  }
  if (/\bexpansion\s+tank/i.test(g)) {
    add({
      label: "expansion tank",
      title: "EXPANSION TANK SCHEDULE",
      titleRe: /EXPANSION TANK SCHEDULE/i,
    });
  }
  if (/\bwater\s+softener/i.test(g)) {
    add({ label: "water softener", title: "WATER SOFTENER SCHEDULE", titleRe: /WATER\s+SOFTENER\s+SCHEDULE/i });
  }
  if (/\bwater\s+heater/i.test(g) && !/\bfurnace/i.test(g)) {
    add({
      label: "water heater",
      title: "WATER HEATER SCHEDULE",
      titleRe: /(?:INSTANTANEOUS\s+)?(?:GAS\s+)?WATER\s+HEATER\s+SCHEDULE/i,
      exclude: /BOILER/i,
    });
  }
  if (/\bcontrol\s+valves?\b/i.test(g)) {
    add({
      label: "control valve",
      title: "CONTROL VALVE SCHEDULE",
      titleRe: /CONTROL VALVE SCHEDULE/i,
    });
  }
  if (/\bBYPASS\b/i.test(g) && /\bvalve/i.test(g)) {
    add({
      label: "bypass valve",
      title: "BYPASS CONTROL VALVE SCHEDULE",
      titleRe: /BYPASS CONTROL VALVE SCHEDULE/i,
    });
  }
  return out;
}

export function suggestedScheduleTitles(goal) {
  const titles = scheduleFamilyNeedles(goal).map((n) => n.title);
  // Extra VAV sibling needles for title-scan hints (same family, one gate label).
  if (/\bVAVs?\b|volume\s+control\s+box|air\s+terminal\s+box/i.test(String(goal || ""))) {
    for (const t of ["AIR TERMINAL BOX SCHEDULE", "VARIABLE AIR VOLUME"]) {
      if (!titles.includes(t)) titles.push(t);
    }
  }
  return [...new Set(titles)];
}

/**
 * @param {Array<{name:string,args?:object,out?:object}>} callLog
 * @param {string} title
 */
function hasTitleScan(callLog, title) {
  const want = String(title || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (callLog || []).some(({ name, out, args }) => {
    if (name !== "query_table" || out?.error) return false;
    const q = out?.query || args || {};
    if (q.row_key != null || q.column != null || q.cell_value != null || q.cell_contains != null) {
      return false;
    }
    const got = String(q.title || out?.matches?.[0]?.title?.text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return want.length >= 8 && got.includes(want.slice(0, Math.min(24, want.length)));
  });
}

function surveyThenTitleTools(hasGraph, nextAfterGraph) {
  if (!hasGraph) {
    return {
      phase: "survey",
      allowedTools: ["list_sheets", "sheet_graph", "find_schedule"],
      nextMove: "Call list_sheets and/or sheet_graph once, then follow the next workflow move.",
      blockReason: null,
    };
  }
  return nextAfterGraph;
}

/**
 * @param {TakeoffIntent} intent
 * @param {Array} callLog
 * @param {string} goal
 * @returns {{ phase: WorkflowPhase, allowedTools: string[]|null, nextMove: string|null, blockReason: string|null }}
 */
export function advanceTakeoffWorkflow(intent, callLog, goal) {
  const log = callLog || [];
  const hasGraph = log.some(({ name, out }) =>
    (name === "sheet_graph" || name === "list_sheets") && !out?.error);
  const paints = log.filter(({ name, out }) =>
    name === "highlight_citation" && !out?.error && Array.isArray(out?.bbox_px)).length;
  const rowKeyCites = log.filter(({ name, args, out }) =>
    name === "query_table" && !out?.error && args?.row_key != null).length;
  const hasCorpusCompile = log.some(({ name, out }) =>
    name === "compile_corpus_takeoff" && !out?.error && (out?.takeoff_id || out?.kind));
  const hasReconcile = log.some(({ name, out }) =>
    name === "reconcile_schedule_plan" && !out?.error && Array.isArray(out?.rows));
  const hasSweep = log.some(({ name, out }) =>
    name === "sweep_schedule_row" && !out?.error);
  const titleScanCount = log.filter(({ name, out, args }) => {
    if (name !== "query_table" || out?.error) return false;
    const q = out?.query || args || {};
    return q.row_key == null && q.cell_contains == null && q.title;
  }).length;

  if (intent === "corpus_hvac" || intent === "corpus_bas" || intent === "corpus_valves") {
    const kind = intent === "corpus_bas"
      ? "bas_points"
      : intent === "corpus_valves"
        ? "control_valves"
        : "hvac_equipment";
    if (!hasCorpusCompile) {
      const service = intent === "corpus_valves" ? valveServiceFromGoal(goal) : null;
      const serviceArg = service
        ? ` Also pass service="${service}" (goal asked for that hydronic service only).`
        : "";
      return {
        phase: "compile",
        allowedTools: ["compile_corpus_takeoff", "list_sheets", "sheet_graph"],
        nextMove: `Call compile_corpus_takeoff with kind="${kind}" now (download true).${serviceArg} `
          + "Do NOT crawl find_schedule / query_table / read_schedule family-by-family for the set total — "
          + "the compiler returns the full deterministic takeoff (categories/lists, totals, exclusions, empty pages). "
          + "After it returns, summarize from its totals / category_counts / list_counts.",
        blockReason: null,
      };
    }
    if (rowKeyCites < 1 || paints < 1) {
      return {
        phase: paints < 1 && rowKeyCites >= 1 ? "paint" : "spot_cites",
        allowedTools: ["query_table", "highlight_citation", "find_text"],
        nextMove: "From the compile result, spot-check with query_table { row_key } + highlight_citation "
          + "(at least one MARK per family/list the goal asks to cite). Then write the final answer from compile totals — do not invent a second inventory.",
        blockReason: null,
      };
    }
    return {
      phase: "answer",
      allowedTools: null,
      nextMove: "Emit the complete takeoff answer from compile_corpus_takeoff totals "
        + "(category/list counts, building splits / AI-AO-BI-BO, exclusions, empty pages). Cite painted MARKs. No more exploratory tools.",
      blockReason: null,
    };
  }

  if (intent === "points_takeoff") {
    const titles = namedPointsListTitles(goal);
    // Defense: never enter spot_cites with zero title-scan targets — a bare
    // "points list takeoff" used to skip title_scans and hang on the evidence
    // gate. Prefer corpus_bas for that phrasing; if we still land here, scan
    // a generic POINTS LIST / DDC POINTS LIST title.
    const scanTargets = titles.length
      ? titles
      : ["POINTS LIST", "DDC POINTS LIST"];
    const missing = scanTargets.filter((t) => !hasTitleScan(log, t));
    // One successful POINTS/DDC title-scan satisfies the generic fallback.
    const genericFallback = titles.length === 0;
    const missingEffective = genericFallback
      ? (missing.length < scanTargets.length ? [] : missing)
      : missing;
    const allowedBase = ["list_sheets", "sheet_graph", "find_schedule", "query_table", "highlight_citation", "compile_corpus_takeoff"];
    if (!hasGraph) {
      return {
        phase: "survey",
        allowedTools: ["list_sheets", "sheet_graph", "find_schedule", "compile_corpus_takeoff"],
        nextMove: "Call list_sheets and/or sheet_graph once, then title-scan each named POINTS/DDC list with query_table (no row_key, no cell_contains). Or call compile_corpus_takeoff kind=bas_points for a full-set points compile.",
        blockReason: null,
      };
    }
    if (hasCorpusCompile) {
      if (rowKeyCites < 1 || paints < 1) {
        return {
          phase: paints < 1 && rowKeyCites >= 1 ? "paint" : "spot_cites",
          allowedTools: ["query_table", "highlight_citation"],
          nextMove: "From the compile result, spot-check with query_table { row_key } + highlight_citation, then answer from compile list totals.",
          blockReason: null,
        };
      }
      return {
        phase: "answer",
        allowedTools: null,
        nextMove: "Emit the complete takeoff answer from compile_corpus_takeoff bas_points totals. Cite painted MARKs. No more exploratory tools.",
        blockReason: null,
      };
    }
    if (missingEffective.length) {
      return {
        phase: "title_scans",
        allowedTools: allowedBase,
        nextMove: `Title-scan these points lists with query_table (title only, no row_key/cell_contains): ${missingEffective.slice(0, 5).join("; ")}. Copy count and point_type_counts from each result. Alternatively call compile_corpus_takeoff with kind="bas_points".`,
        blockReason: null,
      };
    }
    if (rowKeyCites < 1) {
      return {
        phase: "spot_cites",
        allowedTools: allowedBase,
        nextMove: "Re-query each spot-check MARK with query_table { title, row_key }, then highlight_citation on the MARK/identity bbox. Do not re-filter lists with cell_contains for AI/AO/BI/BO.",
        blockReason: null,
      };
    }
    if (paints < 1) {
      return {
        phase: "paint",
        allowedTools: ["query_table", "highlight_citation"],
        nextMove: "Call highlight_citation on each cited MARK cell bbox from the row_key queries, then write the final answer.",
        blockReason: null,
      };
    }
    return {
      phase: "answer",
      allowedTools: null,
      nextMove: "Emit the complete takeoff answer: per-list counts + point_type_counts, overall totals as sums, and cited MARK cells. No more exploratory tools.",
      blockReason: null,
    };
  }

  if (intent === "project_takeoff") {
    const allowed = ["list_sheets", "sheet_graph", "find_schedule", "query_table", "highlight_citation"];
    return surveyThenTitleTools(hasGraph, (() => {
      if (titleScanCount < 3) {
        return {
          phase: "title_scans",
          allowedTools: allowed,
          nextMove: "Title-scan each named HVAC equipment schedule family with query_table (title only). "
            + "Copy count and building_tag_counts. If a points list is named, title-scan it once for count — do not AI/AO/BI/BO cell_contains loops.",
          blockReason: null,
        };
      }
      if (rowKeyCites < 1 || paints < 1) {
        return {
          phase: paints < 1 && rowKeyCites >= 1 ? "paint" : "spot_cites",
          allowedTools: allowed,
          nextMove: "Spot-cite requested MARK cells with query_table { row_key } + highlight_citation, then answer from title-scan counts only.",
          blockReason: null,
        };
      }
      return {
        phase: "answer",
        allowedTools: null,
        nextMove: "Emit the multi-family project takeoff from query_table title-scan counts and building splits. Cite painted MARKs. No more exploratory tools.",
        blockReason: null,
      };
    })());
  }

  if (intent === "fcu_buildings") {
    const hasFcuScan = log.some(({ name, out, args }) => {
      if (name !== "query_table" || out?.error) return false;
      const q = out?.query || args || {};
      if (q.row_key != null || q.cell_contains != null) return false;
      const title = String(q.title || "");
      return /FAN\s*COIL/i.test(title) && out?.building_tag_counts;
    });
    if (!hasFcuScan) {
      return {
        phase: "title_scans",
        allowedTools: ["list_sheets", "sheet_graph", "query_table", "find_schedule", "highlight_citation"],
        nextMove: "Call query_table with title FAN COIL UNIT SCHEDULE (no row_key). Copy count and building_tag_counts.",
        blockReason: null,
      };
    }
    return {
      phase: paints ? "answer" : "spot_cites",
      allowedTools: ["query_table", "highlight_citation"],
      nextMove: paints
        ? "Emit the FCU building split answer from building_tag_counts; cite requested MARK cells already painted."
        : "Re-query named FCU MARKs with row_key and highlight_citation, then answer.",
      blockReason: null,
    };
  }

  if (intent === "valve_join") {
    const allowed = [
      "list_sheets", "sheet_graph", "find_schedule", "query_table",
      "highlight_citation", "sweep_schedule_row", "resolve_tag",
    ];
    const hasValveScan = log.some(({ name, out, args }) => {
      if (name !== "query_table" || out?.error) return false;
      const q = out?.query || args || {};
      if (q.row_key != null || q.cell_contains != null) return false;
      return /CONTROL\s+VALVE\s+SCHEDULE/i.test(String(q.title || out?.matches?.[0]?.title?.text || ""));
    });
    if (!hasGraph) {
      return {
        phase: "survey",
        allowedTools: ["list_sheets", "sheet_graph", "find_schedule"],
        nextMove: "Call sheet_graph / find_schedule for CONTROL VALVE / BYPASS CONTROL VALVE schedules, then title-scan each with query_table.",
        blockReason: null,
      };
    }
    if (!hasValveScan) {
      return {
        phase: "title_scans",
        allowedTools: allowed,
        nextMove: "Title-scan each named CONTROL VALVE / BYPASS CONTROL VALVE SCHEDULE with query_table (title only). Copy schedule counts from results — do not invent.",
        blockReason: null,
      };
    }
    if (!hasSweep || rowKeyCites < 1) {
      return {
        phase: "spot_cites",
        allowedTools: allowed,
        nextMove: "For named valve MARKs: query_table { title, row_key } for GPM/size/coil, then sweep_schedule_row for installed plan quantity. highlight_citation on schedule cells and plan hits.",
        blockReason: null,
      };
    }
    if (paints < 1) {
      return {
        phase: "paint",
        allowedTools: ["query_table", "highlight_citation", "sweep_schedule_row"],
        nextMove: "Paint cited schedule FLOW/SIZE cells and plan tag hits, then write the final answer.",
        blockReason: null,
      };
    }
    return {
      phase: "answer",
      allowedTools: null,
      nextMove: "Emit schedule counts, per-valve GPM/size/coil, and installed plan quantities from tool results only. Cite painted cells.",
      blockReason: null,
    };
  }

  if (intent === "equipment_plan_join") {
    const allowed = [
      "list_sheets", "sheet_graph", "find_schedule", "query_table",
      "resolve_tag", "sweep_schedule_row", "highlight_citation", "find_text",
    ];
    return surveyThenTitleTools(hasGraph, (() => {
      if (rowKeyCites < 1) {
        return {
          phase: "title_scans",
          allowedTools: allowed,
          nextMove: "Resolve the named equipment tag via resolve_tag / query_table { row_key }. Pull schedule attributes. Find the related control-valve row (query_table on CONTROL VALVE SCHEDULE with cell_contains or row identity). Sweep the plan for installed quantity.",
          blockReason: null,
        };
      }
      if (!hasSweep || paints < 1) {
        return {
          phase: paints < 1 ? "paint" : "spot_cites",
          allowedTools: allowed,
          nextMove: "sweep_schedule_row for plan location/qty; highlight_citation on schedule cells and plan hits; then answer.",
          blockReason: null,
        };
      }
      return {
        phase: "answer",
        allowedTools: null,
        nextMove: "Emit equipment schedule values, matching valve attrs, installed qty, and plan cite from tool results only.",
        blockReason: null,
      };
    })());
  }

  if (intent === "cross_discipline_join") {
    const allowed = [
      "list_sheets", "sheet_graph", "find_schedule", "query_table",
      "resolve_tag", "sweep_schedule_row", "highlight_citation", "find_text",
    ];
    return surveyThenTitleTools(hasGraph, (() => {
      if (rowKeyCites < 2) {
        return {
          phase: "title_scans",
          allowedTools: allowed,
          nextMove: "Query the mechanical packaged/rooftop schedule row, then the matching electrical/connection schedule row (watch zero-padded tag forms). Copy mech + electrical fields from tool cells only.",
          blockReason: null,
        };
      }
      if (paints < 1) {
        return {
          phase: "paint",
          allowedTools: allowed,
          nextMove: "highlight_citation on mech EQUIP/CFM cells and connection schedule NO/MCA cells; note roof-plan location via sweep or find_text. Then answer.",
          blockReason: null,
        };
      }
      return {
        phase: "answer",
        allowedTools: null,
        nextMove: "Emit joined mech + electrical attributes with cites from both schedules. No invented values.",
        blockReason: null,
      };
    })());
  }

  if (intent === "schedule_plan_reconcile") {
    const allowed = [
      "list_sheets", "sheet_graph", "find_schedule", "query_table",
      "reconcile_schedule_plan", "sweep_schedule_row", "highlight_citation",
    ];
    const suggested = suggestedScheduleTitles(goal).slice(0, 3);
    const familyHint = suggested.length
      ? ` Pass family from goal when calling reconcile_schedule_plan (needles: ${suggested.join("; ")}).`
      : "";
    return surveyThenTitleTools(hasGraph, (() => {
      if (titleScanCount < 1 && !hasReconcile) {
        return {
          phase: "title_scans",
          allowedTools: allowed,
          nextMove: "Title-scan the named schedule family with query_table (title only) for scheduled count, "
            + "then call reconcile_schedule_plan (optionally scoped with family=). "
            + "Copy rows with Tag, Scheduled qty, Installed qty, Status, and cites — never invent plan hits."
            + familyHint,
          blockReason: null,
        };
      }
      if (!hasReconcile && !hasSweep) {
        return {
          phase: "compile",
          allowedTools: allowed,
          nextMove: "Call reconcile_schedule_plan now for the full reconcile table, "
            + "or sweep_schedule_row per tag if scoped to named MARKs only."
            + familyHint,
          blockReason: null,
        };
      }
      if (paints < 1) {
        return {
          phase: "paint",
          allowedTools: allowed,
          nextMove: "highlight_citation on schedule MARK cells and successful plan hits from reconcile rows, "
            + "including explicit SCHEDULE_ONLY / REFUSED statuses.",
          blockReason: null,
        };
      }
      return {
        phase: "answer",
        allowedTools: null,
        nextMove: "Emit the reconcile table: Tag · Family · Scheduled qty · Installed qty · Status · cites. "
          + "Surface every SCHEDULE_ONLY and REFUSED row honestly — do not claim all scheduled units are drawn.",
        blockReason: null,
      };
    })());
  }

  if (intent === "plan_link_refuse") {
    const allowed = [
      "list_sheets", "sheet_graph", "find_schedule", "query_table",
      "sweep_schedule_row", "highlight_citation",
    ];
    return surveyThenTitleTools(hasGraph, (() => {
      if (titleScanCount < 1 || rowKeyCites < 1) {
        return {
          phase: "title_scans",
          allowedTools: allowed,
          nextMove: "Title-scan the named schedule for count; query_table { row_key } for requested tags' schedule attrs.",
          blockReason: null,
        };
      }
      if (!hasSweep) {
        return {
          phase: "spot_cites",
          allowedTools: allowed,
          nextMove: "sweep_schedule_row for each requested plan tag. If a tag is not drawn on any plan sheet, report an honest refusal — never invent plan locations.",
          blockReason: null,
        };
      }
      if (paints < 1) {
        return {
          phase: "paint",
          allowedTools: allowed,
          nextMove: "Paint schedule cells and successful plan hits, then answer including any honest refusals.",
          blockReason: null,
        };
      }
      return {
        phase: "answer",
        allowedTools: null,
        nextMove: "Emit schedule counts/attrs, plan cites where found, and explicit refusals where sweeps found nothing.",
        blockReason: null,
      };
    })());
  }

  if (intent === "symbol_sweep") {
    const allowed = [
      "list_sheets", "sheet_graph", "set_scale", "view_sheet", "view_region",
      "symbol_sweep", "highlight_citation",
    ];
    const hasSymbolSweep = (callLog || []).some(({ name, out }) =>
      name === "symbol_sweep" && out && !out.error);
    return surveyThenTitleTools(hasGraph, (() => {
      if (!hasSymbolSweep) {
        return {
          phase: "spot_cites",
          allowedTools: allowed,
          nextMove: "Marquee one real drawn instance as seed_rect and call symbol_sweep. "
            + "Copy found/matches/withheld — never invent placements. Detail-seeded set scope needs scale on both ends.",
          blockReason: null,
        };
      }
      if (paints < 1) {
        return {
          phase: "paint",
          allowedTools: allowed,
          nextMove: "highlight_citation (or commit) on accepted symbol matches, then answer with counts and withheld disclosures.",
          blockReason: null,
        };
      }
      return {
        phase: "answer",
        allowedTools: null,
        nextMove: "Emit match counts, rotations/mirrors when present, and every withheld near-miss with its reason.",
        blockReason: null,
      };
    })());
  }

  if (intent === "connectivity") {
    const allowed = [
      "list_sheets", "sheet_graph", "set_scale", "view_sheet", "view_region",
      "symbol_sweep", "sweep_schedule_row", "trace_connectivity", "highlight_citation",
    ];
    const hasTrace = (callLog || []).some(({ name, out }) =>
      name === "trace_connectivity" && out && !out.error);
    return surveyThenTitleTools(hasGraph, (() => {
      if (!hasTrace) {
        return {
          phase: "spot_cites",
          allowedTools: allowed,
          nextMove: "Sweep valve/equipment placements first, then trace_connectivity from a seed ON drawn pipe/duct linework. "
            + "Never claim connectivity from proximity alone. Honor reached/ambiguous/dead_end/refused statuses.",
          blockReason: null,
        };
      }
      return {
        phase: "answer",
        allowedTools: null,
        nextMove: "Report the walked status with cites. If ambiguous, name every candidate — never pick one. If refused, copy the tool reason.",
        blockReason: null,
      };
    })());
  }

  if (intent === "scale_refuse") {
    const allowed = [
      "list_sheets", "sheet_graph", "set_scale", "measure_line", "measure_poly",
      "one_click", "symbol_sweep", "sweep_schedule_row",
    ];
    const hasScale = (callLog || []).some(({ name, out }) =>
      name === "set_scale" && out && !out.error);
    const hasMeasure = (callLog || []).some(({ name, out }) =>
      ["measure_line", "measure_poly", "one_click", "symbol_sweep", "sweep_schedule_row"].includes(name)
      && out && !out.error);
    return surveyThenTitleTools(hasGraph, (() => {
      if (!hasScale && !hasMeasure) {
        return {
          phase: "survey",
          allowedTools: allowed,
          nextMove: "Call set_scale before any real-world installed length/area qty. "
            + "If the sheet is unscaled, refuse with scaleRefuseMessage — never invent LF/SF from pixels.",
          blockReason: null,
        };
      }
      return {
        phase: "answer",
        allowedTools: null,
        nextMove: "If tools refused for missing scale, copy that refusal verbatim. Otherwise emit the scaled measurement with sheet cite.",
        blockReason: null,
      };
    })());
  }

  if (intent === "equipment_schedule" || intent === "room_coordination" || intent === "bas_point_trace") {
    const allowed = [
      "list_sheets", "sheet_graph", "find_schedule", "query_table",
      "resolve_tag", "sweep_schedule_row", "highlight_citation", "find_text",
    ];
    const suggested = suggestedScheduleTitles(goal).slice(0, 4);
    const suggestHint = suggested.length
      ? ` Prefer title needles: ${suggested.join("; ")}.`
      : "";
    return surveyThenTitleTools(hasGraph, {
      phase: rowKeyCites < 1 ? "title_scans" : (paints < 1 ? "paint" : "answer"),
      allowedTools: paints >= 1 && rowKeyCites >= 1 ? null : allowed,
      nextMove: rowKeyCites < 1
        ? `Title-scan / query_table the named schedules, then row_key the requested tags. Copy tool counts and cells only.${suggestHint}`
        : (paints < 1
          ? "highlight_citation on cited cells, then write the final answer."
          : "Emit the complete answer from retrieved cells and paints. No more exploratory tools."),
      blockReason: null,
    });
  }

  // Generic: no hard allowlist (existing gates still apply).
  return {
    phase: "survey",
    allowedTools: null,
    nextMove: null,
    blockReason: null,
  };
}

/**
 * True when a proposed tool call violates the current workflow phase.
 * @param {ReturnType<typeof advanceTakeoffWorkflow>} state
 * @param {string} toolName
 * @param {object} [args]
 */
export function isIllegalWorkflowTransition(state, toolName, args = {}) {
  if (!state?.allowedTools) return false;
  if (!state.allowedTools.includes(toolName)) return true;
  if ((state.phase === "survey" || state.phase === "title_scans")
    && toolName === "query_table"
    && args?.cell_contains != null
    && /^(AI|AO|BI|BO)$/i.test(String(args.cell_contains).trim())) {
    return true;
  }
  return false;
}

/**
 * System/user nudge injected each turn while a workflow is active.
 */
export function workflowDirective(intent, state) {
  if (!state?.nextMove || intent === "generic") return null;
  return [
    `[Takeoff workflow: intent=${intent} phase=${state.phase}]`,
    state.nextMove,
    state.allowedTools
      ? `Allowed tools this phase: ${state.allowedTools.join(", ")}.`
      : null,
  ].filter(Boolean).join(" ");
}
