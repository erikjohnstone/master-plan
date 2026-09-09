// Source-key integrity only, not passing production equipment interpretation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (name: string) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const key = read('./fixtures/bas-equipment-system-cases.json');
const text = read('../../docs/bas-production/evidence/baseline/behavioral-text.json');

test('independent system-membership key addresses original schedule/list/operating-limit text', () => {
  assert.equal(text.sha256, key.source_sha256);
  const schedule = text.pages.find((p: any) => p.page === key.schedule_page);
  const applicability = text.pages.find((p: any) => p.page === key.applicability_page);
  const members: string[] = [];
  for (const entry of key.membership_cases) {
    assert.equal(applicability.spans[entry.span_index].str, entry.expression);
    assert.deepEqual(entry.schedule_span_indices.map((i: number) => schedule.spans[i].str), entry.members);
    members.push(...entry.members);
  }
  assert.equal(new Set(members).size, key.named_members);
  assert.equal(key.named_members, 14);
  for (const other of key.schedule_members_outside_this_matrix_scope) {
    assert.equal(schedule.spans[other.span_index].str, other.tag);
    assert.equal(members.includes(other.tag), false);
  }
  assert.equal(applicability.spans[key.non_equipment_quantity_reference.span_index].str, key.non_equipment_quantity_reference.text);
  assert.equal(applicability.spans[key.operating_limit_negative_control.span_index].str, key.operating_limit_negative_control.text);
  assert.equal(key.operating_limit_negative_control.simultaneous_operation_limit, 2);
  assert.equal(key.operating_limit_negative_control.scheduled_chiller_members, 3);
  assert.equal(key.installed_quantity, null);
});
