// Linear takeoff (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md WP2.4) — the
// estimator-profile assembly library: AssemblyRecord entries (types.ts,
// WP2.2) seeded with plan §5.5's defaults, referenced by id from a
// condition's `assembly_id` (types.ts's LinearCondition, plan §7.2/§7.3).
// Same load-gate contract as materials.js's sanitizeMaterialLibrary (the
// precedent this mirrors): every returned item is a plain object with a
// non-empty, unique string `id` — nothing here re-implements assembly.ts's
// own defaulting, it only guarantees "safe to key on".
import type { AssemblyRecord } from "./types.ts";

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function sanitizeAssemblyLibrary(raw: unknown): AssemblyRecord[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const out: AssemblyRecord[] = [];
  for (const a of raw) {
    if (!(isPlainObject(a) && typeof a.id === "string" && a.id)) continue;
    // A record with a `kind` is an equipment or project assembly (ASSEMBLIES
    // goal D7), loaded by assemblies/schema.ts sanitizeAssemblyDefinitions;
    // a linear record has none and resolves exactly as before.
    if (a.kind !== undefined) continue;
    if (seenIds.has(a.id)) continue;
    seenIds.add(a.id);
    out.push({
      id: a.id,
      family: a.family as AssemblyRecord["family"],
      name: typeof a.name === "string" ? a.name : a.id,
      ...(typeof a.provenance === "string" ? { provenance: a.provenance } : {}),
      per_ft: Array.isArray(a.per_ft) ? (a.per_ft as AssemblyRecord["per_ft"]) : [],
      per_vertex: Array.isArray(a.per_vertex) ? (a.per_vertex as AssemblyRecord["per_vertex"]) : [],
      per_run: Array.isArray(a.per_run) ? (a.per_run as AssemblyRecord["per_run"]) : [],
      ...(isPlainObject(a.allowances) ? { allowances: a.allowances as AssemblyRecord["allowances"] } : {}),
      ...(typeof a.deduct_fittings === "boolean" ? { deduct_fittings: a.deduct_fittings } : {}),
    });
  }
  return out;
}

// Seeded library (plan §5.5's own "defensible defaults", each rule field
// exactly what assembly.ts's resolvers read — see assembly.ts's own
// resolvePerFtDuct/resolvePerVertex for `duct_lb.gauge` (unset here: the
// default lets ductGaugeFor's simplified-schedule LOOKUP apply per size,
// matching §5.5's "gauge = lookup(pressure_class, max(W,H))" rather than
// pinning one gauge the way plan §8.4's own worked example happens to)).
// Pipe's per_ft/per_vertex/per_run stay empty: resolvePerFtPipe/
// resolvePerRunPipeHangers (assembly.ts) do not yet read any rule off the
// assembly record for the pipe family — they take material/service via
// ResolveLinearAssemblyOptions instead — so seeding rule entries nothing
// consumes would be misleading rather than merely incomplete. Wiring that
// is WP2.5's job (the MCP/report surface), tracked there, not invented here.
export const SEED_ASSEMBLIES: AssemblyRecord[] = [
  {
    id: "asm-duct-rect-default",
    family: "duct_rect",
    name: "Rect duct, simplified gauge schedule, R-6 wrap, trapeze",
    provenance: "plan §5.5 (plans/03-linear-takeoff-hvac-bas-plan.md); rates ductGauge.json/ductWeight.json/ductHangerSpacing.json (#linear-takeoff WP2.1)",
    per_ft: [
      { item: "duct_lb" },
      { item: "insulation_sf", thickness_in: 1.5, lap_factor: 1.10 },
    ],
    per_vertex: [
      { item: "elbow", kind: "elbow", labor_factor: 1.4 },
    ],
    per_run: [],
    allowances: { fitting_weight_factor: 1.40, scrap_pct: 10, offset_pct: 5 },
    deduct_fittings: false,
  },
  {
    id: "asm-duct-round-default",
    family: "duct_round",
    name: "Round duct, simplified gauge schedule, R-6 wrap, trapeze",
    provenance: "plan §5.5 (plans/03-linear-takeoff-hvac-bas-plan.md); rates ductGauge.json/ductWeight.json/ductHangerSpacing.json (#linear-takeoff WP2.1)",
    per_ft: [
      { item: "duct_lb" },
      { item: "insulation_sf", thickness_in: 1.5, lap_factor: 1.10 },
    ],
    per_vertex: [
      { item: "elbow", kind: "elbow", labor_factor: 1.4 },
    ],
    per_run: [],
    allowances: { fitting_weight_factor: 1.40, scrap_pct: 10, offset_pct: 5 },
    deduct_fittings: false,
  },
  {
    id: "asm-pipe-default",
    family: "pipe",
    name: "Pipe, MSS SP-58 hangers, 90.1 insulation",
    provenance: "plan §5.5 (plans/03-linear-takeoff-hvac-bas-plan.md); rates pipeHangerSpacing.json/pipeInsulation.json/pipeLabor.json (#linear-takeoff WP2.1) — per_ft/per_vertex/per_run intentionally empty, see this file's own header comment",
    per_ft: [],
    per_vertex: [],
    per_run: [],
    deduct_fittings: false,
  },
];
