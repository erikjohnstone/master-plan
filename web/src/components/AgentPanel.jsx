// Agent panel — the docked right-rail surface for the in-canvas takeoff agent.
// An estimator types a goal; the agent (running on the user's OWN model via
// the BYO-AI seam) aims the app's deterministic tools and stages DASHED pencil
// proposals on the canvas. This panel is the review desk: streaming status
// while the loop runs, then per-proposal Accept/Reject plus Accept all —
// nothing becomes a takeoff until a human says so, exactly like one-click's
// Create gate. Unconfigured builds get the honest empty state (the Contribute
// modal pattern): no key, no run, and a link to AI settings.
import { useEffect, useRef, useState } from "react";
import { keyText } from "../lib/keys.ts";
import { Icon } from "../brand/icons.jsx";

const evidenceText = (ev) => {
  if (!ev) return "";
  const bits = [];
  if (ev.schedule_row_tag) bits.push(`schedule ${ev.schedule_row_tag}`);
  if (ev.matched_text && ev.matched_text !== ev.schedule_row_tag) bits.push(`“${ev.matched_text}”`);
  if (Array.isArray(ev.seed_norm)) bits.push(`seed (${(+ev.seed_norm[0]).toFixed(2)}, ${(+ev.seed_norm[1]).toFixed(2)})`);
  return bits.join(" · ");
};

const LOG_STYLE = { status: "var(--ink-muted)", tool: "var(--cobalt)", text: "var(--ink)", error: "var(--c-danger)" };
const RUN_STATUS_STYLE = { running: "var(--cobalt)", done: "var(--c-positive)", error: "var(--c-danger)", aborted: "var(--ink-muted)" };

// One tool_calls entry rendered the same shape as the live log — a Run's
// persisted trace and the streaming view of the run that produced it should
// never look like two different things to the person reading them.
const runEventText = (ev) => {
  if (ev.type === "text") return ev.text;
  if (ev.type === "tool_start") return `→ ${ev.name}`;
  if (ev.type === "tool_end") return ev.result?.error ? `✗ ${ev.name}: ${ev.result.error}` : `✓ ${ev.name}`;
  if (ev.type === "error") return `Error: ${ev.message}`;
  return "";
};
const runEventKind = (ev) => (ev.type === "tool_start" ? "tool" : ev.type === "error" || ev.result?.error ? "error" : ev.type === "text" ? "text" : "status");

const relTime = (ms) => {
  const d = Date.now() - ms;
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.round(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.round(d / 3600000)}h ago`;
  return new Date(ms).toLocaleDateString();
};

// Run History — a persisted, reviewable ledger of past goals (maturity plan
// Phase 2): what was asked, its full tool trace, and how it ended, still
// there after a reload — unlike the live log above, which is one run's
// scrollback and is gone the moment the next run starts.
function RunHistoryList({ runs }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  if (!runs.length) return <div style={{ padding: 14, fontSize: 12.5, color: "var(--ink-muted)" }}>No runs yet — goals you run land here once they finish, and stay after a reload.</div>;
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      {runs.map((r) => {
        const isOpen = open.has(r.id);
        return (
          <div key={r.id} style={{ borderBottom: "1px solid var(--ink-faint)" }}>
            <button onClick={() => toggle(r.id)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer", font: "inherit" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 4, flexShrink: 0, background: RUN_STATUS_STYLE[r.status] || "var(--ink-muted)" }} title={r.status} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isOpen ? "normal" : "nowrap" }}>{r.goal_text}</span>
                <span style={{ display: "block", fontSize: 10.5, color: "var(--ink-muted)", marginTop: 1 }}>
                  {relTime(r.started_at)} · {r.tool_calls.filter((e) => e.type === "tool_start").length} tool call{r.tool_calls.filter((e) => e.type === "tool_start").length === 1 ? "" : "s"}
                  {r.outcome_summary ? ` · ${r.outcome_summary}` : r.status === "running" ? " · still running" : ""}
                </span>
              </span>
              <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={13} />
            </button>
            {isOpen && (
              <div style={{ padding: "0 12px 10px 26px", fontFamily: "var(--f-mono)", fontSize: 10.5, lineHeight: 1.5 }}>
                {r.tool_calls.length === 0 && <div style={{ color: "var(--ink-muted)", fontFamily: "inherit" }}>No tool calls recorded.</div>}
                {r.tool_calls.map((ev, i) => {
                  const t = runEventText(ev);
                  if (!t) return null;
                  return <div key={i} style={{ color: LOG_STYLE[runEventKind(ev)] || "var(--ink)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginBottom: 2 }}>{t}</div>;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AgentPanel({
  configured, running, log, proposals, condById, sheetLabel, units,
  fmtArea, onRun, onStop, onAccept, onReject, onAcceptAll, onRejectAll,
  onOpenSettings, onClose,
  runHistory = [], historyOpen = false, onToggleHistory,
}) {
  const [goal, setGoal] = useState("");
  const logRef = useRef(null);
  // follow the stream — pin the log to its latest line as events arrive
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);
  void units; // reserved for a metric readout pass; fmtArea already localizes

  const run = () => { const g = goal.trim(); if (g && !running) onRun(g); };
  const ctl = { padding: "3px 9px", border: "1px solid var(--ink-faint)", background: "transparent", cursor: "pointer", fontSize: 11.5 };

  return (
    <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--ink-faint)", background: "var(--paper-bright)", overflow: "hidden", minHeight: 0 }}>
      {/* header strip — matches the docked-panel chrome */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "var(--cobalt)", color: "var(--accent-contrast)" }}>
        <Icon name="target" size={15} />
        <strong style={{ flex: 1, fontSize: 12.5 }}>Agent{proposals.length ? ` · ${proposals.length} pending` : ""}</strong>
        {configured && (
          <button onClick={onToggleHistory} title={historyOpen ? "Back to the current run" : "Run History — every past goal, its full tool trace, and how it ended (persists across reloads)"} style={{ border: "none", background: historyOpen ? "rgba(255,255,255,0.22)" : "transparent", color: "var(--accent-contrast)", cursor: "pointer", padding: "2px", display: "flex" }}>
            <Icon name="history" size={14} />
          </button>
        )}
        <button onClick={onClose} title="Close panel" style={{ border: "none", background: "transparent", color: "var(--accent-contrast)", fontSize: 16, cursor: "pointer", padding: "0 2px" }}>×</button>
      </div>

      {configured && historyOpen ? (
        <RunHistoryList runs={runHistory} />
      ) : !configured ? (
        // honest empty state — the Contribute-modal pattern: nothing configured,
        // nothing runs, no pretense. Zero network calls until the user brings a key.
        <div style={{ padding: 14, fontSize: 13, lineHeight: 1.6, color: "var(--ink)" }}>
          <p style={{ marginTop: 0 }}>
            The agent runs on a model <strong>you</strong> provide — your endpoint, your key, straight from this
            browser (the same bring-your-own-AI seam as the scale reader). Nothing is configured, so it can't run.
          </p>
          <p style={{ color: "var(--ink-muted)" }}>
            Once configured, you describe a takeoff ("take off the carpet per the finish schedule on this sheet")
            and the agent aims the app's own tools — the text layer, the schedule parser, the one-click engine —
            then stages dashed proposals you accept or reject. It never invents geometry and never commits anything itself.
          </p>
          <button className="btn-primary" onClick={onOpenSettings} style={{ marginTop: 4 }}>AI settings…</button>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* goal + run */}
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--ink-faint)" }}>
            <textarea
              name="agent-goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={3}
              placeholder={'e.g. "Take off the carpet per the finish schedule on this sheet."'}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); } }}
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontSize: 12.5, fontFamily: "inherit", padding: "6px 8px", border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)", outline: "none" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
              {running ? (
                <button onClick={onStop} style={{ ...ctl, color: "var(--c-danger)", fontWeight: 600 }}>■ Stop</button>
              ) : (
                <button onClick={run} disabled={!goal.trim()} className="btn-primary" style={{ padding: "5px 14px", fontSize: 12, cursor: goal.trim() ? "pointer" : "default", opacity: goal.trim() ? 1 : 0.5 }}>Run</button>
              )}
              <span style={{ fontSize: 10.5, color: "var(--ink-muted)" }}>{running ? "Working — proposals land as dashed outlines." : keyText("⌘⏎ runs. Your key, your endpoint.")}</span>
              <span style={{ flex: 1 }} />
              <button onClick={onOpenSettings} title="AI settings (endpoint / model / key)" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-muted)" }}><Icon name="sliders" size={13} /></button>
            </div>
          </div>

          {/* streaming status log */}
          <div ref={logRef} style={{ flex: 1, minHeight: 60, overflow: "auto", padding: "8px 12px", fontFamily: "var(--f-mono)", fontSize: 11, lineHeight: 1.55 }}>
            {log.length === 0 && <div style={{ color: "var(--ink-muted)", fontFamily: "inherit" }}>No run yet.</div>}
            {log.map((e, i) => (
              <div key={i} style={{ color: LOG_STYLE[e.kind] || "var(--ink)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginBottom: 3 }}>{e.text}</div>
            ))}
          </div>

          {/* pending proposals — the accept gate */}
          <div style={{ borderTop: "1px solid var(--ink-faint)", maxHeight: "45%", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px" }}>
              <strong style={{ flex: 1, fontSize: 11.5 }}>Proposals · {proposals.length}</strong>
              {proposals.length > 0 && (
                <>
                  <button onClick={onAcceptAll} style={{ ...ctl, color: "var(--c-positive)", fontWeight: 600 }} title={keyText("Accept every visible proposal (⏎ on the canvas does the same)")}>Accept all</button>
                  <button onClick={onRejectAll} style={{ ...ctl, color: "var(--c-danger)" }} title="Discard every pending proposal (local only — nothing is recorded)">Reject all</button>
                </>
              )}
            </div>
            <div style={{ overflow: "auto", minHeight: 0 }}>
              {proposals.map((p) => {
                const cond = condById[p.condition_id];
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderTop: "1px solid var(--ink-faint)", fontSize: 11.5 }}>
                    <span style={{ width: 10, height: 10, flexShrink: 0, background: cond?.color || "var(--cobalt)", border: "1px solid var(--ink-faint)" }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{cond?.finish_tag || "?"}</span>
                      {p.measure_role === "deduct" ? " (deduct)" : ""} · {sheetLabel(p.sheet_id)}
                      {p.area_sf != null ? ` · ${fmtArea(p.area_sf)}` : ""}
                      <span style={{ display: "block", color: "var(--ink-muted)", fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={evidenceText(p.evidence)}>
                        {evidenceText(p.evidence) || "no evidence"}
                      </span>
                    </span>
                    <button onClick={() => onAccept(p.id)} style={{ ...ctl, color: "var(--c-positive)", fontWeight: 600 }} title="Accept — commits as a takeoff (origin: agent, human-reviewed)">✓</button>
                    <button onClick={() => onReject(p.id)} style={{ ...ctl, color: "var(--c-danger)" }} title="Reject — discard this proposal (local only)">✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
