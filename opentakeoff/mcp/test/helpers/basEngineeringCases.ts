/** Test-only controlled Python cases and explicit ownership. These do not
 * establish drawing ratings, independent arithmetic truth or installed design.
 * Used by source integration and actual browser form walkthroughs alike. */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basEngineeringInputSchema, type BasEngineeringInput } from '../../../web/src/lib/basEngineeringContract.ts';
import { basEngineeringRegisterSchema, type BasEngineeringRegister } from '../../../web/src/lib/basEngineeringRegister.ts';

type Resource = BasEngineeringRegister['resources'][number];
type Role = Resource['roles'][number];

export function controlledEngineeringCases(owners: [string, string], scope: string) {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const localPython = fileURLToPath(new URL('../../../.venv-bas/bin/python', import.meta.url));
  const python = process.env.OPENTAKEOFF_BAS_PYTHON || (existsSync(localPython) ? localPython : 'python3');
  const raw: Record<string, unknown> = JSON.parse(execFileSync(python, ['-c', `
import json, runpy
a = runpy.run_path('bas_engine/tests/test_engineering.py')
n = runpy.run_path('bas_engine/tests/test_engineering_network.py')
result = {}
for name in ['signal', 'analog', 'loading', 'contact', 'pulse', 'power', 'mechanical', 'allocation', 'expansion', 'serial', 'ip']:
    checks = [(n if name in ('serial', 'ip') else a)[name]()]
    if name == 'expansion':
        power = a['power'](); power['check_id'] = 'power-check'; checks.insert(0, power)
    result[name] = {'checks':checks}
print(json.dumps(result))
`], { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 }));
  const replacements: Record<string, string> = { controller: owners[0], actuator: owners[1],
    'building-A': scope, 'equipment-0': owners[0], 'equipment-1': owners[1] };
  const bind = (value: unknown): unknown => typeof value === 'string' ? replacements[value] ?? value
    : Array.isArray(value) ? value.map(bind) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, bind(v)])) : value;
  const resource = (resource_id: string, owner: 0 | 1, ...roles: Role[]): Resource => ({ resource_id, equipment_id: owners[owner],
    scope_id: scope, component_id: null, roles, label: resource_id, source_span_ids: [], reason: 'Explicit controlled ownership, not installed evidence' });
  const connection = () => [resource('AO-1', 0, 'endpoint'), resource('signal-in', 1, 'endpoint')];
  const power = () => [resource('transformer-A', 0, 'power_supply'), resource('panel-A', 0, 'pool'),
    resource('load-0', 1, 'load'), resource('load-1', 1, 'load')];
  const maps: Record<string, Resource[]> = {
    signal: connection(), analog: connection(), loading: [...connection(), resource('part-0', 1, 'resistive_load'), resource('part-1', 1, 'resistive_load')],
    contact: connection(), pulse: connection(), power: power(),
    mechanical: [resource('required-mechanical-subject', 0, 'mechanical_subject'), resource('provided-mechanical-subject', 1, 'mechanical_subject')],
    allocation: [resource('UI-1', 0, 'channel'), resource('terminal-1', 0, 'terminal'), resource('panel-A', 0, 'pool'), resource('sensor-out', 1, 'endpoint')],
    expansion: [resource('transformer-A', 0, 'power_supply', 'expansion_base'), resource('panel-A', 0, 'pool'),
      resource('load-0', 1, 'load', 'expansion_module'), resource('load-1', 1, 'load', 'expansion_module')],
    serial: [resource('segment-A', 0, 'serial_segment'), resource('port-0', 0, 'network_port'), resource('port-1', 1, 'network_port')],
    ip: [resource('closet-A', 0, 'ip_closet'), resource('network-A', 0, 'ip_domain'), resource('port-0', 0, 'network_port'), resource('port-1', 1, 'network_port')],
  };
  return { python, cases: Object.fromEntries(Object.entries(raw).map(([name, value]) => {
    const input: BasEngineeringInput = basEngineeringInputSchema.parse(bind(value)), resources = maps[name];
    const register = basEngineeringRegisterSchema.parse({ schema_version: 'bas_engineering_register_v1', input, resources,
      targets: input.checks.map(c => ({ check_id: c.check_id, resource_ids: resources.map(r => r.resource_id), source_span_ids: [],
        disposition: 'included', exclusion_reason: null, reason: 'Controlled full resource selection' })) });
    return [name, register];
  })) };
}
