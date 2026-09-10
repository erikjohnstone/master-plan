/** Shared readiness accounting. Internal input comes only from verified scope
 * replay, never a public caller's proposed coverage/result array. */
import { basDeliverableTargetKey, type BasDeliverableScope, type BasDeliverableTarget } from './basDeliverableScopeContract.ts';
import type { prepareBasScopeReadiness } from './basScopeReview.ts';
import type { BasScopeReviewEvent, BasCoverageAction } from './basScopeReviewContract.ts';
import { replayBasDrawingHistory } from './basDrawingRevision.ts';

export const BAS_READINESS_WORK_LIMIT = 250000;
export type BasReadinessBlocker = { code: string; target: BasDeliverableTarget | null;
  page_id: string | null; item_id: string | null; event_ids: string[]; explanation: string };
type Input = Awaited<ReturnType<typeof prepareBasScopeReadiness>>;
type Decision = { event: BasScopeReviewEvent & { action: BasCoverageAction }; state: Input['coverage'][number]['state'];
  mapped: Set<string>; spans: Set<string> | null };
export type BasReadinessPage = { target: BasDeliverableTarget; page_id: string; status: 'accounted' | 'blocked';
  whole_page: boolean; total_spans: number; accounted_spans: number; event_ids: string[] };
const pageKey = (target: BasDeliverableTarget, page: string) => JSON.stringify([basDeliverableTargetKey(target), page]);

export function evaluateBasReadinessCoverage(input: Input, signal?: AbortSignal) {
  const { workflow, current, coverage } = input;
  const blockers: BasReadinessBlocker[] = [], pages: BasReadinessPage[] = [];
  const groups = new Map<string, Decision[]>(), accepted = new Map<string, Decision[]>();
  let work = 0;
  const tick = () => { signal?.throwIfAborted(); if (++work > BAS_READINESS_WORK_LIMIT)
    throw new Error('Readiness coverage exceeds the 250,000-operation accounting limit'); };
  for (const row of coverage) {
    tick(); if (row.event.action.kind !== 'record_coverage') continue;
    const a = row.event.action, key = pageKey(a.claim, a.unit.page_id), group = groups.get(key) ?? [];
    const mapped = new Set<string>(), spans = a.unit.span_ids === null ? null : new Set<string>();
    for (const id of a.mapped_item_ids) { tick(); mapped.add(id); }
    for (const id of a.unit.span_ids ?? []) { tick(); spans!.add(id); }
    group.push({ ...row, event: row.event as Decision['event'], mapped, spans }); groups.set(key, group);
  }
  const sources = replayBasDrawingHistory(workflow.captures, workflow.drawing_events).source_sets.get(current.specification.basis.source_set_id)!;
  const originals = new Map(workflow.captures.flatMap(c => c.narrative_sources?.pages.map(p => [JSON.stringify([c.capture_id, p.page_id]), p] as const) ?? []));
  const pageIds = new Map<string, string[]>();
  for (const p of sources.pages) { const ids = pageIds.get(p.capture_id) ?? []; ids.push(p.page_id); pageIds.set(p.capture_id, ids); }
  for (const claim of current.claims) for (const page_id of pageIds.get(claim.target.capture_id) ?? []) {
    tick();
    const key = pageKey(claim.target, page_id), group = groups.get(key) ?? [];
    const valid = group.filter(d => d.state === 'current_dependencies' && d.event.origin === 'operator_input');
    const source = originals.get(JSON.stringify([claim.target.capture_id, page_id]));
    const spanIds = source?.spans.map(s => s.span_id) ?? [], covered = new Set<string>();
    const bySpan = new Map<string, Map<string, Set<string>>>(), whole = new Map<string, Set<string>>();
    const conflicts = new Set<string>();
    const addAssessment = (map: Map<string, Set<string>>, assessment: string, id: string) => {
      const ids = map.get(assessment) ?? new Set<string>(); ids.add(id); map.set(assessment, ids);
    };
    let whole_page = false;
    for (const d of valid) {
      tick(); const a = d.event.action;
      if (a.unit.span_ids === null) {
        addAssessment(whole, a.assessment, d.event.event_id);
        if (a.assessment !== 'unresolved') whole_page = true;
      } else for (const id of a.unit.span_ids) {
        tick(); const assessments = bySpan.get(id) ?? new Map<string, Set<string>>();
        addAssessment(assessments, a.assessment, d.event.event_id); bySpan.set(id, assessments);
        if (a.assessment !== 'unresolved') covered.add(id);
      }
    }
    if (whole.size > 1) for (const ids of whole.values()) for (const id of ids) conflicts.add(id);
    for (const assessments of bySpan.values()) {
      tick(); const kinds = new Set([...whole.keys(), ...assessments.keys()]);
      if (kinds.size > 1) for (const ids of [...whole.values(), ...assessments.values()]) for (const id of ids) conflicts.add(id);
    }
    // A current proposal/unfinished decision cannot be hidden underneath a
    // different review slot. It must be resolved or explicitly withdrawn.
    const unfinished = group.filter(d => d.state !== 'current_dependencies' || d.event.origin !== 'operator_input' || d.event.action.assessment === 'unresolved');
    const complete = whole_page || (spanIds.length > 0 && spanIds.every(id => covered.has(id)));
    const status = complete && !conflicts.size && !unfinished.length ? 'accounted' as const : 'blocked' as const;
    pages.push({ target: claim.target, page_id, status, whole_page, total_spans: spanIds.length,
      accounted_spans: whole_page ? spanIds.length : covered.size, event_ids: group.map(d => d.event.event_id) });
    if (!complete) blockers.push({ code: 'source_coverage_incomplete', target: claim.target, page_id, item_id: null,
      event_ids: [], explanation: 'Review the whole original page or every retained span for this included claim; absent text is not empty scope.' });
    if (conflicts.size) blockers.push({ code: 'source_coverage_conflict', target: claim.target, page_id, item_id: null,
      event_ids: [...conflicts].sort(), explanation: 'Overlapping source reviews disagree. Resolve or withdraw the conflicting decisions.' });
    if (unfinished.length) blockers.push({ code: 'source_coverage_not_current_human_review', target: claim.target, page_id, item_id: null,
      event_ids: unfinished.map(d => d.event.event_id), explanation: 'Coverage contains an unresolved, stale or agent-proposed decision; it is not current human review.' });
    accepted.set(key, status === 'accounted' ? valid.filter(d => d.event.action.assessment === 'applicable_mapped') : []);
  }
  const items = new Map(current.inventory.items.map(i => [i.item_id, i]));
  for (const claim of current.claims) for (const id of claim.dependency_item_ids) {
    tick(); const item = items.get(id)!;
    for (const ref of item.source_refs) {
      tick(); const choices = accepted.get(pageKey(claim.target, ref.page_id)) ?? [];
      const mapped = choices.some(d => { tick(); const a = d.event.action;
        return d.mapped.has(id) && (a.unit.span_ids === null || (ref.span_id !== null && d.spans!.has(ref.span_id))); });
      if (!mapped) {
        blockers.push({ code: 'dependency_source_not_mapped', target: claim.target, page_id: ref.page_id, item_id: id, event_ids: [],
          explanation: 'An included dependency uses this original source, but has no current applicable mapping. Table cells require whole-page review when they have no narrative span ID.' });
        break;
      }
    }
  }
  return { pages, blockers, accounting: 'explicit_human_applicability_not_automatic_discovery' as const };
}

export function basReadinessDiagnosticBlocks(diagnostic: BasDeliverableScope['claims'][number]['diagnostics'][number], item: BasDeliverableScope['inventory']['items'][number]) {
  if (diagnostic.code === 'python_replay_required') return false; // Separate actual replay gate; never considered satisfied here.
  return !(diagnostic.code === 'source_unlocated' && item.kind === 'scope'
    && (item.origin === 'operator_input' || item.origin === 'agent_proposal'));
}
