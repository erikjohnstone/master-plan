import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBasSourceContext } from '../src/lib/basSources.ts';
import { interpretBasSequences } from '../src/lib/basSequenceReconciliation.ts';
import { BAS_COMPONENT_SOURCE_RULE_V2, basComponentRequirementsSchema, interpretBasComponentRequirements,
  verifyBasComponentRequirements } from '../src/lib/basComponentRequirements.ts';
import { basAssemblyInterpretationFingerprint } from '../src/lib/basAssemblyRegister.ts';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const raw = read('../../docs/bas-production/evidence/baseline/fort-sam-text.json');
const key = read('./fixtures/bas-requirement-source-cases.json');
const sources = buildBasSourceContext([{ name: 'reviewed-source.pdf', sha256: raw.sha256,
  byte_length: 924578, page_count: raw.pages.length, pages: raw.pages.map((p: { page: number; width: number; height: number; spans: unknown[] }) => ({
    page_number: p.page, sheet_key: `reviewed-source.pdf#${p.page}`, width_px: p.width, height_px: p.height, rotation: 0, spans: p.spans,
  })) }]);
const controller = 'A BACNET COMPATIBLE TERMINAL EQUIPMENT CONTROLLER (TEC)';
const occupancy = 'A DUAL TECHNOLOGY OCCUPANCY SENSOR';
const pressure = 'A DOWNSTREAM STATIC PRESSURE SENSOR';
const damper = 'A PRIMARY MODULATING SUPPLY AIR DAMPER';
const declaration = `EACH VAV TERMINAL UNIT WILL BE PROVIDED WITH ${controller}, ${occupancy}, ${pressure}, AND ${damper}.`;
function controlled(text: string) {
  return buildBasSourceContext([{ name: 'controlled-list.pdf', sha256: 'd'.repeat(64), byte_length: 1, page_count: 1,
    pages: [{ page_number: 1, sheet_key: 'controlled-list.pdf', width_px: 2000, height_px: 1000, rotation: 0,
      spans: ['TERMINAL CONTROL SEQUENCE', text].map((str, i) => ({ str, x0: 10, y0: 10 + i * 30, x1: 1900, y1: 30 + i * 30 })) }] }]);
}
const v2 = (s = sources) => interpretBasComponentRequirements(s, BAS_COMPONENT_SOURCE_RULE_V2);

test('frozen v1 agrees with the fingerprint saved by the pre-v2 real browser assembly review', async () => {
  // Actual source interpretation fingerprint retained by all four accepted
  // assembly-browser-6 v1 events, before the v2 rule was implemented.
  assert.equal(await basAssemblyInterpretationFingerprint(sources, 'explicit_component_declarations_1'),
    '2e2f9648ecbf632b4b891c103d978ca7ce22288349dc3c05a32bd822acc9669c');
});

test('original VAV list yields four source-owned physical roles without extra sensor technologies, actuators or I/O', () => {
  assert.equal(raw.sha256, key.source_sha256);
  const truth = key.component_cases.find((c: { case_id: string }) => c.case_id === 'vav-explicit-components-not-actuator-or-io-inference');
  const page = sources.pages.find(p => p.page_number === truth.page)!;
  const original = structuredClone(sources), sequence = interpretBasSequences(sources);
  const before = interpretBasComponentRequirements(sources), result = v2();
  const clause = result.clauses.find(c => c.source_spans.some(s => s.span_id === page.spans[156].span_id))!;
  assert.equal(clause.reading_text, truth.text);
  assert.deepEqual(clause.source_spans, truth.source_spans.map((index: number) => page.spans[index]));
  assert.deepEqual(clause.components.map(c => [c.component_kind, 'component_role' in c ? c.component_role : null, c.declared_quantity]), [
    ['terminal_equipment_controller', 'terminal_equipment_control', 1], ['sensor', 'dual_technology_occupancy', 1],
    ['sensor', 'downstream_static_pressure', 1], ['damper', 'primary_modulating_supply_air', 1],
  ]);
  assert.equal(new Set(clause.components.map(c => c.requirement_id)).size, 4);
  assert.equal(clause.components[0].protocol_requirement, 'BACnet compatible');
  assert.ok(clause.components.every(c => c.installed_quantity === null && c.field_wiring_status === 'not_established'
    && Object.values(c.responsibilities).every(v => v === null)));
  assert.equal(clause.status, 'explicit_component_requirements');
  assert.equal(clause.uninterpreted_text, '');
  assert.equal(before.clauses.find(c => c.clause_id === clause.clause_id)!.components.length, 0);
  // Exactly this independently reviewed paragraph changes; adjacent points and
  // all other declarations/behavioral references remain their original records.
  assert.deepEqual(result.clauses.filter(c => c.clause_id !== clause.clause_id), before.clauses.filter(c => c.clause_id !== clause.clause_id));
  assert.deepEqual(interpretBasComponentRequirements(sources), before);
  assert.deepEqual(interpretBasSequences(sources), sequence);
  assert.deepEqual(sources, original);
  assert.deepEqual(verifyBasComponentRequirements(sources, result), result);
  assert.equal(result.project_complete, false); assert.equal(result.interpretation_complete, false);
});

test('list grammar supports independently varied subjects, subsets, item order and literal quantity spellings', () => {
  for (const [text, count] of [
    [declaration, 4], [declaration.toLowerCase(), 4], [declaration.replace(/ /g, '  '), 4],
    [declaration.replace('VAV TERMINAL UNIT WILL', 'TERMINAL BOX SHALL'), 4],
    [declaration.replace(/A /g, 'ONE '), 4], [declaration.replace(/A /g, '1 '), 4],
    [declaration.replace('DUAL TECHNOLOGY', 'DUAL-TECHNOLOGY').replace('STATIC PRESSURE', 'STATIC-PRESSURE').replace('SUPPLY AIR', 'SUPPLY-AIR'), 4],
    [`EACH TERMINAL SHALL BE PROVIDED WITH ${damper} AND ${occupancy}.`, 2],
    [`EACH TERMINAL SHALL BE PROVIDED WITH ${pressure}.`, 1],
    [`EACH TERMINAL SHALL BE PROVIDED WITH ${occupancy}, ${controller} AND ${pressure}.`, 3],
    [`1. ${declaration}`, 4], [declaration.replace(' (TEC)', ''), 4],
  ] as const) {
    const source = controlled(text), result = v2(source), components = result.clauses.flatMap(c => c.components);
    assert.equal(components.length, count, text);
    assert.ok(components.every(c => c.declared_quantity === 1 && c.scope_status === 'requires_equipment_applicability_review'));
    assert.deepEqual(verifyBasComponentRequirements(source, result), result);
  }
});

test('unsafe, incomplete and unsupported lists never become a plausible partial assembly', () => {
  for (const text of [
    `IF REQUIRED, ${declaration}`, declaration.replace('WILL BE', 'WILL NOT BE'), declaration.replace('WILL BE', 'MAY BE'),
    declaration.replace(', AND ', ', OR '), declaration.replace('A DUAL', 'TWO DUAL'), declaration.replace('A DUAL', 'DUAL'),
    declaration.replace('A DUAL', 'AN OPTIONAL DUAL'), declaration.replace('A DUAL', 'A FACTORY FURNISHED DUAL'),
    declaration.replace(pressure, 'A SUPPLY TEMPERATURE SENSOR'), declaration.replace('VAV TERMINAL UNIT', 'VAV OR FAN COIL'),
    declaration.replace('VAV TERMINAL UNIT', 'VAV WHEN OCCUPIED'), declaration.replace('EACH', 'NO'),
    declaration.replace('DAMPER.', 'DAMPER AND ACTUATOR.'), `${declaration} EXCEPT EXISTING DEVICES.`,
    `${declaration} CONTROLS CONTRACTOR SHALL INSTALL THESE.`, declaration.replace('SENSOR, AND', 'SENSORS, AND'),
    'THE CONTROLLER SHALL MONITOR ITS ASSOCIATED OCCUPANCY SENSOR.',
    'DUAL OCCUPANCY SENSOR DI X',
  ]) {
    const result = v2(controlled(text));
    assert.equal(result.clauses.flatMap(c => c.components).length, 0, text);
    assert.ok(result.clauses.some(c => c.source_spans.some(s => s.text === text)), 'Original unsupported source stays inspectable');
  }
  const duplicate = v2(controlled(`EACH TERMINAL SHALL BE PROVIDED WITH ${occupancy} AND ${occupancy}.`));
  assert.equal(duplicate.clauses.flatMap(c => c.components).length, 0);
  assert.ok(duplicate.clauses.some(c => c.issues.includes('DUPLICATE_COMPONENT_ROLE_REQUIRES_REVIEW')));
});

test('version and role tampering reject, and a new rule never silently changes a v1 source result', () => {
  const source = controlled(declaration), before = interpretBasComponentRequirements(source), result = v2(source);
  assert.deepEqual(verifyBasComponentRequirements(source, before), before);
  assert.throws(() => interpretBasComponentRequirements(source, 'future'));
  assert.throws(() => verifyBasComponentRequirements(source, { ...result, rule_version: 'explicit_component_declarations_1' }));
  assert.throws(() => verifyBasComponentRequirements(source, { ...result, schema_version: 'bas_component_requirements_v1' }));
  const altered = structuredClone(result);
  const sensor = altered.clauses.flatMap(c => c.components).find(c => c.component_kind === 'sensor')!;
  assert.ok('component_role' in sensor);
  if ('component_role' in sensor) sensor.component_role = 'downstream_static_pressure';
  assert.ok(basComponentRequirementsSchema.safeParse(altered).success, 'Same physical kind is schema-valid but not source-equivalent');
  assert.throws(() => verifyBasComponentRequirements(source, altered), /retained source evidence/);
  assert.equal(before.clauses.flatMap(c => c.components).length, 0);
});
