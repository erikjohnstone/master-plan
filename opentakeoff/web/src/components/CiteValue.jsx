// CiteValue — a value you can click to see where it came from.
//
// The evidence chain is the best thing in this product: every cited number
// knows its sheet and its bbox, and one click paints it on the drawing. It
// lived as a private function inside TakeoffDataPanel, so the Agent's answers —
// the place an estimator most wants to ask "says who?" — could not use it and
// pushed the whole story into a collapsed "Sources · N" drawer instead.
//
// Shared, so the takeoff table and the agent's prose behave identically.
import React from "react";

/** Clickable takeoff control — jumps to a schedule row or whole table on the drawings. */
export default function CiteValue({ text, cite, onOpenCitation, align = "left", mono = false, weight = 400, title }) {
  const display = text === "" || text == null ? "—" : String(text);
  // TWO PRODUCERS, TWO SPELLINGS. Takeoff cites carry `sheet_id`
  // (agentTakeoff.js lineLeadCite); agent citations carry `sheet`
  // (agentHighlightCitation). That single mismatch is why this component could
  // not already serve both. Accept either; the click hands the cite back
  // untouched, so each caller's own handler still reads its own field.
  const canJump = (cite?.sheet_id || cite?.sheet) && Array.isArray(cite.bbox_px) && cite.bbox_px.length === 4
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
