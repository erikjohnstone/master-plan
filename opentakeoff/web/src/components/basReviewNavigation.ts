/** Surface-specific exact-ID routes. No joins, quantity decisions or source edits. */
import type { BasProjectReview } from '../lib/basProjectReview.ts';
import type { BasWorkflow } from '../lib/basWorkflow.ts';
type State = Record<string, any>;
export function basReviewNavigation(previous: State, issue: BasProjectReview['issues'][number], workflow: BasWorkflow): State {
  const original = JSON.parse(issue.original_finding_json), { kind, id } = issue.subject;
  const capture = workflow.captures.find(c => c.capture_id === workflow.current_capture_id);
  const assignmentId = kind === 'assignment' ? id : original.assignment_id;
  const equipment = { ...previous.equipment, equipmentId: null, assemblyOverview: false, engineeringOverview: false,
    reviewTarget: null as null | { kind: string; id: string } };
  let next: State;
  if (assignmentId) {
    equipment.reviewTarget = { kind: 'assignment', id: assignmentId };
    next = { takeoffTab: 'equipment', equipment };
  } else if (issue.domain === 'points') {
    const matrix = capture?.points.matrices.find(m => kind === 'matrix' ? m.matrix_id === id : m.rows.some(r => r.row_id === id));
    next = { takeoffTab: 'points', mode: 'matrix', matrixId: matrix?.matrix_id, rowId: kind === 'point_row' ? id : null };
  } else if (issue.domain === 'sources' || issue.domain === 'sequences') {
    next = { takeoffTab: 'points', mode: 'sequences' };
  } else {
    if (kind === 'scope') equipment.reviewTarget = { kind, id };
    else if (kind === 'equipment') equipment.equipmentId = id;
    else if (kind === 'occurrence') equipment.sourceOccurrenceId = id;
    if (issue.domain === 'assemblies') {
      equipment.assemblyOverview = true;
      equipment.assembly = { ...equipment.assembly, componentId: original.issue?.component_id || original.record?.component_id || (kind === 'component' ? id : null) };
    } else if (issue.domain === 'engineering') {
      equipment.engineeringOverview = true;
      equipment.engineering = { ...equipment.engineering, tab: kind === 'resource' ? 'resources' : 'checks',
        checkId: original.check_id || original.check?.check_id || (kind === 'check' ? id : null), resourceId: kind === 'resource' ? id : null };
    }
    next = { takeoffTab: 'equipment', equipment };
  }
  return { ...previous, ...next, projectReview: { ...previous.projectReview, returnFromDomain: true } };
}
