// SweepReviewPanel — see every match, then decide.
//
// Symbol review lived as ~107 lines of inline JSX in a 12.8k-line file, and it
// showed each match as text: "84% · EBB-1". The settled industry pattern
// (Bluebeam, Procore, eTakeoff) is marquee one symbol → see every match as a
// picture → deselect the wrong ones → apply, because "is that the same device?"
// is a question about shape, not about a percentage.
//
// Each tile is the sheet's OWN linework under that placement, drawn as SVG
// straight from vectorSegs — the same array the sweep matched on, in the same
// frame. Not a raster crop: pdf.js replays the whole page operator list per
// render regardless of crop size, so one tile per match would be one full page
// render per match. And not the seed's fingerprint rotated into place, which
// would draw an identical idealised glyph for every row and defeat the review
// entirely — the point is seeing what is ACTUALLY drawn there, including the
// extra ink that made the engine hesitate.
import React, { useMemo } from "react";
import { Z } from "../lib/ui.js";
import { buildSegIndex, segmentsInBox, matchBox, tileLines } from "../lib/sweepThumb.js";

/** One match, as it is drawn on the sheet. `rotation` is the row's own
 * disclosed angle — continuous when `transform` is present (docs/SYMBOL-
 * SWEEP-AFFINE-GOAL.md), one of 0/90/180/270 otherwise — so the tile is
 * sized for the actual placement, not just squared off for a right angle.
 * `transform`, when present, gets a plain hover title naming the fit — the
 * one place a MATCH row (no `reason` text) still discloses it. */
function Thumb({ segs, index, seedRect, at, rotation = 0, transform, size = 46, color, dim, mark }) {
  const box = useMemo(() => matchBox(at, seedRect, undefined, rotation), [at, seedRect, rotation]);
  const lines = useMemo(
    () => (box && segs && index ? tileLines(segs, segmentsInBox(segs, index, box), box) : []),
    [segs, index, box],
  );
  if (!box) return null;
  // Stroke in the tile's own units so a 40px symbol and a 570px assembly both
  // come out legible at 46 screen px.
  const sw = Math.max(box.w / size, box.w / 90);
  const title = transform
    ? `${transform.rotation_deg}° · ${transform.scale_x}× / ${transform.scale_y}× scale · ${transform.shear_deg}° shear${transform.mirrored ? " · mirrored" : ""}`
    : undefined;
  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${box.w} ${box.h}`}
      aria-hidden="true"
      style={{
        display: "block", background: "var(--paper-bright)",
        border: `1px solid ${color}`, opacity: dim ? 0.4 : 1, flexShrink: 0,
      }}>
      {title && <title>{title}</title>}
      {lines.map(([ax, ay, bx, by], i) => (
        <line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--ink)" strokeWidth={sw} strokeLinecap="round" />
      ))}
      {/* nothing under the match is not the same as a tile that failed to draw */}
      {lines.length === 0 && (
        <text x={box.w / 2} y={box.h / 2} textAnchor="middle" dominantBaseline="middle"
          fill="var(--ink-muted)" fontSize={box.w / 4}>?</text>
      )}
      {mark ? (
        <text x={box.w * 0.06} y={box.h * 0.22} fill={color} fontSize={box.w / 5} fontWeight="700"
          fontFamily="JetBrains Mono, monospace">{mark}</text>
      ) : null}
    </svg>
  );
}

/** Enough of a group to judge it; a count says how many more there are. */
const MATCH_THUMBS = 12;

export default function SweepReviewPanel({
  sweep, setSweep, segs, sweepLabelLine, commitSweep, activeCondTag, DS,
}) {
  // Built once per sweep, not per tile: a sheet runs to 100k+ segments and a
  // busy sweep to dozens of matches. Cell size follows the seed footprint, so
  // one tile query touches a couple of cells whatever the device's scale.
  const segIndex = useMemo(() => {
    if (!segs || !segs.length) return null;
    const r = sweep?.seed?.rect;
    const cell = r ? Math.max(32, Math.min(256, Math.max(r.w, r.h))) : 64;
    return buildSegIndex(segs, cell);
  }, [segs, sweep?.seed?.rect]);
  const seedRect = sweep?.seed?.rect || null;
  // A sheet whose linework was evicted reviews as text — the old behaviour,
  // never a broken tile.
  const canThumb = !!(segIndex && seedRect);

  const seedTag = sweep.seed.label?.label || null;
  const mLine = sweepLabelLine(sweep.matches, seedTag);
  const openQ = sweep.questions.filter((q) => q.state === "open").length;
  const accQ = sweep.questions.filter((q) => q.state === "accepted").length;
  // per-tag groups (#308 → commit-by-label): the drawing names the
  // matches; a tag the estimator unticks is excluded from the commit —
  // the sibling-fixture answer in one click, sweep_schedule_row's
  // excluded-by-tag discipline brought to the canvas.
  const tagKeyOf = (m) => (m.label && m.label.label) || "\u2205";
  const tagGroups = [];
  for (const m of sweep.matches) {
    const k = tagKeyOf(m);
    const g = tagGroups.find((x) => x.tag === k);
    if (g) g.n += 1; else tagGroups.push({ tag: k, n: 1 });
  }
  tagGroups.sort((a, b) => b.n - a.n);
  const offSet = new Set(sweep.excludedTags);
  const matchN = sweep.matches.filter((m) => !offSet.has(tagKeyOf(m))).length;
  const commitN = (sweep.includeSeed ? 1 : 0) + matchN + accQ;
  const unlabeled = (seedTag || sweep.matches.some((m) => m.label)) ? sweep.matches.filter((m) => !m.label).length : 0;
  return (
    <div data-sweep-review style={{ position: "fixed", right: 12, top: "calc(var(--topbar-h) + 12px)", width: 340, zIndex: Z.popover, background: "var(--paper-cream)", border: "1px solid var(--ink-faint)", boxShadow: "var(--shadow-pop)", display: "flex", flexDirection: "column", fontSize: "var(--fs-m)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--ink-faint)" }}>
        <span className="field-label">SYMBOL SWEEP</span>
        <span style={{ flex: 1 }} />
        {sweep.complete
          ? <span style={{ fontFamily: "var(--f-mono)", fontSize: "var(--fs-2xs)", letterSpacing: ".1em", color: "var(--c-positive)", border: "1px solid var(--c-positive)", padding: "2px 6px" }}>COMPLETE</span>
          : <span style={{ fontFamily: "var(--f-mono)", fontSize: "var(--fs-2xs)", letterSpacing: ".1em", color: "#fff", background: "var(--c-warning)", padding: "3px 6px" }}>FLOOR — NOT A TOTAL</span>}
      </div>
      {sweep.seed.segments <= 3 && (
        <div style={{ padding: "8px 12px", background: "var(--tint-select)", color: "var(--ink)", fontSize: "var(--fs-s)", lineHeight: 1.45 }}>
          The seed is only {sweep.seed.segments} segment(s) — likely a FRAGMENT, and fragments match everywhere (every square corner reads as one). Marquee the whole symbol.
        </div>
      )}
      {!sweep.complete && (
        <div style={{ padding: "8px 12px", background: "var(--c-warning)", color: "#fff", fontSize: "var(--fs-s)", lineHeight: 1.45 }}>
          {sweep.dropped} placement(s) were never scored — tighten the marquee around more distinctive linework before trusting this as a total.
        </div>
      )}
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div><b style={{ fontFamily: "var(--f-display)", fontSize: "var(--fs-xl)" }}>{matchN}</b> of {sweep.matches.length} matched will commit{mLine && tagGroups.length <= 1 ? <span style={{ color: "var(--ink-soft)" }}> — {mLine}</span> : null}</div>
        {tagGroups.length > 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div className="field-label">BY LABEL — UNTICK A TAG TO EXCLUDE IT</div>
            {tagGroups.map((g) => {
              const isSeedTag = seedTag && g.tag === seedTag;
              const isOff = offSet.has(g.tag);
              return (
                <div key={g.tag} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-s)", cursor: "pointer", color: isOff ? "var(--text-faint)" : !isSeedTag && g.tag !== "\u2205" ? "var(--c-warning)" : "var(--ink)" }}>
                  <input type="checkbox" checked={!isOff}
                    onChange={() => setSweep((sw2) => ({ ...sw2, excludedTags: isOff ? sw2.excludedTags.filter((t) => t !== g.tag) : [...sw2.excludedTags, g.tag] }))} />
                  <span style={{ fontFamily: "var(--f-mono)", fontWeight: 600 }}>{g.tag === "\u2205" ? "no label" : g.tag}</span>
                  <span>×{g.n}</span>
                  {isSeedTag && <span style={{ fontSize: "var(--fs-2xs)", color: "var(--ink-muted)" }}>seed's tag</span>}
                  {!isSeedTag && g.tag !== "\u2205" && !isOff && <span style={{ fontSize: "var(--fs-2xs)" }}>different device?</span>}
                </label>
                {/* WHAT THE MATCHES ACTUALLY LOOK LIKE. A group headed
                    "different device?" is exactly the question a percentage
                    cannot settle and a picture settles at a glance. */}
                {canThumb && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 22 }}>
                    {sweep.matches.filter((m) => tagKeyOf(m) === g.tag).slice(0, MATCH_THUMBS).map((m, i) => (
                      <Thumb key={i} segs={segs} index={segIndex} seedRect={seedRect} at={m.at}
                        rotation={m.transform?.rotation_deg ?? m.rotation} transform={m.transform}
                        color={isOff ? "var(--ink-faint)" : "var(--cobalt)"} dim={isOff} />
                    ))}
                    {g.n > MATCH_THUMBS && (
                      <span style={{ alignSelf: "center", fontSize: "var(--fs-2xs)", color: "var(--ink-muted)", fontFamily: "var(--f-mono)" }}>+{g.n - MATCH_THUMBS}</span>
                    )}
                  </div>
                )}
                </div>
              );
            })}
          </div>
        )}
        {unlabeled > 0 && tagGroups.length <= 1 && <div style={{ fontSize: "var(--fs-s)", color: "var(--c-warning)" }}>{unlabeled} match(es) carry no label while this family is labeled — look at those first.</div>}
        <div><b style={{ fontFamily: "var(--f-display)", fontSize: "var(--fs-xl)", color: openQ ? "var(--c-warning)" : "var(--ink)" }}>{sweep.questions.length}</b> question(s){openQ ? <span style={{ color: "var(--ink-soft)" }}> — ↵ accept · X dismiss · → next</span> : <span style={{ color: "var(--ink-soft)" }}> — all answered</span>}</div>
        {/* 150px fitted bare percentage rows; the selected question now
            carries its reason, which is ~3 lines. */}
        {sweep.questions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 210, overflowY: "auto" }}>
            {/* THE SWEEP SAYS WHY, AND THIS LIST USED TO SWALLOW IT.
                symbolsweep writes a quantified reason for every question
                — "matched 84% of the seed's linework (commit bar 92%) —
                likely a variant or an overlapped instance" — and it has
                been sitting in `q.reason` all along (it rides the spread
                at runSymbolSweep). The row showed a bare percentage, so
                the estimator was asked to accept or dismiss a count with
                the engine's actual finding hidden from them.
                Shown for the SELECTED question only: the reasons run ~150
                chars and this panel is narrow, so all of them at once is
                a wall of text. The one you are deciding on is the one
                that matters. */}
            {sweep.questions.map((q, i) => (
              <button key={i} type="button" onClick={() => setSweep((s) => ({ ...s, qIndex: i }))}
                style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4, padding: "5px 8px", fontFamily: "var(--f-body)", fontSize: "var(--fs-s)", textAlign: "left", background: i === sweep.qIndex ? "var(--tint-select)" : "transparent", border: `1px solid ${i === sweep.qIndex ? "var(--c-warning)" : "var(--ink-faint)"}`, color: q.state === "dismissed" ? "var(--text-faint)" : "var(--ink)", cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: q.state === "dismissed" ? "line-through" : "none" }}>
                  {canThumb && (
                    <Thumb segs={segs} index={segIndex} seedRect={seedRect} at={q.at} size={40}
                      rotation={q.transform?.rotation_deg ?? q.rotation} transform={q.transform}
                      color={q.state === "accepted" ? "var(--c-positive)" : q.state === "dismissed" ? "var(--ink-faint)" : DS.symbol.question}
                      dim={q.state === "dismissed"} />
                  )}
                  <span style={{ fontFamily: "var(--f-mono)", fontWeight: 700, color: q.state === "accepted" ? "var(--c-positive)" : q.state === "dismissed" ? "var(--text-faint)" : DS.symbol.question }}>{q.state === "accepted" ? "✓" : q.state === "dismissed" ? "×" : "?"}</span>
                  <span>{Math.round(q.score * 100)}%{q.label ? ` · ${q.label.label}` : ""}{q.readings > 1 ? ` · read ${q.readings} ways` : ""}</span>
                </span>
                {i === sweep.qIndex && q.reason && (
                  <span style={{ fontSize: "var(--fs-xs)", lineHeight: 1.45, color: "var(--ink-soft)", whiteSpace: "normal" }}>{q.reason}</span>
                )}
              </button>
            ))}
          </div>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-s)", cursor: "pointer" }}>
          <input type="checkbox" checked={sweep.includeSeed} onChange={(e) => setSweep((s) => ({ ...s, includeSeed: e.target.checked }))} />
          <span>Count the seed{seedTag ? <span> — drawing says <b style={{ fontFamily: "var(--f-mono)" }}>{seedTag}</b></span> : null}</span>
        </label>
      </div>
      <div style={{ padding: "10px 12px", borderTop: "1px solid var(--ink-faint)", display: "flex", flexDirection: "column", gap: 6 }}>
        <button type="button" className="btn-primary" onClick={commitSweep} style={{ justifyContent: "center" }}>
          Commit {commitN} as {activeCondTag || "…"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setSweep(null)} style={{ justifyContent: "center" }}>Discard (Esc)</button>
      </div>
    </div>
  );

}
