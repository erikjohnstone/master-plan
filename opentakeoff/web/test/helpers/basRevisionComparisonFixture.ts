/** Controlled re-export/change of source-shaped fixtures. Positional pairing
 * below is explicit test authorship, never a production matching algorithm. */
import { revisionFixture, revisionBasis, addRevisionSourceSet } from './basRevisionFixture.ts';
import { uuid } from './basEngineeringFixture.ts';
import { captureBasEvidence, mergeBasWorkflows } from '../../src/lib/basWorkflow.ts';
import { buildBasEquipmentCandidates } from '../../src/lib/basEquipmentEvidence.ts';
import { applyBasEquipmentReview } from '../../src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../../src/lib/basAssemblyReview.ts';
import { applyBasReview } from '../../src/lib/basReview.ts';
import { buildBasRevisionInventory } from '../../src/lib/basRevisionInventory.ts';
import type { BasRevisionComparisonRequest } from '../../src/lib/basRevisionComparison.ts';

export async function comparisonFixture(options: { ai?: number; variable?: string; building?: string; pointName?: string } = {}) {
  const before = await revisionFixture();
  const rebase = <T>(value: T): T => JSON.parse(JSON.stringify(value).split('a'.repeat(64)).join('b'.repeat(64)));
  const original = before.workflow.captures[0], source = rebase(before.source), points = rebase(original.points), equipmentSources = rebase(original.equipment_sources!);
  if (options.ai !== undefined) {
    const m = points.matrices[0], row = m.rows[0];
    m.raw.rows[0].cells.AI.text = String(options.ai); row.raw.cells.AI.text = String(options.ai);
    row.observations[0].source.text = String(options.ai); row.observations[0].value = options.ai;
  }
  if (options.variable) source.pages[0].spans[3].text = source.pages[0].spans[3].text.replace('SUPPLY AIR TEMPERATURE', options.variable);
  if (options.pointName) {
    const m = points.matrices[0];
    m.raw.rows[0].cells.POINT.text = options.pointName;
    m.rows[0].raw.cells.POINT.text = options.pointName;
    m.rows[0].name = options.pointName;
  }
  let incoming = await captureBasEvidence(source, points, equipmentSources);
  const candidates = await buildBasEquipmentCandidates(source, equipmentSources), register = rebase(before.equipment);
  for (const e of register.equipment) for (const b of e.bindings) {
    const ti = before.candidates.tables.findIndex(t => t.rows.some(r => r.occurrence_id === b.occurrence_id));
    const ri = before.candidates.tables[ti].rows.findIndex(r => r.occurrence_id === b.occurrence_id);
    b.occurrence_id = candidates.tables[ti].rows[ri].occurrence_id;
  }
  if (options.building) register.scopes[0].building = options.building;
  incoming = await applyBasEquipmentReview(incoming, { capture_id: incoming.current_capture_id, operation_id: uuid(401),
    expected_head: null, register, reason: 'Explicit controlled re-export register' }, 'operator_input');
  incoming = await applyBasAssemblyReview(incoming, { capture_id: incoming.current_capture_id, operation_id: uuid(402),
    expected_head: null, expected_equipment_head: incoming.equipment_events![0].event_id, register: rebase(before.assembly),
    reason: 'Explicit controlled re-export assembly' }, 'operator_input');
  incoming = await applyBasReview(incoming, { capture_id: incoming.current_capture_id, operation_id: uuid(403), expected_head: null,
    action: rebase(before.workflow.review_events![0].action) }, 'operator_input');
  const workflow = await addRevisionSourceSet(mergeBasWorkflows(before.workflow, incoming, true)!, [2, 3], 404), afterBasis = revisionBasis(workflow);
  const a = await buildBasRevisionInventory(workflow, before.basis), b = await buildBasRevisionInventory(workflow, afterBasis);
  if (a.items.length !== b.items.length || a.items.some((item, i) => item.kind !== b.items[i].kind)) throw new Error('Controlled authored correspondence topology changed');
  const request: BasRevisionComparisonRequest = { before: before.basis, after: afterBasis,
    matches: a.items.map((item, i) => ({ before_item_id: item.item_id, after_item_id: b.items[i].item_id,
      reason: 'Explicit controlled fixture correspondence; not an automatic identity claim' })), removed: [], added: [], membership_reviews: [] };
  return { workflow, request, before: a, after: b };
}
