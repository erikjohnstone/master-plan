// CONTROL INTENT goal, Track A (goals/CONTROL_INTENT.md WP1; decisions C2–C4,
// C13) — the project questions an estimator answers once, and exactly what
// each answer decides.
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. An answer changes which typical a
// unit takes and its options; the Takeoff panel and the MCP tools apply the
// same effects, so they cannot disagree.
//
// The catalogue is closed and versioned: no question is ever written by a
// model, and a model never answers one (LAW CI4). An answer decides only what
// its entry declares (CI5):
//   PQ1 bas_in_scope       no            → every unit is outside the BAS scope
//   PQ2 owner_criteria     dod           → UFC 3-410-01 minimum points on
//                                           HVAC-service units (never plumbing)
//   PQ3 existing_units     keep          → units the schedule flags existing
//                                           keep their controls: out of scope
//   PQ4 unscheduled_speed  constant      → a fan or pump whose schedule has no
//                                           speed column at all is constant speed
//   PQ5 packaged_pumps     not_in_scope  → condensate, sump and plumbing-service
//                                           pumps are outside the BAS scope
// "unknown" (don't know) decides nothing: the units stay as they are (A3).
import type { Value } from "../assemblies/expr";
import type { AssemblyDefinition, Cite } from "../assemblies/schema";
import { familiesOf } from "../assemblies/schema";
import type { IntentFact, UnitIntent } from "./intent";

export const CATALOGUE_VERSION = "control_intent_catalogue_v1";

export type QuestionId = "PQ1" | "PQ2" | "PQ3" | "PQ4" | "PQ5";
export type ProjectAnswers = Partial<Record<QuestionId, string>>;

export interface CatalogueQuestion {
  id: QuestionId;
  /** The short name the record rules carry. */
  key: string;
  text: string;
  choices: ReadonlyArray<{ value: string; label: string }>;
  /** A partner may save this answer as their own default (disclosed on each
   * use); project facts never default (decision C4). */
  partner_default_allowed: boolean;
}

const UNKNOWN = { value: "unknown", label: "Don't know" } as const;

export const CATALOGUE: readonly CatalogueQuestion[] = [
  {
    id: "PQ1", key: "bas_in_scope", partner_default_allowed: false,
    text: "Does this project include a BAS/DDC scope for its HVAC equipment?",
    choices: [{ value: "yes", label: "Yes" }, { value: "no", label: "No — factory or standalone controls only" }, UNKNOWN],
  },
  {
    id: "PQ2", key: "owner_criteria", partner_default_allowed: false,
    text: "Which owner criteria govern the controls?",
    choices: [{ value: "dod", label: "DoD (UFC 3-410-01/02)" }, { value: "va", label: "VA" }, { value: "other", label: "Other" }, UNKNOWN],
  },
  {
    id: "PQ3", key: "existing_units", partner_default_allowed: false,
    text: "Units the schedules mark existing: what happens to their controls?",
    choices: [{ value: "keep", label: "They keep their controls" }, { value: "integrate", label: "Integrated (monitored) by the BAS" }, { value: "new_controls", label: "New controls" }, UNKNOWN],
  },
  {
    id: "PQ4", key: "unscheduled_speed", partner_default_allowed: true,
    text: "Fans and pumps whose schedule has no speed or VFD column: are they constant speed?",
    choices: [{ value: "constant", label: "Constant speed" }, UNKNOWN],
  },
  {
    id: "PQ5", key: "packaged_pumps", partner_default_allowed: true,
    text: "Condensate, sump and plumbing-service pumps: are they in the BAS scope?",
    choices: [{ value: "not_in_scope", label: "Not in the BAS scope" }, { value: "as_drawn", label: "As the drawings show" }, UNKNOWN],
  },
];

/** The answers as given, keeping only values the catalogue offers. */
export function sanitizeAnswers(raw: unknown): ProjectAnswers {
  const out: ProjectAnswers = {};
  if (!raw || typeof raw !== "object") return out;
  for (const q of CATALOGUE) {
    const v = (raw as Record<string, unknown>)[q.id];
    if (typeof v === "string" && q.choices.some((c) => c.value === v)) out[q.id] = v;
  }
  return out;
}

/** What the effects read of one unit: its row, its table and what the apply
 * path normalized and derived (apply.ts AppliedInstance plus its row). */
export interface AnswerUnit {
  index: number;
  tag: string;
  family: string;
  attributes: Record<string, { value: Value; cite?: Cite | null }>;
  unknown: Record<string, { reason: string }>;
  cells: Record<string, string>;
  table_title: string;
  table_headers: readonly string[];
  cite: Cite;
}

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Why a unit's row marks it existing, or null. Structure first: the table's
 * own title, the tag's printed "(E)" suffix, or a cell that says so as a whole
 * phrase (a remark "EXISTING", "EXISTING TO REMAIN", "SPECIFICATIONS SHOWN FOR
 * REFERENCE ONLY") — never "REPLACE EXISTING", which is a new unit. */
export function existingFlag(u: Pick<AnswerUnit, "tag" | "table_title" | "cells">): string | null {
  if (/\bEXISTING\b/i.test(u.table_title) && !/\bNEW\b/i.test(u.table_title)) return `the schedule is titled "${clean(u.table_title)}"`;
  if (/\(E\)\s*$/i.test(u.tag)) return `the tag "${u.tag}" is printed with (E)`;
  for (const [h, v] of Object.entries(u.cells)) {
    const t = clean(v).toUpperCase();
    if (/^\(?E\)?$|^EXISTING$|^EXISTING\s+(TO\s+REMAIN|UNIT)\b|\bEXISTING\s+TO\s+REMAIN\b|\bTO\s+REMAIN\b|SPECIFICATIONS\s+SHOWN\s+FOR\s+REFERENCE\s+ONLY/.test(t)
      && !/\b(REPLACE|REMOVE|DEMOLISH|RELOCATE)\b/.test(t)) return `its ${h} reads "${clean(v)}"`;
  }
  return null;
}

/** Plumbing or packaged service, from what the row prints: service, remarks
 * and table title. */
const PLUMBING_RE = /\b(CONDENSATE|SUMP|SEWAGE|SEWER|EJECTOR|DOMESTIC|DHW|PLUMBING|STORM|GREASE|ELEVATOR|IRRIGATION|BOOSTER|DW)\b|HOT\s+WATER\s+RECIRC(ULATION)?\s+\(?DOMESTIC|DOMESTIC\s+HOT\s+WATER/i;
const HVAC_SERVICE_RE = /\b(CHILLED|CHW|CHWS|CHWR|HEATING|HHW|HW|HWS|HOT\s+WATER|CONDENSER|CW|CDW|BOILER|CHILLER|COIL|GLYCOL|PRIMARY|SECONDARY|LOOP|HEAT\s+PUMP|GEOTHERMAL|TOWER)\b/i;

export function plumbingService(u: Pick<AnswerUnit, "attributes" | "cells" | "table_title">): string | null {
  const service = clean(u.attributes.service?.value);
  if (service && PLUMBING_RE.test(service)) return `its service reads "${service}"`;
  for (const [h, v] of Object.entries(u.cells)) {
    if (/REMARK|NOTE|SERVICE|SYSTEM|DESCRIPTION|TYPE|FLUID/i.test(h) && PLUMBING_RE.test(clean(v))) return `its ${h} reads "${clean(v)}"`;
  }
  if (PLUMBING_RE.test(u.table_title)) return `the schedule is titled "${clean(u.table_title)}"`;
  return null;
}

/** An HVAC service a pump is scheduled for: its service names a hydronic
 * system or a scheduled HVAC unit. Null when the row does not say. */
export function hvacService(u: Pick<AnswerUnit, "attributes" | "cells" | "table_title">, unitTags: ReadonlySet<string>): string | null {
  if (plumbingService(u)) return null;
  const service = clean(u.attributes.service?.value);
  if (service && HVAC_SERVICE_RE.test(service)) return `its service reads "${service}"`;
  if (service && unitTags.has(service.toUpperCase().replace(/\s+/g, ""))) return `it serves ${service}`;
  for (const [h, v] of Object.entries(u.cells)) {
    if (/SERVICE|SYSTEM/i.test(h) && HVAC_SERVICE_RE.test(clean(v))) return `its ${h} reads "${clean(v)}"`;
  }
  return null;
}

const SPEED_HEADER_RE = /SPEED|VFD|V\.F\.D|VARIABLE|VOLUME\s+CONTROL|\bECM\b|\bEC\s+MOTOR|INVERTER|DRIVE\s+TYPE/i;

/** True when the unit's schedule prints no column that could say its speed:
 * the normalizer read none, and no header of its table is about speed (a
 * speed column the normalizer did not read is not "no speed column", C13). */
export function noSpeedColumn(u: Pick<AnswerUnit, "attributes" | "unknown" | "table_headers" | "cells">): boolean {
  if (u.attributes.vfd !== undefined || u.attributes.ecm !== undefined) return false;
  if (!/no printed column/i.test(u.unknown.vfd?.reason ?? "")) return false;
  const headers = [...u.table_headers, ...Object.keys(u.cells)];
  return !headers.some((h) => SPEED_HEADER_RE.test(h));
}

/** The journal event an answer comes from (journal.ts), when the caller
 * replayed one. */
export type AnswerEventRefs = Readonly<Record<string, { event_id: string; origin: string }>>;

/** Who recorded an answer, for the basis of what it decides: an agent's
 * record is its relay of the estimator, never a human act (CI4). */
export function answerRecordedBy(ref: { event_id: string; origin: string } | undefined): string {
  if (!ref) return "";
  const who = ref.origin === "operator_input" ? "recorded by the estimator" : "recorded by an agent for the estimator (agent_proposal, not a human act)";
  return `; ${who}, event ${ref.event_id.slice(0, 12)}`;
}

/** The families the library has a controls typical for. */
function familiesWithTypicals(library: readonly AssemblyDefinition[]): Set<string> {
  const out = new Set<string>();
  for (const a of library) if (a.kind === "equipment" && (a.applies_to.layer ?? "controls") === "controls") for (const f of familiesOf(a)) out.add(f);
  return out;
}

/** The option ids the library's typicals for a family offer. */
function optionsForFamily(library: readonly AssemblyDefinition[], family: string): Set<string> {
  const out = new Set<string>();
  for (const a of library) {
    if (a.kind !== "equipment" || (a.applies_to.layer ?? "controls") !== "controls" || !familiesOf(a).includes(family)) continue;
    for (const o of a.options) out.add(o.id);
  }
  return out;
}

/** Each unit's facts from the project's answers (index → intent). `events`
 * names the journal event behind each answer, for the facts' basis. */
export function answerIntents(units: readonly AnswerUnit[], answers: ProjectAnswers, library: readonly AssemblyDefinition[], events?: AnswerEventRefs): Map<number, UnitIntent> {
  const fact = <V>(value: V, q: QuestionId, answer: string, basis: string): IntentFact<V> => ({
    value, source: "project", rule: `project_answer:${q}=${answer}`, basis: basis + answerRecordedBy(events?.[q]), cites: [],
  });
  const out = new Map<number, UnitIntent>();
  const withTypicals = familiesWithTypicals(library);
  const unitTags = new Set(units.map((u) => u.tag.toUpperCase().replace(/\s+/g, "")));
  const add = (i: number, f: (it: UnitIntent) => void) => {
    const it = out.get(i) ?? {};
    f(it);
    out.set(i, it);
  };
  for (const u of units) {
    if (!withTypicals.has(u.family)) continue;
    // PQ1: no BAS in the project.
    if (answers.PQ1 === "no") {
      add(u.index, (it) => { it.out_of_scope = fact(true as const, "PQ1", "no", "the project has no BAS/DDC scope (project answer)"); });
      continue;
    }
    // PQ3: existing units keep their controls.
    if (answers.PQ3 === "keep") {
      const why = existingFlag(u);
      if (why) {
        add(u.index, (it) => { it.out_of_scope = fact(true as const, "PQ3", "keep", `an existing unit keeps its controls (project answer): ${why}`); });
        continue;
      }
    }
    // PQ5: packaged or plumbing-service pumps are outside the BAS scope.
    if (answers.PQ5 === "not_in_scope" && u.family === "PUMP") {
      const why = plumbingService(u);
      if (why) {
        add(u.index, (it) => { it.out_of_scope = fact(true as const, "PQ5", "not_in_scope", `a packaged or plumbing-service pump is outside the BAS scope (project answer): ${why}`); });
        continue;
      }
    }
    // PQ4: no speed column → constant speed.
    if (answers.PQ4 === "constant" && (u.family === "FAN" || u.family === "PUMP") && noSpeedColumn(u)) {
      add(u.index, (it) => {
        it.attributes ??= {};
        it.attributes.vfd = fact<Value>("no", "PQ4", "constant", "its schedule has no speed or VFD column, and the project answer is constant speed");
      });
    }
    // PQ2: DoD criteria → UFC 3-410-01 minimum points on HVAC-service units.
    if (answers.PQ2 === "dod" && optionsForFamily(library, u.family).has("ufc_minimum_points")) {
      const why = u.family === "PUMP" ? hvacService(u, unitTags) : "an HVAC unit";
      if (why) {
        add(u.index, (it) => {
          it.options ??= {};
          it.options.ufc_minimum_points = fact(true, "PQ2", "dod", `DoD owner criteria (project answer): UFC 3-410-01 Table 3-1 minimum points; ${why}`);
        });
      }
    }
  }
  return out;
}
