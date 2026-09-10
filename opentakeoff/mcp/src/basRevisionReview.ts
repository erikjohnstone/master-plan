/** One UI/MCP comparison-journal service. Caller persists with its existing CAS
 * guard after await. This module never adopts a Session or approves a takeoff. */
import { z } from 'zod';
import { basWorkflowSchema, basEventFingerprint } from '../../web/src/lib/basWorkflow.ts';
import { basRevisionReviewRequestSchema, basRevisionReviewEventSchema, BAS_REVISION_REVIEW_RULE,
  type BasRevisionReviewEvent } from '../../web/src/lib/basRevisionReviewContract.ts';
import { normalizeBasRevisionComparisonRequest, basRevisionReportFingerprint } from '../../web/src/lib/basRevisionComparisonContract.ts';
import { assertBasRevisionReviewUpdate } from '../../web/src/lib/basRevisionReview.ts';
import { atLeastBasWorkflowRevision } from '../../web/src/lib/basWorkflowRevision.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';
import { compareBasRevisions } from './basRevisionComparison.ts';

type Options = { python?: string; timeoutMs?: number; signal?: AbortSignal; createdAt?: string };
const ownWorkflow = (raw: unknown) => basWorkflowSchema.parse(structuredClone(raw));
function operation(options: Options) {
  const owned = { ...options }, timeout = owned.timeoutMs ?? 30000;
  if (!Number.isSafeInteger(timeout) || timeout < 0) throw new Error('Comparison review timeout must be a finite nonnegative integer');
  const deadline = Date.now() + timeout;
  const guard = () => { owned.signal?.throwIfAborted(); if (Date.now() >= deadline) throw new Error('BAS comparison review timed out; no history changed'); };
  return { owned, guard, transport: () => ({ ...owned, timeoutMs: Math.max(1, deadline - Date.now()) }) };
}

export async function prepareBasRevisionReview(rawWorkflow: unknown, rawComparison: unknown, options: Options = {}) {
  const context = operation(options); context.guard();
  const comparison = normalizeBasRevisionComparisonRequest(rawComparison), workflow = ownWorkflow(rawWorkflow);
  const report = await compareBasRevisions(workflow, comparison, context.transport()); context.guard();
  const expected_report_fingerprint = await basRevisionReportFingerprint(report); context.guard();
  return { comparison, report, expected_head: workflow.revision_events?.at(-1)?.event_id ?? null,
    expected_report_fingerprint, recorded: false as const, approved: false as const };
}

export async function recordBasRevisionReview(rawWorkflow: unknown, rawRequest: unknown,
  origin: BasRevisionReviewEvent['origin'], options: Options = {}) {
  const context = operation(options); context.guard();
  const request = basRevisionReviewRequestSchema.parse(rawRequest), workflow = ownWorkflow(rawWorkflow);
  const previous = workflow.revision_events?.find(e => e.operation_id === request.operation_id);
  if (previous) {
    const { event_id: _id, rule_version: _rule, created_at: _time, approved: _approved, origin: oldOrigin, ...oldRequest } = previous;
    if (oldOrigin !== origin || canonicalBasJson(oldRequest) !== canonicalBasJson(request)) throw new Error('BAS operation ID was reused for a different comparison review');
  } else if ((workflow.revision_events?.at(-1)?.event_id ?? null) !== request.expected_head)
    throw new Error('Comparison review changed since this preview; reload the current journal');
  const report = await compareBasRevisions(workflow, request.comparison, context.transport()); context.guard();
  if (await basRevisionReportFingerprint(report) !== request.expected_report_fingerprint)
    throw new Error('Comparison preview changed or no longer replays; inspect the current report before recording');
  context.guard();
  if (previous) {
    assertBasRevisionReviewUpdate(workflow, workflow, previous, request, origin);
    return { workflow, event: previous, report, report_verification: 'matches_saved_report' as const };
  }
  const payload = { ...request, rule_version: BAS_REVISION_REVIEW_RULE, origin, approved: false as const,
    created_at: context.owned.createdAt ?? new Date().toISOString() };
  const event = basRevisionReviewEventSchema.parse({ ...payload, event_id: await basEventFingerprint(payload) }); context.guard();
  const updated = basWorkflowSchema.parse({ ...workflow, revision: atLeastBasWorkflowRevision(workflow.revision, 'bas_revision_8'),
    revision_events: [...(workflow.revision_events ?? []), event] });
  assertBasRevisionReviewUpdate(workflow, updated, event, request, origin); context.guard();
  return { workflow: updated, event, report, report_verification: 'matches_saved_report' as const };
}

export async function readBasRevisionReview(rawWorkflow: unknown, rawEventId: unknown, options: Options = {}) {
  const context = operation(options); context.guard();
  const eventId = z.string().regex(/^[a-f0-9]{64}$/).parse(rawEventId), workflow = ownWorkflow(rawWorkflow);
  const event = workflow.revision_events?.find(e => e.event_id === eventId);
  if (!event) throw new Error('Comparison review is not retained in this workflow');
  const report = await compareBasRevisions(workflow, event.comparison, context.transport()); context.guard();
  const actual_report_fingerprint = await basRevisionReportFingerprint(report); context.guard();
  return { event, report, actual_report_fingerprint, report_verification: actual_report_fingerprint === event.expected_report_fingerprint
    ? 'matches_saved_report' as const : 'different_from_saved_report' as const, approved: false as const };
}
