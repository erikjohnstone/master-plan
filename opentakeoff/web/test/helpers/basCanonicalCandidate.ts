/** Allocation experiment only; not a second production serialization path. */
export function boundedCanonicalCandidate(value: unknown): string {
  const chunks: string[] = []; let pieces: string[] = [], size = 0;
  const write = (text: string) => {
    pieces.push(text); size += text.length;
    if (size >= 65536) { chunks.push(pieces.join('')); pieces = []; size = 0; }
  };
  const visit = (v: unknown): void => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') { write(JSON.stringify(v)); return; }
    if (typeof v === 'number' && Number.isFinite(v)) { write(JSON.stringify(v)); return; }
    if (Array.isArray(v)) {
      write('['); const length = v.length;
      for (let n = 0; n < length; n++) { if (n) write(','); if (n in v) visit(v[n]); }
      write(']'); return;
    }
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      write('{'); const keys = Object.keys(v).sort();
      for (let n = 0; n < keys.length; n++) { if (n) write(','); write(JSON.stringify(keys[n])); write(':'); visit((v as Record<string, unknown>)[keys[n]]); }
      write('}'); return;
    }
    throw new Error('BAS fingerprint requires finite JSON data');
  };
  visit(value); if (pieces.length) chunks.push(pieces.join('')); return chunks.join('');
}
