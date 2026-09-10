// Surface-specific delivery; archive/source truth stays on the shared path.
import { useEffect, useRef, useState } from 'react';
import { prepareBasEvidenceBundle, openBasEvidenceBundle } from '../lib/basEvidenceBundle.ts';
import { canonicalBasJson } from '../lib/basCanonical.ts';
import { findBasOriginal } from '../lib/basSourceBrowser.js';
import { createBasEvidenceBundleBlob } from '../lib/basEvidenceBundleBrowser.js';
import { store } from '../lib/store.js';
import { downloadText } from '../lib/totals.js';

export default function BasEvidenceBundleActions({ workflow, adapter, busy, onBusy }) {
  const [status, setStatus] = useState(null), active = useRef(null), input = useRef(null);
  useEffect(() => { setStatus(null); return () => { active.current = null; }; }, [workflow, adapter]);
  async function run(file) {
    if (busy) return;
    const operation = { cancelled: false }; active.current = operation;
    const isCurrent = () => active.current === operation && store === adapter;
    const guard = () => { if (!isCurrent() || operation.cancelled) throw new Error('Cancelled or workspace changed. No archive was downloaded or restored.'); };
    onBusy('bundle'); setStatus({ error: false, text: file ? 'Verifying every archived original…' : 'Preparing saved history and original PDFs…' });
    try {
      if (file) {
        const archive = await openBasEvidenceBundle({ size: file.size,
          async read(offset, length) { return new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()); } }, guard);
        await archive.verifyOriginals(); guard();
        setStatus({ error: false, text: `Verified ${archive.manifest.sources.length} original PDF versions and saved source ownership. Nothing was restored, approved or recalculated. Bundle ${archive.bundle_id}.` });
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
    } catch (error) { if (isCurrent()) setStatus({ error: true, text: error.message }); }
    finally { if (isCurrent()) { active.current = null; onBusy(''); } }
  }
  return <section className="bas-bundle-actions" aria-label="Portable evidence backup">
    <h3>Portable evidence backup</h3>
    <p>One ZIP with saved takeoff JSON and all historical originals. Unapproved and unsigned; verification checks files, not engineering calculations. Restoring a complete project from ZIP is not available here yet.</p>
    <div className="bas-source-actions">
      <button type="button" disabled={!!busy || !adapter.loadAnnotations} onClick={() => run()}>Download evidence bundle</button>
      <button type="button" disabled={!!busy} onClick={() => input.current?.click()}>Verify evidence bundle</button>
      {busy === 'bundle' && <button type="button" onClick={() => { if (active.current) active.current.cancelled = true; }}>Cancel backup operation</button>}
    </div>
    <input ref={input} name="bas-evidence-bundle" type="file" accept=".zip" hidden onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (file) run(file);
    }} />
    {status && <p role={status.error ? 'alert' : 'status'}>{status.text}</p>}
  </section>;
}
