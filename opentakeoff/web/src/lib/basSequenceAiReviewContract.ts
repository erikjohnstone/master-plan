import { z } from 'zod';

export const BAS_SEQUENCE_AI_REVIEW_RULE = 'bas_sequence_ai_review_1' as const;
const sha = z.string().regex(/^[a-f0-9]{64}$/);

export const basSequenceAiReviewRequestSchema = z.object({
  operation_id: z.string().uuid(),
  capture_id: sha,
  run_id: sha,
  interpretation_id: sha,
  expected_head: sha.nullable(),
  decision: z.enum(['confirmed', 'rejected']),
  reason: z.string().trim().min(1).max(4000),
}).strict();

export const basSequenceAiReviewEventSchema = basSequenceAiReviewRequestSchema.extend({
  event_id: sha,
  created_at: z.string().datetime(),
  origin: z.enum(['operator_input', 'agent_proposal']),
  approved: z.literal(false),
  rule_version: z.literal(BAS_SEQUENCE_AI_REVIEW_RULE),
}).strict();

export type BasSequenceAiReviewRequest = z.infer<typeof basSequenceAiReviewRequestSchema>;
export type BasSequenceAiReviewEvent = z.infer<typeof basSequenceAiReviewEventSchema>;

