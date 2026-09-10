// Surface-specific delivery; archive/source truth stays on the shared path.
import { useEffect, useRef, useState } from 'react';
import { prepareBasEvidenceBundle, openBasEvidenceBundle } from '../lib/basEvidenceBundle.ts';
import { canonicalBasJson } from '../lib/basCanonical.ts';
import { findBasOriginal } from '../lib/basSourceBrowser.js';
import { createBasEvidenceBundleBlob } from '../lib/basEvidenceBundleBrowser.js';
import { assertBasWorkflowReplayReceipt } from '../lib/basWorkflowReplay.ts';
import { prepareBasRestore, replayBasRestore, readBasRestorePlan, basRestoreJson } from '../lib/basRestore.ts';
import { annotationGeneration } from '../lib/annotationGeneration.js';
import { store } from '../lib/store.js';
import { downloadText } from '../lib/totals.js';

export default function BasEvidenceBundleActions({ workflow, adapter, busy, onBusy, restoreContext }) {
  const [status, setStatus] = useState(null), active = useRef(null), input = useRef(null);
  const [verifiedName, setVerifiedName] = useState(''), verifiedFile = useRef(null);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    setStatus(null); setVerifiedName(''); verifiedFile.current = null; setPreview(null);
    return () => { active.current?.controller.abort(); active.current = null; };
  }, [workflow, adapter]);
  async function restore(commit = false) {
    if (busy || !verifiedFile.current || !adapter.restoreBasEvidence || !restoreContext?.current) return;
    const operation = { cancelled: false, controller: new AbortController() }; active.current = operation;
    const file = verifiedFile.current, initial = restoreContext.current.read();
    const expectedLive = commit ? preview?.expectedLive : basRestoreJson(initial.payload);
    const generation = commit ? preview?.generation : initial.generation;
    const isCurrent = () => active.current === operation && store === adapter;
    const guard = () => {
      operation.controller.signal.throwIfAborted();
      const current = restoreContext.current?.read();
      if (!isCurrent() || operation.cancelled || !current || current.busy || current.pending
        || current.generation !== generation || basRestoreJson(current.payload) !== expectedLive) {
        throw new Error('Workspace changed or has unsaved work. Nothing was restored. Finish saving and preview the backup again.');
      }
    };
    onBusy('bundle'); setStatus({ error: false, text: commit ? 'Replaying the complete merged history before restore…' : 'Preparing a merge preview. Saved data is unchanged…' });
    try {
      guard();
      const archive = await openBasEvidenceBundle({ size: file.size,
        async read(offset, length) { return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()); } }, guard);
      guard();
      if (!commit) {
        const saved = await adapter.loadAnnotations(); guard();
        if (annotationGeneration(saved) !== generation) throw new Error('The saved project was replaced. Export unsaved work and reload before restoring.');
        const plan = await prepareBasRestore(saved, archive.payload, archive.bundle_id, guard); guard();
        setPreview({ plan, file, expectedLive, generation });
        setStatus({ error: false, text: 'Preview ready. Your existing measurements and BAS history use the normal operator-preserving merge. No approval is created.' });
      } else {
        if (!preview || preview.file !== file || readBasRestorePlan(preview.plan).bundle_id !== archive.bundle_id) throw new Error('The selected backup changed. Preview it again.');
        await replayBasRestore(preview.plan, async mergedWorkflow => {
          const body = JSON.stringify({ workflow: mergedWorkflow, request: {} });
          if (new TextEncoder().encode(body).length > 32 * 1024 * 1024) throw new Error('Merged history exceeds the browser replay limit of 32 MiB. Nothing was restored.');
          const response = await fetch('/__ot/bas-workflow-replay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: operation.controller.signal });
          guard();
          if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Shared Python replay service is unavailable. Nothing was restored.');
          const value = await response.json(); guard();
          if (!response.ok) throw new Error(value.error || 'Shared Python replay failed. Nothing was restored.');
          return value;
        }, guard);
        setStatus({ error: false, text: 'Retaining originals and committing the reviewed merge…' });
        const incoming = new Set(archive.manifest.sources.map(item => item.source.source_id));
        const result = await adapter.restoreBasEvidence(preview.plan, item => incoming.has(item.source.source_id)
          ? archive.readSource(item.source.source_id) : findBasOriginal(adapter, item, () => { guard(); return true; }),
        { generation, guard, signal: operation.controller.signal });
        // No await between the committed result and adopting its exact token.
        restoreContext.current.apply(result);
        setPreview(null);
      }
    } catch (error) { if (isCurrent()) setStatus({ error: true, text: operation.cancelled ? 'Restore cancelled. Saved data and originals were not changed.' : error.message }); }
    finally { if (isCurrent()) { active.current = null; onBusy(''); } }
  }
  async function run(file, replay = false) {
    if (busy) return;
    const operation = { cancelled: false, controller: new AbortController() }; active.current = operation;
    const isCurrent = () => active.current === operation && store === adapter;
    const guard = () => { if (!isCurrent() || operation.cancelled) throw new Error('Cancelled or workspace changed. No archive was downloaded or restored.'); };
    if (file && !replay) { verifiedFile.current = null; setVerifiedName(''); setPreview(null); }
    onBusy('bundle'); setStatus({ error: false, text: file ? 'Verifying every archived original…' : 'Preparing saved history and original PDFs…' });
    try {
      if (file) {
        const archive = await openBasEvidenceBundle({ size: file.size,
          async read(offset, length) { return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()); } }, guard);
        await archive.verifyOriginals(); guard();
        if (replay) {
          setStatus({ error: false, text: 'Replaying all saved assignment, assembly and engineering calculations…' });
          const body = JSON.stringify({ workflow: archive.payload.bas_workflow, request: {} });
          if (new TextEncoder().encode(body).length > 32 * 1024 * 1024) throw new Error('Saved history exceeds the browser replay limit of 32 MiB. No calculations were accepted.');
          const response = await fetch('/__ot/bas-workflow-replay', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body, signal: operation.controller.signal });
          guard();
          if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Shared Python replay service is unavailable in this environment. No calculations were accepted.');
          const value = await response.json(); guard();
          if (!response.ok) throw new Error(value.error || 'Shared Python replay failed. No calculations were accepted.');
          const receipt = await assertBasWorkflowReplayReceipt(archive.payload.bas_workflow, value, guard); guard();
          const counts = receipt.checked_records;
          setStatus({ error: false, text: receipt.calculation_verification === 'no_saved_calculations'
            ? 'This backup contains no saved assignment, assembly or engineering calculations to replay. Source bytes were verified; nothing was restored or approved.'
            : `Saved calculations match shared Python: ${counts.assignment.length} assignment, ${counts.assembly.length} assembly, ${counts.engineering.length} engineering records. This includes historical results, not a check that their inputs are current. Nothing was restored or approved.` });
        } else {
          verifiedFile.current = file; setVerifiedName(file.name);
          setStatus({ error: false, text: `Verified ${archive.manifest.sources.length} original PDF versions and saved source ownership. Nothing was restored, approved or recalculated. Bundle ${archive.bundle_id}.` });
        }
      } else {
        const payload = await adapter.loadAnnotations(); guard();
        if (canonicalBasJson(payload?.bas_workflow) !== canonicalBasJson(workflow)) throw new Error('Saved BAS history is not current. Wait for saving to finish, then retry.');
        const expected = canonicalBasJson(payload), prepared = await prepareBasEvidenceBundle(payload, guard);
        const blob = await createBasEvidenceBundleBlob(prepared,
          item => findBasOriginal(adapter, item, () => isCurrent() && !operation.cancelled), guard);
        guard();
        // Check persisted state before publication, not on every output chunk.
        const saved = await adapter.loadAnnotations(); guard();
        if (canonicalBasJson(saved) !== expected) throw new Error('Saved workspace changed during export. No archive was downloaded; retry against current saved history.');
        downloadText(`${prepared.bundle_id}.otbas.zip`, blob, 'application/zip');
        setStatus({ error: false, text: `Downloaded unapproved evidence backup with ${prepared.manifest.sources.length} verified original PDF versions. Calculations were not replayed. Keep this ZIP outside browser storage.` });
      }
    } catch (error) { if (isCurrent()) setStatus({ error: true, text: operation.cancelled ? 'Cancelled. No archive was downloaded or restored; no replay result was accepted.' : error.message }); }
    finally { if (isCurrent()) { active.current = null; onBusy(''); } }
  }
  return <section className="bas-bundle-actions" aria-label="Portable evidence backup">
    <h3>Portable evidence backup</h3>
    <p>One ZIP with saved takeoff JSON and all historical originals. Unapproved and unsigned. Verify its files, preview the merge, then explicitly restore. Restore requires shared Python calculation replay and exact originals; historical PDFs stay separate from active counting sheets.</p>
    <div className="bas-source-actions">
      <button type="button" disabled={!!busy || !adapter.loadAnnotations || !workflow} onClick={() => run()}>Download evidence bundle</button>
      <button type="button" disabled={!!busy} onClick={() => input.current?.click()}>Verify evidence bundle</button>
      {busy === 'bundle' && <button type="button" onClick={() => { if (active.current) { active.current.cancelled = true; active.current.controller.abort(); } }}>Cancel backup operation</button>}
    </div>
    {verifiedName && <div className="bas-source-actions bas-bundle-selected"><span>Selected backup: {verifiedName}</span>
      <button type="button" disabled={!!busy} onClick={() => run(verifiedFile.current, true)}>Replay saved calculations</button>
      <button type="button" disabled={!!busy || !adapter.restoreBasEvidence || !restoreContext} onClick={() => restore()}>Preview restore</button></div>}
    {preview && <section aria-label="Evidence restore preview"><h4>Restore preview</h4>
      <p>{preview.plan.preview.captures} saved captures · {preview.plan.preview.originals} original PDF versions · {preview.plan.preview.merge.shapes_added} added measurements. {preview.plan.preview.merge.replaced ? 'Restore into an unmeasured workspace.' : 'Merge into existing operator work.'} No approval or verified installed count is created.</p>
      {!!preview.plan.preview.legacy_files.length && <p>These annotation-bound originals must already be open with their exact bytes and filenames: {preview.plan.preview.legacy_files.join(', ')}.</p>}
      <div className="bas-source-actions"><button type="button" disabled={!!busy} onClick={() => restore(true)}>Restore reviewed merge</button>
        <button type="button" disabled={!!busy} onClick={() => setPreview(null)}>Discard preview</button></div>
    </section>}
    {!adapter.restoreBasEvidence && <p>Atomic archive restore is not available in this storage mode. Verification and backup remain available; no cloud restore guarantee is made.</p>}
    <input ref={input} name="bas-evidence-bundle" type="file" accept=".zip" hidden onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (file) run(file);
    }} />
    {status && <p role={status.error ? 'alert' : 'status'}>{status.text}</p>}
  </section>;
}
