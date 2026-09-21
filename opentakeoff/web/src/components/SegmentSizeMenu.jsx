// #linear-takeoff (WP1.3, opentakeoff-corpus/goals/LINEAR_TAKEOFF.md): the
// "Set size…" popover for a right-clicked Linear-shape segment. Self-
// contained — owns its own kind/value form state, seeded once from `size`
// at mount; the caller keys it on shapeId+segIndex so switching segments
// always remounts a fresh form instead of carrying stale edits over. Builds
// exactly one of the four web/src/lib/linear/types.ts RunSize shapes and
// hands it to onSet — never touches the canvas's shapes array itself.
import { useState } from "react";

const KINDS = [
  { value: "rect", label: "Rectangular" },
  { value: "round", label: "Round" },
  { value: "oval", label: "Flat oval" },
  { value: "pipe", label: "Pipe (NPS)" },
];

export default function SegmentSizeMenu({ x, y, size, onSet, onClear, onCancel }) {
  const [kind, setKind] = useState(size?.kind || "rect");
  const [vals, setVals] = useState({
    w_in: size?.kind === "rect" ? String(size.w_in) : "",
    h_in: size?.kind === "rect" ? String(size.h_in) : "",
    d_in: size?.kind === "round" ? String(size.d_in) : "",
    major_in: size?.kind === "oval" ? String(size.major_in) : "",
    minor_in: size?.kind === "oval" ? String(size.minor_in) : "",
    nps_in: size?.kind === "pipe" ? String(size.nps_in) : "",
  });
  const set = (k) => (e) => setVals((v) => ({ ...v, [k]: e.target.value }));
  const num = (k) => Number(vals[k]);
  const valid = kind === "rect" ? num("w_in") > 0 && num("h_in") > 0
    : kind === "round" ? num("d_in") > 0
    : kind === "oval" ? num("major_in") > 0 && num("minor_in") > 0
    : num("nps_in") > 0;
  const submit = () => {
    if (!valid) return;
    onSet(
      kind === "rect" ? { kind, w_in: num("w_in"), h_in: num("h_in") }
        : kind === "round" ? { kind, d_in: num("d_in") }
        : kind === "oval" ? { kind, major_in: num("major_in"), minor_in: num("minor_in") }
        : { kind, nps_in: num("nps_in") },
    );
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };
  const field = (key, placeholder, step = "0.5", autoFocus = false) => (
    <input type="number" min="0" step={step} placeholder={placeholder} value={vals[key]}
      onChange={set(key)} onKeyDown={onKeyDown} autoFocus={autoFocus}
      style={{ width: "100%", boxSizing: "border-box" }} />
  );
  return (
    // stopPropagation: this sits over the canvas's own pointerdown/pointerup
    // handlers (pan, click-to-place-a-point) — a click inside the popover
    // must never also register as a canvas gesture.
    <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed", left: x + 6, top: y + 6, zIndex: 50,
        background: "var(--panel-bg, #1c1f26)", color: "var(--ink, #eee)",
        border: "1px solid var(--panel-border, #383c46)", borderRadius: 8,
        padding: 10, boxShadow: "0 6px 20px rgba(0,0,0,.4)", fontSize: 12, width: 190,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Set segment size</div>
      <select value={kind} onChange={(e) => setKind(e.target.value)} onKeyDown={onKeyDown}
        style={{ width: "100%", marginBottom: 6 }}>
        {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>
      {kind === "rect" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {field("w_in", "W in", "0.5", true)}
          {field("h_in", "H in")}
        </div>
      )}
      {kind === "round" && <div style={{ marginBottom: 6 }}>{field("d_in", "Diameter in", "0.5", true)}</div>}
      {kind === "oval" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {field("major_in", "Major in", "0.5", true)}
          {field("minor_in", "Minor in")}
        </div>
      )}
      {kind === "pipe" && <div style={{ marginBottom: 6 }}>{field("nps_in", "NPS in", "0.25", true)}</div>}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
        {size && <button type="button" onClick={onClear}>Clear</button>}
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={submit} disabled={!valid}>Set</button>
      </div>
    </div>
  );
}
