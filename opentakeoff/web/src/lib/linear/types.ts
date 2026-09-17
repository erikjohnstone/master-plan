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
