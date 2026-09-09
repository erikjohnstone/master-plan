/** Offline source-contract regression. Not an interpretation/quantity scorer.
 * The inventory's new-workflow holdout is intentionally never opened here.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Session } from '../src/session.ts';
import { openPdf, textSpans } from '../src/pdf.ts';

const [inventoryPath, outputPath] = process.argv.slice(2);
if (!inventoryPath || !outputPath) throw new Error('Pass inventory JSON and output JSON paths');
const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
const selected = inventory.selected.filter((d: { split: string }) => d.split === 'development');
const session = new Session();
const results = [];
for (const item of selected) {
  const source = path.resolve(inventory.source_roots.collection, item.relative_path);
  const start = performance.now();
  await session.loadPlan(source);
  const context = session.basSourcesForPipeline();
  assert.equal(context.documents.length, 1);
  assert.equal(context.documents[0].sha256, item.sha256, `Source byte identity: ${item.id}`);
  assert.equal(context.pages.length, item.pages, `Page accounting: ${item.id}`);
  const doc = await openPdf(source);
  try {
    for (const page of context.pages) {
      const raw = await doc.page(page.page_number);
      assert.deepEqual([page.width_px, page.height_px, page.rotation], [raw.viewport.width, raw.viewport.height, raw.rotate]);
      assert.deepEqual(page.spans.map(s => ({ str: s.text, x0: s.bbox_px[0], y0: s.bbox_px[1],
        x1: s.bbox_px[2], y1: s.bbox_px[3], ...(s.rotation !== undefined ? { rot: s.rotation } : {}) })), textSpans(raw));
      raw.cleanup();
    }
  } finally { await doc.destroy(); }
  assert.deepEqual(session.basSourcesForPipeline(), context, `Replay: ${item.id}`);
  const result = { id: item.id, sha256: item.sha256, pages: context.pages.length,
    spans: context.pages.reduce((n, p) => n + p.spans.length, 0),
    no_text_pages: context.pages.filter(p => p.text_status === 'no_text').length,
    elapsed_ms: Math.round(performance.now() - start),
    peak_rss_bytes: process.resourceUsage().maxRSS * 1024, pass: true };
  results.push(result);
  console.log(JSON.stringify(result));
}
const output = { scope: 'Development focus PDFs only; complete text/frame/hash/replay parity with existing production PDF adapter. Not SOO/table/quantity coverage.',
  holdout_opened: false, documents: results.length, results };
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n');
