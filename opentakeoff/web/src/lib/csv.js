// CSV cell escaping — the one implementation behind totals.js and
// shapesExport.js — and the one RFC 4180 reader (leaf module: imports
// nothing).
//
// Formula-injection guard (#10): STRING cells starting `=` `+` `-` `@` or a
// tab get a leading `'` so spreadsheet apps render them as text instead of
// executing them. The typeof check runs BEFORE the String() coercion so
// numbers pass through untouched — a -12.5 deduct cell must stay -12.5, not
// become '-12.5. The prefix is applied BEFORE the quote test, so a
// formula-shaped cell that also contains a comma/quote gets the prefixed
// text quoted as a whole.
export const csvEsc = (v) => {
  const s = typeof v === "string"
    ? (/^[=+\-@\t]/.test(v) ? `'${v}` : v)
    : String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * RFC 4180 rows: quoted cells, doubled quotes, and rows ended by CRLF, LF or
 * CR. A leading byte-order mark is dropped. A formula guard (a leading ')
 * is kept: it is part of the cell as written.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const t = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
