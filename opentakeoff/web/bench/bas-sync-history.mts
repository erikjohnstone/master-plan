// Run serially after the parallel correctness suite. The unchanged 5 s budget
// measures shared history retention/lineage, not network or Python math replay.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { retainBasWorkflowHistory, verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
const raw = readFileSync(new URL('../../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json', import.meta.url));
const real = JSON.parse(raw.toString()).bas_workflow;
const prefix = structuredClone(real); prefix.engineering_events.pop();
const times: number[] = [], budget_ms = 5000;
for (let i = 0; i < 3; i++) {
  const started = performance.now();
  const result = await verifyBasWorkflow(retainBasWorkflowHistory(prefix, real));
  times.push(performance.now() - started);
  assert.deepEqual(result, real);
}
console.log(JSON.stringify({ benchmark: 'retained_bas_sync_history', fixture_bytes: raw.length,
  saved_calculation_records: real.assembly_calculations.length + real.engineering_events.length,
  node: process.version, budget_ms, elapsed_ms: times, max_ms: Math.max(...times), python_replay: false }));
assert.ok(times.every(ms => ms < budget_ms), 'Shared BAS history retention exceeds the unchanged 5 s budget');
