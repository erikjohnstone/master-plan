/** Retained real-PDF history with intentionally withdrawn coverage. Not a
 * positive approval, fresh extraction, new corpus score or public UI test. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { buildBasReadiness } from '../src/lib/basReadiness.ts';
const raw = readFileSync(new URL('../../docs/bas-production/evidence/scope-browser-7/reviewed.takeoff.json', import.meta.url));
const workflow = JSON.parse(raw.toString()).bas_workflow;
const scope = workflow.scope_events.filter((e: { action: { kind: string } }) => e.action.kind === 'save_scope').at(-1);
assert.ok(scope);
const baseline = process.memoryUsage().rss, times = [], budget_ms = 10000, rss_budget = 512 * 1024 * 1024;
let result;
for (let n = 0; n < 3; n++) {
  const start = performance.now(); result = await buildBasReadiness(workflow, scope.event_id);
  times.push(performance.now() - start);
  assert.equal(result.status, 'blocked'); assert.equal(result.approved, false);
  assert.ok(result.blockers.some(b => b.code === 'source_coverage_incomplete'));
  assert.ok(result.blockers.some(b => b.code === 'actual_python_replay_required'));
  assert.ok(result.blockers.some(b => b.code === 'original_source_unavailable'));
}
const incremental_peak_rss = Math.max(0, process.resourceUsage().maxRSS * 1024 - baseline);
console.log(JSON.stringify({ benchmark: 'bas_scoped_readiness', fixture_bytes: raw.length,
  fixture_sha256: createHash('sha256').update(raw).digest('hex'), node: process.version, platform: process.platform, arch: process.arch,
  cpu: cpus()[0].model, elapsed_ms: times, budget_ms, incremental_peak_rss, rss_budget,
  claims: result!.scope.claims.length, pages_by_claim: result!.coverage.pages.length,
  issues: result!.issues.length, blockers: result!.blockers.length,
  source_bytes_checked: false, actual_python_replay: false, public_ui_mcp_walkthrough: false, approved: false }));
assert.ok(times.every(t => t < budget_ms), 'Readiness exceeds its predeclared 10 s projection budget');
assert.ok(incremental_peak_rss < rss_budget, 'Readiness exceeds its predeclared 512 MiB incremental RSS budget');
