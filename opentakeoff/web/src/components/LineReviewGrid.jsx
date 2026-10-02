import { useEffect, useMemo, useRef, useState } from "react";
import { lineReviewKey, lineReviewState, recordLineReviews, clearLineReviews, summarizeLineReviews, countableTags, tagOccurrenceKey } from "../lib/lineReview.js";
import { lineScheduleCite, linePlanCite, linePlanTagCite } from "../lib/agentTakeoff.js";

// One screen to check a whole schedule family: every line's own drawing
// evidence as a thumbnail (its printed plan tag, else its schedule row), with
// Confirm / Flag per line. Decisions are recorded with the evidence they were
// made on (lineReview.js) — they never change a quantity.

const STATE_STYLE = {
  confirmed: { label: "Confirmed", color: "var(--c-positive, #1f6b4a)" },
  flagged: { label: "Flagged", color: "var(--c-danger, #b03a26)" },
  corrected: { label: "Corrected", color: "var(--cobalt)" },
  counted: { label: "Counted from tags", color: "var(--c-positive, #1f6b4a)" },
  stale: { label: "Changed since review", color: "var(--warning, #9a5a00)" },
  unreviewed: { label: "Not reviewed", color: "var(--ink-muted)" },
};
const FILTERS = [["all", "All"], ["unreviewed", "Not reviewed"], ["flagged", "Flagged"], ["corrected", "Corrected"], ["counted", "Counted"], ["stale", "Changed"], ["confirmed", "Confirmed"]];

function lineEvidence(line) {
  const plan = linePlanCite(line) || linePlanTagCite(line);
  if (plan) return { cite: plan, kind: "plan", label: "Printed plan tag" };
  const schedule = lineScheduleCite(line);
  if (schedule) return { cite: schedule, kind: "schedule", label: "Schedule row" };
  return null;
}

function pageLabel(sheet) {
  const s = String(sheet || "");
  const hash = s.lastIndexOf("#");
  return hash >= 0 ? `p.${s.slice(hash + 1)}` : s;
}

function quantityText(line) {
  const parts = [];
  if (typeof line.scheduled_qty === "number") parts.push(`scheduled ${line.scheduled_qty}`);
  if (typeof line.installed_qty === "number") parts.push(`on plans ${line.installed_qty}`);
  else if (typeof line.tagged_plan_qty === "number") parts.push(`${line.tagged_plan_qty} tag${line.tagged_plan_qty === 1 ? "" : "s"} on plans · not counted`);
  if (!parts.length && typeof line.qty === "number") parts.push(`${line.qty} ${line.unit || "EA"}`);
  return parts.join(" · ");
}

function Thumb({ evidence, renderPreview }) {
  const [state, setState] = useState({ url: null, error: null });
  const host = useRef(null);
  useEffect(() => {
    if (!evidence || !renderPreview) return undefined;
    let cancelled = false;
    const el = host.current;
    // Render only once the tile is near the viewport: a family can hold
    // hundreds of lines and each preview is a real PDF render.
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      renderPreview(evidence.cite, evidence.kind)
        .then((r) => { if (!cancelled) setState({ url: r?.image_url || null, error: r?.error || (r?.image_url ? null : "No preview") }); })
        .catch((e) => { if (!cancelled) setState({ url: null, error: e?.message || String(e) }); });
    }, { rootMargin: "400px" });
    if (el) io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [evidence, renderPreview]);
  return <div ref={host} data-review-thumb style={{
    aspectRatio: "16 / 9", background: "var(--paper)", border: "1px solid var(--ink-faint)",
    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
  }}>
    {state.url
      ? <img src={state.url} alt={evidence?.label || "Evidence"} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      : <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-muted)", padding: 8, textAlign: "center" }}>
        {!evidence ? "No drawing evidence on this line" : state.error ? `Preview unavailable: ${state.error}` : "Rendering…"}
      </span>}
  </div>;
}

// Every printed tag of one line, one tile each: the estimator looks at each
// tag and the device it labels, leaves out any that is not one, and counts
// the rest. The count is theirs (lineReview "counted"); the machine's
// quantity is untouched.
function TagCheck({ line, record, renderPreview, onOpenCitation, onCount, onBack }) {
  const tags = countableTags(line);
  const [excluded, setExcluded] = useState(() => new Set(record?.decision === "counted" ? record.excluded || [] : []));
  const [focus, setFocus] = useState(0);
  const host = useRef(null);
  const evidence = useMemo(() => tags.map((t) => ({
    cite: { ...t, tag: line.tag, value: line.tag, table_title: line.table_title, field: "plan_tag_occurrence", column: "PLAN TAG TEXT", kind: "row", evidence_kind: "plan_tag_text" },
    kind: "plan", label: "Printed plan tag",
  })), [tags, line.tag, line.table_title]);
  useEffect(() => { host.current?.querySelector(`[data-tag-index="${focus}"]`)?.focus({ preventScroll: false }); }, [focus]);
  const toggle = (i) => setExcluded((prev) => {
    const next = new Set(prev); const k = tagOccurrenceKey(tags[i]);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const kept = tags.length - tags.filter((t) => excluded.has(tagOccurrenceKey(t))).length;
  const columns = () => {
    const tiles = [...(host.current?.querySelectorAll("[data-tag-index]") || [])];
    if (tiles.length < 2) return 1;
    const n = tiles.findIndex((t) => t.offsetTop !== tiles[0].offsetTop);
    return n < 0 ? tiles.length : n;
  };
  const onKeyDown = (e) => {
    const key = e.key;
    if (key === "ArrowRight") setFocus(Math.min(tags.length - 1, focus + 1));
    else if (key === "ArrowLeft") setFocus(Math.max(0, focus - 1));
    else if (key === "ArrowDown") setFocus(Math.min(tags.length - 1, focus + columns()));
    else if (key === "ArrowUp") setFocus(Math.max(0, focus - columns()));
    else if (key === "x" || key === "X" || key === " ") toggle(focus);
    else if (key === "Enter") onCount([...excluded]);
    else if (key === "Escape") onBack();
    else return;
    e.preventDefault(); e.stopPropagation();
  };
  const btn = { padding: "4px 9px", fontSize: "var(--fs-xs)", border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)", cursor: "pointer", borderRadius: "var(--r-1)" };
  return <section aria-label={`Check ${line.tag}'s plan tags`} data-tag-check={line.tag} style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
    <header style={{ padding: "16px 20px 10px", borderBottom: "1px solid var(--ink-faint)", display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center" }}>
      <button type="button" onClick={onBack} style={btn}>← Back to review</button>
      <div style={{ fontSize: "var(--fs-l)", fontWeight: 650 }}>{line.tag} · {tags.length} printed tag{tags.length === 1 ? "" : "s"}</div>
      <div data-tag-check-summary data-kept={kept} data-total={tags.length} style={{ fontFamily: "var(--f-mono)", fontSize: "var(--fs-s)", color: "var(--ink-muted)" }}>
        {kept} kept · {tags.length - kept} left out
      </div>
      <button type="button" data-tag-check-count onClick={() => onCount([...excluded])}
        style={{ ...btn, marginLeft: "auto", background: "var(--cobalt)", color: "var(--paper-bright)", borderColor: "var(--cobalt)" }}>
        Count {kept}
      </button>
    </header>
    <div style={{ padding: "6px 20px", fontSize: "var(--fs-xs)", color: "var(--ink-muted)" }}>
      Each tile is one printed {line.tag} tag on the plans and what is drawn around it. Leave out any tag that does not mark a device of this type (a note, a duplicate view, another device). Keys: arrows move · X leave out or keep · Enter count · Esc back.
      {typeof line.tagged_plan_qty === "number" && line.tagged_plan_qty > tags.length ? ` This line read ${line.tagged_plan_qty} tags; the first ${tags.length} are shown and counted.` : ""}
    </div>
    <div ref={host} onKeyDown={onKeyDown} style={{ overflow: "auto", padding: "8px 20px 20px", display: "grid", gap: 10,
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", alignContent: "start" }}>
      {tags.map((t, i) => {
        const out = excluded.has(tagOccurrenceKey(t));
        return <article key={tagOccurrenceKey(t)} tabIndex={0} data-tag-index={i} data-tag-excluded={out ? "1" : "0"} onFocus={() => setFocus(i)}
          style={{ border: `2px solid ${focus === i ? "var(--cobalt)" : "var(--ink-faint)"}`, borderRadius: "var(--r-1)", padding: 6,
            background: "var(--paper-bright)", display: "flex", flexDirection: "column", gap: 4, outline: "none", opacity: out ? 0.45 : 1 }}>
          <Thumb evidence={evidence[i]} renderPreview={renderPreview} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-xs)" }}>
            <span style={{ color: out ? STATE_STYLE.flagged.color : "var(--ink-muted)", fontWeight: out ? 650 : 400 }}>{out ? "Left out" : `${i + 1} · ${pageLabel(t.sheet_id)}`}</span>
            <button type="button" data-tag-toggle onClick={() => toggle(i)} style={{ ...btn, marginLeft: "auto" }}>{out ? "Keep" : "Leave out"}</button>
            <button type="button" onClick={() => onOpenCitation?.(evidence[i].cite)} style={btn}>Open</button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

export default function LineReviewGrid({ title, lines, reviews, onReviewsChange, renderPreview, onOpenCitation, onBack }) {
  const [filter, setFilter] = useState("all");
  const [focus, setFocus] = useState(0);
  const [noteFor, setNoteFor] = useState(null);
  const [note, setNote] = useState("");
  // The estimator's own count for a line, with its required reason.
  const [correctFor, setCorrectFor] = useState(null);
  const [corrQty, setCorrQty] = useState("");
  const [corrError, setCorrError] = useState("");
  // The line whose printed tags are being checked one by one, if any.
  const [checking, setChecking] = useState(null);
  const grid = useRef(null);
  const summary = useMemo(() => summarizeLineReviews(lines, reviews), [lines, reviews]);
  const shown = useMemo(() => lines.filter((line) => filter === "all" || lineReviewState(line, reviews).state === filter), [lines, reviews, filter]);
  const evidence = useMemo(() => new Map(shown.map((line) => [lineReviewKey(line), lineEvidence(line)])), [shown]);
  useEffect(() => { setFocus((f) => Math.min(f, Math.max(0, shown.length - 1))); }, [shown.length]);
  useEffect(() => { grid.current?.querySelector(`[data-review-index="${focus}"]`)?.focus({ preventScroll: false }); }, [focus, filter]);

  const decide = (line, decision, text = "", qty) => onReviewsChange(recordLineReviews(reviews, [line], { decision, note: text, ...(qty !== undefined ? { qty } : {}) }));
  const openCorrect = (line) => {
    const { record } = lineReviewState(line, reviews);
    setCorrectFor(lineReviewKey(line)); setCorrError("");
    setCorrQty(String(record?.decision === "corrected" ? record.qty : (typeof line.qty === "number" ? line.qty : "")));
    setNote(record?.decision === "corrected" ? record.note || "" : "");
  };
  const clear = (line) => onReviewsChange(clearLineReviews(reviews, [line]));
  const unflaggedShown = shown.filter((line) => !["flagged", "confirmed", "corrected", "counted"].includes(lineReviewState(line, reviews).state));
  const confirmShown = () => onReviewsChange(recordLineReviews(reviews, unflaggedShown, { decision: "confirmed" }));

  const columns = () => {
    const el = grid.current;
    if (!el) return 1;
    const tiles = [...el.querySelectorAll("[data-review-index]")];
    if (tiles.length < 2) return 1;
    const top = tiles[0].offsetTop;
    const n = tiles.findIndex((t) => t.offsetTop !== top);
    return n < 0 ? tiles.length : n;
  };
  const onKeyDown = (e) => {
    if (noteFor || correctFor) return;
    const line = shown[focus];
    if (!line) return;
    const key = e.key;
    if (key === "ArrowRight") { setFocus(Math.min(shown.length - 1, focus + 1)); e.preventDefault(); }
    else if (key === "ArrowLeft") { setFocus(Math.max(0, focus - 1)); e.preventDefault(); }
    else if (key === "ArrowDown") { setFocus(Math.min(shown.length - 1, focus + columns())); e.preventDefault(); }
    else if (key === "ArrowUp") { setFocus(Math.max(0, focus - columns())); e.preventDefault(); }
    else if (key === "c" || key === "C") { decide(line, "confirmed"); setFocus(Math.min(shown.length - 1, focus + 1)); e.preventDefault(); }
    else if (key === "f" || key === "F") { setNoteFor(lineReviewKey(line)); setNote(lineReviewState(line, reviews).record?.note || ""); e.preventDefault(); }
    else if (key === "e" || key === "E") { openCorrect(line); e.preventDefault(); }
    else if (key === "u" || key === "U") { clear(line); e.preventDefault(); }
    else if ((key === "t" || key === "T") && countableTags(line).length) { setChecking(lineReviewKey(line)); e.preventDefault(); }
    else if (key === "Enter") { const ev = evidence.get(lineReviewKey(line)); if (ev) onOpenCitation?.(ev.cite); e.preventDefault(); }
  };

  const checkingLine = checking ? lines.find((line) => lineReviewKey(line) === checking) : null;
  if (checkingLine) {
    const back = () => {
      setChecking(null);
      const i = shown.findIndex((line) => lineReviewKey(line) === lineReviewKey(checkingLine));
      if (i >= 0) setFocus(i);
    };
    return <TagCheck line={checkingLine} record={lineReviewState(checkingLine, reviews).record} renderPreview={renderPreview} onOpenCitation={onOpenCitation}
      onBack={back}
      onCount={(excluded) => { onReviewsChange(recordLineReviews(reviews, [checkingLine], { decision: "counted", excluded })); back(); }} />;
  }

  const btn = { padding: "4px 9px", fontSize: "var(--fs-xs)", border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)", cursor: "pointer", borderRadius: "var(--r-1)" };
  return <section aria-label={`Review ${title}`} data-line-review-grid style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
    <header style={{ padding: "16px 20px 10px", borderBottom: "1px solid var(--ink-faint)", display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center" }}>
      <button type="button" onClick={onBack} style={btn}>← Back to takeoff</button>
      <div style={{ fontSize: "var(--fs-l)", fontWeight: 650 }}>Review · {title}</div>
      <div data-review-summary data-confirmed={summary.confirmed} data-flagged={summary.flagged} data-corrected={summary.corrected} data-counted={summary.counted} data-stale={summary.stale} data-unreviewed={summary.unreviewed}
        style={{ fontFamily: "var(--f-mono)", fontSize: "var(--fs-s)", color: "var(--ink-muted)" }}>
        {summary.confirmed} of {summary.total} confirmed · {summary.flagged} flagged{summary.corrected ? ` · ${summary.corrected} corrected` : ""}{summary.counted ? ` · ${summary.counted} counted from tags` : ""}{summary.stale ? ` · ${summary.stale} changed since review` : ""}
      </div>
      <div role="group" aria-label="Show" style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
        {FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setFocus(0); }}
          style={{ ...btn, background: filter === k ? "var(--cobalt)" : btn.background, color: filter === k ? "var(--paper-bright)" : btn.color }}>{label}</button>)}
      </div>
      <button type="button" data-review-confirm-shown disabled={!unflaggedShown.length} onClick={confirmShown}
        title="Confirm every shown line that is not flagged, corrected, counted or already confirmed. Quantities are not changed."
        style={{ ...btn, background: "var(--cobalt)", color: "var(--paper-bright)", borderColor: "var(--cobalt)", opacity: unflaggedShown.length ? 1 : 0.5 }}>
        Confirm {unflaggedShown.length} shown
      </button>
    </header>
    <div style={{ padding: "6px 20px", fontSize: "var(--fs-xs)", color: "var(--ink-muted)" }}>
      Each tile shows the line's own evidence on the drawings. Keys: arrows move · C confirm · F flag with a note · E correct the count · T check and count its plan tags · U clear · Enter open on the drawing.
      A decision records the evidence it was made on; if that evidence later changes, the line reads “Changed since review”.
    </div>
    <div ref={grid} onKeyDown={onKeyDown} style={{ overflow: "auto", padding: "8px 20px 20px", display: "grid", gap: 12,
      gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", alignContent: "start" }}>
      {shown.map((line, i) => {
        const key = lineReviewKey(line);
        const { state, record } = lineReviewState(line, reviews);
        const st = STATE_STYLE[state];
        const ev = evidence.get(key);
        return <article key={key || i} tabIndex={0} data-review-index={i} data-review-tag={line.tag} data-review-state={state}
          onFocus={() => setFocus(i)}
          style={{ border: `2px solid ${focus === i ? "var(--cobalt)" : "var(--ink-faint)"}`, borderRadius: "var(--r-1)", padding: 8,
            background: "var(--paper-bright)", display: "flex", flexDirection: "column", gap: 6, outline: "none" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <strong style={{ fontFamily: "var(--f-mono)", whiteSpace: "nowrap" }}>{line.tag || "—"}</strong>
            <span style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", fontWeight: 650, color: st.color, whiteSpace: "nowrap" }}>{st.label}</span>
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-muted)", marginTop: -4 }}>{quantityText(line)}</div>
          <Thumb evidence={ev} renderPreview={renderPreview} />
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-muted)", minHeight: 16 }}>
            {ev ? `${ev.label} · ${pageLabel(ev.cite.sheet_id)}` : ""}{line.status ? ` · ${String(line.status).toLowerCase()}` : ""}
          </div>
          {state === "corrected" ? <div data-review-corrected={record.qty} style={{ fontSize: "var(--fs-xs)", color: STATE_STYLE.corrected.color, fontWeight: 650 }}>
            Your count {record.qty} · read {typeof line.qty === "number" ? line.qty : "—"}
          </div> : null}
          {state === "counted" ? <div data-review-counted={record.qty} style={{ fontSize: "var(--fs-xs)", color: STATE_STYLE.counted.color, fontWeight: 650 }}>
            Your count {record.qty} of {countableTags(line).length} tags{record.excluded?.length ? ` · ${record.excluded.length} left out` : ""}
          </div> : null}
          {record?.note && state !== "unreviewed" ? <div style={{ fontSize: "var(--fs-xs)", color: st.color }}>“{record.note}”</div> : null}
          {correctFor === key
            ? <form data-review-correct-form onSubmit={(e) => {
              e.preventDefault();
              const qty = Number(corrQty);
              if (!Number.isInteger(qty) || qty < 0) { setCorrError("Enter a whole number of 0 or more."); return; }
              if (!note.trim()) { setCorrError("Say why the count differs."); return; }
              decide(line, "corrected", note, qty); setCorrectFor(null);
              grid.current?.querySelector(`[data-review-index="${i}"]`)?.focus();
            }} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", gap: 4 }}>
                <input autoFocus type="number" min="0" step="1" value={corrQty} onChange={(e) => setCorrQty(e.target.value)} aria-label={`Corrected count for ${line.tag}`}
                  onKeyDown={(e) => { if (e.key === "Escape") { setCorrectFor(null); e.stopPropagation(); } }}
                  style={{ width: 64, padding: "4px 6px", font: "inherit", fontSize: "var(--fs-xs)", border: "1px solid var(--ink-faint)" }} />
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? (required)" aria-label={`Reason for ${line.tag}'s count`}
                  onKeyDown={(e) => { if (e.key === "Escape") { setCorrectFor(null); e.stopPropagation(); } }}
                  style={{ flex: 1, minWidth: 0, padding: "4px 6px", font: "inherit", fontSize: "var(--fs-xs)", border: "1px solid var(--ink-faint)" }} />
                <button type="submit" style={btn}>Save</button>
              </div>
              {corrError ? <div role="alert" style={{ fontSize: "var(--fs-xs)", color: STATE_STYLE.flagged.color }}>{corrError}</div> : null}
            </form>
            : noteFor === key
            ? <form onSubmit={(e) => { e.preventDefault(); decide(line, "flagged", note); setNoteFor(null); grid.current?.querySelector(`[data-review-index="${i}"]`)?.focus(); }}
              style={{ display: "flex", gap: 4 }}>
              <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is wrong? (optional)" aria-label={`Flag note for ${line.tag}`}
                onKeyDown={(e) => { if (e.key === "Escape") { setNoteFor(null); e.stopPropagation(); } }}
                style={{ flex: 1, minWidth: 0, padding: "4px 6px", font: "inherit", fontSize: "var(--fs-xs)", border: "1px solid var(--ink-faint)" }} />
              <button type="submit" style={btn}>Flag</button>
            </form>
            : <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              <button type="button" data-review-confirm onClick={() => decide(line, "confirmed")} style={{ ...btn, fontWeight: state === "confirmed" ? 650 : 400 }}>Confirm</button>
              <button type="button" data-review-flag onClick={() => { setNoteFor(key); setNote(record?.note || ""); }} style={btn}>Flag…</button>
              <button type="button" data-review-correct onClick={() => openCorrect(line)} style={btn}>Correct…</button>
              {countableTags(line).length > 0 && <button type="button" data-review-check-tags onClick={() => setChecking(key)}
                style={{ ...btn, fontWeight: 650, color: "var(--cobalt)", borderColor: "var(--cobalt)" }}>Check {countableTags(line).length} tags…</button>}
              {state !== "unreviewed" && <button type="button" onClick={() => clear(line)} style={{ ...btn, color: "var(--ink-muted)" }}>Clear</button>}
              {ev && <button type="button" onClick={() => onOpenCitation?.(ev.cite)} style={{ ...btn, marginLeft: "auto" }}>Open</button>}
            </div>}
        </article>;
      })}
      {!shown.length && <div style={{ color: "var(--ink-muted)", fontSize: "var(--fs-s)" }}>No lines in this view.</div>}
    </div>
  </section>;
}
