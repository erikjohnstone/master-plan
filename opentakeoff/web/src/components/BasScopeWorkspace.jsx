/** Surface-specific full-width review. No UI-derived evidence, quantities or approval. */
import { useEffect, useRef, useState } from 'react';
import { catalogBasScope, prepareBasScopeCoverage } from '../lib/basScopeCatalog.ts';
import { buildBasDeliverableScope, basDeliverableTargetKey } from '../lib/basDeliverableScope.ts';
import { readBasScopeDecision } from '../lib/basScopeReview.ts';
import { canonicalBasJson } from '../lib/basCanonical.ts';
import { SCOPE_CLAIM_LABELS as labels, scopeWindow, scopeChoiceLabels, populateScopeDraft, selectScopeTarget } from './basScopeEditorState.ts';
import { downloadText } from '../lib/totals.js';
import './BasScopeWorkspace.css';

const human = value => String(value).replace(/_/g, ' ');
const toggle = (ids, id) => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id];
function Pager({ value, onChange, label }) {
  return <div className="bas-point-controls"><button type="button" disabled={!value.page} onClick={() => onChange(value.page - 1)}>Previous {label}</button>
    <span>{value.total ? value.page * 50 + 1 : 0}–{Math.min(value.total, (value.page + 1) * 50)} of {value.total}</span>
    <button type="button" disabled={(value.page + 1) * 50 >= value.total} onClick={() => onChange(value.page + 1)}>Next {label}</button></div>;
}
function OriginalText({ source, state, onChange, onSource, selecting = false, selected = [], onSelect }) {
  const spans = source?.spans || [], window = scopeWindow(spans, state.sourcePage);
  if (!source) return null;
  return <section aria-label="Original coverage source" className="bas-scope-source">
    <h3>Original source text</h3><p>{human(source.text_status)} · {spans.length} retained spans · {human(source.scope)}</p>
    {!spans.length && <p role="status">No retained text is available for this source. This does not mean the page has no requirements.</p>}
    <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Original source spans"><table><thead><tr>{selecting && <th scope="col">Review</th>}<th scope="col">Original wording</th><th scope="col">Evidence</th></tr></thead><tbody>
      {window.rows.map((span, index) => <tr key={span.span_id}>{selecting && <td><input type="checkbox" aria-label={`Select source span ${window.page * 50 + index + 1}`} checked={selected.includes(span.span_id)} onChange={() => onSelect(toggle(selected, span.span_id))} /></td>}
        <td className="bas-scope-verbatim">{span.text || '(empty span)'}</td><td><button type="button" onClick={() => onSource(source.unit.page_id, span)}>View original</button></td></tr>)}
    </tbody></table></div><Pager value={window} onChange={sourcePage => onChange({ sourcePage })} label="source spans" />
  </section>;
}
function ScopeSummary({ view, state, onChange, onSource }) {
  const items = new Map(view.inventory.items.map(i => [i.item_id, i]));
  const claims = scopeWindow(view.claims, state.summaryPage), exclusions = scopeWindow(view.exclusions, state.exclusionPage);
  return <section aria-label="Scope preview"><h3>{view.specification.name}</h3>
    <p>{view.claims.length} included claims · {view.exclusions.length} explicit exclusions · not approved</p>
    <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Scope claims"><table><thead><tr><th>Claim</th><th>Item</th><th>Dependencies and checks</th></tr></thead><tbody>
      {claims.rows.map(c => <tr key={basDeliverableTargetKey(c.target)}><td>{labels[c.target.claim]}</td><td>{items.get(c.root_item_id)?.label}</td>
        <td>{c.dependency_item_ids.length} retained items{c.diagnostics.map((d, i) => <div key={`${d.item_id}:${i}`}>{human(d.code)} · {items.get(d.item_id)?.label}</div>)}</td></tr>)}
    </tbody></table></div><Pager value={claims} onChange={summaryPage => onChange({ summaryPage })} label="preview claims" />
    {!!view.exclusions.length && <details><summary>Explicit exclusions · {view.exclusions.length}</summary>{exclusions.rows.map(e => <div key={basDeliverableTargetKey(e.target)}>
      <h4>{labels[e.target.claim]} · {items.get(e.root_item_id)?.label}</h4><p>{e.reason}</p><p>Consequence: {e.consequence}</p>
      <p>Shared prerequisites remain included where required by other claims.</p>{e.source_refs.map((s, i) => <button key={i} type="button" onClick={() => onSource(s.page_id, s)}>View exclusion evidence</button>)}
    </div>)}<Pager value={exclusions} onChange={exclusionPage => onChange({ exclusionPage })} label="preview exclusions" /></details>}
  </section>;
}
function MappingSummary({ mappings, state, onChange }) {
  const rows = scopeWindow(mappings, state.replayMappingPage);
  return <section aria-label="Saved coverage mappings"><h3>Saved evidence mappings · {rows.total}</h3>
    {!rows.total ? <p>No item mappings were recorded for this assessment.</p> : <>
      <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Mapped evidence items"><table><thead><tr><th>Retained item</th><th>Type</th></tr></thead><tbody>
        {rows.rows.map(m => <tr key={m.item_id}><td>{m.label}</td><td>{human(m.kind)}</td></tr>)}
      </tbody></table></div><Pager value={rows} onChange={replayMappingPage => onChange({ replayMappingPage })} label="saved mappings" />
    </>}
  </section>;
}

export default function BasScopeWorkspace({ workflow, state = {}, onStateChange, onRecord, onOpenCitation, onBack, onDrawingReview }) {
  const [loaded, setLoaded] = useState({ workflow: null, setId: null, value: null, error: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  // Ephemeral parent-owned view receipts survive source navigation, but never
  // enter the saved workflow. Exact workflow identity invalidates stale views.
  const { preview, prepared, original, replay } = state;
  const live = useRef(workflow), operation = useRef(null), heading = useRef(null); live.current = workflow;
  const change = patch => onStateChange(previous => ({ ...previous, ...patch }));
  const setPreview = preview => change({ preview }), setPrepared = prepared => change({ prepared });
  const setOriginal = original => change({ original }), setReplay = replay => change({ replay });
  useEffect(() => { heading.current?.focus(); return () => operation.current?.abort(); }, []);
  useEffect(() => {
    const abort = new AbortController();
    catalogBasScope(workflow, state.sourceSetId ? { source_set_id: state.sourceSetId } : {}, abort.signal).then(value => {
      if (!abort.signal.aborted) setLoaded({ workflow, setId: state.sourceSetId, value, error: '' });
    }).catch(e => { if (!abort.signal.aborted) setLoaded({ workflow, setId: state.sourceSetId, value: null, error: e.message }); });
    return () => abort.abort();
  }, [workflow, state.sourceSetId]);
  const ready = loaded.workflow === workflow && loaded.setId === state.sourceSetId;
  const catalog = ready ? loaded.value : null, tab = state.tab || 'scope', draft = state.draft;
  const saved = catalog?.scopes.find(e => e.event_id === state.scopeEventId && e.action.kind === 'save_scope');
  const basis = catalog?.basis;
  const draftStale = !!draft && (!basis || draft.expectedHead !== catalog.head || canonicalBasJson(draft.specification.basis) !== canonicalBasJson(basis));
  const scope = saved && basis ? { ...saved.action.specification, basis } : null;
  const claim = scope?.included.find(t => basDeliverableTargetKey(t) === state.claimKey);
  const coveragePage = catalog?.pages.find(p => p.page_id === state.coveragePageId && p.capture_id === claim?.capture_id);
  const unit = coveragePage ? { capture_id: coveragePage.capture_id, page_id: coveragePage.page_id, span_ids: state.sourceMode === 'spans' ? state.spanIds || [] : null } : null;
  const request = scope && claim && unit ? { specification: scope, claim, unit } : null;
  const preparationCurrent = !!prepared && prepared.workflow === workflow && canonicalBasJson(prepared.request) === canonicalBasJson(request);
  const originalCurrent = original?.workflow === workflow && original.scopeEventId === saved?.event_id && original.claimKey === state.claimKey && original.pageId === state.coveragePageId;
  const previewCurrent = preview?.workflow === workflow && preview.draft === draft && !draftStale;
  const activeReplay = replay?.workflow === workflow && replay.eventId === state.decisionId ? replay.value : null;
  async function perform(fn) {
    if (busy) return;
    const abort = new AbortController(), initial = workflow; operation.current = abort; setBusy(true); setError('');
    const guard = () => { abort.signal.throwIfAborted(); if (live.current !== initial) throw new Error('The BAS workflow changed. Review current inputs before continuing.'); };
    try { await fn(abort.signal, guard); } catch (e) { if (!abort.signal.aborted) setError(e.message); }
    finally { if (operation.current === abort) operation.current = null; setBusy(false); }
  }
  async function source(pageId, span) {
    setError('');
    try { const result = await onOpenCitation({ page_id: pageId, sheet_id: pageId,
      ...(span.bbox_px ? { bbox_px: span.bbox_px } : { original_source_only: true }), value: span.text, kind: 'row' }); if (result?.error) setError(result.error); }
    catch (e) { setError(e.message); }
  }
  const patchSpec = specification => { change({ draft: { ...draft, specification } }); setPreview(null); };
  function start(previous = null) {
    if (!basis) return;
    change({ tab: 'scope', notice: '', draft: { expectedHead: catalog.head, previousEventId: previous?.event_id ?? null,
      specification: previous ? { ...structuredClone(previous.action.specification), basis } : {
        schema_version: 'bas_deliverable_scope_spec_v1', scope_id: crypto.randomUUID(), name: '', reason: '', basis, included: [], excluded: [],
      } } }); setPreview(null);
  }
  const decisionRequest = action => ({ operation_id: crypto.randomUUID(), expected_head: catalog.head,
    reviewer: state.reviewer || '', reason: state.decisionReason || '', action });
  const record = action => perform(async signal => {
    const result = await onRecord(decisionRequest(action), { signal });
    change({ draft: null, decisionReason: '', inspected: false, assessment: '', notice: 'Decision saved. Original evidence and previous reviews remain retained; this is not approval.',
      decisionId: result.event.event_id, ...(action.kind === 'save_scope' ? { scopeEventId: result.event.event_id, tab: 'coverage', claimKey: '', coveragePageId: '', spanIds: [] } : { tab: 'history' }) });
    setPreview(null); setPrepared(null); setReplay(null);
  });
  const canRecord = !!onRecord && !!state.reviewer?.trim() && !!state.decisionReason?.trim() && !busy;
  const reviewIdentity = <fieldset disabled={busy} className="bas-scope-fields"><legend>Record this review</legend><label>Reviewer (self-declared)<input aria-label="Reviewer (self-declared)" value={state.reviewer || ''} maxLength={256} onChange={e => change({ reviewer: e.target.value })} /></label>
    <label>Decision reason<textarea aria-label="Decision reason" value={state.decisionReason || ''} maxLength={4096} onChange={e => change({ decisionReason: e.target.value })} /></label></fieldset>;
  const inspectDecision = eventId => { change({ decisionId: eventId, sourcePage: 0, replayMappingPage: 0 }); perform(async (signal, guard) => {
    const value = await readBasScopeDecision(workflow, eventId, { signal }); guard(); setReplay({ workflow, eventId, value });
  }); };
  const editDisposition = (target, disposition) => {
    try { patchSpec(selectScopeTarget(draft.specification, target, disposition)); } catch (e) { setError(e.message); }
  };
  const filteredTargets = (catalog?.targets || []).filter(t => (!state.claimType || t.target.claim === state.claimType)
    && (!state.filter || `${t.label} ${labels[t.target.claim]}`.toLowerCase().includes(state.filter.toLowerCase())));
  const targets = scopeWindow(filteredTargets, state.targetPage), mappings = preparationCurrent ? prepared.value.mappings : [];
  const mappingRows = scopeWindow(mappings.filter(m => !state.mappingFilter || `${m.label} ${m.kind}`.toLowerCase().includes(state.mappingFilter.toLowerCase())), state.mappingPage);
  const historyRows = scopeWindow([...(catalog?.history || [])].reverse(), state.historyPage);
  const choiceLabels = scopeChoiceLabels(catalog?.targets || []);
  const includedKeys = new Set(draft?.specification.included.map(basDeliverableTargetKey));
  const excludedKeys = new Set(draft?.specification.excluded.map(e => basDeliverableTargetKey(e.target)));
  return <section className="bas-point-workspace bas-scope-workspace" aria-label="Scope and coverage">
    <div className="bas-point-heading"><h2 ref={heading} tabIndex={-1}>Scope &amp; coverage</h2><button type="button" onClick={() => { operation.current?.abort(); onBack(); }}>← Review &amp; changes</button></div>
    <p>Choose what this takeoff will claim, then review its original evidence. Source-linked suggestions save searching; they do not establish completeness or approve a takeoff.</p>
    <div className="bas-point-controls"><label>Drawing source set<select aria-label="Drawing source set" disabled={busy || !!draft} value={state.sourceSetId || ''} onChange={e => change({ sourceSetId: e.target.value, scopeEventId: '', claimKey: '', coveragePageId: '', spanIds: [], decisionId: '', notice: '' })}>
      <option value="">Choose reviewed drawing set…</option>{(catalog?.source_sets || loaded.value?.source_sets || []).map(s => <option key={s.source_set_id} value={s.source_set_id}>{s.name} · {s.page_count} pages</option>)}</select></label>
      <button type="button" disabled={busy} onClick={onDrawingReview}>Manage drawing sets</button></div>
    {!ready && <p role="status">Loading retained scope choices…</p>}{loaded.error && ready && <p role="alert">{loaded.error}</p>}{error && <p role="alert">{error}</p>}{state.notice && <p role="status">{state.notice}</p>}
    {busy && <div role="status">Checking retained evidence… <button type="button" onClick={() => operation.current?.abort()}>Cancel</button></div>}
    {catalog && <>
      <div className="bas-point-controls" role="group" aria-label="Scope workspace views">{[['scope', 'Scope builder'], ['coverage', 'Source coverage'], ['history', 'Decision history']].map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} disabled={busy} onClick={() => change({ tab: id })}>{label}</button>)}</div>
      {tab !== 'history' && <div className="bas-point-controls"><label>Saved scope<select aria-label="Saved scope" disabled={busy || !!draft} value={state.scopeEventId || ''} onChange={e => change({ scopeEventId: e.target.value, claimKey: '', coveragePageId: '', spanIds: [], inspected: false, assessment: '', notice: '' })}>
        <option value="">Choose saved scope…</option>{catalog.scopes.filter(e => e.action.kind === 'save_scope' && (!basis || e.action.specification.basis.source_set_id === basis.source_set_id)).map(e => <option key={e.event_id} value={e.event_id}>{e.action.specification.name}</option>)}</select></label>
        <button type="button" disabled={!basis || busy || !!draft} onClick={() => start()}>New scope</button>{saved && <button type="button" disabled={busy || !!draft} onClick={() => start(saved)}>Edit saved scope</button>}</div>}
      {tab === 'scope' && <>
        {!draft && <p>Select a reviewed drawing set and create a scope, or edit a saved scope. Available claims come from retained equipment, assignments, assemblies and checks.</p>}
        {draft && <>
          {draftStale && <p role="alert">The drawing selection or retained inputs changed. Your draft is preserved; discard it and review the current catalog before saving.</p>}
          <fieldset disabled={busy || draftStale} className="bas-scope-fields"><legend>Scope draft</legend>
            <label>Scope name<input aria-label="Scope name" maxLength={256} value={draft.specification.name} onChange={e => patchSpec({ ...draft.specification, name: e.target.value })} /></label>
            <label>Scope purpose<textarea aria-label="Scope purpose" maxLength={4096} value={draft.specification.reason} onChange={e => patchSpec({ ...draft.specification, reason: e.target.value })} /></label>
            <div className="bas-point-controls"><button type="button" onClick={() => { try { patchSpec(populateScopeDraft(draft.specification, catalog)); } catch (e) { setError(e.message); } }}>Include available claims</button>
              <span>{draft.specification.included.length} included · {draft.specification.excluded.length} excluded</span></div>
            <div className="bas-point-controls"><label>Find a claim<input value={state.filter || ''} onChange={e => change({ filter: e.target.value, targetPage: 0 })} /></label><label>Claim type<select aria-label="Claim type" value={state.claimType || ''} onChange={e => change({ claimType: e.target.value, targetPage: 0 })}><option value="">All claim types</option>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
            <div className="bas-point-grid" role="region" tabIndex={0} aria-label="Available scope claims"><table><thead><tr><th>Claim</th><th>Item</th><th>Source / dependency state</th><th>Include in deliverable</th></tr></thead><tbody>{targets.rows.map(t => {
              const key = basDeliverableTargetKey(t.target); return <tr key={key}><td>{labels[t.target.claim]}</td><td>{t.label}<small>{choiceLabels.get(key)}</small><small>{t.capture_label} · source {t.target.capture_id.slice(0, 8)}</small></td><td>{human(t.source_scope)} · {human(t.dependency_status)}</td><td><select aria-label={`Disposition: ${choiceLabels.get(key)}`} value={includedKeys.has(key) ? 'included' : excludedKeys.has(key) ? 'excluded' : 'unselected'} onChange={e => editDisposition(t.target, e.target.value)}><option value="unselected">Unselected</option><option value="included">Included</option><option value="excluded">Explicitly excluded</option></select></td></tr>;
            })}</tbody></table></div><Pager value={targets} onChange={targetPage => change({ targetPage })} label="claims" />
            {draft.specification.excluded.map((exclusion, index) => {
              const key = basDeliverableTargetKey(exclusion.target), item = catalog.targets.find(t => basDeliverableTargetKey(t.target) === key);
              const edit = patch => patchSpec({ ...draft.specification, excluded: draft.specification.excluded.map((e, i) => i === index ? { ...e, ...patch } : e) });
              return <fieldset key={key}><legend>Exclusion: {labels[exclusion.target.claim]} · {item?.label}</legend>
                <label>Exclusion reason<textarea aria-label="Exclusion reason" value={exclusion.reason} onChange={e => edit({ reason: e.target.value })} /></label><label>Consequence for the takeoff<textarea aria-label="Consequence for the takeoff" value={exclusion.consequence} onChange={e => edit({ consequence: e.target.value })} /></label>
                <label>Add exclusion source page<select aria-label="Add exclusion source page" value="" onChange={e => {
                  const p = catalog.pages.find(p => `${p.capture_id}|${p.page_id}` === e.target.value);
                  if (p && !exclusion.evidence.some(s => s.capture_id === p.capture_id && s.page_id === p.page_id && s.span_id === null)) edit({ evidence: [...exclusion.evidence, { capture_id: p.capture_id, page_id: p.page_id, span_id: null }] });
                }}><option value="">Choose original evidence…</option>{catalog.pages.map(p => <option key={`${p.capture_id}|${p.page_id}`} value={`${p.capture_id}|${p.page_id}`}>{p.document_name} · {p.label}</option>)}</select></label>
                {exclusion.evidence.map((ref, i) => <p key={JSON.stringify(ref)}>{catalog.pages.find(p => p.capture_id === ref.capture_id && p.page_id === ref.page_id)?.label || ref.page_id} · {ref.span_id ? 'Exact retained text span' : 'Whole original page'} <button type="button" onClick={() => edit({ evidence: exclusion.evidence.filter((_, n) => n !== i) })}>Remove exclusion reference {i + 1}</button></p>)}
              </fieldset>;
            })}
            <button type="button" onClick={() => perform(async (signal, guard) => { const value = await buildBasDeliverableScope(workflow, draft.specification, signal); guard(); setPreview({ workflow, draft, value }); })}>Preview scope</button>
          </fieldset>
          <button type="button" disabled={busy} onClick={() => { change({ draft: null }); setPreview(null); }}>Discard scope draft</button>
          {previewCurrent && <><ScopeSummary view={preview.value} state={state} onChange={change} onSource={source} />{reviewIdentity}<button type="button" disabled={!canRecord} onClick={() => record({ kind: 'save_scope', specification: preview.value.specification, previous_scope_event_id: draft.previousEventId })}>Save reviewed scope</button></>}
        </>}
      </>}
      {tab === 'coverage' && <>
        {!scope && <p>Choose a saved scope to review coverage. Saving a scope alone does not establish coverage.</p>}
        {scope && <fieldset disabled={busy} className="bas-scope-fields"><legend>Review source applicability</legend>
          <div className="bas-point-controls"><label>Included claim<select aria-label="Included claim" value={state.claimKey || ''} onChange={e => change({ claimKey: e.target.value, coveragePageId: '', spanIds: [], inspected: false, assessment: '', mappedIds: [] })}><option value="">Choose claim…</option>{scope.included.map(t => <option key={basDeliverableTargetKey(t)} value={basDeliverableTargetKey(t)}>{choiceLabels.get(basDeliverableTargetKey(t)) || `${labels[t.claim]} · Unavailable current item`}</option>)}</select></label>
            <label>Original page<select aria-label="Original page" disabled={!claim} value={state.coveragePageId || ''} onChange={e => change({ coveragePageId: e.target.value, sourcePage: 0, spanIds: [], inspected: false, assessment: '', mappedIds: [] })}><option value="">Choose original page…</option>{catalog.pages.filter(p => p.capture_id === claim?.capture_id).map(p => <option key={p.page_id} value={p.page_id}>{p.document_name} · {p.label}</option>)}</select></label></div>
          <button type="button" disabled={!request} onClick={() => perform(async (signal, guard) => {
            const fullRequest = { ...request, unit: { ...request.unit, span_ids: null } }, value = await prepareBasScopeCoverage(workflow, fullRequest, signal); guard();
            setOriginal({ workflow, scopeEventId: saved.event_id, claimKey: state.claimKey, pageId: state.coveragePageId, value });
            setPrepared(null); change({ inspected: false, assessment: '', mappedIds: [] });
          })}>Load original source</button>
          {originalCurrent && <>
            <label>Review extent<select aria-label="Review extent" value={state.sourceMode || 'page'} onChange={e => { change({ sourceMode: e.target.value, inspected: false, assessment: '', mappedIds: [] }); setPrepared(null); }}><option value="page">Whole original page</option><option value="spans">Selected original text spans</option></select></label>
            <OriginalText source={original.value.source} state={state} onChange={change} onSource={source} selecting={state.sourceMode === 'spans'} selected={state.spanIds || []} onSelect={spanIds => { change({ spanIds, inspected: false, assessment: '', mappedIds: [] }); setPrepared(null); }} />
            <button type="button" disabled={state.sourceMode === 'spans' && !state.spanIds?.length} onClick={() => perform(async (signal, guard) => { const value = await prepareBasScopeCoverage(workflow, request, signal); guard(); setPrepared({ workflow, request, value }); change({ inspected: false, assessment: '', mappedIds: [] }); })}>Prepare evidence mappings</button>
          </>}
          {preparationCurrent && <>
            <h3>Evidence mappings</h3><p>{mappings.filter(m => m.suggestion).length} source-linked candidates. Suggestions share retained page/span references; they are not automatic applicability decisions.</p>
            <label>Assessment<select aria-label="Assessment" value={state.assessment || ''} onChange={e => change({ assessment: e.target.value, mappedIds: [] })}><option value="">Choose after reviewing…</option><option value="applicable_mapped">Applicable — mapped to retained items</option><option value="not_applicable">Not applicable to this claim</option><option value="unresolved">Unresolved — needs further review</option></select></label>
            {state.assessment === 'applicable_mapped' && <>
              <div className="bas-point-controls"><button type="button" disabled={!mappings.some(m => m.suggestion)} onClick={() => change({ mappedIds: mappings.filter(m => m.suggestion).map(m => m.item_id) })}>Select source-linked candidates</button><span>{state.mappedIds?.length || 0} selected</span><label>Find a mapped item<input value={state.mappingFilter || ''} onChange={e => change({ mappingFilter: e.target.value, mappingPage: 0 })} /></label></div>
              <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Coverage mapping candidates"><table><thead><tr><th>Map</th><th>Retained item</th><th>Source relationship</th></tr></thead><tbody>{mappingRows.rows.map(m => <tr key={m.item_id}><td><input type="checkbox" aria-label={`Map ${human(m.kind)} ${m.label}`} checked={state.mappedIds?.includes(m.item_id) || false} onChange={() => change({ mappedIds: toggle(state.mappedIds || [], m.item_id) })} /></td><td>{m.label}<small>{human(m.kind)} · {human(m.origin)}</small></td><td>{m.suggestion ? human(m.suggestion) : 'No matching source reference'}</td></tr>)}</tbody></table></div><Pager value={mappingRows} onChange={mappingPage => change({ mappingPage })} label="mapping candidates" />
            </>}
            <label className="bas-scope-attestation"><input type="checkbox" checked={!!state.inspected} onChange={e => change({ inspected: e.target.checked })} />I inspected the original source for this claim and review extent.</label>
            {reviewIdentity}
            <button type="button" disabled={!canRecord || !state.assessment || !state.inspected || (state.assessment === 'applicable_mapped' && !state.mappedIds?.length)} onClick={() => record({ kind: 'record_coverage', scope_event_id: saved.event_id,
              basis, claim, unit: prepared.value.source.unit, assessment: state.assessment, inspected_source: true, mapped_item_ids: state.assessment === 'applicable_mapped' ? state.mappedIds : [] })}>Record coverage decision</button>
          </>}
        </fieldset>}
      </>}
      {tab === 'history' && <>
        <p>Saved history is retained. Read a decision to replay its exact original inputs and compare current dependencies.</p>
        <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Scope decision history"><table><thead><tr><th>Decision</th><th>Reviewer / origin</th><th>Reason</th><th>Read</th></tr></thead><tbody>{historyRows.rows.map(e => <tr key={e.event_id} data-scope-event-id={e.event_id}><td>{human(e.action.kind)}<small>{e.created_at}</small></td><td>{e.reviewer}<small>{human(e.origin)}</small></td><td>{e.reason}</td><td><button type="button" disabled={busy} onClick={() => inspectDecision(e.event_id)}>Read decision</button></td></tr>)}</tbody></table></div><Pager value={historyRows} onChange={historyPage => change({ historyPage })} label="decisions" />
        {activeReplay && <section aria-label="Replayed scope decision"><h3>{human(activeReplay.event.action.kind)}</h3><p>{human(activeReplay.decision_state)} · {human(activeReplay.state)} · {human(activeReplay.acceptance)}</p>
          {activeReplay.current_error && <p role="status">Current inputs: {activeReplay.current_error}</p>}
          {!!activeReplay.potential_conflict_event_ids.length && <p role="alert">{activeReplay.potential_conflict_event_ids.length} potentially conflicting overlapping decisions. They remain unresolved; review each original decision.</p>}
          {activeReplay.potential_conflict_event_ids.map((id, i) => <button key={id} type="button" disabled={busy} onClick={() => inspectDecision(id)}>Read overlapping decision {i + 1}</button>)}
          {'inventory' in activeReplay.original.value ? <ScopeSummary view={activeReplay.original.value} state={state} onChange={change} onSource={source} /> : <>
            <p>Original assessment: {human(activeReplay.original.event.action.assessment)}</p>
            <MappingSummary mappings={activeReplay.original.value.mappings} state={state} onChange={change} />
            <details><summary>Original source text · {activeReplay.original.value.source.spans.length} spans</summary><OriginalText source={activeReplay.original.value.source} state={state} onChange={change} onSource={source} /></details>
          </>}
          {activeReplay.current && activeReplay.state !== 'current_dependencies' && <details><summary>Current inputs for comparison</summary>{'inventory' in activeReplay.current
            ? <ScopeSummary view={activeReplay.current} state={state} onChange={change} onSource={source} />
            : <><MappingSummary mappings={activeReplay.current.mappings} state={state} onChange={change} /><OriginalText source={activeReplay.current.source} state={state} onChange={change} onSource={source} /></>}</details>}
          {reviewIdentity}
          <button type="button" disabled={!canRecord || activeReplay.decision_state !== 'latest' || activeReplay.event.action.kind.startsWith('withdraw_')} onClick={() => record(activeReplay.event.action.kind === 'save_scope'
            ? { kind: 'withdraw_scope', scope_event_id: activeReplay.event.event_id } : { kind: 'withdraw_coverage', coverage_event_id: activeReplay.event.event_id })}>Withdraw decision</button>
          <button type="button" disabled={busy} onClick={() => downloadText('bas-scope-review.json', JSON.stringify(activeReplay, null, 2), 'application/json')}>Export decision evidence</button>
          <p>Export includes the full original/current comparison and exact dependency identities. Use the normal project backup to retain the complete journal and original PDFs.</p>
        </section>}
      </>}
    </>}
  </section>;
}
