/** Controlled source-shaped fixture, NOT a real-PDF or installed-design proof. */
import { buildBasSourceContext } from '../../src/lib/basSources.ts';
import { basPointListsSchema } from '../../src/lib/basPointLists.ts';
import { captureBasEquipmentTables, buildBasEquipmentCandidates } from '../../src/lib/basEquipmentEvidence.ts';
import { captureBasEvidence } from '../../src/lib/basWorkflow.ts';
import { applyBasEquipmentReview } from '../../src/lib/basEquipmentReview.ts';
import { applyBasAssemblyReview } from '../../src/lib/basAssemblyReview.ts';
import { emptyBasAssemblyRegister, type BasAssemblyRegister } from '../../src/lib/basAssemblyRegister.ts';
import { basEngineeringRegisterSchema } from '../../src/lib/basEngineeringRegister.ts';
import { basEngineeringHeads } from '../../src/lib/basEngineeringReview.ts';

export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const explicit = <T>(value: T) => ({ value, basis: { origin: 'explicit_input' as const, source_span_ids: [], original_text: null,
  reason: 'Controlled explicit test input, not an extracted capability' } });

export async function engineeringFixture(options: { withSequence?: boolean; sha256?: string; byte_length?: number } = {}) {
  const source = buildBasSourceContext([{ sha256: options.sha256 ?? 'a'.repeat(64), byte_length: options.byte_length ?? 100, name: 'controlled-engineering.pdf', page_count: 1,
    pages: [{ page_number: 1, sheet_key: 'controlled-engineering.pdf', width_px: 1800, height_px: 1000, rotation: 0,
      spans: [{ str: 'AHU-1 THRU AHU-2', x0: 10, y0: 10, x1: 200, y1: 20 },
        { str: '10. PROVIDE WITH 0-10 VDC MODULATING ACTUATOR.', x0: 10, y0: 150, x1: 1200, y1: 170 },
        ...(options.withSequence ? [
          { str: 'SEQUENCE OF OPERATION', x0: 10, y0: 250, x1: 400, y1: 270 },
          { str: '1. THE CONTROLLER SHALL MONITOR SUPPLY AIR TEMPERATURE AND MODULATE HOT WATER FLOW TO MAINTAIN SET POINT.', x0: 10, y0: 290, x1: 1600, y1: 310 },
        ] : [])] }] }]);
  const box = [10, 10, 200, 20];
  const tables = [{ kind: 'equipment', sheet: 'controlled-engineering.pdf',
    title: { sheet: 'controlled-engineering.pdf', text: 'AHU SCHEDULE', bbox: box }, headers: ['TAG'], region: [0, 0, 300, 100],
    rows: [{ key: 'AHUS', sheet: 'controlled-engineering.pdf', cells: { TAG: { text: 'AHU-1 THRU AHU-2', bbox: box } } }] }];
  const equipmentSources = captureBasEquipmentTables(tables);
  const points = basPointListsSchema.parse({ schema_version: 'bas_point_lists_v1', rule_version: 'point_observations_1',
    scope: 'discovered_matrices_only', project_complete: false, issues: [], matrices: options.withSequence ? [{
      // Deliberately empty controlled matrix tests association history, not
      // point extraction/coverage or a known installed demand.
      matrix_id: 'controlled-matrix', source_id: source.documents[0].source_id, page_id: source.pages[0].page_id,
      raw: { sheet: 'controlled-engineering.pdf', title: { text: 'CONTROLLED POINTS', bbox: box }, headers: [], region: box, rows: [] },
      header_rows: 0, header_sources: [], notes: [], issues: [], quantity_basis: 'listed_matrix_only', rows: [],
    }] : [] });
  const candidates = await buildBasEquipmentCandidates(source, equipmentSources);
  const capture = await captureBasEvidence(source, points, equipmentSources);
  const equipment = { schema_version: 'bas_equipment_register_v1' as const,
    scopes: [{ scope_id: uuid(1), building: 'A', level: '1', system: 'AHU', phase: 'new', source_span_ids: [], reason: 'Controlled scope' }],
    equipment: [1, 2].map(n => ({ equipment_id: uuid(10 + n), scope_id: uuid(1), tag: `AHU-${n}`,
      bindings: [{ occurrence_id: candidates.tables[0].rows[0].occurrence_id, member: `AHU-${n}` }], reason: 'Exact controlled printed member' })), assignments: [] };
  let workflow = await applyBasEquipmentReview(capture, { capture_id: capture.current_capture_id, operation_id: uuid(20), expected_head: null,
    register: equipment, reason: 'Controlled equipment review' }, 'operator_input');
  const assembly: BasAssemblyRegister = { ...emptyBasAssemblyRegister(), components: ['controller', 'damper_actuator'].map((kind, i) => ({
    component_id: uuid(30 + i), scope_id: uuid(1), equipment_ids: [uuid(11)], excluded_equipment_ids: [], member_exclusion_reason: null,
    label: kind, component_kind: kind as 'controller' | 'damper_actuator', source_requirement_ids: [], source_span_ids: [],
    quantity: { value: 1, basis: 'per_equipment', origin: 'explicit_decision', reason: 'Controlled component declaration; not a PDF count' },
    lifecycle: 'new', disposition: 'included', exclusion_reason: null,
    condition: { status: 'unconditional', statement: null, source_span_ids: [], reason: 'Controlled condition' },
    responsibility_claims: [], responsibility_resolutions: [], reason: 'Controlled explicit component applicability' })) };
  workflow = await applyBasAssemblyReview(workflow, { operation_id: uuid(40), capture_id: workflow.current_capture_id,
    expected_head: null, expected_equipment_head: basEngineeringHeads(workflow, workflow.current_capture_id!).equipment,
    reason: 'Controlled assembly review', register: assembly }, 'operator_input');
  const register = basEngineeringRegisterSchema.parse({ schema_version: 'bas_engineering_register_v1',
    resources: ['output-port', 'input-port'].map((resource_id, i) => ({ resource_id, equipment_id: uuid(11), scope_id: uuid(1),
      component_id: uuid(30 + i), roles: ['endpoint'], label: resource_id, source_span_ids: [], reason: 'Controlled endpoint binding' })),
    targets: [{ check_id: 'signal-check', resource_ids: ['output-port', 'input-port'], source_span_ids: [source.pages[0].spans[1].span_id],
      disposition: 'included', exclusion_reason: null, reason: 'Controlled requirement applicability to AHU-1' }],
    input: { checks: [{ kind: 'signal', check_id: 'signal-check', equipment_ids: [uuid(11)], reason: 'Controlled signal comparison',
      source: { endpoint_id: 'output-port', equipment_id: uuid(11), scope_id: uuid(1) },
      sink: { endpoint_id: 'input-port', equipment_id: uuid(11), scope_id: uuid(1) }, source_direction: explicit('output'),
      sink_direction: explicit('input'), source_mode: explicit('voltage'), sink_modes: { value: ['voltage'], basis: {
        origin: 'drawing_transcription', source_span_ids: [source.pages[0].spans[1].span_id], original_text: source.pages[0].spans[1].text,
        reason: 'Controlled manual transcription; quote ownership does not prove interpretation' } } }] } });
  const heads = basEngineeringHeads(workflow, workflow.current_capture_id!);
  const request = { operation_id: uuid(50), capture_id: workflow.current_capture_id!, expected_head: heads.engineering,
    expected_equipment_head: heads.equipment!, expected_assembly_head: heads.assembly, expected_sequence_head: heads.sequence,
    reason: 'Controlled initial engineering review', register };
  return { workflow, request, register, equipment, assembly, source, tables, capture: workflow.captures[0] };
}
