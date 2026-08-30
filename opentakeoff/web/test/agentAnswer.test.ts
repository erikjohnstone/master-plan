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
  const html = renderToStaticMarkup(createElement(AgentAnswer, { text: md }));
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
  }));
  assert.doesNotMatch(html, /mk-aaaa/);
  assert.match(html, /VAV-1 CFM is 350/);
});
