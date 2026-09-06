// Tip — the app's explanation, delivered to everyone.
//
// Core instruction in this product lives in native `title=` attributes: 87 of
// them on the canvas alone, a dozen running past 90 characters and some three
// full sentences. Native title has three problems, and the third is the one
// that matters:
//
//   1. ~1s delay before it appears, and the OS decides how it looks.
//   2. It cannot wrap sensibly, so a three-sentence tooltip is a single
//      enormous line or truncated by the platform.
//   3. IT NEVER SHOWS ON KEYBOARD FOCUS. Only hover. So a keyboard user is
//      simply not told what any of these controls do — the explanation exists
//      and is unreachable.
//
// This shows on hover after a short beat AND immediately on focus, styled from
// S.tooltip, positioned fixed off the trigger's own rect (the technique
// ToolMenu already uses) so no scrolling ancestor can clip it — the tool rail
// and the top bar are both scroll containers.
//
// It is a wrapper, not a replacement for every title in the tree: short labels
// are fine as native titles and converting all 87 would be churn. Use Tip where
// the text actually explains something.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { S, Z } from "../lib/ui.js";

const OPEN_DELAY_MS = 350;
const GAP = 8;

export default function Tip({ text, placement = "bottom", children, maxWidth = 280, disabled = false }) {
  const [at, setAt] = useState(null);
  const holdRef = useRef(null);
  const wrapRef = useRef(null);
  const idRef = useRef(`tip-${Math.random().toString(36).slice(2, 9)}`);

  const hide = useCallback(() => {
    clearTimeout(holdRef.current);
    setAt(null);
  }, []);

  const place = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Clamped to the viewport on both axes, so a tip on the last rail tile or
    // the rightmost toolbar chip is never half off screen.
    const w = Math.min(maxWidth, window.innerWidth - 16);
    if (placement === "right") {
      setAt({ left: Math.min(r.right + GAP, window.innerWidth - w - 8), top: Math.max(8, r.top), w });
    } else {
      setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top: r.bottom + GAP, w });
    }
  }, [placement, maxWidth]);

  // Escape dismisses, and any scroll invalidates the position we measured.
  useEffect(() => {
    if (!at) return;
    const onKey = (e) => { if (e.key === "Escape") hide(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("scroll", hide, true); };
  }, [at, hide]);

  useEffect(() => () => clearTimeout(holdRef.current), []);

  if (disabled || !text) return children;

  return (
    <span
      ref={wrapRef}
      style={{ display: "inline-flex", position: "relative" }}
      onPointerEnter={() => { clearTimeout(holdRef.current); holdRef.current = setTimeout(place, OPEN_DELAY_MS); }}
      onPointerLeave={hide}
      onPointerDown={hide}
      // Focus shows it AT ONCE — no delay. Someone tabbing has already told us
      // they want to know what this is, and a hover delay on a keyboard is just
      // a pause with no cause.
      onFocusCapture={place}
      onBlurCapture={hide}
    >
      {React.isValidElement(children)
        ? React.cloneElement(children, { "aria-describedby": at ? idRef.current : undefined })
        : children}
      {at && (
        <span
          role="tooltip"
          id={idRef.current}
          style={{
            ...S.tooltip,
            position: "fixed", left: at.left, top: at.top, width: at.w,
            zIndex: Z.toast,          // above popovers: a tip explains the thing on top of it
            whiteSpace: "normal",     // S.tooltip is nowrap for chips; these are sentences
            lineHeight: 1.45,
            pointerEvents: "none",
            fontFamily: "var(--f-body)",
          }}
        >{text}</span>
      )}
    </span>
  );
}
