/** Synthetic two-page evidence and explicit decisions. Not a real addendum,
 * extracted hardware capability or installed-quantity ground truth. */
import { engineeringFixture, uuid } from './basEngineeringFixture.ts';
import { buildBasSourceContext } from '../../src/lib/basSources.ts';
import { basPointListsSchema } from '../../src/lib/basPointLists.ts';
import { buildBasEquipmentCandidates, captureBasEquipmentTables } from '../../src/lib/basEquipmentEvidence.ts';
import { captureBasEvidence, type BasWorkflow } from '../../src/lib/basWorkflow.ts';
import { applyBasEquipmentReview } from '../../src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../../src/lib/basAssemblyReview.ts';
import { applyBasReview } from '../../src/lib/basReview.ts';
import { interpretBasSequences } from '../../src/lib/basSequenceReconciliation.ts';
import { interpretBasComponentRequirements } from '../../src/lib/basComponentRequirements.ts';
import { applyBasDrawingReview } from '../../src/lib/basDrawingReview.ts';
import { basDrawingCapturePages, basDrawingDependencyFingerprint } from '../../src/lib/basDrawingRevision.ts';
import { defaultBasRevisionBasis } from '../../src/lib/basRevisionBasis.ts';
import type { BasEquipmentRegister } from '../../src/lib/basEquipmentRegister.ts';

export async function addRevisionSourceSet(workflow: BasWorkflow, pageIndices?: number[], n = 200) {
  const pages = workflow.captures.flatMap(basDrawingCapturePages);
  const action = { kind: 'create_source_set' as const, name: 'Explicit controlled comparison scope',
    pages: pageIndices ? pageIndices.map(i => pages[i]) : pages };
  return applyBasDrawingReview(workflow, { operation_id: uuid(n), expected_head: workflow.drawing_events?.at(-1)?.event_id ?? null,
    expected_dependencies: await basDrawingDependencyFingerprint(action), action,
    reviewer: 'Self-declared controlled reviewer', reason: 'Controlled source selection, not an approval' }, 'operator_input', '2026-09-10T10:00:00.000Z');
}
export const revisionBasis = (w: BasWorkflow) => defaultBasRevisionBasis(w, w.drawing_events!.at(-1)!.event_id);

export async function revisionFixture(options: { sha256?: string; byte_length?: number } = {}) {
  const f = await engineeringFixture({ withSequence: true });
  const source = buildBasSourceContext([{ sha256: options.sha256 ?? 'a'.repeat(64), byte_length: options.byte_length ?? 100, name: 'controlled-two-pages.pdf', page_count: 2,
    pages: [0, 1].map(i => ({ page_number: i + 1, sheet_key: `controlled.pdf#${i + 1}`, width_px: 1800, height_px: 1000, rotation: 0,
      spans: i ? [{ str: 'AHU-1 THRU AHU-2', x0: 410, y0: 410, x1: 600, y1: 420 }] : [
        ...f.source.pages[0].spans.map(s => ({ str: s.text, x0: s.bbox_px[0], y0: s.bbox_px[1], x1: s.bbox_px[2], y1: s.bbox_px[3] })),
        { str: '2. THE AHU SYSTEM SHALL BE PROVIDED WITH A FACTORY FURNISHED ON-BOARD BACNET CONTROLLER.', x0: 10, y0: 340, x1: 1600, y1: 360 },
      ] })) }]);
  const points = structuredClone(f.capture.points), m = points.matrices[0], box = [10, 450, 250, 470] as [number, number, number, number];
  m.source_id = source.documents[0].source_id; m.page_id = source.pages[0].page_id;
  m.raw.sheet = source.pages[0].sheet_keys[0];
  m.raw.headers = ['POINT', 'AI', 'DI', 'ALARM', 'AV', 'DO'];
  const cells = Object.fromEntries([['POINT', 'SUPPLY AIR TEMPERATURE'], ['AI', '2'], ['DI', '?'], ['ALARM', 'X'], ['AV', '1']]
    .map(([key, text]) => [key, { text, bbox: box }]));
  const raw = { key: 'controlled-row', cells }; m.raw.rows = [raw];
  m.rows = [{ row_id: 'controlled-row', local_key: raw.key, name: 'SUPPLY AIR TEMPERATURE', raw, status: 'review_required',
    observations: [
      { kind: 'declared_io' as const, channel: 'AI', column: 'AI', value: 2 },
      { kind: 'declared_io' as const, channel: 'DI', column: 'DI', value: null },
      { kind: 'attribute' as const, channel: 'ALARM', column: 'ALARM', value: 1 },
      { kind: 'software_value' as const, channel: 'AV', column: 'AV', value: 1 },
    ].map(o => ({ kind: o.kind, channel: o.channel, value: o.value, status: o.value === null ? 'ambiguous' : 'read',
      source: { source_id: m.source_id, page_id: m.page_id, sheet_key: m.raw.sheet, column: o.column, span_id: null,
        text: cells[o.column].text, bbox_px: box } })), qualifiers: [], issues: ['CONTROLLED_AMBIGUOUS_DI'],
    uninterpreted_columns: [], unobserved_columns: ['DO'], field_wiring_status: 'not_established' }];
  const tables = source.pages.map(p => ({ kind: 'equipment', sheet: p.sheet_keys[0],
    title: { sheet: p.sheet_keys[0], text: 'AHU SCHEDULE', bbox: p.spans[0].bbox_px },
    headers: ['TAG', 'QTY'], region: [0, 0, 900, 600], retained_extra_metadata: { values: ['keep', p.page_number] },
    rows: [{ key: 'AHUS', sheet: p.sheet_keys[0], cells: { TAG: { text: 'AHU-1 THRU AHU-2', bbox: p.spans[0].bbox_px },
      QTY: { text: '2', bbox: p.spans[0].bbox_px } }, row_metadata: 'Keep the original, too' }] }));
  const evidence = captureBasEquipmentTables(tables), candidates = await buildBasEquipmentCandidates(source, evidence);
  let workflow = await captureBasEvidence(source, basPointListsSchema.parse(points), evidence);
  const equipment = structuredClone(f.equipment);
  equipment.equipment.forEach(e => { e.bindings[0].occurrence_id = candidates.tables[0].rows[0].occurrence_id; });
  const region = interpretBasSequences(source).regions[0];
  const register: BasEquipmentRegister = { ...equipment, assignments: [{ assignment_id: uuid(80), matrix_id: m.matrix_id,
    applicability: 'per_equipment' as const, equipment_ids: equipment.equipment.map(e => e.equipment_id), excluded_equipment_ids: [],
    sequence_region_ids: [region.region_id], source_span_ids: [source.pages[0].spans[0].span_id], reason: 'Explicit controlled applicability' }] };
  workflow = await applyBasEquipmentReview(workflow, { operation_id: uuid(20), expected_head: null, capture_id: workflow.current_capture_id,
    register, reason: 'Controlled equipment register' }, 'operator_input');
  const assembly = structuredClone(f.assembly), declared = interpretBasComponentRequirements(source).clauses.flatMap(c => c.components);
  const controller = declared.find(c => c.component_kind === 'onboard_controller')!;
  if (!controller) throw new Error('Controlled source declaration missing');
  assembly.components[0].component_kind = 'onboard_controller'; assembly.components[0].source_requirement_ids = [controller.requirement_id];
  assembly.components[0].quantity.origin = 'source_declaration';
  assembly.components[0].responsibility_resolutions = [{ activity: 'furnish', selected_claim_id: `${controller.requirement_id}:furnish`, reason: 'Select explicit factory declaration' }];
  assembly.components[1].responsibility_claims = [{ claim_id: uuid(81), activity: 'wire', assignment: 'by_others', party: null,
    source_span_ids: [], reason: 'Controlled responsibility decision, not extracted scope' }];
  workflow = await applyBasAssemblyReview(workflow, { operation_id: uuid(40), capture_id: workflow.current_capture_id,
    expected_head: null, expected_equipment_head: workflow.equipment_events![0].event_id, register: assembly, reason: 'Controlled assembly decisions' }, 'operator_input');
  workflow = await applyBasReview(workflow, { operation_id: uuid(60), capture_id: workflow.current_capture_id, expected_head: null,
    action: { kind: 'upsert', association: { matrix_id: m.matrix_id, region_id: region.region_id, reason: 'Controlled correspondence',
      equipment_references: [{ tag: 'AHU-1', span_ids: [source.pages[0].spans[0].span_id],
        scope: { building: 'A', level: '1', system: 'AHU', phase: 'new' } }] } } }, 'operator_input');
  workflow = await addRevisionSourceSet(workflow);
  return { workflow, basis: revisionBasis(workflow), equipment: register, assembly, candidates, source, engineering: f.register };
}
