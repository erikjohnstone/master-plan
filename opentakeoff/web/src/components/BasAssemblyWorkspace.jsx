// Presentation/forms only. Shared services own source interpretation, identity,
// responsibilities and history; Python owns all quantity multiplication.
import { useEffect, useMemo, useRef, useState } from 'react';
import { activeBasCapture, verifyBasWorkflow } from '../lib/basWorkflow.ts';
import { basAssemblyView, basAssemblyHead, basAssemblyCalculationState } from '../lib/basAssemblyReview.ts';
import { basEquipmentHead, basEquipmentRegister } from '../lib/basEquipmentReview.ts';
import { validateBasAssemblyRegister, emptyBasAssemblyRegister } from '../lib/basAssemblyRegister.ts';
import { interpretBasComponentRequirements } from '../lib/basComponentRequirements.ts';
import { assemblyPreviewReady, stageAssemblyComponent, stageAssemblyWithdrawal } from './basAssemblyEditorState.ts';
import './BasAssemblyWorkspace.css';

const human = value => String(value ?? '').replaceAll('_', ' ');
const toggle = (ids, id) => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
const kinds = ['variable_frequency_drive', 'onboard_controller', 'terminal_equipment_controller', 'controller', 'sensor',
  'valve', 'damper_actuator', 'damper', 'relay', 'power_supply', 'accessory', 'other_physical'];
const activities = ['furnish', 'install', 'wire', 'program', 'test'];

function Evidence({ ids, spans, onSource }) {
  return <div className="bas-assembly-evidence">{ids.map(id => { const span = spans.find(s => s.span_id === id);
    return <p key={id}>{span?.text || 'Original source unavailable'}{' '}<button type="button" disabled={!span} onClick={() => onSource(span.page_id, span.bbox_px, span.text)}>View PDF p.{span?.page_number}</button></p>; })}</div>;
}

function Responsibilities({ values }) {
  return <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Scrollable responsibility decisions"><table aria-label="Assembly responsibilities">
    <thead><tr><th>Activity</th><th>Responsibility</th><th>Basis</th></tr></thead><tbody>{values.map(v => <tr key={v.activity}>
      <th scope="row">{human(v.activity)}</th><td>{v.party || human(v.assignment)}</td><td>{human(v.status)}
        {v.claims.map(c => <p key={c.claim_id}>{human(c.origin)}: {c.party || human(c.assignment)} · {c.reason}</p>)}
        {v.resolution && <p>Resolution: {v.resolution.reason}</p>}</td></tr>)}</tbody></table></div>;
}

export default function BasAssemblyWorkspace({ workflow, equipmentId, state = {}, onStateChange, onSource, onReview, onCalculate }) {
  const [computed, setComputed] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [preview, setPreview] = useState(null);
  const heading = useRef(null), editor = useRef(null), needsFocus = useRef(false);
  const change = patch => onStateChange(previous => ({ ...previous, ...patch }));
  useEffect(() => {
    let live = true;
    (async () => {
      const verified = await verifyBasWorkflow(workflow), capture = activeBasCapture(verified);
      const view = await basAssemblyView(verified, capture.capture_id);
      if (live) setComputed({ input: workflow, verified, capture, view });
    })().catch(e => { if (live) setComputed({ input: workflow, error: e.message }); });
    return () => { live = false; };
  }, [workflow]);
  const ready = computed?.input === workflow, data = ready && !computed.error ? computed : null;
  const { verified, capture, view } = data || {};
  const equipment = useMemo(() => capture ? basEquipmentRegister(verified, capture.capture_id) : null, [verified, capture]);
  const currentEquipment = equipment?.equipment.find(e => e.equipment_id === equipmentId);
  const historicalEquipment = verified?.equipment_events?.find(e => e.event_id === view?.equipment_head)?.register;
  const currentHead = capture ? basEquipmentHead(verified, capture.capture_id) : null;
  const assemblyHead = capture ? basAssemblyHead(verified, capture.capture_id) : null;
  const calculation = capture ? basAssemblyCalculationState(verified, capture.capture_id) : null;
  const spans = useMemo(() => capture?.narrative_sources.pages.flatMap(p => p.spans.map(s => ({ ...s, page_id: p.page_id, page_number: p.page_number }))) || [], [capture]);
  const declarations = useMemo(() => capture ? interpretBasComponentRequirements(capture.narrative_sources).clauses.flatMap(clause => clause.components.map(component => ({ clause, component }))) : [], [capture]);
  const draft = state.draft, record = draft?.record, batch = state.batch;
  const stale = [draft, batch].some(value => value && (value.captureId !== capture?.capture_id || value.equipmentHead !== currentHead || value.assemblyHead !== assemblyHead));
  const selected = view?.components.find(c => c.record.component_id === state.componentId);
  const rows = view?.components.filter(c => !equipmentId || state.showAll || c.record.equipment_ids.includes(equipmentId)) || [];
  const previewReady = assemblyPreviewReady(preview, draft, batch, stale) && ready;
  const previewComponent = preview?.view.components.find(c => c.record.component_id === record?.component_id);
  const needle = (state.candidateSearch || '').trim().toLowerCase();
  const matches = declarations.filter(d => !needle || `${d.component.subject_label} ${human(d.component.component_kind)} ${d.component.fan_role || ''} ${d.clause.reading_text}`.toLowerCase().includes(needle));
  const candidatePage = Math.max(0, Math.min(state.candidatePage || 0, Math.ceil(matches.length / 50) - 1));
  const rowPage = Math.max(0, Math.min(state.rowPage || 0, Math.ceil(rows.length / 50) - 1));
  const sourceNeedle = (state.sourceSearch || '').trim().toLowerCase();
  const sourceMatches = sourceNeedle.length >= 2 ? spans.filter(s => s.text.toLowerCase().includes(sourceNeedle)) : [];
  const scopedMembers = equipment?.equipment.filter(e => e.scope_id === record?.scope_id) || [];
  const memberPage = Math.max(0, Math.min(state.memberPage || 0, Math.ceil(scopedMembers.length / 50) - 1));
  useEffect(() => { if (ready) heading.current?.focus(); }, [equipmentId, ready]);
  useEffect(() => { if (needsFocus.current && editor.current) { editor.current.focus(); needsFocus.current = false; } });
  const edit = patch => { setError(''); change({ draft: { ...draft, record: { ...record, ...patch } } }); };
  const editQuantity = patch => edit({ quantity: { ...record.quantity, ...patch } });
  const editCondition = patch => edit({ condition: { ...record.condition, ...patch } });
  function begin(declaration, existing) {
    if ((!existing && !currentEquipment) || !currentHead || stale) return;
    if (existing && batch) existing = batch.register.components.find(c => c.component_id === existing.component_id);
    if (!existing && !currentEquipment) return;
    const component = declaration?.component;
    const next = existing ? structuredClone(existing) : {
      component_id: crypto.randomUUID(), scope_id: currentEquipment.scope_id, equipment_ids: [equipmentId], excluded_equipment_ids: [], member_exclusion_reason: null,
      label: component ? `${component.fan_role ? `${component.fan_role} ` : ''}${human(component.component_kind)}` : '', component_kind: component?.component_kind || 'other_physical',
      source_requirement_ids: component ? [component.requirement_id] : [], source_span_ids: [],
      quantity: { value: component?.declared_quantity ?? null, basis: '', origin: component ? 'source_declaration' : 'explicit_decision', reason: '' },
      lifecycle: 'unknown', disposition: 'included', exclusion_reason: null,
      condition: { status: 'unresolved', statement: 'Applicability condition not yet reviewed', source_span_ids: [], reason: '' },
      responsibility_claims: [], responsibility_resolutions: [], reason: '',
    };
    change({ draft: { captureId: capture.capture_id, equipmentHead: currentHead, assemblyHead, record: next }, showCandidates: false, memberPage: 0 });
    setPreview(null); setError(''); setNotice(''); needsFocus.current = true;
  }
  function stage(register, componentId, reason, action) {
    change({ batch: { captureId: capture.capture_id, equipmentHead: currentHead, assemblyHead, register,
      reason: batch?.reason || '', changes: [...(batch?.changes || []), { componentId, reason, action }] }, draft: null, withdrawal: null });
    setPreview(null); setNotice('Change staged, not saved or fully validated. Repair other records, then preview and save the complete assembly.');
  }
  async function check(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (stale) throw new Error('Evidence or decisions changed. Discard this draft and review the current assembly.');
      const next = stageAssemblyComponent(batch?.register || view?.register || emptyBasAssemblyRegister(), record);
      if (event.nativeEvent.submitter?.value === 'stage') { stage(next, record.component_id, record.reason, 'edit'); return; }
      const validated = await validateBasAssemblyRegister(capture.narrative_sources, capture.equipment_sources, capture.points, equipment, next);
      setPreview({ input: draft, batch, view: validated, request: { operation_id: crypto.randomUUID(), capture_id: capture.capture_id,
        expected_head: draft.assemblyHead, expected_equipment_head: draft.equipmentHead, reason: batch ? batchReason(record.reason) : record.reason, register: validated.register } });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function batchReason(extra) {
    if (!batch?.reason.trim()) throw new Error('Record an overall reason for the pending assembly changes.');
    // Each withdrawn component's reason must survive the saved event too.
    return [batch.reason, ...batch.changes.map(c => `${c.action} ${c.componentId}: ${c.reason}`), extra].filter(Boolean).join('\n');
  }
  async function checkBatch() {
    setBusy(true); setError('');
    try {
      if (stale || draft) throw new Error('Finish the current draft and review current evidence before saving pending changes.');
      const reason = batchReason();
      const validated = await validateBasAssemblyRegister(capture.narrative_sources, capture.equipment_sources, capture.points, equipment, batch.register);
      setPreview({ input: draft, batch, view: validated, request: { operation_id: crypto.randomUUID(), capture_id: capture.capture_id,
        expected_head: batch.assemblyHead, expected_equipment_head: batch.equipmentHead, reason, register: validated.register } });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function save() {
    if (!previewReady) return;
    setBusy(true); setError('');
    try { await onReview(preview.request); change({ draft: null, batch: null, componentId: record?.component_id || null }); setPreview(null); setNotice('Assembly decision saved. Earlier evidence and calculations remain retained.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function calculate() {
    setBusy(true); setError(''); setNotice('');
    try { await onCalculate({ capture_id: capture.capture_id, expected_equipment_head: currentHead, expected_assembly_head: assemblyHead });
      setNotice('Declared assembly quantities saved. These are not verified installed counts.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!ready) return <p role="status">Checking assembly evidence…</p>;
  if (computed.error) return <p role="alert">{computed.error}</p>;
  const canCalculate = !!assemblyHead && view.dependency_status === 'current_dependencies';
  return <section className="bas-assembly-workspace" aria-label="Assembly and responsibilities">
    <div className="bas-point-heading"><h3 ref={heading} tabIndex={-1}>Assembly &amp; responsibilities</h3><span>Declared components · installation unverified</span></div>
    <div className="bas-point-controls"><button type="button" disabled={busy || !!draft || stale || !currentEquipment || !currentHead} onClick={() => change({ showCandidates: !state.showCandidates })}>Add from drawing declarations</button>
      <button type="button" disabled={busy || !!draft || stale || !currentEquipment || !currentHead} onClick={() => begin()}>Add explicit component</button>
      <button type="button" disabled={busy || !!draft || !!batch || !canCalculate || !onCalculate} onClick={calculate}>Calculate assembly quantities</button>
      {equipmentId && <label><input type="checkbox" checked={!!state.showAll} onChange={e => change({ showAll: e.target.checked, rowPage: 0 })} /> Show all equipment assemblies</label>}</div>
    {error && <p role="alert" className="bas-equipment-alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {view.dependency_status === 'stale_dependencies' && <p role="alert">Equipment decisions changed. Retained assemblies remain visible, but must be reviewed against the current equipment before recalculation. Edit a component and explicitly review the complete preview.</p>}
    {calculation?.status === 'stale_dependencies' && <p role="status">Saved quantities use earlier decisions. Review and recalculate; the old result has not been discarded.</p>}
    {batch && <section className="bas-point-detail" aria-label="Pending assembly changes"><div className="bas-point-heading"><h4>Pending assembly changes · not saved</h4>
      <button type="button" disabled={busy} onClick={() => { change({ batch: null, draft: null, withdrawal: null }); setPreview(null); setError(''); }}>Discard all pending changes</button></div>
      <p>Stage each needed repair, then validate and save the complete register. Previously saved evidence remains unchanged.</p>
      {stale && <p role="alert">Evidence or decisions changed after these edits began. Discard the pending changes and review the current records.</p>}
      <label className="bas-sequence-select">Overall assembly change reason<textarea disabled={busy || stale} value={batch.reason} onChange={e => change({ batch: { ...batch, reason: e.target.value } })} /></label>
      <details><summary>Staged changes · {batch.changes.length}</summary>{batch.changes.map((c, i) => <p key={i}>{human(c.action)} · {c.componentId}: {c.reason}</p>)}</details>
      <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Scrollable pending assembly"><table aria-label="Pending assembly register"><thead><tr><th>Component</th><th>Selected members</th><th>Action</th></tr></thead><tbody>
        {batch.register.components.map(c => <tr key={c.component_id}><th scope="row">{c.label}</th><td>{c.equipment_ids.map(id => equipment.equipment.find(e => e.equipment_id === id)?.tag || 'Unavailable member').join(', ')}</td><td><button type="button" disabled={busy || !!draft || stale} onClick={() => begin(null, c)}>Repair staged component</button></td></tr>)}
      </tbody></table></div>
      <button type="button" disabled={busy || !!draft || stale} onClick={checkBatch}>Preview all pending assembly changes</button>
      {!draft && previewReady && <section className="bas-equipment-preview" aria-label="Complete assembly preview"><h4>Validated complete assembly</h4><p>{preview.view.register.components.length} records · {preview.view.issues.length} findings remain for review. Validation is not approval.</p>
        <details><summary>Review findings</summary>{preview.view.issues.map((issue, i) => <p key={i}>{preview.view.register.components.find(c => c.component_id === issue.component_id)?.label}: {human(issue.code)}</p>)}</details>
        <button type="button" disabled={busy || !onReview} onClick={save}>Save all assembly changes</button></section>}
    </section>}
    {state.showCandidates && <section className="bas-point-detail" aria-label="Drawing component declarations"><label className="bas-sequence-select">Find declarations<input value={state.candidateSearch || ''} onChange={e => change({ candidateSearch: e.target.value, candidatePage: 0 })} placeholder="Equipment, component, or source wording" /></label>
      <p>Supported explicit declarations only. Selecting one does not prove applicability to {currentEquipment?.tag}. Uninterpreted drawing text remains in the sequence reader.</p>
      <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Scrollable drawing component declarations"><table><thead><tr><th>Declaration</th><th>Source wording</th><th>Action</th></tr></thead><tbody>{matches.slice(candidatePage * 50, (candidatePage + 1) * 50).map(d => <tr key={d.component.requirement_id}>
        <th scope="row">{d.component.subject_label}<p>{human(d.component.component_kind)} {d.component.fan_role || ''}</p></th>
        <td>{d.clause.reading_text}<Evidence ids={d.clause.source_spans.map(s => s.span_id)} spans={spans} onSource={onSource} /></td>
        <td><button type="button" onClick={() => begin(d)}>Review this declaration</button></td></tr>)}</tbody></table></div>
      {!matches.length && <p>No supported declaration matches. This is not evidence that no components are required; inspect the original sequence or record an explicit decision.</p>}
      {matches.length > 50 && <nav className="bas-point-controls" aria-label="Drawing declaration pages"><button type="button" disabled={!candidatePage} onClick={() => change({ candidatePage: candidatePage - 1 })}>Previous declarations</button><span>Page {candidatePage + 1} of {Math.ceil(matches.length / 50)}</span><button type="button" disabled={(candidatePage + 1) * 50 >= matches.length} onClick={() => change({ candidatePage: candidatePage + 1 })}>Next declarations</button></nav>}</section>}
    <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Scrollable equipment assembly"><table aria-label="Equipment assembly"><thead><tr><th>Component</th><th>Applicability</th><th>Declared quantity</th><th>Calculated contribution</th><th>Lifecycle / scope</th><th>Review</th></tr></thead>
      <tbody>{rows.slice(rowPage * 50, (rowPage + 1) * 50).map(c => { const result = calculation.latest?.result.components.find(r => r.original.component_id === c.record.component_id); return <tr key={c.record.component_id} data-selected={state.componentId === c.record.component_id}>
        <th scope="row"><button type="button" onClick={() => change({ componentId: c.record.component_id })}>{c.record.label}</button></th>
        <td>{human(c.record.quantity.basis)} · {c.included_equipment_ids.length} included members</td><td>{c.record.quantity.value ?? 'Unknown'}</td>
        <td>{result ? <>{result.assigned_quantity ?? 'Unknown'}<small>Whole selected group · {human(result.status)}{calculation.status === 'stale_dependencies' ? ' · stale' : ''}</small></> : 'Not calculated'}</td>
        <td>{human(c.record.lifecycle)} · {human(c.record.disposition)}<small>{human(c.record.condition.status)}</small></td>
        <td><button type="button" disabled={busy || !!draft || stale || (batch && !batch.register.components.some(r => r.component_id === c.record.component_id))} onClick={() => begin(null, c.record)}>Edit component</button>
          <button type="button" disabled={busy || !!draft || stale || (batch && !batch.register.components.some(r => r.component_id === c.record.component_id))} onClick={() => change({ withdrawal: { componentId: c.record.component_id, label: c.record.label, reason: '' } })}>Withdraw component</button></td></tr>; })}</tbody></table></div>
    {rows.length > 50 && <nav className="bas-point-controls" aria-label="Assembly table pages"><button type="button" disabled={!rowPage} onClick={() => change({ rowPage: rowPage - 1 })}>Previous components</button><span>Page {rowPage + 1} of {Math.ceil(rows.length / 50)}</span><button type="button" disabled={(rowPage + 1) * 50 >= rows.length} onClick={() => change({ rowPage: rowPage + 1 })}>Next components</button></nav>}
    {state.withdrawal && <section className="bas-point-detail" aria-label="Assembly withdrawal"><h4>Withdraw {state.withdrawal.label}</h4><p>This stages removal from the current register; saved source evidence and all earlier decisions remain in history.</p>
      <label className="bas-sequence-select">Withdrawal reason<textarea value={state.withdrawal.reason} onChange={e => change({ withdrawal: { ...state.withdrawal, reason: e.target.value } })} /></label>
      <button type="button" disabled={busy || stale} onClick={() => { try { const next = stageAssemblyWithdrawal(batch?.register || view.register, state.withdrawal.componentId, state.withdrawal.reason); stage(next, state.withdrawal.componentId, state.withdrawal.reason, 'withdraw'); } catch (e) { setError(e.message); } }}>Stage withdrawal</button>
      <button type="button" onClick={() => change({ withdrawal: null })}>Cancel withdrawal</button></section>}
    {!rows.length && <p>No assembly components are recorded for this equipment. This is not a zero-device takeoff.</p>}
    {selected && <section className="bas-point-detail" aria-label="Selected assembly component"><div className="bas-point-heading"><h4>{selected.record.label}</h4><button type="button" onClick={() => change({ componentId: null })}>Close component details</button></div>
      <p>{selected.record.reason}</p><p>Quantity basis: {selected.record.quantity.reason}</p><p>Condition: {selected.record.condition.statement || 'Unconditional decision'} · {selected.record.condition.reason}</p>
      <p>Selected members at review: {selected.record.equipment_ids.map(id => historicalEquipment?.equipment.find(e => e.equipment_id === id)?.tag || equipment.equipment.find(e => e.equipment_id === id)?.tag || 'Historical equipment member').join(', ')}</p>
      {selected.record.member_exclusion_reason && <p>Member exclusions: {selected.record.member_exclusion_reason}</p>}{selected.record.exclusion_reason && <p>Component exclusion: {selected.record.exclusion_reason}</p>}
      <Responsibilities values={selected.responsibilities} />
      <details className="bas-point-disclosure"><summary>Original source declarations and decision references</summary>
        {selected.declarations.map(d => <section key={d.component.requirement_id}><p>Original declared quantity: {d.component.declared_quantity} · {human(d.component.component_kind)} {d.component.fan_role || ''}</p><Evidence ids={d.clause.source_spans.map(s => s.span_id)} spans={spans} onSource={onSource} /></section>)}
        <Evidence ids={[...new Set([...selected.record.source_span_ids, ...selected.record.condition.source_span_ids, ...selected.record.responsibility_claims.flatMap(c => c.source_span_ids)])]} spans={spans} onSource={onSource} />
      </details></section>}
    {draft && <section className="bas-point-detail" aria-label="Assembly decision editor"><div className="bas-point-heading"><h4 ref={editor} tabIndex={-1}>Review component and scope</h4>
      <button type="button" disabled={busy} onClick={() => { change({ draft: null }); setPreview(null); setError(''); }}>Discard assembly draft</button></div>
      {stale && <p role="alert">This draft uses earlier source or decisions. Discard it before making a new decision.</p>}
      <form onSubmit={check}><fieldset className="bas-equipment-fields" disabled={busy || stale}>
        <label className="bas-sequence-select">Assembly equipment scope<select required value={record.scope_id} onChange={e => edit({ scope_id: e.target.value, equipment_ids: [], excluded_equipment_ids: [], member_exclusion_reason: null })}>{equipment.scopes.map(s => <option key={s.scope_id} value={s.scope_id}>{[s.building, s.level, s.system, s.phase].map(v => v || 'Unknown').join(' · ')}</option>)}</select></label>
        <div className="bas-point-controls"><label>Component label<input required value={record.label} onChange={e => edit({ label: e.target.value })} /></label>
          <label>Component kind<select value={record.component_kind} disabled={record.quantity.origin === 'source_declaration'} onChange={e => edit({ component_kind: e.target.value })}>{kinds.map(k => <option key={k} value={k}>{human(k)}</option>)}</select></label></div>
        <div className="bas-point-controls"><label>Quantity origin<select value={record.quantity.origin} onChange={e => editQuantity({ origin: e.target.value })}><option value="explicit_decision">Explicit user decision</option><option value="source_declaration" disabled={!record.source_requirement_ids.length}>Retained source declaration</option></select></label>
          <label>Declared quantity<input aria-label="Declared assembly quantity" type="number" min="0" step="1" readOnly={record.quantity.origin === 'source_declaration'} value={record.quantity.value ?? ''} placeholder="Unknown" onChange={e => editQuantity({ value: e.target.value === '' ? null : Number(e.target.value) })} /></label>
          <label>Applicability<select required aria-label="Assembly applicability" value={record.quantity.basis} onChange={e => editQuantity({ basis: e.target.value })}><option value="">Establish applicability</option><option value="per_equipment">Per included equipment</option><option value="selected_group_once">Once for the selected group</option></select></label></div>
        <label className="bas-sequence-select">Quantity and applicability reason<textarea required value={record.quantity.reason} onChange={e => editQuantity({ reason: e.target.value })} /></label>
        <details open><summary>Selected equipment and exceptions · {record.equipment_ids.length} selected</summary><div className="bas-point-grid"><table aria-label="Assembly membership"><thead><tr><th>Equipment</th><th>Selected</th><th>Excluded member</th></tr></thead><tbody>{scopedMembers.slice(memberPage * 50, (memberPage + 1) * 50).map(e => <tr key={e.equipment_id}><th scope="row">{e.tag}</th>
          <td><input type="checkbox" aria-label={`Assembly select ${e.tag}`} checked={record.equipment_ids.includes(e.equipment_id)} onChange={() => edit({ equipment_ids: toggle(record.equipment_ids, e.equipment_id), excluded_equipment_ids: record.excluded_equipment_ids.filter(id => id !== e.equipment_id), member_exclusion_reason: record.excluded_equipment_ids.filter(id => id !== e.equipment_id).length ? record.member_exclusion_reason : null })} /></td>
          <td><input type="checkbox" aria-label={`Assembly exclude ${e.tag}`} disabled={!record.equipment_ids.includes(e.equipment_id)} checked={record.excluded_equipment_ids.includes(e.equipment_id)} onChange={() => { const ids = toggle(record.excluded_equipment_ids, e.equipment_id); edit({ excluded_equipment_ids: ids, member_exclusion_reason: ids.length ? record.member_exclusion_reason ?? '' : null }); }} /></td></tr>)}</tbody></table></div>
          {scopedMembers.length > 50 && <div className="bas-point-controls"><button type="button" disabled={!memberPage} onClick={() => change({ memberPage: memberPage - 1 })}>Previous members</button><span>Page {memberPage + 1}</span><button type="button" disabled={(memberPage + 1) * 50 >= scopedMembers.length} onClick={() => change({ memberPage: memberPage + 1 })}>Next members</button></div>}
          {record.equipment_ids.filter(id => !scopedMembers.some(e => e.equipment_id === id)).map(id => <p key={id}>This selected member is no longer in the current scope. <button type="button" onClick={() => { const excluded = record.excluded_equipment_ids.filter(x => x !== id); edit({ equipment_ids: record.equipment_ids.filter(x => x !== id), excluded_equipment_ids: excluded, member_exclusion_reason: excluded.length ? record.member_exclusion_reason : null }); }}>Remove unavailable member from this draft</button></p>)}
          {record.member_exclusion_reason !== null && <label className="bas-sequence-select">Member exclusion reason<textarea required value={record.member_exclusion_reason} onChange={e => edit({ member_exclusion_reason: e.target.value })} /></label>}</details>
        <div className="bas-point-controls"><label>Lifecycle<select value={record.lifecycle} onChange={e => edit({ lifecycle: e.target.value })}>{['unknown', 'new', 'existing', 'reuse', 'demolition'].map(v => <option key={v}>{v}</option>)}</select></label>
          <label>Component scope<select value={record.disposition} onChange={e => edit({ disposition: e.target.value, exclusion_reason: e.target.value === 'excluded' ? '' : null })}><option value="included">Included</option><option value="excluded">Excluded, retained in history</option></select></label>
          <label>Condition<select aria-label="Condition" value={record.condition.status} onChange={e => editCondition({ status: e.target.value, statement: e.target.value === 'unconditional' ? null : record.condition.statement || '' })}>{['unresolved', 'unconditional', 'satisfied', 'not_satisfied'].map(v => <option key={v} value={v}>{human(v)}</option>)}</select></label></div>
        {record.exclusion_reason !== null && <label className="bas-sequence-select">Component exclusion reason<textarea required value={record.exclusion_reason} onChange={e => edit({ exclusion_reason: e.target.value })} /></label>}
        {record.condition.statement !== null && <label className="bas-sequence-select">Condition statement<input required value={record.condition.statement} onChange={e => editCondition({ statement: e.target.value })} /></label>}
        <label className="bas-sequence-select">Condition decision reason<textarea required value={record.condition.reason} onChange={e => editCondition({ reason: e.target.value })} /></label>
        <details><summary>Responsibility decisions · {record.responsibility_claims.length}</summary><p>Only factory furnishing is inferred from a supported factory-furnished declaration. Add other responsibilities as explicit decisions with reasons.</p>
          {record.responsibility_claims.map((claim, i) => { const update = patch => edit({ responsibility_claims: record.responsibility_claims.map((c, j) => j === i ? { ...c, ...patch } : c), responsibility_resolutions: [] }); return <fieldset className="bas-assembly-claim" key={claim.claim_id}><legend>Responsibility decision {i + 1}</legend>
            <div className="bas-point-controls"><label>Activity<select value={claim.activity} onChange={e => update({ activity: e.target.value })}>{activities.map(a => <option key={a}>{a}</option>)}</select></label>
              <label>Assignment<select aria-label="Assignment" value={claim.assignment} onChange={e => update({ assignment: e.target.value, party: e.target.value === 'named_party' ? '' : null })}>{['unknown', 'factory_furnished', 'field_installed', 'named_party', 'by_others'].map(a => <option key={a} value={a}>{human(a)}</option>)}</select></label>
              {claim.party !== null && <label>Party<input required value={claim.party} onChange={e => update({ party: e.target.value })} /></label>}</div>
            <label className="bas-sequence-select">Responsibility reason<textarea required value={claim.reason} onChange={e => update({ reason: e.target.value })} /></label>
            <label><input type="checkbox" checked={!!claim.source_span_ids.length} disabled={!record.source_span_ids.length && !claim.source_span_ids.length} onChange={e => update({ source_span_ids: e.target.checked ? [...record.source_span_ids] : [] })} /> Attach component drawing references to this decision</label>
            <button type="button" onClick={() => edit({ responsibility_claims: record.responsibility_claims.filter(c => c.claim_id !== claim.claim_id), responsibility_resolutions: [] })}>Remove decision from this draft</button></fieldset>; })}
          <button type="button" onClick={() => edit({ responsibility_claims: [...record.responsibility_claims, { claim_id: crypto.randomUUID(), activity: 'furnish', assignment: 'unknown', party: null, source_span_ids: [], reason: '' }] })}>Add responsibility decision</button>
        </details>
        <details><summary>Drawing references · {record.source_span_ids.length}</summary><label className="bas-sequence-select">Find assembly source text<input value={state.sourceSearch || ''} onChange={e => change({ sourceSearch: e.target.value })} placeholder="At least two characters" /></label>
          <div className="bas-equipment-options">{sourceMatches.slice(0, 50).map(s => <label key={s.span_id}><input type="checkbox" checked={record.source_span_ids.includes(s.span_id)} onChange={() => edit({ source_span_ids: toggle(record.source_span_ids, s.span_id) })} /><span>{s.text}<small>PDF p.{s.page_number}</small></span></label>)}</div>
          {sourceMatches.length > 50 && <p>Showing 50 matches; narrow the search. Selected references remain retained.</p>}<Evidence ids={record.source_span_ids} spans={spans} onSource={onSource} />
          {!!record.source_span_ids.length && <label><input type="checkbox" checked={!!record.condition.source_span_ids.length} onChange={e => editCondition({ source_span_ids: e.target.checked ? [...record.source_span_ids] : [] })} /> Attach these references to the condition decision</label>}</details>
        <label className="bas-sequence-select">Assembly decision reason<textarea required aria-label="Assembly decision reason" value={record.reason} onChange={e => edit({ reason: e.target.value })} placeholder="Record applicability, changes and any explicit assumptions." /></label>
        <div className="bas-point-controls"><button type="submit">Preview assembly decision</button><button type="submit" value="stage">Stage component edit</button></div>
      </fieldset></form>
      {previewComponent && <section className="bas-equipment-preview" aria-label="Assembly decision preview"><h4>{previewReady ? 'Validated preview' : 'Earlier preview — check your edited draft again'}</h4>
        <p>All {preview.view.register.components.length} assembly records are validated together. Review includes other equipment so duplicate source consumption cannot be hidden.</p>
        <Responsibilities values={previewComponent.responsibilities} />
        <details><summary>Resolve responsibility conflicts explicitly</summary>{previewComponent.responsibilities.filter(v => v.claims.length > 1).map(v => { const resolution = record.responsibility_resolutions.find(r => r.activity === v.activity); return <div key={v.activity} className="bas-assembly-resolution">
          <label className="bas-sequence-select">{human(v.activity)} resolution<select aria-label={`${human(v.activity)} resolution`} value={resolution?.selected_claim_id || ''} onChange={e => edit({ responsibility_resolutions: [...record.responsibility_resolutions.filter(r => r.activity !== v.activity), ...(e.target.value ? [{ activity: v.activity, selected_claim_id: e.target.value, reason: '' }] : [])] })}>
            <option value="">No explicit resolution</option>{v.claims.map(c => <option key={c.claim_id} value={c.claim_id}>{human(c.origin)} · {c.party || human(c.assignment)} · {c.reason}</option>)}</select></label>
          {resolution && <label className="bas-sequence-select">Resolution reason<textarea value={resolution.reason} onChange={e => edit({ responsibility_resolutions: record.responsibility_resolutions.map(r => r.activity === v.activity ? { ...r, reason: e.target.value } : r) })} /></label>}</div>; })}</details>
        <details><summary>Assembly findings · {preview.view.issues.length}</summary>{preview.view.issues.map((issue, i) => <p key={i}>{human(issue.code)}{issue.activity ? ` · ${issue.activity}` : ''}</p>)}</details>
        <button type="button" disabled={!previewReady || busy || !onReview} onClick={save}>Save assembly decision</button>
      </section>}
    </section>}
    <details className="bas-point-disclosure"><summary>Assembly review findings · {view.issues.length}; equipment findings · {view.equipment_issues.length}</summary>{view.issues.map((issue, i) => <p key={i}>{view.register.components.find(c => c.component_id === issue.component_id)?.label}: {human(issue.code)}{issue.activity ? ` · ${issue.activity}` : ''}</p>)}{view.equipment_issues.map((issue, i) => <p key={`equipment-${i}`}>{human(issue.code)}</p>)}</details>
    <p className="bas-point-disclosure">Export evidence &amp; decisions above includes all source captures, component edits, responsibility claims and calculations. Saved review is not approval or commissioning.</p>
  </section>;
}
