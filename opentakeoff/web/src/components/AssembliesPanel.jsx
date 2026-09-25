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
// project. Library: the starter is read-only; clone a record to edit it, with
// live validation against the whole library and an amber tint on what it
// overrides.
import { useEffect, useMemo, useState } from "react";
import { applyAssemblies } from "../lib/assemblies/apply";
import { assembliesCsvSet } from "../lib/assemblies/exportSet";
import { importLibraryCsv, libraryToCsv } from "../lib/assemblies/libraryCsv";
import { downloadText } from "../lib/totals";
import { cloneForEdit, combinedLibrary, overridesOf, validateEdit } from "../lib/assemblies/libraryEdit";
import { activeResponsibilityPresets, HOOKUP_SWITCHES, HOOKUP_VARIABLES, hookupProfileDefaults, RESPONSIBILITY_PRESETS, withResponsibilityPreset } from "../lib/assemblies/presets";
import { adoptUpdate, emptyAssembliesState, libraryUpdates, pinUsed, projectLibrary } from "../lib/assemblies/projectState";
import { assembliesReport } from "../lib/assemblies/report";
import { PARTIES } from "../lib/assemblies/schema";
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

function UnitDetail({ unit, lines, onOverride, readings, onOpenCitation }) {
  const derived = Object.entries(unit.derived || {});
  return (
    <div style={{ padding: "8px 12px 14px 28px", background: "var(--paper)" }} data-assembly-unit-detail={unit.tag} role="region" aria-label={`${unit.tag} ${unit.layer} details`}>
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
                  <button type="button" style={btn} onClick={() => onOverride({ options: { [id]: !(o.value === true) } }, `setting ${id} to ${!(o.value === true)} on ${unit.tag}`)}>
                    Set {String(!(o.value === true))}
                  </button>
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
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <button type="button" style={btn} onClick={() => onOverride({ exclude: true }, `excluding ${unit.tag}`)}>Exclude unit…</button>
      </div>
    </div>
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
 * leaves). Each change is saved with the project and re-applies at once. */
function ProjectSettingsView({ settings, onChange }) {
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
  const importCsv = async (file) => {
    if (!file) return;
    const text = await file.text();
    const r = importLibraryCsv(text, starter, partner);
    if (r.added.length || r.replaced.length) onSavePartner(r.partner);
    setImported({ file: file.name, ...r });
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 340px) minmax(0, 1fr)", gap: 16, padding: "12px 8px" }} data-assemblies-library role="region" aria-label="Assembly library">
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button type="button" style={btn} onClick={() => downloadText("assemblies-library.csv", libraryToCsv(library), "text/csv")} data-assemblies-library-export>Export CSV</button>
          <label style={{ ...btn, display: "inline-block" }}>
            Import CSV…
            <input type="file" accept=".csv,text/csv" style={{ display: "none" }} aria-label="Import a library CSV" data-assemblies-library-import
              onChange={(e) => { importCsv(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
        {imported && (
          <div role="status" style={{ fontSize: "var(--fs-s)", marginBottom: 8 }} data-assemblies-import={imported.errors.length ? "errors" : "ok"}>
            {imported.file}: {imported.added.length} added, {imported.replaced.length} replaced, {imported.unchanged.length} unchanged
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

export default function AssembliesPanel({ project, projectStatus = {}, onLoadProject, starter = [], partner = [], onSavePartner, state, onStateChange, onOpenCitation, projectName = "", onReport }) {
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
  const applied = useMemo(() => (project ? applyAssemblies({
    project, library: projectLibrary(state, library), settings: state?.settings ?? {}, overrides: state?.overrides ?? [], readings,
  }) : null), [project, library, state, readings]);
  const readingsOf = (u) => (readings?.units || []).filter((r) => r.tag === u.tag && r.family === u.family).flatMap((r) => r.decisions);
  const readingCounts = useMemo(() => {
    const ds = (readings?.units || []).flatMap((u) => u.decisions);
    return { applied: ds.filter((d) => d.outcome === "applied").length, proposal: ds.filter((d) => d.outcome === "proposal").length, unresolved: ds.filter((d) => d.outcome === "unresolved").length };
  }, [readings]);
  const report = useMemo(() => (applied ? assembliesReport(applied.instances, applied.applications, applied.lines) : null), [applied]);
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

  const override = (unit) => (patch, what) => {
    const reason = askReason(what);
    if (!reason) return;
    const base = state ?? emptyAssembliesState();
    const others = base.overrides.filter((o) => !(o.tag === unit.tag && (o.layer ?? null) === (patch.exclude ? null : unit.layer)));
    const prior = base.overrides.find((o) => o.tag === unit.tag && o.layer === unit.layer);
    const entry = patch.exclude ? { tag: unit.tag, reason, exclude: true }
      : { tag: unit.tag, layer: unit.layer, reason, ...(prior?.assembly ? { assembly: prior.assembly } : {}), options: { ...(prior?.options ?? {}), ...(patch.options ?? {}) }, ...(patch.assembly ? { assembly: patch.assembly } : {}) };
    onStateChange?.({ ...base, overrides: [...others, entry] });
  };
  const setSettings = (next) => onStateChange?.({ ...(state ?? emptyAssembliesState()), settings: next });
  const removeOverride = (i) => {
    const base = state ?? emptyAssembliesState();
    onStateChange?.({ ...base, overrides: base.overrides.filter((_, j) => j !== i) });
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", ...mono, fontSize: "var(--fs-s)", color: "var(--ink-muted)", margin: "4px 0 12px" }} data-assemblies-totals
            data-units={report.totals.units} data-unresolved={report.totals.by_status.unresolved} data-lines={report.totals.lines}>
            <span><strong style={{ color: "var(--ink)" }}>{report.totals.units}</strong> units</span>
            <span><strong style={{ color: "var(--ink)" }}>{report.totals.by_status.ok + report.totals.by_status.overridden}</strong> records decided</span>
            <span style={{ color: report.totals.by_status.unresolved ? "var(--c-danger)" : undefined }}><strong>{report.totals.by_status.unresolved}</strong> unresolved</span>
            <span><strong style={{ color: "var(--ink)" }}>{report.totals.by_status.no_assembly}</strong> without a typical</span>
            <span><strong style={{ color: "var(--ink)" }}>{report.totals.lines}</strong> lines ({report.totals.lines_by_status.ok} ok, {report.totals.lines_by_status.unresolved} unresolved, {report.totals.lines_by_status.replaced} replaced by drawing evidence)</span>
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

          <ProjectSettingsView settings={state?.settings ?? {}} onChange={setSettings} />

          {report.exceptions.length > 0 && (
            <section data-assemblies-exceptions={report.exceptions.length} style={{ marginBottom: 16 }} aria-label="Exceptions">
              <h3 style={{ margin: "4px 0 6px", fontSize: "var(--fs-m)" }}>Exceptions first: {report.exceptions.length} record{report.exceptions.length === 1 ? "" : "s"} wait for something</h3>
              <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%" }} aria-label="Records that wait for something">
                <thead><tr><th style={th}>Unit</th><th style={th}>Family</th><th style={th}>Layer</th><th style={th}>Waits for</th><th style={th}>Candidates</th><th style={th}>Resolve</th></tr></thead>
                <tbody>
                  {report.exceptions.map((e, i) => (
                    <tr key={`${e.tag}-${e.layer}-${i}`}>
                      <td style={td}><button type="button" style={{ ...btn, border: "none", padding: 0, textDecoration: "underline", background: "transparent" }} onClick={() => onOpenCitation?.(citeRow(e.cites[0], e.tag))}>{e.tag}</button></td>
                      <td style={td}>{e.family}{e.compiled_family !== e.family ? ` (from ${e.compiled_family})` : ""}</td>
                      <td style={td}>{e.layer}</td>
                      <td style={{ ...td, ...mono }}>{e.waits_for.join(", ") || "—"}</td>
                      <td style={{ ...td, ...mono }}>{e.candidates.join(", ") || e.assembly || "—"}</td>
                      <td style={td}>
                        {e.candidates.map((c) => {
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
                        <button type="button" style={btn} aria-expanded={open === k} aria-label={`${u.tag} ${u.layer} details`}
                          onClick={(ev) => { ev.stopPropagation(); setOpen(open === k ? null : k); }}>{open === k ? "Hide" : "Details"}</button>
                      </td>
                    </tr>,
                    open === k ? <tr key={`${k}-d`}><td colSpan={8} style={{ padding: 0 }}><UnitDetail unit={u} lines={linesOf(u)} onOverride={override(u)} readings={readingsOf(u)} onOpenCitation={onOpenCitation} /></td></tr> : null,
                  ];
                })}
              </tbody>
            </table></div>
          </section>

          {(state?.overrides?.length ?? 0) > 0 && (
            <section style={{ marginTop: 16 }} data-assemblies-overrides={state.overrides.length} aria-label="Your overrides">
              <h3 style={{ margin: "4px 0 6px", fontSize: "var(--fs-m)" }}>Your overrides</h3>
              {state.overrides.map((o, i) => (
                <div key={i} style={{ fontSize: "var(--fs-s)", marginBottom: 4 }}>
                  <span style={mono}>{o.tag}</span>{o.layer ? ` (${o.layer})` : ""}: {o.exclude ? "excluded" : [o.assembly ? `typical ${o.assembly.id}` : "", ...Object.entries(o.options ?? {}).map(([k, v]) => `${k}=${v}`)].filter(Boolean).join(", ")}
                  <span style={{ color: "var(--ink-muted)" }}> — {o.reason}</span>
                  <button type="button" style={{ ...btn, marginLeft: 8, padding: "1px 6px" }} onClick={() => removeOverride(i)}>Remove</button>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
