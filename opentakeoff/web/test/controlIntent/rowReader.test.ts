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

// 096_IN (dev 3): AHU SUPPLY FAN SCHEDULE and AHU RETURN/EXHAUST FAN SCHEDULE
// list the air handlers' fans, each row's LOCATION the air handler it sits in
// (SF-4A "LOCATION: AHU-4"); AHU-4's own row names them (SF-4A/B, RF-4A/B).
// 031_MO's typical key reads such fans: "its points are the air handler's, so
// no separate fan typical".
test("row.component_of: a fan whose location is a scheduled air handler is part of it", () => {
  const m = rowIntents([
    unit(0, "AHU-4", "AHU"),
    unit(1, "SF-4A", "FAN", { cells: { LOCATION: "AHU-4", "FAN RPM": "4243" } }),
    unit(2, "RF-4A", "FAN", { cells: { LOCATION: "AHU-4" } }),
    // Look-alikes: a fan in a room, a location that only mentions the unit,
    // a location naming equipment the set does not schedule, and an exhaust
    // fan interlocked with the air handler (its own unit, keyed with its own
    // typical in bldg5406 and federal-mech).
    unit(3, "EF-1", "FAN", { cells: { LOCATION: "ROOF" } }),
    unit(4, "EF-2", "FAN", { cells: { LOCATION: "MECH ROOM NEAR AHU-4" } }),
    unit(5, "SF-1A", "FAN", { cells: { LOCATION: "DOAS-1" } }),
    unit(6, "EF-3", "FAN", { cells: { INTERLOCK: "AHU-4", LOCATION: "ROOF" } }),
  ]);
  assert.equal(m.get(1)!.out_of_scope!.rule, "drawing_read:row.component_of");
  assert.match(m.get(1)!.out_of_scope!.basis, /located in AHU-4/);
  assert.equal(m.get(1)!.out_of_scope!.cites[0].header, "LOCATION");
  assert.equal(m.get(2)!.out_of_scope!.rule, "drawing_read:row.component_of");
  assert.deepEqual([3, 4, 5, 6].map((i) => m.get(i)?.out_of_scope), [undefined, undefined, undefined, undefined]);

  // 031_MO prints WHSE-SF1's location "WHSE-AHU1" for WHSE-AHU-1: a dropped
  // dash still names it, unless another scheduled unit reads the same way.
  const loose = rowIntents([
    unit(0, "WHSE-AHU-1", "AHU"),
    unit(1, "WHSE-SF1", "FAN", { cells: { LOCATION: "WHSE-AHU1" } }),
    unit(2, "AHU-1-1", "AHU"),
    unit(3, "AHU-11", "VAV"),
    unit(4, "SF-9", "FAN", { cells: { LOCATION: "AHU11" } }),
  ]);
  assert.match(loose.get(1)!.out_of_scope!.basis, /located in WHSE-AHU-1/);
  assert.equal(loose.get(4)?.out_of_scope, undefined, "AHU-1-1 and AHU-11 both read AHU11");
});

// 061_IA (dev 2): the electrical EQUIPMENT SCHEDULE lists the air handler
// AHU-A's fan array by DESCRIPTION alone, "AHU SUPPLY FAN" (SF-1 to SF-6) and
// "AHU RETURN FAN" (RF-1 to RF-4); the set schedules one air handler. Keyed
// "none": their points are AHU-A's.
test("row.component_of: a fan its description calls an air handler's supply, return or relief fan", () => {
  const one = rowIntents([
    unit(0, "AHU-A", "AHU"),
    unit(1, "SF-1", "FAN", { cells: { DESCRIPTION: "AHU SUPPLY FAN" } }),
    unit(2, "RF-1", "FAN", { cells: { DESCRIPTION: "AHU RETURN FAN", NOTES: "1" } }),
    unit(3, "RLF-1", "FAN", { cells: { TYPE: "AIR HANDLING UNIT RELIEF FAN" } }),
    // Look-alikes: a room's exhaust fan, a plain exhaust fan, and a supply fan
    // with no air handler in its words.
    unit(4, "EF-1", "FAN", { cells: { DESCRIPTION: "AHU ROOM EXHAUST FAN" } }),
    unit(5, "EF-2", "FAN", { cells: { DESCRIPTION: "EXHAUST FAN" } }),
    unit(6, "SF-9", "FAN", { cells: { DESCRIPTION: "SUPPLY FAN" } }),
    unit(7, "EF-3", "FAN", { cells: { DESCRIPTION: "AHU EXHAUST FAN" } }),
  ]);
  assert.deepEqual([1, 2, 3].map((i) => one.get(i)?.out_of_scope?.rule), Array(3).fill("drawing_read:row.component_of"));
  assert.match(one.get(1)!.out_of_scope!.basis, /AHU-A's, the set's one AHU/);
  assert.deepEqual([0, 4, 5, 6, 7].map((i) => one.has(i)), [false, false, false, false, false], "an exhaust fan is not read as the air handler's");
  // Two air handlers: the description must name the one it belongs to.
  const two = rowIntents([
    unit(0, "AHU-1", "AHU"), unit(1, "AHU-2", "AHU"),
    unit(2, "SF-1", "FAN", { cells: { DESCRIPTION: "AHU SUPPLY FAN" } }),
    unit(3, "SF-2", "FAN", { cells: { DESCRIPTION: "AHU-2 SUPPLY FAN" } }),
    unit(4, "SF-3", "FAN", { cells: { DESCRIPTION: "AHU-9 SUPPLY FAN" } }),
  ]);
  assert.equal(two.has(2), false, "which of two air handlers is not said");
  assert.match(two.get(3)!.out_of_scope!.basis, /the fan is AHU-2's; its points/);
  assert.equal(two.has(4), false, "an air handler the set does not schedule");
});

// 009_FL and 06_MO (dev 2): electric duct heaters (EDH-1 …) under the unit
// heaters, one set's titled "ELECTRIC DUCT HEATER", the other's row printing
// "DUCT MOUNTED WITH DUCT FLANGE CONNECTIONS". Keyed "none": v1's unit heater
// typical is a fan-forced heater's (fan start, relay, OFF-AUTO switch).
test("row.duct_heater: a heater titled or printed as a duct heater takes no typical, and says why", () => {
  const m = rowIntents([
    unit(0, "EDH-1", "UNIT_HEATER", { table_title: "ELECTRIC DUCT HEATER" }),
    unit(1, "EDH-2", "UNIT_HEATER", { table_title: "ELECTRIC HEATER SCHEDULE", cells: { DESCRIPTION: "DUCT MOUNTED WITH DUCT FLANGE CONNECTIONS" } }),
    // Look-alikes: a unit heater, a cabinet heater with a duct collar, and a
    // fan listed in a duct heater table.
    unit(2, "UH-1", "UNIT_HEATER", { table_title: "UNIT HEATER SCHEDULE", cells: { MOUNTING: "CEILING HUNG" } }),
    unit(3, "CUH-1", "CABINET_UNIT_HEATER", { table_title: "CABINET UNIT HEATER SCHEDULE", cells: { REMARKS: "PROVIDE DUCT COLLAR" } }),
    unit(4, "EF-1", "FAN", { table_title: "ELECTRIC DUCT HEATER SCHEDULE" }),
  ]);
  assert.equal(m.get(0)?.no_typical?.rule, "drawing_read:row.duct_heater");
  assert.match(m.get(0)!.no_typical!.basis, /titled "ELECTRIC DUCT HEATER"/);
  assert.match(m.get(1)!.no_typical!.basis, /DESCRIPTION reads "DUCT MOUNTED/);
  assert.equal(m.get(1)!.no_typical!.cites[0].header, "DESCRIPTION");
  assert.deepEqual([2, 3, 4].map((i) => m.has(i)), [false, false, false]);
  assert.equal(m.get(0)?.out_of_scope, undefined, "a duct heater may be on the BAS: it is not out of scope");
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

// 06_MO (dev 2): the VARIABLE-AIR-VOLUME BOX SCHEDULE's note 1, "PROVIDE WITH
// SCR CONTROLLER FOR ELECTRIC HEAT"; its boxes are keyed scr_heat = true.
test("row.scr_heat: a VAV box's or fan coil's own note or remark printing an SCR", () => {
  const m = rowIntents([
    unit(0, "VAV-1", "VAV", { notes: [{ id: "1", text: "PROVIDE WITH SCR CONTROLLER FOR ELECTRIC HEAT." }] }),
    unit(1, "FCU-1", "FCU", { cells: { REMARKS: "ELECTRIC HEAT WITH SCR CONTROL" } }),
    // Look-alikes: a note refusing one, an SCR on another kind of unit, and
    // a VAV box whose notes say nothing of it.
    unit(2, "VAV-2", "VAV", { notes: [{ id: "2", text: "STAGED ELECTRIC HEAT, NO SCR." }] }),
    unit(3, "UH-1", "UNIT_HEATER", { notes: [{ id: "3", text: "PROVIDE WITH SCR CONTROLLER." }] }),
    unit(4, "VAV-3", "VAV", { notes: [{ id: "4", text: "PROVIDE WITH FACTORY MOUNTED DDC CONTROLLER." }] }),
  ]);
  assert.equal(m.get(0)?.options?.scr_heat?.value, true);
  assert.match(m.get(0)!.options!.scr_heat!.basis, /^note 1: "PROVIDE WITH SCR CONTROLLER/);
  assert.equal(m.get(1)?.options?.scr_heat?.value, true);
  assert.deepEqual([2, 3, 4].map((i) => m.get(i)?.options?.scr_heat), [undefined, undefined, undefined]);
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
