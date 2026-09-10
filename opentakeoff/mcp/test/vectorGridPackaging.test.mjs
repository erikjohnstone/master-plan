/** Packaging regression, not a new extractor or altered scoring threshold. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { vectorGridServerPath } from '../../web/src/lib/vectorGridRuntime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const files = ['sidecar/tables.py', 'sidecar/vectorgrid_rpc.py', 'bakeoff/vectorgrid.py', 'bakeoff/celltext.py', 'bakeoff/bakeoff.py', 'bakeoff/boxfit.py'];
test('source-run VectorGrid resolves the original runtime without changing its location', () => {
  const path = vectorGridServerPath(pathToFileURL(resolve(root, 'web/src/lib/vectorGridClient.ts')).href);
  assert.equal(path, resolve(root, 'sidecar/tables.py')); assert.ok(existsSync(path));
});
test('shipped VectorGrid runtime includes byte-identical dependencies and resolves outside the checkout', () => {
  const dist = resolve(root, 'mcp/dist');
  const listed = (directory, prefix = '') => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = prefix + entry.name;
    return entry.isDirectory() ? listed(resolve(directory, entry.name), path + '/') : [path];
  });
  assert.deepEqual(listed(resolve(dist, 'python/vectorgrid')).sort(), [...files].sort(), 'No bytecode, stale modules or unrelated assets');
  for (const file of files) assert.deepEqual(readFileSync(resolve(dist, 'python/vectorgrid', file)), readFileSync(resolve(root, file)), file);
  assert.equal(vectorGridServerPath(pathToFileURL(resolve(dist, 'server-core.js')).href), resolve(dist, 'python/vectorgrid/sidecar/tables.py'));
  const temporary = mkdtempSync(join(tmpdir(), 'ot-vectorgrid-package-'));
  try {
    cpSync(resolve(dist, 'python/vectorgrid'), resolve(temporary, 'python/vectorgrid'), { recursive: true });
    const server = vectorGridServerPath(pathToFileURL(resolve(temporary, 'server-core.js')).href);
    assert.ok(existsSync(server)); assert.ok(server.startsWith(temporary));
    assert.deepEqual(readFileSync(server), readFileSync(resolve(root, 'sidecar/tables.py')));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
test('a missing packaged asset cannot fall back into an unrelated source checkout', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'ot-vectorgrid-missing-'));
  try {
    const server = vectorGridServerPath(pathToFileURL(resolve(temporary, 'dist/server-core.js')).href);
    assert.equal(server, resolve(temporary, 'dist/python/vectorgrid/sidecar/tables.py'));
    assert.equal(existsSync(server), false);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
