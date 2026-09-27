// ASSEMBLIES goal, WP2 — the structural normalizer: canonical attributes
// (attributes.ts) for one compiled schedule row (goals/ASSEMBLIES.md WP2).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. It reads a compileTakeoff
// ("hvac_equipment") item, which the Takeoff panel and the MCP tools both
// get from the same compile, and answers "what does the schedule print for
// this unit" — schedule truth, so one module serves every surface.
//
// How a value is found (the same shape as corpusTakeoff.mjs
// extractEmbeddedCoils, which finds hydronic coil blocks inside any table):
//   1. Every printed column of the row is read as a header path (the
//      compile flattens a multi-tier header into one string, group words
//      first: "HYDRONIC REHEAT COIL DATA FLOW (GPM)") and its cell.
//   2. The header names a quantity (FLOW (GPM), EWT, V/PH …) and the block it
//      sits in (a heating coil, a supply fan, the unit's electrical …). A
//      block's service comes from its own group words, else from the table's
//      structure: EWT above LWT is a heating coil, below it a cooling coil;
//      a family whose only coil is a heating coil (a unit heater) needs none.
//   3. The cell must validate as ONE value of that quantity, in a unit the
//      attribute accepts and inside a physical range. A cell that does not
//      ("SEE NOTE 3", "50-80-110", "8/10") leaves the attribute unknown.
//   4. Two columns that answer the same attribute with different values, and
//      no printed qualifier (DESIGN over MIN, the fan's own RPM over its
//      motor's) to choose between them, leave it unknown.
// Every value carries the cell it was read from (cite) and the id of the rule
// that produced it; an attribute the row does not answer stays unknown, with
// the reason. LAW L1: header words only NAME the quantity a column holds; the
// cell has to confirm it (a number in range, a voltage the grid supplies),
// and nothing is classified from a word alone. LAW L4: absence is never
// evidence — no column, no value.
import { attributeSpec, familyAttributes, unitFactor } from "./attributes";
import { citedNoteIds, ecmOrDrive, motorRatedForDrive, noteValues, variableSpeed, type ScheduleNote } from "./scheduleNotes";

/** A compileTakeoff("hvac_equipment") item, as far as the normalizer reads it. */
export interface CompileItem {
  tag: string;
  sheet_id: string;
  table_title: string;
  cells: Record<string, { text: string; bbox: number[] | null }>;
  building?: string | null;
  description?: string | null;
}

/** The schedule table the item was compiled from: its headers in order; the
 * numbered notes printed with it (scheduleNotes.ts), when read; its rows
 * (the sheet graph's, key and cell text), when given; and the code legends
 * its headers cite, when read. */
export interface TableContext {
  headers: readonly string[];
  notes?: readonly ScheduleNote[];
  rows?: ReadonlyArray<{ key: string; cells: Readonly<Record<string, string>> }>;
  /** Per header, the codes the note it cites defines ("FV" → "FULL
   * VOLTAGE"; scheduleNotes.ts citedCodeLegend). */
  codes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** The legend printed with the table, code → meaning ("HF" → "ELECTRIC
   * HUMIDIFIER SECTION"; scheduleNotes.ts scheduleLegend). */
  legend?: Readonly<Record<string, string>>;
  /** The units a drive schedule's row names as its load (vfdDrivenTags). */
  driven?: ReadonlyMap<string, DriveLoad>;
  /** The tables that continue this one ("… (CONT.)"), with their rows. */
  continuation?: ReadonlyArray<{ title: string; headers: readonly string[]; rows: ReadonlyArray<{ key: string; cells: Readonly<Record<string, string>> }> }>;
}

/** A drive schedule's row naming a unit as its load: where the unit's VFD
 * is printed. */
export interface DriveLoad {
  sheet: string;
  table_title: string;
  header: string;
  bbox: number[] | null;
  /** The cell's text ("HWP-1"). */
  printed: string;
  /** The drive's own tag ("VFD-1"). */
  drive: string;
}

export interface Cite {
  sheet: string;
  table_title: string;
  header: string;
  bbox: number[] | null;
}

export interface AttributeValue {
  /** Canonical: a number in the attribute's canonical unit, a size ("8",
   * "10x8"), an enum value, or text. */
  value: number | string;
  /** The cell text the value was read from. */
  printed: string;
  cite: Cite;
  rule: string;
}

export interface UnknownAttribute {
  reason: string;
  header?: string;
  printed?: string;
}

export interface NormalizedItem {
  family: string;
  tag: string;
  attributes: Record<string, AttributeValue>;
  unknown: Record<string, UnknownAttribute>;
  /** The table's numbered notes that speak for this row (the ones its REMARKS
   * / NOTES cell cites, or every one when it cites none); absent when the
   * table prints none. The control-intent row reader reads them. */
  notes?: ScheduleNote[];
}

// ── 1. Header text ──────────────────────────────────────────────────────────

/** A printed header path in one spelling: upper case; a note reference
 * ("(NOTE 1)", "(NOTE E)") dropped; acronym dots closed ("E.W.T." → EWT,
 * "O.S.A." → OSA); phase glyphs (Ø φ) read as PH; the spellings of BTU/H,
 * inches and feet of water, and LB/HR folded to one token each. */
export function headerText(header: string): string {
  let s = ` ${String(header ?? "").toUpperCase()} `;
  s = s.replace(/[‐-―−]/g, "-");
  s = s.replace(/\(\s*(?:SEE\s+)?NOTES?\b[^)]*\)/g, " ");
  s = s.replace(/°/g, "");
  s = s.replace(/[Ø∅φΦ]/g, " PH ");
  s = s.replace(/(?<=\b[A-Z])\.(?=[A-Z]\b)/g, "");
  s = s.replace(/(?<!\d)\.|\.(?!\d)/g, " ");
  s = s.replace(/\bH20\b/g, "H2O");
  s = s.replace(/\bBTU\s*\/\s*HR?\b|\bBTUH\b|\bBTU'?S\b/g, " BTUH ");
  s = s.replace(/\bLBS?\s*(?:OF\s+STEAM\s*)?\/\s*HR?\b/g, " LBHR ");
  s = s.replace(/\bFT\s*(?:OF\s+)?(?:W\s?C|W\s?G|H2O)\b/g, " FTWC ");
  s = s.replace(/\bI\s?W\s?G\b|\bIN\s*(?:OF\s+)?(?:W\s?C|W\s?G|H2O)\b|\bIWC\b/g, " INWC ");
  s = s.replace(/\(\s*W\s?C\s*\)/g, " INWC ");
  // A text layer that set CFM's letters apart ("HEATC FM", "C FM"): one word.
  s = s.replace(/\b([A-Z]{2,})C\s+FM\b/g, "$1 CFM").replace(/\bC\s+FM\b|\bCF\s+M\b/g, "CFM");
  // … and PHASE's last letter ("VOLTAGE/PHAS E").
  s = s.replace(/\bPHAS\s+E\b/g, "PHASE");
  // Mode abbreviations ("CLNG CAP. MBH", "HTNG CAP. MBH") and a total
  // capacity's TMBH ("COOLING MIN. TMBH").
  s = s.replace(/\bCLNG\b/g, "COOLING").replace(/\bHTNG\b/g, "HEATING").replace(/\bTMBH\b/g, "TOTAL MBH");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ── 2. Cell values ──────────────────────────────────────────────────────────

/** Printed unit words a cell or header can carry, as attributes.ts units. */
const UNIT_WORDS: Array<[RegExp, string]> = [
  [/^(?:BTUH|BTU\/H|BTU\/HR|BTU)$/, "BTU/H"],
  [/^MBH$/, "MBH"],
  [/^KW$/, "kW"],
  [/^(?:W|WATTS?)$/, "W"],
  [/^(?:HP|H\.P\.)$/, "hp"],
  [/^CFM$/, "cfm"],
  [/^GPM$/, "gpm"],
  [/^GPH$/, "GPH"],
  [/^(?:F|°F|DEG\s*F)$/, "F"],
  [/^%$/, "%"],
  [/^RPM$/, "rpm"],
  [/^(?:V|VOLTS?|VAC)$/, "V"],
  [/^TONS?$/, "tons"],
  [/^(?:LBHR|LBS?\/HR)$/, "lb/hr"],
  [/^PSIG?$/, "psig"],
  [/^(?:INWC|IN\.?\s*W\.?C\.?|"?\s*W\.?C\.?)$/, "in. w.c."],
  [/^(?:FT|FTWC|FT\.?)$/, "ft"],
  [/^(?:IN|INCH(?:ES)?)$/, "in"],
];

function unitWord(w: string): string | null {
  const t = w.trim().toUpperCase();
  for (const [re, unit] of UNIT_WORDS) if (re.test(t)) return unit;
  return null;
}

/** Proper fractions only (numerator below denominator, denominator ≤ 64):
 * 3/4 inch, 1/15 hp. "460/3" is a V/PH cell, never 153.3 (the key helper,
 * mcp/scripts/assemblies-key-transcribe.mjs parseNumber, reads it the same). */
const properFraction = (num: string, den: string) => Number(num) < Number(den) && Number(den) <= 64;

export interface ParsedNumber { n: number; unit: string | null; words: string }

/** One printed number, optionally with unit words after it ("450 CFM",
 * "3/4\"", "1-1/2", "15,400", "7.5 HP (VFD)"). Anything carrying a second
 * number is not one value. */
export function parseNumberCell(text: string): ParsedNumber | null {
  // "15,000 (7,500 PER FAN)": the row's total, then its share per unit.
  // Feet or inches of water spelled with H2O ("16.0 ftH2O", "2 FT. W.C."):
  // one unit word, as a header's.
  const t = String(text ?? "").trim().replace(/\s*\([^()]*\b(?:PER|EACH|EA)\b[^()]*\)\s*$/i, "")
    .replace(/(\d)\s*(FT|IN)\.?\s*(?:OF\s+)?(?:H2O|H20|W\.?\s?C\.?|W\.?\s?G\.?)(?![A-Z0-9])/gi, (_m, d: string, u: string) => `${d} ${u.toUpperCase() === "FT" ? "FTWC" : "INWC"}`)
    .replace(/["″]/g, " IN ").replace(/(\d),(\d{3})\b/g, "$1$2").replace(/\s+/g, " ").trim();
  let m = t.match(/^(\d+)[\s-]+(\d+)\/(\d+)((?:\s*[A-Za-z%°.#()&/]+)*)$/);
  if (m && properFraction(m[2], m[3])) return { n: Number(m[1]) + Number(m[2]) / Number(m[3]), ...tail(m[4]) };
  m = t.match(/^(\d+)\/(\d+)((?:\s*[A-Za-z%°.#()&/]+)*)$/);
  if (m && properFraction(m[1], m[2])) return { n: Number(m[1]) / Number(m[2]), ...tail(m[3]) };
  m = t.match(/^(-?\d+(?:\.\d+)?|-?\.\d+)((?:\s*[A-Za-z%°.#()&/]+)*)$/);
  if (m) return { n: Number(m[1]), ...tail(m[2]) };
  return null;
}

function tail(words: string): { unit: string | null; words: string } {
  const w = String(words ?? "").trim();
  if (!w) return { unit: null, words: "" };
  const first = w.split(/[\s(]+/)[0];
  return { unit: unitWord(first) ?? unitWord(w), words: w };
}

/** A size: a round "8" (inches; 8", 3/4", 1-1/2") or a rectangle "10x8".
 * An inch fraction is binary (1/2, 3/4, 5/16): "8/10" is two sizes, not 0.8. */
export function parseSizeCell(text: string): string | null {
  const t = String(text ?? "").trim().replace(/["″Ø⌀ø]/g, "").replace(/\s+/g, " ").trim();
  const m = t.match(/^(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)$/);
  if (m) return `${Number(m[1])}x${Number(m[2])}`;
  const f = t.match(/\/(\d+)/);
  if (f && ![2, 4, 8, 16, 32, 64].includes(Number(f[1]))) return null;
  const n = parseNumberCell(t);
  if (!n || (n.words && n.unit !== "in")) return null;
  return String(n.n);
}

/** Nominal utilization voltages a US building service supplies. A printed
 * voltage outside this set is a misread, not a value. */
const STANDARD_VOLTS = new Set([110, 115, 120, 200, 208, 220, 230, 240, 265, 277, 380, 400, 415, 440, 460, 480, 575, 600]);

/** An electrical cell: "460/3", "208V/1PH", "115/1/60", "460V-3PH-60HZ",
 * "208V 3PH", "208/60/1". The voltage prints first; the parts after it are
 * told apart by value (a phase is 1 or 3, a frequency 50 or 60), so a V/HZ/PH
 * cell reads like a V/PH/HZ one, and a V/H/P header's "120/1" (no frequency)
 * is 120 V, 1 phase. A second part that is neither leaves the phase unknown;
 * a range ("208-230/1") is not one voltage, though its phase is one. */
export function parseElectricalCell(text: string): { volts: number | null; phase: number | null } | null {
  // A voltage range then a phase ("208-230V 1PH", "208-230/1",
  // "208/230-3-60"): no one voltage, and the phase it prints.
  const range = String(text ?? "").toUpperCase().replace(/\s+/g, " ").trim()
    .match(/^(\d{3})\s*[-/]\s*(\d{3})\s*(?:VAC|VOLTS?|V)?\s*[/\s-]\s*([13])\s*(?:PHASES?|PH|Ø)?(?:\s*[/\s-]\s*(?:50|60)\s*(?:HZ)?)?$/);
  if (range && STANDARD_VOLTS.has(Number(range[1])) && STANDARD_VOLTS.has(Number(range[2]))) return { volts: null, phase: Number(range[3]) };
  // Unit letters after a number separate its part ("208V 3PH" = 208/3).
  const t = String(text ?? "").toUpperCase()
    .replace(/(\d)\s*(?:VAC|VOLTS?|V)(?![A-Z])/g, "$1/")
    .replace(/(\d)\s*(?:PHASES?|PH|Ø|Φ)(?![A-Z])/g, "$1/")
    .replace(/(\d)\s*(?:HZ|HERTZ)(?![A-Z])/g, "$1/")
    .replace(/\s+/g, "");
  const parts = t.split(/[/\\]+|-(?=\d)/).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  const volts = Number(parts[0]);
  const rest = parts.slice(1).map(Number);
  const phases = rest.filter((n) => n === 1 || n === 3);
  const hertz = rest.filter((n) => n === 50 || n === 60);
  if (parts.length === 3 && (phases.length !== 1 || hertz.length !== 1)) return null;
  return { volts: STANDARD_VOLTS.has(volts) ? volts : null, phase: phases.length === 1 ? phases[0] : null };
}

/** Physical ranges per canonical unit: outside them a parsed number is a
 * misread or a different quantity, never the attribute. */
const RANGE: Record<string, [number, number]> = {
  cfm: [5, 500000], gpm: [0.01, 50000], F: [20, 400], MBH: [0.01, 100000], hp: [0.001, 5000],
  W: [1, 100000], kW: [0.01, 50000], rpm: [50, 20000], "in. w.c.": [0.01, 30], ft: [0.01, 500],
  in: [0.25, 144], tons: [0.1, 10000], "%": [0, 100], "lb/hr": [0.1, 1000000], psig: [0, 500],
};

// ── 3. Columns ──────────────────────────────────────────────────────────────

interface Column {
  header: string;
  h: string;
  cell: { text: string; bbox: number[] | null } | null;
  order: number;
  /** The table the column is printed in, when not the row's own (the
   * schedule's continuation). */
  table?: string;
}

/** A header printing an SI unit: the same quantity as its US twin, in a
 * unit the schema does not take (the keys type these columns "-"). */
const SI_UNIT = /\bL\s*\/\s*S\b|\bLPS\b|\bKPA\b|\(\s*C\s*\)|\bDEG\s*C\b|\bMM\b|\bPA\b|\bKG\s*\/\s*HR?\b|\bM3\s*\/\s*[HS]\b|\bM\s*\/\s*S\b/;

/** A bracketed unit that is SI: the column is the SI twin of a US one. */
const SI_BRACKET = /\[\s*(?:L\s*\/\s*S|LPS|KPA|PA|°?\s*C|MM|M|M\s*\/\s*S|KG\s*\/\s*HR?|L|M3\s*\/\s*[HS])\s*\]/i;

/** Whether a bracketed header is an SI duplicate: its bracket names an SI
 * unit ("[L/S]", "[°C]"), or its cell prints in brackets too ("[ 170 ]" under
 * "TOTAL CAPACITY [KW]"). A US unit in brackets ("INPUT [MBH]", "EWT [°F]",
 * "ELEC [V/H/P]") is the column's own unit. */
function siDuplicate(header: string, item: CompileItem): boolean {
  if (!/\[[^\]]*\]/.test(header)) return false;
  if (SI_BRACKET.test(header)) return true;
  return /^\s*\[.*\]\s*$/.test(String(item.cells?.[header]?.text ?? ""));
}

/** The row's columns: the table's headers in order when known (so a blank
 * cell is a known blank), else the item's own non-blank cells. SI duplicates
 * ("[L/S]", "[KW]" printing "[ 170 ]", "[°C]") are the same quantity in
 * another unit and are never read. */
function columnsOf(item: CompileItem, table: TableContext | null): Column[] {
  const headers = table?.headers?.length ? [...table.headers] : [];
  for (const h of Object.keys(item.cells ?? {})) if (!headers.includes(h)) headers.push(h);
  return headers
    .filter((header) => !siDuplicate(header, item) && !SI_UNIT.test(headerText(header)))
    .map((header, order) => {
      const cell = item.cells?.[header] ?? null;
      return { header, h: headerText(header), cell: cell && String(cell.text ?? "").trim() ? cell : null, order };
    });
}

// Block words. They say which part of the unit a column belongs to.
const W = {
  hw: /\b(?:HW|HHW|HWS|HOT\s+WATER|HEATING|HTG|REHEAT|PREHEAT|RE-HEAT|PRE-HEAT)\b/,
  chw: /\b(?:CHW|CHWS|CHILLED|COOLING|CLG|EVAP|EVAPORATOR)\b/,
  dx: /\bDX\b|\bREFRIGERANT\b/,
  // A refrigerant's HOT GAS (a hot gas reheat coil) is no gas firing.
  gas: /(?<!\bHOT\s{1,3})\bGAS\b|\bFURNACE\b/,
  steam: /\bSTEAM\b/,
  electricHeat: /\bELEC(?:TRIC)?\s+(?:HEAT(?:ER|ING)?|DUCT\s+HEATER)\b|\bHEATER\b|\bHEATING\s+COIL\b/,
  condenser: /\b(?:CONDENSER|SOURCE|GEOTHERMAL)\b/,
  primary: /\bPRIMARY\b/,
  secondary: /\bSECONDARY\b/,
  supply: /\b(?:SUPPLY|SA|SF)\b/,
  returnAir: /\b(?:RETURN|RELIEF|RA|RF)\b/,
  exhaust: /\b(?:EXHAUST|EF)\b/,
  oa: /\b(?:OA|OSA|O\s?A|OUTSIDE\s+AIR|OUTDOOR\s+AIR|VENTILATION)\b/,
  // LOW names a minimum, never a side's temperature ("LOW TEMP WATER SIDE").
  min: /\bMIN(?:IMUM)?\b|\bLOW\b(?!\s+TEMP)/,
  max: /\bMAX(?:IMUM)?\b/,
  design: /\bDESIGN\b|\bHIGH\b|\bRATED\b/,
  actual: /\bACTUAL\b|\bALTERNATE\b|\bALT\b/,
  altMode: /\bSMOKE\b|\bPURGE\b|\bUN-?\s?OCCUPIED\b|\bNIGHT\b|\bSETBACK\b/,
  sensible: /\bSENS(?:IBLE)?\b|\bLATENT\b/,
  total: /\bTOTAL\b/,
  input: /\bINPUT\b/,
  output: /\bOUTPUT\b/,
  motor: /\bMOTOR\b/,
  fanWord: /\b(?:FAN|BLOWER|WHEEL)\b/,
  perLength: /\bPER\s+(?:FT|FOOT|LF)\b|\/\s*FT\b/,
  air: /\bAIR\b|\bEAT\b|\bLAT\b/,
};

export type Quantity =
  | "airflow" | "waterflow" | "ewt" | "lwt" | "ewt_lwt" | "capacity" | "hp" | "watts" | "kw" | "volts" | "phase" | "vph"
  | "rpm" | "esp" | "tsp" | "head" | "wpd" | "inlet_size" | "conn_size" | "tons" | "merv" | "qty" | "rows"
  | "lbhr" | "psig" | "area_served" | "service" | "location" | "drive" | "fuel" | "vfd" | "ecm" | "control"
  | "fluid" | "glycol" | "hp_qty" | "cells" | "economizer" | "humidifier" | "energy_recovery" | "type" | "rows_fins" | "arrangement" | "controller"
  | "reheat_kind" | "bas_protocol" | "oa_pct" | "motor_type" | "space" | "floors" | "plates"
  | "heat_kind" | "description" | "unit_size" | "poles" | "heat_watts" | "interlock" | "disconnect";

/** A header naming the parts of an electrical cell: V/PH, VOLTS/ PH /HZ,
 * V/HZ/PH, V/H/P, VOLT-PH-CY, VOLTAGE-PHASE (headerText has read Ø as PH). */
const ELECTRICAL_TUPLE = /\b(?:V|VOLTS?|VOLTAGE)\s*[/-]\s*(?:PH|PHASES?|P|HZ|HERTZ|H|CY)(?:\s*[/-]\s*(?:PH|PHASES?|P|HZ|HERTZ|H|CY))?\b(?=\s*(?:$|[)\]]|\s))/;

/** The quantities a header names, from its words. A header naming none is
 * a column the schema does not read (MANUFACTURER, WEIGHT, NC, FLA …).
 * `h` is headerText() output; exported for tests and diagnostics. */
export function quantitiesOf(h: string): Quantity[] {
  const q: Quantity[] = [];
  // An efficiency ratio (KW/TON) is neither a power nor a capacity.
  if (/\bKW\s*\/\s*TONS?\b|\bKW\s+PER\s+TONS?\b/.test(h)) return q;
  // An electrical tuple (V/PH, V/PH/HZ, V/HZ/PH, V/H/P, VOLTAGE-PHASE), or a
  // V/…/HZ triple whose phase symbol the text lost.
  const electricalPair = ELECTRICAL_TUPLE.test(h) || (/\bV\b/.test(h) && /\bHZ\b/.test(h) && !/\bVOLT/.test(h))
    // A bare ELEC column ("208/3"): the vph case reads only a V/PH cell.
    || /^(?:ELEC|ELECTRICAL)$/.test(h)
    // VOLTS PHASE HERTZ with no separators ("460/3/60").
    || /\bVOLTS?\s+PHASES?(?:\s+(?:HERTZ|HZ))?$/.test(h);
  if (electricalPair) q.push("vph");
  else {
    if (/\bVOLT(?:S|AGE)?\b/.test(h) || h === "V" || /\b(?:ELECTRICAL|ELEC|POWER|MOTOR)(?:\s+DATA)?\s+V$/.test(h)) q.push("volts");
    if (/\bPHASES?\b/.test(h) || (/\bPH\b/.test(h) && !/\bPH\s*(?:VALUE|LEVEL)\b/.test(h) && !/\b(?:INLET|NECK|DUCT|SIZE|DIA|DIAMETER)\b/.test(h))) q.push("phase");
  }
  if (/\bHP\s*\/\s*QTY\b/.test(h)) q.push("hp_qty");
  // "HP (BHP)": the motor's HP, its brake HP in parentheses.
  else if (/\b(?:HP|HORSEPOWER|MHP)\b/.test(h) && (!/\bBHP\b/.test(h) || /\bHP\s*\(\s*BHP\s*\)/.test(h)) && !/\bHP\s*\/\s*W\b/.test(h)) q.push("hp");
  if ((/\bHP\s*\/\s*W\b/.test(h) || /\bWATTS?\b/.test(h)) && !/\bCAPACITY\b|\bCOIL\b|\bHEAT/.test(h)) q.push("watts");
  // Heat in watts ("AUXILIARY HEAT (WATT)", "HEATER WATTS", "STRIP WATTS"):
  // an electric heater's rating, never a heat pump's or a coil's.
  else if (/\bWATTS?\b/.test(h) && /\bHEAT(?:ER|ING)?\b|\bSTRIPS?\b/.test(h) && !/\bCAPACITY\b|\bCOIL\b|\bRECOVERY\b|\bPUMPS?\b|\bREJECTION\b|\bGAIN\b|\bLOSS\b/.test(h)) q.push("heat_watts");
  if (/\bKW\b/.test(h)) q.push("kw");
  // Airflow: CFM, AIRFLOW, an air quantity ("DESIGN QUANTITIES" of a
  // terminal), a terminal's PRIMARY AIR (not its inlet, temperature or
  // pressure), a minimum outside air.
  const primaryAir = /\bPRIMARY\s+AIR\b/.test(h) && !/\bSIZE\b|\bDIA|\bINLET\b|\bTEMP|\bS\.?P\b|\bPRESS|\bVELOCITY\b|\bDUCT\b/.test(h);
  if ((/\bCFM\b|\bAIR\s?FLOWS?\b|\bAIR\s+QUANTIT(?:Y|IES)\b|\bDESIGN\s+QUANTITIES\b/.test(h) || primaryAir || /\bMIN(?:IMUM)?\s+(?:OA|OSA|OUTSIDE\s+AIR|OUTDOOR\s+AIR)$/.test(h)) && !/\bDIRECTION\b/.test(h)) q.push("airflow");
  if (/\bGPM\b|\bGPH\b/.test(h) || (/\bFLOW\b/.test(h) && !/\bAIR\s?FLOW|CFM|LBHR|CFH|STEAM\b/.test(h) && /\b(?:WATER|FLUID|HW|CHW|COIL|HEATING|COOLING|PUMP|BOILER|CAPACITY|CIRCULATING|EVAPORATOR|CONDENSER)\b|^FLOW$/.test(h))) q.push("waterflow");
  const water = /\b(?:WATER|WTR)\b/.test(h);
  // A water side's INLET / OUTLET TEMP ("HOT SIDE INLET TEMP (ºF)").
  const waterSide = water || /\b(?:HOT|COLD|PRIMARY|SECONDARY|SHELL|TUBE)\s+SIDE\b|\bFLUID\b/.test(h);
  // "WATER TEMPERATURES DEG F IN / OUT", "TEMP ENT / LVG".
  // "EVAPORATOR DATA ENTERING TEMP (F)", "CIRCULATING FLUID LEAVING (F)": the
  // water side's temperatures; never a condenser's or an air side's.
  const fluidEnds = (waterSide || /\bEVAPORATOR\b/.test(h)) && !/\bCONDENSER\b|\bAIR\b/.test(h);
  const ewt = /\bEWT\b|\bENT(?:ERING)?\s+(?:WATER|WTR)\b/.test(h) || (water && /\bTEMP\w*(?:\s+DEG)?(?:\s+F)?\s+(?:ENT|IN)$/.test(h)) || (waterSide && /\bINLET\s+TEMP/.test(h))
    || (fluidEnds && /\bENTERING(?:\s+TEMP\w*)?\s*(?:\(\s*F\s*\)|F)?$/.test(h));
  const lwt = /\bLWT\b|\bLE?AV(?:ING)?\s+(?:WATER|WTR)\b|\bLVG\s+(?:WATER|WTR)\b|\bEXT\s+WTR\b/.test(h) || (water && /\bTEMP\w*(?:\s+DEG)?(?:\s+F)?\s+(?:LVG|OUT)$/.test(h)) || (waterSide && /\bOUTLET\s+TEMP/.test(h))
    || (fluidEnds && /\bLEAVING(?:\s+TEMP\w*)?\s*(?:\(\s*F\s*\)|F)?$/.test(h));
  if (ewt && lwt) q.push("ewt_lwt");
  else if (ewt) q.push("ewt");
  else if (lwt) q.push("lwt");
  if (/\bMBH\b|\bBTUH\b|\bCAPACITY\b|\bOUTPUT\b|\bINPUT\b|\bLOAD\b/.test(h) && !/\bCFM\b|\bGPM\b|\bTONS?\b|\bLBHR\b|\bKW\b|\bFLOW\b|\bCFH\b|\bPART\s+LOAD\b|\bTEMP|\bEER\b|\bCOP\b|\bHSPF\b|\bEFF|\bTRAP\b/.test(h)) q.push("capacity");
  if (/\bRPM\b/.test(h)) q.push("rpm");
  if (/\bESP\b|\bEXT(?:ERNAL)?\s+(?:SP|STATIC)\b|^SP\b|\bS\s?P\b(?!\s*GR)|\bSTATIC\s+PRESS/.test(h) && !/\bTSP\b|\bTOTAL\s+(?:SP|STATIC)\b|\bINLET\s+SP\b|\bMIN\s+INLET\b/.test(h)) q.push("esp");
  else if (/\bTSP\b|\bTOTAL\s+(?:SP|STATIC)\b/.test(h)) q.push("tsp");
  if (/\bHEAD\b|\bTDH\b/.test(h) && !/\bNPSH\b/.test(h)) q.push("head");
  // A water pressure drop: WPD, PD, PRESSURE DROP, or a ΔP in feet of water
  // ("Δ P FT. H20"; the text layer may lose the Δ, leaving "P FTWC").
  if ((/\bW?PD\b|\bPRESS(?:URE)?\s+DROP\b|\bP\s?D\b|\bDELTA\s+P\b|(?:^|\s)(?:Δ\s?)?P\s+FTWC\b/.test(h)) && !/\bAIR\s+(?:P\s?D|PD|PRESSURE)\b|\bAIR\s+SIDE\b|\bAPD\b|\bINWC\b|\bOUTLET\b|\bINLET\s+SP\b/.test(h)) q.push("wpd");
  if (/\bINLET\b/.test(h) && /\b(?:SIZE|DIA(?:METER)?|IN(?:CHES)?)\b/.test(h) && !/\bSP\b|\bTEMP|\bAIR\s+INLET\b|\bGAS\b|\bFLUE\b|\bVENT\b|\bCOMBUSTION\b/.test(h)) q.push("inlet_size");
  // A POWER CONNECTION (its MCA, MOCP, FLA or volts) is electrical, never a pipe.
  else if (/\bCONN\w*|\bRUNOUT\b|\bSUCT(?:ION)?\b|\bDISCH(?:ARGE)?\s+SIZE\b|\bPIPE\s+(?:SIZE|DIA(?:METER)?)\b/.test(h) && !/\bCONNECTED\b|\bDIFFUSER\b|\bVENT\b|\bFLUE\b|\bCOMBUSTION\b|\bDRAIN\b|\bCONDENSATE\b|\bDUCT\b|\bPOWER\b|\bELEC(?:TRICAL)?\b|\bMCA\b|\bMOC?P\b|\bFLA\b|\bAMPS?\b|\bVOLT/.test(h)) q.push("conn_size");
  // A water's SUPPLY/RETURN in inches ("CHILLED WATER SUPPLY/RETURN (IN)"):
  // the pipe size of that water's connections.
  else if (/\b(?:WATER|CHW|H?HW)\s+SUPPLY\s*\/\s*RET(?:URN|RUN|RN)?\b/.test(h) && /\(\s*IN(?:CHES)?\s*\)|\bSIZE\b|\bPIPE\b/.test(h) && !/\bTEMP|\(\s*F\s*\)|\bGPM\b/.test(h)) q.push("conn_size");
  if (/\bTONS?\b|\bTONNAGE\b/.test(h)) q.push("tons");
  // An AFTER FILTER is the final filter (after the prefilters).
  if (/\bMERV\b|\b(?:FINAL|AFTER)[-\s]?FILTERS?\b|\bFILTERS?$/.test(h) && !/\bDEPTH\b|\bPD\b|\bFACE\b|\bQTY\b|\bPRE-?\s?FILTER\b/.test(h)) q.push("merv");
  if (/(?:\b(?:NO|NUMBER)|#)\s+OF\s+CELLS\b|^CELLS$/.test(h)) q.push("cells");
  // An exchanger's plate count ("DESIGN PLATES (QTY)") counts its plates,
  // never the units under the mark.
  if (/\bPLATES\b/.test(h) && !/\bSIZE\b|\bTHICK|\bMATERIAL\b|\bSPACING\b/.test(h)) q.push("plates");
  else if ((/\bQTY\b|\bQUANTITY\b|(?:\b(?:NO|NUMBER)|#)\s+OF\s+(?:FANS?(?:\s*\(S\))?|UNITS|PUMPS|BLOWERS|COILS)(?![A-Z])/.test(h)) && !/\bHP\s*\/\s*QTY\b/.test(h)) q.push("qty");
  // The outdoor air's share of the supply: "OA %", "% OA", "PERCENT OUTSIDE AIR".
  if (/\b(?:OA|OSA|OUTSIDE\s+AIR|OUTDOOR\s+AIR)\s*%|%\s*(?:OA|OSA|OUTSIDE\s+AIR|OUTDOOR\s+AIR)\b|\bPERCENT\s+(?:OA|OSA|OUTSIDE\s+AIR|OUTDOOR\s+AIR)\b/.test(h)) q.push("oa_pct");
  if (/\bROWS?\b/.test(h) && !/\bHORIZONTAL|VERTICAL\b/.test(h)) q.push(/\bROWS?\s*\/\s*FINS?\b/.test(h) ? "rows_fins" : "rows");
  // A trap's CAPACITY is its rating, never the unit's steam flow; a trap's
  // own LBS/HR is the condensate load it passes.
  if (/\bLBHR\b/.test(h) && !(/\bTRAP\b/.test(h) && /\bCAPACITY\b|\bRAT(?:ED|ING)\b|\bSIZE\b/.test(h))) q.push("lbhr");
  if (/\bPSIG?\b/.test(h)) q.push("psig");
  if ((/\bAREA\b.*\bSERV(?:ED|ICED)\b|^SERVES(?:\s+(?:ROOMS?|AREAS?|SPACES?)(?:\s*#|\s+NO)?)?$|^AREA$/.test(h)
    || /\sSERVES$/.test(h) || /\b(?:LOCATION|SPACES?|ROOMS?|UNITS?|ZONES?|FAN\s+COIL(?:\(S\)|S)?)\s+SERVED$/.test(h)) && !/\bSERVED\s+BY\b/.test(h)) q.push("area_served");
  // SERVICE / SERVING, alone or under a unit-data group ("UNIT GENERAL DATA
  // SERVICE"); SYSTEM (AND/OR SERVICE).
  else if (/^(?:SYSTEM|SYSTEM AND\/OR SERVICE|SYSTEM AND\/OR SEVICE|SYSTEM\s+SERVED)$/.test(h) || /^(?:(?:UNIT|GENERAL|DATA|EQUIPMENT|INFORMATION|INFO|BASIC|FAN|PUMP)\s+)*(?:SERVICE|SERVING)$/.test(h)) q.push("service");
  if (/^LOCATION$/.test(h)) q.push("location");
  // The floors a unit is on ("TYPICAL FLOORS" printing "2" or "3-4, 6-34").
  if (/^(?:TYPICAL\s+)?FLOORS?$|^(?:TYPICAL\s+)?LEVELS?$/.test(h)) q.push("floors");
  if (/^(?:REMARKS|ARRANGEMENT|OPERATION|PUMP\s+ARRANGEMENT)$/.test(h)) q.push("arrangement");
  if (/\bDRIVE\b/.test(h) && !/\bFREQ|VARIABLE|VFD\b/.test(h)) q.push("drive");
  if (/^FUEL$|\bFUEL\s+TYPE\b/.test(h)) q.push("fuel");
  if (/\bVFD\b|\bVAR(?:IABLE)?\s+FREQ|\bVSC\b|\bVSD\b|^VARIABLE\s+SPEED$/.test(h)) q.push("vfd");
  if (/(?:^|\s)EC$|\bECM\b|\bEC\s+MOTORS?$/.test(h)) q.push("ecm");
  if (/\bMOTOR\s+TYPE$/.test(h)) q.push("motor_type");
  // The space the unit is scheduled for, by name ("SPACE: NAME", "ROOM NAME").
  if (/^(?:SPACE|ROOM)\s*:?(?:\s+NAME)?$/.test(h)) q.push("space");
  if (/\bSPEED\s+CONTROL\b|\bCONTROL\s+TYPE\b|\bVOLUME\s+CONTROL\b|^CONTROLS?$/.test(h)) q.push("control");
  // Not a "… BY" column: that names who furnishes it ("EC" there is the
  // electrical contractor, never an EC motor).
  else if (/\bCONTROLLER\b|\bSTARTER\b|\bMOTOR\s+CONTROLS?$/.test(h) && !/\bBY\b|\bFURNISHED\b|\bPROVIDED\b|\bINSTALLED\b|\bWIRED\b/.test(h)) q.push("controller");
  if (/\bFLUID(?:\s+TYPE)?$/.test(h)) q.push("fluid");
  if (/\bGLYCOL\b|\b%\s*(?:PG|EG)\b/.test(h)) q.push("glycol");
  if (/\bECONOMIZER\b/.test(h)) q.push("economizer");
  if (/\bHUMIDIFIER\b|\bHUMIDIFICATION\b/.test(h)) q.push("humidifier");
  // A DX HEAT RECOVERY COIL is a refrigerant circuit's coil, not an energy
  // recovery device (wheel, plate, heat pipe, runaround).
  if (/\b(?:ENERGY|HEAT)\s+RECOVERY\b|\bENTHALPY\s+WHEEL\b/.test(h) && !(W.dx.test(h) && /\bCOILS?\b/.test(h))) q.push("energy_recovery");
  if (/^(?:UNIT\s+)?TYPE$/.test(h)) q.push("type");
  if (/^REHEAT\s+(?:HW|HOT\s+WATER|ELEC(?:TRIC)?|STEAM|NONE)$/.test(h)) q.push("reheat_kind");
  if (/\bBACNET\b|\bLONWORKS\b|\bMODBUS\b/.test(h)) q.push("bas_protocol");
  // What heats the unit, by name ("HEATING TYPE" printing "NAT. GAS").
  if (/\b(?:HEAT(?:ING)?|RE-?\s?HEAT)\s+(?:TYPE|SOURCE|MEDIUM)$/.test(h)) q.push("heat_kind");
  if (/^(?:UNIT\s+)?DESCRIPTION$/.test(h)) q.push("description");
  // A terminal's size number ("SIZE" printing "04").
  if (/^(?:UNIT\s+|BOX\s+|TERMINAL\s+|VAV\s+)?SIZE$/.test(h)) q.push("unit_size");
  // A circuit's POLES ("ELECTRICAL POLES" printing 1): never a motor's.
  if (/\bPOLES?\b/.test(h) && /\b(?:ELECTRICAL|ELEC|BREAKER|CIRCUIT|CKT|POWER)\b/.test(h) && !/\bMOTOR\b|\bRPM\b|\bSPEED\b/.test(h)) q.push("poles");
  if (/^INTERLOCK(?:ED)?(?:\s+(?:WITH|TO))?$/.test(h)) q.push("interlock");
  // A DISCONNECT column (its SWITCH, FUSE or MEANS); not who furnishes it.
  if (/\bDISCONNECTS?\b|\bDISC\b/.test(h) && !/\bBY\b|\bFURNISHED\b|\bPROVIDED\b|\bINSTALLED\b|\bWIRED\b/.test(h)) q.push("disconnect");
  return q;
}

// ── 4. The row's blocks ─────────────────────────────────────────────────────

type Service = "hw" | "chw" | "source" | "primary" | "secondary" | null;

/** Families whose one water coil can only be a heating coil. */
const HEATING_ONLY = new Set(["UNIT_HEATER", "CABINET_UNIT_HEATER", "FIN_TUBE_RADIATION", "VAV"]);

/** Units that make hot or chilled water rather than use it. Across a coil,
 * heating water cools and chilled water warms; across a chiller's evaporator,
 * a boiler or a tower it is the other way round. A heat exchanger's sign
 * depends on its duty, so its temperatures are never used to infer service. */
const WATER_PRODUCERS = new Set(["AIR_COOLED_CHILLER", "HEAT_RECOVERY_CHILLER", "BOILER", "COOLING_TOWER"]);

/** Whether EWT and LWT fit the service across this family: at a coil, heating
 * water leaves cooler and chilled water leaves warmer; at a producer, the
 * reverse. Unknown service or a heat exchanger: nothing to check. */
function waterPhysicsAgrees(family: string, s: Service, ewt: number, lwt: number): boolean {
  if (family === "HEAT_EXCHANGER" || (s !== "hw" && s !== "chw")) return true;
  const heatingWaterCools = s === "hw";
  const producer = WATER_PRODUCERS.has(family);
  return (heatingWaterCools !== producer) ? ewt > lwt : ewt < lwt;
}

/** Whether a coil's water temperature fits the air it heats or cools: a
 * heating coil's water is warmer than any air entering it, a cooling coil's
 * colder. The entering-air temperatures of the same coil block only (a
 * preheat coil's 13 °F air says nothing of a cooling coil's water), and not
 * an "EAT" printed on the block's water side; none printed, or a producer or
 * heat exchanger: nothing to check. */
function airAgrees(ctx: RowContext, s: Service, water: number): boolean {
  if ((s !== "hw" && s !== "chw") || WATER_PRODUCERS.has(ctx.family) || ctx.family === "HEAT_EXCHANGER") return true;
  const eats = ctx.cols
    .filter((c) => c.cell && /\bEAT\b|\bENT(?:ERING)?\s+AIR\b/.test(c.h) && waterService(c, ctx) === s
      && !/\b(?:LIQUID|FLUID|WATER)\s+SIDE\b|\bFLUID\s+PERFORMANCE\b/.test(c.h))
    .map((c) => parseNumberCell(c.cell!.text.replace(/\s*\/.*$/, ""))?.n)
    .filter((n): n is number => Number.isFinite(n));
  if (!eats.length) return true;
  return s === "hw" ? water > Math.min(...eats) : water < Math.max(...eats);
}

/** The two halves of a split system: a column that names the other half
 * ("ELECTRICAL FOR CONDENSING UNIT" in a furnace's row, "SUPPLY FAN" in its
 * condensing unit's) is not this unit's. */
const SPLIT_INDOOR = new Set(["FCU", "FURNACE", "VRF_INDOOR"]);
const SPLIT_OUTDOOR = new Set(["CONDENSING_UNIT", "VRF_OUTDOOR"]);
// A HEAT PUMP UNIT group beside an indoor unit's own ("AIR HANDLER" | "HEAT
// PUMP UNIT" in a VRF schedule) is the outdoor heat pump it runs on.
const OUTDOOR_WORDS = /\bOUTDOOR\s+UNITS?\b|\bCONDENSING\s+UNITS?\b|\bODU\b|\bCONDENSER\b(?!\s+WATER)|\bHEAT\s+PUMP\s+UNITS?\b/;
const INDOOR_WORDS = /\bINDOOR\s+UNITS?\b|\bIDU\b|\bSUPPLY\s+FAN\b|\bEVAPORATOR\b|\bFURNACE\b|\bGAS\s+HEAT(?:ING)?\b/;
function otherHalf(h: string, family: string, paired: boolean): boolean {
  if (SPLIT_INDOOR.has(family)) {
    if (OUTDOOR_WORDS.test(h) && !INDOOR_WORDS.test(h)) return true;
    // One row scheduling both halves ("ACCU-1 / AC-1"): the power connection
    // it prints without naming a half is the outdoor unit's, which feeds the
    // indoor one; the indoor unit's own prints as INDOOR or SUPPLY FAN.
    const power = quantitiesOf(h).some((q) => q === "volts" || q === "phase" || q === "vph");
    return paired && power && !INDOOR_WORDS.test(h);
  }
  if (SPLIT_OUTDOOR.has(family)) return INDOOR_WORDS.test(h) && !OUTDOOR_WORDS.test(h);
  return false;
}

/** Whether the table's row for this unit names a unit of another kind
 * beside it ("ACCU-1 / AC-1", "F-1 , CU-1"): one row scheduling both halves of
 * a split system. Two units of one kind on a row ("FCU-1/FCU-2") are no pair. */
function pairedRow(item: CompileItem, table: TableContext | null): boolean {
  const own = canonKey(item.tag);
  const tagLike = /^([A-Z]{1,6})-?\d{1,3}[A-Z]?(?:\([A-Z]\))?$/;
  return (table?.rows ?? []).some((r) => Object.values(r.cells).some((text) => {
    const parts = String(text ?? "").toUpperCase().split(/\s*[\/,&]\s*|\s+AND\s+/).map(canonKey).filter(Boolean);
    if (parts.length < 2 || !parts.includes(own) || !parts.every((p) => tagLike.test(p))) return false;
    return new Set(parts.map((p) => p.match(tagLike)![1])).size >= 2;
  }));
}

/** The water service a column belongs to, from its own block words, else
 * from the table: its title's words, a steam heat exchanger's water side,
 * the EWT/LWT of the table's only water block, a heating-only family. */
function waterService(col: Column, ctx: RowContext): Service {
  const h = col.h;
  if (W.primary.test(h)) return "primary";
  if (W.secondary.test(h)) return "secondary";
  if (ctx.family === "HEAT_EXCHANGER") {
    const side = hxSide(h, ctx);
    if (side) return side;
    // A flue gas (or exhaust gas) to water exchanger heats its water: the
    // water is the load side.
    if (/\b(?:FLUE|EXHAUST)\s+GAS\b|\bGAS\s+SIDE\b/.test(`${headerText(ctx.title)} ${ctx.cols.map((c) => c.h).join(" ")}`)) return "secondary";
  }
  if (W.condenser.test(h)) return "source";
  // A heat pump's COOLING and HEATING are its modes, not media: its water
  // side is the source loop unless a column names chilled or hot water.
  if (ctx.family === "HEAT_PUMP") {
    if (/\bCHW\b|\bCHILLED\b/.test(h)) return "chw";
    if (/\bHHW\b|\bHW\b|\bHOT\s+WATER\b/.test(h)) return "hw";
    return ctx.cols.some((c) => /\bCHW\b|\bCHILLED\b|\bHHW\b|\bHOT\s+WATER\b/.test(c.h)) ? null : "source";
  }
  const hw = W.hw.test(h);
  const chw = W.chw.test(h) || W.dx.test(h);
  if (hw && !chw) return "hw";
  if (chw && !hw) return "chw";
  if (hw && chw) return null;
  return ctx.defaultWater;
}

/** A heat exchanger's HOT SIDE or COLD SIDE as its primary (source) or
 * secondary (load) side, by its duty: a hot side entering at 110 °F or more
 * is heating water, so the hot side is the source; else a cold side entering
 * at 60 °F or less is chilled or tower water, so the cold side is the
 * source. A SHELL SIDE and a TUBE SIDE, one of them printing STEAM as its
 * fluid: the steam side is the source. Otherwise, or on no such header, null. */
const HOT_SIDE = /\bHOT\s+SIDE\b|\bHIGH\s+TEMP(?:ERATURE)?\s+(?:WATER\s+)?SIDE\b/;
const COLD_SIDE = /\bCOLD\s+SIDE\b|\bLOW\s+TEMP(?:ERATURE)?\s+(?:WATER\s+)?SIDE\b/;
function hxSide(h: string, ctx: RowContext): Service {
  // A HIGH TEMP WATER SIDE is the hot side, a LOW TEMP one the cold side.
  const side = HOT_SIDE.test(h) ? "hot" : COLD_SIDE.test(h) ? "cold" : null;
  if (!side) {
    const shell = /\bSHELL\s+SIDE\b/.test(h);
    if (!shell && !/\bTUBE\s+SIDE\b/.test(h)) return null;
    const steam = (which: RegExp) => ctx.cols.some((x) => which.test(x.h) && x.cell && quantitiesOf(x.h).includes("fluid") && /\bSTEAM\b/i.test(x.cell.text));
    const shellSteam = steam(/\bSHELL\s+SIDE\b/);
    if (shellSteam === steam(/\bTUBE\s+SIDE\b/)) return null;
    return shell === shellSteam ? "primary" : "secondary";
  }
  const entering = (which: RegExp) => {
    const c = ctx.cols.find((x) => which.test(x.h) && x.cell && quantitiesOf(x.h).includes("ewt"));
    return c ? parseNumberCell(c.cell!.text)?.n ?? null : null;
  };
  const hot = entering(HOT_SIDE);
  const cold = entering(COLD_SIDE);
  const heating = hot !== null && hot >= 110;
  const cooling = !heating && cold !== null && cold <= 60;
  if (heating) return side === "hot" ? "primary" : "secondary";
  if (cooling) return side === "cold" ? "primary" : "secondary";
  return null;
}

interface RowContext {
  family: string;
  title: string;
  attrs: Set<string>;
  cols: Column[];
  /** The service of an unqualified water column, when the table decides it. */
  defaultWater: Service;
  /** The table prints a water flow or water temperature column. */
  hasWaterSide: boolean;
  /** Per header, the codes its cited note defines. */
  codes: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** The table's legend, code → meaning. */
  legend: Readonly<Record<string, string>>;
  /** The row schedules both halves of a split system ("ACCU-1 / AC-1"). */
  paired: boolean;
  /** The table prints an indoor unit's columns (dropped from `cols` as the
   * other half's for an outdoor unit). */
  indoorColumns: boolean;
}

/** The one service every medium-named water column of the table names (a
 * coil schedule whose water columns all say HOT WATER), else none. */
function tableWater(cols: Column[]): Service {
  const services = new Set<string>();
  for (const c of cols) {
    const qs = quantitiesOf(c.h);
    if (!qs.some((q) => q === "waterflow" || q === "ewt" || q === "lwt" || q === "ewt_lwt")) continue;
    const hw = /\bHW\b|\bHHW\b|\bHOT\s+WATER\b|\bHEATING\b|\bREHEAT\b|\bPREHEAT\b/.test(c.h);
    const chw = /\bCHW\b|\bCHILLED\b|\bCOOLING\b/.test(c.h);
    if (hw && !chw) services.add("hw");
    else if (chw && !hw) services.add("chw");
    else services.add("?");
  }
  return services.size === 1 && !services.has("?") ? ([...services][0] as Service) : null;
}

function titleWater(title: string): Service {
  const t = headerText(title);
  const hw = /\bHOT\s+WATER\b|\bHW\b|\bHEATING\s+WATER\b|\bREHEAT\b|\bPREHEAT\b/.test(t);
  const chw = /\bCHILLED\s+WATER\b|\bCHW\b/.test(t);
  if (hw && !chw) return "hw";
  if (chw && !hw) return "chw";
  return null;
}

/** At a coil, EWT above LWT: the water gave up heat (a heating coil); below:
 * a cooling coil. Read from the row's unqualified EWT and LWT, when both are
 * one value. Never for a unit that makes water (its sign is reversed, and its
 * service comes from the family) or a heat exchanger. */
function physicsWater(item: CompileItem, cols: Column[], family: string): Service {
  if (WATER_PRODUCERS.has(family) || family === "HEAT_EXCHANGER") return null;
  const plain = (q: Quantity) => cols.filter((c) => quantitiesOf(c.h).includes(q) && !W.hw.test(c.h) && !W.chw.test(c.h) && !W.condenser.test(c.h) && !W.primary.test(c.h) && !W.secondary.test(c.h));
  const e = plain("ewt");
  const l = plain("lwt");
  if (e.length !== 1 || l.length !== 1 || !e[0].cell || !l[0].cell) return null;
  const ev = parseNumberCell(e[0].cell.text);
  const lv = parseNumberCell(l[0].cell.text);
  if (!ev || !lv || ev.n === lv.n) return null;
  return ev.n > lv.n ? "hw" : "chw";
}

// ── 5. Candidates ───────────────────────────────────────────────────────────

interface Candidate {
  attr: string;
  col: Column;
  value: number | string;
  printed: string;
  rule: string;
  /** Lower wins when two columns answer one attribute. */
  rank: number;
  /** From a note the row's own REMARKS / NOTES cell cites, or from that
   * cell's own prose: it speaks for this row in particular. */
  cited?: boolean;
}

const AIR_HANDLERS = new Set(["AHU", "DOAS", "DOAH_UNIT", "DOAH_HANDLING", "OUTDOOR_AIR_UNIT", "RTU"]);
/** Air handlers that move outdoor air only. */
const DEDICATED_OA = new Set(["DOAS", "DOAH_UNIT", "DOAH_HANDLING", "OUTDOOR_AIR_UNIT"]);

/** First attribute of `ids` the family has. */
const pick = (ctx: RowContext, ...ids: string[]) => ids.find((id) => ctx.attrs.has(id)) ?? null;

/** The water attribute for a service: the coil's own ("hw_gpm") where the
 * family has one, else the unit's own ("gpm"): a boiler or a pump in a table
 * titled HOT WATER still reports its own flow. */
function waterAttr(ctx: RowContext, s: Service, base: "gpm" | "ewt_f" | "lwt_f"): string | null {
  const prefix = s === "hw" ? "hw_" : s === "chw" ? "chw_" : s === "source" ? "source_" : s === "primary" ? "primary_" : s === "secondary" ? "secondary_" : "";
  return prefix ? pick(ctx, `${prefix}${base}`, base) : pick(ctx, base);
}

/** A number read from a column for `attr`: parsed, unit-checked, converted,
 * range-checked. Returns the canonical number or the reason it is none. */
function numberFor(attr: string, col: Column, headerUnit: string | null): { value: number } | { reason: string } {
  const text = col.cell?.text ?? "";
  const p = parseNumberCell(text);
  if (!p) return { reason: `cell "${text}" is not one number` };
  const spec = attributeSpec(attr);
  const canonical = spec.unit ?? "";
  // An inch mark on a static pressure is inches of water column.
  const unit = p.unit === "in" && canonical === "in. w.c." ? canonical : p.unit ?? headerUnit ?? canonical;
  let factor: number;
  try {
    factor = unitFactor(attr, unit);
  } catch {
    return { reason: `unit ${unit} is not one ${attr} accepts` };
  }
  // 12 significant digits: a unit factor's float noise (49,800 BTU/H ×
  // 0.001) never shows in a reported value.
  const value = Number((p.n * factor).toPrecision(12));
  // A motor printed as exactly 0 is the schedule saying the unit has none.
  if (value === 0 && /^0$/.test(text.trim()) && (attr === "motor_hp" || attr === "motor_watts")) return { value };
  const range = RANGE[canonical];
  if (range && (value < range[0] || value > range[1])) return { reason: `${value} ${canonical} is outside the physical range of ${attr}` };
  return { value };
}

/** The unit a header prints for a quantity ("(BTU/HR)" → BTU/H). */
function headerUnit(h: string, q: Quantity): string | null {
  if (q === "capacity") return /\bBTUH\b/.test(h) ? "BTU/H" : /\bMBH\b/.test(h) ? "MBH" : null;
  if (q === "esp" || q === "tsp") return /\bFTWC\b|\(FT\)|\bFT\b/.test(h) && !/\bINWC\b/.test(h) ? "ft" : "in. w.c.";
  if (q === "head" || q === "wpd") return /\bINWC\b/.test(h) ? "in. w.c." : "ft";
  if (q === "watts") return "W";
  if (q === "kw") return /\bKW\b/.test(h) ? "kW" : null;
  if (q === "hp") return "hp";
  if (q === "waterflow") return /\bGPH\b/.test(h) ? "GPH" : null;
  return null;
}

/** What a capacity header says beyond its medium words: a unitary
 * schedule's COOL MBH and HEAT MBH, a TOTAL (TC) or SENSIBLE (SC) part, an
 * INPUT or OUTPUT rating (a "HEAT MBH" tier's IN and OUT). */
function capacityWords(h: string) {
  return {
    cool: /\bCOOL\b/.test(h),
    heat: /\bHEAT\b/.test(h) && !/\bHEAT\s+(?:REJECTION|RECOVERY|RECOVERED|EXCHANGER|PUMP|GAIN|LOSS|TRANSFER)\b/.test(h),
    total: W.total.test(h) || /\bTC\b/.test(h),
    sensible: W.sensible.test(h) || /\bSC\b/.test(h),
    input: W.input.test(h) || /\b(?:MBH|BTUH)\s+IN\b|\bIN\s+(?:MBH|BTUH)\b/.test(h),
    output: W.output.test(h) || /\b(?:MBH|BTUH)\s+OUT\b|\bOUT\s+(?:MBH|BTUH)\b/.test(h),
  };
}

/** A staged unit's capacity ranks by its stage: the highest stage (the full
 * capacity) and HIGH FIRE first. Zero for a column that names no stage. */
function stageRank(h: string): number {
  const ORD: Record<string, number> = { FIRST: 1, "1ST": 1, SECOND: 2, "2ND": 2, THIRD: 3, "3RD": 3, FOURTH: 4, "4TH": 4 };
  const m = h.match(/\b(FIRST|1ST|SECOND|2ND|THIRD|3RD|FOURTH|4TH)\s+STAGE\b/) ?? h.match(/\bSTAGE\s*(\d)\b/);
  if (m) return (10 - Math.min(ORD[m[1]] ?? Number(m[1]), 9)) / 10;
  if (/\bHIGH\s+FIRE\b/.test(h)) return 0.05;
  if (/\bLOW\s+FIRE\b/.test(h)) return 0.95;
  return 0;
}

/** The fuel a column is printed for: a natural gas, oil or propane rating;
 * a firing rate in CFH is gas. */
function fuelOf(h: string): "gas" | "oil" | "propane" | null {
  if (/\bPROPANE\b|\bLPG?\b/.test(h)) return "propane";
  if (/\bNATURAL\s+GAS\b|\bCFH\b/.test(h) || W.gas.test(h)) return "gas";
  if (/\bOIL\b/.test(h)) return "oil";
  return null;
}

/** A dual-fuel unit prints a rating per fuel ("NATURAL GAS INPUT MBH", "# 2
 * OIL INPUT MBH"): the first-printed (primary) fuel's is the unit's. Zero for
 * a column naming no fuel, or the first fuel. */
function fuelRank(col: Column, ctx: RowContext): number {
  const fuel = fuelOf(col.h);
  if (!fuel) return 0;
  const order = [...new Set(ctx.cols.filter((c) => quantitiesOf(c.h).includes("capacity")).map((c) => fuelOf(c.h)).filter(Boolean))];
  return Math.max(0, order.indexOf(fuel));
}

/** A fired heater: the row prints one heating input and one lower heating
 * output (the difference is the combustion loss). */
function firedHeater(ctx: RowContext): boolean {
  const heat = ctx.cols.filter((c) => c.cell && quantitiesOf(c.h).includes("capacity") && !W.chw.test(c.h) && !W.dx.test(c.h) && !capacityWords(c.h).cool);
  const one = (end: "input" | "output") => {
    const ns = heat.filter((c) => capacityWords(c.h)[end]).map((c) => parseNumberCell(c.cell!.text)?.n).filter((n): n is number => Number.isFinite(n));
    return ns.length === 1 ? ns[0] : null;
  };
  const input = one("input");
  const output = one("output");
  return input !== null && output !== null && output < input;
}

/** Words naming a system, medium or duty (a SERVICE cell's "GENERAL
 * EXHAUST", "PRIMARY HW", "110° F RETURN"), not a place. */
const SYSTEM_WORDS = /\b(?:EXHAUST|SUPPLY|RETURN|RELIEF|TRANSFER|MAKE[-\s]?UP|OUTSIDE\s+AIR|OUTDOOR\s+AIR|VENTILATION|SMOKE|PRESSURIZATION|HOT\s+WATER|HEATING\s+WATER|CHILLED|CONDENSER|CONDENSATE|GLYCOL|STEAM|DOMESTIC|HEATING|COOLING|LOOP|PRIMARY|SECONDARY|H?HWS?|CHWS?|CWS?|GENERAL|SYSTEMS?)\b/;

/** A cell that points elsewhere instead of naming a place. */
const PLACE_POINTER = /^(?:SEE|REFER\s+TO|PER)\b|^(?:TBD|N\/?A|-+|VARIES)$/i;

/** A place a unit serves: a room, an area, a building or other units
 * ("RESTROOMS", "CLASSROOM 23", "SECTOR A - WEST", "KH-1", "F-B1 AND
 * EC-B1"); never a cell naming a system. */
function servedPlace(text: string): boolean {
  const t = String(text ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!t || SYSTEM_WORDS.test(t)) return false;
  const parts = t.split(/\s*(?:,|&|\/|\bAND\b)\s*/).filter(Boolean);
  if (parts.length && parts.every((p) => /^[A-Z]{1,5}-?[A-Z]{0,2}\d{1,4}[A-Z]?$/.test(p))) return true;
  return /\b(?:ROOMS?|RESTROOMS?|TOILETS?|OFFICES?|LABS?|LABORATOR(?:Y|IES)|KITCHENS?|CLASSROOMS?|CORRIDORS?|LOBB(?:Y|IES)|STORAGE|VESTIBULES?|JANITOR|CLOSETS?|MECH(?:ANICAL)?|ELEC(?:TRICAL)?|SECTOR|WINGS?|ZONES?|AREAS?|BUILDINGS?|BLDG|FLOORS?|LEVELS?|GYM(?:NASIUM)?|CAFETERIA|AUDITORIUM|LOCKERS?|SHOWERS?|LAUNDRY|SUITES?|SPACES?|ATTIC|BASEMENT|MDF|IDF|SERVER|TELECOM|STAIR(?:S|WELL)?|RISER|ENTRY|LOUNGE|CONFERENCE|WAREHOUSE|SHOP|GARAGE|HALL)\b/.test(t)
    || /(?:^|\s)\d{1,4}[A-Z]?(?:\s|$)/.test(t);
}

/** Units that serve the space they are in: its name is the area served. */
const ZONE_UNITS = new Set(["VAV", "FCU", "VRF_INDOOR", "UNIT_HEATER", "CABINET_UNIT_HEATER", "FIN_TUBE_RADIATION", "RADIANT_CEILING_PANEL"]);

/** "ECM - FAN MFR", "VFD (BY EC)": who furnishes a device, after it. */
const FURNISHED_BY = /\s*(?:[-–—]\s*|\(\s*)(?:(?:FURNISHED|PROVIDED|SUPPLIED)\s+)?(?:BY\s+)?(?:(?:FAN|UNIT|EQUIPMENT|PUMP|MOTOR)\s+)?(?:MFR|MFGR?|MANUFACTURER|SUPPLIER|VENDOR|EC|MC|E\.C\.|M\.C\.|OTHERS|DIV(?:ISION)?\s*\d+)\s*\)?$/;

/** A cell naming units only ("ACU-A-1", "F-B1 AND EC-B1"). */
function tagsOnly(text: string): boolean {
  const parts = String(text ?? "").toUpperCase().trim().split(/\s*(?:,|&|\/|\bAND\b)\s*/).filter(Boolean);
  return parts.length > 0 && parts.every((p) => /^[A-Z]{1,6}(?:[-.]?[A-Z0-9]{1,4}){1,3}$/.test(p) && /\d/.test(p));
}

/** The tons a chiller's evaporator water or a tower's water carries: its one
 * design flow times its range, over 24 (a chiller: 12,000 BTU/H a ton at 500
 * BTU/H per GPM-degree) or over 30 (a tower's nominal ton: 3 GPM at 10 F).
 * Null when the row does not print one flow and both temperatures. */
function flowTons(ctx: RowContext): number | null {
  const tower = ctx.family === "COOLING_TOWER";
  const one = (q: Quantity): number | null => {
    const ns = new Set(ctx.cols
      .filter((c) => c.cell && quantitiesOf(c.h).includes(q) && !W.min.test(c.h) && !W.max.test(c.h)
        && (tower ? !W.condenser.test(c.h) || /\bCONDENSER\s+WATER\b/.test(c.h) : waterService(c, ctx) === "chw"))
      .map((c) => parseNumberCell(c.cell!.text)?.n)
      .filter((n): n is number => Number.isFinite(n)));
    return ns.size === 1 ? [...ns][0] : null;
  };
  const gpm = one("waterflow");
  const ewt = one("ewt");
  const lwt = one("lwt");
  if (!gpm || ewt === null || lwt === null || ewt === lwt) return null;
  return (gpm * Math.abs(ewt - lwt)) / (tower ? 30 : 24);
}

/** A boiler's printed input, MBH (the largest, where it prints more than one). */
function boilerInputMbh(ctx: RowContext): number | null {
  const ins = ctx.cols
    .filter((c) => c.cell && quantitiesOf(c.h).includes("capacity") && capacityWords(c.h).input)
    .map((c) => {
      const p = parseNumberCell(c.cell!.text);
      const unit = headerUnit(c.h, "capacity") ?? p?.unit ?? null;
      return p && unit && (unit === "MBH" || unit === "BTU/H") ? p.n * unitFactor("input_mbh", unit) : null;
    })
    .filter((n): n is number => n !== null);
  return ins.length ? Math.max(...ins) : null;
}

/** A heater its table's title or its own TYPE calls electric. */
function electricHeaterRow(ctx: RowContext): boolean {
  const title = headerText(ctx.title);
  return (W.electricHeat.test(title) && /\bELEC/.test(title))
    || ctx.cols.some((c) => c.cell && quantitiesOf(c.h).includes("type") && /\bELEC(?:TRIC)?\b/.test(c.cell.text.toUpperCase()));
}

/** A table of electric heaters: an electric heater row, or a title naming
 * electric heat of any kind ("ELECTRIC RADIANT CEILING PANEL SCHEDULE",
 * "ELECTRIC BASEBOARD"). Its capacity in kW or W is the heater's heat. */
function electricHeatTable(ctx: RowContext): boolean {
  const title = headerText(ctx.title);
  return electricHeaterRow(ctx)
    || (/\bELEC(?:TRIC)?\b/.test(title) && /\bHEAT(?:ER|ERS|ING)?\b|\bRADIANT\b|\bBASEBOARDS?\b|\bCONVECTORS?\b|\bPANELS?\b/.test(title));
}

/** Whether the row has a water coil of service `s`: a header names that
 * water (CHW, CHILLED; HW, HOT WATER), or the row prints a water flow or
 * temperature of that service. A COOLING coil with neither is a DX coil. */
function rowWater(ctx: RowContext, s: Service): boolean {
  if (s !== "hw" && s !== "chw") return false;
  const named = s === "chw" ? /\bCHWS?\b|\bCHILLED\b/ : /\bH?HWS?\b|\bHOT\s+WATER\b|\bHEATING\s+WATER\b/;
  return ctx.cols.some((c) => named.test(c.h) || (quantitiesOf(c.h).some((q) => q === "waterflow" || q === "ewt" || q === "lwt" || q === "ewt_lwt") && waterService(c, ctx) === s));
}

/** Whether the row prints both a MAX and a MIN water flow of one service:
 * the range the unit accepts, not its design flow. */
function flowLimits(ctx: RowContext, s: Service): boolean {
  const flows = ctx.cols.filter((c) => quantitiesOf(c.h).includes("waterflow") && waterService(c, ctx) === s);
  return flows.some((c) => W.max.test(c.h)) && flows.some((c) => W.min.test(c.h));
}

/** Every attribute value a column can answer for this row. */
function candidatesOf(col: Column, ctx: RowContext, item: CompileItem): { found: Candidate[]; failed: Array<{ attr: string; reason: string }> } {
  const found: Candidate[] = [];
  const failed: Array<{ attr: string; reason: string }> = [];
  const h = col.h;
  const qs = quantitiesOf(h);
  const text = col.cell?.text ?? "";
  const num = (attr: string | null, q: Quantity, rule: string, rank = 0) => {
    if (!attr || !col.cell) return;
    if (q === "capacity" && !headerUnit(h, q) && !parseNumberCell(text)?.unit) {
      failed.push({ attr, reason: `"${col.header}" prints no unit (MBH or BTU/H)` });
      return;
    }
    const r = numberFor(attr, col, headerUnit(h, q));
    if ("reason" in r) failed.push({ attr, reason: r.reason });
    else found.push({ attr, col, value: r.value, printed: text, rule, rank });
  };
  const airRank = () => (W.altMode.test(h) ? 5 : W.design.test(h) ? 0 : W.max.test(h) ? 1 : W.min.test(h) || W.actual.test(h) ? 3 : /\bCONNECTED\b/.test(h) ? 4 : 2);
  for (const q of qs) {
    switch (q) {
      case "vph": {
        if (!col.cell) break;
        const e = parseElectricalCell(text);
        if (!e) { failed.push({ attr: "volts", reason: `cell "${text}" is not V/PH` }); break; }
        if (ctx.attrs.has("volts")) {
          if (e.volts !== null) found.push({ attr: "volts", col, value: e.volts, printed: text, rule: "electrical.v_ph", rank: electricalRank(h, ctx) });
          else failed.push({ attr: "volts", reason: `"${text}" names no standard voltage` });
        }
        if (ctx.attrs.has("phase")) {
          if (e.phase !== null) found.push({ attr: "phase", col, value: e.phase, printed: text, rule: "electrical.v_ph", rank: electricalRank(h, ctx) });
          else failed.push({ attr: "phase", reason: `"${text}" names no phase (1 or 3)` });
        }
        break;
      }
      case "volts": {
        if (!col.cell || !ctx.attrs.has("volts")) break;
        const p = parseNumberCell(text.replace(/V$/i, ""));
        // 24 VDC (an EC motor's supply) counts when the cell prints its unit.
        const low = /^\s*(12|24|48)\s*V(?:DC|AC)?\s*$/i.exec(text);
        if (p && STANDARD_VOLTS.has(p.n)) found.push({ attr: "volts", col, value: p.n, printed: text, rule: "electrical.volts", rank: electricalRank(h, ctx) });
        else if (low) found.push({ attr: "volts", col, value: Number(low[1]), printed: text, rule: "electrical.low_volts", rank: electricalRank(h, ctx) });
        // A terminal unit with no heater of its own runs on its controls' 24 V
        // ("24" under ELECTRICAL VOLTAGE).
        else if (ctx.family === "VAV" && /^\s*24\s*$/.test(text)) found.push({ attr: "volts", col, value: 24, printed: text, rule: "electrical.terminal_control_volts", rank: electricalRank(h, ctx) });
        else failed.push({ attr: "volts", reason: `cell "${text}" is not a standard voltage` });
        break;
      }
      case "phase": {
        if (!col.cell || !ctx.attrs.has("phase")) break;
        const p = parseNumberCell(text.replace(/\s*(?:PH|PHASE|Ø)$/i, ""));
        if (p && (p.n === 1 || p.n === 3)) { found.push({ attr: "phase", col, value: p.n, printed: text, rule: "electrical.phase", rank: electricalRank(h, ctx) }); break; }
        // A PHASE column printing a whole V/PH pair ("115/1": its header's
        // VOLT/ part lost): the pair's phase, and its voltage below a VOLTS
        // column's.
        const e = parseElectricalCell(text);
        if (e && e.volts !== null && e.phase !== null) {
          found.push({ attr: "phase", col, value: e.phase, printed: text, rule: "electrical.phase_v_ph_cell", rank: electricalRank(h, ctx) });
          if (ctx.attrs.has("volts")) found.push({ attr: "volts", col, value: e.volts, printed: text, rule: "electrical.phase_v_ph_cell", rank: electricalRank(h, ctx) + 1 });
          break;
        }
        failed.push({ attr: "phase", reason: `cell "${text}" is not a phase (1 or 3)` });
        break;
      }
      case "airflow": {
        if (W.perLength.test(h)) break;
        // A coil's face airflow is the coil's, not the unit's (except a coil);
        // a terminal's reheat block prints the box's own heating airflow.
        if (/\bCOILS?\b/.test(h) && ctx.family !== "DUCT_MOUNTED_COIL" && !(ctx.family === "VAV" && /\bHEAT(?:ING)?\b/.test(h) && !W.min.test(h))) break;
        // A louver's airflow (an ECONOMIZER, RELIEF or MINIMUM VENTILATION
        // LOUVER block of an air handler) is the louver's rating, never the
        // unit's supply, outdoor or return airflow.
        if (/\bLOUVERS?\b/.test(h) && (AIR_HANDLERS.has(ctx.family) || ctx.family === "ERV")) break;
        // "OUTDOOR AIRFLOW (CFM)": the outdoor air, for a unit that takes some.
        if (W.oa.test(h) || (ctx.attrs.has("oa_cfm_min") && /\b(?:OUTDOOR|OUTSIDE)\s+AIR\s?FLOWS?\b/.test(h))) {
          // A dedicated outdoor air unit's TOTAL OUTSIDE AIR is all it moves:
          // its supply airflow, not a minimum (below a SUPPLY airflow column).
          if (DEDICATED_OA.has(ctx.family) && W.total.test(h) && !W.min.test(h) && !W.max.test(h)) {
            num(pick(ctx, "supply_cfm"), q, "airflow.dedicated_outdoor_air", 1);
            break;
          }
          // The design minimum: never a MAXIMUM, and an occupied or unnamed
          // mode over a smoke, purge or unoccupied one.
          if (W.max.test(h)) break;
          num(pick(ctx, "oa_cfm_min"), q, "airflow.outdoor_air", W.altMode.test(h) ? 5 : 0);
          break;
        }
        if (ctx.family === "VAV") {
          // A heating (hot deck) minimum is not the box's minimum.
          if (/\bHEAT(?:ING)?\b|\bHOT\b/.test(h) && W.min.test(h)) break;
          if (/\bHEAT(?:ING)?\b|\bHOT\b/.test(h) && !W.min.test(h)) num(pick(ctx, "cfm_heat"), q, "airflow.terminal_heating");
          else if (W.min.test(h)) num(pick(ctx, "cfm_min"), q, "airflow.terminal_min");
          else if (W.max.test(h) || W.design.test(h) || /\bCOOLING\b|\bCOLD\b/.test(h)) num(pick(ctx, "cfm_max"), q, "airflow.terminal_max");
          else if (W.fanWord.test(h)) num(pick(ctx, "fan_cfm"), q, "airflow.terminal_fan");
          // The box's one printed airflow (the table prints no other): its
          // design maximum.
          else if (!W.returnAir.test(h) && ctx.cols.filter((c) => quantitiesOf(c.h).includes("airflow")).length === 1) num(pick(ctx, "cfm_max"), q, "airflow.terminal_only", 1);
          break;
        }
        if (AIR_HANDLERS.has(ctx.family) || ctx.family === "ERV") {
          // A heat recovery section's SUMMER / WINTER PERFORMANCE airflows are
          // its rating points, below the fans' own airflow.
          const perf = /\bPERFORMANCE\b|\b(?:SUMMER|WINTER)\b/.test(h) ? 3 : 0;
          if (W.returnAir.test(h)) { num(pick(ctx, "return_cfm"), q, "airflow.return", airRank() + perf); break; }
          if (W.exhaust.test(h)) { num(pick(ctx, "exhaust_cfm"), q, "airflow.exhaust", airRank() + perf); break; }
          if (W.min.test(h) && !W.design.test(h)) break;
          num(pick(ctx, "supply_cfm", "cfm"), q, W.supply.test(h) ? "airflow.supply" : "airflow.unit", airRank() + (W.supply.test(h) ? 0 : 1) + perf);
          break;
        }
        if (W.returnAir.test(h) || W.oa.test(h)) break;
        // An outdoor unit's airflow is its condenser's: an unqualified CFM in
        // a split system's table is the indoor unit's. A table of outdoor
        // units alone (no indoor half in its columns, row or title) prints
        // the unit's own.
        if (SPLIT_OUTDOOR.has(ctx.family) && !OUTDOOR_WORDS.test(h)
          && (ctx.paired || ctx.indoorColumns || /\bSPLIT\b|\bINDOOR\b|\bFAN\s+COILS?\b|\bAIR\s+HANDL/.test(headerText(ctx.title)))) break;
        num(pick(ctx, "cfm", "supply_cfm"), q, "airflow.unit", airRank());
        break;
      }
      case "waterflow": {
        const s = waterService(col, ctx);
        // A MAX and a MIN flow printed together are the unit's allowed range
        // (a boiler's 10-105 GPM), not its design flow.
        if ((W.max.test(h) || W.min.test(h)) && flowLimits(ctx, s)) break;
        // A package's TOTAL flow over one pump's share; the DESIGN flow over a
        // SELECTION or MAX one (a pump's or exchanger's limits).
        num(waterAttr(ctx, s, "gpm"), q, `water.${s ?? "unit"}.flow`, W.min.test(h) ? 3 : W.max.test(h) ? 2 : W.total.test(h) || /\bDESIGN\b/.test(h) ? 0 : 1);
        break;
      }
      case "ewt":
      case "lwt":
      case "ewt_lwt": {
        if (W.air.test(h) && !/\bWATER|WTR|EWT|LWT\b/.test(h)) break;
        const s = waterService(col, ctx);
        const ids = (end: "ewt" | "lwt") => waterAttr(ctx, s, `${end}_f`);
        if (q !== "ewt_lwt") {
          const p = col.cell ? parseNumberCell(text) : null;
          if (p && !airAgrees(ctx, s, p.n)) { const a = ids(q); if (a) failed.push({ attr: a, reason: `"${text}" under "${col.header}" contradicts the row's entering air` }); break; }
          num(ids(q), q, `water.${s ?? "unit"}.${q}`);
          break;
        }
        if (!col.cell) break;
        const parts = text.split("/").map((p) => parseNumberCell(p));
        const [ewtA, lwtA] = [ids("ewt"), ids("lwt")];
        if (parts.length !== 2 || !parts[0] || !parts[1]) { if (ewtA) failed.push({ attr: ewtA, reason: `cell "${text}" is not EWT/LWT` }); break; }
        // The header's own order decides which part is which; the physics of
        // the block (heating water cools, chilled water warms) must agree.
        const firstIsEwt = /\bEWT\b.*\bLWT\b/.test(h);
        const [e, l] = firstIsEwt ? [parts[0].n, parts[1].n] : [parts[1].n, parts[0].n];
        const agrees = waterPhysicsAgrees(ctx.family, s, e, l);
        if (!agrees) { if (ewtA) failed.push({ attr: ewtA, reason: `"${text}" under "${col.header}" contradicts the block's service` }); break; }
        if (ewtA) found.push({ attr: ewtA, col, value: e, printed: text, rule: `water.${s ?? "unit"}.ewt_lwt`, rank: 0 });
        if (lwtA) found.push({ attr: lwtA, col, value: l, printed: text, rule: `water.${s ?? "unit"}.ewt_lwt`, rank: 0 });
        break;
      }
      case "capacity": {
        if (W.perLength.test(h)) break;
        // "200 CFM @ 0.5" ESP" under CAPACITY: an air unit's rated airflow.
        const airCap = col.cell ? text.match(/^\s*(\d[\d,]*(?:\.\d+)?)\s*CFM\b/i) : null;
        if (airCap) {
          const attr = AIR_HANDLERS.has(ctx.family) || ctx.family === "ERV" ? pick(ctx, "supply_cfm", "cfm") : pick(ctx, "cfm", "supply_cfm");
          const n = Number(airCap[1].replace(/,/g, ""));
          if (attr && n >= RANGE.cfm[0] && n <= RANGE.cfm[1]) found.push({ attr, col, value: n, printed: text, rule: "airflow.capacity_cell", rank: 3 });
          break;
        }
        // A capacity printed in kW or W ("8 kW" under CAPACITY): an electric
        // heater's heat, in a table of electric heaters; no other attribute.
        const cellUnit = col.cell && !headerUnit(h, q) ? parseNumberCell(text)?.unit ?? null : null;
        if (cellUnit === "kW" || cellUnit === "W") {
          if (ctx.attrs.has("eh_kw") && electricHeatTable(ctx) && !W.motor.test(h) && !W.fanWord.test(h)) num("eh_kw", "kw", "power.electric_heat_capacity");
          break;
        }
        // A chiller's or tower's capacity printed with no unit ("NET CAPACITY"
        // 300.0): tons, where the unit's own water flow and range carry that
        // many (a chiller's GPM x range / 24; a tower's nominal GPM x range / 30).
        if (ctx.attrs.has("tons") && col.cell && !headerUnit(h, q)) {
          const p = parseNumberCell(text);
          if (p && !p.unit && !p.words) {
            const tons = flowTons(ctx);
            if (tons !== null && Math.abs(p.n - tons) <= 0.05 * tons) found.push({ attr: "tons", col, value: p.n, printed: text, rule: "capacity.tons_by_flow", rank: /\bNOMINAL\b/.test(h) ? 1 : 0 });
            else failed.push({ attr: "tons", reason: `"${col.header}" prints no unit, and its ${p.n} is not the tons the unit's water flow and range carry` });
          }
          break;
        }
        const cap = capacityWords(h);
        // A stage's capacity: the unit's full (highest-stage, high-fire)
        // capacity ranks over a lower stage's ("SECOND STAGE/FIRST STAGE"
        // prints 60/42; the furnace's output is 60).
        const stage = stageRank(h);
        // A firing range's MIN. end ranks below its MAX. (the rating).
        const rangeEnd = W.min.test(h) && !/\bMIN(?:IMUM)?\s+(?:TOTAL|SENS|CAP)/.test(h) ? 0.5 : 0;
        if (cap.input) {
          const gas = W.gas.test(h) || W.gas.test(ctx.title) || ctx.family === "BOILER" || firedHeater(ctx);
          num(ctx.family === "BOILER" ? pick(ctx, "input_mbh") : gas ? pick(ctx, "gas_input_mbh") : null, q, "capacity.input", fuelRank(col, ctx) + stage + rangeEnd);
          break;
        }
        if (ctx.family === "BOILER") {
          if (cap.output) num(pick(ctx, "output_mbh"), q, "capacity.output", fuelRank(col, ctx) + stage + rangeEnd);
          else if (!cap.sensible && col.cell) {
            // A boiler's capacity naming neither end ("DESIGN CAPACITY (MBH)"),
            // beside its INPUT: its rated output, which never exceeds the input.
            const input = boilerInputMbh(ctx);
            const p = parseNumberCell(text);
            const unit = headerUnit(h, q) ?? p?.unit ?? null;
            if (input !== null && p && unit && p.n * unitFactor("output_mbh", unit) <= input) num(pick(ctx, "output_mbh"), q, "capacity.boiler_rated_output", 1 + fuelRank(col, ctx) + stage);
          }
          break;
        }
        // A heat exchanger's capacity is the heat it exchanges.
        // Its DESIGN capacity over a MAX one (the frame's limit).
        if (ctx.family === "HEAT_EXCHANGER") { num(pick(ctx, "capacity_mbh"), q, "capacity.exchanged", stage + (W.max.test(h) ? 1 : 0)); break; }
        const cooling = W.chw.test(h) || W.dx.test(h) || cap.cool;
        const heating = W.hw.test(h) || W.gas.test(h) || W.steam.test(h) || W.electricHeat.test(h) || cap.heat;
        // A fan coil's cooling capacity is its chilled-water coil's where the
        // row prints that coil's water (as its heating is its hot-water coil's).
        const chwCoil = ctx.family === "FCU" && (ctx.hasWaterSide || /\bCHW\b|\bCHILLED\b/.test(h));
        if (cooling && !heating) {
          if (cap.sensible) break;
          num(chwCoil ? pick(ctx, "chw_mbh", "cooling_mbh") : pick(ctx, "cooling_mbh", "chw_mbh"), q, "capacity.cooling", (cap.total ? 0 : 1) + stage);
        } else if (heating && !cooling) {
          const coil = ctx.family === "VAV" || ctx.family === "FCU";
          if (coil && !ctx.hasWaterSide) break;
          num(coil ? pick(ctx, "hw_mbh", "heating_mbh") : pick(ctx, "heating_mbh"), q, "capacity.heating", (cap.output ? 0 : 1) + stage);
        } else if (!cooling && !heating) {
          const s = ctx.defaultWater;
          // A terminal's or fan coil's own coil capacity is a hot-water coil's
          // only when the table prints that coil's water; an electric heater's
          // MBH is not (bldg5406's REHEAT MBH beside ELECTRIC HEATER KW).
          if ((ctx.family === "VAV" || ctx.family === "FCU") && !ctx.hasWaterSide) break;
          if (HEATING_ONLY.has(ctx.family) || s === "hw") num(ctx.family === "VAV" ? pick(ctx, "hw_mbh") : pick(ctx, "heating_mbh"), q, "capacity.heating_unit", (cap.output || cap.total ? 0 : 1) + stage);
          else if (s === "chw") { if (!cap.sensible) num(chwCoil ? pick(ctx, "chw_mbh", "cooling_mbh") : pick(ctx, "cooling_mbh"), q, "capacity.cooling_unit", (cap.total ? 0 : 1) + stage); }
        }
        break;
      }
      case "hp": {
        // A fan's BRAKE HP is the shaft power it draws, below its motor's
        // rating. "(2) 1/4", "(2)@1.5", "2 @ 1/2": that many motors of that
        // size, and the attribute is each motor's.
        // "2x2" (and "4 X 5"): that many motors, count first, of that size.
        // "HP (BHP)" printing "5 (4.1)": the motor's rating, then its brake HP.
        const brake = /\bBRAKE\b/.test(h) ? 3 : 0;
        const each = col.cell ? text.match(/^\s*\(\s*(\d{1,2})\s*\)\s*@?\s*(\S.*)$|^\s*(\d{1,2})\s*@\s*(\S.*)$|^\s*(\d{1,2})\s*[xX×]\s*(\d\S*(?:\s*HP)?)\s*$/) : null;
        const withBrake = col.cell && /\bHP\s*\(\s*BHP\s*\)/.test(h) ? text.match(/^\s*(\d[\d./-]*)\s*\(\s*\d+(?:\.\d+)?\s*\)\s*$/) : null;
        const motors = (attr: string | null, rule: string, rank: number) => {
          if (withBrake && attr && col.cell) {
            const r = numberFor(attr, { ...col, cell: { text: withBrake[1], bbox: col.cell.bbox } }, headerUnit(h, q));
            if ("reason" in r) failed.push({ attr, reason: r.reason });
            else found.push({ attr, col, value: r.value, printed: text, rule: `${rule}.rated_with_brake`, rank });
            return;
          }
          if (!each) { num(attr, q, rule, rank); return; }
          if (!attr || !col.cell) return;
          const r = numberFor(attr, { ...col, cell: { text: (each[2] ?? each[4] ?? each[6]).trim(), bbox: col.cell.bbox } }, headerUnit(h, q));
          if ("reason" in r) failed.push({ attr, reason: r.reason });
          else found.push({ attr, col, value: r.value, printed: text, rule: `${rule}.each`, rank });
        };
        // A motor's type printed where its size goes ("PSC" under MOTOR
        // (HP)): whether it is an EC motor, and no size.
        const kind = col.cell && ctx.attrs.has("ecm") && !/^\s*EC\s*$/i.test(text) ? motorTypeOf(text) : null;
        if (kind) { found.push({ attr: "ecm", col, value: kind, printed: text, rule: "enum.motor_type_hp_cell", rank: 1 }); break; }
        if (W.returnAir.test(h)) { motors(pick(ctx, "return_fan_hp"), "power.return_fan", brake); break; }
        if (W.exhaust.test(h) && (AIR_HANDLERS.has(ctx.family) || ctx.family === "ERV")) { motors(pick(ctx, "exhaust_fan_hp"), "power.exhaust_fan", brake); break; }
        const attr = AIR_HANDLERS.has(ctx.family) || ctx.family === "ERV" ? pick(ctx, "supply_fan_hp") : pick(ctx, "motor_hp", "fan_hp");
        // The attribute is each motor's: a TOTAL over a fan array ranks below it.
        motors(attr, W.supply.test(h) ? "power.supply_fan" : "power.motor", (W.supply.test(h) ? 0 : 1) + (W.total.test(h) ? 2 : 0) + brake);
        break;
      }
      case "watts": {
        // A fan's motor rated in watts. A heater's watts are its heat, so a
        // family that heats electrically never reads a WATTS column as a motor.
        // A unit heated by water draws power only for its fan: its
        // ELECTRICAL watts are the motor's.
        const motorWords = W.fanWord.test(h) || W.motor.test(h);
        // An electric heater's WATTS (one its TYPE or title calls electric) are
        // its heat.
        if (!motorWords && HEATING_ONLY.has(ctx.family) && ctx.attrs.has("eh_kw") && electricHeaterRow(ctx)) { num(pick(ctx, "eh_kw"), q, "power.electric_heat_watts"); break; }
        const kwCol = ctx.cols.some((c) => quantitiesOf(c.h).includes("kw"));
        const waterHeated = ctx.hasWaterSide && !kwCol && /\bELEC/.test(h) && ctx.attrs.has("motor_hp");
        if (!motorWords && !ctx.attrs.has("motor_watts") && !waterHeated) break;
        const electricHeater = !waterHeated && (W.electricHeat.test(headerText(ctx.title)) || kwCol);
        if (electricHeater && !motorWords) break;
        if (!col.cell) break;
        const p = parseNumberCell(text);
        if (/\bHP\s*\/\s*W\b/.test(h) && p && p.unit !== "W" && !/\bW(?:ATTS?)?\b/i.test(text)) {
          num(pick(ctx, "motor_hp"), "hp", "power.motor_hp_or_watts");
          break;
        }
        num(pick(ctx, "motor_watts", "motor_hp"), q, "power.motor_watts");
        break;
      }
      case "kw": {
        if (W.motor.test(h) || W.fanWord.test(h)) break;
        // A humidifier fed with steam or fired by gas has no element: its KW is
        // its controls'.
        if (ctx.family === "HUMIDIFIER" && ctx.cols.some((c) => c.cell && /\bTYPE\b/.test(c.h) && /\bSTEAM[-\s]+TO[-\s]+STEAM\b|\bGAS[-\s]+FIRED\b/i.test(c.cell.text))) break;
        // A humidifier's KW is the element that boils its water.
        if (W.electricHeat.test(h) || W.hw.test(h) || HEATING_ONLY.has(ctx.family) || ctx.family === "HUMIDIFIER" || W.electricHeat.test(headerText(ctx.title)) || electricHeatTable(ctx)) num(pick(ctx, "eh_kw"), q, "power.electric_heat");
        else if (W.total.test(h) || W.max.test(h) || W.input.test(h) || /\bDESIGN\b/.test(h)) num(pick(ctx, "kw_input"), q, "power.input");
        break;
      }
      case "rpm": {
        // The unit's own speed (a fan's, the pump's operating speed) over an
        // unqualified RPM, and either over its motor's nameplate speed.
        const motor = W.motor.test(h);
        const own = !motor && (W.fanWord.test(h) || /\bOPER(?:ATING)?\b|\bPUMP\b/.test(h));
        num(pick(ctx, "rpm"), q, own ? (W.fanWord.test(h) ? "speed.fan" : "speed.unit") : "speed.motor", own ? 0 : motor ? 2 : 1);
        break;
      }
      case "esp": num(pick(ctx, "esp_in"), q, "pressure.external"); break;
      case "tsp": num(pick(ctx, "esp_in"), q, "pressure.total", 5); break;
      case "head": {
        const rank = /\bSHUT\s*-?\s*OFF\b/.test(h) ? 3 : W.max.test(h) ? 2 : W.design.test(h) ? 0 : 1;
        // "(FT WG/PSI)" printing "277/120": one head in feet, then in psi
        // (2.31 ft of water a psi), the feet read.
        const pair = col.cell && /\bFTWC\s*\/\s*PSIG?\b|\bFT\s*\/\s*PSIG?\b/.test(h) ? text.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/) : null;
        const attr = pick(ctx, "head_ft");
        if (pair && attr) {
          const [ft, psi] = [Number(pair[1]), Number(pair[2])];
          if (Math.abs(ft - 2.31 * psi) <= 0.05 * ft) found.push({ attr, col, value: ft, printed: text, rule: "pressure.head_ft_psi", rank });
          else failed.push({ attr, reason: `"${text}" under "${col.header}" is not one head in feet and psi` });
          break;
        }
        num(attr, q, "pressure.head", rank);
        break;
      }
      case "wpd": {
        const s = waterService(col, ctx);
        num(s === "hw" ? pick(ctx, "hw_wpd_ft") : s === "chw" ? pick(ctx, "chw_wpd_ft") : s === "source" ? pick(ctx, "source_wpd_ft") : null, q, `water.${s ?? "unit"}.wpd`);
        break;
      }
      case "inlet_size": {
        if (!ctx.attrs.has("inlet_size_in")) {
          // A pump's (or any unit's) INLET SIZE is its suction connection.
          if (!col.cell || !ctx.attrs.has("conn_in")) break;
          const v = parseSizeCell(text);
          const n = v !== null && !v.includes("x") ? Number(v) : NaN;
          if (Number.isFinite(n) && n >= RANGE.in[0] && n <= 24) found.push({ attr: "conn_in", col, value: n, printed: text, rule: "size.connection", rank: 0 });
          else failed.push({ attr: "conn_in", reason: `cell "${text}" is not one pipe size` });
          break;
        }
        if (!col.cell) break;
        const v = parseSizeCell(text);
        const sides = v === null ? [] : v.split("x").map(Number);
        if (v === null || !sides.every((d) => d >= 3 && d <= 40)) failed.push({ attr: "inlet_size_in", reason: `cell "${text}" is not a terminal inlet size` });
        else found.push({ attr: "inlet_size_in", col, value: v, printed: text, rule: "size.inlet", rank: /\bHOT\b/.test(h) ? 1 : 0 });
        break;
      }
      case "conn_size": {
        const s = waterService(col, ctx);
        const attr = s === "hw" && ctx.attrs.has("hw_conn_in") ? "hw_conn_in" : s === "chw" && ctx.attrs.has("chw_conn_in") ? "chw_conn_in" : pick(ctx, "conn_in");
        if (!attr || !col.cell) break;
        const v = parseSizeCell(text);
        const n = v !== null && !v.includes("x") ? Number(v) : NaN;
        if (!Number.isFinite(n) || n < RANGE.in[0] || n > 24) { failed.push({ attr, reason: `cell "${text}" is not one pipe size` }); break; }
        found.push({ attr, col, value: n, printed: text, rule: "size.connection", rank: /\bSUCT(?:ION)?\b|\bINLET\b/.test(h) ? 0 : /\bDISCH(?:ARGE)?\b/.test(h) ? 2 : 1 });
        break;
      }
      // A NOMINAL size names the unit's class; a capacity column beside it is
      // what the unit is scheduled to deliver.
      case "tons": num(pick(ctx, "cooling_tons", "tons"), q, "capacity.tons", /\bNOMINAL\b/.test(h) ? 1 : 0); break;
      case "merv": {
        if (!col.cell || !ctx.attrs.has("filter_merv")) break;
        // A MERV column may print the bare rating; any other filter column
        // counts only when its cell names one MERV rating ('2" MERV 8' is a
        // 2-inch MERV 8 filter; "12in. cartridge - 95% eff - MERV 15").
        const t = text.toUpperCase().trim();
        const mervs = [...t.matchAll(/\bMERV\s*-?\s*(\d{1,2})\b/g)];
        const bare = /\bMERV\b/.test(h) ? t.match(/^(?:MERV\s*-?\s*)?(\d{1,2})$/) : null;
        const m = bare ?? (mervs.length === 1 && !/\bPRE-?\s?FILTER/.test(t) ? mervs[0] : null);
        if (m && Number(m[1]) >= 1 && Number(m[1]) <= 20) found.push({ attr: "filter_merv", col, value: Number(m[1]), printed: text, rule: "filter.merv", rank: 0 });
        else failed.push({ attr: "filter_merv", reason: `cell "${text}" is not one MERV rating` });
        break;
      }
      case "qty": {
        // A count of the unit's parts (compressors, condenser fans, coils,
        // filters) is never the count of units under the mark.
        // What is counted: the noun after "NO. OF" where printed ("FAN MOTOR
        // NO. OF FAN(S)" counts fans), else the whole header.
        const counted = h.match(/(?:\b(?:NO|NUMBER)|#)\s+OF\s+(.+)$/)?.[1] ?? h;
        // A coil's own schedule counts coils: there the coil is the unit.
        if (/\b(?:COMPRESSORS?|COMP|CONDENSER|FILTERS?|CELLS?|STAGES?|CIRCUITS?|PUMPS?|MOTORS?|MANIFOLDS?|SECTIONS?|BLENDERS?|LOUVERS?|DAMPERS?)\b/.test(counted)
          || (/\bCOILS?\b/.test(counted) && ctx.family !== "DUCT_MOUNTED_COIL")) break;
        const fan = W.fanWord.test(h) || /\bFANS\b|\bBLOWERS\b/.test(h);
        // A QUANTITY under an airstream's group (an ERV's OUTDOOR AIR
        // PERFORMANCE QUANTITY, beside its MOTOR SIZE) counts that section's
        // fans, never the units under the mark.
        if (!fan && (W.oa.test(h) || W.exhaust.test(h) || W.returnAir.test(h) || /\bPERFORMANCE\b/.test(h))) break;
        const attr = W.supply.test(h) && fan ? pick(ctx, "supply_fan_qty") : W.returnAir.test(h) && fan ? pick(ctx, "return_fan_qty")
          : AIR_HANDLERS.has(ctx.family) && fan ? pick(ctx, "supply_fan_qty")
          : fan ? (ctx.family === "FAN" ? pick(ctx, "qty") : pick(ctx, "fan_qty"))
          : pick(ctx, "qty");
        if (!attr || !col.cell) break;
        const p = parseNumberCell(text);
        if (p && Number.isInteger(p.n) && p.n >= 1 && p.n <= 100 && !p.words) found.push({ attr, col, value: p.n, printed: text, rule: "count.quantity", rank: 0 });
        else failed.push({ attr, reason: `cell "${text}" is not a count` });
        break;
      }
      case "rows":
      case "rows_fins": {
        const s = waterService(col, ctx);
        // A coil's rows are a water coil's only where the row prints or names
        // that water: a COOLING coil with no chilled water is a DX coil.
        if (!rowWater(ctx, s)) break;
        const attr = s === "hw" ? pick(ctx, "hw_rows") : s === "chw" ? pick(ctx, "chw_rows") : null;
        if (!attr || !col.cell) break;
        // ROW/FIN prints "6/12": rows, then fins per inch — in the header's order.
        const parts = q === "rows_fins" ? text.split("/") : [text];
        if (q === "rows_fins" && parts.length !== 2) { failed.push({ attr, reason: `cell "${text}" is not ROWS/FINS` }); break; }
        const p = parseNumberCell(parts[0]);
        if (p && Number.isInteger(p.n) && p.n >= 1 && p.n <= 12 && !p.words) found.push({ attr, col, value: p.n, printed: text, rule: "coil.rows", rank: 0 });
        else failed.push({ attr, reason: `cell "${text}" is not a row count` });
        break;
      }
      case "lbhr": {
        // A humidifier section's steam is the humidifier's, never the unit's
        // steam coil's.
        if (ctx.family !== "HUMIDIFIER" && /\bHUMIDIF/.test(h)) break;
        const attr = ctx.family === "HEAT_EXCHANGER" ? pick(ctx, "primary_steam_lb_hr") : pick(ctx, "capacity_lb_hr", "steam_lb_hr");
        // A steam flow column over the condensate its trap passes; the design
        // capacity over a MAXIMUM one (the unit's limit, not its duty).
        num(attr, q, "steam.flow", /\bTRAP\b/.test(h) ? 2 : W.max.test(h) ? 1 : 0);
        break;
      }
      case "psig": {
        if (/\bDISPERSION\b|\bLEAVING\b|\bLVG\b/.test(h)) break;
        if (ctx.family !== "HUMIDIFIER" && /\bHUMIDIF/.test(h)) break;
        num(ctx.family === "HEAT_EXCHANGER" ? pick(ctx, "primary_steam_psig") : pick(ctx, "steam_psig"), q, "steam.pressure", /\bCONTROL\s+VALVE\b|\bSUPPLY\b/.test(h) ? 0 : 1);
        break;
      }
      case "area_served": {
        if (!col.cell || !ctx.attrs.has("area_served")) break;
        // "AREA / SUPPLY VALVE SERVED": the area, before the valve's tag
        // ("SOIL/AGGREGATE 126 / SAV-2").
        const valve = /\//.test(h) && /\bSUPPLY\s+VALVE\b/.test(h) ? text.match(/^(.*\S)\s*\/\s*[A-Z]{1,5}-?\d{1,3}[A-Z]?\s*$/i) : null;
        const v = valve ? valve[1].trim() : text.trim();
        // A pointer ("REFER TO PLANS", "SEE NOTE 2", "TBD") names no place.
        if (v && !PLACE_POINTER.test(v)) found.push({ attr: "area_served", col, value: v, printed: text, rule: "text.area_served", rank: 0 });
        break;
      }
      case "service": {
        if (!col.cell) break;
        const system = /^SYSTEM\b/.test(h);
        if (ctx.attrs.has("service")) {
          // SERVICE names the unit's duty, as printed ("RESTROOMS" exhaust,
          // "PRIMARY HW"); SYSTEM the system it belongs to ("WHSE-AHU-1").
          // SERVING names what it serves: a system or medium ("110° F
          // RETURN") is its service, a room, an area or another unit
          // ("RESTROOMS", "KH-1") the area it serves.
          if (/\bSERVING$/.test(h) && servedPlace(text)) {
            if (ctx.attrs.has("area_served")) found.push({ attr: "area_served", col, value: text.trim(), printed: text, rule: "text.served_place", rank: 2 });
            break;
          }
          found.push({ attr: "service", col, value: text.trim(), printed: text, rule: "text.service", rank: /^SYSTEM$/.test(h) ? 1 : 0 });
          break;
        }
        // A family with no service attribute prints the area it serves under
        // SERVICE / SERVING (never under SYSTEM); an AREA SERVED column
        // outranks it. A cell naming a system ("BUILDING B OUTSIDE AIR") is
        // not only an area.
        // A coil's SERVICE naming units only ("ACU-A-1") is the unit it sits in.
        if (!system && ctx.attrs.has("area_served") && !SYSTEM_WORDS.test(text.toUpperCase())
          && !(ctx.family === "DUCT_MOUNTED_COIL" && tagsOnly(text))) found.push({ attr: "area_served", col, value: text.trim(), printed: text, rule: "text.service_as_area", rank: 2 });
        break;
      }
      case "location": {
        if (!col.cell || !ctx.attrs.has("floor")) break;
        const level = levelOf(text);
        if (level) found.push({ attr: "floor", col, value: level, printed: text, rule: "text.location_level", rank: 0 });
        break;
      }
      case "drive": {
        if (!col.cell || !ctx.attrs.has("drive")) break;
        const t = text.toUpperCase().trim();
        const marked = /^(?:YES|Y|X)$/.test(t);
        const v = /^(?:DIRECT|DD|DIRECT\s+DRIVE|DIR)$/.test(t) ? "direct" : /^(?:BELT|BD|BELT\s+DRIVE)$/.test(t) ? "belt"
          : marked && /\bDIRECT\b/.test(h) && !/\bBELT\b/.test(h) ? "direct" : marked && /\bBELT\b/.test(h) && !/\bDIRECT\b/.test(h) ? "belt" : null;
        if (/^(?:NO|N)$/.test(t) && /\bDIRECT\b|\bBELT\b/.test(h)) break;
        if (v) found.push({ attr: "drive", col, value: v, printed: text, rule: marked ? "enum.drive_marked" : "enum.drive", rank: 0 });
        else failed.push({ attr: "drive", reason: `cell "${text}" is not DIRECT or BELT` });
        break;
      }
      case "fuel": {
        if (!col.cell || !ctx.attrs.has("fuel")) break;
        const t = text.toUpperCase().trim();
        const v = /^(?:NATURAL\s+GAS|GAS|NG|N\.G\.)$/.test(t) ? "gas" : /^(?:#?\d?\s*(?:FUEL\s+)?OIL)$/.test(t) ? "oil" : /^(?:PROPANE|LP|LPG)$/.test(t) ? "propane"
          : /^ELECTRIC$/.test(t) ? "electric" : /^DUAL(?:\s+FUEL)?$/.test(t) ? "dual_fuel" : null;
        if (v) found.push({ attr: "fuel", col, value: v, printed: text, rule: "enum.fuel", rank: 0 });
        else failed.push({ attr: "fuel", reason: `cell "${text}" names no fuel` });
        break;
      }
      case "vfd": {
        if (!col.cell || !ctx.attrs.has("vfd")) break;
        const t = text.toUpperCase().trim();
        const v = /^(?:YES|Y|X|VFD|VARIABLE\s+FREQUENCY\s+DRIVE)$/.test(t) ? "yes" : /^(?:NO|N)$/.test(t) ? "no" : null;
        if (v) found.push({ attr: "vfd", col, value: v, printed: text, rule: "enum.vfd", rank: 0 });
        else failed.push({ attr: "vfd", reason: `cell "${text}" is not yes or no` });
        break;
      }
      case "reheat_kind": {
        if (!col.cell || !ctx.attrs.has("heat_type") || !/^(?:YES|Y|X)$/i.test(text.trim())) break;
        const kind = h.replace(/^REHEAT\s+/, "");
        const v = /^(?:HW|HOT\s+WATER)$/.test(kind) ? "hw" : /^ELEC/.test(kind) ? "electric" : kind === "STEAM" ? "steam" : kind === "NONE" ? "none" : null;
        if (v) found.push({ attr: "heat_type", col, value: v, printed: text, rule: "enum.reheat_marked", rank: 0 });
        break;
      }
      case "bas_protocol": {
        if (!col.cell || !ctx.attrs.has("bas_interface") || !/^(?:YES|Y|X)$/i.test(text.trim())) break;
        const v = /\bBACNET\b/.test(h) ? "BACNET" : /\bLONWORKS\b/.test(h) ? "LONWORKS" : "MODBUS";
        found.push({ attr: "bas_interface", col, value: v, printed: text, rule: "text.bas_protocol_marked", rank: 0 });
        break;
      }
      case "ecm": {
        if (!col.cell || !ctx.attrs.has("ecm")) break;
        const t = text.toUpperCase().trim();
        const v = /^(?:YES|Y|X|ECM?)$/.test(t) ? "yes" : /^(?:NO|N)$/.test(t) ? "no" : null;
        if (v) found.push({ attr: "ecm", col, value: v, printed: text, rule: "enum.ecm", rank: 0 });
        break;
      }
      case "control": {
        // A cell citing notes ("1, 2, 5, 6", "SEE NOTE 3") names no control.
        if (!col.cell || citedNoteIds(text) !== null || !/[A-Z]{2}/i.test(text)) break;
        const t = text.toUpperCase().trim();
        if (!ctx.attrs.has("control") && ctx.attrs.has("vfd") && /^(?:CONSTANT(?:\s+(?:SPEED|VOLUME))?|C\.?V\.?|NONE)$/.test(t)) {
          // Constant speed: a motor with no variable frequency drive.
          found.push({ attr: "vfd", col, value: "no", printed: text, rule: "enum.vfd_constant_speed", rank: 1 });
          break;
        }
        // "3-SPEED", or a SPEED CONTROL's "3-STAGE": the fan's speeds.
        const speeds = t.match(/^(\d)\s*-?\s*SPEED$/) ?? (/\bSPEED\s+CONTROL\b/.test(h) ? t.match(/^(\d)\s*-?\s*STAGE$/) : null);
        if (speeds && ctx.attrs.has("fan_speeds")) { found.push({ attr: "fan_speeds", col, value: Number(speeds[1]), printed: text, rule: "count.fan_speeds", rank: 0 }); break; }
        if (ctx.attrs.has("control")) { found.push({ attr: "control", col, value: text.trim(), printed: text, rule: "text.control", rank: 0 }); break; }
        // A family with no control attribute (a pump) keeps only what the cell
        // says about a drive: "VFD" printed is a VFD.
        if (ctx.attrs.has("vfd") && /^(?:VFD|VSD|VARIABLE\s+(?:FREQUENCY|SPEED)\s+DRIVE)$/.test(t)) found.push({ attr: "vfd", col, value: "yes", printed: text, rule: "enum.vfd_speed_control", rank: 1 });
        break;
      }
      case "economizer": {
        if (!col.cell || !ctx.attrs.has("economizer")) break;
        const t = text.toUpperCase().trim();
        const v = /\bWATER\s*-?\s*SIDE\b/.test(t) ? "waterside"
          : /^(?:NO|NONE|N\/?A)$/.test(t) ? "none"
          : /^(?:YES|Y|X|AIR\s*-?\s*SIDE|DRY\s*-?\s*BULB|(?:(?:DIFFERENTIAL|COMPARATIVE|SINGLE|DUAL)\s+)?ENTHALPY)$/.test(t) ? "airside" : null;
        if (v) found.push({ attr: "economizer", col, value: v, printed: text, rule: "enum.economizer", rank: 0 });
        // An economizer's louver, damper or airflow scheduled with a size
        // ("ECONOMIZER LOUVER AIRFLOW (CFM)" = 35,000): an airside economizer.
        else if (/\bLOUVERS?\b|\bDAMPERS?\b|\bAIR\s?FLOW\b|\bCFM\b|\bSECTION\b/.test(h) && !/\bWATER\b/.test(h) && (parseNumberCell(text)?.n ?? 0) > 0) {
          found.push({ attr: "economizer", col, value: "airside", printed: text, rule: "enum.economizer_air_section", rank: 1 });
        }
        else failed.push({ attr: "economizer", reason: `cell "${text}" names no economizer` });
        break;
      }
      case "humidifier":
      case "energy_recovery": {
        if (!col.cell) break;
        const attr = q === "humidifier" ? "humidifier" : "energy_recovery";
        if (!ctx.attrs.has(attr)) break;
        const t = text.toUpperCase().trim();
        // A printed "N/A" or "NONE" says there is none; a tag, a size or a
        // value says there is one. What the cell is must be one or the other.
        const none = /^(?:N\/?A|NONE|NO|-+)$/.test(t);
        if (attr === "humidifier") {
          found.push({ attr, col, value: none ? "no" : "yes", printed: text, rule: none ? "enum.humidifier_none" : "enum.humidifier_scheduled", rank: 1 });
          break;
        }
        const named = /\bWHEEL\b/.test(t) || /\bWHEEL\b/.test(h) ? "wheel" : /\bPLATE\b/.test(t) ? "plate" : /\bHEAT\s+PIPE\b/.test(t) ? "heat_pipe" : /\bRUN\s*-?\s*AROUND\b/.test(t) ? "runaround" : null;
        if (none) found.push({ attr, col, value: "none", printed: text, rule: "enum.energy_recovery_none", rank: 1 });
        else if (named) found.push({ attr, col, value: named, printed: text, rule: "enum.energy_recovery", rank: 0 });
        // A HEAT RECOVERY COIL scheduled in the unit (a water or glycol coil of
        // a coil loop): a runaround loop; never a refrigerant circuit's coil.
        else if (/\bRECOVERY\s+COILS?\b|\bRUN\s*-?\s*AROUND\b/.test(h) && !/\bHOT\s+GAS\b|\bHGRH\b/.test(h) && !W.dx.test(h)) {
          found.push({ attr, col, value: "runaround", printed: text, rule: "enum.energy_recovery_coil", rank: 1 });
        }
        break;
      }
      case "type": {
        if (!col.cell) break;
        const t = text.toUpperCase().trim();
        if (ctx.attrs.has("hx_type")) {
          const v = /\bPLATE\b/.test(t) ? "plate" : /\bSHELL\b.*\bTUBE\b|\bU-?TUBE\b/.test(t) ? "shell_and_tube" : null;
          if (v) found.push({ attr: "hx_type", col, value: v, printed: text, rule: "enum.hx_type", rank: 0 });
        }
        if (ctx.attrs.has("condenser")) {
          const v = /\bAIR\s*-?\s*COOLED\b/.test(t) ? "air" : /\bWATER\s*-?\s*COOLED\b/.test(t) ? "water" : null;
          if (v) found.push({ attr: "condenser", col, value: v, printed: text, rule: "enum.condenser", rank: 0 });
        }
        if (ctx.attrs.has("terminal_type")) {
          const v = terminalTypeOf(t);
          if (v) found.push({ attr: "terminal_type", col, value: v, printed: text, rule: "enum.terminal_type", rank: 0 });
        }
        // A heater's TYPE naming its medium ("CEILING ELECTRIC HEATER").
        if (ctx.attrs.has("heating_medium")) {
          const v = /\bELEC(?:TRIC)?\b/.test(t) ? "electric" : /\bSTEAM\b/.test(t) ? "steam" : /\bGAS\b/.test(t) ? "gas" : /\bHOT\s+WATER\b|\bHYDRONIC\b/.test(t) ? "hw" : null;
          if (v) found.push({ attr: "heating_medium", col, value: v, printed: text, rule: "enum.heating_medium_type", rank: 0 });
        }
        break;
      }
      case "controller": {
        // A duplex's starter that alternates its pumps ("AUTOMATIC W/LEAD LAG").
        const paired = col.cell && ctx.attrs.has("pump_arrangement") ? pairedArrangement(text.toUpperCase().replace(/\s+/g, " ")) : null;
        if (paired) found.push({ attr: "pump_arrangement", col, value: paired, printed: text, rule: "enum.pump_arrangement_starter", rank: 1 });
        // A CONTROLLER / STARTER (TYPE) column names the one device the motor
        // is started or run by, so the one it names rules the others out.
        if (!col.cell) break;
        // A code the header's cited note defines reads as its meaning
        // ("FV" under "… TYPE (NOTE C)", C: "FV = FULL VOLTAGE").
        // Who furnishes it, after the device ("ECM - FAN MFR", "VFD (BY EC)"),
        // is not the device.
        const whole = text.toUpperCase().replace(/\s+/g, " ").trim();
        const printed = whole.replace(FURNISHED_BY, "").trim() || whole;
        const t = (ctx.codes[col.header]?.[whole] ?? ctx.codes[col.header]?.[printed] ?? printed).toUpperCase().replace(/\s+/g, " ").trim();
        const kind = /^(?:VFD|VSD|VARIABLE\s+(?:FREQUENCY|SPEED)\s+DRIVE)(?:\s*(?:\/\s*B|WITH\s+BYPASS))?$/.test(t) ? "vfd"
          : /^(?:ECM?|EC\s+(?:MOTOR\s+)?CONTROLLER|ECM\s+CONTROLLER|ELECTRONICALLY\s+COMMUTATED(?:\s+MOTOR)?)$/.test(t) ? "ecm"
          : /^(?:(?:COMBINATION\s+|MAGNETIC\s+|MANUAL\s+|MOTOR\s+)?STARTER|MAG\.?\s+STARTER|FVNR|ACROSS\s+THE\s+LINE|FULL\s+VOLTAGE(?:\s+NON-?\s?REVERSING)?(?:\s+STARTER)?|WYE-?\s?DELTA|SOLID\s+STATE(?:\s+\(?SOFT\s+START\)?)?|SOFT\s+START(?:ER)?)$/.test(t) ? "starter" : null;
        if (!kind) break;
        if (ctx.attrs.has("vfd")) found.push({ attr: "vfd", col, value: kind === "vfd" ? "yes" : "no", printed: text, rule: "enum.controller_type", rank: 0 });
        if (ctx.attrs.has("ecm")) found.push({ attr: "ecm", col, value: kind === "ecm" ? "yes" : "no", printed: text, rule: "enum.controller_type", rank: 0 });
        break;
      }
      case "arrangement": {
        // A cell that is exactly a pump arrangement ("DUTY/STANDBY", "LEAD/LAG").
        if (!col.cell || !ctx.attrs.has("pump_arrangement")) break;
        const t = text.toUpperCase().replace(/\s+/g, " ").trim();
        const v = /^DUTY\s*\/\s*STAND-?\s?BY$/.test(t) ? "duty_standby" : /^LEAD\s*\/\s*LAG$/.test(t) ? "lead_lag"
          : /^PARALLEL$/.test(t) ? "parallel" : /^STAND-?\s?BY$/.test(t) ? "standby" : /^DUTY$/.test(t) ? "duty" : pairedArrangement(t);
        if (v) found.push({ attr: "pump_arrangement", col, value: v, printed: text, rule: "enum.pump_arrangement", rank: 0 });
        break;
      }
      case "cells": {
        if (!col.cell || !ctx.attrs.has("cells")) break;
        const p = parseNumberCell(text);
        if (p && Number.isInteger(p.n) && p.n >= 1 && p.n <= 50 && !p.words) found.push({ attr: "cells", col, value: p.n, printed: text, rule: "count.cells", rank: 0 });
        else failed.push({ attr: "cells", reason: `cell "${text}" is not a count` });
        break;
      }
      case "fluid":
      case "glycol": {
        if (!col.cell) break;
        const s = waterService(col, ctx);
        // A heat exchanger side's FLUID names that side's medium ("CHW"; a
        // process loop's "PCW", a medium the list does not name).
        if (ctx.family === "HEAT_EXCHANGER" && q === "fluid" && (s === "primary" || s === "secondary")) {
          const attr = s === "primary" ? "primary_medium" : "secondary_medium";
          const medium = fluidMedium(text);
          if (medium && ctx.attrs.has(attr)) found.push({ attr, col, value: medium, printed: text, rule: "enum.hx_side_fluid", rank: 0 });
          break;
        }
        const attr = s === "hw" ? pick(ctx, "hw_glycol_pct", "glycol_pct") : s === "chw" ? pick(ctx, "chw_glycol_pct", "glycol_pct") : pick(ctx, "glycol_pct");
        if (!attr) break;
        const t = text.toUpperCase().trim();
        // Plain water, at its temperature or not ("WATER @ 120°F").
        if (q === "fluid" && /^WATER(?:\s*(?:@|AT)\s*\d{2,3}(?:\.\d+)?\s*°?\s*F?)?$/.test(t)) { found.push({ attr, col, value: 0, printed: text, rule: "fluid.water", rank: 0 }); break; }
        // One glycol share, wherever the cell prints it ("30% PG", "WATER 30%PG").
        const shares = [...t.matchAll(/(?:^|[^\d.])(\d{1,2})\s*%\s*(?:PG|EG|P\.G\.|E\.G\.|PROPYLENE|ETHYLENE|GLYCOL)\b/g)];
        const m = shares.length === 1 ? shares[0] : null;
        if (m) found.push({ attr, col, value: Number(m[1]), printed: text, rule: "fluid.glycol", rank: 0 });
        else failed.push({ attr, reason: `cell "${text}" names no glycol percentage` });
        break;
      }
      case "hp_qty": {
        if (!col.cell) break;
        const parts = text.split(/[/\\]/).map((p) => p.trim());
        const hp = parts.length === 2 ? parseNumberCell(parts[0]) : null;
        const n = parts.length === 2 ? parseNumberCell(parts[1]) : null;
        // "1/2" could be half a horsepower: a split needs a part a fraction cannot be.
        if (!hp || !n || !Number.isInteger(n.n) || (properFraction(parts[0], parts[1]) && /^\d+$/.test(parts[0]))) {
          failed.push({ attr: pick(ctx, "supply_fan_hp", "motor_hp") ?? "motor_hp", reason: `cell "${text}" is not HP/QTY` });
          break;
        }
        const hpAttr = AIR_HANDLERS.has(ctx.family) ? pick(ctx, "supply_fan_hp") : pick(ctx, "motor_hp");
        const qtyAttr = AIR_HANDLERS.has(ctx.family) ? pick(ctx, "supply_fan_qty") : pick(ctx, "qty");
        if (hpAttr) found.push({ attr: hpAttr, col, value: hp.n, printed: text, rule: "power.hp_qty", rank: 0 });
        if (qtyAttr) found.push({ attr: qtyAttr, col, value: n.n, printed: text, rule: "count.hp_qty", rank: 0 });
        break;
      }
      case "oa_pct": {
        if (!col.cell || !ctx.attrs.has("outdoor_air_pct")) break;
        const p = parseNumberCell(text);
        if (p && (p.unit === "%" || !p.words) && p.n >= 0 && p.n <= 100) found.push({ attr: "outdoor_air_pct", col, value: p.n, printed: text, rule: "percent.outdoor_air", rank: 0 });
        else failed.push({ attr: "outdoor_air_pct", reason: `cell "${text}" is not one percentage` });
        break;
      }
      case "motor_type": {
        // A MOTOR TYPE naming an EC motor, or a motor that is not one.
        if (!col.cell || !ctx.attrs.has("ecm")) break;
        const v = motorTypeOf(text);
        if (v) found.push({ attr: "ecm", col, value: v, printed: text, rule: "enum.motor_type", rank: 0 });
        break;
      }
      case "floors": {
        // The floors a unit is on: one level ("2", "LEVEL 5") is its floor;
        // several ("3-4, 6-34", "35-61") are not one value.
        if (!col.cell || !ctx.attrs.has("floor")) break;
        const t = text.toUpperCase().replace(/\s+/g, " ").trim();
        const bare = t.match(/^(\d{1,3})$/);
        const level = bare ? `LEVEL ${Number(bare[1])}` : levelOf(t);
        if (level && !/[,&]|\d\s*-\s*\d|\bTHRU\b|\bTO\b/.test(t)) found.push({ attr: "floor", col, value: level, printed: text, rule: "text.floors_one_level", rank: 0 });
        else failed.push({ attr: "floor", reason: `cell "${text}" is not one level` });
        break;
      }
      case "plates": {
        // A plate count is a plate exchanger's.
        if (!col.cell || !ctx.attrs.has("hx_type") || !/^\d+$/.test(text.trim())) break;
        found.push({ attr: "hx_type", col, value: "plate", printed: text, rule: "enum.hx_type_plate_count", rank: 1 });
        break;
      }
      case "space": {
        // A zone unit's SPACE / ROOM NAME: the space it serves (below an AREA
        // SERVED column the table also prints).
        if (!col.cell || !ctx.attrs.has("area_served") || !ZONE_UNITS.has(ctx.family)) break;
        const v = text.trim();
        if (v && !PLACE_POINTER.test(v)) found.push({ attr: "area_served", col, value: v, printed: text, rule: "text.space_served", rank: 1 });
        break;
      }
      case "heat_kind": {
        // What heats the unit, by name: its heating type, a terminal's reheat,
        // a heater's medium, as far as each attribute's values go.
        if (!col.cell) break;
        const kind = heatKindOf(text);
        if (!kind) break;
        const attr = ctx.attrs.has("heating_type") ? "heating_type"
          : ctx.attrs.has("heat_type") && ["hw", "electric", "steam", "none"].includes(kind) ? "heat_type"
          : ctx.attrs.has("heating_medium") && ["hw", "steam", "electric", "gas"].includes(kind) ? "heating_medium" : null;
        if (attr) found.push({ attr, col, value: kind, printed: text, rule: "enum.heating_type_named", rank: 0 });
        break;
      }
      case "description": {
        // A terminal's DESCRIPTION naming its type ("DIGITAL SINGLE DUCT
        // TERMINAL"), below a TYPE column.
        if (!col.cell || !ctx.attrs.has("terminal_type")) break;
        const v = terminalTypeOf(text.toUpperCase());
        if (v) found.push({ attr: "terminal_type", col, value: v, printed: text, rule: "enum.terminal_type_description", rank: 1 });
        break;
      }
      case "unit_size": {
        // A single-duct terminal's size number is its nominal inlet diameter
        // in inches ("04", "10"; a rectangular inlet "24x16"). A fan-powered
        // box's size is a cabinet code, never its inlet.
        if (!col.cell || ctx.family !== "VAV" || !ctx.attrs.has("inlet_size_in") || rowTerminalType(ctx) !== "single_duct") break;
        const v = parseSizeCell(text);
        const sides = v === null ? [] : v.split("x").map(Number);
        const ok = v !== null && (sides.length === 2 ? sides.every((d) => d >= 3 && d <= 40) : Number.isInteger(sides[0]) && sides[0] >= 4 && sides[0] <= 24);
        if (ok) found.push({ attr: "inlet_size_in", col, value: v!, printed: text, rule: "size.single_duct_unit_size", rank: 1 });
        break;
      }
      case "poles": {
        // A circuit's poles: 1 (120 or 277 V) or 2 (208 or 240 V) is a single
        // phase supply, 3 a three-phase one; below a PHASE column.
        if (!col.cell || !ctx.attrs.has("phase")) break;
        const m = text.trim().match(/^([123])\s*(?:P|POLES?)?$/i);
        if (m) found.push({ attr: "phase", col, value: m[1] === "3" ? 3 : 1, printed: text, rule: "electrical.poles", rank: electricalRank(h, ctx) + 1 });
        break;
      }
      case "heat_watts": {
        if (W.motor.test(h) || W.fanWord.test(h)) break;
        num(pick(ctx, "eh_kw"), "watts", "power.electric_heat_watts");
        break;
      }
      case "interlock": {
        // "INTERLOCK WITH" printing what the unit runs with ("MOTORIZED
        // DAMPER"): how it is controlled, below a CONTROL column.
        if (!col.cell || !ctx.attrs.has("control") || NONE_MARK.test(text.trim()) || citedNoteIds(text) !== null || !/[A-Z]{2}/i.test(text)) break;
        found.push({ attr: "control", col, value: `INTERLOCK WITH ${text.trim().replace(/\s+/g, " ")}`, printed: text, rule: "text.interlock_with", rank: 1 });
        break;
      }
      case "disconnect": {
        // The unit's disconnecting means is its drive ("VFD" under LOCAL
        // DISCONNECT SWITCH; "BREAKER IN VFD"): the unit runs on a VFD.
        if (!col.cell || !ctx.attrs.has("vfd")) break;
        const t = text.toUpperCase().replace(/\s+/g, " ").trim();
        if (/^(?:VFD|VSD|VARIABLE\s+FREQUENCY\s+DRIVE)\b/.test(t) || /\b(?:IN|INTEGRAL\s+(?:TO|WITH))\s+(?:THE\s+)?VFD\b/.test(t)) {
          found.push({ attr: "vfd", col, value: "yes", printed: text, rule: "enum.vfd_disconnect", rank: 1 });
        }
        break;
      }
      default:
        break;
    }
  }
  return { found, failed };
}

/** The medium a heat exchanger side's FLUID cell names, in the medium list's
 * words; a process loop ("PCW", PROCESS COOLING WATER) is one the list does
 * not name. Null for anything else ("WATER" alone names no loop). */
function fluidMedium(text: string): string | null {
  const t = String(text ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (/^(?:CHW|CHWS|CHILLED\s+WATER)$/.test(t)) return "chw";
  if (/^(?:HW|HHW|HWS|HOT\s+WATER|HEATING\s+(?:HOT\s+)?WATER)$/.test(t)) return "hw";
  if (/^(?:LP|MP|HP)?\s*STEAM$/.test(t)) return "steam";
  if (/^(?:CDW|CONDENSER\s+WATER)$/.test(t)) return "condenser_water";
  if (/^\d{1,2}\s*%\s*(?:PG|EG|PROPYLENE\s+GLYCOL|ETHYLENE\s+GLYCOL)$|^GLYCOL$/.test(t)) return "glycol";
  if (/^(?:PCW|PROCESS(?:\s+COOLING)?\s+WATER)$/.test(t)) return "other";
  return null;
}

/** LEAD/LAG or DUTY/STANDBY printed within a longer cell ("AUTOMATIC
 * W/LEAD LAG"): the pumps' paired operation. */
function pairedArrangement(t: string): string | null {
  if (/\bLEAD\s*[/-]?\s*LAG\b/.test(t)) return "lead_lag";
  if (/\bDUTY\s*[/-]\s*STAND-?\s?BY\b/.test(t)) return "duty_standby";
  return null;
}

/** Rank of a V/PH or VOLTS column: the one naming the family's own part of
 * a split system (the outdoor unit for a condensing unit, the indoor fan for
 * a fan coil) first. */
function electricalRank(h: string, ctx: RowContext): number {
  const outdoor = /\bOUTDOOR\b|\bCONDENSING\b|\bCONDENSER\b|\bCU\b/.test(h);
  const indoor = /\bINDOOR\b|\bSUPPLY\s+FAN\b|\bFAN\s+DATA\b|\bEVAPORATOR\b/.test(h);
  if (ctx.family === "CONDENSING_UNIT" || ctx.family === "VRF_OUTDOOR") return outdoor ? 0 : indoor ? 3 : 1;
  // A heater's power connection over its fan motor's (an electric unit
  // heater's elements at 460/3, its fan at 120/1); for a fan or a pump the
  // motor is the unit.
  if (!["FAN", "PUMP"].includes(ctx.family) && !indoor) {
    if (/\bPOWER\b|\bUNIT\b/.test(h) && !/\bMOTOR\b/.test(h)) return 0;
    if (/\bMOTOR\b|\bFAN\b/.test(h)) return 2;
  }
  return indoor ? 0 : outdoor ? 3 : 1;
}

/** The heat a HEATING TYPE cell names, in heating_type's words; null for a
 * cell naming none of them. */
function heatKindOf(text: string): string | null {
  const t = String(text ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (/^(?:NAT(?:URAL)?\.?\s*GAS|N\.?\s?G\.?|GAS(?:\s*-?\s*FIRED)?|PROPANE|LPG?)$/.test(t)) return "gas";
  if (/^(?:ELEC(?:TRIC)?\.?(?:\s+(?:HEAT|RESISTANCE|STRIPS?))?)$/.test(t)) return "electric";
  if (/^(?:H?HW|HOT\s+WATER|HYDRONIC|HEATING\s+(?:HOT\s+)?WATER)$/.test(t)) return "hw";
  if (/^(?:(?:LP|MP|HP|LOW\s+PRESSURE)\s+)?STEAM$/.test(t)) return "steam";
  if (/^HEAT\s+PUMP$/.test(t)) return "heat_pump";
  if (/^(?:NONE|N\/?A)$/.test(t)) return "none";
  return null;
}

/** The terminal type the row's table names: its title, else the row's own
 * TYPE or DESCRIPTION cell. */
function rowTerminalType(ctx: RowContext): string | null {
  const titled = terminalTypeOf(headerText(ctx.title));
  if (titled) return titled;
  const col = ctx.cols.find((c) => c.cell && quantitiesOf(c.h).some((q) => q === "type" || q === "description") && terminalTypeOf(c.cell.text.toUpperCase()));
  return col ? terminalTypeOf(col.cell!.text.toUpperCase()) : null;
}

/** Whether a motor type cell names an EC motor ("ECM", "MODULATING ECM")
 * or a motor that is not one ("PSC", "SHADED POLE"); null for anything
 * else. A speed qualifier before it names how the motor runs, not its kind. */
function motorTypeOf(text: string): "yes" | "no" | null {
  const t = String(text ?? "").toUpperCase().replace(/\s+/g, " ").trim()
    .replace(/^(?:MODULATING|VARIABLE[-\s]SPEED|VARIABLE|MULTI[-\s]SPEED|\d[-\s]SPEED|CONSTANT[-\s](?:TORQUE|AIRFLOW|VOLUME))\s+/, "");
  if (/^(?:ECM?|EC\s+MOTOR|ELECTRONICALLY\s+COMMUTATED(?:\s+MOTOR)?)$/.test(t)) return "yes";
  if (/^(?:PSC|PERMANENT\s+SPLIT\s+CAPACITOR|SHADED\s+POLE|SPLIT\s+PHASE)$/.test(t)) return "no";
  return null;
}

/** A terminal unit's type, where the words print it. */
function terminalTypeOf(t: string): string | null {
  if (/\bDUAL\s*-?\s*DUCT\b/.test(t)) return "dual_duct";
  // An exhaust terminal ("SINGLE DUCT CAV EXHAUST TERMINAL"), of whatever
  // construction; never a table of supply and exhaust boxes together.
  if (/\bEXHAUST\b/.test(t) && !/\bSUPPLY\b|\bRETURN\b/.test(t)) return "exhaust";
  if (/\bFAN\s*-?\s*POWERED\b|\bFPB\b|\bFPTU\b/.test(t)) {
    if (/\bSERIES\b/.test(t)) return "fan_powered_series";
    if (/\bPARALLEL\b/.test(t)) return "fan_powered_parallel";
    return null;
  }
  if (/\bSINGLE\s*-?\s*DUCT\b/.test(t)) return "single_duct";
  if (/\bCHILLED\s+BEAMS?\b/.test(t)) return "chilled_beam";
  if (/\bINDUCTION\b/.test(t)) return "induction";
  return null;
}

/** A LOCATION cell names a level only in these words; a room or area is not
 * a floor. The level is returned in the key's spelling: a numbered level as
 * "LEVEL 1", a mezzanine in the word printed ("MEZZ" or "MEZZANINE";
 * key-work/README.md's level words). */
function levelOf(text: string): string | null {
  const t = String(text ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (/\bROOF(?:TOP)?\b/.test(t)) return "ROOF";
  if (/\bBASEMENT\b/.test(t)) return "BASEMENT";
  if (/\bPENTHOUSE\b/.test(t)) return "PENTHOUSE";
  if (/\bATTIC\b/.test(t)) return "ATTIC";
  const mezz = t.match(/\bMEZZ(?:ANINE)?\b/);
  if (mezz) return mezz[0];
  const m = t.match(/\bLEVEL\s*-?\s*(\d+)\b/) ?? t.match(/\bFLOOR\s*-?\s*(\d+)\b/);
  if (m) return `LEVEL ${Number(m[1])}`;
  const o = t.match(/\b(\d+)(?:ST|ND|RD|TH)\s+FLOOR\b/);
  if (o) return `LEVEL ${Number(o[1])}`;
  return null;
}

// ── 6. Derived attributes (the row's structure) ─────────────────────────────

/** Enumerations a row answers by what it prints rather than by one cell:
 * a hot-water coil block with values is a hot-water heat source; an
 * electric heater's kW is electric heat; the title names a heater's medium. */
function derived(item: CompileItem, ctx: RowContext, values: Map<string, Candidate>): Candidate[] {
  const out: Candidate[] = [];
  const title = headerText(ctx.title);
  const titleCol: Column = { header: "(table title)", h: title, cell: { text: item.table_title, bbox: null }, order: -1 };
  // A coil block's water columns; its water pressure drop is one of them (a
  // HEATING COIL printing FLOW RATE (GPM) and WATER SIDE PRESS. DROP).
  const hwCols = ["hw_gpm", "hw_ewt_f", "hw_lwt_f", "hw_mbh", "hw_wpd_ft"].map((a) => values.get(a)).filter((c): c is Candidate => Boolean(c));
  const chwCols = ["chw_gpm", "chw_ewt_f", "chw_lwt_f", "chw_wpd_ft"].map((a) => values.get(a)).filter((c): c is Candidate => Boolean(c));
  const ehCol = values.get("eh_kw");
  // A hot-water coil block (two or more of its water columns) that prints
  // EXISTING in every cell: the coil is there, its data not rescheduled.
  const existingHw = (() => {
    const block = ctx.cols.filter((c) => W.hw.test(c.h) && !W.chw.test(c.h) && quantitiesOf(c.h).some((q) => q === "waterflow" || q === "ewt" || q === "lwt" || q === "ewt_lwt"));
    return block.length >= 2 && block.every((c) => c.cell && /^(?:\(\s*E\s*\)|EXIST(?:ING)?)$/i.test(c.cell.text.trim())) ? block[0] : null;
  })();
  const heatSource = (): { value: string; col: Column; rule: string } | null => {
    // Two values of a hot-water block; for a unit that only heats, its water
    // flow alone (it heats with that water).
    const water = hwCols.length >= 2 ? hwCols[0] : HEATING_ONLY.has(ctx.family) && ctx.family !== "VAV" ? values.get("hw_gpm") ?? values.get("gpm") ?? null : null;
    if (water && !ehCol) return { value: "hw", col: water.col, rule: "derived.hw_coil_block" };
    if (ehCol && !water) return { value: "electric", col: ehCol.col, rule: "derived.electric_heat_kw" };
    if (existingHw && !ehCol) return { value: "hw", col: existingHw, rule: "derived.existing_hw_coil_block" };
    return null;
  };
  if (ctx.attrs.has("heat_type")) {
    const s = heatSource();
    if (s) out.push({ attr: "heat_type", col: s.col, value: s.value, printed: s.col.cell?.text ?? "", rule: s.rule, rank: 0 });
  }
  if (ctx.attrs.has("heating_medium")) {
    const s = heatSource();
    const named = /\bELECTRIC\b/.test(title) ? "electric" : /\bSTEAM\b/.test(title) ? "steam" : /\bGAS\b/.test(title) ? "gas" : /\bHOT\s+WATER\b|\bHW\b/.test(title) ? "hw" : null;
    // A GAS TYPE (or FUEL) column naming a gas ("NATURAL", "PROPANE"): a
    // gas-fired heater.
    const gasType = ctx.cols.find((c) => c.cell && /\bGAS\s+TYPE\b|^FUEL(?:\s+TYPE)?$/.test(c.h)
      && /^(?:NAT(?:URAL)?(?:\s+GAS)?|N\.?G\.?|PROPANE|LPG?|GAS)$/i.test(c.cell.text.trim()));
    if (named && (!s || s.value === named)) out.push({ attr: "heating_medium", col: titleCol, value: named, printed: item.table_title, rule: "derived.title_names_medium", rank: 0 });
    else if (!named && s) out.push({ attr: "heating_medium", col: s.col, value: s.value, printed: s.col.cell?.text ?? "", rule: s.rule, rank: 0 });
    else if (!named && gasType) out.push({ attr: "heating_medium", col: gasType, value: "gas", printed: gasType.cell!.text, rule: "derived.gas_type_column", rank: 0 });
  }
  // A coil the row names by its medium and tag ("COIL DATA COOLING CHW TAG"
  // = "CHWC"): the unit has that coil; its data is in the coil's own schedule.
  const namedCoil = (medium: RegExp) => ctx.cols.find((c) => c.cell && /\bCOILS?\b/.test(c.h) && medium.test(c.h)
    && !/^(?:[-–—]+|N\/?A|NONE)$/i.test(c.cell.text.trim()));
  const chwCoil = namedCoil(/\bCHW\b|\bCHILLED\s+WATER\b/);
  const hwCoil = namedCoil(/\bHW\b|\bHHW\b|\bHOT\s+WATER\b/);
  // A split system or a packaged air conditioner cools with refrigerant.
  const dxTitle = W.dx.test(title) || /\bSPLIT\b/.test(title) || /\bPACKAGED\b.*\bAIR[-\s]+CONDITION(?:ING|ER)\b/.test(title);
  if (ctx.attrs.has("cooling_type")) {
    // A DX block with a value (never a "-" or N/A: the unit has no such coil),
    // and never a DX HEAT RECOVERY coil (a refrigerant circuit's reheat).
    const dxHeader = ctx.cols.find((c) => W.dx.test(c.h) && c.cell && !NONE_MARK.test(c.cell.text.trim()) && !/\bHEAT\s+RECOVERY\b/.test(c.h));
    // A hot gas reheat block with a value (HGRH LAT 90) takes the hot gas of
    // the unit's own refrigerant circuit: the unit cools with refrigerant.
    const hotGas = ctx.cols.find((c) => c.cell && /\bHGRH\b|\bHOT\s+GAS\s+RE-?\s?HEAT\b/.test(c.h) && !NONE_MARK.test(c.cell.text.trim())
      && !/^(?:NO|N)$/i.test(c.cell.text.trim()));
    // A cooling coil's water flow alone (COOLING COIL GPM) is a chilled-water
    // coil's too: a DX coil takes none. Never an evaporative cooler's water.
    const coilFlow = chwCols.length === 1 && chwCols[0].attr === "chw_gpm" && /\bCOILS?\b|\bCHW\b|\bCHILLED\b/.test(chwCols[0].col.h) && !/\bEVAP/.test(chwCols[0].col.h);
    if ((chwCols.length >= 2 || coilFlow) && !dxHeader && !dxTitle) out.push({ attr: "cooling_type", col: chwCols[0].col, value: "chw", printed: chwCols[0].printed, rule: coilFlow ? "derived.chw_coil_flow" : "derived.chw_coil_block", rank: 0 });
    else if (!chwCols.length && chwCoil && !dxHeader && !dxTitle) out.push({ attr: "cooling_type", col: chwCoil, value: "chw", printed: chwCoil.cell?.text ?? "", rule: "derived.chw_coil_named", rank: 0 });
    else if (!chwCols.length && !chwCoil && dxTitle) out.push({ attr: "cooling_type", col: titleCol, value: "dx", printed: item.table_title, rule: "derived.title_names_dx", rank: 0 });
    else if (!chwCols.length && !chwCoil && dxHeader) out.push({ attr: "cooling_type", col: dxHeader, value: "dx", printed: dxHeader.cell?.text ?? "", rule: "derived.dx_block", rank: 0 });
    else if (!chwCols.length && !chwCoil && hotGas) out.push({ attr: "cooling_type", col: hotGas, value: "dx", printed: hotGas.cell!.text, rule: "derived.hot_gas_reheat", rank: 0 });
    else if (!chwCols.length && !chwCoil) {
      // A SEER or EER rating is a refrigerant (DX) system's; a chilled-water
      // coil has none.
      const rated = ctx.cols.find((c) => c.cell && /\b(?:I?EER2?|SEER2?)\b/.test(c.h) && parseNumberCell(c.cell.text) !== null);
      // A packaged rooftop unit cools with its own refrigerant circuit: its
      // cooling capacity, where the row prints no water at all.
      const packaged = ctx.family === "RTU" && !ctx.hasWaterSide && !ctx.cols.some((c) => /\bCHW\b|\bCHILLED\b|\bWATER\b/.test(c.h))
        ? ctx.cols.find((c) => c.cell && quantitiesOf(c.h).some((qq) => qq === "capacity" || qq === "tons") && (W.chw.test(c.h) || capacityWords(c.h).cool || /\bTONS?\b/.test(c.h))
          && !capacityWords(c.h).sensible && parseNumberCell(c.cell.text) !== null)
        : undefined;
      if (rated) out.push({ attr: "cooling_type", col: rated, value: "dx", printed: rated.cell!.text, rule: "derived.efficiency_rating_dx", rank: 0 });
      else if (packaged) out.push({ attr: "cooling_type", col: packaged, value: "dx", printed: packaged.cell!.text, rule: "derived.packaged_rooftop_cooling", rank: 0 });
    }
  }
  // Enums the table's own title states in so many words.
  const titled = (attr: string, value: string | null, rule: string) => {
    if (value && ctx.attrs.has(attr) && !values.has(attr)) out.push({ attr, col: titleCol, value, printed: item.table_title, rule, rank: 0 });
  };
  titled("terminal_type", terminalTypeOf(title), "derived.title_names_terminal_type");
  // A fan coil table titled by its piping ("TWO-PIPE FAN COIL UNIT SCHEDULE");
  // never one of both kinds ("2 & 4 PIPE FAN COILS").
  const pipesTitled = title.match(/\b(TWO|FOUR|2|4)\s*-?\s*PIPE\b/);
  const bothPipes = /\b(?:TWO|FOUR|2|4)\s*(?:-?\s*PIPES?\s*)?(?:AND|OR|&|\/|,)\s*(?:TWO|FOUR|2|4)\s*-?\s*PIPES?\b/.test(title);
  if (pipesTitled && !bothPipes && ctx.attrs.has("pipes") && !values.has("pipes")) {
    out.push({ attr: "pipes", col: titleCol, value: ({ TWO: 2, FOUR: 4 } as Record<string, number>)[pipesTitled[1]] ?? Number(pipesTitled[1]), printed: item.table_title, rule: "derived.title_names_pipes", rank: 0 });
  }
  titled("condenser", /\bAIR\s*-?\s*COOLED\b/.test(title) ? "air" : /\bWATER\s*-?\s*COOLED\b/.test(title) ? "water" : null, "derived.title_names_condenser");
  titled("hx_type", /\bPLATE\b/.test(title) ? "plate" : /\bSHELL\s+(?:AND|&)\s+TUBE\b|\bU-?TUBE\b/.test(title) ? "shell_and_tube" : null, "derived.title_names_hx_type");
  // An exchanger between two airstreams (OUTSIDE AIR and EXHAUST AIR blocks,
  // no water or steam side): air on both sides, which the medium list does
  // not name.
  if (ctx.family === "HEAT_EXCHANGER") {
    const heads = ctx.cols.map((c) => c.h).join(" | ");
    const waterSide = ctx.cols.some((c) => quantitiesOf(c.h).some((qq) => qq === "waterflow" || qq === "ewt" || qq === "lwt" || qq === "ewt_lwt" || qq === "lbhr" || qq === "psig"));
    // The exhaust stream may print as EXHAUST ENTERING / LEAVING.
    if (!waterSide && /\b(?:OUTSIDE|OUTDOOR|SUPPLY)\s+AIR\b/.test(heads) && /\b(?:EXHAUST|RETURN|RELIEF)\s+(?:AIR|ENTERING|LEAVING)\b/.test(heads)) {
      titled("primary_medium", "other", "derived.air_to_air");
      titled("secondary_medium", "other", "derived.air_to_air");
    }
  }
  // Steam heating a side printing plain WATER, its leaving water warmer
  // than its entering: the load side is heating hot water (never where the
  // table names domestic or potable water).
  if (ctx.family === "HEAT_EXCHANGER" && values.get("primary_medium")?.value === "steam") {
    const water = ctx.cols.find((c) => c.cell && quantitiesOf(c.h).includes("fluid") && waterService(c, ctx) === "secondary" && /^WATER$/i.test(c.cell.text.trim()));
    const [e, l] = [values.get("secondary_ewt_f"), values.get("secondary_lwt_f")];
    const domestic = /\bDOMESTIC\b|\bPOTABLE\b|\bDHW\b|\bDCW\b/.test(`${title} ${ctx.cols.map((c) => `${c.h} ${c.cell?.text ?? ""}`).join(" ")}`.toUpperCase());
    if (water && e && l && Number(l.value) > Number(e.value) && !domestic && ctx.attrs.has("secondary_medium") && !values.has("secondary_medium")) {
      out.push({ attr: "secondary_medium", col: water, value: "hw", printed: water.cell!.text, rule: "derived.steam_heated_water", rank: 0 });
    }
  }
  if (/\bSTEAM\s+TO\s+(?:HOT\s+)?WATER\b/.test(title)) {
    // Steam heats the water it exchanges with: the load side is hot water.
    titled("primary_medium", "steam", "derived.title_names_steam_to_water");
    titled("secondary_medium", "hw", "derived.title_names_steam_to_water");
  }
  // A flue gas economizer ("FLUE GAS/FEEDWATER HEAT EXCHANGERS"): flue gas
  // heats boiler feedwater; neither is a medium the enum names.
  if (/\b(?:FLUE|EXHAUST)\s+GAS\b/.test(title)) {
    titled("primary_medium", "other", "derived.title_names_flue_gas");
    if (/\bFEED\s*-?\s*WATER\b/.test(title)) titled("secondary_medium", "other", "derived.title_names_feedwater");
  }
  // A gas-fired unit: a gas input or firing-rate column with a value.
  const gasInput = ctx.cols.find((c) => c.cell && W.gas.test(c.h) && (quantitiesOf(c.h).includes("capacity") || /\bCFH\b|\bFIRING\b/.test(c.h))
    && parseNumberCell(c.cell.text) !== null);
  if (ctx.attrs.has("heating_type")) {
    const gasCol = values.get("gas_input_mbh") ?? ctx.cols.map((c) => (W.gas.test(c.h) && c.cell && quantitiesOf(c.h).includes("capacity") ? c : null)).find(Boolean);
    const water = hwCols.length >= 2 ? hwCols[0] : null;
    const hw = water?.col ?? hwCoil ?? null;
    // An electric coil named auxiliary or back-up heat is not the unit's heat.
    const electric = ehCol && !/\bAUX(?:ILIARY)?\b|\bSUPPLEMENT(?:AL|ARY)\b|\bBACK\s*-?\s*UP\b|\bEMERGENCY\b/.test(ehCol.col.h) ? ehCol : null;
    // A steam coil block: the steam its coil takes (never a humidifier's).
    const steam = values.get("steam_lb_hr") ?? values.get("steam_psig") ?? null;
    const kinds = [hw && "hw", gasCol && "gas", electric && "electric", steam && "steam"].filter(Boolean);
    if (kinds.length === 1) {
      const col = hw ? hw : gasCol ? ("col" in gasCol ? gasCol.col : gasCol) : electric ? electric.col : steam!.col;
      out.push({ attr: "heating_type", col, value: kinds[0] as string, printed: col.cell?.text ?? "", rule: `derived.${kinds[0]}_heating_block`, rank: 0 });
    } else if (!kinds.length) {
      // A heating capacity rated at 47 °F outdoor (the heat pump's rating
      // point, "MAX MBH AT 47°F") is a heat pump's.
      const rated47 = ctx.cols.find((c) => c.cell && quantitiesOf(c.h).includes("capacity") && /\bHEAT(?:ING)?\b/.test(c.h)
        && /(?:\bAT\s*|@\s*)47\s*F?\b/.test(c.h) && parseNumberCell(c.cell.text) !== null);
      // A unit its type or title calls COOLING ONLY has no heat.
      const only = [titleCol, ...ctx.cols.filter((c) => c.cell && quantitiesOf(c.h).includes("type"))]
        .find((c) => /\bCOOLING\s+ONLY\b/i.test(c === titleCol ? item.table_title : c.cell!.text));
      if (only) out.push({ attr: "heating_type", col: only, value: "none", printed: only.cell?.text ?? "", rule: "derived.cooling_only", rank: 0 });
      else if (rated47) out.push({ attr: "heating_type", col: rated47, value: "heat_pump", printed: rated47.cell!.text, rule: "derived.heat_pump_rating_47f", rank: 0 });
      // A unit of a HEAT PUMP schedule that prints no other heat heats by the
      // heat pump (a split heat pump's indoor unit).
      else if (/\bHEAT\s+PUMPS?\b/.test(title)) out.push({ attr: "heating_type", col: titleCol, value: "heat_pump", printed: item.table_title, rule: "derived.title_names_heat_pump", rank: 0 });
      // A split indoor unit that cools with refrigerant and prints a heating
      // capacity, with no water, gas or electric heat printed: it heats by
      // running its refrigerant circuit in reverse, as a heat pump.
      else if (ctx.family === "FCU" || ctx.family === "VRF_INDOOR") {
        const dxCooling = dxTitle || values.get("cooling_type")?.value === "dx" || out.some((o) => o.attr === "cooling_type" && o.value === "dx");
        const heatCap = ctx.cols.find((c) => c.cell && quantitiesOf(c.h).includes("capacity") && /\bHEAT(?:ING)?\b|\bHTG\b/.test(c.h)
          && !capacityWords(c.h).input && parseNumberCell(c.cell.text) !== null);
        const electric = /\bELEC(?:TRIC)?\s+(?:HEAT|STRIP)|\bSTRIP\s+HEAT|\bKW\b/.test(`${title} | ${ctx.cols.map((c) => c.h).join(" | ")}`);
        if (dxCooling && heatCap && !electric && !ctx.hasWaterSide) out.push({ attr: "heating_type", col: heatCap, value: "heat_pump", printed: heatCap.cell!.text, rule: "derived.dx_unit_heats", rank: 0 });
      }
    }
  }
  // A unit's sections in air-flow order, as codes its table's legend
  // defines ("MXTD3-PF-FF-CC-HF-FAN", SEE LEGEND BELOW): the list is the whole
  // unit, so a section the legend offers and the list lacks is not there.
  const seq = ctx.cols.find((c) => c.cell && /\bLEGEND\b/.test(c.h) && /\bCOMPONENTS?\b|\bSECTIONS?\b|\bAIR\s*FLOW\b|\bARRANGEMENT\b|\bCONFIGURATION\b/.test(c.h));
  const codes = seq ? seq.cell!.text.toUpperCase().split(/\s*[-,+]\s*|\s+/).filter(Boolean) : [];
  if (seq && codes.length >= 2 && codes.every((c) => ctx.legend[c])) {
    const meanings = codes.map((c) => ctx.legend[c].toUpperCase());
    const offered = Object.values(ctx.legend).map((m) => m.toUpperCase());
    const byLegend = (attr: string, value: string) => {
      if (ctx.attrs.has(attr) && !values.has(attr) && !out.some((o) => o.attr === attr)) {
        out.push({ attr, col: seq, value, printed: seq.cell!.text, rule: "derived.components_legend", rank: 0 });
      }
    };
    if (offered.some((m) => /\bHUMIDIFIER\b/.test(m))) byLegend("humidifier", meanings.some((m) => /\bHUMIDIFIER\b/.test(m)) ? "yes" : "no");
    const HEAT = /\bHEATING\s+COIL\b|\bHEATER\b|\bFURNACE\b|\bHEAT(?:ING)?\s+SECTION\b/;
    if (offered.some((m) => HEAT.test(m))) {
      const heat = meanings.filter((m) => HEAT.test(m));
      const kinds = new Set(heat.map((m) => (/\bELEC/.test(m) ? "electric" : /\bSTEAM\b/.test(m) ? "steam" : /\bGAS\b|\bFURNACE\b/.test(m) ? "gas" : /\bHOT\s+WATER\b|\bHW\b/.test(m) ? "hw" : "?")));
      if (!heat.length) byLegend("heating_type", "none");
      else if (kinds.size === 1 && !kinds.has("?")) byLegend("heating_type", [...kinds][0]);
    }
  }

  const byGas = (attr: string, value: string, rule: string) => {
    if (gasInput && ctx.attrs.has(attr) && !values.has(attr)) out.push({ attr, col: gasInput, value, printed: gasInput.cell?.text ?? "", rule, rank: 0 });
  };
  // The fuels the row prints a rating, firing rate or supply pressure for:
  // one names the fuel; a gas and an oil rating make a dual-fuel unit.
  if (ctx.attrs.has("fuel") && !values.has("fuel")) {
    const fuelCols = ctx.cols.filter((c) => c.cell && fuelOf(c.h) && parseNumberCell(c.cell.text) !== null
      && (quantitiesOf(c.h).includes("capacity") || /\bCFH\b|\bFIRING\b|\bPRESS(?:URE)?\b/.test(c.h)));
    const fuels = [...new Set(fuelCols.map((c) => fuelOf(c.h)!))];
    if (fuels.length) {
      const col = fuelCols[0];
      out.push({ attr: "fuel", col, value: fuels.length >= 2 ? "dual_fuel" : fuels[0], printed: col.cell!.text, rule: fuels.length >= 2 ? "derived.two_fuels_rated" : `derived.${fuels[0]}_input_names_fuel`, rank: 0 });
    }
  }
  if (ctx.family === "HUMIDIFIER") byGas("humidifier_type", "gas_fired", "derived.gas_input_names_gas_fired");
  if (ctx.family === "HUMIDIFIER" && ctx.attrs.has("humidifier_type") && !values.has("humidifier_type") && !out.some((o) => o.attr === "humidifier_type")) {
    // The humidifier's TYPE cell names how it makes or delivers steam; a
    // dispersion tube or manifold fed from a steam SOURCE (clean, plant or
    // boiler steam) injects that steam directly.
    const typeCol = ctx.cols.find((c) => c.cell && /\bTYPE\b/.test(c.h));
    const t = typeCol?.cell?.text.toUpperCase() ?? "";
    const source = ctx.cols.find((c) => c.cell && /^SOURCE$|\bSTEAM\s+SOURCE\b/.test(c.h))?.cell?.text.toUpperCase() ?? "";
    const v = /\bSTEAM[-\s]+TO[-\s]+STEAM\b/.test(t) ? "steam_to_steam" : /\bELECTRODE\b/.test(t) ? "electrode"
      : /\bRESISTIVE\b|\bRESISTANCE\b/.test(t) ? "resistive" : /\bGAS[-\s]+FIRED\b/.test(t) ? "gas_fired"
      : /\bEVAPORATIVE\b|\bWETTED\s+MEDIA\b/.test(t) ? "evaporative" : /\bATOMIZ/.test(t) ? "atomizing"
      : /\bDISPERSION\b|\bMANIFOLD\b|\bSTEAM\s+INJECTION\b|\bDIRECT\s+(?:STEAM\s+)?INJECTION\b/.test(t)
        && /\bSTEAM\b/.test(source) && !/\bELECTRI|\bGAS\b|\bELECTRODE\b/.test(source) ? "direct_injection" : null;
    if (v && typeCol) out.push({ attr: "humidifier_type", col: typeCol, value: v, printed: typeCol.cell!.text, rule: "enum.humidifier_type", rank: 0 });
  }
  return out;
}

// ── 7. Slash-labeled parts; a heating block printed empty ──────────────────

/** Unit words and suffixes: a slash beside one belongs to a unit, never to
 * two labeled parts. */
const UNIT_TOKEN = /^(?:\(.*|CFM|GPM|MBH|BTUH|HP|KW|WATTS?|FT|FTWC|INWC|IN|TONS?|%|PSIG?|LBHR|RPM|VOLTS?|HZ|FPM|LBS?|GAL|F)$/;
const NONE_MARK = /^(?:[-–—]+|N\/?A|NONE)$/i;

/** A header whose last group prints two labeled parts around one slash
 * ("CFM COOL MIN / HEATING", "OUTPUT CAPACITY SECOND STAGE/FIRST STAGE
 * (MBH)"), with a cell printing a number or a none mark per part ("80 /
 * 125", "60/42", "200 / -"): one column per part, its header the shared
 * words and that part's label. The right label runs from the slash to a unit
 * or the end; the left one is as long. Null when the slash belongs to a
 * quantity read whole (V/PH, EWT/LWT, HP/QTY, ROWS/FINS, HP/W) or to a unit,
 * or the cell is not one value per part. */
function slashParts(col: Column): Column[] | null {
  if (!col.cell) return null;
  if (quantitiesOf(col.h).some((q) => q === "vph" || q === "ewt_lwt" || q === "rows_fins" || q === "hp_qty" || q === "watts" || q === "area_served" || q === "service")) return null;
  const tokens = col.h.replace(/\s*\/\s*/g, " / ").split(" ").filter(Boolean);
  const at = tokens.indexOf("/");
  if (at <= 0 || tokens.indexOf("/", at + 1) >= 0) return null;
  let end = at + 1;
  while (end < tokens.length && !UNIT_TOKEN.test(tokens[end])) end++;
  const width = end - (at + 1);
  if (width < 1 || width > at) return null;
  const left = tokens.slice(at - width, at);
  const right = tokens.slice(at + 1, end);
  // A unit beside the slash belongs to it, except a rating and its steps
  // ("KW / STEPS" printing "13 / 1": 13 kW in 1 step).
  if (left.some((t) => UNIT_TOKEN.test(t)) && !(right.length === 1 && /^(?:STEPS?|STAGES?)$/.test(right[0]))) return null;
  const cells = col.cell.text.split("/").map((t) => t.trim());
  if (cells.length !== 2) return null;
  const none = (t: string) => !t || NONE_MARK.test(t);
  if (cells.every(none) || !cells.every((t) => none(t) || parseNumberCell(t) !== null)) return null;
  const prefix = tokens.slice(0, at - width);
  const suffix = tokens.slice(end);
  return [left, right].map((label, i) => ({
    header: col.header, h: [...prefix, ...label, ...suffix].join(" "),
    cell: none(cells[i]) ? null : { text: cells[i], bbox: col.cell!.bbox }, order: col.order,
  }));
}

/** The heating coil block a table prints (two or more of its water,
 * capacity, pressure-drop or row columns) when this row prints an explicit
 * none ("-", "N/A") in every one of them and the title names no other heat:
 * the unit has no heating coil. The block's first column, else null. */
function heatingBlockNone(ctx: RowContext): Column | null {
  const title = headerText(ctx.title);
  if (W.gas.test(title) || W.electricHeat.test(title) || W.steam.test(title) || /\bHEAT\s+PUMPS?\b/.test(title)) return null;
  const coilQ = new Set<Quantity>(["waterflow", "ewt", "lwt", "ewt_lwt", "capacity", "wpd", "rows", "rows_fins"]);
  const block = ctx.cols.filter((c) => W.hw.test(c.h) && !W.chw.test(c.h) && quantitiesOf(c.h).some((q) => coilQ.has(q)));
  if (block.length < 2) return null;
  return block.every((c) => c.cell && NONE_MARK.test(c.cell.text.trim())) ? block[0] : null;
}

/** A terminal's electric heat printed as none ("N/A" under ELECTRIC HEAT
 * (KW)) in a table that prints no water, steam or other heat: the unit has
 * no reheat. Its electric heat column, else null. */
function electricHeatNone(ctx: RowContext): Column | null {
  if (ctx.hasWaterSide || ctx.cols.some((c) => W.steam.test(c.h) || /\bH?HW\b|\bHOT\s+WATER\b|\bHEATING\s+WATER\b/.test(c.h))) return null;
  const heat = ctx.cols.filter((c) => W.electricHeat.test(c.h) && quantitiesOf(c.h).some((q) => q === "kw" || q === "watts" || q === "heat_watts"));
  if (!heat.length) return null;
  return heat.every((c) => c.cell && NONE_MARK.test(c.cell.text.trim())) ? heat[0] : null;
}

/** A printed check mark. */
const CHECK_MARK = /^(?:X|✓|✔|YES|Y|●|•)$/i;

/** A box of a checkbox group (ACCESSORIES: EC MOTOR, MOTORIZED BYPASS
 * DAMPER, ROOF CURB) left blank on a row that marks others of the group:
 * the row does not have it. The group is the longest run of leading header
 * words at least two other columns share; every mark the row prints in it
 * must be a check mark. The blank box's column, else null. */
function uncheckedBox(ctx: RowContext, is: (h: string) => boolean): Column | null {
  const box = ctx.cols.find((c) => !c.cell && is(c.h));
  if (!box) return null;
  const words = box.h.split(" ");
  for (let n = words.length - 1; n >= 1; n--) {
    const group = words.slice(0, n).join(" ");
    const siblings = ctx.cols.filter((c) => c !== box && c.h.startsWith(`${group} `));
    if (siblings.length < 2) continue;
    const marked = siblings.filter((c) => c.cell);
    return marked.length >= 1 && marked.every((c) => CHECK_MARK.test(c.cell!.text.trim())) ? box : null;
  }
  return null;
}

// ── 8. Stacked lines ────────────────────────────────────────────────────────

const canonKey = (t: string) => String(t ?? "").toUpperCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, "");
const sameText = (t: string) => String(t ?? "").toUpperCase().replace(/\s+/g, " ").trim();

/** A unit printed on several lines of its table under one mark (a fan's
 * airflow at SELECTION CRITERIA, then at OPERATING CONDITION; a heat
 * exchanger's 1/3 and 2/3 control valves): the sheet graph keeps each line as
 * a row with the same key, and the compile keeps the first. A column whose
 * lines print different values is not one value for the unit; a column they
 * print alike is. */
function stackedLines(item: CompileItem, table: TableContext | null): ((col: Column) => string | null) {
  const own = canonKey(item.tag);
  const lines = (table?.rows ?? []).filter((r) => canonKey(r.key) === own);
  if (lines.length < 2) return () => null;
  return (col) => {
    const texts = [...new Set(lines.map((r) => sameText(r.cells[col.header] ?? "")).filter(Boolean))];
    return texts.length > 1 ? `the mark prints ${lines.length} lines that differ in "${col.header}" (${texts.join(" / ")}): not one value` : null;
  };
}

// ── 9. The table's notes ────────────────────────────────────────────────────

/** The notes that speak for this row: the ones its REMARKS / NOTES cell
 * cites ("SEE NOTES 1, 2"; "SEE NOTES" or "ALL" is every one). A table with
 * no such column, or one where no row cites a note, prints its notes for
 * every row, except a note that names other units of the row's own tag
 * family and not this one. */
function notesForRow(item: CompileItem, ctx: RowContext, notes: readonly ScheduleNote[], rows: TableContext["rows"] = []): ScheduleNote[] {
  if (!notes.length) return [];
  const citeCols = ctx.cols.filter((c) => /^(?:REMARKS|NOTES?|COMMENTS)$/.test(c.h));
  // A REMARKS column is a citation column when some row of the table cites a
  // note in it; one that only prints remarks ("BASE-MOUNTED") leaves the
  // table's notes speaking for every row.
  const citing = citeCols.length > 0 && (!rows?.length
    || rows.some((r) => citeCols.some((c) => citedNoteIds(r.cells[c.header] ?? "") !== null)));
  if (citing) {
    const cites = citeCols.map((c) => citedNoteIds(c.cell?.text ?? "")).filter((c): c is NonNullable<typeof c> => Boolean(c));
    if (cites.some((c) => c.all)) return [...notes];
    // A note that no row and no header cites is the table's own and speaks
    // for every row (the rows' REMARKS cite note 1 alone; notes 2-6 are the
    // table's; lettered GENERAL NOTES beside numbered ones).
    const citedByRows = new Set(rows.flatMap((r) => citeCols.flatMap((c) => citedNoteIds(r.cells[c.header] ?? "")?.ids ?? [])));
    const citedByHeaders = new Set(ctx.cols.map((c) => c.header.match(/\(\s*(?:SEE\s+)?NOTES?\s+([A-Z]|\d{1,2})\s*\)/i)?.[1]?.toUpperCase()).filter(Boolean));
    return notes.filter((n) => cites.some((c) => c.ids.includes(n.id))
      || (rows.length > 0 && !citedByRows.has(n.id) && !citedByHeaders.has(n.id)));
  }
  const prefix = String(item.tag ?? "").toUpperCase().match(/^([A-Z]{1,5})[-\s]?\d/)?.[1];
  const own = String(item.tag ?? "").toUpperCase().replace(/[\s-]/g, "");
  const service = ctx.cols.find((c) => c.cell && /^(?:SYSTEM|SERVICE|SERVING)$/.test(c.h))?.cell?.text.toUpperCase() ?? null;
  return notes.filter((n) => {
    // A note for "EACH HW AND CW PUMP" speaks for the rows of those services.
    const scope = noteServiceScope(n.text);
    if (scope && !(service && scope.some((re) => re.test(service)))) return false;
    if (!prefix) return true;
    const named = [...n.text.toUpperCase().matchAll(new RegExp(`\\b${prefix}[-\\s]?\\d{1,3}[A-Z]?\\b`, "g"))].map((m) => m[0].replace(/[\s-]/g, ""));
    return !named.length || named.includes(own);
  });
}

/** The water services a note restricts itself to ("PROVIDE VFD FOR EACH HW
 * AND CW PUMP": hot water and chilled or condenser water), as tests on a
 * row's SYSTEM / SERVICE text; null when it names none. */
function noteServiceScope(text: string): RegExp[] | null {
  const t = text.toUpperCase().replace(/\s+/g, " ");
  const SERVICE = "HHW|HW|CHW|CW|CDW|HOT WATER|HEATING WATER|CHILLED WATER|CONDENSER WATER|GLYCOL";
  const m = t.match(new RegExp(`\\b(?:EACH|ALL|THE)\\s+((?:${SERVICE})(?:\\s*(?:,|&|/|AND)\\s*(?:${SERVICE}))*)\\s+(?:PUMPS?|COILS?|UNITS?|SYSTEMS?)\\b`));
  if (!m) return null;
  const tests: RegExp[] = [];
  for (const w of m[1].split(/\s*(?:,|&|\/|\bAND\b)\s*/)) {
    if (/^(?:HHW|HW|HOT WATER|HEATING WATER)$/.test(w)) tests.push(/\bHOT\s+WATER\b|\bHH?WS?\b|\bHEATING\b/);
    else if (/^(?:CHW|CHILLED WATER)$/.test(w)) tests.push(/\bCHILLED\b|\bCHWS?\b/);
    else if (/^(?:CDW|CONDENSER WATER)$/.test(w)) tests.push(/\bCONDENSER\b|\bCDWS?\b/);
    else if (w === "CW") tests.push(/\bCHILLED\b|\bCHWS?\b|\bCONDENSER\b|\bCDWS?\b|\bCWS?\b/);
    else if (w === "GLYCOL") tests.push(/\bGLYCOL\b/);
  }
  return tests.length ? tests : null;
}

/** A remark or note that provides the unit's motor starter and nothing
 * else: "PROVIDE WITH MOTOR STARTER", "PROVIDE WITH UNIT MOUNTED STARTER AND
 * DISCONNECT" (a disconnect beside it is no drive). */
const STARTER_ONLY = /^PROVIDE\s+(?:(?:EACH\s+)?(?:UNIT|PUMP|FAN|MOTOR)\s+)?(?:WITH\s+)?(?:AN?\s+)?(?:(?:UNIT|FACTORY)[-\s]MOUNTED\s+)?(?:(?:COMBINATION|MAGNETIC|MOTOR|MANUAL|ACROSS[-\s]THE[-\s]LINE)\s+)*STARTER(?:\s+AND\s+(?:AN?\s+)?(?:(?:UNIT|FACTORY)[-\s]MOUNTED\s+)?(?:(?:NON-?\s?)?FUSED\s+)?DISCONNECT(?:\s+SWITCH)?)?\.?$/;

function fromNotes(item: CompileItem, ctx: RowContext, table: TableContext | null, reasons: Map<string, UnknownAttribute>): Candidate[] {
  const byAttr = new Map<string, Array<{ value: string | number; note: ScheduleNote; rule: string; col?: Column; cited?: boolean }>>();
  const service = ctx.cols.find((c) => c.cell && /^(?:SYSTEM|SERVICE|SERVING)$/.test(c.h))?.cell?.text ?? null;
  const read = (note: ScheduleNote, col?: Column, cited = false) => {
    for (const v of noteValues(note, ctx.attrs, service)) {
      // A coil's rows or entering water from a note, where the row prints
      // that coil's water.
      if ((/^chw_(?:rows|ewt_f)$/.test(v.attr) && !rowWater(ctx, "chw")) || (/^hw_(?:rows|ewt_f)$/.test(v.attr) && !rowWater(ctx, "hw"))) continue;
      if (!byAttr.has(v.attr)) byAttr.set(v.attr, []);
      byAttr.get(v.attr)!.push({ value: v.value, note, rule: v.rule, col, cited });
    }
  };
  const citedIds = new Set(ctx.cols.filter((c) => /^(?:REMARKS|NOTES?|COMMENTS)$/.test(c.h)).flatMap((c) => citedNoteIds(c.cell?.text ?? "")?.ids ?? []));
  const rowNotes = notesForRow(item, ctx, table?.notes ?? [], table?.rows);
  for (const note of rowNotes) read(note, undefined, citedIds.has(note.id));
  // A note the row's own REMARKS cite that provides the unit's starter and
  // nothing else ("PROVIDE WITH UNIT MOUNTED STARTER AND DISCONNECT."): it
  // starts across the line, on no VFD.
  for (const note of rowNotes) {
    if (!ctx.attrs.has("vfd") || !citedIds.has(note.id) || !STARTER_ONLY.test(note.text.toUpperCase().replace(/\s+/g, " ").trim())) continue;
    if (!byAttr.has("vfd")) byAttr.set("vfd", []);
    byAttr.get("vfd")!.push({ value: "no", note, rule: "note.motor_starter", cited: true });
  }
  // A motor rated for a drive in one note and the unit called variable speed
  // in another ("INVERTER DUTY MOTOR"; "VARIABLE SPEED, DIRECT DRIVE SUPPLY
  // FAN"): the unit runs on a VFD. Either alone does not say so.
  if (ctx.attrs.has("vfd") && !byAttr.has("vfd")) {
    const rated = rowNotes.find((n) => motorRatedForDrive(n.text));
    if (rated && rowNotes.some((n) => variableSpeed(n.text))) byAttr.set("vfd", [{ value: "yes", note: rated, rule: "notes.drive_rated_variable_speed", cited: citedIds.has(rated.id) }]);
  }
  // The row's own REMARKS, where they are prose rather than a citation
  // ("PROVIDE WITH MOTOR STARTER"), state things as a note does.
  for (const c of ctx.cols) {
    if (!c.cell || !/^(?:REMARKS|NOTES?|COMMENTS)$/.test(c.h) || citedNoteIds(c.cell.text) !== null) continue;
    if (c.cell.text.trim().split(/\s+/).length < 3) continue;
    read({ id: c.h, text: c.cell.text }, c, true);
    // A remark that is the motor's starter and nothing else ("PROVIDE WITH
    // MOTOR STARTER"): it starts across the line, on no VFD. (A starter a
    // table note names may be another motor's, a wheel's or a bypass's.)
    if (ctx.attrs.has("vfd") && STARTER_ONLY.test(c.cell.text.toUpperCase().replace(/\s+/g, " ").trim())) {
      if (!byAttr.has("vfd")) byAttr.set("vfd", []);
      byAttr.get("vfd")!.push({ value: "no", note: { id: c.h, text: c.cell.text }, rule: "remark.motor_starter", col: c, cited: true });
    }
  }
  const out: Candidate[] = [];
  for (const [attr, vs] of byAttr) {
    const col = (n: ScheduleNote): Column => vs.find((v) => v.note === n)?.col ?? ({ header: `(table note ${n.id})`, h: "", cell: { text: n.text, bbox: null }, order: -1 });
    if (attr === "control") {
      // Every cited control note, in note order: "A; B".
      const value = vs.map((v) => String(v.value)).join("; ");
      out.push({ attr, col: col(vs[0].note), value, printed: vs.map((v) => v.note.text).join(" | "), rule: "note.control", rank: 5 });
      continue;
    }
    const distinct = new Set(vs.map((v) => String(v.value)));
    if (distinct.size === 1) out.push({ attr, col: col(vs[0].note), value: vs[0].value, printed: vs[0].note.text, rule: vs[0].rule, rank: 5, cited: vs.some((v) => v.cited) });
    else reasons.set(attr, { reason: `notes ${vs.map((v) => v.note.id).join(", ")} state it differently` });
  }
  return out;
}

// ── 10. The row ─────────────────────────────────────────────────────────────

/** The units the project's drive schedules drive: a VARIABLE_FREQUENCY_DRIVE
 * row's PURPOSE / SERVES / EQUIPMENT / LOAD cell naming another compiled
 * unit's tag ("VFD-1 … PURPOSE HWP-1"). Canonical tag → the drive row's cell
 * that names it (the vfd value's cite: it is printed there, not in the
 * unit's own table). */
export function vfdDrivenTags(items: ReadonlyArray<{ family: string; tag: string; cells: CompileItem["cells"]; sheet_id?: string; table_title?: string }>): Map<string, DriveLoad> {
  const tags = new Set(items.filter((i) => i.family !== "VARIABLE_FREQUENCY_DRIVE").map((i) => canonKey(i.tag)));
  const driven = new Map<string, DriveLoad>();
  for (const vfd of items.filter((i) => i.family === "VARIABLE_FREQUENCY_DRIVE")) {
    for (const [header, cell] of Object.entries(vfd.cells ?? {})) {
      if (!/\bPURPOSE\b|\bSERV(?:ES|ICE|ING|ED)\b|\bEQUIPMENT\b|\bLOAD\b|\bMOTOR\s+TAG\b/.test(headerText(header))) continue;
      for (const token of String(cell?.text ?? "").toUpperCase().split(/\s*[,/&]\s*|\s+AND\s+|\s+/)) {
        const key = canonKey(token);
        if (tags.has(key) && !driven.has(key)) {
          driven.set(key, { sheet: vfd.sheet_id ?? "", table_title: vfd.table_title ?? "", header, bbox: cell?.bbox ?? null, printed: String(cell?.text ?? ""), drive: vfd.tag });
        }
      }
    }
  }
  return driven;
}

/** Canonical attributes for one compiled row of `family`. */
export function normalizeCompileItem(item: CompileItem, family: string, table: TableContext | null = null): NormalizedItem {
  const result: NormalizedItem = { family, tag: item.tag, attributes: {}, unknown: {} };
  let attrs: readonly string[];
  try {
    attrs = familyAttributes(family).all;
  } catch {
    return result;
  }
  const paired = pairedRow(item, table);
  const all = columnsOf(item, table);
  // A schedule continued in a second table ("… (CONT.)"): the unit's one row
  // there prints the rest of its columns (its supply fan, its final filter),
  // read as the row's own and cited to that table. A header the first table
  // prints too is the first table's.
  for (const cont of table?.continuation ?? []) {
    const lines = cont.rows.filter((r) => canonKey(r.key) === canonKey(item.tag));
    if (lines.length !== 1) continue;
    for (const header of cont.headers.length ? cont.headers : Object.keys(lines[0].cells)) {
      const h = headerText(header);
      if (all.some((c) => c.header === header) || SI_UNIT.test(h) || SI_BRACKET.test(header)) continue;
      const text = String(lines[0].cells[header] ?? "").trim();
      all.push({ header, h, cell: text ? { text, bbox: null } : null, order: all.length, table: cont.title });
    }
  }
  const cols = all.filter((c) => !otherHalf(c.h, family, paired));
  // ELECTRICAL DATA printed over unlabeled sub-columns ("ELECTRICAL DATA",
  // "… 2", "… 3" = "208", "1", "60"): one electrical tuple, read by value.
  const group = cols.filter((c) => /^(?:ELECTRICAL|ELEC|POWER)(?:\s+DATA)?(?:\s+\d)?$/.test(c.h));
  if (group.length >= 2 && group.length <= 3 && group.every((c) => c.cell && /^\d+$/.test(c.cell.text.trim()))) {
    const tuple = group.map((c) => c.cell!.text.trim()).join("/");
    if (parseElectricalCell(tuple)?.volts) cols.push({ header: group[0].header, h: "ELECTRICAL V/PH/HZ", cell: { text: tuple, bbox: group[0].cell!.bbox }, order: group[0].order });
  }
  const ctx: RowContext = {
    family, title: item.table_title ?? "", attrs: new Set(attrs), cols, defaultWater: null, codes: table?.codes ?? {}, legend: table?.legend ?? {}, paired,
    indoorColumns: all.some((c) => INDOOR_WORDS.test(c.h)),
    hasWaterSide: cols.some((c) => quantitiesOf(c.h).some((q) => q === "waterflow" || q === "ewt" || q === "lwt" || q === "ewt_lwt")),
  };
  ctx.defaultWater = HEATING_ONLY.has(family) ? "hw" : family === "AIR_COOLED_CHILLER" ? "chw" : titleWater(ctx.title) ?? tableWater(cols) ?? (family === "HEAT_EXCHANGER" && cols.some((c) => W.steam.test(c.h)) ? "secondary" : null) ?? physicsWater(item, cols, family);

  const byAttr = new Map<string, Candidate[]>();
  const reasons = new Map<string, UnknownAttribute>();
  const differs = stackedLines(item, table);
  for (const col of cols) {
    let { found, failed } = candidatesOf(col, ctx, item);
    // "80 / 125" under "CFM COOL MIN / HEATING": one value per labeled part.
    if (!found.length) {
      const parts = slashParts(col);
      if (parts) {
        const read = parts.map((p) => candidatesOf(p, ctx, item));
        found = read.flatMap((r) => r.found).map((c) => ({ ...c, col, printed: col.cell?.text ?? c.printed, rule: `${c.rule}.part` }));
        failed = [...failed, ...read.flatMap((r) => r.failed)];
      }
    }
    const stacked = found.length ? differs(col) : null;
    if (stacked) {
      for (const c of found) if (!reasons.has(c.attr)) reasons.set(c.attr, { reason: stacked, header: col.header, printed: col.cell?.text });
      continue;
    }
    for (const c of found) {
      if (!byAttr.has(c.attr)) byAttr.set(c.attr, []);
      byAttr.get(c.attr)!.push(c);
    }
    for (const f of failed) if (!reasons.has(f.attr)) reasons.set(f.attr, { reason: f.reason, header: col.header, printed: col.cell?.text });
  }

  const chosen = new Map<string, Candidate>();
  for (const [attr, cands] of byAttr) {
    const best = Math.min(...cands.map((c) => c.rank));
    const top = cands.filter((c) => c.rank === best);
    const distinct = new Set(top.map((c) => (typeof c.value === "number" ? c.value.toFixed(9) : String(c.value).toUpperCase())));
    if (distinct.size === 1) chosen.set(attr, top[0]);
    else reasons.set(attr, { reason: `${top.length} columns answer it differently: ${top.map((c) => `"${c.col.header}" = "${c.printed}"`).join(", ")}` });
  }
  for (const d of derived(item, ctx, chosen)) if (!chosen.has(d.attr)) chosen.set(d.attr, d);
  for (const n of fromNotes(item, ctx, table, reasons)) {
    const cell = chosen.get(n.attr);
    // The row's cell and a note the row itself cites naming different drives
    // ("ECM" under MOTOR CONTROL, "INTEGRATED VFD" in cited note 1): the row
    // disagrees with itself, so the attribute is not one value. A note for
    // every row is outranked by the row's own cell.
    if (cell && n.cited && (n.attr === "vfd" || n.attr === "ecm") && cell.rank < 5 && !cell.rule.startsWith("derived.")
      && String(cell.value) !== String(n.value)) {
      chosen.delete(n.attr);
      reasons.set(n.attr, { reason: `"${cell.col.header}" = "${cell.printed}" and ${n.col.header} ("${n.printed}") state it differently`, header: cell.col.header, printed: cell.printed });
      continue;
    }
    if (!cell) chosen.set(n.attr, n);
  }
  // A note offering EC motors or VFDs as alternatives ("PROVIDE FANS WITH EC
  // MOTORS OR VARIABLE FREQUENCY DRIVES") and a row naming its choice ("… W/
  // VFD"): the unit has that one and not the other.
  if (notesForRow(item, ctx, table?.notes ?? [], table?.rows).some((n) => n.text.split(/[.;]/).some(ecmOrDrive))) {
    const vfd = chosen.get("vfd");
    const ecm = chosen.get("ecm");
    if (vfd?.value === "yes" && !ecm && ctx.attrs.has("ecm")) chosen.set("ecm", { ...vfd, attr: "ecm", value: "no", rule: "notes.ecm_or_vfd" });
    else if (ecm?.value === "yes" && !vfd && ctx.attrs.has("vfd")) chosen.set("vfd", { ...ecm, attr: "vfd", value: "no", rule: "notes.ecm_or_vfd" });
  }
  // A heating block the table prints, this row's cells all "-" or "N/A": no
  // such coil, and no other heat the row or its notes name.
  for (const attr of ["heat_type", "heating_type"]) {
    if (!ctx.attrs.has(attr) || chosen.has(attr)) continue;
    const block = heatingBlockNone(ctx);
    if (block) chosen.set(attr, { attr, col: block, value: "none", printed: block.cell?.text ?? "", rule: "derived.heating_block_none", rank: 0 });
  }
  if (ctx.attrs.has("heat_type") && !chosen.has("heat_type")) {
    const heat = electricHeatNone(ctx);
    if (heat) chosen.set("heat_type", { attr: "heat_type", col: heat, value: "none", printed: heat.cell?.text ?? "", rule: "derived.electric_heat_none", rank: 0 });
  }
  // An EC MOTOR box the row leaves blank among accessories it checks.
  if (ctx.attrs.has("ecm") && !chosen.has("ecm")) {
    const box = uncheckedBox(ctx, (h) => quantitiesOf(h).includes("ecm"));
    if (box) chosen.set("ecm", { attr: "ecm", col: box, value: "no", printed: "", rule: "derived.checkbox_left_blank", rank: 1 });
  }
  // A drive schedule that names this unit as its load: the unit runs on a
  // VFD. The value cites the drive schedule's row, where it is printed.
  const drive = table?.driven?.get(canonKey(item.tag));
  let driveCite: Cite | null = null;
  if (!chosen.has("vfd") && ctx.attrs.has("vfd") && drive) {
    chosen.set("vfd", { attr: "vfd", col: { header: drive.header, h: "", cell: { text: drive.printed, bbox: drive.bbox }, order: -1 }, value: "yes", printed: drive.printed, rule: "cross.drive_schedule_load", rank: 6 });
    driveCite = { sheet: drive.sheet, table_title: drive.table_title, header: drive.header, bbox: drive.bbox };
  }

  for (const [attr, c] of chosen) {
    result.attributes[attr] = {
      value: c.value,
      printed: c.printed,
      cite: attr === "vfd" && c.rule === "cross.drive_schedule_load" && driveCite ? driveCite
        : { sheet: item.sheet_id, table_title: c.col.table ?? item.table_title, header: c.col.header, bbox: c.col.cell?.bbox ?? null },
      rule: c.rule,
    };
  }
  for (const attr of attrs) {
    if (result.attributes[attr]) continue;
    result.unknown[attr] = reasons.get(attr) ?? { reason: "no printed column answers it" };
  }
  const notes = notesForRow(item, ctx, table?.notes ?? [], table?.rows);
  if (notes.length) result.notes = notes;
  return result;
}
