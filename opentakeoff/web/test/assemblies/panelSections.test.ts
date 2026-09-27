// The Takeoff panel's sections that name what cannot stand (AS-50, AS-53),
// rendered as the panel renders them.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LineErrorsView, ProjectSettingsView } from "../../src/components/AssembliesPanel.jsx";

test("the lines that cannot be counted are listed, each with its unit, rule and why (AS-53)", () => {
  const cites = [{ sheet: "m.pdf#3", table_title: "COOLING TOWER SCHEDULE", header: "MARK", bbox: [0, 0, 1, 1] }];
  const html = renderToStaticMarkup(createElement(LineErrorsView, { lineErrors: [{ tag: "CT-1", family: "COOLING_TOWER", layer: "controls", rule: "cooling-tower@1:fan-cmd", kind: "point", why: "qty -2 is negative", cites }] }));
  assert.match(html, /data-assemblies-line-errors="1"/);
  assert.match(html, /1 line cannot be counted/);
  assert.match(html, /cooling-tower@1:fan-cmd/);
  assert.match(html, /qty -2 is negative/);
  assert.equal(renderToStaticMarkup(createElement(LineErrorsView, { lineErrors: [] })), "", "none: nothing shown");
});

test("Project settings lists what the project's library reads none of (AS-50)", () => {
  const unread = [{ key: "profile.strainerz", why: "no line has the switch strainerz" }];
  const html = renderToStaticMarkup(createElement(ProjectSettingsView, { settings: { profile: { strainerz: true } }, onChange: () => {}, unread }));
  assert.match(html, /data-assemblies-settings-unread="1"/);
  assert.match(html, /profile\.strainerz \(no line has the switch strainerz\)/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(ProjectSettingsView, { settings: {}, onChange: () => {} })), /settings-unread/);
});
