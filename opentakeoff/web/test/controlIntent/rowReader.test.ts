// CONTROL INTENT goal, reader R0 on the unit's own row (controlIntent/rowReader.ts):
// each whitelisted rule, and the look-alikes it must refuse.
import test from "node:test";
import assert from "node:assert/strict";
import { rowIntents, type RowUnit } from "../../src/lib/controlIntent/rowReader.ts";
import { scheduleNotes } from "../../src/lib/assemblies/scheduleNotes.ts";

const cite = { sheet: "m.pdf#3", table_title: "T", header: "TAG", bbox: null };
const unit = (index: number, tag: string, family: string, o: Partial<RowUnit> = {}): RowUnit => ({
  index, tag, family, attributes: {}, unknown: {}, cells: {}, table_title: `${family} SCHEDULE`, table_headers: [], cite, ...o,
});

test("row.speed_control: a SPEED or VOLUME CONTROL cell gives vfd, a CONTROL TYPE cross-reference does not", () => {
  const ctl = (value: string, header: string) => ({ control: { value, cite: { ...cite, header } } });
  const m = rowIntents([
    unit(0, "EF-1", "FAN", { attributes: ctl("CONSTANT", "MOTOR ELECTRICAL / SPEED CONTROL") }),
    unit(1, "EF-2", "FAN", { attributes: ctl("VARIABLE", "MOTOR ELECTRICAL / SPEED CONTROL") }),
    unit(2, "EF-3", "FAN", { attributes: ctl("CV", "VOLUME CONTROL") }),
    unit(3, "EF-4", "FAN", { attributes: ctl("FAN-A", "CONTROL TYPE") }),
    unit(4, "EF-5", "FAN", { attributes: { ...ctl("CONSTANT", "SPEED CONTROL"), vfd: { value: "yes" } } }),
  ]);
  assert.equal(m.get(0)?.attributes?.vfd?.value, "no");
  assert.equal(m.get(1)?.attributes?.vfd?.value, "yes");
  assert.equal(m.get(2)?.attributes?.vfd?.value, "no");
  assert.equal(m.has(3), false);
  assert.equal(m.has(4), false, "a printed vfd is never replaced");
});

test("row.not_used, row.component_of: no unit, and a fan that is part of a scheduled air handler", () => {
  const m = rowIntents([
    unit(0, "P-1", "PUMP", { cells: { REMARKS: "NOT USED" } }),
    unit(1, "AHU-1", "AHU"),
    unit(2, "SF-1", "FAN", { attributes: { service: { value: "AHU-1" } } }),
    unit(3, "EF-1", "FAN", { attributes: { service: { value: "TOILET" } } }),
    unit(4, "P-2", "PUMP", { attributes: { service: { value: "AHU-1" } } }),
  ]);
  assert.match(m.get(0)!.out_of_scope!.rule, /not_used/);
  assert.match(m.get(2)!.out_of_scope!.basis, /AHU-1/);
  assert.deepEqual([1, 3, 4].map((i) => m.has(i)), [false, false, false], "a pump serving an air handler is its own unit");
});

test("row.standalone: a statement about the unit or its controls, never a standalone disconnect", () => {
  const note = (id: string, text: string) => ({ id, text });
  const m = rowIntents([
    unit(0, "EH-7", "UNIT_HEATER", { notes: [note("6", "PROVIDE WITH INTEGRAL THERMOSTAT. UNIT TO BE STANDALONE AND NOT CONTROLLED BY DDC.")] }),
    unit(1, "EF-9", "FAN", { notes: [note("2", "PROVIDE STANDALONE DISCONNECT SWITCH.")] }),
    unit(2, "UH-3", "UNIT_HEATER", { cells: { REMARKS: "NOT CONTROLLED BY THE BAS" } }),
  ]);
  assert.match(m.get(0)!.out_of_scope!.cites[0].header, /table note 6/);
  assert.equal(m.has(1), false);
  assert.ok(m.get(2)?.out_of_scope);
});

test("row.modulating_valve and row.motorized_damper read their own printed words", () => {
  const m = rowIntents([
    unit(0, "CUH-1", "CABINET_UNIT_HEATER", { notes: [{ id: "2", text: "PROVIDE EACH UNIT WITH 0 - 24VDC MODULATING, TWO WAY CONTROL VALVE FURNISHED BY CONTROLS CONTRACTOR." }] }),
    unit(1, "UH-2", "UNIT_HEATER", { notes: [{ id: "1", text: "PROVIDE 2-POSITION CONTROL VALVE." }] }),
    unit(2, "EF-1A", "FAN", { cells: { "BACKDRAFT DAMPER TYPE": "MOTORIZED" } }),
    unit(3, "EF-2", "FAN", { cells: { "BACKDRAFT DAMPER TYPE": "GRAVITY" } }),
  ]);
  assert.equal(m.get(0)?.options?.modulating_valve?.value, true);
  assert.equal(m.get(1)?.options?.modulating_valve?.value, false);
  assert.equal(m.get(2)?.options?.motorized_damper?.value, true);
  assert.equal(m.has(3), false, "a gravity damper says nothing about a motorized one");
});

test("scheduleNotes: the next table's REMARKS label beside the notes ends their width, not the block", () => {
  const s = (str: string, x0: number, y0: number, w = 60, h = 19) => ({ str, x0, y0, x1: x0 + w, y1: y0 + h });
  const spans = [
    s("TAG", 410, 140), s("EH-1", 410, 200), s("KW", 900, 140), s("3.0", 900, 200),
    s("REMARKS:", 411, 1009, 80),
    s("REMARKS:", 2611, 1049, 80), // the neighbouring schedule's label, to the right
    s("1.", 424, 1055, 12), s("APPROVED ALTERNATE MANUFACTURERS.", 465, 1055, 400),
    s("2.", 424, 1100, 12), s("UNIT TO BE STANDALONE AND NOT CONTROLLED BY DDC.", 465, 1100, 500),
  ];
  const notes = scheduleNotes(spans, [407, 136, 2565, 1000]);
  assert.deepEqual(notes.map((n) => n.id), ["1", "2"]);
});
