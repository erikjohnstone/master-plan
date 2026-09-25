// CONTROL INTENT goal, WP1.3–1.4 — the project questions to ask: each with
// what its answers change and a pre-fill from quoted evidence (decisions C3,
// C4; LAWS CI4, CI5).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. The Takeoff panel's questions card
// and MCP's project_questions show the same questions, ranked the same way,
// with the same evidence; an answer goes through the same apply.
//
// Selection (C3) is exact, not estimated: each catalogue question is applied
// under every one of its choices, the project's other answers kept, and what
// differs from leaving it unanswered is counted: the lines, and the records
// (a unit's typical, status or options; an unresolved unit an answer takes
// out of scope changes no line, yet clears an exception). A question no
// choice changes anything with is never shown. The rest rank by the most a
// choice changes (ties keep catalogue order), at most six.
//
// Pre-fills (WP1.3) are deterministic finders over the printed text, each
// quoting what it read (sheet, text, box). A pre-fill is a proposal: only the
// estimator's answer applies anything (CI4). Their phrases, each with its
// sources, are in termlist/project-v1.json. Text inside a schedule table is
// never read for a project fact: a row's remark is about its unit.
import type { ApplicationRecord, AssemblyDefinition, ExpandedLine } from "../assemblies/schema";
import type { Box, NoteSpan } from "../assemblies/scheduleNotes";
import type { Override, ProjectSettings } from "../assemblies/select";
import { answerUnitsOf, applyAssemblies, instancesOf, normalizeProject, type CompiledProject } from "../assemblies/apply";
import { CATALOGUE, CATALOGUE_VERSION, existingFlag, noSpeedColumn, plumbingService, sanitizeAnswers, type ProjectAnswers, type QuestionId } from "./catalogue";
import type { Decision } from "./combine";
import { pageLines } from "./evidence";
import { namesTag } from "./readers/r0";
import { normText } from "./readers/text";
import PROJECT_TERMS from "./termlist/project-v1.json" with { type: "json" };

export const PROJECT_QUESTIONS_VERSION = "control_project_questions_v1";
/** How many questions a project is shown at most (C3). */
export const QUESTION_CAP = 6;

/** Printed text a question or its pre-fill rests on. */
export interface Evidence {
  sheet: string | null;
  text: string;
  box: Box | null;
  /** The finder or trigger that read it. */
  finder: string;
}

/** A proposed answer and what it quotes; never applied by itself (CI4). */
export interface PreFill {
  value: string;
  evidence: Evidence[];
}

export interface QuestionChoice {
  value: string;
  label: string;
  /** Lines that differ from leaving the question unanswered. */
  lines_changed: number;
  /** Units' records (typical, status, options) that differ. */
  records_changed: number;
}

export interface ProjectQuestion {
  id: QuestionId;
  key: string;
  text: string;
  choices: QuestionChoice[];
  /** The most lines one of its choices changes. */
  lines_changed: number;
  /** The most records one of its choices changes. */
  records_changed: number;
  /** The project's answer, when it has one. */
  answer: string | null;
  prefill: PreFill | null;
  /** What makes it a question here: the units it is about, and why. */
  evidence: Evidence[];
  partner_default_allowed: boolean;
}

export interface ProjectQuestions {
  version: typeof PROJECT_QUESTIONS_VERSION;
  catalogue: string;
  terms: string;
  shown: ProjectQuestion[];
  /** Questions no choice changes a line with (never shown). */
  zero_effect: QuestionId[];
  /** Questions past the cap. */
  over_cap: QuestionId[];
}

// ── the term list ───────────────────────────────────────────────────────────

interface Pattern { id: string; re: RegExp; sources: string[] }
type ProjectTerms = { version: string; byQuestion: Partial<Record<QuestionId, Record<string, Pattern[]>>> };

/** The project term list through its gate: every pattern compiles, matches
 * no empty string and names sources the list defines. */
export function compileProjectTerms(raw: unknown): ProjectTerms {
  const r = raw as { version?: unknown; sources?: Record<string, unknown> } & Record<string, unknown>;
  if (typeof r?.version !== "string") throw new Error("project terms: no version");
  const sources = new Set(Object.keys(r.sources ?? {}));
  const byQuestion: ProjectTerms["byQuestion"] = {};
  for (const q of CATALOGUE) {
    const block = r[q.id] as Record<string, Array<{ id: string; re: string; sources: string[] }>> | undefined;
    if (!block) continue;
    const out: Record<string, Pattern[]> = {};
    for (const [value, list] of Object.entries(block)) {
      if (!q.choices.some((c) => c.value === value)) throw new Error(`project terms: ${q.id} has no choice "${value}"`);
      out[value] = list.map((p) => {
        if (!p.sources?.length || p.sources.some((s) => !sources.has(s))) throw new Error(`project terms: ${q.id}.${value}.${p.id} names an unknown source`);
        const re = new RegExp(p.re);
        if (re.test("")) throw new Error(`project terms: ${q.id}.${value}.${p.id} matches nothing at all`);
        return { id: p.id, re, sources: p.sources };
      });
    }
    byQuestion[q.id] = out;
  }
  return { version: r.version, byQuestion };
}

export const PROJECT_TERMS_V1 = compileProjectTerms(PROJECT_TERMS);

// ── lines changed ───────────────────────────────────────────────────────────

/** A line's identity (unit, layer, the library line it expands) and what it
 * says; the same line twice keeps its order. */
function lineIndex(lines: readonly ExpandedLine[]): Map<string, string> {
  const out = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const l of lines) {
    const base = `${l.tag}|${l.layer}|${l.rule}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.set(`${base}#${n}`, JSON.stringify([l.qty_base, l.status, l.params, l.responsibility, l.missing, l.qty_source]));
  }
  return out;
}

const differing = (x: ReadonlyMap<string, string>, y: ReadonlyMap<string, string>) => {
  let n = 0;
  for (const [k, v] of x) if (y.get(k) !== v) n++;
  for (const k of y.keys()) if (!x.has(k)) n++;
  return n;
};

/** How many lines differ between two applications: added, removed or changed. */
export function linesChanged(a: readonly ExpandedLine[], b: readonly ExpandedLine[]): number {
  return differing(lineIndex(a), lineIndex(b));
}

/** A record's identity (unit, layer) and what it decides. */
function recordIndex(records: readonly ApplicationRecord[]): Map<string, string> {
  const out = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const r of records) {
    const base = `${r.instance.tag}|${r.layer}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.set(`${base}#${n}`, JSON.stringify([r.assembly, r.status, r.options, r.variables]));
  }
  return out;
}

/** How many units' records differ between two applications. */
export function recordsChanged(a: readonly ApplicationRecord[], b: readonly ApplicationRecord[]): number {
  return differing(recordIndex(a), recordIndex(b));
}

// ── evidence ────────────────────────────────────────────────────────────────

interface TextLine { sheet: string; text: string; norm: string; box: Box }

const inside = (b: Box, r: Box) => { const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3]; };

/** The project's printed lines outside its schedule tables: its schedule
 * pages and its control packets, each line once. */
function projectLines(project: CompiledProject): TextLine[] {
  const out: TextLine[] = [];
  const seen = new Set<string>();
  const tables = (project.tables ?? []).filter((t) => t.region);
  const add = (sheet: string, spans: readonly NoteSpan[]) => {
    for (const l of pageLines(spans)) {
      if (tables.some((t) => t.sheet === sheet && inside(l.dev, t.region!))) continue;
      const k = `${sheet}|${Math.round(l.dev[0])}|${Math.round(l.dev[1])}|${l.text}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ sheet, text: l.text, norm: normText(l.text), box: l.dev });
    }
  };
  for (const [sheet, spans] of Object.entries(project.pages ?? {})) add(sheet, spans);
  for (const p of project.control?.packets ?? []) add(p.sheet, p.spans);
  return out;
}

const cap = <T>(xs: readonly T[], n = 3) => xs.slice(0, n);

/** The first lines one of a question's value patterns reads. */
function finds(lines: readonly TextLine[], patterns: readonly Pattern[] | undefined): Evidence[] {
  const out: Evidence[] = [];
  for (const p of patterns ?? []) for (const l of lines) if (p.re.test(l.norm)) out.push({ sheet: l.sheet, text: l.text, box: l.box, finder: p.id });
  return out;
}

type Unit = ReturnType<typeof answerUnitsOf>[number];

/** A unit's row box, when its cite has one. */
const citeBox = (u: Unit): Box | null => { const b = u.cite?.bbox; return Array.isArray(b) && b.length === 4 ? [b[0], b[1], b[2], b[3]] : null; };

/** What makes each question a question here, per its trigger. */
function triggerEvidence(q: QuestionId, units: readonly Unit[]): Evidence[] {
  const at = (u: Unit, why: string, finder: string): Evidence => ({ sheet: u.cite?.sheet ?? null, text: `${u.tag}: ${why}`, box: citeBox(u), finder });
  if (q === "PQ3") return units.flatMap((u) => { const why = existingFlag(u); return why ? [at(u, why, "existing_flag")] : []; });
  if (q === "PQ4") return units.filter((u) => (u.family === "FAN" || u.family === "PUMP") && noSpeedColumn(u)).map((u) => at(u, `its schedule "${u.table_title}" prints no speed or VFD column`, "no_speed_column"));
  if (q === "PQ5") return units.flatMap((u) => { const why = u.family === "PUMP" ? plumbingService(u) : null; return why ? [at(u, why, "plumbing_service")] : []; });
  return [];
}

/** A question's pre-fill: a proposed value and the text it quotes, or null. */
function prefillFor(q: QuestionId, lines: readonly TextLine[], units: readonly Unit[], project: CompiledProject, terms: ProjectTerms): PreFill | null {
  const t = terms.byQuestion[q] ?? {};
  if (q === "PQ1") {
    const yes = finds(lines, t.yes);
    if (yes.length) return { value: "yes", evidence: cap(yes) };
    const no = finds(lines, t.no);
    return no.length ? { value: "no", evidence: cap(no) } : null;
  }
  if (q === "PQ2") {
    const dod = finds(lines, t.dod), va = finds(lines, t.va);
    if (dod.length && !va.length) return { value: "dod", evidence: cap(dod) };
    if (va.length && !dod.length) return { value: "va", evidence: cap(va) };
    return null;
  }
  if (q === "PQ3") {
    const keep = finds(lines, t.keep);
    return keep.length ? { value: "keep", evidence: cap(keep) } : null;
  }
  if (q === "PQ5") {
    const pumps = units.filter((u) => u.family === "PUMP" && plumbingService(u));
    if (!pumps.length) return null;
    // Its own row puts it on the BAS ("… AND BMS CONTROLS"): as drawn.
    const named = pumps.flatMap((u) => Object.entries(u.cells).filter(([, v]) => (t.as_drawn ?? []).some((p) => p.re.test(normText(v))))
      .map(([h, v]): Evidence => ({ sheet: u.cite?.sheet ?? null, text: `${u.tag} ${h}: ${String(v).trim()}`, box: citeBox(u), finder: "bas_named" })));
    if (named.length) return { value: "as_drawn", evidence: cap(named) };
    // No control drawing names any of them: not in the BAS scope.
    const packets = project.control?.packets ?? [];
    const onDrawings = pumps.filter((u) => packets.some((p) => p.spans.some((s) => namesTag(normText(s.str), u.tag))));
    if (!onDrawings.length && packets.length) return { value: "not_in_scope", evidence: [{ sheet: null, text: `no control drawing names ${pumps.map((u) => u.tag).join(", ")}`, box: null, finder: "not_on_control_drawings" }] };
    return null;
  }
  return null;
}

// ── selection ───────────────────────────────────────────────────────────────

/** The questions to show a project (see the header). */
export function projectQuestions(input: {
  project: CompiledProject;
  library: readonly AssemblyDefinition[];
  settings?: ProjectSettings;
  overrides?: readonly Override[];
  readings?: { units: ReadonlyArray<{ item: number; decisions: readonly Decision[] }> } | null;
}, opts: { cap?: number; terms?: ProjectTerms } = {}): ProjectQuestions {
  const terms = opts.terms ?? PROJECT_TERMS_V1;
  const normalized = normalizeProject(input.project);
  const answers = sanitizeAnswers(input.settings?.answers);
  const cache = new Map<string, { lines: ExpandedLine[]; applications: ApplicationRecord[] }>();
  const under = (a: ProjectAnswers) => {
    const k = JSON.stringify(Object.entries(a).sort());
    let r = cache.get(k);
    if (!r) {
      const applied = applyAssemblies({ project: input.project, library: input.library, settings: { ...(input.settings ?? {}), answers: a }, overrides: input.overrides, readings: input.readings, normalized });
      r = { lines: applied.lines, applications: applied.applications };
      cache.set(k, r);
    }
    return r;
  };
  const units = answerUnitsOf(input.project, instancesOf(input.project, normalized), normalized);
  const text = projectLines(input.project);
  const shown: ProjectQuestion[] = [];
  const zero: QuestionId[] = [];
  for (const q of CATALOGUE) {
    const without: ProjectAnswers = { ...answers };
    delete without[q.id];
    const base = under(without);
    const choices = q.choices.map((c) => {
      if (c.value === "unknown") return { value: c.value, label: c.label, lines_changed: 0, records_changed: 0 };
      const next = under({ ...without, [q.id]: c.value });
      return { value: c.value, label: c.label, lines_changed: linesChanged(base.lines, next.lines), records_changed: recordsChanged(base.applications, next.applications) };
    });
    const lines = Math.max(0, ...choices.map((c) => c.lines_changed));
    const records = Math.max(0, ...choices.map((c) => c.records_changed));
    if (!lines && !records) { zero.push(q.id); continue; }
    shown.push({
      id: q.id, key: q.key, text: q.text, choices, lines_changed: lines, records_changed: records, answer: answers[q.id] ?? null,
      prefill: prefillFor(q.id, text, units, input.project, terms),
      evidence: cap(triggerEvidence(q.id, units), 12),
      partner_default_allowed: q.partner_default_allowed,
    });
  }
  const order = new Map(CATALOGUE.map((q, i) => [q.id, i]));
  const weight = (q: ProjectQuestion) => Math.max(...q.choices.map((c) => c.lines_changed + c.records_changed));
  shown.sort((a, b) => weight(b) - weight(a) || order.get(a.id)! - order.get(b.id)!);
  const limit = opts.cap ?? QUESTION_CAP;
  return { version: PROJECT_QUESTIONS_VERSION, catalogue: CATALOGUE_VERSION, terms: terms.version, shown: shown.slice(0, limit), zero_effect: zero, over_cap: shown.slice(limit).map((q) => q.id) };
}
