// Takeoff Data UI — aggregates structured results from any Agent workflow.
// Chat stays conversational; this panel is where quantities/fields land and
// where CSV / Excel / PDF exports live.
import { useMemo, useState } from "react";
import { Icon } from "../brand/icons.jsx";
import {
  downloadTakeoffCsv,
  downloadTakeoffPdf,
  downloadTakeoffXlsx,
} from "../lib/agentTakeoff.js";

const th = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 11,
  fontFamily: "var(--f-mono)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
  borderBottom: "1px solid var(--ink-faint)",
  whiteSpace: "nowrap",
};
const td = {
  padding: "8px 10px",
  fontSize: 13,
  color: "var(--ink)",
  borderBottom: "1px solid var(--ink-faint)",
  verticalAlign: "top",
};

export default function TakeoffDataPanel({
  rows = [],
  projectName = "",
  onClear,
  onRemove,
  onClose,
  onOpenCitation,
}) {
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.tag, r.field, r.value, r.sheet_id, r.table_title, r.workflow, r.source_tool]
        .some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, filter]);

  const byWorkflow = useMemo(() => {
    const map = new Map();
    for (const r of visible) {
      const key = r.workflow || "(untitled workflow)";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return [...map.entries()];
  }, [visible]);

  const runExport = async (kind) => {
    setErr("");
    setBusy(kind);
    try {
      if (kind === "csv") downloadTakeoffCsv(visible);
      else if (kind === "xlsx") await downloadTakeoffXlsx(visible);
      else if (kind === "pdf") {
        await downloadTakeoffPdf(visible, { title: "OpenTakeoff — Takeoff", projectName });
      }
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Takeoff data"
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "color-mix(in srgb, var(--ink) 45%, transparent)",
        display: "flex", alignItems: "stretch", justifyContent: "center",
        padding: "4vh 4vw",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1200px, 100%)",
          background: "var(--paper-bright)",
          color: "var(--ink)",
          borderRadius: 8,
          boxShadow: "0 24px 80px color-mix(in srgb, var(--ink) 35%, transparent)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 18px", borderBottom: "1px solid var(--ink-faint)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--ink-muted)",
            }}>Takeoff</div>
            <div style={{ fontSize: 18, fontWeight: 650, marginTop: 2 }}>
              Workflow data
              <span style={{ fontWeight: 500, color: "var(--ink-muted)", marginLeft: 8, fontSize: 14 }}>
                {rows.length} row{rows.length === 1 ? "" : "s"}
                {visible.length !== rows.length ? ` · ${visible.length} shown` : ""}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 4 }}>
              Structured results from Agent workflows aggregate here. Chat stays
              for conversation and next steps — export the takeoff from this panel.
            </div>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tag, field, sheet…"
            style={{
              width: 220, padding: "8px 10px", borderRadius: 6,
              border: "1px solid var(--ink-faint)", background: "var(--paper)",
              font: "inherit", fontSize: 13,
            }}
          />
          <button type="button" onClick={() => runExport("csv")} disabled={!visible.length || !!busy}
            style={btnStyle}>{busy === "csv" ? "…" : "CSV"}</button>
          <button type="button" onClick={() => runExport("xlsx")} disabled={!visible.length || !!busy}
            style={btnStyle}>{busy === "xlsx" ? "…" : "Excel"}</button>
          <button type="button" onClick={() => runExport("pdf")} disabled={!visible.length || !!busy}
            style={btnStyle}>{busy === "pdf" ? "…" : "PDF"}</button>
          {typeof onClear === "function" && (
            <button type="button" onClick={onClear} disabled={!rows.length}
              style={{ ...btnStyle, background: "transparent", color: "var(--ink-muted)" }}>
              Clear
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close takeoff"
            style={{ border: "none", background: "transparent", cursor: "pointer", padding: 6 }}>
            <Icon name="x" size={18} />
          </button>
        </header>

        {err && (
          <div style={{ padding: "8px 18px", color: "var(--c-danger)", fontSize: 12.5 }}>{err}</div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: "0 8px 18px" }}>
          {!rows.length ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--ink-muted)", fontSize: 14 }}>
              No takeoff rows yet. Run an Agent workflow that reads schedules,
              counts equipment, or sweeps plan tags — those results land here
              automatically.
            </div>
          ) : (
            byWorkflow.map(([workflow, group]) => (
              <section key={workflow} style={{ marginTop: 16 }}>
                <h3 style={{
                  margin: "0 10px 8px", fontSize: 13, fontWeight: 600,
                  color: "var(--ink-muted)",
                }}>{workflow}</h3>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Tag</th>
                      <th style={th}>Field</th>
                      <th style={th}>Value</th>
                      <th style={th}>Unit</th>
                      <th style={th}>Sheet</th>
                      <th style={th}>Schedule</th>
                      <th style={th} />
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((r) => (
                      <tr key={r.id}>
                        <td style={{ ...td, fontFamily: "var(--f-mono)", fontSize: 12 }}>{r.tag || "—"}</td>
                        <td style={td}>{r.field}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{String(r.value)}</td>
                        <td style={td}>{r.unit || "—"}</td>
                        <td style={{ ...td, fontSize: 12, color: "var(--ink-muted)" }}>{r.sheet_id || "—"}</td>
                        <td style={{ ...td, fontSize: 12, color: "var(--ink-muted)" }}>{r.table_title || "—"}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {typeof onOpenCitation === "function" && r.sheet_id && r.bbox_px && (
                            <button type="button" onClick={() => onOpenCitation(r)}
                              style={{ ...btnStyle, padding: "4px 8px", fontSize: 11 }}>
                              View
                            </button>
                          )}
                          {typeof onRemove === "function" && (
                            <button type="button" onClick={() => onRemove(r.id)}
                              style={{
                                border: "none", background: "transparent", cursor: "pointer",
                                color: "var(--ink-muted)", padding: "4px 6px", fontSize: 11,
                              }}>
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  padding: "8px 12px",
  border: "1px solid var(--ink-faint)",
  borderRadius: 6,
  background: "var(--paper)",
  color: "var(--ink)",
  cursor: "pointer",
  fontFamily: "var(--f-mono)",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontWeight: 650,
};
