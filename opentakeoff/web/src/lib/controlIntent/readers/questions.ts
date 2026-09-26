// CONTROL INTENT goal, WP3 (decision C6): the closed questions the readers
// answer about one unit.
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. What is asked decides what can be
// read; every surface asks the same questions of the same units.
//
// Closed questions only (C6):
//   · ROLE — what the BAS does with the unit: commands it (starts, stops,
//     enables, modulates it or its valve, damper or speed), only monitors it
//     (its status, temperature or alarms, while its own thermostat or
//     controls, its manufacturer, or other equipment runs it), or is not
//     connected to it. Asked of every unit with control evidence bound to
//     it, unless its record is already outside the BAS scope.
//   · OPTIONS — every option (the term list covers) of every typical the
//     library offers the unit's family, except those the unit's record took
//     from its schedule, the estimator or a project answer: is it there, is
//     the library's alternative there, or is the device not drawn at all.
//     Asking every typical's options, not only the selected one's, keeps a
//     unit's readings good for any typical it may take (a settings or library
//     change re-applies them without asking again).
import type { ApplicationRecord, AssemblyDefinition } from "../../assemblies/schema";
import { familiesOf } from "../../assemblies/schema";
import type { TermList } from "./terms";

export const QUESTIONS_VERSION = "control_questions_v1";

export type RoleAnswer = "commands" | "monitors_only" | "not_connected";
export type OptionAnswer = "yes" | "no" | "absent";

export interface ReadingQuestion {
  /** "role", or "opt.<option id>". */
  id: string;
  kind: "role" | "option";
  option?: string;
  /** The typical the option belongs to. */
  typical?: string;
  /** The library's label for the option. */
  label?: string;
  /** What the readers look for (the term list's device). */
  device?: string;
}

/** Option sources that mean nobody printed or answered it. */
const UNDECIDED = new Set(["starter_default", "partner_default", null]);

/** The questions for one unit, from its first-pass record (the controls
 * layer) and the library. */
export function unitQuestions(app: ApplicationRecord | undefined, library: readonly AssemblyDefinition[], terms: TermList): ReadingQuestion[] {
  // A unit with no typical has no role to decide: outside the BAS scope or
  // not, it takes none.
  if (!app || app.status === "not_in_scope" || app.status === "excluded" || app.status === "no_assembly") return [];
  const out: ReadingQuestion[] = [{ id: "role", kind: "role" }];
  if (app.selected_by === "user") return out;
  const family = app.instance.family;
  const layer = app.layer ?? "controls";
  const selected = app.assembly ? library.find((a) => a.id === app.assembly!.id && a.version === app.assembly!.version) : undefined;
  const defs = [
    ...(selected ? [selected] : []),
    ...library.filter((a) => a !== selected && a.kind === "equipment" && (a.applies_to.layer ?? "controls") === layer && familiesOf(a).includes(family)),
  ];
  const seen = new Set<string>();
  for (const def of defs) {
    for (const o of def.options) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const t = terms.options[o.id];
      if (!t) continue;
      // Decided by the schedule, the estimator or a project answer.
      const chosen = selected ? app.options[o.id] : undefined;
      if (chosen && !UNDECIDED.has(chosen.source)) continue;
      out.push({ id: `opt.${o.id}`, kind: "option", option: o.id, typical: def.id, label: o.label, device: t.device });
    }
  }
  return out;
}
