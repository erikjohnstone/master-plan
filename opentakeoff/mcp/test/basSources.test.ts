import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session } from '../src/session.ts';
import { openPdf, textSpans } from '../src/pdf.ts';

const sample = fileURLToPath(new URL('../../demo/sample-plan.pdf', import.meta.url));

test('shared BAS seam retains the production PDF spans and leaves Session outputs unchanged', async () => {
  const session = new Session();
  const loaded = await session.loadPlan(sample);
  const sheetListBefore = session.sheetList();
  const doc = await openPdf(sample);
  try {
    const context = session.basSourcesForPipeline();
    assert.equal(context.documents[0].sha256, createHash('sha256').update(await readFile(sample)).digest('hex'));
    assert.equal(context.pages.length, loaded.page_count);
    for (const page of context.pages) {
      const raw = textSpans(await doc.page(page.page_number));
      assert.deepEqual(page.spans.map(s => ({ str: s.text, x0: s.bbox_px[0], y0: s.bbox_px[1],
        x1: s.bbox_px[2], y1: s.bbox_px[3], ...(s.rotation !== undefined ? { rot: s.rotation } : {}) })), raw);
    }
    assert.deepEqual(session.sheetList(), sheetListBefore);
    assert.deepEqual(session.basSourcesForPipeline(), context);
    const full = await session.sheetContext(session.files[0], {});
    assert.deepEqual(context.pages[0].spans.map(s => s.text), full.text.spans.map(s => s.str));
    assert.deepEqual(session.basSourcesForPipeline(), context, 'another consumer populating geometry/text caches cannot change BAS evidence');
  } finally { await doc.destroy(); }
});

test('source identity is captured at load, survives rename, and resets with a new session document', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ot-bas-source-test-'));
  try {
    const a = path.join(dir, 'one.pdf'), b = path.join(dir, 'two.pdf');
    await copyFile(sample, a); await copyFile(sample, b);
    const session = new Session();
    await session.loadPlan(a);
    const before = session.basSourcesForPipeline();
    await session.loadPlan(b, { merge: true });
    const aliased = session.basSourcesForPipeline();
    assert.equal(aliased.documents.length, 1);
    assert.deepEqual(aliased.documents[0].names, ['one.pdf', 'two.pdf']);
    assert.equal(aliased.pages[0].page_id, before.pages[0].page_id);
    const raster = fileURLToPath(new URL('./fixtures/scanned-plan.pdf', import.meta.url));
    await copyFile(raster, a);
    assert.deepEqual(session.basSourcesForPipeline(), aliased, 'changed disk path cannot rewrite evidence of already loaded bytes');
    await session.loadPlan(a);
    const after = session.basSourcesForPipeline();
    assert.notEqual(after.documents[0].source_id, before.documents[0].source_id);
    assert.deepEqual(after.documents[0].names, ['one.pdf']);
    assert.ok(after.pages.every(p => p.text_status === 'no_text'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
