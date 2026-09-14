import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBasSourceContext } from '../src/lib/basSources.ts';
import { captureBasEvidence, latestBasSequenceAiRun, mergeBasWorkflows, retainBasSequenceAiRun,
  verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { applyBasSequenceAiReview, basSequenceAiReviewDecisions, basSequenceAiReviewHead } from '../src/lib/basSequenceAiReview.ts';
import {
  BAS_SEQUENCE_AI_RESPONSE_JSON_SCHEMA,
  basSequenceAiResponseEnvelopes,
  basSequenceAiModelResponseSchema,
  executeBasSequenceAiInterpretation,
  prepareBasSequenceAiBatches,
  validateBasSequenceAiResponses,
  verifyBasSequenceAiRun,
} from '../src/lib/basSequenceAi.ts';

const source = buildBasSourceContext([{ name: 'controlled-soo.pdf', sha256: 'c'.repeat(64), byte_length: 100, page_count: 1,
  pages: [{ page_number: 1, sheet_key: 'controlled-soo.pdf', width_px: 2000, height_px: 1200, rotation: 0,
    spans: [
      { str: 'HEATING WATER SYSTEM CONTROL SEQUENCE', x0: 100, y0: 50, x1: 900, y1: 75 },
      { str: 'D. HEATING WATER PUMPS (HWP-1 & HWP-2) SHALL OPERATE IN A LEAD/STANDBY FASHION.', x0: 100, y0: 100, x1: 1500, y1: 120 },
      { str: 'a. THE LEAD PUMP SHALL RUN FIRST.', x0: 145, y0: 135, x1: 800, y1: 155 },
      { str: 'b. ON FAILURE OF THE LEAD PUMP, THE STANDBY PUMP SHALL RUN AND THE BAS SHALL DISPLAY A PUMP FAILURE ALARM.', x0: 145, y0: 170, x1: 1800, y1: 190 },
      { str: 'C. SUPPLY AIR TEMPERATURE (AI) SHALL BE MONITORED BY THE BAS.', x0: 100, y0: 220, x1: 1200, y1: 240 },
    ] }] }]);

function outputClause(clause_id: string, overrides: Record<string, unknown> = {}) {
  return {
    clause_id,
    summary: 'The lead pump runs first.',
    behaviors: [{
      kind: 'lead_lag', subject: 'lead pump', subject_kind: 'pump', action: 'run first',
      object: null, object_kind: null, relation: 'none', condition: null,
      threshold: null, delay: null,
      evidence: [{ clause_id, text: 'THE LEAD PUMP SHALL RUN FIRST' }],
    }],
    candidate_points: [{
      name: 'Lead pump command', function: 'command', io_type: null,
      basis: 'inferred_requirement', evidence: [{ clause_id, text: 'THE LEAD PUMP SHALL RUN FIRST' }],
    }],
    ...overrides,
  };
}

test('SOO AI batches preserve hierarchy and expose only literal ancestor context', () => {
  const batches = prepareBasSequenceAiBatches(source, 2);
  const clauses = batches.flatMap(batch => batch.clauses);
  const parent = clauses.find(clause => clause.marker === 'D.')!;
  const childA = clauses.find(clause => clause.marker === 'a.')!;
  const childB = clauses.find(clause => clause.marker === 'b.')!;
  assert.equal(childA.parent_clause_id, parent.clause_id);
  assert.equal(childB.parent_clause_id, parent.clause_id);
  assert.deepEqual(childA.ancestor_clauses, [{ clause_id: parent.clause_id, text: parent.text }]);
  assert.equal(parent.ancestor_clauses.length, 0);
  assert.ok(BAS_SEQUENCE_AI_RESPONSE_JSON_SCHEMA.properties.clauses.items.additionalProperties === false);
});

test('final SOO aggregation preserves the strict 64-clause response-envelope limit', () => {
  const clause = basSequenceAiModelResponseSchema.parse({ clauses: [outputClause('clause')] }).clauses[0];
  assert.deepEqual(basSequenceAiResponseEnvelopes(Array.from({ length: 129 }, (_, index) => ({ ...clause, clause_id: `clause-${index}` })))
    .map(response => response.clauses.length), [64, 64, 1]);
});

test('source-bounded model candidates become proposed Brick/Haystack projections, never installed quantities', async () => {
  const clause = prepareBasSequenceAiBatches(source).flatMap(batch => batch.clauses).find(value => value.marker === 'a.')!;
  const result = await validateBasSequenceAiResponses(source, [{ clauses: [outputClause(clause.clause_id)] }], {
    model: 'gpt-oss-120b', generated_at: '2026-09-13T16:00:00.000Z',
  });
  assert.equal(result.coverage.accepted_clauses, 1);
  assert.equal(result.review_required, true);
  assert.equal(result.interpretations[0].review_status, 'proposed');
  assert.deepEqual(result.interpretations[0].behaviors[0].subject_ontology,
    { entity_kind: 'pump', brick_class: 'Pump', haystack_tags: ['pump', 'equip'] });
  assert.equal(result.interpretations[0].behaviors[0].relation_ontology.brick_relationship, null);
  assert.equal(result.interpretations[0].behaviors[0].installed_quantity, null);
  assert.equal(result.interpretations[0].candidate_points[0].installed_quantity, null);
  assert.equal(result.interpretations[0].candidate_points[0].ontology.brick_class, 'Command');
  assert.equal(result.interpretations[0].summary, clause.text, 'Model prose is not accepted as an evidence-bearing summary');
  assert.deepEqual(result.interpretations[0].behaviors[0].evidence[0].source_span_ids,
    [`sha256:${'c'.repeat(64)}:p1:s2`]);
  assert.ok(result.missing_clause_ids.length > 0, 'A partial model batch never implies full SOO coverage');
});

test('long authored clauses remain the retained summary instead of failing the completed interpretation run', async () => {
  const longText = `1. FAN SHALL START. ${'THE CONTROLLER SHALL RETAIN THIS AUTHORED REQUIREMENT TEXT. '.repeat(55)}`;
  assert.ok(longText.length > 2048);
  const longSource = buildBasSourceContext([{ name: 'long-soo.pdf', sha256: 'd'.repeat(64), byte_length: 100, page_count: 1,
    pages: [{ page_number: 1, sheet_key: 'long-soo.pdf', width_px: 2400, height_px: 1200, rotation: 0,
      spans: [
        { str: 'EXHAUST FAN CONTROL SEQUENCE', x0: 100, y0: 50, x1: 900, y1: 75 },
        { str: longText, x0: 100, y0: 100, x1: 2200, y1: 120 },
      ] }] }]);
  const clause = prepareBasSequenceAiBatches(longSource).flatMap(batch => batch.clauses)
    .find(value => value.text.includes('FAN SHALL START'))!;
  const response = outputClause(clause.clause_id, { summary: 'Fan starts.', behaviors: [{
    kind: 'command', subject: 'FAN', subject_kind: 'fan', action: 'START', object: null, object_kind: null,
    relation: 'none', condition: null, threshold: null, delay: null,
    evidence: [{ clause_id: clause.clause_id, text: 'FAN SHALL START' }],
  }], candidate_points: [] });
  const result = await validateBasSequenceAiResponses(longSource, [{ clauses: [response] }], { model: 'gpt-oss-120b' });
  assert.equal(result.coverage.accepted_clauses, 1);
  assert.equal(result.interpretations[0].summary, clause.text.trim());
  assert.ok(result.interpretations[0].summary.length > 2048);
  assert.deepEqual(await verifyBasSequenceAiRun(longSource, structuredClone(result)), result);
});

test('retained SOO AI runs re-verify source ownership, semantics and fingerprints', async () => {
  const clause = prepareBasSequenceAiBatches(source).flatMap(batch => batch.clauses).find(value => value.marker === 'a.')!;
  const run = await validateBasSequenceAiResponses(source, [{ clauses: [outputClause(clause.clause_id)] }], {
    model: 'gpt-oss-120b', generated_at: '2026-09-13T16:00:00.000Z',
  });
  assert.deepEqual(await verifyBasSequenceAiRun(source, JSON.parse(JSON.stringify(run))), run);
  const mutations: Array<(value: typeof run) => void> = [
    value => { value.interpretations[0].behaviors[0].action = 'stop'; },
    value => { value.interpretations[0].behaviors[0].evidence[0].source_span_ids[0] = 'sha256:' + 'c'.repeat(64) + ':p1:s3'; },
    value => { value.interpretations[0].behaviors[0].subject_ontology.brick_class = 'Boiler'; },
    value => { value.coverage.accepted_clauses += 1; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(run); mutate(changed);
    await assert.rejects(verifyBasSequenceAiRun(source, changed));
  }
});

test('validated SOO AI runs persist, merge and export with the capture without changing source identity', async () => {
  const clause = prepareBasSequenceAiBatches(source).flatMap(batch => batch.clauses).find(value => value.marker === 'a.')!;
  const run = await validateBasSequenceAiResponses(source, [{ clauses: [outputClause(clause.clause_id)] }], {
    model: 'gpt-oss-120b', generated_at: '2026-09-13T16:00:00.000Z',
  });
  const workflow = await captureBasEvidence(source, { schema_version: 'bas_point_lists_v1',
    rule_version: 'point_observations_1', scope: 'discovered_matrices_only', project_complete: false,
    issues: [], matrices: [] });
  const retained = await retainBasSequenceAiRun(workflow, workflow.current_capture_id!, run);
  assert.equal(retained.revision, 'bas_sequence_ai_11');
  assert.equal(retained.captures[0].capture_id, workflow.captures[0].capture_id);
  assert.deepEqual(latestBasSequenceAiRun(retained, workflow.current_capture_id!), run);
  assert.deepEqual(await verifyBasWorkflow(JSON.parse(JSON.stringify(retained))), retained);
  assert.deepEqual(mergeBasWorkflows(workflow, retained), retained);
  assert.deepEqual(await retainBasSequenceAiRun(retained, workflow.current_capture_id!, run), retained);
  const tampered = structuredClone(retained);
  tampered.sequence_ai_runs![0].run.interpretations[0].behaviors[0].action = 'stop';
  await assert.rejects(verifyBasWorkflow(tampered));
});

test('estimator confirm/reject decisions are append-only, fingerprinted and never approve quantities', async () => {
  const clause = prepareBasSequenceAiBatches(source).flatMap(batch => batch.clauses).find(value => value.marker === 'a.')!;
  const run = await validateBasSequenceAiResponses(source, [{ clauses: [outputClause(clause.clause_id)] }], {
    model: 'gpt-oss-120b', generated_at: '2026-09-13T16:00:00.000Z',
  });
  const initial = await captureBasEvidence(source, { schema_version: 'bas_point_lists_v1',
    rule_version: 'point_observations_1', scope: 'discovered_matrices_only', project_complete: false,
    issues: [], matrices: [] });
  const retained = await retainBasSequenceAiRun(initial, initial.current_capture_id!, run);
  const target = run.interpretations[0].interpretation_id;
  const confirmed = await applyBasSequenceAiReview(retained, { operation_id: '00000000-0000-4000-8000-000000000001',
    capture_id: initial.current_capture_id, run_id: run.run_id, interpretation_id: target, expected_head: null,
    decision: 'confirmed', reason: 'Compared with the cited source clause.' });
  assert.equal(confirmed.sequence_ai_reviews![0].approved, false);
  assert.equal(confirmed.sequence_ai_reviews![0].decision, 'confirmed');
  const head = basSequenceAiReviewHead(confirmed, initial.current_capture_id!, run.run_id);
  const rejected = await applyBasSequenceAiReview(confirmed, { operation_id: '00000000-0000-4000-8000-000000000002',
    capture_id: initial.current_capture_id, run_id: run.run_id, interpretation_id: target, expected_head: head,
    decision: 'rejected', reason: 'The clause does not establish the proposed point.' });
  assert.equal(basSequenceAiReviewDecisions(rejected, initial.current_capture_id!, run.run_id).get(target)?.decision, 'rejected');
  await assert.rejects(applyBasSequenceAiReview(rejected, { operation_id: '00000000-0000-4000-8000-000000000003',
    capture_id: initial.current_capture_id, run_id: run.run_id, interpretation_id: target, expected_head: null,
    decision: 'confirmed', reason: 'Stale decision.' }), /changed/);
  const tampered = structuredClone(rejected); tampered.sequence_ai_reviews![0].reason += ' altered';
  await assert.rejects(verifyBasWorkflow(tampered), /fingerprint/);
});

test('a child may cite its literal parent, but a parent cannot leak evidence from a child or sibling', async () => {
  const clauses = prepareBasSequenceAiBatches(source).flatMap(batch => batch.clauses);
  const parent = clauses.find(clause => clause.marker === 'D.')!;
  const child = clauses.find(clause => clause.marker === 'b.')!;
  const good = outputClause(child.clause_id, {
    summary: 'The standby pump runs on lead-pump failure.',
    behaviors: [{ kind: 'interlock', subject: 'standby pump', subject_kind: 'pump', action: 'run',
      object: 'lead pump', object_kind: 'pump', relation: 'none', condition: 'lead pump failure',
      threshold: null, delay: null, evidence: [
        { clause_id: parent.clause_id, text: 'HEATING WATER PUMPS (HWP-1 & HWP-2)' },
        { clause_id: child.clause_id, text: 'ON FAILURE OF THE LEAD PUMP, THE STANDBY PUMP SHALL RUN' },
      ] }], candidate_points: [],
  });
  const bad = outputClause(parent.clause_id, {
    behaviors: [{ kind: 'lead_lag', subject: 'lead pump', subject_kind: 'pump', action: 'run first',
      object: null, object_kind: null, relation: 'none', condition: null, threshold: null, delay: null,
      evidence: [{ clause_id: child.clause_id, text: 'THE STANDBY PUMP SHALL RUN' }] }], candidate_points: [],
  });
  const result = await validateBasSequenceAiResponses(source, [{ clauses: [good, bad] }], { model: 'gpt-oss-120b' });
  assert.deepEqual(result.interpretations.map(value => value.clause_id), [child.clause_id]);
  assert.ok(result.item_rejections.some(value => value.clause_id === parent.clause_id
    && value.codes.includes('FORBIDDEN_EVIDENCE_SCOPE')));
});

test('Cerebras cannot promote an inferred field point to AI/AO/BI/BO without literal type evidence', async () => {
  const clauses = prepareBasSequenceAiBatches(source).flatMap(batch => batch.clauses);
  const child = clauses.find(clause => clause.marker === 'a.')!;
  const explicit = clauses.find(clause => clause.marker === 'C.')!;
  const invented = outputClause(child.clause_id, { candidate_points: [{ name: 'Lead pump command', function: 'command',
    io_type: 'BO', basis: 'inferred_requirement', evidence: [{ clause_id: child.clause_id, text: 'THE LEAD PUMP SHALL RUN FIRST' }] }] });
  const supported = outputClause(explicit.clause_id, { summary: 'Supply air temperature is an explicitly printed AI.', behaviors: [],
    candidate_points: [{ name: 'Supply air temperature', function: 'sensor', io_type: 'AI', basis: 'explicit_requirement',
      evidence: [{ clause_id: explicit.clause_id, text: 'SUPPLY AIR TEMPERATURE (AI) SHALL BE MONITORED' }] }] });
  const result = await validateBasSequenceAiResponses(source, [{ clauses: [invented, supported] }], { model: 'gpt-oss-120b' });
  assert.ok(result.item_rejections.some(value => value.clause_id === child.clause_id
    && value.codes.includes('IO_TYPE_NOT_EXPLICIT')));
  assert.deepEqual(result.interpretations.map(value => value.clause_id), [child.clause_id, explicit.clause_id]);
  assert.equal(result.interpretations.find(value => value.clause_id === child.clause_id)!.candidate_points.length, 0);
  assert.equal(result.interpretations.find(value => value.clause_id === explicit.clause_id)!.candidate_points[0].io_type, 'AI');
});

test('fabricated equipment identity, threshold and explicit point labels fail closed', async () => {
  const clause = prepareBasSequenceAiBatches(source).flatMap(batch => batch.clauses).find(value => value.marker === 'a.')!;
  const fabricated = outputClause(clause.clause_id, {
    summary: 'HWP-1 is definitely the lead pump.',
    behaviors: [{ kind: 'lead_lag', subject: 'HWP-1 lead pump', subject_kind: 'pump', action: 'run first',
      object: null, object_kind: null, relation: 'none', condition: null,
      threshold: { operator: 'gt', value: 99, value_high: null, unit: 'seconds', adjustable: false }, delay: null,
      evidence: [{ clause_id: clause.clause_id, text: 'THE LEAD PUMP SHALL RUN FIRST' }] }],
    candidate_points: [{ name: 'Lead pump command', function: 'command', io_type: null,
      basis: 'explicit_requirement', evidence: [{ clause_id: clause.clause_id, text: 'THE LEAD PUMP SHALL RUN FIRST' }] }],
  });
  const result = await validateBasSequenceAiResponses(source, [{ clauses: [fabricated] }], { model: 'gpt-oss-120b' });
  assert.equal(result.interpretations.length, 0);
  const codes = result.item_rejections.filter(value => value.clause_id === clause.clause_id).flatMap(value => value.codes);
  assert.ok(codes.includes('CLAIM_NOT_EVIDENCED'));
  assert.ok(codes.includes('THRESHOLD_NOT_EVIDENCED'));
  assert.ok(codes.includes('EXPLICIT_POINT_NOT_EVIDENCED'));
});

test('strict model schema refuses invented ontology vocabulary and malformed batches are accounted', async () => {
  const clause = prepareBasSequenceAiBatches(source).flatMap(batch => batch.clauses).find(value => value.marker === 'a.')!;
  const invented = outputClause(clause.clause_id);
  invented.behaviors[0].relation = 'hasLead';
  assert.equal(basSequenceAiModelResponseSchema.safeParse({ clauses: [invented] }).success, false);
  const result = await validateBasSequenceAiResponses(source, [{ clauses: [invented] }], { model: 'gpt-oss-120b' });
  assert.deepEqual(result.rejections, [{ clause_id: '', codes: ['INVALID_MODEL_OUTPUT'] }]);
  assert.equal(result.coverage.accepted_clauses, 0);
  assert.equal(result.missing_clause_ids.length, result.coverage.eligible_clauses);
});

test('validator-guided retry replaces an unsafe clause with a grounded correction', async () => {
  let sawFeedback = false;
  const result = await executeBasSequenceAiInterpretation(source, async request => {
    return { clauses: request.batch.clauses.map(clause => {
      if (!clause.text.includes('THE LEAD PUMP SHALL RUN FIRST')) {
        return { clause_id: clause.clause_id, summary: clause.text, behaviors: [], candidate_points: [] };
      }
      if (request.attempt === 1) {
        return outputClause(clause.clause_id, {
          behaviors: [{ kind: 'lead_lag', subject: 'HWP-1 lead pump', subject_kind: 'pump', action: 'run first',
            object: null, object_kind: null, relation: 'none', condition: null, threshold: null, delay: null,
            evidence: [{ clause_id: clause.clause_id, text: 'THE LEAD PUMP SHALL RUN FIRST' }] }],
          candidate_points: [{ name: 'Lead pump command', function: 'command', io_type: 'BO',
            basis: 'inferred_requirement', evidence: [{ clause_id: clause.clause_id, text: 'THE LEAD PUMP SHALL RUN FIRST' }] }],
        });
      }
      sawFeedback = request.validator_feedback.some(value => value.clause_id === clause.clause_id
        && value.codes.includes('CLAIM_NOT_EVIDENCED') && value.codes.includes('IO_TYPE_NOT_EXPLICIT'));
      return outputClause(clause.clause_id, { candidate_points: [] });
    }) };
  }, { model: 'gpt-oss-120b', batch_size: 32, concurrency: 1, max_attempts: 2,
    generated_at: '2026-09-13T17:00:00.000Z' });
  const target = result.run.interpretations.find(value => value.summary.includes('THE LEAD PUMP SHALL RUN FIRST'))!;
  assert.equal(result.attempts.length, 2);
  assert.equal(sawFeedback, true);
  assert.equal(target.behaviors.length, 1);
  assert.equal(target.behaviors[0].subject, 'lead pump');
  assert.equal(target.candidate_points.length, 0);
  assert.equal(result.run.item_rejections.some(value => value.clause_id === target.clause_id), false);
});
