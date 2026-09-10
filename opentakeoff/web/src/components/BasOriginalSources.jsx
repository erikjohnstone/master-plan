// Browser-local retention UI. Does not select the current drawing set or alter
// source findings, calculations, correspondence, approvals or extracted data.
import { useEffect, useRef, useState } from 'react';
import { basSourceInventory } from '../lib/basSourceRetention.ts';
import { findBasOriginal } from '../lib/basSourceBrowser.js';
import { store } from '../lib/store.js';
import { downloadText } from '../lib/totals.js';

export default function BasOriginalSources({ workflow, onBack }) {
  const [view, setView] = useState({ input: null, rows: [], error: '' });
  const [busy, setBusy] = useState(''), [statuses, setStatuses] = useState({});
  const current = useRef(null), heading = useRef(null), adapter = store;
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    const token = { workflow, adapter }; current.current = token;
    setStatuses({}); setBusy('');
    basSourceInventory(workflow).then(rows => {
      if (current.current === token) setView({ input: workflow, rows, error: '' });
    }).catch(error => { if (current.current === token) setView({ input: workflow, rows: [], error: error.message }); });
    return () => { if (current.current === token) current.current = null; };
  }, [workflow, adapter]);
  async function run(item, action) {
    const token = current.current, id = item.source.source_id;
    const isCurrent = () => !!token && current.current === token && store === adapter;
    setBusy(id);
    try {
      let bytes;
      if (action === 'retain') {
        bytes = await findBasOriginal(adapter, item, isCurrent);
        if (!isCurrent()) return;
        await adapter.retainBasSource(workflow, id, bytes);
      }
      if (!isCurrent()) return;
      bytes = await adapter.loadBasSource(item.source);
      if (!isCurrent()) return;
      if (!bytes) throw new Error('Not retained in this browser project. Use Retain original while its exact PDF is available.');
      if (action === 'download') downloadText(`${item.source.sha256}.pdf`, bytes, 'application/pdf');
      setStatuses(previous => ({ ...previous, [id]: { verified: true, text: 'Retained original · bytes verified now' } }));
    } catch (error) {
      if (isCurrent()) setStatuses(previous => ({ ...previous, [id]: { verified: false,
        text: error.name === 'QuotaExceededError' ? 'Storage is full. No existing evidence was deleted; keep an external backup before retrying.' : error.message } }));
    } finally { if (isCurrent()) setBusy(''); }
  }
  return <section className="bas-point-workspace bas-project-review" aria-label="Original BAS PDFs">
    <div className="bas-point-heading bas-source-heading"><button type="button" onClick={onBack}>← Back to findings</button><h2 ref={heading} tabIndex={-1}>Original PDFs</h2></div>
    <p className="bas-review-boundary">All physical versions referenced by saved BAS history—not a reviewed current drawing set or an approved takeoff.</p>
    <p className="bas-review-boundary">Retain one original at a time in this browser project. Retained copies survive closing a PDF, but browser storage can be cleared or evicted and is not synced. Download originals for external backup; keep the takeoff JSON too. Verification here does not clear review findings.</p>
    {view.input !== workflow ? <p role="status">Checking saved source ownership…</p> : view.error ? <p role="alert">{view.error}</p> :
      <div className="bas-point-grid bas-review-grid" tabIndex={0} role="region" aria-label="Saved original source versions">
        <table aria-label="Original PDF versions"><thead><tr><th scope="col">Original names &amp; identity</th><th scope="col">Saved evidence</th><th scope="col">Local retention</th><th scope="col">Actions</th></tr></thead><tbody>
          {view.rows.map(item => <tr key={item.source.source_id}><th scope="row">{item.names.join(' / ')}<details><summary>SHA-256 identity</summary><code>{item.source.sha256}</code></details></th>
            <td>{item.source.page_count} pages · {item.source.byte_length.toLocaleString()} bytes<br />{item.capture_ids.length} captures · {item.capture_ids.includes(workflow.current_capture_id) ? 'includes active capture' : 'historical capture only'}</td>
            <td><span role={statuses[item.source.source_id] && !statuses[item.source.source_id].verified ? 'alert' : 'status'}>{busy === item.source.source_id ? 'Verifying original…' : statuses[item.source.source_id]?.text || 'Not checked this visit'}</span></td>
            <td><div className="bas-source-actions"><button type="button" disabled={!!busy || !adapter.retainBasSource} onClick={() => run(item, 'retain')}>Retain original</button>
              <button type="button" disabled={!!busy || !adapter.loadBasSource} onClick={() => run(item, 'verify')}>Verify retained copy</button>
              <button type="button" disabled={!!busy || !adapter.loadBasSource} onClick={() => run(item, 'download')}>Download original</button></div></td></tr>)}
        </tbody></table>
        {!view.rows.length && <p>No saved source versions. An empty inventory is not verified project coverage.</p>}
      </div>}
    {!adapter.retainBasSource && <p role="status">This storage mode does not support local BAS original retention. Keep the original PDFs separately; no cloud-retention guarantee is made.</p>}
  </section>;
}
