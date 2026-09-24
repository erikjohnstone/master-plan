/** Byte-level filler for Siemens' "Global Valves" mass-sizing template
 * (`public/templates/Valve_Size_Template_US_Global.xlsx`, sheet "ValveTable").
 * This is a TEMPLATE FILL, not a workbook builder: the original file's
 * defined names, DomainValues/Constants lookup sheets, data-validation
 * dropdowns, merged header cells, and both password-hashed protection
 * elements (workbook structure + worksheet) are preserved byte-for-byte —
 * only the empty data rows (6+) inside sheet1.xml's <sheetData> are
 * replaced. No SheetJS/exceljs (see xlsx.js's own note); fflate only,
 * lazy-loaded the same way.
 *
 * Column order (A..L) is fixed by the template itself — never reorder:
 *   A Unit No. | B Location | C System | D Ports | E PN class | F Line Size
 *   | G Design flow rate V100 | H Consumer Δp | I Branch Δp | J Tolerance
 *   | K Positioning Signal | L Operating Voltage
 * C/D/E/K/L are Excel list-validated (System/Ports/PN class/Positioning
 * Signal/Operating Voltage) — a value written there that isn't one of the
 * template's own DomainValues/Constants strings still opens fine (Excel
 * validates on next interactive edit, not on file load) but won't match the
 * dropdown; callers should only pass values from VALVE_SIZE_DOMAIN_VALUES.
 */
import { escXml } from "./xlsx.js";

export const VALVE_SIZE_TEMPLATE_PUBLIC_PATH = "/templates/Valve_Size_Template_US_Global.xlsx";
export const VALVE_SIZE_TEMPLATE_ASSET_RELATIVE_PATH = "web/public/templates/Valve_Size_Template_US_Global.xlsx";
export const VALVE_SIZE_TEMPLATE_FILENAME = "Valve_Size_Template_US_Global.xlsx";
const SHEET_PART = "xl/worksheets/sheet1.xml";
const FIRST_DATA_ROW = 6;
const TEMPLATE_LAST_PREBUILT_ROW = 1010;
// K201:L1048576's own data validation in the original template points at
// DomainValues!#REF! (already broken in the source file) and the Ports (D)
// list validation switches to free-text "CbxTxt" at row 201 — rows beyond
// 200 still accept text, just without a working dropdown. Not this module's
// bug to fix; callers should know a valve list past this length loses
// dropdown support on Positioning Signal / Operating Voltage.
export const VALVE_SIZE_TEMPLATE_DROPDOWN_LAST_ROW = 200;
/** Data rows one workbook takes with every dropdown working (rows 6–200). */
export const VALVE_SIZE_TEMPLATE_ROWS_PER_FILE = VALVE_SIZE_TEMPLATE_DROPDOWN_LAST_ROW - FIRST_DATA_ROW + 1;

/** Exact controlled-vocabulary strings the template's own DomainValues /
 * Constants sheets define for each list-validated column — the only values
 * that land ON a real dropdown entry instead of just being accepted as free
 * text. Sourced directly from the shipped template, not invented. */
export const VALVE_SIZE_DOMAIN_VALUES = {
  system: ["PCHW", "SCHW", "PHHW", "SHHW", "STEAM"],
  ports: ["2-Way Normally closed", "2-Way Normally open", "3-Way Mixing"],
  pnClass: ["ANSI 125", "ANSI 250"],
  positioningSignal: ["0...10 Vdc", "Floating control"],
  operatingVoltage: ["24 VAC"],
};

/** One ValveTable row, columns A..L. Every field optional/null = left
 * blank — never invent a value to fill a cell (see valveSizeExport.ts,
 * which is the only intended source of these rows). Text fields SHOULD be
 * one of VALVE_SIZE_DOMAIN_VALUES' own strings for that column; numeric
 * fields are plain numbers in the template's already-selected units
 * (in / USgpm / psi / %). */
export interface ValveSizeRow {
  unitNo?: string | null;
  location?: string | null;
  system?: string | null;
  ports?: string | null;
  pnClass?: string | null;
  lineSizeIn?: number | null;
  designFlowRateGpm?: number | null;
  consumerDpPsi?: number | null;
  branchDpPsi?: number | null;
  tolerancePct?: number | null;
  positioningSignal?: string | null;
  operatingVoltage?: string | null;
}

const COLUMN_KEYS = [
  "unitNo", "location", "system", "ports", "pnClass", "lineSizeIn",
  "designFlowRateGpm", "consumerDpPsi", "branchDpPsi", "tolerancePct",
  "positioningSignal", "operatingVoltage",
];
const COLUMN_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
// Style indices lifted verbatim from the template's own row 7 (a
// representative pre-built empty data row) — cosmetic border/fill only,
// invisible to both Excel's data validation and the Siemens sizing tool
// that reads this file. C/D/E/K carry no explicit <c> in that row at all
// (they fall back to the column's own default style); omitting `s` for
// those below reproduces that exactly, not a shortcut.
const ROW_STYLE: Record<string, string> = { A: "45", B: "2", F: "2", G: "13", H: "2", I: "2", J: "2", L: "6" };

function cellXml(col: string, row: number, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null; // sparse — matches the template's own empty-cell convention
  const ref = `${col}${row}`;
  const style = ROW_STYLE[col];
  const sAttr = style ? ` s="${style}"` : "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return `<x:c r="${ref}"${sAttr}><x:v>${value}</x:v></x:c>`;
  }
  const text = escXml(String(value));
  return `<x:c r="${ref}"${sAttr} t="inlineStr"><x:is><x:t xml:space="preserve">${text}</x:t></x:is></x:c>`;
}

function rowXml(rowNumber: number, row: ValveSizeRow): string {
  const cells: string[] = [];
  for (let i = 0; i < COLUMN_LETTERS.length; i++) {
    const cell = cellXml(COLUMN_LETTERS[i], rowNumber, (row as Record<string, string | number | null | undefined>)[COLUMN_KEYS[i]]);
    if (cell) cells.push(cell);
  }
  return `<x:row r="${rowNumber}" spans="1:12" x14ac:dyDescent="0.25">${cells.join("")}</x:row>`;
}

/**
 * Fill the Siemens ValveTable template with `rows`, one row per valve,
 * starting at the template's own first data row (6). Every other part of
 * the workbook — DomainValues, Constants, defined names, styles, both
 * protection elements, merged header cells — is carried through unchanged.
 * @param {Uint8Array} templateBytes the original template's exact bytes (read
 *   from VALVE_SIZE_TEMPLATE_PUBLIC_PATH in the browser or
 *   VALVE_SIZE_TEMPLATE_ASSET_RELATIVE_PATH on disk — never regenerated)
 * @param {ValveSizeRow[]} rows
 * @returns {Promise<Uint8Array>} the filled .xlsx
 */
export async function fillValveSizeTemplate(templateBytes: Uint8Array, rows: ValveSizeRow[]): Promise<Uint8Array> {
  const { unzipSync, zipSync } = await import("fflate"); // lazy — same pattern as xlsx.js/ingest.js
  const files = unzipSync(templateBytes);
  const sheetPart = files[SHEET_PART];
  if (!sheetPart) {
    throw new Error(`Valve size template is missing ${SHEET_PART} — not the expected ValveTable workbook (wrong file, or the template's own sheet order changed)`);
  }
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();
  let xml = decoder.decode(sheetPart);
  if (!xml.includes("<x:sheetData>") || !xml.includes("</x:sheetData>")) {
    throw new Error("Valve size template's ValveTable sheet has no <sheetData> — unexpected template shape");
  }
  // Remove every pre-built placeholder row at/after the first data row so
  // the rows we write are the ONLY <x:row> elements at those numbers —
  // Excel treats a duplicate row number as a corrupt file. Rows 1-5 (title,
  // section headers, column headers, unit row) are left untouched. Handles
  // both self-closing (<x:row .../>) and open/close (<x:row ...>...</x:row>)
  // forms — real rows in this template are never nested, so the lazy
  // "up to the next </x:row>" match is always this row's own close.
  xml = xml.replace(/<x:row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/x:row>)/g, (whole, rowNum) => (
    Number(rowNum) >= FIRST_DATA_ROW ? "" : whole
  ));
  const newRows = rows.map((row, i) => rowXml(FIRST_DATA_ROW + i, row)).join("");
  xml = xml.replace("</x:sheetData>", `${newRows}</x:sheetData>`);
  const lastRow = Math.max(TEMPLATE_LAST_PREBUILT_ROW, FIRST_DATA_ROW - 1 + rows.length);
  xml = xml.replace(/<x:dimension ref="A1:L\d+"\s*\/>/, `<x:dimension ref="A1:L${lastRow}" />`);
  return zipSync({ ...files, [SHEET_PART]: encoder.encode(xml) }, { level: 6 });
}

/**
 * The valve list as workbooks that each keep every row inside the template's
 * dropdown range (ASSEMBLIES goal WP7.3). A list that fits is one file with
 * the template's own name; a longer one is split in row order into
 * "…_part1of3.xlsx" and so on, every row written exactly once.
 */
export async function valveSizeTemplateFiles(templateBytes: Uint8Array, rows: ValveSizeRow[]): Promise<Array<{ filename: string; rows: number; bytes: Uint8Array }>> {
  const chunks: ValveSizeRow[][] = [];
  for (let i = 0; i < rows.length; i += VALVE_SIZE_TEMPLATE_ROWS_PER_FILE) chunks.push(rows.slice(i, i + VALVE_SIZE_TEMPLATE_ROWS_PER_FILE));
  if (!chunks.length) chunks.push([]);
  const base = VALVE_SIZE_TEMPLATE_FILENAME.replace(/\.xlsx$/, "");
  const out: Array<{ filename: string; rows: number; bytes: Uint8Array }> = [];
  for (let i = 0; i < chunks.length; i++) {
    out.push({
      filename: chunks.length === 1 ? VALVE_SIZE_TEMPLATE_FILENAME : `${base}_part${i + 1}of${chunks.length}.xlsx`,
      rows: chunks[i].length,
      bytes: await fillValveSizeTemplate(templateBytes, chunks[i]),
    });
  }
  return out;
}
