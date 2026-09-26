// ASSEMBLIES goal, WP3.1 — the records the assembly engine reads and writes
// (plan §8.2): AssemblyDefinition (a library recipe), ApplicationRecord (one
// unit's chosen recipe in a project) and ExpandedLine (one output line).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. The library loads through one gate
// on both surfaces (the browser profile, the MCP's library-by-path), and an
// expanded line has one shape in every export.
//
// Library home (decision D7): `assembly_library` in the estimator profile.
// A record with a `kind` is an assembly for this engine; a record without one
// is a linear run assembly (web/src/lib/linear), which its own sanitizer keeps
// resolving byte for byte.
//
// Every expression is parsed and its references checked when a library
// loads (expr.ts checkExpr): a misspelled attribute, variable or option
// refuses the record with the offending token, never at expansion time.

import { z } from "zod";
import { ASSEMBLY_FAMILIES, familyAttributes } from "./attributes";
import { checkExpr, ExprError, type Scope } from "./expr";

// ── Vocabularies ────────────────────────────────────────────────────────────

/** Who does a line's work: the responsibility matrix's parties (decision D13;
 * the VA 23 09 23 Responsibility Table's contractors). */
export const PARTIES = ["controls", "mechanical", "electrical", "fire_alarm", "factory", "owner", "general", "unassigned"] as const;
/** The trade a line belongs to. */
export const TRADES = ["controls", "mechanical", "electrical", "fire_alarm", "factory", "owner"] as const;
/** The activities the responsibility matrix assigns (the BAS register's five
 * plus line power). */
export const ACTIVITIES = ["furnish", "install", "wire_lv", "power", "program", "test"] as const;
export const IO_TYPES = ["AI", "AO", "BI", "BO", "PULSE", "NET-IN", "NET-OUT", "SOFT"] as const;
export const LINE_KINDS = ["point", "device", "component", "labor", "note", "assembly"] as const;
/** A parameter the schedule does not fix: decided downstream (selection). */
export const SELECTION = "<selection>";

const id = z.string().regex(/^[a-z][a-z0-9_.-]*$/i, "an id is letters, digits, '_', '.' or '-', starting with a letter");
const expr = z.string().trim().min(1, "an expression cannot be empty");
const scalar = z.union([z.number().finite(), z.string(), z.boolean()]);

const party = z.enum(PARTIES).optional();

const Source = z.object({
  ref: z.string().min(1),
  license: z.string().min(1),
  derivation: z.enum(["verbatim", "paraphrase", "inferred"]),
}).strict();

const Line = z.object({
  id,
  kind: z.enum(LINE_KINDS),
  /** What the line is, in words (a points schedule's description). */
  label: z.string().trim().min(1).optional(),
  /** Include the line only when this is true; unknown makes it unresolved. */
  when: expr.optional(),
  /** Per instance, before the instance multiplier. */
  qty: expr,
  unit: z.string().min(1),
  waste_pct: z.number().min(0).max(100).optional(),
  /** Applied at roll-up, to the order quantity (D8). */
  round: z.union([z.literal("none"), z.literal("ceil"), z.object({ increment: z.number().positive() }).strict()]).optional(),
  role: z.object({ vocab: z.enum(["s223", "xeto", "ot"]), id: z.string().min(1) }).strict(),
  io: z.enum(IO_TYPES).optional(),
  /** A point names the device role it belongs to (D4). */
  device_role_ref: z.string().min(1).optional(),
  /** A sub-assembly this line expands (kind "assembly"). */
  ref: z.object({ id, version: z.string().min(1).optional() }).strict().optional(),
  /** An expression (quoted text is text: "'2-way'"), a number, a boolean, or
   * "<selection>". */
  params: z.record(scalar).optional(),
  /** Who does what for this line (D13), over the project's matrix. */
  responsibility: z.object({ furnish: party, install: party, wire_lv: party, power: party, program: party, test: party }).strict().optional(),
  trade: z.enum(TRADES),
  /** The line exists only when this hook-up profile setting is true. */
  profile_switch: z.string().min(1).optional(),
  labor_task: z.object({ task: z.string().min(1), driver: z.string().min(1) }).strict().optional(),
  /** Partner-entered, opaque; never shipped in a starter library (D2, D14). */
  partner: z.object({ part_no: z.string().optional(), unit_cost: z.number().optional(), hours: z.number().optional(), labor_category: z.string().optional() }).strict().optional(),
  export: z.object({ category: z.string().optional(), cost_code: z.string().optional() }).strict().optional(),
  source: Source,
}).strict();

const Option = z.object({ id, label: z.string().min(1), auto: expr.optional(), default: z.boolean().optional(), note: z.string().optional() }).strict();
const Variable = z.object({
  id,
  unit: z.string().optional(),
  from: z.string().regex(/^(?:attr|project)\.[A-Za-z_][A-Za-z0-9_]*$/, 'from is "attr.<name>" or "project.<name>"').optional(),
  default: scalar.optional(),
  prompt: z.string().optional(),
}).strict();

export const AssemblyDefinitionSchema = z.object({
  id,
  version: z.string().regex(/^\d+(?:\.\d+){0,2}$/, "a version is 1, 1.2 or 1.2.3"),
  title: z.string().min(1),
  /** equipment: chosen per unit by its selector; project: once per project;
   * part: a sub-assembly, expanded only where another assembly's line names
   * it, never chosen on its own. */
  kind: z.enum(["equipment", "project", "part"]),
  /** family: one family, or several that share the recipe (an air handler
   * drafted as AHU, RTU or DOAS); its expressions may read only attributes
   * every listed family has. layer: a unit gets one assembly per layer
   * ("controls", the BAS typical; "hookup", the mechanical hook-up; a
   * partner may add more). */
  applies_to: z.object({
    family: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    selector: expr.optional(),
    rank: z.number().int(),
    layer: id.default("controls"),
  }).strict(),
  options: z.array(Option).default([]),
  variables: z.array(Variable).default([]),
  lines: z.array(Line).min(1),
  provenance: z.array(z.object({
    source: z.string().min(1), edition: z.string().optional(), locator: z.string().optional(),
    license: z.string().min(1), derivation: z.enum(["verbatim", "paraphrase", "inferred"]),
    reviewer: z.string().optional(), date: z.string().optional(),
  }).strict()).default([]),
  status: z.enum(["starter", "partner_edited", "partner_imported"]),
}).strict();

export type AssemblyDefinition = z.infer<typeof AssemblyDefinitionSchema>;
export type AssemblyLine = AssemblyDefinition["lines"][number];

// ── Outputs ─────────────────────────────────────────────────────────────────

/** Where a chosen value came from, strongest first (decision D6). */
export const VALUE_SOURCES = ["drawing", "attr", "project", "partner_default", "starter_default", "user"] as const;
export type ValueSource = (typeof VALUE_SOURCES)[number];

export interface Cite {
  sheet: string;
  table_title: string;
  header: string;
  bbox: number[] | null;
}

/** One unit's recipe in a project for one layer (plan §8.2). */
export interface ApplicationRecord {
  instance: { tag: string; family: string; scope: { building: string | null; floor: string | null; system: string | null }; cites: Cite[] };
  layer: string;
  assembly: { id: string; version: string } | null;
  selected_by: "rule" | "user";
  reason: string | null;
  options: Record<string, { value: boolean | null; source: ValueSource | null; missing?: string[] }>;
  variables: Record<string, { value: number | string | boolean | null; source: ValueSource | null }>;
  /** not_in_scope: a project answer or the unit's control drawings put it
   * outside the BAS scope (goals/CONTROL_INTENT.md), so it takes no typical. */
  status: "ok" | "unresolved" | "overridden" | "excluded" | "no_assembly" | "not_in_scope";
  /** What the unit waits for: the references that left a selector, option or
   * line unknown, and the candidates it could not choose between. */
  unresolved: { missing: string[]; candidates: string[] };
  excluded_reason?: string;
  multiplier: { value: number; basis: string };
  /** The project answers and drawing readings the record rests on (control
   * intent), each with its rule, basis and cites; absent when there are none. */
  intent?: IntentUse[];
}

/** One control-intent fact a record used: its target ("scope", "attr.<id>"
 * or "opt.<id>"), value, source, rule, basis and cites. */
export interface IntentUse {
  target: string;
  value: number | string | boolean | null;
  source: "project" | "drawing";
  rule: string;
  basis: string;
  cites: Cite[];
  /** A fact the record could not use because the schedule prints otherwise
   * (decision C12): the option stays unresolved. */
  conflict?: string;
}

/** One output line (plan §8.2, §8.4): the three quantity stages, what every
 * parameter's value came from, and the rule and drawing it cites (A5). */
export interface ExpandedLine {
  tag: string;
  family: string;
  layer: string;
  scope: { building: string | null; floor: string | null; system: string | null };
  /** assembly id@version:line id, with the sub-assembly path when nested. */
  rule: string;
  kind: AssemblyLine["kind"];
  label: string | null;
  role: AssemblyLine["role"];
  io: AssemblyLine["io"] | null;
  device_role_ref: string | null;
  unit: string;
  /** qty × instance multiplier; null when unresolved. */
  qty_base: number | null;
  /** qty_base with the line's waste; rounding is a roll-up stage (D8). */
  qty_with_waste: number | null;
  waste_pct: number;
  round: AssemblyLine["round"] | null;
  params: Record<string, { value: number | string | boolean | null; source: ValueSource | "expr" | "selection" | "literal" | null }>;
  responsibility: Partial<Record<(typeof ACTIVITIES)[number], string>>;
  trade: AssemblyLine["trade"];
  labor_task: AssemblyLine["labor_task"] | null;
  /** ok: a known quantity; unresolved: waits for `missing`; replaced: the
   * drawing's own evidence stands instead (D6); error: the line's expression
   * failed (the message is in `missing`). */
  status: "ok" | "unresolved" | "replaced" | "error";
  missing: string[];
  /** A known quantity rests on the drawing and project ("evidence"), or on a
   * partner default standing in for something the drawing does not give. */
  qty_source: "evidence" | "partner_default" | null;
  /** The drawing evidence the line rests on (the instance's cites). */
  cites: Cite[];
  source: AssemblyLine["source"];
  /** The partner's own fields on the line's rule, as entered (D14); absent
   * when the rule carries none, as every starter line does. */
  partner?: NonNullable<AssemblyLine["partner"]>;
}

// ── The load gate ───────────────────────────────────────────────────────────

export interface Rejected {
  id: string | null;
  errors: string[];
}

/** The families an assembly applies to, as a list. */
export function familiesOf(def: Pick<AssemblyDefinition, "applies_to">): string[] {
  const f = def.applies_to.family;
  return typeof f === "string" ? [f] : [...f];
}

/** The names an assembly's expressions may reference. A part for any family
 * ("ANY") may reference any family's attributes; an assembly for several
 * families only the attributes they all have; a family the schema does not
 * know has none, so its expressions may use only variables and options. */
export function scopeOf(def: Pick<AssemblyDefinition, "applies_to" | "options" | "variables">): Scope {
  const known = (family: string): readonly string[] => {
    try {
      return familyAttributes(family).all;
    } catch {
      return [];
    }
  };
  const families = familiesOf(def);
  let attrs: readonly string[];
  if (families.includes("ANY")) attrs = [...new Set(ASSEMBLY_FAMILIES.flatMap((f) => familyAttributes(f).all))];
  else attrs = families.map(known).reduce((acc, a) => acc.filter((x) => a.includes(x)));
  return { attrs: new Set(attrs), vars: new Set(def.variables.map((v) => v.id)), opts: new Set(def.options.map((o) => o.id)) };
}

/** Validate one record: its shape (zod), unique ids, every expression and
 * reference, a variable's attribute source, a point's device, and a
 * sub-assembly line's reference. */
export function validateAssembly(raw: unknown): { ok: true; def: AssemblyDefinition } | { ok: false; rejected: Rejected } {
  const idOf = (r: unknown) => (r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string" ? (r as { id: string }).id : null);
  const parsed = AssemblyDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, rejected: { id: idOf(raw), errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(record)"}: ${i.message}`) } };
  }
  const def = parsed.data;
  const errors: string[] = [];
  const dupes = (what: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const x of ids) {
      if (seen.has(x)) errors.push(`${what} "${x}" appears twice`);
      seen.add(x);
    }
  };
  dupes("family", familiesOf(def));
  dupes("option", def.options.map((o) => o.id));
  dupes("variable", def.variables.map((v) => v.id));
  dupes("line", def.lines.map((l) => l.id));
  const scope = scopeOf(def);
  const check = (where: string, src: string | undefined) => {
    if (src === undefined) return;
    try {
      checkExpr(src, scope);
    } catch (e) {
      errors.push(`${where}: ${e instanceof ExprError ? e.message : String(e)}`);
    }
  };
  check("applies_to.selector", def.applies_to.selector);
  for (const o of def.options) check(`options.${o.id}.auto`, o.auto);
  for (const v of def.variables) {
    if (v.from?.startsWith("attr.") && !scope.attrs.has(v.from.slice(5))) errors.push(`variables.${v.id}.from: "${v.from}" is not an attribute of ${familiesOf(def).join(" and ")}`);
  }
  const deviceRoles = new Set(def.lines.filter((l) => l.kind === "device").map((l) => l.role.id));
  for (const l of def.lines) {
    check(`lines.${l.id}.when`, l.when);
    check(`lines.${l.id}.qty`, l.qty);
    for (const [name, p] of Object.entries(l.params ?? {})) {
      if (typeof p === "string" && p !== SELECTION) check(`lines.${l.id}.params.${name}`, p);
    }
    if (l.kind === "assembly" && !l.ref) errors.push(`lines.${l.id}: a sub-assembly line names its assembly in ref`);
    if (l.kind !== "assembly" && l.ref) errors.push(`lines.${l.id}: only a sub-assembly line takes ref`);
    if (l.kind === "point" && !l.io) errors.push(`lines.${l.id}: a point line names its io`);
    if (l.device_role_ref && !deviceRoles.has(l.device_role_ref)) errors.push(`lines.${l.id}.device_role_ref: no device line of role "${l.device_role_ref}"`);
  }
  return errors.length ? { ok: false, rejected: { id: def.id, errors } } : { ok: true, def };
}

/** The library load gate: the records with a `kind` (records without one are
 * linear assemblies, left to linear/assemblyLibrary.ts). Keeps the valid ones,
 * the first of each id@version, and refuses the rest with their reasons, then
 * refuses any whose sub-assembly reference does not resolve or cycles. */
export function sanitizeAssemblyDefinitions(raw: unknown): { assemblies: AssemblyDefinition[]; rejected: Rejected[] } {
  const assemblies: AssemblyDefinition[] = [];
  const rejected: Rejected[] = [];
  if (!Array.isArray(raw)) return { assemblies, rejected };
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== "object" || Array.isArray(r) || !("kind" in r)) continue;
    const v = validateAssembly(r);
    if (!v.ok) { rejected.push(v.rejected); continue; }
    const key = `${v.def.id}@${v.def.version}`;
    if (seen.has(key)) { rejected.push({ id: v.def.id, errors: [`${key} appears twice; the first is kept`] }); continue; }
    seen.add(key);
    assemblies.push(v.def);
  }
  // Sub-assembly references resolve to a loaded assembly and never cycle.
  const byId = (idv: string, version?: string) => assemblies.find((a) => a.id === idv && (!version || a.version === version));
  const bad = new Map<string, string>();
  const visit = (a: AssemblyDefinition, path: string[]): string | null => {
    for (const l of a.lines) {
      if (l.kind !== "assembly" || !l.ref) continue;
      const sub = byId(l.ref.id, l.ref.version);
      if (!sub) return `lines.${l.id}.ref: no assembly "${l.ref.id}${l.ref.version ? `@${l.ref.version}` : ""}" in the library`;
      if (path.includes(sub.id)) return `lines.${l.id}.ref: "${sub.id}" contains itself (${[...path, sub.id].join(" → ")})`;
      const deeper = visit(sub, [...path, sub.id]);
      if (deeper) return `lines.${l.id}.ref → ${sub.id}: ${deeper}`;
    }
    return null;
  };
  for (const a of assemblies) {
    const why = visit(a, [a.id]);
    if (why) bad.set(`${a.id}@${a.version}`, why);
  }
  return {
    assemblies: assemblies.filter((a) => !bad.has(`${a.id}@${a.version}`)),
    rejected: [...rejected, ...[...bad].map(([key, why]) => ({ id: key.split("@")[0], errors: [why] }))],
  };
}
