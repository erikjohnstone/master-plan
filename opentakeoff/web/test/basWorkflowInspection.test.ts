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
