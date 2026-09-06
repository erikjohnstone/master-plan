// SchedulesPanel — what the index actually found, as an object you can open.
//
// The engine reads schedules well. Nothing in the product let a person LOOK at
// what it read: indexing finished, the status bar said "Indexed · schedules
// ready", and every table — with its rows, its columns, and a bbox on every
// single cell — sat in the graph cache reachable only by asking the agent for
// one by name. An estimator could not answer "what did you find?" without
// running a takeoff.
//
// This is that browse surface. It fetches nothing: `tables` comes straight from
// the already-warm graph (graphPrewarm has usually finished before the panel is
// ever opened). Every click paints the real ink on the real sheet through the
// same agentHighlightCitation → flyToMarkup path the Takeoff panel's cites use.
//
// Docked, not modal (RollPanel's shell): the whole point is looking at a table
// and the drawing it came from AT THE SAME TIME. A modal covering the sheet
// would defeat the feature.
import React, { useMemo, useState } from "react";
import { Icon } from "../brand/icons.jsx";
import {
  tableTitleText, rowBbox, rowSheet, splitSheetKey,
  summarize, filterTables, tableId, readingOrder,
} from "../lib/scheduleBrowse.js";

/** How many rows to render before asking. A points list runs to hundreds and
 *  the panel must stay responsive on a 100-table set. */
const ROW_CHUNK = 40;

const KIND_LABEL = {
  "room-finish": "room finish",
  finish: "finish",
  equipment: "equipment",
  reference: "reference",
  unknown: "",
};

function Chip({ children, tone }) {
  return (
    <span style={{
      fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)", lineHeight: 1.6,
      padding: "0 5px", color: tone || "var(--ink-muted)",
      border: "1px solid var(--ink-faint)", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

/** One table: a header that expands, a View that paints the whole table, and
 *  rows whose keys paint themselves. */
function TableSection({ table, expanded, onToggle, sheetLabel, onPaint }) {
  const [shown, setShown] = useState(ROW_CHUNK);
  const title = tableTitleText(table) || "Untitled schedule";
  const rows = table.rows || [];
  const headers = table.headers || [];
  const kind = KIND_LABEL[table.kind] || "";
  const { page } = splitSheetKey(table.sheet);
  const continued = (table.parts || []).length > 1;
  // A SHEET CHIP AN ESTIMATOR CAN READ. tabLabel falls back to the file's
  // basename, and an uploaded set is stored content-addressed — so the chip
  // rendered a 64-character sha256 next to every schedule. Page number is what
  // someone flipping through a set actually uses; the real label is used only
  // when it IS one.
  const sheetChip = useMemo(() => {
    const raw = sheetLabel ? String(sheetLabel(table.sheet) || "") : "";
    const looksHashed = !raw || /[0-9a-f]{16,}/i.test(raw);
    return looksHashed ? `p.${page}` : raw;
  }, [sheetLabel, table.sheet, page]);

  return (
    <div data-schedule-section title={table.sheet} style={{ borderBottom: "1px solid var(--ink-faint)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "8px 10px" }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          title={expanded ? "Collapse" : "Show this schedule's rows"}
          style={{
            flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3,
            border: "none", background: "transparent", padding: 0, textAlign: "left",
            cursor: "pointer", color: "var(--ink)", font: "inherit",
          }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-muted)", fontSize: "var(--fs-xs)" }}>{expanded ? "▾" : "▸"}</span>
            <strong style={{
              fontSize: "var(--fs-s)", lineHeight: 1.35,
              color: tableTitleText(table) ? "var(--ink)" : "var(--ink-muted)",
              fontStyle: tableTitleText(table) ? "normal" : "italic",
            }}>{title}</strong>
          </span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 16 }}>
            <Chip>{sheetChip}</Chip>
            <Chip>{rows.length} {rows.length === 1 ? "row" : "rows"}</Chip>
            <Chip>{headers.length} cols</Chip>
            {kind ? <Chip>{kind}</Chip> : null}
            {/* A schedule that runs across sheets is ONE table here, as it is
                one table on paper — but say so, because its rows cite
                different sheets and that would otherwise look wrong. */}
            {continued ? <Chip tone="var(--cobalt)">continues · {table.parts.length} sheets</Chip> : null}
            {table.rotated_headers ? <Chip>rotated headers</Chip> : null}
          </span>
        </button>
        <button
          type="button"
          title="Show this whole schedule on the drawing"
          onClick={() => onPaint({ kind: "table", table })}
          style={{
            flexShrink: 0, padding: "2px 8px", border: "1px solid var(--ink-faint)",
            background: "transparent", color: "var(--ink-soft)", cursor: "pointer",
            fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)",
          }}>View</button>
      </div>

      {expanded && (
        <div style={{ padding: "0 10px 10px 26px" }}>
          {headers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
              {headers.map((h, i) => (
                <span key={`${h}-${i}`} style={{
                  fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-muted)",
                  background: "var(--tint-select)", padding: "0 4px",
                }}>{h || "—"}</span>
              ))}
            </div>
          )}
          {rows.length === 0 ? (
            <div style={{ fontSize: "var(--fs-s)", color: "var(--ink-muted)", lineHeight: 1.5 }}>
              The table was found but carries no rows — its region is on the sheet, so View still shows you where.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {rows.slice(0, shown).map((r, i) => {
                const bbox = rowBbox(r);
                // A row with no usable cell geometry cannot be cited. Show it —
                // it is still a row the engine read — but do not offer a jump
                // that would land nowhere.
                const label = r.key || "—";
                const preview = headers
                  .map((h) => r.cells?.[h]?.text)
                  .filter((v) => v != null && v !== "" && v !== label)
                  .slice(0, 3).join(" · ");
                return (
                  <div key={`${label}-${i}`} style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: "var(--fs-s)", lineHeight: 1.45 }}>
                    {bbox ? (
                      <button
                        type="button"
                        title={`Show ${label} on the drawing`}
                        onClick={() => onPaint({ kind: "row", table, row: r, bbox })}
                        style={{
                          border: "none", background: "transparent", padding: 0, cursor: "pointer",
                          font: "inherit", fontFamily: "var(--f-mono)", fontWeight: 600, color: "var(--ink)",
                          textDecoration: "underline",
                          textDecorationColor: "color-mix(in srgb, var(--ink) 28%, transparent)",
                          textUnderlineOffset: 3, flexShrink: 0,
                        }}>{label}</button>
                    ) : (
                      <span style={{ fontFamily: "var(--f-mono)", fontWeight: 600, color: "var(--ink-muted)" }} title="This row has no cell geometry to jump to">{label}</span>
                    )}
                    <span style={{ color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</span>
                  </div>
                );
              })}
              {rows.length > shown && (
                <button
                  type="button"
                  onClick={() => setShown((n) => n + ROW_CHUNK)}
                  style={{
                    alignSelf: "flex-start", marginTop: 4, padding: "2px 8px",
                    border: "1px solid var(--ink-faint)", background: "transparent",
                    color: "var(--ink-soft)", cursor: "pointer",
                    fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)",
                  }}>show {Math.min(ROW_CHUNK, rows.length - shown)} more of {rows.length}</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SchedulesPanel({
  tables = [], prewarm = { phase: "idle" }, indexing = false,
  sheetLabel, onPaint, onClose,
}) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);

  const ordered = useMemo(() => readingOrder(tables), [tables]);
  const shown = useMemo(() => filterTables(ordered, q), [ordered, q]);
  const totals = useMemo(() => summarize(tables), [tables]);

  const phase = prewarm?.phase || "idle";
  // The three states that are not "here are your schedules" each say something
  // different and actionable. Tier 0 established that a failed schedule pass is
  // not a footnote; this panel is where the failure gets its full sentence.
  const notReady =
    phase === "error" ? {
      tone: "var(--c-danger)",
      title: "Schedule indexing failed",
      body: `${prewarm.message || "The index could not be built."} The PDF text index is unaffected, so find_text and a manual takeoff still work. Re-open the plan set to try again.`,
    } : phase === "warming" ? {
      tone: "var(--ink-soft)",
      title: "Reading the schedules…",
      body: "Every sheet is being parsed for tables. This runs once per plan set and is cached — a reload of the same set is a cache hit, not a rebuild.",
    } : (phase === "idle" || !tables.length) && !indexing ? {
      tone: "var(--ink-soft)",
      title: tables.length ? "" : "No schedules found",
      body: phase === "idle"
        ? "Open a plan set and its schedules are indexed automatically."
        : "The set was indexed, but no schedule tables were recognised on any sheet. Scanned sheets with no text layer are the usual reason.",
    } : null;

  return (
    <div data-schedules-panel style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--ink-faint)", background: "var(--paper-bright)", overflow: "hidden", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "var(--ink)", color: "var(--paper-cream)" }}>
        <Icon name="spec" size={15} />
        <strong style={{ flex: 1, fontSize: 12.5 }}>
          Schedules{totals.tables ? ` · ${totals.tables}` : ""}
        </strong>
        <button onClick={onClose} title="Close panel" style={{ border: "none", background: "transparent", color: "var(--paper-cream)", fontSize: 16, cursor: "pointer", padding: "0 2px" }}>×</button>
      </div>

      {totals.tables > 0 && (
        <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--ink-faint)", display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ fontSize: "var(--fs-s)", color: "var(--ink-soft)", lineHeight: 1.45 }}>
            <b style={{ color: "var(--ink)" }}>{totals.tables}</b> schedule{totals.tables === 1 ? "" : "s"} across{" "}
            <b style={{ color: "var(--ink)" }}>{totals.sheets}</b> sheet{totals.sheets === 1 ? "" : "s"} ·{" "}
            <b style={{ color: "var(--ink)" }}>{totals.rows}</b> row{totals.rows === 1 ? "" : "s"}
          </div>
          <input
            className="text-input"
            name="schedule-filter"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter title, column, tag, sheet…"
            style={{ width: "100%", fontSize: "var(--fs-s)" }}
          />
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-muted)", lineHeight: 1.45 }}>
            Click a schedule's <b>View</b>, or any tag, to show it on the drawing.
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {notReady ? (
          <div style={{ padding: 14, lineHeight: 1.6, fontSize: "var(--fs-s)" }}>
            {notReady.title ? <strong style={{ display: "block", color: notReady.tone, marginBottom: 4 }}>{notReady.title}</strong> : null}
            <span style={{ color: "var(--ink-soft)" }}>{notReady.body}</span>
          </div>
        ) : shown.length === 0 ? (
          <div style={{ padding: 14, color: "var(--ink-muted)", fontSize: "var(--fs-s)", lineHeight: 1.6 }}>
            Nothing matches “{q}”. {totals.tables} schedule{totals.tables === 1 ? "" : "s"} indexed.
          </div>
        ) : (
          shown.map((t) => {
            const id = tableId(t);
            return (
              <TableSection
                key={id}
                table={t}
                expanded={openId === id}
                onToggle={() => setOpenId((cur) => (cur === id ? null : id))}
                sheetLabel={sheetLabel}
                onPaint={onPaint}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

export { rowSheet };
