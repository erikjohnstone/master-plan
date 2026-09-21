// Linear takeoff (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md WP2.1) — graded
// rate lookups for duct/pipe/BAS assemblies. Pure, React-free, DOM-free, same
// shared-path discipline as types.ts/run.ts in this directory (imported
// identically by the canvas and by mcp/src/session.ts).
//
// Every number here traces to plans/03-research/02-mep-linear-estimating-
// math-and-standards.md and carries a grade: "C" (codified — a public
// adopted-code table: IMC/IPC/UPC, or ASHRAE 90.1 values IECC has adopted by
// reference), "V" (a vendor/estimator/textbook figure quoted in the
// research, not code), or "M" (this session's own order-of-magnitude
// reconstruction, NOT the underlying licensed value). LAW L10 (D6): no
// licensed MCAA/Wendes/SMACNA — and, by the same doctrine, MSS SP-58 —
// table VALUES ship here; every table that models one of those trade-
// association standards is graded M and says so in its own tables/*.json
// `note`, with the actual paid standard cited as "verify against before
// shipping", never reproduced. GATE 2 invariant: a cell graded "C" always
// carries a real source URL to public code text; nothing here promotes a
// reconstruction to "C" to make it look more authoritative than it is.
//
// tables/*.json are DATA, not code, specifically so a reviewer sees a table
// change as a JSON diff, never mixed with lookup-logic changes in the same
// review.
import ductGaugeTable from "./tables/ductGauge.json" with { type: "json" };
import ductWeightTable from "./tables/ductWeight.json" with { type: "json" };
import ductHangerTable from "./tables/ductHangerSpacing.json" with { type: "json" };
import pipeHangerTable from "./tables/pipeHangerSpacing.json" with { type: "json" };
import ductInsulationTable from "./tables/ductInsulation.json" with { type: "json" };
import pipeInsulationTable from "./tables/pipeInsulation.json" with { type: "json" };
import pipeJointHoursTable from "./tables/pipeJointHours.json" with { type: "json" };
import ductLaborTable from "./tables/ductLabor.json" with { type: "json" };
import pipeLaborTable from "./tables/pipeLabor.json" with { type: "json" };
import basDefaultsTable from "./tables/basDefaults.json" with { type: "json" };
import type { RunSize } from "./types.ts";

export type Grade = "C" | "V" | "M";

/** A single graded number: the value plus where it came from. Every public
 *  lookup below returns this shape (or an object whose leaves are this
 *  shape) rather than a bare number, so a caller (assembly.ts, a report
 *  column, an agent tool) can always surface provenance beside a price. */
export interface Graded<T> {
  value: T;
  grade: Grade;
  source: string;
}

function graded<T>(value: T, grade: Grade | undefined, tableGrade: Grade, source: string): Graded<T> {
  return { value, grade: grade ?? tableGrade, source };
}

// ── A. Duct gauge / weight ──────────────────────────────────────────────

/** Rectangular duct gauge by longest side, in. — the non-SMACNA "simplified
 *  spec schedule" (ductGauge.json's own note explains why this table, not a
 *  SMACNA reconstruction, is the shipped default). `bands` are sorted by
 *  `max_longest_side_in` ascending with a final `null`-max catch-all. */
export function ductGaugeFor(longestSideIn: number): Graded<number> {
  const t = ductGaugeTable as { table_grade: Grade; table_source: string; bands: { max_longest_side_in: number | null; gauge: number }[] };
  const band = t.bands.find((b) => b.max_longest_side_in === null || longestSideIn <= b.max_longest_side_in) ?? t.bands[t.bands.length - 1];
  return graded(band.gauge, undefined, t.table_grade, t.table_source);
}

/** Galvanized sheet weight, lb/ft², for a gauge. Falls back to the nearest
 *  heavier stocked gauge if an odd value is requested (gauges are a fixed,
 *  small enumeration; there is no "gauge 19"). */
export function ductWeightPerSf(gauge: number): Graded<number> {
  const t = ductWeightTable as { table_grade: Grade; table_source: string; rows: { gauge: number; lb_per_sf: number; grade: Grade }[] };
  // Gauge numbering is inverted from physical size (a BIGGER number is
  // THINNER metal), so "round to the nearest stocked gauge at least as
  // heavy" means the LARGEST gauge number that is still <= the request —
  // sorting DESCENDING and taking the first match, not ascending.
  const row = t.rows.find((r) => r.gauge === gauge)
    ?? [...t.rows].sort((a, b) => b.gauge - a.gauge).find((r) => r.gauge <= gauge)
    ?? t.rows[t.rows.length - 1];
  return graded(row.lb_per_sf, row.grade, t.table_grade, t.table_source);
}

/** lb/LF for a straight duct segment at a given gauge — formula 2 above in
 *  the research doc's "Defensible defaults": perimeter × sheet weight ×
 *  1.15 seam/joint allowance (calcformula.com, graded V — see
 *  ductLabor.json's `seam_joint_allowance`). Rect uses girth 2(W+H)/12 ft;
 *  round uses circumference πD/12 ft. */
export function ductWeightPerLf(size: RunSize, gauge: number): number {
  const girthFt = size.kind === "round" ? (Math.PI * size.d_in) / 12
    : size.kind === "oval" ? (Math.PI * (size.major_in + size.minor_in)) / 2 / 12 // ellipse perimeter approx
    : size.kind === "rect" ? (2 * (size.w_in + size.h_in)) / 12
    : 0; // "pipe" has no sheet-metal weight — duct-only formula
  const lbPerSf = ductWeightPerSf(gauge).value;
  const seamAllowance = (ductLaborTable as { seam_joint_allowance: { value: number } }).seam_joint_allowance.value;
  return girthFt * lbPerSf * seamAllowance;
}

// ── B. Duct hangers ──────────────────────────────────────────────────────

export interface DuctHangerSpacing {
  max_spacing_ft: Graded<number>;
  hardware: Graded<string>;
}

/** Hanger spacing + recommended hardware for a duct segment. The spacing is
 *  ALWAYS the IMC 603.10 code floor (10 ft, grade C) — the hardware-by-size
 *  guidance is the engine's own [M] band, never a widened spacing. */
export function ductHangerSpacingFor(size: RunSize): DuctHangerSpacing {
  const t = ductHangerTable as {
    code_floor: { max_spacing_ft: number; grade: Grade; source: string };
    hardware_bands: {
      grade: Grade; source: string;
      rect_by_half_perimeter_in: { max_half_perimeter_in: number; hanger: string }[];
      round_by_diameter_in: { max_diameter_in: number; hanger: string }[];
      flex_max_spacing_ft: number;
    };
  };
  const maxSpacing = graded(t.code_floor.max_spacing_ft, t.code_floor.grade, t.code_floor.grade, t.code_floor.source);
  if (size.kind === "round") {
    const band = t.hardware_bands.round_by_diameter_in.find((b) => size.d_in <= b.max_diameter_in)
      ?? t.hardware_bands.round_by_diameter_in[t.hardware_bands.round_by_diameter_in.length - 1];
    return { max_spacing_ft: maxSpacing, hardware: graded(band.hanger, undefined, t.hardware_bands.grade, t.hardware_bands.source) };
  }
  if (size.kind === "rect") {
    const halfPerimeter = size.w_in + size.h_in;
    const band = t.hardware_bands.rect_by_half_perimeter_in.find((b) => halfPerimeter <= b.max_half_perimeter_in)
      ?? t.hardware_bands.rect_by_half_perimeter_in[t.hardware_bands.rect_by_half_perimeter_in.length - 1];
    return { max_spacing_ft: maxSpacing, hardware: graded(band.hanger, undefined, t.hardware_bands.grade, t.hardware_bands.source) };
  }
  // oval/pipe: no size-class hardware band modeled yet — code floor still applies
  return { max_spacing_ft: maxSpacing, hardware: graded("unspecified — size-class hardware not modeled for this duct kind", "M", t.hardware_bands.grade, t.hardware_bands.source) };
}

// ── C. Pipe hangers ──────────────────────────────────────────────────────

export type PipeService = "mechanical" | "plumbing";
export type PipeAdoptedCode = "mss_sp58" | "imc305_4" | "ipc308_5" | "upc313_3";

/** Hanger spacing for a pipe segment, ft, per D3's default hanger tables:
 *  mechanical piping (hydronic/steam/refrigerant) → MSS SP-58 Table 4
 *  (default) or IMC 305.4; plumbing (domestic water/DWV/gas) → IPC 308.5
 *  (default) or UPC 313.3. `material` keys match each table's own rows
 *  (e.g. "copper_water_ft"/"steel_water_ft" for mss_sp58; a `material`
 *  enum string for the code tables) — see pipeHangerSpacing.json. */
export function pipeHangerSpacingFt(
  service: PipeService,
  npsIn: number,
  material: string,
  adoptedCode?: PipeAdoptedCode,
): Graded<number> | null {
  const t = pipeHangerTable as {
    mechanical: { default_code: PipeAdoptedCode; codes: Record<string, unknown> };
    plumbing: { default_code: PipeAdoptedCode; codes: Record<string, unknown> };
  };
  const group = service === "mechanical" ? t.mechanical : t.plumbing;
  const code = adoptedCode ?? group.default_code;
  const table = group.codes[code] as
    | { table_grade: Grade; table_source: string; rows: Record<string, unknown>[] }
    | undefined;
  if (!table) return null;
  if (code === "mss_sp58") {
    const rows = table.rows as { nps_in: number; steel_water_ft: number; copper_water_ft: number; grade: Grade }[];
    const row = rows.find((r) => r.nps_in === npsIn)
      ?? [...rows].sort((a, b) => a.nps_in - b.nps_in).find((r) => r.nps_in >= npsIn)
      ?? rows[rows.length - 1];
    const value = material === "copper" ? row.copper_water_ft : row.steel_water_ft;
    return graded(value, row.grade, table.table_grade, table.table_source);
  }
  const rows = table.rows as { material: string; horizontal_ft: number | null; grade?: Grade }[];
  const row = rows.find((r) => r.material === material);
  if (!row || row.horizontal_ft === null) return null;
  return graded(row.horizontal_ft, row.grade, table.table_grade, table.table_source);
}

// ── D. Insulation ────────────────────────────────────────────────────────

export type DuctInsulationLocation = "unconditioned_space" | "outside_building_cz0_4" | "outside_building_cz5_8"
  | "within_envelope_assembly_cz1_4" | "within_envelope_assembly_cz5_8";

export function ductInsulationRValue(location: DuctInsulationLocation): Graded<number> {
  const t = ductInsulationTable as { table_grade: Grade; table_source: string; rows: { location: string; r_value: number }[] };
  const row = t.rows.find((r) => r.location === location);
  if (!row) throw new Error(`unknown duct insulation location: ${location}`);
  return graded(row.r_value, undefined, t.table_grade, t.table_source);
}

export type PipeInsulationService = "steam_gt350f" | "hot_251_350f" | "hot_201_250f" | "hw_heating_141_200f"
  | "hw_dhw_105_140f" | "chilled_40_60f" | "brine_refrigerant_lt40f";

const NPS_BAND_MAX = [1, 1.5, 4, 8, Infinity]; // upper-exclusive except the last

function npsBandIndex(npsIn: number): number {
  for (let i = 0; i < NPS_BAND_MAX.length; i++) if (npsIn < NPS_BAND_MAX[i]) return i;
  return NPS_BAND_MAX.length - 1;
}

/** Pipe insulation thickness, in., by fluid service and NPS — ASHRAE 90.1
 *  Table 6.8.3 / IECC C403.12.3 band lookup (pipeInsulation.json). */
export function pipeInsulationThicknessIn(service: PipeInsulationService, npsIn: number): Graded<number> {
  const t = pipeInsulationTable as {
    table_grade: Grade; table_source: string;
    rows: { service: string; thickness_in: number[]; grade?: (Grade | null)[] }[];
  };
  const row = t.rows.find((r) => r.service === service);
  if (!row) throw new Error(`unknown pipe insulation service: ${service}`);
  const i = npsBandIndex(npsIn);
  const cellGrade = row.grade?.[i] ?? undefined;
  return graded(row.thickness_in[i], cellGrade ?? undefined, t.table_grade, t.table_source);
}

// ── E. Pipe joint hours ──────────────────────────────────────────────────

export type PipeJointType = "threaded_steel" | "solder_copper" | "press_copper" | "grooved" | "butt_weld";

/** MCAA-style joint hours — deliberately order-of-magnitude only (LAW L10 /
 *  D6). Returns null where the source table has no cell for that
 *  size/joint-type combination (e.g. grooved below 1½"). */
export function pipeJointHours(npsIn: number, jointType: PipeJointType): Graded<number> | null {
  const t = pipeJointHoursTable as {
    table_grade: Grade; table_source: string;
    joint_types: PipeJointType[];
    rows: { nps_in: number; hours: (number | null)[] }[];
  };
  const col = t.joint_types.indexOf(jointType);
  const lookupNps = Math.max(npsIn, t.rows[0].nps_in);
  const row = t.rows.find((r) => r.nps_in === lookupNps)
    ?? [...t.rows].sort((a, b) => a.nps_in - b.nps_in).find((r) => r.nps_in >= lookupNps)
    ?? t.rows[t.rows.length - 1];
  const value = row.hours[col];
  if (value === null || value === undefined) return null;
  return graded(value, undefined, t.table_grade, t.table_source);
}

// ── F. Waste / rounding (D1) ─────────────────────────────────────────────

/** ceil(L / spacing) + 1, minimum 2 per run — the shared hanger-count rule
 *  for both duct and pipe (D1's own wording). */
export function hangerCount(lengthFt: number, spacingFt: number): number {
  if (lengthFt <= 0) return 0;
  return Math.max(2, Math.ceil(lengthFt / spacingFt) + 1);
}

/** ceil(L / stickFt) - 1, minimum 0 — coupling count for stick-length pipe
 *  (steel 21 ft, copper/PVC 20 ft per pipeLabor.json). */
export function couplingCount(lengthFt: number, stickFt: number): number {
  if (lengthFt <= 0) return 0;
  return Math.max(0, Math.ceil(lengthFt / stickFt) - 1);
}

// ── Re-exports of the flatter tables (ductLabor/pipeLabor/basDefaults) ───
// These are consumed close to verbatim by assembly.ts (WP2.2); re-exported
// here rather than duplicated so there is exactly one import path for every
// graded number in this module.

export const ductLabor = ductLaborTable;
export const pipeLabor = pipeLaborTable;
export const basDefaults = basDefaultsTable;
export const ductHangerBom = (ductHangerTable as { trapeze_bom: unknown; strap_bom: unknown });
