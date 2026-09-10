/** Shared bounded lineage/typed ownership. Finding truth still requires replay. */
import { basIssueJournalSchema, assertBasIssueJournalBytes, BAS_ISSUE_EVENT_HEADS, BAS_ISSUE_CALCULATION_HEADS,
  type BasIssueReviewEvent } from './basIssueReviewContract.ts';
import { canonicalBasJson } from './basCanonical.ts';

type Event = { event_id: string; capture_id: string };
type Calculation = { calculation_id: string; result: { capture_id: string } };
export type BasIssueOwners = { captures: Array<{ capture_id: string }>; issue_events?: BasIssueReviewEvent[];
  review_events?: Event[]; equipment_events?: Event[]; assembly_events?: Event[]; engineering_events?: Event[];
  assignment_calculations?: Calculation[]; assembly_calculations?: Calculation[] };
export const basIssueOwnerKey = (captureId: string, issueKey: string) => `${captureId}:${issueKey}`;

export function validateBasIssueJournal(owners: BasIssueOwners) {
  const events = basIssueJournalSchema.parse(owners.issue_events ?? []), captures = new Set(owners.captures.map(c => c.capture_id));
  const heads = new Map<string, string>(), latest = new Map<string, BasIssueReviewEvent>(), seen = new Map<string, BasIssueReviewEvent>();
  const operations = new Set<string>();
  const eventOwners = Object.fromEntries(Object.entries(BAS_ISSUE_EVENT_HEADS).map(([field, collection]) =>
    [field, new Map((owners[collection] ?? []).map(e => [e.event_id, e.capture_id]))]));
  const calculationOwners = Object.fromEntries(Object.entries(BAS_ISSUE_CALCULATION_HEADS).map(([field, collection]) =>
    [field, new Map((owners[collection] ?? []).map(c => [c.calculation_id, c.result.capture_id]))]));
  let encoded_bytes = 2;
  for (const event of events) {
    encoded_bytes += new TextEncoder().encode(canonicalBasJson(event)).byteLength + (seen.size ? 1 : 0);
    assertBasIssueJournalBytes(encoded_bytes);
    if (!captures.has(event.capture_id)) throw new Error('Issue decision has no retained capture');
    if (event.expected_head !== (heads.get(event.capture_id) ?? null)) throw new Error('Divergent or incomplete BAS issue history');
    if (seen.has(event.event_id) || operations.has(event.operation_id)) throw new Error('Duplicate BAS issue operation/event');
    for (const field of Object.keys(BAS_ISSUE_EVENT_HEADS) as Array<keyof typeof BAS_ISSUE_EVENT_HEADS>) {
      const id = event.expected_basis[field];
      if (id !== null && eventOwners[field].get(id) !== event.capture_id) throw new Error('Issue basis selects an unowned decision');
    }
    for (const field of Object.keys(BAS_ISSUE_CALCULATION_HEADS) as Array<keyof typeof BAS_ISSUE_CALCULATION_HEADS>) {
      const id = event.expected_basis[field];
      if (id !== null && calculationOwners[field].get(id) !== event.capture_id) throw new Error('Issue basis selects an unowned calculation');
    }
    const a = event.action, key = basIssueOwnerKey(event.capture_id, event.issue_key);
    if (a.kind === 'acknowledge' || a.kind === 'begin_correction') {
      if (a.issue_key !== event.issue_key || a.occurrence_id !== event.occurrence_id) throw new Error('Issue observation identity disagrees with its request');
    } else {
      const target = seen.get(a.kind === 'withdraw' ? a.decision_id : a.observation_id);
      if (!target || target.capture_id !== event.capture_id || latest.get(key)?.event_id !== target.event_id
        || target.action.kind === 'withdraw' || target.issue_key !== event.issue_key || target.occurrence_id !== event.occurrence_id)
        throw new Error('Issue action must reference the current owned decision');
      if (a.kind === 'record_not_reported') {
        if (!['acknowledge', 'begin_correction'].includes(target.action.kind)) throw new Error('Absence review requires an original issue observation');
        if (canonicalBasJson(target.expected_basis) === canonicalBasJson(event.expected_basis)) throw new Error('Absence review requires changed retained inputs');
      }
    }
    heads.set(event.capture_id, event.event_id); latest.set(key, event); seen.set(event.event_id, event); operations.add(event.operation_id);
  }
  return { heads, latest, seen, encoded_bytes, finding_verification: 'not_replayed' as const };
}
