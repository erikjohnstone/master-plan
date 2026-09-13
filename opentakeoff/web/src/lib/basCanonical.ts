/** One shared canonical JSON representation for BAS evidence and events. */
export function canonicalBasJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalBasJson).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalBasJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  throw new Error('BAS fingerprint requires finite JSON data');
}

/** Exact UTF-8 size of canonicalBasJson without materializing its complete
 * string or byte array. Used only for fail-closed size budgets, never hashing. */
export function canonicalBasJsonByteLength(value: unknown): number {
  const stringBytes = (text: string) => {
    let bytes = 2; // JSON quotes
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x09
        || code === 0x0a || code === 0x0c || code === 0x0d) bytes += 2;
      else if (code <= 0x1f) bytes += 6;
      else if (code <= 0x7f) bytes += 1;
      else if (code <= 0x7ff) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; i++; }
        else bytes += 6; // Well-formed JSON.stringify escapes lone surrogates.
      } else if (code >= 0xdc00 && code <= 0xdfff) bytes += 6;
      else bytes += 3;
    }
    return bytes;
  };
  const visit = (input: unknown): number => {
    if (input === null) return 4;
    if (typeof input === 'string') return stringBytes(input);
    if (typeof input === 'boolean') return input ? 4 : 5;
    if (typeof input === 'number' && Number.isFinite(input)) return JSON.stringify(input).length;
    if (Array.isArray(input)) {
      let bytes = 2 + Math.max(0, input.length - 1);
      for (let i = 0; i < input.length; i++) if (i in input) bytes += visit(input[i]);
      return bytes;
    }
    if (input && typeof input === 'object' && Object.getPrototypeOf(input) === Object.prototype) {
      const record = input as Record<string, unknown>, keys = Object.keys(record).sort();
      let bytes = 2 + Math.max(0, keys.length - 1);
      for (const key of keys) bytes += stringBytes(key) + 1 + visit(record[key]);
      return bytes;
    }
    throw new Error('BAS fingerprint requires finite JSON data');
  };
  return visit(value);
}
