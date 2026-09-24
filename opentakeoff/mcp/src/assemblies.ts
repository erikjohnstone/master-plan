// ASSEMBLIES goal, WP5.3 — the MCP surface of the apply path.
//
// SHOULD THIS BE ON THE SHARED PATH? Everything that decides a record, a line
// or a count lives in web/src/lib/assemblies (apply.ts, report.ts). This file
// reads only the Session's inputs: its hvac_equipment compile, the sheet graph
// behind it and its pages' text spans (the surface-specific part), and it
// loads a library by path. The UI gets the same project from
// production-graph-cli --mode assemblies_project, which calls
// sessionAssembliesProject below, and applies it in the browser with the same
// applyAssemblies. The parity test holds the two to identical lines.
import { readFile } from "node:fs/promises";
// The starter library is bundled (the published package ships only dist/).
import starterTypicals from "../../web/src/lib/assemblies/starter/us-typicals-v1.json" with { type: "json" };
import starterHookups from "../../web/src/lib/assemblies/starter/us-hookups-v1.json" with { type: "json" };
import { applyAssemblies, compiledProjectOf, type CompiledProject, type HvacCompile } from "../../web/src/lib/assemblies/apply.ts";
import { assembliesReport, type AssembliesReport } from "../../web/src/lib/assemblies/report.ts";
import { equipmentAssembliesOf } from "../../web/src/lib/assemblies/library.ts";
import { sanitizeAssemblyDefinitions, type ApplicationRecord, type AssemblyDefinition, type ExpandedLine } from "../../web/src/lib/assemblies/schema.ts";
import type { Override, ProjectSettings } from "../../web/src/lib/assemblies/select.ts";
import { UserError } from "./format.ts";
import { compileProductionTakeoff } from "./productionTakeoff.ts";
import type { Session } from "./session.ts";

export const STARTER_FILES = ["us-typicals-v1.json", "us-hookups-v1.json"] as const;

/** The project the apply path reads, from this Session: the hvac_equipment
 * compile (the compile_corpus_takeoff path), its sheet graph and the text
 * spans of the claimed tables' pages. */
export async function sessionAssembliesProject(session: Session): Promise<CompiledProject> {
  const graph = await session.graphForPipeline();
  // hvac_equipment: categories of items (the union type also covers kinds
  // whose categories are shaped otherwise).
  const compiled = (await compileProductionTakeoff(session, graph, "hvac_equipment")) as unknown as HvacCompile;
  return compiledProjectOf(compiled, graph, (sheet) => session.sheetTextSpans(sheet));
}

/** A library through the load gate: every record the gate rejects fails the
 * call with its errors, so nothing is dropped silently. */
function gate(raw: unknown[], source: string): AssemblyDefinition[] {
  const { assemblies, rejected } = sanitizeAssemblyDefinitions(raw);
  if (rejected.length) {
    throw new UserError(`${source}: the library gate rejected ${rejected.length} assembl${rejected.length === 1 ? "y" : "ies"}: `
      + rejected.slice(0, 5).map((r) => `${r.id ?? "(no id)"}: ${r.errors.slice(0, 2).join("; ")}`).join(" | "));
  }
  return assemblies;
}

/** The starter library (typicals and hook-ups), or a library by path: an
 * assemblies file ({ assemblies: [...] } or a bare array) or an estimator
 * profile, whose assembly_library holds linear records too (only records
 * with a `kind` are this library's). */
export async function loadAssemblyLibrary(path?: string): Promise<{ library: AssemblyDefinition[]; source: string }> {
  if (!path) {
    const raw: unknown[] = [...(starterTypicals.assemblies as unknown[]), ...(starterHookups.assemblies as unknown[])];
    return { library: gate(raw, "starter"), source: `starter (${STARTER_FILES.join(", ")})` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    throw new UserError(`library_path ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  if (Array.isArray(parsed)) return { library: gate(parsed, path), source: path };
  if (Array.isArray(obj.assemblies)) return { library: gate(obj.assemblies, path), source: path };
  if (Array.isArray(obj.assembly_library)) {
    const library = equipmentAssembliesOf(obj.assembly_library);
    const withKind = obj.assembly_library.filter((a) => a && typeof a === "object" && "kind" in (a as object)).length;
    if (library.length !== withKind) throw new UserError(`${path}: the profile's assembly_library has ${withKind} equipment records; the library gate kept ${library.length}`);
    return { library, source: `${path} (profile)` };
  }
  throw new UserError(`library_path ${path}: not an assemblies file ({ assemblies: [...] }, an array) or a profile ({ assembly_library: [...] })`);
}

export interface ApplyAssembliesOptions {
  library_path?: string;
  settings?: ProjectSettings;
  overrides?: Override[];
  families?: string[];
  detail?: "summary" | "units" | "lines";
}

export interface ApplyAssembliesResult {
  library: { source: string; assemblies: number };
  report: Omit<AssembliesReport, "units"> & { units?: AssembliesReport["units"] };
  applications?: ApplicationRecord[];
  lines?: ExpandedLine[];
}

/** Apply a library to the Session's project and report it. `families`
 * narrows the reply, never the application: every unit is applied, so the
 * derived attributes (terminals served) see the whole project. */
export async function applyAssembliesToSession(session: Session, opts: ApplyAssembliesOptions = {}): Promise<ApplyAssembliesResult & { project: CompiledProject }> {
  const project = await sessionAssembliesProject(session);
  const { library, source } = await loadAssemblyLibrary(opts.library_path);
  const { instances, applications, lines } = applyAssemblies({ project, library, settings: opts.settings ?? {}, overrides: opts.overrides ?? [] });
  const want = opts.families?.length ? new Set(opts.families) : null;
  const inst = want ? instances.filter((i) => want.has(i.family)) : instances;
  const apps = want ? applications.filter((a) => want.has(a.instance.family)) : applications;
  const lns = want ? lines.filter((l) => want.has(l.family)) : lines;
  const report = assembliesReport(inst, apps, lns);
  const detail = opts.detail ?? "summary";
  const { units: _units, ...summary } = report;
  return {
    project,
    library: { source, assemblies: library.length },
    report: detail === "summary" ? summary : report,
    ...(detail === "lines" ? { applications: apps, lines: lns } : {}),
  };
}
