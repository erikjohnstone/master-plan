/** Shared issue decisions, not extraction, waiver, calculation or approval. */
import { z } from 'zod';
import { BAS_PROJECT_ISSUE_RULE } from './basProjectIssueCatalog.ts';

export const BAS_ISSUE_REVIEW_RULE = 'bas_issue_decisions_1' as const;
export const BAS_ISSUE_JOURNAL_LIMITS = Object.freeze({ events: 10000, bytes: 16 * 1024 * 1024 });
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const BAS_ISSUE_EVENT_HEADS = { sequence_head: 'review_events', equipment_head: 'equipment_events',
  assembly_head: 'assembly_events', engineering_head: 'engineering_events' } as const;
export const BAS_ISSUE_CALCULATION_HEADS = { assignment_calculation_id: 'assignment_calculations',
  assembly_calculation_id: 'assembly_calculations' } as const;
export const basIssueBasisSchema = z.object({ finding_rule: z.literal(BAS_PROJECT_ISSUE_RULE),
  sequence_head: sha.nullable(), equipment_head: sha.nullable(), assembly_head: sha.nullable(), engineering_head: sha.nullable(),
  assignment_calculation_id: sha.nullable(), assembly_calculation_id: sha.nullable(),
}).strict();
export const basIssueReviewRequestSchema = z.object({ operation_id: z.string().uuid(), capture_id: sha,
  expected_head: sha.nullable(), expected_basis: basIssueBasisSchema,
  reviewer: z.string().trim().min(1).max(256), reason: z.string().trim().min(1).max(4096),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('acknowledge'), issue_key: sha, occurrence_id: sha }).strict(),
    z.object({ kind: z.literal('begin_correction'), issue_key: sha, occurrence_id: sha }).strict(),
    z.object({ kind: z.literal('record_not_reported'), observation_id: sha }).strict(),
    z.object({ kind: z.literal('withdraw'), decision_id: sha }).strict(),
  ]),
}).strict();
export const basIssueReviewEventSchema = basIssueReviewRequestSchema.extend({ event_id: sha,
  rule_version: z.literal(BAS_ISSUE_REVIEW_RULE), origin: z.enum(['operator_input', 'agent_proposal']),
  created_at: z.string().datetime(), reviewer_identity: z.literal('self_declared'), approved: z.literal(false),
  issue_key: sha, occurrence_id: sha,
}).strict();
export const basIssueJournalSchema = z.array(basIssueReviewEventSchema).max(BAS_ISSUE_JOURNAL_LIMITS.events);
export type BasIssueBasis = z.infer<typeof basIssueBasisSchema>;
export type BasIssueReviewRequest = z.infer<typeof basIssueReviewRequestSchema>;
export type BasIssueReviewEvent = z.infer<typeof basIssueReviewEventSchema>;

export function assertBasIssueJournalBytes(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > BAS_ISSUE_JOURNAL_LIMITS.bytes)
    throw new Error('BAS issue journal exceeds its 16 MiB encoded limit');
}
