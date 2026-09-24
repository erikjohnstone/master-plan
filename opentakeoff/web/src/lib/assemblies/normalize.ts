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
import { citedNoteIds, noteValues, type ScheduleNote } from "./scheduleNotes";

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
 * numbered notes printed with it (scheduleNotes.ts), when read; and its rows
 * (the sheet graph's, key and cell text), when given. */
export interface TableContext {
  headers: readonly string[];
  notes?: readonly ScheduleNote[];
  rows?: ReadonlyArray<{ key: string; cells: Readonly<Record<string, string>> }>;
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
  s = s.replace(/\bLBS?\s*(?:OF\s+STEAM\s*)?\/\s*HR\b/g, " LBHR ");
  s = s.replace(/\bFT\s*(?:OF\s+)?(?:W\s?C|W\s?G|H2O)\b/g, " FTWC ");
  s = s.replace(/\bI\s?W\s?G\b|\bIN\s*(?:OF\s+)?(?:W\s?C|W\s?G|H2O)\b|\bIWC\b/g, " INWC ");
  s = s.replace(/\(\s*W\s?C\s*\)/g, " INWC ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ── 2. Cell values ──────────────────────────────────────────────────────────

/** Printed unit words a cell or header can carry, as attributes.ts units. */
const UNIT_WORDS: Array<[RegExp, string]> = [
  [/^(?:BTUH|BTU\/H|BTU\/HR)$/, "BTU/H"],
  [/^MBH$/, "MBH"],
  [/^KW$/, "kW"],
  [/^(?:W|WATTS?)$/, "W"],
  [/^(?:HP|H\.P\.)$/, "hp"],
  [/^CFM$/, "cfm"],
  [/^GPM$/, "gpm"],
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
  const t = String(text ?? "").trim().replace(/\s*\([^()]*\b(?:PER|EACH|EA)\b[^()]*\)\s*$/i, "")
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

/** An electrical cell: "460/3", "208V/1PH", "115/1/60", "460V-3PH-60HZ".
 * Parts are read positionally only when the header names the same parts
 * (V/PH, V/PH/HZ); a range ("208-230/1") is not one voltage. */
export function parseElectricalCell(text: string): { volts: number | null; phase: number | null } | null {
  const t = String(text ?? "").toUpperCase().replace(/\s+/g, "").replace(/VAC|VOLTS?|V(?=[/\\-]|$)/g, "").replace(/PHASES?|PH|Ø|φ/g, "").replace(/HZ/g, "");
  const parts = t.split(/[/\\]|-(?=\d)/).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  const volts = Number(parts[0]);
  const phase = Number(parts[1]);
  if (parts.length === 3 && !["50", "60"].includes(parts[2])) return null;
  return { volts: STANDARD_VOLTS.has(volts) ? volts : null, phase: phase === 1 || phase === 3 ? phase : null };
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
}

/** A header printing an SI unit: the same quantity as its US twin, in a
 * unit the schema does not take (the keys type these columns "-"). */
const SI_UNIT = /\bL\s*\/\s*S\b|\bLPS\b|\bKPA\b|\(\s*C\s*\)|\bDEG\s*C\b|\bMM\b|\bPA\b|\bKG\s*\/\s*HR?\b|\bM3\s*\/\s*[HS]\b|\bM\s*\/\s*S\b/;

/** The row's columns: the table's headers in order when known (so a blank
 * cell is a known blank), else the item's own non-blank cells. SI duplicates
 * printed in brackets ("[L/S]", "[KW]", "[°C]") are the same quantity in
 * another unit and are never read. */
function columnsOf(item: CompileItem, table: TableContext | null): Column[] {
  const headers = table?.headers?.length ? [...table.headers] : [];
  for (const h of Object.keys(item.cells ?? {})) if (!headers.includes(h)) headers.push(h);
  return headers
    .filter((header) => !/\[[^\]]*\]/.test(header) && !SI_UNIT.test(headerText(header)))
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
  gas: /\b(?:GAS|FURNACE|NATURAL\s+GAS)\b/,
  steam: /\bSTEAM\b/,
  electricHeat: /\bELEC(?:TRIC)?\s+(?:HEAT(?:ER|ING)?|DUCT\s+HEATER)\b|\bHEATER\b|\bHEATING\s+COIL\b/,
  condenser: /\b(?:CONDENSER|SOURCE|GEOTHERMAL)\b/,
  primary: /\bPRIMARY\b/,
  secondary: /\bSECONDARY\b/,
  supply: /\b(?:SUPPLY|SA|SF)\b/,
  returnAir: /\b(?:RETURN|RELIEF|RA|RF)\b/,
  exhaust: /\b(?:EXHAUST|EF)\b/,
  oa: /\b(?:OA|OSA|O\s?A|OUTSIDE\s+AIR|OUTDOOR\s+AIR|VENTILATION)\b/,
  min: /\bMIN(?:IMUM)?\b|\bLOW\b/,
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
  | "fluid" | "glycol" | "hp_qty" | "cells" | "economizer" | "humidifier" | "energy_recovery" | "type" | "rows_fins" | "arrangement" | "controller";

/** The quantities a header names, from its words. A header naming none is
 * a column the schema does not read (MANUFACTURER, WEIGHT, NC, FLA …).
 * `h` is headerText() output; exported for tests and diagnostics. */
export function quantitiesOf(h: string): Quantity[] {
  const q: Quantity[] = [];
  // V/PH, or a V/…/HZ triple whose phase symbol the text lost.
  const electricalPair = /\bV(?:OLTS?|OLTAGE)?\s*\/\s*PH(?:ASES?)?\b/.test(h) || (/\bV\b/.test(h) && /\bHZ\b/.test(h) && !/\bVOLT/.test(h));
  if (electricalPair) q.push("vph");
  else {
    if (/\bVOLT(?:S|AGE)?\b/.test(h) || h === "V" || /\bELECTRICAL\s+V$/.test(h)) q.push("volts");
    if (/\bPHASES?\b/.test(h) || (/\bPH\b/.test(h) && !/\bPH\s*(?:VALUE|LEVEL)\b/.test(h) && !/\b(?:INLET|NECK|DUCT|SIZE|DIA|DIAMETER)\b/.test(h))) q.push("phase");
  }
  if (/\bHP\s*\/\s*QTY\b/.test(h)) q.push("hp_qty");
  else if (/\b(?:HP|HORSEPOWER|MHP)\b/.test(h) && !/\bBHP\b/.test(h) && !/\bHP\s*\/\s*W\b/.test(h)) q.push("hp");
  if ((/\bHP\s*\/\s*W\b/.test(h) || /\bWATTS?\b/.test(h)) && !/\bCAPACITY\b|\bCOIL\b|\bHEAT/.test(h)) q.push("watts");
  if (/\bKW\b/.test(h)) q.push("kw");
  // Airflow: CFM, AIRFLOW, an air quantity ("DESIGN QUANTITIES" of a
  // terminal), a terminal's PRIMARY AIR (not its inlet, temperature or
  // pressure), a minimum outside air.
  const primaryAir = /\bPRIMARY\s+AIR\b/.test(h) && !/\bSIZE\b|\bDIA|\bINLET\b|\bTEMP|\bS\.?P\b|\bPRESS|\bVELOCITY\b|\bDUCT\b/.test(h);
  if ((/\bCFM\b|\bAIR\s?FLOWS?\b|\bAIR\s+QUANTIT(?:Y|IES)\b|\bDESIGN\s+QUANTITIES\b/.test(h) || primaryAir || /\bMIN(?:IMUM)?\s+(?:OA|OSA|OUTSIDE\s+AIR|OUTDOOR\s+AIR)$/.test(h)) && !/\bDIRECTION\b/.test(h)) q.push("airflow");
  if (/\bGPM\b/.test(h) || (/\bFLOW\b/.test(h) && !/\bAIR\s?FLOW|CFM|LBHR|CFH|STEAM\b/.test(h) && /\b(?:WATER|FLUID|HW|CHW|COIL|HEATING|COOLING|PUMP|BOILER|CAPACITY|CIRCULATING|EVAPORATOR|CONDENSER)\b|^FLOW$/.test(h))) q.push("waterflow");
  const water = /\b(?:WATER|WTR)\b/.test(h);
  const ewt = /\bEWT\b|\bENT(?:ERING)?\s+(?:WATER|WTR)\b/.test(h) || (water && /\bTEMP\w*(?:\s+F)?\s+ENT$/.test(h));
  const lwt = /\bLWT\b|\bLE?AV(?:ING)?\s+(?:WATER|WTR)\b|\bLVG\s+(?:WATER|WTR)\b|\bEXT\s+WTR\b/.test(h) || (water && /\bTEMP\w*(?:\s+F)?\s+LVG$/.test(h));
  if (ewt && lwt) q.push("ewt_lwt");
  else if (ewt) q.push("ewt");
  else if (lwt) q.push("lwt");
  if (/\bMBH\b|\bBTUH\b|\bCAPACITY\b|\bOUTPUT\b|\bINPUT\b|\bLOAD\b/.test(h) && !/\bCFM\b|\bGPM\b|\bTONS?\b|\bLBHR\b|\bKW\b|\bFLOW\b|\bCFH\b|\bPART\s+LOAD\b|\bTEMP|\bEER\b|\bCOP\b|\bHSPF\b|\bEFF|\bTRAP\b/.test(h)) q.push("capacity");
  if (/\bRPM\b/.test(h)) q.push("rpm");
  if (/\bESP\b|\bEXT(?:ERNAL)?\s+(?:SP|STATIC)\b|^SP\b|\bS\s?P\b(?!\s*GR)|\bSTATIC\s+PRESS/.test(h) && !/\bTSP\b|\bTOTAL\s+(?:SP|STATIC)\b|\bINLET\s+SP\b|\bMIN\s+INLET\b/.test(h)) q.push("esp");
  else if (/\bTSP\b|\bTOTAL\s+(?:SP|STATIC)\b/.test(h)) q.push("tsp");
  if (/\bHEAD\b|\bTDH\b/.test(h) && !/\bNPSH\b/.test(h)) q.push("head");
  if ((/\bW?PD\b|\bPRESSURE\s+DROP\b|\bP\s?D\b/.test(h)) && !/\bAIR\s+(?:P\s?D|PD|PRESSURE)\b|\bAPD\b|\bINWC\b|\bOUTLET\b|\bINLET\s+SP\b/.test(h)) q.push("wpd");
  if (/\bINLET\b/.test(h) && /\b(?:SIZE|DIA(?:METER)?|IN(?:CHES)?)\b/.test(h) && !/\bSP\b|\bTEMP/.test(h)) q.push("inlet_size");
  else if (/\bCONN\w*|\bRUNOUT\b|\bSUCTION\b|\bDISCHARGE\s+SIZE\b|\bPIPE\s+SIZE\b/.test(h) && !/\bCONNECTED\b|\bDIFFUSER\b|\bVENT\b|\bFLUE\b|\bCOMBUSTION\b|\bDRAIN\b|\bCONDENSATE\b|\bDUCT\b/.test(h)) q.push("conn_size");
  if (/\bTONS?\b/.test(h)) q.push("tons");
  if (/\bMERV\b|\bFINAL\s+FILTER\b|\bFILTERS?$/.test(h) && !/\bDEPTH\b|\bPD\b|\bFACE\b|\bQTY\b|\bPRE-?\s?FILTER\b/.test(h)) q.push("merv");
  if (/(?:\b(?:NO|NUMBER)|#)\s+OF\s+CELLS\b|^CELLS$/.test(h)) q.push("cells");
  if ((/\bQTY\b|\bQUANTITY\b|(?:\b(?:NO|NUMBER)|#)\s+OF\s+(?:FANS|UNITS|PUMPS|BLOWERS)\b/.test(h)) && !/\bHP\s*\/\s*QTY\b/.test(h)) q.push("qty");
  if (/\bROWS?\b/.test(h) && !/\bHORIZONTAL|VERTICAL\b/.test(h)) q.push(/\bROWS?\s*\/\s*FINS?\b/.test(h) ? "rows_fins" : "rows");
  if (/\bLBHR\b/.test(h) && !/\bTRAP\b/.test(h)) q.push("lbhr");
  if (/\bPSIG?\b/.test(h)) q.push("psig");
  if (/\bAREA\b.*\bSERV(?:ED|ICED)\b|^SERVES$|^AREA$/.test(h)) q.push("area_served");
  else if (/^(?:SERVICE|SERVING|SYSTEM|SYSTEM AND\/OR SERVICE|SYSTEM AND\/OR SEVICE)$/.test(h)) q.push("service");
  if (/^LOCATION$/.test(h)) q.push("location");
  if (/^(?:REMARKS|ARRANGEMENT|OPERATION|PUMP\s+ARRANGEMENT)$/.test(h)) q.push("arrangement");
  if (/\bDRIVE\b/.test(h) && !/\bFREQ|VARIABLE|VFD\b/.test(h)) q.push("drive");
  if (/^FUEL$|\bFUEL\s+TYPE\b/.test(h)) q.push("fuel");
  if (/\bVFD\b|\bVAR(?:IABLE)?\s+FREQ/.test(h)) q.push("vfd");
  if (/(?:^|\s)EC$|\bECM\b/.test(h)) q.push("ecm");
  if (/\bSPEED\s+CONTROL\b|\bCONTROL\s+TYPE\b|\bVOLUME\s+CONTROL\b/.test(h)) q.push("control");
  // Not a "… BY" column: that names who furnishes it ("EC" there is the
  // electrical contractor, never an EC motor).
  else if (/\bCONTROLLER\b|\bSTARTER\b/.test(h) && !/\bBY\b|\bFURNISHED\b|\bPROVIDED\b|\bINSTALLED\b|\bWIRED\b/.test(h)) q.push("controller");
  if (/\bFLUID(?:\s+TYPE)?$/.test(h)) q.push("fluid");
  if (/\bGLYCOL\b|\b%\s*(?:PG|EG)\b/.test(h)) q.push("glycol");
  if (/\bECONOMIZER\b/.test(h)) q.push("economizer");
  if (/\bHUMIDIFIER\b|\bHUMIDIFICATION\b/.test(h)) q.push("humidifier");
  if (/\b(?:ENERGY|HEAT)\s+RECOVERY\b|\bENTHALPY\s+WHEEL\b/.test(h)) q.push("energy_recovery");
  if (/^(?:UNIT\s+)?TYPE$/.test(h)) q.push("type");
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
const OUTDOOR_WORDS = /\bOUTDOOR\s+UNITS?\b|\bCONDENSING\s+UNITS?\b|\bODU\b|\bCONDENSER\b(?!\s+WATER)/;
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

/** Whether the table's row for this unit names a second unit beside it
 * ("ACCU-1 / AC-1", "F-1 , CU-1"): one row scheduling both halves of a split
 * system. */
function pairedRow(item: CompileItem, table: TableContext | null): boolean {
  const own = canonKey(item.tag);
  const tagLike = /^[A-Z]{1,6}-?\d{1,3}[A-Z]?(?:\([A-Z]\))?$/;
  return (table?.rows ?? []).some((r) => Object.values(r.cells).some((text) => {
    const parts = String(text ?? "").toUpperCase().split(/\s*[\/,&]\s*|\s+AND\s+/).map(canonKey).filter(Boolean);
    return parts.length >= 2 && parts.includes(own) && parts.every((p) => tagLike.test(p));
  }));
}

/** The water service a column belongs to, from its own block words, else
 * from the table: its title's words, a steam heat exchanger's water side,
 * the EWT/LWT of the table's only water block, a heating-only family. */
function waterService(col: Column, ctx: RowContext): Service {
  const h = col.h;
  if (W.primary.test(h)) return "primary";
  if (W.secondary.test(h)) return "secondary";
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

interface RowContext {
  family: string;
  title: string;
  attrs: Set<string>;
  cols: Column[];
  /** The service of an unqualified water column, when the table decides it. */
  defaultWater: Service;
  /** The table prints a water flow or water temperature column. */
  hasWaterSide: boolean;
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
}

const AIR_HANDLERS = new Set(["AHU", "DOAS", "DOAH_UNIT", "DOAH_HANDLING", "OUTDOOR_AIR_UNIT", "RTU"]);

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
  return null;
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
        else failed.push({ attr: "volts", reason: `cell "${text}" is not a standard voltage` });
        break;
      }
      case "phase": {
        if (!col.cell || !ctx.attrs.has("phase")) break;
        const p = parseNumberCell(text.replace(/\s*(?:PH|PHASE|Ø)$/i, ""));
        if (p && (p.n === 1 || p.n === 3)) found.push({ attr: "phase", col, value: p.n, printed: text, rule: "electrical.phase", rank: electricalRank(h, ctx) });
        else failed.push({ attr: "phase", reason: `cell "${text}" is not a phase (1 or 3)` });
        break;
      }
      case "airflow": {
        if (W.perLength.test(h)) break;
        // A coil's face airflow is the coil's, not the unit's (except a coil).
        if (/\bCOILS?\b/.test(h) && ctx.family !== "DUCT_MOUNTED_COIL") break;
        if (W.oa.test(h)) {
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
          break;
        }
        if (AIR_HANDLERS.has(ctx.family) || ctx.family === "ERV") {
          if (W.returnAir.test(h)) { num(pick(ctx, "return_cfm"), q, "airflow.return", airRank()); break; }
          if (W.exhaust.test(h)) { num(pick(ctx, "exhaust_cfm"), q, "airflow.exhaust", airRank()); break; }
          if (W.min.test(h) && !W.design.test(h)) break;
          num(pick(ctx, "supply_cfm", "cfm"), q, W.supply.test(h) ? "airflow.supply" : "airflow.unit", airRank() + (W.supply.test(h) ? 0 : 1));
          break;
        }
        if (W.returnAir.test(h) || W.oa.test(h)) break;
        // An outdoor unit's airflow is its condenser's: an unqualified CFM in
        // a split system's table is the indoor unit's.
        if (SPLIT_OUTDOOR.has(ctx.family) && !OUTDOOR_WORDS.test(h)) break;
        num(pick(ctx, "cfm", "supply_cfm"), q, "airflow.unit", airRank());
        break;
      }
      case "waterflow": {
        const s = waterService(col, ctx);
        num(waterAttr(ctx, s, "gpm"), q, `water.${s ?? "unit"}.flow`, W.min.test(h) ? 1 : 0);
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
        if (W.input.test(h)) {
          const gas = W.gas.test(h) || W.gas.test(ctx.title) || ctx.family === "BOILER";
          num(ctx.family === "BOILER" ? pick(ctx, "input_mbh") : gas ? pick(ctx, "gas_input_mbh") : null, q, "capacity.input");
          break;
        }
        if (ctx.family === "BOILER") { if (W.output.test(h)) num(pick(ctx, "output_mbh"), q, "capacity.output"); break; }
        const cooling = W.chw.test(h) || W.dx.test(h);
        const heating = W.hw.test(h) || W.gas.test(h) || W.steam.test(h) || W.electricHeat.test(h);
        if (cooling && !heating) {
          if (W.sensible.test(h)) break;
          num(pick(ctx, "cooling_mbh", "chw_mbh"), q, "capacity.cooling", W.total.test(h) ? 0 : 1);
        } else if (heating && !cooling) {
          const coil = ctx.family === "VAV" || ctx.family === "FCU";
          if (coil && !ctx.hasWaterSide) break;
          num(coil ? pick(ctx, "hw_mbh", "heating_mbh") : pick(ctx, "heating_mbh"), q, "capacity.heating", W.output.test(h) ? 0 : 1);
        } else if (!cooling && !heating) {
          const s = ctx.defaultWater;
          // A terminal's or fan coil's own coil capacity is a hot-water coil's
          // only when the table prints that coil's water; an electric heater's
          // MBH is not (bldg5406's REHEAT MBH beside ELECTRIC HEATER KW).
          if ((ctx.family === "VAV" || ctx.family === "FCU") && !ctx.hasWaterSide) break;
          if (HEATING_ONLY.has(ctx.family) || s === "hw") num(ctx.family === "VAV" ? pick(ctx, "hw_mbh") : pick(ctx, "heating_mbh"), q, "capacity.heating_unit", W.output.test(h) || W.total.test(h) ? 0 : 1);
          else if (s === "chw") { if (!W.sensible.test(h)) num(pick(ctx, "cooling_mbh"), q, "capacity.cooling_unit", W.total.test(h) ? 0 : 1); }
        }
        break;
      }
      case "hp": {
        if (W.returnAir.test(h)) { num(pick(ctx, "return_fan_hp"), q, "power.return_fan"); break; }
        if (W.exhaust.test(h) && (AIR_HANDLERS.has(ctx.family) || ctx.family === "ERV")) { num(pick(ctx, "exhaust_fan_hp"), q, "power.exhaust_fan"); break; }
        const attr = AIR_HANDLERS.has(ctx.family) || ctx.family === "ERV" ? pick(ctx, "supply_fan_hp") : pick(ctx, "motor_hp", "fan_hp");
        num(attr, q, W.supply.test(h) ? "power.supply_fan" : "power.motor", W.supply.test(h) ? 0 : 1);
        break;
      }
      case "watts": {
        // A fan's motor rated in watts. A heater's watts are its heat, so a
        // family that heats electrically never reads a WATTS column as a motor.
        // A unit heated by water draws power only for its fan: its
        // ELECTRICAL watts are the motor's.
        const motorWords = W.fanWord.test(h) || W.motor.test(h);
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
        if (W.electricHeat.test(h) || W.hw.test(h) || HEATING_ONLY.has(ctx.family) || W.electricHeat.test(headerText(ctx.title))) num(pick(ctx, "eh_kw"), q, "power.electric_heat");
        else if (W.total.test(h) || W.max.test(h) || W.input.test(h) || /\bDESIGN\b/.test(h)) num(pick(ctx, "kw_input"), q, "power.input");
        break;
      }
      case "rpm": {
        const own = W.fanWord.test(h) && !W.motor.test(h);
        num(pick(ctx, "rpm"), q, own ? "speed.fan" : "speed.motor", own ? 0 : 1);
        break;
      }
      case "esp": num(pick(ctx, "esp_in"), q, "pressure.external"); break;
      case "tsp": num(pick(ctx, "esp_in"), q, "pressure.total", 5); break;
      case "head": num(pick(ctx, "head_ft"), q, "pressure.head"); break;
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
        found.push({ attr, col, value: n, printed: text, rule: "size.connection", rank: /\bSUCTION\b|\bINLET\b/.test(h) ? 0 : /\bDISCHARGE\b/.test(h) ? 2 : 1 });
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
        if (/\b(?:COMPRESSORS?|COMP|CONDENSER|COILS?|FILTERS?|CELLS?|STAGES?|CIRCUITS?|PUMPS?|MOTORS?|MANIFOLDS?)\b/.test(h)) break;
        const fan = W.fanWord.test(h);
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
        const attr = ctx.family === "HEAT_EXCHANGER" ? pick(ctx, "primary_steam_lb_hr") : pick(ctx, "capacity_lb_hr", "steam_lb_hr");
        num(attr, q, "steam.flow");
        break;
      }
      case "psig": {
        if (/\bDISPERSION\b|\bLEAVING\b|\bLVG\b/.test(h)) break;
        num(ctx.family === "HEAT_EXCHANGER" ? pick(ctx, "primary_steam_psig") : pick(ctx, "steam_psig"), q, "steam.pressure", /\bCONTROL\s+VALVE\b|\bSUPPLY\b/.test(h) ? 0 : 1);
        break;
      }
      case "area_served": {
        if (!col.cell || !ctx.attrs.has("area_served")) break;
        // "AREA / SUPPLY VALVE SERVED": the area, before the valve's tag
        // ("SOIL/AGGREGATE 126 / SAV-2").
        const valve = /\//.test(h) && /\bSUPPLY\s+VALVE\b/.test(h) ? text.match(/^(.*\S)\s*\/\s*[A-Z]{1,5}-?\d{1,3}[A-Z]?\s*$/i) : null;
        const v = valve ? valve[1].trim() : text.trim();
        if (v) found.push({ attr: "area_served", col, value: v, printed: text, rule: "text.area_served", rank: 0 });
        break;
      }
      case "service": {
        if (!col.cell) break;
        if (ctx.attrs.has("service")) { found.push({ attr: "service", col, value: text.trim(), printed: text, rule: "text.service", rank: /^SYSTEM$/.test(h) ? 1 : 0 }); break; }
        // A family with no service attribute prints the area it serves under
        // SERVICE (never under SYSTEM); an AREA SERVED column outranks it.
        if (/^SERVICE$/.test(h) && ctx.attrs.has("area_served")) found.push({ attr: "area_served", col, value: text.trim(), printed: text, rule: "text.service_as_area", rank: 2 });
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
        const v = /^(?:DIRECT|DD|DIRECT\s+DRIVE|DIR)$/.test(t) ? "direct" : /^(?:BELT|BD|BELT\s+DRIVE)$/.test(t) ? "belt" : null;
        if (v) found.push({ attr: "drive", col, value: v, printed: text, rule: "enum.drive", rank: 0 });
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
      case "ecm": {
        if (!col.cell || !ctx.attrs.has("ecm")) break;
        const t = text.toUpperCase().trim();
        const v = /^(?:YES|Y|X|ECM?)$/.test(t) ? "yes" : /^(?:NO|N)$/.test(t) ? "no" : null;
        if (v) found.push({ attr: "ecm", col, value: v, printed: text, rule: "enum.ecm", rank: 0 });
        break;
      }
      case "control": {
        if (!col.cell) break;
        const t = text.toUpperCase().trim();
        if (!ctx.attrs.has("control") && ctx.attrs.has("vfd") && /^(?:CONSTANT(?:\s+(?:SPEED|VOLUME))?|C\.?V\.?|NONE)$/.test(t)) {
          // Constant speed: a motor with no variable frequency drive.
          found.push({ attr: "vfd", col, value: "no", printed: text, rule: "enum.vfd_constant_speed", rank: 1 });
          break;
        }
        const speeds = t.match(/^(\d)\s*-?\s*SPEED$/);
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
        break;
      }
      case "controller": {
        // A CONTROLLER / STARTER (TYPE) column names the one device the motor
        // is started or run by, so the one it names rules the others out.
        if (!col.cell) break;
        const t = text.toUpperCase().replace(/\s+/g, " ").trim();
        const kind = /^(?:VFD|VSD|VARIABLE\s+(?:FREQUENCY|SPEED)\s+DRIVE)$/.test(t) ? "vfd"
          : /^(?:ECM?|EC\s+(?:MOTOR\s+)?CONTROLLER|ECM\s+CONTROLLER)$/.test(t) ? "ecm"
          : /^(?:(?:COMBINATION\s+|MAGNETIC\s+|MANUAL\s+|MOTOR\s+)?STARTER|MAG\.?\s+STARTER|FVNR|ACROSS\s+THE\s+LINE)$/.test(t) ? "starter" : null;
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
          : /^PARALLEL$/.test(t) ? "parallel" : /^STAND-?\s?BY$/.test(t) ? "standby" : /^DUTY$/.test(t) ? "duty" : null;
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
        const attr = s === "hw" ? pick(ctx, "hw_glycol_pct", "glycol_pct") : s === "chw" ? pick(ctx, "chw_glycol_pct", "glycol_pct") : pick(ctx, "glycol_pct");
        if (!attr) break;
        const t = text.toUpperCase().trim();
        if (q === "fluid" && /^WATER$/.test(t)) { found.push({ attr, col, value: 0, printed: text, rule: "fluid.water", rank: 0 }); break; }
        const m = t.match(/^(\d{1,2})\s*%\s*(?:PG|EG|P\.G\.|E\.G\.|PROPYLENE|ETHYLENE|GLYCOL)\b/);
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
      default:
        break;
    }
  }
  return { found, failed };
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

/** A terminal unit's type, where the words print it. */
function terminalTypeOf(t: string): string | null {
  if (/\bDUAL\s*-?\s*DUCT\b/.test(t)) return "dual_duct";
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
 * a floor. The level is returned in the key's spelling ("LEVEL 1"). */
function levelOf(text: string): string | null {
  const t = String(text ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (/\bROOF(?:TOP)?\b/.test(t)) return "ROOF";
  if (/\bBASEMENT\b/.test(t)) return "BASEMENT";
  if (/\bPENTHOUSE\b/.test(t)) return "PENTHOUSE";
  if (/\bATTIC\b/.test(t)) return "ATTIC";
  if (/\bMEZZ(?:ANINE)?\b/.test(t)) return "MEZZANINE";
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
  const hwCols = ["hw_gpm", "hw_ewt_f", "hw_lwt_f", "hw_mbh"].map((a) => values.get(a)).filter((c): c is Candidate => Boolean(c));
  const chwCols = ["chw_gpm", "chw_ewt_f", "chw_lwt_f"].map((a) => values.get(a)).filter((c): c is Candidate => Boolean(c));
  const ehCol = values.get("eh_kw");
  const heatSource = (): { value: string; col: Column; rule: string } | null => {
    // Two values of a hot-water block; for a unit that only heats, its water
    // flow alone (it heats with that water).
    const water = hwCols.length >= 2 ? hwCols[0] : HEATING_ONLY.has(ctx.family) && ctx.family !== "VAV" ? values.get("hw_gpm") ?? values.get("gpm") ?? null : null;
    if (water && !ehCol) return { value: "hw", col: water.col, rule: "derived.hw_coil_block" };
    if (ehCol && !water) return { value: "electric", col: ehCol.col, rule: "derived.electric_heat_kw" };
    return null;
  };
  if (ctx.attrs.has("heat_type")) {
    const s = heatSource();
    if (s) out.push({ attr: "heat_type", col: s.col, value: s.value, printed: s.col.cell?.text ?? "", rule: s.rule, rank: 0 });
  }
  if (ctx.attrs.has("heating_medium")) {
    const s = heatSource();
    const named = /\bELECTRIC\b/.test(title) ? "electric" : /\bSTEAM\b/.test(title) ? "steam" : /\bGAS\b/.test(title) ? "gas" : /\bHOT\s+WATER\b|\bHW\b/.test(title) ? "hw" : null;
    if (named && (!s || s.value === named)) out.push({ attr: "heating_medium", col: titleCol, value: named, printed: item.table_title, rule: "derived.title_names_medium", rank: 0 });
    else if (!named && s) out.push({ attr: "heating_medium", col: s.col, value: s.value, printed: s.col.cell?.text ?? "", rule: s.rule, rank: 0 });
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
    const dxHeader = ctx.cols.find((c) => W.dx.test(c.h) && c.cell);
    if (chwCols.length >= 2 && !dxHeader && !dxTitle) out.push({ attr: "cooling_type", col: chwCols[0].col, value: "chw", printed: chwCols[0].printed, rule: "derived.chw_coil_block", rank: 0 });
    else if (!chwCols.length && chwCoil && !dxHeader && !dxTitle) out.push({ attr: "cooling_type", col: chwCoil, value: "chw", printed: chwCoil.cell?.text ?? "", rule: "derived.chw_coil_named", rank: 0 });
    else if (!chwCols.length && !chwCoil && dxTitle) out.push({ attr: "cooling_type", col: titleCol, value: "dx", printed: item.table_title, rule: "derived.title_names_dx", rank: 0 });
    else if (!chwCols.length && !chwCoil && dxHeader) out.push({ attr: "cooling_type", col: dxHeader, value: "dx", printed: dxHeader.cell?.text ?? "", rule: "derived.dx_block", rank: 0 });
  }
  // Enums the table's own title states in so many words.
  const titled = (attr: string, value: string | null, rule: string) => {
    if (value && ctx.attrs.has(attr) && !values.has(attr)) out.push({ attr, col: titleCol, value, printed: item.table_title, rule, rank: 0 });
  };
  titled("terminal_type", terminalTypeOf(title), "derived.title_names_terminal_type");
  titled("condenser", /\bAIR\s*-?\s*COOLED\b/.test(title) ? "air" : /\bWATER\s*-?\s*COOLED\b/.test(title) ? "water" : null, "derived.title_names_condenser");
  if (/\bSTEAM\s+TO\s+(?:HOT\s+)?WATER\b/.test(title)) {
    // Steam heats the water it exchanges with: the load side is hot water.
    titled("primary_medium", "steam", "derived.title_names_steam_to_water");
    titled("secondary_medium", "hw", "derived.title_names_steam_to_water");
  }
  // A gas-fired unit: a gas input or firing-rate column with a value.
  const gasInput = ctx.cols.find((c) => c.cell && W.gas.test(c.h) && (quantitiesOf(c.h).includes("capacity") || /\bCFH\b|\bFIRING\b/.test(c.h))
    && parseNumberCell(c.cell.text) !== null);
  if (ctx.attrs.has("heating_type")) {
    const gasCol = values.get("gas_input_mbh") ?? ctx.cols.map((c) => (W.gas.test(c.h) && c.cell && quantitiesOf(c.h).includes("capacity") ? c : null)).find(Boolean);
    const water = hwCols.length >= 2 ? hwCols[0] : null;
    const hw = water?.col ?? hwCoil ?? null;
    const kinds = [hw && "hw", gasCol && "gas", ehCol && "electric"].filter(Boolean);
    if (kinds.length === 1) {
      const col = hw ? hw : gasCol ? ("col" in gasCol ? gasCol.col : gasCol) : ehCol!.col;
      out.push({ attr: "heating_type", col, value: kinds[0] as string, printed: col.cell?.text ?? "", rule: `derived.${kinds[0]}_heating_block`, rank: 0 });
    } else if (!kinds.length) {
      // A unit its type or title calls COOLING ONLY has no heat.
      const only = [titleCol, ...ctx.cols.filter((c) => c.cell && quantitiesOf(c.h).includes("type"))]
        .find((c) => /\bCOOLING\s+ONLY\b/i.test(c === titleCol ? item.table_title : c.cell!.text));
      if (only) out.push({ attr: "heating_type", col: only, value: "none", printed: only.cell?.text ?? "", rule: "derived.cooling_only", rank: 0 });
    }
  }
  const byGas = (attr: string, value: string, rule: string) => {
    if (gasInput && ctx.attrs.has(attr) && !values.has(attr)) out.push({ attr, col: gasInput, value, printed: gasInput.cell?.text ?? "", rule, rank: 0 });
  };
  byGas("fuel", "gas", "derived.gas_input_names_fuel");
  if (ctx.family === "HUMIDIFIER") byGas("humidifier_type", "gas_fired", "derived.gas_input_names_gas_fired");
  return out;
}

// ── 7. Stacked lines ────────────────────────────────────────────────────────

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

// ── 8. The table's notes ────────────────────────────────────────────────────

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
    return notes.filter((n) => cites.some((c) => c.ids.includes(n.id)));
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

function fromNotes(item: CompileItem, ctx: RowContext, table: TableContext | null, reasons: Map<string, UnknownAttribute>): Candidate[] {
  const byAttr = new Map<string, Array<{ value: string | number; note: ScheduleNote; rule: string }>>();
  for (const note of notesForRow(item, ctx, table?.notes ?? [], table?.rows)) {
    for (const v of noteValues(note, ctx.attrs)) {
      if (!byAttr.has(v.attr)) byAttr.set(v.attr, []);
      byAttr.get(v.attr)!.push({ value: v.value, note, rule: v.rule });
    }
  }
  const out: Candidate[] = [];
  for (const [attr, vs] of byAttr) {
    const col = (n: ScheduleNote): Column => ({ header: `(table note ${n.id})`, h: "", cell: { text: n.text, bbox: null }, order: -1 });
    if (attr === "control") {
      // Every cited control note, in note order: "A; B".
      const value = vs.map((v) => String(v.value)).join("; ");
      out.push({ attr, col: col(vs[0].note), value, printed: vs.map((v) => v.note.text).join(" | "), rule: "note.control", rank: 5 });
      continue;
    }
    const distinct = new Set(vs.map((v) => String(v.value)));
    if (distinct.size === 1) out.push({ attr, col: col(vs[0].note), value: vs[0].value, printed: vs[0].note.text, rule: vs[0].rule, rank: 5 });
    else reasons.set(attr, { reason: `notes ${vs.map((v) => v.note.id).join(", ")} state it differently` });
  }
  return out;
}

// ── 9. The row ──────────────────────────────────────────────────────────────

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
  const cols = columnsOf(item, table).filter((c) => !otherHalf(c.h, family, paired));
  const ctx: RowContext = {
    family, title: item.table_title ?? "", attrs: new Set(attrs), cols, defaultWater: null,
    hasWaterSide: cols.some((c) => quantitiesOf(c.h).some((q) => q === "waterflow" || q === "ewt" || q === "lwt" || q === "ewt_lwt")),
  };
  ctx.defaultWater = HEATING_ONLY.has(family) ? "hw" : family === "AIR_COOLED_CHILLER" ? "chw" : titleWater(ctx.title) ?? tableWater(cols) ?? (family === "HEAT_EXCHANGER" && cols.some((c) => W.steam.test(c.h)) ? "secondary" : null) ?? physicsWater(item, cols, family);

  const byAttr = new Map<string, Candidate[]>();
  const reasons = new Map<string, UnknownAttribute>();
  const differs = stackedLines(item, table);
  for (const col of cols) {
    const { found, failed } = candidatesOf(col, ctx, item);
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
  for (const n of fromNotes(item, ctx, table, reasons)) if (!chosen.has(n.attr)) chosen.set(n.attr, n);

  for (const [attr, c] of chosen) {
    result.attributes[attr] = {
      value: c.value,
      printed: c.printed,
      cite: { sheet: item.sheet_id, table_title: item.table_title, header: c.col.header, bbox: c.col.cell?.bbox ?? null },
      rule: c.rule,
    };
  }
  for (const attr of attrs) {
    if (result.attributes[attr]) continue;
    result.unknown[attr] = reasons.get(attr) ?? { reason: "no printed column answers it" };
  }
  return result;
}
