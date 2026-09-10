/** Surface-only history reader; original/current findings are replayed by the shared service. */
import { useEffect, useRef, useState } from 'react';
import { readBasIssueDecision } from '../lib/basIssueReview.ts';
import { downloadText } from '../lib/totals.js';
import BasIssueActions from './BasIssueActions.jsx';
const human = value => String(value).replaceAll('_', ' ');
export default function BasIssueHistory({ workflow, workspace, state, onStateChange, onRecord, onSource, onOpenDomain }) {
  const [computed, setComputed] = useState(null), heading = useRef(null);
  const change = patch => onStateChange(previous => ({ ...previous, ...patch }));
  useEffect(() => {
    if (!state.decisionId) return;
    const controller = new AbortController();
    readBasIssueDecision(workflow, state.decisionId, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setComputed({ input: workflow, id: state.decisionId, value });
    }).catch(error => { if (!controller.signal.aborted) setComputed({ input: workflow, id: state.decisionId, error: error.message }); });
    return () => controller.abort();
  }, [workflow, state.decisionId]);
  const ready = computed?.input === workflow && computed?.id === state.decisionId, data = ready ? computed.value : null;
  useEffect(() => { if (data) heading.current?.focus(); }, [data]);
  const rows = [...workspace.history].reverse().filter(e => !state.historyFilter || `${e.reviewer} ${e.reason} ${e.action.kind} ${e.issue_key}`.toLowerCase().includes(state.historyFilter.toLowerCase()));
  const page = Math.max(0, Math.min(state.historyPage || 0, Math.ceil(rows.length / 50) - 1));
  const states = new Map(workspace.decisions.map(d => [d.event_id, d.state]));
  const sourcePage = Math.max(0, Math.min(state.historySourcePage || 0, Math.ceil((data?.original_finding.evidence.length || 0) / 20) - 1));
  return <section className="bas-review-detail" aria-label="Issue decision history">
    {state.decisionId ? <>
      <button type="button" onClick={() => change({ decisionId: null })}>← Back to decision history</button>
      {!ready ? <p role="status">Replaying the original observation and current findings…</p> : computed.error ? <p role="alert">Decision could not be replayed: {computed.error}. It has not been accepted as verified.</p> : <>
        <h3 ref={heading} tabIndex={-1}>{data.original_finding.title}</h3>
        <p>{data.original_finding.subject.label} · {human(data.current_state)} · {data.is_latest_decision ? 'Latest decision' : 'Earlier decision'}</p>
        <p><strong>{human(data.decision.action.kind)}</strong> · {data.decision.reviewer} (self-declared) · {human(data.decision.origin)}</p>
        <p>{data.decision.reason}</p>
        <p>Original finding replayed from retained inputs. Source bytes and Python calculations are not verified by this read.</p>
        <button type="button" disabled={!onOpenDomain} onClick={() => onOpenDomain(data.original_finding)}>Open original domain workspace</button>
        {data.reviewed_change && <details><summary>Inputs changed for the recorded absence</summary><pre>{JSON.stringify(data.reviewed_change, null, 2)}</pre></details>}
        <BasIssueActions workspace={workspace} decisionView={data} state={state} onStateChange={onStateChange} onRecord={onRecord} onOpenDomain={onOpenDomain} />
        {!!data.current_findings.length && <div className="bas-review-actions">{data.current_findings.map(i => <button key={i.occurrence_id} type="button" onClick={() => change({ history: false, selectedId: i.occurrence_id, sourcePage: 0 })}>Open current finding</button>)}</div>}
        <h4>Original observed evidence · {data.original_finding.evidence.length}</h4>
        {!data.original_finding.evidence.length && <p>No located source is attached. This is not evidence of an absent requirement.</p>}
        <div className="bas-point-grid"><table aria-label="Historical finding evidence"><thead><tr><th>Original wording</th><th>Source</th></tr></thead><tbody>
          {data.original_finding.evidence.slice(sourcePage * 20, (sourcePage + 1) * 20).map((e, i) => <tr key={sourcePage * 20 + i}><td>{e.text || 'Explicit blank'}</td><td><button type="button" disabled={!e.bbox_px || !onSource} onClick={() => onSource(e)}>View original PDF page {e.page_id.split(':p').at(-1)}</button></td></tr>)}
        </tbody></table></div>
        {data.original_finding.evidence.length > 20 && <div className="bas-point-controls"><button type="button" disabled={!sourcePage} onClick={() => change({ historySourcePage: sourcePage - 1 })}>Previous sources</button><span>{sourcePage + 1} / {Math.ceil(data.original_finding.evidence.length / 20)}</span><button type="button" disabled={(sourcePage + 1) * 20 >= data.original_finding.evidence.length} onClick={() => change({ historySourcePage: sourcePage + 1 })}>Next sources</button></div>}
        <details><summary>Exact original finding and observation</summary><pre>{JSON.stringify({ finding: data.original_finding, observation: data.observation }, null, 2)}</pre></details>
        <button type="button" onClick={() => downloadText('bas-issue-replay.json', JSON.stringify(data, null, 2), 'application/json')}>Export replayed decision</button>
      </>}
    </> : <>
      <h3>Issue decision history</h3><p>History is lineage-checked. Open a decision to replay its original finding and any recorded absence. No decision here approves the takeoff.</p>
      <label>Find a decision<input value={state.historyFilter || ''} onChange={e => change({ historyFilter: e.target.value, historyPage: 0 })} placeholder="Reviewer, reason or action" /></label>
      <div className="bas-point-grid"><table aria-label="Issue decisions"><thead><tr><th>Decision</th><th>Reviewer</th><th>Reason</th><th>Current relationship</th></tr></thead><tbody>
        {rows.slice(page * 50, (page + 1) * 50).map(e => <tr key={e.event_id}><th scope="row"><button type="button" onClick={() => change({ decisionId: e.event_id, historySourcePage: 0 })}>{human(e.action.kind)}</button><small>{e.created_at}</small></th><td>{e.reviewer}<small>{human(e.origin)} · self-declared</small></td><td>{e.reason}</td><td>{states.has(e.event_id) ? human(states.get(e.event_id)) : 'Earlier decision'}</td></tr>)}
      </tbody></table></div>
      {!rows.length && <p>No recorded decisions match. Findings remain in the findings list.</p>}
      <div className="bas-point-controls"><button type="button" disabled={!page} onClick={() => change({ historyPage: page - 1 })}>Previous decisions</button><span>{rows.length ? page * 50 + 1 : 0}–{Math.min(rows.length, (page + 1) * 50)} of {rows.length}</span><button type="button" disabled={(page + 1) * 50 >= rows.length} onClick={() => change({ historyPage: page + 1 })}>Next decisions</button></div>
    </>}
  </section>;
}
