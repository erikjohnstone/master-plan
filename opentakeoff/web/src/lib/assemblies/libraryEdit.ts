// ASSEMBLIES goal, WP5.4 — the library an estimator edits (goals/ASSEMBLIES.md
// WP5.4: "starter read-only → clone → edit, with live reference validation
// and override tint", the materials.js pattern).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes for what decides validity and what
// counts as an override: the same load gate the MCP tool and the project file
// use (schema.ts), and the same per-item diff as "update to latest"
// (projectState.ts). The editor chrome is the Library tab's own.
//
// The starter ships read-only (status "starter"). Cloning makes the partner's
// copy: same id, the next version, status "partner_edited". `latest()` then selects
// it over the starter for new projects. A saved project keeps its pins (A5).
import { definitionDiff } from "./projectState";
import { sanitizeAssemblyDefinitions, type AssemblyDefinition, type Rejected } from "./schema";
import { latest } from "./select";

const versionKey = (v: string) => v.split(".").map((p) => p.padStart(6, "0")).join(".");

/** The partner's editable copy of a definition: same id, a version above
 * every version of that id in the library ("1" → "1.1", "1.1" → "1.2"),

 * status "partner_edited". */
export function cloneForEdit(def: AssemblyDefinition, library: readonly AssemblyDefinition[]): AssemblyDefinition {
  const versions = library.filter((a) => a.id === def.id).map((a) => a.version).sort((a, b) => versionKey(a).localeCompare(versionKey(b)));
  const top = versions.at(-1) ?? def.version;
  const parts = top.split(".");
  const next = parts.length === 1 ? `${parts[0]}.1` : [...parts.slice(0, -1), String(Number(parts.at(-1)) + 1)].join(".");
  return { ...structuredClone(def), version: next, status: "partner_edited" };
}

/** The library an estimator applies: the starter and the partner's own
 * records through one load gate, so a partner record's sub-assembly
 * references resolve against both. */
export function combinedLibrary(starter: readonly AssemblyDefinition[], partner: readonly AssemblyDefinition[]): { library: AssemblyDefinition[]; rejected: Rejected[] } {
  const { assemblies, rejected } = sanitizeAssemblyDefinitions([...starter, ...partner]);
  return { library: assemblies, rejected };
}

/** Live validation of an edited record (its JSON text) in the context of the
 * library it will join: shape, expressions against its families' attributes,
 * device references, and sub-assembly references resolving in the library.
 * A starter record cannot be saved over. */
export function validateEdit(text: string, library: readonly AssemblyDefinition[]): { def: AssemblyDefinition | null; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { def: null, errors: [`not JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("kind" in raw)) return { def: null, errors: ["an assembly record is an object with a kind"] };
  const r = raw as { id?: unknown; version?: unknown; status?: unknown };
  if (r.status === "starter") return { def: null, errors: ['status "starter" is the shipped library, read-only: clone it (status "partner_edited")'] };
  const others = library.filter((a) => !(a.id === r.id && a.version === r.version));
  const { assemblies, rejected } = sanitizeAssemblyDefinitions([...others, raw]);
  const mine = rejected.filter((x) => x.id === r.id);
  if (mine.length) return { def: null, errors: mine.flatMap((x) => x.errors) };
  const def = assemblies.find((a) => a.id === r.id && a.version === r.version) ?? null;
  return def ? { def, errors: [] } : { def: null, errors: ["the library gate did not keep the record"] };
}

/** What a partner record overrides of the starter it was cloned from (the
 * amber tint): the differing fields, options, variables and lines. Null when
 * there is no starter record of that id. */
export function overridesOf(def: AssemblyDefinition, starter: readonly AssemblyDefinition[]) {
  const origin = latest(starter.filter((a) => a.id === def.id))[0];
  if (!origin) return null;
  const d = definitionDiff(origin, def);
  return { origin: `${origin.id}@${origin.version}`, ...d, fields: d.fields.filter((f) => f !== "version" && f !== "status") };
}
