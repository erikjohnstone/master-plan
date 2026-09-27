// The Takeoff panel's sections that name what cannot stand (AS-50, AS-53, AS-54),
// and a unit's choice of another typical (AS-55), rendered as the panel
// renders them.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LineErrorsView, ProjectSettingsView, TypicalChoiceView, UnreadSchedulesView } from "../../src/components/AssembliesPanel.jsx";

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

test("the schedule sheets whose tables are pictures are named above the rest, each with its share (AS-54)", () => {
  const why = "no table could be read from it: 59% of the sheet is pictures (pasted images or a scan), so any unit it schedules is missing from these assemblies";
  const two = [{ sheet: "m.pdf#21", sheet_number: "M-601", picture_share: 0.59, why }, { sheet: "m.pdf#22", picture_share: 0.58, why }];
  const html = renderToStaticMarkup(createElement(UnreadSchedulesView, { schedules: two }));
  assert.match(html, /data-assemblies-schedules-unread="2"/);
  assert.match(html, /role="note"/);
  assert.match(html, /2 schedule sheets are pictures \(pasted images or a scan\): no table could be read from them, so any unit they schedule is missing here: M-601 \(page 21\), 59% pictures; page 22, 58% pictures\./);
  assert.match(renderToStaticMarkup(createElement(UnreadSchedulesView, { schedules: two.slice(0, 1) })), /A schedule sheet is pictures .* from it, so any unit it schedules is missing here/);
  assert.equal(renderToStaticMarkup(createElement(UnreadSchedulesView, { schedules: [] })), "", "none: nothing shown");
});

test("a unit's details offer the other typicals of its family, else the layer's others, and choosing one writes the override (AS-55)", () => {
  const t = (id: string, title: string) => ({ id, version: "1", title });
  const vavs = [t("vav-reheat-hw", "VAV, hot-water reheat"), t("vav-cooling-only", "VAV, cooling only"), t("lab-airflow", "Laboratory airflow control")];
  const vav = { tag: "VAV-1", family: "VAV", layer: "controls", assembly: "vav-reheat-hw@1" };
  const html = renderToStaticMarkup(createElement(TypicalChoiceView, { unit: vav, choices: { family: vavs, other: [t("fcu", "Fan coil")] }, onOverride: () => {} }));
  assert.match(html, /data-assemblies-choose-typical="VAV-1"/);
  assert.match(html, /aria-label="Use another typical for VAV-1 \(VAV, controls\)"/);
  assert.match(html, /<optgroup label="VAV typicals"><option value="lab-airflow@1">lab-airflow@1: Laboratory airflow control<\/option><option value="vav-cooling-only@1">vav-cooling-only@1: VAV, cooling only<\/option><\/optgroup>/);
  assert.doesNotMatch(html, /value="vav-reheat-hw@1"/, "not the one it has");
  assert.doesNotMatch(html, /fcu/, "another family's only when none of its own");
  // A family no typical lists: the layer's others, said so.
  const valve = { tag: "GEV-1", family: "LAB_AIR_VALVE", layer: "controls", assembly: null };
  const others = renderToStaticMarkup(createElement(TypicalChoiceView, { unit: valve, choices: { family: [], other: [t("lab-airflow", "Laboratory airflow control"), t("fcu", "Fan coil")] }, onOverride: () => {} }));
  assert.match(others, /<optgroup label="No typical lists LAB_AIR_VALVE; other families&#x27; \(their lines may wait for values its row does not print\)"><option value="fcu@1">/);
  assert.match(others, /value="lab-airflow@1"/);
  // Nothing else to choose: nothing shown.
  assert.equal(renderToStaticMarkup(createElement(TypicalChoiceView, { unit: { tag: "FCU-1", family: "FCU", layer: "controls", assembly: "fcu@1" }, choices: { family: [t("fcu", "Fan coil")], other: vavs }, onOverride: () => {} })), "");
  assert.doesNotMatch(html, /data-assemblies-choose-typical-all/, "no second list without rows like it");
  // Choosing writes the override apply_assemblies takes, with what was chosen
  // for the reason prompt; the second list makes it for every row like it.
  const calls: unknown[] = [];
  const all: unknown[] = [];
  const props = { unit: vav, choices: { family: vavs, other: [] }, onOverride: (patch: unknown, what: string) => calls.push([patch, what]),
    like: { count: 7, schedule: "VAV BOX SCHEDULE", onOverride: (patch: unknown, what: string) => all.push([patch, what]) } };
  const both = renderToStaticMarkup(createElement(TypicalChoiceView, props));
  assert.match(both, /data-assemblies-choose-typical-all="7"/);
  assert.match(both, /aria-label="Use another typical for all the 7 VAV units of VAV BOX SCHEDULE with vav-reheat-hw@1"/);
  assert.match(both, />…for all 7 like it<\/option>/);
  type Select = { props: { onChange: (e: { target: { value: string } }) => void } };
  const [single, many] = (TypicalChoiceView(props) as { props: { children: [Select, Select] } }).props.children;
  single.props.onChange({ target: { value: "lab-airflow@1" } });
  single.props.onChange({ target: { value: "" } });
  many.props.onChange({ target: { value: "vav-cooling-only@1" } });
  assert.deepEqual(calls, [[{ assembly: { id: "lab-airflow", version: "1" } }, "choosing lab-airflow for VAV-1"]]);
  assert.deepEqual(all, [[{ assembly: { id: "vav-cooling-only", version: "1" } }, "choosing vav-cooling-only for the 7 VAV units of VAV BOX SCHEDULE with vav-reheat-hw@1"]]);
  // One row alone has no second list.
  assert.doesNotMatch(renderToStaticMarkup(createElement(TypicalChoiceView, { ...props, like: { ...props.like, count: 1 } })), /choose-typical-all/);
});
