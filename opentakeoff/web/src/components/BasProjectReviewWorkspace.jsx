// Surface-specific reader. Shared saved findings and existing source navigation;
// no UI-derived quantities, dismissal, approval or new persistence semantics.
import { useEffect, useMemo, useRef, useState } from 'react';
import { basProjectReview } from '../lib/basProjectReview.ts';
import { downloadText } from '../lib/totals.js';
import './BasPointsWorkspace.css';
import './BasProjectReviewWorkspace.css';

const domains = { sources: 'Source coverage', points: 'Point lists', sequences: 'Sequences', equipment: 'Equipment', assemblies: 'Assemblies', engineering: 'Engineering' };
const human = text => String(text).replace(/_/g, ' ');
export default function BasProjectReviewWorkspace({ workflow, state = {}, onStateChange, onOpenCitation, onOpenDomain }) {
  const [computed, setComputed] = useState({ input: null, value: null, error: '' });
  const [sourceError, setSourceError] = useState('');
  const heading = useRef(null), scroll = useRef(null), returnFocus = useRef(null);
  useEffect(() => {
    let live = true;
    basProjectReview(workflow, workflow.current_capture_id).then(value => {
      if (live) setComputed({ input: workflow, value, error: '' });
    }).catch(error => { if (live) setComputed({ input: workflow, value: null, error: error.message }); });
    return () => { live = false; };
  }, [workflow]);
  const ready = computed.input === workflow, data = ready ? computed.value : null;
  const change = patch => onStateChange(previous => ({ ...previous, ...patch }));
  const rows = useMemo(() => (data?.issues || []).filter(i => (!state.domain || i.domain === state.domain)
    && (!state.severity || i.severity === state.severity) && (!state.filter || `${i.title} ${i.code} ${i.subject.label} ${i.evidence.map(e => e.text).join(' ')}`.toLowerCase().includes(state.filter.toLowerCase()))), [data, state.domain, state.severity, state.filter]);
  const page = Math.max(0, Math.min(state.page || 0, Math.ceil(rows.length / 50) - 1));
  const selected = data?.issues.find(i => i.occurrence_id === state.selectedId);
  useEffect(() => { if (ready && scroll.current) scroll.current.scrollTop = state.scroll || 0; }, [ready, state.scroll, page, selected]);
  useEffect(() => { if (selected) heading.current?.focus(); }, [selected]);
  useEffect(() => {
    if (!selected && ready && returnFocus.current) {
      const button = scroll.current?.querySelector(`[data-finding-id="${returnFocus.current}"]`);
      (button || scroll.current)?.focus({ preventScroll: true });
      returnFocus.current = null;
    }
  }, [selected, ready]);
  async function source(evidence) {
    setSourceError('');
    try {
      const response = await onOpenCitation({ page_id: evidence.page_id, sheet_id: evidence.page_id, bbox_px: evidence.bbox_px, value: evidence.text, kind: 'row' });
      if (response?.error) setSourceError(response.error);
    } catch (error) { setSourceError(error.message); }
  }
  if (!ready) return <p role="status" className="bas-point-message">Gathering saved BAS findings…</p>;
  if (computed.error) return <p role="alert" className="bas-point-message">Review unavailable: {computed.error}. Saved evidence has not been changed.</p>;
  const sourcePage = Math.max(0, Math.min(state.sourcePage || 0, Math.ceil((selected?.evidence.length || 0) / 20) - 1));
  return <section className="bas-point-workspace bas-project-review" aria-label="Project BAS review">
    <div className="bas-point-heading"><h2>Review &amp; changes</h2><span>{data.issues.length} saved findings</span>
      <button type="button" onClick={() => downloadText('bas-review-findings.json', JSON.stringify(data, null, 2), 'application/json')}>Export findings</button></div>
    <p className="bas-review-boundary">Current findings only · not an approved takeoff. PDF availability and saved calculations require separate verification.</p>
    <div className="bas-point-controls">
      <label>Find a finding<input value={state.filter || ''} onChange={e => change({ filter: e.target.value, page: 0 })} placeholder="Issue, equipment or source text" /></label>
      <label>Area<select aria-label="Area" value={state.domain || ''} onChange={e => change({ domain: e.target.value, page: 0 })}><option value="">All areas</option>{Object.entries(domains).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Severity<select aria-label="Severity" value={state.severity || ''} onChange={e => change({ severity: e.target.value, page: 0 })}><option value="">All findings</option><option value="blocker">Blocker</option><option value="warning">Warning</option><option value="information">Information</option></select></label>
    </div>
    {sourceError && <p role="alert">{sourceError}</p>}
    {selected ? <section className="bas-review-detail" aria-label="Selected BAS finding">
      <button type="button" onClick={() => { returnFocus.current = selected.occurrence_id; change({ selectedId: null }); }}>← Back to findings</button>
      <h3 tabIndex={-1} ref={heading}>{selected.title}</h3>
      <p><strong>{domains[selected.domain]} · {human(selected.severity)}</strong> · {selected.subject.label}</p>
      <p>{selected.next_step}</p>
      <dl className="bas-review-facts"><dt>Saved dependency state</dt><dd>{human(selected.dependency_status)}</dd><dt>Included / excluded</dt><dd>{human(selected.disposition)}</dd><dt>Original code</dt><dd>{selected.code}</dd></dl>
      <button type="button" onClick={() => onOpenDomain(selected)}>Open {domains[selected.domain]} workspace</button>
      <h4>Original source evidence · {selected.evidence.length}</h4>
      {!selected.evidence.length && <p>No located source is attached to this finding. Do not interpret this as evidence that the requirement is absent.</p>}
      <div className="bas-point-grid"><table aria-label="Finding source evidence"><thead><tr><th scope="col">Original wording</th><th scope="col">Source</th></tr></thead><tbody>
        {selected.evidence.slice(sourcePage * 20, (sourcePage + 1) * 20).map((e, index) => <tr key={sourcePage * 20 + index}><td>{e.text || 'Explicit blank'}</td><td><button type="button" disabled={!e.bbox_px || !onOpenCitation} onClick={() => source(e)}>View PDF page {e.page_id.split(':p').at(-1)}</button>{!e.bbox_px && <span> · Exact location unavailable</span>}</td></tr>)}
      </tbody></table></div>
      {selected.evidence.length > 20 && <div className="bas-point-controls"><button type="button" disabled={!sourcePage} onClick={() => change({ sourcePage: sourcePage - 1 })}>Previous sources</button><span>{sourcePage + 1} / {Math.ceil(selected.evidence.length / 20)}</span><button type="button" disabled={(sourcePage + 1) * 20 >= selected.evidence.length} onClick={() => change({ sourcePage: sourcePage + 1 })}>Next sources</button></div>}
      <details><summary>Exact retained finding and decision inputs</summary><pre>{JSON.stringify(JSON.parse(selected.original_finding_json), null, 2)}</pre></details>
    </section> : <>
      <div ref={scroll} className="bas-point-grid bas-review-grid" tabIndex={0} role="region" aria-label="Scrollable BAS findings" onScroll={e => change({ scroll: e.currentTarget.scrollTop })}>
        <table aria-label="Project BAS findings"><thead><tr><th scope="col">Finding</th><th scope="col">Affected item</th><th scope="col">Area</th><th scope="col">Severity</th><th scope="col">Evidence</th></tr></thead><tbody>
          {rows.slice(page * 50, (page + 1) * 50).map(i => <tr key={i.occurrence_id}><th scope="row"><button type="button" data-finding-id={i.occurrence_id} className="bas-review-title" onClick={() => change({ selectedId: i.occurrence_id, sourcePage: 0 })}>{i.title}</button></th><td>{i.subject.label}</td><td>{domains[i.domain]}</td><td>{human(i.severity)}{i.disposition === 'excluded' && <span> · excluded</span>}{i.dependency_status === 'stale_dependencies' && <span> · stale</span>}</td><td>{i.evidence.length} references</td></tr>)}
        </tbody></table>
      </div>
      {!rows.length && <p role="status">No findings match this filter. This is not a readiness or completeness decision.</p>}
      <div className="bas-point-controls"><button type="button" disabled={!page} onClick={() => change({ page: page - 1, scroll: 0 })}>Previous findings</button><span>{rows.length ? page * 50 + 1 : 0}–{Math.min(rows.length, (page + 1) * 50)} of {rows.length}</span><button type="button" disabled={(page + 1) * 50 >= rows.length} onClick={() => change({ page: page + 1, scroll: 0 })}>Next findings</button></div>
    </>}
  </section>;
}
