import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { prepareBasWorkbook, basExportLeaves, assertBasSheetSize, type BasWorkbookSheet } from '../src/lib/basWorkbook.ts';
import { buildXlsx, sheetXml } from '../src/lib/xlsx.js';

const sheet = (values: string[]): BasWorkbookSheet => ({ name: 'Inputs', rows: [['Value'], ...values.map(v => [v])], presentation: { widths: [50], freezeColumns: 0, filter: true } });
test('long, multiline, XML control, Unicode and literal OOXML escape text recover exactly', () => {
  const originals = ['Ω😀abc'.repeat(8000), 'a\n'.repeat(300), 'a\rb\u0000\u007f\ufffe\uffffc\ud800', '_x0041_ and _x005F_ and \\u005f', 'a'.repeat(32768)];
  const input = sheet(originals), before = structuredClone(input), result = prepareBasWorkbook([input]);
  assert.deepEqual(input, before);
  const parts = result.at(-1)!;
  assert.equal(parts.name, 'Full text');
  originals.forEach((original, i) => {
    const id = `text-${i + 1}`;
    assert.equal(result[0].rows[i + 1][0], `[Full text: ${id}]`);
    const rows = parts.rows.slice(1).filter(r => r[0] === id);
    assert.ok(rows.length);
    rows.forEach((r, n) => { assert.equal(r[1], `Inputs!A${i + 2}`); assert.equal(r[2], n + 1); assert.equal(r[3], rows.length); assert.ok(String(r[4]).length <= 240); assert.doesNotMatch(String(r[4]), /[^\x20-\x7e]|_x[0-9a-f]{4}_/i); }); // eslint-disable-line no-control-regex
    assert.equal(JSON.parse(rows.map(r => r[4]).join('')), original);
  });
});
test('exact decimals and formula-like strings stay inert inline text in actual workbook bytes', async () => {
  const values = ['10000000000000000001.123456789012345678', '=HYPERLINK("https://invalid.test","x")', '+1', '-2', '@SUM(A1)', '0.000000000000000001', 'Ω😀'];
  const book = prepareBasWorkbook([sheet(values)]), files = unzipSync(await buildXlsx(book));
  const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.doesNotMatch(xml, /<f[ >]|<v>/);
  assert.match(xml, /10000000000000000001\.123456789012345678/);
  assert.match(xml, /t="inlineStr"/); assert.match(xml, /HYPERLINK/);
  assert.match(xml, /state="frozen"/); assert.match(xml, /<autoFilter ref="A1:A8"/); assert.match(xml, /width="50"/);
  assert.equal(book.length, 1);
});
test('leaf export keeps null, zero, false, empty lists/objects and original type separate', () => {
  assert.deepEqual(basExportLeaves({ a: null, b: 0, c: false, d: [], e: {}, f: '', g: ['0.100000000000000001'] }), [
    { path: 'a', type: 'null', value: 'Unknown / not provided' }, { path: 'b', type: 'number', value: '0' },
    { path: 'c', type: 'boolean', value: 'false' }, { path: 'd', type: 'array', value: '[]' },
    { path: 'e', type: 'object', value: '{}' }, { path: 'f', type: 'string', value: '' },
    { path: 'g.0', type: 'string', value: '0.100000000000000001' },
  ]);
});
test('worksheet overflow is an explicit refusal, not a partial workbook', () => {
  assert.doesNotThrow(() => assertBasSheetSize('Inputs', 1048576, 16384));
  for (const [rows, cols] of [[1048577, 1], [1, 16385], [0, 1], [1, 0], [Infinity, 1]])
    assert.throws(() => assertBasSheetSize('Inputs', rows, cols), /Inputs.*No partial workbook/);
});
test('legacy worksheet XML remains byte-identical when presentation is absent', () => {
  assert.equal(sheetXml([['Header', 'Value'], ['A & B', 12], [null, ' x ']]),
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Header</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>A &amp; B</t></is></c><c r="B2"><v>12</v></c></row><row r="3"><c r="B3" t="inlineStr"><is><t xml:space="preserve"> x </t></is></c></row></sheetData></worksheet>');
});
