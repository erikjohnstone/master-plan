import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basProjectReview, basProjectReviewSchema } from '../src/lib/basProjectReview.ts';
import { basProjectIssuePolicy, basProjectIssueCatalogKeys } from '../src/lib/basProjectIssueCatalog.ts';
import { engineeringFixture, uuid } from './helpers/basEngineeringFixture.ts';
import { captureBasEvidence } from '../src/lib/basWorkflow.ts';
import { applyBasEquipmentReview } from '../src/lib/basEquipmentReview.ts';
import type { BasEquipmentRegister } from '../src/lib/basEquipmentRegister.ts';

test('shared queue preserves all five independent responsibility activities, exact source and durable state', async () => {
  const f = await engineeringFixture({ withSequence: true }), before = structuredClone(f.workflow);
  const view = await basProjectReview(f.workflow, f.workflow.current_capture_id!);
  const unknown = view.issues.filter(i => i.code === 'responsibility_unknown');
  assert.equal(unknown.length, 10, 'Two components, five independent activities each');
  for (const activity of ['furnish', 'install', 'wire', 'program', 'test']) assert.equal(unknown.filter(i => i.subject.id.endsWith(`:${activity}`)).length, 2);
  assert.ok(unknown.every(i => i.equipment_ids.length === 1 && i.equipment_ids[0] === uuid(11)));
  const clause = view.issues.find(i => i.code === 'partially_interpreted_clause')!;
  assert.ok(clause);
  const source = f.source.pages[0].spans.at(-1)!;
  assert.deepEqual(clause.evidence, [{ page_id: f.source.pages[0].page_id, span_id: source.span_id, bbox_px: source.bbox_px, text: source.text }]);
  assert.equal(view.readiness, 'not_evaluated'); assert.equal(view.project_complete, false);
  assert.equal(view.calculation_verification, 'saved_results_not_python_replayed');
  assert.equal(view.source_availability, 'not_byte_verified');
  assert.deepEqual(f.workflow, before); assert.deepEqual(await basProjectReview(f.workflow, f.workflow.current_capture_id!), view);
  assert.equal(new Set(view.issues.map(i => i.occurrence_id)).size, view.issues.length);
  assert.ok(view.issues.every(i => i.known_code));
});

test('unknown upstream code is visible and blocking; inspection does not invent a missing capability', async () => {
  const f = await engineeringFixture(), points = structuredClone(f.capture.points);
  points.issues.push('FUTURE_POINT_CONFLICT');
  const workflow = await captureBasEvidence(f.source, points);
  const view = await basProjectReview(workflow, workflow.current_capture_id!);
  const future = view.issues.find(i => i.code === 'FUTURE_POINT_CONFLICT')!;
  assert.equal(future.known_code, false); assert.equal(future.severity, 'blocker');
  assert.ok(view.issues.some(i => i.code === 'equipment_capture_unavailable'));
  assert.equal(view.readiness, 'not_evaluated');
  assert.equal(basProjectIssuePolicy('engineering', '__proto__').known_code, false);
  assert.equal(basProjectIssuePolicy('engineering', 'constructor').severity, 'blocker');
  assert.equal(basProjectReviewSchema.safeParse({ ...view, readiness: 'approved_for_scope' }).success, false);
});

test('changed scope creates changed finding input without hiding stale assembly decisions', async () => {
  const f = await engineeringFixture();
  const edit: BasEquipmentRegister = structuredClone(f.equipment); edit.scopes[0].building = null;
  const first = await applyBasEquipmentReview(f.workflow, { operation_id: uuid(70), capture_id: f.workflow.current_capture_id,
    expected_head: f.workflow.equipment_events!.at(-1)!.event_id, reason: 'Controlled unknown building', register: edit }, 'operator_input');
  const one = await basProjectReview(first, first.current_capture_id!);
  const issue = one.issues.find(i => i.code === 'scope_partly_unknown')!;
  assert.deepEqual(issue.equipment_ids, [uuid(11), uuid(12)]);
  assert.ok(one.issues.some(i => i.code === 'assembly_stale_dependencies'));
  edit.scopes[0].system = 'Changed declared system';
  const second = await applyBasEquipmentReview(first, { operation_id: uuid(71), capture_id: first.current_capture_id,
    expected_head: first.equipment_events!.at(-1)!.event_id, reason: 'Controlled changed relevant input', register: edit }, 'operator_input');
  const changed = (await basProjectReview(second, second.current_capture_id!)).issues.find(i => i.code === 'scope_partly_unknown')!;
  assert.equal(changed.issue_key, issue.issue_key); assert.notEqual(changed.occurrence_id, issue.occurrence_id);
});

test('foreign capture or corrupted evidence rejects rather than returning a green empty view', async () => {
  const f = await engineeringFixture();
  await assert.rejects(basProjectReview(f.workflow, '0'.repeat(64)), /retained BAS capture/);
  const bad = structuredClone(f.workflow); bad.captures[0].narrative_sources!.pages[0].spans[0].text = 'substituted';
  await assert.rejects(basProjectReview(bad, bad.current_capture_id!));
});

test('catalog explicitly covers literal emitted point, assembly, equipment and engineering finding codes', () => {
  const keys = new Set(basProjectIssueCatalogKeys());
  for (const [domain, path, pattern] of [
    ['points', '../../bas_engine/point_lists.py', /(?:issues|row_issues)\.append\("([A-Z_]+)"\)/g],
    ['assemblies', '../../bas_engine/assemblies.py', /issues\.append\("([A-Z_]+)"\)/g],
    ['assemblies', '../src/lib/basAssemblyRegister.ts', /(?:issue\('([^']+)'|code: '([^']+)')/g],
    ['equipment', '../src/lib/basEquipmentEvidence.ts', /issues\.push\('([^']+)'\)/g],
    ['equipment', '../src/lib/basEquipmentRegister.ts', /code: '([^']+)'/g],
    ['engineering', '../src/lib/basEngineeringRegister.ts', /code: '([^']+)'/g],
  ] as const) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const codes = [...source.matchAll(pattern)].map(m => m[1] || m[2]);
    assert.ok(codes.length > 0, path);
    for (const code of codes) assert.ok(keys.has(`${domain}:${code}`), `${domain}:${code}`);
  }
  for (const code of ['empty_expression', 'unsupported_syntax', 'invalid_number', 'incompatible_range', 'descending_range', 'ambiguous_padding', 'duplicate_member', 'excluded_member_not_included', 'too_many_members'])
    assert.ok(keys.has(`equipment:membership_${code}`));
  for (const code of ['not_a_complete_integer', 'unsafe_integer']) assert.ok(keys.has(`equipment:quantity_${code}`));
  const assignments = readFileSync(new URL('../../bas_engine/assignment_demand.py', import.meta.url), 'utf8');
  for (const code of [...assignments.matchAll(/"([A-Z]+(?:_[A-Z]+)+)"/g)].map(m => m[1]))
    assert.ok(keys.has(`equipment:${code}`) || keys.has(`points:${code}`), `assigned values: ${code}`);
  for (const code of ['FIELD_WIRING_NOT_ESTABLISHED', 'UNIQUE_POINT_IDENTITIES_NOT_ESTABLISHED'])
    assert.ok(keys.has(`equipment:${code}`), `assignment-level: ${code}`);
});
