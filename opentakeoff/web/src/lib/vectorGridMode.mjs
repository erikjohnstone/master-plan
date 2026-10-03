/**
 * THE ONE DEFINITION OF WHICH TABLE ENGINE IS RUNNING.
 *
 * It lives alone, in plain .mjs, so that both the TypeScript client and the
 * plain-JS sheet-graph cache import the SAME function rather than each
 * restating the rule. Restating it is not hypothetical: the cache key
 * normalised an unset variable to "off" while the engine had been changed to
 * default to "on", so a default run (engine ON) and an explicit
 * OPENTAKEOFF_VECTORGRID=off run (engine OFF) shared one cache key and served
 * each other's graphs. Every warm A/B after that read the wrong engine's
 * answer and reported "no difference".
 *
 * off    — never runs; the previous behaviour, byte for byte.
 * shadow — runs, reports, merges nothing; for gathering a comparison.
 * on     — the default; its tables are the answer.
 */
export function resolveVectorGridMode(env = process.env) {
  const v = String(env.OPENTAKEOFF_VECTORGRID || "").toLowerCase();
  if (v === "0" || v === "off") return "off";
  if (v === "shadow") return "shadow";
  return "on";
}

/**
 * THE INTERPRETER THE TABLE ENGINE RUNS UNDER, by the one rule the client
 * spawns it with: its own variable, else the table sidecar's, else the
 * system python3, which on most machines lacks the engine's modules (every
 * sheet then falls back to the weaker reader). The sheet-graph cache keys by
 * it for the reason it keys by the mode: a graph built where the engine could
 * not run must never answer a run where it can.
 */
export function resolveVectorGridPython(env = process.env) {
  return env.OPENTAKEOFF_VECTORGRID_PYTHON || env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || "python3";
}

/** Whether the engine's interpreter was chosen, not the system default. */
export function vectorGridPythonConfigured(env = process.env) {
  return Boolean(env.OPENTAKEOFF_VECTORGRID_PYTHON || env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON);
}
