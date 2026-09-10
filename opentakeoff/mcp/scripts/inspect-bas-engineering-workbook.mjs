// Read-only, independent artifact inspection of actual application output.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const [path, projectionPath, out] = process.argv.slice(2);
const projection = JSON.parse(await fs.readFile(projectionPath, 'utf8'));
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
await fs.mkdir(out, { recursive: true });
const observations = [];
for (const definition of projection.sheets) {
  const sheet = workbook.worksheets.getItem(definition.name);
  const rows = definition.rows, columns = Math.max(...rows.map(r => r.length));
  const actual = sheet.getRangeByIndexes(0, 0, rows.length, columns).values;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < columns; c++) {
    const expected = rows[r][c] ?? null, imported = actual[r]?.[c] ?? null;
    // Artifact Tool infers ISO timestamp inline strings as Date objects on
    // import. Compare their exact UTC representation, not JS runtime type.
    const value = imported instanceof Date ? imported.toISOString() : imported;
    assert.deepEqual(value, expected === '' ? null : expected, `${definition.name} row ${r + 1} column ${c + 1}`);
  }
  const formulas = sheet.getRangeByIndexes(0, 0, rows.length, columns).formulas;
  assert.ok(formulas.every(row => row.every(value => !value)), 'No formulas in saved engineering export');
  const range = `A1:${String.fromCharCode(64 + Math.min(columns, definition.name === 'Review' ? 2 : 6))}${Math.min(rows.length, 12)}`;
  const preview = await workbook.render({ sheetName: definition.name, range, scale: 1.25, format: 'png' });
  await fs.writeFile(`${out}/${definition.name.replaceAll(' ', '-').toLowerCase()}.png`, new Uint8Array(await preview.arrayBuffer()));
  observations.push({ sheet: definition.name, rows: rows.length, columns, exact_cells_checked: rows.length * columns, preview_range: range });
  console.log(JSON.stringify(observations.at(-1)));
}
const errors = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 20 }, maxChars: 2000 });
await fs.writeFile(`${out}/verification.json`, JSON.stringify({ observations, formula_scan: errors.ndjson, engine: '@oai/artifact-tool import/inspect/render, read-only' }, null, 2));
console.log(errors.ndjson);
