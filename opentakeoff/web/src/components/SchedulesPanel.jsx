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
//
// ORGANISED BY SHEET, because that is how the set is organised. The first
// version was a flat list in reading order with one table expandable at a time,
// which on a real MEP set is 24 schedules over 10 sheets presented as an
// undifferentiated scroll — you could not tell where you were, and you could
// not hold two schedules open to compare them.
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../brand/icons.jsx";
import {
  tableTitleText, rowBbox, rowSheet, splitSheetKey,
  summarize, filterTables, tableId, groupBySheet, previewColumns,
} from "../lib/scheduleBrowse.js";

/** How many rows to render before asking. A points list runs to hundreds and
 *  the panel must stay responsive on a 100-table set. */
const ROW_CHUNK = 40;
/** Column names shown before "+N more". A wide MEP equipment schedule has
 *  15-25 of them, and uncapped they were the dominant visual mass of an
 *  expanded section — a wall of chips before a single ROW appeared, which is
 *  what a person actually opened the schedule to see. */
const HEADER_CHIPS = 6;

const KIND_LABEL = {
  "room-finish": "room finish",
  finish: "finish",
  equipment: "equipment",
  reference: "reference",
  unknown: "",
};

function Chip({ children, tone, onClick, title }) {
  const style = {
    fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)", lineHeight: 1.6,
    padding: "0 5px", color: tone || "var(--ink-muted)",
    border: `1px solid ${tone ? "currentColor" : "var(--ink-faint)"}`,
    whiteSpace: "nowrap", background: "transparent",
  };
  if (!onClick) return <span style={style}>{children}</span>;
  return <button type="button" title={title} onClick={onClick} style={{ ...style, cursor: "pointer", font: "inherit", fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)" }}>{children}</button>;
}

/** One table: a header that expands, a View that paints the whole table, and
 *  rows whose keys paint themselves. */
function TableSection({ table, expanded, onToggle, sheetLabel, onPaint, onKind }) {
  const [shown, setShown] = useState(ROW_CHUNK);
  const [allHeaders, setAllHeaders] = useState(false);
  const title = tableTitleText(table) || "Untitled schedule";
  const rows = table.rows || [];
  // memoised because previewColumns depends on it: `table.headers || []`
  // allocates a NEW array every render, so an un-memoised value would re-rank
  // the columns of every open schedule on every keystroke in the filter.
  const headers = useMemo(() => table.headers || [], [table.headers]);
  const kind = KIND_LABEL[table.kind] || "";
  const { page } = splitSheetKey(table.sheet);
  const continued = (table.parts || []).length > 1;
  // WHICH COLUMNS TO SHOW BESIDE A TAG. Header order gave whatever the schedule
  // happened to print first; this gives what identifies and sizes the thing.
  const preview = useMemo(() => previewColumns(headers), [headers]);
  // The sheet no longer needs a chip per table: the sticky group header above
  // these sections says which sheet they are on, once, for all of them.
  void page; void sheetLabel;

  return (
    <div data-schedule-section title={table.sheet} style={{ borderBottom: "1px solid var(--ink-faint)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "8px 10px" }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          title={expanded ? "Collapse" : "Show this schedule's rows"}
          style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", color: "var(--ink)", font: "inherit" }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-muted)", fontSize: "var(--fs-xs)" }}>{expanded ? "▾" : "▸"}</span>
            <strong style={{ fontSize: "var(--fs-s)", lineHeight: 1.35, color: tableTitleText(table) ? "var(--ink)" : "var(--ink-muted)", fontStyle: tableTitleText(table) ? "normal" : "italic" }}>{title}</strong>
          </span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 16 }}>
            <Chip>{rows.length} {rows.length === 1 ? "row" : "rows"}</Chip>
            <Chip>{headers.length} cols</Chip>

            {/* A schedule that runs across sheets is ONE table here, as it is
                one table on paper — but say so, because its rows cite
                different sheets and that would otherwise look wrong. */}
            {continued ? <Chip tone="var(--cobalt)">continues · {table.parts.length} sheets</Chip> : null}
            {table.rotated_headers ? <Chip>rotated headers</Chip> : null}
          </span>
        </button>
        {/* The KIND is a category, not a fourth statistic, so it filters —
            typing "equipment" into the filter used to match nothing while the
            panel printed it on every row, a facet you can see but cannot use.
            It is a sibling of the expander, never a child: an interactive
            element inside the expander button swallows the click that was
            meant to open the schedule (measured — the driver's own row-tag
            check went red). Quiet styling, because on a set where every table
            shares one kind a column of loud chips is noise beside View. */}
        {kind ? (
          <button
            type="button"
            title={`Show only ${kind} schedules`}
            onClick={() => onKind(table.kind)}
            style={{ flexShrink: 0, padding: "2px 6px", border: "1px dashed var(--ink-faint)", background: "transparent", color: "var(--ink-soft)", cursor: "pointer", fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)" }}>{kind}</button>
        ) : null}
        <button
          type="button"
          title="Show this whole schedule on the drawing"
          onClick={() => onPaint({ kind: "table", table })}
          style={{ flexShrink: 0, padding: "2px 8px", border: "1px solid var(--ink-faint)", background: "transparent", color: "var(--ink-soft)", cursor: "pointer", fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)" }}>View</button>
      </div>

      {expanded && (
        <div style={{ padding: "0 10px 10px 26px" }}>
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
                const line = preview
                  .map((h) => r.cells?.[h]?.text)
                  .filter((v) => v != null && v !== "" && v !== label)
                  .join(" · ");
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
                    <span style={{ color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
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
          {/* THE COLUMNS COME AFTER THE ROWS. They used to come first and
              uncapped: 15-25 chips wrapping in a 360px column before a single
              row appeared. They are reference, not the answer. */}
          {headers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 8, paddingTop: 6, borderTop: "1px dashed var(--ink-faint)" }}>
              {(allHeaders ? headers : headers.slice(0, HEADER_CHIPS)).map((h, i) => (
                <span key={`${h}-${i}`} style={{
                  fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-muted)",
                  background: "var(--tint-select)", padding: "0 4px",
                }}>{h || "—"}</span>
              ))}
              {headers.length > HEADER_CHIPS && (
                <button type="button" onClick={() => setAllHeaders((v) => !v)}
                  style={{ border: "none", background: "transparent", color: "var(--ink-soft)", cursor: "pointer", fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)", padding: "0 4px" }}>
                  {allHeaders ? "fewer columns" : `+${headers.length - HEADER_CHIPS} more columns`}
                </button>
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
  // A SET, not a single id. One-at-a-time made comparing two schedules
  // impossible, which is most of what an estimator does with a schedule index.
  const [openIds, setOpenIds] = useState(() => new Set());

  const shown = useMemo(() => filterTables(tables, q), [tables, q]);
  const groups = useMemo(() => groupBySheet(shown), [shown]);
  const totals = useMemo(() => summarize(tables), [tables]);
  const filtered = useMemo(() => summarize(shown), [shown]);
  const filtering = shown.length !== tables.length;

  // A section that scrolls out of the filter keeps no business being "open".
  useEffect(() => {
    setOpenIds((prev) => {
      if (!prev.size) return prev;
      const live = new Set(shown.map(tableId));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [shown]);

  const allIds = useMemo(() => shown.map(tableId), [shown]);
  const allOpen = allIds.length > 0 && allIds.every((id) => openIds.has(id));

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
          {/* THE COUNT FOLLOWS THE FILTER. It used to count the unfiltered set
              while the list below showed something else, so the one number on
              screen described a list nobody was looking at. */}
          <div style={{ fontSize: "var(--fs-s)", color: "var(--ink-soft)", lineHeight: 1.45 }}>
            {filtering ? (
              <>
                <b style={{ color: "var(--ink)" }}>{filtered.tables}</b> of {totals.tables} schedule{totals.tables === 1 ? "" : "s"} ·{" "}
                <b style={{ color: "var(--ink)" }}>{filtered.sheets}</b> sheet{filtered.sheets === 1 ? "" : "s"} ·{" "}
                <b style={{ color: "var(--ink)" }}>{filtered.rows}</b> row{filtered.rows === 1 ? "" : "s"}
              </>
            ) : (
              <>
                <b style={{ color: "var(--ink)" }}>{totals.tables}</b> schedule{totals.tables === 1 ? "" : "s"} across{" "}
                <b style={{ color: "var(--ink)" }}>{totals.sheets}</b> sheet{totals.sheets === 1 ? "" : "s"} ·{" "}
                <b style={{ color: "var(--ink)" }}>{totals.rows}</b> row{totals.rows === 1 ? "" : "s"}
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              className="text-input"
              name="schedule-filter"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter title, column, tag, sheet, kind…"
              style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-s)" }}
            />
            {q ? (
              <button type="button" onClick={() => setQ("")} title="Clear the filter"
                style={{ padding: "2px 8px", border: "1px solid var(--ink-faint)", background: "transparent", color: "var(--ink-soft)", cursor: "pointer", fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)" }}>clear</button>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" data-schedules-expand-all
              onClick={() => setOpenIds(allOpen ? new Set() : new Set(allIds))}
              disabled={!allIds.length}
              style={{ padding: "2px 8px", border: "1px solid var(--ink-faint)", background: "transparent", color: "var(--ink-soft)", cursor: allIds.length ? "pointer" : "default", fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)" }}>
              {allOpen ? "collapse all" : `expand all${allIds.length ? ` (${allIds.length})` : ""}`}
            </button>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-muted)", lineHeight: 1.45 }}>
              Click <b>View</b>, or any tag, to show it on the drawing.
            </span>
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
          groups.map((g) => {
            const raw = sheetLabel ? String(sheetLabel(g.sheet) || "") : "";
            const looksHashed = !raw || /[0-9a-f]{16,}/i.test(raw);
            const label = looksHashed ? `Sheet ${g.page}` : raw;
            return (
              <section key={g.sheet} data-schedule-sheet={g.sheet}>
                {/* Sticky, because on a 10-sheet set the thing you lose while
                    scrolling is WHICH SHEET you are reading. */}
                <header style={{
                  position: "sticky", top: 0, zIndex: 1,
                  display: "flex", alignItems: "baseline", gap: 6,
                  padding: "5px 10px", background: "var(--tint-select)",
                  borderTop: "1px solid var(--ink-faint)", borderBottom: "1px solid var(--ink-faint)",
                }} title={g.sheet}>
                  <strong style={{ fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)", letterSpacing: "0.06em", color: "var(--ink)" }}>{label}</strong>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-muted)" }}>
                    {g.tables.length} schedule{g.tables.length === 1 ? "" : "s"}
                  </span>
                </header>
                {g.tables.map((t) => {
                  const id = tableId(t);
                  return (
                    <TableSection
                      key={id}
                      table={t}
                      expanded={openIds.has(id)}
                      onToggle={() => setOpenIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id); else next.add(id);
                        return next;
                      })}
                      sheetLabel={sheetLabel}
                      onPaint={onPaint}
                      onKind={(k) => setQ(k)}
                    />
                  );
                })}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

export { rowSheet };
