// ASSEMBLIES goal, WP5.4 — the Takeoff panel's Assemblies view (surface-
// specific chrome only). Everything it shows is computed on the shared path:
// applyAssemblies (web/src/lib/assemblies/apply.ts), the report (report.ts),
// the project's pins and "update to latest" (projectState.ts) and the
// library gate and override diff (libraryEdit.ts). The MCP tool
// apply_assemblies returns the same records and lines for the same inputs.
//
// Units: exceptions first (each unresolved unit names what it waits for), a
// table per family, a row per unit with its cites, options and lines;
// overrides carry a reason. Project settings: the hook-up profile's switches
// and variables and the responsibility presets (presets.ts), saved with the
// project. Project questions (controlIntent/questions.ts): the few project
// facts whose answer changes this set, each answer an event in the project's
// journal (journal.ts, saved with the project; MCP's answer_project_question
// appends to the same journal). Library: the starter is read-only; clone a record to edit it, with
// live validation against the whole library and an amber tint on what it
// overrides.
import { useEffect, useMemo, useState } from "react";
import { applyAssemblies } from "../lib/assemblies/apply";
import { ignoredOverrideParts, unmatchedOverrides, unreadSettings } from "../lib/assemblies/expand";
import { PROJECT_INSTANCE, typicalChoices } from "../lib/assemblies/select";
import { assembliesCsvSet } from "../lib/assemblies/exportSet";
import { decodeCsvBytes, importLibraryCsv, libraryToCsv } from "../lib/assemblies/libraryCsv";
import { downloadText } from "../lib/totals";
import { cloneForEdit, combinedLibrary, overridesOf, validateEdit } from "../lib/assemblies/libraryEdit";
import { activeResponsibilityPresets, HOOKUP_SWITCHES, HOOKUP_VARIABLES, hookupProfileDefaults, RESPONSIBILITY_PRESETS, withResponsibilityPreset } from "../lib/assemblies/presets";
import { adoptUpdate, emptyAssembliesState, libraryUpdates, pinUsed, projectLibrary } from "../lib/assemblies/projectState";
import { assembliesReport, exceptionGroups, rowsLeftOutLabel, unitsLike, unreadScheduleLabel } from "../lib/assemblies/report";
import { PARTIES } from "../lib/assemblies/schema";
import { answerSettings, appendAnswer, replayAnswers } from "../lib/controlIntent/journal";
import { projectQuestionsPaced } from "../lib/controlIntent/questions";
import { downloadArchive } from "../lib/projectArchive";

const btn = {
  padding: "5px 10px", borderRadius: "var(--r-1)", border: "1px solid var(--ink-faint)",
  background: "var(--paper-bright)", color: "var(--ink)", font: "inherit", fontSize: "var(--fs-s)", cursor: "pointer",
};
const th = { textAlign: "left", padding: "6px 8px", fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-muted)", borderBottom: "1px solid var(--ink-faint)" };
const td = { padding: "6px 8px", borderBottom: "1px solid color-mix(in srgb, var(--ink-faint) 60%, transparent)", verticalAlign: "top", fontSize: "var(--fs-s)" };
const amber = "color-mix(in srgb, var(--c-warn, #d98a00) 18%, transparent)";
const mono = { fontFamily: "var(--f-mono)" };

const statusColor = (s) => (s === "unresolved" ? "var(--c-danger)" : s === "ok" || s === "overridden" ? "var(--ink)" : "var(--ink-muted)");
const NO_ANSWERS = Object.freeze({ events: [], head: null, answers: {}, answer_events: {}, recorded_by: {}, error: null });
const NO_SETTINGS = Object.freeze({});
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);

function citeRow(cite, tag) {
  return cite ? { sheet_id: cite.sheet, bbox_px: cite.bbox, tag, column: cite.header, value: tag } : null;
}

function askReason(what) {
  const reason = window.prompt(`Reason for ${what} (kept on the record):`);
  return reason && reason.trim() ? reason.trim() : null;
}

/** What the unit's control drawings read (controlIntent/record.ts): each
 * decision with its outcome, why, the readers behind it and the printed text
 * it cites. An applied reading can be rejected and a proposal accepted: both
 * are overrides with a reason, kept on the record. */
function ControlReadings({ unit, readings, onOverride, onOpenCitation }) {
  const shown = (readings || []).filter((d) => d.outcome !== "none");
  if (!shown.length) return null;
  const order = { applied: 0, unresolved: 1, proposal: 2 };
  const label = (d) => (d.question === "role" ? "BAS role" : d.question.slice(4));
  const value = (d) => (d.question === "role" ? (d.value === "out" ? `outside the BAS's command (${d.role || "not commanded"})` : d.value === "in" ? "commanded by the BAS" : "—") : d.value === null ? "—" : String(d.value));
  return (
    <div style={{ marginBottom: 10 }} data-assembly-control-readings={shown.length}>
      <div style={{ fontSize: "var(--fs-s)", fontWeight: 650, margin: "4px 0" }}>Control drawings</div>
      <table style={{ borderCollapse: "collapse" }} aria-label={`${unit.tag} control drawing readings`}>
        <thead><tr><th style={th}>Reading</th><th style={th}>Outcome</th><th style={th}>Why</th><th style={th}>Readers</th><th style={th}><span className="workspace-sr-only">Action</span></th></tr></thead>
        <tbody>
          {[...shown].sort((a, b) => order[a.outcome] - order[b.outcome]).map((d) => {
            const option = d.question.startsWith("opt.") ? d.question.slice(4) : null;
            const cite = d.cites?.[0];
            return (
              <tr key={d.question} style={d.outcome === "applied" ? { background: "color-mix(in srgb, var(--c-accent, #1f3fc7) 8%, transparent)" } : undefined} data-control-reading={d.question} data-control-outcome={d.outcome}>
                <td style={{ ...td, ...mono }}>{label(d)} = {value(d)}</td>
                <td style={{ ...td, color: d.outcome === "unresolved" ? "var(--c-danger)" : d.outcome === "applied" ? "var(--ink)" : "var(--ink-muted)" }}>{d.outcome}</td>
                <td style={td}>
                  {d.why} <span style={{ ...mono, fontSize: "var(--fs-xs)", color: "var(--ink-muted)" }}>{d.rule}</span>
                  {cite && (
                    <div>
                      {onOpenCitation
                        ? <button type="button" style={{ ...btn, padding: "1px 6px", marginTop: 2 }} onClick={() => onOpenCitation({ sheet_id: cite.sheet, bbox_px: cite.box, tag: unit.tag, column: "control drawing", value: cite.text })}>“{cite.text.slice(0, 80)}”</button>
                        : <span style={{ color: "var(--ink-secondary)" }}>“{cite.text.slice(0, 80)}”</span>}
                    </div>
                  )}
                </td>
                <td style={{ ...td, ...mono, fontSize: "var(--fs-xs)", color: "var(--ink-muted)" }}>{(d.answers || []).map((a) => `${a.reader}${a.run || ""}:${a.answer}${a.note ? "!" : ""}`).join(" ")}</td>
                <td style={td}>
                  {option && d.outcome === "applied" && typeof d.value === "boolean" && (
                    <button type="button" style={btn} onClick={() => onOverride({ options: { [option]: !d.value } }, `rejecting the drawing reading ${option} = ${d.value} on ${unit.tag}`)}>Reject</button>
                  )}
                  {option && d.outcome === "proposal" && typeof d.value === "boolean" && (
                    <button type="button" style={btn} onClick={() => onOverride({ options: { [option]: d.value } }, `accepting the drawing reading ${option} = ${d.value} on ${unit.tag}`)}>Accept</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Another typical for a unit (AS-55): the typicals of its family the rules
 * did not give it (lab-airflow, which only an estimator applies, among
 * them), or, for a family no typical lists, the layer's others. Choosing one
 * asks why and writes the override apply_assemblies takes; the second list
 * makes the same choice for every row of its schedule like it (report.ts
 * unitsLike), one reason and an override each.
 * @param {{ unit: { tag: string, family: string, layer: string, assembly: string | null }, choices: { family: Array<{ id: string, version: string, title: string }>, other: Array<{ id: string, version: string, title: string }> }, onOverride: (patch: object, what: string) => void, like?: { count: number, schedule: string | null, onOverride: (patch: object, what: string) => void } }} props */
export function TypicalChoiceView({ unit, choices, onOverride, like }) {
  const key = (a) => `${a.id}@${a.version}`;
  const byId = (a, b) => a.id.localeCompare(b.id);
  const family = choices.family.filter((a) => key(a) !== unit.assembly).sort(byId);
  const other = choices.family.length ? [] : choices.other.filter((a) => key(a) !== unit.assembly).sort(byId);
  if (!family.length && !other.length) return null;
  const pickOf = (value) => [...family, ...other].find((a) => key(a) === value);
  const option = (a) => <option key={key(a)} value={key(a)}>{key(a)}: {a.title}</option>;
  const groups = [
    family.length > 0 && <optgroup key="family" label={`${unit.family} typicals`}>{family.map(option)}</optgroup>,
    other.length > 0 && <optgroup key="other" label={`No typical lists ${unit.family}; other families' (their lines may wait for values its row does not print)`}>{other.map(option)}</optgroup>,
  ];
  const all = like && like.count > 1 ? like : null;
  const schedule = all ? all.schedule ?? "an untitled schedule" : "";
  const them = all ? `the ${all.count} ${unit.family} units of ${schedule} ${unit.assembly ? `with ${unit.assembly}` : "without a typical"}` : "";
  return (
    <>
      <select value="" onChange={(e) => { const p = pickOf(e.target.value); if (p) onOverride({ assembly: { id: p.id, version: p.version } }, `choosing ${p.id} for ${unit.tag}`); }}
        style={input} data-assemblies-choose-typical={unit.tag} aria-label={`Use another typical for ${unit.tag} (${unit.family}, ${unit.layer})`}>
        <option value="">Use another typical…</option>
        {groups}
      </select>
      {all && (
        <select value="" onChange={(e) => { const p = pickOf(e.target.value); if (p) all.onOverride({ assembly: { id: p.id, version: p.version } }, `choosing ${p.id} for ${them}`); }}
          style={input} data-assemblies-choose-typical-all={all.count} aria-label={`Use another typical for all ${them}`}>
          <option value="">…for all {all.count} like it</option>
          {groups}
        </select>
      )}
    </>
  );
}

function UnitDetail({ unit, lines, onOverride, readings, onOpenCitation, choices, like }) {
  const derived = Object.entries(unit.derived || {});
  // The project's own records (building meters, a plant's controls) follow
  // the project settings: an override would change nothing (AS-45).
  const own = unit.tag !== PROJECT_INSTANCE.tag;
  return (
    <div style={{ padding: "8px 12px 14px 28px", background: "var(--paper)" }} data-assembly-unit-detail={unit.tag} role="region" aria-label={`${unit.tag} ${unit.family} ${unit.layer} details`}>
      {unit.reason && <div style={{ fontSize: "var(--fs-s)", color: "var(--ink-secondary)", marginBottom: 6 }}>Rule: <span style={mono}>{unit.reason}</span></div>}
      {unit.printed_points && (
        <div style={{ marginBottom: 8, fontSize: "var(--fs-s)" }}>
          Printed points list ({unit.printed_points.rows} rows: {unit.printed_points.lists.join("; ")}) stands instead of the typical's point lines (D6).
        </div>
      )}
      {derived.length > 0 && (
        <div style={{ marginBottom: 8, fontSize: "var(--fs-s)" }}>
          {derived.map(([k, d]) => <div key={k}>Derived <strong>{k}</strong> = {String(d.value)} <span style={{ color: "var(--ink-muted)" }}>({d.rule}: {d.basis})</span></div>)}
        </div>
      )}
      <ControlReadings unit={unit} readings={readings} onOverride={onOverride} onOpenCitation={onOpenCitation} />
      {Object.keys(unit.options || {}).length > 0 && (
        <table style={{ borderCollapse: "collapse", marginBottom: 10 }} aria-label={`${unit.tag} options`}>
          <thead><tr><th style={th}>Option</th><th style={th}>Value</th><th style={th}>Source</th><th style={th}><span className="workspace-sr-only">Override</span></th></tr></thead>
          <tbody>
            {Object.entries(unit.options).map(([id, o]) => (
              <tr key={id} style={o.source === "user" ? { background: amber } : undefined}>
                <td style={{ ...td, ...mono }}>{id}</td>
                <td style={td}>{o.value === null ? <span style={{ color: "var(--c-danger)" }}>unresolved{o.missing?.length ? ` (waits for ${o.missing.join(", ")})` : ""}</span> : String(o.value)}</td>
                <td style={{ ...td, color: "var(--ink-muted)" }}>{o.source ?? "—"}</td>
                <td style={td}>
                  {own && (
                    <button type="button" style={btn} onClick={() => onOverride({ options: { [id]: !(o.value === true) } }, `setting ${id} to ${!(o.value === true)} on ${unit.tag}`)}>
                      Set {String(!(o.value === true))}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%" }} aria-label={`${unit.tag} lines`}>
        <thead><tr><th style={th}>Line</th><th style={th}>Kind</th><th style={th}>I/O</th><th style={th}>Qty</th><th style={th}>Status</th><th style={th}>Rule</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.rule}-${i}`}>
              <td style={td}>{l.label || l.role?.id}</td>
              <td style={{ ...td, color: "var(--ink-muted)" }}>{l.kind}</td>
              <td style={{ ...td, ...mono }}>{l.io || ""}</td>
              <td style={{ ...td, ...mono }}>{l.qty_with_waste ?? "—"} {l.qty_with_waste != null ? l.unit : ""}</td>
              <td style={{ ...td, color: statusColor(l.status) }}>{l.status}{l.missing?.length ? ` (${l.missing.join(", ")})` : ""}</td>
              <td style={{ ...td, ...mono, fontSize: "var(--fs-xs)", color: "var(--ink-muted)" }}>{l.rule}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {own && unit.status !== "excluded" && choices && <TypicalChoiceView unit={unit} choices={choices} onOverride={onOverride} like={like} />}
        {own
          ? <button type="button" style={btn} onClick={() => onOverride({ exclude: true }, `excluding ${unit.tag}`)}>Exclude unit…</button>
          : <span style={{ fontSize: "var(--fs-s)", color: "var(--ink-secondary)" }}>A project record: what it waits for is set under Project settings (the project variables), not by an override.</span>}
      </div>
    </div>
  );
}

/** The lines whose quantity cannot stand, beside the exceptions (AS-53):
 * each rests on a misread value or a failing expression, and no total
 * counts it.
 * @param {{ lineErrors: import("../lib/assemblies/report").LineError[], onOpenCitation?: (cite: unknown) => void }} props */
export function LineErrorsView({ lineErrors, onOpenCitation }) {
  if (!lineErrors.length) return null;
  return (
    <section data-assemblies-line-errors={lineErrors.length} style={{ marginBottom: 16 }} aria-label="Lines that cannot be counted">
      <h3 style={{ margin: "4px 0 6px", fontSize: "var(--fs-m)", color: "var(--c-danger)" }}>{lineErrors.length} line{lineErrors.length === 1 ? "" : "s"} cannot be counted</h3>
      <div style={{ fontSize: "var(--fs-s)", color: "var(--ink-secondary)", marginBottom: 6 }}>Each rests on a value the schedule reading got wrong, or a library expression that fails, and no total counts it. Check the unit's schedule row.</div>
      <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%" }} aria-label="Lines that cannot be counted">
        <thead><tr><th style={th}>Unit</th><th style={th}>Family</th><th style={th}>Layer</th><th style={th}>Line</th><th style={th}>Why</th></tr></thead>
        <tbody>
          {lineErrors.map((l, i) => (
            <tr key={`${l.tag}-${l.rule}-${i}`}>
              <td style={td}><button type="button" style={{ ...btn, border: "none", padding: 0, textDecoration: "underline", background: "transparent" }} onClick={() => onOpenCitation?.(citeRow(l.cites[0], l.tag))}>{l.tag}</button></td>
              <td style={td}>{l.family}</td>
              <td style={td}>{l.layer}</td>
              <td style={{ ...td, ...mono, fontSize: "var(--fs-xs)" }}>{l.rule}</td>
              <td style={{ ...td, color: "var(--c-danger)" }}>{l.why}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  );
}

/** The schedule sheets whose tables are pictures (AS-54): no table could be
 * read from them, so any unit they schedule is missing here, however
 * complete the totals look.
 * @param {{ schedules: NonNullable<import("../lib/assemblies/report").AssembliesReport["schedules_unread"]> }} props */
export function UnreadSchedulesView({ schedules }) {
  if (!schedules.length) return null;
  const one = schedules.length === 1;
  return (
    <div role="note" data-assemblies-schedules-unread={schedules.length} style={{ margin: "0 0 12px", fontSize: "var(--fs-s)", color: "var(--c-danger)" }}>
      {one ? "A schedule sheet is" : `${schedules.length} schedule sheets are`} pictures (pasted images or a scan): no table could be read from {one ? "it" : "them"}, so any unit {one ? "it schedules" : "they schedule"} is missing here: {schedules.map((u) => `${unreadScheduleLabel(u)}, ${Math.round(u.picture_share * 100)}% pictures`).join("; ")}.
    </div>
  );
}

/** The rows of family schedules the takeoff reads as no unit (AS-61): their
 * marks are not the family's to it, so no record or line counts them, however
 * complete the totals look. Every mark is named.
 * @param {{ schedules: NonNullable<import("../lib/assemblies/report").AssembliesReport["schedules_left_out"]> }} props */
export function RowsLeftOutView({ schedules }) {
  if (!schedules.length) return null;
  const rows = schedules.reduce((n, e) => n + e.marks.length, 0);
  return (
    <div role="note" data-assemblies-rows-left-out={schedules.length} data-assemblies-rows-left-out-rows={rows} style={{ margin: "0 0 12px", fontSize: "var(--fs-s)", color: "var(--c-danger)" }}>
      {rows === 1 ? "A scheduled row is" : `${rows} scheduled rows are`} no unit here: the takeoff does not read {rows === 1 ? "its mark" : "their marks"} as marks of the family {schedules.length === 1 ? "the schedule's" : "their schedule's"} title names, so no record or line counts {rows === 1 ? "it" : "them"}.
      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {schedules.map((e) => (
          <li key={`${e.sheet}|${e.title}|${e.marks[0]}`} data-assemblies-rows-left-out-schedule={e.marks.length}>
            {rowsLeftOutLabel(e)} ({e.families.join(" or ")}), {e.marks.length} of {e.rows} rows: {e.marks.join(", ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What changed in the drawing set since the schedules were read (AS-58):
 * the files added, removed, or revised (the same name at a new revision), or
 * a file replaced that the canvas counts by its epoch alone. null while it is
 * the set they were read from, and before any read.
 * @param {{ epoch: number, files: Array<{ name: string, rev?: number | null }> } | null | undefined} read
 * @param {{ epoch: number, files: Array<{ name: string, rev?: number | null }> } | null | undefined} now */
export function drawingSetChange(read, now) {
  if (!read || !now) return null;
  const was = new Map(read.files.map((f) => [f.name, f.rev ?? null]));
  const is = new Map(now.files.map((f) => [f.name, f.rev ?? null]));
  const added = [...is.keys()].filter((n) => !was.has(n));
  const removed = [...was.keys()].filter((n) => !is.has(n));
  const revised = [...is.keys()].filter((n) => was.has(n) && was.get(n) !== is.get(n));
  const replaced = !added.length && !removed.length && !revised.length && read.epoch !== now.epoch;
  return added.length || removed.length || revised.length || replaced ? { added, removed, revised, replaced } : null;
}

/** The units and lines on screen are an earlier drawing set's: say what
 * changed, and offer to read the schedules again (AS-58). */
export function StaleProjectView({ change, onReload, loading = false }) {
  if (!change) return null;
  const what = [
    change.added.length ? `added ${change.added.join(", ")}` : null,
    change.removed.length ? `removed ${change.removed.join(", ")}` : null,
    change.revised.length ? `revised ${change.revised.join(", ")}` : null,
    change.replaced ? "a file was replaced" : null,
  ].filter(Boolean).join("; ");
  return (
    <div role="alert" data-assemblies-stale={change.added.length + change.removed.length + change.revised.length + (change.replaced ? 1 : 0)}
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "4px 0 12px", padding: "8px 10px", border: "1px solid var(--c-danger)", borderRadius: "var(--r-1)", fontSize: "var(--fs-s)" }}>
      <span style={{ flex: "1 1 320px" }}>
        <strong style={{ color: "var(--c-danger)" }}>The drawing set changed since these schedules were read</strong> ({what}). The units, lines and exports below are still the earlier set's.
      </span>
      {onReload && <button type="button" style={btn} onClick={() => onReload()} disabled={loading} data-assemblies-stale-reread>{loading ? "Reading…" : "Re-read schedules"}</button>}
    </div>
  );
}

// The note a group action writes on each of its overrides (overrideMany).
const DECIDED_TOGETHER = /\(one of \d+ .+, decided together\)$/;

/** Your overrides as rows (AS-59): the overrides one group action wrote
 * (one reason, "…decided together", the same layer and exclusion or typical)
 * are one row; any other override is its own. In the order of each row's
 * first override.
 * @param {ReadonlyArray<{ reason?: string, family?: string, layer?: string, exclude?: boolean, assembly?: { id: string } }>} overrides
 * @returns {Array<{ indices: number[], together: boolean }>} */
export function overrideRows(overrides) {
  const rows = [];
  const at = new Map();
  overrides.forEach((o, i) => {
    const together = DECIDED_TOGETHER.test(String(o.reason ?? ""));
    const key = together ? JSON.stringify([o.reason, o.layer ?? null, Boolean(o.exclude), o.assembly?.id ?? null]) : null;
    if (key !== null && at.has(key)) { rows[at.get(key)].indices.push(i); return; }
    if (key !== null) at.set(key, rows.length);
    rows.push({ indices: [i], together });
  });
  return rows.map((r) => ({ ...r, together: r.together && r.indices.length > 1 }));
}

const overrideWhat = (o) => (o.exclude ? ["excluded"] : [o.assembly ? `typical ${o.assembly.id}` : "", ...[o.options, o.variables].flatMap((set) => Object.entries(set ?? {}).map(([k, v]) => `${k}=${v}`))].filter(Boolean));

/** "Your overrides": each override with Remove, and the overrides a group
 * action wrote as one row, with Remove all N, over the list of its units
 * (AS-59). What applies to nothing, or in part not at all, is marked on the
 * unit's own line (AS-45, AS-49).
 * @param {{ overrides: ReadonlyArray<any>, sharedTags: Set<string>, unmatched: Map<any, string>, ignored: Map<any, string>, onRemove: (indices: number[]) => void }} props */
export function OverridesView({ overrides, sharedTags, unmatched, ignored, onRemove }) {
  const line = (o, i) => (
    <div key={i} style={{ fontSize: "var(--fs-s)", marginBottom: 4 }}>
      <span style={mono}>{o.tag}</span>{sharedTags.has(o.tag) ? ` ${o.family ?? "(every unit with the tag)"}` : ""}{o.layer ? ` (${o.layer})` : ""}: {overrideWhat(o).join(", ")}
      <span style={{ color: "var(--ink-muted)" }}> — {o.reason}</span>
      {unmatched.has(o) && <span style={{ color: "var(--c-danger)" }} data-assemblies-override-unmatched> · applies to nothing: {unmatched.get(o)}</span>}
      {ignored.has(o) && <span style={{ color: "var(--c-danger)" }} data-assemblies-override-ignored> · not applied: {ignored.get(o)}</span>}
      <button type="button" style={{ ...btn, marginLeft: 8, padding: "1px 6px" }} onClick={() => onRemove([i])}>Remove</button>
    </div>
  );
  return (
    <section style={{ marginTop: 16 }} data-assemblies-overrides={overrides.length} aria-label="Your overrides">
      <h3 style={{ margin: "4px 0 6px", fontSize: "var(--fs-m)" }}>Your overrides</h3>
      {overrideRows(overrides).map((row) => {
        if (!row.together) return line(overrides[row.indices[0]], row.indices[0]);
        const members = row.indices.map((i) => overrides[i]);
        const first = members[0];
        const families = [...new Set(members.map((o) => o.family ?? "every unit with the tag"))].join(", ");
        const what = members.map(overrideWhat).reduce((a, b) => a.filter((x) => b.includes(x)));
        const tags = members.map((o) => o.tag);
        const marked = members.filter((o) => unmatched.has(o) || ignored.has(o)).length;
        return (
          <div key={`group-${row.indices[0]}`} data-assemblies-override-group={members.length} style={{ fontSize: "var(--fs-s)", marginBottom: 6 }}>
            <strong>{members.length} units decided together</strong> ({families}{first.layer ? `, ${first.layer}` : ""}): {what.join(", ") || "their own options"}
            <span style={{ color: "var(--ink-muted)" }}> — {first.reason}</span>
            {marked > 0 && <span style={{ color: "var(--c-danger)" }}> · {marked} marked below</span>}
            <button type="button" style={{ ...btn, marginLeft: 8, padding: "1px 6px" }} data-assemblies-override-group-remove={members.length}
              aria-label={`Remove the ${members.length} overrides decided together: ${tags.slice(0, 6).join(", ")}${tags.length > 6 ? ", …" : ""}`}
              onClick={() => onRemove(row.indices)}>Remove all {members.length}</button>
            <details open={marked > 0} style={{ margin: "4px 0 0 12px" }}>
              <summary style={{ cursor: "pointer", color: "var(--ink-muted)" }}>{tags.slice(0, 6).join(", ")}{tags.length > 6 ? `, … (${tags.length})` : ""}</summary>
              {row.indices.map((i) => line(overrides[i], i))}
            </details>
          </div>
        );
      })}
    </section>
  );
}

/** A typed setting: blank is unset; true/yes, false/no, a number, or text. */
function parseSetting(text) {
  const t = String(text ?? "").trim();
  if (!t) return undefined;
  if (/^(true|yes)$/i.test(t)) return true;
  if (/^(false|no)$/i.test(t)) return false;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}

const fieldset = { border: "1px solid var(--ink-faint)", borderRadius: "var(--r-1)", padding: "8px 10px", margin: 0, minWidth: 0 };
const legend = { fontSize: "var(--fs-s)", fontWeight: 650, padding: "0 4px" };
const input = { padding: "4px 6px", border: "1px solid var(--ink-faint)", borderRadius: "var(--r-1)", font: "inherit", fontSize: "var(--fs-s)", background: "var(--paper-bright)", color: "var(--ink)" };

/** The project's settings the library reads: the hook-up profile's switches
 * and variables, and who does what (a responsibility preset, or the edits it
 * leaves). Each change is saved with the project and re-applies at once.
 * @param {{ settings: import("../lib/assemblies/select").ProjectSettings, onChange: (next: import("../lib/assemblies/select").ProjectSettings) => void, unread?: Array<{ key: string, why: string }> }} props */
export function ProjectSettingsView({ settings, onChange, unread = [] }) {
  const profile = settings.profile ?? {};
  const variables = settings.variables ?? {};
  const active = activeResponsibilityPresets(settings);
  const setSwitch = (id, v) => onChange({ ...settings, profile: { ...profile, [id]: v } });
  const setVariable = (id, v) => {
    const next = { ...variables };
    if (v === undefined) delete next[id];
    else next[id] = v;
    onChange({ ...settings, variables: next });
  };
  const fillDefaults = () => {
    const d = hookupProfileDefaults();
    onChange({ ...settings, profile: { ...d.profile, ...profile }, variables: { ...d.variables, ...variables } });
  };
  const clearResponsibility = () => {
    const next = { ...settings };
    delete next.responsibility;
    onChange(next);
  };
  const clearHookup = () => {
    const next = { ...settings };
    delete next.profile;
    delete next.variables;
    onChange(next);
  };
  const setCount = Object.keys(profile).length + Object.keys(variables).length;
  return (
    <details data-assemblies-settings style={{ marginBottom: 14 }}>
      <summary style={{ cursor: "pointer", fontSize: "var(--fs-m)", fontWeight: 650 }}>
        Project settings
        <span style={{ fontWeight: 400, fontSize: "var(--fs-s)", color: "var(--ink-muted)" }}>
          {" "}· {setCount} of {HOOKUP_SWITCHES.length + HOOKUP_VARIABLES.length} hook-up settings set · responsibility: {active.length ? active.join(", ") : settings.responsibility ? "edited" : "the typicals' matrix"}
        </span>
      </summary>
      {unread.length > 0 && (
        <div style={{ fontSize: "var(--fs-s)", color: "var(--c-danger)", padding: "6px 2px 0" }} data-assemblies-settings-unread={unread.length}>
          The project's library reads none of these: {unread.map((u) => `${u.key} (${u.why})`).join("; ")}.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, padding: "8px 2px" }}>
        <fieldset style={fieldset}>
          <legend style={legend}>Hook-up profile</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            <button type="button" style={btn} onClick={fillDefaults} data-assemblies-profile-defaults>Fill unset from the starter's defaults</button>
            {setCount > 0 && <button type="button" style={btn} onClick={clearHookup} data-assemblies-profile-clear>Clear hook-up settings</button>}
          </div>
          {HOOKUP_SWITCHES.map((sw) => (
            <label key={sw.id} title={sw.sources.join("\n")} style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: "var(--fs-s)", marginBottom: 3 }}>
              <input type="checkbox" checked={profile[sw.id] === true} onChange={(e) => setSwitch(sw.id, e.target.checked)} data-assemblies-switch={sw.id} />
              <span>{sw.label}{profile[sw.id] === undefined && <span style={{ color: "var(--ink-muted)" }}> (unset: its lines wait)</span>}</span>
            </label>
          ))}
        </fieldset>
        <fieldset style={fieldset}>
          <legend style={legend}>Project variables</legend>
          {HOOKUP_VARIABLES.map((v) => (
            <label key={v.id} title={v.sources.join("\n")} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 110px", gap: 6, alignItems: "center", fontSize: "var(--fs-s)", marginBottom: 4 }}>
              <span>{v.label}{v.unit ? ` (${v.unit})` : ""}</span>
              {v.values ? (
                <select value={variables[v.id] ?? ""} onChange={(e) => setVariable(v.id, e.target.value || undefined)} style={input} data-assemblies-variable={v.id}>
                  <option value="">unset</option>
                  {v.values.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              ) : (
                <input key={`${v.id}:${String(variables[v.id] ?? "")}`} defaultValue={variables[v.id] ?? ""} style={input} data-assemblies-variable={v.id}
                  placeholder={v.default === null || v.default === undefined ? "unset" : `starter: ${v.default}`}
                  onBlur={(e) => { const next = parseSetting(e.target.value); if (next !== variables[v.id]) setVariable(v.id, next); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              )}
            </label>
          ))}
        </fieldset>
        <fieldset style={fieldset}>
          <legend style={legend}>Who does what</legend>
          <select value="" style={{ ...input, width: "100%" }} aria-label="Apply a responsibility preset" data-assemblies-preset
            onChange={(e) => { if (e.target.value) onChange(withResponsibilityPreset(settings, e.target.value)); }}>
            <option value="">Apply a responsibility preset…</option>
            {RESPONSIBILITY_PRESETS.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}</option>)}
          </select>
          <div style={{ fontSize: "var(--fs-s)", color: "var(--ink-secondary)", margin: "6px 0" }} data-assemblies-presets-active={active.join(" ")}>
            {active.length ? `Holds: ${active.map((id) => RESPONSIBILITY_PRESETS.find((pr) => pr.id === id)?.label ?? id).join("; ")}` : "No preset: each line keeps its typical's matrix."}
          </div>
          {settings.responsibility && (
            <>
              <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: "var(--fs-s)" }}>
                {Object.entries(settings.responsibility).map(([role, cells]) => (
                  <li key={role}><span style={mono}>{role}</span>: {Object.entries(cells).map(([a, party]) => `${a} ${party}`).join(", ")}</li>
                ))}
              </ul>
              <button type="button" style={btn} onClick={clearResponsibility}>Clear responsibility edits</button>
            </>
          )}
        </fieldset>
      </div>
    </details>
  );
}

/** The project questions (controlIntent/questions.ts): only those whose
 * answer changes something on this set, each with what every choice changes.
 * A pre-fill is printed text proposing an answer, quoted: it applies nothing
 * until the estimator chooses (CI4). Each answer is an event in the project's
 * append-only journal (journal.ts), the same journal MCP's
 * answer_project_question appends to. */
function ProjectQuestionsView({ questions, journal, busy, error, onAnswer, onOpenCitation }) {
  if (!questions && !busy) return null;
  const open = questions ? questions.shown.filter((q) => !q.answer).length : 0;
  const labelOf = (q, v) => q.choices.find((c) => c.value === v)?.label ?? v;
  const cite = (e) => (e.sheet && e.box ? { sheet_id: e.sheet, bbox_px: e.box, tag: e.text.slice(0, 40), value: e.text } : null);
  return (
    <section data-assemblies-questions={questions?.shown.length ?? 0} data-assemblies-questions-open={open} style={{ marginBottom: 16 }} aria-label="Project questions">
      <h3 style={{ margin: "4px 0 6px", fontSize: "var(--fs-m)" }}>
        Project questions{questions ? ` · ${open ? `${open} to answer` : "all answered"}` : ""}
        <span style={{ fontWeight: 400, fontSize: "var(--fs-s)", color: "var(--ink-muted)" }}>
          {busy ? " · working out which questions change this set…" : questions?.zero_effect.length ? ` · ${questions.zero_effect.length} more change nothing here` : ""}
        </span>
      </h3>
      {error && <div role="alert" style={{ color: "var(--c-danger)", fontSize: "var(--fs-s)", marginBottom: 6 }}>The project's answers don't check out ({error}); none of them applies.</div>}
      {(questions?.shown ?? []).map((q) => (
        <fieldset key={q.id} style={{ ...fieldset, marginBottom: 8 }} data-assemblies-question={q.id} data-answer={q.answer ?? ""}>
          <legend style={legend}>{q.text}</legend>
          <div style={{ fontSize: "var(--fs-s)", color: "var(--ink-muted)", marginBottom: 4 }}>
            An answer changes up to {q.lines_changed} line{q.lines_changed === 1 ? "" : "s"} and {q.records_changed} record{q.records_changed === 1 ? "" : "s"}.
            {q.answer ? ` Answered: ${labelOf(q, q.answer)} (${journal.recorded_by[q.id] === "operator_input" ? "by you" : "recorded by an agent for you"}).` : ""}
          </div>
          {q.prefill && !q.answer && (
            <div style={{ fontSize: "var(--fs-s)", background: amber, padding: "4px 6px", marginBottom: 6 }} data-assemblies-prefill={q.prefill.value}>
              The drawings suggest <strong>{labelOf(q, q.prefill.value)}</strong> — a proposal until you choose it:
              <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>
                {q.prefill.evidence.map((e, i) => (
                  <li key={i}>
                    {cite(e)
                      ? <button type="button" style={{ ...btn, border: "none", padding: 0, background: "transparent", textDecoration: "underline", textAlign: "left" }} onClick={() => onOpenCitation?.(cite(e))}>“{e.text}”</button>
                      : <span>{e.text}</span>}
                    {e.sheet ? <span style={{ color: "var(--ink-muted)", ...mono }}> {e.sheet}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {q.evidence.length > 0 && (
            <details style={{ fontSize: "var(--fs-s)", marginBottom: 6 }}>
              <summary style={{ cursor: "pointer", color: "var(--ink-secondary)" }}>Why it's asked: {q.evidence.length} unit{q.evidence.length === 1 ? "" : "s"}</summary>
              <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>{q.evidence.map((e, i) => <li key={i}>{e.text}</li>)}</ul>
            </details>
          )}
          <div role="group" aria-label={`Answer: ${q.text}`} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {q.choices.map((c) => (
              <button key={c.value} type="button" aria-pressed={q.answer === c.value || (!q.answer && c.value === "unknown")} data-assemblies-choice={c.value}
                style={{ ...btn, ...(q.answer === c.value ? { background: "var(--ink)", color: "var(--paper-bright)" } : {}) }}
                onClick={() => onAnswer(q, c.value)}>
                {c.label}{c.value !== "unknown" ? <span style={{ opacity: 0.7, ...mono }}> · {c.lines_changed} lines, {c.records_changed} records</span> : null}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </section>
  );
}

function LibraryView({ starter, partner, onSavePartner, library, rejected, updates, onAdopt }) {
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState(null);
  const [imported, setImported] = useState(null);
  const latestById = useMemo(() => {
    const m = new Map();
    for (const a of library) {
      const b = m.get(a.id);
      if (!b || a.version.localeCompare(b.version, undefined, { numeric: true }) > 0) m.set(a.id, a);
    }
    return [...m.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [library]);
  const shown = latestById.filter((a) => !filter || `${a.id} ${a.title} ${[].concat(a.applies_to.family).join(" ")}`.toLowerCase().includes(filter.toLowerCase()));
  const def = selected ? library.find((a) => `${a.id}@${a.version}` === selected) : null;
  const check = draft != null ? validateEdit(draft, library) : null;
  const tint = def && def.status !== "starter" ? overridesOf(def, starter) : null;
  const save = () => {
    if (!check?.def) return;
    const next = [...partner.filter((a) => !(a.id === check.def.id && a.version === check.def.version)), check.def];
    onSavePartner(next);
    setSelected(`${check.def.id}@${check.def.version}`);
    setDraft(null);
  };
  // The library as CSV, one row per item (libraryCsv.ts): export all of it;
  // import through the same gate as a profile, the starter kept read-only.
  // Read from its bytes: a spreadsheet's plain CSV is Windows-1252 (AS-60).
  const importCsv = async (file) => {
    if (!file) return;
    const { text, encoding } = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
    const r = importLibraryCsv(text, starter, partner);
    if (r.added.length || r.replaced.length) onSavePartner(r.partner);
    setImported({ file: file.name, encoding, ...r });
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 340px) minmax(0, 1fr)", gap: 16, padding: "12px 8px" }} data-assemblies-library role="region" aria-label="Assembly library">
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button type="button" style={btn} onClick={() => downloadText("assemblies-library.csv", `\uFEFF${libraryToCsv(library)}`, "text/csv")} data-assemblies-library-export>Export CSV</button>
          <label style={{ ...btn, display: "inline-block" }}>
            Import CSV…
            <input type="file" accept=".csv,text/csv" style={{ display: "none" }} aria-label="Import a library CSV" data-assemblies-library-import
              onChange={(e) => { importCsv(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
        {imported && (
          <div role="status" style={{ fontSize: "var(--fs-s)", marginBottom: 8 }} data-assemblies-import={imported.errors.length ? "errors" : "ok"}>
            {imported.file}: {imported.added.length} added, {imported.replaced.length} replaced, {imported.unchanged.length} unchanged
            {imported.encoding === "windows-1252" && <span data-assemblies-import-encoding="windows-1252"> (read as Windows-1252, a spreadsheet's plain CSV: save as CSV UTF-8 to keep characters it lacks)</span>}
            {imported.errors.length > 0 && (
              <ul style={{ color: "var(--c-danger)", margin: "4px 0 0", paddingLeft: 18 }}>
                {imported.errors.slice(0, 12).map((e, i) => <li key={i}>{e.row ? `Row ${e.row}` : e.record}{e.column ? `, ${e.column}` : ""}: {e.message}</li>)}
                {imported.errors.length > 12 && <li>…and {imported.errors.length - 12} more</li>}
              </ul>
            )}
          </div>
        )}
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter id, title, family…" aria-label="Filter the library"
          style={{ width: "100%", padding: "7px 9px", border: "1px solid var(--ink-faint)", borderRadius: "var(--r-1)", font: "inherit", marginBottom: 8 }} />
        {rejected.length > 0 && <div style={{ color: "var(--c-danger)", fontSize: "var(--fs-s)", marginBottom: 8 }}>{rejected.length} record(s) refused by the library gate: {rejected.slice(0, 3).map((r) => `${r.id}: ${r.errors[0]}`).join("; ")}</div>}
        <div style={{ maxHeight: "62vh", overflow: "auto" }}>
          {shown.map((a) => (
            <button key={`${a.id}@${a.version}`} type="button" aria-pressed={selected === `${a.id}@${a.version}`} onClick={() => { setSelected(`${a.id}@${a.version}`); setDraft(null); }}
              style={{ ...btn, display: "block", width: "100%", textAlign: "left", marginBottom: 4, background: selected === `${a.id}@${a.version}` ? "var(--paper)" : "var(--paper-bright)" }}
              data-assembly-id={a.id}>
              <span style={mono}>{a.id}@{a.version}</span>
              <span style={{ marginLeft: 6, fontSize: "var(--fs-xs)", color: a.status === "starter" ? "var(--ink-muted)" : "var(--cobalt)" }}>{a.status === "starter" ? "starter" : "partner"}</span>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-secondary)" }}>{a.title}</div>
            </button>
          ))}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        {updates.length > 0 && (
          <div style={{ border: "1px solid var(--ink-faint)", borderRadius: "var(--r-1)", padding: 10, marginBottom: 12 }} data-assemblies-updates={updates.length}>
            <strong>Update to latest</strong>
            <div style={{ fontSize: "var(--fs-s)", color: "var(--ink-secondary)", margin: "4px 0 8px" }}>This project keeps the versions it pinned. Nothing changes until you adopt an update.</div>
            {updates.map((u) => (
              <div key={u.id} style={{ marginBottom: 8 }}>
                <span style={mono}>{u.id}</span> {u.from} → {u.to}
                <span style={{ color: "var(--ink-muted)", fontSize: "var(--fs-s)" }}>
                  {" "}· {u.options.length} option change(s), {u.lines.length} line change(s){u.fields.length ? ` · fields: ${u.fields.join(", ")}` : ""}
                </span>
                <div style={{ fontSize: "var(--fs-xs)", ...mono, color: "var(--ink-secondary)" }}>
                  {[...u.options.map((c) => `option ${c.id} ${c.change}${c.fields ? ` (${c.fields.join(", ")})` : ""}`), ...u.lines.map((c) => `line ${c.id} ${c.change}${c.fields ? ` (${c.fields.join(", ")})` : ""}`)].slice(0, 12).join(" · ")}
                </div>
                <button type="button" style={{ ...btn, marginTop: 4 }} onClick={() => onAdopt(u.id)}>Adopt {u.id}@{u.to}</button>
              </div>
            ))}
          </div>
        )}
        {!def ? <div style={{ color: "var(--ink-muted)", padding: 20 }}>Select an assembly to see its options and lines. Starter records are read-only; clone one to make your own version.</div> : (
          <div data-assembly-detail={def.id}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <strong style={{ fontSize: "var(--fs-l)" }}>{def.title}</strong>
              <span style={mono}>{def.id}@{def.version}</span>
              <span style={{ color: "var(--ink-muted)" }}>{def.kind} · layer {def.applies_to.layer ?? "controls"} · {[].concat(def.applies_to.family).join(", ")}</span>
            </div>
            {def.applies_to.selector && <div style={{ ...mono, fontSize: "var(--fs-s)", margin: "6px 0" }}>selector: {def.applies_to.selector} (rank {def.applies_to.rank})</div>}
            <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
              {def.status === "starter"
                ? <button type="button" style={btn} onClick={() => setDraft(JSON.stringify(cloneForEdit(def, library), null, 2))}>Clone to edit</button>
                : <button type="button" style={btn} onClick={() => setDraft(JSON.stringify(def, null, 2))}>Edit</button>}
              {def.status !== "starter" && <button type="button" style={btn} onClick={() => { onSavePartner(partner.filter((a) => !(a.id === def.id && a.version === def.version))); setSelected(null); }}>Delete my version</button>}
            </div>
            {tint && (tint.fields.length + tint.options.length + tint.lines.length > 0) && (
              <div style={{ background: amber, padding: 8, borderRadius: "var(--r-1)", fontSize: "var(--fs-s)", marginBottom: 8 }} data-assembly-overrides>
                Overrides {tint.origin}: {[...tint.fields.map((f) => `field ${f}`), ...tint.options.map((c) => `option ${c.id} ${c.change}`), ...tint.lines.map((c) => `line ${c.id} ${c.change}`)].join(" · ")}
              </div>
            )}
            {draft != null ? (
              <div>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label="Assembly definition (JSON)"
                  style={{ width: "100%", minHeight: "44vh", ...mono, fontSize: "var(--fs-xs)", border: `1px solid ${check?.errors.length ? "var(--c-danger)" : "var(--ink-faint)"}`, borderRadius: "var(--r-1)", padding: 8 }} />
                {check?.errors.length ? <ul style={{ color: "var(--c-danger)", fontSize: "var(--fs-s)" }} data-assembly-edit-errors={check.errors.length}>{check.errors.slice(0, 12).map((e) => <li key={e}>{e}</li>)}</ul>
                  : <div style={{ color: "var(--ink-secondary)", fontSize: "var(--fs-s)", margin: "6px 0" }}>Valid against the library.</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" style={btn} disabled={!check?.def} onClick={save}>Save to my library</button>
                  <button type="button" style={btn} onClick={() => setDraft(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <table style={{ borderCollapse: "collapse", marginBottom: 10 }} aria-label={`${def.id} options`}>
                  <thead><tr><th style={th}>Option</th><th style={th}>Default</th><th style={th}>Auto</th><th style={th}>Label</th></tr></thead>
                  <tbody>{def.options.map((o) => <tr key={o.id} style={tint?.options.some((c) => c.id === o.id) ? { background: amber } : undefined}><td style={{ ...td, ...mono }}>{o.id}</td><td style={td}>{o.default === undefined ? "—" : String(o.default)}</td><td style={{ ...td, ...mono }}>{o.auto || ""}</td><td style={td}>{o.label}</td></tr>)}</tbody>
                </table>
                <div style={{ fontSize: "var(--fs-s)", color: "var(--ink-secondary)" }}>
                  {def.lines.length} lines: {Object.entries(def.lines.reduce((m, l) => ({ ...m, [l.kind]: (m[l.kind] || 0) + 1 }), {})).map(([k, n]) => `${n} ${k}`).join(", ")}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssembliesPanel({ project, projectStatus = {}, onLoadProject, projectSource = null, drawingSet = null, starter = [], partner = [], onSavePartner, state, onStateChange, onOpenCitation, projectName = "", onReport }) {
  const [view, setView] = useState("units");
  const [family, setFamily] = useState("");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(null);
  const [exportErr, setExportErr] = useState("");
  const [scope, setScope] = useState("");
  const { library, rejected } = useMemo(() => combinedLibrary(starter, partner), [starter, partner]);
  // The set's control drawings as read with the project (production-graph-cli
  // --mode assemblies_project; controlIntent/record.ts): their applied
  // decisions become facts on the same shared path MCP applies.
  const readings = project?.control_readings ?? null;
  // The project's answers: its journal replayed and its chain checked
  // (journal.ts). Only a journal that checks out applies.
  const journalEvents = state?.answer_journal ?? null;
  const [journal, setJournal] = useState(NO_ANSWERS);
  useEffect(() => {
    if (!journalEvents?.length) { setJournal(NO_ANSWERS); return undefined; }
    let live = true;
    replayAnswers(journalEvents).then((r) => {
      const s = answerSettings(r.events);
      if (live) setJournal({ events: r.events, head: r.head, ...s, recorded_by: Object.fromEntries(Object.entries(s.answer_events).map(([q, e]) => [q, e.origin])), error: null });
    }).catch((e) => { if (live) setJournal({ ...NO_ANSWERS, error: e?.message || String(e) }); });
    return () => { live = false; };
  }, [journalEvents]);
  const ownSettings = state?.settings ?? NO_SETTINGS;
  const settings = useMemo(() => (journal.events.length ? { ...ownSettings, answers: journal.answers, answer_events: journal.answer_events } : ownSettings), [ownSettings, journal]);
  const applied = useMemo(() => (project ? applyAssemblies({
    project, library: projectLibrary(state, library), settings, overrides: state?.overrides ?? [], readings,
  }) : null), [project, library, state, readings, settings]);
  // Which questions change this set: every choice applied against none
  // (questions.ts). It re-applies the library per choice, so it runs after
  // the panel has painted, one apply per task, and a change stops the count
  // it makes stale.
  const [questions, setQuestions] = useState({ value: null, busy: false });
  useEffect(() => {
    if (!project) { setQuestions({ value: null, busy: false }); return undefined; }
    let live = true;
    setQuestions((q) => ({ ...q, busy: true }));
    projectQuestionsPaced({ project, library: projectLibrary(state, library), settings, overrides: state?.overrides ?? [], readings },
      { pause: () => new Promise((resolve) => setTimeout(resolve, 0)), cancelled: () => !live })
      .then((value) => { if (live && value) setQuestions({ value, busy: false }); })
      .catch((e) => { if (live) setQuestions({ value: null, busy: false, error: e?.message || String(e) }); });
    return () => { live = false; };
  }, [project, library, state, readings, settings]);
  const answer = async (q, value) => {
    const proposal = q.prefill && q.prefill.value === value ? ` (the drawings' proposal: ${q.prefill.evidence.map((e) => `"${e.text}"`).join("; ")})` : "";
    const reason = window.prompt(`Why "${q.choices.find((c) => c.value === value)?.label ?? value}"? (kept with the answer)`, `Answered in the Takeoff panel${proposal}`);
    if (!reason || !reason.trim()) return;
    try {
      const base = state ?? emptyAssembliesState();
      const next = await appendAnswer(base.answer_journal ?? [], {
        operation_id: crypto.randomUUID(), expected_head: journal.head, reviewer: "estimator (Takeoff panel)", reason: reason.trim(),
        question: q.id, answer: value, prefill: q.prefill ? { value: q.prefill.value, evidence: q.prefill.evidence } : null,
      }, { origin: "operator_input" });
      onStateChange?.({ ...base, answer_journal: next.events });
    } catch (e) {
      window.alert(`That answer wasn't recorded: ${e?.message || e}`);
    }
  };
  const readingsOf = (u) => (readings?.units || []).filter((r) => r.tag === u.tag && r.family === u.family).flatMap((r) => r.decisions);
  const readingCounts = useMemo(() => {
    const ds = (readings?.units || []).flatMap((u) => u.decisions);
    return { applied: ds.filter((d) => d.outcome === "applied").length, proposal: ds.filter((d) => d.outcome === "proposal").length, unresolved: ds.filter((d) => d.outcome === "unresolved").length };
  }, [readings]);
  // The schedule sheets whose tables are pictures ride the report, as they
  // do apply_assemblies' (AS-54).
  const report = useMemo(() => (applied ? assembliesReport(applied.instances, applied.applications, applied.lines, project?.unread_schedules, applied.rows_left_out) : null), [applied, project]);
  const updates = useMemo(() => (state ? libraryUpdates(state, library) : []), [state, library]);
  // The Takeoff panel's PDF carries this report's section.
  useEffect(() => { onReport?.(report); }, [report]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pin what the records used (A5): the project keeps these versions until an
  // update is adopted.
  useEffect(() => {
    if (!applied) return;
    const base = state ?? emptyAssembliesState();
    const next = pinUsed(base, applied.applications, projectLibrary(state, library));
    const key = (s) => (s?.pinned ?? []).map((a) => `${a.id}@${a.version}`).join(",");
    if (key(next) !== key(state)) onStateChange?.(next);
  }, [applied]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tags units of two families share (16_NV's "B1" furnace and condensing
  // unit): an override names its unit's family, so it is that unit's alone
  // (AS-43). An override that names no family, from before, covers every
  // unit with the tag; a unit's own override replaces it only where no other
  // family shares the tag.
  const sharedTags = useMemo(() => {
    const families = new Map();
    for (const i of applied?.instances ?? []) (families.get(i.tag) ?? families.set(i.tag, new Set()).get(i.tag)).add(i.family);
    return new Set([...families].filter(([, f]) => f.size > 1).map(([t]) => t));
  }, [applied]);
  const sameSlot = (o, unit, layer) => o.tag === unit.tag && (o.layer ?? null) === layer;
  const replaces = (o, unit, layer) => sameSlot(o, unit, layer) && (o.family === unit.family || (!o.family && !sharedTags.has(unit.tag)));
  const priorOf = (unit) => (state?.overrides ?? []).find((o) => sameSlot(o, unit, unit.layer) && o.family === unit.family)
    ?? (state?.overrides ?? []).find((o) => sameSlot(o, unit, unit.layer) && !o.family);
  // Overrides no unit takes, each with why (AS-45): a unit a later read no
  // longer finds, or the project's own records, which follow the settings.
  const unmatched = useMemo(() => new Map(applied && state
    ? unmatchedOverrides(applied.instances, projectLibrary(state, library), state.overrides).map(({ override, why }) => [override, why])
    : []), [applied, state, library]);
  // What an override sets that no record takes, with why (AS-49): an option
  // its unit's typical has not (a typical updated or chosen without it), any
  // while the unit has no typical, or all of one another override decides.
  // The settings the project's library reads none of, with why (AS-50): a
  // project file's from another library, say.
  const unreadSettingsList = useMemo(() => (state ? unreadSettings(projectLibrary(state, library), state.settings ?? {}) : []), [state, library]);
  const ignored = useMemo(() => new Map(applied && state
    ? ignoredOverrideParts(applied.applications, projectLibrary(state, library), state.overrides).map(({ override, why }) => [override, why])
    : []), [applied, state, library]);
  const openSettings = () => {
    const el = document.querySelector("[data-assemblies-settings]");
    if (el) { el.open = true; el.scrollIntoView({ block: "start", behavior: "smooth" }); }
  };
  // A group's schedule and what it waits for, in its header, its buttons'
  // names and each override's note: a table may print no title, and tied
  // typicals wait for nothing but a choice.
  const scheduleOf = (group) => group.schedule ?? "an untitled schedule";
  // A choice of typical for every row of a unit's schedule like it (AS-55),
  // made as the exceptions' groups are: one reason, an override each.
  const likeOf = (unit) => {
    const units = report ? unitsLike(report.units, unit) : [];
    const schedule = unit.cites?.[0]?.table_title || null;
    return { count: units.length, schedule, onOverride: overrideMany({ units, family: unit.family, schedule }) };
  };
  const waitingFor = (group) => (group.waits_for.length ? group.waits_for.join(", ") : "a choice between typicals");
  const override = (unit) => (patch, what) => {
    const reason = askReason(what);
    if (!reason) return;
    const base = state ?? emptyAssembliesState();
    const others = base.overrides.filter((o) => !replaces(o, unit, patch.exclude ? null : unit.layer));
    const prior = priorOf(unit);
    const entry = patch.exclude ? { tag: unit.tag, family: unit.family, reason, exclude: true }
      : { tag: unit.tag, family: unit.family, layer: unit.layer, reason, ...(prior?.assembly ? { assembly: prior.assembly } : {}), options: { ...(prior?.options ?? {}), ...(patch.options ?? {}) }, ...(patch.assembly ? { assembly: patch.assembly } : {}) };
    onStateChange?.({ ...base, overrides: [...others, entry] });
  };
  // One schedule's rows that wait for the same things (report.ts
  // exceptionGroups): one choice and one reason, an override on each unit.
  const overrideMany = (group) => (patch, what) => {
    const reason = askReason(what);
    if (!reason) return;
    const base = state ?? emptyAssembliesState();
    const note = `${reason} (one of ${group.units.length} ${group.family} units of ${scheduleOf(group)}, decided together)`;
    // Each unit as override() keys it: its tag and layer, or its tag alone
    // when it is excluded.
    const layerOf = (u) => (patch.exclude ? null : u.layer);
    const units = [...new Map(group.units.map((u) => [JSON.stringify([u.tag, u.family, layerOf(u)]), u])).values()];
    const others = base.overrides.filter((o) => !units.some((u) => replaces(o, u, layerOf(u))));
    const entries = units.map((u) => {
      if (patch.exclude) return { tag: u.tag, family: u.family, reason: note, exclude: true };
      const prior = priorOf(u);
      return { tag: u.tag, family: u.family, layer: u.layer, reason: note, ...(prior?.assembly ? { assembly: prior.assembly } : {}), options: { ...(prior?.options ?? {}), ...(patch.options ?? {}) }, ...(patch.assembly ? { assembly: patch.assembly } : {}) };
    });
    onStateChange?.({ ...base, overrides: [...others, ...entries] });
  };
  const setSettings = (next) => onStateChange?.({ ...(state ?? emptyAssembliesState()), settings: next });
  const removeOverrides = (indices) => {
    const base = state ?? emptyAssembliesState();
    const gone = new Set(indices);
    onStateChange?.({ ...base, overrides: base.overrides.filter((_, j) => !gone.has(j)) });
  };
  // The CSV set is the shared builder's bytes (exportSet.ts, the same files
  // apply_assemblies writes with export_dir); only the zip is this surface's.
  const downloadCsvSet = async () => {
    setExportErr("");
    try {
      const files = assembliesCsvSet({ ...applied, report, scope: scope || null });
      // Loaded on demand, as the takeoff PDF and the other archives load them.
      const [{ strToU8, zipSync }, { assembliesPdfBytes }] = await Promise.all([import("fflate"), import("../lib/assemblies/reportPdf")]);
      const pdf = await assembliesPdfBytes(report, { projectName });
      const zip = zipSync({ ...Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), "assemblies.pdf": pdf }, { level: 6 });
      const base = String(projectName || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
      downloadArchive(`assemblies-${base}${scope ? `-${scope}` : ""}.zip`, zip);
    } catch (e) {
      setExportErr(`Couldn't build the CSV set: ${e?.message || e}`);
    }
  };
  // Exceptions in their order, each group's header before its first row and
  // its rows together.
  const exceptionRows = useMemo(() => {
    if (!report) return [];
    const groups = exceptionGroups(report.exceptions);
    const groupOf = new Map(groups.flatMap((g) => g.units.map((u) => [u, g])));
    const rows = [];
    const shown = new Set();
    report.exceptions.forEach((e, i) => {
      const g = groupOf.get(e);
      if (!g) { rows.push({ e, i }); return; }
      if (shown.has(g)) return;
      shown.add(g);
      rows.push({ group: g, i });
      for (const u of g.units) rows.push({ e: u, i: report.exceptions.indexOf(u) });
    });
    return rows;
  }, [report]);
  const linesOf = (u) => applied.lines.filter((l) => l.tag === u.tag && l.layer === u.layer && l.family === u.family && JSON.stringify(l.cites[0]) === JSON.stringify(u.cites[0]));
  const units = report ? report.units.filter((u) => (!family || u.family === family) && (!filter || `${u.tag} ${u.family} ${u.assembly ?? ""}`.toLowerCase().includes(filter.toLowerCase()))) : [];

  return (
    <div data-assemblies-panel style={{ padding: "8px 8px 24px" }} role="region" aria-label="Assemblies">
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0" }}>
        <button type="button" style={{ ...btn, background: view === "units" ? "var(--ink)" : "var(--paper-bright)", color: view === "units" ? "var(--paper-bright)" : "var(--ink)" }} aria-pressed={view === "units"} onClick={() => setView("units")}>Units</button>
        <button type="button" style={{ ...btn, background: view === "library" ? "var(--ink)" : "var(--paper-bright)", color: view === "library" ? "var(--paper-bright)" : "var(--ink)" }} aria-pressed={view === "library"} onClick={() => setView("library")}>
          Library{updates.length ? ` · ${updates.length} update${updates.length === 1 ? "" : "s"}` : ""}
        </button>
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-s)", color: "var(--ink-muted)" }} data-assemblies-count={library.length} data-assemblies-pinned={state?.pinned?.length ?? 0}>
          {library.length} assemblies ({partner.length} yours) · {state?.pinned?.length ?? 0} pinned in this project
          {readings ? <span data-control-readings-applied={readingCounts.applied}> · control drawings read ({readings.models?.r1 ? "models" : "printed phrases"}): {readingCounts.applied} applied, {readingCounts.proposal} proposed, {readingCounts.unresolved} unresolved</span> : null}
        </span>
      </div>
      {view === "library" ? (
        <LibraryView starter={starter} partner={partner} onSavePartner={onSavePartner} library={library} rejected={rejected} updates={updates}
          onAdopt={(id) => state && onStateChange?.(adoptUpdate(state, id, library))} />
      ) : !project ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-muted)" }}>
          <div style={{ marginBottom: 12 }}>Apply the assembly library to this set's scheduled HVAC equipment: each unit's controls typical and hook-up, with every line citing its schedule row.</div>
          {projectStatus.error && <div style={{ color: "var(--c-danger)", marginBottom: 12 }}>{projectStatus.error}</div>}
          <button type="button" style={btn} disabled={!!projectStatus.loading || !onLoadProject} onClick={() => onLoadProject?.()} data-assemblies-load>
            {projectStatus.loading ? "Reading schedules…" : "Apply assemblies"}
          </button>
        </div>
      ) : (
        <>
          <StaleProjectView change={drawingSetChange(projectSource, drawingSet)} onReload={onLoadProject} loading={!!projectStatus.loading} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", ...mono, fontSize: "var(--fs-s)", color: "var(--ink-muted)", margin: "4px 0 12px" }} data-assemblies-totals
            data-units={report.totals.units} data-unresolved={report.totals.by_status.unresolved} data-lines={report.totals.lines}>
            <span><strong style={{ color: "var(--ink)" }}>{report.totals.units}</strong> units</span>
            <span><strong style={{ color: "var(--ink)" }}>{report.totals.by_status.ok + report.totals.by_status.overridden}</strong> records decided</span>
            <span style={{ color: report.totals.by_status.unresolved ? "var(--c-danger)" : undefined }}><strong>{report.totals.by_status.unresolved}</strong> unresolved</span>
            <span><strong style={{ color: "var(--ink)" }}>{report.totals.by_status.no_assembly}</strong> without a typical</span>
            <span><strong style={{ color: "var(--ink)" }}>{report.totals.lines}</strong> lines ({report.totals.lines_by_status.ok} ok, {report.totals.lines_by_status.unresolved} unresolved, {report.totals.lines_by_status.replaced} replaced by drawing evidence{report.totals.lines_by_status.error > 0 && <span style={{ color: "var(--c-danger)" }}>, {report.totals.lines_by_status.error} that cannot be counted</span>})</span>
            {report.partner && (
              <span data-assemblies-partner title="Partner-entered: your library's own figures, extended by each line's quantity. OpenTakeoff ships no prices, rates or hours.">
                partner-entered: {report.partner.extended_cost ?? "no"} extended cost{report.partner.hours.length ? ` · ${report.partner.hours.map((h) => `${h.extended_hours} h ${h.labor_category || "(no category)"}`).join(", ")}` : ""}
              </span>
            )}
            {exportErr && <span role="alert" style={{ color: "var(--c-danger)", marginLeft: "auto" }}>{exportErr}</span>}
            <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope of lines.csv and the roll-up" data-assemblies-scope
              style={{ ...input, marginLeft: exportErr ? 0 : "auto" }}>
              <option value="">Scope: all parties</option>
              {PARTIES.map((party) => <option key={party} value={party}>Scope: {party.replace("_", " ")} lines</option>)}
            </select>
            <button type="button" style={btn} onClick={downloadCsvSet} data-assemblies-export>Download CSV set</button>
            <button type="button" style={btn} onClick={() => onLoadProject?.()} disabled={!!projectStatus.loading}>{projectStatus.loading ? "Reading…" : "Re-read schedules"}</button>
          </div>

          <UnreadSchedulesView schedules={report.schedules_unread ?? []} />
          <RowsLeftOutView schedules={report.schedules_left_out ?? []} />

          <ProjectSettingsView settings={state?.settings ?? {}} onChange={setSettings} unread={unreadSettingsList} />

          <ProjectQuestionsView questions={questions.value} busy={questions.busy} error={journal.error || questions.error} journal={journal} onAnswer={answer} onOpenCitation={onOpenCitation} />

          {report.exceptions.length > 0 && (
            <section data-assemblies-exceptions={report.exceptions.length} style={{ marginBottom: 16 }} aria-label="Exceptions">
              <h3 style={{ margin: "4px 0 6px", fontSize: "var(--fs-m)" }}>Exceptions first: {report.exceptions.length} record{report.exceptions.length === 1 ? "" : "s"} wait for something</h3>
              <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%" }} aria-label="Records that wait for something">
                <thead><tr><th style={th}>Unit</th><th style={th}>Family</th><th style={th}>Layer</th><th style={th}>Waits for</th><th style={th}>Candidates</th><th style={th}>Resolve</th></tr></thead>
                <tbody>
                  {exceptionRows.map(({ group, e, i }) => group ? (
                    <tr key={`group-${i}`} data-assemblies-group={group.units.length} style={{ background: "color-mix(in srgb, var(--ink-faint) 22%, transparent)" }}>
                      <td style={td} colSpan={5}>
                        <strong>{group.units.length} {group.family} units</strong> of {scheduleOf(group)} {group.waits_for.length
                          ? <>wait for <span style={mono}>{group.waits_for.join(", ")}</span></>
                          : `tie between ${group.candidates.length} typicals`}
                        {group.assembly && <> under <span style={mono}>{group.assembly}</span>, which decides <span style={mono}>{group.options.join(", ")}</span></>}
                      </td>
                      <td style={td}>
                        {group.options.flatMap((opt) => [true, false].map((value) => (
                          <button key={`${opt}-${value}`} type="button" style={{ ...btn, marginRight: 4 }} data-assemblies-group-option={opt} data-assemblies-group-value={String(value)}
                            aria-label={`${opt} ${value ? "yes" : "no"} for all ${group.units.length} ${group.family} units of ${scheduleOf(group)} under ${group.assembly}`}
                            onClick={() => overrideMany(group)({ options: { [opt]: value } }, `setting ${opt} to ${value ? "yes" : "no"} for the ${group.units.length} ${group.family} units of ${scheduleOf(group)}`)}>{opt}: {value ? "yes" : "no"} for all {group.units.length}</button>
                        )))}
                        {group.candidates.map((c) => {
                          const [id, version] = c.split("@");
                          const label = `Use ${id} for all ${group.units.length} ${group.family} units of ${scheduleOf(group)} waiting for ${waitingFor(group)}`;
                          return <button key={c} type="button" style={{ ...btn, marginRight: 4 }} data-assemblies-group-use={c} aria-label={label} onClick={() => overrideMany(group)({ assembly: { id, version } }, `choosing ${c} for the ${group.units.length} ${group.family} units of ${scheduleOf(group)}`)}>Use {id} for all {group.units.length}</button>;
                        })}
                        <button type="button" style={btn} data-assemblies-group-exclude aria-label={`Exclude all ${group.units.length} ${group.family} units of ${scheduleOf(group)} waiting for ${waitingFor(group)}`}
                          onClick={() => overrideMany(group)({ exclude: true }, `excluding the ${group.units.length} ${group.family} units of ${scheduleOf(group)}`)}>Exclude all {group.units.length}…</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={`${e.tag}-${e.layer}-${i}`}>
                      <td style={td}><button type="button" style={{ ...btn, border: "none", padding: 0, textDecoration: "underline", background: "transparent" }} onClick={() => onOpenCitation?.(citeRow(e.cites[0], e.tag))}>{e.tag}</button></td>
                      <td style={td}>{e.family}{e.compiled_family !== e.family ? ` (from ${e.compiled_family})` : ""}</td>
                      <td style={td}>{e.layer}</td>
                      <td style={{ ...td, ...mono }}>{e.waits_for.join(", ") || "—"}</td>
                      <td style={{ ...td, ...mono }}>{e.candidates.join(", ") || e.assembly || "—"}</td>
                      <td style={td}>
                        {e.tag === PROJECT_INSTANCE.tag
                          ? <button type="button" style={{ ...btn, marginRight: 4 }} onClick={openSettings} data-assemblies-open-settings>Project settings</button>
                          : e.candidates.map((c) => {
                            const [id, version] = c.split("@");
                            return <button key={c} type="button" style={{ ...btn, marginRight: 4 }} onClick={() => override(e)({ assembly: { id, version } }, `choosing ${c} for ${e.tag}`)}>Use {id}</button>;
                          })}
                        <button type="button" style={btn} onClick={() => { setFamily(""); setFilter(""); setOpen(`${e.tag}|${e.layer}|${JSON.stringify(e.cites[0])}`); }}>Details</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </section>
          )}

          <LineErrorsView lineErrors={report.line_errors} onOpenCitation={onOpenCitation} />

          <section style={{ marginBottom: 16 }} data-assemblies-families={report.families.length} aria-label="By family">
            <h3 style={{ margin: "4px 0 6px", fontSize: "var(--fs-m)" }}>By family</h3>
            <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%" }} aria-label="Assemblies by family">
              <thead><tr><th style={th}>Family</th><th style={th}>Units</th><th style={th}>Typicals</th><th style={th}>Unresolved</th><th style={th}>No typical</th><th style={th}>Lines</th></tr></thead>
              <tbody>
                {report.families.map((f) => (
                  <tr key={f.family}>
                    <td style={td}>
                      <button type="button" aria-pressed={family === f.family} onClick={() => setFamily(family === f.family ? "" : f.family)}
                        style={{ ...btn, border: "none", padding: 0, background: "transparent", textDecoration: "underline", fontWeight: family === f.family ? 650 : undefined }}>{f.family}</button>
                    </td>
                    <td style={td}>{f.units}</td>
                    <td style={{ ...td, ...mono }}>{Object.entries(f.assemblies).map(([a, n]) => `${a} ×${n}`).join(", ") || "—"}</td>
                    <td style={{ ...td, color: f.by_status.unresolved ? "var(--c-danger)" : undefined }}>{f.by_status.unresolved}</td>
                    <td style={td}>{f.by_status.no_assembly}</td>
                    <td style={td}>{sum(f.lines)} ({f.lines.ok} ok)</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>

          <section data-assemblies-units={units.length} aria-label="Units">
            <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0 6px" }}>
              <h3 style={{ margin: 0, fontSize: "var(--fs-m)" }}>Units{family ? ` · ${family}` : ""}</h3>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter tag, family, typical…" aria-label="Filter units"
                style={{ padding: "5px 8px", border: "1px solid var(--ink-faint)", borderRadius: "var(--r-1)", font: "inherit", fontSize: "var(--fs-s)" }} />
              {family && <button type="button" style={btn} onClick={() => setFamily("")}>All families</button>}
            </div>
            <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%" }} aria-label="Units and their typicals">
              <thead><tr><th style={th}>Unit</th><th style={th}>Family</th><th style={th}>Layer</th><th style={th}>Typical</th><th style={th}>Status</th><th style={th}>Lines</th><th style={th}>Printed points</th><th style={th}><span className="workspace-sr-only">Details</span></th></tr></thead>
              <tbody>
                {units.map((u) => {
                  const k = `${u.tag}|${u.layer}|${JSON.stringify(u.cites[0])}`;
                  return [
                    <tr key={k} style={{ cursor: "pointer" }} onClick={() => setOpen(open === k ? null : k)} data-assembly-unit={u.tag}>
                      <td style={td}>
                        <button type="button" style={{ ...btn, border: "none", padding: 0, textDecoration: "underline", background: "transparent" }}
                          onClick={(ev) => { ev.stopPropagation(); onOpenCitation?.(citeRow(u.cites[0], u.tag)); }}>{u.tag}</button>
                        {u.cites[0]?.read_from_picture ? (
                          <span title="This schedule is a picture in the PDF, read by OCR: check its values on the sheet" style={{ marginLeft: 6, fontSize: 11, opacity: 0.75 }} data-read-from-picture>read from a picture</span>
                        ) : null}
                      </td>
                      <td style={td}>{u.family}{u.compiled_family !== u.family ? ` (from ${u.compiled_family})` : ""}</td>
                      <td style={td}>{u.layer}</td>
                      <td style={{ ...td, ...mono }}>{u.assembly ?? "—"}</td>
                      <td style={{ ...td, color: statusColor(u.status) }}>{u.status}{u.selected_by === "user" ? " (yours)" : ""}</td>
                      <td style={td}>{sum(u.lines)}</td>
                      <td style={{ ...td, ...mono }} title={u.printed_points ? u.printed_points.lists.join("\n") : "No printed points list names this unit"}>
                        {u.printed_points ? `${u.printed_points.rows} (${["AI", "AO", "BI", "BO"].map((io) => `${io} ${u.printed_points.by_io[io]}`).join(" ")})` : "—"}
                      </td>
                      <td style={td}>
                        <button type="button" style={btn} aria-expanded={open === k} aria-label={`${u.tag} ${u.family} ${u.layer} details`}
                          onClick={(ev) => { ev.stopPropagation(); setOpen(open === k ? null : k); }}>{open === k ? "Hide" : "Details"}</button>
                      </td>
                    </tr>,
                    open === k ? <tr key={`${k}-d`}><td colSpan={8} style={{ padding: 0 }}><UnitDetail unit={u} lines={linesOf(u)} onOverride={override(u)} readings={readingsOf(u)} onOpenCitation={onOpenCitation} choices={typicalChoices(u.family, projectLibrary(state, library), u.layer)} like={likeOf(u)} /></td></tr> : null,
                  ];
                })}
              </tbody>
            </table></div>
          </section>

          {(state?.overrides?.length ?? 0) > 0 && (
            <OverridesView overrides={state.overrides} sharedTags={sharedTags} unmatched={unmatched} ignored={ignored} onRemove={removeOverrides} />
          )}
        </>
      )}
    </div>
  );
}
