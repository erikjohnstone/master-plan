// CONTROL INTENT: zone plans (controlIntent/zonePlan.ts) and what they read
// for a unit — synthetic operator lists and spans only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OPS } from "pdfjs-dist";
import type { NoteSpan } from "../../src/lib/assemblies/scheduleNotes.ts";
import { pageRegions, readZonePlan, type PageRegion } from "../../src/lib/controlIntent/zonePlan.ts";
import { zoneAnswers } from "../../src/lib/controlIntent/record.ts";
import { TERM_LIST } from "../../src/lib/controlIntent/readers/terms.ts";
import { combineUnit } from "../../src/lib/controlIntent/combine.ts";
import type { ReaderAnswer } from "../../src/lib/controlIntent/readers/r0.ts";
import type { ReadingQuestion } from "../../src/lib/controlIntent/readers/questions.ts";

const O = OPS as unknown as Record<string, number>;
const sp = (str: string, x: number, y: number, h = 19): NoteSpan => ({ str, x0: x, y0: y, x1: x + str.length * 0.55 * h, y1: y + h });
/** An operator list drawing rectangles, each filled or used as a clip. */
function ops(rects: Array<[number, number, number, number, "fill" | "clip"]>, pre: Array<[number, unknown]> = []) {
  const fnArray: number[] = [], argsArray: unknown[] = [];
  for (const [fn, args] of pre) { fnArray.push(fn); argsArray.push(args); }
  for (const [x, y, w, h, how] of rects) {
    fnArray.push(O.constructPath); argsArray.push([[O.rectangle], [x, y, w, h], [x, y, x + w, y + h]]);
    if (how === "fill") { fnArray.push(O.fill); argsArray.push(null); }
    else { fnArray.push(O.eoClip); argsArray.push(null); fnArray.push(O.endPath); argsArray.push(null); }
  }
  return { fnArray, argsArray };
}
const IDENTITY = [1, 0, 0, 1, 0, 0];
const TAGS = ["VAV-1", "VAV-2", "VAV-3", "VAV-4", "VAV-5"];

/** Three zones labelled one each (A with a thermostat and a CO2 sensor, B a
 * thermostat, C nothing), a region two tags label, and the box printed
 * behind VAV-1's label. */
function plan(title: string): { spans: NoteSpan[]; regions: PageRegion[] } {
  const regions = pageRegions(ops([
    [0, 0, 1000, 800, "fill"],       // A
    [1000, 0, 1000, 800, "clip"],    // B: the clip its hatch is drawn through
    [0, 800, 1000, 800, "fill"],     // C
    [0, 1600, 2000, 800, "fill"],    // D: two tags
    [390, 375, 60, 30, "fill"],      // the box behind "VAV-1"
  ]), IDENTITY, O);
  const spans = [
    sp("SHEET TITLE", 3000, 2600), sp(title, 3000, 2625),
    sp("VAV-1", 400, 380), sp("VAV-2", 1400, 380), sp("VAV-3", 400, 1180), sp("VAV-4", 300, 1900), sp("VAV-5", 1500, 1900),
    sp("T", 100, 700), sp("CO2", 140, 700), sp("T", 1100, 700), sp("CO2", 1500, 2300),
  ];
  return { spans, regions };
}

test("zones: pageRegions reads filled and clipping paths through the transform in effect", () => {
  const r = pageRegions(ops([[10, 20, 100, 50, "fill"]], [[O.save, null], [O.transform, [2, 0, 0, 2, 5, 5]]]), IDENTITY, O);
  assert.deepEqual(r.map((x) => x.bbox), [[25, 45, 225, 145]]);
  assert.equal(pageRegions(ops([[0, 0, 10, 10, "fill"]]), IDENTITY, O).length, 0, "smaller than the minimum area");
});

test("zones: a tag labels the smallest region many times its own box; a symbol is in the zone around it", () => {
  const { spans, regions } = plan("HVAC ZONE PLAN");
  const p = readZonePlan("m.pdf#2", spans, regions, TAGS);
  assert.ok(p);
  assert.equal(p.title, "HVAC ZONE PLAN");
  const byTag = new Map(p.zones.map((z) => [z.tag, z.symbols.map((s) => s.text).sort()]));
  assert.deepEqual([...byTag.keys()].sort(), ["VAV-1", "VAV-2", "VAV-3"], "the region two tags label is no one's zone");
  assert.deepEqual(byTag.get("VAV-1"), ["CO2", "T"], "not the box behind the label");
  assert.deepEqual(byTag.get("VAV-2"), ["T"], "a clipping path is a zone too");
  assert.deepEqual(byTag.get("VAV-3"), []);
});

test("zones: a page is a zone plan only when its title names zones and most printed tags label a zone", () => {
  const { spans, regions } = plan("HVAC DUCT PLAN");
  assert.equal(readZonePlan("m.pdf#2", spans, regions, TAGS), null, "the title names no zones");
  const z = plan("HVAC ZONING PLAN");
  assert.equal(readZonePlan("m.pdf#2", z.spans, z.regions.slice(0, 2), TAGS), null, "two zones are too few");
  assert.equal(readZonePlan("m.pdf#2", z.spans, z.regions, ["VAV-9"]), null, "no scheduled tag is printed");
});

/** Four side-by-side zones, VAV-1..4, each 1000 × 800, and a sheet title. */
function row(title = "HVAC ZONE PLAN"): { spans: NoteSpan[]; rects: Array<[number, number, number, number, "fill" | "clip"]> } {
  return {
    rects: [[0, 0, 1000, 800, "fill"], [1000, 0, 1000, 800, "fill"], [2000, 0, 1000, 800, "fill"], [3000, 0, 1000, 800, "fill"]],
    spans: [sp("SHEET TITLE", 3000, 2600), sp(title, 3000, 2625)],
  };
}
const symbolsOf = (p: NonNullable<ReturnType<typeof readZonePlan>>) => Object.fromEntries(p.zones.map((z) => [z.tag, z.symbols.map((s) => s.text).sort()]));

test("zones: a tag drawn in pieces labels its zone, and its pieces are no symbols", () => {
  const { spans, rects } = row();
  // "VAV-" and "3" drawn apart, a word space between them.
  spans.push(sp("VAV-1", 400, 380), sp("VAV-2", 1400, 380), sp("VAV-", 2400, 380), sp("3", 2400 + 4 * 0.55 * 19 + 4, 380), sp("VAV-4", 3400, 380), sp("CO2", 2100, 700));
  const p = readZonePlan("m.pdf#2", spans, pageRegions(ops(rects), IDENTITY, O), TAGS);
  assert.ok(p);
  assert.deepEqual(symbolsOf(p), { "VAV-1": [], "VAV-2": [], "VAV-3": ["CO2"], "VAV-4": [] });
});

test("zones: a quarter-turned sheet reads the same (regions through the viewport, text turned with it)", () => {
  const { rects } = row();
  // The viewport turns the page a quarter clockwise, (x, y) → (H − y, x):
  // regions come through it, and the text is printed turned with it.
  const H = 3000, turn = [0, 1, -1, 0, H, 0];
  const regions = pageRegions(ops(rects), turn, O);
  const tsp = (str: string, x: number, y: number, h = 19): NoteSpan => ({ str, x0: H - y - h, y0: x, x1: H - y, y1: x + str.length * 0.55 * h, rot: 90 });
  const spans = [tsp("SHEET TITLE", 3000, 2600), tsp("HVAC ZONING PLAN", 3000, 2625), tsp("VAV-1", 400, 380), tsp("VAV-2", 1400, 380), tsp("VAV-3", 2400, 380), tsp("VAV-4", 3400, 380), tsp("CO2", 3100, 700)];
  const p = readZonePlan("m.pdf#2", spans, regions, TAGS);
  assert.ok(p, "a turned zone plan is still one");
  assert.deepEqual(symbolsOf(p), { "VAV-1": [], "VAV-2": [], "VAV-3": [], "VAV-4": ["CO2"] });
});

test("zones: a zone inside another keeps its own symbols; a tag printed twice in its zone labels it once", () => {
  const { spans, rects } = row();
  rects.push([100, 450, 500, 300, "fill"]); // VAV-5's room inside VAV-1's zone
  spans.push(sp("VAV-1", 400, 100), sp("VAV-1", 700, 300), sp("VAV-2", 1400, 380), sp("VAV-3", 2400, 380), sp("VAV-4", 3400, 380), sp("VAV-5", 300, 550), sp("CO2", 150, 700), sp("T", 800, 700));
  const p = readZonePlan("m.pdf#2", spans, pageRegions(ops(rects), IDENTITY, O), TAGS);
  assert.ok(p);
  assert.equal(p.zones.filter((z) => z.tag === "VAV-1").length, 1);
  assert.deepEqual(symbolsOf(p), { "VAV-1": ["T"], "VAV-2": [], "VAV-3": [], "VAV-4": [], "VAV-5": ["CO2"] });
});

test("zones: a legend listing the tags in cells labels no zone and does not stop the plan", () => {
  const { spans, rects } = row();
  // A legend table: its frame and one row per tag, each row a wide cell that
  // hugs its text (as large as a zone would be, but thin).
  rects.push([5000, 0, 900, 150, "fill"]);
  for (let i = 0; i < 5; i++) rects.push([5000, i * 30, 900, 30, "clip"]);
  spans.push(sp("VAV-1", 400, 380), sp("VAV-2", 1400, 380), sp("VAV-3", 2400, 380), sp("VAV-4", 3400, 380));
  for (let i = 0; i < 5; i++) spans.push(sp(`VAV-${i + 1}`, 5020, i * 30 + 5), sp("CO2", 5300, i * 30 + 5));
  const p = readZonePlan("m.pdf#2", spans, pageRegions(ops(rects), IDENTITY, O), TAGS);
  assert.ok(p, "four of five printed tags label a zone of their own");
  assert.deepEqual(symbolsOf(p), { "VAV-1": [], "VAV-2": [], "VAV-3": [], "VAV-4": [] }, "the legend's CO2 cells are in no zone");
});

test("zones: a subscript drawn apart reads with its letters; a distant digit does not", () => {
  const { spans, rects } = row();
  const co = sp("CO", 100, 700);
  spans.push(sp("VAV-1", 400, 380), sp("VAV-2", 1400, 380), sp("VAV-3", 2400, 380), sp("VAV-4", 3400, 380),
    co, { str: "2", x0: co.x1 + 1, y0: 712, x1: co.x1 + 8, y1: 724 },
    sp("CO", 1100, 700), { str: "2", x0: 1300, y0: 712, x1: 1307, y1: 724 });
  const p = readZonePlan("m.pdf#2", spans, pageRegions(ops(rects), IDENTITY, O), TAGS)!;
  assert.deepEqual(symbolsOf(p)["VAV-1"], ["CO", "CO2"]);
  assert.deepEqual(symbolsOf(p)["VAV-2"], ["CO"]);
  const q: ReadingQuestion = { id: "opt.co2_sensor", kind: "option", option: "co2_sensor", label: "CO2", device: TERM_LIST.options.co2_sensor.device };
  const zone = (tag: string) => p.zones.filter((z) => z.tag === tag).map((z) => ({ plan: p, zone: z }));
  assert.equal(zoneAnswers(zone("VAV-1"), [q], TERM_LIST).length, 1);
  assert.equal(zoneAnswers(zone("VAV-2"), [q], TERM_LIST).length, 0);
});

test("zones: a CO2 symbol in a unit's zone reads its CO2 sensor, and applies alone; a zone without one says nothing", () => {
  const { spans, regions } = plan("HVAC ZONE PLAN");
  const p = readZonePlan("m.pdf#2", spans, regions, TAGS)!;
  const q: ReadingQuestion = { id: "opt.co2_sensor", kind: "option", option: "co2_sensor", label: "CO2", device: TERM_LIST.options.co2_sensor.device };
  const zone = (tag: string) => p.zones.filter((z) => z.tag === tag).map((z) => ({ plan: p, zone: z }));
  const [yes] = zoneAnswers(zone("VAV-1"), [q], TERM_LIST);
  assert.deepEqual([yes.reader, yes.answer, yes.whitelisted], ["rp", "yes", true]);
  assert.match(yes.cites[0].text, /CO2 in the zone VAV-1 labels/);
  assert.equal(zoneAnswers(zone("VAV-2"), [q], TERM_LIST).length, 0);
  // Its typical detail's readers find no CO2 sensor: a typical detail need
  // not draw a zone's devices, so their absences are no vote against it.
  const absent = (reader: ReaderAnswer["reader"], run?: string): ReaderAnswer => ({ reader, question: q.id, answer: "absent", rule: "t", cites: [], ...(run ? { run } : {}) });
  const [d] = combineUnit({ questions: [q], answers: [yes, absent("r1"), absent("r2", "a"), absent("r2", "b")], bindings: [{ packet: "vav", kind: "family_detail", evidence: "f" }] }, TERM_LIST);
  assert.deepEqual([d.outcome, d.value, d.rule], ["applied", true, "drawing_read:rp.co2_sensor.symbol_in_zone"]);
  // Through a packet a title binds to the unit, an absence is a real vote.
  const [e] = combineUnit({ questions: [q], answers: [yes, absent("r1")], bindings: [{ packet: "vav", kind: "tag", evidence: "t" }] }, TERM_LIST);
  assert.equal(e.outcome, "unresolved");
});
