// Takeoff UI — industry-standard finished takeoff + workflow audit.
// Takeoff tab = compiled quantity schedule (contractor document).
// Workflow data = raw EAV evidence trail. Chat stays conversational.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../brand/icons.jsx";
import {
  compileAgentTakeoff,
  downloadTakeoffCsv,
  downloadTakeoffPdf,
  downloadTakeoffXlsx,
  groupTakeoffByFamily,
  lineLeadCite,
  lineLeadValue,
  lineDiagramCite,
  linePlanCite,
  linePlanTagCite,
  lineScheduleCite,
  lineSpecValue,
} from "../lib/agentTakeoff.js";
import CiteValue from "./CiteValue.jsx";
import BasMathSummary from "./BasMathSummary.jsx";
import BasPointsWorkspace from "./BasPointsWorkspace.jsx";
import BasEquipmentWorkspace from "./BasEquipmentWorkspace.jsx";
import BasProjectReviewWorkspace from "./BasProjectReviewWorkspace.jsx";
import BasSourceReader from "./BasSourceReader.jsx";
import BasSourceComparison from "./BasSourceComparison.jsx";
import BasTakeoffOverview from "./BasTakeoffOverview.jsx";
import BasTakeoffJourney from "./BasTakeoffJourney.jsx";
import { store } from '../lib/store.js';
import { basReviewNavigation } from './basReviewNavigation.ts';
import { completeBasHeaderCoverage } from '../lib/completeBasPresentation.js';

/** Cap visible technical columns so each family table stays readable. */
const UI_SPEC_MAX = 12;

const th = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: "var(--fs-xs)",
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
  fontSize: "var(--fs-m)",
  color: "var(--ink)",
  borderBottom: "1px solid color-mix(in srgb, var(--ink-faint) 70%, transparent)",
  verticalAlign: "top",
};

const tabBtn = (active) => ({
  padding: "10px 16px",
  border: "none",
  borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
  background: "transparent",
  color: active ? "var(--ink)" : "var(--ink-secondary)",
  cursor: "pointer",
  fontFamily: "var(--f-mono)",
  fontSize: "var(--fs-xs)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  fontWeight: 650,
});

const btnStyle = {
  padding: "8px 12px",
  border: "1px solid var(--ink-faint)",
  borderRadius: "var(--r-1)",
  background: "var(--paper)",
  color: "var(--ink)",
  cursor: "pointer",
  fontFamily: "var(--f-mono)",
  fontSize: "var(--fs-xs)",
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

function SourceComparisonActions({ line, onOpenCitation, onCompareCitations, comparisonBusy }) {
  const schedule = lineScheduleCite(line);
  const plan = linePlanCite(line);
  const planTag = linePlanTagCite(line);
  const diagram = lineDiagramCite(line);
  const drawing = plan || diagram;
  const hasPair = Boolean(schedule && drawing);
  const diagramLabel = diagram?.evidence_kind === 'piping'
    ? 'Piping diagram'
    : diagram?.evidence_kind === 'riser'
      ? 'Riser evidence'
      : diagram?.evidence_kind === 'flow'
        ? 'Flow diagram'
        : 'Schematic evidence';
  return <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
    {hasPair && onCompareCitations && <button
      type="button"
      data-source-comparison-action="compare"
      disabled={comparisonBusy}
      onClick={() => onCompareCitations({ plan: drawing, planTag, schedule, tag: line.tag, line })}
      style={{ ...btnStyle, padding: "4px 8px", fontSize: "var(--fs-xs)", textTransform: "none", letterSpacing: 0, color: "var(--paper-bright)", background: "var(--cobalt)", borderColor: "var(--cobalt)" }}
      title={`Compare ${plan ? 'grounded plan match' : 'authored diagram evidence'} on ${drawing?.sheet_id} with source schedule row on ${line.schedule_sheet_id || line.sheet_id}`}
    >
      {comparisonBusy ? 'Opening…' : 'Compare'}
    </button>}
    {schedule && <button
      type="button"
      onClick={() => onOpenCitation?.(schedule)}
      style={{ ...btnStyle, padding: "4px 8px", fontSize: "var(--fs-xs)", textTransform: "none", letterSpacing: 0 }}
      title={`Open the source schedule row on ${line.schedule_sheet_id || line.sheet_id}`}
    >
      Schedule row · {shortSheet(line.schedule_sheet_id || line.sheet_id)}
    </button>}
    {plan ? <button
      type="button"
      onClick={() => onOpenCitation?.(plan)}
      style={{ ...btnStyle, padding: "4px 8px", fontSize: "var(--fs-xs)", textTransform: "none", letterSpacing: 0, color: "var(--cobalt)", borderColor: "var(--cobalt)" }}
      title={`Open the grounded plan match on ${line.plan_sheet_id}`}
    >
      Symbol · {shortSheet(line.plan_sheet_id)}
    </button> : planTag ? <button
      type="button"
      onClick={() => onOpenCitation?.(planTag)}
      data-plan-tag-only
      style={{ ...btnStyle, padding: "4px 8px", fontSize: "var(--fs-xs)", textTransform: "none", letterSpacing: 0, color: "var(--warning, #9a5a00)", borderColor: "var(--warning, #9a5a00)" }}
      title={`Open the exact plan tag on ${planTag.sheet_id}. The nearby device symbol has not been geometrically verified.`}
    >
      Tag only · {shortSheet(planTag.sheet_id)}
    </button> : line.status && <span data-no-plan-match style={{ color: "var(--ink-muted)" }}>No verified plan symbol</span>}
    {plan && planTag && <button
      type="button"
      onClick={() => onOpenCitation?.(planTag)}
      data-plan-tag-evidence
      style={{ ...btnStyle, padding: "4px 8px", fontSize: "var(--fs-xs)", textTransform: "none", letterSpacing: 0 }}
      title={planTag.evidence_binding_status === "geometry_verified"
        ? `Open the exact printed tag attached to the verified symbol on ${planTag.sheet_id}`
        : `Open the exact plan tag on ${planTag.sheet_id}`}
    >
      Tag · {shortSheet(planTag.sheet_id)}
    </button>}
    {!plan && diagram && <button
      type="button"
      onClick={() => onOpenCitation?.(diagram)}
      style={{ ...btnStyle, padding: "4px 8px", fontSize: "var(--fs-xs)", textTransform: "none", letterSpacing: 0, color: "var(--cobalt)", borderColor: "var(--cobalt)" }}
      title={`Open exact authored ${diagramLabel.toLowerCase()} on ${diagram.sheet_id}. This is corroboration, not installed quantity.`}
    >
      {diagramLabel} · {shortSheet(diagram.sheet_id)}
    </button>}
    {line.plan_candidate_count > 0 && <span
      data-plan-candidates-review
      title="Geometry candidates were found but withheld from installed quantity until estimator review."
      style={{ color: "var(--warning, #9a5a00)" }}
    >{line.plan_candidate_count} candidate{line.plan_candidate_count === 1 ? '' : 's'} need review</span>}
  </div>;
}


export default function TakeoffDataPanel({
  rows = [],
  projectName = "",
  corpusMeta = null,
  basWorkflow = null,
  basViewState,
  onBasViewStateChange,
  onBasReview,
  onBasSequenceAiReview,
  onBasDrawingReview,
  onBasRevisionOperation,
  onBasIssueReview,
  onBasScopeReview,
  onBasEquipmentReview,
  onBasAssignmentCalculate,
  onBasAssemblyReview,
  onBasAssemblyCalculate,
  onBasEngineering,
  restoreContext,
  onClear,
  onRemove,
  onRemoveLine,
  onClose,
  onOpenCitation: onCanvasCitation,
  onCompareCitations,
}) {
  const [sourceView, setSourceView] = useState(null);
  const [sourceComparison, setSourceComparison] = useState(null);
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const comparisonRequest = useRef(0);
  const sourceReturn = useRef(null);
  const restoreSourceFocus = useRef(false);
  const sourceContext = useRef(null);
  const adapter = store;
  sourceContext.current = { workflow: basWorkflow, adapter };
  useEffect(() => {
    comparisonRequest.current += 1;
    setSourceView(null); setSourceComparison(null); setComparisonBusy(false);
  }, [basWorkflow, adapter]);
  const onOpenCitation = async row => {
    // A plain citation click (Schedule row / Symbol / Tag / table header) never
    // touched `err` before — only Compare and export did. That left a failed
    // Compare/export's red banner stuck at the top of the panel through every
    // later citation click, success or not, reading as "nothing works" even
    // when the click that just ran actually succeeded. Every citation attempt
    // now clears the banner up front and reports its own failure, same as
    // Compare already does.
    setErr('');
    if (!row?.page_id || !basWorkflow) {
      const result = await onCanvasCitation?.(row);
      if (result?.error) setErr(result.error);
      return result;
    }
    const opener = document.activeElement;
    // Preserve normal live-sheet navigation/overlays. Only unavailable originals
    // (or an explicit Original PDFs action) use the isolated evidence reader.
    if (!row.original_source_only && onCanvasCitation) {
      const result = await onCanvasCitation(row, { originalFallback: true });
      if (!result?.error) return result;
    }
    if (sourceContext.current.workflow !== basWorkflow || sourceContext.current.adapter !== adapter || store !== adapter) {
      return { error: 'BAS source workspace changed; retry against the current project.' };
    }
    sourceReturn.current = opener;
    setSourceView({ request: structuredClone(row), workflow: basWorkflow, adapter });
    return { opened: 'original_source_reader' };
  };
  const readingSource = sourceView?.workflow === basWorkflow && sourceView?.adapter === adapter;
  useLayoutEffect(() => {
    if (!readingSource && restoreSourceFocus.current) {
      restoreSourceFocus.current = false;
      if (sourceReturn.current?.isConnected) sourceReturn.current.focus({ preventScroll: true });
    }
  }, [readingSource]);
  const closeSource = () => { restoreSourceFocus.current = true; setSourceView(null); };
  const openSourceComparison = async request => {
    const operation = ++comparisonRequest.current;
    setErr(''); setComparisonBusy(true);
    try {
      const result = await onCompareCitations?.(request);
      if (operation !== comparisonRequest.current) return;
      if (!result || result.error) { setErr(result?.error || 'Source comparison is unavailable.'); return; }
      setSourceComparison(result);
    } catch (error) {
      if (operation === comparisonRequest.current) setErr(error?.message || String(error));
    } finally {
      if (operation === comparisonRequest.current) setComparisonBusy(false);
    }
  };
  const closeSourceComparison = () => { comparisonRequest.current += 1; setComparisonBusy(false); setSourceComparison(null); };
  const completeBasRun = corpusMeta?.kind === "complete_bas_takeoff";
  const [localTab, setLocalTab] = useState(completeBasRun ? "overview" : basWorkflow && (corpusMeta?.kind === 'bas_points' || !rows.length) ? "points" : "takeoff");
  const tab = basViewState?.takeoffTab || localTab;
  const setTab = value => {
    setLocalTab(value);
    onBasViewStateChange?.(previous => ({ ...previous, takeoffTab: value }));
  };
  const evidenceTab = tab === 'overview' || tab === 'points' || tab === 'equipment' || tab === 'review';
  const snapshotView = basViewState?.projectReview?.snapshotView;
  const scopedTakeoffVerified = snapshotView?.approvedWorkflow === basWorkflow
    || snapshotView?.verifiedCurrentWorkflow === basWorkflow;
  const inferredJourneyStage = tab === 'overview' ? 'scope'
    : tab === 'takeoff' ? 'equipment'
      : tab === 'points' ? basViewState?.mode === 'sequences' ? 'controls' : 'points'
        : tab === 'review' ? basViewState?.projectReview?.snapshots ? 'release'
          : basViewState?.projectReview?.scopeReview ? 'scope' : 'exceptions'
          : tab === 'equipment' ? 'equipment' : 'exceptions';
  const activeJourneyStage = basViewState?.journeyStage || inferredJourneyStage;
  const openReviewDomain = (issue, captureId) => {
    const route = basReviewNavigation(basViewState || {}, issue, basWorkflow, captureId);
    setLocalTab(route.takeoffTab);
    onBasViewStateChange?.(previous => basReviewNavigation(previous || {}, issue, basWorkflow, captureId));
  };
  const navigateOverview = destination => {
    if (destination === 'sequences') {
      setLocalTab('points');
      onBasViewStateChange?.(previous => ({ ...previous, takeoffTab: 'points', mode: 'sequences', sequenceScroll: 0 }));
      return;
    }
    if (destination === 'points') {
      setLocalTab('points');
      onBasViewStateChange?.(previous => ({ ...previous, takeoffTab: 'points', mode: 'lists' }));
      return;
    }
    navigateJourney(destination === 'details' ? 'equipment' : destination);
  };
  const navigateJourney = destination => {
    const update = patch => onBasViewStateChange?.(previous => ({ ...previous, journeyStage: destination, ...patch }));
    if (destination === 'scope') {
      setLocalTab('review');
      update({ takeoffTab: 'review', projectReview: { ...(basViewState?.projectReview || {}), scopeReview: true, snapshots: false, drawingReview: false, revisionReview: false, originalSources: false } });
      return;
    }
    if (destination === 'equipment' || destination === 'grounding') {
      setLocalTab('takeoff'); update({ takeoffTab: 'takeoff' }); return;
    }
    if (destination === 'points' || destination === 'controls') {
      setLocalTab('points'); update({ takeoffTab: 'points', mode: destination === 'controls' ? 'sequences' : 'lists', sequenceScroll: 0 }); return;
    }
    if (destination === 'release') {
      setLocalTab('review');
      update({ takeoffTab: 'review', projectReview: { ...(basViewState?.projectReview || {}), snapshots: true, scopeReview: false, drawingReview: false, revisionReview: false, originalSources: false,
        snapshotView: { ...(basViewState?.projectReview?.snapshotView || {}), tab: 'prepare' } } });
      return;
    }
    setLocalTab('review');
    update({ takeoffTab: 'review', projectReview: { ...(basViewState?.projectReview || {}), snapshots: false, scopeReview: false, drawingReview: false, revisionReview: false, originalSources: false } });
  };
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [jumpFamily, setJumpFamily] = useState("");

  const lines = useMemo(() => compileAgentTakeoff(rows), [rows]);

  const visibleLines = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const staged = completeBasRun && activeJourneyStage === 'grounding'
      ? lines.filter(line => lineScheduleCite(line) && (linePlanCite(line) || linePlanTagCite(line) || line.status))
      : lines;
    if (!q) return staged;
    return staged.filter((r) =>
      [r.tag, r.type, r.description, r.manufacturer, r.model, r.sheet_id, r.table_title,
        r.family, r.attrs_text, r.notes, r.workflow, ...Object.values(r.specs || {})]
        .some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [lines, filter, completeBasRun, activeJourneyStage]);

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
  const completeCoverage = completeBasRun ? corpusMeta?.coverage : null;
  const completeHeader = completeBasHeaderCoverage(completeCoverage);
  const completeSequenceCount = completeHeader.sequences;
  const completeSequenceSections = completeHeader.sequenceSections;
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
          title: mode === "workflow" ? "Workflow data" : "Takeoff",
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

  const exportDisabled = tab === "points" || (tab === "workflow" ? !visibleRows.length : !visibleLines.length);

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
          borderRadius: "var(--r-1)",
          boxShadow: "0 24px 80px color-mix(in srgb, var(--ink) 35%, transparent)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {readingSource && <BasSourceReader workflow={basWorkflow} request={sourceView.request} adapter={adapter} onBack={closeSource} />}
        {sourceComparison && <BasSourceComparison comparison={sourceComparison} onBack={closeSourceComparison} onOpenCitation={onOpenCitation} />}
        <div hidden={readingSource || !!sourceComparison} style={{ display: readingSource || sourceComparison ? 'none' : 'contents' }}>
        <header style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          padding: "16px 20px 0", borderBottom: "1px solid var(--ink-faint)",
        }}>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 12 }}>
            <div style={{
              fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)", letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--ink-secondary)",
            }}>
              {corpusMeta?.display_label || takeoffId || "Takeoff"}
            </div>
            <div style={{ fontSize: "var(--fs-2xl)", fontWeight: 650, marginTop: 2, letterSpacing: "-0.01em" }}>
              {projectName || (completeBasRun ? "BAS project takeoff" : "Project takeoff")}
            </div>
            <div style={{
              display: evidenceTab ? 'none' : "flex", flexWrap: "wrap", gap: "6px 14px",
              marginTop: 8, fontFamily: "var(--f-mono)", fontSize: "var(--fs-s)",
              color: "var(--ink-muted)", letterSpacing: "0.02em",
            }}
              data-takeoff-stats
              hidden={evidenceTab}
              data-lines={lines.length}
              data-schedules={familyGroups.length}
              data-ea={completeBasRun ? "" : (qtyTotal ?? "")}
              data-evidence={rows.length}
              data-takeoff-id={takeoffId || ""}
            >
              {completeBasRun ? <>
                <span data-bas-equipment-records={completeHeader.equipmentRecords}>
                  <strong style={{ color: "var(--ink)", fontWeight: 650 }}>{completeHeader.equipmentRecords}</strong> equipment records
                </span>
                <span data-bas-point-lists={completeHeader.pointLists} data-bas-point-rows={completeHeader.pointRows}
                  data-bas-point-type-review-rows={completeHeader.pointTypeReviewRows}>
                  <strong style={{ color: "var(--ink)", fontWeight: 650 }}>{completeHeader.pointLists}</strong> point lists
                  {completeHeader.pointRows > 0 ? ` · ${completeHeader.pointRows} rows` : ""}
                  {completeHeader.pointTypeReviewRows > 0 ? ` · ${completeHeader.pointTypeReviewRows} I/O type reviews` : ""}
                </span>
                <span data-takeoff-sequences={completeSequenceCount} data-bas-soo-point-candidates={completeHeader.sooPointCandidates}>
                  <strong style={{ color: "var(--ink)", fontWeight: 650 }}>{completeSequenceCount}</strong> sequences
                  {completeSequenceSections > 0 ? ` · ${completeSequenceSections} sections` : ""}
                  {completeHeader.sooPointCandidates > 0 ? ` · ${completeHeader.sooPointCandidates} labeled SOO points to review` : ""}
                </span>
                <span data-bas-valve-records={completeHeader.valveRecords}>
                  <strong style={{ color: "var(--ink)", fontWeight: 650 }}>{completeHeader.valveRecords}</strong> valve records
                  {completeHeader.coilGaps > 0 ? ` · ${completeHeader.coilGaps} coil gaps` : ""}
                </span>
                {(completeHeader.schematics > 0 || completeHeader.risers > 0) && (
                  <span data-bas-schematics={completeHeader.schematics} data-bas-risers={completeHeader.risers}>
                    <strong style={{ color: "var(--ink)", fontWeight: 650 }}>{completeHeader.schematics}</strong> schematics
                    {` · ${completeHeader.risers} riser/flow ${completeHeader.risers === 1 ? "diagram" : "diagrams"}`}
                  </span>
                )}
                {completeHeader.reconcileRows > 0 && (
                  <span data-bas-reconcile-rows={completeHeader.reconcileRows} data-bas-reconcile-matches={completeHeader.reconcileMatches}>
                    <strong style={{ color: "var(--ink)", fontWeight: 650 }}>{completeHeader.reconcileMatches}</strong> plan-grounded matches
                    {` · ${completeHeader.reconcileExceptions} exceptions`}
                  </span>
                )}
              </> : <>
                <span><strong style={{ color: "var(--ink)", fontWeight: 650 }}>{lines.length}</strong> {corpusMeta?.bas_math ? "original schedule lines" : "lines"}</span>
                <span><strong style={{ color: "var(--ink)", fontWeight: 650 }}>{familyGroups.length}</strong> schedules</span>
                {qtyTotal != null && (
                  <span data-takeoff-ea={qtyTotal}><strong style={{ color: "var(--ink)", fontWeight: 650 }}>{qtyTotal}</strong> EA</span>
                )}
              </>}
              {lockedTotal != null && !corpusMeta?.bas_math && (
                <span style={{ color: compiledOk ? "var(--ink)" : "var(--c-danger)" }}>
                  locked {lockedTotal}{compiledOk ? " · matched" : " · mismatch"}
                </span>
              )}
              <span>{rows.length} cited source fields</span>
            </div>
            <div style={{ fontSize: "var(--fs-s)", color: "var(--ink-secondary)", marginTop: 6, maxWidth: 760, lineHeight: 1.45 }}>
              {tab === "overview" ? "A guided estimator review of scope, grounding, BAS requirements, and open decisions. Raw extraction fields remain available in Audit data."
                : tab === "review" ? basViewState?.projectReview?.snapshots
                ? "Review a scoped snapshot with its exact original PDFs. Historical approval does not certify the current project."
                : "Source-linked findings across the saved BAS workflow. Resolve inputs in their original workspace; this view does not grant approval."
                : tab === "equipment" ? "Source-backed equipment identities and explicit template assignments. Original schedule evidence stays unchanged."
                : tab === "points" ? "Original point-list matrices with source-bound interpretation. No installed quantities are inferred."
                : tab === "takeoff" && completeBasRun
                ? "Consolidated Agent run — equipment, BAS points, SOO, valves and coil gaps, diagram evidence, and schedule-to-plan reconciliation. Review exceptions and workflow decisions before release."
                : tab === "takeoff" && corpusMeta?.bas_math
                ? "BAS engineering is shown separately from the original schedule rows. Review source coverage and unresolved constraints before procurement."
                : tab === "takeoff"
                ? "Finished quantity takeoff — sections are Building · schedule when the set splits by building. Click Valve Mark / Unit Mark / Sheet to paint that whole schedule row on the drawings (one cite at a time)."
                : "Workflow audit trail — every field the Agent gathered. Does not change the finished Takeoff totals."}
            </div>
          </div>
          {!evidenceTab && <><input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={completeBasRun ? "Filter tag, schedule, field…" : corpusMeta?.bas_math ? "Filter points or schedule rows…" : tab === "takeoff" ? "Filter tag, schedule, field…" : "Filter tag, field, sheet…"}
            style={{
              width: 220, padding: "9px 11px", borderRadius: "var(--r-1)", marginTop: 4,
              border: "1px solid var(--ink-faint)", background: "var(--paper)",
              font: "inherit", fontSize: "var(--fs-m)",
            }}
          />
          <button type="button" onClick={() => runExport("csv")} disabled={exportDisabled || !!busy}
            title={corpusMeta?.bas_math ? completeBasRun ? "Consolidated takeoff rows. Use Export BAS JSON for reviewed engineering results." : "Original schedule rows only. Use Export BAS JSON for engineering results." : undefined}
            style={{ ...btnStyle, marginTop: 4 }}>{busy === "csv" ? "…" : corpusMeta?.bas_math && !completeBasRun ? "Rows CSV" : "CSV"}</button>
          <button type="button" onClick={() => runExport("xlsx")} disabled={exportDisabled || !!busy}
            title={corpusMeta?.bas_math ? completeBasRun ? "Consolidated takeoff rows. Use Export BAS JSON for reviewed engineering results." : "Original schedule rows only. Use Export BAS JSON for engineering results." : undefined}
            style={{ ...btnStyle, marginTop: 4 }}>{busy === "xlsx" ? "…" : corpusMeta?.bas_math && !completeBasRun ? "Rows Excel" : "Excel"}</button>
          <button type="button" onClick={() => runExport("pdf")} disabled={exportDisabled || !!busy}
            title={corpusMeta?.bas_math ? completeBasRun ? "Consolidated takeoff rows. Use Export BAS JSON for reviewed engineering results." : "Original schedule rows only. Use Export BAS JSON for engineering results." : undefined}
            style={{ ...btnStyle, marginTop: 4 }}>{busy === "pdf" ? "…" : corpusMeta?.bas_math && !completeBasRun ? "Rows PDF" : "PDF"}</button>
          </>}
          {!evidenceTab && typeof onClear === "function" && (
            <button type="button" onClick={onClear} disabled={!rows.length && !corpusMeta?.bas_math}
              style={{ ...btnStyle, marginTop: 4, background: "transparent", color: "var(--ink-muted)" }}>
              Clear
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close takeoff"
            style={{ border: "none", background: "transparent", cursor: "pointer", padding: 8, marginTop: 2 }}>
            <Icon name="close" size={18} />
          </button>
        </header>

        {completeBasRun && <BasTakeoffJourney corpusMeta={corpusMeta} activeStage={activeJourneyStage} approved={scopedTakeoffVerified} onNavigate={navigateJourney} />}
        {completeBasRun && <div className="bas-journey-utility" aria-label="Supporting takeoff views">
          <span>Supporting data</span>
          <button type="button" aria-pressed={tab === 'overview'} onClick={() => { setTab('overview'); onBasViewStateChange?.(previous => ({ ...previous, journeyStage: 'scope' })); }}>Summary</button>
          <button type="button" aria-pressed={tab === 'equipment'} onClick={() => { setTab('equipment'); onBasViewStateChange?.(previous => ({ ...previous, journeyStage: 'equipment' })); }}>Equipment setup</button>
          <button type="button" aria-pressed={tab === 'workflow'} onClick={() => { setTab('workflow'); onBasViewStateChange?.(previous => ({ ...previous, journeyStage: 'exceptions' })); }}>Audit data</button>
        </div>}
        {!completeBasRun && <div style={{ display: "flex", gap: 2, padding: "0 20px", borderBottom: "1px solid var(--ink-faint)" }}>
          {completeBasRun && <button type="button" style={tabBtn(tab === "overview")} onClick={() => setTab("overview")}>
            Overview
          </button>}
          <button type="button" style={tabBtn(tab === "takeoff")} onClick={() => setTab("takeoff")}>
            {completeBasRun ? "Takeoff detail" : "Takeoff"}
          </button>
          <button type="button" style={tabBtn(tab === "workflow")} onClick={() => setTab("workflow")}>
            {completeBasRun ? "Audit data" : "Workflow data"}
          </button>
          {basWorkflow && <button type="button" style={tabBtn(tab === "points")} onClick={() => setTab("points")}>{completeBasRun ? "BAS points & sequences" : "Point lists"}</button>}
          {basWorkflow && <button type="button" style={tabBtn(tab === "equipment")} onClick={() => setTab("equipment")}>{completeBasRun ? "Scope setup" : "Equipment"}</button>}
          <button type="button" style={{ ...tabBtn(tab === 'review'), marginLeft: 'auto' }} onClick={() => setTab('review')}>Review &amp; changes</button>
        </div>}

        {err && (
          <div style={{ padding: "8px 20px", color: "var(--c-danger)", fontSize: "var(--fs-s)" }}>{err}</div>
        )}

        {/* Family jump strip — contractor scanning by schedule */}
        {tab === "takeoff" && familyGroups.length > 1 && (
          <nav aria-label="Takeoff result groups" data-takeoff-group-rail={familyGroups.length} style={{
            display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", alignItems: "center", gap: 10, padding: "8px 20px",
            borderBottom: "1px solid var(--ink-faint)",
            background: "color-mix(in srgb, var(--paper) 85%, var(--ink-faint))",
          }}>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-muted)", whiteSpace: "nowrap" }}>
              {familyGroups.length} groups
            </span>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", minWidth: 0, paddingBottom: 2, scrollbarWidth: "thin" }}>
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
                      flex: "0 0 auto",
                      padding: "5px 9px",
                      fontSize: "var(--fs-xs)",
                      background: active ? "var(--ink)" : "var(--paper-bright)",
                      color: active ? "var(--paper-bright)" : "var(--ink-muted)",
                      borderColor: active ? "var(--ink)" : "var(--ink-faint)",
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
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
          </nav>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: "0 12px 24px", ...(tab === 'review' ? { display: 'flex', flexDirection: 'column', minHeight: 0 } : {}) }}>
          {tab !== 'review' && basViewState?.projectReview?.returnFromDomain && <button type="button" onClick={() => setTab('review')}>← Return to issue review</button>}
          {tab === 'overview' && completeBasRun ? <BasTakeoffOverview corpusMeta={corpusMeta} citedFieldCount={rows.length} onNavigate={navigateOverview} />
            : tab === 'review' ? <BasProjectReviewWorkspace workflow={basWorkflow} state={basViewState?.projectReview}
            onStateChange={updater => onBasViewStateChange?.(previous => ({ ...previous, projectReview: updater(previous?.projectReview || {}) }))}
            onOpenCitation={onOpenCitation} onOpenDomain={openReviewDomain} onDrawingReview={onBasDrawingReview} onRevisionOperation={onBasRevisionOperation} onIssueReview={onBasIssueReview} onScopeReview={onBasScopeReview} restoreContext={restoreContext} />
            : tab === "equipment" ? <BasEquipmentWorkspace workflow={basWorkflow} viewState={basViewState} onViewStateChange={onBasViewStateChange} onReview={onBasEquipmentReview} onCalculate={onBasAssignmentCalculate} onAssemblyReview={onBasAssemblyReview} onAssemblyCalculate={onBasAssemblyCalculate} onEngineering={onBasEngineering} onOpenCitation={onOpenCitation} />
            : tab === "points" ? <BasPointsWorkspace workflow={basWorkflow} viewState={basViewState} onViewStateChange={onBasViewStateChange} onReview={onBasReview} onAiReview={onBasSequenceAiReview} onOpenCitation={onOpenCitation} /> : <>
          {tab === "takeoff" ? (
            !lines.length ? (
              <div style={{ padding: "56px 24px", textAlign: "center", color: "var(--ink-muted)", fontSize: "var(--fs-l)", lineHeight: 1.5 }}>
                {completeBasRun ? <>
                  <strong style={{ display: "block", color: "var(--ink)", marginBottom: 8 }}>No quantity-bearing schedule rows were found.</strong>
                  {completeSequenceCount > 0 ? <>
                    This controls evidence still includes {completeSequenceCount} grounded sequence{completeSequenceCount === 1 ? "" : "s"}
                    {completeSequenceSections > 0 ? ` with ${completeSequenceSections} retained sections` : ""}. No equipment quantity has been inferred from narrative text.
                    {basWorkflow && <div style={{ marginTop: 18 }}>
                      <button type="button" style={btnStyle} onClick={() => {
                        setLocalTab("points");
                        onBasViewStateChange?.(previous => ({ ...previous, takeoffTab: "points", mode: "sequences", sequenceScroll: 0 }));
                      }}>Review sequences</button>
                    </div>}
                  </> : "The Agent retained its evidence and review findings without inventing equipment quantities."}
                </> : corpusMeta?.bas_math ? "No quantity-bearing rows were found in the original schedules. Engineering evidence and review gaps are shown below." : <>
                  No finished takeoff yet.<br />
                  Run Agent with a complete HVAC, BAS, or valve takeoff goal — compiled quantities land here.
                </>}
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
                      margin: "0 8px 10px", fontSize: "var(--fs-m)", fontWeight: 650,
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
                        fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)", fontWeight: 500,
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
                      borderRadius: "var(--r-1)",
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
                            <th style={th}>Source comparison</th>
                            {specs.map((c) => (
                              <th key={c} style={th}>{c}</th>
                            ))}
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
                                const isUnit = c.key === "unit_mark";
                                const isQty = c.key === "qty";
                                // Valve Mark / Unit Mark / qty jump to the whole schedule ROW.
                                const cite = (isTag || isQty || isUnit)
                                  ? lineLeadCite(line, isUnit ? "unit_mark" : "tag")
                                  : null;
                                return (
                                  <td
                                    key={c.key}
                                    style={{
                                      ...td,
                                      fontSize: isTag || isUnit ? 12 : 13,
                                      textAlign: isQty ? "right" : "left",
                                      whiteSpace: isTag || isUnit ? "nowrap" : undefined,
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
                                      mono={isTag || isUnit}
                                      weight={isTag || isQty || isUnit ? 650 : 400}
                                    />
                                  </td>
                                );
                              })}
                              <td style={{ ...td, fontSize: "var(--fs-xs)", color: "var(--ink-muted)", whiteSpace: "nowrap" }}>
                                <SourceComparisonActions line={line} onOpenCitation={onOpenCitation} onCompareCitations={openSourceComparison} comparisonBusy={comparisonBusy} />
                              </td>
                              {specs.map((c) => {
                                const v = lineSpecValue(line, c);
                                return (
                                  <td key={c} style={{
                                    ...td, fontSize: "var(--fs-s)", fontVariantNumeric: "tabular-nums",
                                    whiteSpace: "nowrap",
                                    color: v ? "var(--ink)" : "var(--ink-faint)",
                                  }}>
                                    {/* Specs belong to the row — use Tag to jump; keep values readable. */}
                                    {v || "—"}
                                  </td>
                                );
                              })}
                              {showStatus ? (
                                <td style={{ ...td, fontSize: "var(--fs-s)", color: "var(--ink-muted)" }}>
                                  {line.status || "—"}
                                  {line.notes ? (
                                    <details style={{ marginTop: 3, maxWidth: 280 }}>
                                      <summary style={{ cursor: "pointer", color: "var(--cobalt)", whiteSpace: "nowrap" }}>Details</summary>
                                      <div style={{ marginTop: 5, whiteSpace: "normal", lineHeight: 1.4 }}>{line.notes}</div>
                                    </details>
                                  ) : null}
                                </td>
                              ) : null}
                              <td style={{ ...td, whiteSpace: "nowrap" }}>
                                {typeof onRemoveLine === "function" && (
                                  <button type="button" onClick={() => onRemoveLine(line)}
                                    style={{
                                      border: "none", background: "transparent", cursor: "pointer",
                                      color: "var(--ink-muted)", padding: "4px 6px", fontSize: "var(--fs-xs)",
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
                        margin: "6px 10px 0", fontSize: "var(--fs-s)", color: "var(--ink-muted)",
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
              <div style={{ padding: "56px 24px", textAlign: "center", color: "var(--ink-muted)", fontSize: "var(--fs-l)" }}>
                No workflow evidence yet. Field-level Agent results land here for audit.
              </div>
            ) : (
              bySchedule.map(([schedule, group]) => (
                <section key={schedule} style={{ marginTop: 18 }}>
                  <h3 style={{
                    margin: "0 8px 8px", fontSize: "var(--fs-m)", fontWeight: 650,
                    color: "var(--ink-muted)", display: "flex", gap: 10, alignItems: "baseline",
                  }}>
                    <span>{schedule}</span>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: "var(--fs-xs)", fontWeight: 500 }}>
                      {group.length} field{group.length === 1 ? "" : "s"}
                    </span>
                  </h3>
                  <div style={{
                    overflowX: "auto",
                    border: "1px solid var(--ink-faint)",
                    borderRadius: "var(--r-1)",
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
                            <td style={{ ...td, fontFamily: "var(--f-mono)", fontSize: "var(--fs-s)" }}>{r.tag || "—"}</td>
                            <td style={{ ...td, fontSize: "var(--fs-s)" }}>{String(r.field ?? "")}</td>
                            <td style={{ ...td, fontWeight: 600, fontSize: "var(--fs-s)" }}>
                              {typeof r.value === "object" && r.value != null
                                ? String(r.value.text ?? r.value.value ?? "")
                                : String(r.value ?? "")}
                            </td>
                            <td style={td}>{r.unit || "—"}</td>
                            <td style={{ ...td, fontSize: "var(--fs-s)", color: "var(--ink-muted)" }}
                              title={r.sheet_id || ""}>
                              {shortSheet(r.sheet_id)}
                            </td>
                            <td style={{ ...td, fontSize: "var(--fs-xs)", fontFamily: "var(--f-mono)", color: "var(--ink-muted)" }}>
                              {r.source_tool || "—"}
                            </td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>
                              {typeof onOpenCitation === "function" && r.sheet_id && r.bbox_px && (
                                <button type="button" onClick={() => onOpenCitation(r)}
                                  style={{ ...btnStyle, padding: "4px 8px", fontSize: "var(--fs-xs)" }}>
                                  View
                                </button>
                              )}
                              {typeof onRemove === "function" && (
                                <button type="button" onClick={() => onRemove(r.id)}
                                  style={{
                                    border: "none", background: "transparent", cursor: "pointer",
                                    color: "var(--ink-muted)", padding: "4px 6px", fontSize: "var(--fs-xs)",
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
          {tab === "takeoff" && corpusMeta?.bas_math && <BasMathSummary result={corpusMeta.bas_math} filter={filter} onOpenCitation={onOpenCitation} />}
          </>}
        </div>
        </div>
      </div>
    </div>
  );
}
