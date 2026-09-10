/** Explicit independent resource maps exercise ownership for every Python rule
 * family. Numeric cases are reused solely for transport/integration, not new
 * independent calculation truth or real drawing ratings. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineeringFixture, uuid } from "../../web/test/helpers/basEngineeringFixture.ts";
import { validateBasEngineeringRegister } from "../../web/src/lib/basEngineeringRegister.ts";
import { applyBasEngineeringReview, verifyBasEngineeringHistory } from "../src/basEngineeringReview.ts";
import { basEngineeringWorkbook } from "../../web/src/lib/basEngineeringExport.ts";
import { controlledEngineeringCases } from "./helpers/basEngineeringCases.ts";

const { python, cases } = controlledEngineeringCases([uuid(11), uuid(12)], uuid(1));

for (const [name, register] of Object.entries(cases)) test(`owned ${name} checks save and replay through Python; every selected resource is checked`, async () => {
  const { workflow, request, equipment, assembly, capture } = await engineeringFixture();
  const { input, resources } = register;
  const saved = await applyBasEngineeringReview(workflow, { ...request, register }, 'operator_input', { python });
  assert.equal(saved.event.result.status, 'pass');
  assert.equal(saved.event.result.project_complete, false);
  assert.deepEqual(saved.event.register, register);
  assert.deepEqual(await verifyBasEngineeringHistory(saved.workflow, { python }), saved.workflow);
  const book = await basEngineeringWorkbook(saved.workflow);
  const exportedInputs = book.sheets.find(s => s.name === 'Inputs')!.rows.slice(1).filter(r => !String(r[1]).startsWith('target.'));
  // Read each projected path back from the original contract independently.
  for (const row of exportedInputs) {
    const original = input.checks.find(c => c.check_id === row[0])!;
    const value = String(row[1]).split('.').reduce((v: unknown, key) => (v as Record<string, unknown>)[key], original);
    assert.equal(row[2], value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);
    assert.equal(row[3], value === null ? 'Unknown / not provided' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  const rows = book.sheets.find(s => s.name === 'Constraints')!.rows.slice(1);
  assert.equal(rows.length, saved.event.result.checks.reduce((n, c) => n + c.constraints.length, 0));
  for (const check of saved.event.result.checks) for (const c of check.constraints) {
    const row = rows.find(r => r[0] === check.check_id && r[1] === c.rule_id)!;
    assert.equal(row[2], c.status); assert.equal(row[3], c.message);
    assert.deepEqual(JSON.parse(String(row[4])), c.input_paths); assert.deepEqual(JSON.parse(String(row[5])), c.missing_inputs);
    assert.deepEqual(JSON.parse(String(row[6])), c.normalized);
  }
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
