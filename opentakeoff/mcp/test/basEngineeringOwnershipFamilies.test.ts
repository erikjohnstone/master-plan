/** Explicit independent resource maps exercise ownership for every Python rule
 * family. Numeric cases are reused solely for transport/integration, not new
 * independent calculation truth or real drawing ratings. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { engineeringFixture, uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { basEngineeringInputSchema, type BasEngineeringInput } from '../../web/src/lib/basEngineeringContract.ts';
import { basEngineeringRegisterSchema, validateBasEngineeringRegister, type BasEngineeringRegister } from '../../web/src/lib/basEngineeringRegister.ts';
import { applyBasEngineeringReview, verifyBasEngineeringHistory } from '../src/basEngineeringReview.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const localPython = fileURLToPath(new URL('../../.venv-bas/bin/python', import.meta.url));
const python = process.env.OPENTAKEOFF_BAS_PYTHON || (existsSync(localPython) ? localPython : 'python3');
const cases: Record<string, BasEngineeringInput> = JSON.parse(execFileSync(python, ['-c', `
import json, runpy
a = runpy.run_path('bas_engine/tests/test_engineering.py')
n = runpy.run_path('bas_engine/tests/test_engineering_network.py')
def uid(n): return '00000000-0000-4000-8000-' + str(n).zfill(12)
replacements = {'controller':uid(11), 'actuator':uid(12), 'building-A':uid(1), 'equipment-0':uid(11), 'equipment-1':uid(12)}
def bind(value):
    if isinstance(value, str): return replacements.get(value, value)
    if isinstance(value, list): return [bind(v) for v in value]
    if isinstance(value, dict): return {k:bind(v) for k,v in value.items()}
    return value
result = {}
for name in ['signal', 'analog', 'loading', 'contact', 'pulse', 'power', 'mechanical', 'allocation', 'expansion', 'serial', 'ip']:
    checks = [(n if name in ('serial', 'ip') else a)[name]()]
    if name == 'expansion':
        power = a['power'](); power['check_id'] = 'power-check'; checks.insert(0, power)
    result[name] = {'checks':bind(checks)}
print(json.dumps(result))
`], { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 }));

type Resource = BasEngineeringRegister['resources'][number];
type Role = Resource['roles'][number];
const resource = (resource_id: string, owner: number, ...roles: Role[]): Resource => ({ resource_id, equipment_id: uuid(owner),
  scope_id: uuid(1), component_id: null, roles, label: resource_id, source_span_ids: [], reason: 'Explicit controlled ownership, not installed evidence' });
const connection = () => [resource('AO-1', 11, 'endpoint'), resource('signal-in', 12, 'endpoint')];
const power = () => [resource('transformer-A', 11, 'power_supply'), resource('panel-A', 11, 'pool'),
  resource('load-0', 12, 'load'), resource('load-1', 12, 'load')];
const maps: Record<string, Resource[]> = {
  signal: connection(), analog: connection(), loading: [...connection(), resource('part-0', 12, 'resistive_load'), resource('part-1', 12, 'resistive_load')],
  contact: connection(), pulse: connection(), power: power(),
  mechanical: [resource('required-mechanical-subject', 11, 'mechanical_subject'), resource('provided-mechanical-subject', 12, 'mechanical_subject')],
  allocation: [resource('UI-1', 11, 'channel'), resource('terminal-1', 11, 'terminal'), resource('panel-A', 11, 'pool'), resource('sensor-out', 12, 'endpoint')],
  expansion: [resource('transformer-A', 11, 'power_supply', 'expansion_base'), resource('panel-A', 11, 'pool'),
    resource('load-0', 12, 'load', 'expansion_module'), resource('load-1', 12, 'load', 'expansion_module')],
  serial: [resource('segment-A', 11, 'serial_segment'), resource('port-0', 11, 'network_port'), resource('port-1', 12, 'network_port')],
  ip: [resource('closet-A', 11, 'ip_closet'), resource('network-A', 11, 'ip_domain'), resource('port-0', 11, 'network_port'), resource('port-1', 12, 'network_port')],
};

for (const [name, raw] of Object.entries(cases)) test(`owned ${name} checks save and replay through Python; every selected resource is checked`, async () => {
  const { workflow, request, equipment, assembly, capture } = await engineeringFixture();
  const input = basEngineeringInputSchema.parse(raw), resources = maps[name];
  const register = basEngineeringRegisterSchema.parse({ schema_version: 'bas_engineering_register_v1', input, resources,
    targets: input.checks.map(c => ({ check_id: c.check_id, resource_ids: resources.map(r => r.resource_id), source_span_ids: [],
      disposition: 'included', exclusion_reason: null, reason: 'Controlled full resource selection' })) });
  const saved = await applyBasEngineeringReview(workflow, { ...request, register }, 'operator_input', { python });
  assert.equal(saved.event.result.status, 'pass');
  assert.equal(saved.event.result.project_complete, false);
  assert.deepEqual(saved.event.register, register);
  assert.deepEqual(await verifyBasEngineeringHistory(saved.workflow, { python }), saved.workflow);
  // An unregistered owner must reject for every resource, including supplies,
  // pools, terminals and domains that have no inline equipment_id in Python.
  for (let i = 0; i < resources.length; i++) {
    const bad = structuredClone(register); bad.resources[i].equipment_id = uuid(99);
    await assert.rejects(validateBasEngineeringRegister(capture, equipment, assembly, bad), /actual scope/);
    if (name !== 'mechanical') {
      const missing = structuredClone(register); missing.resources.splice(i, 1);
      await assert.rejects(validateBasEngineeringRegister(capture, equipment, assembly, missing), /unowned resource/);
    }
  }
  const wrongRoles = structuredClone(register);
  wrongRoles.resources.forEach(r => { r.roles = ['pool']; });
  await assert.rejects(validateBasEngineeringRegister(capture, equipment, assembly, wrongRoles), /ownership mismatch|explicitly owned subject/);
});
