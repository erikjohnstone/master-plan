import type { ComponentProps } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
import test from "node:test";
import BasMathSummary from "../src/components/BasMathSummary.jsx";

const result = {
  status: "review_required", source_coverage: "both", physical_total: { AI: 5, AO: 0, DI: 2, DO: 1 },
  points: [{ group_id: 'g', point_id: 'TEMP', physical: { AI: 1, AO: 0, DI: 0, DO: 0 }, soft: [], conflict: true,
    evidence: [{ text: '<img onerror="bad()">', sheet_id: 'real.pdf#2', table_title: 'CONTROL MATRIX', bbox_px: [1, 2, 3, 4] }] }],
  hardware: [], licenses: [], serial: [], ip: [], diagnostics: [{ code: 'SOURCE_POINT_MISSING', severity: 'warning', message: 'review' }],
};
type Props = ComponentProps<typeof BasMathSummary>;
const render = (props: Omit<Props, "onOpenCitation"> & { onOpenCitation?: Props["onOpenCitation"] }) =>
  renderToStaticMarkup(createElement(BasMathSummary, { onOpenCitation: undefined, ...props }));

test('BAS Takeoff defaults to an escaped source table and never certifies installed counts', () => {
  const before = JSON.stringify(result);
  const html = render({ result, onOpenCitation: () => {} });
  assert.match(html, /BAS typed points/);
  assert.match(html, /SOO and drawing-list capacity envelope/);
  assert.match(html, /not verified installed-device counts/);
  assert.match(html, /data-bas-total="AI"[^>]*>5</);
  assert.match(html, /&lt;img onerror=/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /View source/);
  assert.match(html, /aria-selected="true"[^>]*>Points/);
  assert.equal(JSON.stringify(result), before);
});

test('BAS point filtering preserves global totals and failure is not a zero takeoff', () => {
  const filtered = render({ result, filter: 'absent' });
  assert.match(filtered, /No points match this filter/);
  assert.match(filtered, /data-bas-total="AI"[^>]*>5</);
  const unavailable = render({ result: { status: 'unavailable', error: 'Missing Python' } });
  assert.match(unavailable, /Missing Python/);
  assert.doesNotMatch(unavailable, /data-bas-total/);
  assert.match(unavailable, /Original schedule results are preserved/);
});
