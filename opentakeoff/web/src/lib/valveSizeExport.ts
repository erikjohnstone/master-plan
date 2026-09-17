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
 * read straight off a schedule cell, derived by an explicit physical formula
 * from two schedule cells, or a documented project-wide default the caller
 * opted into. Never a silent invention. PN class and Branch Δp have NO
 * source anywhere in the current extraction (they're spec-book fields, not
 * schedule columns) and are always left null — see coverage.notes.
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
  /** Derive Consumer Δp from a schedule's own printed GPM and Cv via the
   * standard valve-sizing relation Δp(psi) = (GPM / Cv)^2 — real physics
   * from two printed numbers, not a guess. Default true. */
  deriveConsumerDpFromCv?: boolean;
  /** Project-wide sizing tolerance (%) — this template's Tolerance column is
   * a project design parameter, never printed per-valve on a schedule. Left
   * null (blank cell) unless the caller explicitly sets one. */
  toleranceOverridePct?: number | null;
  /** Fill Operating Voltage = "24 VAC" (the template's only defined value,
   * and the near-universal standard for HVAC control-valve actuators) on any
   * row where a Positioning Signal was also resolved — i.e., only where
   * there's independent evidence the valve is BAS-actuated. Default true. */
  fillOperatingVoltageDefault?: boolean;
}

export interface ValveSizeExportRow extends ValveSizeRow {
  /** Provenance, dropped before writing to the template — kept on the
   * in-memory row for reporting/testing, never fed to fillValveSizeTemplate
   * (which only reads the ValveSizeRow fields it knows). */
  _source: { family: string; tag: string | null; sheetId: string | null; tableTitle: string | null };
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

/** Control signal / actuator text -> the template's exact Positioning
 * Signal vocabulary (its only two options: an analog 0-10V-family
 * modulating signal, or floating/tri-state control). 4-20mA, 3-15psi,
 * two-position/on-off, and anything unrecognized are left blank — none of
 * them are either of the two template options, and picking the "closer"
 * one would misrepresent the actuator. */
export function mapPositioningSignal(controlSignalText: string | null, actuatorText: string | null): string | null {
  const signal = (controlSignalText || "").toUpperCase();
  if (/\d{1,2}\s*[-–]\s*\d{1,2}\s*V(DC)?\b/.test(signal)) return "0...10 Vdc";
  if (/FLOAT/.test(signal)) return "Floating control";
  const actuator = (actuatorText || "").toUpperCase();
  if (/MODULAT/.test(actuator)) return "0...10 Vdc";
  if (/FLOAT/.test(actuator)) return "Floating control";
  return null;
}

/** Δp(psi) = (GPM / Cv)^2 — the standard water-valve sizing relation
 * (Cv := GPM / sqrt(ΔP)), applied only when both printed numbers parsed
 * cleanly and Cv > 0. This is arithmetic on two schedule cells, not an
 * estimate — but it IS a computed value, not a printed one; callers that
 * need to distinguish should treat consumerDpPsi as derived whenever the
 * source schedule had no explicit Δp column (none of the compiled families
 * here do — this is the only source for that column today). */
export function computeConsumerDpPsi(gpm: number | null, cv: number | null): number | null {
  if (gpm === null || cv === null || cv <= 0 || gpm < 0) return null;
  return Math.round((gpm / cv) ** 2 * 100) / 100;
}

function mapRow(item: any, family: string, opts: Required<Pick<ValveSizeExportOptions,
  "hydronicTier" | "deriveConsumerDpFromCv" | "toleranceOverridePct" | "fillOperatingVoltageDefault">>): ValveSizeExportRow {
  const cells = item?.cells || {};
  const unitNo = cellText(cells, "Unit Mark") || cellText(cells, "Served equipment") || item?.tag || null;
  const service = cellText(cells, "Service") || item?.table_title || null;
  const gpm = parseCleanNumber(cellText(cells, "GPM"));
  const cv = parseCleanNumber(cellText(cells, "Cv"));
  const positioningSignal = mapPositioningSignal(cellText(cells, "Control signal"), cellText(cells, "Actuator"));
  return {
    unitNo,
    location: item?.building || null,
    system: mapSystem(service, opts.hydronicTier),
    ports: mapPorts(cellText(cells, "Configuration"), cellText(cells, "Fail position")),
    pnClass: null, // never present on a plan schedule — spec-book field (see coverage.notes)
    lineSizeIn: parseLineSizeInches(cellText(cells, "Size")),
    designFlowRateGpm: gpm,
    consumerDpPsi: opts.deriveConsumerDpFromCv ? computeConsumerDpPsi(gpm, cv) : null,
    branchDpPsi: null, // never present on a plan schedule — spec-book field (see coverage.notes)
    tolerancePct: opts.toleranceOverridePct ?? null,
    positioningSignal,
    operatingVoltage: (opts.fillOperatingVoltageDefault && positioningSignal) ? "24 VAC" : null,
    _source: { family, tag: item?.tag ?? null, sheetId: item?.sheet_id ?? null, tableTitle: item?.table_title ?? null },
  };
}

/**
 * @param {object} compiled a compileControlValveTakeoff() result (kind
 *   "control_valves" — from compile_corpus_takeoff / compileProductionTakeoff,
 *   never a hand-built object)
 */
export function buildValveSizeExport(compiled: any, opts: ValveSizeExportOptions = {}): ValveSizeExportResult {
  const families = opts.families || HYDRONIC_CONTROL_VALVE_FAMILIES;
  const resolvedOpts = {
    hydronicTier: opts.hydronicTier || "secondary",
    deriveConsumerDpFromCv: opts.deriveConsumerDpFromCv ?? true,
    toleranceOverridePct: opts.toleranceOverridePct ?? null,
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

  const notes: string[] = [
    `System uses the "${resolvedOpts.hydronicTier}" hydronic tier for every row (P/S is never distinguishable from a valve schedule alone) — pass hydronicTier to change it.`,
    "PN class and Branch Δp have no source in any compiled valve/equipment schedule — always blank here; only a project spec section carries them (spec ingestion, not yet built).",
    "Tolerance is a project design parameter, never printed per-valve — blank unless toleranceOverridePct was passed.",
    resolvedOpts.deriveConsumerDpFromCv
      ? "Consumer Δp is COMPUTED as (GPM / Cv)^2 from the schedule's own printed flow and Cv, not read off a Δp column — no such column exists in the scheduled data."
      : "Consumer Δp left blank (deriveConsumerDpFromCv:false) — pass true to compute it from printed GPM/Cv.",
    "Operating Voltage defaults to the template's only defined value (24 VAC) on rows where a Positioning Signal was also resolved — set fillOperatingVoltageDefault:false to leave it blank instead.",
    "Ports needs BOTH a 2-way/3-way Configuration cell and (for 2-way only) a Fail position cell to resolve Normally Open vs Closed — printed schedules without a Fail position column leave 2-way rows blank rather than guess.",
  ];
  if (excludedFamilies.length) {
    notes.push(`${excludedFamilies.reduce((n, f) => n + f.count, 0)} schedule row(s) excluded as out of this template's scope: ${excludedFamilies.map((f) => `${f.family} (${f.count}) — ${f.reason}`).join("; ")}.`);
  }

  return { rows, sourceItemCount, excludedFamilies, coverage, notes };
}
