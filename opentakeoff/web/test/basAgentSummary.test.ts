import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { basReplyForAgent } from '../src/lib/basAgentSummary.js';
import { runAgentLoop } from '../src/lib/agentLoop.js';

test('both real BAS replies retain legacy metadata and engineering readiness inside Agent text budget', () => {
  for (const name of ['fort-sam-final', 'behavioral-final']) {
    const { answer } = JSON.parse(readFileSync(new URL(`../../docs/bas-math-evidence/${name}/result.json`, import.meta.url), 'utf8'));
    const before = JSON.stringify(answer);
    const compact = basReplyForAgent(answer);
    assert.ok(JSON.stringify(compact).length < 5000);
    const { bas_math: originalMath, ...originalMetadata } = answer;
    const { bas_math: summary, ...metadata } = compact;
    assert.deepEqual(metadata, originalMetadata);
    assert.deepEqual(summary.physical_total, originalMath.physical_total);
    assert.equal(summary.status, 'review_required');
    assert.equal(summary.project_complete, false);
    assert.equal(summary.source_coverage, 'point_list_only');
    assert.ok(summary.diagnostic_codes.includes('SOO_INDEX_NOT_FOUND'));
    assert.equal(summary.point_rows_in_workspace, originalMath.points.length);
    assert.equal(summary.hardware.length + summary.omitted.hardware, originalMath.hardware.length);
    for (const row of summary.hardware) {
      assert.equal(row.blocks_total, originalMath.hardware.find((h: { group_id: string; blocks_total: number }) => h.group_id === row.group_id).blocks_total);
    }
    assert.equal(JSON.stringify(answer), before, 'Full rows/citations/export result must not change');
  }
});

test('long identities and many allocation scopes are omitted whole, never rewritten or recomputed', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ group_id: `group-${i}-${'x'.repeat(490)}`, profile_id: 'p'.repeat(512), blocks_total: i+1 }));
  const payload = { kind: 'bas_points', bas_math: { engine: 'bas_math_v1', status: 'review_required', project_complete: false,
    physical_total: { AI: 250, AO: 0, DI: 0, DO: 0 }, hardware: rows, points: [] } };
  const compact = basReplyForAgent(payload);
  assert.ok(JSON.stringify(compact.bas_math).length <= 2500);
  assert.equal(compact.bas_math.hardware.length + compact.bas_math.omitted.hardware, 100);
  for (const row of compact.bas_math.hardware) {
    const original = rows.find((r) => r.blocks_total === row.blocks_total);
    assert.ok(original);
    assert.equal(row.group_id, original.group_id);
  }
  assert.deepEqual(compact.bas_math.physical_total, payload.bas_math.physical_total);
  const ordinary = { kind: 'hvac_equipment', totals: { items: 7 } };
  assert.equal(basReplyForAgent(ordinary), ordinary);
  const unavailable = { bas_math: { status: 'unavailable', error: 'Python missing' } };
  assert.equal(basReplyForAgent(unavailable), unavailable);
});

test('the actual Agent provider request carries a parseable BAS summary without cutting off existing metadata', async () => {
  const { answer } = JSON.parse(readFileSync(new URL('../../docs/bas-math-evidence/behavioral-final/result.json', import.meta.url), 'utf8'));
  const before = JSON.stringify(answer);
  const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const replies = [
    { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'p1', type: 'function', function: { name: 'probe', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] },
    { choices: [{ message: { role: 'assistant', content: 'Result is available.' }, finish_reason: 'stop' }] },
  ];
  const result = await runAgentLoop({
    cfg: { endpoint: 'http://localhost:9999', apiKey: 'test-only', model: 'mock', provider: 'openai' },
    goal: 'go', tools: [{ name: 'probe', description: 'inspect', input_schema: { type: 'object', properties: {} } }],
    execute: () => answer,
    fetchFn: (async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => replies.shift() };
    }) as any,
  });
  assert.equal(result.status, 'done');
  const tool = requests.at(-1)?.messages.find((m) => m.role === 'tool');
  assert.ok(tool);
  const wire = JSON.parse(tool.content);
  assert.deepEqual(wire.bas_math.physical_total, answer.bas_math.physical_total);
  assert.equal(wire.ui_takeoff_open, true);
  assert.equal(wire.bas_math.project_complete, false);
  assert.ok(wire.bas_math.diagnostic_codes.includes('SOO_INDEX_NOT_FOUND'));
  assert.equal(JSON.stringify(answer), before);
});
