import { createContext, useContext, useEffect, useRef, useState } from "react";

const DrawingContext = createContext(() => {});
export const useRevealDrawing = () => useContext(DrawingContext);

// Surface preferences only. Nothing is written into a project or a Session.
export default function WorkspaceDock({ name, children }) {
  const root = useRef(null);
  const drag = useRef(null);
  const [width, setWidth] = useState(() => {
    try { return Number(localStorage.getItem(`ot.workspace.${name}.width`)) || 0; }
    catch { return 0; }
  });
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem(`ot.workspace.${name}.expanded`) === "true"; }
    catch { return false; }
  });
  const [bounds, setBounds] = useState({ min: 480, max: 960 });
  useEffect(() => {
    const parent = root.current?.parentElement;
    if (!parent) return;
    const update = () => {
      const available = parent.clientWidth;
      setBounds({ min: 480, max: Math.max(480, Math.min(1200, available - 560)) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const trigger = document.activeElement;
    return () => {
      // Closing returns to the primary destination, not a removed panel control.
      const target = document.querySelector(`[data-workspace-nav="${name}"]`) || trigger;
      if (document.activeElement === document.body) target?.focus?.({ preventScroll: true });
    };
  }, [name]);
  const preferred = Math.round(window.innerWidth * (name === "Schedules" ? 0.5 : 0.45));
  const actual = Math.max(bounds.min, Math.min(bounds.max, width || preferred));
  const resize = next => {
    const value = Math.max(bounds.min, Math.min(bounds.max, next));
    setWidth(value);
    try { localStorage.setItem(`ot.workspace.${name}.width`, String(value)); } catch { /* storage optional */ }
  };
  const revealDrawing = () => {
    setExpanded(false);
    try { localStorage.setItem(`ot.workspace.${name}.expanded`, "false"); } catch { /* storage optional */ }
  };
  return (
    <section ref={root} className="workspace-dock" data-workspace-dock={name}
      data-expanded={expanded || undefined} aria-label={`${name} workspace`}
      style={{ "--workspace-width": `${actual}px` }}>
      <div className="workspace-dock-surface">
      <div className="workspace-resize" role="separator" tabIndex={0}
        aria-label={`Resize ${name} workspace`} aria-orientation="vertical"
        aria-valuemin={bounds.min} aria-valuemax={bounds.max} aria-valuenow={actual}
        title="Drag to resize · Left/Right arrows adjust width · Home/End for minimum/maximum"
        onPointerDown={e => {
          if (e.button !== 0) return;
          e.preventDefault(); e.currentTarget.focus();
          drag.current = { x: e.clientX, width: actual };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => { if (drag.current) resize(drag.current.width + drag.current.x - e.clientX); }}
        onPointerUp={e => { drag.current = null; if(e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={e => {
          if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
          e.preventDefault(); e.stopPropagation();
          resize(e.key === 'Home' ? bounds.min : e.key === 'End' ? bounds.max : actual + (e.key === 'ArrowLeft' ? 1 : -1) * (e.shiftKey ? 64 : 32));
        }} />
      <div className="workspace-dock-tools">
        <span>Drawing + {name}</span>
        <button type="button" onClick={() => {
          const next = !expanded;
          setExpanded(next);
          try { localStorage.setItem(`ot.workspace.${name}.expanded`, String(next)); } catch { /* storage optional */ }
        }} aria-pressed={expanded}
          title={expanded ? "Restore split workspace" : "Expand workspace"}>
          {expanded ? "Split view" : "Expand"}
        </button>
      </div>
      <DrawingContext.Provider value={revealDrawing}>{children}</DrawingContext.Provider>
      </div>
    </section>
  );
}
