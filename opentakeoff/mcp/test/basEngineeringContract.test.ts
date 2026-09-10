/** Transport/lineage tests against the actual Python process, not PDF/UI proof.
 * Controlled cases are reused from Python tests solely for cross-language parity;
 * they are not a second independent ground-truth set or installed design. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { basEngineeringInputSchema, basEngineeringResultSchema, verifyBasEngineeringResult,
  type BasEngineeringInput, type BasEngineeringResult } from '../../web/src/lib/basEngineeringContract.ts';
import { runBasEngineering } from '../src/basMath.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const localPython = fileURLToPath(new URL('../../.venv-bas/bin/python', import.meta.url));
const python = process.env.OPENTAKEOFF_BAS_PYTHON || (existsSync(localPython) ? localPython : 'python3');
const cases: Array<{ name: string; input: BasEngineeringInput; result: BasEngineeringResult }> = JSON.parse(execFileSync(python, ['-c', `
import json, runpy
from bas_engine.engineering_contracts import EngineeringInput
from bas_engine.engineering import check_engineering
a = runpy.run_path('bas_engine/tests/test_engineering.py')
n = runpy.run_path('bas_engine/tests/test_engineering_network.py')
cases = []
for name in ['signal', 'analog', 'loading', 'contact', 'pulse', 'power', 'mechanical', 'allocation', 'expansion', 'serial', 'ip']:
    raw = (n if name in ('serial', 'ip') else a)[name]()
    checks = [raw]
    if name == 'expansion':
        power = a['power']()
        power['check_id'] = 'power-check'
        checks.insert(0, power)
    request = EngineeringInput.model_validate({'checks': checks})
    cases.append({'name': name, 'input': request.model_dump(), 'result': check_engineering(request).model_dump()})
print(json.dumps(cases))
`], { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 }));

for (const fixture of cases) test(`shared engineering wire contract retains actual Python ${fixture.name} inputs, rules and results`, async () => {
  const before = structuredClone(fixture.input);
  assert.deepEqual(basEngineeringInputSchema.parse(fixture.input), fixture.input);
  assert.deepEqual(basEngineeringResultSchema.parse(fixture.result), fixture.result);
  assert.deepEqual(verifyBasEngineeringResult(fixture.input, fixture.result), fixture.result);
  assert.deepEqual(await runBasEngineering(fixture.input, { python }), fixture.result);
  assert.deepEqual(fixture.input, before);
  assert.equal(fixture.result.status, 'pass');
  assert.equal(fixture.result.project_complete, false);
});

test('missing and incompatible inputs remain visible through actual Python, without changing evidence', async () => {
  const input = structuredClone(cases[0].input), check = input.checks[0];
  assert.equal(check.kind, 'signal');
  if (check.kind !== 'signal') throw new Error('Wrong controlled fixture');
  check.source_mode = null;
  const missing = await runBasEngineering(input, { python });
  assert.equal(missing.status, 'not_evaluable');
  assert.ok(missing.checks[0].constraints.some(c => c.missing_inputs.includes('source_mode')));
  check.sink_direction!.value = 'output';
  const failed = await runBasEngineering(input, { python });
  assert.equal(failed.status, 'fail');
  assert.ok(failed.checks[0].constraints.some(c => c.status === 'not_evaluable'));
  assert.deepEqual(failed.original, input);
});

test('strict engineering wire shape does not coerce or discard authored values', async () => {
  const input = structuredClone(cases.find(c => c.name === 'mechanical')!.input);
  const check = input.checks[0];
  if (check.kind !== 'mechanical') throw new Error('Wrong fixture');
  for (const value of [1, true, '1e3', 'NaN', ' 1', '01', '1.', '1\n', '1\r']) {
    const corrupt = structuredClone(input) as unknown as { checks: Array<{ required_torque: { value: { value: unknown } } }> };
    corrupt.checks[0].required_torque.value.value = value;
    assert.equal(basEngineeringInputSchema.safeParse(corrupt).success, false, `Must reject before invoking Python: ${JSON.stringify(value)}`);
    await assert.rejects(runBasEngineering(corrupt, { python: '/not-a-runtime' }));
  }
  await assert.rejects(runBasEngineering({ ...input, hidden_default: 32 }));
  check.required_torque!.basis.origin = 'drawing_transcription';
  check.required_torque!.basis.source_span_ids = [];
  await assert.rejects(runBasEngineering(input));
});

test('Python remains dimensional and relationship authority after a successful JS shape parse', async () => {
  const wrongUnits = structuredClone(cases.find(c => c.name === 'mechanical')!.input);
  const check = wrongUnits.checks[0];
  if (check.kind !== 'mechanical') throw new Error('Wrong fixture');
  check.required_torque!.value.unit = 'V';
  assert.ok(basEngineeringInputSchema.safeParse(wrongUnits).success);
  await assert.rejects(runBasEngineering(wrongUnits, { python }), /Invalid BAS payload: engineering\.checks\.0\.mechanical/);
  const duplicate = structuredClone(cases[0].input);
  duplicate.checks.push(structuredClone(duplicate.checks[0]));
  await assert.rejects(runBasEngineering(duplicate, { python }), /Invalid BAS payload: engineering/);
});

test('response boundary rejects changed source basis, omitted/reordered checks and fabricated summary status', () => {
  const fixture = cases.find(c => c.name === 'expansion')!;
  for (const corrupt of [
    (r: BasEngineeringResult) => { r.original.checks[0].reason = 'Substituted evidence'; },
    (r: BasEngineeringResult) => { r.checks.pop(); },
    (r: BasEngineeringResult) => { r.checks.reverse(); },
    (r: BasEngineeringResult) => { r.checks[0].constraints = []; },
    (r: BasEngineeringResult) => { r.checks[0].constraints[0].status = 'fail'; },
    (r: BasEngineeringResult) => { r.checks[0].constraints[0].missing_inputs = r.checks[0].constraints[0].input_paths; },
    (r: BasEngineeringResult) => { r.checks[0].constraints[0].input_paths = ['__proto__']; },
    (r: BasEngineeringResult) => { r.checks[0].constraints.push(structuredClone(r.checks[0].constraints[0])); },
    (r: BasEngineeringResult) => { r.status = 'not_evaluable'; },
  ]) {
    const response = structuredClone(fixture.result);
    corrupt(response);
    assert.throws(() => verifyBasEngineeringResult(fixture.input, response));
  }
});

test('network response cannot substitute a different closet or segment', () => {
  for (const name of ['serial', 'ip']) {
    const fixture = cases.find(c => c.name === name)!;
    const response = structuredClone(fixture.result), network = response.checks[0].network_calculation!;
    if (network.serial) network.serial.route_id = 'foreign-segment';
    if (network.ip) network.ip.closet_id = 'foreign-closet';
    assert.throws(() => verifyBasEngineeringResult(fixture.input, response));
  }
});

test('empty check selection stays incomplete, cancelled/timed-out/unavailable runs accept nothing', async () => {
  assert.equal((await runBasEngineering({ checks: [] }, { python })).status, 'not_evaluable');
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(runBasEngineering(cases[0].input, { python, signal: aborted.signal }));
  await assert.rejects(runBasEngineering(cases[0].input, { python, timeoutMs: 1 }), /timed out/);
  await assert.rejects(runBasEngineering(cases[0].input, { python: '/not-a-runtime' }), /runtime unavailable/);
});
