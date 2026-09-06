// ToolMenu — brand dropdown for the takeoff toolbar (and tab overflow).
// STACK-style state+switcher: the trigger face can show the currently armed
// tool while the panel switches it. Square corners, paper/ink/cobalt tokens.
//
// Beyond plain action items it also serves the two-deck toolbar's chips:
// `faceStyle`/`menuStyle` restyle the trigger and panel (scale chip, account
// chip), items may be `{ section }`, `"divider"`, `{ note }` (muted footnote),
// `{ custom }` (arbitrary row, e.g. the fill-sensitivity slider — interacting
// inside it never closes the menu), and `{ checked, stayOpen }` checkable
// items that flip in place (render menu). An item may carry `onHover(bool)` to
// preview its effect while pointed at (the scale menu's plan-says item shows
// the calibrated guide bar on the sheet behind the open menu).
import React, { useEffect, useRef, useState } from "react";
import { keyText } from "../lib/keys.ts";
import { Icon } from "../brand/icons.jsx";

const MENU_W = 232;

export default function ToolMenu({ face, active = false, accent = "cobalt", title = "", items, onOpenChange, faceStyle, menuStyle, disabled = false, flyout = null }) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const [flyAt, setFlyAt] = useState(null);   // {left, top} for flyout="right" — fixed, so ancestor overflow can't clip it (the rail)
  const rootRef = useRef(null);
  // KEYBOARD USERS COULD OPEN THIS MENU AND THEN GO NOWHERE. It had no
  // role, no aria-expanded, and no arrow keys — a screen reader announced a
  // plain button, and Tab walked out of the panel instead of down it. `cursor`
  // is the focused row; -1 means the menu was opened by pointer and nothing is
  // focused yet, so hovering still behaves exactly as before.
  const [cursor, setCursor] = useState(-1);
  const itemRefs = useRef([]);
  const menuId = useRef(`menu-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Focus goes back to the trigger. Dropping it on <body> would strand a
      // keyboard user at the top of the page after every dismissed menu.
      rootRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Notify strictly in open/close PAIRS: fire true only when opening, and repay
  // it in the cleanup — which also runs if the menu unmounts while open (e.g.
  // sign-out unmounts the account menu mid-click). Calling onOpenChange(open)
  // unconditionally would fire a stray `false` on every closed-menu mount and
  // never fire the closing `false` on unmount, leaking menuDepthRef either way.
  useEffect(() => {
    if (!open) return;
    onOpenChange?.(true);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);

  // Sections, dividers, notes and custom rows are not stops; a disabled item
  // is not a stop either. The arrow keys walk THIS list, so they can never
  // land somewhere Enter would do nothing.
  const stops = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it && it !== "divider" && !it.section && !it.note && !it.custom && !it.disabled)
    .map(({ i }) => i);

  const step = (dir) => {
    if (!stops.length) return;
    const at = stops.indexOf(cursor);
    const next = at < 0
      ? (dir > 0 ? stops[0] : stops[stops.length - 1])
      : stops[(at + dir + stops.length) % stops.length];
    setCursor(next);
    // focus the row itself, so the shared :focus-visible ring shows where you are
    requestAnimationFrame(() => itemRefs.current[next]?.focus());
  };

  const accentColor = accent === "danger" ? "var(--c-danger)" : "var(--cobalt)";
  const menuW = (menuStyle && parseInt(menuStyle.minWidth, 10)) || MENU_W;
  const toggle = () => {
    if (disabled) return;
    if (!open && rootRef.current) {
      const r = rootRef.current.getBoundingClientRect();
      const flipNow = r.left + menuW > window.innerWidth - 16;
      setFlip(flipNow);
      // Every menu opens as position:fixed off the TRIGGER'S RECT, not as a
      // child box of the trigger. An absolutely-positioned menu is clipped by
      // any scrolling ancestor, which is what stops the top bar from being
      // allowed to scroll when its row is wider than the window — and a row
      // that can neither wrap (issue #61's contract) nor scroll simply puts
      // Report/Action past the right edge with no way to reach them.
      const estH = Math.min(items.length, 8) * 40 + 12;
      if (flyout === "right") {
        setFlyAt({ left: r.right + 6, top: Math.max(8, Math.min(r.top, window.innerHeight - estH - 8)) });
      } else {
        const left = flipNow ? Math.max(8, r.right - menuW) : Math.min(r.left, window.innerWidth - menuW - 8);
        setFlyAt({ left, top: r.bottom + 4 });
      }
    }
    setOpen((v) => !v);
    setCursor(-1);
  };

  return (
    <span ref={rootRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={toggle}
        title={title}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // Down/Up open the menu ON the first/last item, the standard menu-button
        // behaviour; Enter/Space already work because this is a real <button>.
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) { toggle(); setTimeout(() => step(e.key === "ArrowDown" ? 1 : -1), 0); }
            else step(e.key === "ArrowDown" ? 1 : -1);
          }
        }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 10px", cursor: disabled ? "default" : "pointer",
          border: `1px solid ${active ? accentColor : "var(--ink-faint)"}`,
          background: active ? accentColor : (open ? "var(--paper-shadow)" : "transparent"),
          color: active ? "var(--paper-bright)" : "var(--ink)",
          opacity: disabled ? 0.38 : 1,
          fontFamily: "var(--f-body)", fontSize: 12.5, fontWeight: 600, lineHeight: 1,
          ...faceStyle,
        }}>
        {face}
        <span style={{ display: "inline-flex", opacity: 0.7 }}><Icon name="chevronDown" size={11} /></span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={title || undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); step(e.key === "ArrowDown" ? 1 : -1); }
            else if (e.key === "Home") { e.preventDefault(); setCursor(stops[0] ?? -1); requestAnimationFrame(() => itemRefs.current[stops[0]]?.focus()); }
            else if (e.key === "End") { e.preventDefault(); const l = stops[stops.length - 1]; setCursor(l ?? -1); requestAnimationFrame(() => itemRefs.current[l]?.focus()); }
            else if (e.key === "Tab") { setOpen(false); }   // Tab leaves the menu, it does not walk it
          }}
          style={{
          ...(flyAt
            ? { position: "fixed", left: flyAt.left, top: flyAt.top }
            : { position: "absolute", top: "calc(100% + 4px)", [flip ? "right" : "left"]: 0 }),
          zIndex: 60,
          minWidth: MENU_W, background: "var(--paper-bright)", border: "1px solid var(--ink)",
          boxShadow: "var(--shadow-2)", padding: "4px 0",
          ...menuStyle,
        }}>
          {items.map((it, i) => {
            if (it === "divider") return <div key={i} style={{ height: 1, background: "var(--ink-faint)", margin: "4px 0" }} />;
            if (it.section) return (
              <div key={i} style={{ padding: "6px 12px 3px", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-muted)" }}>{it.section}</div>
            );
            if (it.note) return (
              <div key={i} style={{ padding: "6px 12px 8px", fontSize: 11, color: "var(--ink-muted)", lineHeight: 1.4 }}>{it.note}</div>
            );
            if (it.custom) return <div key={it.id || i}>{it.custom}</div>;
            const dis = !!it.disabled;
            const checkable = "checked" in it;
            const fg = it.danger ? "var(--c-danger)" : "var(--ink)";
            return (
              <button key={it.id || i} type="button" disabled={dis} title={it.title || ""}
                ref={(el) => { itemRefs.current[i] = el; }}
                role={checkable ? "menuitemcheckbox" : "menuitem"}
                {...(checkable ? { "aria-checked": !!it.checked } : {})}
                tabIndex={cursor === i ? 0 : -1}
                onClick={() => { if (!dis) { if (!it.stayOpen) setOpen(false); it.onSelect?.(); } }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px",
                  border: "none", textAlign: "left", cursor: dis ? "default" : "pointer",
                  background: it.active ? "var(--paper-cream)" : "transparent",
                  borderLeft: it.active ? "2px solid var(--cobalt)" : "2px solid transparent",
                  opacity: dis ? 0.38 : 1, color: fg,
                }}
                onMouseEnter={(e) => { if (!dis && !it.active) e.currentTarget.style.background = "var(--paper-shadow)"; if (!dis) it.onHover?.(true); }}
                onMouseLeave={(e) => { e.currentTarget.style.background = it.active ? "var(--paper-cream)" : "transparent"; if (!dis) it.onHover?.(false); }}>
                {checkable && <span style={{ display: "inline-flex", width: 15, justifyContent: "center", color: "var(--c-positive)", visibility: it.checked ? "visible" : "hidden" }}><Icon name="check" size={14} /></span>}
                {it.icon && <span style={{ display: "inline-flex", width: 17, justifyContent: "center", color: it.tint || fg }}><Icon name={it.icon} size={16} /></span>}
                <span style={{ flex: 1, fontFamily: "var(--f-body)", fontSize: 13, fontWeight: it.active ? 600 : 400 }}>{it.label}</span>
                {it.shortcut && <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--ink-muted)" }}>{keyText(it.shortcut)}</span>}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
