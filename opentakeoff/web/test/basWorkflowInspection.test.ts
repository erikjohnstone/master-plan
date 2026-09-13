import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectBasWorkflow, basWorkflowInspectionSchema } from '../src/lib/basWorkflowInspection.ts';
import { engineeringFixture } from './helpers/basEngineeringFixture.ts';

test('all five Agent/MCP inspections use the retained validated workflow without mutation', async () => {
  const fixture = await engineeringFixture({ withSequence: true });
  const before = JSON.stringify(fixture.workflow);
  for (const domain of ['point_soo', 'equipment_templates', 'assemblies_responsibility',
    'engineering_compatibility', 'review_revisions_release'] as const) {
    const result = await inspectBasWorkflow(fixture.workflow, domain);
    assert.equal(basWorkflowInspectionSchema.safeParse(result).success, true);
    assert.equal(result.domain, domain);
    assert.equal(result.capture_id, fixture.workflow.current_capture_id);
    assert.equal(result.authority, 'validated_shared_workflow');
    assert.equal(result.project_complete, false);
    assert.equal(result.installed_quantity, null);
    assert.equal(result.approval, 'not_evaluated');
    assert.ok(result.metrics.length > 0);
    assert.ok(result.next_step.length > 10);
  }
  assert.equal(JSON.stringify(fixture.workflow), before);
});

test('inspection rejects foreign captures and never turns missing capabilities into green state', async () => {
  const fixture = await engineeringFixture({ withSequence: true });
  await assert.rejects(inspectBasWorkflow(fixture.workflow, 'point_soo', 'f'.repeat(64)), /retained capture/);
  await assert.rejects(inspectBasWorkflow(fixture.workflow, 'pricing'), /Invalid enum value|Invalid option/);
  const result = await inspectBasWorkflow(fixture.workflow, 'review_revisions_release');
  assert.ok(result.issue_count > 0);
  assert.ok(result.blocker_count > 0);
  assert.notEqual(result.status, 'in_progress');
});

test('point/SOO inspection separates retained source rows from typed physical point rows', async () => {
  const fixture = await engineeringFixture({ withSequence: true });
  const result = await inspectBasWorkflow(fixture.workflow, 'point_soo');
  const metrics = Object.fromEntries(result.metrics.map(item => [item.key, item.value]));
  assert.equal(typeof metrics.point_source_rows, 'number');
  assert.equal(typeof metrics.listed_point_rows, 'number');
  assert.equal(typeof metrics.typed_point_rows, 'number');
  assert.equal(typeof metrics.point_type_review_rows, 'number');
  assert.equal(metrics.listed_point_rows,
    Number(metrics.typed_point_rows) + Number(metrics.point_type_review_rows));
  assert.ok(Number(metrics.point_source_rows) >= Number(metrics.listed_point_rows));
  assert.equal('point_rows' in metrics, false, 'ambiguous legacy label must not return');
});

test('sequence-only set requests the missing point-list source instead of offering an impossible link', async () => {
  const fixture = await engineeringFixture({ withSequence: true, withPointMatrix: false });
  const result = await inspectBasWorkflow(fixture.workflow, 'point_soo');
  assert.equal(result.status, 'current_with_open_findings');
  assert.match(result.next_step, /No point-list matrix was found/);
  assert.match(result.next_step, /add the applicable controls point-list\/specification source/);
  assert.doesNotMatch(result.next_step, /^Open Point lists/);
});
