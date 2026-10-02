/** Packaging regression, not a new extractor or altered scoring threshold. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { vectorGridServerPath } from '../../web/src/lib/vectorGridRuntime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const files = ['sidecar/tables.py', 'sidecar/vectorgrid_rpc.py', 'bakeoff/vectorgrid.py', 'bakeoff/celltext.py', 'bakeoff/bakeoff.py', 'bakeoff/boxfit.py', 'bakeoff/rastergrid.py'];
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

// A page holding a picture of a table (AS-153). The shipped runtime once left
// rastergrid.py out, and every such page died with ModuleNotFoundError, taking
// the drawn tables beside the picture with it. Without the reader (or without
// an OCR engine) the picture stays a raster region and the page still reads;
// with both, the picture is read.
const python = process.env.OPENTAKEOFF_VECTORGRID_PYTHON || process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || '';
const pythonReady = !!python && spawnSync(python, ['-c', 'import pymupdf, pdfplumber, shapely']).status === 0;
const ocrReady = pythonReady && spawnSync(python, ['-c', 'import cv2, rapidocr_onnxruntime']).status === 0;
const PICTURE_SHEET = String.raw`
import sys, pymupdf
def table(page, x0, y0, rows):
    nr, nc = len(rows), len(rows[0])
    for r in range(nr + 1): page.draw_line((x0, y0 + 24 * r), (x0 + 90 * nc, y0 + 24 * r), width=0.8)
    for c in range(nc + 1): page.draw_line((x0 + 90 * c, y0), (x0 + 90 * c, y0 + 24 * nr), width=0.8)
    for r, row in enumerate(rows):
        for c, t in enumerate(row): page.insert_text((x0 + 90 * c + 6, y0 + 24 * r + 16), t, fontsize=9)
pic = pymupdf.open(); pp = pic.new_page(width=400, height=160)
table(pp, 20, 20, [["MARK", "CFM", "RPM", "NOTES"], ["EF-1", "400", "1050", "1"], ["EF-2", "500", "1100", "1"], ["EF-3", "250", "900", "2"]])
doc = pymupdf.open(); page = doc.new_page(width=1224, height=792)
table(page, 60, 60, [["MARK", "TYPE", "CFM", "NOTES"], ["AHU-1", "VAV", "4000", "1"], ["AHU-2", "VAV", "5000", "2"]])
page.insert_image(pymupdf.Rect(600, 300, 1000, 460), stream=pp.get_pixmap(dpi=200).tobytes("png"))
doc.save(sys.argv[1])
`;
const EXTRACT = String.raw`
import json, sys
sys.path.insert(0, sys.argv[1])
import vectorgrid_rpc
print(json.dumps(vectorgrid_rpc.extract_grid(sys.argv[2], 1)))
`;
function packagedTables(dropReader) {
  const temporary = mkdtempSync(join(tmpdir(), 'ot-vectorgrid-picture-'));
  try {
    const runtime = resolve(temporary, 'python/vectorgrid');
    cpSync(resolve(root, 'mcp/dist/python/vectorgrid'), runtime, { recursive: true });
    if (dropReader) rmSync(resolve(runtime, 'bakeoff/rastergrid.py'));
    const pdf = join(temporary, 'sheet.pdf');
    const drawn = spawnSync(python, ['-c', PICTURE_SHEET, pdf], { encoding: 'utf8' });
    assert.equal(drawn.status, 0, drawn.stderr);
    const r = spawnSync(python, ['-c', EXTRACT, resolve(runtime, 'sidecar'), pdf], {
      encoding: 'utf8', timeout: 300_000, maxBuffer: 64 << 20, env: { ...process.env, OPENTAKEOFF_PICTURE_CACHE: '0' },
    });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout.trim().split('\n').pop()).tables;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
test('the shipped runtime without its picture reader keeps a page that holds a picture of a table', { skip: pythonReady ? false : "vectorgrid's Python is not installed" }, () => {
  const tables = packagedTables(true);
  assert.ok(tables.some((t) => !t.raster && t.cells.length >= 12), 'the drawn table beside the picture is read');
  assert.ok(tables.some((t) => t.raster), 'the picture is reported as one');
});
test('the shipped runtime reads a picture of a table where OCR is installed', { skip: ocrReady ? false : 'OCR is not installed' }, () => {
  const tables = packagedTables(false);
  assert.ok(tables.some((t) => t.ocr && t.cells.some((c) => c.text === 'EF-3')), 'the picture is read');
});
