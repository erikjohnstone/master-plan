// Read-only audit against authored point-matrix modules; never edits keys or
// production graphs. Key coordinates are PDF points; graph coordinates are
// image pixels at the explicit scale passed by the caller.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const [keyDir, pdf, baselineFile, candidateFile, scaleArg, out] = process.argv.slice(2);
if (!out) throw new Error("usage: audit-bas-point-matrices.mjs KEY_DIR PDF BASELINE_GRAPH CANDIDATE_GRAPH IMAGE_SCALE OUTPUT_JSON");
const scale = Number(scaleArg);
if (!(scale > 0 && Number.isFinite(scale))) throw new Error("Invalid scale");
const read = path => JSON.parse(readFileSync(path, "utf8"));
const manifest = read(join(keyDir, "document_manifest.json"));
const sha256 = createHash("sha256").update(readFileSync(pdf)).digest("hex");
if (sha256 !== manifest.source_sha256) throw new Error("Source PDF/key identity mismatch");
const baseline = read(baselineFile), candidate = read(candidateFile);
const keys = manifest.module_sources.points.flatMap(name => read(join(keyDir, `${name}.json`)).tables);
const norm = value => String(value ?? "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();
const headerNorm = value => norm(value).replace(/_/g, "");
const page = sheet => Number(sheet.match(/#(\d+)$/)?.[1] ?? 1);
const inside = (x, y, box) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
const preservation = baseline.tables.map(table => {
  const matches = candidate.tables.filter(t => t.sheet === table.sheet && isDeepStrictEqual(t.region, table.region));
  return { sheet: table.sheet, title: table.title?.text, unchanged: matches.length === 1 && isDeepStrictEqual(table, matches[0]) };
});
function check(graph) {
  return keys.map(key => {
    const errors = [];
    const columns = key.columns.split("|");
    const x = (key.x_edges[0] + key.x_edges.at(-1)) / 2 * scale;
    const y = (key.y_ranges[0][0] + key.y_ranges.at(-1)[1]) / 2 * scale;
    const tables = graph.tables.filter(t => page(t.sheet) === key.page && inside(x, y, t.region));
    const result = { id: key.id, page: key.page, expected_rows: key.rows.length,
      expected_cells: key.rows.length * columns.length, matching_tables: tables.length,
      matched_rows: 0, matched_cells: 0, checked_nonempty_boxes: 0, errors };
    if (tables.length !== 1) { errors.push({ kind: "table_cardinality", actual: tables.length }); return result; }
    const table = tables[0];
    result.table_region = table.region;
    // Check the terminal labels position-by-position. A retained header row
    // is reported, not rewritten or counted as a point by this audit.
    const child = table.rows[0];
    const childLabels = table.headers.map(h => child?.cells[h]?.text ?? "");
    const hasChildHeader = childLabels.length === columns.length && childLabels.every((h, i) => headerNorm(h) === headerNorm(columns[i]));
    const labels = hasChildHeader ? childLabels : table.headers;
    result.retained_header_rows = hasChildHeader ? 1 : 0;
    if (labels.length !== columns.length || labels.some((h, i) => headerNorm(h) !== headerNorm(columns[i]))) {
      errors.push({ kind: "terminal_headers", expected: columns, actual: labels });
    }
    const actualRows = hasChildHeader ? table.rows.slice(1) : table.rows;
    if (actualRows.length !== key.rows.length) errors.push({ kind: "row_count", actual: actualRows.length });
    for (let r = 0; r < key.rows.length; r++) {
      const expected = key.rows[r].split("|");
      const rows = actualRows.filter(row => norm(row.cells[table.headers[0]]?.text) === norm(expected[0]));
      if (rows.length !== 1) { errors.push({ kind: "row_cardinality", row: r, tag: expected[0], actual: rows.length }); continue; }
      result.matched_rows++;
      for (let c = 0; c < columns.length; c++) {
        const cell = rows[0].cells[table.headers[c]];
        if (norm(cell?.text) === norm(expected[c])) result.matched_cells++;
        else errors.push({ kind: "cell_text", row: r, column: columns[c], expected: expected[c], actual: cell?.text ?? "" });
        if (!expected[c]) continue;
        if (!Array.isArray(cell?.bbox) || cell.bbox.length !== 4 || !cell.bbox.every(Number.isFinite)
            || cell.bbox[2] < cell.bbox[0] || cell.bbox[3] < cell.bbox[1]) {
          errors.push({ kind: "cell_box_missing_or_invalid", row: r, column: columns[c] });
          continue;
        }
        result.checked_nonempty_boxes++;
        const authoredBox = [key.x_edges[c] * scale, key.y_ranges[r][0] * scale,
          key.x_edges[c + 1] * scale, key.y_ranges[r][1] * scale];
        const cx = (cell.bbox[0] + cell.bbox[2]) / 2, cy = (cell.bbox[1] + cell.bbox[3]) / 2;
        if (!inside(cx, cy, authoredBox)) errors.push({ kind: "cell_box_center", row: r, column: columns[c], authored_box: authoredBox, actual: cell.bbox });
      }
    }
    return result;
  });
}
const before = check(baseline), after = check(candidate);
const regionKey = (sheet, region) => `${page(sheet)}|${region.join(",")}`;
const keyedRegions = after.filter(t => t.matching_tables === 1).map(t => `${t.page}|${t.table_region.join(",")}`);
const reusedKeyRegions = [...new Set(keyedRegions.filter((key, i) => keyedRegions.indexOf(key) !== i))];
const additionalUnkeyedTables = candidate.tables.filter(t =>
  !keyedRegions.includes(regionKey(t.sheet, t.region)) && !baseline.tables.some(b => isDeepStrictEqual(b, t)))
  .map(t => ({ sheet: t.sheet, title: t.title?.text, region: t.region }));
const total = values => ({ tables: values.filter(t => t.matching_tables === 1).length,
  matched_rows: values.reduce((s,t) => s+t.matched_rows,0),
  matched_cells: values.reduce((s,t) => s+t.matched_cells,0),
  errors: values.reduce((s,t) => s+t.errors.length,0) });
const report = { source_sha256: sha256, image_scale: scale,
  scope: "Authored printed rows/cells and approximate source-cell regions. Not physical I/O or installed quantities. NFKC, case and whitespace text normalization; missing cells compared with authored blanks. Every expected nonempty cell requires a finite ordered box whose center lies in its authored region. Header rows are reported separately, not repaired.",
  baseline: total(before), candidate: total(after), preservation,
  reused_key_regions: reusedKeyRegions, additional_unkeyed_tables: additionalUnkeyedTables, before, after };
writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ baseline: report.baseline, candidate: report.candidate,
  unchanged_tables: preservation.filter(p => p.unchanged).length, baseline_tables: preservation.length, out }));
process.exitCode = report.candidate.errors || preservation.some(p => !p.unchanged)
  || reusedKeyRegions.length || additionalUnkeyedTables.length ? 1 : 0;
