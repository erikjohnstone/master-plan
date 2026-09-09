import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBasSourceContext } from '../src/lib/basSources.ts';
import { buildBasEquipmentCandidates, captureBasEquipmentTables, equipmentIdentityPayload } from '../src/lib/basEquipmentEvidence.ts';

const box = [10, 10, 20, 20] as [number, number, number, number];
const sources = buildBasSourceContext([{ sha256: 'a'.repeat(64), name: 'x.pdf', byte_length: 100, page_count: 2,
  pages: [1, 2].map(n => ({ page_number: n, sheet_key: n === 1 ? 'x.pdf' : 'x.pdf#2', width_px: 100,
    height_px: 100, rotation: 0, spans: [{ str: 'AHU-1', x0: 10, y0: 10, x1: 20, y1: 20 }] })) }]);
function table() {
  return { kind: 'equipment', sheet: 'x.pdf', title: { sheet: 'x.pdf', text: 'AIR HANDLER SCHEDULE', bbox: box },
    headers: ['TAG NO.', 'QTY'], region: box,
    rows: [{ key: 'UNTRUSTED-KEY', sheet: 'x.pdf', cells: { 'TAG NO.': { text: 'AHU-1', bbox: box }, QTY: { text: '1', bbox: box } } }] };
}
const view = (tables: unknown[]) => buildBasEquipmentCandidates(sources, captureBasEquipmentTables(tables));

test('literal schedule fields survive without row-key substitution or installed assertions', async () => {
  const raw = table(), before = structuredClone(raw);
  const result = await view([raw]);
  assert.deepEqual(result.tables[0].raw, raw);
  assert.deepEqual(raw, before);
  const row = result.tables[0].rows[0];
  assert.deepEqual(row.membership?.members, ['AHU-1']);
  assert.equal(row.printed_quantity?.value, 1);
  assert.equal(row.named_member_count, 1);
  assert.equal(row.installed_quantity, null);
  assert.equal(row.scope_status, 'not_established');
  assert.deepEqual(row.issues, []);
  assert.equal(row.page_id, `sha256:${'a'.repeat(64)}:p1`);
});

test('missing/ambiguous designation and quantities remain visible; component quantities never become units', async () => {
  const raw = table();
  raw.rows[0].cells.QTY.text = '3.5';
  assert.equal((await view([raw])).tables[0].rows[0].printed_quantity?.value, null);
  raw.rows[0].cells.QTY.text = '0';
  let row = (await view([raw])).tables[0].rows[0];
  assert.equal(row.printed_quantity?.value, 0);
  assert.ok(row.issues.includes('named_members_differ_from_printed_count'));
  raw.headers = ['TAG NO.', 'FANS (QTY.)'];
  row = (await view([raw])).tables[0].rows[0];
  assert.equal(row.printed_quantity, null);
  raw.headers = ['MODEL', 'FANS (QTY.)'];
  row = (await view([raw])).tables[0].rows[0];
  assert.equal(row.membership, null); assert.equal(row.named_member_count, null);
  assert.ok(row.issues.includes('missing_mark_column'));
  raw.headers = ['TAG NO.', 'MARK', 'QTY', 'QUANTITY'];
  row = (await view([raw])).tables[0].rows[0];
  assert.deepEqual(row.issues, ['ambiguous_mark_columns', 'ambiguous_quantity_columns']);
  assert.equal(row.membership, null); assert.equal(row.printed_quantity, null);
});

test('continuations own their original page; foreign rows cannot borrow the base sheet', async () => {
  const raw = table(); raw.rows[0].sheet = 'x.pdf#2';
  const result = await view([raw]);
  assert.equal(result.tables[0].rows[0].page_id, `sha256:${'a'.repeat(64)}:p2`);
  raw.rows[0].sheet = 'foreign.pdf';
  const row = (await view([raw])).tables[0].rows[0];
  assert.equal(row.page_id, null); assert.ok(row.issues.includes('unowned_row_source'));
});

test('duplicate tables and same tag in different buildings remain separate source occurrences', async () => {
  const raw = table();
  const repeated = await view([raw, structuredClone(raw)]);
  assert.notEqual(repeated.tables[0].rows[0].occurrence_id, repeated.tables[1].rows[0].occurrence_id);
  repeated.tables.forEach(t => assert.ok(t.rows[0].issues.includes('duplicate_source_table')));
  const separate = await view([{ ...raw, building: 'A' }, { ...raw, building: 'B' }]);
  assert.notEqual(separate.tables[0].table_id, separate.tables[1].table_id);
  assert.deepEqual(separate.tables.map(t => t.rows[0].building_hint), ['A', 'B']);
  separate.tables.forEach(t => assert.equal(t.rows[0].scope_status, 'not_established'));
});

test('alias rename/table reorder preserve source identities and original cells; changed evidence does not', async () => {
  const raw = table(), evidence = captureBasEquipmentTables([raw]);
  const renamed = structuredClone(sources);
  renamed.documents[0].names = ['other.pdf']; renamed.pages.forEach((p, i) => { p.sheet_keys = [i ? 'other.pdf#2' : 'other.pdf']; });
  const other = structuredClone(evidence);
  other.tables[0].sheet = 'other.pdf'; other.tables[0].title!.sheet = 'other.pdf'; other.tables[0].rows[0].sheet = 'other.pdf';
  assert.deepEqual(equipmentIdentityPayload(other, renamed), equipmentIdentityPayload(evidence, sources));
  const a = await buildBasEquipmentCandidates(sources, evidence), b = await buildBasEquipmentCandidates(renamed, other);
  assert.equal(a.tables[0].table_id, b.tables[0].table_id);
  const unrelated = table(); unrelated.title.text = 'UNRELATED';
  assert.equal((await view([unrelated, raw])).tables[1].table_id, a.tables[0].table_id);
  other.tables[0].rows[0].cells['TAG NO.'].text = 'AHU-2';
  assert.notEqual((await buildBasEquipmentCandidates(renamed, other)).tables[0].table_id, a.tables[0].table_id);
});

test('non-equipment tables stay excluded; malformed source cells fail instead of silently losing evidence', async () => {
  const raw = table();
  assert.equal((await view([{ ...raw, kind: 'reference' }, { ...raw, kind: 'room-finish' }])).tables.length, 0);
  assert.throws(() => captureBasEquipmentTables([{ ...raw, region: [20, 10, 10, 20] }]), /Unordered/);
  assert.throws(() => captureBasEquipmentTables([{ ...raw, unknown: NaN }]), /finite JSON/);
});

test('real Behavioral schedule candidates include all independently keyed system members without promoting other fields', async () => {
  const evidenceRoot = new URL('../../docs/bas-production/evidence/', import.meta.url);
  const graph = JSON.parse(readFileSync(new URL('point-routing-ab-final/22__vol2__012-candidate-cold.json', evidenceRoot), 'utf8'));
  const raw = JSON.parse(readFileSync(new URL('baseline/behavioral-text.json', evidenceRoot), 'utf8'));
  const key = JSON.parse(readFileSync(new URL('./fixtures/bas-equipment-system-cases.json', import.meta.url), 'utf8'));
  const name = raw.source.split('/').at(-1);
  const context = buildBasSourceContext([{ name, sha256: key.source_sha256, byte_length: 21875354,
    page_count: raw.pages.length, pages: raw.pages.map((p: any) => ({ page_number: p.page,
      sheet_key: `${name}${p.page === 1 ? '' : `#${p.page}`}`, width_px: p.width, height_px: p.height, rotation: 0, spans: p.spans })) }]);
  const tables = captureBasEquipmentTables(graph.tables);
  assert.deepEqual(tables.tables, graph.tables.filter((t: any) => t.kind === 'equipment'));
  const result = await buildBasEquipmentCandidates(context, tables);
  const rows = result.tables.flatMap(t => t.rows);
  for (const entry of key.membership_cases) for (const tag of entry.members) {
    const matches = rows.filter(r => r.membership?.members?.includes(tag));
    assert.equal(matches.length, 1, tag);
    assert.equal(matches[0].page_id, `sha256:${key.source_sha256}:p19`);
    assert.equal(matches[0].installed_quantity, null);
    assert.equal(matches[0].printed_quantity, null, 'No implicit one or component fan count');
  }
  for (const entry of key.schedule_members_outside_this_matrix_scope) assert.equal(rows.filter(r => r.membership?.members?.includes(entry.tag)).length, 1);
  const unresolvedVfd = result.tables.find(t => t.raw.title?.text === 'VFD SCHEDULE:')!;
  assert.equal(unresolvedVfd.rows[0].membership?.status, 'unresolved', 'Existing merged VFD cell is not replaced by its tempting row key');
  assert.ok(result.tables.every(t => t.raw.title?.text !== key.point_matrix_title));
});
