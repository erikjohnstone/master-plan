// Surface-specific selection/forms. All evidence interpretation, joins,
// comparison and transaction validation use the shared UI/MCP BAS services.
import { useEffect, useMemo, useRef, useState } from 'react';
import { activeBasCapture, verifyBasWorkflow } from '../lib/basWorkflow.ts';
import { basEquipmentHead, basEquipmentView } from '../lib/basEquipmentReview.ts';
import { validateBasEquipmentRegister } from '../lib/basEquipmentRegister.ts';
import { interpretBasSequences } from '../lib/basSequenceReconciliation.ts';
import { downloadText } from '../lib/totals.js';
import { ANN_SCHEMA } from '../lib/store.js';
import { equipmentPreviewReady } from './basEquipmentEditorState.ts';
import './BasPointsWorkspace.css';
import './BasEquipmentWorkspace.css';

const human = value => String(value || '').replaceAll('_', ' ');
const scopeLabel = scope => ['building', 'level', 'system', 'phase'].map(key => scope[key] || `${key} unknown`).join(' · ');
const memberKey = (occurrence_id, member) => JSON.stringify({ occurrence_id, member });
const toggle = (values = [], value) => values.includes(value) ? values.filter(v => v !== value) : [...values, value];
const comparisonLabel = status => ({ listed: 'Listed; wiring unverified', not_listed_in_selected_matrix: 'Not listed in selected matrix',
  ambiguous_listed_rows: 'Multiple matching rows', point_labels_unavailable: 'Point labels unavailable' })[status];

function DrawingReferences({ ids, spans, onSource, label, reason }) {
  return <details className="bas-point-disclosure"><summary>{label} · {ids.length} source references</summary>
    {reason && <p>Decision reason: {reason}</p>}
    {!ids.length && <p>No drawing-text references attached. This is a disclosed decision, not an extracted applicability fact.</p>}
    {ids.map(id => { const span = spans.find(s => s.span_id === id); return <p key={id}>{span?.text || 'Source unavailable'}{' '}
      <button type="button" disabled={!span?.page_id || !span?.bbox_px} onClick={() => onSource(span.page_id, span.bbox_px, span.text)}>View PDF page {span?.page_number}</button></p>; })}
  </details>;
}

export default function BasEquipmentWorkspace({ workflow, viewState, onViewStateChange, onOpenCitation, onReview }) {
  const [computed, setComputed] = useState({ input: null, value: null, error: '' });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [focusEditor, setFocusEditor] = useState(null);
  const grid = useRef(null), heading = useRef(null), editorHeading = useRef(null);
  const state = viewState?.equipment || {};
  const change = patch => onViewStateChange(previous => ({ ...previous, equipment: { ...previous?.equipment, ...patch } }));
  useEffect(() => {
    let live = true;
    (async () => {
      const verified = await verifyBasWorkflow(workflow), capture = activeBasCapture(verified);
      const view = capture?.equipment_sources ? await basEquipmentView(verified, capture.capture_id) : null;
      if (live) setComputed({ input: workflow, value: { verified, capture, view }, error: '' });
    })().catch(e => { if (live) setComputed({ input: workflow, value: null, error: e.message }); });
    return () => { live = false; };
  }, [workflow]);
  const ready = computed.input === workflow, data = ready ? computed.value : null;
  const { verified, capture, view } = data || {};
  const register = view?.register;
  const head = capture ? basEquipmentHead(verified, capture.capture_id) : null;
  const draft = state.draft;
  const stale = draft && (draft.captureId !== capture?.capture_id || draft.expectedHead !== head);
  const matrices = capture?.points.matrices || [];
  const regions = useMemo(() => capture?.narrative_sources ? interpretBasSequences(capture.narrative_sources).regions : [], [capture]);
  const spans = useMemo(() => (capture?.narrative_sources?.pages || []).flatMap(p => p.spans.map(s => ({ ...s, page_id: p.page_id, page_number: p.page_number }))), [capture]);
  const occurrences = useMemo(() => view?.candidates.tables.flatMap(t => t.rows.map(row => ({ ...row, table: t.raw, raw: t.raw.rows[row.row_index] }))) || [], [view]);
  const members = useMemo(() => occurrences.flatMap(row => (row.membership?.members || []).map(member => ({ key: memberKey(row.occurrence_id, member), member, row }))), [occurrences]);
  const sourceRow = occurrences.find(row => row.occurrence_id === state.sourceOccurrenceId);
  const equipment = register?.equipment.find(e => e.equipment_id === state.equipmentId);
  const selectedEquipmentId = equipment?.equipment_id;
  const scope = register?.scopes.find(s => s.scope_id === equipment?.scope_id);
  const assignments = view?.assignments.filter(a => a.equipment_ids.includes(equipment?.equipment_id)) || [];
  const needle = (state.filter || '').trim().toLowerCase();
  const rows = state.table === 'register' ? (register?.equipment || []).filter(e => !needle || `${e.tag} ${scopeLabel(register.scopes.find(s => s.scope_id === e.scope_id))}`.toLowerCase().includes(needle))
    : occurrences.filter(r => !needle || `${r.table.title?.text || ''} ${Object.values(r.raw.cells).map(c => c.text).join(' ')}`.toLowerCase().includes(needle));
  const page = Math.max(0, Math.min(state.page || 0, Math.ceil(rows.length / 50) - 1));
  const edit = patch => { setPreview(null); setError(''); change({ draft: { ...draft, ...patch } }); };
  const begin = (kind, values = {}) => {
    setError(''); setNotice(''); setPreview(null);
    const next = { kind, captureId: capture.capture_id, expectedHead: head, id: crypto.randomUUID(),
      reason: '', sourceIds: [], memberKeys: [], equipmentIds: [], excludedIds: [], sequenceIds: [], ...values };
    change({ draft: next }); setFocusEditor(`${kind}:${next.id}`);
  };
  useEffect(() => { if (ready && grid.current) grid.current.scrollTop = state.scroll || 0; }, [ready, state.scroll, state.table, page]);
  useEffect(() => { if (ready && selectedEquipmentId) heading.current?.focus(); }, [ready, selectedEquipmentId]);
  useEffect(() => {
    if (focusEditor && editorHeading.current) { editorHeading.current.focus(); setFocusEditor(null); }
  }, [focusEditor]);

  async function source(pageId, box, text) {
    setError(''); change({ scroll: grid.current?.scrollTop || state.scroll || 0 });
    try {
      if (!pageId || !box || !onOpenCitation) throw new Error('The original source location is unavailable.');
      const response = await onOpenCitation({ page_id: pageId, sheet_id: pageId, bbox_px: box, value: text, kind: 'row' });
      if (response?.error) setError(response.error);
    } catch (e) { setError(e.message); }
  }
  async function makePreview(event) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      if (stale) throw new Error('Evidence or equipment decisions changed. Discard this draft and review the current register.');
      const next = structuredClone(register), reason = draft.reason.trim();
      if (!reason) throw new Error('Record a reason for this decision.');
      const replace = (items, key, item) => [...items.filter(old => old[key] !== item[key]), item];
      if (draft.kind === 'scope') next.scopes = replace(next.scopes, 'scope_id', { scope_id: draft.id,
        building: draft.building?.trim() || null, level: draft.level?.trim() || null,
        system: draft.system?.trim() || null, phase: draft.phase?.trim() || null, source_span_ids: draft.sourceIds, reason });
      if (draft.kind === 'members') {
        if (!draft.memberKeys.length) throw new Error('Select at least one exact printed member.');
        next.equipment.push(...draft.memberKeys.map(key => { const binding = JSON.parse(key); return {
          equipment_id: crypto.randomUUID(), scope_id: draft.scopeId, tag: binding.member, bindings: [binding], reason }; }));
      }
      if (draft.kind === 'identity') {
        const old = next.equipment.find(e => e.equipment_id === draft.id);
        if (!old) throw new Error('This equipment identity is no longer available.');
        next.equipment = replace(next.equipment, 'equipment_id', { ...old, scope_id: draft.scopeId, reason,
          bindings: draft.memberKeys.map(key => JSON.parse(key)) });
      }
      if (draft.kind === 'assignment') next.assignments = replace(next.assignments, 'assignment_id', { assignment_id: draft.id,
        matrix_id: draft.matrixId, applicability: draft.applicability, equipment_ids: draft.equipmentIds,
        excluded_equipment_ids: draft.excludedIds, sequence_region_ids: draft.sequenceIds, source_span_ids: draft.sourceIds, reason });
      if (draft.kind === 'remove_assignment') next.assignments = next.assignments.filter(a => a.assignment_id !== draft.id);
      if (draft.kind === 'remove_equipment') next.equipment = next.equipment.filter(e => e.equipment_id !== draft.id);
      const validated = await validateBasEquipmentRegister(capture.narrative_sources, capture.equipment_sources, capture.points, next);
      setPreview({ input: draft, view: validated, request: { operation_id: crypto.randomUUID(), capture_id: capture.capture_id,
        expected_head: draft.expectedHead, reason, register: validated.register } });
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview || preview.input !== draft || stale) return;
    setBusy(true); setError('');
    try {
      await onReview(preview.request);
      change({ draft: null }); setPreview(null);
      setNotice('Decision recorded. Original evidence and earlier decisions are preserved. Installed quantities remain unverified.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!ready) return <p role="status" className="bas-point-message">Checking equipment evidence…</p>;
  if (computed.error) return <p role="alert" className="bas-point-message">{computed.error}</p>;
  if (!view) return <p className="bas-point-message">This saved capture has no retained equipment tables. Compile the original drawing set to add them; existing decisions have not been discarded.</p>;
  const bound = new Set(register.equipment.flatMap(e => e.bindings.map(b => memberKey(b.occurrence_id, b.member))));
  const memberNeedle = (draft?.memberSearch || '').trim().toLowerCase();
  const availableMembers = members.filter(m => m.row.page_id && !m.row.issues.includes('unowned_table_source')
    && (!bound.has(m.key) || draft?.memberKeys.includes(m.key)) && (!memberNeedle || `${m.member} ${m.row.table.title?.text}`.toLowerCase().includes(memberNeedle)));
  const sourceNeedle = (draft?.sourceSearch || '').trim().toLowerCase();
  const foundSpans = sourceNeedle.length >= 2 ? spans.filter(s => s.text.toLowerCase().includes(sourceNeedle)) : [];
  const previewReady = equipmentPreviewReady(preview, draft, Boolean(stale));
  const draftScope = draft?.kind === 'assignment' ? draft.scopeId : null;
  const previewAssignment = previewReady ? preview.view.assignments.find(a => a.assignment_id === draft.id) : null;
  return <section aria-label="Equipment and template assignments" className="bas-point-workspace bas-equipment-workspace">
    <div className="bas-point-heading"><h2 ref={heading} tabIndex={-1}>{equipment ? equipment.tag : 'Equipment'}</h2>
      <span>{equipment ? scopeLabel(scope) : `${register.equipment.length} registered · ${occurrences.length} source rows`}</span>
      <button type="button" onClick={() => downloadText('bas-equipment.takeoff.json', JSON.stringify({ schema: ANN_SCHEMA, bas_workflow: verified }, null, 2), 'application/json')}>Export evidence &amp; decisions</button>
    </div>
    {error && <p role="alert" className="bas-equipment-alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {equipment ? <>
      <div className="bas-point-controls"><button type="button" onClick={() => change({ equipmentId: null })}>← Back to equipment table</button>
        <button type="button" disabled={busy} onClick={() => begin('assignment', { scopeId: equipment.scope_id, equipmentIds: [equipment.equipment_id] })}>Assign point list</button>
        <button type="button" disabled={busy} onClick={() => begin('identity', { id: equipment.equipment_id, scopeId: equipment.scope_id, memberKeys: equipment.bindings.map(b => memberKey(b.occurrence_id, b.member)), reason: equipment.reason })}>Edit identity &amp; sources</button>
        <button type="button" disabled={busy} onClick={() => begin('remove_equipment', { id: equipment.equipment_id })}>Remove from register</button>
      </div>
      <div className="bas-point-scope"><span>Named scheduled equipment</span><span>Installed quantity: not established</span><span>Field wiring: not established</span></div>
      <p>Identity decision: {equipment.reason}</p>
      <DrawingReferences label="Scope evidence" ids={scope.source_span_ids} spans={spans} onSource={source} reason={scope.reason} />
      <section aria-label="Equipment source bindings" className="bas-point-grid"><table><thead><tr><th>Printed member</th><th>Schedule</th><th>Source</th></tr></thead><tbody>
        {equipment.bindings.map(b => { const row = occurrences.find(r => r.occurrence_id === b.occurrence_id); const cell = row?.raw.cells[row.mark_columns[0]];
          return <tr key={memberKey(b.occurrence_id, b.member)}><th scope="row">{b.member}</th><td>{row?.table.title?.text || 'Untitled schedule'}</td><td><button type="button" disabled={!row?.page_id || !cell?.bbox} onClick={() => source(row.page_id, cell.bbox, cell.text)}>View printed member</button></td></tr>; })}
      </tbody></table></section>
      {!assignments.length && <p>No point list has been assigned to this equipment.</p>}
      {assignments.map(a => { const matrix = matrices.find(m => m.matrix_id === a.matrix_id); return <section key={a.assignment_id} className="bas-point-detail" aria-label={`Assigned ${matrix?.raw.title?.text || 'point list'}`}>
        <div className="bas-point-heading"><h3>{matrix?.raw.title?.text || 'Untitled point list'}</h3><span>{a.applicability === 'system_once' ? 'Once for this system' : 'Per included equipment'}</span>
          <button type="button" onClick={() => begin('assignment', { id: a.assignment_id, scopeId: a.scope_id, matrixId: a.matrix_id, applicability: a.applicability,
            equipmentIds: a.equipment_ids, excludedIds: a.excluded_equipment_ids, sequenceIds: a.sequence_region_ids, sourceIds: a.source_span_ids, reason: a.reason })}>Edit assignment</button>
          <button type="button" onClick={() => begin('remove_assignment', { id: a.assignment_id })}>Withdraw assignment</button></div>
        <p>Assignment decision: {a.reason}</p>
        <DrawingReferences label="Assignment evidence" ids={a.source_span_ids} spans={spans} onSource={source} />
        <p>Included: {a.included_equipment_ids.map(id => register.equipment.find(e => e.equipment_id === id)?.tag).join(', ') || 'None; all explicitly excluded'}.</p>
        {!!a.excluded_equipment_ids.length && <p>Excluded from this template: {a.excluded_equipment_ids.map(id => register.equipment.find(e => e.equipment_id === id)?.tag).join(', ')}.</p>}
        <button type="button" onClick={() => onViewStateChange(previous => ({ ...previous, takeoffTab: 'points', mode: 'points', matrixId: a.matrix_id, filter: '' }))}>Read original point matrix</button>
        {a.sequence_comparisons.map(c => <div key={c.region_id}><h4>{regions.find(r => r.region_id === c.region_id)?.title || 'Sequence'}</h4>
          <button type="button" onClick={() => onViewStateChange(previous => ({ ...previous, takeoffTab: 'points', mode: 'sequences', sequenceId: c.region_id }))}>Read original sequence</button>
          <div className="bas-point-grid"><table aria-label="Equipment sequence coverage"><thead><tr><th>Supported requirement</th><th>Listed rows</th><th>Comparison</th></tr></thead><tbody>{c.requirements.map(r => <tr key={r.requirement.requirement_id}>
            <th scope="row">{r.requirement.variable}<DrawingReferences label="Requirement evidence" ids={r.source_spans.map(s => s.span_id)} spans={spans} onSource={source} /></th>
            <td>{r.listed_rows.length ? r.listed_rows.map(row => <button key={row.row_id} type="button" onClick={() => onViewStateChange(previous => ({ ...previous, takeoffTab: 'points', mode: 'points', matrixId: a.matrix_id, rowId: row.row_id, filter: '' }))}>{row.name}</button>) : '—'}</td><td>{comparisonLabel(r.status)}</td></tr>)}</tbody></table></div>
          {!c.requirements.length && <p>No supported requirements were interpreted in this region. This is not complete sequence coverage.</p>}
          <p>{c.unpaired_point_row_ids.length} other matrix rows remain unpaired and retained.</p></div>)}
        {!a.sequence_region_ids.length && <p>No sequence has been explicitly linked to this assignment.</p>}
      </section>; })}
    </> : <>
      <div className="bas-point-controls"><label>View<select aria-label="Equipment table view" value={state.table || 'sources'} onChange={e => change({ table: e.target.value, page: 0, scroll: 0 })}><option value="sources">Source schedule rows</option><option value="register">Scoped equipment register</option></select></label>
        <label>Find equipment<input value={state.filter || ''} onChange={e => change({ filter: e.target.value, page: 0, scroll: 0 })} /></label>
        <button type="button" onClick={() => begin('scope')}>Create scope</button>
        <button type="button" disabled={!register.scopes.length} onClick={() => begin('members')}>Register printed members</button>
      </div>
      <div className="bas-point-grid" ref={grid} tabIndex={0} role="region" aria-label="Scrollable equipment table" onScroll={e => change({ scroll: e.currentTarget.scrollTop })}>
        <table aria-label="Equipment table"><thead><tr>{(state.table === 'register' ? ['Equipment', 'Explicit scope', 'Sources', 'Assignments'] : ['Printed designation', 'Schedule', 'Named members', 'Printed quantity', 'Review', 'Source']).map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.slice(page * 50, (page + 1) * 50).map(row => state.table === 'register' ? <tr key={row.equipment_id}>
            <th scope="row"><button type="button" onClick={() => change({ equipmentId: row.equipment_id })}>{row.tag}</button></th><td>{scopeLabel(register.scopes.find(s => s.scope_id === row.scope_id))}</td><td>{row.bindings.length} bound rows</td><td>{view.assignments.filter(a => a.included_equipment_ids.includes(row.equipment_id)).length}</td>
          </tr> : <tr key={row.occurrence_id}><th scope="row">{row.mark_columns.map(h => row.raw.cells[h]?.text).filter(Boolean).join(' · ') || 'Unresolved designation'}</th>
            <td>{row.table.title?.text || 'Untitled schedule'}</td><td>{row.named_member_count ?? 'Unknown'}</td><td>{row.printed_quantity?.raw ?? 'Not printed'}</td>
            <td>{row.issues.map(human).join('; ') || 'Scope and installation not established'}</td><td><button type="button" onClick={() => change({ sourceOccurrenceId: row.occurrence_id })}>Read source cells</button>
              <button type="button" disabled={!row.page_id || !Object.values(row.raw.cells).some(c => c.bbox)} onClick={() => { const cell = row.raw.cells[row.mark_columns[0]] || Object.values(row.raw.cells).find(c => c.bbox); return source(row.page_id, cell.bbox, cell.text); }}>View row</button></td></tr>)}</tbody>
        </table>
      </div>
      {!rows.length && <p>No matching {state.table === 'register' ? 'registered equipment' : 'source rows'}. Discovery does not prove the drawings contain no equipment.</p>}
      {rows.length > 50 && <nav aria-label="Equipment table pages" className="bas-point-controls"><button disabled={!page} onClick={() => change({ page: page - 1, scroll: 0 })}>Previous rows</button><span>Rows {page * 50 + 1}–{Math.min(rows.length, (page + 1) * 50)} of {rows.length}</span><button disabled={(page + 1) * 50 >= rows.length} onClick={() => change({ page: page + 1, scroll: 0 })}>Next rows</button></nav>}
      {sourceRow && <section aria-label="Original equipment source cells" className="bas-point-detail"><div className="bas-point-heading"><h3>{sourceRow.table.title?.text || 'Untitled schedule'} · source row {sourceRow.row_index + 1}</h3><button type="button" onClick={() => change({ sourceOccurrenceId: null })}>Close source cells</button></div>
        <p>Original extracted cells; no correction or assignment rewrites these values. Select a value to inspect the original PDF.</p>
        <div className="bas-point-grid" role="region" tabIndex={0} aria-label="Scrollable original equipment row"><table aria-label="Original equipment row"><thead><tr>{sourceRow.table.headers.map((h, index) => <th key={index}>{h}</th>)}</tr></thead><tbody><tr>
          {sourceRow.table.headers.map((h, index) => { const cell = sourceRow.raw.cells[h]; return <td key={index}>{cell ? <button type="button" className="bas-point-cell" disabled={!sourceRow.page_id || !cell.bbox} onClick={() => source(sourceRow.page_id, cell.bbox, cell.text)}>{cell.text || '(explicit blank)'}</button> : <span title="No cell supplied by extraction">Not observed</span>}</td>; })}
        </tr></tbody></table></div>
      </section>}
      <details className="bas-point-disclosure"><summary>Scopes · {register.scopes.length}</summary>{register.scopes.map(s => <p key={s.scope_id}>{scopeLabel(s)} <button type="button" onClick={() => begin('scope', { id: s.scope_id, ...s, sourceIds: s.source_span_ids })}>Edit scope</button></p>)}</details>
    </>}
    {draft && <section className="bas-point-detail" aria-label="Equipment decision editor">
      <div className="bas-point-heading"><h3 ref={editorHeading} tabIndex={-1}>{({ scope: 'Establish scope', members: 'Register printed members', identity: 'Equipment identity and source bindings', assignment: 'Assign a point list', remove_assignment: 'Withdraw assignment', remove_equipment: 'Remove equipment identity' })[draft.kind]}</h3>
        <button type="button" disabled={busy} onClick={() => { change({ draft: null }); setPreview(null); setError(''); }}>Discard draft</button></div>
      {stale && <p role="alert">This draft is based on earlier evidence or decisions. Discard it and review the current register before editing.</p>}
      <form onSubmit={makePreview}><fieldset disabled={busy || stale} className="bas-equipment-fields">
        {draft.kind === 'scope' && <div className="bas-point-controls">{['building', 'level', 'system', 'phase'].map(field => <label key={field}>{field[0].toUpperCase() + field.slice(1)}<input value={draft[field] || ''} onChange={e => edit({ [field]: e.target.value })} placeholder="Unknown unless established" /></label>)}</div>}
        {['members', 'identity', 'assignment'].includes(draft.kind) && <label className="bas-sequence-select">Equipment scope<select required aria-label="Equipment scope" value={draft.scopeId || ''} onChange={e => edit({ scopeId: e.target.value, ...(draft.kind === 'assignment' ? { equipmentIds: [], excludedIds: [] } : {}) })}>
          <option value="">Choose an explicit scope</option>{register.scopes.map(s => <option key={s.scope_id} value={s.scope_id}>{scopeLabel(s)}</option>)}</select></label>}
        {['members', 'identity'].includes(draft.kind) && <>
          <label className="bas-sequence-select">Find printed members<input value={draft.memberSearch || ''} onChange={e => edit({ memberSearch: e.target.value })} /></label>
          <div className="bas-equipment-options" role="group" aria-label="Printed members">{availableMembers.slice(0, 100).map(m => <label key={m.key}><input type="checkbox" aria-label={`Register ${m.member} from ${m.row.table.title?.text || 'Untitled schedule'} row ${m.row.row_index + 1}`} checked={draft.memberKeys.includes(m.key)} onChange={() => edit({ memberKeys: toggle(draft.memberKeys, m.key) })} /><span>{m.member}<small>{m.row.table.title?.text || 'Untitled schedule'} · source row {m.row.row_index + 1}</small></span></label>)}</div>
          <p>{draft.memberKeys.length} selected. {availableMembers.length > 100 ? 'Showing 100 matches; narrow the search. Hidden selections remain selected.' : 'Previously bound members cannot create a second identity.'}</p>
          {!!draft.memberKeys.length && <details><summary>All selected source members</summary>{draft.memberKeys.map(key => <p key={key}>{JSON.parse(key).member} <button type="button" onClick={() => edit({ memberKeys: draft.memberKeys.filter(k => k !== key) })}>Unselect</button></p>)}</details>}
        </>}
        {draft.kind === 'assignment' && <>
          <div className="bas-point-controls"><label>Point matrix<select required aria-label="Assignment point matrix" value={draft.matrixId || ''} onChange={e => edit({ matrixId: e.target.value })}><option value="">Choose a matrix</option>{matrices.map(m => <option key={m.matrix_id} value={m.matrix_id}>{m.raw.title?.text || 'Untitled matrix'} · PDF p.{m.page_id?.split(':p').at(-1)}</option>)}</select></label>
            <label>Applicability<select required aria-label="Applicability" value={draft.applicability || ''} onChange={e => edit({ applicability: e.target.value })}><option value="">Establish applicability</option><option value="per_equipment">Per included equipment</option><option value="system_once">Once for this system</option></select></label></div>
          <div className="bas-point-grid"><table aria-label="Assignment membership"><thead><tr><th>Equipment</th><th>Selected</th><th>Explicit exception</th></tr></thead><tbody>{register.equipment.filter(e => e.scope_id === draftScope).map(e => <tr key={e.equipment_id}><th scope="row">{e.tag}</th>
            <td><input type="checkbox" aria-label={`Select ${e.tag}`} checked={draft.equipmentIds.includes(e.equipment_id)} onChange={() => edit({ equipmentIds: toggle(draft.equipmentIds, e.equipment_id), excludedIds: draft.excludedIds.filter(id => id !== e.equipment_id) })} /></td>
            <td><input type="checkbox" aria-label={`Exclude ${e.tag}`} disabled={!draft.equipmentIds.includes(e.equipment_id)} checked={draft.excludedIds.includes(e.equipment_id)} onChange={() => edit({ excludedIds: toggle(draft.excludedIds, e.equipment_id) })} /></td></tr>)}</tbody></table></div>
          <details><summary>Link sequence regions · {draft.sequenceIds.length}</summary><div className="bas-equipment-options">{regions.map(r => <label key={r.region_id}><input type="checkbox" disabled={r.raw.status !== 'body_detected'} checked={draft.sequenceIds.includes(r.region_id)} onChange={() => edit({ sequenceIds: toggle(draft.sequenceIds, r.region_id) })} /><span>{r.title}<small>PDF p.{r.page_id.split(':p').at(-1)} · {human(r.raw.status)}</small></span></label>)}</div></details>
        </>}
        {['scope', 'assignment'].includes(draft.kind) && <details><summary>Drawing references · {draft.sourceIds.length} selected</summary>
          <label className="bas-sequence-select">Find drawing text<input value={draft.sourceSearch || ''} onChange={e => edit({ sourceSearch: e.target.value })} placeholder="At least two characters" /></label>
          <div className="bas-equipment-options">{foundSpans.slice(0, 100).map(s => <label key={s.span_id}><input type="checkbox" checked={draft.sourceIds.includes(s.span_id)} onChange={() => edit({ sourceIds: toggle(draft.sourceIds, s.span_id) })} /><span>{s.text}<small>PDF p.{s.page_number}</small></span></label>)}</div>
          {foundSpans.length > 100 && <p>Showing 100 matches. Narrow the search; selected evidence is retained.</p>}
          {draft.sourceIds.map(id => { const s = spans.find(span => span.span_id === id); return <p key={id}>{s?.text}<button type="button" onClick={() => source(s?.page_id, s?.bbox_px, s?.text)}>View reference</button><button type="button" onClick={() => edit({ sourceIds: draft.sourceIds.filter(i => i !== id) })}>Remove reference</button></p>; })}
        </details>}
        {draft.kind === 'remove_equipment' && <p>Update or withdraw assignments referencing this identity first. Removing the identity never removes its original schedule evidence.</p>}
        <label className="bas-sequence-select">Decision reason<textarea required aria-label="Equipment decision reason" value={draft.reason || ''} onChange={e => edit({ reason: e.target.value })} placeholder="State the evidence, scope and exceptions, or disclose your manual decision." /></label>
        <button type="submit">{busy ? 'Checking…' : 'Preview decision'}</button>
      </fieldset></form>
      {previewReady && <section className="bas-equipment-preview" aria-label="Validated equipment preview"><h4>Validated decision preview</h4>
        <p>{preview.request.reason}</p>
        {draft.kind === 'scope' && <p>{scopeLabel(preview.view.register.scopes.find(s => s.scope_id === draft.id))}</p>}
        {['members', 'identity'].includes(draft.kind) && <p>Exact source members: {draft.memberKeys.map(key => JSON.parse(key).member).join(', ')}. Scope: {scopeLabel(register.scopes.find(s => s.scope_id === draft.scopeId))}.</p>}
        {previewAssignment && <><p>{matrices.find(m => m.matrix_id === previewAssignment.matrix_id)?.raw.title?.text} · {previewAssignment.applicability === 'system_once' ? 'Once for this system' : 'Per included equipment'}.</p>
          <p>Included: {previewAssignment.included_equipment_ids.map(id => register.equipment.find(e => e.equipment_id === id)?.tag).join(', ') || 'None'}.</p>
          <p>Excluded: {previewAssignment.excluded_equipment_ids.map(id => register.equipment.find(e => e.equipment_id === id)?.tag).join(', ') || 'None'}. Linked sequence regions: {previewAssignment.sequence_region_ids.length}.</p></>}
        <p>This records applicability and named scheduled membership. It does not calculate assignment-driven point totals or establish installation.</p>
        <details><summary>Register review findings · {preview.view.issues.length}</summary>{preview.view.issues.map((issue, index) => <p key={index}>{human(issue.code)}</p>)}</details>
        <button type="button" disabled={busy || !onReview} onClick={save}>{busy ? 'Recording…' : 'Record decision'}</button>
      </section>}
    </section>}
    <details className="bas-point-disclosure"><summary>Coverage &amp; decision history</summary><p>Only discovered equipment schedules are represented. Explicit assignments are local operator decisions or Agent proposals, not authenticated approvals. JSON export retains evidence and decisions, not original PDF bytes.</p>
      {view.issues.map((issue, index) => <p key={index}>{human(issue.code)}</p>)}
      {(verified.equipment_events || []).filter(e => e.capture_id === capture.capture_id).map(event => <p key={event.event_id}>{event.created_at} · {human(event.origin)} · {event.reason}</p>)}
    </details>
  </section>;
}
