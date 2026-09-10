/** Diagnostic-only full-view comparison with supplied historical validators.
 * Baseline modules must use historical equipment validation together and shared
 * unchanged evidence interpreters. No scorer/key/extraction output is rewritten. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { prepareBasEquipmentRegisterValidator } from '../../web/src/lib/basEquipmentRegister.ts';
import { prepareBasAssemblyRegisterValidator } from '../../web/src/lib/basAssemblyRegister.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';
import type { BasWorkflow } from '../../web/src/lib/basWorkflow.ts';
const baselineDir = process.argv[2];
if (!baselineDir) throw new Error('Pass a directory containing both historical validator modules with resolved imports');
const previousEquipment = await import(pathToFileURL(resolve(baselineDir, 'basEquipmentRegister.ts')).href);
const previousAssembly = await import(pathToFileURL(resolve(baselineDir, 'basAssemblyRegister.ts')).href);
const bytes = await readFile(new URL('../../docs/bas-production/evidence/scope-browser-7/reviewed.takeoff.json', import.meta.url));
const workflow: BasWorkflow = JSON.parse(bytes.toString()).bas_workflow;
const equipmentViews = [], assemblyViews = [];
for (const capture of workflow.captures) {
  if (!capture.narrative_sources || !capture.equipment_sources) continue;
  const validate = await prepareBasEquipmentRegisterValidator(capture.narrative_sources, capture.equipment_sources, capture.points);
  for (const event of workflow.equipment_events?.filter(e => e.capture_id === capture.capture_id) ?? []) {
    const previous = await previousEquipment.validateBasEquipmentRegister(capture.narrative_sources, capture.equipment_sources, capture.points, event.register);
    const current = validate(event.register); assert.deepEqual(current, previous); equipmentViews.push(current);
    const assemblyValidator = await prepareBasAssemblyRegisterValidator(capture.narrative_sources, capture.equipment_sources, capture.points, event.register);
    for (const a of workflow.assembly_events?.filter(a => a.capture_id === capture.capture_id && a.expected_equipment_head === event.event_id) ?? []) {
      const old = await previousAssembly.validateBasAssemblyRegister(capture.narrative_sources, capture.equipment_sources, capture.points, event.register, a.register);
      const now = assemblyValidator(a.register); assert.deepEqual(now, old); assemblyViews.push(now);
    }
  }
}
assert.ok(equipmentViews.length && assemblyViews.length, 'The comparison must not be vacuous');
console.log(JSON.stringify({ probe: 'historical_register_full_view_parity', equipment_events: equipmentViews.length,
  assembly_events: assemblyViews.length, fixture_sha256: createHash('sha256').update(bytes).digest('hex'),
  views_sha256: createHash('sha256').update(canonicalBasJson({ equipmentViews, assemblyViews })).digest('hex'),
  parity: 'all_fields_exact', source: 'retained_development_history', fresh_extraction: false, independent_ground_truth: false }));
