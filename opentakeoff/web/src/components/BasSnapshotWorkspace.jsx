/** Surface-specific explicit approval and historical reader. Shared services
 * decide readiness/content; browser operations never modify working annotations. */
import { useEffect, useRef, useState } from 'react';
import { catalogBasScope } from '../lib/basScopeCatalog.ts';
import { createBasSnapshotBrowser } from '../lib/basSnapshotBrowser.js';
import { store } from '../lib/store.js';
import { downloadText } from '../lib/totals.js';
import { scopeWindow } from './basScopeEditorState.ts';
import { basSnapshotLifecycleExport } from '../lib/basSnapshotLifecycle.ts';
import BasSnapshotContents from './BasSnapshotContents.jsx';
import BasSourceReader from './BasSourceReader.jsx';
import './BasSnapshotWorkspace.css';

export default function BasSnapshotWorkspace({ workflow, restoreContext, state = {}, onStateChange, onBack, onScopeReview }) {
  const adapter = store;
  const client = useRef(null), mounted = useRef(false);
  const [catalog, setCatalog] = useState(null), [catalogError, setCatalogError] = useState('');
  const [preview, setPreview] = useState(null), [opened, setOpened] = useState(null);
  const [listing, setListing] = useState(null), [cursors, setCursors] = useState([null]);
  const [busy, setBusy] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false), [blockerPage, setBlockerPage] = useState(0);
  const [currentness, setCurrentness] = useState(null), [lifecycleConfirmed, setLifecycleConfirmed] = useState(false);
  const [source, setSource] = useState(null);
  const operation = useRef(null), retry = useRef(null), heading = useRef(null), fileInput = useRef(null), lifecycleFileInput = useRef(null), sourceReturn = useRef(null);
  const change = patch => onStateChange(previous => ({ ...previous, ...patch }));
  const tab = workflow ? state.tab || 'prepare' : 'saved';
  useEffect(() => {
    const current = createBasSnapshotBrowser({ adapter, readWorkspace: () => restoreContext?.current?.read() });
    client.current = current; mounted.current = true; heading.current?.focus();
    return () => { mounted.current = false; operation.current?.abort(); current.dispose(); };
  }, [adapter, restoreContext]);
  useEffect(() => {
    const abort = new AbortController(); setCatalog(null); setCatalogError(''); setPreview(null); setConfirmed(false); setCurrentness(null); setLifecycleConfirmed(false); retry.current = null;
    if (workflow) catalogBasScope(workflow, {}, abort.signal).then(value => { if (!abort.signal.aborted) setCatalog(value); })
      .catch(e => { if (!abort.signal.aborted) setCatalogError(e.message); });
    return () => { abort.abort(); operation.current?.abort(); };
  }, [workflow]);
  useEffect(() => { if (!source && sourceReturn.current) { sourceReturn.current.focus(); sourceReturn.current = null; } }, [source]);
  async function perform(label, run) {
    if (operation.current) return;
    const abort = new AbortController(); operation.current = abort; setBusy(label); setError(''); setNotice(label);
    const current = () => mounted.current && operation.current === abort && store === adapter;
    try { await run(abort.signal, () => { abort.signal.throwIfAborted(); if (!current()) throw new Error('Snapshot workspace changed.'); }); }
    catch (e) { if (current()) { setNotice(''); setError(abort.signal.aborted
      ? 'Operation cancelled. Refresh saved snapshots to check whether a save had already completed.' : e.message); } }
    finally { if (current()) { operation.current = null; setBusy(''); } }
  }
  async function list(signal, guard, after = null) {
    const result = await client.current.list({ after, signal }); guard(); setListing(result);
  }
  const savedTab = () => {
    change({ tab: 'saved' }); setOpened(null); setPreview(null); setConfirmed(false); setCursors([null]);
    perform('Loading saved snapshot metadata…', async (signal, guard) => { await list(signal, guard); setNotice('Select a snapshot to verify its original bytes and saved calculations. Metadata alone is not verification.'); });
  };
  const scopes = catalog?.scopes.filter(e => e.action.kind === 'save_scope') || [];
  const selected = scopes.find(e => e.event_id === state.scopeEventId);
  async function checkReadiness() {
    setPreview(null); setConfirmed(false); setBlockerPage(0); setCurrentness(null); setLifecycleConfirmed(false); retry.current = null;
    await perform('Checking original PDFs, source coverage, findings and shared Python calculations…', async (signal, guard) => {
      const result = await client.current.preview(selected.event_id, { signal }); guard();
      setPreview(result); setNotice(result.readiness.status === 'blocked'
        ? 'This scope is blocked. Resolve the listed inputs, then check readiness again.'
        : 'This scope is ready for your explicit approval. Nothing has been approved or saved as a snapshot yet.');
    });
  }
  async function approve(event) {
    event.preventDefault(); if (!preview || !confirmed) return;
    const identity = JSON.stringify([state.scopeEventId, state.reviewer, state.reason]);
    if (retry.current?.identity !== identity) retry.current = { identity, declaration: {
      operation_id: crypto.randomUUID(), reviewer: state.reviewer, reason: state.reason, declared_at: new Date().toISOString(),
    } };
    await perform('Rechecking exact inputs and saving the scoped snapshot with its original PDFs…', async (signal, guard) => {
      const result = await client.current.approve(preview, retry.current.declaration, { signal }); guard();
      setOpened(result); setPreview(null); setConfirmed(false); change({ tab: 'saved', snapshotId: result.record.snapshot_id,
        approvedWorkflow: workflow, verifiedCurrentWorkflow: workflow });
      setNotice('Scoped snapshot saved in this browser project. Working annotations were not changed. Download its evidence ZIP for external backup.');
      setListing(null); setCursors([null]);
    });
  }
  const open = id => perform('Verifying the saved snapshot and its historical originals…', async (signal, guard) => {
    setOpened(null); setCurrentness(null); setLifecycleConfirmed(false); const result = await client.current.open(id, { signal }); guard(); setOpened(result);
    change({ snapshotId: id, approvedWorkflow: null, verifiedCurrentWorkflow: null });
    setNotice(`Historical snapshot verified. Lifecycle status: ${result.lifecycle.state.status}. Current working applicability has not been checked.`);
  });
  const exportSnapshot = () => perform('Replaying the snapshot and preparing its original-source evidence ZIP…', async (signal, guard) => {
    const result = await client.current.export(opened.record.snapshot_id, { signal }); guard(); downloadText(result.filename, result.blob, 'application/zip');
    setNotice('Snapshot evidence ZIP downloaded. Download lifecycle JSON separately to retain later revocation/supersession and this session’s currentness check.');
  });
  const exportLifecycle = () => {
    const value = basSnapshotLifecycleExport(opened.record.snapshot_id, opened.lifecycle,
      currentness || { status: 'not_evaluated' });
    downloadText(`${opened.record.snapshot_id}.lifecycle.json`, JSON.stringify(value, null, 2), 'application/json');
    setNotice('Snapshot lifecycle JSON downloaded. Keep it beside the immutable evidence ZIP.');
  };
  const importSnapshot = file => perform('Verifying the imported historical snapshot before local storage…', async (signal, guard) => {
    const result = await client.current.import(file, { signal }); guard(); setOpened(result); setPreview(null); setListing(null); setCursors([null]); setCurrentness(null); setLifecycleConfirmed(false);
    change({ tab: 'saved', snapshotId: result.record.snapshot_id });
    setNotice('Historical snapshot imported and verified. Your working annotations and current drawing set were not replaced.');
  });
  const importLifecycle = file => perform('Verifying and importing snapshot lifecycle history…', async (signal, guard) => {
    const result = await client.current.importLifecycle(file, { signal }); guard();
    setOpened(result); setPreview(null); setListing(null); setCursors([null]); setCurrentness(null); setLifecycleConfirmed(false);
    change({ tab: 'saved', snapshotId: result.record.snapshot_id });
    setNotice(`Snapshot lifecycle imported and verified. Status: ${result.lifecycle.state.status}. Current working applicability has not been checked.`);
  });
  const checkCurrentness = () => perform('Comparing the verified snapshot scope with the current saved workflow…', async (signal, guard) => {
    const result = await client.current.currentness(opened.plan, { signal }); guard(); setCurrentness(result);
    change({ verifiedCurrentWorkflow: result.status === 'current_for_reviewed_scope' ? workflow : null });
    setNotice(result.status === 'current_for_reviewed_scope'
      ? 'The saved approval still applies to this exact reviewed scope. This is not whole-project or installed-quantity approval.'
      : result.status === 'not_current_lifecycle' ? `This snapshot is ${result.lifecycle.status} and is not current.`
        : 'The saved approval does not apply to the current reviewed scope. Resolve the reported blockers and create a new snapshot.');
  });
  async function recordLifecycle(event) {
    event.preventDefault(); if (!opened || !lifecycleConfirmed) return;
    const kind = state.lifecycleKind || 'revoke';
    const action = kind === 'supersede' ? { kind, successor_snapshot_id: state.successorSnapshotId } : { kind };
    await perform(`Recording snapshot ${kind}…`, async (signal, guard) => {
      const result = await client.current.recordLifecycle(opened.plan, { operation_id: crypto.randomUUID(),
        expected_head: opened.lifecycle.state.head, reviewer: state.lifecycleReviewer, reason: state.lifecycleReason,
        declared_at: new Date().toISOString(), action }, { signal }); guard();
      setOpened(result); setCurrentness(null); setLifecycleConfirmed(false);
      setNotice(`Snapshot ${result.lifecycle.state.status}. The original approval and evidence remain immutable and inspectable.`);
    });
  }
  function showSource(ref) {
    sourceReturn.current = document.activeElement;
    setSource({ page_id: ref.page_id, ...(ref.bbox_px ? { bbox_px: ref.bbox_px } : {}), value: ref.text || '' });
  }
  const readiness = tab === 'prepare' ? preview?.readiness : opened?.readiness;
  const sourceWorkflow = tab === 'saved' && opened ? opened.workflow : workflow;
  const blockers = scopeWindow(readiness?.blockers || [], blockerPage);
  // Preserve the table/selection/draft while reading an original in this same
  // workspace. Historical citations use the snapshot's owned workflow, not today's.
  return <section className="bas-point-workspace bas-project-review bas-snapshot-workspace" aria-label="BAS snapshots">
    {source && <BasSourceReader workflow={sourceWorkflow} request={source} adapter={adapter} onBack={() => setSource(null)} />}
    <div hidden={!!source} className="bas-snapshot-body">
      <div className="bas-point-heading"><button type="button" onClick={onBack}>← Back to findings</button><h2 ref={heading} tabIndex={-1}>Snapshots</h2></div>
      <p className="bas-review-boundary">Approve a specific reviewed scope, not the entire design or an installed quantity. Browser-local, unsigned records; reviewer names are self-declared.</p>
      <nav className="bas-point-controls" aria-label="Snapshot workflow">
        <button type="button" disabled={!!busy || !workflow} aria-pressed={tab === 'prepare'} onClick={() => { change({ tab: 'prepare' }); setNotice(''); setError(''); }}>Prepare snapshot</button>
        <button type="button" disabled={!!busy} aria-pressed={tab === 'saved'} onClick={savedTab}>Saved snapshots</button>
        <button type="button" disabled={!!busy} onClick={() => fileInput.current?.click()}>Import historical snapshot</button>
        <button type="button" disabled={!!busy} onClick={() => lifecycleFileInput.current?.click()}>Import lifecycle JSON</button>
        {busy && <button type="button" onClick={() => operation.current?.abort()}>Cancel snapshot operation</button>}
      </nav>
      <input ref={fileInput} name="bas-snapshot-import" type="file" accept=".zip" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) importSnapshot(file); }} />
      <input ref={lifecycleFileInput} name="bas-snapshot-lifecycle-import" type="file" accept=".json,application/json" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) importLifecycle(file); }} />
      <div role="status" aria-atomic="true" className="bas-snapshot-status">{notice}</div>
      {error && <p role="alert">{error}</p>}
      {tab === 'prepare' && <>
        {catalogError && <p role="alert">Scope catalog unavailable: {catalogError}</p>}
        <div className="bas-point-controls"><label>Reviewed scope<select aria-label="Reviewed scope" value={selected?.event_id || ''} disabled={!catalog || !!busy} onChange={e => {
          change({ scopeEventId: e.target.value }); setPreview(null); setConfirmed(false); setNotice(''); retry.current = null;
        }}><option value="">{catalog ? 'Select a saved scope' : 'Loading saved scopes…'}</option>
          {scopes.map(e => <option key={e.event_id} value={e.event_id}>{e.action.specification.name} · {e.event_id.slice(0, 8)}{e.origin === 'agent_proposal' ? ' · proposal, requires human review' : ''}</option>)}
        </select></label><button type="button" disabled={!selected || !!busy} onClick={checkReadiness}>Check readiness</button>
          <button type="button" disabled={!!busy} onClick={onScopeReview}>Scope &amp; coverage</button></div>
        {catalog && !scopes.length && <p>Save a scope and review its source coverage first. No scope or approval is inferred from the current sheet.</p>}
        {!!readiness?.blockers.length && <section aria-label="Snapshot blockers"><h3>Resolve before approval · {readiness.blockers.length}</h3>
          <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Blocking inputs"><table><thead><tr><th>Required action</th><th>Evidence / code</th></tr></thead><tbody>
            {blockers.rows.map((b, i) => <tr key={i}><td>{b.explanation}</td><td>{b.page_id && <button type="button" onClick={() => showSource(b)}>View original</button>}<small>{b.code}</small></td></tr>)}
          </tbody></table></div><div className="bas-point-controls"><button type="button" disabled={!blockers.page} onClick={() => setBlockerPage(blockers.page - 1)}>Previous blockers</button><span>{blockers.page + 1} / {Math.ceil(blockers.total / 50)}</span><button type="button" disabled={(blockers.page + 1) * 50 >= blockers.total} onClick={() => setBlockerPage(blockers.page + 1)}>Next blockers</button></div>
        </section>}
      </>}
      {tab === 'saved' && !opened && <section aria-label="Saved snapshot list">
        <p>Metadata only until reopened. A stored declaration does not establish that it still applies to today’s work.</p>
        <button type="button" disabled={!!busy} onClick={() => { setCursors([null]); perform('Refreshing saved snapshots…', async (signal, guard) => { await list(signal, guard); setNotice('Snapshot list refreshed; select a record to verify it.'); }); }}>Refresh saved snapshots</button>
        <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Stored snapshot metadata"><table><thead><tr><th>Declared date / reviewer</th><th>Snapshot identity</th><th>Verify</th></tr></thead><tbody>
          {(listing?.items || []).map(s => <tr key={s.snapshot_id}><th scope="row">{s.declared_at}<small>{s.reviewer} · self-declared</small></th><td><code>{s.snapshot_id}</code><small>{s.source_count} original versions · not replayed</small></td><td><button type="button" disabled={!!busy} onClick={() => open(s.snapshot_id)}>Open snapshot</button></td></tr>)}
        </tbody></table></div>
        {listing && !listing.items.length && <p>No snapshots stored in this browser project.</p>}
        <div className="bas-point-controls"><button type="button" disabled={!!busy || cursors.length < 2} onClick={() => perform('Loading previous snapshots…', async (signal, guard) => {
          const next = cursors.slice(0, -1); await list(signal, guard, next.at(-1)); setCursors(next); setNotice('Metadata loaded.');
        })}>Previous snapshots</button><button type="button" disabled={!!busy || !listing?.next_cursor} onClick={() => perform('Loading more snapshots…', async (signal, guard) => {
          const cursor = listing.next_cursor; await list(signal, guard, cursor); setCursors([...cursors, cursor]); setNotice('Metadata loaded.');
        })}>Next snapshots</button></div>
      </section>}
      {tab === 'saved' && opened && <section aria-label="Verified historical snapshot" className="bas-snapshot-declaration">
        <div className="bas-point-heading"><h3>{opened.readiness.scope.specification.name}</h3><div className="bas-point-controls"><button type="button" disabled={!!busy} onClick={exportSnapshot}>Download snapshot evidence ZIP</button><button type="button" disabled={!!busy} onClick={exportLifecycle}>Download lifecycle JSON</button></div></div>
        <p><strong>Verified historical scope · {opened.lifecycle?.state.status || 'approved'} · {currentness?.status?.replaceAll('_', ' ') || 'current applicability not evaluated'}</strong></p>
        <p>{opened.record.snapshot.declaration.reviewer} · {opened.record.snapshot.declaration.declared_at} (self-declared, local time record)</p>
        <p>{opened.record.snapshot.declaration.reason}</p>
        {opened.lifecycle?.state.terminal_event && <p role="status"><strong>{opened.lifecycle.state.status}</strong> by {opened.lifecycle.state.terminal_event.declaration.reviewer} on {opened.lifecycle.state.terminal_event.declaration.declared_at}: {opened.lifecycle.state.terminal_event.declaration.reason}{opened.lifecycle.state.successor_snapshot_id ? ` · successor ${opened.lifecycle.state.successor_snapshot_id}` : ''}</p>}
        <div className="bas-point-controls"><button type="button" disabled={!!busy} onClick={checkCurrentness}>Check against current saved work</button></div>
        {currentness && <details open><summary>Currentness result</summary><p>{currentness.status.replaceAll('_', ' ')} · readiness {currentness.readiness_status.replaceAll('_', ' ')}</p>
          {!!currentness.blocker_codes.length && <ul>{currentness.blocker_codes.map(code => <li key={code}><code>{code}</code></li>)}</ul>}
          <p>Applies only to the reviewed scope. It never certifies the whole project or an installed quantity.</p></details>}
        <details><summary>Snapshot identity and guarantees</summary><code>{opened.record.snapshot_id}</code><p>Originals and saved calculations were checked on this opening. This is local tamper detection, not authenticated identity or server-enforced immutability. Currentness is recalculated only when requested. Keep both the evidence ZIP and lifecycle JSON outside browser storage.</p></details>
        {opened.lifecycle?.state.status === 'approved' && <form className="bas-snapshot-approval" onSubmit={recordLifecycle}>
          <fieldset disabled={!!busy}><legend>Revoke or supersede this snapshot</legend>
            <label>Release action<select value={state.lifecycleKind || 'revoke'} onChange={e => { change({ lifecycleKind: e.target.value }); setLifecycleConfirmed(false); }}><option value="revoke">Revoke</option><option value="supersede">Supersede with another snapshot</option></select></label>
            {state.lifecycleKind === 'supersede' && <label>Successor snapshot ID<input required pattern="[a-f0-9]{64}" maxLength={64} value={state.successorSnapshotId || ''} onChange={e => { change({ successorSnapshotId: e.target.value }); setLifecycleConfirmed(false); }} /></label>}
            <label>Reviewer (self-declared)<input required maxLength={512} value={state.lifecycleReviewer || ''} onChange={e => { change({ lifecycleReviewer: e.target.value }); setLifecycleConfirmed(false); }} /></label>
            <label>Reason<textarea required maxLength={8192} value={state.lifecycleReason || ''} onChange={e => { change({ lifecycleReason: e.target.value }); setLifecycleConfirmed(false); }} /></label>
            <label className="bas-snapshot-confirm"><input type="checkbox" checked={lifecycleConfirmed} onChange={e => setLifecycleConfirmed(e.target.checked)} />I understand this append-only action leaves the historical approval intact but makes it non-current.</label>
            <button type="submit" disabled={!lifecycleConfirmed || !state.lifecycleReviewer?.trim() || !state.lifecycleReason?.trim()
              || (state.lifecycleKind === 'supersede' && !/^[a-f0-9]{64}$/.test(state.successorSnapshotId || ''))}>Record {state.lifecycleKind || 'revoke'}</button>
          </fieldset>
        </form>}
      </section>}
      {readiness && <>
        <p className="bas-review-boundary">{readiness.scope.claims.length} included claims · {readiness.scope.exclusions.length} explicit exclusions · {readiness.sources.length} original versions · {readiness.replay?.calculation_verification === 'no_saved_calculations' ? 'No saved calculations to replay' : readiness.replay ? 'Saved calculations matched shared Python' : 'Calculations not verified'}</p>
        <BasSnapshotContents key={tab === 'saved' ? opened.record.snapshot_id : state.scopeEventId} readiness={readiness} onSource={showSource} />
      </>}
      {tab === 'prepare' && readiness?.status === 'ready_for_explicit_approval' && <form className="bas-snapshot-approval" onSubmit={approve}>
        <fieldset disabled={!!busy}><legend>Explicit approval of this scope</legend>
          <label>Reviewer (self-declared)<input required maxLength={512} value={state.reviewer || ''} onChange={e => { change({ reviewer: e.target.value }); setConfirmed(false); }} /></label>
          <label>Approval reason<textarea required maxLength={8192} value={state.reason || ''} onChange={e => { change({ reason: e.target.value }); setConfirmed(false); }} /></label>
          <label className="bas-snapshot-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I reviewed the included claims, exclusions and findings. Approve only this scope, not the whole project or an installed count.</label>
          <button type="submit" disabled={!confirmed || !state.reviewer?.trim() || !state.reason?.trim()}>Approve scope &amp; save snapshot</button>
        </fieldset>
      </form>}
    </div>
  </section>;
}
