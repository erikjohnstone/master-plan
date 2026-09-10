/** Shared additive persistence versions. A lower-level edit must never drop a
 * newer workflow's data or reinterpret its previous revisions. No quantities. */
export const BAS_WORKFLOW_REVISIONS = ['point_captures_1', 'bas_evidence_2', 'bas_equipment_3',
  'bas_assignment_4', 'bas_assembly_5', 'bas_engineering_6', 'bas_review_7', 'bas_revision_8', 'bas_issues_9'] as const;
export type BasWorkflowRevision = typeof BAS_WORKFLOW_REVISIONS[number];
export function atLeastBasWorkflowRevision(current: BasWorkflowRevision, required: BasWorkflowRevision): BasWorkflowRevision {
  return BAS_WORKFLOW_REVISIONS[Math.max(BAS_WORKFLOW_REVISIONS.indexOf(current), BAS_WORKFLOW_REVISIONS.indexOf(required))];
}
