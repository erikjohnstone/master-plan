/** Equipment-detail presentation only. The shared service owns source checks,
 * dependency validation, calculation, history and response acceptance. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { verifyBasWorkflow } from '../lib/basWorkflow.ts';
import { basEquipmentRegister } from '../lib/basEquipmentReview.ts';
import { basEngineeringHeads, basEngineeringView } from '../lib/basEngineeringReview.ts';
import { basEngineeringReviewRequestSchema, basEngineeringReferences,
  BAS_ENGINEERING_RESOURCE_ROLES } from '../lib/basEngineeringRegister.ts';
import { basEngineeringCheckSchema } from '../lib/basEngineeringContract.ts';
import { canonicalBasJson } from '../lib/basCanonical.ts';
import { ENGINEERING_LABELS, engineeringCheckShape, newEngineeringCheck, stageEngineeringCheck,
  stageEngineeringResource, engineeringPreviewReady, engineeringListWindow, engineeringArrayIndex, engineeringInputAtPath } from './basEngineeringEditorState.ts';
import BasEngineeringFields, { EngineeringSources, EngineeringChoices, engineeringValueLabel, humanEngineering as human } from './BasEngineeringFields.jsx';
import Results, { engineeringStatusLabel as statusLabel } from './BasEngineeringResults.jsx';
import './BasEngineeringWorkspace.css';

const toggle = (ids, id) => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id];
const receiptKey = workflow => canonicalBasJson({ capture: workflow.current_capture_id, events: workflow.engineering_events?.map(e => e.event_id) || [] });

function ReadValue({ value, label, spans, onSource, ui, onUi, path = label }) {
  if (value == null || typeof value !== 'object') return <p><strong>{label}:</strong> {value === null ? 'Unknown / not provided' : String(value ?? 'Not entered')}</p>;
  if (Array.isArray(value)) {
    const index = engineeringArrayIndex(ui[path], value.length);
    return <fieldset className="bas-engineering-field"><legend>{label} · {value.length} entries</legend>{!!value.length && <>
      <label>Entry number<input aria-label={`${label}: entry number`} type="number" min="1" max={value.length} value={index + 1} onChange={e => onUi({ [path]: Math.max(0, Number(e.target.value) - 1) })} /></label>
      <ReadValue value={value[index]} label={`${label} entry ${index + 1}`} spans={spans} onSource={onSource} ui={ui} onUi={onUi} path={`${path}.${index}`} /></>}
    </fieldset>;
  }
  if ('basis' in value) return <fieldset className="bas-engineering-field"><legend>{label}</legend>
    <ReadValue value={value.value} label="Declared value" spans={spans} onSource={onSource} ui={ui} onUi={onUi} path={`${path}.value`} />
    <p>{value.basis.origin === 'drawing_transcription' ? 'Manually transcribed from drawing' : 'Explicit input — not extracted'} · {value.basis.reason}</p>
    <EngineeringSources ids={value.basis.source_span_ids} spans={spans} onSource={onSource} readOnly label="Original source evidence"
      open={!!ui[`${path}.sourcesOpen`]} onOpenChange={v => onUi({ [`${path}.sourcesOpen`]: v })} />
    {value.basis.original_text !== null && <details><summary>Original wording</summary><p className="bas-engineering-verbatim">{value.basis.original_text}</p></details>}
  </fieldset>;
  return <fieldset className="bas-engineering-field"><legend>{label}</legend>{Object.entries(value).map(([key, child]) =>
    <ReadValue key={key} value={child} label={human(key)} spans={spans} onSource={onSource} ui={ui} onUi={onUi} path={`${path}.${key}`} />)}</fieldset>;
}

export default function BasEngineeringWorkspace({ workflow, equipmentId, state = {}, onStateChange, onSource, onEngineering }) {
  const [computed, setComputed] = useState({ input: null, value: null, error: '' });
  const [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const running = useRef(null), editorHeading = useRef(null);
  const change = patch => onStateChange(previous => ({ ...previous, ...patch }));
  useEffect(() => {
    let live = true;
    (async () => { const verified = await verifyBasWorkflow(workflow), capture = verified.captures.find(c => c.capture_id === verified.current_capture_id);
      const view = capture ? await basEngineeringView(verified, capture.capture_id) : null;
      if (live) setComputed({ input: workflow, value: { verified, capture, view }, error: '' });
    })().catch(e => { if (live) setComputed({ input: workflow, value: null, error: e.message }); });
    return () => { live = false; };
  }, [workflow]);
  useEffect(() => () => running.current?.abort(), []);
  const ready = computed.input === workflow, { verified, capture, view } = (ready && computed.value) || {};
  const equipment = capture ? basEquipmentRegister(verified, capture.capture_id) : { equipment: [], scopes: [] };
  const heads = capture ? basEngineeringHeads(verified, capture.capture_id) : null;
  const spans = useMemo(() => capture?.narrative_sources?.pages.flatMap(p => p.spans.map(s => ({ ...s, page_id: p.page_id, page_number: p.page_number }))) || [], [capture]);
  const batch = state.batch, draft = state.draft, resourceDraft = state.resourceDraft;
  const stale = !!batch && (batch.capture_id !== capture?.capture_id || canonicalBasJson(batch.heads) !== canonicalBasJson(heads));
  const register = batch?.register || view?.register;
  const assembly = verified?.assembly_events?.find(e => e.event_id === heads?.assembly)?.register;
  const checks = register?.input.checks || [], resources = register?.resources || [];
  const savedResult = register && view && canonicalBasJson(register) === canonicalBasJson(view.register) ? view.event?.result : null;
  const selected = checks.find(c => c.check_id === state.checkId);
  const readerField = selected && (Object.hasOwn(selected, state.readerField || '') ? state.readerField : 'reason');
  const selectedResource = resources.find(r => r.resource_id === state.resourceId);
  const uiChange = patch => change({ fieldUi: { ...state.fieldUi, ...patch } });
  const readUiChange = patch => change({ readUi: { ...state.readUi, ...patch } });
  const context = { equipment: equipment.equipment, scopes: equipment.scopes, resources, checks, spans, onSource };
  const beginBatch = () => batch || { capture_id: capture.capture_id, heads, register: structuredClone(view.register), reason: '' };
  const edit = patch => { change({ draft: { ...draft, ...patch } }); setPreview(null); };
  const editCheck = patch => edit({ check: { ...draft.check, ...patch } });
  const editTarget = patch => edit({ target: { ...draft.target, ...patch } });
  const openField = (checkId, path) => change({ checkId, readerField: path.split('.')[0], readerPath: path, tab: 'checks' });
  const reportError = e => setError(e?.message || 'Engineering operation unavailable; prior history was preserved.');
  function beginCheck(check) {
    const next = check || newEngineeringCheck(state.newKind || 'signal', equipmentId, crypto.randomUUID());
    const target = register.targets.find(t => t.check_id === next.check_id) || { check_id: next.check_id, resource_ids: [], source_span_ids: [], disposition: 'included', exclusion_reason: null, reason: '' };
    change({ batch: beginBatch(), draft: { check: structuredClone(next), target: structuredClone(target) }, editField: 'source', tab: 'checks' });
    setPreview(null); setError('');
  }
  function beginResource(resource) {
    const owner = equipment.equipment.find(e => e.equipment_id === equipmentId);
    change({ batch: beginBatch(), tab: 'resources', resourceDraft: structuredClone(resource || {
      resource_id: crypto.randomUUID(), equipment_id: owner?.equipment_id || '', scope_id: owner?.scope_id || '', component_id: null,
      label: '', roles: [], source_span_ids: [], reason: '',
    }) }); setPreview(null); setError('');
  }
  async function calculate(record = false) {
    if (stale || !batch || busy) return;
    if (record && !engineeringPreviewReady(preview, draft, batch, stale)) return;
    const controller = new AbortController(); running.current = controller; setBusy(true); setError('');
    try {
      const next = draft ? stageEngineeringCheck(batch.register, draft.check, draft.target) : batch.register;
      const request = record ? preview.request : basEngineeringReviewRequestSchema.parse({ operation_id: crypto.randomUUID(), capture_id: batch.capture_id,
        expected_head: batch.heads.engineering, expected_equipment_head: batch.heads.equipment, expected_assembly_head: batch.heads.assembly,
        expected_sequence_head: batch.heads.sequence, register: next, reason: batch.reason });
      const response = await onEngineering({ action: 'review', request }, { persist: record, signal: controller.signal });
      controller.signal.throwIfAborted();
      if (record) {
        change({ replayReceipt: receiptKey(response.workflow), batch: null, draft: null, resourceDraft: null, checkId: draft?.check.check_id || state.checkId });
        setPreview(null); setNotice('Engineering decision recorded. Original evidence and prior results remain retained.');
      } else setPreview({ draft, batch, request, result: response.event.result });
    } catch (e) { reportError(e); } finally { if (running.current === controller) running.current = null; setBusy(false); }
  }
  async function inspect() {
    const controller = new AbortController(); running.current = controller; setBusy(true); setError('');
    try { const response = await onEngineering({ action: 'inspect', request: { capture_id: capture.capture_id } }, { signal: controller.signal });
      controller.signal.throwIfAborted(); change({ replayReceipt: receiptKey(response.workflow) }); setNotice('Saved calculations match shared Python replay. This is not project approval.');
    } catch (e) { reportError(e); } finally { if (running.current === controller) running.current = null; setBusy(false); }
  }
  const editorIdentity = resourceDraft?.resource_id || draft?.check.check_id;
  useEffect(() => { if (editorIdentity) editorHeading.current?.focus(); }, [editorIdentity]);
  if (!ready) return <p role="status">Checking engineering evidence…</p>;
  if (computed.error) return <p role="alert">{computed.error}</p>;
  if (!view) return <p>No retained engineering source capture. Compile the original drawing set first.</p>;
  const formFields = draft ? Object.keys(engineeringCheckShape(draft.check.kind).shape).filter(k => !['kind', 'check_id', 'reason', 'equipment_ids'].includes(k)) : [];
  const formField = formFields.includes(state.editField) ? state.editField : formFields[0];
  const previewReady = engineeringPreviewReady(preview, draft, batch, stale);
  const filteredChecks = checks.filter(c => (!equipmentId || c.equipment_ids.includes(equipmentId)) && (!state.filter || `${ENGINEERING_LABELS[c.kind]} ${c.reason}`.toLowerCase().includes(state.filter.toLowerCase())));
  const page = Math.max(0, Math.min(Number(state.page) || 0, Math.ceil(filteredChecks.length / 50) - 1));
  const resourceWindow = engineeringListWindow(resources, state.resourceSearch || '', state.resourcePage || 0, r => `${r.label} ${r.resource_id}`);
  return <section className="bas-engineering-workspace" aria-label="Engineering compatibility">
    <div className="bas-point-heading"><h3>Engineering</h3><span>{human(view.dependency_status)} · selected declared constraints only</span>
      <button type="button" disabled={busy || !view.event || !onEngineering} onClick={inspect}>Verify saved calculations</button>
      {busy && <button type="button" onClick={() => running.current?.abort(new Error('Engineering operation cancelled; no pending result accepted.'))}>Cancel operation</button>}
    </div>
    {view.event && <p role="status">{state.replayReceipt === receiptKey(verified) ? 'Saved calculations replayed in shared Python.' : 'Saved calculations need shared Python replay before use.'} A passing check is not complete design coverage or installed proof.</p>}
    {view.assembly_dependency_status === 'stale_dependencies' && <p role="alert">The assembly belongs to earlier equipment decisions. Review assembly applicability before recording engineering changes.</p>}
    {error && <p role="alert" className="bas-equipment-alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="bas-point-controls" role="group" aria-label="Engineering section"><button type="button" aria-pressed={state.tab !== 'resources'} onClick={() => change({ tab: 'checks' })}>Checks</button>
      <button type="button" aria-pressed={state.tab === 'resources'} onClick={() => change({ tab: 'resources' })}>Declared resources</button></div>
    {state.tab === 'resources' ? !resourceDraft && <>
      <div className="bas-point-controls"><button type="button" disabled={busy || stale || !!resourceDraft} onClick={() => beginResource()}>Add resource</button>
        <label>Find a resource<input value={state.resourceSearch || ''} onChange={e => change({ resourceSearch: e.target.value, resourcePage: 0 })} /></label></div>
      <p>Resources are explicitly declared interfaces, supplies or devices. They are not detected installed quantities.</p>
      <div className="bas-point-grid"><table aria-label="Declared engineering resources"><thead><tr><th>Resource</th><th>Owner</th><th>Roles</th><th>Actions</th></tr></thead><tbody>
        {resourceWindow.rows.map(r => <tr key={r.resource_id}>
          <th scope="row">{r.label}</th><td>{equipment.equipment.find(e => e.equipment_id === r.equipment_id)?.tag || 'Earlier equipment'}</td><td>{r.roles.map(human).join(', ')}</td>
          <td><button type="button" onClick={() => change({ resourceId: r.resource_id })}>Read resource</button><button type="button" disabled={busy || stale || !!resourceDraft} onClick={() => beginResource(r)}>Edit resource</button></td></tr>)}
      </tbody></table></div>
      {resourceWindow.pages > 1 && <div className="bas-point-controls"><button disabled={!resourceWindow.page} onClick={() => change({ resourcePage: resourceWindow.page - 1 })}>Previous resources</button><span>Resource page {resourceWindow.page + 1} of {resourceWindow.pages}</span><button disabled={resourceWindow.page + 1 >= resourceWindow.pages} onClick={() => change({ resourcePage: resourceWindow.page + 1 })}>Next resources</button></div>}
      {selectedResource && <section className="bas-point-detail"><h4>{selectedResource.label}</h4><p>{selectedResource.reason}</p><p>Resource identity: {selectedResource.resource_id}</p>
        <EngineeringSources ids={selectedResource.source_span_ids} spans={spans} onSource={onSource} readOnly /></section>}
    </> : !draft && <>
      <div className="bas-point-controls"><label>Check type<select value={state.newKind || 'signal'} onChange={e => change({ newKind: e.target.value })}>{Object.entries(ENGINEERING_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <button type="button" disabled={busy || stale || !!draft} onClick={() => beginCheck()}>New check</button>
        <label>Find a check<input value={state.filter || ''} onChange={e => change({ filter: e.target.value, page: 0 })} /></label></div>
      <div className="bas-point-grid"><table aria-label="Engineering checks"><thead><tr><th>Check</th><th>Decision reason</th><th>Saved outcome</th><th>Actions</th></tr></thead><tbody>
        {filteredChecks.slice(page * 50, (page + 1) * 50).map(c => { const result = savedResult?.checks.find(r => r.check_id === c.check_id); return <tr key={c.check_id}>
          <th scope="row">{ENGINEERING_LABELS[c.kind]}</th><td>{c.reason}</td><td>{statusLabel(result?.status)}<small>{view.register.targets.find(t => t.check_id === c.check_id)?.disposition === 'excluded' ? 'Explicitly excluded — outcome retained' : human(view.dependency_status)}</small></td>
          <td><button type="button" onClick={() => change({ checkId: c.check_id, readerField: 'reason', readerPath: null, outcomePage: 0 })}>Read check</button><button type="button" disabled={busy || stale || !!draft} onClick={() => beginCheck(c)}>Edit check</button></td></tr>; })}
      </tbody></table></div>
      {!filteredChecks.length && <p>No checks recorded for this selection. This does not establish engineering compatibility.</p>}
      {filteredChecks.length > 50 && <div className="bas-point-controls"><button disabled={!page} onClick={() => change({ page: page - 1 })}>Previous checks</button><span>Check page {page + 1}</span><button disabled={(page + 1) * 50 >= filteredChecks.length} onClick={() => change({ page: page + 1 })}>Next checks</button></div>}
      {selected && <section className="bas-point-detail" aria-label="Saved engineering check"><h4>{ENGINEERING_LABELS[selected.kind]}</h4>
        <Results result={savedResult} register={register} checkId={selected.check_id} onField={openField} page={state.outcomePage} onPage={value => change({ outcomePage: value })} />
        <label>Original input<select aria-label="Read original engineering input" value={readerField} onChange={e => change({ readerField: e.target.value, readerPath: null })}>{Object.keys(selected).map(key => <option key={key} value={key}>{human(key)}</option>)}</select></label>
        <ReadValue value={engineeringInputAtPath(selected, state.readerPath || readerField)} label={human(state.readerPath || readerField)} spans={spans} onSource={onSource} ui={state.readUi || {}} onUi={readUiChange} />
        <p>Applicability references below are separate from each input’s drawing references above.</p>
        <EngineeringSources ids={register.targets.find(t => t.check_id === selected.check_id)?.source_span_ids} spans={spans} onSource={onSource} readOnly label="Check applicability evidence" />
      </section>}
    </>}
    {batch && <section className="bas-point-detail" aria-label="Engineering changes">
      <div className="bas-point-heading"><h4 ref={editorHeading} tabIndex={-1}>Review engineering changes</h4><button disabled={busy} onClick={() => { change({ batch: null, draft: null, resourceDraft: null }); setPreview(null); }}>Discard staged changes</button></div>
      {stale && <p role="alert">Evidence or decisions changed after this draft began. Your draft remains visible, but cannot be saved. Discard it and review current sources.</p>}
      <fieldset disabled={busy || stale} className="bas-equipment-fields">
        {resourceDraft && <fieldset className="bas-engineering-field"><legend>Resource definition</legend>
          <label>Resource label<input aria-label="Resource label" value={resourceDraft.label} onChange={e => change({ resourceDraft: { ...resourceDraft, label: e.target.value } })} /></label>
          <label>Owning equipment<select aria-label="Resource equipment" value={resourceDraft.equipment_id} onChange={e => { const owner = equipment.equipment.find(v => v.equipment_id === e.target.value); change({ resourceDraft: { ...resourceDraft, equipment_id: e.target.value, scope_id: owner?.scope_id || '', component_id: null } }); }}>
            <option value="">Select owner</option>{resourceDraft.equipment_id && !equipment.equipment.some(e => e.equipment_id === resourceDraft.equipment_id) && <option value={resourceDraft.equipment_id}>Earlier equipment — resolve ownership</option>}
            {equipment.equipment.map(e => <option key={e.equipment_id} value={e.equipment_id}>{e.tag}</option>)}</select></label>
          <label>Assembly component (optional)<select aria-label="Resource assembly component" value={resourceDraft.component_id || ''} onChange={e => change({ resourceDraft: { ...resourceDraft, component_id: e.target.value || null } })}>
            <option value="">No component link</option>{resourceDraft.component_id && !assembly?.components.some(c => c.component_id === resourceDraft.component_id) && <option value={resourceDraft.component_id}>Earlier component — resolve ownership</option>}
            {assembly?.components.filter(c => c.equipment_ids.includes(resourceDraft.equipment_id)).map(c => <option key={c.component_id} value={c.component_id}>{c.label}</option>)}</select></label>
          <fieldset className="bas-engineering-field"><legend>Declared roles</legend><div className="bas-engineering-choices">{BAS_ENGINEERING_RESOURCE_ROLES.map(role => <label key={role}><input type="checkbox" checked={resourceDraft.roles.includes(role)} onChange={() => change({ resourceDraft: { ...resourceDraft, roles: toggle(resourceDraft.roles, role) } })} />{human(role)}</label>)}</div></fieldset>
          <EngineeringSources ids={resourceDraft.source_span_ids} spans={spans} onSource={onSource} search={state.resourceSourceSearch || ''} onSearch={v => change({ resourceSourceSearch: v })}
            onChange={ids => change({ resourceDraft: { ...resourceDraft, source_span_ids: ids } })} />
          <label>Resource decision reason<textarea aria-label="Resource decision reason" value={resourceDraft.reason} onChange={e => change({ resourceDraft: { ...resourceDraft, reason: e.target.value } })} /></label>
          <button type="button" onClick={() => { try { const next = stageEngineeringResource(batch.register, resourceDraft); change({ batch: { ...batch, register: next }, resourceDraft: null }); setPreview(null); setError(''); } catch (e) { reportError(e); } }}>Stage resource</button>
          <button type="button" onClick={() => change({ resourceDraft: null })}>Cancel resource edit</button>
        </fieldset>}
        {draft && !resourceDraft && <>
          <h4>{ENGINEERING_LABELS[draft.check.kind]}</h4>
          <label>Check decision reason<textarea aria-label="Check decision reason" value={draft.check.reason} onChange={e => editCheck({ reason: e.target.value })} /></label>
          <EngineeringChoices label="Compared equipment" choices={equipment.equipment.map(e => [e.equipment_id, `${e.tag} · ${e.equipment_id}`])}
            ids={draft.check.equipment_ids} onChange={ids => editCheck({ equipment_ids: ids })} ui={state.equipmentChoices} onUi={value => change({ equipmentChoices: value })} />
          <div className="bas-engineering-form-layout"><nav className="bas-engineering-field-list" aria-label="Engineering input fields">{formFields.map(field => <button type="button" key={field} aria-label={`Edit ${human(field)}`} aria-pressed={formField === field} onClick={() => change({ editField: field })}>{human(field)}<small>{engineeringValueLabel(draft.check[field])}</small></button>)}</nav>
            {formField && <BasEngineeringFields schema={engineeringCheckShape(draft.check.kind).shape[formField]} value={draft.check[formField]} onChange={v => editCheck({ [formField]: v })}
              label={human(formField)} field={formField} context={context} ui={state.fieldUi || {}} onUi={uiChange} />}
          </div>
          <fieldset className="bas-engineering-field"><legend>Check resources &amp; applicability</legend>
            <button type="button" onClick={() => { try { const check = basEngineeringCheckSchema.parse(draft.check); editTarget({ resource_ids: [...new Set([...draft.target.resource_ids, ...basEngineeringReferences(check).map(r => r.resource_id)])] }); } catch (e) { reportError(e); } }}>Select resources explicitly referenced by these inputs</button>
            <EngineeringChoices label="Check resources" choices={resources.map(r => [r.resource_id, `${r.label} · ${equipment.equipment.find(e => e.equipment_id === r.equipment_id)?.tag || 'Earlier equipment'}`])}
              ids={draft.target.resource_ids} onChange={ids => editTarget({ resource_ids: ids })} ui={state.resourceChoices} onUi={value => change({ resourceChoices: value })} />
            <label>Check scope<select aria-label="Check scope" value={draft.target.disposition} onChange={e => editTarget({ disposition: e.target.value, exclusion_reason: e.target.value === 'excluded' ? draft.target.exclusion_reason || '' : null })}><option value="included">Included in review</option><option value="excluded">Explicitly excluded — retain outcome</option></select></label>
            {draft.target.disposition === 'excluded' && <label>Exclusion reason<textarea value={draft.target.exclusion_reason} onChange={e => editTarget({ exclusion_reason: e.target.value })} /></label>}
            <label>Applicability reason<textarea aria-label="Engineering applicability reason" value={draft.target.reason} onChange={e => editTarget({ reason: e.target.value })} /></label>
            <EngineeringSources ids={draft.target.source_span_ids} spans={spans} onSource={onSource} search={state.targetSearch || ''} onSearch={v => change({ targetSearch: v })} onChange={ids => editTarget({ source_span_ids: ids })} />
          </fieldset>
          <button type="button" onClick={() => { try { const next = stageEngineeringCheck(batch.register, draft.check, draft.target); change({ batch: { ...batch, register: next }, draft: null, checkId: draft.check.check_id }); setPreview(null); setError(''); } catch (e) { reportError(e); } }}>Stage check &amp; continue editing</button>
        </>}
        <label>Reason for recording these changes<textarea aria-label="Engineering review reason" value={batch.reason} onChange={e => { change({ batch: { ...batch, reason: e.target.value } }); setPreview(null); }} /></label>
        <button type="button" disabled={!!resourceDraft || !onEngineering} onClick={() => calculate(false)}>Preview &amp; calculate</button>
      </fieldset>
      {preview && <section className="bas-point-detail" aria-label="Engineering calculation preview"><h4>{previewReady ? 'Calculated preview — not yet recorded' : 'Earlier preview — calculate the edited draft again'}</h4>
        <Results result={preview.result} register={preview.request.register} page={state.previewPage} onPage={value => change({ previewPage: value })}
          onField={(id, path) => { if (id === draft?.check.check_id) change({ editField: path.split('.')[0] }); else openField(id, path); }} />
        <p>All declared checks were calculated together. Unknown inputs and excluded failures remain retained; this is not project approval.</p>
        <button type="button" disabled={!previewReady || busy || !!resourceDraft} onClick={() => calculate(true)}>Record engineering decision</button>
      </section>}
    </section>}
    <details><summary>Engineering findings &amp; history · {view.issues.length} findings</summary>{view.issues.map((issue, i) => <p key={i}>{human(issue.code)} · {resources.find(r => r.resource_id === issue.resource_id)?.label || issue.check_id || ''}</p>)}
      <p>Only explicitly selected constraints are checked. Source interpretation, physical installation and full design coverage remain separate. Local operator labels and hashes are not authenticated approvals.</p>
      {verified.engineering_events?.filter(e => e.capture_id === capture.capture_id).map(e => <p key={e.event_id}>{e.created_at} · {human(e.origin)} · {e.reason}</p>)}
    </details>
  </section>;
}
