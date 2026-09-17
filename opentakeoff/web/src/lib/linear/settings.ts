// Linear takeoff (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md WP2.4) — the
// PERSISTED project settings resolveLinearAssembly's `settings` parameter
// reads (plan §7.4). Pure, React-free, DOM-free, same shared-path
// discipline as this directory's other modules.
//
// `level_heights` is deliberately NOT a field here — §7.4 says so itself
// ("level_heights (already sheetLevels.js)"): TakeoffCanvas.jsx already
// persists per-sheet level assignment via `sheet_levels` (sheetLevels.js),
// and resolveLinearAssembly's own `LinearAssemblySettings.level_height_ft`
// (types.ts, WP2.2) is the per-CALL value a caller resolves from that
// existing record before invoking the resolver — duplicating it here would
// just be a second place it could drift from the real one.
//
// `pressure_class_by_system` and `stick_length_by_material` are maps
// (a project sets ONE pressure class for its "SA" system, another for
// "HHWS", etc.) — persisted here, but NOT YET consumed by
// resolveLinearAssembly itself, which still takes a flat
// `pressure_class_in_wg` per call (types.ts's LinearAssemblySettings). A
// caller resolving a specific condition looks up
// `pressure_class_by_system[condition.system]` and passes THAT in — wiring
// that lookup into a UI or the MCP surface is WP2.5's job, not this one's;
// documented here rather than silently assumed done.
export interface LinearProjectSettings {
  /** D3's project-level "adopted code" selector for PIPE hangers — mirrors
   *  rates.ts's PipeAdoptedCode exactly (kept as its own field, not
   *  re-exported from there, so this module has no runtime dependency on
   *  rates.ts's JSON table imports — a settings sanitizer should not need
   *  to load rate tables just to validate an enum string). */
  adopted_pipe_hanger_code?: "mss_sp58" | "imc305_4" | "ipc308_5" | "upc313_3";
  climate_zone?: "cz0_4" | "cz5_8";
  /** System tag (condition.system, e.g. "SA", "HHWS") -> pressure class in
   *  inches w.g. Duct-only; a pipe system has no pressure-class concept in
   *  this model. */
  pressure_class_by_system?: Record<string, number>;
  /** Material key (matching rates.ts's pipeLabor.couplings_per_stick keys,
   *  e.g. "steel", "copper_pvc") -> stick length in feet, overriding the
   *  rates.ts default for that material on this project. */
  stick_length_by_material?: Record<string, number>;
  /** D1's "+5-10% offsets/rise-drop allowance" default, project-wide;
   *  plan §8.3's own `offset_allowance_pct` — a condition or run's own
   *  `AuthoredRun.params.offset_allowance_pct` (types.ts) overrides this
   *  per-run when set. */
  offset_allowance_pct?: number;
}

const PIPE_HANGER_CODES = new Set(["mss_sp58", "imc305_4", "ipc308_5", "upc313_3"]);
const CLIMATE_ZONES = new Set(["cz0_4", "cz5_8"]);

function sanitizeNumberMap(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === "string" && k && typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The load gate (store.loadTemplates / sanitizeMaterialLibrary precedent):
 *  every field is independently validated and unknown/malformed values are
 *  simply dropped rather than throwing, so a hand-edited or hostile
 *  project payload degrades this block to `{}` instead of wedging hydrate
 *  for the whole project. Minimal contract, same as this directory's other
 *  sanitizers — "safe to read", not a re-implementation of a caller's own
 *  defaulting. */
export function sanitizeLinearSettings(raw: unknown): LinearProjectSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: LinearProjectSettings = {};
  if (typeof r.adopted_pipe_hanger_code === "string" && PIPE_HANGER_CODES.has(r.adopted_pipe_hanger_code)) {
    out.adopted_pipe_hanger_code = r.adopted_pipe_hanger_code as LinearProjectSettings["adopted_pipe_hanger_code"];
  }
  if (typeof r.climate_zone === "string" && CLIMATE_ZONES.has(r.climate_zone)) {
    out.climate_zone = r.climate_zone as LinearProjectSettings["climate_zone"];
  }
  const pcbs = sanitizeNumberMap(r.pressure_class_by_system);
  if (pcbs) out.pressure_class_by_system = pcbs;
  const slbm = sanitizeNumberMap(r.stick_length_by_material);
  if (slbm) out.stick_length_by_material = slbm;
  if (typeof r.offset_allowance_pct === "number" && Number.isFinite(r.offset_allowance_pct) && r.offset_allowance_pct >= 0) {
    out.offset_allowance_pct = r.offset_allowance_pct;
  }
  return out;
}
