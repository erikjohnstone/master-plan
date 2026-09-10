/** Diagnostic-only assertion: identical strict equality, bounded failure text.
 * Node's default object diff can be much larger than a multi-MB PDF capture. */
import { isDeepStrictEqual } from 'node:util';

export function assertProofEqual(actual: unknown, expected: unknown, label = 'Evidence equality'): void {
  if (isDeepStrictEqual(actual, expected)) return;
  let remaining = 100000;
  const first = (a: unknown, b: unknown, path: string): string | null => {
    if (!--remaining) return `${path} (diagnostic traversal limit; equality already failed)`;
    if (Object.is(a, b)) return null;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return path;
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return `${path} (prototype)`;
    const left = Object.keys(a), right = Object.keys(b);
    if (left.length !== right.length) return `${path} (key counts ${left.length} versus ${right.length})`;
    for (const key of left) {
      const next = `${path}.${key.slice(0, 100)}`;
      if (!Object.hasOwn(b, key)) return `${next} (missing)`;
      const found = first((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], next);
      if (found) return found;
    }
    return null;
  };
  throw new Error(`${label.slice(0, 200)}: strict equality failed at ${(first(actual, expected, '$') || '$').slice(0, 800)}`);
}
