import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBasSourceContext } from '../src/lib/basSources.ts';
import { interpretBasSequences } from '../src/lib/basSequenceReconciliation.ts';
import { basComponentRequirementsSchema, interpretBasComponentRequirements, verifyBasComponentRequirements } from '../src/lib/basComponentRequirements.ts';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const raw = read('../../docs/bas-production/evidence/baseline/fort-sam-text.json');
const key = read('./fixtures/bas-requirement-source-cases.json');
const sources = buildBasSourceContext([{ name: 'reviewed-source.pdf', sha256: raw.sha256,
  byte_length: 924578, page_count: raw.pages.length, pages: raw.pages.map((p: { page: number; width: number; height: number; spans: unknown[] }) => ({
    page_number: p.page, sheet_key: `reviewed-source.pdf#${p.page}`, width_px: p.width, height_px: p.height, rotation: 0, spans: p.spans,
  })) }]);

test('original M-512 explicitly requires distinct supply/exhaust VFDs, not extra devices from their AO rows', () => {
  assert.equal(raw.sha256, key.source_sha256);
  const truth = key.component_cases.find((c: { case_id: string }) => c.case_id === 'supply-and-exhaust-vfds-are-distinct');
  const before = structuredClone(sources), monitoring = interpretBasSequences(sources);
  const result = interpretBasComponentRequirements(sources);
  const source = sources.pages.find(p => p.page_number === truth.page)!.spans[truth.requirement_span];
  assert.equal(source.text, truth.text, 'Visual key agrees with original retained text');
  const matching = result.clauses.filter(c => c.source_spans.some(s => s.span_id === source.span_id));
  assert.equal(matching.length, 1);
  assert.deepEqual(matching[0].components.map(c => [c.fan_role, c.declared_quantity]), [['SUPPLY', 1], ['EXHAUST', 1]]);
  assert.notEqual(matching[0].components[0].requirement_id, matching[0].components[1].requirement_id);
  assert.deepEqual(matching[0].source_spans, [source]);
  assert.ok(matching[0].components.every(c => c.installed_quantity === null && c.scope_status === 'requires_equipment_applicability_review'
    && Object.values(c.responsibilities).every(v => v === null)));
  assert.equal(result.clauses.length, monitoring.regions.reduce((n, r) => n + r.clauses.length, 0));
  assert.ok(result.clauses.some(c => c.status === 'uninterpreted' && c.reading_text?.includes('ONBOARD BACNET CONTROLLER')));
  assert.equal(result.project_complete, false); assert.equal(result.interpretation_complete, false);
  assert.deepEqual(interpretBasComponentRequirements(sources), result);
  assert.deepEqual(interpretBasSequences(sources), monitoring);
  matching[0].source_spans[0].text = 'Changed returned copy';
  assert.deepEqual(sources, before);
});

function statement(text: string) {
  return buildBasSourceContext([{ name: 'controlled.pdf', sha256: 'b'.repeat(64), byte_length: 1, page_count: 1,
    pages: [{ page_number: 1, sheet_key: 'controlled.pdf', width_px: 2000, height_px: 1000, rotation: 0,
      spans: ['AHU CONTROL SEQUENCE', text].map((str, i) => ({ str, x0: 10, y0: 10 + i * 30, x1: 1900, y1: 30 + i * 30 })) }] }]);
}
const base = 'THE AHU SHALL BE PROVIDED WITH A VFD FOR THE SUPPLY FAN, AND A VFD FOR THE EXHAUST FAN.';

test('explicit declarative fan-role and one-quantity variants remain source-bound', () => {
  for (const text of [base, base.toLowerCase(), base.replace(/A VFD/g, 'ONE VFD'), base.replace(/A VFD/g, '1 VFD'),
    base.replace('SUPPLY', 'RETURN').replace('EXHAUST', 'RELIEF'), `1.2 ${base}`, base.replace(/ /g, '  ')]) {
    const source = statement(text), result = interpretBasComponentRequirements(source);
    assert.equal(result.clauses.flatMap(c => c.components).length, 2, text);
    assert.ok(result.clauses.filter(c => c.components.length).every(c => c.source_spans.length > 0));
  }
});

test('conditions, alternatives, extra clauses, ambiguous quantities and duplicate roles cannot invent devices', () => {
  for (const text of [`IF REQUIRED, ${base}`, base.replace('SHALL BE', 'SHALL NOT BE'), base.replace(', AND ', ', OR '),
    base.replace('A VFD', 'TWO VFDS'), base.replace('A VFD', 'VFD'), base.replace('EXHAUST', 'SUPPLY'),
    `${base} EXCEPT WHERE EXISTING.`, `${base} PROVIDE AN ADDITIONAL VFD.`, base.replace('THE AHU', 'THE AHU OR DOAS'),
    base.replace('THE AHU', 'THE AHU WHEN OCCUPIED'), base.replace('VFD FOR THE SUPPLY FAN', 'VFD IF REQUIRED FOR THE SUPPLY FAN')]) {
    const result = interpretBasComponentRequirements(statement(text));
    assert.equal(result.clauses.flatMap(c => c.components).length, 0, text);
    assert.ok(result.clauses.every(c => c.status === 'uninterpreted'));
    assert.ok(result.clauses.some(c => c.reading_text?.includes(text) || c.source_spans.some(s => s.text === text)), 'Unsupported evidence retained');
  }
  const duplicate = interpretBasComponentRequirements(statement(base.replace('EXHAUST', 'SUPPLY')));
  assert.ok(duplicate.clauses.some(c => c.issues.includes('DUPLICATE_FAN_ROLE_REQUIRES_REVIEW')));
});

test('original M-512 controller declaration keeps factory furnish separate from monitoring, wiring, programming and tests', () => {
  const truth = key.component_cases.find((c: { case_id: string }) => c.case_id === 'one-onboard-controller-referenced-for-several-functions');
  const page = sources.pages.find(p => p.page_number === truth.page)!;
  const original = structuredClone(sources), result = interpretBasComponentRequirements(sources);
  const requirementSpan = page.spans[truth.requirement_span];
  assert.equal(requirementSpan.text, 'DOAS CONTROL: THE DOAS SYSTEM SHALL BE PROVIDED WITH A FACTORY FURNISHED ON-BOARD BACNET CONTROLLER THE MANUFACTURER SHALL USE ITS PREFERRED SEQUENCE TO MEET THE FOLLOWING');
  const clause = result.clauses.find(c => c.source_spans.some(s => s.span_id === requirementSpan.span_id))!;
  assert.equal(clause.components.length, 1);
  const component = clause.components[0];
  assert.equal(component.component_kind, 'onboard_controller');
  assert.equal(component.subject_label, 'DOAS SYSTEM', 'System scope is not silently replaced with a per-equipment multiplier');
  assert.equal(component.declared_quantity, 1);
  assert.equal(component.protocol_requirement, 'BACnet');
  assert.deepEqual(component.responsibilities, { furnish: 'factory_furnished', install: null, wire: null, program: null, test: null });
  assert.equal(component.installed_quantity, null);
  assert.equal(clause.status, 'partially_interpreted');
  assert.equal(clause.uninterpreted_text, 'DOAS CONTROL: THE MANUFACTURER SHALL USE ITS PREFERRED SEQUENCE TO MEET THE FOLLOWING REQUIREMENTS:');
  assert.deepEqual(clause.source_spans, [page.spans[187], page.spans[188], page.spans[189]]);
  for (const spanIndex of truth.subsequent_reference_spans) {
    const reference = result.clauses.find(c => c.source_spans.some(s => s.span_id === page.spans[spanIndex].span_id))!;
    assert.equal(reference.components.length, 0, 'Monitoring/alarms do not create another controller');
    assert.equal(reference.status, 'uninterpreted');
    assert.equal(reference.uninterpreted_text, reference.reading_text);
  }
  assert.deepEqual(verifyBasComponentRequirements(sources, result), result);
  assert.deepEqual(sources, original);
});

const controllerBase = 'THE AHU SYSTEM SHALL BE PROVIDED WITH A FACTORY FURNISHED ON-BOARD BACNET CONTROLLER.';
const controllerTail = 'THE MANUFACTURER SHALL USE ITS PREFERRED SEQUENCE TO MEET THE FOLLOWING REQUIREMENTS:';
test('factory controller declarations support explicit grammar variants without assigning other activities', () => {
  for (const text of [controllerBase, controllerBase.toLowerCase(), controllerBase.replace('A FACTORY', 'ONE FACTORY'),
    controllerBase.replace('A FACTORY', '1 FACTORY'), controllerBase.replace('FACTORY FURNISHED', 'FACTORY-FURNISHED'),
    controllerBase.replace('ON-BOARD', 'ONBOARD'), controllerBase.replace('ON-BOARD', 'ON BOARD'),
    controllerBase.replace(/ /g, '  '), `2. ${controllerBase}`, `AHU CONTROL: ${controllerBase}`,
    `${controllerBase} ${controllerTail}`, `${controllerBase.slice(0, -1)} ${controllerTail}`]) {
    const result = interpretBasComponentRequirements(statement(text)), components = result.clauses.flatMap(c => c.components);
    assert.equal(components.length, 1, text);
    assert.equal(components[0].component_kind, 'onboard_controller');
    assert.deepEqual(components[0].responsibilities, { furnish: 'factory_furnished', install: null, wire: null, program: null, test: null });
    assert.equal(components[0].installed_quantity, null);
    assert.deepEqual(verifyBasComponentRequirements(statement(text), result), result);
  }
});

test('controller references, conditions, alternatives and extra instructions are not declarations', () => {
  for (const text of [`IF REQUIRED, ${controllerBase}`, controllerBase.replace('SHALL BE', 'SHALL NOT BE'),
    controllerBase.replace('SHALL BE', 'MAY BE'), controllerBase.replace('A FACTORY', 'TWO FACTORY'),
    controllerBase.replace('A FACTORY', 'FACTORY'), controllerBase.replace('BACNET', 'BACNET OR LONWORKS'),
    controllerBase.replace('AHU SYSTEM', 'AHU OR DOAS'), controllerBase.replace('AHU SYSTEM', 'AHU WHEN OCCUPIED'),
    `${controllerBase} EXCEPT WHERE EXISTING.`, `${controllerBase} CONTROLS CONTRACTOR SHALL WIRE THE CONTROLLER.`,
    `${controllerBase.slice(0, -1)} ${controllerTail} OMIT THE CONTROLLER IF EXISTING.`,
    controllerBase.replace('FACTORY FURNISHED', 'FIELD INSTALLED'),
    'THE ONBOARD BACNET CONTROLLER SHALL TRANSMIT ALARMS TO THE BAS.',
    'THE CONTROLLER SHALL MONITOR SUPPLY AIR TEMPERATURE AND MODULATE THE VALVE TO MAINTAIN THE SETPOINT.']) {
    const result = interpretBasComponentRequirements(statement(text));
    assert.equal(result.clauses.flatMap(c => c.components).length, 0, text);
    assert.ok(result.clauses.some(c => c.source_spans.some(s => s.text === text)));
  }
});

test('strict component outputs and source replay reject invented responsibilities, altered evidence and missing clauses', () => {
  const source = statement(controllerBase), result = interpretBasComponentRequirements(source);
  const index = result.clauses.findIndex(c => c.components.length > 0);
  assert.ok(index >= 0);
  // These remain schema-valid but are not source-valid.
  for (const alter of [
    (r: typeof result) => { r.clauses[index].components[0].subject_label = 'OTHER EQUIPMENT'; },
    (r: typeof result) => { r.clauses[index].reading_text = 'Rewritten source'; },
    (r: typeof result) => { r.clauses[index].source_spans[0].text = 'Rewritten source'; },
    (r: typeof result) => { r.clauses[index].source_spans[0].bbox_px[0] += 1; },
    (r: typeof result) => { r.clauses[index].page_id = 'sha256:foreign:p1'; },
    (r: typeof result) => { r.clauses[index].components[0].requirement_id += ':duplicate'; },
    (r: typeof result) => { r.clauses[index].source_spans = []; },
    (r: typeof result) => { r.clauses.splice(index, 1); },
    (r: typeof result) => { r.clauses.push(structuredClone(r.clauses[index])); },
  ]) {
    const tampered = structuredClone(result); alter(tampered);
    assert.ok(basComponentRequirementsSchema.safeParse(tampered).success);
    assert.throws(() => verifyBasComponentRequirements(source, tampered), /retained source evidence/);
  }
  const component = result.clauses[index].components[0];
  for (const alteration of [
    { declared_quantity: 2 }, { declared_quantity: Number.NaN }, { installed_quantity: 1 },
    { wire_voltage: 24 }, { component_kind: 'default_relay_kit' }, { protocol_requirement: 'BACnet/IP' },
    { responsibilities: { ...component.responsibilities, furnish: 'controls_contractor' } },
    { responsibilities: { ...component.responsibilities, wire: 'by_others' } },
    { responsibilities: { ...component.responsibilities, program: 'manufacturer' } },
  ]) {
    const tampered = structuredClone(result);
    Object.assign(tampered.clauses[index].components[0], alteration);
    assert.throws(() => verifyBasComponentRequirements(source, tampered));
  }
  assert.throws(() => verifyBasComponentRequirements(source, { ...result, schema_version: 'future' }));
  const foreign = structuredClone(source); foreign.pages[0].spans[1].span_id += ':foreign';
  assert.throws(() => interpretBasComponentRequirements(foreign));
});
