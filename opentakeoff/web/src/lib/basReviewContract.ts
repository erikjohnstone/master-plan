/** Shared review wire contract; origins are set by the entry point, not forms. */
import { z } from 'zod';
import { basSequenceAssociationSchema } from './basSequenceReconciliation.ts';

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(512);
export const basReviewRequestSchema = z.object({
  operation_id: z.string().uuid(), capture_id: sha, expected_head: sha.nullable(),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('upsert'), association: basSequenceAssociationSchema.omit({ review_origin: true }) }).strict(),
    z.object({ kind: z.literal('remove'), region_id: id, matrix_id: id, reason: z.string().trim().min(1).max(4096) }).strict(),
  ]),
}).strict();
export const basReviewEventSchema = basReviewRequestSchema.extend({
  event_id: sha, rule_version: z.literal('bas_association_review_1'),
  created_at: z.string().datetime(), origin: z.enum(['operator_input', 'agent_proposal']),
}).strict();
export type BasReviewRequest = z.infer<typeof basReviewRequestSchema>;
export type BasReviewEvent = z.infer<typeof basReviewEventSchema>;
