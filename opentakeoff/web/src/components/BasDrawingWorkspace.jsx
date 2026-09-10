// Surface-specific forms/navigation. Shared services own all page accounting,
// source comparison and append validation; this component computes no quantities.
import { useEffect, useMemo, useRef, useState } from 'react';
import { verifyBasWorkflow } from '../lib/basWorkflow.ts';
import { replayBasDrawingHistory, basDrawingCapturePages, suggestBasDrawingRevision, compareBasDrawingPages } from '../lib/basDrawingRevision.ts';
import { prepareBasDrawingAction } from '../lib/basDrawingReview.ts';
import './BasDrawingWorkspace.css';

const human = text => String(text).replaceAll('_', ' ');
const pageNumber = ref => ref.page_id.split(':p').at(-1);
export default function BasDrawingWorkspace({ workflow, state = {}, onStateChange, onReview, onOpenCitation, onBack, onCompareRequirements }) {
  const [checked, setChecked] = useState({ input: null, value: null, error: '' });
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const heading = useRef(null), latest = useRef(null), grid = useRef(null), mounted = useRef(false);
  latest.current = { workflow, draft: state.draft, reviewer: state.reviewer, reason: state.reason };
  useEffect(() => { mounted.current = true; heading.current?.focus(); return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let live = true;
    verifyBasWorkflow(workflow).then(value => { if (live) setChecked({ input: workflow, value, error: '' }); })
      .catch(e => { if (live) setChecked({ input: workflow, value: null, error: e.message }); });
    return () => { live = false; };
  }, [workflow]);
  const ready = checked.input === workflow, data = ready ? checked.value : null;
  const replay = useMemo(() => data ? replayBasDrawingHistory(data.captures, data.drawing_events) : null, [data]);
  const change = patch => onStateChange(previous => ({ ...previous, ...patch }));
  const draft = state.draft, action = draft?.action;
  const inputKey = JSON.stringify({ draft, reviewer: state.reviewer || '', reason: state.reason || '' });
  const stale = !!draft && !!replay && draft.start_head !== replay.head;
  const validPreview = !!state.preview && state.preview.input === inputKey && state.preview.head === replay?.head;
  const captures = data?.captures || [], sets = [...(replay?.source_sets.values() || [])];
  const captureId = state.captureId || data?.current_capture_id || captures.at(-1)?.capture_id;
  const capture = captures.find(c => c.capture_id === captureId) || captures.at(-1);
  // Inventory limits belong to the shared service. Display its refusal without
  // letting an oversized retained capture crash the presentation surface.
  const inventory = useMemo(() => {
    try { return { pages: capture ? basDrawingCapturePages(capture) : [], error: '' }; }
    catch (e) { return { pages: [], error: e.message }; }
  }, [capture]);
  const baseline = replay?.source_sets.get(state.baselineId) || sets.at(-1);
  const selectedEvent = data?.drawing_events?.find(e => e.event_id === state.eventId);
  const captureName = c => `${c.sources[0].names[0]} · ${c.capture_id.slice(0, 8)}`;
  const refName = ref => {
    const c = captures.find(c => c.capture_id === ref.capture_id);
    const source = c?.sources.find(s => ref.page_id.startsWith(`${s.source_id}:p`));
    return `${source?.names[0] || 'Retained original'} · PDF page ${pageNumber(ref)}`;
  };
  const edit = update => {
    setError('');
    const next = structuredClone(action); update(next);
    change({ draft: { ...draft, action: next }, preview: null, comparison: null });
  };
  const start = createAction => {
    try {
      const a = createAction();
      setError(''); change({ draft: { operation_id: crypto.randomUUID(), start_head: replay.head, action: a },
        reason: '', preview: null, rowPage: 0, incomingPage: 0, comparison: null, notice: '' });
    } catch (e) { setError(e.message); }
  };
  async function source(ref) {
    setError('');
    try {
      const result = await onOpenCitation({ page_id: ref.page_id, original_source_only: true });
      if (result?.error) throw new Error(result.error);
    } catch (e) { setError(e.message); }
  }
  async function preview() {
    setBusy('Validating page accounting…'); setError('');
    const input = latest.current, key = inputKey;
    try {
      if (!input.reviewer?.trim() || !input.reason?.trim()) throw new Error('Enter a reviewer label and decision reason before previewing.');
      const value = await prepareBasDrawingAction(input.workflow, input.draft.action);
      if (!mounted.current) return;
      if (latest.current.workflow !== input.workflow || latest.current.draft !== input.draft
        || latest.current.reviewer !== input.reviewer || latest.current.reason !== input.reason) throw new Error('The draft changed during preview. Preview the current inputs again.');
      change({ preview: { input: key, head: value.expected_head, value } });
    } catch (e) { if (mounted.current) setError(e.message); } finally { if (mounted.current) setBusy(''); }
  }
  async function record() {
    if (!validPreview || stale) return;
    setBusy('Recording reviewed page accounting…'); setError('');
    try {
      const next = await onReview({ operation_id: draft.operation_id, action,
        expected_head: state.preview.value.expected_head, expected_dependencies: state.preview.value.expected_dependencies,
        reviewer: state.reviewer, reason: state.reason });
      const event = next.drawing_events.find(e => e.operation_id === draft.operation_id);
      if (!mounted.current) return;
      change({ draft: null, preview: null, eventId: event.event_id, rowPage: 0, comparison: null,
        notice: 'Page accounting recorded. Project autosave retains this history; this is not an approved takeoff.' });
    } catch (e) { if (mounted.current) setError(e.message); } finally { if (mounted.current) setBusy(''); }
  }
  const pageRows = useMemo(() => {
    if (!data) return [];
    if (action?.kind === 'create_source_set') return inventory.pages;
    const a = action || selectedEvent?.action;
    if (a?.kind === 'review_revision') return a.baseline;
    return a?.pages || [];
  }, [data, inventory.pages, action, selectedEvent]);
  const rowPage = Math.max(0, Math.min(state.rowPage || 0, Math.ceil(pageRows.length / 25) - 1));
  useEffect(() => { if (ready && grid.current) grid.current.scrollTop = state.scroll || 0; }, [ready, state.scroll, rowPage]);
  const drawingAction = action || selectedEvent?.action;
  const incomingCapture = drawingAction?.kind === 'review_revision' ? captures.find(c => c.capture_id === drawingAction.incoming_capture_id) : null;
  const incomingPages = incomingCapture ? basDrawingCapturePages(incomingCapture) : [];
  const counterpart = (entry, value) => edit(a => {
    const old = a.baseline.find(b => b.page.page_id === entry.page.page_id);
    // Form wiring only: keep both halves of the explicit selection together.
    // The shared validator still rejects duplicates/foreign/nonreciprocal pairs.
    const previous = a.incoming.find(p => p.page_id === old.incoming_page_id);
    if (previous) { previous.disposition = 'unresolved'; previous.baseline_page_id = null; previous.reason = 'Replacement selection withdrawn; review required.'; }
    old.incoming_page_id = value || null; old.disposition = value ? 'replaced' : 'unresolved';
    old.reason = value ? 'Explicitly selected replacement page.' : 'No replacement selected; review required.';
    if (value) { const next = a.incoming.find(p => p.page_id === value); next.disposition = 'replacement'; next.baseline_page_id = old.page.page_id; next.reason = 'Explicitly paired with this baseline page.'; }
  });
  const compare = (before, after) => {
    try { setError(''); change({ comparison: compareBasDrawingPages(data.captures, before, after) }); }
    catch (e) { setError(e.message); }
  };
  const historyPage = state.historyPage || 0, history = [...(data?.drawing_events || [])].reverse();
  const incomingPage = state.incomingPage || 0;
  return <section className="bas-point-workspace bas-project-review bas-drawing-workspace" aria-label="Drawing changes" aria-busy={!!busy}>
    <div className="bas-point-heading"><h2 ref={heading} tabIndex={-1}>Drawing changes</h2><span>Retained source versions</span><button type="button" disabled={!!busy} onClick={onCompareRequirements}>Compare requirements &amp; quantities</button><button type="button" onClick={onBack}>← Back to findings</button></div>
    <p className="bas-review-boundary">Page correspondence only. Source text, quantities and approval impact stay separate; no installed counts or approval are created here.</p>
    {!ready ? <p role="status">Checking retained drawing history…</p> : checked.error ? <p role="alert">{checked.error}</p> : <>
      {state.notice && <p role="status">{state.notice}</p>}
      <div className="bas-point-controls">
        <label>Evidence capture<select aria-label="Evidence capture" value={capture?.capture_id || ''} disabled={!!busy || action?.kind === 'review_revision'} onChange={e => change({ captureId: e.target.value, rowPage: 0 })}>{captures.map(c => <option key={c.capture_id} value={c.capture_id}>{captureName(c)}</option>)}</select></label>
        {!draft && <><label>Baseline source set<select aria-label="Baseline source set" value={baseline?.source_set_id || ''} onChange={e => change({ baselineId: e.target.value })}><option value="" disabled>No source set yet</option>{sets.map(s => <option key={s.source_set_id} value={s.source_set_id}>{s.name} · {s.pages.length} pages · {s.source_set_id.slice(0, 8)}</option>)}</select></label>
        <label>Incoming delivery<select aria-label="Incoming delivery" value={state.deliveryMode || 'partial_addendum'} onChange={e => change({ deliveryMode: e.target.value })}><option value="partial_addendum">Partial addendum — retain omitted pages for review</option><option value="replacement_set">Replacement set — review every omitted page</option></select></label></>}
      </div>
      {inventory.error && <p role="alert">{inventory.error}. Select a supported capture; no pages have been omitted silently.</p>}
      {!draft && <div className="bas-point-controls"><button type="button" disabled={!capture || !!busy || !!inventory.error} onClick={() => start(() => ({ kind: 'create_source_set', name: `Source set ${sets.length + 1}`, pages: inventory.pages }))}>New source set</button><button type="button" disabled={!capture || !baseline || !!busy || !!inventory.error} onClick={() => start(() => suggestBasDrawingRevision(baseline, capture, state.deliveryMode || 'partial_addendum', `${baseline.name} · revision`))}>Start revision review</button></div>}
      {draft ? <>
        <div className="bas-point-controls"><label>Source-set name<input aria-label="Source-set name" maxLength={256} value={action.name} disabled={!!busy} onChange={e => edit(a => { a.name = e.target.value; })} /></label><label>Reviewer (self-declared)<input aria-label="Reviewer (self-declared)" maxLength={256} value={state.reviewer || ''} disabled={!!busy} onChange={e => change({ reviewer: e.target.value, preview: null })} /></label></div>
        <label className="bas-sequence-select">Decision reason<textarea aria-label="Decision reason" maxLength={4096} value={state.reason || ''} disabled={!!busy} onChange={e => change({ reason: e.target.value, preview: null })} /></label>
        {action.kind === 'create_source_set' ? <div className="bas-point-controls"><strong>{action.pages.length} selected pages across {new Set(action.pages.map(p => p.capture_id)).size} captures</strong><button type="button" disabled={!!busy || !!inventory.error} onClick={() => edit(a => { const selected = new Set(a.pages.map(p => p.page_id)); a.pages.push(...inventory.pages.filter(p => !selected.has(p.page_id))); })}>Include pages from this capture</button><button type="button" disabled={!!busy} onClick={() => edit(a => { a.pages = a.pages.filter(p => p.capture_id !== capture.capture_id); })}>Clear this capture's selection</button></div>
          : <p className="bas-review-boundary">Baseline: {replay.source_sets.get(action.baseline_source_set_id)?.name} · {human(action.mode)}. Confirm retained pages as well as replacements, removals and additions.</p>}
        {stale && <p role="alert">Drawing history changed after this draft began. The draft is retained; discard it and start a new review against the current history.</p>}
      </> : selectedEvent && <div className="bas-drawing-record"><h3>{selectedEvent.action.name}</h3><p>{human(selectedEvent.origin)} · {selectedEvent.reviewer} (self-declared) · {selectedEvent.created_at}</p><p>{selectedEvent.reason}</p><p>{replay.source_sets.has(selectedEvent.event_id) ? `${replay.source_sets.get(selectedEvent.event_id).pages.length} pages in the resulting source set` : 'Unresolved accounting — no complete source set published'}</p></div>}
      {drawingAction && <>
        <div ref={grid} className="bas-point-grid bas-drawing-grid" tabIndex={0} role="region" aria-label="Scrollable drawing page accounting" onScroll={e => change({ scroll: e.currentTarget.scrollTop })}>
          <table aria-label="Drawing page accounting"><thead><tr><th scope="col">Original page</th><th scope="col">{drawingAction.kind === 'create_source_set' ? 'Included in source set' : 'Reviewed disposition'}</th><th scope="col">{drawingAction.kind === 'create_source_set' ? 'Capture binding' : 'Replacement / evidence'}</th></tr></thead><tbody>
            {pageRows.slice(rowPage * 25, (rowPage + 1) * 25).map((entry, index) => {
              const ref = drawingAction.kind === 'review_revision' ? entry.page : entry;
              const existing = action?.kind === 'create_source_set' ? action.pages.find(p => p.page_id === ref.page_id) : null;
              return <tr key={`${ref.capture_id}:${ref.page_id}`}><th scope="row"><button className="bas-point-cell" type="button" onClick={() => source(ref)}>{refName(ref)}</button></th>
                {drawingAction.kind === 'create_source_set' ? <><td>{draft ? <input aria-label={`Include PDF page ${pageNumber(ref)} from ${ref.capture_id.slice(0, 8)}`} type="checkbox" checked={!!existing} disabled={!!busy || (!!existing && existing.capture_id !== ref.capture_id)} onChange={e => edit(a => { a.pages = e.target.checked ? [...a.pages, ref] : a.pages.filter(p => p.page_id !== ref.page_id); })} /> : 'Included'}</td><td>{(existing || ref).capture_id.slice(0, 12)}{existing && existing.capture_id !== ref.capture_id && <span> · selected from another capture; clear that selection to rebind</span>}</td></>
                  : <><td>{draft ? <select aria-label={`Disposition for baseline page ${rowPage * 25 + index + 1}`} disabled={!!busy} value={entry.disposition} onChange={e => {
                    const value = e.target.value;
                    edit(a => {
                      const b = a.baseline.find(p => p.page.page_id === ref.page_id);
                      const linked = a.incoming.filter(p => p.baseline_page_id === ref.page_id);
                      linked.forEach(p => { p.disposition = 'unresolved'; p.baseline_page_id = null; p.reason = 'Baseline disposition changed; review incoming page.'; });
                      b.disposition = value; b.incoming_page_id = null; b.reason = `Explicit ${value} disposition; see decision reason.`;
                    });
                  }}><option value="retained">Retain original</option><option value="replaced">Replace with selected page</option><option value="removed">Remove from this source set</option><option value="unresolved">Unresolved — needs review</option></select> : human(entry.disposition)}<small>{entry.reason}</small></td><td>
                    {draft && entry.disposition === 'replaced' && <select aria-label={`Replacement for baseline page ${rowPage * 25 + index + 1}`} disabled={!!busy} value={entry.incoming_page_id || ''} onChange={e => counterpart(entry, e.target.value)}><option value="">Select exact incoming page</option>{incomingPages.map(p => <option key={p.page_id} value={p.page_id} disabled={action.incoming.some(i => i.page_id === p.page_id && i.baseline_page_id && i.baseline_page_id !== ref.page_id)}>{refName(p)}</option>)}</select>}
                    {entry.incoming_page_id && <div className="bas-drawing-source-actions"><button type="button" onClick={() => source({ capture_id: drawingAction.incoming_capture_id, page_id: entry.incoming_page_id })}>Open replacement</button><button type="button" onClick={() => compare(ref, { capture_id: drawingAction.incoming_capture_id, page_id: entry.incoming_page_id })}>Compare retained evidence</button></div>}
                    {!entry.incoming_page_id && <span>Original source binding retained in history</span>}</td></>}
              </tr>;
            })}
          </tbody></table>
        </div>
        <div className="bas-point-controls"><button type="button" disabled={!rowPage} onClick={() => change({ rowPage: rowPage - 1, scroll: 0 })}>Previous baseline pages</button><span>{Math.min(rowPage * 25 + 1, pageRows.length)}–{Math.min((rowPage + 1) * 25, pageRows.length)} of {pageRows.length}</span><button type="button" disabled={(rowPage + 1) * 25 >= pageRows.length} onClick={() => change({ rowPage: rowPage + 1, scroll: 0 })}>Next baseline pages</button></div>
        {drawingAction.kind === 'review_revision' && <><h3>Incoming page accounting · {drawingAction.incoming.length}</h3><div className="bas-point-grid"><table aria-label="Incoming drawing pages"><thead><tr><th scope="col">Incoming original</th><th scope="col">Disposition</th><th scope="col">Reason</th></tr></thead><tbody>
          {drawingAction.incoming.slice(incomingPage * 25, (incomingPage + 1) * 25).map((p, index) => <tr key={p.page_id}><th scope="row"><button type="button" className="bas-point-cell" onClick={() => source({ capture_id: drawingAction.incoming_capture_id, page_id: p.page_id })}>{refName({ capture_id: drawingAction.incoming_capture_id, page_id: p.page_id })}</button></th><td>{draft && p.disposition !== 'replacement' ? <select aria-label={`Disposition for incoming page ${incomingPage * 25 + index + 1}`} disabled={!!busy} value={p.disposition} onChange={e => edit(a => {
            const next = a.incoming.find(i => i.page_id === p.page_id); next.disposition = e.target.value;
            next.baseline_page_id = next.disposition === 'redundant' ? p.page_id : null;
            next.reason = `Explicit ${e.target.value} disposition; see decision reason.`;
          })}><option value="unresolved">Unresolved — needs review</option><option value="addition">Add to source set</option>{action.baseline.some(b => b.page.page_id === p.page_id && b.disposition === 'retained') && <option value="redundant">Same original page — no addition</option>}</select> : human(p.disposition)}</td><td>{p.reason}</td></tr>)}
        </tbody></table></div><div className="bas-point-controls"><button type="button" disabled={!incomingPage} onClick={() => change({ incomingPage: incomingPage - 1 })}>Previous incoming pages</button><span>{Math.min(incomingPage * 25 + 1, drawingAction.incoming.length)}–{Math.min((incomingPage + 1) * 25, drawingAction.incoming.length)} of {drawingAction.incoming.length}</span><button type="button" disabled={(incomingPage + 1) * 25 >= drawingAction.incoming.length} onClick={() => change({ incomingPage: incomingPage + 1 })}>Next incoming pages</button></div></>}
      </>}
      {state.comparison && <div className="bas-drawing-record" role="region" aria-label="Retained page comparison"><h3>Retained evidence comparison</h3><div className="bas-point-controls"><button type="button" onClick={() => source(state.comparison.before)}>Open baseline original</button><button type="button" onClick={() => source(state.comparison.after)}>Open incoming original</button><button type="button" onClick={() => change({ comparison: null })}>Close comparison</button></div><dl className="bas-review-facts"><dt>Original page identity</dt><dd>{human(state.comparison.source_identity)}</dd><dt>Retained text and page frame</dt><dd>{human(state.comparison.retained_text_geometry)}</dd><dt>Comparison limit</dt><dd>Available extracted text only; not full-PDF ink equivalence.</dd><dt>Quantity and approval impact</dt><dd>Not assessed</dd></dl></div>}
      {draft && <div className="bas-drawing-save"><div className="bas-point-controls"><button type="button" disabled={!!busy || stale} onClick={preview}>Preview page accounting</button><button type="button" disabled={!!busy || stale || !validPreview || !onReview} onClick={record}>Record page accounting</button><button type="button" disabled={!!busy} onClick={() => { setError(''); change({ draft: null, preview: null, comparison: null }); }}>Discard draft</button></div>{validPreview && <p role="status">{state.preview.value.accounting_status === 'complete' ? `${state.preview.value.source_page_count} pages in the proposed source set.` : `${state.preview.value.unresolved_pages} page decisions unresolved; recording preserves review history but publishes no complete source set.`} No approval or quantity change.</p>}</div>}
      {!draft && <><h3>Decision history · {history.length}</h3>{!history.length ? <p>No source set has been recorded. Select a retained capture to begin.</p> : <div className="bas-point-grid"><table aria-label="Drawing decision history"><thead><tr><th scope="col">Review</th><th scope="col">Accounting</th><th scope="col">Recorded by</th></tr></thead><tbody>{history.slice(historyPage * 20, (historyPage + 1) * 20).map(e => <tr key={e.event_id} data-selected={state.eventId === e.event_id}><th scope="row"><button type="button" className="bas-point-cell" onClick={() => change({ eventId: e.event_id, rowPage: 0, incomingPage: 0, comparison: null })}>{e.action.name}</button></th><td>{replay.source_sets.has(e.event_id) ? `${replay.source_sets.get(e.event_id).pages.length} pages` : 'Unresolved — no source set'}</td><td>{e.reviewer} · {human(e.origin)}<small>{e.created_at}</small></td></tr>)}</tbody></table></div>}{history.length > 20 && <div className="bas-point-controls"><button type="button" disabled={!historyPage} onClick={() => change({ historyPage: historyPage - 1 })}>Previous reviews</button><span>{historyPage + 1} / {Math.ceil(history.length / 20)}</span><button type="button" disabled={(historyPage + 1) * 20 >= history.length} onClick={() => change({ historyPage: historyPage + 1 })}>Next reviews</button></div>}</>}
    </>}
    {busy && <p role="status">{busy}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
