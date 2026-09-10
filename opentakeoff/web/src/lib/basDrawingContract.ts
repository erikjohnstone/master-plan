/** Shared page-correspondence wire contract. No quantity or approval claims. */
import { z } from 'zod';

export const BAS_DRAWING_RULE = 'bas_drawing_correspondence_1' as const;
export const BAS_DRAWING_PAGE_LIMIT = 25000;
export const BAS_DRAWING_HISTORY_PAGE_LIMIT = 250000;
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const pageId = z.string().regex(/^sha256:[a-f0-9]{64}:p[1-9]\d*$/).max(100);
const reason = z.string().trim().min(1).max(4096);
export const basDrawingPageRefSchema = z.object({ capture_id: sha, page_id: pageId }).strict();
export const basDrawingActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create_source_set'), name: z.string().trim().min(1).max(256),
    pages: z.array(basDrawingPageRefSchema).min(1).max(BAS_DRAWING_PAGE_LIMIT) }).strict(),
  z.object({ kind: z.literal('review_revision'), name: z.string().trim().min(1).max(256),
    baseline_source_set_id: sha, incoming_capture_id: sha,
    mode: z.enum(['replacement_set', 'partial_addendum']),
    baseline: z.array(z.object({ page: basDrawingPageRefSchema,
      disposition: z.enum(['retained', 'replaced', 'removed', 'unresolved']),
      incoming_page_id: pageId.nullable(), reason }).strict()).min(1).max(BAS_DRAWING_PAGE_LIMIT),
    incoming: z.array(z.object({ page_id: pageId,
      disposition: z.enum(['replacement', 'addition', 'redundant', 'unresolved']),
      baseline_page_id: pageId.nullable(), reason }).strict()).min(1).max(BAS_DRAWING_PAGE_LIMIT),
  }).strict(),
]);
export const basDrawingRequestSchema = z.object({
  operation_id: z.string().uuid(), expected_head: sha.nullable(), expected_dependencies: sha,
  reviewer: z.string().trim().min(1).max(256), reason,
  action: basDrawingActionSchema,
}).strict();
export const basDrawingEventSchema = basDrawingRequestSchema.extend({
  event_id: sha, rule_version: z.literal(BAS_DRAWING_RULE), created_at: z.string().datetime(),
  origin: z.enum(['operator_input', 'agent_proposal']),
}).strict();
export type BasDrawingPageRef = z.infer<typeof basDrawingPageRefSchema>;
export type BasDrawingAction = z.infer<typeof basDrawingActionSchema>;
export type BasDrawingRequest = z.infer<typeof basDrawingRequestSchema>;
export type BasDrawingEvent = z.infer<typeof basDrawingEventSchema>;
