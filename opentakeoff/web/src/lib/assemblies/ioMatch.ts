// ASSEMBLIES goal — options the drawing decides by its printed I/O (decision
// D6; AS-19's next lever).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. Which options a unit's typical
// takes decides its devices and points in every surface; the apply path
// calls this once, and the Takeoff panel and apply_assemblies read the same
// records.
//
// When the drawing fixes how many hardware points of each type a unit has (a
// printed points list, or a control schematic bound to exactly one schedule
// row), the typical's undecided options are the ones to solve for: every
// setting of them is expanded, and the settings whose point lines give the
// printed counts are kept. An option that has the same value in every
// setting kept is decided by the drawing; one that varies stays as it was.
// No word is read, only the I/O types the drawing prints and the typical's
// own definition (LAW L1). Options the schedule or the user already decided
// are fixed, and so is everything else about the record.
import { expandApplication } from "./expand";
import type { AssemblyDefinition } from "./schema";
import { selectAssembly, type Instance, type ProjectSettings } from "./select";

export interface PrintedIo { AI: number; AO: number; BI: number; BO: number }

export interface IoMatch {
  /** The options the printed counts decide, with the value each takes. */
  decided: Record<string, boolean>;
  /** How many settings of the free options give the printed counts. */
  fits: number;
  /** The options the drawing could decide: those resting on a default, or unknown. */
  free: string[];
  /** Why nothing was decided, when nothing was. */
  reason: string | null;
}

/** More free options than this are not tried (2^10 expansions per unit). */
export const IO_MATCH_MAX_FREE = 10;
const HW = ["AI", "AO", "BI", "BO"] as const;

/** Solve a unit's free options for its printed hardware I/O counts. */
export function optionsFromPrintedIo(
  instance: Instance,
  library: readonly AssemblyDefinition[],
  settings: ProjectSettings,
  printed: PrintedIo,
  layer = "controls",
): IoMatch {
  const base = selectAssembly(instance, library, settings, undefined, layer);
  if (!base.assembly || base.status === "no_assembly" || base.status === "excluded") return { decided: {}, fits: 0, free: [], reason: "the unit has no typical" };
  const free = Object.entries(base.options)
    .filter(([, o]) => o.source === null || o.source === "starter_default" || o.source === "partner_default")
    .map(([id]) => id)
    .sort();
  if (free.length > IO_MATCH_MAX_FREE) return { decided: {}, fits: 0, free, reason: `${free.length} free options: more than ${IO_MATCH_MAX_FREE} to try` };
  const per = instance.multiplier?.value || 1;
  const fits: Array<Record<string, boolean>> = [];
  let unknown = 0;
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const options = Object.fromEntries(free.map((id, i) => [id, (mask & (1 << i)) !== 0]));
    const trial = selectAssembly(instance, library, settings, { tag: instance.tag, reason: "printed I/O trial", layer, assembly: base.assembly, options }, layer);
    const counts: PrintedIo = { AI: 0, AO: 0, BI: 0, BO: 0 };
    let known = true;
    for (const l of expandApplication(trial, instance, library, settings)) {
      if (l.kind !== "point" || !l.io || !(HW as readonly string[]).includes(l.io)) continue;
      if (l.qty_base === null) { known = false; break; }
      counts[l.io as (typeof HW)[number]] += l.qty_base / per;
    }
    if (!known) { unknown += 1; continue; }
    if (HW.every((io) => counts[io] === printed[io])) fits.push(options);
  }
  if (!fits.length) {
    return { decided: {}, fits: 0, free, reason: unknown === 1 << free.length ? "the typical's point counts wait for a value the drawing does not give" : "no setting of the free options gives the printed counts" };
  }
  const decided = Object.fromEntries(free.filter((id) => fits.every((f) => f[id] === fits[0][id])).map((id) => [id, fits[0][id]]));
  return { decided, fits: fits.length, free, reason: Object.keys(decided).length ? null : "every free option varies among the settings that fit" };
}
