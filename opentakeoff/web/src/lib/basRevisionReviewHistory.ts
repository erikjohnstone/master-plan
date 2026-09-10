/** Shared fast journal lineage/selector ownership, deliberately not report replay. */
import { basRevisionJournalSchema, assertBasRevisionJournalSize, type BasRevisionReviewEvent } from './basRevisionReviewContract.ts';
import { canonicalBasJson } from './basCanonical.ts';
import type { BasDrawingSourceSet } from './basDrawingRevision.ts';

type Event = { event_id: string; capture_id: string };
type Calculation = { calculation_id: string; result: { capture_id: string } };
type Owners = { captures: Array<{ capture_id: string }>; revision_events?: BasRevisionReviewEvent[];
  review_events?: Event[]; equipment_events?: Event[]; assembly_events?: Event[]; engineering_events?: Event[];
  assignment_calculations?: Calculation[]; assembly_calculations?: Calculation[] };

export function validateBasRevisionJournal(owners: Owners, sourceSets: Map<string, BasDrawingSourceSet>) {
  if (!owners.revision_events?.length) return { head: null, entries: 0, encoded_bytes: 2, comparison_verification: 'not_replayed' as const };
  const events = basRevisionJournalSchema.parse(owners.revision_events);
  const captures = new Set(owners.captures.map(c => c.capture_id));
  const eventOwners = (events: Event[] = []) => new Map(events.map(e => [e.event_id, e.capture_id]));
  const calculationOwners = (records: Calculation[] = []) => new Map(records.map(c => [c.calculation_id, c.result.capture_id]));
  const selectors = { sequence_head: eventOwners(owners.review_events), equipment_head: eventOwners(owners.equipment_events),
    assembly_head: eventOwners(owners.assembly_events), engineering_head: eventOwners(owners.engineering_events),
    assignment_calculation_id: calculationOwners(owners.assignment_calculations), assembly_calculation_id: calculationOwners(owners.assembly_calculations) };
  let head: string | null = null, entries = 0, encoded_bytes = 2;
  const operations = new Set<string>(), ids = new Set<string>(), encode = new TextEncoder();
  for (const event of events) {
    if (event.expected_head !== head) throw new Error('Divergent or incomplete BAS comparison review history');
    if (operations.has(event.operation_id) || ids.has(event.event_id)) throw new Error('Duplicate BAS comparison operation/event');
    operations.add(event.operation_id); ids.add(event.event_id);
    const c = event.comparison;
    entries += c.before.captures.length + c.after.captures.length + c.matches.length + c.added.length + c.removed.length + c.membership_reviews.length;
    encoded_bytes += encode.encode(canonicalBasJson(event)).byteLength + (head === null ? 0 : 1);
    assertBasRevisionJournalSize(entries, encoded_bytes);
    for (const basis of [c.before, c.after]) {
      const set = sourceSets.get(basis.source_set_id);
      if (!set) throw new Error('BAS comparison has no retained complete source set');
      const selected = new Set(set.pages.map(p => p.capture_id));
      if (basis.captures.length !== selected.size || basis.captures.some(h => !captures.has(h.capture_id) || !selected.has(h.capture_id)))
        throw new Error('BAS comparison selectors do not match their source-set captures');
      for (const h of basis.captures) for (const field of Object.keys(selectors) as Array<keyof typeof selectors>) {
        if (h[field] !== null && selectors[field].get(h[field]!) !== h.capture_id) throw new Error('BAS comparison selects an unowned decision or calculation');
      }
    }
    head = event.event_id;
  }
  return { head, entries, encoded_bytes, comparison_verification: 'not_replayed' as const };
}
