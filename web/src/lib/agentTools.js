// In-canvas takeoff agent — the TOOL REGISTRY. Pure-ish and Node-testable:
// every tool is a name + JSON schema + an execute(ctx, args) that closes over
// canvas-provided CAPABILITIES (the `ctx` contract below), so the registry
// itself never touches React, the DOM, or pdf.js. The model never invents
// geometry — it aims these tools, and the app's own deterministic engines
// (text layer, scheduleParse, the one-click flood fill) compute everything.
//
// Hard rules enforced HERE, not left to the model:
//   - scale gate: a tool that needs real-world units refuses on an uncalibrated
//     sheet with the same refusal the MCP scale gate uses — the agent proposes,
//     never assumes scale;
//   - propose_shapes STAGES proposals only (ctx.proposeShapes lands them in the
//     canvas's agentProposals state, never the committed shapes array) — every
//     shape passes the human accept gate;
//   - evidence is a WHITELIST (pickAgentEvidence): exactly the matched
//     schedule/room token and/or seed, strings truncated, junk keys dropped —
//     and a proposal with no surviving evidence is rejected;
//   - unknown tool or bad args → an { error } RESULT, never a throw (a bad
//     model turn must not crash the loop).
//
// ctx capability contract (the canvas builds this; tests stub it):
//   listSheets(): [{ sheet, title, width, height, scale_set, scale_source?, detected_label? }]
//   uppFor(sheet): number | null        // feet-per-px; null = no scale set
//   sheetDims(sheet): { w, h } | null   // null = sheet not open on the canvas
//   detectedLabel(sheet): string | ""   // drawn-scale note read off the page, if any
//   readSheetText(sheet, region|null): Promise<[{ text, x, y }]>  (normalized coords)
//   readSchedule(sheet, region): Promise<{ source: "region_parse", rows: ScheduleRow[] }
//     | { source: "sheet_graph", table: {...}, rows: [{key,cells}], also_overlapping?: [...] }
//     | { source: "none", rows: [], sheet_open: boolean }>
//     (cross-phase fix — the read_schedule/sheetgraph bridge: no longer just
//     a bare ScheduleRow[] — the sheet_graph fallback answers with the whole-
//     set sheet graph's own table, any kind, even when the sheet isn't open;
//     works with no open tab at all for that path)
//   viewRegion(sheet, region): Promise<{ image_data_url, width, height }>
//   classifySymbol(sheet, region): Promise<{ classification, confidence, reasoning } | { error, raw? }>
//   oneClick(sheet, x, y): Promise<{ verts_norm, area_sf, perimeter_lf, ... } | { error }>
//   getConditions(): [{ id, finish_tag, ... }]
//   createCondition(finish_tag): { id, finish_tag }
//   proposeShapes(shapes): { staged }   // already-whitelisted proposals
//   symbolSweep(sheet, seedRectNorm, opts): { seed, matches, withheld, rejected, complete, dropped } | { error }
//   listShapes(sheet|null): [{ id, sheet_id, condition_id, measure_role, computed, label? }]
//   deleteShapes(ids): { deleted }
//   reassignShapes(ids, condition_id): { reassigned } | { error }
//   undoLast(): { undone: boolean }
//   setScale(sheet, label): { upp, label } | { error }   // parses a drawn-scale label (e.g. from detected_label) — never guesses one itself
//   takeoffSummary(): [{ condition_id, finish_tag, shape_count, count?, area_sf?, perimeter_lf? }]
//   sheetGraph(): Promise<SheetGraph>                    // whole-set schedule tables/tags (Phase 1: eager, no open sheet required)
//   resolveTag(tag): Promise<ResolveResult>
//   findSchedule(kind): Promise<FindScheduleResult>
//   exportTakeoff(): { downloaded, condition_count } | { error }   // real browser download
//   exportReport(): { downloaded, condition_count } | { error }    // real browser download
//   countMarks(marks|undefined): Promise<CountMarksResult>
//   sweepScheduleRow(tag, opts): Promise<SweepScheduleRowResult>   // whole-set, cross-scale corroborated (Phase 3)
//   findText(sheet, q, region|null, limit): Promise<{ count, truncated, hits }>            // whole-set aware (Phase 4)
//   sheetContext(sheet, region|null, minLenPx, maxSegments): Promise<SheetContextResult>    // whole-set aware
//   detectRooms(sheet, opts): Promise<DetectRoomsResult> | { error }   // FIND-ONLY; sheet must be open
//   exportDxf(sheet|undefined, units|undefined): { downloaded, ... } | { error }            // real browser download
//   exportMarkedPdf(includeMarkups): Promise<{ downloaded, bytes } | { error }>              // real browser download
//   annotate(opts): Promise<{ id, sheet, type } | { error }>
//   listAnnotations(sheet|undefined, condition|undefined): { annotations, unattached, verdicts }
//   linkAnnotation(id, condition): { id, condition } | { error }
//   markVerdict(opts): { id, sheet, shape_id? } | { error }         // rides the shared undo stack
//   deleteVerdict(id): { deleted: true } | { error }                // rides the shared undo stack
//   editCondition(tag, opts): { condition_id, finish_tag, ... } | { error }
//   editMaterials(tag, opts): { condition_id, finish_tag, materials } | { error }

// ── evidence whitelist ───────────────────────────────────────────────────────
// Mirrors contribute.js's wire-side deep whitelist byte-for-byte: applying it
// at STAGE time too means junk never even enters app state. matched_text is
// the schedule/room token the agent matched — never arbitrary sheet text.
export const AGENT_EVIDENCE_FIELDS = ["schedule_row_tag", "matched_text", "seed_norm"];
export const EVIDENCE_MAX_CHARS = 80;

/** @returns {Record<string, any> | null} whitelisted evidence, or null when nothing survives */
export function pickAgentEvidence(ev) {
  if (!ev || typeof ev !== "object" || Array.isArray(ev)) return null;
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of AGENT_EVIDENCE_FIELDS) {
    const v = ev[k];
    if (v === undefined) continue;
    out[k] = typeof v === "string" ? v.slice(0, EVIDENCE_MAX_CHARS) : v;
  }
  return Object.keys(out).length ? out : null;
}

// ── scale gate ───────────────────────────────────────────────────────────────
// Same refusal the MCP scale gate speaks (mcp/src/session.ts scaleGate), with
// the tail adapted to this surface: the canvas agent has no set_scale tool —
// scale is the estimator's call, made in the Scale menu or with Calibrate.
export function agentScaleGate(sheet, detectedLabel) {
  return `Set the scale for ${sheet} first — the agent never assumes a scale; ask the estimator to set it (Scale menu or Calibrate)${detectedLabel ? ` (detected: ${detectedLabel})` : ""}.`;
}

// ── minimal JSON-schema validation (the subset the registry uses) ────────────
// Checks required keys and primitive types (string/number/array/object) one
// level deep plus array item types — enough to reject a malformed model call
// with a message it can act on, without a schema-validator dependency.
const typeOf = (v) =>
  Array.isArray(v) ? "array" : v === null ? "null" : typeof v;

export function validateToolArgs(schema, args) {
  if (!schema || schema.type !== "object") return null;
  if (args == null || typeOf(args) !== "object") return "arguments must be a JSON object";
  for (const key of schema.required || []) {
    if (args[key] === undefined) return `missing required argument: ${key}`;
  }
  for (const [key, spec] of Object.entries(schema.properties || {})) {
    const v = args[key];
    if (v === undefined) continue;
    if (spec.type && typeOf(v) !== spec.type) return `argument ${key} must be a ${spec.type}`;
    if (spec.type === "object" && spec.required) {
      for (const rk of spec.required) if (v[rk] === undefined) return `argument ${key} is missing ${rk}`;
    }
    if (spec.type === "array" && spec.items?.type) {
      for (const item of v) {
        if (typeOf(item) !== spec.items.type) return `argument ${key} items must be ${spec.items.type}s`;
      }
    }
    if (spec.type === "number" && spec.minimum !== undefined && v < spec.minimum) return `argument ${key} must be >= ${spec.minimum}`;
    if (spec.type === "number" && spec.maximum !== undefined && v > spec.maximum) return `argument ${key} must be <= ${spec.maximum}`;
  }
  return null;
}

// Normalized region rect — the shared sub-schema. All agent coordinates are
// normalized 0..1 against the sheet (render-scale-free, same frame as
// verts_norm), so nothing the agent says depends on raster resolution.
const REGION_SCHEMA = {
  type: "object",
  description: "Region of the sheet in normalized coordinates (0..1, origin top-left).",
  properties: {
    x0: { type: "number", minimum: 0, maximum: 1 },
    y0: { type: "number", minimum: 0, maximum: 1 },
    x1: { type: "number", minimum: 0, maximum: 1 },
    y1: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["x0", "y0", "x1", "y1"],
};

// ── the registry ─────────────────────────────────────────────────────────────
export const AGENT_TOOL_DEFS = [
  {
    name: "list_sheets",
    description: "List the sheets open on the canvas: key, title, pixel dimensions, and scale status. Tools only work on open sheets. A sheet without a scale set cannot be measured — say so and stop rather than guessing.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "read_sheet_text",
    description: "Read the positioned text items on a sheet (the PDF text layer): room tags, schedule cells, notes. Optionally restrict to a normalized region. Returns [{text, x, y}] with normalized coordinates.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string", description: "Sheet key from list_sheets." },
        region: { ...REGION_SCHEMA, description: "Optional region; omit for the whole sheet." },
      },
      required: ["sheet"],
    },
  },
  {
    name: "read_schedule",
    description: "Read a schedule table's rows. Two paths, tried in order, and the result's `source` field says which one answered: (1) region-based parse of a finish/material table (code, description, manufacturer, style, color, size) — draw the region around the table including its CODE / MATERIAL / ... header; this path needs the sheet open as a tab. (2) Falls back to the whole-set sheet graph's own table (ANY kind, including a real MEP `equipment` schedule keyed by ID rather than CODE) when the region overlaps one — works even when the sheet isn't open. Fallback rows come back as {key, cells} (source: \"sheet_graph\"), not the fixed code/description/... shape region-parse returns (source: \"region_parse\") — a real equipment table's columns (VOLTAGE, WATTS, AMPS, ...) don't fit that shape. Note: this tool's region is normalized 0..1; find_schedule/sheet_graph report table regions in sheet PIXELS — don't pass one straight through.",
    input_schema: {
      type: "object",
      properties: { sheet: { type: "string" }, region: REGION_SCHEMA },
      required: ["sheet", "region"],
    },
  },
  {
    name: "view_region",
    description: "Render a region of the sheet as an image and look at it. Use this for scanned sheets, hatched/ambiguous areas, or to visually confirm what a room contains before proposing.",
    input_schema: {
      type: "object",
      properties: { sheet: { type: "string" }, region: REGION_SCHEMA },
      required: ["sheet", "region"],
    },
  },
  {
    name: "classify_symbol",
    description: "Ask the configured vision model what HVAC/BAS component a symbol is — for a symbol the geometric matcher (symbol_sweep) can't confidently place (a genuinely novel shape), or on a raster/scanned sheet with no vector linework to fingerprint at all. Draw region tightly around ONE symbol. Grounded in this project's own real component taxonomy (valve types, dampers, VAV/CAV boxes, AHU/chiller/boiler/pump/fan and similar, sensors) — the model is asked to pick a real name or say so honestly if none fit, never forced into a bad match. Returns {classification, confidence 0-1, reasoning} — a bare label is never returned; a reply missing any of the three, or a confidence outside [0,1], is refused rather than guessed. This is a HYPOTHESIS: corroborate a low-to-mid confidence result against the sheet's own schedule/tag evidence (resolve_tag, sweep_schedule_row) before treating it as fact, the same discipline symbol_sweep's own near-matches already require. Requires a vision model configured in AI settings.",
    input_schema: {
      type: "object",
      properties: { sheet: { type: "string" }, region: REGION_SCHEMA },
      required: ["sheet", "region"],
    },
  },
  {
    name: "one_click",
    description: "Run the deterministic flood-fill takeoff engine at a seed point inside a room (normalized coordinates). Returns the traced boundary ring (verts_norm), area_sf, perimeter_lf, and trace flags WITHOUT committing anything. This is how you measure a room — never invent geometry yourself.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        x: { type: "number", minimum: 0, maximum: 1, description: "Seed x, normalized 0..1." },
        y: { type: "number", minimum: 0, maximum: 1, description: "Seed y, normalized 0..1." },
      },
      required: ["sheet", "x", "y"],
    },
  },
  {
    name: "get_conditions",
    description: "List the takeoff conditions (finish tags) that exist in this workspace, with their ids. Proposals must reference an existing condition_id.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_condition",
    description: "Create a new takeoff condition for a finish tag (e.g. CPT-1) when no existing condition matches. Returns its condition_id.",
    input_schema: {
      type: "object",
      properties: { finish_tag: { type: "string", description: "Finish code, e.g. LVT-1." } },
      required: ["finish_tag"],
    },
  },
  {
    name: "propose_shapes",
    description: "Stage takeoff proposals for human review. Each shape needs the sheet, the boundary ring from one_click (verts_norm), a condition_id, a measure_role (floor_area or deduct), and EVIDENCE: the schedule row tag and/or the matched room/finish text token and/or the one_click seed. Proposals render as dashed pencil outlines the estimator accepts or rejects — nothing you stage is committed.",
    input_schema: {
      type: "object",
      properties: {
        shapes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sheet: { type: "string" },
              verts_norm: { type: "array", description: "Boundary ring [[x,y],...] normalized 0..1 — use the ring one_click returned." },
              condition_id: { type: "string" },
              measure_role: { type: "string", description: "floor_area or deduct" },
              evidence: {
                type: "object",
                description: "Why this shape: {schedule_row_tag?, matched_text?, seed_norm?}. matched_text is the matched token only (a room tag or schedule cell), never a transcription.",
                properties: {
                  schedule_row_tag: { type: "string" },
                  matched_text: { type: "string" },
                  seed_norm: { type: "array" },
                },
              },
            },
            required: ["sheet", "verts_norm", "condition_id", "measure_role", "evidence"],
          },
        },
      },
      required: ["shapes"],
    },
  },
  {
    name: "symbol_sweep",
    description: "Find EVERY instance of a repeated plan symbol (a valve, a diffuser, any drafted glyph) from ONE example. Give a tight seed_rect around a single instance — only vector segments FULLY inside it define the symbol, so a loose rect that swallows wall linework fingerprints the wall, not the symbol. Deterministic geometry, not vision: each placement scores as the length-weighted fraction of the seed's segments reproduced, under rotation/mirroring (both on by default — plan symbols get rotated). Score >= 0.92 is a match; 0.75-0.92 comes back in `withheld` with a reason — a near-match is a question to look at (view_region), never a silent commit. Refuses on a sheet with no vector linework (a scan) — say so rather than guessing. This tool only FINDS matches; use place_count or propose_shapes (measure_role: count) to stage them for review, one call per accepted match or batch.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        seed_rect_norm: { ...REGION_SCHEMA, description: "Tight marquee around ONE example instance, normalized 0..1." },
        rotations: { type: "boolean", description: "Also match 90/180/270-rotated placements. Default true." },
        mirror: { type: "boolean", description: "Also match mirrored placements. Default true." },
        tolerance_px: { type: "number", minimum: 0.1, maximum: 20, description: "Endpoint match tolerance in image px. Default 2 (CAD jitter, not drift)." },
        luminance_tolerance: { type: "number", minimum: 0, maximum: 254, description: "Optional stroke-luminance gate (0=black..255=white) for flattened exports where a real device and a background twin are geometrically identical but drawn in different pen colors." },
      },
      required: ["sheet", "seed_rect_norm"],
    },
  },
  {
    name: "trace_connectivity",
    description: "Which valve belongs to which equipment — traced through the sheet's OWN drawn linework, not proximity. Pass a seed point ON a drawn pipe/duct/conduit line and the equipment placements it might connect to (from your own prior symbol_sweep/sweep_schedule_row results — this tool does not discover symbols itself); the sheet's vector linework is noded into a connectivity graph once (cached per sheet) and walked from the seed. status 'reached' names the ONE equipment placement a real walked path actually connects to, with the full path and, when every edge on it agrees, the MEP system (piping/ductwork/electrical/controls). status 'ambiguous' fires when a real junction reaches TWO OR MORE different equipment placements within max_hops — every candidate is named with the junction's own coordinates, and NONE is ever picked for you; view_region there and decide by looking. status 'dead_end' distinguishes running out of connected linework (a genuine dead end, or the run continues off-sheet at a match line this tool has no cross-sheet awareness of) from hitting max_hops (raise it and retry). status 'refused' fires with a named reason on: no equipment placements supplied, a seed point not ON any traced linework, or a sheet with no vector linework (a scan). Real drawn gaps at a valve/damper symbol are a genuine drafting convention — pass fittings (your own already-swept valve/damper/fitting placements) to bridge a gap, but ONLY when one sits geometrically IN it (never on proximity alone, never wider than bridge_ft): a bridged edge discloses a bridged-gap(N) factor and discounts confidence. Every result discloses layer_signal — 'none' means more than 'the system type is unclassified': with no PDF layers to exclude by, the trace has no way to separate wall/architectural ink from real MEP linework either, and can walk through walls as if they were pipe/duct (measured live: a real exhaust fan riser traced 52 hops to an unrelated heat pump, almost certainly through wall linework). A long 'reached' result under layer_signal 'none' deserves real skepticism. Named, disclosed risks, not solved here: real crossing-vs-connecting duct/pipe ambiguity (different elevations legitimately cross without connecting), and schematic vs. to-scale double-line duct representation. Corroborate a trace against resolve_tag/sweep_schedule_row before trusting it as the whole story.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        from_norm: { type: "array", items: { type: "number" }, description: "[x,y] normalized 0..1 — the seed point, ON the drawn pipe/duct/conduit line." },
        equipment: {
          type: "array",
          description: "Real, already-swept equipment placements this trace might reach — required; an empty/omitted list is a named refusal.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "The equipment's own tag, e.g. 'AHU-1'." },
              at_norm: { type: "array", items: { type: "number" }, description: "[x,y] normalized 0..1." },
              label: { type: "string" },
            },
          },
        },
        fittings: {
          type: "array",
          description: "Real, already-swept valve/damper/fitting placements (optional) — enables bridging a real drawn gap, only where one of these sits geometrically in it. Omit to disable bridging entirely.",
          items: { type: "object", properties: { at_norm: { type: "array", items: { type: "number" } } } },
        },
        max_hops: { type: "number", description: "Edge-hops to walk before giving up. Default 60." },
        seed_tol_ft: { type: "number", description: "How close (feet) the seed/equipment points must sit to the graph's own linework to count as 'on' it. Default 1.0." },
        bridge_ft: { type: "number", description: "Widest real drawn gap (feet) a fitting placement may bridge. Default 2.0." },
      },
      required: ["sheet", "from_norm", "equipment"],
    },
  },
  {
    name: "place_count",
    description: "Stage one count proposal per point (EA — one each) under a condition. Use for manually-located instances a symbol_sweep match, or a one-off you found by reading the sheet — not for area/room measurement (that's one_click). No scale required. Each proposal renders as a dashed marker the estimator accepts or rejects, exactly like propose_shapes.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        points: {
          type: "array",
          description: "[[x,y], ...] normalized 0..1 — one committed count proposal per point.",
          items: { type: "array" },
        },
        condition_id: { type: "string" },
        evidence: {
          type: "object",
          description: "Why these points: {schedule_row_tag?, matched_text?, seed_norm?}. Applied to every point in this call — for mixed evidence, call place_count separately per point.",
          properties: { schedule_row_tag: { type: "string" }, matched_text: { type: "string" }, seed_norm: { type: "array" } },
        },
      },
      required: ["sheet", "points", "condition_id"],
    },
  },
  {
    name: "list_shapes",
    description: "List committed takeoff shapes (already-accepted, not pending proposals) — id, sheet, condition_id, measure_role, and computed quantity. Optionally restrict to one sheet. Use before delete_shape/edit_shape to find the right id, or to check what's already been taken off before proposing more.",
    input_schema: {
      type: "object",
      properties: { sheet: { type: "string", description: "Optional — omit to list across all open sheets." } },
      required: [],
    },
  },
  {
    name: "delete_shape",
    description: "Delete one or more committed shapes by id (from list_shapes). One undo step for the whole batch. Use to correct a mistake already committed — never to silently drop something the estimator should instead be told about.",
    input_schema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" }, description: "Shape ids from list_shapes." } },
      required: ["ids"],
    },
  },
  {
    name: "edit_shape",
    description: "Reassign one or more committed shapes to a different condition (from list_shapes / get_conditions). Use to correct a mis-tagged shape after the fact — not for changing geometry.",
    input_schema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Shape ids from list_shapes." },
        condition_id: { type: "string", description: "The condition to reassign these shapes to." },
      },
      required: ["ids", "condition_id"],
    },
  },
  {
    name: "undo_last",
    description: "Undo the single most recent committed shape command (mirrors the estimator's own ⌘Z). Use only to correct a mistake made in THIS run — never to silently erase the estimator's own prior work.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "set_scale",
    description: "Set a sheet's drawing scale from a label (e.g. the sheet's own detected_label from list_sheets, like '1/8\" = 1'-0\"'). Refuses if the label can't be parsed into exactly one scale — never guesses. Only call this with a label the sheet itself states (from list_sheets' detected_label, or read directly off the title block with read_sheet_text/view_region) — never a scale you assume.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string" },
        label: { type: "string", description: "The drawn scale exactly as stated on the sheet, e.g. \"1/8\\\" = 1'-0\\\"\"." },
      },
      required: ["sheet", "label"],
    },
  },
  {
    name: "takeoff_summary",
    description: "Get the current per-condition totals across all committed (accepted) shapes — count, area_sf, perimeter_lf as applicable per condition. Use this to report a final tally, or to sanity-check before proposing more.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "sheet_graph",
    description: "Read the whole plan set's schedule tables and tags at once: every sheet's role (plan/schedule/legend/detail/...), every schedule table found (with kind, title, row count, region), room/equipment tags that corroborate as real, and tags that look like a number/mark but aren't. Use this FIRST when a goal references 'the schedule' generically, before hunting region-by-region with read_schedule. Unavailable (not empty) on a scanned set with no text layer.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "resolve_tag",
    description: "Resolve one tag (a room number OR an equipment/schedule mark, e.g. '134', 'CV-3' for a control valve, or 'VAV-12' for a variable-air-volume box) against the sheet graph's tables: returns the schedule row(s) it's defined by, with citations (which sheet, which cell). Refuses with a reason rather than guessing when the tag isn't found, is ambiguous, or the row states nothing usable. Call sheet_graph first if you haven't already this run.",
    input_schema: {
      type: "object",
      properties: { tag: { type: "string", description: "The tag exactly as drawn/labeled, e.g. 'PRV-1' or '134'." } },
      required: ["tag"],
    },
  },
  {
    name: "find_schedule",
    description: "Find schedule table(s) of a given kind across the set — kind: 'room' for a room-finish schedule (numbered rooms → surface finishes), kind: 'finish' for a CODE/MARK/DESCRIPTION/MANUFACTURER-style material/product schedule (flooring, paint, tile — a catalog KEYED BY CODE), kind: 'equipment' for a real MEP equipment schedule — AHUs, RTUs, FCUs, chillers, boilers, pumps, fans, VAV/CAV boxes ('VOLUME CONTROL BOX SCHEDULE' on some real sets — the schedule's own title never says VAV, only its row tags do), control/bypass valves, air separators, humidifiers, VRF/heat pumps, electric wall/baseboard heaters — distinguished by real electrical/mechanical/hydronic rating columns: VOLTAGE, PHASE, WATTS, AMPS, MCA, MOCP, CFM, GPM, HP, TONS, EER, EAT, LAT, EWT, LWT, and similar. Keyed by a row-tag column that reads ID, SYMBOL, MARK, or TAG depending on the firm that drew the set — no one word is universal, so don't assume 'ID' when a table's real key column reads differently. Returns each match's sheet, title, row count, and column headers, without needing to know where it is first. Use before read_schedule when you don't already have a region.",
    input_schema: {
      type: "object",
      properties: { kind: { type: "string", description: "'room' (room-finish schedules), 'finish' (material/product schedules), or 'equipment' (MEP equipment schedules)." } },
      required: ["kind"],
    },
  },
  {
    name: "export_takeoff",
    description: "Export the current committed takeoff (all accepted shapes, not pending proposals) as a CSV — per-condition quantities with waste applied. Triggers a real file download in the estimator's browser; the tool result only confirms it happened. Refuses if nothing is committed yet.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "export_report",
    description: "Export the computed Report document (opentakeoff.report.v1) as JSON — the same schema a pricing/downstream consumer reads: per-condition quantities, per-sheet subtotals, scale provenance. Triggers a real file download; the tool result only confirms it happened. Refuses if nothing is committed yet.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "count_marks",
    description: "Census every value-annotated mark tag across the open plan-role sheets in ONE deterministic call — no seed, no geometry matching, fast. Reads the drafting pattern of a tag drawn with a paired value under it (e.g. 'S1' over '200' — CFM on an air device, GPM on a fixture): a tag WITH a paired value counts, a tag inside a schedule table's own region is a row label (excluded), and every other occurrence comes back WITHHELD with a reason — a tag amid linework but no value may be a real unvalued device (look with view_region), a bare tag is probably a note mention. Marks default to the set's own schedule row keys if you omit them. This tool only FINDS occurrences — use place_count or propose_shapes to stage the ones you want counted, same review gate as everything else. Refuses on a scanned sheet (no text layer) or when no plan-role sheet is open.",
    input_schema: {
      type: "object",
      properties: {
        marks: { type: "array", items: { type: "string" }, description: "The marks to census, e.g. [\"S1\", \"R1\"] — omit to take them from the schedule tables' own row keys." },
      },
      required: [],
    },
  },
  {
    name: "sweep_schedule_row",
    description: "Mint the search seed FROM a schedule row's own drawn tag, instead of you marqueeing an instance — reads the row (via resolve_tag's same tables) and sweeps every PLAN-role sheet in the whole set, not just whichever happen to be open right now. Anchors on the plan sheet with the most drawn occurrences of the tag, fingerprints the marker geometry around it, and — where the tag is drawn more than once anywhere in the set — CORROBORATES that fingerprint against a second occurrence (possibly on a different, differently-scaled sheet) before trusting it; a fingerprint that never recurs is refused rather than swept. Sweeps every plan sheet with the size ratio read from each sheet's own committed scale (a marker seeded on a 1/8\" plan and swept across a 1-1/2\"-detail sheet is resized accordingly; an unset scale on either end is disclosed, never silently assumed). A match is counted only when the marker geometry AND the row's own tag agree (a marker matching the shape but labeled with a sibling row's tag is excluded and named; a shape match with no nearby tag is withheld as a question; a drawn tag occurrence with no matching geometry nearby is reported text_only). Refuses rather than guesses when the tag isn't in any schedule, is ambiguous across tables, or has no fingerprintable linework that corroborates. This tool only FINDS matches; use place_count or propose_shapes to stage the ones you want counted.",
    input_schema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "The schedule row's key exactly as drawn, e.g. 'PRV-1', 'CV-3', or 'VAV-12'." },
        rotations: { type: "boolean", description: "Also match 90/180/270-rotated markers. Default true." },
        mirror: { type: "boolean", description: "Also match mirrored markers. Default true." },
      },
      required: ["tag"],
    },
  },

  // ── Phase 4 (maturity plan): closing the highest-value MCP → browser tool
  // gaps. Coordinates stay normalized (0..1) throughout, this registry's own
  // convention — MCP's equivalents (session.ts) take image px.
  {
    name: "find_text",
    description: "LOCATE a known string on a sheet — the complement to read_sheet_text (which returns what a region SAYS; this finds WHERE a string you already know sits). Case-insensitive substring match against each positioned text run. Whole-set aware — the sheet does not need to be open as a tab (unlike read_sheet_text/view_region). Optionally restrict to a region; results cap at limit (default 200), with count/truncated telling you exactly how much a tighter region or higher limit would recover.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string", description: "Sheet key, e.g. 'plan.pdf' or 'plan.pdf#2' — from list_sheets or sheet_graph." },
        q: { type: "string", description: "Text to find — a room number ('134'), a label fragment ('RECEPTION'), a schedule tag ('CPT-1')." },
        region: REGION_SCHEMA,
        limit: { type: "number", minimum: 1, maximum: 500, description: "Cap on hits returned (default 200)." },
      },
      required: ["sheet", "q"],
    },
  },
  {
    name: "sheet_context",
    description: "The sheet's STRUCTURE in one call: classified vector segments (with per-segment hatch-family membership), positioned text spans, and hatch-family instances of a region — everything the flood engine itself reads, as data instead of pixels. Use it to REASON about a region (what bounds it, at what pen weight, what it says, which fill pattern covers it) rather than to look at it — pair with view_region when you also need to see it. Whole-set aware, like find_text. Decimation is declared: segments shorter than min_len_px drop first, then a max_segments cap applies longest-first (walls survive, hatch strokes go); vectors.kept + vectors.dropped reconciles to total_in_region. A scan returns has_vector_linework: false with empty vectors.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string", description: "Sheet key, e.g. 'plan.pdf' or 'plan.pdf#2'." },
        region: REGION_SCHEMA,
        min_len_px: { type: "number", minimum: 0, description: "Drop segments shorter than this, in image px (default 2). 0 keeps everything." },
        max_segments: { type: "number", minimum: 1, maximum: 20000, description: "Segment cap, applied longest-first (default 4000)." },
      },
      required: ["sheet"],
    },
  },
  {
    name: "detect_rooms",
    description: "Batch room detection: seed the SAME sealed flood one_click uses at every room-number label on the sheet (the same engine, one flood per label instead of one per click), keep only clean non-bubble floods, dedup rings two labels resolve to the same room, and gate out anything under min_area_sf once the sheet has a scale. FIND-ONLY like symbol_sweep/count_marks/sweep_schedule_row — stage the rooms you want with propose_shapes (resolve_tag first if you want to assign each room its schedule-stated finish). The sheet must be open as a tab (it floods the sheet's own working mask, same requirement one_click has) — unlike find_text/sheet_context.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string", description: "Sheet key — must be open as a tab." },
        min_area_sf: { type: "number", minimum: 0, description: "Withhold anything smaller than this, once a scale is set (default 5)." },
      },
      required: ["sheet"],
    },
  },
  {
    name: "export_dxf",
    description: "The committed takeoff as a CAD drawing — a DXF (R2000): AutoCAD/BricsCAD/LibreCAD/Revit import it as native geometry, every shape an LWPOLYLINE on a layer named for its finish. Triggers a real file download; the tool result only confirms it happened. ONE sheet per file, like a DWG — sheet is required only when several open sheets carry shapes (the refusal lists them). Requires the sheet's own scale.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string", description: "Sheet key, required only when ambiguous." },
        units: { type: "string", description: "'ft' (default) or 'm'." },
      },
      required: [],
    },
  },
  {
    name: "export_marked_pdf",
    description: "The reviewed deliverable: every sheet carrying takeoffs/markups/approval marks, the work burned in as drawn, with a legend cover totaling quantities — the same export the estimator's own Export tab produces. Triggers a real file download; the tool result only confirms it happened. Pair with export_report (the numbers) — a takeoff is reviewed on marked drawings, not on numbers alone.",
    input_schema: {
      type: "object",
      properties: {
        include_markups: { type: "boolean", description: "Burn markups (clouds/callouts/text/...) into the PDF too. Default true. Approval marks always burn in regardless." },
      },
      required: [],
    },
  },
  {
    name: "annotate",
    description: "Place an annotation on a sheet — a note ABOUT the work, never a measurement of it. Types: cloud/highlight take rect: [[x0,y0],[x1,y1]] (normalized); text/bubble take at: [x,y] (bubble takes optional r); callout takes at + target: [x,y] (its leader's aim point); arrow takes from + to: [x,y] (tail/head); dimension takes from + to and labels itself with the real length between them at the sheet's scale — the one annotation type the scale gate applies to (refuses on an unscaled sheet, same as the measure tools). Pass condition to attach the note to a finish tag (minted on first touch, like propose_shapes); omit for a note about the sheet itself. No review gate — a cloud reading 'verify substrate' is not geometry.",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string", description: "Sheet key." },
        type: { type: "string", description: "cloud | text | callout | highlight | arrow | bubble | dimension." },
        text: { type: "string", description: "The note. A dimension appends it after the measured length." },
        condition: { type: "string", description: "Finish tag to attach this note to (minted on first use). Omit for an unattached sheet note." },
        at: { type: "array", items: { type: "number" }, description: "[x,y] normalized — text, callout, bubble." },
        target: { type: "array", items: { type: "number" }, description: "[x,y] normalized — callout's leader aim point." },
        rect: { type: "array", items: { type: "array", items: { type: "number" } }, description: "[[x0,y0],[x1,y1]] normalized — cloud, highlight." },
        from: { type: "array", items: { type: "number" }, description: "[x,y] normalized — arrow tail / dimension start." },
        to: { type: "array", items: { type: "number" }, description: "[x,y] normalized — arrow head / dimension end." },
        r: { type: "number", description: "Bubble radius, normalized to sheet width; omit for the canvas default." },
      },
      required: ["sheet", "type"],
    },
  },
  {
    name: "list_annotations",
    description: "Every annotation on the takeoff, condition_id resolved to its finish tag. Filter by sheet, by condition, or both. `unattached` counts notes carrying no condition — the candidates for link_annotation. `verdicts` is the approval family's inventory (mark_verdict/delete_verdict): every mark with its actor — the estimator's APPROVED ring or the agent's AGENT diamond — under the same filters (a condition filter reaches a verdict through its target shape).",
    input_schema: {
      type: "object",
      properties: {
        sheet: { type: "string", description: "Only annotations on this sheet." },
        condition: { type: "string", description: "Only annotations attached to this finish tag." },
      },
      required: [],
    },
  },
  {
    name: "link_annotation",
    description: "Attach an existing annotation to a condition, or detach it by passing an empty condition. Use it to tie up notes left unattached (list_annotations reports how many), or move one to the finish it actually concerns. Attaching mints the tag on first use.",
    input_schema: {
      type: "object",
      properties: {
        annotation_id: { type: "string", description: "Id from annotate or list_annotations." },
        condition: { type: "string", description: "Finish tag to attach to; empty string detaches." },
      },
      required: ["annotation_id"],
    },
  },
  {
    name: "mark_verdict",
    description: "Mark the agent's VERDICT on work — the pencil half of the approval family. Two actors exist: the estimator's APPROVED ring is ink, placed only by the human at the canvas's own Approve tool; this tool mints the AGENT diamond and structurally nothing else. Target the work either way: shape_id anchors ON a committed shape (its area centroid, or a linear run's midpoint, or a count marker's own point) — list_shapes has the ids; or sheet + at drops the mark at a stated sheet point (normalized). Exactly one target. A verdict touches no quantity and gates nothing — it's the agent's signed claim that it checked this work. Rides the shared undo stack (undo_last reverses a mark like any other mutation).",
    input_schema: {
      type: "object",
      properties: {
        shape_id: { type: "string", description: "Mark a committed shape — exactly one target: this OR sheet + at." },
        sheet: { type: "string", description: "Sheet-point mode: the sheet, together with at." },
        at: { type: "array", items: { type: "number" }, description: "Sheet-point mode: [x,y] normalized, where the AGENT diamond renders." },
        text: { type: "string", description: "Optional short note riding the record — the glyph itself always reads AGENT." },
      },
      required: [],
    },
  },
  {
    name: "delete_verdict",
    description: "Lift an agent verdict mark by id (mark_verdict's reply, or list_annotations' verdicts[]). Agent marks only — the estimator's APPROVED seal is human ink and is refused. Rides the shared undo stack.",
    input_schema: {
      type: "object",
      properties: { verdict_id: { type: "string", description: "Record id from mark_verdict or list_annotations verdicts[]." } },
      required: ["verdict_id"],
    },
  },
  {
    name: "edit_condition",
    description: "Set a condition's quantity knobs — waste_pct, multiplier, height_ft (the H knob measure_surface/surface_area quantifies against), and/or roll_setup (the roll-goods opt-in — pass null to opt out). Conditions minted through propose_shapes/place_count start at waste 0 / multiplier 1, so without this an agent's takeoff always ships net === gross. condition must resolve to an EXISTING finish tag. roll_setup here only stores/patches the config (material/roll_width_ft/roll_length_ft/seam_allowance_in/wall_overage_in/doorway_overage_in/direction/price_unit) — the figured order (cuts, order footage) isn't echoed in this reply; check takeoff_summary or export_report for the computed numbers once shapes exist on scaled sheets.",
    input_schema: {
      type: "object",
      properties: {
        condition: { type: "string", description: "Finish tag of an existing condition, e.g. 'CPT-1'." },
        waste_pct: { type: "number", minimum: 0, description: "Waste percentage applied to net order quantities, e.g. 10 for 10%." },
        multiplier: { type: "number", description: "Quantity multiplier (×N identical areas). Must be > 0." },
        height_ft: { type: "number", description: "Wall height in feet — the H knob; measure_surface/surface_area quantifies traced LF × this. Must be > 0." },
        roll_setup: {
          // no `type` here, deliberately — this arg is EITHER an object or
          // JSON null (the opt-out), and the registry's own minimal
          // validator has no union support; declaring type: "object" would
          // reject a genuine null payload before agentEditCondition ever
          // sees it and gets to treat null as "opt out" per its own doc.
          description: "Roll-goods opt-in — an object makes the condition roll goods (or patches the existing setup). Pass JSON null to opt out instead.",
          properties: {
            material: { type: "string", description: "'carpet' | 'sheet_vinyl' | 'rubber'." },
            roll_width_ft: { type: "number" },
            roll_length_ft: { type: "number", description: "0 = unlimited." },
            seam_allowance_in: { type: "number" },
            wall_overage_in: { type: "number" },
            doorway_overage_in: { type: "number" },
            direction: { type: "string", description: "'auto' | 'ns' | 'ew'." },
            price_unit: { type: "string", description: "'sy' | 'sf' | 'lf'." },
          },
        },
      },
      required: ["condition"],
    },
  },
  {
    name: "edit_materials",
    description: "Add, remove, or patch supporting-materials rows on a condition — the coverage-rate lines that turn a measured quantity into an order quantity (adhesive at N sf/gal, grout at N lf/bag, ...). Each row is {name, per, basis, unit, round, note}: quantity = the condition's basis total ÷ per, rounded up to whole purchase units unless round:false. basis is 'area' (default), 'linear', 'count', or 'seam_lf'. condition names an existing OR NEW finish tag (minted on first touch, like propose_shapes) — add alone is enough to seed materials before anything's traced. remove/patch target existing row ids from this reply or list_annotations-style reads; an unknown id refuses the WHOLE call before anything is written.",
    input_schema: {
      type: "object",
      properties: {
        condition: { type: "string", description: "Finish tag, e.g. 'CPT-1'." },
        add: {
          type: "array",
          description: "New rows to add.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              per: { type: "number", minimum: 0, description: "Coverage rate — basis units per purchase unit, e.g. 250 for 1 gal / 250 sf. Default 0." },
              basis: { type: "string", description: "'area' (default) | 'linear' | 'count' | 'seam_lf'." },
              unit: { type: "string", description: "Purchase unit, e.g. 'gal', 'bag', 'roll'." },
              round: { type: "boolean", description: "Round up to whole purchase units — default true." },
              note: { type: "string" },
            },
            required: ["name"],
          },
        },
        remove: { type: "array", items: { type: "string" }, description: "Existing row ids to remove." },
        patch: {
          type: "array",
          description: "Field changes on existing rows.",
          items: {
            type: "object",
            properties: { id: { type: "string" }, fields: { type: "object", description: "name/per/basis/unit/round/note key:value pairs." } },
            required: ["id", "fields"],
          },
        },
      },
      required: ["condition"],
    },
  },
];

const DEFS_BY_NAME = Object.fromEntries(AGENT_TOOL_DEFS.map((d) => [d.name, d]));

const clampRegion = (r) => ({
  x0: Math.max(0, Math.min(1, Math.min(r.x0, r.x1))),
  y0: Math.max(0, Math.min(1, Math.min(r.y0, r.y1))),
  x1: Math.max(0, Math.min(1, Math.max(r.x0, r.x1))),
  y1: Math.max(0, Math.min(1, Math.max(r.y0, r.y1))),
});

const MEASURE_ROLES = new Set(["floor_area", "deduct", "count"]);

/** Shared clean/validate/stage pass for both propose_shapes and place_count —
 *  one chokepoint so a count-role fix (or any future rule) can't drift
 *  between the two callers. Returns { staged, rejected? }. */
function stageValidatedShapes(ctx, rawShapes) {
  const condIds = new Set(ctx.getConditions().map((c) => c.id));
  const clean = [];
  const rejected = [];
  for (const s of rawShapes) {
    const dims = ctx.sheetDims(s.sheet);
    if (!dims) { rejected.push(`sheet ${s.sheet} isn't open`); continue; }
    if (ctx.uppFor(s.sheet) == null) { rejected.push(agentScaleGate(s.sheet, ctx.detectedLabel(s.sheet))); continue; }
    if (!MEASURE_ROLES.has(s.measure_role)) { rejected.push(`measure_role must be floor_area, deduct, or count (got ${JSON.stringify(s.measure_role)})`); continue; }
    if (!condIds.has(s.condition_id)) { rejected.push(`unknown condition_id ${JSON.stringify(s.condition_id)} — use get_conditions or create_condition`); continue; }
    const minPts = s.measure_role === "count" ? 1 : 3;
    const verts = Array.isArray(s.verts_norm)
      ? s.verts_norm.filter((v) => Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]))
      : [];
    if (verts.length < minPts || verts.length !== s.verts_norm.length) {
      rejected.push(s.measure_role === "count"
        ? "a count proposal's verts_norm must be exactly one [x,y] point"
        : "verts_norm must be a ring of at least 3 [x,y] points — use the ring one_click returned");
      continue;
    }
    if (s.measure_role === "count" && verts.length !== 1) { rejected.push("a count proposal's verts_norm must be exactly one [x,y] point"); continue; }
    const evidence = pickAgentEvidence(s.evidence);
    if (!evidence) { rejected.push("every proposal must cite evidence: schedule_row_tag and/or matched_text and/or seed_norm"); continue; }
    clean.push({
      sheet: s.sheet,
      verts_norm: verts.map(([x, y]) => [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]),
      condition_id: s.condition_id,
      measure_role: s.measure_role,
      evidence,
    });
  }
  const staged = clean.length ? ctx.proposeShapes(clean) : { staged: 0 };
  return { staged: staged.staged, ...(rejected.length ? { rejected } : {}) };
}

/**
 * Execute one tool call. NEVER throws — every failure comes back as an
 * `{ error }` result the loop feeds to the model as a tool result, so a bad
 * call is a correctable turn, not a crashed run.
 * @returns {Promise<Record<string, any>>}
 */
export async function executeAgentTool(ctx, name, args) {
  const def = DEFS_BY_NAME[name];
  if (!def) return { error: `Unknown tool: ${name}. Available: ${AGENT_TOOL_DEFS.map((d) => d.name).join(", ")}.` };
  const bad = validateToolArgs(def.input_schema, args);
  if (bad) return { error: `Invalid arguments for ${name}: ${bad}.` };
  try {
    switch (name) {
      case "list_sheets":
        return { sheets: ctx.listSheets() };
      case "read_sheet_text": {
        if (!ctx.sheetDims(args.sheet)) return { error: `Sheet ${args.sheet} isn't open on the canvas — ask the estimator to open it, or pick one from list_sheets.` };
        const items = await ctx.readSheetText(args.sheet, args.region ? clampRegion(args.region) : null);
        return { count: items.length, items };
      }
      case "read_schedule": {
        // No up-front sheetDims gate: that requirement now applies only to
        // the region-parse path (region_parse below), inside ctx.readSchedule
        // itself — the sheet_graph fallback works with no tab open at all
        // (Phase 1's whole-set-awareness parity point).
        const result = await ctx.readSchedule(args.sheet, clampRegion(args.region));
        if (result.source === "region_parse") return { source: result.source, rows: result.rows };
        if (result.source === "sheet_graph") {
          return {
            source: result.source, table: result.table, rows: result.rows,
            note: "The region parse found no CODE/MATERIAL-style finish table there; these rows come from the whole-set sheet graph instead.",
            ...(result.also_overlapping ? { also_overlapping: result.also_overlapping } : {}),
          };
        }
        // source === "none": nothing on either path. When the sheet was
        // never open, say so explicitly — otherwise the agent has no way to
        // tell "your region was wrong" apart from "you never opened this
        // sheet's region-parse path at all" (Finding, cross-phase fix).
        return {
          source: "none", rows: [],
          note: result.sheet_open
            ? "No schedule table found in that region — and no whole-table match either. Try find_schedule({kind:\"room\"|\"finish\"|\"equipment\"}) if you don't already know the table's kind, or sheet_graph to see every schedule on this sheet. (If you did mean a finish/material table, draw the region around its CODE / MATERIAL / ... header. Note: regions from find_schedule/sheet_graph are in sheet PIXELS; this tool takes normalized 0..1.)"
            : `Sheet ${args.sheet} isn't open on the canvas, so only the whole-table fallback ran — and it found no match either. Try find_schedule({kind:"room"|"finish"|"equipment"}) or sheet_graph, or open the sheet as a tab and retry for the region-based parse.`,
        };
      }
      case "view_region": {
        if (!ctx.sheetDims(args.sheet)) return { error: `Sheet ${args.sheet} isn't open on the canvas — pick one from list_sheets.` };
        const img = await ctx.viewRegion(args.sheet, clampRegion(args.region));
        // image_data_url is lifted into an image block by the loop, never
        // serialized into the text result.
        return { image_data_url: img.image_data_url, width: img.width, height: img.height };
      }
      case "classify_symbol": {
        if (!ctx.sheetDims(args.sheet)) return { error: `Sheet ${args.sheet} isn't open on the canvas — pick one from list_sheets.` };
        return await ctx.classifySymbol(args.sheet, clampRegion(args.region));
      }
      case "one_click": {
        if (!ctx.sheetDims(args.sheet)) return { error: `Sheet ${args.sheet} isn't open on the canvas — pick one from list_sheets.` };
        if (ctx.uppFor(args.sheet) == null) return { error: agentScaleGate(args.sheet, ctx.detectedLabel(args.sheet)) };
        return await ctx.oneClick(args.sheet, args.x, args.y);
      }
      case "get_conditions":
        return { conditions: ctx.getConditions() };
      case "create_condition": {
        const tag = args.finish_tag.trim();
        if (!tag) return { error: "finish_tag must be a non-empty string." };
        const existing = ctx.getConditions().find((c) => c.finish_tag.toUpperCase() === tag.toUpperCase());
        if (existing) return { condition_id: existing.id, finish_tag: existing.finish_tag, note: "already existed" };
        const made = ctx.createCondition(tag);
        return { condition_id: made.id, finish_tag: made.finish_tag };
      }
      case "propose_shapes":
        return stageValidatedShapes(ctx, args.shapes);

      case "symbol_sweep": {
        if (!ctx.sheetDims(args.sheet)) return { error: `Sheet ${args.sheet} isn't open on the canvas — pick one from list_sheets.` };
        return await ctx.symbolSweep(args.sheet, clampRegion(args.seed_rect_norm), {
          rotations: args.rotations !== false,
          mirror: args.mirror !== false,
          tolerancePx: args.tolerance_px,
          luminanceTolerance: args.luminance_tolerance,
        });
      }

      case "trace_connectivity": {
        if (!ctx.sheetDims(args.sheet)) return { error: `Sheet ${args.sheet} isn't open on the canvas — pick one from list_sheets.` };
        if (!Array.isArray(args.from_norm) || args.from_norm.length !== 2) return { error: "Pass from_norm as [x,y] normalized 0..1." };
        return await ctx.traceConnectivity(args.sheet, {
          from: args.from_norm,
          equipment: (args.equipment || []).map((e) => ({ id: e.id, at: e.at_norm, label: e.label })),
          fittings: (args.fittings || []).map((f) => ({ at: f.at_norm })),
          maxHops: args.max_hops,
          seedTolFt: args.seed_tol_ft,
          bridgeFt: args.bridge_ft,
        });
      }

      case "place_count": {
        const shapes = (args.points || []).map((pt) => ({
          sheet: args.sheet,
          verts_norm: [pt],
          condition_id: args.condition_id,
          measure_role: "count",
          evidence: args.evidence || { seed_norm: pt },
        }));
        return stageValidatedShapes(ctx, shapes);
      }

      case "list_shapes":
        return { shapes: ctx.listShapes(args.sheet || null) };

      case "delete_shape": {
        if (!Array.isArray(args.ids) || !args.ids.length) return { error: "ids must be a non-empty array of shape ids." };
        return ctx.deleteShapes(args.ids);
      }

      case "edit_shape": {
        if (!Array.isArray(args.ids) || !args.ids.length) return { error: "ids must be a non-empty array of shape ids." };
        const condIds = new Set(ctx.getConditions().map((c) => c.id));
        if (!condIds.has(args.condition_id)) return { error: `unknown condition_id ${JSON.stringify(args.condition_id)} — use get_conditions or create_condition` };
        return ctx.reassignShapes(args.ids, args.condition_id);
      }

      case "undo_last":
        return ctx.undoLast();

      case "set_scale": {
        if (!ctx.sheetDims(args.sheet)) return { error: `Sheet ${args.sheet} isn't open on the canvas — pick one from list_sheets.` };
        return ctx.setScale(args.sheet, args.label);
      }

      case "takeoff_summary":
        return { rows: ctx.takeoffSummary() };

      case "sheet_graph":
        return await ctx.sheetGraph();

      case "resolve_tag": {
        const tag = (args.tag || "").trim();
        if (!tag) return { error: "Pass a tag, e.g. resolve_tag { tag: \"PRV-1\" }." };
        return await ctx.resolveTag(tag);
      }

      case "find_schedule": {
        const kind = (args.kind || "").trim();
        if (!kind) return { error: "Pass a kind, e.g. find_schedule { kind: \"finish\" } or { kind: \"room\" }." };
        return await ctx.findSchedule(kind);
      }

      case "export_takeoff":
        return ctx.exportTakeoff();

      case "export_report":
        return ctx.exportReport();

      case "count_marks":
        return await ctx.countMarks(args.marks);

      case "sweep_schedule_row": {
        const tag = (args.tag || "").trim();
        if (!tag) return { error: "Pass a tag, e.g. sweep_schedule_row { tag: \"PRV-1\" }." };
        return await ctx.sweepScheduleRow(tag, { rotations: args.rotations, mirror: args.mirror });
      }

      // ── Phase 4 ───────────────────────────────────────────────────────────
      case "find_text":
        return await ctx.findText(args.sheet, args.q, args.region ? clampRegion(args.region) : null, args.limit);

      case "sheet_context":
        return await ctx.sheetContext(args.sheet, args.region ? clampRegion(args.region) : null, args.min_len_px, args.max_segments);

      case "detect_rooms": {
        if (!ctx.sheetDims(args.sheet)) return { error: `Sheet ${args.sheet} isn't open on the canvas — pick one from list_sheets.` };
        return await ctx.detectRooms(args.sheet, { minAreaSf: args.min_area_sf });
      }

      case "export_dxf":
        return ctx.exportDxf(args.sheet, args.units);

      case "export_marked_pdf":
        return await ctx.exportMarkedPdf(args.include_markups);

      case "annotate": {
        const t = args.type;
        const need = (cond, msg) => cond || msg;
        if (t === "cloud" || t === "highlight") { const m = need(Array.isArray(args.rect) && args.rect.length === 2, `${t} needs rect: [[x0,y0],[x1,y1]]`); if (m !== true) return { error: m }; }
        else if (t === "callout") { const m = need(Array.isArray(args.at) && Array.isArray(args.target), "callout needs at and target"); if (m !== true) return { error: m }; }
        else if (t === "text" || t === "bubble") { const m = need(Array.isArray(args.at), `${t} needs at: [x,y]`); if (m !== true) return { error: m }; }
        else if (t === "arrow" || t === "dimension") { const m = need(Array.isArray(args.from) && Array.isArray(args.to), `${t} needs from and to`); if (m !== true) return { error: m }; }
        // condition resolution: the create_condition find-or-mint pattern —
        // an annotation's condition is never a hard requirement (many notes
        // are about the sheet itself), so this only runs when one is named.
        let condition_id = "";
        if (args.condition) {
          const tag = args.condition.trim();
          if (tag) {
            const existing = ctx.getConditions().find((c) => c.finish_tag.toUpperCase() === tag.toUpperCase());
            condition_id = existing ? existing.id : ctx.createCondition(tag).id;
          }
        }
        return await ctx.annotate({
          sheet: args.sheet, type: t, text: args.text || "", condition_id,
          at: args.at, target: args.target, rect: args.rect, from: args.from, to: args.to, r: args.r,
        });
      }

      case "list_annotations":
        return ctx.listAnnotations(args.sheet, args.condition);

      case "link_annotation": {
        if (args.condition === undefined) return { error: "Pass condition — a finish tag to attach to, or \"\" to detach." };
        return ctx.linkAnnotation(args.annotation_id, args.condition);
      }

      case "mark_verdict": {
        const byShape = args.shape_id !== undefined;
        const byPoint = args.sheet !== undefined || args.at !== undefined;
        if (byShape === byPoint) return { error: "Provide exactly one target: shape_id (mark a committed shape), or sheet + at (mark a sheet point)." };
        if (byPoint && (args.sheet === undefined || args.at === undefined)) return { error: "A sheet-point verdict needs BOTH sheet and at: [x, y] (normalized)." };
        return ctx.markVerdict({ shape_id: args.shape_id, sheet: args.sheet, at: args.at, text: args.text });
      }

      case "delete_verdict":
        return ctx.deleteVerdict(args.verdict_id);

      case "edit_condition": {
        const tag = (args.condition || "").trim();
        if (!tag) return { error: "Pass condition — an existing finish tag." };
        return ctx.editCondition(tag, {
          wastePct: args.waste_pct, multiplier: args.multiplier, heightFt: args.height_ft,
          ...(Object.prototype.hasOwnProperty.call(args, "roll_setup") ? { rollSetup: args.roll_setup } : {}),
        });
      }

      case "edit_materials": {
        const tag = (args.condition || "").trim();
        if (!tag) return { error: "Pass condition — an existing or new finish tag." };
        return ctx.editMaterials(tag, { add: args.add, remove: args.remove, patch: args.patch });
      }
    }
  } catch (e) {
    return { error: `Tool ${name} failed: ${String((e && e.message) || e)}` };
  }
  return { error: `Unknown tool: ${name}.` }; // unreachable; keeps the contract airtight
}
