/** Shared bounded lineage/ownership. Semantic review needs separate replay. */
import { basScopeJournalSchema, basCoverageSlotKey, assertBasScopeJournalBytes, type BasScopeReviewEvent } from './basScopeReviewContract.ts';
import { canonicalBasJson } from './basCanonical.ts';
import type { BasDrawingCapture, BasDrawingSourceSet } from './basDrawingRevision.ts';
import type { BasRevisionBasis } from './basRevisionBasisContract.ts';
import { BAS_ISSUE_EVENT_HEADS, BAS_ISSUE_CALCULATION_HEADS } from './basIssueReviewContract.ts';
import { basDeliverableTargetKey } from './basDeliverableScopeContract.ts';
type Event = { event_id: string; capture_id: string };
type Calculation = { calculation_id: string; result: { capture_id: string } };
export type BasScopeOwners = { captures: BasDrawingCapture[]; scope_events?: BasScopeReviewEvent[];
  review_events?: Event[]; equipment_events?: Event[]; assembly_events?: Event[]; engineering_events?: Event[];
  assignment_calculations?: Calculation[]; assembly_calculations?: Calculation[] };

export function validateBasScopeJournal(owners: BasScopeOwners, sourceSets: Map<string, BasDrawingSourceSet>) {
  const events = basScopeJournalSchema.parse(owners.scope_events ?? []);
  const seen = new Map<string, BasScopeReviewEvent>(), scopes = new Map<string, BasScopeReviewEvent>(), coverage = new Map<string, BasScopeReviewEvent>();
  let head: string | null = null, encoded_bytes = 2;
  const operations = new Set<string>(), captures = new Map(owners.captures.map(c => [c.capture_id, c]));
  const selectors = Object.fromEntries([
    ...Object.entries(BAS_ISSUE_EVENT_HEADS).map(([field, collection]) => [field, new Map((owners[collection] ?? []).map(e => [e.event_id, e.capture_id]))]),
    ...Object.entries(BAS_ISSUE_CALCULATION_HEADS).map(([field, collection]) => [field, new Map((owners[collection] ?? []).map(c => [c.calculation_id, c.result.capture_id]))]),
  ]) as Record<string, Map<string, string>>;
  const ownBasis = (basis: BasRevisionBasis) => {
    const set = sourceSets.get(basis.source_set_id); if (!set) throw new Error('Scope review has no retained complete source set');
    const selected = new Set(set.pages.map(p => p.capture_id));
    if (basis.captures.length !== selected.size || basis.captures.some(c => !selected.has(c.capture_id))) throw new Error('Scope basis does not match its source-set captures');
    for (const c of basis.captures) for (const [field, map] of Object.entries(selectors)) {
      const id = c[field as Exclude<keyof typeof c, 'capture_id'>];
      if (id !== null && map.get(id) !== c.capture_id) throw new Error('Scope basis selects an unowned decision or calculation');
    }
    return set;
  };
  for (const event of events) {
    if (event.expected_head !== head) throw new Error('Divergent or incomplete BAS scope history');
    if (operations.has(event.operation_id) || seen.has(event.event_id)) throw new Error('Duplicate BAS scope operation/event');
    encoded_bytes += new TextEncoder().encode(canonicalBasJson(event)).byteLength + (head ? 1 : 0); assertBasScopeJournalBytes(encoded_bytes);
    const action = event.action;
    if (action.kind === 'save_scope') {
      if (action.specification.scope_id !== event.scope_id) throw new Error('Saved scope identity disagrees with its specification');
      if ((scopes.get(event.scope_id)?.event_id ?? null) !== action.previous_scope_event_id) throw new Error('Scope predecessor is not the current owned scope event');
      ownBasis(action.specification.basis); scopes.set(event.scope_id, event);
    } else if (action.kind === 'withdraw_scope' || action.kind === 'record_coverage') {
      const scope = seen.get(action.scope_event_id);
      if (!scope || scope.action.kind !== 'save_scope' || scope.scope_id !== event.scope_id || scopes.get(event.scope_id)?.event_id !== scope.event_id)
        throw new Error('Scope action requires the current owned saved scope');
      if (action.kind === 'withdraw_scope') scopes.set(event.scope_id, event);
      else {
        const specification = scope.action.specification, set = ownBasis(action.basis);
        if (set.source_set_id !== specification.basis.source_set_id) throw new Error('Coverage basis changed the saved source set');
        if (!specification.included.some(t => basDeliverableTargetKey(t) === basDeliverableTargetKey(action.claim))) throw new Error('Coverage claim is not included in its saved scope');
        if (!set.pages.some(p => p.capture_id === action.unit.capture_id && p.page_id === action.unit.page_id)) throw new Error('Coverage page is outside its saved source set');
        const page = captures.get(action.unit.capture_id)?.narrative_sources?.pages.find(p => p.page_id === action.unit.page_id);
        const spans = new Set(page?.spans.map(s => s.span_id));
        if (action.unit.span_ids?.some(id => !spans.has(id))) throw new Error('Coverage span is not owned by its exact original page');
        coverage.set(basCoverageSlotKey(event.scope_id, action), event);
      }
    } else {
      const previous = seen.get(action.coverage_event_id);
      if (!previous || previous.scope_id !== event.scope_id || previous.action.kind !== 'record_coverage'
        || coverage.get(basCoverageSlotKey(event.scope_id, previous.action))?.event_id !== previous.event_id)
        throw new Error('Coverage withdrawal requires the current owned decision');
      coverage.set(basCoverageSlotKey(event.scope_id, previous.action), event);
    }
    head = event.event_id; operations.add(event.operation_id); seen.set(event.event_id, event);
  }
  return { head, scopes, coverage, seen, encoded_bytes, replay_verification: 'lineage_only' as const };
}
