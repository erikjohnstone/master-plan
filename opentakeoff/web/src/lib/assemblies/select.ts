// ASSEMBLIES goal, WP3.3 — choosing each unit's assembly, its options and its
// variables (plan §8.3; decision D6's evidence precedence).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes: which recipe a unit gets, and why,
// is part of the takeoff's answer on every surface.
//
// For one unit:
//   1. candidates are the library's equipment assemblies for its family
//      (an assembly may list several);
//   2. a selector that evaluates true makes an assembly applicable, one that
//      depends on an unknown attribute only possible;
//   3. the highest-ranked applicable assembly wins — unless a possible one
//      ranks at least as high, or two applicable ones tie: then the unit is
//      `unresolved` and lists its candidates and what it waits for;
//   4. options: the user's choice, else `auto` over the unit's attributes,
//      else (when `auto` cannot decide) a partner default, else unresolved;
//      an option without `auto` takes its default;
//   5. variables: the user's value; else its source (an attribute, a project
//      variable); else a partner default; else, for a variable with no
//      source, the library's default; else unresolved.
// Unknown stays unknown (plan §8.1 A4): only a partner default resolves a
// value the drawing does not give, and the record says so.

import { evaluate, parseExpr, type Env, type Result, type Value } from "./expr";
import { familiesOf, type ApplicationRecord, type AssemblyDefinition, type Cite, type IntentUse, type ValueSource } from "./schema";
import type { IntentFact, UnitIntent } from "../controlIntent/intent";

/** A unit to apply assemblies to: its normalized attributes (normalize.ts)
 * and where it is. */
export interface Instance {
  tag: string;
  family: string;
  attributes: Record<string, { value: Value; cite?: Cite | null }>;
  scope: { building: string | null; floor: string | null; system: string | null };
  cites: Cite[];
  /** How many units the tag stands for, and why (plan §8.4). */
  multiplier?: { value: number; basis: string };
  /** What the project's answers and the unit's control drawings decide
   * (controlIntent/intent.ts). Its attributes are already among
   * `attributes`; its scope and options are applied here. */
  intent?: UnitIntent;
}

/** A project's settings for its assemblies: the partner's project variables,
 * partner defaults (for an option or variable the drawing leaves unknown),
 * the hook-up profile's switches and the responsibility matrix's edits. */
export interface ProjectSettings {
  variables?: Record<string, Value>;
  /** Keyed "<assembly id>.<option or variable id>" or just the id. */
  partnerDefaults?: Record<string, Value>;
  profile?: Record<string, boolean>;
  responsibility?: Record<string, Partial<Record<string, string>>>;
  /** The project questions' answers (controlIntent/catalogue.ts), question id
   * → answer; the apply path turns them into each unit's intent. */
  answers?: Record<string, string>;
}

/** A user's choice for one unit, always with a reason; for one layer, or
 * (with no layer) for every layer an exclusion covers. */
export interface Override {
  tag: string;
  reason: string;
  layer?: string;
  exclude?: boolean;
  assembly?: { id: string; version?: string };
  options?: Record<string, boolean>;
  variables?: Record<string, Value>;
}

type Chosen = { value: Value | null; source: ValueSource | null; missing?: string[] };

const partnerDefault = (settings: ProjectSettings, def: AssemblyDefinition, key: string): Value | undefined =>
  settings.partnerDefaults?.[`${def.id}.${key}`] ?? settings.partnerDefaults?.[key];

/** The values a unit's expressions read, and where each came from. */
export function envFor(instance: Instance, vars: Record<string, Chosen> = {}, opts: Record<string, Chosen> = {}): Env & { sources: Map<string, ValueSource | null> } {
  const sources = new Map<string, ValueSource | null>();
  return {
    sources,
    attr: (n) => {
      const v = instance.attributes[n]?.value;
      if (v !== undefined) sources.set(`attr.${n}`, "attr");
      return v;
    },
    var: (n) => {
      const c = vars[n];
      if (c && c.value !== null) sources.set(`var.${n}`, c.source);
      return c && c.value !== null ? c.value : undefined;
    },
    opt: (n) => {
      const c = opts[n];
      if (c && c.value !== null) sources.set(`opt.${n}`, c.source);
      return c && c.value !== null ? c.value : undefined;
    },
  };
}

const parsed = new Map<string, ReturnType<typeof parseExpr>>();
/** Evaluate an expression the library gate already checked. */
export function run(src: string, env: Env): Result {
  let node = parsed.get(src);
  if (!node) {
    node = parseExpr(src);
    parsed.set(src, node);
  }
  return evaluate(node, env, src);
}

const versionKey = (v: string) => v.split(".").map((p) => p.padStart(6, "0")).join(".");

/** The library's newest version of each id. */
export function latest(library: readonly AssemblyDefinition[]): AssemblyDefinition[] {
  const best = new Map<string, AssemblyDefinition>();
  for (const a of library) {
    const b = best.get(a.id);
    if (!b || versionKey(a.version) > versionKey(b.version)) best.set(a.id, a);
  }
  return [...best.values()];
}

function variablesOf(def: AssemblyDefinition, instance: Instance, settings: ProjectSettings, override?: Override): Record<string, Chosen> {
  const out: Record<string, Chosen> = {};
  for (const v of def.variables) {
    const user = override?.variables?.[v.id];
    if (user !== undefined) { out[v.id] = { value: user, source: "user" }; continue; }
    if (v.from?.startsWith("attr.")) {
      const a = instance.attributes[v.from.slice(5)]?.value;
      if (a !== undefined) { out[v.id] = { value: a, source: "attr" }; continue; }
    } else if (v.from?.startsWith("project.")) {
      const p = settings.variables?.[v.from.slice(8)];
      if (p !== undefined) { out[v.id] = { value: p, source: "project" }; continue; }
    }
    const pd = partnerDefault(settings, def, v.id);
    if (pd !== undefined) { out[v.id] = { value: pd, source: "partner_default" }; continue; }
    if (!v.from && v.default !== undefined) {
      out[v.id] = { value: v.default, source: def.status === "starter" ? "starter_default" : "partner_default" };
      continue;
    }
    out[v.id] = { value: null, source: null, missing: [v.from ?? `var.${v.id}`] };
  }
  return out;
}

/** An intent fact as a chosen value: a project answer is a project value, a
 * drawing reading a drawing value (D6: above a partner default). */
const fromFact = (f: IntentFact<boolean>): Chosen => ({ value: f.value, source: f.source === "drawing" ? "drawing" : "project" });

function optionsOf(def: AssemblyDefinition, instance: Instance, vars: Record<string, Chosen>, settings: ProjectSettings, override?: Override, uses?: IntentUse[]): Record<string, Chosen> {
  const out: Record<string, Chosen> = {};
  for (const o of def.options) {
    const user = override?.options?.[o.id];
    if (user !== undefined) { out[o.id] = { value: user, source: "user" }; continue; }
    const fact = instance.intent?.options?.[o.id];
    const use = (f: IntentFact<boolean>, conflict?: string): IntentUse => ({ target: `opt.${o.id}`, value: f.value, source: f.source, rule: f.rule, basis: f.basis, cites: f.cites, ...(conflict ? { conflict } : {}) });
    if (o.auto) {
      // An option's condition reads attributes and variables, never another option.
      const r = run(o.auto, envFor(instance, vars));
      if (r.known) {
        const value = r.value === true;
        // The schedule decides it; a fact that says otherwise is a conflict
        // the unit waits on, never an override (decision C12).
        if (fact && fact.value !== value) {
          uses?.push(use(fact, `the schedule makes it ${value}`));
          out[o.id] = { value: null, source: null, missing: [`conflict.opt.${o.id}`] };
          continue;
        }
        out[o.id] = { value, source: "attr" };
        continue;
      }
      if (fact) { uses?.push(use(fact)); out[o.id] = fromFact(fact); continue; }
      const pd = partnerDefault(settings, def, o.id);
      if (typeof pd === "boolean") { out[o.id] = { value: pd, source: "partner_default" }; continue; }
      out[o.id] = { value: null, source: null, missing: r.missing };
      continue;
    }
    if (fact) { uses?.push(use(fact)); out[o.id] = fromFact(fact); continue; }
    const pd = partnerDefault(settings, def, o.id);
    if (typeof pd === "boolean") { out[o.id] = { value: pd, source: "partner_default" }; continue; }
    out[o.id] = { value: o.default ?? false, source: def.status === "starter" ? "starter_default" : "partner_default" };
  }
  return out;
}

/** The intent facts on a unit's attributes, as record uses. */
const attributeUses = (instance: Instance): IntentUse[] => Object.entries(instance.intent?.attributes ?? {}).map(([k, f]) => ({
  target: `attr.${k}`, value: f.value as IntentUse["value"], source: f.source, rule: f.rule, basis: f.basis, cites: f.cites,
}));

/** The project itself, as the one "unit" a project assembly applies to (a
 * loop's system specialties, a front-end): no attributes, so its selectors
 * and quantities read project variables. */
export const PROJECT_INSTANCE: Instance = {
  tag: "(project)", family: "project", attributes: {},
  scope: { building: null, floor: null, system: null }, cites: [],
};

/** The project assemblies that apply, each once: its selector true (none
 * means always), unknown → unresolved with what it waits for. */
export function selectProjectAssemblies(library: readonly AssemblyDefinition[], settings: ProjectSettings = {}): ApplicationRecord[] {
  const out: ApplicationRecord[] = [];
  for (const def of latest(library).filter((a) => a.kind === "project").sort((a, b) => a.id.localeCompare(b.id))) {
    const app = selectAssembly({ ...PROJECT_INSTANCE, family: familiesOf(def)[0] }, [{ ...def, kind: "equipment" }], settings, undefined, def.applies_to.layer ?? "controls");
    if (app.status === "no_assembly") continue;
    out.push({ ...app, instance: { ...app.instance, family: "project" } });
  }
  return out;
}

/** The layers the library offers a family, in name order ("controls" when
 * it offers none). */
export function layersFor(family: string, library: readonly AssemblyDefinition[]): string[] {
  const layers = [...new Set(library.filter((a) => a.kind === "equipment" && familiesOf(a).includes(family)).map((a) => a.applies_to.layer ?? "controls"))].sort();
  return layers.length ? layers : ["controls"];
}

/** Choose one unit's assembly, options and variables in one layer. */
export function selectAssembly(instance: Instance, library: readonly AssemblyDefinition[], settings: ProjectSettings = {}, override?: Override, layer = "controls"): ApplicationRecord {
  const base = {
    instance: { tag: instance.tag, family: instance.family, scope: instance.scope, cites: instance.cites },
    layer,
    multiplier: instance.multiplier ?? { value: 1, basis: "one unit per tag" },
  };
  const empty = { options: {}, variables: {}, unresolved: { missing: [], candidates: [] } };
  if (override?.exclude) {
    return { ...base, ...empty, assembly: null, selected_by: "user", reason: override.reason, status: "excluded", excluded_reason: override.reason };
  }
  const finish = (def: AssemblyDefinition, selectedBy: "rule" | "user", reason: string | null, extraMissing: string[] = []): ApplicationRecord => {
    const variables = variablesOf(def, instance, settings, override);
    const uses: IntentUse[] = attributeUses(instance);
    const options = optionsOf(def, instance, variables, settings, override, uses);
    const missing = [...new Set([
      ...extraMissing,
      ...Object.values(options).flatMap((o) => o.missing ?? []),
      ...Object.values(variables).flatMap((v) => v.missing ?? []),
    ])];
    const status: ApplicationRecord["status"] = selectedBy === "user" ? "overridden" : missing.length ? "unresolved" : "ok";
    return {
      ...base,
      assembly: { id: def.id, version: def.version },
      selected_by: selectedBy,
      reason,
      options: Object.fromEntries(Object.entries(options).map(([k, v]) => [k, { value: v.value === null ? null : v.value === true, source: v.source, ...(v.missing ? { missing: v.missing } : {}) }])),
      variables: Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, { value: v.value, source: v.source }])),
      status,
      unresolved: { missing, candidates: [] },
      ...(uses.length ? { intent: uses } : {}),
    };
  };

  // A project answer or the unit's control drawings put it outside the BAS
  // scope: no typical (a user's own choice of assembly still wins, below).
  const outOfScope = instance.intent?.out_of_scope;
  if (outOfScope && !override?.assembly) {
    return {
      ...base, ...empty, assembly: null, selected_by: "rule", reason: `${outOfScope.rule}: ${outOfScope.basis}`, status: "not_in_scope",
      intent: [{ target: "scope", value: false, source: outOfScope.source, rule: outOfScope.rule, basis: outOfScope.basis, cites: outOfScope.cites }],
    };
  }

  if (override?.assembly) {
    const def = library.filter((a) => a.id === override.assembly!.id && (!override.assembly!.version || a.version === override.assembly!.version));
    const pick = latest(def)[0];
    if (!pick) return { ...base, ...empty, assembly: null, selected_by: "user", reason: override.reason, status: "no_assembly", unresolved: { missing: [], candidates: [`${override.assembly.id} (not in the library)`] } };
    return finish(pick, "user", override.reason);
  }

  // A part is never chosen on its own; it expands where a line names it.
  const candidates = latest(library).filter((a) => a.kind === "equipment" && familiesOf(a).includes(instance.family) && (a.applies_to.layer ?? "controls") === layer);
  if (!candidates.length) return { ...base, ...empty, assembly: null, selected_by: "rule", reason: null, status: "no_assembly" };
  const applicable: AssemblyDefinition[] = [];
  const possible: Array<{ def: AssemblyDefinition; missing: string[] }> = [];
  for (const def of candidates) {
    if (!def.applies_to.selector) { applicable.push(def); continue; }
    // A selector reads the unit's attributes (and variables sourced from them).
    const r = run(def.applies_to.selector, envFor(instance, variablesOf(def, instance, settings)));
    if (!r.known) possible.push({ def, missing: r.missing });
    else if (r.value === true) applicable.push(def);
  }
  const byRank = (a: AssemblyDefinition, b: AssemblyDefinition) => b.applies_to.rank - a.applies_to.rank || a.id.localeCompare(b.id);
  applicable.sort(byRank);
  possible.sort((a, b) => byRank(a.def, b.def));
  const top = applicable[0];
  // Every selector false: no assembly applies (plan §8.3).
  if (!top && !possible.length) return { ...base, ...empty, assembly: null, selected_by: "rule", reason: null, status: "no_assembly" };
  const rivals = top ? applicable.filter((a) => a.applies_to.rank === top.applies_to.rank) : [];
  const higherPossible = possible.filter((p) => !top || p.def.applies_to.rank >= top.applies_to.rank);
  if (top && rivals.length === 1 && !higherPossible.length) {
    return finish(top, "rule", `${top.id}@${top.version}: ${top.applies_to.selector ?? "(every unit of the family)"} (rank ${top.applies_to.rank})`);
  }
  // Undecided: tied applicable assemblies, or a possible one at least as
  // specific as the best applicable one, or only possible ones.
  const cands = [...higherPossible.map((p) => p.def), ...rivals];
  const missing = [...new Set(higherPossible.flatMap((p) => p.missing))];
  const uses = attributeUses(instance);
  return {
    ...base, ...empty,
    assembly: null,
    selected_by: "rule",
    reason: rivals.length > 1 ? `${rivals.length} assemblies of rank ${top!.applies_to.rank} apply` : null,
    status: "unresolved",
    unresolved: { missing, candidates: cands.map((a) => `${a.id}@${a.version}`) },
    ...(uses.length ? { intent: uses } : {}),
  };
}
