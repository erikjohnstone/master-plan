// Surface-specific lookup across the active store and its local revision trail.
// Filenames and revision metadata are hints; the shared verifier decides identity.
import { verifyBasSourceBytes } from './basSourceRetention.ts';

export async function findBasOriginal(adapter, item, isCurrent = () => true) {
  const check = () => { if (!isCurrent()) throw new Error('BAS source workspace changed; retry against the current project.'); };
  check();
  if (adapter.loadBasSource) {
    const retained = await adapter.loadBasSource(item.source);
    check();
    if (retained) return retained;
  }
  const loaded = await adapter.listSheets(); check();
  const names = [...new Set([...item.names, ...loaded.map(s => s.name)])];
  let unreadable = 0;
  const match = async bytes => {
    check();
    if (bytes.byteLength !== item.source.byte_length) return null;
    try { return await verifyBasSourceBytes(item.source, bytes); }
    catch (error) {
      if (error.message?.includes('digest mismatch')) return null;
      throw error;
    }
  };
  for (const name of names) {
    check();
    if (loaded.some(s => s.name === name)) {
      let bytes;
      try { bytes = await adapter.loadPdfData(name); } catch { unreadable++; }
      if (bytes) { const result = await match(bytes); check(); if (result) return result; }
    }
    if (!adapter.listPdfRevisions || !adapter.loadPdfRevisionData) continue;
    let revisions;
    try { revisions = await adapter.listPdfRevisions(name); } catch { unreadable++; continue; }
    for (const revision of revisions) {
      check();
      if (revision.current || (revision.hash && revision.hash !== item.source.sha256)) continue;
      let bytes;
      try { bytes = await adapter.loadPdfRevisionData(name, revision.rev); } catch { unreadable++; }
      if (bytes) { const result = await match(bytes); check(); if (result) return result; }
    }
  }
  throw new Error(`Exact original PDF unavailable. Reopen the original bytes; a newer file with the same name is not a substitute.${unreadable ? ` ${unreadable} source reads also failed.` : ''}`);
}
