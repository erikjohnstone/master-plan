/** Shared exact historical selection, not mutable "latest" or quantity math. */
import { assertVerifiedBasWorkflowReferences, type BasWorkflow } from './basWorkflow.ts';
import { basIssueBasisSchema, BAS_ISSUE_EVENT_HEADS, BAS_ISSUE_CALCULATION_HEADS, type BasIssueBasis } from './basIssueReviewContract.ts';
import { BAS_PROJECT_ISSUE_RULE } from './basProjectIssueCatalog.ts';

export function currentBasIssueBasis(workflow: BasWorkflow, captureId: string): BasIssueBasis {
  if (!workflow.captures.some(c => c.capture_id === captureId)) throw new Error('Issue review requires a retained capture');
  const eventHeads = Object.fromEntries(Object.entries(BAS_ISSUE_EVENT_HEADS).map(([key, field]) =>
    [key, workflow[field]?.filter(e => e.capture_id === captureId).at(-1)?.event_id ?? null]));
  const calculations = Object.fromEntries(Object.entries(BAS_ISSUE_CALCULATION_HEADS).map(([key, field]) =>
    [key, workflow[field]?.filter(c => c.result.capture_id === captureId).at(-1)?.calculation_id ?? null]));
  return basIssueBasisSchema.parse({ finding_rule: BAS_PROJECT_ISSUE_RULE, ...eventHeads, ...calculations });
}

/** Only use after verifying the owning workflow. Historical rows/events are
 * retained objects from that verified input, never user-supplied replacements.
 * The structure gate checks all selected cross-domain ancestry after slicing. */
export function selectBasIssueWorkflow(workflow: BasWorkflow, captureId: string, rawBasis: unknown): BasWorkflow {
  const basis = basIssueBasisSchema.parse(rawBasis), capture = workflow.captures.find(c => c.capture_id === captureId);
  if (!capture) throw new Error('Issue basis has no retained capture');
  const prefix = <T>(values: T[], head: string | null, identity: (v: T) => string) => {
    if (head === null) return [];
    const index = values.findIndex(v => identity(v) === head);
    if (index < 0) throw new Error('Issue basis selects an unowned record');
    return values.slice(0, index + 1);
  };
  const events = <T extends { event_id: string; capture_id: string }>(values: T[] | undefined, head: string | null) =>
    prefix((values ?? []).filter(e => e.capture_id === captureId), head, e => e.event_id);
  const calculations = <T extends { calculation_id: string; result: { capture_id: string } }>(values: T[] | undefined, head: string | null) =>
    prefix((values ?? []).filter(c => c.result.capture_id === captureId), head, c => c.calculation_id);
  const selected: BasWorkflow = { schema_version: 'bas_workflow_v1', revision: 'bas_issues_9',
    captures: [capture], current_capture_id: captureId,
    review_events: events(workflow.review_events, basis.sequence_head),
    equipment_events: events(workflow.equipment_events, basis.equipment_head),
    assembly_events: events(workflow.assembly_events, basis.assembly_head),
    engineering_events: events(workflow.engineering_events, basis.engineering_head),
    assignment_calculations: calculations(workflow.assignment_calculations, basis.assignment_calculation_id),
    assembly_calculations: calculations(workflow.assembly_calculations, basis.assembly_calculation_id) };
  assertVerifiedBasWorkflowReferences(selected);
  return selected;
}
