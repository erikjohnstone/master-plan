/** Controlled editor tests: structure and preservation, not drawing truth. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { basEngineeringCheckSchema } from '../src/lib/basEngineeringContract.ts';
import { blankEngineeringValue, editorSchema, engineeringRatingShape, newEngineeringCheck, stageEngineeringCheck,
  stageEngineeringResource, engineeringPreviewReady, engineeringListWindow, engineeringArrayIndex, engineeringInputAtPath } from '../src/components/basEngineeringEditorState.ts';
import BasEngineeringFields from '../src/components/BasEngineeringFields.jsx';
import BasEngineeringResults, { EngineeringInputLink } from '../src/components/BasEngineeringResults.jsx';
import { engineeringFixture, explicit, uuid } from './helpers/basEngineeringFixture.ts';

test('every engineering variant and nested schema is editable without fabricating ratings or defaults', () => {
  const kinds = basEngineeringCheckSchema.options.map(option => option.shape.kind.value);
  assert.equal(kinds.length, 11);
  let knownObjects = 0;
  function walk(raw: z.ZodTypeAny) {
    const schema = editorSchema(raw);
    const blank = blankEngineeringValue(schema);
    if (schema instanceof z.ZodNullable) { assert.equal(blank, null); walk(schema.unwrap()); }
    else if (schema instanceof z.ZodArray) { assert.deepEqual(blank, []); walk(schema.element); }
    else if (schema instanceof z.ZodObject) {
      if (engineeringRatingShape(schema)) knownObjects++;
      Object.values(schema.shape).forEach(child => walk(child as z.ZodTypeAny));
    } else if (!(schema instanceof z.ZodLiteral)) assert.equal(blank, '');
  }
  for (const option of basEngineeringCheckSchema.options) {
    walk(option);
    const draft: Record<string, unknown> = newEngineeringCheck(option.shape.kind.value, uuid(11), uuid(99));
    assert.equal(draft.check_id, uuid(99)); assert.deepEqual(draft.equipment_ids, [uuid(11)]);
    assert.equal(draft.reason, '');
    assert.deepEqual(newEngineeringCheck(option.shape.kind.value, undefined, uuid(99)).equipment_ids, [], 'Overview does not invent an equipment identity');
    assert.equal(option.safeParse(draft).success, false, 'A new draft is not a valid declaration');
    for (const [key, schema] of Object.entries(option.shape)) if (schema instanceof z.ZodNullable) assert.equal(draft[key], null);
  }
  assert.ok(knownObjects > 50, 'All nested rating shapes are visited');
});

test('required scenario-state ratings use the source picker, not raw source-ID fields', () => {
  const power: z.AnyZodObject = basEngineeringCheckSchema.options.find(o => o.shape.kind.value === 'power')!;
  const states = editorSchema(power.shape.scenarios) as z.ZodArray<z.AnyZodObject>;
  const state = states.element.shape.states.element.shape.state;
  assert.ok(engineeringRatingShape(state)); assert.equal(state instanceof z.ZodNullable, false);
  const html = renderToStaticMarkup(createElement(BasEngineeringFields, { schema: state, value: explicit('startup'),
    onChange: () => {}, label: 'Scenario state', field: 'state', context: { equipment: [], scopes: [], resources: [], checks: [], spans: [], onSource: () => {} },
    onUi: () => {} }));
  assert.match(html, /Scenario state: source evidence/);
  assert.match(html, /Manual transcription of drawing text/);
  assert.doesNotMatch(html, /Add source span ids entry/);
  assert.match(html, /value="startup" selected/);
});

test('staging related checks and resources preserves exact evidence, array order and old snapshots', async () => {
  const f = await engineeringFixture(), original = structuredClone(f.register);
  const nextCheck = structuredClone(f.register.input.checks[0]);
  nextCheck.check_id = 'second-check'; nextCheck.reason = 'Controlled second check';
  const target = { ...f.register.targets[0], check_id: nextCheck.check_id };
  const next = stageEngineeringCheck(f.register, nextCheck, target);
  assert.deepEqual(f.register, original); assert.equal(next.input.checks.length, 2);
  assert.deepEqual(next.input.checks[0], original.input.checks[0]);
  assert.deepEqual(next.input.checks[1], nextCheck);
  nextCheck.reason = 'Later typing'; assert.equal(next.input.checks[1].reason, 'Controlled second check');
  const resource = { ...next.resources[0], label: 'Controlled renamed endpoint' };
  const second = stageEngineeringResource(next, resource);
  assert.equal(next.resources[0].label, original.resources[0].label);
  assert.equal(second.resources[0].label, resource.label); assert.equal(second.resources.length, next.resources.length);
  assert.deepEqual(second.input, next.input); assert.deepEqual(second.targets, next.targets);
  assert.throws(() => stageEngineeringCheck(next, nextCheck, { ...target, check_id: 'wrong' }), /identities differ/);
  assert.throws(() => stageEngineeringResource(next, { ...resource, reason: '' }));
});

test('preview cannot survive any changed draft/register or stale dependency', () => {
  const draft = {}, batch = {}, preview = { draft, batch };
  assert.equal(engineeringPreviewReady(preview, draft, batch, false), true);
  assert.equal(engineeringPreviewReady(preview, {}, batch, false), false);
  assert.equal(engineeringPreviewReady(preview, draft, {}, false), false);
  assert.equal(engineeringPreviewReady(preview, draft, batch, true), false);
  assert.equal(engineeringPreviewReady({ draft: null, batch }, null, batch, false), true);
  assert.equal(engineeringPreviewReady({ draft: undefined, batch: undefined }, undefined, undefined, false), false);
});

test('large lists are windowed without losing the last item, selections or stable order', () => {
  const rows = Array.from({ length: 10000 }, (_, i) => ({ id: i, label: `Port ${i}` })), before = structuredClone(rows);
  const window = engineeringListWindow(rows, '', 199, r => r.label);
  assert.equal(window.rows.length, 50); assert.equal(window.rows.at(-1)!.id, 9999);
  assert.equal(window.pages, 200);
  const narrowed = engineeringListWindow(rows, 'Port 9999', 199, r => r.label);
  assert.equal(narrowed.page, 0); assert.deepEqual(narrowed.rows, [rows[9999]]);
  assert.deepEqual(engineeringListWindow(rows, 'missing', Infinity, r => r.label).rows, []);
  for (const bad of [NaN, Infinity, -Infinity, -1, undefined]) assert.equal(engineeringArrayIndex(bad, 10000), 0);
  assert.equal(engineeringArrayIndex(99999, 10000), 9999); assert.equal(engineeringArrayIndex(2.7, 10), 2);
  assert.deepEqual(rows, before);
});

test('original-input paths preserve nested ratings and do not follow inherited properties', () => {
  const rating = explicit({ value: '0.000001', unit: 'mA' });
  const check = { loads: [{ operating: { demand: rating } }] };
  assert.equal(engineeringInputAtPath(check, 'loads.0.operating.demand'), rating);
  assert.equal(engineeringInputAtPath(check, 'loads.0.operating.demand.value.value'), '0.000001');
  for (const path of ['loads.1', '__proto__', 'constructor', 'loads.constructor', 'loads.0.unknown']) assert.equal(engineeringInputAtPath(check, path), undefined);
  assert.equal(engineeringInputAtPath(Object.create({ inherited: 7 }), 'inherited'), undefined);
});

test('outcome input links distinguish declared and transcribed data without claiming automated extraction', async () => {
  const f = await engineeringFixture(), check = f.register.input.checks[0], before = structuredClone(check);
  const render = (path: string) => renderToStaticMarkup(createElement(EngineeringInputLink, { check, path, onField: () => {} }));
  assert.match(render('source_mode'), /Explicit input — not extracted/);
  assert.match(render('sink_modes'), /Manually transcribed from drawing/);
  assert.match(render('sink_modes'), /1 drawing references/);
  assert.match(render('source.endpoint_id'), /Recorded input/);
  assert.match(render('missing'), /Unknown \/ not provided/);
  assert.deepEqual(check, before);
});

test('dense results render at most fifty constraints, retain the last outcome and never rewrite results', () => {
  const result = { checks: [{ check_id: 'controlled', constraints: Array.from({ length: 10001 }, (_, i) => ({
    rule_id: `constraint-${i}`, status: i === 10000 ? 'fail' : 'pass', message: `Controlled result ${i}`,
    missing_inputs: [], normalized: {}, input_paths: ['source_direction'],
  })) }] };
  const register = { input: { checks: [{ check_id: 'controlled', source_direction: explicit('output') }] } };
  const before = structuredClone(result);
  const render = (page: number) => renderToStaticMarkup(createElement(BasEngineeringResults, { result, register, page, checkId: 'controlled', onField: () => {}, onPage: () => {} }));
  const first = render(0), last = render(200);
  assert.equal((first.match(/scope="row"/g) || []).length, 50);
  assert.equal((last.match(/scope="row"/g) || []).length, 1);
  assert.match(last, /constraint-10000/); assert.match(last, /Fails declared constraint/);
  assert.match(first, /Calculated from recorded inputs/); assert.match(first, /not verification of installed hardware/);
  assert.deepEqual(result, before);
});
