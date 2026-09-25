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
import { applyAssemblies, compiledProjectOf, type BasPointsCompile, type CompiledProject, type HvacCompile } from "../../web/src/lib/assemblies/apply.ts";
import { compileTakeoff } from "../../web/src/lib/compileTakeoff.mjs";
import { assembliesReport, type AssembliesReport } from "../../web/src/lib/assemblies/report.ts";
import { assembliesCsvSet, type ExportFile } from "../../web/src/lib/assemblies/exportSet.ts";
import { equipmentAssembliesOf } from "../../web/src/lib/assemblies/library.ts";
import { libraryFromCsv } from "../../web/src/lib/assemblies/libraryCsv.ts";
import { settingsWithPresets } from "../../web/src/lib/assemblies/presets.ts";
import { sanitizeAssemblyDefinitions, type ApplicationRecord, type AssemblyDefinition, type ExpandedLine } from "../../web/src/lib/assemblies/schema.ts";
import type { Override, ProjectSettings } from "../../web/src/lib/assemblies/select.ts";
import { readControlIntent, type ControlReadings } from "../../web/src/lib/controlIntent/record.ts";
import { httpTransport, memoryRunStore, type RunStore } from "../../web/src/lib/controlIntent/runs.ts";
import { pdfCropRenderer } from "./controlIntentCrops.ts";
import { UserError } from "./format.ts";
import { compileProductionTakeoff } from "./productionTakeoff.ts";
import type { Session } from "./session.ts";

export const STARTER_FILES = ["us-typicals-v1.json", "us-hookups-v1.json"] as const;

/** The project the apply path reads, from this Session: the hvac_equipment
 * compile (the compile_corpus_takeoff path), its sheet graph, the text spans
 * of the claimed tables' pages, the printed points-list rows mapped to
 * units, and the regions of any page whose title names zones (zone plans). */
export async function sessionAssembliesProject(session: Session): Promise<CompiledProject> {
  const graph = await session.graphForPipeline();
  // hvac_equipment: categories of items (the union type also covers kinds
  // whose categories are shaped otherwise).
  const compiled = (await compileProductionTakeoff(session, graph, "hvac_equipment")) as unknown as HvacCompile;
  // The printed points lists and the units their rows serve (D6 evidence):
  // the compile alone, without the BAS workflow's Python math.
  const basPoints = compileTakeoff(session, graph, "bas_points") as unknown as BasPointsCompile;
  return compiledProjectOf(compiled, graph, (sheet) => session.sheetTextSpans(sheet), basPoints, (sheet) => session.sheetRegions(sheet));
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
 * assemblies file ({ assemblies: [...] } or a bare array), an estimator
 * profile, whose assembly_library holds linear records too (only records
 * with a `kind` are this library's), or a library CSV (the Takeoff panel's
 * Library → Export CSV; libraryCsv.ts). The file is the library. */
export async function loadAssemblyLibrary(path?: string): Promise<{ library: AssemblyDefinition[]; source: string }> {
  if (!path) {
    const raw: unknown[] = [...(starterTypicals.assemblies as unknown[]), ...(starterHookups.assemblies as unknown[])];
    return { library: gate(raw, "starter"), source: `starter (${STARTER_FILES.join(", ")})` };
  }
  if (/\.csv$/i.test(path)) {
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (e) {
      throw new UserError(`library_path ${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
    // The same parse and gate as the panel's Import CSV; every problem by row and column.
    const { library, errors } = libraryFromCsv(text);
    if (errors.length) {
      throw new UserError(`${path}: the library CSV has ${errors.length} problem${errors.length === 1 ? "" : "s"}: `
        + errors.slice(0, 5).map((e) => `${e.row ? `row ${e.row}` : e.record ?? "file"}${e.column ? ` ${e.column}` : ""}: ${e.message}`).join(" | "));
    }
    return { library, source: `${path} (library CSV)` };
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

// ── Control intent: reading the set's control drawings ─────────────────────

/** How the control drawings are read (goals/CONTROL_INTENT.md C7, C8):
 * off; deterministic (R0 alone: the term list, exclusion phrases, the I/O a
 * diagram draws); models (R0 with the text model R1 and the vision model R2,
 * applied only where readers agree). */
export type ControlReadingMode = "off" | "deterministic" | "models";

/** The endpoint the model readers use: OPENTAKEOFF_AI_ENDPOINT (the platform
 * endpoint by default) with OPENTAKEOFF_AI_KEY or CEREBRAS_API_KEY; null when
 * no key is configured. */
export function controlModelConfig(env: NodeJS.ProcessEnv = process.env): { endpoint: string; apiKey: string } | null {
  const apiKey = env.OPENTAKEOFF_AI_KEY || env.CEREBRAS_API_KEY || "";
  if (!apiKey) return null;
  return { endpoint: env.OPENTAKEOFF_AI_ENDPOINT || "https://api.cerebras.ai", apiKey };
}

const MODES: readonly ControlReadingMode[] = ["off", "deterministic", "models"];

/** The mode a call runs when it names none: OPENTAKEOFF_CONTROL_READINGS
 * when set (the tests pin it), else models when an endpoint is configured,
 * else deterministic. */
export const defaultControlReadingMode = (env: NodeJS.ProcessEnv = process.env): ControlReadingMode => {
  const forced = env.OPENTAKEOFF_CONTROL_READINGS as ControlReadingMode | undefined;
  if (forced && MODES.includes(forced)) return forced;
  return controlModelConfig(env) ? "models" : "deterministic";
};

/** Every model run a Session has read, so applying again replays them. */
const RUN_STORES = new WeakMap<Session, RunStore>();
export const sessionRunStore = (session: Session): RunStore => {
  let store = RUN_STORES.get(session);
  if (!store) RUN_STORES.set(session, store = memoryRunStore());
  return store;
};

/** Read the Session's control drawings for its project (web/src/lib/
 * controlIntent/record.ts: the same readers every surface runs). */
export async function sessionControlReadings(session: Session, input: { project: CompiledProject; library: AssemblyDefinition[]; settings?: ProjectSettings; overrides?: Override[] }, mode: ControlReadingMode, store: RunStore = sessionRunStore(session)): Promise<ControlReadings | null> {
  if (mode === "off") return null;
  const cfg = mode === "models" ? controlModelConfig() : null;
  if (mode === "models" && !cfg) throw new UserError("control_readings \"models\" needs a model endpoint: set CEREBRAS_API_KEY (or OPENTAKEOFF_AI_KEY and OPENTAKEOFF_AI_ENDPOINT)");
  const render = cfg ? pdfCropRenderer((file) => session.documentPath(file)) : null;
  try {
    return await readControlIntent(input, {
      store,
      transport: cfg ? httpTransport(cfg) : null,
      render,
      readers: mode === "deterministic" ? { r1: false, r2: false } : undefined,
    });
  } finally {
    await render?.close();
  }
}

/** A reading's decisions for the reply: applied ones first, then proposals
 * and what the readers left unresolved. */
export function controlSummary(readings: ControlReadings | null, mode: ControlReadingMode, detail: "summary" | "units" | "lines", families?: ReadonlySet<string> | null) {
  if (!readings) return { mode, units_read: 0, decisions: { applied: 0, proposal: 0, unresolved: 0 } };
  const units = readings.units.filter((u) => !families || families.has(u.family));
  const decided = units.flatMap((u) => u.decisions.filter((d) => d.outcome !== "none").map((d) => ({ tag: u.tag, family: u.family, ...d })));
  const count = (o: string) => decided.filter((d) => d.outcome === o).length;
  const order = { applied: 0, unresolved: 1, proposal: 2, none: 3 } as const;
  return {
    mode,
    models: readings.models,
    versions: readings.versions,
    units_read: units.length,
    calls: readings.calls,
    decisions: { applied: count("applied"), proposal: count("proposal"), unresolved: count("unresolved") },
    ...(detail !== "summary" ? {
      readings: decided.sort((a, b) => order[a.outcome] - order[b.outcome] || a.tag.localeCompare(b.tag)).map((d) => ({
        tag: d.tag, family: d.family, question: d.question, outcome: d.outcome, value: d.value, rule: d.rule, why: d.why,
        readers: d.answers.map((a) => `${a.reader}${a.run ?? ""}:${a.answer}${a.note ? ` (${a.note})` : ""}`),
        cites: d.cites.slice(0, 4).map((c) => ({ sheet: c.sheet, packet: c.packet, text: c.text.slice(0, 200), bbox: c.box })),
      })),
    } : {}),
  };
}

/** Project settings, plus the starter's presets to build them from. */
export type AssembliesSettingsInput = ProjectSettings & { hookup_defaults?: boolean; responsibility_preset?: string };

export interface ApplyAssembliesOptions {
  library_path?: string;
  settings?: AssembliesSettingsInput;
  overrides?: Override[];
  families?: string[];
  detail?: "summary" | "units" | "lines";
  /** Build the CSV set (exportSet.ts) of the whole application. */
  csv?: boolean;
  /** One party's lines in the CSV set's lines.csv and lines_rollup.csv. */
  export_scope?: string;
  /** How the control drawings are read (default: models when an endpoint
   * is configured, else deterministic). */
  control_readings?: ControlReadingMode;
}

export interface ApplyAssembliesResult {
  library: { source: string; assemblies: number };
  report: Omit<AssembliesReport, "units"> & { units?: AssembliesReport["units"] };
  applications?: ApplicationRecord[];
  lines?: ExpandedLine[];
  /** The CSV set, file name → text, when asked for, and the whole
   * project's report it was built with (the PDF section's). */
  csv?: Record<ExportFile, string>;
  csvReport?: AssembliesReport;
  /** What the control drawings read, and decided (controlSummary). */
  control: ReturnType<typeof controlSummary>;
}

/** Apply a library to the Session's project and report it. `families`
 * narrows the reply, never the application: every unit is applied, so the
 * derived attributes (terminals served) see the whole project. */
export async function applyAssembliesToSession(session: Session, opts: ApplyAssembliesOptions = {}): Promise<ApplyAssembliesResult & { project: CompiledProject }> {
  const project = await sessionAssembliesProject(session);
  const { library, source } = await loadAssemblyLibrary(opts.library_path);
  const { hookup_defaults: hookupDefaults, responsibility_preset: responsibilityPreset, ...own } = opts.settings ?? {};
  let settings: ProjectSettings;
  try {
    settings = settingsWithPresets(own, { hookupDefaults, responsibilityPreset });
  } catch (e) {
    throw new UserError(e instanceof Error ? e.message : String(e));
  }
  const mode = opts.control_readings ?? defaultControlReadingMode();
  const readings = await sessionControlReadings(session, { project, library, settings, overrides: opts.overrides ?? [] }, mode);
  const { instances, applications, lines } = applyAssemblies({ project, library, settings, overrides: opts.overrides ?? [], readings });
  const want = opts.families?.length ? new Set(opts.families) : null;
  const inst = want ? instances.filter((i) => want.has(i.family)) : instances;
  const apps = want ? applications.filter((a) => want.has(a.instance.family)) : applications;
  const lns = want ? lines.filter((l) => want.has(l.family)) : lines;
  const report = assembliesReport(inst, apps, lns);
  const detail = opts.detail ?? "summary";
  const { units: _units, ...summary } = report;
  // The CSV set is the whole project's, whatever the reply's families.
  const whole = opts.csv ? (want ? assembliesReport(instances, applications, lines) : report) : undefined;
  let csv: Record<ExportFile, string> | undefined;
  try {
    csv = whole ? assembliesCsvSet({ instances, applications, lines, report: whole, scope: opts.export_scope ?? null }) : undefined;
  } catch (e) {
    throw new UserError(e instanceof Error ? e.message : String(e));
  }
  return {
    project,
    control: controlSummary(readings, mode, detail, want),
    library: { source, assemblies: library.length },
    report: detail === "summary" ? summary : report,
    ...(detail === "lines" ? { applications: apps, lines: lns } : {}),
    ...(csv ? { csv, csvReport: whole } : {}),
  };
}
