/** Shared runtime location only; no extraction policy or geometry.
 * esbuild retains import.meta.url as the output module URL, so the shipped
 * bundle must use its own copied runtime rather than a source-tree traversal. */
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function vectorGridServerPath(moduleUrl) {
  const here = dirname(fileURLToPath(moduleUrl));
  const sourceLayout = basename(here) === 'lib' && basename(dirname(here)) === 'src'
    && basename(dirname(dirname(here))) === 'web';
  return sourceLayout ? resolve(here, '../../../sidecar/tables.py') : resolve(here, 'python/vectorgrid/sidecar/tables.py');
}
