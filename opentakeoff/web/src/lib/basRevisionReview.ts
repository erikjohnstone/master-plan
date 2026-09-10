/** Shared response preservation gate, not a calculator or report replay. */
import { basWorkflowSchema } from './basWorkflow.ts';
import { basRevisionReviewEventSchema, basRevisionReviewRequestSchema, type BasRevisionReviewEvent } from './basRevisionReviewContract.ts';
import { atLeastBasWorkflowRevision } from './basWorkflowRevision.ts';
import { canonicalBasJson } from './basCanonical.ts';

export function assertBasRevisionReviewUpdate(rawBefore: unknown, rawAfter: unknown, rawEvent: unknown, rawRequest: unknown,
  origin: BasRevisionReviewEvent['origin']) {
  const before = basWorkflowSchema.parse(rawBefore), after = basWorkflowSchema.parse(rawAfter);
  const event = basRevisionReviewEventSchema.parse(rawEvent), request = basRevisionReviewRequestSchema.parse(rawRequest);
  const { event_id: _id, rule_version: _rule, created_at: _time, approved: _approved, origin: actualOrigin, ...recorded } = event;
  if (actualOrigin !== origin || canonicalBasJson(recorded) !== canonicalBasJson(request)) throw new Error('Comparison response changed the requested review or origin');
  const events = [...(before.revision_events ?? [])], prior = events.find(e => e.operation_id === event.operation_id);
  if (prior) {
    if (canonicalBasJson(prior) !== canonicalBasJson(event)) throw new Error('Comparison response changed an existing review');
  } else {
    if (event.expected_head !== (events.at(-1)?.event_id ?? null)) throw new Error('Comparison response changed journal ancestry');
    events.push(event);
  }
  const expected = prior ? before : { ...before, revision: atLeastBasWorkflowRevision(before.revision, 'bas_revision_8'), revision_events: events };
  if (canonicalBasJson(after) !== canonicalBasJson(expected)) throw new Error('Comparison response changed or omitted retained sources, decisions or results');
  return event;
}
