import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBasEquipmentMembership as parse, parseBasPrintedCount } from '../src/lib/basEquipmentMembership.ts';
const key = JSON.parse(readFileSync(new URL('./fixtures/bas-equipment-system-cases.json', import.meta.url), 'utf8'));

test('independently reviewed system equipment lists resolve exact named membership, not installed counts', () => {
  for (const entry of key.membership_cases) {
    const result = parse(entry.expression);
    assert.equal(result.status, 'resolved');
    assert.equal(result.raw, entry.expression);
    assert.deepEqual(result.members, entry.members);
    assert.equal('installed_quantity' in result, false);
  }
  assert.equal(parse(key.non_equipment_quantity_reference.text).members, null);
  assert.equal(parse(key.operating_limit_negative_control.text).members, null);
});

test('literal tags/lists/ranges preserve suffixes and explicit padding without dropping members', () => {
  const cases: [string, string[]][] = [
    ['  ahu - 001 ', ['AHU-001']], ['AHU1', ['AHU1']], ['AHU-A-1B', ['AHU-A-1B']],
    ['AHU-01, AHU-1', ['AHU-01', 'AHU-1']],
    ['EF-1 & EF-2; EF-3 AND EF-4', ['EF-1', 'EF-2', 'EF-3', 'EF-4']],
    ['VAV-008 through VAV-011', ['VAV-008', 'VAV-009', 'VAV-010', 'VAV-011']],
    ['AHU-9 to AHU-11', ['AHU-9', 'AHU-10', 'AHU-11']],
    ['F1-AHU-1A thru F1-AHU-3A', ['F1-AHU-1A', 'F1-AHU-2A', 'F1-AHU-3A']],
    ['EF-0', ['EF-0']], ['AHU-1 THRU AHU-1', ['AHU-1']],
  ];
  for (const [raw, members] of cases) assert.deepEqual(parse(raw).members, members, raw);
});

test('explicit exceptions retain their evidence and subtract only established members', () => {
  const result = parse('VAV-01 THRU VAV-05 EXCEPT VAV-02, VAV-04');
  assert.deepEqual(result.members, ['VAV-01', 'VAV-03', 'VAV-05']);
  assert.deepEqual(result.exclusions, ['VAV-02', 'VAV-04']);
  assert.deepEqual(parse('AHU-1 EXCEPT AHU-1').members, [], 'An explicitly emptied set is distinct from an unknown set');
  assert.equal(parse('AHU-1 EXCEPT AHU-2').reason, 'excluded_member_not_included');
});

test('partial, duplicate, alternative and incompatible expressions refuse atomically', () => {
  const cases = [
    '', 'REFRIGERANT MONITORING', '3', 'ONLY (2) CHILLERS SHALL OPERATE',
    'AHU-1 OR AHU-2', 'AHU-1/AHU-2', 'AHU-1, UNKNOWN', 'AHU-1,',
    'AHU-1 AND', 'AHU-1, AHU-1', 'AHU-1 THRU AHU-3, AHU-2',
    'AHU-1 EXCEPT AHU-1 EXCEPT AHU-2', 'AHU-1 EXCEPT AHU-1, AHU-1',
    'AHU-3 THRU AHU-1', 'AHU-01 THRU AHU-3', 'AHU-1 TO EF-3',
    'AHU-1A TO AHU-1C', 'AHU-1 TO AHU3', 'AHU-1 THRU 3',
    'AHU-1*', 'AHU-1 (TYP)', 'AHU-1-3', 'AHU--1',
    'AHU-1 THRU AHU-10001', 'AHU-9007199254740992',
    'AHU-1 TO AHU-2 TO AHU-3', 'NOT AHU-1', 'AHU-1 UNLESS AHU-2',
  ];
  for (const raw of cases) {
    const result = parse(raw);
    assert.equal(result.status, 'unresolved', raw);
    assert.equal(result.members, null, raw);
    assert.equal(result.exclusions, null, raw);
    assert.equal(result.raw, raw);
  }
});

test('bounded range expansion agrees with independently constructed member sets', () => {
  for (const prefix of ['AHU', 'P', 'EF', 'F2-VAV']) for (const start of [0, 1, 9, 98]) for (const size of [1, 2, 5, 20]) {
    const end = start + size - 1;
    assert.deepEqual(parse(`${prefix}-${start} THRU ${prefix}-${end}`).members,
      Array.from({ length: size }, (_, i) => `${prefix}-${start + i}`));
  }
});

test('strict printed quantity never substitutes a default one or an integer prefix', () => {
  for (const [raw, expected] of [['0', 0], [' 3 ', 3], ['003', 3], ['1,000', 1000], ['9,007,199,254,740,991', Number.MAX_SAFE_INTEGER]] as const) {
    assert.equal(parseBasPrintedCount(raw).value, expected);
  }
  for (const raw of ['', '3.5', '2 EA', '2*', '2-3', '3/2', '10,00', ',100', '1,000,00', '1e3', '-1', '+2', 'true', '9,007,199,254,740,992']) {
    assert.equal(parseBasPrintedCount(raw).value, null, raw);
  }
});
