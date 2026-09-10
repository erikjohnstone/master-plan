// Presentation and interaction only. The shared service validates, records and
// replays every association; this component never derives quantities or IO.
import { useEffect, useMemo, useRef, useState } from 'react';
import { basReviewHead, basSequenceView } from '../lib/basReview.ts';
import { downloadText } from '../lib/totals.js';
import { ANN_SCHEMA } from '../lib/store.js';
import { basSequenceReviewSelection } from './basReviewNavigation.ts';
import BasSourceCoverage from './BasSourceCoverage.jsx';
import './BasPointsWorkspace.css';

export default function BasSequencesWorkspace({ workflow, capture, viewState, onViewStateChange, onOpenCitation, onReview }) {
  const [computed, setComputed] = useState({ input: null, value: null, error: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const proseScroll = useRef(null), workspace = useRef(null);
  useEffect(() => {
    let live = true;
    basSequenceView(workflow, capture.capture_id).then(value => {
      if (live) setComputed({ input: workflow, value, error: '' });
    }).catch(e => { if (live) setComputed({ input: workflow, value: null, error: e.message }); });
    return () => { live = false; };
  }, [workflow, capture.capture_id]);
  const change = patch => onViewStateChange({ ...viewState, ...patch });
  const head = basReviewHead(workflow, capture.capture_id);
  const draft = viewState?.sequenceDraft?.captureId === capture.capture_id ? viewState.sequenceDraft : {};
  const edit = patch => change({ sequenceDraft: { captureId: capture.capture_id, expectedHead: head, ...draft, ...patch } });
  const ready = computed.input === workflow;
  const result = ready ? computed.value : null;
  const regions = result?.sequences.regions || [];
  const target = viewState?.sequenceReviewTarget;
  const selection = useMemo(() => target && result && target.captureId === capture.capture_id
    ? basSequenceReviewSelection(result, target) : null, [target, result, capture.capture_id]);
  const coverage = selection?.kind === 'coverage' || (!target && viewState?.sequencePane === 'coverage');
  const region = target ? regions.find(r => r.region_id === selection?.regionId)
    : regions.find(r => r.region_id === viewState?.sequenceId) || regions.find(r => r.raw.status === 'body_detected') || regions[0];
  const references = useMemo(() => (capture.narrative_sources?.pages || []).flatMap(p => p.spans.map(s => ({ ...s, page_id: p.page_id, page_number: p.page_number }))), [capture]);
  const query = (draft.search || '').trim().toLowerCase();
  const found = useMemo(() => query.length < 2 ? [] : references.filter(s => s.text.toLowerCase().includes(query)), [references, query]);
  const selectedReference = references.find(s => s.span_id === draft.spanId);
  const comparisons = result?.comparisons.filter(c => c.association.region_id === region?.region_id) || [];
  const history = (workflow.review_events || []).filter(e => e.capture_id === capture.capture_id);
  useEffect(() => { if (ready && proseScroll.current) proseScroll.current.scrollTop = viewState?.sequenceScroll || 0; }, [ready, region?.region_id, viewState?.sequenceScroll]);
  useEffect(() => {
    if (ready && target && selection?.kind === 'sequence') {
      const element = workspace.current?.querySelector('[data-review-target="true"]');
      element?.focus({ preventScroll: true }); element?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }, [ready, target, selection]);

  async function source(pageId, span) {
    setError('');
    change({ sequenceScroll: proseScroll.current?.scrollTop || 0 });
    try {
      const response = await onOpenCitation?.({ page_id: pageId, sheet_id: pageId, bbox_px: span.bbox_px, value: span.text, kind: 'row' });
      if (response?.error) setError(response.error);
    } catch (e) { setError(e.message); }
  }
  async function apply(action) {
    setError(''); setNotice(''); setBusy(true);
    try {
      const updated = await onReview({ operation_id: crypto.randomUUID(), capture_id: capture.capture_id,
        expected_head: draft.expectedHead === undefined ? head : draft.expectedHead, action });
      edit({ expectedHead: basReviewHead(updated, capture.capture_id), reason: '', removeReason: '' });
      setNotice(action.kind === 'remove' ? 'Link removed. Its earlier evidence and history are preserved.' : 'Comparison link recorded. This does not approve quantities or establish installed equipment.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function submit(e) {
    e.preventDefault();
    apply({ kind: 'upsert', association: { region_id: region.region_id, matrix_id: draft.matrixId,
      reason: draft.reason, equipment_references: [{ tag: draft.tag, span_ids: [draft.spanId],
        scope: { building: draft.building?.trim() || null, level: draft.level?.trim() || null,
          system: draft.system?.trim() || null, phase: draft.phase?.trim() || null } }] } });
  }
  return <section ref={workspace} className="bas-point-workspace bas-sequence-workspace" aria-label="Sequences and comparison links">
    <div className="bas-point-heading"><button type="button" onClick={() => change({ mode: 'points' })}>← Point matrices</button>
      <h2>Sequences &amp; links</h2><button type="button" onClick={() => downloadText('bas-workflow.takeoff.json', JSON.stringify({ schema: ANN_SCHEMA, bas_workflow: workflow }, null, 2), 'application/json')}>Export BAS evidence &amp; history</button></div>
    <p className="bas-point-scope">Original drawing text and reviewed comparisons. Listed points are not installed quantities. Discovery, interpretation and applicability remain incomplete.</p>
    {!ready ? <p role="status">Reading retained sequence evidence…</p> : computed.error ? <p role="alert">{computed.error}</p> : <>
      <div className="bas-point-controls"><button type="button" aria-pressed={!coverage} onClick={() => change({ sequenceReviewTarget: null, sequencePane: 'reader' })}>Sequence reader</button>
        <button type="button" aria-pressed={coverage} onClick={() => change({ sequenceReviewTarget: null, sequencePane: 'coverage' })}>Source coverage</button></div>
      {target && !selection && <p role="alert">The exact finding target is no longer available in the active sequence view. No other clause or comparison has been substituted. Return to issue review for its original evidence.</p>}
      {coverage ? <BasSourceCoverage capture={capture} discovery={result.sequences.discovery} selectedPageId={selection?.pageId}
        state={viewState} onChange={patch => change({ sequencePane: 'coverage', ...patch })} onSource={source} /> : <>
      <label className="bas-sequence-select">Sequence<select aria-label="Sequence" value={region?.region_id || ''} onChange={e => change({ sequenceReviewTarget: null, sequenceId: e.target.value, sequenceScroll: 0 })}>
        {!region && <option value="">Requested sequence unavailable</option>}
        {regions.map(r => <option key={r.region_id} value={r.region_id}>{r.title} · PDF page {r.page_id.split(':p').at(-1)} · {r.raw.status.replaceAll('_', ' ')}</option>)}
      </select></label>
      {!region ? <p>{target ? 'Choose Sequence reader to browse other retained regions explicitly.' : 'No headed sequence region was discovered. Unheaded and unsupported source text is not established absent.'}</p> : <>
        <div className="bas-point-heading"><h3 tabIndex={-1} data-review-target={!!selection && !selection.clauseId && !selection.matrixId}>{region.title}</h3><span>{region.clauses.length} retained blocks · source boundary requires review</span>
          <button type="button" onClick={() => source(region.page_id, { bbox_px: region.raw.bbox_px, text: region.title })}>View sequence on drawing</button></div>
        <div className="bas-point-grid bas-sequence-prose" ref={proseScroll} tabIndex={0} role="region" aria-label="Original sequence text">
          <table aria-label="Source sequence clauses"><thead><tr><th>Clause</th><th>Original drawing text</th><th>Current interpretation</th><th>Evidence</th></tr></thead>
            <tbody>{region.clauses.map((c, i) => <tr key={c.clause_id} data-clause-id={c.clause_id} tabIndex={-1} data-selected={selection?.clauseId === c.clause_id}
              data-review-target={selection?.clauseId === c.clause_id && !selection?.matrixId}><th scope="row">{region.raw.blocks[i].marker || i + 1}{selection?.clauseId === c.clause_id && <p>Review target</p>}</th>
              <td>{c.reading_text !== null ? c.reading_text : <table aria-label="Original sequence inset"><tbody>{region.raw.blocks[i].rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell.text}</td>)}</tr>)}</tbody></table>}</td>
              <td>{c.requirements.length ? c.requirements.map(r => <div key={r.requirement_id}><strong>Monitor {r.variable}</strong>
                {r.operating_mode && <p>{r.operating_mode}</p>}<p>Monitoring clause only. Signal type and applicability require review.</p></div>) : 'Not interpreted — review original text'}</td>
              <td><button type="button" disabled={!c.source_spans.length} onClick={() => source(region.page_id, c.source_spans.find(s => s.text.length > 10) || c.source_spans[0])}>View source</button></td>
            </tr>)}</tbody></table>
        </div>
        <details className="bas-sequence-link-form" open={viewState?.linkFormOpen ?? !comparisons.length} onToggle={e => { if (e.target.open !== (viewState?.linkFormOpen ?? !comparisons.length)) change({ linkFormOpen: e.target.open }); }}>
          <summary>Link a point list and equipment reference</summary>
          <p>This records an explicit association, not per-unit replication or verified installation. Use original drawing evidence and explain the scope.</p>
          <form onSubmit={submit}>
            <div className="bas-point-controls"><label>Point matrix<select aria-label="Comparison point matrix" required value={draft.matrixId || ''} onChange={e => edit({ matrixId: e.target.value })}>
              <option value="">Select a point matrix</option>{capture.points.matrices.map(m => <option key={m.matrix_id} value={m.matrix_id}>{m.raw.title?.text || 'Point list'} · p.{m.page_id?.split(':p').at(-1)} · {m.rows[0]?.name || 'Unpopulated'}</option>)}
            </select></label><label>Find equipment reference<input aria-label="Find equipment reference" value={draft.search || ''} onChange={e => edit({ search: e.target.value })} placeholder="Search retained original drawing text" /></label></div>
            <label className="bas-sequence-select">Source reference<select aria-label="Equipment reference source" required value={draft.spanId || ''} onChange={e => edit({ spanId: e.target.value })}>
              <option value="">Select literal source evidence</option>{selectedReference && !found.slice(0, 200).some(s => s.span_id === selectedReference.span_id) && <option value={selectedReference.span_id}>{selectedReference.text} · p.{selectedReference.page_number}</option>}
              {found.slice(0, 200).map(s => <option key={s.span_id} value={s.span_id}>{s.text} · p.{s.page_number}</option>)}
            </select></label>
            {found.length > 200 && <p>{found.length} matching spans; showing the first 200. Narrow the search to see the rest.</p>}
            {selectedReference && <p className="bas-sequence-reference">{selectedReference.text} <button type="button" onClick={() => source(selectedReference.page_id, selectedReference)}>View reference on drawing</button></p>}
            <div className="bas-point-controls"><label>Reference tag<input aria-label="Reference tag" required value={draft.tag || ''} onChange={e => edit({ tag: e.target.value })} placeholder="Literal tag or group reference in the selected text" /></label>
              {['building', 'level', 'system', 'phase'].map(field => <label key={field}>{field[0].toUpperCase() + field.slice(1)}<input aria-label={`Reference ${field}`} value={draft[field] || ''} onChange={e => edit({ [field]: e.target.value })} placeholder="Unknown unless established" /></label>)}</div>
            <label className="bas-sequence-select">Association reason<textarea aria-label="Association reason" required value={draft.reason || ''} onChange={e => edit({ reason: e.target.value })} placeholder="Why does this sequence and matrix apply to this reference? Record exceptions or scope limits." /></label>
            <div className="bas-point-heading"><button type="submit" disabled={busy || !onReview || region.raw.status !== 'body_detected'}>{busy ? 'Recording…' : 'Save comparison link'}</button>
              {draft.expectedHead !== undefined && draft.expectedHead !== head && <button type="button" onClick={() => edit({ expectedHead: head })}>Use current review version</button>}</div>
          </form>
        </details>
        {!!comparisons.length && <section aria-label="Sequence point-list comparisons"><h3>Selected sequence comparisons</h3>
          <div className="bas-point-grid"><table aria-label="SOO and point-list comparison"><thead><tr><th>Monitoring requirement</th><th>Equipment reference</th><th>Listed row</th><th>Printed I/O</th><th>Comparison</th></tr></thead>
            <tbody>{comparisons.flatMap(c => c.requirements.map(r => <tr key={`${c.association.matrix_id}:${r.requirement.requirement_id}`} tabIndex={-1}
              data-matrix-id={c.association.matrix_id} data-requirement-id={r.requirement.requirement_id}
              data-selected={selection?.matrixId === c.association.matrix_id && selection?.requirementId === r.requirement.requirement_id}
              data-review-target={selection?.matrixId === c.association.matrix_id && selection?.requirementId === r.requirement.requirement_id}>
              <th scope="row">{r.requirement.variable}{r.requirement.operating_mode && <p>{r.requirement.operating_mode}</p>}</th>
              <td>{c.equipment_references.map(ref => ref.tag).join(' · ')}<p>{c.association.review_origin.replaceAll('_', ' ')}</p></td>
              <td>{r.listed_rows.length ? r.listed_rows.map(row => <button type="button" key={row.row_id} onClick={() => change({ mode: 'points', matrixId: c.association.matrix_id, rowId: row.row_id, filter: '' })}>{row.local_key} · {row.name}</button>) : 'No matching listed row'}</td>
              <td>{r.listed_rows.flatMap(row => row.observations.filter(o => o.kind === 'declared_io').map(o => `${o.channel} · ${o.value ?? 'ambiguous'}`)).join(', ') || 'Not established'}</td>
              <td>{({ listed: 'Listed — applicability and wiring unverified', not_listed_in_selected_matrix: 'Not listed in selected matrix', ambiguous_listed_rows: 'Multiple matching rows — review required', point_labels_unavailable: 'Point labels unavailable' })[r.status]}</td>
            </tr>))}</tbody></table></div>
          {comparisons.map(c => <div className="bas-sequence-association" key={c.association.matrix_id} tabIndex={-1} data-comparison-matrix={c.association.matrix_id}
            data-review-target={selection?.matrixId === c.association.matrix_id && !selection?.requirementId}>
            {selection?.matrixId === c.association.matrix_id && <p><strong>Selected comparison from issue review</strong></p>}
            <p><strong>{c.equipment_references.map(r => r.tag).join(' · ')}</strong> — {c.association.reason}</p>
            <p>{c.unpaired_point_row_ids.length} other matrix rows remain unpaired; they have not been removed or treated as unnecessary.</p>
            <label>Removal reason<input aria-label={`Removal reason for ${c.equipment_references.map(r => r.tag).join(' · ')}`} value={draft.removeReason || ''} onChange={e => edit({ removeReason: e.target.value })} /></label>
            <button type="button" disabled={busy || !draft.removeReason?.trim()} onClick={() => apply({ kind: 'remove', region_id: region.region_id, matrix_id: c.association.matrix_id, reason: draft.removeReason })}>Remove comparison link</button>
          </div>)}
        </section>}
      </>}
      </>}
      <details className="bas-point-disclosure"><summary>Review history · {history.length} events</summary>
        <p>Origins are local claims, not authenticated identities. Associations never approve a takeoff.</p>
        {history.map(event => <p key={event.event_id}>{event.created_at} · {event.origin.replaceAll('_', ' ')} · {event.action.kind} · {event.action.kind === 'upsert' ? event.action.association.reason : event.action.reason}</p>)}
      </details>
    </>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
