// Presentation of the shared Python result. No estimating math lives here.
import { useId, useState } from "react";
import { downloadText } from "../lib/totals.js";

const channels = ["AI", "AO", "DI", "DO"];
const views = ["Points", "I/O capacity", "Networks", "Licenses", "Issues"];
const labels = { calculated: "Calculated", review_required: "Review required", no_evidence: "No typed evidence",
  not_configured: "Policy needed", infeasible: "Cannot meet constraints", capacity_only: "Distances unverified" };
const text = (value) => value == null ? "—" : String(value);
const cell = { padding: "var(--sp-3) var(--sp-4)", borderBottom: "1px solid var(--ink-faint)", textAlign: "left", verticalAlign: "top" };
const button = { padding: "var(--sp-2) var(--sp-3)", border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)", cursor: "pointer" };

function Grid({ headings, children, label }) {
  return <div style={{ overflowX: "auto" }}><table aria-label={label} style={{ width: "100%", borderCollapse: "collapse" }}>
    <thead><tr>{headings.map((h) => <th key={h} scope="col" style={{ ...cell, background: "var(--paper-bright)", whiteSpace: "nowrap", fontSize: "var(--fs-s)" }}>{h}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table></div>;
}

export default function BasMathSummary({ result, onOpenCitation, filter = "" }) {
  const [view, setView] = useState("Points");
  const id = useId();
  if (!result) return null;
  if (result.status === "unavailable") return <section aria-label="BAS engineering" style={{ padding: "var(--sp-5)" }}>
    <h2>BAS engineering unavailable</h2><p role="status">{result.error}</p>
    <p>Original schedule results are preserved below. No math result has been substituted.</p>
  </section>;
  const issues = result.diagnostics || [];
  const needle = filter.trim().toLowerCase();
  const points = needle ? result.points.filter((p) => [p.point_id, p.group_id, ...p.evidence.map((e) => e.text || "")].join(" ").toLowerCase().includes(needle)) : result.points;
  const evidence = (p) => (p.evidence || []).find((e) => e.bbox_px && e.sheet_id);
  const sourceButton = (p) => {
    const cite = evidence(p);
    return cite && onOpenCitation ? <button type="button" style={button} onClick={() => onOpenCitation({
      ...cite, tag: p.point_id || cite.row_key, value: cite.text, kind: "row",
    })}>View source</button> : <span>Source not located</span>;
  };
  const scopeName = (groupId) => {
    const p = result.points.find((point) => point.group_id === groupId);
    const cite = p?.evidence?.[0];
    return cite ? `${cite.table_title || "Point list"} · ${cite.sheet_id?.split("#").at(-1) || "source"}` : groupId;
  };
  return <section aria-label="BAS engineering" data-bas-status={result.status} style={{ padding: "var(--sp-5) var(--sp-5) calc(var(--sp-5) + var(--sp-2))", borderBottom: "2px solid var(--ink-faint)" }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--sp-3)" }}>
      <h2 style={{ margin: 0, fontSize: "var(--fs-xl)" }}>BAS takeoff · Engineering</h2>
      <span role="status" style={{ color: result.status === "calculated" ? "var(--ink)" : "var(--c-danger)" }}>{labels[result.status]}</span>
      <button type="button" style={{ ...button, marginLeft: "auto" }} onClick={() => downloadText("bas-engineering.json", JSON.stringify(result, null, 2), "application/json")}>Export BAS JSON</button>
    </div>
    <p style={{ color: "var(--ink-muted)", lineHeight: 1.6, maxWidth: 960 }}>
      {result.source_coverage === "both" ? "SOO and drawing-list capacity envelope." : result.source_coverage === "soo_only" ? "SOO requirements only." : "Indexed point-list requirements only."}
      {" "}These are typed requirements, not verified installed-device counts. Software variables are separate from physical I/O. Unresolved source and engineering constraints remain below.
    </p>
    <Grid headings={channels} label="BAS physical requirement totals"><tr>{channels.map((channel) =>
      <td key={channel} data-bas-total={channel} style={{ ...cell, fontFamily: "var(--f-mono)", fontSize: "var(--fs-xl)" }}>{text(result.physical_total[channel])}</td>)}</tr></Grid>
    <div role="tablist" aria-label="BAS engineering views" style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", margin: "var(--sp-4) 0" }}
      onKeyDown={(event) => {
        const current = views.indexOf(view);
        const next = event.key === "ArrowRight" ? (current + 1) % views.length : event.key === "ArrowLeft" ? (current + views.length - 1) % views.length : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : null;
        if (next == null) return;
        event.preventDefault(); event.stopPropagation(); setView(views[next]);
        event.currentTarget.querySelectorAll('[role="tab"]')[next]?.focus();
      }}>
      {views.map((name, index) => <button key={name} id={`${id}-tab-${index}`} type="button" role="tab" aria-selected={view === name} tabIndex={view === name ? 0 : -1}
        aria-controls={`${id}-content`} style={{ ...button, borderColor: view === name ? "var(--cobalt)" : "var(--ink-faint)", color: view === name ? "var(--cobalt)" : "var(--ink)", fontWeight: view === name ? 700 : 400 }}
        onClick={() => setView(name)}>{name}{name === "Issues" ? ` · ${issues.length}` : ""}</button>)}
    </div>
    <div id={`${id}-content`} role="tabpanel" aria-labelledby={`${id}-tab-${views.indexOf(view)}`} tabIndex={0}>
      {view === "Points" && <>
        <p style={{ color: "var(--ink-muted)" }}>Each local point identity stays within its source table. Quantities below are per declared instance; unknown template replication is not applied.</p>
        {!points.length ? <p>{needle ? "No points match this filter. Totals still cover all requirements." : "No typed requirements are available. Check Issues for missing or ambiguous evidence."}</p> :
          <Grid label="BAS typed points" headings={["Point", "Description / scope", ...channels, "Software variables", "Evidence"]}>
            {points.map((p) => <tr key={`${p.group_id}:${p.point_id}`}>
              <th scope="row" style={cell}>{p.point_id}{p.conflict ? " · Review" : ""}</th>
              <td style={cell}>{p.evidence?.[0]?.text || p.point_id}<small style={{ display: "block", color: "var(--ink-muted)", marginTop: "var(--sp-1)" }}>{scopeName(p.group_id)}</small></td>
              {channels.map((c) => <td key={c} style={{ ...cell, fontFamily: "var(--f-mono)" }}>{text(p.physical[c])}</td>)}
              <td style={cell}>{p.soft.length ? p.soft.map((s) => `${s.quantity} ${s.protocol} (${s.variable_id})`).join("; ") : "—"}</td>
              <td style={cell}>{sourceButton(p)}</td>
            </tr>)}
          </Grid>}
      </>}
      {view === "I/O capacity" && <>
        <p style={{ color: "var(--ink-muted)" }}>Abstract I/O blocks, not a manufacturer selection. Reserved capacity includes spare policy; UI terminals are allocated once.</p>
        <Grid label="BAS hardware capacity" headings={["Allocation scope", "Pools", "Required AI / AO / DI / DO per pool", "Profile", "Blocks per pool", "Total blocks", "Status"]}>
          {result.hardware.map((h) => <tr key={h.group_id}>
            <th scope="row" style={cell}>{scopeName(h.group_id)}<small style={{ display: "block", fontWeight: 400 }}>{h.allocation.replaceAll("_", " ")} · {h.spare_policy.numerator}/{h.spare_policy.denominator} {h.spare_policy.basis.replaceAll("_", " ")}</small></th>
            <td style={cell}>{h.pool_count}</td><td style={cell}>{channels.map((c) => h.required_per_pool[c]).join(" / ")}</td>
            <td style={cell}>{text(h.profile_id)}</td><td style={cell}>{text(h.blocks_per_pool)}</td><td style={cell}>{text(h.blocks_total)}</td><td style={cell}>{labels[h.status]}</td>
          </tr>)}
        </Grid>
      </>}
      {view === "Networks" && <>
        {!result.serial.length && !result.ip.length && <p>No endpoint topology was supplied. Trunk lengths and network hardware have not been guessed from point counts.</p>}
        {result.serial.map((r) => <div key={r.route_id}><h3>{r.route_id} · {labels[r.status]}</h3>
          <Grid label={`Serial route ${r.route_id}`} headings={["Endpoints", "Devices with reserves", "Electrical load (µUL)", "Length (mm)"]}>
            {r.segments.map((s, i) => <tr key={i}><td style={cell}>{s.node_ids.join(", ")}</td><td style={cell}>{s.device_count}</td><td style={cell}>{s.load_microunits}</td><td style={cell}>{text(s.length_mm)}</td></tr>)}
          </Grid>
        </div>)}
        {!!result.ip.length && <Grid label="IP switches" headings={["Closet", "Endpoints", "Switches", "Spare ports", "Status"]}>
          {result.ip.map((r) => <tr key={r.closet_id}><th scope="row" style={cell}>{r.closet_id}</th><td style={cell}>{r.endpoint_count}</td><td style={cell}>{text(r.switches)}</td><td style={cell}>{text(r.spare_ports)}</td><td style={cell}>{labels[r.status]}</td></tr>)}
        </Grid>}
      </>}
      {view === "Licenses" && <>
        {!result.licenses.length ? <p>No mapped software variables or license policies were supplied. This is not proof that the project needs no licenses.</p> :
          <Grid label="BAS software licenses" headings={["Pool", "Variables", "Weighted license points", "Entitlement", "Additive packs", "Headroom", "Status"]}>
            {result.licenses.map((l) => <tr key={l.pool}><th scope="row" style={cell}>{l.pool}</th>{[l.variables, l.weighted_points, l.entitlement, l.packs, l.headroom].map((v, i) => <td key={i} style={cell}>{text(v)}</td>)}<td style={cell}>{labels[l.status]}</td></tr>)}
          </Grid>}
      </>}
      {view === "Issues" && <Grid label="BAS review issues" headings={["Severity", "Finding", "Source"]}>
        {issues.map((d, i) => <tr key={i}><th scope="row" style={cell}>{d.severity}</th><td style={cell}>{d.message}<small style={{ display: "block", color: "var(--ink-muted)" }}>{d.code}{d.point_id ? ` · Point ${d.point_id}` : ""}</small></td><td style={cell}>{sourceButton(d)}</td></tr>)}
      </Grid>}
    </div>
  </section>;
}
