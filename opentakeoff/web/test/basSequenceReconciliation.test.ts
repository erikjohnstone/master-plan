import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBasSourceContext } from '../src/lib/basSources.ts';
import { basPointListsSchema } from '../src/lib/basPointLists.ts';
import { BAS_SEQUENCE_RULE_V1, interpretBasSequences, normalizedBasVariable, reconcileBasSequencePoints,
  type BasSequenceAssociation, type BasSequenceRequirement } from '../src/lib/basSequenceReconciliation.ts';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const raw = read('../../docs/bas-production/evidence/baseline/fort-sam-text.json');
const truth = read('./fixtures/bas-soo-monitor-cases.json');
assert.equal(raw.sha256, truth.source_sha256);
const sources = buildBasSourceContext([{ name: 'reviewed-source.pdf', sha256: raw.sha256,
  byte_length: 924578, page_count: raw.pages.length, pages: raw.pages.map((p: { page: number; width: number; height: number; spans: unknown[] }) => ({
    page_number: p.page, sheet_key: `reviewed-source.pdf#${p.page}`, width_px: p.width, height_px: p.height, rotation: 0, spans: p.spans,
  })) }]);
const points = basPointListsSchema.parse(read('../../docs/bas-production/evidence/point-workspace-compile.json').bas_point_lists);
const interpretV1 = (value: typeof sources) => interpretBasSequences(value, BAS_SEQUENCE_RULE_V1);
const reconcileV1 = (sourceValue: typeof sources, pointValue: unknown, associationValue: unknown) =>
  reconcileBasSequencePoints(sourceValue, pointValue, associationValue, BAS_SEQUENCE_RULE_V1);
const requirementsOf = (result: ReturnType<typeof interpretBasSequences>) => result.regions
  .flatMap(region => region.clauses)
  .reduce<BasSequenceRequirement[]>((all, clause) => { all.push(...clause.requirements); return all; }, []);
const analysis = interpretV1(sources);
const associations: BasSequenceAssociation[] = [7, 8].map(page => ({
  region_id: analysis.regions.find(r => r.page_id.endsWith(`:p${page}`) && r.title === truth.title)!.region_id,
  matrix_id: points.matrices.find(m => m.page_id?.endsWith(`:p${page}`) && m.rows.some(r => r.name === (page === 7 ? 'SUPPLY AIR TEMPERATURE' : 'SUPPLY AIR TEMP.')))!.matrix_id,
  review_origin: 'source_review_fixture',
  reason: 'Controlled association authored by original drawing review, not an automatically inferred or operator-approved assignment.',
  equipment_references: [{ tag: page === 7 ? 'DOAS 3' : 'DOAS 1 OR 2',
    span_ids: [`sha256:${raw.sha256}:p${page}:s${page === 7 ? 92 : 61}`],
    scope: { building: null, level: null, system: null, phase: null } }],
}));

test('six independently keyed real SOO monitoring requirements preserve modes, targets and raw source', () => {
  const before = structuredClone(sources);
  const result = interpretV1(sources);
  const requirements = requirementsOf(result);
  assert.equal(requirements.length, 6);
  for (const expected of truth.cases) {
    const region = result.regions.find(r => r.page_id.endsWith(`:p${expected.page}`) && r.title === truth.title)!;
    const originalBlock = region.raw.blocks.find(b => b.kind === 'paragraph' && b.marker === expected.marker)!;
    const clause = region.clauses.find(c => c.clause_id === originalBlock.block_id)!;
    assert.equal(clause.requirements.length, 1);
    const requirement = clause.requirements[0];
    assert.equal(requirement.kind, 'monitor_variable');
    if (requirement.kind !== 'monitor_variable') throw new Error('V1 emitted a non-monitoring requirement');
    assert.equal(requirement.variable, expected.variable);
    assert.equal(requirement.operating_mode, expected.mode);
    assert.equal(requirement.modulation, expected.modulate);
    assert.equal(requirement.target, expected.target);
    assert.equal(requirement.signal_type, null);
    assert.equal(requirement.installed_quantity, null);
    assert.equal(requirement.scope_status, 'requires_region_review');
    assert.equal(clause.uninterpreted_text, expected.uninterpreted_tail ?? '');
    for (const evidence of clause.source_spans) assert.deepEqual(evidence, sources.pages.flatMap(p => p.spans).find(s => s.span_id === evidence.span_id));
  }
  assert.equal(result.interpretation_complete, false);
  assert.equal(result.discovery_complete, false);
  assert.deepEqual(sources, before);
  assert.deepEqual(interpretV1(sources), result);
  result.regions[0].raw.heading.text = 'mutated returned copy';
  assert.deepEqual(sources, before);
});

test('explicit source associations yield five listed rows and one bounded omission, without changing printed DI', async () => {
  const before = structuredClone(points);
  const result = await reconcileV1(sources, points, associations);
  const requirements = result.comparisons.flatMap(c => c.requirements);
  assert.equal(requirements.filter(r => r.status === 'listed').length, 5);
  assert.equal(requirements.filter(r => r.status === 'not_listed_in_selected_matrix').length, 1);
  for (const expected of truth.cases) {
    const association = associations[expected.page === 7 ? 0 : 1];
    const comparison = result.comparisons.find(c => c.association.region_id === association.region_id)!;
    const compared = comparison.requirements.find(r => r.requirement.variable === expected.variable)!;
    assert.equal(compared.listed_rows[0]?.local_key ?? null, expected.listed_row_key);
    if (expected.declared_channel) assert.ok(compared.listed_rows[0].observations.some(o => o.kind === 'declared_io' && o.channel === expected.declared_channel && o.value === 1));
    assert.equal(compared.field_wiring_status, 'not_established');
    assert.equal(compared.installed_quantity, null);
    assert.equal(comparison.equipment_references[0].quantity_basis, 'source_reference_only');
    assert.equal(comparison.equipment_references[0].installed_quantity, null);
  }
  assert.deepEqual(points, before);
  assert.deepEqual(await reconcileV1(sources, points, associations), result);
  assert.equal(result.project_complete, false);
  assert.ok(result.comparisons.every(c => c.unpaired_point_row_ids.length > 0));
});

test('no automatic association and identical headings cannot erase opposing unoccupied behavior', async () => {
  const result = await reconcileV1(sources, points, []);
  assert.deepEqual(result.comparisons, []);
  const regions = result.sequences.regions.filter(r => r.title === truth.title);
  assert.equal(regions.length, 2);
  assert.notEqual(regions[0].region_id, regions[1].region_id);
  assert.ok(regions[0].clauses.some(c => c.reading_text?.includes('SHALL RUN AT 30%') && c.status === 'uninterpreted'));
  assert.ok(regions[1].clauses.some(c => c.reading_text?.includes('SHALL NOT RUN UNLESS') && c.status === 'uninterpreted'));
  for (const region of result.sequences.regions) assert.equal(region.clauses.length, region.raw.blocks.length, 'Every source paragraph/inset retained');
});

test('literal normalization never drops point function, equipment identity or negative qualifiers', () => {
  assert.equal(normalizedBasVariable(' CHW  COIL LEAVING AIR TEMP. '), 'CHILLED WATER COIL LEAVING AIR TEMPERATURE');
  for (const suffix of [' SETPOINT', ' STATUS', ' ALARM', ' DOAS-2', ' NOT REQUIRED']) {
    assert.notEqual(normalizedBasVariable(`SUPPLY AIR TEMPERATURE${suffix}`), normalizedBasVariable('SUPPLY AIR TEMPERATURE'));
  }
  assert.notEqual(normalizedBasVariable('RETURN AIR TEMPERATURE'), normalizedBasVariable('SUPPLY AIR TEMPERATURE'));
  assert.notEqual(normalizedBasVariable('SUPPLY AIR TEMP. SET POINT'), normalizedBasVariable('SUPPLY AIR TEMPERATURE'));
});

function statement(text: string) {
  const spans = ['AHU CONTROL SEQUENCE', text].map((str, i) => ({ str, x0: 10, y0: 10 + 20 * i, x1: 800, y1: 20 + 20 * i }));
  return buildBasSourceContext([{ name: 'controlled-negative.pdf', sha256: 'a'.repeat(64), byte_length: 1,
    page_count: 1, pages: [{ page_number: 1, sheet_key: 'test', width_px: 1000, height_px: 1000, rotation: 0, spans }] }]);
}

test('scope-changing and compound clauses do not get coerced into unqualified monitoring requirements', () => {
  const positive = 'THE CONTROLLER SHALL MONITOR SUPPLY AIR TEMPERATURE AND MODULATE THE HOT WATER COIL TO MAINTAIN SUPPLY AIR TEMPERATURE SETPOINT.';
  assert.equal(interpretBasSequences(statement(positive), BAS_SEQUENCE_RULE_V1).regions[0].clauses[0].requirements.length, 1);
  const negatives = [
    positive.replace('SHALL MONITOR', 'SHALL NOT MONITOR'),
    `IF HEATING IS ENABLED, ${positive}`,
    `UNLESS OTHERWISE NOTED: ${positive}`,
    positive.replace('MONITOR SUPPLY AIR TEMPERATURE', 'MONITOR SUPPLY AIR TEMPERATURE AND RETURN AIR TEMPERATURE'),
    positive.replace('HOT WATER COIL', 'HOT WATER COIL ONLY WHEN OCCUPIED'),
    positive.replace('SHALL MONITOR', 'MAY MONITOR'),
    positive.replace('SUPPLY AIR TEMPERATURE AND', 'SUPPLY AIR TEMPERATURE SETPOINT AND'),
    positive.replace('SHALL MONITOR', 'SHALL MONITOR NO'),
    `${positive} ONLY WHEN THE BUILDING IS OCCUPIED.`,
    `${positive} ${'Long retained unsupported content. '.repeat(200)}`,
    'A TEMPERATURE ALARM SHALL SEND AN ALARM TO THE BAS.',
    'SEE THE POINT LIST FOR REQUIREMENTS.',
  ];
  for (const text of negatives) {
    const result = interpretBasSequences(statement(text), BAS_SEQUENCE_RULE_V1);
    assert.equal(requirementsOf(result).length, 0, text);
    assert.equal(result.interpretation_complete, false);
  }
});

test('V2 retains explicit SOO point labels as cited candidates without inventing I/O, quantity or applicability', () => {
  const result = interpretBasSequences(statement('A. SUPPLY FAN STATUS (SF-S)'));
  assert.equal(result.schema_version, 'bas_sequence_requirements_v2');
  const requirements = requirementsOf(result);
  assert.equal(requirements.length, 1);
  const requirement = requirements[0];
  assert.equal(requirement.kind, 'labeled_point_candidate');
  if (requirement.kind !== 'labeled_point_candidate') throw new Error('Expected a labeled point candidate');
  assert.equal(requirement.variable, 'SUPPLY FAN STATUS');
  assert.equal(requirement.source_tag, 'SF-S');
  assert.equal(requirement.signal_type, null);
  assert.equal(requirement.installed_quantity, null);
  assert.equal(requirement.scope_status, 'requires_region_review');
  assert.equal(requirement.source_span_ids.length, 1);
  assert.equal(result.regions[0].clauses[0].uninterpreted_text, 'A. SUPPLY FAN STATUS (SF-S)',
    'Candidate extraction must not claim the surrounding source was fully interpreted');
  assert.equal(requirementsOf(interpretBasSequences(statement('A. SUPPLY FAN STATUS (SF-S)'), BAS_SEQUENCE_RULE_V1)).length, 0,
    'Retained V1 captures must replay under their original interpretation rule');
});

test('V2 joins only abutting source fragments for an exact labeled point and retains every source bbox', () => {
  const context = buildBasSourceContext([{ name: 'fragmented-point.pdf', sha256: 'b'.repeat(64), byte_length: 1,
    page_count: 1, pages: [{ page_number: 1, sheet_key: 'test', width_px: 1000, height_px: 1000, rotation: 0,
      spans: [
        { str: 'AHU CONTROL SEQUENCE', x0: 10, y0: 10, x1: 210, y1: 20 },
        { str: 'A. SUPPLY FAN STATUS (SF', x0: 10, y0: 30, x1: 210, y1: 40 },
        { str: '-', x0: 210.2, y0: 30, x1: 213, y1: 40 },
        { str: 'S)', x0: 213.1, y0: 30, x1: 225, y1: 40 },
      ] }] }]);
  const candidate = requirementsOf(interpretBasSequences(context))[0];
  assert.equal(candidate.kind, 'labeled_point_candidate');
  if (candidate.kind !== 'labeled_point_candidate') throw new Error('Expected a labeled point candidate');
  assert.equal(candidate.source_tag, 'SF-S');
  assert.equal(candidate.source_span_ids.length, 3);
  assert.deepEqual(candidate.source_span_ids, context.pages[0].spans.slice(1).map(span => span.span_id));
});

test('V2 fails closed on parenthetical tags embedded in instructions, continuations and compound references', () => {
  const negatives = [
    'THE CONTROLLER SHALL MONITOR SUPPLY AIR TEMPERATURE (SA-T).',
    'UNIT TO MAINTAIN THE SUPPLY AIRFLOW AT SCHEDULED AIRFLOWS (DOAHSA-F).',
    'HEATING COIL SENSOR. ALSO ENERGIZE INLINE PUMP (HHWP-DOAH-X).',
    'WHILE THE FLOOR TEMPERATURE (FLR-T-MAX) IS BELOW SETPOINT.',
    'SUPPLY AIR TEMPERATURE (SA-T) SETPOINT (SA-T-SP) AS SHOWN.',
    'SEE THE SUPPLY FAN STATUS (SF-S).',
    'SUPPLY FAN STATUS (SFS)',
    'SUPPLY FAN START/STOP (SF-SS/ENA)',
  ];
  for (const source of negatives) assert.equal(requirementsOf(interpretBasSequences(statement(source))).length, 0, source);
  const threshold = requirementsOf(interpretBasSequences(statement('SUPPLY AIR DUCT PRESSURE HIGH LIMIT (SA-P-HL): 1.0 WG INITIAL')))[0];
  assert.equal(threshold.kind, 'labeled_point_candidate');
});

test('duplicate listed labels stay ambiguous and missing name evidence cannot become a missing-point conclusion', async () => {
  const changed = structuredClone(points);
  const matrix = changed.matrices.find(m => m.matrix_id === associations[0].matrix_id)!;
  const row = structuredClone(matrix.rows.find(r => r.name === 'SUPPLY AIR TEMPERATURE')!);
  row.row_id += ':controlled-duplicate';
  matrix.rows.push(row); matrix.raw.rows.push(structuredClone(row.raw));
  const result = await reconcileV1(sources, changed, [associations[0]]);
  assert.equal(result.comparisons[0].requirements.find(r => r.requirement.variable === row.name)!.status, 'ambiguous_listed_rows');
  const missing = structuredClone(points);
  const other = missing.matrices.find(m => m.matrix_id === associations[1].matrix_id)!;
  other.rows[0].name = '';
  const incomplete = await reconcileV1(sources, missing, [associations[1]]);
  assert.equal(incomplete.comparisons[0].requirements.find(r => r.requirement.variable === 'DUCT STATIC PRESSURE')!.status, 'point_labels_unavailable');
});

test('stale, foreign, duplicate and invented equipment associations are rejected', async () => {
  for (const change of [
    (a: BasSequenceAssociation) => { a.region_id = 'unknown'; },
    (a: BasSequenceAssociation) => { a.matrix_id = 'unknown'; },
    (a: BasSequenceAssociation) => { a.equipment_references[0].span_ids = ['foreign-source']; },
    (a: BasSequenceAssociation) => { a.equipment_references[0].tag = 'DOAS 30'; },
    (a: BasSequenceAssociation) => { a.equipment_references.push(structuredClone(a.equipment_references[0])); },
  ]) {
    const association = structuredClone(associations[0]); change(association);
    await assert.rejects(reconcileV1(sources, points, [association]));
  }
  await assert.rejects(reconcileV1(sources, points, [associations[0], associations[0]]), /Duplicate sequence/);
  await assert.rejects(reconcileV1(sources, points, [{ ...associations[0], installed_quantity: 2 }]));
  const spliced = structuredClone(associations[0]);
  spliced.equipment_references[0].span_ids.push(`sha256:${raw.sha256}:p7:s273`);
  spliced.equipment_references[0].tag = 'DOAS 3 DOAS 3';
  await assert.rejects(reconcileV1(sources, points, [spliced]), /text is absent/, 'Distant source fragments cannot manufacture a reference');
});

test('matching text from a different raw column cannot impersonate the point name', async () => {
  const changed = structuredClone(points);
  const matrix = changed.matrices.find(m => m.matrix_id === associations[1].matrix_id)!;
  const row = matrix.rows[0];
  row.raw.cells.NOTES = { text: 'DUCT STATIC PRESSURE', bbox: [1, 1, 2, 2] };
  row.name = 'DUCT STATIC PRESSURE';
  matrix.raw.rows[0] = structuredClone(row.raw);
  const result = await reconcileV1(sources, changed, [associations[1]]);
  assert.equal(result.comparisons[0].requirements.find(r => r.requirement.variable === 'DUCT STATIC PRESSURE')!.status, 'point_labels_unavailable');
});

test('explicit scope labels keep identical referenced tags distinct without establishing two installed units', async () => {
  const association = structuredClone(associations[0]);
  const first = association.equipment_references[0];
  first.scope.building = 'Building A — operator scope input';
  association.equipment_references.push({ ...structuredClone(first), scope: { ...first.scope, building: 'Building B — operator scope input' } });
  const result = await reconcileV1(sources, points, [association]);
  const refs = result.comparisons[0].equipment_references;
  assert.equal(refs.length, 2);
  assert.notEqual(refs[0].reference_id, refs[1].reference_id);
  assert.ok(refs.every(r => r.quantity_basis === 'source_reference_only' && r.installed_quantity === null));
  assert.equal(result.comparisons[0].requirements.length, 3, 'References never replicate point requirements');
});
