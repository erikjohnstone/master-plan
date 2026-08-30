// Takeoff UI — main tab is a compiled takeoff (line items); Workflow data is
// the raw agent EAV aggregate for audit. Chat stays conversational.
import { useMemo, useState } from "react";
import { Icon } from "../brand/icons.jsx";
import {
  compileAgentTakeoff,
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

const tabBtn = (active) => ({
  padding: "8px 14px",
  border: "none",
  borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
  background: "transparent",
  color: active ? "var(--ink)" : "var(--ink-muted)",
  cursor: "pointer",
  fontFamily: "var(--f-mono)",
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  fontWeight: 650,
});

export default function TakeoffDataPanel({
  rows = [],
  projectName = "",
  onClear,
  onRemove,
  onRemoveLine,
  onClose,
  onOpenCitation,
}) {
  const [tab, setTab] = useState("takeoff"); // takeoff | workflow
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const lines = useMemo(() => compileAgentTakeoff(rows), [rows]);

  const visibleLines = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((r) =>
      [r.tag, r.description, r.sheet_id, r.table_title, r.attrs_text, r.notes, r.workflow]
        .some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [lines, filter]);

  const visibleRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.tag, r.field, r.value, r.sheet_id, r.table_title, r.workflow, r.source_tool]
        .some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, filter]);

  const bySchedule = useMemo(() => {
    const map = new Map();
    for (const line of visibleLines) {
      const key = line.table_title || "(no schedule)";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(line);
    }
    return [...map.entries()];
  }, [visibleLines]);

  const byWorkflow = useMemo(() => {
    const map = new Map();
    for (const r of visibleRows) {
      const key = r.workflow || "(untitled workflow)";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return [...map.entries()];
  }, [visibleRows]);

  const qtyTotal = useMemo(() => {
    let n = 0;
    let any = false;
    for (const line of visibleLines) {
      if (typeof line.qty === "number" && line.unit === "EA") {
        n += line.qty;
        any = true;
      }
    }
    return any ? n : null;
  }, [visibleLines]);

  const runExport = async (kind) => {
    setErr("");
    setBusy(kind);
    const mode = tab === "workflow" ? "workflow" : "compiled";
    const payload = mode === "workflow" ? visibleRows : visibleLines;
    try {
      if (kind === "csv") downloadTakeoffCsv(payload, undefined, { mode });
      else if (kind === "xlsx") await downloadTakeoffXlsx(payload, undefined, { mode });
      else if (kind === "pdf") {
        await downloadTakeoffPdf(payload, {
          title: mode === "workflow" ? "OpenTakeoff — Workflow data" : "OpenTakeoff — Takeoff",
          projectName,
          mode,
        });
      }
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy("");
    }
  };

  const exportDisabled = tab === "workflow" ? !visibleRows.length : !visibleLines.length;

  return (
    <div
      role="dialog"
      aria-label="Takeoff"
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
          padding: "14px 18px 0", borderBottom: "1px solid var(--ink-faint)",
        }}>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 10 }}>
            <div style={{
              fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--ink-muted)",
            }}>Takeoff</div>
            <div style={{ fontSize: 18, fontWeight: 650, marginTop: 2 }}>
              {projectName || "Project takeoff"}
              <span style={{ fontWeight: 500, color: "var(--ink-muted)", marginLeft: 8, fontSize: 14 }}>
                {lines.length} line{lines.length === 1 ? "" : "s"}
                {qtyTotal != null ? ` · ${qtyTotal} EA` : ""}
                {rows.length ? ` · ${rows.length} evidence` : ""}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 4 }}>
              Agent workflows build this takeoff. Finalize quantities here — export CSV, Excel, or PDF.
            </div>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={tab === "takeoff" ? "Filter tag, description…" : "Filter tag, field, sheet…"}
            style={{
              width: 200, padding: "8px 10px", borderRadius: 6, marginBottom: 10,
              border: "1px solid var(--ink-faint)", background: "var(--paper)",
              font: "inherit", fontSize: 13,
            }}
          />
          <button type="button" onClick={() => runExport("csv")} disabled={exportDisabled || !!busy}
            style={{ ...btnStyle, marginBottom: 10 }}>{busy === "csv" ? "…" : "CSV"}</button>
          <button type="button" onClick={() => runExport("xlsx")} disabled={exportDisabled || !!busy}
            style={{ ...btnStyle, marginBottom: 10 }}>{busy === "xlsx" ? "…" : "Excel"}</button>
          <button type="button" onClick={() => runExport("pdf")} disabled={exportDisabled || !!busy}
            style={{ ...btnStyle, marginBottom: 10 }}>{busy === "pdf" ? "…" : "PDF"}</button>
          {typeof onClear === "function" && (
            <button type="button" onClick={onClear} disabled={!rows.length}
              style={{ ...btnStyle, marginBottom: 10, background: "transparent", color: "var(--ink-muted)" }}>
              Clear
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close takeoff"
            style={{ border: "none", background: "transparent", cursor: "pointer", padding: 6, marginBottom: 10 }}>
            <Icon name="x" size={18} />
          </button>
        </header>

        <div style={{ display: "flex", gap: 4, padding: "0 18px", borderBottom: "1px solid var(--ink-faint)" }}>
          <button type="button" style={tabBtn(tab === "takeoff")} onClick={() => setTab("takeoff")}>
            Takeoff
          </button>
          <button type="button" style={tabBtn(tab === "workflow")} onClick={() => setTab("workflow")}>
            Workflow data
          </button>
        </div>

        {err && (
          <div style={{ padding: "8px 18px", color: "var(--c-danger)", fontSize: 12.5 }}>{err}</div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: "0 8px 18px" }}>
          {tab === "takeoff" ? (
            !lines.length ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--ink-muted)", fontSize: 14 }}>
                No takeoff lines yet. Run an Agent workflow that reads schedules,
                sweeps plan tags, or builds a project takeoff — those results
                compile here into line items you can finalize and export.
              </div>
            ) : (
              bySchedule.map(([schedule, group]) => (
                <section key={schedule} style={{ marginTop: 16 }}>
                  <h3 style={{
                    margin: "0 10px 8px", fontSize: 13, fontWeight: 600,
                    color: "var(--ink-muted)",
                  }}>{schedule}</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={th}>Tag</th>
                        <th style={th}>Description</th>
                        <th style={{ ...th, textAlign: "right" }}>Qty</th>
                        <th style={th}>Unit</th>
                        <th style={th}>Sheet</th>
                        <th style={th}>Details</th>
                        <th style={th} />
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((line) => (
                        <tr key={line.id}>
                          <td style={{ ...td, fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 650 }}>
                            {line.tag || "—"}
                          </td>
                          <td style={td}>
                            <div>{line.description}</div>
                            {line.qty_kind && line.qty_kind !== "installed" && (
                              <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 2 }}>
                                {line.qty_kind === "scheduled" ? "Scheduled" : line.qty_kind}
                              </div>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                            {line.qty ?? "—"}
                          </td>
                          <td style={td}>{line.unit || "—"}</td>
                          <td style={{ ...td, fontSize: 12, color: "var(--ink-muted)" }}>{line.sheet_id || "—"}</td>
                          <td style={{ ...td, fontSize: 12, color: "var(--ink-muted)", maxWidth: 280 }}>
                            {line.attrs_text || line.notes || "—"}
                            {line.attrs_text && line.notes ? (
                              <div style={{ marginTop: 2 }}>{line.notes}</div>
                            ) : null}
                          </td>
                          <td style={{ ...td, whiteSpace: "nowrap" }}>
                            {typeof onOpenCitation === "function" && line.sheet_id && line.bbox_px && (
                              <button type="button" onClick={() => onOpenCitation({
                                sheet_id: line.sheet_id,
                                bbox_px: line.bbox_px,
                                tag: line.tag,
                                value: line.qty,
                              })}
                                style={{ ...btnStyle, padding: "4px 8px", fontSize: 11 }}>
                                View
                              </button>
                            )}
                            {typeof onRemoveLine === "function" && (
                              <button type="button" onClick={() => onRemoveLine(line)}
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
            )
          ) : (
            !rows.length ? (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--ink-muted)", fontSize: 14 }}>
                No workflow evidence yet. Field-level results from Agent tools
                land here for audit — the Takeoff tab compiles them into lines.
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
            )
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
