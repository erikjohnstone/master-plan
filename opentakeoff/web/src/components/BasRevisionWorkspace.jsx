// UI forms/navigation only. Shared revision services own every pairing check,
// source/quantity decision, replay and write. No browser quantity arithmetic.
import { useEffect, useMemo, useRef, useState } from 'react';
import { verifyBasWorkflow } from '../lib/basWorkflow.ts';
import { replayBasDrawingHistory } from '../lib/basDrawingRevision.ts';
import { defaultBasRevisionBasis } from '../lib/basRevisionBasis.ts';
import { canonicalBasJson } from '../lib/basCanonical.ts';
import { downloadText } from '../lib/totals.js';
import BasRevisionResults from './BasRevisionResults.jsx';
import './BasRevisionWorkspace.css';
const human = value => String(value).replaceAll('_', ' ');
const headFields = { sequence_head: ['SOO review', 'review_events'], equipment_head: ['Equipment review', 'equipment_events'],
  assembly_head: ['Assembly review', 'assembly_events'], engineering_head: ['Engineering review', 'engineering_events'],
  assignment_calculation_id: ['Assigned points calculation', 'assignment_calculations'], assembly_calculation_id: ['Assembly calculation', 'assembly_calculations'] };

export default function BasRevisionWorkspace({ workflow, state = {}, onStateChange, onOperation, onOpenCitation, onBack }) {
  const [checked, setChecked] = useState({ input: null, value: null, error: '' }), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const running = useRef(null), heading = useRef(null), latest = useRef(null);
  latest.current = { workflow, state };
  const change = patch => onStateChange(previous => ({ ...previous, ...patch }));
  useEffect(() => { heading.current?.focus(); return () => running.current?.abort(); }, []);
  useEffect(() => {
    let live = true;
    verifyBasWorkflow(workflow).then(value => { if (live) setChecked({ input: workflow, value, error: '' }); })
      .catch(e => { if (live) setChecked({ input: workflow, value: null, error: e.message }); });
    return () => { live = false; };
  }, [workflow]);
  const data = checked.input === workflow ? checked.value : null;
  const sets = useMemo(() => data ? [...replayBasDrawingHistory(data.captures, data.drawing_events).source_sets.values()] : [], [data]);
  const draft = state.draft, report = state.result?.report;
  const inputKey = draft ? canonicalBasJson(draft.comparison) : null;
  const reportFresh = !!draft && state.result?.kind === 'compare' && state.resultKey === inputKey
    && state.result.expected_head === (data?.revision_events?.at(-1)?.event_id ?? null);
  const history = [...(data?.revision_events || [])].reverse(), historyPage = state.historyPage || 0;
  const hasDecisions = draft && ['matches', 'removed', 'added', 'membership_reviews'].some(k => draft.comparison[k].length);
  const editComparison = update => {
    const comparison = structuredClone(draft.comparison); update(comparison);
    change({ draft: { ...draft, comparison }, notice: '', resultKey: null });
  };
  const start = () => {
    try {
      const before = defaultBasRevisionBasis(data, state.beforeSet || sets.at(-2)?.source_set_id || sets.at(-1).source_set_id);
      const after = defaultBasRevisionBasis(data, state.afterSet || sets.at(-1).source_set_id);
      change({ draft: { operation_id: crypto.randomUUID(), comparison: { before, after, matches: [], removed: [], added: [], membership_reviews: [] } },
        result: null, resultKey: null, eventId: null, name: '', reason: '', notice: '', view: {}, pairing: {} }); setError('');
    } catch (e) { setError(e.message); }
  };
  async function run(operation, label) {
    if (running.current) return;
    const controller = new AbortController(), snapshot = latest.current; running.current = controller; setBusy(label); setError('');
    try {
      const result = await onOperation(operation, { signal: controller.signal }); controller.signal.throwIfAborted();
      if (operation.kind !== 'record' && latest.current.workflow !== snapshot.workflow) throw new Error('The workspace changed. Run this comparison again; the draft is retained.');
      if (operation.kind === 'record') change({ draft: null, result, resultKey: null, eventId: result.event.event_id,
        notice: 'Comparison recorded. Project autosave retains its exact versions and reasons. This is not takeoff approval.' });
      else if (operation.kind === 'read') change({ draft: null, result, resultKey: null, eventId: result.event.event_id, view: {}, pairing: {}, notice: '' });
      else change({ result, resultKey: canonicalBasJson(operation.comparison), notice: '' });
    } catch (e) { if (!controller.signal.aborted) setError(e.message); }
    finally { if (running.current === controller) { running.current = null; setBusy(''); } }
  }
  async function source(ref) {
    setError('');
    try { const result = await onOpenCitation({ ...ref, value: ref.text, original_source_only: true }); if (result?.error) throw new Error(result.error); }
    catch (e) { setError(e.message); }
  }
  const sides = useMemo(() => ({ before: [...new Map((report?.rows || []).filter(r => r.before).map(r => [r.before.item_id, r.before])).values()],
    after: [...new Map((report?.rows || []).filter(r => r.after).map(r => [r.after.item_id, r.after])).values()] }), [report]);
  const pairing = state.pairing || {}, selectedBefore = sides.before.find(i => i.item_id === pairing.beforeId), selectedAfter = sides.after.find(i => i.item_id === pairing.afterId);
  const itemSourceLabel = item => {
    const capture = data?.captures.find(c => c.capture_id === item.capture_id), ref = item.source_refs[0];
    const name = capture?.sources.find(s => ref?.page_id.startsWith(`${s.source_id}:p`))?.names[0] || capture?.sources[0]?.names[0] || 'Unlocated source';
    return `${name}${ref ? ` · PDF page ${ref.page_id.split(':p').at(-1)}` : ''} · ${human(item.source_scope)} source set`;
  };
  const pair = action => {
    if (!pairing.reason?.trim()) return;
    editComparison(c => {
      if (action === 'match') c.matches.push({ before_item_id: selectedBefore.item_id, after_item_id: selectedAfter.item_id, reason: pairing.reason });
      else c[action].push({ item_id: action === 'removed' ? selectedBefore.item_id : selectedAfter.item_id, reason: pairing.reason });
    }); change({ pairing: { ...pairing, beforeId: '', afterId: '', reason: '' } });
  };
  const save = () => run({ kind: 'record', review: { operation_id: draft.operation_id, comparison: draft.comparison,
    expected_head: state.result.expected_head, expected_report_fingerprint: state.result.expected_report_fingerprint,
    name: state.name, reviewer: state.reviewer, reason: state.reason } }, 'Rechecking and saving comparison…');
  return <section className="bas-point-workspace bas-project-review bas-revision-workspace" aria-label="Requirements and quantities revision" aria-busy={!!busy}>
    <div className="bas-point-heading"><h2 ref={heading} tabIndex={-1}>Requirements &amp; quantities</h2><button type="button" onClick={onBack}>← Back to page review</button></div>
    <p className="bas-review-boundary">Compare retained evidence and declared quantities. Unknowns stay unknown; this is not installed verification, complete discovery or approval.</p>
    {!data ? <p role={checked.error ? 'alert' : 'status'}>{checked.error || 'Checking retained revision history…'}</p> : <>
      {!draft && <><div className="bas-point-controls">{['before', 'after'].map(side => <label key={side}>{side === 'before' ? 'Before source set' : 'After source set'}<select aria-label={side === 'before' ? 'Before source set' : 'After source set'} value={state[side + 'Set'] || (side === 'before' ? sets.at(-2)?.source_set_id : null) || sets.at(-1)?.source_set_id || ''} disabled={!!busy} onChange={e => change({ [side + 'Set']: e.target.value })}>{sets.map(s => <option key={s.source_set_id} value={s.source_set_id}>{s.name} · {s.source_set_id.slice(0, 8)}</option>)}</select></label>)}<button type="button" disabled={!!busy || !sets.length} onClick={start}>Start comparison</button></div>
        {!sets.length && <p>Record a complete source set in page review first. Unresolved page accounting cannot define a comparison side.</p>}</>}
      {draft && <>
        <details className="bas-revision-versions"><summary>Pinned versions — {sets.find(s => s.source_set_id === draft.comparison.before.source_set_id)?.name} → {sets.find(s => s.source_set_id === draft.comparison.after.source_set_id)?.name}</summary>
          <p>These are exact retained decisions, not a moving “latest” view. Mixed dependencies remain visible as stale. Clear pairing decisions before changing a selected version.</p>
          {hasDecisions && <button type="button" disabled={!!busy} onClick={() => editComparison(c => { c.matches = []; c.added = []; c.removed = []; c.membership_reviews = []; })}>Clear pairing decisions to change versions</button>}
          <div className="bas-revision-sides">{['before', 'after'].map(side => { const captures = draft.comparison[side].captures;
            const page = Math.max(0, Math.min(state.versionPages?.[side] || 0, Math.ceil(captures.length / 5) - 1));
            return <fieldset key={side}><legend>{side === 'before' ? 'Before versions' : 'After versions'}</legend>
            {captures.slice(page * 5, (page + 1) * 5).map(h => <details key={h.capture_id}><summary>{data.captures.find(c => c.capture_id === h.capture_id)?.sources[0].names[0]} · {h.capture_id.slice(0, 8)}</summary>
              {Object.entries(headFields).map(([field, [label, collection]]) => <label className="bas-sequence-select" key={field}>{label}<select aria-label={label} value={h[field] || ''} disabled={!!busy || hasDecisions} onChange={e => { editComparison(c => { c[side].captures.find(v => v.capture_id === h.capture_id)[field] = e.target.value || null; }); change({ result: null, resultKey: null }); }}><option value="">Not selected</option>{(data[collection] || []).filter(e => (e.capture_id || e.result.capture_id) === h.capture_id).map(e => <option key={e.event_id || e.calculation_id} value={e.event_id || e.calculation_id}>{e.created_at} · {(e.event_id || e.calculation_id).slice(0, 12)}</option>)}</select></label>)}
            </details>)}
            {captures.length > 5 && <div className="bas-point-controls"><button type="button" disabled={!page} onClick={() => change({ versionPages: { ...state.versionPages, [side]: page - 1 } })}>Previous {side} captures</button><span>{page * 5 + 1}–{Math.min((page + 1) * 5, captures.length)} of {captures.length}</span><button type="button" disabled={(page + 1) * 5 >= captures.length} onClick={() => change({ versionPages: { ...state.versionPages, [side]: page + 1 } })}>Next {side} captures</button></div>}
          </fieldset>; })}</div>
        </details>
        <div className="bas-point-controls"><button type="button" disabled={!!busy || !onOperation} onClick={() => run({ kind: 'compare', comparison: draft.comparison }, 'Comparing exact sources and replaying quantities…')}>Compare requirements and quantities</button><button type="button" disabled={!!busy} onClick={() => change({ draft: null, result: null, resultKey: null, notice: '', pairing: {} })}>Discard comparison draft</button></div>
      </>}
      {report && <>
        {draft && !reportFresh && <p role="status">Draft changed. The table shows the previous preview; compare again before saving.</p>}
        {state.result.report_verification === 'different_from_saved_report' && <p role="alert">This report differs from the saved review. It is not the previously reviewed result. Inspect the current evidence and create a new comparison; no approval is carried forward.</p>}
        {!draft && state.result.event && <p>{state.result.event.name} · {state.result.event.reviewer} (self-declared) · {human(state.result.event.origin)}<br />{state.result.event.reason}</p>}
        <div className="bas-point-controls"><span>{report.rows.length} compared / unresolved items</span><button type="button" onClick={() => downloadText('bas-revision-comparison.json', JSON.stringify({ comparison: state.result.comparison || state.result.event.comparison, report, event: state.result.event || null,
          report_verification: state.result.report_verification || 'unsaved_preview', approved: false }, null, 2), 'application/json')}>Export complete comparison</button></div>
        <BasRevisionResults report={report} state={state.view || {}} onChange={patch => change({ view: { ...state.view, ...patch } })} onSource={source} editable={!!draft && !busy}
          onMembershipReview={(row, q, reason) => editComparison(c => { c.membership_reviews = c.membership_reviews.filter(r => r.before_item_id !== row.before.item_id || r.after_item_id !== row.after.item_id || r.metric_key !== q.metric_key);
            c.membership_reviews.push({ before_item_id: row.before.item_id, after_item_id: row.after.item_id, metric_key: q.metric_key, reason }); })} />
        {draft && <details className="bas-revision-pairing"><summary>Review item correspondence · {draft.comparison.matches.length} pairs, {draft.comparison.removed.length} removals, {draft.comparison.added.length} additions</summary>
          <p>Only explicit one-to-one pairs are added here. Similar names, symbols or sheet positions do not establish identity. Shared validation rejects conflicting, cross-kind or foreign selections.</p>
          <div className="bas-point-controls"><label>Pairing item kind<select aria-label="Pairing item kind" value={pairing.kind || ''} disabled={!!busy} onChange={e => change({ pairing: { ...pairing, kind: e.target.value, beforePage: 0, afterPage: 0, beforeId: '', afterId: '' } })}><option value="">All kinds</option>{[...new Set([...sides.before, ...sides.after].map(i => i.kind))].map(k => <option key={k} value={k}>{human(k)}</option>)}</select></label><label>Correspondence reason<input value={pairing.reason || ''} disabled={!!busy} onChange={e => change({ pairing: { ...pairing, reason: e.target.value } })} /></label></div>
          <div className="bas-revision-sides">{['before', 'after'].map(side => { const chosen = pairing[side + 'Id'], search = pairing[side + 'Search'] || '';
            const available = sides[side].filter(i => (!pairing.kind || i.kind === pairing.kind) && i.label.toLowerCase().includes(search.toLowerCase()));
            const page = Math.max(0, Math.min(pairing[side + 'Page'] || 0, Math.ceil(available.length / 20) - 1));
            const used = id => side === 'before' ? draft.comparison.matches.some(m => m.before_item_id === id) || draft.comparison.removed.some(m => m.item_id === id) : draft.comparison.matches.some(m => m.after_item_id === id) || draft.comparison.added.some(m => m.item_id === id);
            return <fieldset key={side}><legend>{side === 'before' ? 'Before item' : 'After item'}</legend><label className="bas-sequence-select">Find {side} item<input disabled={!!busy} value={search} onChange={e => change({ pairing: { ...pairing, [side + 'Search']: e.target.value, [side + 'Page']: 0 } })} /></label>
              <div className="bas-revision-choices">{available.slice(page * 20, (page + 1) * 20).map(i => <label key={i.item_id} data-revision-item-id={i.item_id}><input type="radio" name={`revision-${side}`} disabled={!!busy || used(i.item_id)} checked={chosen === i.item_id} onChange={() => change({ pairing: { ...pairing, [side + 'Id']: i.item_id } })} /><span>{i.label}<small>{human(i.kind)}{used(i.item_id) ? ' · already decided' : ''}</small><small>{itemSourceLabel(i)}</small></span><button type="button" disabled={!i.source_refs.length} onClick={() => source(i.source_refs[0])}>Source</button></label>)}</div>
              <div className="bas-point-controls"><button type="button" disabled={!page} onClick={() => change({ pairing: { ...pairing, [side + 'Page']: page - 1 } })}>Previous {side} items</button><span>{available.length} items</span><button type="button" disabled={(page + 1) * 20 >= available.length} onClick={() => change({ pairing: { ...pairing, [side + 'Page']: page + 1 } })}>Next {side} items</button></div>
            </fieldset>; })}</div>
          <div className="bas-point-controls"><button type="button" disabled={!!busy || !selectedBefore || !selectedAfter || selectedBefore.kind !== selectedAfter.kind || !pairing.reason?.trim()} onClick={() => pair('match')}>Pair selected items</button><button type="button" disabled={!!busy || !selectedBefore || !pairing.reason?.trim()} onClick={() => pair('removed')}>Mark before item removed</button><button type="button" disabled={!!busy || !selectedAfter || !pairing.reason?.trim()} onClick={() => pair('added')}>Mark after item added</button></div>
          <details><summary>Recorded draft decisions — remove a decision to change it</summary>{['matches', 'removed', 'added', 'membership_reviews'].map(kind => {
            const decisions = draft.comparison[kind], page = Math.max(0, Math.min(state.decisionPages?.[kind] || 0, Math.ceil(decisions.length / 20) - 1));
            return <div key={kind}><h4>{human(kind)} · {decisions.length}</h4>{decisions.slice(page * 20, (page + 1) * 20).map((d, index) => { const i = page * 20 + index; return <p key={i}>{sides.before.find(s => s.item_id === (d.before_item_id || d.item_id))?.label || sides.after.find(s => s.item_id === (d.after_item_id || d.item_id))?.label} · {d.reason} <button type="button" disabled={!!busy} onClick={() => editComparison(c => { c[kind].splice(i, 1); })}>Remove {human(kind)} decision {i + 1}</button></p>; })}
              {decisions.length > 20 && <div className="bas-point-controls"><button type="button" disabled={!page} onClick={() => change({ decisionPages: { ...state.decisionPages, [kind]: page - 1 } })}>Previous {human(kind)} decisions</button><span>{page * 20 + 1}–{Math.min((page + 1) * 20, decisions.length)} of {decisions.length}</span><button type="button" disabled={(page + 1) * 20 >= decisions.length} onClick={() => change({ decisionPages: { ...state.decisionPages, [kind]: page + 1 } })}>Next {human(kind)} decisions</button></div>}
            </div>; })}</details>
        </details>}
      </>}
      {draft && <div className="bas-revision-save"><div className="bas-point-controls"><label>Comparison name<input disabled={!!busy} value={state.name || ''} onChange={e => change({ name: e.target.value })} /></label><label>Reviewer (self-declared)<input disabled={!!busy} value={state.reviewer || ''} onChange={e => change({ reviewer: e.target.value })} /></label></div><label className="bas-sequence-select">Comparison review reason<textarea aria-label="Comparison review reason" disabled={!!busy} value={state.reason || ''} onChange={e => change({ reason: e.target.value })} /></label><button type="button" disabled={!!busy || !reportFresh || !state.name?.trim() || !state.reviewer?.trim() || !state.reason?.trim()} onClick={save}>Save comparison review</button></div>}
      {!draft && <><h3>Comparison history · {history.length}</h3><div className="bas-point-grid"><table aria-label="Saved comparison history"><thead><tr><th scope="col">Comparison</th><th scope="col">Reviewer</th><th scope="col">Recorded</th><th scope="col">Review</th></tr></thead><tbody>{history.slice(historyPage * 20, (historyPage + 1) * 20).map(e => <tr key={e.event_id}><th scope="row">{e.name}</th><td>{e.reviewer}<small>{human(e.origin)} · self-declared</small></td><td>{e.created_at}</td><td><button type="button" disabled={!!busy} onClick={() => run({ kind: 'read', event_id: e.event_id }, 'Reopening pinned comparison and replaying quantities…')}>Reopen {e.name}</button></td></tr>)}</tbody></table></div>{history.length > 20 && <div className="bas-point-controls"><button type="button" disabled={!historyPage} onClick={() => change({ historyPage: historyPage - 1 })}>Previous comparisons</button><button type="button" disabled={(historyPage + 1) * 20 >= history.length} onClick={() => change({ historyPage: historyPage + 1 })}>Next comparisons</button></div>}</>}
    </>}
    {busy && <p role="status">{busy} <button type="button" onClick={() => { running.current?.abort(); change({ notice: 'Cancelled. No late result will be accepted.' }); }}>Cancel comparison operation</button></p>}
    {state.notice && <p role="status">{state.notice}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
