// ASSEMBLIES goal, WP5.2 — a project's assemblies as the project file keeps
// them: the definitions it applies, pinned as they were when adopted; its
// settings; its overrides, each with a reason (plan §8.2; decision A5: a
// library edit never changes a saved project silently).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. The project file is written by the
// canvas and carried through by export_takeoff / import_takeoff. One sanitize
// gate reads it, and the "update to latest" diff is computed once for every
// surface. Showing the diff and asking are surface-specific.
//
// A project's library is its pinned definitions, plus the library's newest
// for any id it has not pinned yet. Applying pins what the records used (each
// record's assembly and the sub-assemblies its lines name). A newer version in
// the library never replaces a pinned one: libraryUpdates() lists what changed,
// per option and per line, and only adoptUpdate(), the user's explicit act,
// moves the pin.
import { z } from "zod";
import { sanitizeAssemblyDefinitions, type ApplicationRecord, type AssemblyDefinition } from "./schema";
import { latest, type Override, type ProjectSettings } from "./select";

export const ASSEMBLIES_STATE_SCHEMA = "opentakeoff.assemblies_state.v1" as const;

export interface AssembliesState {
  schema: typeof ASSEMBLIES_STATE_SCHEMA;
  /** The definitions the project applies, one version per id, as adopted. */
  pinned: AssemblyDefinition[];
  settings: ProjectSettings;
  overrides: Override[];
}

const value = z.union([z.number(), z.string(), z.boolean()]);
const settingsSchema = z.object({
  variables: z.record(z.string(), value).optional(),
  partnerDefaults: z.record(z.string(), value).optional(),
  profile: z.record(z.string(), z.boolean()).optional(),
  responsibility: z.record(z.string(), z.record(z.string(), z.string())).optional(),
}).strict();
const overrideSchema = z.object({
  tag: z.string().min(1),
  reason: z.string().trim().min(1),
  layer: z.string().min(1).optional(),
  exclude: z.boolean().optional(),
  assembly: z.object({ id: z.string().min(1), version: z.string().min(1).optional() }).strict().optional(),
  options: z.record(z.string(), z.boolean()).optional(),
  variables: z.record(z.string(), value).optional(),
}).strict();

export function emptyAssembliesState(): AssembliesState {
  return { schema: ASSEMBLIES_STATE_SCHEMA, pinned: [], settings: {}, overrides: [] };
}

/** The project file's `assemblies` block through its gate. Nothing is
 * dropped silently: every definition the library gate rejects, and every
 * setting or override that does not parse, is named in `dropped`. An absent
 * block is null. */
export function sanitizeAssembliesState(raw: unknown): { state: AssembliesState | null; dropped: string[] } {
  if (raw == null) return { state: null, dropped: [] };
  const dropped: string[] = [];
  if (typeof raw !== "object" || Array.isArray(raw)) return { state: null, dropped: ["assemblies: not an object"] };
  const r = raw as Record<string, unknown>;
  if (r.schema !== ASSEMBLIES_STATE_SCHEMA) return { state: null, dropped: [`assemblies: schema "${String(r.schema)}", this build reads ${ASSEMBLIES_STATE_SCHEMA}`] };
  const raws = Array.isArray(r.pinned) ? r.pinned : [];
  // The library gate reads only records with a `kind` (the rest are linear
  // run assemblies, library.ts); a pin without one is not an equipment
  // assembly, so it is named here rather than skipped.
  for (const x of raws) {
    if (!x || typeof x !== "object" || !("kind" in x)) dropped.push(`pinned ${String((x as { id?: unknown } | null)?.id ?? "(no id)")}: not an equipment assembly (no kind)`);
  }
  const { assemblies, rejected } = sanitizeAssemblyDefinitions(raws);
  for (const x of rejected) dropped.push(`pinned ${x.id ?? "(no id)"}: ${x.errors.join("; ")}`);
  const seen = new Set<string>();
  const pinned: AssemblyDefinition[] = [];
  for (const a of assemblies) {
    if (seen.has(a.id)) { dropped.push(`pinned ${a.id}@${a.version}: a second version of ${a.id}`); continue; }
    seen.add(a.id);
    pinned.push(a);
  }
  const s = settingsSchema.safeParse(r.settings ?? {});
  if (!s.success) dropped.push(`settings: ${s.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  const overrides: Override[] = [];
  (Array.isArray(r.overrides) ? r.overrides : []).forEach((o, i) => {
    const p = overrideSchema.safeParse(o);
    if (p.success) overrides.push(p.data);
    else dropped.push(`override ${i + 1}: ${p.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
  });
  return { state: { schema: ASSEMBLIES_STATE_SCHEMA, pinned, settings: s.success ? s.data : {}, overrides }, dropped };
}

/** The library a project applies: its pinned definitions, and the library's
 * newest version of every id it has not pinned. */
export function projectLibrary(state: AssembliesState | null, library: readonly AssemblyDefinition[]): AssemblyDefinition[] {
  const pinned = state?.pinned ?? [];
  const ids = new Set(pinned.map((a) => a.id));
  return [...pinned, ...latest(library).filter((a) => !ids.has(a.id))];
}

/** Pin what the records used, from the library they were applied with: each
 * record's assembly and, transitively, the sub-assemblies its lines name. A
 * pin already held is kept as it is. */
export function pinUsed(state: AssembliesState, applications: readonly ApplicationRecord[], library: readonly AssemblyDefinition[]): AssembliesState {
  const pinned = new Map(state.pinned.map((a) => [a.id, a]));
  const find = (id: string, version?: string) => (version ? library.find((a) => a.id === id && a.version === version) : latest(library.filter((a) => a.id === id))[0]);
  const visit = (def: AssemblyDefinition | undefined, depth: number) => {
    if (!def || depth > 8 || pinned.has(def.id)) return;
    pinned.set(def.id, def);
    for (const line of def.lines) if (line.kind === "assembly" && line.ref) visit(find(line.ref.id, line.ref.version), depth + 1);
  };
  for (const app of applications) if (app.assembly) visit(find(app.assembly.id, app.assembly.version), 0);
  const next = [...pinned.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { ...state, pinned: next };
}

export interface ItemChange { id: string; change: "added" | "removed" | "changed"; fields?: string[] }
export interface AssemblyUpdate {
  id: string;
  /** The pinned version and the library's newest. */
  from: string;
  to: string;
  /** Top-level fields that differ other than options, variables and lines. */
  fields: string[];
  options: ItemChange[];
  variables: ItemChange[];
  lines: ItemChange[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function diffById<T extends { id: string }>(before: readonly T[], after: readonly T[]): ItemChange[] {
  const out: ItemChange[] = [];
  const b = new Map(before.map((x) => [x.id, x]));
  const a = new Map(after.map((x) => [x.id, x]));
  for (const [id, old] of b) {
    const now = a.get(id);
    if (!now) { out.push({ id, change: "removed" }); continue; }
    if (same(old, now)) continue;
    const keys = [...new Set([...Object.keys(old), ...Object.keys(now)])].sort();
    out.push({ id, change: "changed", fields: keys.filter((k) => !same((old as Record<string, unknown>)[k], (now as Record<string, unknown>)[k])) });
  }
  for (const id of a.keys()) if (!b.has(id)) out.push({ id, change: "added" });
  return out;
}

/** What differs between two definitions: the top-level fields other than
 * options, variables and lines, and those three per item id. */
export function definitionDiff(before: AssemblyDefinition, after: AssemblyDefinition): Pick<AssemblyUpdate, "fields" | "options" | "variables" | "lines"> {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !["options", "variables", "lines"].includes(k)).sort();
  return {
    fields: keys.filter((k) => !same((before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k])),
    options: diffById(before.options, after.options),
    variables: diffById(before.variables, after.variables),
    lines: diffById(before.lines, after.lines),
  };
}

/** What the library would change in each pinned definition ("update to
 * latest"): per option, variable and line, by id. Nothing is applied. */
export function libraryUpdates(state: AssembliesState, library: readonly AssemblyDefinition[]): AssemblyUpdate[] {
  const out: AssemblyUpdate[] = [];
  for (const p of state.pinned) {
    const now = latest(library.filter((a) => a.id === p.id))[0];
    if (!now || same(p, now)) continue;
    out.push({ id: p.id, from: p.version, to: now.version, ...definitionDiff(p, now) });
  }
  return out;
}

/** Adopt the library's newest definition of one pinned id: the user's
 * explicit act after seeing libraryUpdates(). */
export function adoptUpdate(state: AssembliesState, id: string, library: readonly AssemblyDefinition[]): AssembliesState {
  const now = latest(library.filter((a) => a.id === id))[0];
  if (!now || !state.pinned.some((a) => a.id === id)) return state;
  return { ...state, pinned: state.pinned.map((a) => (a.id === id ? now : a)) };
}
