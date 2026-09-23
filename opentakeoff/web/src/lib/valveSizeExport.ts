/**
 * Maps a compileControlValveTakeoff() result (kind "control_valves" /
 * "T-VALVE-01" — the production Session+ODL pipeline both MCP and the UI's
 * production CLI call) onto rows of Siemens' "Global Valves" mass-sizing
 * template (see valveSizeTemplate.ts). One row per scheduled valve MARK.
 *
 * Scope: the template's own domain (System = PCHW/SCHW/PHHW/SHHW/STEAM,
 * Ports = 2-Way NC/NO or 3-Way Mixing, an "Actuator Parameters" section) is
 * automatic HYDRONIC control valves — not manual isolation/PRV/PSV valves
 * (no actuator, wouldn't belong under "Actuator Parameters") and not
 * dampers/air valves (CFM, not GPM; no PCHW/SHHW/STEAM system). Default
 * family scope reflects that; callers may widen it explicitly.
 *
 * "Refuse rather than guess" (this codebase's standing rule, see
 * corpusTakeoff.mjs's own valveEstimatorStatus): every field below is either
 * read straight off a schedule cell or a documented project-wide choice the
 * caller opted into. Never a silent invention. PN class and Branch Δp have NO
 * source anywhere in the current extraction (they're spec-book fields, not
 * schedule columns) and are always left null — see coverage.notes.
 *
 * Column H ("Consumer Δp") is ALSO always left null. The template's defined
 * name for that header cell is `CoilDP` (ValveTable!$H$4): the consumer's —
 * the coil's — own pressure drop, which the compiled valve rows do not carry.
 * The valve's own drop, (GPM / Cv)^2, is a different quantity; it is
 * reported on each row's `_derived.valveDpPsi` and counted in the notes as
 * "valve Δp (derived)", and is never written to the workbook. Column H stays
 * blank until the HIT owners confirm what CoilDP expects (ASSEMBLIES goal
 * D11, opentakeoff-corpus/goals/ASSEMBLIES.md).
 */
import type { ValveSizeRow } from "./valveSizeTemplate.ts";

export const HYDRONIC_CONTROL_VALVE_FAMILIES = [
  "CHW_CONTROL_VALVE",
  "HHW_CONTROL_VALVE",
  "BYPASS_CONTROL_VALVE",
  "MIXING_VALVE",
];
/** Present in a control-valve compile but excluded by default: no actuator
 * (isolation/PRV/PSV are manual or self-operated — nothing to size a
 * Positioning Signal/Operating Voltage for) or air-side (CFM, not GPM). */
export const EXCLUDED_NON_HYDRONIC_CONTROL_FAMILIES = [
  "ISOLATION_VALVE", "PRESSURE_REDUCING_VALVE", "PRESSURE_SAFETY_VALVE",
  "CONTROL_DAMPER", "FUME_HOOD_DAMPER", "LAB_AIR_VALVE",
];

/** The only Tolerance (%) values the template accepts: ValveTable!J6:J1048576
 * is list-validated against Constants!$F$2:$F$6 (defined name
 * ToleranceValues) = 10 / 20 / 30 / 40 / 50 in the shipped workbook. */
export const HIT_TOLERANCE_PCT_VALUES: readonly number[] = [10, 20, 30, 40, 50];

/** The template's two Positioning Signal options (DomainValues
 * PositioningSignalValues) — nothing else is representable. */
export type HitPositioningSignal = "0...10 Vdc" | "Floating control";

export interface ValveSizeExportOptions {
  /** Which compile categories to include. Default HYDRONIC_CONTROL_VALVE_FAMILIES. */
  families?: string[];
  /** CHW/HHW have no primary/secondary distinction on a valve schedule —
   * this project-wide choice picks SCHW/SHHW vs PCHW/PHHW for every row.
   * Terminal/zone control valves (the families in scope here) sit on
   * secondary distribution in the overwhelming majority of real systems, so
   * that's the default; set "primary" only when this project's valves are
   * genuinely on the primary loop. Never per-row evidence — always disclose
   * which was used (coverage.notes says so). */
  hydronicTier?: "primary" | "secondary";
  /** Project-wide sizing tolerance (%) — this template's Tolerance column is
   * a project design parameter, never printed per-valve on a schedule. Left
   * null (blank cell) unless the caller explicitly sets one, and then it must
   * be one of HIT_TOLERANCE_PCT_VALUES: any other value throws rather than
   * write a cell the template's own validation rejects. */
  toleranceOverridePct?: number | null;
  /** Fill Operating Voltage = "24 VAC" (the template's only defined value,
   * and the near-universal standard for HVAC control-valve actuators) on any
   * row where a Positioning Signal was also resolved — i.e., only where
   * there's independent evidence the valve is BAS-actuated. Default true. */
  fillOperatingVoltageDefault?: boolean;
}

/** Why Positioning Signal is blank on a row. */
export type PositioningSignalBlankReason =
  /** Neither a Control signal nor an Actuator cell was printed. */
  | "no_signal_printed"
  /** A signal was printed, but it is neither of the template's two options
   * (2–10 V, 4–20 mA, 3–15 psi, two-position, …). */
  | "not_representable"
  /** The printed text names more than one signal type. */
  | "multiple_signals_printed"
  /** Only an Actuator cell was printed and it names no signal type
   * ("MODULATING", "ELECTRIC", …). */
  | "actuator_names_no_signal";

export interface PositioningSignalResolution {
  value: HitPositioningSignal | null;
  /** The normalized control-valve cell the evidence came from. */
  header: "Control signal" | "Actuator" | null;
  /** That cell's printed text, verbatim. */
  printed: string | null;
  /** Set exactly when value is null. */
  blankReason: PositioningSignalBlankReason | null;
}

export interface ValveSizeExportRow extends ValveSizeRow {
  /** Provenance, dropped before writing to the template — kept on the
   * in-memory row for reporting/testing, never fed to fillValveSizeTemplate
   * (which only reads the ValveSizeRow fields it knows). */
  _source: { family: string; tag: string | null; sheetId: string | null; tableTitle: string | null };
  /** Computed or withheld values, for reporting only — never written to the
   * workbook either. */
  _derived: {
    /** The scheduled VALVE's own pressure drop, (GPM / Cv)^2 psi, from the
     * row's printed GPM and Cv. NOT column H: see the file header. */
    valveDpPsi: number | null;
    positioningSignal: PositioningSignalResolution;
  };
}

const COLUMN_KEYS: Array<keyof ValveSizeRow> = [
  "unitNo", "location", "system", "ports", "pnClass", "lineSizeIn",
  "designFlowRateGpm", "consumerDpPsi", "branchDpPsi", "tolerancePct",
  "positioningSignal", "operatingVoltage",
];

export interface ValveSizeExportResult {
  rows: ValveSizeExportRow[];
  sourceItemCount: number;
  excludedFamilies: Array<{ family: string; count: number; reason: string }>;
  coverage: Record<string, { filled: number; total: number }>;
  notes: string[];
}

function cellText(cells: Record<string, { text?: string } | undefined> | undefined, key: string): string | null {
  const v = cells?.[key]?.text;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** A single clean numeric token, or null. Deliberately refuses text
 * carrying MORE than one number-like token (e.g. a schedule cell that bled
 * in neighboring columns' text) rather than guess which one is right. */
export function parseCleanNumber(text: string | null): number | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const matches = trimmed.match(/-?\d+(\.\d+)?/g);
  if (!matches || matches.length !== 1) return null; // ambiguous / compound cell — refuse, don't pick one
  // Only accept a trailing-unit form ("25 GPM", "2.7 (Cv)") — a leading or
  // interior number surrounded by OTHER words is the same ambiguity as
  // multiple numbers and is refused above by requiring exactly one match;
  // this guards the remaining case of stray non-numeric junk before/after.
  const rest = trimmed.replace(matches[0], "").trim();
  if (rest && !/^[a-zA-Z%°"'().\s-]*$/.test(rest)) return null;
  return Number(matches[0]);
}

/** "3/4", "1-1/4", "1 1/4", "1-1/4\"", "2", "0.75" -> decimal inches. */
export function parseLineSizeInches(text: string | null): number | null {
  if (!text) return null;
  const cleaned = text.trim().replace(/["″]|\bIN\.?$/gi, "").trim();
  const mixed = cleaned.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/);
  if (mixed) {
    const [, whole, num, den] = mixed;
    const d = Number(den);
    return d ? Number(whole) + Number(num) / d : null;
  }
  const frac = cleaned.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const d = Number(frac[2]);
    return d ? Number(frac[1]) / d : null;
  }
  if (/^\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  return null;
}

/** Configuration ("2-WAY"/"3-WAY") + Fail position ("N.C."/"FAIL CLOSED"/…)
 * -> the template's exact Ports vocabulary. 3-way has only one template
 * option (Mixing) so Configuration alone is enough; 2-way needs the fail
 * position to know Normally Closed vs Normally Open and is left blank
 * without it — there is no safe universal default for that split. */
export function mapPorts(configurationText: string | null, failPositionText: string | null): string | null {
  const config = (configurationText || "").toUpperCase();
  if (/3[\s-]?WAY/.test(config)) return "3-Way Mixing";
  if (!/2[\s-]?WAY/.test(config)) return null;
  const fail = (failPositionText || "").toUpperCase();
  if (/\bN\.?\s?C\.?\b|CLOSE/.test(fail)) return "2-Way Normally closed";
  if (/\bN\.?\s?O\.?\b|OPEN/.test(fail)) return "2-Way Normally open";
  return null;
}

/** CHW/HHW/STEAM (schedule "Service" or inferred from the table title) ->
 * the template's exact System vocabulary, applying the caller's
 * primary/secondary tier choice (see ValveSizeExportOptions.hydronicTier). */
export function mapSystem(serviceOrTitleText: string | null, tier: "primary" | "secondary"): string | null {
  const s = (serviceOrTitleText || "").toUpperCase();
  if (/STEAM/.test(s)) return "STEAM";
  if (/\bCHW\b|CHILLED/.test(s)) return tier === "primary" ? "PCHW" : "SCHW";
  if (/\bHHW\b|HOT.?WATER/.test(s)) return tier === "primary" ? "PHHW" : "SHHW";
  return null;
}

type PrintedSignalType = HitPositioningSignal | "other";

/** Every signal type a printed cell NAMES. A printed range with a unit
 * ("0-10VDC", "2-10 V", "4-20mA", "3-15 PSI", "0...10 Vdc") is analog and
 * only 0–10 V is representable; floating is also printed as tri-state or
 * 3-point; two-position / on-off / open-close is a signal type the template
 * cannot represent. "MODULATING" alone names no signal type at all (it may
 * be 0–10 V, 2–10 V, 4–20 mA or floating), so it contributes nothing. */
function printedSignalTypes(text: string): Set<PrintedSignalType> {
  const t = text.toUpperCase();
  const types = new Set<PrintedSignalType>();
  const range = /(?<![\d.])(\d+(?:\.\d+)?)\s*(?:-|–|—|TO|\.{2,3}|\/)\s*(\d+(?:\.\d+)?)\s*(VDC|VOLTS?|V|MA|PSIG?)(?![A-Z])/g;
  for (const m of t.matchAll(range)) {
    const isZeroToTenVolt = Number(m[1]) === 0 && Number(m[2]) === 10 && m[3].startsWith("V");
    types.add(isZeroToTenVolt ? "0...10 Vdc" : "other");
  }
  if (/\bFLOAT(?:ING)?\b|\bTRI[\s-]?STATE\b|\b(?:3|THREE)[\s-]?POINT\b/.test(t)) types.add("Floating control");
  if (/\b(?:2|TWO)[\s-]?POSITION\b|\bON[\s/-]?OFF\b|\bOPEN[\s/-]?CLOSED?\b/.test(t)) types.add("other");
  return types;
}

/** Printed signal text -> the template's Positioning Signal, or a disclosed
 * blank. Only PRINTED evidence counts: the Control signal cell decides
 * alone when it is printed; otherwise an Actuator cell counts only when it
 * spells out the signal type ("0-10VDC", "FLOATING"). A cell naming exactly
 * one representable type maps to it; any other printed signal (2–10 V,
 * 4–20 mA, two-position), or more than one type, is left blank — picking
 * the "closer" template option would misrepresent the actuator. */
export function resolvePositioningSignal(controlSignalText: string | null, actuatorText: string | null): PositioningSignalResolution {
  const signal = controlSignalText?.trim() || null;
  const actuator = actuatorText?.trim() || null;
  const judge = (header: "Control signal" | "Actuator", printed: string, noneReason: PositioningSignalBlankReason): PositioningSignalResolution => {
    const types = printedSignalTypes(printed);
    if (types.size > 1) return { value: null, header, printed, blankReason: "multiple_signals_printed" };
    const [only] = types;
    if (only === "0...10 Vdc" || only === "Floating control") return { value: only, header, printed, blankReason: null };
    return { value: null, header, printed, blankReason: only === "other" ? "not_representable" : noneReason };
  };
  if (signal) return judge("Control signal", signal, "not_representable");
  if (actuator) return judge("Actuator", actuator, "actuator_names_no_signal");
  return { value: null, header: null, printed: null, blankReason: "no_signal_printed" };
}

/** The template's Positioning Signal for a row, or null — see
 * resolvePositioningSignal for the evidence rule and the blank reasons. */
export function mapPositioningSignal(controlSignalText: string | null, actuatorText: string | null): HitPositioningSignal | null {
  return resolvePositioningSignal(controlSignalText, actuatorText).value;
}

/** The valve's own pressure drop, Δp(psi) = (GPM / Cv)^2 — the standard
 * water-valve sizing relation (Cv := GPM / sqrt(ΔP)), applied only when both
 * printed numbers parsed cleanly and Cv > 0. Reported, never written to the
 * template: its column H asks for the coil's drop (CoilDP), not this. */
export function computeValveDpPsi(gpm: number | null, cv: number | null): number | null {
  if (gpm === null || cv === null || cv <= 0 || gpm < 0) return null;
  return Math.round((gpm / cv) ** 2 * 100) / 100;
}

function mapRow(item: any, family: string, opts: Required<Pick<ValveSizeExportOptions,
  "hydronicTier" | "toleranceOverridePct" | "fillOperatingVoltageDefault">>): ValveSizeExportRow {
  const cells = item?.cells || {};
  const unitNo = cellText(cells, "Unit Mark") || cellText(cells, "Served equipment") || item?.tag || null;
  const service = cellText(cells, "Service") || item?.table_title || null;
  const gpm = parseCleanNumber(cellText(cells, "GPM"));
  const cv = parseCleanNumber(cellText(cells, "Cv"));
  const signal = resolvePositioningSignal(cellText(cells, "Control signal"), cellText(cells, "Actuator"));
  return {
    unitNo,
    location: item?.building || null,
    system: mapSystem(service, opts.hydronicTier),
    ports: mapPorts(cellText(cells, "Configuration"), cellText(cells, "Fail position")),
    pnClass: null, // never present on a plan schedule — spec-book field (see coverage.notes)
    lineSizeIn: parseLineSizeInches(cellText(cells, "Size")),
    designFlowRateGpm: gpm,
    consumerDpPsi: null, // CoilDP — the coil's drop, not carried by a valve row (see file header)
    branchDpPsi: null, // never present on a plan schedule — spec-book field (see coverage.notes)
    tolerancePct: opts.toleranceOverridePct ?? null,
    positioningSignal: signal.value,
    operatingVoltage: (opts.fillOperatingVoltageDefault && signal.value) ? "24 VAC" : null,
    _source: { family, tag: item?.tag ?? null, sheetId: item?.sheet_id ?? null, tableTitle: item?.table_title ?? null },
    _derived: { valveDpPsi: computeValveDpPsi(gpm, cv), positioningSignal: signal },
  };
}

/** "a ×3, b ×1" for the most frequent printed values, then "+N more". */
function tally(values: string[], limit = 6): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = sorted.slice(0, limit).map(([v, n]) => `"${v}" ×${n}`).join(", ");
  return sorted.length > limit ? `${shown}, +${sorted.length - limit} more` : shown;
}

/**
 * @param {object} compiled a compileControlValveTakeoff() result (kind
 *   "control_valves" — from compile_corpus_takeoff / compileProductionTakeoff,
 *   never a hand-built object)
 */
export function buildValveSizeExport(compiled: any, opts: ValveSizeExportOptions = {}): ValveSizeExportResult {
  const tolerance = opts.toleranceOverridePct ?? null;
  if (tolerance !== null && !HIT_TOLERANCE_PCT_VALUES.includes(tolerance)) {
    throw new RangeError(`Tolerance must be one of ${HIT_TOLERANCE_PCT_VALUES.join(", ")} (%) — the template validates column J against that list (Constants!F2:F6); got ${JSON.stringify(opts.toleranceOverridePct)}.`);
  }
  const families = opts.families || HYDRONIC_CONTROL_VALVE_FAMILIES;
  const resolvedOpts = {
    hydronicTier: opts.hydronicTier || "secondary",
    toleranceOverridePct: tolerance,
    fillOperatingVoltageDefault: opts.fillOperatingVoltageDefault ?? true,
  };
  const categories = compiled?.categories || {};
  const rows: ValveSizeExportRow[] = [];
  let sourceItemCount = 0;
  for (const family of families) {
    const items = categories[family]?.items || [];
    for (const item of items) {
      sourceItemCount += 1;
      rows.push(mapRow(item, family, resolvedOpts));
    }
  }
  rows.sort((a, b) => (a.unitNo || "").localeCompare(b.unitNo || "") || 0);

  const excludedFamilies = Object.entries(categories)
    .filter(([name, cat]: [string, any]) => !families.includes(name) && (cat?.items?.length || 0) > 0)
    .map(([name, cat]: [string, any]) => ({
      family: name,
      count: cat.items.length,
      reason: EXCLUDED_NON_HYDRONIC_CONTROL_FAMILIES.includes(name)
        ? (name.includes("DAMPER") || name.includes("AIR_VALVE")
          ? "air-side family — this template is liquid valves only (GPM/psi, no CFM)"
          : "no actuator on this family — this template's Positioning Signal/Operating Voltage don't apply")
        : "not in the requested family scope",
    }));

  const coverage: Record<string, { filled: number; total: number }> = {};
  for (const key of COLUMN_KEYS) coverage[key] = { filled: rows.filter((r) => r[key] !== null && r[key] !== undefined).length, total: rows.length };

  const withValveDp = rows.filter((r) => r._derived.valveDpPsi !== null).length;
  const signals = rows.map((r) => r._derived.positioningSignal);
  const written = (header: string) => signals.filter((s) => s.value && s.header === header).length;
  const blank = (reason: PositioningSignalBlankReason) => signals.filter((s) => s.blankReason === reason);
  const signalParts = [
    `${written("Control signal")} from a Control signal cell`,
    `${written("Actuator")} from an Actuator cell that names the signal type`,
  ];
  const notRepresentable = blank("not_representable");
  if (notRepresentable.length) signalParts.push(`${notRepresentable.length} blank because the printed signal is not one of the template's two options (${tally(notRepresentable.map((s) => s.printed || ""))})`);
  const multiple = blank("multiple_signals_printed");
  if (multiple.length) signalParts.push(`${multiple.length} blank because the printed text names more than one signal type (${tally(multiple.map((s) => s.printed || ""))})`);
  const actuatorOnly = blank("actuator_names_no_signal");
  if (actuatorOnly.length) signalParts.push(`${actuatorOnly.length} blank because the Actuator cell names no signal type (${tally(actuatorOnly.map((s) => s.printed || ""))})`);
  signalParts.push(`${blank("no_signal_printed").length} blank with no signal printed`);

  const notes: string[] = [
    `System uses the "${resolvedOpts.hydronicTier}" hydronic tier for every row (P/S is never distinguishable from a valve schedule alone) — pass hydronicTier to change it.`,
    "PN class and Branch Δp have no source in any compiled valve/equipment schedule — always blank here; only a project spec section carries them (spec ingestion, not yet built).",
    "Consumer Δp (column H) is always blank. The template names that column CoilDP — the coil's own pressure drop, which the compiled valve rows do not carry. It stays blank until the HIT owners confirm what CoilDP expects.",
    `Valve Δp (derived) = (GPM / Cv)^2 from the schedule's own printed flow and Cv: computed for ${withValveDp} of ${rows.length} row(s) and reported only (each row's _derived.valveDpPsi) — it is the valve's drop, not the coil's, so it is never written to column H.`,
    resolvedOpts.toleranceOverridePct === null
      ? "Tolerance is a project design parameter, never printed per-valve — blank unless toleranceOverridePct was passed (10, 20, 30, 40 or 50, the template's own list)."
      : `Tolerance ${resolvedOpts.toleranceOverridePct}% on every row, from toleranceOverridePct (a project design parameter, never printed per-valve).`,
    `Positioning Signal comes only from printed signal text: 0–10 V → "0...10 Vdc"; floating, tri-state or 3-point → "Floating control". "Modulating" alone names no signal type (it may be 0–10 V, 2–10 V, 4–20 mA or floating) and is never defaulted. This run: ${signalParts.join("; ")}.`,
    "Operating Voltage defaults to the template's only defined value (24 VAC) on rows where a Positioning Signal was also resolved — set fillOperatingVoltageDefault:false to leave it blank instead.",
    "Ports needs BOTH a 2-way/3-way Configuration cell and (for 2-way only) a Fail position cell to resolve Normally Open vs Closed — printed schedules without a Fail position column leave 2-way rows blank rather than guess.",
  ];
  if (excludedFamilies.length) {
    notes.push(`${excludedFamilies.reduce((n, f) => n + f.count, 0)} schedule row(s) excluded as out of this template's scope: ${excludedFamilies.map((f) => `${f.family} (${f.count}) — ${f.reason}`).join("; ")}.`);
  }

  return { rows, sourceItemCount, excludedFamilies, coverage, notes };
}
