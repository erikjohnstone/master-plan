// ASSEMBLIES goal, WP3.3 — expanding a unit's chosen assembly into lines
// (plan §8.2 ExpandedLine, §8.4 quantity pipeline, decision D8).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes: the lines are the takeoff's
// quantities, and the UI panel, the MCP tool and every export read them.
//
// Per line, in a fixed order:
//   1. a hook-up profile switch the project has off drops the line; one it
//      has not set leaves the line unresolved;
//   2. `when` false drops the line; unknown leaves it unresolved;
//   3. qty_base = qty × the unit's multiplier (unknown → unresolved, null);
//   4. qty_with_waste = qty_base × (1 + waste %); rounding is the roll-up's
//      stage (rollup.ts), because it is an order quantity (D8);
//   5. parameters evaluate with their sources; "<selection>" stays for the
//      selection tool downstream;
//   6. drawing evidence replaces typical lines of the same role and never
//      adds to them (D6): a printed points list replaces the point lines, a
//      component the drawing declares replaces the device line of its role.
// A sub-assembly line expands its assembly's lines under the parent's path,
// its quantity multiplying theirs; the container line itself carries no
// quantity, so nothing is counted twice.

import { ExprError, type Value } from "./expr";
import type { ApplicationRecord, AssemblyDefinition, AssemblyLine, ExpandedLine, ValueSource } from "./schema";
import { SELECTION } from "./schema";
import { envFor, latest, layersFor, PROJECT_INSTANCE, run, selectAssembly, selectProjectAssemblies, type Instance, type Override, type ProjectSettings } from "./select";

/** What the drawing itself says about a unit's controls (read-only inputs from
 * the BAS points and assembly-register outputs). */
export interface DrawingEvidence {
  /** The unit has a printed points list: its typical points become a
   * comparison only. */
  printedPoints?: boolean;
  /** Device roles the drawing declares for the unit. */
  declaredRoles?: readonly string[];
}

const round12 = (n: number) => Number(n.toPrecision(12));

function findAssembly(library: readonly AssemblyDefinition[], id: string, version?: string): AssemblyDefinition | undefined {
  return version ? library.find((a) => a.id === id && a.version === version) : latest(library.filter((a) => a.id === id))[0];
}

/** Expand one unit's application record into its lines. */
export function expandApplication(
  app: ApplicationRecord,
  instance: Instance,
  library: readonly AssemblyDefinition[],
  settings: ProjectSettings = {},
  evidence: DrawingEvidence = {},
): ExpandedLine[] {
  if (!app.assembly || app.status === "excluded" || app.status === "no_assembly") return [];
  const def = findAssembly(library, app.assembly.id, app.assembly.version);
  if (!def) return [];
  const vars = Object.fromEntries(Object.entries(app.variables).map(([k, v]) => [k, { value: v.value as Value | null, source: v.source }]));
  const opts = Object.fromEntries(Object.entries(app.options).map(([k, v]) => [k, { value: v.value as Value | null, source: v.source }]));
  const out: ExpandedLine[] = [];
  const declared = new Set(evidence.declaredRoles ?? []);
  const walk = (asm: AssemblyDefinition, path: string, factor: number | null, factorMissing: string[], depth: number, subVars = vars, subOpts = opts) => {
    for (const line of asm.lines) {
      const rule = `${path}${asm.id}@${asm.version}:${line.id}`;
      const env = envFor(instance, subVars, subOpts);
      const missing: string[] = [...factorMissing];
      let status: ExpandedLine["status"] = "ok";
      let error: string | null = null;
      const evalOr = (src: string) => {
        try {
          return run(src, env);
        } catch (e) {
          error = e instanceof ExprError ? e.message : String(e);
          return null;
        }
      };
      // 1. The hook-up profile.
      if (line.profile_switch) {
        const on = settings.profile?.[line.profile_switch];
        if (on === false) continue;
        if (on === undefined) missing.push(`profile.${line.profile_switch}`);
      }
      // 2. The line's condition.
      if (line.when) {
        const w = evalOr(line.when);
        if (w && w.known && w.value === false) continue;
        if (w && !w.known) missing.push(...w.missing);
      }
      // A sub-assembly: its lines, times this line's quantity.
      if (line.kind === "assembly" && line.ref) {
        const sub = findAssembly(library, line.ref.id, line.ref.version);
        if (!sub || depth > 8) continue;
        const q = evalOr(line.qty);
        const n = q && q.known && typeof q.value === "number" ? q.value : null;
        const subApp = selectAssembly(instance, [sub], settings, { tag: instance.tag, reason: "sub-assembly", assembly: { id: sub.id, version: sub.version } }, app.layer);
        const sv = Object.fromEntries(Object.entries(subApp.variables).map(([k, v]) => [k, { value: v.value as Value | null, source: v.source }]));
        const so = Object.fromEntries(Object.entries(subApp.options).map(([k, v]) => [k, { value: v.value as Value | null, source: v.source }]));
        walk(sub, `${rule}/`, factor !== null && n !== null ? factor * n : null, [...missing, ...(q && !q.known ? q.missing : [])], depth + 1, sv, so);
        continue;
      }
      // 3. The quantity.
      const q = evalOr(line.qty);
      let qtyBase: number | null = null;
      if (q && q.known) {
        if (typeof q.value !== "number" || !Number.isFinite(q.value)) error = `qty is ${JSON.stringify(q.value)}, not a number`;
        else if (factor !== null && !missing.length) qtyBase = round12(q.value * factor);
      } else if (q) missing.push(...q.missing);
      if (error) status = "error";
      else if (missing.length || qtyBase === null) status = "unresolved";
      // 6. Drawing evidence replaces the typical's line of the same role.
      if ((line.kind === "point" && evidence.printedPoints) || (line.kind === "device" && declared.has(line.role.id))) status = "replaced";
      // 4. Waste.
      const waste = line.waste_pct ?? 0;
      const known = status === "ok";
      // 5. Parameters.
      const params: ExpandedLine["params"] = {};
      for (const [name, p] of Object.entries(line.params ?? {})) {
        if (p === SELECTION) { params[name] = { value: null, source: "selection" }; continue; }
        if (typeof p !== "string") { params[name] = { value: p, source: "literal" }; continue; }
        let r: ReturnType<typeof run> | null = null;
        try { r = run(p, env); } catch { r = null; }
        params[name] = r && r.known ? { value: r.value, source: sourceOf(p, env.sources) } : { value: null, source: null };
      }
      const usedDefault = [...env.sources.values()].includes("partner_default");
      out.push({
        tag: instance.tag,
        family: instance.family,
        layer: app.layer,
        scope: instance.scope,
        rule,
        kind: line.kind,
        role: line.role,
        io: line.io ?? null,
        device_role_ref: line.device_role_ref ?? null,
        unit: line.unit,
        qty_base: known ? qtyBase : null,
        qty_with_waste: known && qtyBase !== null ? round12(qtyBase * (1 + waste / 100)) : null,
        waste_pct: waste,
        round: line.round ?? null,
        params,
        responsibility: { ...(line.responsibility ?? {}), ...(settings.responsibility?.[line.role.id] ?? {}) } as ExpandedLine["responsibility"],
        trade: line.trade,
        labor_task: line.labor_task ?? null,
        status,
        missing: error ? [error] : [...new Set(missing)],
        qty_source: known ? (usedDefault ? "partner_default" : "evidence") : null,
        cites: instance.cites,
        source: line.source,
      });
    }
  };
  const mult = app.multiplier?.value ?? 1;
  walk(def, "", Number.isFinite(mult) ? mult : null, [], 0);
  return out;
}

function sourceOf(src: string, sources: Map<string, ValueSource | null>): ExpandedLine["params"][string]["source"] {
  const ref = src.trim().match(/^(?:attr|var|opt)\.[A-Za-z_][A-Za-z0-9_]*$/)?.[0];
  if (ref) return sources.get(ref) ?? null;
  return "expr";
}

/** Choose and expand every unit in every layer the library offers its
 * family: instances in tag order, layers in name order, so the result does
 * not depend on the order they arrive in. */
export function expandAll(
  instances: readonly Instance[],
  library: readonly AssemblyDefinition[],
  settings: ProjectSettings = {},
  overrides: readonly Override[] = [],
  evidence: Readonly<Record<string, DrawingEvidence>> = {},
): { applications: ApplicationRecord[]; lines: ExpandedLine[] } {
  const sorted = [...instances].sort((a, b) => a.tag.localeCompare(b.tag) || a.family.localeCompare(b.family));
  const applications: ApplicationRecord[] = [];
  const lines: ExpandedLine[] = [];
  for (const inst of sorted) {
    for (const layer of layersFor(inst.family, library)) {
      const override = overrides.find((o) => o.tag === inst.tag && (o.layer ?? layer) === layer && (!o.assembly || library.some((a) => a.id === o.assembly!.id && (a.applies_to.layer ?? "controls") === layer)));
      const app = selectAssembly(inst, library, settings, override, layer);
      applications.push(app);
      lines.push(...expandApplication(app, inst, library, settings, evidence[inst.tag]));
    }
  }
  // Project assemblies, once each, after the units.
  for (const app of selectProjectAssemblies(library, settings)) {
    applications.push(app);
    const def = library.find((a) => a.id === app.assembly?.id && a.version === app.assembly?.version);
    const inst = { ...PROJECT_INSTANCE, family: def?.applies_to.family ?? "project" };
    lines.push(...expandApplication(app, inst, library, settings).map((l) => ({ ...l, family: "project" })));
  }
  return { applications, lines };
}

export type { AssemblyLine };
