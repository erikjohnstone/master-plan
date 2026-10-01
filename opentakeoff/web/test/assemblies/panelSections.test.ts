// The Takeoff panel's sections that name what cannot stand (AS-50, AS-53, AS-54),
// a unit's choice of another typical (AS-55), a drawing set changed since its
// schedules were read (AS-58), and the overrides one group action wrote
// (AS-59), rendered as the panel renders them.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { drawingSetChange, LineErrorsView, OverridesView, overrideRows, ProjectSettingsView, RowsLeftOutView, StaleProjectView, TypicalChoiceView, UnreadSchedulesView } from "../../src/components/AssembliesPanel.jsx";

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
  assert.match(html, /2 schedule sheets are pictures \(pasted images or a scan\): no table could be read from them, so any unit they schedule is missing here: M-601 \(page 21 of m\.pdf\), 59% pictures; page 22 of m\.pdf, 58% pictures\./);
  assert.match(renderToStaticMarkup(createElement(UnreadSchedulesView, { schedules: two.slice(0, 1) })), /A schedule sheet is pictures .* from it, so any unit it schedules is missing here/);
  assert.equal(renderToStaticMarkup(createElement(UnreadSchedulesView, { schedules: [] })), "", "none: nothing shown");
});

test("the rows of family schedules the takeoff reads as no unit are named, every mark of them (AS-61)", () => {
  const two = [
    { sheet: "m.pdf#40", sheet_number: "M-602", title: "DUAL DUCT AIR TERMINAL UNIT SCHEDULE", families: ["VAV"], rows: 15, marks: ["1-VAV-1", "1-VAV-2"], why: "…" },
    { sheet: "m.pdf#39", title: "FAN SCHEDULE", families: ["FAN"], rows: 11, marks: ["1-EF-36"], why: "…" },
  ];
  const html = renderToStaticMarkup(createElement(RowsLeftOutView, { schedules: two }));
  assert.match(html, /data-assemblies-rows-left-out="2"/);
  assert.match(html, /data-assemblies-rows-left-out-rows="3"/);
  assert.match(html, /role="note"/);
  assert.match(html, /3 scheduled rows are no unit here: the takeoff does not read their marks as marks of the family their schedule&#x27;s title names, so no record or line counts them\./);
  assert.match(html, /DUAL DUCT AIR TERMINAL UNIT SCHEDULE, M-602 \(page 40 of m\.pdf\) \(VAV\), 2 of 15 rows: 1-VAV-1, 1-VAV-2/);
  assert.match(html, /FAN SCHEDULE, page 39 of m\.pdf \(FAN\), 1 of 11 rows: 1-EF-36/);
  assert.match(renderToStaticMarkup(createElement(RowsLeftOutView, { schedules: two.slice(1) })), /A scheduled row is no unit here: the takeoff does not read its mark as marks of the family the schedule&#x27;s title names, so no record or line counts it\./);
  assert.equal(renderToStaticMarkup(createElement(RowsLeftOutView, { schedules: [] })), "", "none: nothing shown");
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

test("a drawing set changed since its schedules were read is named: files added, removed, revised or replaced (AS-58)", () => {
  const read = { epoch: 0, files: [{ name: "mech.pdf", rev: 1 }, { name: "elec.pdf", rev: 1 }] };
  assert.equal(drawingSetChange(read, { epoch: 0, files: [{ name: "elec.pdf", rev: 1 }, { name: "mech.pdf", rev: 1 }] }), null, "the same files, in any order");
  assert.equal(drawingSetChange(null, read), null, "nothing read yet");
  assert.equal(drawingSetChange(read, null), null);
  assert.deepEqual(drawingSetChange(read, { epoch: 0, files: [...read.files, { name: "controls.pdf", rev: 1 }] }),
    { added: ["controls.pdf"], removed: [], revised: [], replaced: false });
  assert.deepEqual(drawingSetChange(read, { epoch: 0, files: [read.files[0]] }), { added: [], removed: ["elec.pdf"], revised: [], replaced: false });
  // A re-drop with other bytes is a revision (CO-1): its rev and the epoch move.
  assert.deepEqual(drawingSetChange(read, { epoch: 1, files: [{ name: "mech.pdf", rev: 2 }, read.files[1]] }),
    { added: [], removed: [], revised: ["mech.pdf"], replaced: false });
  // A store that keeps no revision numbers: the epoch alone says a file was replaced.
  const bare = { epoch: 3, files: [{ name: "mech.pdf" }] };
  assert.equal(drawingSetChange(bare, { epoch: 3, files: [{ name: "mech.pdf" }] }), null);
  assert.deepEqual(drawingSetChange(bare, { epoch: 4, files: [{ name: "mech.pdf" }] }), { added: [], removed: [], revised: [], replaced: true });

  const change = drawingSetChange(read, { epoch: 1, files: [{ name: "mech.pdf", rev: 2 }, { name: "controls.pdf", rev: 1 }] });
  const html = renderToStaticMarkup(createElement(StaleProjectView, { change, onReload: () => {} }));
  assert.match(html, /data-assemblies-stale="3"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /The drawing set changed since these schedules were read<\/strong> \(added controls\.pdf; removed elec\.pdf; revised mech\.pdf\)\. The units, lines and exports below are still the earlier set&#x27;s\./);
  assert.match(html, /data-assemblies-stale-reread/);
  assert.match(renderToStaticMarkup(createElement(StaleProjectView, { change, onReload: () => {}, loading: true })), /disabled="".*Reading…/);
  assert.equal(renderToStaticMarkup(createElement(StaleProjectView, { change: null, onReload: () => {} })), "", "unchanged: nothing shown");
  // Its button reads the schedules again.
  let reads = 0;
  const view = StaleProjectView({ change, onReload: () => { reads++; } }) as any;
  const button = [view.props.children].flat().find((c: any) => c?.props?.["data-assemblies-stale-reread"]);
  button.props.onClick();
  assert.equal(reads, 1);
});

test("the overrides one group action wrote are one row, with Remove all N over their units (AS-59)", () => {
  const note = "not in the BAS scope (one of 3 FAN units of EXHAUST FAN SCHEDULE, decided together)";
  const use = "per the spec (one of 2 AHU units of AIR HANDLING UNIT SCHEDULE, decided together)";
  const overrides = [
    { tag: "P-1", family: "PUMP", layer: "controls", reason: "the estimator's own", assembly: { id: "pump-vfd" } },
    { tag: "EF-1", family: "FAN", reason: note, exclude: true },
    { tag: "AHU-1", family: "AHU", layer: "controls", reason: use, assembly: { id: "ahu-constant-volume" }, options: { economizer: true } },
    { tag: "EF-2", family: "FAN", reason: note, exclude: true },
    // A member's earlier options ride its override: the same group all the same.
    { tag: "AHU-2", family: "AHU", layer: "controls", reason: use, assembly: { id: "ahu-constant-volume" }, options: {} },
    { tag: "EF-3", family: "FAN", reason: note, exclude: true },
    // The same note on another layer, or a lone one left, is its own row.
    { tag: "EF-9", family: "FAN", layer: "hookup", reason: note },
  ];
  assert.deepEqual(overrideRows(overrides), [
    { indices: [0], together: false },
    { indices: [1, 3, 5], together: true },
    { indices: [2, 4], together: true },
    { indices: [6], together: false },
  ]);
  assert.deepEqual(overrideRows([overrides[1]]), [{ indices: [0], together: false }], "one left of a group is a row of its own");

  const unmatched = new Map([[overrides[3], "no unit EF-2 is in this project"]]);
  let removed: number[][] = [];
  const props = { overrides, sharedTags: new Set<string>(), unmatched, ignored: new Map(), onRemove: (ix: number[]) => { removed.push(ix); } };
  const html = renderToStaticMarkup(createElement(OverridesView, props));
  assert.match(html, /data-assemblies-overrides="7"/, "the count is still of overrides");
  assert.match(html, /data-assemblies-override-group="3"/);
  assert.match(html, /<strong>3 units decided together<\/strong> \(FAN\): excluded/);
  assert.match(html, /<strong>2 units decided together<\/strong> \(AHU, controls\): typical ahu-constant-volume</, "what every unit shares");
  assert.match(html, /Remove all 3/);
  assert.match(html, /1 marked below/);
  assert.equal((html.match(/data-assemblies-override-unmatched/g) ?? []).length, 1, "the unit's own mark stays on its line");
  assert.match(html, /<details open=""/, "a group with a marked unit opens");
  assert.equal((html.match(/<details open=""/g) ?? []).length, 1, "and only that one");
  // Remove all N removes the group's overrides; a unit's own Remove, its own.
  const view = OverridesView(props) as any;
  const rows = [view.props.children].flat(2).filter(Boolean);
  const group = rows.find((r: any) => r?.props?.["data-assemblies-override-group"] === 3);
  const removeAll = [group.props.children].flat().find((c: any) => c?.props?.["data-assemblies-override-group-remove"] === 3);
  removeAll.props.onClick();
  const details = [group.props.children].flat().find((c: any) => c?.type === "details");
  const second = [details.props.children].flat(2).filter((c: any) => c?.type === "div")[1];
  [second.props.children].flat().find((c: any) => c?.type === "button").props.onClick();
  assert.deepEqual(removed, [[1, 3, 5], [3]]);
});
