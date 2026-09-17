// Linear takeoff (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md WP2.2) —
// resolveLinearAssembly: the pure function that turns a ComputedRun + a
// Condition + an AssemblyRecord + project settings into line items, per
// plan §8 (plans/03-linear-takeoff-hvac-bas-plan.md). Pure, React-free,
// DOM-free, same shared-path discipline as this directory's other modules.
//
// SCOPE OF THIS COMMIT (documented honestly rather than silently narrowed —
// see PROGRESS.md's own WP2.2 checkpoint for the same list): §8.1's duct
// weight/insulation and pipe material/insulation/coupling formulas, §8.2's
// elbow and size_change/transition formulas (deduct_fittings included),
// §8.3's hanger formula, and per-foot labor. NOT yet implemented — each
// needs a WP1 vertex/param representation that does not exist yet and is
// called out inline where it would plug in: diffuser taps + flex runouts
// (needs an AuthoredRun.params diffuser_count — §8.3 itself says "or a
// user count" but WP1.1 never added the field), tee/riser fitting resolution
// off a REAL vertex (WP1's vertex model only emits "elbow" from a genuine
// geometric turn or an explicit override — see run.ts's own header comment;
// an override CAN supply "tee"/"riser"/"equipment" today and this module
// resolves those correctly when present, it is only the AUTOMATIC
// derivation that is WP3+), sleeves/firestop (needs wall_crossings, which
// computeShapeMetrics does not populate for a linear run yet), tests/flush
// (per-run, needs a condition-level `test_per` flag), and the offset/
// undrawn-fittings allowances (need the condition's schematic-sheet flag).
//
// ORDER OF OPERATIONS IS FIXED (plan §8's own opening list) and this
// function returns line items in exactly that order: per-segment, then
// per-vertex, then per-run, then allowances, then (report-only, NOT
// applied to qty here — see the module doc on waste/rounding) the
// condition multiplier is applied to every live qty as the very last step
// before returning, since "x condition multiplier" is step 5 of 7 and
// nothing after it (waste, rounding) touches the live number at all.
import { runSizeKey, sizeLabel } from "./run.ts";
import {
  ductGaugeFor, ductWeightPerSf, ductLabor, ductInsulationRValue,
  pipeHangerSpacingFt, pipeInsulationThicknessIn, pipeLabor, hangerCount,
} from "./rates.ts";
import type {
  AssemblyRecord, ComputedRun, LinearAssemblySettings, LinearCondition,
  LineItem, RunSegment, RunSize,
} from "./types.ts";

const SEAM_FACTOR = (ductLabor as { seam_joint_allowance: { value: number } }).seam_joint_allowance.value;
const HR_PER_LB = (ductLabor as { hr_per_lb: { value: number } }).hr_per_lb.value;
const DUCT_JOINT_SECTION_FT = 5; // plan §8.4's own worked example (ceil(LF/5)); A1's rectangular default

/** Girth in feet for a duct size — same formula rates.ts's ductWeightPerLf
 *  uses, exposed here too since insulation needs it at an OFFSET dimension
 *  (size + 2t per side), not the bare size. */
function girthFt(size: RunSize, addPerSideIn = 0): number {
  if (size.kind === "rect") return (2 * (size.w_in + 2 * addPerSideIn + (size.h_in + 2 * addPerSideIn))) / 12;
  if (size.kind === "round") return (Math.PI * (size.d_in + 2 * addPerSideIn)) / 12;
  if (size.kind === "oval") return (Math.PI * (size.major_in + 2 * addPerSideIn + (size.minor_in + 2 * addPerSideIn))) / 2 / 12;
  return 0; // pipe: no sheet-metal girth
}

/** The "longest side" A1's gauge table keys on — max(W,H) rect, D round,
 *  major oval. */
function longestSideIn(size: RunSize): number {
  if (size.kind === "rect") return Math.max(size.w_in, size.h_in);
  if (size.kind === "round") return size.d_in;
  if (size.kind === "oval") return size.major_in;
  return 0;
}

/** Groups a run's segments by size key, in FIRST-APPEARANCE order (so
 *  output line order is stable and matches how an estimator reads the run
 *  top to bottom, not an arbitrary object-key order). Segments with no
 *  size are skipped — §8.5's "withheld sizes still contribute LF" is
 *  about perimeter_lf, unaffected by this per-size assembly path. */
function groupBySize(segments: RunSegment[]): { key: string; size: RunSize; segIdx: number[]; lf: number }[] {
  const order: string[] = [];
  const groups = new Map<string, { size: RunSize; segIdx: number[]; lf: number }>();
  for (const seg of segments) {
    if (!seg.size) continue;
    const key = runSizeKey(seg.size);
    if (!groups.has(key)) { groups.set(key, { size: seg.size, segIdx: [], lf: 0 }); order.push(key); }
    const g = groups.get(key)!;
    g.segIdx.push(seg.i);
    g.lf = +(g.lf + seg.lf).toFixed(2);
  }
  return order.map((key) => ({ key, ...groups.get(key)! }));
}

function isDuct(family: LinearCondition["family"]): boolean {
  return family === "duct_rect" || family === "duct_round" || family === "duct_oval" || family === "duct_flex";
}

// ── §8.1 per-segment (size-keyed) ────────────────────────────────────────

function resolvePerFtDuct(groups: ReturnType<typeof groupBySize>, assembly: AssemblyRecord, settings: LinearAssemblySettings): LineItem[] {
  const items: LineItem[] = [];
  const pressureClass = settings.pressure_class_in_wg ?? 2;
  const insulationRule = assembly.per_ft.find((r) => r.item === "insulation_sf");
  const thicknessIn = (insulationRule?.thickness_in as number | undefined) ?? 1.5;
  const lapFactor = (insulationRule?.lap_factor as number | undefined) ?? 1.10;
  const ductLbRule = assembly.per_ft.find((r) => r.item === "duct_lb");
  // An assembly may PIN a single gauge for every size it prices (a real
  // estimating choice — one gauge for a whole small assembly rather than a
  // per-segment table lookup; plan §8.4's own worked example does exactly
  // this: "simplified gauge -> 26 ga BOTH sizes", which is NOT what A1's
  // longest-side table alone would give the 16x8 segment). Falls back to
  // the table lookup (rates.ductGaugeFor) when the assembly leaves it
  // unset, which is the common case.
  const fixedGauge = ductLbRule?.gauge as number | undefined;
  let totalLb = 0;
  for (const g of groups) {
    const gauge = fixedGauge ?? ductGaugeFor(longestSideIn(g.size)).value;
    const lbPerSf = ductWeightPerSf(gauge).value;
    const lb = +(g.lf * girthFt(g.size) * lbPerSf * SEAM_FACTOR).toFixed(1);
    totalLb += lb;
    items.push({
      item: "duct_lb", qty: lb, unit: "lb", basis: "per_ft", size_key: g.key,
      source_segments: g.segIdx,
      formula: `${g.lf} LF x girth(${sizeLabel(g.size)})=${girthFt(g.size).toFixed(3)} ft x ${lbPerSf} lb/sf (${gauge} ga, pressure class ${pressureClass}" w.g.) x ${SEAM_FACTOR} seam`,
      provenance: ductWeightPerSf(gauge).source,
    });
    const sf = +(g.lf * girthFt(g.size, thicknessIn) * lapFactor).toFixed(1);
    items.push({
      item: "insulation_sf", qty: sf, unit: "SF", basis: "per_ft", size_key: g.key,
      source_segments: g.segIdx,
      formula: `${g.lf} LF x girth(${sizeLabel(g.size)} + 2x${thicknessIn}") x ${lapFactor} lap`,
      provenance: ductInsulationRValue("unconditioned_space").source,
    });
  }
  items.push({
    item: "labor_hr", qty: +(totalLb * HR_PER_LB).toFixed(2), unit: "hr", basis: "per_ft",
    formula: `${totalLb.toFixed(1)} lb x ${HR_PER_LB} hr/lb`,
    provenance: (ductLabor as { hr_per_lb: { source: string } }).hr_per_lb.source,
  });
  return items;
}

function resolvePerFtPipe(groups: ReturnType<typeof groupBySize>, service: "hw_dhw_105_140f" | "chilled_40_60f" | string): LineItem[] {
  const items: LineItem[] = [];
  const stickFt = (pipeLabor as { couplings_per_stick: { copper_pvc_ft: number } }).couplings_per_stick.copper_pvc_ft;
  const fallbackHrPerLf = (pipeLabor as { fallback_hr_per_lf: { value: number; source: string } }).fallback_hr_per_lf;
  for (const g of groups) {
    if (g.size.kind !== "pipe") continue;
    items.push({
      item: "pipe_lf", qty: g.lf, unit: "LF", basis: "per_ft", size_key: g.key, source_segments: g.segIdx,
      formula: `Sum of segment LF at ${sizeLabel(g.size)}`, provenance: "computed.run.segments (this run's own measured LF)",
    });
    const sticks = Math.ceil(g.lf / stickFt);
    items.push({
      item: "coupling", qty: Math.max(0, sticks - 1), unit: "ea", basis: "per_ft", size_key: g.key,
      formula: `ceil(${g.lf} / ${stickFt} ft stick) - 1`, provenance: "plans/03-research/02-mep-linear-estimating-math-and-standards.md D1",
    });
    const thickness = pipeInsulationThicknessIn(service as never, g.size.nps_in);
    items.push({
      item: "insulation_lf", qty: g.lf, unit: "LF", basis: "per_ft", size_key: g.key,
      formula: `${g.lf} LF at ${thickness.value}" thickness (${service}, NPS ${g.size.nps_in})`, provenance: thickness.source,
    });
    items.push({
      item: "labor_hr", qty: +(g.lf * fallbackHrPerLf.value).toFixed(2), unit: "hr", basis: "per_ft", size_key: g.key,
      formula: `${g.lf} LF x ${fallbackHrPerLf.value} hr/LF (per-LF fallback basis)`, provenance: fallbackHrPerLf.source,
    });
  }
  return items;
}

// ── §8.2 per-vertex ──────────────────────────────────────────────────────

/** Δ for a transition's developed length (A5's 15-30° taper rule of thumb,
 *  written up as plan §8.2's "4 x Δ"): the larger of the two dimensions'
 *  absolute change, in inches. Round duct uses the diameter change. */
function sizeDeltaIn(from: RunSize, to: RunSize): number {
  if (from.kind === "rect" && to.kind === "rect") return Math.max(Math.abs(to.w_in - from.w_in), Math.abs(to.h_in - from.h_in));
  if (from.kind === "round" && to.kind === "round") return Math.abs(to.d_in - from.d_in);
  if (from.kind === "pipe" && to.kind === "pipe") return Math.abs(to.nps_in - from.nps_in);
  return 0; // a size-KIND change (rect to round) has no single "delta" — length falls back to 0, disclosed via the formula string
}

/** Size-change (transition/reducer) events, derived from CONSECUTIVE
 *  SEGMENT sizes rather than `vertices[]`'s own "size_change" kind: WP1's
 *  vertex resolver (run.ts) only ever emits "elbow" from a real geometric
 *  turn, or whatever kind an explicit `vertex_overrides` entry states — it
 *  never infers "size_change" itself (that needs the trace engine, WP3+,
 *  reading a drawn label; see run.ts's own header comment). A run with two
 *  differently-sized straight segments and NO turn between them (exactly
 *  plan §8.4's own worked example — 18.2 ft of 12x6 to 29 ft of 16x8 in a
 *  dead-straight run) has NOTHING in `vertices[]` at that boundary at all.
 *  Comparing segments directly is therefore the only signal that actually
 *  exists in WP1/WP2's data model for this — documented here rather than
 *  silently deviating from §7.1's illustrative jsonc, which shows a
 *  "size_change" vertex that nothing currently populates. */
function sizeChangeEvents(segments: RunSegment[]): { atVertex: number; from: RunSize; to: RunSize }[] {
  const events: { atVertex: number; from: RunSize; to: RunSize }[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i].size, b = segments[i + 1].size;
    if (a && b && runSizeKey(a) !== runSizeKey(b)) events.push({ atVertex: segments[i + 1].i, from: a, to: b });
  }
  return events;
}

function resolvePerVertex(run: ComputedRun, assembly: AssemblyRecord): { items: LineItem[]; jointCount: number; deductLfBySeg: Map<number, number> } {
  const items: LineItem[] = [];
  let jointCount = 0;
  const deductLfBySeg = new Map<number, number>(); // segment index -> ft to deduct from that segment's own LF

  for (const v of run.vertices) {
    if (v.kind === "elbow") {
      const elbowRule = assembly.per_vertex.find((r) => r.kind === "elbow");
      const laborFactor = (elbowRule?.labor_factor as number | undefined) ?? 1.4;
      jointCount += 2;
      items.push({
        item: "elbow", qty: 1, unit: "ea", basis: "per_vertex", source_vertices: [v.i],
        formula: `angle ${v.angle_deg ?? "?"}° (${v.angle_class ?? "custom"}), labor factor ${laborFactor}`,
        provenance: "plan §8.2 (plans/03-linear-takeoff-hvac-bas-plan.md)",
      });
    }
    // tee/riser/equipment/crossing/symbol_gap: correctly resolvable when an
    // explicit vertex_override supplies them (the "kind" the estimator set
    // is exactly what plan §8.2 keys on), but WP1's automatic geometry pass
    // never emits them itself — see the module doc. Left unimplemented
    // here rather than guessed at with no real fixture to test against.
  }

  for (const ev of sizeChangeEvents(run.segments)) {
    const delta = sizeDeltaIn(ev.from, ev.to);
    jointCount += 2;
    const kind = ev.from.kind === ev.to.kind ? "transition" : "reducer";
    items.push({
      item: kind, qty: 1, unit: "ea", basis: "per_vertex", source_vertices: [ev.atVertex],
      formula: `${sizeLabel(ev.from)} → ${sizeLabel(ev.to)}, developed length 4 x ${delta}in = ${((4 * delta) / 12).toFixed(2)} ft`,
      provenance: "plan §8.2 (plans/03-linear-takeoff-hvac-bas-plan.md); A5 taper rule of thumb, [M]",
    });
    if (assembly.deduct_fittings && delta > 0) {
      // Deduct from the segment BEFORE the transition (the plan's own
      // wording — "deducted from the straight LF" — does not specify
      // which side; taking it from the upstream segment is the QuoteSoft
      // "Auto Elbow" convention this mirrors (research doc A5/B4).
      const segBefore = ev.atVertex - 1;
      deductLfBySeg.set(segBefore, (deductLfBySeg.get(segBefore) ?? 0) + (4 * delta) / 12);
    }
  }
  return { items, jointCount, deductLfBySeg };
}

// ── §8.3 per-run ─────────────────────────────────────────────────────────

function resolvePerRunDuctHangers(groups: ReturnType<typeof groupBySize>): LineItem[] {
  const items: LineItem[] = [];
  for (const g of groups) {
    const count = hangerCount(g.lf, 10); // IMC 603.10 code floor — see rates.ductHangerSpacingFor
    items.push({
      item: "hanger", qty: count, unit: "ea", basis: "per_run", size_key: g.key, source_segments: g.segIdx,
      formula: `ceil(${g.lf} / 10 ft) + 1, min 2`,
      provenance: "IMC 2021 §603.10 (code floor) + plan §8.3",
    });
  }
  return items;
}

function resolvePerRunPipeHangers(groups: ReturnType<typeof groupBySize>, service: "mechanical" | "plumbing", material: string, adoptedCode: LinearAssemblySettings["adopted_pipe_hanger_code"]): LineItem[] {
  const items: LineItem[] = [];
  for (const g of groups) {
    if (g.size.kind !== "pipe") continue;
    const spacing = pipeHangerSpacingFt(service, g.size.nps_in, material, adoptedCode);
    if (!spacing) continue;
    const count = hangerCount(g.lf, spacing.value);
    items.push({
      item: "hanger", qty: count, unit: "ea", basis: "per_run", size_key: g.key,
      formula: `ceil(${g.lf} / ${spacing.value} ft) + 1, min 2`, provenance: spacing.source,
    });
  }
  return items;
}

// ── Public entry point ───────────────────────────────────────────────────

export interface ResolveLinearAssemblyOptions {
  /** pipe insulation service band (chilled/hot/etc.) — required only when
   *  the condition's family is "pipe"; a duct condition ignores it. */
  pipeService?: string;
  /** pipe hanger material key (rates.pipeHangerSpacingFt's own `material`
   *  parameter) — required only for a "pipe" family condition. */
  pipeHangerMaterial?: string;
  pipeHangerService?: "mechanical" | "plumbing";
}

/**
 * resolveLinearAssembly(run, condition, assembly, settings) — plan §8's
 * pure resolver. Returns line items in the FIXED order: per-segment, then
 * per-vertex, then per-run (§8.5's determinism invariant: same inputs,
 * same order, same numbers, every time — no Date.now()/Math.random()
 * anywhere in this module). The condition's `multiplier` (default 1) is
 * applied to every qty as the LAST step, matching §8's own step 5; waste
 * and rounding (steps 6-7) are deliberately NOT done here — they are
 * REPORT-ONLY per the plan and belong to whatever renders the order
 * column, never to this live-quantity function.
 */
export function resolveLinearAssembly(
  run: ComputedRun,
  condition: LinearCondition,
  assembly: AssemblyRecord,
  settings: LinearAssemblySettings = {},
  options: ResolveLinearAssemblyOptions = {},
): LineItem[] {
  const groups = groupBySize(run.segments);
  const family = condition.family ?? assembly.family;

  const perVertex = resolvePerVertex(run, assembly);

  // Apply deduct_fittings LF deductions, if any, to a COPY of the groups'
  // per-segment LF before any per_ft/per_run math reads it — never mutate
  // the caller's ComputedRun.
  const adjustedGroups = perVertex.deductLfBySeg.size === 0 ? groups : groups.map((g) => ({
    ...g,
    lf: +(g.lf - g.segIdx.reduce((sum, segIdx) => sum + (perVertex.deductLfBySeg.get(segIdx) ?? 0), 0)).toFixed(2),
  }));

  const items: LineItem[] = [];
  if (isDuct(family)) {
    items.push(...resolvePerFtDuct(adjustedGroups, assembly, settings));
    items.push(...perVertex.items);
    items.push({
      item: "joint", qty: adjustedGroups.reduce((n, g) => n + Math.ceil(g.lf / DUCT_JOINT_SECTION_FT), 0) + perVertex.jointCount,
      unit: "ea", basis: "per_run",
      formula: `Σ ceil(LF_size / ${DUCT_JOINT_SECTION_FT} ft) + Σ vertex joints (${perVertex.jointCount})`,
      provenance: "plan §8.2/§8.4 (plans/03-linear-takeoff-hvac-bas-plan.md)",
    });
    items.push(...resolvePerRunDuctHangers(adjustedGroups));
  } else if (family === "pipe") {
    items.push(...resolvePerFtPipe(adjustedGroups, options.pipeService ?? "hw_dhw_105_140f"));
    items.push(...perVertex.items);
    items.push(...resolvePerRunPipeHangers(adjustedGroups, options.pipeHangerService ?? "mechanical", options.pipeHangerMaterial ?? "steel", settings.adopted_pipe_hanger_code));
  }
  // conduit/cable/tubing (BAS): not yet wired — basDefaults.json's rates
  // exist (WP2.1) but no per_ft/per_vertex resolver consumes them yet.

  const multiplier = condition.multiplier ?? 1;
  if (multiplier === 1) return items;
  return items.map((it) => ({ ...it, qty: +(it.qty * multiplier).toFixed(4), formula: `${it.formula} x ${multiplier} multiplier` }));
}
