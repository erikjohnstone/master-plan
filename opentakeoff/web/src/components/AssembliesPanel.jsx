// ASSEMBLIES goal, WP5.4 — the Takeoff panel's Assemblies view (surface-
// specific chrome only). Everything it shows is computed on the shared path:
// applyAssemblies (web/src/lib/assemblies/apply.ts), the report (report.ts),
// the project's pins and "update to latest" (projectState.ts) and the
// library gate and override diff (libraryEdit.ts). The MCP tool
// apply_assemblies returns the same records and lines for the same inputs.
//
// Units: exceptions first (each unresolved unit names what it waits for), a
// table per family, a row per unit with its cites, options and lines;
// overrides carry a reason. Library: the starter is read-only; clone a record
// to edit it, with live validation against the whole library and an amber
// tint on what it overrides.
import { useEffect, useMemo, useState } from "react";
import { applyAssemblies } from "../lib/assemblies/apply";
import { cloneForEdit, combinedLibrary, overridesOf, validateEdit } from "../lib/assemblies/libraryEdit";
import { adoptUpdate, emptyAssembliesState, libraryUpdates, pinUsed, projectLibrary } from "../lib/assemblies/projectState";
import { assembliesReport } from "../lib/assemblies/report";

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

function UnitDetail({ unit, lines, onOverride }) {
  const derived = Object.entries(unit.derived || {});
  return (
    <div style={{ padding: "8px 12px 14px 28px", background: "var(--paper)" }} data-assembly-unit-detail={unit.tag}>
      {unit.reason && <div style={{ fontSize: "var(--fs-s)", color: "var(--ink-secondary)", marginBottom: 6 }}>Rule: <span style={mono}>{unit.reason}</span></div>}
      {derived.length > 0 && (
        <div style={{ marginBottom: 8, fontSize: "var(--fs-s)" }}>
          {derived.map(([k, d]) => <div key={k}>Derived <strong>{k}</strong> = {String(d.value)} <span style={{ color: "var(--ink-muted)" }}>({d.rule}: {d.basis})</span></div>)}
        </div>
      )}
      {Object.keys(unit.options || {}).length > 0 && (
        <table style={{ borderCollapse: "collapse", marginBottom: 10 }}>
          <thead><tr><th style={th}>Option</th><th style={th}>Value</th><th style={th}>Source</th><th style={th} /></tr></thead>
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
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
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
      </table>
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <button type="button" style={btn} onClick={() => onOverride({ exclude: true }, `excluding ${unit.tag}`)}>Exclude unit…</button>
      </div>
    </div>
  );
}

function LibraryView({ starter, partner, onSavePartner, library, rejected, updates, onAdopt }) {
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState(null);
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
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0, 1fr)", gap: 16, padding: "12px 8px" }} data-assemblies-library>
      <div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter id, title, family…"
          style={{ width: "100%", padding: "7px 9px", border: "1px solid var(--ink-faint)", borderRadius: "var(--r-1)", font: "inherit", marginBottom: 8 }} />
        {rejected.length > 0 && <div style={{ color: "var(--c-danger)", fontSize: "var(--fs-s)", marginBottom: 8 }}>{rejected.length} record(s) refused by the library gate: {rejected.slice(0, 3).map((r) => `${r.id}: ${r.errors[0]}`).join("; ")}</div>}
        <div style={{ maxHeight: "62vh", overflow: "auto" }}>
          {shown.map((a) => (
            <button key={`${a.id}@${a.version}`} type="button" onClick={() => { setSelected(`${a.id}@${a.version}`); setDraft(null); }}
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
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false}
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
                <table style={{ borderCollapse: "collapse", marginBottom: 10 }}>
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

export default function AssembliesPanel({ project, projectStatus = {}, onLoadProject, starter = [], partner = [], onSavePartner, state, onStateChange, onOpenCitation }) {
  const [view, setView] = useState("units");
  const [family, setFamily] = useState("");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(null);
  const { library, rejected } = useMemo(() => combinedLibrary(starter, partner), [starter, partner]);
  const applied = useMemo(() => (project ? applyAssemblies({
    project, library: projectLibrary(state, library), settings: state?.settings ?? {}, overrides: state?.overrides ?? [],
  }) : null), [project, library, state]);
  const report = useMemo(() => (applied ? assembliesReport(applied.instances, applied.applications, applied.lines) : null), [applied]);
  const updates = useMemo(() => (state ? libraryUpdates(state, library) : []), [state, library]);

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
  const removeOverride = (i) => {
    const base = state ?? emptyAssembliesState();
    onStateChange?.({ ...base, overrides: base.overrides.filter((_, j) => j !== i) });
  };
  const linesOf = (u) => applied.lines.filter((l) => l.tag === u.tag && l.layer === u.layer && l.family === u.family && JSON.stringify(l.cites[0]) === JSON.stringify(u.cites[0]));
  const units = report ? report.units.filter((u) => (!family || u.family === family) && (!filter || `${u.tag} ${u.family} ${u.assembly ?? ""}`.toLowerCase().includes(filter.toLowerCase()))) : [];

  return (
    <div data-assemblies-panel style={{ padding: "8px 8px 24px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0" }}>
        <button type="button" style={{ ...btn, background: view === "units" ? "var(--ink)" : "var(--paper-bright)", color: view === "units" ? "var(--paper-bright)" : "var(--ink)" }} onClick={() => setView("units")}>Units</button>
        <button type="button" style={{ ...btn, background: view === "library" ? "var(--ink)" : "var(--paper-bright)", color: view === "library" ? "var(--paper-bright)" : "var(--ink)" }} onClick={() => setView("library")}>
          Library{updates.length ? ` · ${updates.length} update${updates.length === 1 ? "" : "s"}` : ""}
        </button>
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-s)", color: "var(--ink-muted)" }}>
          {library.length} assemblies ({partner.length} yours) · {state?.pinned?.length ?? 0} pinned in this project
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
            <button type="button" style={{ ...btn, marginLeft: "auto" }} onClick={() => onLoadProject?.()} disabled={!!projectStatus.loading}>{projectStatus.loading ? "Reading…" : "Re-read schedules"}</button>
          </div>

          {report.exceptions.length > 0 && (
            <section data-assemblies-exceptions={report.exceptions.length} style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "4px 0 6px", fontSize: "var(--fs-m)" }}>Exceptions first: {report.exceptions.length} record{report.exceptions.length === 1 ? "" : "s"} wait for something</h3>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
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
                        <button type="button" style={btn} onClick={() => setOpen(`${e.tag}|${e.layer}|${JSON.stringify(e.cites[0])}`)}>Details</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section style={{ marginBottom: 16 }} data-assemblies-families={report.families.length}>
            <h3 style={{ margin: "4px 0 6px", fontSize: "var(--fs-m)" }}>By family</h3>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={th}>Family</th><th style={th}>Units</th><th style={th}>Typicals</th><th style={th}>Unresolved</th><th style={th}>No typical</th><th style={th}>Lines</th></tr></thead>
              <tbody>
                {report.families.map((f) => (
                  <tr key={f.family} style={{ cursor: "pointer" }} onClick={() => setFamily(family === f.family ? "" : f.family)}>
                    <td style={{ ...td, fontWeight: family === f.family ? 650 : undefined }}>{f.family}</td>
                    <td style={td}>{f.units}</td>
                    <td style={{ ...td, ...mono }}>{Object.entries(f.assemblies).map(([a, n]) => `${a} ×${n}`).join(", ") || "—"}</td>
                    <td style={{ ...td, color: f.by_status.unresolved ? "var(--c-danger)" : undefined }}>{f.by_status.unresolved}</td>
                    <td style={td}>{f.by_status.no_assembly}</td>
                    <td style={td}>{sum(f.lines)} ({f.lines.ok} ok)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section data-assemblies-units={units.length}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0 6px" }}>
              <h3 style={{ margin: 0, fontSize: "var(--fs-m)" }}>Units{family ? ` · ${family}` : ""}</h3>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter tag, family, typical…"
                style={{ padding: "5px 8px", border: "1px solid var(--ink-faint)", borderRadius: "var(--r-1)", font: "inherit", fontSize: "var(--fs-s)" }} />
              {family && <button type="button" style={btn} onClick={() => setFamily("")}>All families</button>}
            </div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={th}>Unit</th><th style={th}>Family</th><th style={th}>Layer</th><th style={th}>Typical</th><th style={th}>Status</th><th style={th}>Lines</th></tr></thead>
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
                    </tr>,
                    open === k ? <tr key={`${k}-d`}><td colSpan={6} style={{ padding: 0 }}><UnitDetail unit={u} lines={linesOf(u)} onOverride={override(u)} /></td></tr> : null,
                  ];
                })}
              </tbody>
            </table>
          </section>

          {(state?.overrides?.length ?? 0) > 0 && (
            <section style={{ marginTop: 16 }} data-assemblies-overrides={state.overrides.length}>
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
