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
 */

/** @typedef {"points_takeoff"|"fcu_buildings"|"equipment_schedule"|"room_coordination"|"bas_point_trace"|"generic"} TakeoffIntent */

/** @typedef {"survey"|"title_scans"|"spot_cites"|"paint"|"answer"|"done"} WorkflowPhase */

/**
 * @param {string} goal
 * @returns {TakeoffIntent}
 */
export function classifyTakeoffIntent(goal) {
  const g = String(goal || "");
  const pointsListTakeoff = /\b(?:points?\s*list|DDC\s+points?(?:\s*list)?)\b/i.test(g)
    && (/\b(?:AI|AO|BI|BO)\b/i.test(g) || /\bpoint[-\s]?type/i.test(g) || /\btakeoff\b/i.test(g))
    && /\b(?:row\s+count|breakdown|totals?|takeoff)\b/i.test(g);
  if (pointsListTakeoff) return "points_takeoff";

  if (/\bfan[\s\-]*coil|\bFCUs?\b/i.test(g)
    && /\b(?:building|Air Ops|MITRACON|ATCT|splits?|cross[- ]building)\b/i.test(g)
    && /\b(?:how many|count|total|compare|takeoff)\b/i.test(g)) {
    return "fcu_buildings";
  }

  if (/\broom\b/i.test(g) && /\b(?:finish|diffuser|grille|coordination|RTU)\b/i.test(g)) {
    return "room_coordination";
  }

  if (/\bpoint mark\b|\bBAS\b.{0,40}\bpoint\b|\balarm\b.{0,40}\btrend\b/i.test(g)
    && /\b(?:serves|location|section|trace)\b/i.test(g)) {
    return "bas_point_trace";
  }

  if (/\b(?:schedule|AHU|DOAH|VAV|chiller|boiler|RTU)\b/i.test(g)
    && /\b(?:takeoff|count|scheduled|rollup)\b/i.test(g)) {
    return "equipment_schedule";
  }

  return "generic";
}

/** Extract explicit POINTS LIST / DDC list titles named in the goal. */
export function namedPointsListTitles(goal) {
  const titles = [];
  const re = /\b((?:POINTS LIST|FCU WITH[^.?\n]{0,80}DDC POINTS LIST|UNIT HEATER DDC POINTS LIST)[A-Z0-9\s\-\/]*)/gi;
  for (const m of String(goal || "").matchAll(re)) {
    const t = m[1].replace(/\s+/g, " ").trim().replace(/[,:;]+$/, "");
    if (t.length >= 12) titles.push(t);
  }
  // De-dupe preserving order
  return [...new Set(titles.map((t) => t.toUpperCase()))].map((u) => {
    const orig = titles.find((t) => t.toUpperCase() === u);
    return orig || u;
  });
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

  if (intent === "points_takeoff") {
    const titles = namedPointsListTitles(goal);
    const missing = titles.filter((t) => !hasTitleScan(log, t));
    const allowedBase = ["list_sheets", "sheet_graph", "find_schedule", "query_table", "highlight_citation"];
    if (!hasGraph) {
      return {
        phase: "survey",
        allowedTools: ["list_sheets", "sheet_graph", "find_schedule"],
        nextMove: "Call list_sheets and/or sheet_graph once, then title-scan each named POINTS/DDC list with query_table (no row_key, no cell_contains).",
        blockReason: null,
      };
    }
    if (missing.length) {
      return {
        phase: "title_scans",
        allowedTools: allowedBase,
        nextMove: `Title-scan these points lists with query_table (title only, no row_key/cell_contains): ${missing.slice(0, 5).join("; ")}. Copy count and point_type_counts from each result.`,
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
        nextMove: "Call query_table with title FAN COIL UNIT SCHEDULE (no row_key). Copy count and building_tag_counts (A/M/T).",
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

  // Generic / other intents: no hard allowlist (existing gates still apply).
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
  // Points takeoff: ban type-filter cell_contains during title_scans / survey.
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
