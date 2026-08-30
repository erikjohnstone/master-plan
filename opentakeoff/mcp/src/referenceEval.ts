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

export function scoreReference(referenceTables: ReferenceTable[], key: ReferenceKeyRow[]): ReferenceScore {
  const rows = new Map<string, Record<string, string>>();
  for (const table of referenceTables) {
    for (const row of table.rows) {
      rows.set(`${table.sheet}::${normalize(table.title)}::${normalize(row.key)}`, row.cells);
    }
  }

  const perCell = key.map((expected) => {
    const row = rows.get(`${expected.sheet}::${normalize(expected.table_title)}::${normalize(expected.row_key)}`);
    const actual = row ? (row[expected.column] ?? null) : null;
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
