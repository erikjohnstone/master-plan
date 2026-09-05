// Scoring logic for the recall-tier table key (mcp/scripts/table-recall-eval.mjs).
// Every other key in this project (takeoff, reference, rowsym) is scoped to
// tables the pipeline already found — a schedule sheetgraph.ts never sees at
// all cannot appear in any of them, so those keys measure precision and are
// structurally blind to recall. This is the tier that catches that miss: a
// human renders the sheet and writes down every schedule table they see,
// independent of what the pipeline extracted. Pulled out into its own module
// (not inlined into the CLI script the way graph-eval.mjs does it) so this
// comparison math gets a real regression test (test/tableRecallEval.test.ts)
// against a small synthetic key + synthetic graph, same discipline as
// takeoffEval.ts/referenceEval.ts. Nothing here talks to a Session, a PDF, or
// the filesystem — pure data in, pure data out.

export interface TableRecallKeyRow {
  sheet: string;
  table_title: string;
  note: string;
}

/** One real table sheetgraph.ts actually produced, as seen by the scorer —
 * deliberately just {sheet, title}, not a full ScheduleTable, so this module
 * never needs to import sheetgraph.ts's own types. */
export interface FoundTable {
  sheet: string;
  title: string;
}

export interface TableRecallRowScore extends TableRecallKeyRow {
  status: "FOUND" | "MISSED";
}

export interface TableRecallExtra {
  sheet: string;
  title: string;
}

export interface TableRecallScore {
  perTable: TableRecallRowScore[];
  extras: TableRecallExtra[];
  found: number;
  total: number;
  recallPct: number;
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

export function parseTableRecallKeyCsv(text: string, path = "<key>"): TableRecallKeyRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !/^\s*#/.test(line));
  if (lines.length < 2) return [];
  const headers = splitCsv(lines[0]).map((header) => header.trim().toLowerCase());
  const sheetIdx = headers.indexOf("sheet");
  const titleIdx = headers.indexOf("table_title");
  if (sheetIdx < 0 || titleIdx < 0) {
    throw new Error(`${path}: table-recall key is missing required column(s) — need "sheet" and "table_title", got: ${headers.join(", ") || "(no header row)"}`);
  }
  const noteIdx = headers.indexOf("note");
  return lines.slice(1).map((line) => {
    const cells = splitCsv(line);
    return {
      sheet: (cells[sheetIdx] ?? "").trim(),
      table_title: (cells[titleIdx] ?? "").trim(),
      note: (noteIdx >= 0 ? cells[noteIdx] ?? "" : "").trim(),
    };
  });
}

const normalize = (value: string | null | undefined): string =>
  (value || "").trim().toUpperCase().replace(/\s+/g, " ");

export function scoreTableRecall(foundTables: FoundTable[], key: TableRecallKeyRow[]): TableRecallScore {
  const byKey = new Map<string, FoundTable[]>();
  for (const table of foundTables) {
    const k = `${table.sheet}::${normalize(table.title)}`;
    const list = byKey.get(k);
    if (list) list.push(table);
    else byKey.set(k, [table]);
  }

  const matched = new Set<string>();
  const perTable = key.map((row) => {
    const k = `${row.sheet}::${normalize(row.table_title)}`;
    const hit = byKey.has(k);
    if (hit) matched.add(k);
    return { ...row, status: hit ? "FOUND" as const : "MISSED" as const };
  });

  // Extras are scoped to sheets the key actually reviewed — a sheet the key
  // never mentions was never looked at by a human, so a table found there
  // is neither confirmed nor an over-extraction; it is simply unscored.
  const keyedSheets = new Set(key.map((row) => row.sheet));
  const extras: TableRecallExtra[] = [];
  for (const [k, tables] of byKey) {
    if (matched.has(k)) continue;
    const [sheet] = k.split("::");
    if (!keyedSheets.has(sheet)) continue;
    for (const table of tables) extras.push({ sheet: table.sheet, title: table.title });
  }

  const found = perTable.filter((row) => row.status === "FOUND").length;
  return {
    perTable,
    extras,
    found,
    total: perTable.length,
    recallPct: perTable.length ? found / perTable.length : 1,
  };
}
