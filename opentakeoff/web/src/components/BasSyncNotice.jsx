import React, { useEffect, useState } from 'react';
import { downloadText } from '../lib/totals.js';
import { Z } from '../lib/ui.js';

/** A delivery conflict, not an engineering finding or an approval. */
export default function BasSyncNotice({ store, hidden = false }) {
  const [issue, setIssue] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const bridge = store.syncBridge;
  useEffect(() => {
    if (!bridge?.readSyncIssue) return;
    let alive = true, notified = false;
    const update = value => { notified = true; if (alive) { setIssue(value); setError(''); } };
    bridge.onSyncIssue = update;
    bridge.readSyncIssue().then(value => { if (alive && !notified) setIssue(value); }).catch(() => {});
    return () => { alive = false; if (bridge.onSyncIssue === update) bridge.onSyncIssue = null; };
  }, [bridge]);
  if (!issue || hidden) return null;
  const run = async action => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e.message || 'Could not complete this action.'); }
    finally { setBusy(false); }
  };
  return <section role="alert" aria-label="BAS sync needs review" style={{ position: 'absolute', bottom: 'calc(var(--sp-6) + var(--sp-3))', left: '50%', transform: 'translateX(-50%)', zIndex: Z.toast,
    width: 'min(42rem, calc(100% - 2 * var(--sp-4)))', padding: 'var(--sp-3)', background: 'var(--paper-bright)', color: 'var(--ink)', border: '1px solid var(--c-danger)', boxShadow: 'var(--shadow-2)', fontSize: 'var(--fs-m)' }}>
    <strong>BAS sync needs review</strong>
    <p style={{ margin: 'var(--sp-2) 0' }}>{issue.message}</p>
    <p style={{ margin: 'var(--sp-2) 0', color: 'var(--ink-soft)' }}>{issue.snapshot_id ? 'The unmerged remote JSON is saved as a recovery copy. It is not verified or approved and does not include original PDFs.' : 'A remote recovery copy could not be saved. Do not discard either takeoff.'}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
      {issue.snapshot_id && <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(async () => {
        const record = await store.getSnapshot(issue.snapshot_id);
        if (!record?.payload) throw new Error('The recovery copy is unavailable. Neither takeoff was changed.');
        downloadText('unmerged-BAS-remote.takeoff.json', JSON.stringify(record.payload, null, 2), 'application/json');
      })}>Export remote recovery copy</button>}
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(async () => {
        await bridge.checkRemote?.(); await bridge.flushPending?.();
        setIssue(await bridge.readSyncIssue());
      })}>{busy ? 'Checking…' : 'Check sync again'}</button>
    </div>
    {error && <p role="status" style={{ margin: 'var(--sp-2) 0 0', color: 'var(--c-danger)' }}>{error}</p>}
  </section>;
}
