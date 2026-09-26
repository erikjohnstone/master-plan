// CONTROL INTENT goal, reader R0 on the unit's own schedule row
// (goals/CONTROL_INTENT.md decision C7: deterministic readers first) — facts
// about a unit's controls that its own row or the notes it cites print in
// so many words.
//
// SHOULD THIS BE ON THE SHARED PATH? Yes: these facts change which typical a
// unit takes; every surface applies them through applyAssemblies.
//
// Each rule reads one printed thing, is whitelisted (decision C8: R0 alone
// applies only on an exact phrase or a structural fact) and cites the cell or
// note it read:
//   row.speed_control   a SPEED / VOLUME CONTROL cell that says constant or
//                       variable ("CONSTANT", "CV", "VARIABLE") → vfd
//   row.not_used        a cell that reads exactly "NOT USED" → no unit
//   row.component_of    a fan whose SERVICE / SYSTEM names a scheduled air
//                       handler: its points are the air handler's
//   row.standalone      a note or remark: "STANDALONE", "NOT CONTROLLED BY
//                       (THE) DDC / BAS / BMS …" → outside the BAS scope
//   row.modulating_valve a unit heater note: a modulating (control) valve
//   row.motorized_damper a fan's damper cell: "MOTORIZED"
// A value the normalizer already read is never replaced (C12): these rules
// fill what the row leaves unknown or decide options the library leaves to
// the drawings.
import type { Value } from "../assemblies/expr";
import type { Cite } from "../assemblies/schema";
import type { ScheduleNote } from "../assemblies/scheduleNotes";
import type { AnswerUnit } from "./catalogue";
import type { IntentFact, UnitIntent } from "./intent";

/** A unit as the row reader sees it: its row and the notes that speak for it. */
export interface RowUnit extends AnswerUnit {
  notes?: readonly ScheduleNote[];
}

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const canonTag = (t: string) => String(t ?? "").toUpperCase().replace(/[‐-―−﹘﹣－]/g, "-").replace(/\s+/g, "");

const AIR_HANDLERS = new Set(["AHU", "RTU", "DOAS", "DOAH_UNIT", "DOAH_HANDLING", "OUTDOOR_AIR_UNIT"]);
const CONSTANT_RE = /^(?:CONSTANT(?:\s+(?:SPEED|VOLUME))?|C\.?\s?V\.?|SINGLE[-\s]SPEED|ON\s*\/\s*OFF)$/;
const VARIABLE_RE = /^(?:VARIABLE(?:\s+(?:SPEED|FREQUENCY(?:\s+DRIVE)?))?|VFD|V\.F\.D\.?|VSD|V\.S\.D\.?)$/;
const SPEED_HEADER_RE = /\bSPEED\s+CONTROL\b|\bVOLUME\s+CONTROL\b/i;
// "STANDALONE" only as a statement about the unit or its controls ("UNIT TO
// BE STANDALONE", "STANDALONE SYSTEM"), never a standalone disconnect or VFD.
const STANDALONE_RE = /\b(?:UNIT|SYSTEM|HEATER|FAN|CONTROLS?|EQUIPMENT)\s+(?:TO\s+BE|SHALL\s+BE|IS)\s+STAND[-\s]?ALONE\b|\bSTAND[-\s]?ALONE\s+(?:UNIT|SYSTEM|CONTROLS?|OPERATION)\b|\bNOT\s+(?:BE\s+)?(?:CONTROLLED|MONITORED)\s+BY\s+(?:THE\s+)?(?:DDC|BAS|BMS|EMS|EMCS|FMCS|BUILDING\s+(?:AUTOMATION|MANAGEMENT))\b|\bNOT\s+CONNECTED\s+TO\s+(?:THE\s+)?(?:DDC|BAS|BMS|EMS|EMCS|FMCS)\b/;
const MODULATING_VALVE_RE = /\bMODULATING\b[^.]{0,60}\bVALVE\b|\bVALVE\b[^.]{0,30}\bMODULATING\b/;
const TWO_POSITION_RE = /\b(?:2|TWO)[-\s]?POSITION\b|\bON\s*\/\s*OFF\s+VALVE\b/;

const drawingFact = <V>(value: V, rule: string, basis: string, cite: Cite): IntentFact<V> => ({ value, source: "drawing", rule, basis, cites: [cite] });

/** Cite a cell of the unit's row. */
const cellCite = (u: RowUnit, header: string): Cite => ({ sheet: u.cite.sheet, table_title: u.cite.table_title, header, bbox: null });
/** Cite a note of the unit's table. */
const noteCite = (u: RowUnit, n: ScheduleNote): Cite => ({ sheet: u.cite.sheet, table_title: u.cite.table_title, header: `(table note ${n.id})`, bbox: null });

/** The row facts of every unit (index → intent). */
export function rowIntents(units: readonly RowUnit[]): Map<number, UnitIntent> {
  const out = new Map<number, UnitIntent>();
  const airHandlers = new Map(units.filter((u) => AIR_HANDLERS.has(u.family)).map((u) => [canonTag(u.tag), u.tag]));
  for (const u of units) {
    const it: UnitIntent = {};
    // row.not_used: the schedule keeps the row but prints that it is not used.
    for (const [h, v] of Object.entries(u.cells)) {
      if (/^NOT\s+USED$/i.test(clean(v))) {
        it.out_of_scope = drawingFact(true as const, "drawing_read:row.not_used", `the schedule row prints "${clean(v)}" (${h}): there is no unit`, cellCite(u, h));
        break;
      }
    }
    // row.component_of: a fan scheduled as part of an air handler.
    if (!it.out_of_scope && u.family === "FAN") {
      const service = [clean(u.attributes.service?.value), ...Object.entries(u.cells).filter(([h]) => /\bSERVICE\b|\bSYSTEM\b/i.test(h)).map(([, v]) => clean(v))];
      for (const s of service) {
        const owner = airHandlers.get(canonTag(s));
        if (owner && canonTag(owner) !== canonTag(u.tag)) {
          it.out_of_scope = drawingFact(true as const, "drawing_read:row.component_of", `the fan is scheduled for ${owner}: its points are the air handler's`, cellCite(u, Object.entries(u.cells).find(([, v]) => clean(v) === s)?.[0] ?? "SERVICE"));
          break;
        }
      }
    }
    // row.standalone: the row's own notes or remarks say it is off the BAS.
    if (!it.out_of_scope) {
      const texts: Array<{ text: string; cite: Cite }> = [
        ...(u.notes ?? []).map((n) => ({ text: n.text, cite: noteCite(u, n) })),
        ...Object.entries(u.cells).filter(([h]) => /REMARK|NOTE|COMMENT|CONTROL/i.test(h)).map(([h, v]) => ({ text: v, cite: cellCite(u, h) })),
      ];
      for (const t of texts) {
        const text = clean(t.text).toUpperCase();
        if (STANDALONE_RE.test(text) && !/\bNOT\s+STAND[-\s]?ALONE\b/.test(text)) {
          it.out_of_scope = drawingFact(true as const, "drawing_read:row.standalone", `"${clean(t.text).slice(0, 160)}"`, t.cite);
          break;
        }
      }
    }
    if (!it.out_of_scope) {
      // row.speed_control: a speed or volume control cell.
      const control = u.attributes.control;
      if (u.attributes.vfd === undefined && control && SPEED_HEADER_RE.test(String(control.cite?.header ?? ""))) {
        const t = clean(control.value).toUpperCase();
        const value: Value | null = CONSTANT_RE.test(t) ? "no" : VARIABLE_RE.test(t) ? "yes" : null;
        if (value !== null) {
          it.attributes = { vfd: drawingFact<Value>(value, "drawing_read:row.speed_control", `its ${control.cite?.header} reads "${clean(control.value)}"${value === "no" ? ": constant speed, no VFD" : ": variable speed"}`, control.cite ?? cellCite(u, "CONTROL")) };
        }
      }
      // row.modulating_valve: a unit heater note on its control valve.
      if (u.family === "UNIT_HEATER" || u.family === "CABINET_UNIT_HEATER") {
        for (const n of u.notes ?? []) {
          const text = clean(n.text).toUpperCase();
          const modulating = MODULATING_VALVE_RE.test(text);
          const twoPosition = TWO_POSITION_RE.test(text) && /\bVALVE\b/.test(text);
          if (modulating !== twoPosition) {
            it.options = { ...(it.options ?? {}), modulating_valve: drawingFact(modulating, "drawing_read:row.modulating_valve", `note ${n.id}: "${clean(n.text).slice(0, 160)}"`, noteCite(u, n)) };
            break;
          }
        }
      }
      // row.motorized_damper: a fan's damper cell.
      if (u.family === "FAN") {
        for (const [h, v] of Object.entries(u.cells)) {
          if (/\bDAMPER\b/i.test(h) && /\bMOTORI[SZ]ED\b|\bMOTOR[-\s]OPERATED\b/i.test(clean(v))) {
            it.options = { ...(it.options ?? {}), motorized_damper: drawingFact(true, "drawing_read:row.motorized_damper", `its ${h} reads "${clean(v)}"`, cellCite(u, h)) };
            break;
          }
        }
      }
    }
    if (it.out_of_scope || it.attributes || it.options) out.set(u.index, it);
  }
  return out;
}
