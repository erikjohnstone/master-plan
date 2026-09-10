/** Shared bounded read projection for browser and MCP. No extraction/approval. */
import { z } from 'zod';
import { verifyBasWorkflow } from './basWorkflow.ts';
import { BAS_DRAWING_RULE, basDrawingPageRefSchema, basDrawingActionSchema, basDrawingRequestSchema } from './basDrawingContract.ts';
import { replayBasDrawingHistory, basDrawingCapturePages } from './basDrawingRevision.ts';
import { basRevisionTransportCommandSchema, basRevisionTransportResultSchema } from './basRevisionTransportContract.ts';

const sha = z.string().regex(/^[a-f0-9]{64}$/), count = z.number().int().nonnegative().safe();
export const basDrawingInspectRequestSchema = z.object({ capture_id: sha.optional(), event_id: sha.optional(),
  offset: count.default(0), limit: z.number().int().min(1).max(50).default(25) }).strict()
  .refine(q => !(q.capture_id && q.event_id), 'Inspect one capture or one event at a time');
const page = basDrawingPageRefSchema.extend({ display_name: z.string().max(4096) }).strict();
const revision = basDrawingActionSchema.options[1];
export const basDrawingInspectionSchema = z.object({ schema_version: z.literal('bas_drawing_inspection_v1'),
  rule_version: z.literal(BAS_DRAWING_RULE), head: sha.nullable(), current_capture_id: sha.nullable(),
  capture_count: count, event_count: count, source_set_count: count, offset: count, limit: count,
  captures: z.array(z.object({ capture_id: sha, display_name: z.string().max(4096), source_count: count, page_count: count }).strict()).max(50),
  events: z.array(z.object({ event_id: sha, name: z.string().max(256), kind: z.enum(['create_source_set', 'review_revision']),
    origin: z.enum(['operator_input', 'agent_proposal']), reviewer: z.string().max(256), created_at: z.string().datetime(),
    source_set_id: sha.nullable(), source_page_count: count.nullable(), unresolved_pages: count }).strict()).max(50),
  selected: z.object({ capture_id: sha.nullable(), event_id: sha.nullable(), name: z.string().max(4096),
    source_page_count: count.nullable(), baseline_page_count: count, incoming_page_count: count,
    pages: z.array(page).max(50), baseline: z.array(revision.shape.baseline.element).max(50), incoming: z.array(revision.shape.incoming.element).max(50),
    reason: z.string().max(4096).nullable(), baseline_source_set_id: sha.nullable(), incoming_capture_id: sha.nullable(),
    mode: z.enum(['replacement_set', 'partial_addendum']).nullable(),
  }).strict().nullable(),
  source_bytes: z.literal('not_verified'), semantic_changes: z.literal('not_assessed'),
  quantity_changes: z.literal('not_assessed'), approval_impact: z.literal('not_assessed'), approved: z.literal(false),
}).strict();

export async function inspectBasDrawings(rawWorkflow: unknown, rawQuery: unknown = {}) {
  const query = basDrawingInspectRequestSchema.parse(rawQuery), workflow = await verifyBasWorkflow(rawWorkflow);
  const replay = replayBasDrawingHistory(workflow.captures, workflow.drawing_events), events = workflow.drawing_events ?? [];
  const changes = new Map(replay.revisions.map(r => [r.event_id, r]));
  const slice = <T>(items: T[]) => items.slice(query.offset, query.offset + query.limit);
  const namedPage = (ref: z.infer<typeof basDrawingPageRefSchema>) => {
    const capture = workflow.captures.find(c => c.capture_id === ref.capture_id)!;
    return { ...ref, display_name: capture.sources.find(s => ref.page_id.startsWith(`${s.source_id}:p`))!.names[0] };
  };
  let selected: z.infer<typeof basDrawingInspectionSchema>['selected'] = null;
  if (query.capture_id) {
    const capture = workflow.captures.find(c => c.capture_id === query.capture_id);
    if (!capture) throw new Error('Drawing inspection capture is not retained in this workflow');
    const pages = basDrawingCapturePages(capture);
    selected = { capture_id: capture.capture_id, event_id: null, name: capture.sources[0].names[0], source_page_count: pages.length,
      baseline_page_count: 0, incoming_page_count: 0, pages: slice(pages).map(namedPage), baseline: [], incoming: [], reason: null,
      baseline_source_set_id: null, incoming_capture_id: null, mode: null };
  } else if (query.event_id) {
    const event = events.find(e => e.event_id === query.event_id);
    if (!event) throw new Error('Drawing inspection event is not retained in this workflow');
    const set = replay.source_sets.get(event.event_id), action = event.action;
    selected = { capture_id: null, event_id: event.event_id, name: action.name,
      source_page_count: set?.pages.length ?? null, pages: slice(set?.pages ?? []).map(namedPage),
      baseline_page_count: action.kind === 'review_revision' ? action.baseline.length : 0,
      incoming_page_count: action.kind === 'review_revision' ? action.incoming.length : 0,
      baseline: action.kind === 'review_revision' ? slice(action.baseline) : [],
      incoming: action.kind === 'review_revision' ? slice(action.incoming) : [], reason: event.reason,
      baseline_source_set_id: action.kind === 'review_revision' ? action.baseline_source_set_id : null,
      incoming_capture_id: action.kind === 'review_revision' ? action.incoming_capture_id : null,
      mode: action.kind === 'review_revision' ? action.mode : null };
  }
  return basDrawingInspectionSchema.parse({ schema_version: 'bas_drawing_inspection_v1', rule_version: BAS_DRAWING_RULE,
    head: replay.head, current_capture_id: workflow.current_capture_id, capture_count: workflow.captures.length,
    event_count: events.length, source_set_count: replay.source_sets.size, offset: query.offset, limit: query.limit,
    captures: slice([...workflow.captures].reverse()).map(c => ({ capture_id: c.capture_id, display_name: c.sources[0].names[0],
      source_count: c.sources.length, page_count: c.sources.reduce((n, s) => n + s.page_count, 0) })),
    events: slice([...events].reverse()).map(e => ({ event_id: e.event_id, name: e.action.name, kind: e.action.kind,
      origin: e.origin, reviewer: e.reviewer, created_at: e.created_at, source_set_id: replay.source_sets.has(e.event_id) ? e.event_id : null,
      source_page_count: replay.source_sets.get(e.event_id)?.pages.length ?? null,
      unresolved_pages: changes.get(e.event_id)?.unresolved_pages ?? 0 })), selected,
    source_bytes: 'not_verified', semantic_changes: 'not_assessed', quantity_changes: 'not_assessed', approval_impact: 'not_assessed', approved: false });
}

export const basDrawingCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('revision'), command: basRevisionTransportCommandSchema }).strict(),
  z.object({ kind: z.literal('inspect'), query: basDrawingInspectRequestSchema.optional() }).strict(),
  z.object({ kind: z.literal('prepare'), action: basDrawingActionSchema }).strict(),
  z.object({ kind: z.literal('record'), review: basDrawingRequestSchema }).strict(),
  z.object({ kind: z.literal('compare'), before: basDrawingPageRefSchema, after: basDrawingPageRefSchema }).strict(),
]);
const preparation = z.object({ expected_head: sha.nullable(), expected_dependencies: sha, accounting_status: z.enum(['complete', 'unresolved']),
  source_page_count: count.nullable(), unresolved_pages: count, recorded: z.literal(false), approved: z.literal(false), quantity_changes: z.literal('not_assessed') }).strict();
export const basDrawingCommandResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('revision'), result: basRevisionTransportResultSchema }).strict(),
  z.object({ kind: z.literal('inspect'), inspection: basDrawingInspectionSchema }).strict(),
  z.object({ kind: z.literal('prepare'), preparation }).strict(),
  z.object({ kind: z.literal('record'), event_id: sha, head: sha, source_set_id: sha.nullable(), source_page_count: count.nullable(),
    unresolved_pages: count, origin: z.literal('agent_proposal'), recorded: z.literal(true), approved: z.literal(false),
    persistence: z.literal('session_only_until_export') }).strict(),
  z.object({ kind: z.literal('compare'), comparison: z.object({ before: basDrawingPageRefSchema, after: basDrawingPageRefSchema,
    source_identity: z.enum(['same_original_page', 'different_original_page']), capture_identity: z.enum(['same_capture', 'different_capture']),
    retained_text_geometry: z.enum(['equal', 'changed', 'unavailable']), comparison_scope: z.literal('available_retained_text_and_page_frame_only'),
    semantic_changes: z.literal('not_assessed'), quantity_changes: z.literal('not_assessed'), approval_impact: z.literal('not_assessed'),
    source_bytes: z.literal('not_verified') }).strict() }).strict(),
]);
