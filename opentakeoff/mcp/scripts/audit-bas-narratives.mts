/** Offline development-only discovery audit. Counts are NOT accuracy metrics
 * except the explicitly authored source-region membership assertions. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Session } from '../src/session.ts';
import { basNarrativeRegionLines, discoverBasNarratives } from '../../web/src/lib/basNarratives.ts';

const [inventoryPath, outputDir, ...selectedIds] = process.argv.slice(2);
if (!inventoryPath || !outputDir) throw new Error('Pass inventory JSON, output directory, and optionally development IDs');
const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
const truths = await Promise.all(['bas-narrative-regions.json', 'bas-narrative-behavioral.json'].map(async name =>
  JSON.parse(await readFile(new URL(`../../web/test/fixtures/${name}`, import.meta.url), 'utf8'))));
const selected = inventory.selected.filter((d: { split: string; id: string }) => d.split === 'development' && (!selectedIds.length || selectedIds.includes(d.id)));
assert.ok(selected.length, 'No development sources selected');
for (const id of selectedIds) assert.ok(selected.some((d: { id: string }) => d.id === id), 'Unknown or holdout ID is prohibited');
await mkdir(outputDir, { recursive: true });
const results = [];
const session = new Session();
for (const item of selected) {
  const start = performance.now();
  await session.loadPlan(path.resolve(inventory.source_roots.collection, item.relative_path));
  const input = session.basSourcesForPipeline();
  assert.equal(input.documents[0].sha256, item.sha256);
  const discoveryStart = performance.now();
  const result = discoverBasNarratives(input);
  const discovery_ms = performance.now() - discoveryStart;
  assert.deepEqual(session.basNarrativesForPipeline(), result);
  assert.deepEqual(session.basSourcesForPipeline(), input, 'Discovery must not mutate source evidence');
  const statuses = { body_detected: 0, heading_only: 0, segmentation_conflict: 0 };
  const accounting: Record<string, number> = {};
  for (const [i, page] of result.pages.entries()) {
    const ids = Object.values(page.accounting).flat();
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids.sort(), input.pages[i].spans.map(s => s.span_id).sort());
    for (const [kind, members] of Object.entries(page.accounting)) accounting[kind] = (accounting[kind] ?? 0) + members.length;
    for (const region of page.regions) statuses[region.status]++;
  }
  let exact_region_assertions = 0;
  const truth = truths.find(t => t.source_sha256 === item.sha256);
  if (truth) {
    const found = result.pages.flatMap(p => p.regions).filter(r => r.status === 'body_detected');
    assert.equal(found.length, truth.regions.length);
    for (const expected of truth.regions) {
      const page = input.pages.find(p => p.page_number === expected.page)!;
      const region = found.find(r => r.page_id === page.page_id && r.heading.text === expected.title);
      assert.ok(region, `Missing source region: ${expected.page} ${expected.title}`);
      const [x0, y0, x1, y1] = expected.bbox;
      const expectedIds = page.spans.filter(s => s.bbox_px[0] >= x0 && s.bbox_px[1] >= y0 && s.bbox_px[2] <= x1 && s.bbox_px[3] <= y1).map(s => s.span_id).sort();
      const actualIds = basNarrativeRegionLines(region).flatMap(l => l.span_ids).sort();
      assert.deepEqual(actualIds, expectedIds, `Exact source membership: ${expected.page} ${expected.title}`);
      if (expected.context_title) assert.equal(region.title, expected.context_title);
      if (expected.section_markers) assert.deepEqual(region.blocks.filter(b => b.kind === 'paragraph' && b.marker).map(b => b.kind === 'paragraph' ? b.marker : null), expected.section_markers);
      if (expected.insets) assert.deepEqual(region.blocks.filter(b => b.kind === 'columnar').map(b => b.rows.map(row => row.map(l => l.text))), expected.insets);
      exact_region_assertions++;
    }
    for (const expected of truth.heading_only) {
      const pageId = input.pages.find(p => p.page_number === expected.page)!.page_id;
      assert.ok(result.pages.flatMap(p => p.regions).some(r => r.page_id === pageId && r.heading.text === expected.title && r.status === 'heading_only'));
    }
  }
  const record = { id: item.id, sha256: item.sha256, pages: input.pages.length, statuses, accounting,
    exact_region_assertions, discovery_ms: Math.round(discovery_ms), elapsed_ms: Math.round(performance.now() - start),
    peak_rss_bytes: process.resourceUsage().maxRSS * 1024, accounting_and_replay_pass: true,
    regions: result.pages.flatMap((page, i) => page.regions.map(r => ({ page: input.pages[i].page_number,
      title: r.title, status: r.status, bbox: r.bbox_px, boundary: r.boundary,
      paragraphs: r.blocks.filter(b => b.kind === 'paragraph').length,
      insets: r.blocks.filter(b => b.kind === 'columnar').length, lines: basNarrativeRegionLines(r).length }))) };
  results.push(record);
  // Retain the complete source-linked result for authored/initially reviewed
  // sources. This is diagnostic output, never auto-generated ground truth.
  if (exact_region_assertions || selectedIds.includes(item.id)) {
    await writeFile(path.join(outputDir, `${item.id}.json`), JSON.stringify(result, null, 2) + '\n');
  }
  console.log(JSON.stringify({ ...record, regions: undefined }));
}
await writeFile(path.join(outputDir, 'summary.json'), JSON.stringify({
  scope: 'Development-only real Session source discovery, exhaustive span partition, replay, plus explicitly authored exact region checks. Unreviewed region counts are not accuracy or project coverage.',
  holdout_opened: false, results,
}, null, 2) + '\n');
