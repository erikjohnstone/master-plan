// Pure scoring logic for reference-table corpus keys. Keeping this separate
// from scripts/reference-eval.mjs lets the combined takeoff evaluator score
// reference cells from the PlanSetTakeoff it already paid to build instead of
// loading and analyzing every PDF a second time.
import type { ReferenceTable } from "./takeoff.ts";

export interface ReferenceKeyRow {
  sheet: string;
  table_title: string;
  row_key: string;
  column: string;
  expected_value: string;
}

export interface ReferenceCellScore extends ReferenceKeyRow {
  actual: string | null;
  exact: boolean;
}

export interface ReferenceScore {
  perCell: ReferenceCellScore[];
  exactCount: number;
  total: number;
  exactPct: number;
}

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      if (quoted) {
        quoted = false;
      } else if (current.length === 0) {
        quoted = true;
      } else {
        // RFC-style quoting only starts at the beginning of a field. A quote
        // inside an unquoted value is literal engineering notation (107",
        // 33"), not a delimiter to silently discard.
        current += ch;
      }
      continue;
    }
    if (ch === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

export function parseReferenceKeyCsv(text: string): ReferenceKeyRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !/^\s*#/.test(line));
  if (lines.length < 2) return [];
  const headers = splitCsv(lines[0]).map((header) => header.trim().toLowerCase());
  const index = (name: string) => headers.indexOf(name);
  const sheet = index("sheet");
  const title = index("table_title");
  const rowKey = index("row_key");
  const column = index("column");
  const value = index("expected_value");
  return lines.slice(1).map((line) => {
    const cells = splitCsv(line);
    return {
      sheet: (cells[sheet] ?? "").trim(),
      table_title: (cells[title] ?? "").trim(),
      row_key: (cells[rowKey] ?? "").trim(),
      column: (cells[column] ?? "").trim(),
      expected_value: (cells[value] ?? "").trim(),
    };
  });
}

const normalize = (value: string | null | undefined): string =>
  (value || "").trim().toUpperCase().replace(/\s+/g, " ");

const tokens = (value: string): string[] => normalize(value).split(" ").filter(Boolean);

/** Find a column by name, tolerant of a MULTI-TIER header the extractor is
 * free to spell more precisely than the key does.
 *
 * A key is authored once, against one extractor's flattened header text
 * ("EWT °F"). A different extractor reading the same drawing can legitimately
 * recover the real grouped-header structure the sheet actually draws
 * ("WATERSIDE DATA EWT °F" over a tier of EWT/LWT/FLOW/PD columns) — that is
 * MORE correct, not a different answer. Measured on
 * federal-attachment4-mechanical.pdf#14's AIR HANDLING UNIT HYDRONIC COIL
 * SCHEDULE: every one of the ten cells the raw exact-string lookup reported
 * "(missing)" was present, correct, and in the right row — the key's "EWT °F"
 * simply did not string-match the table's own "WATERSIDE DATA EWT °F".
 *
 * Exact match (normalized) wins first. Failing that, a column whose header,
 * split into tokens, ends with the expected column's own tokens is accepted —
 * a real tier prefix, not a coincidence, because engineering headers repeat a
 * unit/abbreviation ("EWT °F") only under the tier that actually measures it.
 * If more than one column in the row satisfies that, the match is genuinely
 * ambiguous (e.g. two tiers each carrying their own "EWT °F") and is refused
 * rather than guessed — this can only ever RECOVER a false "(missing)", never
 * turn a real value into a different, wrong one.
 */
function findColumn(row: Record<string, string>, expectedColumn: string): string | null {
  const wantExact = normalize(expectedColumn);
  const wantTokens = tokens(expectedColumn);
  let match: string | null = null;
  for (const key of Object.keys(row)) {
    const keyExact = normalize(key);
    if (keyExact === wantExact) return row[key];
    const keyTokens = tokens(key);
    const isSuffix =
      wantTokens.length > 0 &&
      keyTokens.length > wantTokens.length &&
      keyTokens.slice(keyTokens.length - wantTokens.length).join(" ") === wantTokens.join(" ");
    if (isSuffix) {
      if (match != null && match !== key) return null; // ambiguous — refuse, do not guess
      match = key;
    }
  }
  return match != null ? row[match] : null;
}

export function scoreReference(referenceTables: ReferenceTable[], key: ReferenceKeyRow[]): ReferenceScore {
  const rows = new Map<string, Record<string, string>>();
  for (const table of referenceTables) {
    for (const row of table.rows) {
      rows.set(`${table.sheet}::${normalize(table.title)}::${normalize(row.key)}`, row.cells);
    }
  }

  const perCell = key.map((expected) => {
    const row = rows.get(`${expected.sheet}::${normalize(expected.table_title)}::${normalize(expected.row_key)}`);
    const actual = row ? findColumn(row, expected.column) : null;
    return {
      ...expected,
      actual,
      exact: actual != null && normalize(actual) === normalize(expected.expected_value),
    };
  });
  const exactCount = perCell.filter((cell) => cell.exact).length;
  return {
    perCell,
    exactCount,
    total: perCell.length,
    exactPct: perCell.length ? exactCount / perCell.length : 1,
  };
}
