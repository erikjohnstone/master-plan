// scheduleBrowse — the pure part of browsing the schedule index.
//
// The sheet graph already holds every table the engine found, every row, and
// every cell WITH ITS OWN BBOX (sheetgraph.ts TableCell). Nothing in the
// product ever let a person look at that: indexing finished and said
// "Indexed · schedules ready" in the status bar, and the tables were reachable
// only by asking the agent for one.
//
// This module is the arithmetic that panel needs — title text, row geometry,
// counts, filtering — kept out of the component so it can be tested in node
// rather than through a browser.

/** A table's printed title, as a STRING, always.
 *
 *  `t.title?.text || t.title` looks right and is not: when a title cell is
 *  present but its text is EMPTY, `t.title.text` is "" — falsy — so the
 *  expression falls through and hands back the whole {sheet, text, bbox}
 *  object where every caller expects a string. Real, found live on
 *  03__vol1__27 sheet 16 (see TakeoffCanvas debugGraph's own note). Anything
 *  calling .toUpperCase() on that throws.
 */
export function tableTitleText(table) {
  const t = table?.title;
  if (typeof t === "string") return t;
  return (t && typeof t.text === "string" ? t.text : "") || "";
}

const isBbox = (b) => Array.isArray(b) && b.length === 4 && b.every((n) => Number.isFinite(n));

/** The union of a row's cell boxes — the row as drawn on the sheet.
 *  A row has no bbox of its own; it is exactly the extent of its cells. */
export function rowBbox(row) {
  const cells = row && row.cells ? Object.values(row.cells) : [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cells) {
    if (!isBbox(c?.bbox)) continue;
    const [a, b, cc, d] = c.bbox;
    if (Math.min(a, cc) < x0) x0 = Math.min(a, cc);
    if (Math.min(b, d) < y0) y0 = Math.min(b, d);
    if (Math.max(a, cc) > x1) x1 = Math.max(a, cc);
    if (Math.max(b, d) > y1) y1 = Math.max(b, d);
  }
  return Number.isFinite(x0) && x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
}

/** The sheet that CARRIES a row. Under a continuation this differs from the
 *  table's base sheet, and a citation must point at where the ink actually is
 *  (sheetgraph.ts TableRow: "the row's evidence must cite where the ink is"). */
export function rowSheet(table, row) {
  return row?.sheet || table?.sheet || "";
}

/** "file.pdf#12" → { file, page }. Page is 1 when the key carries no "#". */
export function splitSheetKey(key) {
  const s = String(key || "");
  const i = s.lastIndexOf("#");
  if (i < 0) return { file: s, page: 1 };
  const page = Number(s.slice(i + 1));
  return { file: s.slice(0, i), page: Number.isFinite(page) ? page : 1 };
}

/** Header counts for the panel: how many tables, over how many distinct
 *  sheets, holding how many rows in total. A continued table is ONE table
 *  (sheetgraph unions its parts) but touches every sheet its parts sit on. */
export function summarize(tables) {
  const list = Array.isArray(tables) ? tables : [];
  const sheets = new Set();
  let rows = 0;
  for (const t of list) {
    if (t?.sheet) sheets.add(t.sheet);
    for (const p of t?.parts || []) if (p?.sheet) sheets.add(p.sheet);
    rows += (t?.rows || []).length;
  }
  return { tables: list.length, sheets: sheets.size, rows };
}

/** Case- and space-insensitive substring match over the things an estimator
 *  would actually type: the printed title, the column names, the row keys, and
 *  the sheet key. An empty query matches everything. */
export function filterTables(tables, query) {
  const q = String(query || "").trim().toUpperCase().replace(/\s+/g, " ");
  const list = Array.isArray(tables) ? tables : [];
  if (!q) return list;
  const hit = (s) => String(s || "").toUpperCase().replace(/\s+/g, " ").includes(q);
  return list.filter((t) =>
    hit(tableTitleText(t))
    || hit(t?.sheet)
    // The panel prints the kind as a chip ("equipment"), so typing it has to
    // work. It did not, and a facet you can see but cannot search reads as
    // broken rather than as absent.
    || hit(t?.kind)
    || (t?.headers || []).some(hit)
    || (t?.rows || []).some((r) => hit(r?.key)));
}

/** Group tables by the sheet they sit on, in reading order, sheets in reading
 *  order too. A flat list of 24 schedules over 10 sheets is a scroll; the same
 *  24 under their sheet numbers is a set an estimator already knows how to
 *  read. */
export function groupBySheet(tables) {
  const out = [];
  const at = new Map();
  for (const t of readingOrder(tables)) {
    const key = t?.sheet || "";
    let g = at.get(key);
    if (!g) { g = { sheet: key, ...splitSheetKey(key), tables: [] }; at.set(key, g); out.push(g); }
    g.tables.push(t);
  }
  return out;
}

/** Columns worth showing beside a row key, best first.
 *
 *  The panel used to take the first three non-empty columns in header order.
 *  That is arbitrary: on a schedule whose first columns are LOCATION / SERVICE
 *  / QTY, the manufacturer and model an estimator is actually looking for fall
 *  outside the slice and the line reads as noise. These are the columns that
 *  identify or size a piece of equipment — the ones a person scans a schedule
 *  FOR — and anything unrecognised still follows in header order, so a schedule
 *  using none of this vocabulary degrades to exactly the old behaviour. */
const PREVIEW_RANK = [
  // what it is
  /^MANUFACTURER$|^MANUF/, /^MODEL/, /^SERIES$/, /^TYPE$/, /^SERVICE/, /^DESCRIPTION$/,
  // how big it is
  /\bCFM\b/, /\bTONS?\b/, /\bMBH\b/, /\bGPM\b/, /\bBHP\b|\bHP\b/, /\bKW\b/, /\bBTU/,
  /^SIZE|\bSIZE\b/, /^CAPACITY/, /\bVOLTS?\b|\bVOLTAGE\b/, /\bMCA\b/, /\bMOCP\b/,
  // where it is
  /^LOCATION$/, /^AREA$|^ROOM/, /^SERVES?$/,
];

export function previewColumns(headers, limit = 3) {
  const list = (Array.isArray(headers) ? headers : []).filter((h) => typeof h === "string" && h.trim());
  const norm = (h) => h.toUpperCase().replace(/\s+/g, " ").trim();
  const score = (h) => {
    const n = norm(h);
    const i = PREVIEW_RANK.findIndex((re) => re.test(n));
    return i < 0 ? PREVIEW_RANK.length : i;
  };
  return [...list]
    .map((h, i) => ({ h, i, s: score(h) }))
    .sort((a, b) => (a.s - b.s) || (a.i - b.i))
    .slice(0, limit)
    .sort((a, b) => a.i - b.i)          // print them in the schedule's own order
    .map((x) => x.h);
}

/** Stable identity for a table across re-renders and re-indexes: a table is
 *  its sheet plus its region. Two tables never share both. */
export function tableId(table) {
  const r = table?.region;
  return `${table?.sheet || "?"}@${isBbox(r) ? r.map((n) => Math.round(n)).join(",") : "?"}`;
}

/** Sort for reading: by sheet page, then down the sheet. An estimator flips
 *  through a set front to back, not in whatever order extraction emitted. */
export function readingOrder(tables) {
  return [...(Array.isArray(tables) ? tables : [])].sort((a, b) => {
    const pa = splitSheetKey(a?.sheet), pb = splitSheetKey(b?.sheet);
    if (pa.file !== pb.file) return pa.file < pb.file ? -1 : 1;
    if (pa.page !== pb.page) return pa.page - pb.page;
    const ya = isBbox(a?.region) ? a.region[1] : 0, yb = isBbox(b?.region) ? b.region[1] : 0;
    return ya - yb;
  });
}
