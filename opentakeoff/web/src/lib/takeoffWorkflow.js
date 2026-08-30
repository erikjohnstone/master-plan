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

/** @typedef {"corpus_hvac"|"corpus_bas"|"points_takeoff"|"fcu_buildings"|"equipment_schedule"|"room_coordination"|"bas_point_trace"|"generic"} TakeoffIntent */

/** @typedef {"survey"|"compile"|"title_scans"|"spot_cites"|"paint"|"answer"|"done"} WorkflowPhase */

/**
 * Complete set-wide HVAC/BAS takeoffs that the corpus compiler covers
 * (T-HVAC-01 / T-BAS-01). Named multi-list goals stay on points_takeoff.
 * @param {string} goal
 * @returns {"hvac_equipment"|"bas_points"|null}
 */
export function corpusCompileKind(goal) {
  const g = String(goal || "");
  // Specific named points lists → title-scan workflow, not full-set compile.
  if (namedPointsListTitles(g).length >= 2) return null;
  const completeSet = /\bcomplete\b/i.test(g)
    && /\btakeoff\b/i.test(g)
    && /\b(?:this set|these drawings|of this set)\b/i.test(g);
  if (!completeSet) return null;
  if (/\b(?:BAS|DDC)\b/i.test(g) && /\bpoints?\b/i.test(g)) return "bas_points";
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
  const hasCorpusCompile = log.some(({ name, out }) =>
    name === "compile_corpus_takeoff" && !out?.error && (out?.takeoff_id || out?.kind));

  // Complete set HVAC / BAS → one deterministic compile, then spot-cites.
  if (intent === "corpus_hvac" || intent === "corpus_bas") {
    const kind = intent === "corpus_bas" ? "bas_points" : "hvac_equipment";
    if (!hasCorpusCompile) {
      return {
        phase: "compile",
        allowedTools: ["compile_corpus_takeoff", "list_sheets", "sheet_graph"],
        nextMove: `Call compile_corpus_takeoff with kind="${kind}" now (download true). `
          + "Do NOT crawl find_schedule / query_table family-by-family for the set total — "
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
