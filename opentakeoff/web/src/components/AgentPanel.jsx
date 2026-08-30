// Agent panel — docked right-rail takeoff agent.
// Estimator-clarity contract:
//   1. Plain-language status while working
//   2. Chat thread with the actual data (not a tool dump)
//   3. Clickable source cards → jump on demand (no auto-fly)
//   4. Conversational follow-ups in the same thread
//   5. Raw tool traces collapsed / secondary
import { useEffect, useMemo, useRef, useState } from "react";
import { keyText } from "../lib/keys.ts";
import { Icon } from "../brand/icons.jsx";
import AgentAnswer from "./AgentAnswer.jsx";

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

const isGateOrCheck = (text) =>
  /^\[(?:Evidence gate|Automated check):/i.test(String(text || "").trim());

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

function splitLog(log) {
  const steps = [];
  const meta = [];
  for (const e of log) {
    if (e.kind === "text" && isGateOrCheck(e.text)) meta.push(e);
    else if (e.kind !== "text" || isGateOrCheck(e.text)) steps.push(e);
  }
  return { steps, meta };
}

function citationCardTitle(citation) {
  const tag = String(citation.row_key || "").trim();
  const col = String(citation.column || "").trim();
  const val = String(citation.value || "").trim();
  if (tag && col && val) return `${tag} · ${col} = ${val}`;
  if (tag && col) return `${tag} · ${col}`;
  if (tag && val) return `${tag} · ${val}`;
  if (col && val) return `${col} = ${val}`;
  const fallback = String(citation.label || citation.text || "").trim();
  return fallback || "Cited source";
}

function SourceCard({ citation, onOpen }) {
  const [open, setOpen] = useState(false);
  const title = citationCardTitle(citation);
  const sheet = citation.sheetLabel || citation.sheet || "";
  const details = [
    citation.table_title ? ["Schedule", citation.table_title] : null,
    citation.row_key ? ["Tag / MARK", citation.row_key] : null,
    citation.column ? ["Column", citation.column] : null,
    citation.value ? ["Value", citation.value] : null,
    sheet ? ["Sheet", sheet] : null,
    Array.isArray(citation.bbox_px) ? ["BBox (px)", citation.bbox_px.map((n) => Number(n).toFixed?.(1) ?? n).join(", ")] : null,
  ].filter(Boolean);

  return (
    <div
      style={{
        marginBottom: 6,
        border: "1px solid var(--ink-faint)", borderRadius: 6,
        background: "var(--paper)", color: "var(--ink)", overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={open ? "Hide source details" : "Show source details"}
          style={{
            flex: 1, textAlign: "left", cursor: "pointer",
            padding: "8px 10px", border: "none", background: "transparent",
            color: "inherit", font: "inherit", display: "flex", gap: 8, alignItems: "flex-start",
          }}
        >
          <Icon name={open ? "chevronDown" : "chevronRight"} size={13} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 600, lineHeight: 1.35, overflowWrap: "anywhere" }}>
              {title}
            </span>
            <span style={{ display: "block", fontSize: 11, color: "var(--ink-muted)", marginTop: 2 }}>
              {open ? "Hide details" : "Details"} · {sheet || "sheet"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onOpen?.(citation)}
          title={`Open ${sheet} and show this source`}
          style={{
            flexShrink: 0, border: "none", borderLeft: "1px solid var(--ink-faint)",
            background: "transparent", color: "var(--cobalt)", cursor: "pointer",
            padding: "8px 10px", font: "inherit", fontSize: 11, fontWeight: 600,
          }}
        >
          View
        </button>
      </div>
      {open && (
        <div style={{ padding: "0 10px 10px 31px", fontSize: 12, lineHeight: 1.5 }}>
          {details.length === 0 && (
            <div style={{ color: "var(--ink-muted)" }}>No structured fields on this citation — open the drawing to inspect the highlight.</div>
          )}
          {details.map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <span style={{ width: 88, flexShrink: 0, color: "var(--ink-muted)", fontSize: 11 }}>{k}</span>
              <span style={{ overflowWrap: "anywhere" }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--ink-muted)" }}>
            Cited so you can spot-check the answering cell on the blueprint.
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentPanel({
  configured, running, status = "", log, thread = [], citations = [], proposals, condById, sheetLabel, units,
  fmtArea, onRun, onStop, onResetChat, onOpenCitation, onAccept, onReject, onAcceptAll, onRejectAll,
  onOpenSettings, onClose,
  onOpenTakeoff, takeoffRowCount = 0,
  runHistory = [], historyOpen = false, onToggleHistory,
}) {
  const [draft, setDraft] = useState("");
  const [showSteps, setShowSteps] = useState(false);
  // Sources stay collapsed by default so the Answer stays answer-first —
  // a long card list must not bury the takeoff reply (seen on D03/D04 demos).
  const [showSources, setShowSources] = useState(false);
  const threadRef = useRef(null);
  const logRef = useRef(null);
  const { steps, meta } = useMemo(() => splitLog(log), [log]);
  const hasAssistant = thread.some((m) => m.role === "assistant");
  const canFollowUp = hasAssistant && !running;

  useEffect(() => {
    if (!running && hasAssistant) setShowSteps(false);
  }, [running, hasAssistant]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    if (running) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    // When idle with an Answer, keep the latest assistant reply in view —
    // do not auto-scroll to the Sources list at the bottom.
    const answers = el.querySelectorAll('[data-agent-role="assistant"]');
    const last = answers[answers.length - 1];
    if (last) {
      last.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [thread, citations, status, running]);

  useEffect(() => {
    if (logRef.current && showSteps) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log, showSteps]);
  void units;
  void sheetLabel;

  const send = (followUp) => {
    const g = draft.trim();
    if (!g || running) return;
    setDraft("");
    onRun(g, followUp ? { followUp: true } : {});
  };
  const ctl = { padding: "3px 9px", border: "1px solid var(--ink-faint)", background: "transparent", cursor: "pointer", fontSize: 11.5 };

  return (
    <div style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--ink-faint)", background: "var(--paper-bright)", overflow: "hidden", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "var(--cobalt)", color: "var(--accent-contrast)" }}>
        <Icon name="target" size={15} />
        <strong style={{ flex: 1, fontSize: 12.5 }}>Agent{proposals.length ? ` · ${proposals.length} pending` : ""}</strong>
        {configured && Number(takeoffRowCount) > 0 && typeof onOpenTakeoff === "function" && (
          <button
            onClick={onOpenTakeoff}
            title="Open Takeoff panel — structured workflow data"
            style={{ border: "none", background: "rgba(255,255,255,0.22)", color: "var(--accent-contrast)", cursor: "pointer", fontSize: 11, fontWeight: 650, padding: "2px 8px" }}
          >
            Takeoff · {takeoffRowCount}
          </button>
        )}
        {configured && thread.length > 0 && (
          <button onClick={onResetChat} disabled={running} title="Start a new question" style={{ border: "none", background: "transparent", color: "var(--accent-contrast)", cursor: running ? "default" : "pointer", fontSize: 11, opacity: running ? 0.5 : 1 }}>New</button>
        )}
        {configured && (
          <button onClick={onToggleHistory} title={historyOpen ? "Back to chat" : "Run History"} style={{ border: "none", background: historyOpen ? "rgba(255,255,255,0.22)" : "transparent", color: "var(--accent-contrast)", cursor: "pointer", padding: "2px", display: "flex" }}>
            <Icon name="history" size={14} />
          </button>
        )}
        <button onClick={onClose} title="Close panel" style={{ border: "none", background: "transparent", color: "var(--accent-contrast)", fontSize: 16, cursor: "pointer", padding: "0 2px" }}>×</button>
      </div>

      {configured && historyOpen ? (
        <RunHistoryList runs={runHistory} />
      ) : !configured ? (
        <div style={{ padding: 14, fontSize: 13, lineHeight: 1.6, color: "var(--ink)" }}>
          <p style={{ marginTop: 0 }}>
            The agent runs on a model <strong>you</strong> provide — your endpoint, your key, straight from this
            browser. Nothing is configured, so it can't run.
          </p>
          <button className="btn-primary" onClick={onOpenSettings} style={{ marginTop: 4 }}>AI settings…</button>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Chat thread — the primary surface */}
          <div ref={threadRef} style={{ flex: 1, minHeight: 120, overflow: "auto", padding: "10px 12px" }}>
            {thread.length === 0 && !running && (
              <div style={{ color: "var(--ink-muted)", fontSize: 12.5, lineHeight: 1.55 }}>
                Ask a real estimating question. This chat stays for workflow steps and conversation —
                structured quantities open in the Takeoff panel for review and CSV / Excel / PDF export.
              </div>
            )}
            {thread.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                data-agent-role={m.role}
                style={{
                  marginBottom: 10,
                  padding: m.role === "user" ? "8px 10px" : 0,
                  borderRadius: m.role === "user" ? 8 : 0,
                  background: m.role === "user" ? "var(--paper)" : "transparent",
                  border: m.role === "user" ? "1px solid var(--ink-faint)" : "none",
                }}
              >
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 4 }}>
                  {m.role === "user" ? "You" : "Answer"}
                </div>
                {m.role === "assistant" ? (
                  <AgentAnswer text={m.text} />
                ) : (
                  <div style={{ color: "var(--ink)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 13, lineHeight: 1.55, fontFamily: "inherit" }}>
                    {m.text}
                  </div>
                )}
                {m.role === "assistant" && Number(m.takeoffRows) > 0 && typeof onOpenTakeoff === "function" && (
                  <button
                    type="button"
                    onClick={onOpenTakeoff}
                    style={{
                      marginTop: 8, padding: "5px 10px", border: "1px solid var(--ink-faint)",
                      background: "var(--paper)", color: "var(--cobalt)", cursor: "pointer",
                      fontSize: 11.5, fontWeight: 650, fontFamily: "var(--f-mono)",
                      letterSpacing: "0.06em", textTransform: "uppercase",
                    }}
                  >
                    Open Takeoff · {m.takeoffRows}
                  </button>
                )}
              </div>
            ))}
            {running && (
              <div data-agent-status style={{ fontSize: 12.5, color: "var(--cobalt)", fontWeight: 600, marginBottom: 8 }}>
                {status || "Working…"}
              </div>
            )}
            {citations.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowSources((v) => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, width: "100%",
                    padding: "4px 0", border: "none", background: "transparent",
                    cursor: "pointer", font: "inherit",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                    textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 6,
                  }}
                >
                  <Icon name={showSources ? "chevronDown" : "chevronRight"} size={13} />
                  <span>Sources · {citations.length} · click to open</span>
                </button>
                {showSources && citations.map((c) => (
                  <SourceCard key={c.id} citation={c} onOpen={onOpenCitation} />
                ))}
              </div>
            )}
          </div>

          {/* Composer — first ask or follow-up */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid var(--ink-faint)" }}>
            <textarea
              name="agent-goal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={canFollowUp ? 2 : 3}
              placeholder={canFollowUp
                ? 'Ask a follow-up — e.g. "Why AI10 and not another point?"'
                : 'e.g. "What is CH-A1 capacity and the matching CHW valve?"'}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send(canFollowUp);
                }
              }}
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontSize: 12.5, fontFamily: "inherit", padding: "6px 8px", border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)", outline: "none" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
              {running ? (
                <button onClick={onStop} style={{ ...ctl, color: "var(--c-danger)", fontWeight: 600 }}>■ Stop</button>
              ) : (
                <button
                  onClick={() => send(canFollowUp)}
                  disabled={!draft.trim()}
                  className="btn-primary"
                  style={{ padding: "5px 14px", fontSize: 12, cursor: draft.trim() ? "pointer" : "default", opacity: draft.trim() ? 1 : 0.5 }}
                >
                  {canFollowUp ? "Ask" : "Run"}
                </button>
              )}
              <span style={{ flex: 1, fontSize: 11, color: "var(--ink-muted)" }}>
                {running ? "" : keyText(canFollowUp ? "⌘⏎ asks follow-up" : "⌘⏎ runs")}
              </span>
              <button onClick={onOpenSettings} title="AI settings" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-muted)" }}><Icon name="sliders" size={13} /></button>
            </div>
          </div>

          <div style={{ position: "relative", borderTop: "1px solid var(--ink-faint)" }}>
            <button
              type="button"
              onClick={() => setShowSteps((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%",
                padding: "7px 12px", border: "none", background: "transparent",
                cursor: "pointer", font: "inherit", color: "var(--ink-muted)", fontSize: 11.5,
              }}
            >
              <Icon name={showSteps ? "chevronDown" : "chevronRight"} size={13} />
              <span style={{ flex: 1, textAlign: "left" }}>
                Technical steps{steps.length ? ` · ${steps.filter((e) => e.kind === "tool").length}` : ""}
              </span>
            </button>
            {showSteps && (
              <div ref={logRef} style={{ maxHeight: 140, overflow: "auto", padding: "0 12px 8px", fontFamily: "var(--f-mono)", fontSize: 10.5, lineHeight: 1.5 }}>
                {[...steps, ...meta].map((e, i) => (
                  <div key={i} style={{ color: LOG_STYLE[e.kind] || "var(--ink)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginBottom: 2 }}>{e.text}</div>
                ))}
              </div>
            )}
            {!showSteps && (
              <div aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                {[...steps, ...meta].map((e, i) => (
                  <div key={`hidden-${i}`}>{e.text}</div>
                ))}
              </div>
            )}
          </div>

          <div style={{ maxHeight: "28%", display: "flex", flexDirection: "column", minHeight: 0, borderTop: "1px solid var(--ink-faint)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px" }}>
              <strong style={{ flex: 1, fontSize: 11.5 }}>Proposals · {proposals.length}</strong>
              {proposals.length > 0 && (
                <>
                  <button onClick={onAcceptAll} style={{ ...ctl, color: "var(--c-positive)", fontWeight: 600 }}>Accept all</button>
                  <button onClick={onRejectAll} style={{ ...ctl, color: "var(--c-danger)" }}>Reject all</button>
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
                      {p.measure_role === "deduct" ? " (deduct)" : ""}
                      {p.area_sf != null ? ` · ${fmtArea(p.area_sf)}` : ""}
                      <span style={{ display: "block", color: "var(--ink-muted)", fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {evidenceText(p.evidence) || "no evidence"}
                      </span>
                    </span>
                    <button onClick={() => onAccept(p.id)} style={{ ...ctl, color: "var(--c-positive)", fontWeight: 600 }}>✓</button>
                    <button onClick={() => onReject(p.id)} style={{ ...ctl, color: "var(--c-danger)" }}>✕</button>
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
