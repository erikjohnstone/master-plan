/** Shared operation/response ownership. No extraction or browser arithmetic. */
import { z } from 'zod';
import { basWorkflowSchema, verifyBasWorkflow } from './basWorkflow.ts';
import { basRevisionBasisSchema } from './basRevisionBasisContract.ts';
import { basRevisionInventorySchema } from './basRevisionInventoryContract.ts';
import { basRevisionComparisonRequestSchema, basRevisionComparisonSchema, normalizeBasRevisionComparisonRequest,
  basRevisionReportFingerprint } from './basRevisionComparisonContract.ts';
import { basRevisionReviewRequestSchema, basRevisionReviewEventSchema } from './basRevisionReviewContract.ts';
import { assertBasRevisionReviewUpdate } from './basRevisionReview.ts';
import { canonicalBasJson } from './basCanonical.ts';
import { sha256Hex } from './graphKeys.js';

const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const basRevisionOperationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inventory'), basis: basRevisionBasisSchema }).strict(),
  z.object({ kind: z.literal('compare'), comparison: basRevisionComparisonRequestSchema }).strict(),
  z.object({ kind: z.literal('record'), review: basRevisionReviewRequestSchema }).strict(),
  z.object({ kind: z.literal('read'), event_id: sha }).strict(),
]);
export const basRevisionResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inventory'), inventory: basRevisionInventorySchema }).strict(),
  z.object({ kind: z.literal('compare'), comparison: basRevisionComparisonRequestSchema, report: basRevisionComparisonSchema,
    expected_head: sha.nullable(), expected_report_fingerprint: sha, recorded: z.literal(false), approved: z.literal(false) }).strict(),
  z.object({ kind: z.literal('record'), workflow: basWorkflowSchema, event: basRevisionReviewEventSchema,
    report: basRevisionComparisonSchema, report_verification: z.literal('matches_saved_report') }).strict(),
  z.object({ kind: z.literal('read'), event: basRevisionReviewEventSchema, report: basRevisionComparisonSchema,
    actual_report_fingerprint: sha, report_verification: z.enum(['matches_saved_report', 'different_from_saved_report']), approved: z.literal(false) }).strict(),
]);
export type BasRevisionOperation = z.infer<typeof basRevisionOperationSchema>;
export type BasRevisionResponse = z.infer<typeof basRevisionResponseSchema>;
const same = (a: unknown, b: unknown) => canonicalBasJson(a) === canonicalBasJson(b);

/** Bind trusted-service output to the requested immutable inputs. This is NOT
 * an independent math check; actual arithmetic remains in the shared service. */
export async function assertBasRevisionResponse(rawWorkflow: unknown, rawOperation: unknown, rawResponse: unknown) {
  const operation = basRevisionOperationSchema.parse(rawOperation), response = basRevisionResponseSchema.parse(rawResponse);
  if (operation.kind !== response.kind) throw new Error('Revision response changed the requested operation');
  if (operation.kind === 'inventory' && response.kind === 'inventory') {
    if (!same(operation.basis, response.inventory.basis)) throw new Error('Revision inventory response changed the selected versions');
    return response;
  }
  const workflow = basWorkflowSchema.parse(rawWorkflow);
  let comparison, expectedFingerprint;
  if (operation.kind === 'compare' && response.kind === 'compare') {
    comparison = normalizeBasRevisionComparisonRequest(operation.comparison);
    if (!same(comparison, response.comparison) || response.expected_head !== (workflow.revision_events?.at(-1)?.event_id ?? null))
      throw new Error('Revision preview response changed its request or journal head');
    expectedFingerprint = response.expected_report_fingerprint;
  } else if (operation.kind === 'record' && response.kind === 'record') {
    await verifyBasWorkflow(response.workflow);
    assertBasRevisionReviewUpdate(workflow, response.workflow, response.event, operation.review, 'operator_input');
    comparison = operation.review.comparison; expectedFingerprint = operation.review.expected_report_fingerprint;
  } else if (operation.kind === 'read' && response.kind === 'read') {
    const event = workflow.revision_events?.find(e => e.event_id === operation.event_id);
    if (!event || !same(event, response.event)) throw new Error('Revision read response changed the saved review');
    comparison = event.comparison; expectedFingerprint = response.actual_report_fingerprint;
    const status = response.actual_report_fingerprint === event.expected_report_fingerprint ? 'matches_saved_report' : 'different_from_saved_report';
    if (response.report_verification !== status) throw new Error('Revision read response concealed a changed report');
  } else throw new Error('Invalid revision response');
  const normalized = normalizeBasRevisionComparisonRequest(comparison);
  const digest = await sha256Hex(new TextEncoder().encode(canonicalBasJson(normalized)));
  if (response.report.request_fingerprint !== digest || !same(response.report.before, normalized.before) || !same(response.report.after, normalized.after)
    || await basRevisionReportFingerprint(response.report) !== expectedFingerprint) throw new Error('Revision report response changed its inputs or fingerprint');
  return response;
}
