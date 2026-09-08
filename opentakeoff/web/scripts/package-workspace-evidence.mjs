// Package generated sample-only proof for review; never copy corpus documents.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const source=process.env.OT_PROOF_OUT || '/tmp/ot-workspace-verified';
assert.deepEqual(JSON.parse(readFileSync(resolve(source,'baseline/evidence.json'),'utf8')),JSON.parse(readFileSync(resolve(source,'after/evidence.json'),'utf8')));
for(const phase of ['baseline','after']) {
  const output=resolve('../docs/ui-workspace/evidence',phase);
  mkdirSync(output,{recursive:true});
  for(const file of readdirSync(resolve(source,phase))) {
    if(!/\.(png|json|csv)$/.test(file))continue;
    copyFileSync(resolve(source,phase,file),resolve(output,file));
  }
}
const logs=resolve('../docs/ui-workspace/evidence/checks');
mkdirSync(logs,{recursive:true});
for(const [sourceFile,name] of [
  ['/tmp/ot-workspace-baseline-check.log','baseline-check.txt'],
  ['/tmp/ot-workspace-final-check.log','after-check.txt'],
  ['/tmp/ot-workspace-final-tests.log','unit-tests.txt'],
  ['/tmp/ot-workspace-final-build.log','build.txt'],
  ['/tmp/ot-workspace-bench.log','bench.txt'],
  ['/tmp/ot-table-driver.log','live-table-takeoff.txt'],
  ['/tmp/ot-takeoff-driver.log','live-takeoff.txt'],
  ['/tmp/ot-corpus-schedules.log','corpus-schedules.txt'],
  ['/tmp/ot-workspace-ui/checks.json','ui-contracts.json'],
  ['/tmp/ot-workspace-ui/agent-running.png','agent-running-fixture.png'],
  ['/tmp/ot-workspace-ui/agent-review-hud.png','agent-review-hud-fixture.png'],
  ['/tmp/ot-topbar-check.log','topbar.txt'],
  ['/tmp/ot-schedules-check.log','schedules.txt'],
  ['/tmp/ot-inline-check.log','inline-citations.txt'],
  ['/tmp/ot-count-check.log','count-proposals.txt'],
]) if(existsSync(sourceFile)) copyFileSync(sourceFile,resolve(logs,name));
console.log('Packaged matched sample-only evidence');
