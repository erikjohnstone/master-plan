/** Shared comparison-decision journal contract. A saved binding is not replay
 * verification, source-byte verification, approval or authentication. */
import { z } from 'zod';
import { basRevisionComparisonRequestSchema, normalizeBasRevisionComparisonRequest } from './basRevisionComparisonContract.ts';

export const BAS_REVISION_REVIEW_RULE = 'bas_revision_review_1' as const;
export const BAS_REVISION_JOURNAL_LIMITS = Object.freeze({ events: 10000, entries: 250000, bytes: 64 * 1024 * 1024 });
const sha = z.string().regex(/^[a-f0-9]{64}$/), reason = z.string().trim().min(1).max(4096);
const request = z.object({ operation_id: z.string().uuid(), expected_head: sha.nullable(), expected_report_fingerprint: sha,
  name: z.string().trim().min(1).max(256), reviewer: z.string().trim().min(1).max(256), reason,
  comparison: basRevisionComparisonRequestSchema,
}).strict();
export const basRevisionReviewRequestSchema = request.transform(r => ({ ...r, comparison: normalizeBasRevisionComparisonRequest(r.comparison) }));
export const basRevisionReviewEventSchema = request.extend({ event_id: sha, rule_version: z.literal(BAS_REVISION_REVIEW_RULE),
  origin: z.enum(['operator_input', 'agent_proposal']), created_at: z.string().datetime(), approved: z.literal(false),
}).strict();
export const basRevisionJournalSchema = z.array(basRevisionReviewEventSchema).max(BAS_REVISION_JOURNAL_LIMITS.events);
export type BasRevisionReviewRequest = z.infer<typeof basRevisionReviewRequestSchema>;
export type BasRevisionReviewEvent = z.infer<typeof basRevisionReviewEventSchema>;

export function assertBasRevisionJournalSize(entries: number, bytes: number) {
  if (![entries, bytes].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid BAS comparison journal size');
  if (entries > BAS_REVISION_JOURNAL_LIMITS.entries) throw new Error('BAS comparison journal exceeds 250,000 selectors and decisions');
  if (bytes > BAS_REVISION_JOURNAL_LIMITS.bytes) throw new Error('BAS comparison journal exceeds 64 MiB');
}
