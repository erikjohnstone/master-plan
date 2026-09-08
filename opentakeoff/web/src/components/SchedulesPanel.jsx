// Browse only: tables, cells and geometry are owned by the shared graph.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../brand/icons.jsx";
import { useRevealDrawing } from "./WorkspaceDock.jsx";
import { tableTitleText, rowBbox, rowSheet, splitSheetKey,
  summarize, filterTables, tableId, groupBySheet } from "../lib/scheduleBrowse.js";

const ROW_CHUNK = 40;
const titleOf = table => tableTitleText(table) || "Untitled schedule";

function ScheduleGrid({ table, onPaint }) {
  const [shown, setShown] = useState(ROW_CHUNK);
  const [selectedRow, setSelectedRow] = useState(null);
  const rows = table.rows || [], headers = table.headers || [];
  return (
    <article className="schedule-detail" data-schedule-detail={tableId(table)}>
      <header className="schedule-detail-heading">
        <div><h3>{titleOf(table)}</h3>
          <p>{rows.length} rows · {headers.length} columns · {table.kind || "unknown"}
            {(table.parts || []).length > 1 && <> · continues · {table.parts.length} sheets</>}
            {table.rotated_headers && <> · rotated headers</>}
          </p>
        </div>
        <button type="button" onClick={() => onPaint({ kind: "table", table })}
          title="Show this whole schedule on the drawing">Show on plan</button>
      </header>
      {!rows.length ? <p className="workspace-empty">The table was found but carries no rows. Show on plan opens its region.</p> : (
        <div className="schedule-grid-scroll" role="region" aria-label={titleOf(table) + " rows"} tabIndex={0}>
          <table className="schedule-grid">
            <caption className="workspace-sr-only">{titleOf(table)} — extracted cells, unchanged</caption>
            <thead><tr><th scope="col">Row / tag</th>{headers.map((h,i) => <th scope="col" key={i}>{h}</th>)}</tr></thead>
            <tbody>{rows.slice(0,shown).map((row,i) => {
              const bbox = rowBbox(row), label = row.key || "—";
              return <tr key={i} data-selected={selectedRow === i || undefined}>
                <th scope="row">{bbox ? <button type="button" title={"Show " + label + " on the drawing"}
                  aria-pressed={selectedRow === i}
                  onClick={() => { setSelectedRow(i); onPaint({kind:"row", table, row, bbox}); }}>{label}</button>
                  : <span title="This row has no cell geometry to jump to">{label}</span>}</th>
                {headers.map((h,j) => <td key={j}>{row.cells?.[h]?.text ?? ""}</td>)}
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
      {rows.length > shown && <button className="schedule-more" type="button" onClick={() => setShown(n => n+ROW_CHUNK)}>
        Show {Math.min(ROW_CHUNK,rows.length-shown)} more of {rows.length} rows
      </button>}
    </article>
  );
}

export default function SchedulesPanel({
  tables = [], prewarm = {phase:"idle"}, indexing = false, sheetLabel, onPaint, onClose,
}) {
  const [q,setQ] = useState("");
  const [sheet,setSheet] = useState("");
  const [kind,setKind] = useState("");
  const [openIds,setOpenIds] = useState(() => new Set());
  const [selected,setSelected] = useState(null);
  const detail = useRef(null);
  const revealDrawing = useRevealDrawing();
  const paint = payload => { revealDrawing(); onPaint(payload); };
  // Facets choose what is visible; never copy or change a table.
  const shown = useMemo(() => filterTables(tables,q).filter(t => (!sheet || t.sheet === sheet) && (!kind || t.kind === kind)),[tables,q,sheet,kind]);
  const groups = useMemo(() => groupBySheet(shown),[shown]);
  const allGroups = useMemo(() => groupBySheet(tables),[tables]);
  const kinds = useMemo(() => [...new Set(tables.map(t=>t.kind).filter(Boolean))],[tables]);
  const totals = useMemo(() => summarize(tables),[tables]);
  const filtered = useMemo(() => summarize(shown),[shown]);
  const filtering = shown.length !== tables.length;
  const allIds = useMemo(() => shown.map(tableId),[shown]);
  const allOpen = allIds.length > 0 && allIds.every(id => openIds.has(id));
  const opened = shown.filter(t => openIds.has(tableId(t)));
  useEffect(() => {
    setOpenIds(prev => {
      const live = new Set(allIds), next = new Set([...prev].filter(id=>live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  },[allIds]);
  useEffect(() => {
    if (!selected) return;
    const node = [...(detail.current?.querySelectorAll('[data-schedule-detail]') || [])].find(el=>el.dataset.scheduleDetail === selected);
    node?.scrollIntoView({block:"nearest"});
  },[selected,openIds]);
  const labelOf = key => {
    const raw = sheetLabel ? String(sheetLabel(key) || "") : "";
    return !raw || /[0-9a-f]{16,}/i.test(raw) ? "Sheet " + splitSheetKey(key).page : raw;
  };
  const phase = prewarm?.phase || "idle";
  const loading = indexing || phase === "warming";
  const clear = () => { setQ(""); setSheet(""); setKind(""); };
  return (
    <div data-schedules-panel className="schedules-workspace">
      <header className="workspace-panel-heading">
        <Icon name="spec" size={16}/><h2>Schedules{totals.tables ? " · " + totals.tables : ""}</h2>
        <button type="button" title="Close panel" aria-label="Close schedules" onClick={onClose}>×</button>
      </header>
      {totals.tables > 0 && <div className="schedule-search">
        <div data-schedules-summary>
          {filtering ? <><b>{filtered.tables}</b> of {totals.tables} schedules · <b>{filtered.sheets}</b> sheets · <b>{filtered.rows}</b> rows</>
            : <><b>{totals.tables}</b> schedules across <b>{totals.sheets}</b> sheets · <b>{totals.rows}</b> rows</>}
        </div>
        <input className="text-input" name="schedule-filter" aria-label="Search schedules" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search title, column, tag, sheet, kind…"/>
        <div className="schedule-facets">
          <select aria-label="Filter schedules by sheet" value={sheet} onChange={e=>setSheet(e.target.value)}>
            <option value="">All sheets</option>{allGroups.map(g=><option key={g.sheet} value={g.sheet}>{labelOf(g.sheet)}</option>)}
          </select>
          <select aria-label="Filter schedules by kind" value={kind} onChange={e=>setKind(e.target.value)}>
            <option value="">All kinds</option>{kinds.map(k=><option key={k} value={k}>{k}</option>)}
          </select>
          {(q||sheet||kind) && <button type="button" onClick={clear}>Clear filters</button>}
        </div>
      </div>}
      {phase === "error" ? <div className="workspace-empty" role="alert"><h3>Schedule indexing failed</h3><p>{prewarm.message || "The index could not be built."}</p><p>The PDF text index is unaffected. Re-open the plan set to try again.</p></div>
        : loading && !tables.length ? <div className="workspace-empty" role="status"><h3>Reading the schedules…</h3><p>Checking every sheet for tables. Results appear here when indexing finishes.</p></div>
        : !tables.length ? <div className="workspace-empty"><h3>{phase === "idle" ? "Your schedule workspace" : "No schedules found"}</h3><p>{phase === "idle" ? "Open a plan set. Its indexed schedules will appear here, linked to their drawing evidence." : "This set has no recognised schedule tables. You can still browse its drawings and text."}</p></div>
        : !shown.length ? <div className="workspace-empty"><h3>No matching schedules</h3><p>{totals.tables} schedules indexed. Try another title, tag, sheet or kind.</p><button type="button" onClick={clear}>Clear filters</button></div>
        : <div className="schedule-master-detail">
          <nav className="schedule-navigator" aria-label="Indexed schedules">
            <div className="schedule-navigator-tools"><button type="button" data-schedules-expand-all onClick={()=>setOpenIds(allOpen?new Set():new Set(allIds))}>
              {allOpen ? "collapse all" : "expand all (" + allIds.length + ")"}
            </button></div>
            {groups.map(g=><section key={g.sheet} data-schedule-sheet={g.sheet}>
              <header title={g.sheet}><strong>{labelOf(g.sheet)}</strong><span>{g.tables.length} schedules</span></header>
              {g.tables.map(table=>{
                const id=tableId(table), expanded=openIds.has(id);
                return <div key={id} data-schedule-section data-current={selected===id || undefined}>
                  <button type="button" aria-expanded={expanded} onClick={()=>{
                    setSelected(id);
                    setOpenIds(prev=>{const next=new Set(prev); next.has(id)?next.delete(id):next.add(id);return next;});
                  }} title={expanded ? "Collapse" : "Show this schedule's rows"}>
                    <strong>{titleOf(table)}</strong><span>{table.rows?.length||0} rows · {table.headers?.length||0} cols</span>
                    {(table.parts||[]).length>1 && <span>continues · {table.parts.length} sheets</span>}
                  </button>
                  <div className="schedule-nav-actions">
                    <span>{table.kind || "unknown"}</span>
                    <button type="button" title="Show this whole schedule on the drawing" onClick={()=>paint({kind:"table",table})}>View</button>
                  </div>
                </div>;
              })}
            </section>)}
          </nav>
          <div className="schedule-details" ref={detail}>
            {!opened.length ? <div className="workspace-empty"><span className="t-label">Schedule evidence</span><h3>Select a schedule</h3><p>Read every extracted column, then use a row’s tag to locate its exact ink on the drawing.</p><p>Open multiple schedules to compare. Wide tables scroll within their grid.</p></div>
              : opened.map(table=><ScheduleGrid key={tableId(table)} table={table} onPaint={paint}/>)}
          </div>
        </div>}
    </div>
  );
}
export { rowSheet };
