/** Surface-specific exact-ID routes. No joins, quantity decisions or source edits. */
import type { BasProjectReview } from '../lib/basProjectReview.ts';
import type { BasWorkflow } from '../lib/basWorkflow.ts';
import type { basSequenceView } from '../lib/basReview.ts';
import { canonicalBasJson } from '../lib/basCanonical.ts';
type State = Record<string, any>;
export type BasSequenceReviewTarget = { captureId: string; kind: BasProjectReview['issues'][number]['subject']['kind']; id: string };
/** Resolve a display target in the existing shared result. No label matching,
 * ID splitting, association inference or interpretation of source text. */
export function basSequenceReviewSelection(view: Awaited<ReturnType<typeof basSequenceView>>, target: BasSequenceReviewTarget) {
  if (target.kind === 'capture') return { kind: 'coverage' as const, pageId: null };
  if (target.kind === 'page') return view.sequences.discovery.pages.some(p => p.page_id === target.id)
    ? { kind: 'coverage' as const, pageId: target.id } : null;
  for (const region of view.sequences.regions) {
    if (target.kind === 'clause') {
      const clause = region.clauses.find(c => c.clause_id === target.id);
      if (clause || region.region_id === target.id) return { kind: 'sequence' as const, regionId: region.region_id,
        clauseId: clause?.clause_id ?? null, matrixId: null, requirementId: null };
    }
  }
  if (target.kind === 'comparison') for (const comparison of view.comparisons) {
    const pair = canonicalBasJson([comparison.association.region_id, comparison.association.matrix_id]);
    const requirement = comparison.requirements.find(r => `${pair}:${r.requirement.requirement_id}` === target.id);
    if (pair === target.id || requirement) return { kind: 'sequence' as const, regionId: comparison.association.region_id,
      clauseId: requirement?.clause_id ?? null, matrixId: comparison.association.matrix_id,
      requirementId: requirement?.requirement.requirement_id ?? null };
  }
  return null;
}
export function basReviewNavigation(previous: State, issue: BasProjectReview['issues'][number], workflow: BasWorkflow,
  captureId = workflow.current_capture_id): State {
  if (!captureId || captureId !== workflow.current_capture_id) return { ...previous, takeoffTab: 'review',
    projectReview: { ...previous.projectReview, routeNotice: 'This finding belongs to a historical capture. Its original evidence remains in decision history; it has not been substituted with a current item.' } };
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
    next = { takeoffTab: 'points', mode: 'sequences', sequenceScroll: 0, coverageCategory: '', coverageRowPage: 0,
      sequenceReviewTarget: { captureId, kind, id } satisfies BasSequenceReviewTarget };
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
  return { ...previous, ...next, projectReview: { ...previous.projectReview, routeNotice: '', returnFromDomain: true } };
}
