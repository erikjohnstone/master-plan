// Session tests against the bundled demo plan — real pdf.js parse, real
// geometry, no transport. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Session, ANN_SCHEMA, collapseEquivalentPrimaryTables } from "../src/session.ts";
import type { ScheduleTable } from "../../web/src/lib/sheetgraph.ts";

const PLAN = fileURLToPath(new URL("../../demo/sample-plan.pdf", import.meta.url));
const KEY = "sample-plan.pdf";
const approx = (a: number, b: number, tolFrac: number) => Math.abs(a - b) <= Math.abs(b) * tolFrac;

test("loadPlan: pages, dims (pt and px), detected scale, sheet number", async () => {
  const s = new Session();
  const r = await s.loadPlan(PLAN);
  assert.equal(r.page_count, 1);
  assert.equal(r.file, KEY);
  assert.equal(r.sheets.length, 1);
  const sh = r.sheets[0];
  assert.equal(sh.sheet, KEY);
  assert.equal(sh.width_pt, 1224);
  assert.equal(sh.height_pt, 792);
  assert.equal(sh.width_px, 2448);
  assert.equal(sh.height_px, 1584);
  assert.equal(sh.detected_scale, '1/4" = 1\'-0"');
  assert.equal(sh.sheet_number, "A-101");
});

test("sheet lookup: by key, by title-block number, unknown lists loaded keys", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  const info = await s.sheetInfo("A-101");            // title-block alias
  assert.equal(info.sheet, KEY);
  assert.ok(info.has_vector_linework);
  assert.ok(info.seg_count >= 6, `outer wall + partitions, got ${info.seg_count}`);
  assert.equal(info.scale_set, false);
  await assert.rejects(() => s.sheetInfo("nope.pdf"), /Unknown sheet .* loaded sheets: sample-plan\.pdf/);
});

test("ensureMask: built once, cache identity on the second call", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  const m1 = await s.ensureMask(KEY);
  const m2 = await s.ensureMask(KEY);
  assert.ok(m1, "the demo plan has vector linework");
  assert.equal(m1, m2, "same MaskObj identity — not rebuilt");
});

test("setScale: label / upp / calibrate / use_detected all land on the same upp", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  const want = 1 / 36; // 1/4" = 1'-0" at render scale 2: 4 ft per 144 px

  const byLabel = s.setScale(KEY, { label: '1/4" = 1\'-0"' });
  assert.ok(Math.abs(byLabel.upp - want) < 1e-12);

  const byUpp = s.setScale(KEY, { upp: 0.5 });
  assert.equal(byUpp.upp, 0.5);

  // the building's bottom edge: 1960 px wide = 54.44 real feet at 1/4" scale
  const byCal = s.setScale(KEY, { calibrate: { p1: [240, 1364], p2: [2200, 1364], feet: 54.44 } });
  assert.ok(Math.abs(byCal.upp - want) < 1e-4, `calibrated upp ≈ 1/36, got ${byCal.upp}`);

  const byDet = s.setScale(KEY, { use_detected: true });
  assert.ok(Math.abs(byDet.upp - want) < 1e-12);
  assert.equal(byDet.label, '1/4" = 1\'-0"');
});

test("setScale: unknown label errors and lists the valid labels", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  await assert.rejects(async () => s.setScale(KEY, { label: '1/5" = 1\'-0"' }), (e: Error) => {
    assert.match(e.message, /Unknown scale label/);
    assert.match(e.message, /1\/4" = 1'-0"/);
    assert.match(e.message, /1" = 20'/);
    return true;
  });
});

test("oneClick: px-only preview with warning before scale, SF after, leak outside", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);

  const pre = await s.oneClick(KEY, 600, 1084, { role: "floor_area", returnVerts: false });
  assert.equal(pre.status, "ok");
  assert.ok("area_px2" in pre && (pre as any).area_px2 > 0);
  assert.ok("perimeter_px" in pre);
  assert.ok(!("area_sf" in pre));
  assert.match((pre as any).warning, /No scale set for sample-plan\.pdf/);
  assert.match((pre as any).warning, /detected: 1\/4" = 1'-0"/);
  assert.equal(s.shapes.length, 0, "px preview never commits");

  s.setScale(KEY, { use_detected: true });
  const post = await s.oneClick(KEY, 600, 1084, { role: "floor_area", returnVerts: true });
  assert.ok(approx((post as any).area_sf, 438.6, 0.05), `room ≈ 438.6 SF, got ${(post as any).area_sf}`);
  assert.ok((post as any).nverts >= 3);
  assert.ok(Array.isArray((post as any).verts));
  assert.ok(!("shape_id" in post), "no condition given — nothing committed");
  assert.equal(s.shapes.length, 0);

  await assert.rejects(() => s.oneClick(KEY, 100, 100, { role: "floor_area", returnVerts: false }),
    /isn't enclosed on the plan linework/);
});

test("commit: verts_norm in [0,1], origin receipt, condition minted like the canvas", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  s.setScale(KEY, { use_detected: true });
  const r = await s.oneClick(KEY, 600, 1084, { condition: "CPT-1", role: "floor_area", returnVerts: false });
  assert.ok((r as any).shape_id);
  assert.equal(s.shapes.length, 1);
  const shp = s.shapes[0];
  assert.equal(shp.sheet_id, KEY);
  assert.equal(shp.measure_role, "floor_area");
  for (const [x, y] of shp.verts_norm) {
    assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `verts_norm out of [0,1]: ${x},${y}`);
  }
  assert.equal(shp.origin?.method, "one_click_v1");
  assert.equal(shp.origin?.actor, "agent", "MCP commits are agent work, never human");
  assert.equal(shp.origin?.reviewed, false, "no human review gate exists in this server");
  assert.ok(shp.origin?.seed_norm?.[0]! > 0 && shp.origin?.seed_norm?.[0]! < 1);
  assert.equal(s.conditions.length, 1);
  const c = s.conditions[0];
  assert.equal(c.finish_tag, "CPT-1");
  assert.equal(c.color, "#c96442");      // first palette slot
  assert.equal(c.fill, "#c96442");
  assert.equal(c.hatch, "diag");         // HATCHES[1 + 0 % 15]
  assert.equal(c.multiplier, 1);
  assert.equal(c.waste_pct, 0);
  assert.deepEqual(c.materials, []);
});

test("detectRooms: finds all 4 real room labels, excludes the title-block number and scale note", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  s.setScale(KEY, { use_detected: true });
  const r = await s.detectRooms(KEY, { role: "floor_area", returnVerts: false });
  assert.equal(r.detected, 4, `expected the 4 office/break/corridor rooms, got ${JSON.stringify(r.rooms.map((x) => x.label))}`);
  assert.deepEqual(r.rooms.map((x) => x.label).sort(), ["101", "102", "103", "104"]);
  for (const room of r.rooms) assert.ok(approx((room as any).area_sf, 438.6, 0.05), `room ${room.label} ≈ 438.6 SF, got ${(room as any).area_sf}`);
  assert.equal(s.shapes.length, 0, "no condition given — nothing committed");
});

test("detectRooms: px-only preview before scale; condition commits every detected room under one finish tag", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  const pre = await s.detectRooms(KEY, { role: "floor_area", returnVerts: false });
  assert.equal(pre.detected, 4);
  assert.ok("area_px2" in pre.rooms[0] && pre.rooms[0].area_px2! > 0);
  assert.ok(!("area_sf" in pre.rooms[0]));
  assert.match(pre.warning!, /No scale set for sample-plan\.pdf/);
  assert.equal(s.shapes.length, 0);

  s.setScale(KEY, { use_detected: true });
  const r = await s.detectRooms(KEY, { condition: "CPT-1", role: "floor_area", returnVerts: false });
  assert.equal(r.rooms.filter((x) => (x as any).shape_id).length, 4, "all 4 rooms committed");
  assert.equal(s.shapes.length, 4);
  assert.equal(s.conditions.length, 1, "one condition minted, shared by every detected room");
  for (const shp of s.shapes) {
    assert.equal(shp.origin?.method, "one_click_v1");
    assert.equal(shp.origin?.actor, "agent");
    assert.equal(shp.origin?.reviewed, false);
  }
});

test("detectRooms: a sheet with no room-number labels detects nothing, no crash", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  s.setScale(KEY, { use_detected: true });
  const r = await s.detectRooms(KEY, { role: "floor_area", returnVerts: false });
  assert.ok(r.detected > 0, "sanity: the fixture does have labels");
  // now prove the empty case doesn't throw — a region with no labels near it
  const noLabelRegion = s.readSheetText(KEY, { x0: 0, y0: 0, x1: 1, y1: 1 });
  assert.equal(noLabelRegion.items.length, 0);
});

test("measure gates: polygon and line refuse without a scale, with the detected hint", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  const wantMsg = /Set the scale for sample-plan\.pdf first — use set_scale \(detected: 1\/4" = 1'-0"\)\./;
  await assert.rejects(async () => s.measurePolygon(KEY, [[0, 0], [100, 0], [100, 100]], { role: "floor_area" }), wantMsg);
  await assert.rejects(async () => s.measureLine(KEY, [[0, 0], [100, 0]], {}), wantMsg);
});

test("measure: polygon SF and line LF at scale; deletion removes the shape", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  s.setScale(KEY, { use_detected: true });
  // 360×360 px = 10×10 ft
  const poly = s.measurePolygon(KEY, [[0, 0], [360, 0], [360, 360], [0, 360]], { condition: "TILE-1", role: "floor_area" });
  assert.equal(poly.area_sf, 100);
  assert.equal(poly.perimeter_lf, 40);
  const line = s.measureLine(KEY, [[0, 0], [720, 0]], { condition: "BASE-1" });
  assert.equal(line.length_lf, 20);
  assert.equal(s.shapes.length, 2);
  assert.equal(s.shapes[1].measure_role, "linear");
  assert.equal(s.shapes[1].computed.area_sf, 0);
  // agent-supplied coordinates: a hand trace by a machine hand, never human
  for (const shp of s.shapes) {
    assert.equal(shp.origin?.method, "manual");
    assert.equal(shp.origin?.actor, "agent");
    assert.equal(shp.origin?.reviewed, undefined, "measure commits claim no review state");
  }
  s.deleteShape(poly.shape_id!);
  assert.equal(s.shapes.length, 1);
  await assert.rejects(async () => s.deleteShape("shp-nope"), /No shape with id/);
});

test("exportPayload: exact envelope keys, schema, only scaled sheets listed", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  let p = s.exportPayload();
  assert.deepEqual(p.sheets, [], "no scale set — no sheets entries");
  s.setScale(KEY, { use_detected: true });
  await s.oneClick(KEY, 600, 1084, { condition: "CPT-1", role: "floor_area", returnVerts: false });
  p = s.exportPayload();
  assert.deepEqual(Object.keys(p).sort(), [
    "conditions", "last_group", "markups", "project_name", "schema",
    "shapes", "sheet_group", "sheet_levels", "sheet_tabs", "sheets", "units",
  ]);
  assert.equal(p.schema, ANN_SCHEMA);
  assert.equal(p.schema, "opentakeoff.takeoff_canvas.v1");
  assert.equal(p.units, "imperial");
  assert.equal(p.project_name, "");
  assert.deepEqual(p.markups, []);
  assert.deepEqual(p.sheet_levels, {});
  assert.equal(p.sheets.length, 1);
  assert.equal(p.sheets[0].sheet_id, KEY);
  assert.ok(Math.abs(p.sheets[0].units_per_px! - 1 / 36) < 1e-12);
  assert.equal(p.shapes.length, 1);
  assert.equal(p.conditions.length, 1);
});

test("loadPlan again: replaces the session — scales, conditions, shapes all cleared", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  s.setScale(KEY, { use_detected: true });
  await s.oneClick(KEY, 600, 1084, { condition: "CPT-1", role: "floor_area", returnVerts: false });
  const r = await s.loadPlan(PLAN);
  assert.match(r.note, /cleared/);
  assert.equal(s.shapes.length, 0);
  assert.equal(s.conditions.length, 0);
  const info = await s.sheetInfo(KEY);
  assert.equal(info.scale_set, false);
  assert.equal(info.shape_count, 0);
});

test("readSheetText: positioned items in image px; region narrows to the title block", async () => {
  const s = new Session();
  await s.loadPlan(PLAN);
  const all = s.readSheetText(KEY);
  assert.match(all.text, /OFFICE 101/);
  assert.match(all.text, /SCALE: 1\/4"/);
  const office = all.items.find((i) => i.str === "OFFICE 101")!;
  assert.ok(Math.abs(office.x - 600) < 2 && Math.abs(office.y - 1084) < 2, `label at ~(600,1084), got (${office.x},${office.y})`);
  // lower-right quadrant only — the title block
  const tb = s.readSheetText(KEY, { x0: 1468, y0: 871, x1: 2448, y1: 1584 });
  assert.ok(tb.items.some((i) => i.str === "A-101"));
  assert.ok(!tb.text.includes("OFFICE 101"));
});

// 0.9.18 — floorTagFor, the per-room resolver behind assign-from-schedule.
// Unit-tested here because the fixture's room 134 (the REAL compound cell,
// "CPT-1/VCT-1") never survives detect_rooms' geometric gates on this sheet —
// the resolver's refusal doctrine still has to hold when a future plan DOES
// flood it cleanly.
test("floorTagFor: resolves the row's FLOOR cell; compound cells and missing rows refuse with reasons", async () => {
  const FINISH = fileURLToPath(new URL("../../demo/sample-finish-plan.pdf", import.meta.url));
  const s = new Session();
  await s.loadPlan(FINISH);
  const g = await (s as any).ensureGraph();
  const resolve = (tag: string) => (s as any).floorTagFor(g, tag);

  // a clean row resolves to its FLOOR literal, citing the schedule sheet —
  // and the hyphen in "CPT-1" never trips the compound detector
  const ok = resolve("164");
  assert.deepEqual(ok, { tag: "CPT-1", sheet: "sample-finish-plan.pdf#2" });

  // the compound cell is ambiguous: committing whole-room SF under a
  // two-finish literal asserts an area split the schedule never stated
  const amb = resolve("134");
  assert.match(amb.reason, /^ambiguous: floor cell "CPT-1\/VCT-1" names more than one finish/);
  assert.equal(amb.tag, undefined, "an ambiguous cell yields no tag at all");

  // no row: resolveTag's own reason passes through verbatim
  assert.match(resolve("999").reason, /no schedule row for 999/);
});

// 0.9.18 — the marked-set cover's assignment-provenance line. Pure function,
// synthetic shapes: no PDF in the loop.
test("assignmentDisclosure: null for all-human, mixed counts, and the pointInPoly staleness drop", async () => {
  const { assignmentDisclosure } = await import("../src/marked.ts");
  const shape = (over: Record<string, unknown>) => ({
    id: "shp-x", sheet_id: "p.pdf", condition_id: "cnd-x", measure_role: "floor_area",
    verts_norm: [[0.1, 0.1], [0.4, 0.1], [0.4, 0.4], [0.1, 0.4]], computed: { area_sf: 1, perimeter_lf: 1 },
    ...over,
  }) as any;

  // an all-human takeoff discloses nothing — the canvas path stays unchanged
  assert.equal(assignmentDisclosure([shape({ origin: undefined })], []), null);
  assert.equal(assignmentDisclosure([], []), null);

  // mixed counts, in the stated order
  const mixed = [
    shape({ id: "a", origin: { method: "one_click_v1", actor: "agent", reviewed: false, assignment: { source: "schedule" } } }),
    shape({ id: "b", origin: { method: "one_click_v1", actor: "agent", reviewed: false, assignment: { source: "schedule" } } }),
    shape({ id: "c", origin: { method: "manual", actor: "agent", reviewed: false, assignment: { source: "asserted" } } }),
  ];
  assert.equal(
    assignmentDisclosure(mixed, [{ sheet_id: "p.pdf", label: "9", reason: "no row", seed_norm: [0.9, 0.9] } as any]),
    "Finish assignment: 2 schedule-resolved · 1 agent-asserted · 3 pending human review · 1 room withheld, unresolved against the schedule",
  );

  // staleness: a withheld seed INSIDE a committed area ring was answered by
  // hand after the sweep — the cover must not still call it withheld. A seed
  // on another sheet at the same coordinates stays.
  const inside = { sheet_id: "p.pdf", label: "7", reason: "no row", seed_norm: [0.2, 0.2] } as any;
  const otherSheet = { ...inside, sheet_id: "q.pdf" };
  assert.equal(
    assignmentDisclosure(mixed, [inside]),
    "Finish assignment: 2 schedule-resolved · 1 agent-asserted · 3 pending human review",
  );
  assert.match(assignmentDisclosure(mixed, [otherSheet])!, / · 1 room withheld/);
});

// ── collapseEquivalentPrimaryTables: title-less exact-key-set duplicate ────
test("collapseEquivalentPrimaryTables also removes a TITLE-LESS duplicate whose row-key set exactly matches an already-titled table (real bug: 045_FL_VA_Project_516_21_107_EHRM_Infrastructure's own CHILLED WATER FAN COIL UNIT SCHEDULE)", () => {
  const bbox: [number, number, number, number] = [0, 0, 1, 1];
  const cell = (text: string) => ({ text, bbox });
  const row = (key: string, cells: Record<string, string>) => ({
    key, sheet: "045.pdf#21",
    cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, cell(v)])),
  });
  const keys = ["FCU1-1-1", "FCU1-3-4", "FCU1-5-3", "FCU1-7-2", "FCU2-1-7", "FCU2-4-16", "FCU2-6-19", "FCU3-1-17", "FCU4-1-24"];
  // The real, correct extraction: a genuine title, the full real header set
  // (11 real columns including COOLING COIL SENSIBLE/TOTAL CAPACITY).
  const titled: ScheduleTable = {
    kind: "equipment", sheet: "045.pdf#21",
    title: { text: "CHILLED WATER FAN COIL UNIT SCHEDULE", bbox, sheet: "045.pdf#21" },
    headers: ["MARK", "MANUFACTURER", "MODEL", "SUPPLY AIR (CFM)", "OUTSIDE AIR (CFM)", "ESP (IN-WG)",
      "SENSIBLE CAPACITY (BTU/H)", "TOTAL CAPACITY (BTU/H)", "FLOW (GPM)", "MAX PD (FT-H2O)", "REMARKS"],
    rows: keys.map((k) => row(k, { MARK: k, MANUFACTURER: "CARRIER", MODEL: "42CG-10", "SUPPLY AIR (CFM)": "1000" })),
    region: bbox,
  };
  // The real, confirmed-live duplicate: same 9 real row keys, no title, a
  // merged/collapsed 8-column header (real columns lost, not just renamed).
  const untitled: ScheduleTable = {
    kind: "equipment", sheet: "045.pdf#21",
    title: null,
    headers: ["MARK", "MANUFACTURER", "MODEL", "SUPPLY AIR OUTSIDE AIR ESP CAPACITY CAPACITY FLOW MAX PD CFM", "ESP CFM", "ESP", "GPM", "REMARKS"],
    rows: keys.map((k) => row(k, { MARK: k, MANUFACTURER: "CARRIER", MODEL: "42CG-10" })),
    region: bbox,
  };
  const tables = [titled, untitled];
  const removed = collapseEquivalentPrimaryTables(tables);
  assert.equal(removed, 1, "exactly the title-less duplicate must be removed");
  assert.equal(tables.length, 1);
  assert.equal(tables[0], titled, "the already-titled, richer read survives — never the title-less loser");

  // Negative control: two DIFFERENT title-less tables on the same sheet that
  // happen to share no title but ALSO share no key overlap — must never be
  // touched (no false collapse of genuinely unrelated tables).
  const otherUntitled: ScheduleTable = {
    kind: "equipment", sheet: "045.pdf#21", title: null,
    headers: ["MARK", "SIZE"],
    rows: [row("EF-1", { MARK: "EF-1", SIZE: "12x12" })],
    region: bbox,
  };
  const noMatch = [titled, otherUntitled];
  assert.equal(collapseEquivalentPrimaryTables(noMatch), 0, "a title-less table with a genuinely different key set is never collapsed");
  assert.equal(noMatch.length, 2);

  // Negative control: a REFERENCE-kind table must never be matched against,
  // titled or not — a real cross-reference/connection table sharing one
  // device's tag with its own primary schedule is a genuinely different
  // real table (matchByKeySet's own established precedent, same file).
  const refTable: ScheduleTable = {
    kind: "reference", sheet: "045.pdf#21", title: null,
    headers: ["MARK"], rows: keys.map((k) => row(k, { MARK: k })), region: bbox,
  };
  const refPair = [titled, refTable];
  assert.equal(collapseEquivalentPrimaryTables(refPair), 0, "a reference-kind table is never treated as a duplicate of a primary schedule");
  assert.equal(refPair.length, 2);
});

test("collapseEquivalentPrimaryTables also removes a TITLED reference-kind duplicate of an equipment-kind table when both share the same real title and whitespace-normalized key set (real bug: 047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU's own DISCONNECT SCHEDULE)", () => {
  const bbox: [number, number, number, number] = [0, 0, 1, 1];
  const cell = (text: string) => ({ text, bbox });
  const row = (key: string, cells: Record<string, string>) => ({
    key, sheet: "047.pdf#27",
    cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, cell(v)])),
  });
  const headers = ["DISC NAME", "TYPE OF EQUIPMENT", "VOLTAGE RATING", "ENCLOSURE RATING", "DISC. AMP/POLE", "FUSE/BREAKER SIZE", "STARTER SIZE", "DISCONNECT NOTES"];
  // The real reference-kind read: the vocabulary-free structural pass uses
  // the page's own literal text as each row's key — "DS ODU-1", WITH its
  // real internal space.
  const referenceRead: ScheduleTable = {
    kind: "reference", sheet: "047.pdf#27",
    title: { text: "DISCONNECT SCHEDULE", bbox, sheet: "047.pdf#27" },
    headers,
    rows: [
      row("DS ODU-1", { "DISC NAME": "DS ODU-1", "TYPE OF EQUIPMENT": "DISCONNECT SWITCH", "VOLTAGE RATING": "600V" }),
      row("TS IDU-1", { "DISC NAME": "TS IDU-1", "TYPE OF EQUIPMENT": "TOGGLE SWITCH", "VOLTAGE RATING": "277V" }),
      row("TS IDU-2", { "DISC NAME": "TS IDU-2", "TYPE OF EQUIPMENT": "TOGGLE SWITCH", "VOLTAGE RATING": "277V" }),
    ],
    region: bbox,
  };
  // The real equipment-kind read: rowKeyOf strips the internal space when
  // joining a multi-token real mark into one CODE_RE-matching key —
  // "DSODU-1", the identical real device, no space.
  const equipmentRead: ScheduleTable = {
    kind: "equipment", sheet: "047.pdf#27",
    title: { text: "DISCONNECT SCHEDULE", bbox, sheet: "047.pdf#27" },
    headers,
    rows: [
      row("DSODU-1", { "DISC NAME": "DS ODU-1", "TYPE OF EQUIPMENT": "DISCONNECT SWITCH", "VOLTAGE RATING": "600V", "ENCLOSURE RATING": "NEMA 3R" }),
      row("TSIDU-1", { "DISC NAME": "TS IDU-1", "TYPE OF EQUIPMENT": "TOGGLE SWITCH", "VOLTAGE RATING": "277V", "ENCLOSURE RATING": "NEMA 12" }),
      row("TSIDU-2", { "DISC NAME": "TS IDU-2", "TYPE OF EQUIPMENT": "TOGGLE SWITCH", "VOLTAGE RATING": "277V", "ENCLOSURE RATING": "NEMA 12" }),
    ],
    region: bbox,
  };
  const tables = [referenceRead, equipmentRead];
  const removed = collapseEquivalentPrimaryTables(tables);
  assert.equal(removed, 1, "exactly the weaker duplicate must be removed");
  assert.equal(tables.length, 1);
  assert.equal(tables[0], equipmentRead, "the richer read (more populated cells) survives");

  // Negative control: a genuinely DIFFERENT real cross-reference table
  // (its own distinct title) sharing one device's tag with a primary
  // schedule must never be collapsed — matchByRegionOverlap's own
  // established precedent (baker-county-eoc-bidset.pdf#60's own real
  // MECHANICAL EQUIPMENT CONNECTION SCHEDULE), preserved here because the
  // identity requires the SAME normalized title, not just the same keys.
  const crossRef: ScheduleTable = {
    kind: "reference", sheet: "047.pdf#27",
    title: { text: "MECHANICAL EQUIPMENT CONNECTION SCHEDULE", bbox, sheet: "047.pdf#27" },
    headers: ["MARK", "CONNECTED TO"],
    rows: [row("DS ODU-1", { MARK: "DS ODU-1", "CONNECTED TO": "ODU-1" }), row("TS IDU-1", { MARK: "TS IDU-1", "CONNECTED TO": "IDU-1" }), row("TS IDU-2", { MARK: "TS IDU-2", "CONNECTED TO": "IDU-2" })],
    region: bbox,
  };
  const diffTitlePair = [equipmentRead, crossRef];
  assert.equal(collapseEquivalentPrimaryTables(diffTitlePair), 0, "a genuinely different real cross-reference table with its own title is never collapsed, even sharing every key");
  assert.equal(diffTitlePair.length, 2);
});
