/** Shared, lossless spreadsheet transport for BAS review exports. No math. */
import { colLetter } from './xlsx.js';

export type BasWorkbookCell = string | number | null;
export type BasWorkbookSheet = { name: string; rows: BasWorkbookCell[][];
  presentation: { widths: number[]; freezeColumns?: number; filter?: boolean } };
export const BAS_XLSX_ROWS = 1048576;
export const BAS_XLSX_COLUMNS = 16384;

export function assertBasSheetSize(name: string, rows: number, columns: number) {
  if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(columns) || rows < 1 || columns < 1
    || rows > BAS_XLSX_ROWS || columns > BAS_XLSX_COLUMNS)
    throw new Error(`Engineering worksheet ${name} exceeds Excel's ${BAS_XLSX_ROWS} row / ${BAS_XLSX_COLUMNS} column limit; use the evidence JSON archive. No partial workbook was produced.`);
}

const xmlUnsafe = (s: string) => [...s].some(c => {
  const n = c.codePointAt(0)!;
  return (n < 32 && n !== 9 && n !== 10) || n === 127 || (n >= 0xd800 && n <= 0xdfff) || n === 0xfffe || n === 0xffff;
});
/** OOXML has its own _xHHHH_ escapes as well as XML. Encode underscores in
 * continuation JSON so literal user escape sequences round-trip in Excel. */
const asciiJson = (s: string) => JSON.stringify(s).replace(/[^\x20-\x7e]|_/g, // eslint-disable-line no-control-regex
  c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export function prepareBasWorkbook(sheets: BasWorkbookSheet[]): BasWorkbookSheet[] {
  const parts: BasWorkbookSheet = { name: 'Full text', rows: [['Text reference', 'Original cell', 'Part', 'Parts', 'JSON text part']],
    presentation: { widths: [20, 32, 9, 9, 80], freezeColumns: 1, filter: true } };
  let next = 0;
  const result = sheets.map(sheet => {
    assertBasSheetSize(sheet.name, sheet.rows.length, sheet.rows[0]?.length ?? 0);
    return { ...sheet, rows: sheet.rows.map((row, ri) => {
      assertBasSheetSize(sheet.name, ri + 1, row.length);
      return row.map((value, ci) => {
        // Continue very long passages before Excel's hard limit as well: the
        // 409-point row-height ceiling must not hide most of a source passage.
        const readableLimit = Math.min(32767, Math.max(8, (sheet.presentation.widths[ci] || 20) - 4) * 20);
        if (typeof value !== 'string' || (value.length <= readableLimit && (value.match(/\n/g)?.length ?? 0) <= 20
          && !xmlUnsafe(value) && !/_x[0-9a-f]{4}_/i.test(value))) return value;
        const id = `text-${++next}`, encoded = asciiJson(value), count = Math.ceil(encoded.length / 240);
        assertBasSheetSize(parts.name, parts.rows.length + count, 5);
        for (let i = 0; i < count; i++) parts.rows.push([id, `${sheet.name}!${colLetter(ci)}${ri + 1}`, i + 1, count, encoded.slice(i * 240, (i + 1) * 240)]);
        return `[Full text: ${id}]`;
      });
    }) };
  });
  return parts.rows.length > 1 ? [...result, parts] : result;
}

/** Lossless leaf presentation for known JSON contracts. Empty containers and
 * null are explicit rows, never omitted or substituted with a numeric zero. */
export function basExportLeaves(value: unknown, path = ''): Array<{ path: string; type: string; value: BasWorkbookCell }> {
  if (value === null) return [{ path, type: 'null', value: 'Unknown / not provided' }];
  if (typeof value !== 'object') return [{ path, type: typeof value, value: String(value) }];
  const entries = Object.entries(value);
  if (!entries.length) return [{ path, type: Array.isArray(value) ? 'array' : 'object', value: Array.isArray(value) ? '[]' : '{}' }];
  return entries.flatMap(([key, child]) => basExportLeaves(child, path ? `${path}.${key}` : key));
}
