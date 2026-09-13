import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { basReplyForAgent, completeBasAnswerMarkdown } from '../src/lib/basAgentSummary.js';
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

test('complete BAS tool results reach the model as a bounded end-to-end receipt while canonical data stays intact', () => {
  const payload = {
    workflow: 'complete_bas_takeoff', execution_status: 'completed', release_status: 'human_review_required', human_review_required: true,
    compile_order: ['hvac_equipment', 'bas_points', 'sequences', 'control_valves', 'embedded_coil_gaps'],
    analysis_order: ['control_schematics_and_risers', 'schedule_plan_reconcile'],
    compiles: Object.fromEntries(['hvac_equipment', 'bas_points', 'sequences', 'control_valves', 'embedded_coil_gaps'].map((kind) => [kind, {
      takeoff_id: `T-${kind}`, kind, category_count: 2, totals: { rows: 40 }, categories: { huge: 'x'.repeat(20_000) },
    }])),
    control_schematics: {
      schema_version: 'opentakeoff.control_schematic.v1',
      totals: { schematics: 12, riser_diagrams: 2, explicit_points: 54, instruments_unmapped: 7, unresolved_crossings: 3 },
      engineering_readiness: {
        status: 'evidence_inventory_only', diagram_count: 14, verified_semantic_graphs: 0,
        blockers: [{ code: 'SEMANTIC_CONNECTIVITY_UNVERIFIED', count: 14 }], human_review_required: true,
      },
      schematics: Array.from({ length: 12 }, (_, index) => ({
        sheet: `M${index}`, title: `CONTROL SCHEMATIC ${index}`, point_totals: { total: index },
        semantic_status: 'evidence_inventory',
        review: { unresolved_crossings: 1, unmapped_instruments: 2 }, topology: { status: 'computed', nodes: Array(1000).fill({}) },
      })),
      risers: [{
        sheet: 'MI701', title: 'DDC SYSTEM NETWORK RISER DIAGRAM', diagram_kind: 'network_architecture',
        status: 'evidence_inventory', semantic_status: 'evidence_inventory', datums: [], service_groups: [],
        continuations: [{ target_sheet: 'MI702' }], trace_candidates: [{ status: 'unresolved_vector_candidate' }],
        floor_placements: [{ floor_label: 'ROOF', subject_kind: 'network_component' }],
        network_components: [{ component_type: 'ME Stack', evidence: [{ bbox: [1, 2, 3, 4] }, { bbox: [5, 6, 7, 8] }] }],
        topology: { status: 'computed', edges: Array(1000).fill({}) },
      }],
      diagram_conflicts: [{
        conflict_type: 'normal_state_mismatch', normalized_system: 'condenser_water', device_tag: 'V-1',
        status: 'design_clarification_required', claims: [
          { sheet: 'AM610', diagram_title: 'PIPING DIAGRAM', state: 'normally_open' },
          { sheet: 'AM702', diagram_title: 'CONTROL DIAGRAM', state: 'normally_closed' },
        ],
      }],
    },
    reconcile: { summary: { match: 4, ambiguous: 1 }, row_count: 200, exception_samples: Array.from({ length: 20 }, (_, index) => ({ tag: `AHU-${index}`, status: 'AMBIGUOUS' })) },
    stages: {
      hvac_equipment: { status: 'complete' }, control_schematics_and_risers: { status: 'partial' },
      point_soo: { status: 'partial', workflow_status: 'not_started', blocker_count: 9 },
      open_result_workspace: { status: 'complete' },
    },
    inspections: { point_soo: { status: 'not_started', blocker_count: 9, issue_count: 10,
      next_step: 'Review exact SOO links.', payload: 'y'.repeat(20_000) },
      review_revisions_release: { status: 'not_started', blocker_count: 2, issue_count: 2,
        next_step: 'Review findings.', issue_summary: [{ domain: 'points', code: 'POINT_COLUMNS_UNRESOLVED', severity: 'blocker', count: 2 }] } },
    workspace: { destination: 'takeoff_summary' }, failures: [],
  };
  const before = JSON.stringify(payload);
  const compact = basReplyForAgent(payload);
  assert.ok(JSON.stringify(compact).length < 5000);
  assert.equal(compact.execution_status, 'completed');
  assert.equal(compact.release_status, 'human_review_required');
  assert.equal(compact.diagram_analysis.totals.explicit_points, 54);
  assert.equal(compact.diagram_analysis.engineering_status, 'evidence_inventory_only');
  assert.equal(compact.diagram_analysis.diagram_conflict_count, 1);
  assert.equal(compact.schedule_plan_reconciliation.row_count, 200);
  assert.equal(compact.workflow_reviews.point_soo.workflow_status, 'not_started');
  assert.equal(compact.workflow_reviews.point_soo.stage_status, 'partial');
  assert.equal(compact.workflow_reviews.point_soo.blocker_count, 9);
  assert.equal(compact.top_open_findings[0].code, 'POINT_COLUMNS_UNRESOLVED');
  assert.equal('schematics' in compact.diagram_analysis, false, 'chat summary must not dump individual diagram records');
  assert.match(compact.answer_contract.join(' '), /not_started means available/i);
  assert.equal(JSON.stringify(payload), before, 'Canonical receipt must not be changed');
});

test('complete BAS deterministic answer separates source coverage from installed truth', () => {
  const payload = {
    workflow: 'complete_bas_takeoff', execution_status: 'completed', release_status: 'human_review_required',
    presentation: { coverage: {
      equipment_items: 97, point_lists: 0, point_rows: 0, point_type_review_rows: 0,
      sequences: 13, sequence_sections: 53, soo_point_candidates: 1,
      control_valve_items: 31, embedded_coil_gaps: 11, control_schematics: 13,
      riser_diagrams: 0, reconcile_rows: 37, reconcile_match: 36,
      reconcile_schedule_only: 1, reconcile_plan_only: 0, reconcile_ambiguous: 0,
    } },
    control_schematics: { totals: { explicit_points: 74 } },
    diagram_engineering_readiness: { blockers: [{ code: 'UNRESOLVED_DIAGRAM_CROSSINGS', count: 497, explanation: 'Crossings require review.' }] },
    reconcile: { summary: { total: 37, match: 36, schedule_only: 1, plan_only: 0, ambiguous: 0, refused_no_scale: 0, refused_no_text: 0 } },
    inspections: {
      point_soo: { status: 'current_with_open_findings', blocker_count: 93,
        next_step: 'No point-list matrix was found in the loaded set. Add the applicable controls point-list/specification source.' },
    },
  };
  const text = completeBasAnswerMarkdown(payload);
  assert.match(text, /97.*Scheduled equipment records|Scheduled equipment records.*97/is);
  assert.match(text, /no extractable point-list matrix or rows/i);
  assert.match(text, /1.*explicit labeled SOO point candidate/is);
  assert.match(text, /37.*36 MATCH.*1 SCHEDULE_ONLY/is);
  assert.match(text, /does not prove the project has no points/i);
  assert.match(text, /human_review_required/i);
  assert.doesNotMatch(text, /no points found/i);
});

test('complete BAS next action never invents an identified sequence when controls sources are absent', () => {
  const text = completeBasAnswerMarkdown({
    workflow: 'complete_bas_takeoff', release_status: 'human_review_required',
    presentation: { coverage: {
      equipment_items: 32, point_lists: 0, point_rows: 0, sequences: 0, sequence_sections: 0,
      control_valve_items: 0, embedded_coil_gaps: 2, control_schematics: 0, riser_diagrams: 0,
      reconcile_rows: 17, reconcile_match: 15, reconcile_schedule_only: 2,
    } },
    control_schematics: { totals: { explicit_points: 0 }, engineering_readiness: { blockers: [] } },
    reconcile: { summary: { total: 17, match: 15, schedule_only: 2 } },
    inspections: {
      point_soo: { status: 'current_with_open_findings', blocker_count: 29,
        next_step: 'Inspect the original sequence/page. Review unhandled wording.' },
    },
  });
  assert.match(text, /None were extracted from this loaded set/i);
  assert.match(text, /supply missing controls sources|review the cited discovery exceptions/i);
  assert.doesNotMatch(text, /Inspect the original sequence\/page/i);
});
