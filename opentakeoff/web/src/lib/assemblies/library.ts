// ASSEMBLIES goal, WP3.1 (decision D7) — the estimator profile's one
// `assembly_library` array holds two kinds of record: linear run assemblies
// (no `kind`; linear/assemblyLibrary.ts) and this goal's equipment, project
// and part assemblies (a `kind`; schema.ts). Each part is replaced on its
// own, so saving one never drops the other.
//
// SHOULD THIS BE ON THE SHARED PATH? Yes: the browser store and the profile
// file both read and write the library through these.

import { sanitizeAssemblyLibrary } from "../linear/assemblyLibrary";
import { sanitizeAssemblyDefinitions, type AssemblyDefinition } from "./schema";

/** The stored library with its linear records replaced by `linear`'s; its
 * assemblies with a `kind` stay. With no such assemblies stored, this is
 * exactly `sanitizeAssemblyLibrary(linear)`. */
export function withLinearRecords(stored: unknown, linear: unknown): unknown[] {
  return [...sanitizeAssemblyLibrary(linear), ...sanitizeAssemblyDefinitions(stored).assemblies];
}

/** The stored library with its assemblies that have a `kind` replaced by
 * `defs` (each through the load gate); its linear records stay. */
export function withEquipmentAssemblies(stored: unknown, defs: unknown): unknown[] {
  return [...sanitizeAssemblyLibrary(stored), ...sanitizeAssemblyDefinitions(defs).assemblies];
}

/** The assemblies with a `kind` in a stored library. */
export function equipmentAssembliesOf(stored: unknown): AssemblyDefinition[] {
  return sanitizeAssemblyDefinitions(stored).assemblies;
}
