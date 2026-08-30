// Takeoff UI — industry-standard finished takeoff + workflow audit.
// Takeoff tab = compiled quantity schedule (contractor document).
// Workflow data = raw EAV evidence trail. Chat stays conversational.
import { useMemo, useState } from "react";
import { Icon } from "../brand/icons.jsx";
import {
  compileAgentTakeoff,
  downloadTakeoffCsv,
  downloadTakeoffPdf,
  downloadTakeoffXlsx,
  groupTakeoffByFamily,
  lineLeadCite,
  lineLeadValue,
  lineSpecValue,
} from "../lib/agentTakeoff.js";

/** Cap visible technical columns so each family table stays readable. */
const UI_SPEC_MAX = 12;

const th = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 10.5,
  fontFamily: "var(--f-mono)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
  borderBottom: "1px solid var(--ink-faint)",
  whiteSpace: "nowrap",
  background: "var(--paper-bright)",
  position: "sticky",
  top: 0,
  zIndex: 1,
};
const td = {
  padding: "7px 10px",
  fontSize: 13,
  color: "var(--ink)",
  borderBottom: "1px solid color-mix(in srgb, var(--ink-faint) 70%, transparent)",
  verticalAlign: "top",
};

const tabBtn = (active) => ({
  padding: "10px 16px",
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

function familyLabel(family) {
  if (family == null) return "Schedule";
  if (typeof family === "object") return String(family.text || "Schedule");
  return String(family);
}

function shortSheet(sheet) {
  const s = String(sheet || "");
  if (!s) return "—";
  const hash = s.lastIndexOf("#");
  if (hash >= 0) return `p.${s.slice(hash + 1)}`;
  return s.length > 28 ? `…${s.slice(-24)}` : s;
}

/** Clickable takeoff control — jumps to a schedule row or whole table on the drawings. */
function CiteValue({ text, cite, onOpenCitation, align = "left", mono = false, weight = 400, title }) {
  const display = text === "" || text == null ? "—" : String(text);
  const canJump = cite?.sheet_id && Array.isArray(cite.bbox_px) && cite.bbox_px.length === 4
    && typeof onOpenCitation === "function";
  if (!canJump) {
    return (
      <span style={{
        fontFamily: mono ? "var(--f-mono)" : undefined,
        fontWeight: weight,
        fontVariantNumeric: align === "right" ? "tabular-nums" : undefined,
      }}>{display}</span>
    );
  }
  const tip = title
    || (cite.kind === "table"
      ? "Jump to this schedule table on the drawings"
      : "Jump to this equipment / point row on the drawings");
  return (
    <button
      type="button"
      title={tip}
      data-takeoff-cite={cite.kind || "row"}
      onClick={(e) => {
        e.stopPropagation();
        onOpenCitation(cite);
      }}
      style={{
        border: "none",
        background: "transparent",
        padding: 0,
        margin: 0,
        cursor: "pointer",
        color: "var(--ink)",
        textAlign: align,
        font: "inherit",
        fontFamily: mono ? "var(--f-mono)" : "inherit",
        fontWeight: weight,
        fontSize: "inherit",
        fontVariantNumeric: align === "right" ? "tabular-nums" : undefined,
        textDecoration: "underline",
        textDecorationColor: "color-mix(in srgb, var(--ink) 28%, transparent)",
        textUnderlineOffset: 3,
      }}
    >
      {display}
    </button>
  );
}

export default function TakeoffDataPanel({
  rows = [],
  projectName = "",
  corpusMeta = null,
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
  const [jumpFamily, setJumpFamily] = useState("");

  const lines = useMemo(() => compileAgentTakeoff(rows), [rows]);

  const visibleLines = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((r) =>
      [r.tag, r.type, r.description, r.manufacturer, r.model, r.sheet_id, r.table_title,
        r.family, r.attrs_text, r.notes, r.workflow, ...Object.values(r.specs || {})]
        .some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [lines, filter]);

  const visibleRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.tag, r.field, r.value, r.sheet_id, r.table_title, r.workflow, r.source_tool]
        .some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, filter]);

  const familyGroups = useMemo(
    () => groupTakeoffByFamily(visibleLines, { uiSpecMax: UI_SPEC_MAX }),
    [visibleLines],
  );

  const bySchedule = useMemo(() => {
    const map = new Map();
    for (const r of visibleRows) {
      const sched = typeof r.table_title === "object" && r.table_title != null
        ? String(r.table_title.text || "Unscheduled evidence")
        : (r.table_title || r.workflow || "Unscheduled evidence");
      if (!map.has(sched)) map.set(sched, []);
      map.get(sched).push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleRows]);

  const qtyTotal = useMemo(() => {
    let n = 0;
    let any = false;
    for (const line of visibleLines) {
      if (typeof line.qty === "number" && (line.unit || "EA") === "EA") {
        n += line.qty;
        any = true;
      }
    }
    return any ? n : null;
  }, [visibleLines]);

  const lockedTotal = corpusMeta?.totals?.items
    ?? corpusMeta?.totals?.rows
    ?? null;
  const takeoffId = corpusMeta?.takeoff_id || null;
  const compiledOk = takeoffId
    && lockedTotal != null
    && lines.length === lockedTotal
    && (qtyTotal == null || qtyTotal === lockedTotal);

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

  const jumpToFamily = (name) => {
    setJumpFamily(name);
    setTab("takeoff");
    requestAnimationFrame(() => {
      const el = document.getElementById(`takeoff-family-${encodeURIComponent(name)}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div
      role="dialog"
      aria-label="Takeoff"
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "color-mix(in srgb, var(--ink) 45%, transparent)",
        display: "flex", alignItems: "stretch", justifyContent: "center",
        padding: "3vh 1.5vw",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1520px, 100%)",
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
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "16px 20px 0", borderBottom: "1px solid var(--ink-faint)",
        }}>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 12 }}>
            <div style={{
              fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--ink-muted)",
            }}>
              {takeoffId || "Takeoff"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 650, marginTop: 2, letterSpacing: "-0.01em" }}>
              {projectName || "Project takeoff"}
            </div>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: "6px 14px",
              marginTop: 8, fontFamily: "var(--f-mono)", fontSize: 12,
              color: "var(--ink-muted)", letterSpacing: "0.02em",
            }}
              data-takeoff-stats
              data-lines={lines.length}
              data-schedules={familyGroups.length}
              data-ea={qtyTotal ?? ""}
              data-evidence={rows.length}
              data-takeoff-id={takeoffId || ""}
            >
              <span><strong style={{ color: "var(--ink)", fontWeight: 650 }}>{lines.length}</strong> lines</span>
              <span><strong style={{ color: "var(--ink)", fontWeight: 650 }}>{familyGroups.length}</strong> schedules</span>
              {qtyTotal != null && (
                <span data-takeoff-ea={qtyTotal}><strong style={{ color: "var(--ink)", fontWeight: 650 }}>{qtyTotal}</strong> EA</span>
              )}
              {lockedTotal != null && (
                <span style={{ color: compiledOk ? "var(--ink)" : "var(--c-danger)" }}>
                  locked {lockedTotal}{compiledOk ? " · matched" : " · mismatch"}
                </span>
              )}
              <span>{rows.length} evidence fields</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 6, maxWidth: 760, lineHeight: 1.45 }}>
              {tab === "takeoff"
                ? "Finished quantity takeoff — click a Tag to open that schedule row on the drawings; click a schedule name to open the whole table. Spec fields for a tag share that row."
                : "Workflow audit trail — every field the Agent gathered. Does not change the finished Takeoff totals."}
            </div>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={tab === "takeoff" ? "Filter tag, schedule, field…" : "Filter tag, field, sheet…"}
            style={{
              width: 220, padding: "9px 11px", borderRadius: 6, marginTop: 4,
              border: "1px solid var(--ink-faint)", background: "var(--paper)",
              font: "inherit", fontSize: 13,
            }}
          />
          <button type="button" onClick={() => runExport("csv")} disabled={exportDisabled || !!busy}
            style={{ ...btnStyle, marginTop: 4 }}>{busy === "csv" ? "…" : "CSV"}</button>
          <button type="button" onClick={() => runExport("xlsx")} disabled={exportDisabled || !!busy}
            style={{ ...btnStyle, marginTop: 4 }}>{busy === "xlsx" ? "…" : "Excel"}</button>
          <button type="button" onClick={() => runExport("pdf")} disabled={exportDisabled || !!busy}
            style={{ ...btnStyle, marginTop: 4 }}>{busy === "pdf" ? "…" : "PDF"}</button>
          {typeof onClear === "function" && (
            <button type="button" onClick={onClear} disabled={!rows.length}
              style={{ ...btnStyle, marginTop: 4, background: "transparent", color: "var(--ink-muted)" }}>
              Clear
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close takeoff"
            style={{ border: "none", background: "transparent", cursor: "pointer", padding: 8, marginTop: 2 }}>
            <Icon name="x" size={18} />
          </button>
        </header>

        <div style={{ display: "flex", gap: 2, padding: "0 20px", borderBottom: "1px solid var(--ink-faint)" }}>
          <button type="button" style={tabBtn(tab === "takeoff")} onClick={() => setTab("takeoff")}>
            Takeoff
          </button>
          <button type="button" style={tabBtn(tab === "workflow")} onClick={() => setTab("workflow")}>
            Workflow data
          </button>
        </div>

        {err && (
          <div style={{ padding: "8px 20px", color: "var(--c-danger)", fontSize: 12.5 }}>{err}</div>
        )}

        {/* Family jump strip — contractor scanning by schedule */}
        {tab === "takeoff" && familyGroups.length > 1 && (
          <div style={{
            display: "flex", gap: 6, flexWrap: "wrap", padding: "10px 20px",
            borderBottom: "1px solid var(--ink-faint)",
            background: "color-mix(in srgb, var(--paper) 85%, var(--ink-faint))",
          }}>
            {familyGroups.map((g) => {
              const name = familyLabel(g.family);
              const active = jumpFamily === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    if (g.tableCite && onOpenCitation) onOpenCitation(g.tableCite);
                    else jumpToFamily(name);
                  }}
                  style={{
                    ...btnStyle,
                    padding: "5px 9px",
                    fontSize: 10.5,
                    background: active ? "var(--ink)" : "var(--paper-bright)",
                    color: active ? "var(--paper-bright)" : "var(--ink-muted)",
                    borderColor: active ? "var(--ink)" : "var(--ink-faint)",
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textDecoration: g.tableCite ? "underline" : undefined,
                  }}
                  title={g.tableCite ? `Open ${name} on the drawings` : name}
                >
                  {name.replace(/ SCHEDULE$/i, "")}
                  <span style={{ opacity: 0.75 }}> · {g.qtyTotal || g.lines.length}</span>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: "0 12px 24px" }}>
          {tab === "takeoff" ? (
            !lines.length ? (
              <div style={{ padding: "56px 24px", textAlign: "center", color: "var(--ink-muted)", fontSize: 14, lineHeight: 1.5 }}>
                No finished takeoff yet.<br />
                Run Agent with a complete HVAC or BAS takeoff goal — compiled quantities land here.
              </div>
            ) : (
              familyGroups.map((group) => {
                const lead = group.leadColumns || [];
                const specs = group.specColumns || [];
                const name = familyLabel(group.family);
                const showStatus = group.lines.some((l) => l.status);
                return (
                  <section
                    key={name}
                    id={`takeoff-family-${encodeURIComponent(name)}`}
                    style={{ marginTop: 20, scrollMarginTop: 12 }}
                  >
                    <h3 style={{
                      margin: "0 8px 10px", fontSize: 13.5, fontWeight: 650,
                      color: "var(--ink)", display: "flex", gap: 12, alignItems: "baseline",
                      flexWrap: "wrap", letterSpacing: "-0.01em",
                    }}>
                      <CiteValue
                        text={name}
                        cite={group.tableCite}
                        onOpenCitation={onOpenCitation}
                        weight={650}
                        title={`Open ${name} schedule table on the drawings`}
                      />
                      <span style={{
                        fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 500,
                        letterSpacing: "0.04em", color: "var(--ink-muted)",
                      }}>
                        {group.lines.length} line{group.lines.length === 1 ? "" : "s"}
                        {group.qtyTotal ? ` · ${group.qtyTotal} EA` : ""}
                        {group.specTotal
                          ? ` · ${specs.length}${group.specTotal > specs.length ? `/${group.specTotal}` : ""} fields`
                          : ""}
                      </span>
                    </h3>
                    <div style={{
                      overflowX: "auto",
                      border: "1px solid var(--ink-faint)",
                      borderRadius: 6,
                      background: "var(--paper-bright)",
                    }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                        <thead>
                          <tr>
                            {lead.map((c, i) => (
                              <th key={c.key} style={{
                                ...th,
                                textAlign: c.key === "qty" ? "right" : "left",
                                left: i === 0 ? 0 : undefined,
                                zIndex: i === 0 ? 2 : 1,
                                boxShadow: i === 0 ? "2px 0 0 var(--ink-faint)" : undefined,
                              }}>{c.label}</th>
                            ))}
                            {specs.map((c) => (
                              <th key={c} style={th}>{c}</th>
                            ))}
                            <th style={th}>Sheet</th>
                            {showStatus ? <th style={th}>Status</th> : null}
                            <th style={th} />
                          </tr>
                        </thead>
                        <tbody>
                          {group.lines.map((line) => (
                            <tr key={line.id}>
                              {lead.map((c, i) => {
                                const val = lineLeadValue(line, c.key);
                                const isTag = c.key === "tag";
                                const isQty = c.key === "qty";
                                // Tag (and qty) jump to the schedule ROW — not each scattered cell.
                                const cite = isTag || isQty ? lineLeadCite(line, "tag") : null;
                                return (
                                  <td
                                    key={c.key}
                                    style={{
                                      ...td,
                                      fontSize: isTag ? 12 : 13,
                                      textAlign: isQty ? "right" : "left",
                                      whiteSpace: isTag ? "nowrap" : undefined,
                                      position: i === 0 ? "sticky" : undefined,
                                      left: i === 0 ? 0 : undefined,
                                      background: i === 0 ? "var(--paper-bright)" : undefined,
                                      boxShadow: i === 0 ? "2px 0 0 var(--ink-faint)" : undefined,
                                    }}
                                  >
                                    <CiteValue
                                      text={val}
                                      cite={cite}
                                      onOpenCitation={onOpenCitation}
                                      align={isQty ? "right" : "left"}
                                      mono={isTag}
                                      weight={isTag || isQty ? 650 : 400}
                                    />
                                  </td>
                                );
                              })}
                              {specs.map((c) => {
                                const v = lineSpecValue(line, c);
                                return (
                                  <td key={c} style={{
                                    ...td, fontSize: 12.5, fontVariantNumeric: "tabular-nums",
                                    whiteSpace: "nowrap",
                                    color: v ? "var(--ink)" : "var(--ink-faint)",
                                  }}>
                                    {/* Specs belong to the row — use Tag to jump; keep values readable. */}
                                    {v || "—"}
                                  </td>
                                );
                              })}
                              <td style={{ ...td, fontSize: 12, color: "var(--ink-muted)", whiteSpace: "nowrap" }}
                                title={line.plan_sheet_id || line.schedule_sheet_id || line.sheet_id || ""}>
                                {shortSheet(line.plan_sheet_id || line.schedule_sheet_id || line.sheet_id)}
                              </td>
                              {showStatus ? (
                                <td style={{ ...td, fontSize: 12, color: "var(--ink-muted)" }}>
                                  {line.status || "—"}
                                  {line.notes ? (
                                    <div style={{ marginTop: 2, maxWidth: 160, whiteSpace: "normal" }}>{line.notes}</div>
                                  ) : null}
                                </td>
                              ) : null}
                              <td style={{ ...td, whiteSpace: "nowrap" }}>
                                {typeof onOpenCitation === "function" && line.sheet_id && line.bbox_px && (
                                  <button type="button" onClick={() => onOpenCitation({
                                    sheet_id: line.sheet_id,
                                    bbox_px: line.bbox_px,
                                    tag: line.tag,
                                    column: "MARK",
                                    field: "MARK",
                                    value: line.tag,
                                    table_title: line.table_title,
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
                    </div>
                    {group.specTotal > specs.length && (
                      <div style={{
                        margin: "6px 10px 0", fontSize: 11.5, color: "var(--ink-muted)",
                        fontFamily: "var(--f-mono)",
                      }}>
                        +{group.specTotal - specs.length} more fields in Excel / CSV export
                      </div>
                    )}
                  </section>
                );
              })
            )
          ) : (
            !rows.length ? (
              <div style={{ padding: "56px 24px", textAlign: "center", color: "var(--ink-muted)", fontSize: 14 }}>
                No workflow evidence yet. Field-level Agent results land here for audit.
              </div>
            ) : (
              bySchedule.map(([schedule, group]) => (
                <section key={schedule} style={{ marginTop: 18 }}>
                  <h3 style={{
                    margin: "0 8px 8px", fontSize: 13, fontWeight: 650,
                    color: "var(--ink-muted)", display: "flex", gap: 10, alignItems: "baseline",
                  }}>
                    <span>{schedule}</span>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 500 }}>
                      {group.length} field{group.length === 1 ? "" : "s"}
                    </span>
                  </h3>
                  <div style={{
                    overflowX: "auto",
                    border: "1px solid var(--ink-faint)",
                    borderRadius: 6,
                  }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={th}>Tag</th>
                          <th style={th}>Field</th>
                          <th style={th}>Value</th>
                          <th style={th}>Unit</th>
                          <th style={th}>Sheet</th>
                          <th style={th}>Source</th>
                          <th style={th} />
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((r) => (
                          <tr key={r.id}>
                            <td style={{ ...td, fontFamily: "var(--f-mono)", fontSize: 12 }}>{r.tag || "—"}</td>
                            <td style={{ ...td, fontSize: 12.5 }}>{String(r.field ?? "")}</td>
                            <td style={{ ...td, fontWeight: 600, fontSize: 12.5 }}>
                              {typeof r.value === "object" && r.value != null
                                ? String(r.value.text ?? r.value.value ?? "")
                                : String(r.value ?? "")}
                            </td>
                            <td style={td}>{r.unit || "—"}</td>
                            <td style={{ ...td, fontSize: 12, color: "var(--ink-muted)" }}
                              title={r.sheet_id || ""}>
                              {shortSheet(r.sheet_id)}
                            </td>
                            <td style={{ ...td, fontSize: 11, fontFamily: "var(--f-mono)", color: "var(--ink-muted)" }}>
                              {r.source_tool || "—"}
                            </td>
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
                  </div>
                </section>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}
