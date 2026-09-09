import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBasSourceContext } from '../src/lib/basSources.ts';
import { basNarrativeRegionLines, discoverBasNarratives, isBasNarrativeHeading, type BasNarrativeRegion } from '../src/lib/basNarratives.ts';

const span = (str: string, x: number, y: number, w = 300, h = 10, rot = 0) => ({ str, x0: x, y0: y, x1: x + w, y1: y + h, rot });
const source = (spans: ReturnType<typeof span>[]) => buildBasSourceContext([{ name: 'fixture.pdf', sha256: 'a'.repeat(64),
  byte_length: 1, page_count: 1, pages: [{ page_number: 1, sheet_key: 'fixture', width_px: 1000, height_px: 1000, rotation: 0, spans }] }]);
const regionSpans = (region: ReturnType<typeof discoverBasNarratives>['pages'][number]['regions'][number]) =>
  basNarrativeRegionLines(region).flatMap(l => l.span_ids).sort();
const prose = (region: BasNarrativeRegion) => region.blocks.filter(b => b.kind === 'paragraph');

test('heading detection rejects references, behavioral clauses and point-list captions', () => {
  for (const title of ['AHU CONTROL SEQUENCE', 'Chilled water system sequence of operation',
    'SEQUENCE OF OPERATION: VAV BOXES', 'SYSTEM OPERATION SEQUENCES (CONTINUED)', 'CONTROLS NARRATIVE:']) {
    assert.equal(isBasNarrativeHeading(title), true, title);
  }
  for (const text of ['SEE AHU CONTROL SEQUENCE', 'The system shall operate according to the control sequence',
    'BAS INPUT/OUTPUT POINT LIST', 'POINT LIST TABLE', '1. The controller is provided. CONTROL SEQUENCE',
    'BOILER SHUTDOWN SEQUENCE: WHEN THE BOILER START CONDITIONS ARE NOT MET, THE BOILER WILL DISABLE.']) {
    assert.equal(isBasNarrativeHeading(text), false, text);
  }
});

test('independent columns, numbered paragraphs and repeated headings retain distinct source scopes', () => {
  const input = source([
    span('PUMP CONTROL SEQUENCE', 10, 20), span('PUMP CONTROL SEQUENCE', 500, 20),
    span('A. The pump shall run only when enabled.', 10, 40), span('A. The pump shall NOT run when disabled.', 500, 40),
    span('The pump requires an explicit start signal.', 25, 52), span('B. Preserve the separate shutdown requirement.', 500, 52),
    span('B. The pump shall stop on loss of power.', 10, 75), span('POINT NAME', 10, 150),
  ]);
  const before = structuredClone(input), result = discoverBasNarratives(input), page = result.pages[0];
  assert.deepEqual(page.regions.map(r => r.status), ['body_detected', 'body_detected']);
  assert.equal(prose(page.regions[0]).length, 2);
  assert.equal(prose(page.regions[0])[0].lines.length, 2);
  assert.equal(prose(page.regions[1])[0].lines[0].text.includes('NOT'), true);
  assert.equal(new Set(page.regions.map(r => r.region_id)).size, 2);
  assert.equal(page.accounting.body_region_span_ids.length, 7);
  assert.equal(page.accounting.unassigned_horizontal_span_ids.length, 1);
  assert.deepEqual(input, before);
  assert.deepEqual(discoverBasNarratives(input), result);
  result.pages[0].regions[0].heading.bbox_px[0] = 999;
  assert.deepEqual(input, before);
});

test('blank, rotated, degenerate, unassigned and textless sources stay explicit without quantities', () => {
  const input = source([span('', 0, 0), span('1. The fan shall start.', 10, 20),
    span('FAN CONTROL SEQUENCE', 20, 40, 200, 10, 90), span('unusable geometry', 5, 5, 0)]);
  const result = discoverBasNarratives(input), page = result.pages[0];
  assert.equal(page.regions.length, 0);
  assert.equal(page.accounting.blank_span_ids.length, 1);
  assert.equal(page.accounting.unsupported_span_ids.length, 2);
  assert.equal(page.accounting.unassigned_horizontal_span_ids.length, 1);
  assert.equal(result.discovery_complete, false);
  assert.equal(result.interpretation_complete, false);
  assert.equal('totals' in result, false);
  assert.equal(discoverBasNarratives(source([])).pages[0].text_status, 'no_text');
});

test('large view captions do not become sequences and no implicit continuation crosses pages', () => {
  const input = source([span('CHILLER CONTROL SEQUENCE', 10, 20), span('A. The chiller shall start after the pump.', 10, 40),
    span('CHILLER SEQUENCE OF OPERATION', 10, 100, 500, 20), span('NOT TO SCALE', 10, 125, 90, 7)]);
  const result = discoverBasNarratives(input);
  assert.deepEqual(result.pages[0].regions.map(r => r.status), ['body_detected', 'heading_only']);
  assert.equal(prose(result.pages[0].regions[0]).length, 1);
  assert.equal(prose(result.pages[0].regions[1]).length, 0);
  for (const label of ['NOT DRAWN TO SCALE', 'SCALE: 1/4 INCH = 1 FOOT', 'N.T.S.']) {
    const caption = source([span('CHILLER SEQUENCE OF OPERATION', 10, 20, 500, 20), span(label, 10, 50, 150, 7)]);
    assert.equal(discoverBasNarratives(caption).pages[0].regions[0].status, 'heading_only', label);
  }
});

test('word fragments retain exact evidence while the reading aid adds only geometric spaces', () => {
  const input = source([span('FAN', 10, 20, 20), span('CONTROL', 34, 20, 50), span('SEQUENCE', 88, 20, 55),
    span('1.', 10, 40, 8), span('The fan shall not run.', 30, 40, 150)]);
  const result = discoverBasNarratives(input).pages[0];
  assert.equal(result.regions[0].heading.text, 'FAN CONTROL SEQUENCE');
  assert.equal(prose(result.regions[0])[0].lines[0].text, '1. The fan shall not run.');
  assert.equal(regionSpans(result.regions[0]).length, 5);
});

test('overlapping region ownership is exposed instead of choosing a winner', () => {
  const input = source([span('FAN CONTROL SEQUENCE', 10, 20, 130), span('PUMP CONTROL SEQUENCE', 50, 21, 135),
    span('1. The system shall operate when enabled.', 50, 40)]);
  const result = discoverBasNarratives(input).pages[0];
  // Overlapping glyphs may make the title itself unreadable. In either case
  // there must not be a silently accepted body with a fabricated owner.
  assert.equal(result.regions.some(r => r.status === 'body_detected'), false);
  assert.equal(Object.values(result.accounting).flat().length, input.pages[0].spans.length);
});

test('reviewed Fort Sam source regions have exact span membership, no merged columns or duplicate caption bodies', () => {
  const capture = JSON.parse(readFileSync(new URL('../../docs/bas-production/evidence/baseline/fort-sam-text.json', import.meta.url), 'utf8'));
  const truth = JSON.parse(readFileSync(new URL('./fixtures/bas-narrative-regions.json', import.meta.url), 'utf8'));
  assert.equal(capture.sha256, truth.source_sha256);
  // This is a saved, source-reviewed production text capture, not a fresh PDF
  // test. The separate real-Session corpus harness checks current PDF parity.
  const input = buildBasSourceContext([{ name: 'reviewed-fort-sam-capture.pdf', sha256: capture.sha256, byte_length: 1,
    page_count: capture.pages.length, pages: capture.pages.map((p: { page: number; width: number; height: number; spans: unknown[] }) => ({
      page_number: p.page, sheet_key: `reviewed#${p.page}`, width_px: p.width, height_px: p.height, rotation: 0, spans: p.spans,
    })) }]);
  const result = discoverBasNarratives(input);
  const found = result.pages.flatMap(p => p.regions).filter(r => r.status === 'body_detected');
  assert.equal(found.length, truth.regions.length);
  for (const expected of truth.regions) {
    const page = input.pages.find(p => p.page_number === expected.page)!;
    const region = found.find(r => r.page_id === page.page_id && r.heading.text === expected.title);
    assert.ok(region, `Missing ${expected.page}: ${expected.title}`);
    const [x0, y0, x1, y1] = expected.bbox;
    const expectedSpans = page.spans.filter(s => s.bbox_px[0] >= x0 && s.bbox_px[1] >= y0 && s.bbox_px[2] <= x1 && s.bbox_px[3] <= y1);
    assert.deepEqual(regionSpans(region), expectedSpans.map(s => s.span_id).sort(), `Exact region evidence: ${expected.page} ${expected.title}`);
  }
  for (const expected of truth.heading_only) {
    const pageId = input.pages.find(p => p.page_number === expected.page)!.page_id;
    assert.ok(result.pages.flatMap(p => p.regions).some(r => r.page_id === pageId && r.heading.text === expected.title && r.status === 'heading_only'));
  }
  for (const [i, page] of result.pages.entries()) {
    const accounted = Object.values(page.accounting).flat();
    assert.equal(new Set(accounted).size, accounted.length);
    assert.deepEqual(accounted.sort(), input.pages[i].spans.map(s => s.span_id).sort());
  }
  const doas = found.filter(r => r.heading.text === 'DEDICATED OUTSIDE AIR SYSTEM CONTROL SEQUENCE');
  assert.equal(doas.length, 2);
  assert.notEqual(doas[0].region_id, doas[1].region_id);
  const bodies = doas.map(r => prose(r).flatMap(p => p.lines).map(l => l.text).join('\n'));
  assert.ok(bodies[0].includes('DURING UNOCCUPIED HOURS: THE DOAS SHALL RUN AT 30%'));
  assert.ok(bodies[1].includes('DURING UNOCCUPIED HOURS, THE DOAS SHALL NOT RUN UNLESS A ZONE OVERRIDE COMMAND IS RECEIVED.'));
});

test('large multi-line heading and embedded reset tables retain source scope and column rows', () => {
  const capture = JSON.parse(readFileSync(new URL('../../docs/bas-production/evidence/baseline/behavioral-text.json', import.meta.url), 'utf8'));
  const truth = JSON.parse(readFileSync(new URL('./fixtures/bas-narrative-behavioral.json', import.meta.url), 'utf8'));
  assert.equal(capture.sha256, truth.source_sha256);
  const key = truth.regions[0];
  const page = capture.pages.find((p: { page: number }) => p.page === 20);
  // Authored from the original M701 page: the complete right-hand bounded SOO
  // region, twelve lettered sections, and two three-row reset tables. The
  // unrelated 101-row point matrix to its left must not enter this region.
  const input = buildBasSourceContext([{ name: 'behavioral-source-capture.pdf', sha256: capture.sha256, byte_length: 1,
    page_count: 1, pages: [{ page_number: 1, sheet_key: 'M701-capture', width_px: page.width, height_px: page.height,
      rotation: 0, spans: page.spans }] }]);
  const result = discoverBasNarratives(input).pages[0];
  assert.equal(result.regions.length, 1);
  const region = result.regions[0];
  assert.equal(region.status, 'body_detected');
  assert.equal(region.title, key.context_title);
  const [x0, y0, x1, y1] = key.bbox;
  const expected = input.pages[0].spans.filter(s => s.bbox_px[0] >= x0 && s.bbox_px[1] >= y0 && s.bbox_px[2] <= x1 && s.bbox_px[3] <= y1);
  assert.deepEqual(regionSpans(region), expected.map(s => s.span_id).sort());
  assert.deepEqual(prose(region).filter(p => p.marker).map(p => p.marker), key.section_markers);
  const insets = region.blocks.filter(b => b.kind === 'columnar');
  assert.deepEqual(insets.map(t => t.rows.map(row => row.map(l => l.text))), key.insets);
  assert.ok(basNarrativeRegionLines(region).some(l => l.geometry_status === 'inline_label_overlap'));
  const accounted = Object.values(result.accounting).flat();
  assert.deepEqual(accounted.sort(), input.pages[0].spans.map(s => s.span_id).sort());
});

test('inset source columns are not converted to prose or quantities, and isolated fragments require review', () => {
  const input = source([span('AHU CONTROL SEQUENCE', 10, 20), span('A. Reset from the following explicit values:', 10, 40),
    span('5 V', 10, 54, 20), span('10 V', 60, 54, 25), span('6 V', 10, 66, 20), span('12 V', 60, 66, 25),
    span('B. The fan shall follow its own enable.', 10, 90)]);
  const region = discoverBasNarratives(input).pages[0].regions[0];
  assert.equal(region.status, 'body_detected');
  assert.deepEqual(region.blocks.map(b => b.kind), ['paragraph', 'columnar', 'paragraph']);
  assert.equal(prose(region).some(b => b.lines.some(l => l.text.includes('5 V'))), false);
  const partial = source([span('AHU CONTROL SEQUENCE', 10, 20), span('A. Unclear separate fragments follow here:', 10, 40),
    span('5 V', 10, 54, 20), span('10 V', 60, 54, 25)]);
  const conflict = discoverBasNarratives(partial).pages[0];
  assert.equal(conflict.regions[0].status, 'segmentation_conflict');
  assert.equal(conflict.accounting.ambiguous_span_ids.length, 4);
});

test('inline label box overlap is disclosed but duplicate full text and parenthetical prose are not accepted as headings or section markers', () => {
  const input = source([span('CHW CONTROL SEQUENCE', 10, 20), span('A.', 10, 40, 8), span('PUMP CONTROL:', 30, 40, 95),
    span('The pump shall remain off.', 118, 40, 180), span('(ADJUSTABLE) does not introduce a new section.', 30, 52)]);
  const region = discoverBasNarratives(input).pages[0].regions[0];
  assert.equal(region.status, 'body_detected');
  assert.deepEqual(prose(region).map(p => p.marker), ['A.']);
  assert.equal(prose(region)[0].lines[0].geometry_status, 'inline_label_overlap');
  assert.ok(prose(region)[0].lines[0].text.includes('PUMP CONTROL: The pump shall remain off.'));
  const overlap = source([span('CHW CONTROL SEQUENCE', 10, 20), span('A. The pump shall be ON.', 10, 40), span('A. The pump shall be OFF.', 10, 40)]);
  assert.equal(discoverBasNarratives(overlap).pages[0].regions[0].status, 'segmentation_conflict');
});
