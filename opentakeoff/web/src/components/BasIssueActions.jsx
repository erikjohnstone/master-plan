/** Surface-only forms. Shared services validate every decision against its pinned inputs. */
import { useEffect, useRef, useState } from 'react';
import { canonicalBasJson } from '../lib/basCanonical.ts';
const labels = { acknowledge: 'Acknowledge', begin_correction: 'Begin correction', record_not_reported: 'Record no longer reported', withdraw: 'Withdraw decision' };
const submitLabels = { acknowledge: 'Record acknowledgment', begin_correction: 'Record and open correction', record_not_reported: 'Confirm no longer reported', withdraw: 'Record withdrawal' };
export default function BasIssueActions({ workspace, finding, decisionView, state, onStateChange, onRecord, onOpenDomain }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const operation = useRef(null), formHeading = useRef(null);
  useEffect(() => () => operation.current?.abort(), []);
  const draft = state.issueDraft;
  const draftId = draft?.request.operation_id;
  useEffect(() => { if (draftId) formHeading.current?.focus(); }, [draftId]);
  const change = patch => onStateChange(previous => ({ ...previous, ...patch }));
  const active = workspace.project_review.source_status === 'active_capture';
  const stale = draft && (draft.request.capture_id !== workspace.project_review.capture_id
    || draft.request.expected_head !== workspace.head || canonicalBasJson(draft.request.expected_basis) !== canonicalBasJson(workspace.basis));
  const target = decisionView?.decision;
  function begin(kind) {
    const action = kind === 'withdraw' ? { kind, decision_id: target.event_id }
      : kind === 'record_not_reported' ? { kind, observation_id: target.event_id }
      : { kind, issue_key: finding.issue_key, occurrence_id: finding.occurrence_id };
    setError(''); change({ issueNotice: '', issueDraft: { label: (finding || decisionView.original_finding).subject.label,
      finding: kind === 'begin_correction' ? finding : null,
      request: { operation_id: crypto.randomUUID(), capture_id: workspace.project_review.capture_id,
        expected_head: workspace.head, expected_basis: workspace.basis, reviewer: state.issueReviewer || '', reason: '', action } } });
  }
  async function save(event) {
    event.preventDefault(); if (busy || stale || !draft) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError('');
    try {
      const result = await onRecord(draft.request, { signal: controller.signal });
      change({ issueDraft: null, issueReviewer: result.event.reviewer,
        issueNotice: `${labels[result.event.action.kind]} recorded. This does not approve the takeoff or remove blockers.`,
        ...(draft.request.action.kind === 'begin_correction' ? { history: true, decisionId: result.event.event_id } : {}) });
      if (draft.request.action.kind === 'begin_correction') onOpenDomain(draft.finding);
    } catch (e) { if (!controller.signal.aborted) setError(e.message); }
    finally { if (operation.current === controller) operation.current = null; setBusy(false); }
  }
  return <section className="bas-issue-actions" aria-label="Issue decisions">
    {state.issueNotice && <p role="status">{state.issueNotice}</p>}
    <p className="bas-review-boundary">Decision history does not change source evidence, quantities, severity or approval.</p>
    {error && <p role="alert">{error}</p>}
    {!draft ? <div className="bas-review-actions">
      {finding && <><button type="button" disabled={!active || !onRecord} onClick={() => begin('acknowledge')}>Acknowledge</button>
        <button type="button" disabled={!active || !onRecord || !onOpenDomain} onClick={() => begin('begin_correction')}>Begin correction</button></>}
      {decisionView?.is_latest_decision && <>
        {decisionView.current_state === 'not_reported' && ['acknowledge', 'begin_correction'].includes(target.action.kind)
          && <button type="button" disabled={!active || !onRecord} onClick={() => begin('record_not_reported')}>Record no longer reported</button>}
        {target.action.kind !== 'withdraw' && <button type="button" disabled={!active || !onRecord} onClick={() => begin('withdraw')}>Withdraw decision</button>}
      </>}
    </div> : <form onSubmit={save}>
      <h4 ref={formHeading} tabIndex={-1}>{labels[draft.request.action.kind]} · {draft.label}</h4>
      {stale && <p role="alert">The finding inputs or issue history changed. Your draft is retained; discard it and review the current evidence before recording.</p>}
      {draft.request.action.kind === 'record_not_reported' && <p>The original observation will be replayed and compared with current inputs. Absence can reflect removal or exclusion; it does not prove a physical correction.</p>}
      <fieldset disabled={busy || stale}>
        <label>Reviewer (self-declared)<input aria-label="Reviewer (self-declared)" required maxLength={256} value={draft.request.reviewer}
          onChange={e => change({ issueDraft: { ...draft, request: { ...draft.request, reviewer: e.target.value } } })} /></label>
        <label>Issue decision reason<textarea aria-label="Issue decision reason" required maxLength={4096} value={draft.request.reason}
          onChange={e => change({ issueDraft: { ...draft, request: { ...draft.request, reason: e.target.value } } })} /></label>
        <button type="submit" disabled={!onRecord || !draft.request.reason.trim() || !draft.request.reviewer.trim()}>{submitLabels[draft.request.action.kind]}</button>
      </fieldset>
      <button type="button" disabled={busy} onClick={() => { setError(''); change({ issueDraft: null }); }}>Discard decision draft</button>
      {busy && <><p role="status">Checking the retained evidence and recording…</p><button type="button" onClick={() => operation.current?.abort()}>Cancel recording</button></>}
    </form>}
  </section>;
}
