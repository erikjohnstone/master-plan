import type { ComponentProps } from "react";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import AgentAnswer from "../src/components/AgentAnswer.jsx";

test("AgentAnswer renders markdown tables as HTML tables, not pipe dumps", () => {
  const md = [
    "**VAV rollup**",
    "",
    "| Tag | CFM |",
    "|-----|-----|",
    "| **VAV-1** | **350** |",
    "| VAV-58 | 350 |",
    "",
    "- SUITE100 is not a VAV",
    "",
    "[Automated check: highlight_citation painted exactly 2 source region(s): VAV-1 · CFM = 350; VAV-58 · CFM = 350.]",
  ].join("\n");
  const html = renderToStaticMarkup(createElement(AgentAnswer, { text: md } as ComponentProps<typeof AgentAnswer>));
  assert.match(html, /data-agent-answer="structured"/);
  assert.match(html, /<table/);
  assert.match(html, /<th[^>]*>Tag<\/th>/);
  assert.match(html, /<strong>VAV-1<\/strong>/);
  assert.match(html, /<ul/);
  assert.doesNotMatch(html, /\| Tag \| CFM \|/);
  assert.match(html, /Automated check/);
});

test("AgentAnswer strips embedded highlight markup ids from chat", () => {
  const html = renderToStaticMarkup(createElement(AgentAnswer, {
    text: "VAV-1 CFM is 350【mk-aaaa-bbbb】 on the schedule.",
  } as ComponentProps<typeof AgentAnswer>));
  assert.doesNotMatch(html, /mk-aaaa/);
  assert.match(html, /VAV-1 CFM is 350/);
});

const renderAnswer = (text: string) => renderToStaticMarkup(createElement(AgentAnswer, { text } as ComponentProps<typeof AgentAnswer>));

test("dense answer rows become disclosure fields without changing labels or values", () => {
  const html = renderAnswer('1. MARK: AHU‑04 · MODEL: CSAA012UB · RPM: 1960 · NOTE: time: 08:30 · EMPTY:  · RPM: –');
  assert.match(html, /data-agent-answer-record/);
  assert.match(html, /6 fields/);
  assert.equal((html.match(/<dt>/g) || []).length, 6);
  assert.equal((html.match(/<dt>RPM<\/dt>/g) || []).length, 2);
  for (const value of ['AHU‑04', 'CSAA012UB', '1960', 'time: 08:30', '–']) assert.ok(html.includes(value));
  assert.match(html, /<dd><\/dd>/);
});

test("ordinary lists and ambiguous separators remain prose, not invented fields", () => {
  for (const text of [
    '- MARK: AHU-1 · CFM: 500',
    '- Read: plans · then check valves · Count: 3 · Review: required',
    '- A: 1 · : invalid · C: 3 · D: 4',
  ]) assert.doesNotMatch(renderAnswer(text), /data-agent-answer-record/);
});

test("long headings retain complete content inside an accessible disclosure", () => {
  const title = 'Original column label – '.repeat(20);
  const html = renderAnswer(`**${title}**`);
  assert.match(html, /<summary>Full heading<\/summary>/);
  assert.ok(html.includes(title));
  assert.doesNotMatch(renderAnswer('**Short heading**'), /Full heading/);
});

test("structured answer fields retain markdown and do not execute HTML", () => {
  const html = renderAnswer('- MARK: **AHU-1** · CFM: `500` · NOTE: *verify* · RAW: <script>alert(1)</script>');
  assert.match(html, /<strong>AHU-1<\/strong>/);
  assert.match(html, /<code[^>]*>500<\/code>/);
  assert.match(html, /<em>verify<\/em>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("nonbreaking label spaces gain wrap opportunities without character substitution", () => {
  const label = 'AIR\u00a0FLOWS\u202fTOTAL';
  const html = renderAnswer(`1. MARK: AHU-1 · ${label}: 0 · OTHER: – · NOTE: unchanged`);
  assert.match(html, /<wbr\/>/);
  assert.ok(html.replace(/<wbr\/>/g, '').includes(`<dt>${label}</dt>`));
  assert.match(html, /<dd>0<\/dd>/);
});

test("ordered and mixed lists preserve order and ordinary instructions", () => {
  const html = renderAnswer('1. Review before accepting\n2. MARK: X-1 · VALUE: 0 · FLAG: NO · NOTE: <pending>\n3. Do not count the reference rows');
  assert.match(html, /<ol/);
  assert.equal((html.match(/<li /g) || []).length, 3);
  assert.ok(html.indexOf('Review before accepting') < html.indexOf('data-agent-answer-record'));
  assert.ok(html.indexOf('data-agent-answer-record') < html.indexOf('Do not count'));
});

test("dense unordered answers launch a reader instead of stacking field accordions", () => {
  const text = '- MARK: AHU-1 · CFM: 0 · NOTE: unchanged · FLAG: NO\n- MARK: AHU-2 · CFM: 500 · NOTE: verify · FLAG: YES';
  const html = renderAnswer(text);
  assert.match(html, />Explore results<\/button>/);
  assert.match(html, /2 answer rows/);
  assert.match(html, /Original answer rows/);
  assert.doesNotMatch(html, /data-agent-answer-record/);
  assert.ok(html.includes('MARK: AHU-1 · CFM: 0 · NOTE: unchanged · FLAG: NO'));
  assert.ok(html.includes('MARK: AHU-2 · CFM: 500 · NOTE: verify · FLAG: YES'));
});
