// Linear takeoff (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md) — shared types.
// Pure, React-free, DOM-free: this whole directory is imported identically
// by the canvas (TakeoffCanvas.jsx) and by mcp/src/session.ts, per the
// shared-path rule (AGENTS.md — "one module both UI and MCP consume"). It
// does import zod (runSizeSchema below) — the same "define once in web/lib,
// import into mcp/src/tools.ts's inputSchema AND mcp/src/outputs.ts's
// outputSchema" pattern already used for the BAS contracts (e.g.
// basPointLists.ts) — so the wire validation and the TS type can never drift
// from each other, on either side of the MCP boundary.
//
// A `linear` shape with NO `run` block behaves byte-identically to a plain
// polyline (WP1 invariant): every field here is additive. `run` is the
// AUTHORED state a person or agent sets (size overrides, vertex overrides,
// system/status); `computed.run` (in run.ts) is the DERIVED read of it,
// recomputed from `verts_norm` + `upp` + `run` whenever any of the three
// changes — never edited directly, same discipline as `computed.area_sf`.
import { z } from "zod";

/** A duct/pipe size, normalized to inches. Only ONE of these shapes at a
 *  time — never a union of fields on one object — so a reader can switch on
 *  `kind` exhaustively. See plan §7.1 / Appendix A for the grammar this will
 *  eventually be READ from; WP1 only carries whatever a person or agent sets
 *  explicitly via `run.size_overrides`. */
export const runSizeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rect"), w_in: z.number().positive(), h_in: z.number().positive() }),
  z.object({ kind: z.literal("round"), d_in: z.number().positive() }),
  z.object({ kind: z.literal("oval"), major_in: z.number().positive(), minor_in: z.number().positive() }),
  z.object({ kind: z.literal("pipe"), nps_in: z.number().positive() }),
]);
export type RunSize = z.infer<typeof runSizeSchema>;

/** Where a segment's size came from. WP1 (manual mode) only ever produces
 *  "manual" (a person/agent set it explicitly) or "withheld" (never set —
 *  still measures LF, just carries no size). "label"/"carried"/"drawn" are
 *  the trace engine's own values (WP3+) and are accepted here so a traced
 *  run's `run` block round-trips through this same type without narrowing. */
export type RunSizeSource = "label" | "carried" | "drawn" | "manual" | "withheld";

export interface RunSegment {
  /** Index into the shape's edge list: edge i runs from vertex i to i+1. */
  i: number;
  /** Length of this edge in real feet (open polyline — never the closed-ring
   *  perimeter; that stays `computed.perimeter_lf`, unchanged). */
  lf: number;
  size?: RunSize;
  size_src: RunSizeSource;
}

export type RunVertexKind = "elbow" | "tee" | "size_change" | "crossing" | "riser" | "equipment" | "symbol_gap" | "end" | "manual";

/** Zod mirror of RunVertexKind — the same "define once, import into MCP"
 *  pattern as runSizeSchema (WP1.5, mcp/src/tools.ts's `edit_run`/
 *  `measure_line` inputs and mcp/src/outputs.ts's computed.run schema).
 *  "end" is real (a shape's own two ends aren't interior vertices — see
 *  RunVertex.i below — so nothing ever authors or reads it as a kind);
 *  input schemas that author a vertex override exclude it explicitly with
 *  `runVertexKindSchema.exclude(["end"])` rather than duplicating the list. */
export const runVertexKindSchema = z.enum(["elbow", "tee", "size_change", "crossing", "riser", "equipment", "symbol_gap", "end", "manual"]);

export interface RunVertex {
  /** Index of the INTERIOR vertex (1..n-2 of an n-point open polyline) this
   *  describes — vertex 0 and vertex n-1 are the run's own ends, never
   *  vertices in this list. */
  i: number;
  kind: RunVertexKind;
  /** Present for "elbow": the turn angle in degrees, 0-180, always positive
   *  (direction-agnostic — a left turn and a right turn of the same amount
   *  read the same angle). */
  angle_deg?: number;
  /** How the angle was classified: within ±6° of 90 or 45 reads "square"/
   *  "45", anything else reads "custom" (plan §6.3's binning). Manual mode
   *  computes this from geometry alone; WP3's trace engine adds radius/
   *  mitred detail on top, additively. */
  angle_class?: "square" | "45" | "custom";
  from?: RunSize;
  to?: RunSize;
  dir?: "up" | "down" | "both";
  /** True when `run.vertex_overrides[i]` set this vertex's kind explicitly,
   *  overriding the geometric guess — the vertex-glyph UI (WP1.3) writes
   *  this by clicking through the fitting menu. */
  manual?: boolean;
}

/** The DERIVED read of a run — `computeShapeMetrics` populates this exactly
 *  like it already populates `perimeter_lf`/`area_sf`; never hand-edited. */
export interface ComputedRun {
  segments: RunSegment[];
  vertices: RunVertex[];
  /** LF total per canonical size key (`runSizeKey`), for sizes that were
   *  actually set; `""` (no size) never appears as a key — an unsized
   *  segment's LF is still counted in `perimeter_lf`, just not broken out
   *  here (per-size aggregation of "no size" isn't a real quantity). */
  totals_by_size: Record<string, number>;
}

/** Zod mirror of ComputedRun (WP1.5) — measure_line and edit_run hand this
 *  straight back on their reply, so an agent sees the same per-segment/
 *  per-vertex read the canvas panel does without a round trip through
 *  export_takeoff. Structural mirror of the interfaces above; kept beside
 *  them so the two can never drift silently. */
export const runSegmentSchema = z.object({
  i: z.number().int(),
  lf: z.number(),
  size: runSizeSchema.optional(),
  size_src: z.enum(["label", "carried", "drawn", "manual", "withheld"]),
});
export const runVertexSchema = z.object({
  i: z.number().int(),
  kind: runVertexKindSchema,
  angle_deg: z.number().optional(),
  angle_class: z.enum(["square", "45", "custom"]).optional(),
  from: runSizeSchema.optional(),
  to: runSizeSchema.optional(),
  dir: z.enum(["up", "down", "both"]).optional(),
  manual: z.boolean().optional(),
});
export const computedRunSchema = z.object({
  segments: z.array(runSegmentSchema),
  vertices: z.array(runVertexSchema),
  totals_by_size: z.record(z.string(), z.number()),
});

/** The AUTHORED state a person/agent sets on a linear shape. Every field is
 *  optional and the whole block is optional on the shape — a plain polyline
 *  with no `run` at all is exactly today's shape. */
export interface AuthoredRun {
  system?: string;
  status?: "new" | "existing" | "demo";
  /** Keyed by the STRING form of the segment index it starts applying from
   *  (segment i runs vertex i → i+1); a segment inherits the nearest
   *  size_override at or before its own index — "carried along the run"
   *  (plan §6.6), just driven by explicit user input instead of a read
   *  label until the trace engine (WP3+) exists. */
  size_overrides?: Record<string, RunSize>;
  /** Keyed by the STRING form of the interior vertex index it overrides. */
  vertex_overrides?: Record<string, { kind: RunVertexKind; dir?: "up" | "down" | "both" }>;
  params?: { rise_ft?: number; offset_allowance_pct?: number; flex_per_diffuser_ft?: number };
}

// ── WP2.2 (assembly.ts) — the pure-function inputs resolveLinearAssembly
// takes beside a ComputedRun. These are intentionally loosely typed on
// their rule arrays (plan §7.3's per_ft/per_vertex/per_run entries): the
// assembly LIBRARY (WP2.4, seeded into the estimator profile) is not built
// yet, so locking the rule shape down now would mean guessing at fields no
// consumer exists to validate against. The RESOLVED output (LineItem) is
// the real contract other code depends on and is fully typed below.

/** The linear-specific fields a Condition record carries (plan §7.2, WP1.2).
 *  Conditions themselves stay untyped JS objects elsewhere (canvasUtil.js
 *  predates this directory); this is only the slice resolveLinearAssembly
 *  reads, so the function has a real parameter type without forcing a
 *  wider Condition interface into existence before anything needs one. */
export interface LinearCondition {
  family?: "duct_rect" | "duct_round" | "duct_oval" | "duct_flex" | "pipe" | "conduit" | "cable" | "tubing";
  system?: string;
  size?: RunSize;
  assembly_id?: string;
  multiplier?: number;
  waste_pct?: number;
}

/** One per_ft/per_vertex/per_run rule inside an AssemblyRecord. `item` and
 *  any of `kind`/`rate`/`factor`/etc. are read ad-hoc by assembly.ts's own
 *  resolvers — see each resolver's own doc comment for which keys it
 *  reads on which item name, the same "the code is the schema until a
 *  second consumer exists" posture as the rest of this loose section. */
export interface AssemblyRule {
  item: string;
  kind?: string;
  [key: string]: unknown;
}

export interface AssemblyRecord {
  id: string;
  family: LinearCondition["family"];
  name: string;
  provenance?: string;
  per_ft: AssemblyRule[];
  per_vertex: AssemblyRule[];
  per_run: AssemblyRule[];
  allowances?: { fitting_weight_factor?: number; scrap_pct?: number; offset_pct?: number; [key: string]: unknown };
  /** D2's `deduct_fittings` switch — off by default (QuoteSoft's "Auto
   *  Elbow" behaviour is opt-in here, never silent): when on, a
   *  size_change transition's own length (4 x the size delta) is
   *  deducted from the adjoining straight LF rather than left additive. */
  deduct_fittings?: boolean;
}

/** Project-level settings resolveLinearAssembly reads (plan §7.4). WP2.2
 *  takes these as a plain parameter object — persisting them on the
 *  project (sanitized, exported in report.v1) is WP2.4's job; nothing
 *  here assumes where the caller got them from. */
export interface LinearAssemblySettings {
  pressure_class_in_wg?: number;
  climate_zone?: "cz0_4" | "cz5_8";
  adopted_pipe_hanger_code?: "mss_sp58" | "imc305_4" | "ipc308_5" | "upc313_3";
  level_height_ft?: number;
}

/** One resolved line item (plan §8's opening contract). `qty` and
 *  `unit_waste_pct`/`purchase_unit` are the LIVE number and its REPORT-ONLY
 *  order-quantity dressing (§8's steps 6-7) — a consumer that only wants
 *  the live number reads `qty`; the Report's order column reads the
 *  waste/rounding fields beside it. `source_vertices`/`source_segments`
 *  are indices into the ComputedRun this item was resolved from — the
 *  "assembly audit trail" estimators ask for (plan §4.2). */
export interface LineItem {
  item: string;
  qty: number;
  unit: string;
  basis: "per_ft" | "per_vertex" | "per_run" | "allowance";
  size_key?: string;
  source_segments?: number[];
  source_vertices?: number[];
  formula: string;
  provenance: string;
  /** True for a line the assembly derives ONLY when data is missing (e.g.
   *  "riser_length:not_drawn") — never silently added, always visible. */
  disclosed?: boolean;
}
