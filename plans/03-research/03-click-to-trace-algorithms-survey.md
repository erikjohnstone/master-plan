# Click-to-Trace Linear Takeoff on Vector PDF Drawings: Survey, Algorithms and Recommendations

*Companion research file for `plans/03-linear-takeoff-hvac-bas-plan.md` (§6, Appendix E). Web research on 2026-09-16.*

**Research caveats.** The session's egress proxy blocked arxiv.org (and mirrors), USPTO/Google Patents/Justia, Springer, ACM, ScienceDirect, IPOL, ArcGIS, Bluebeam, Autodesk and most vendor sites; GitHub, HuggingFace and search-result excerpts were reachable. Claims sourced only from search excerpts or abstracts are flagged **[excerpt-only]**; things that could not be confirmed are flagged **[unverified]**. No public duct/pipe-plan takeoff dataset was found (Section 8).

---

## 1. Line-network extraction from vector drawings

### State of the art
- **Noding/arrangements.** The canonical robust way to turn a bag of segments into a planar graph is *noding* + *snap rounding*. JTS's `UnaryUnionOp` defines "fully noded" as "an endpoint or node in the result for every endpoint or line segment crossing in the input" and "dissolved" as coincident segments reduced to one ([JTS UnaryUnionOp](https://github.com/locationtech/jts/blob/master/modules/core/src/main/java/org/locationtech/jts/operation/union/UnaryUnionOp.java)). JTS offers three noders with different robustness/precision trade-offs: fast floating noding, a `SnappingNoder` (vertices and intersections snapped within a tolerance; "vertices take priority over intersection points"; tolerance should be "as small as possible while still producing a correct result") and a `SnapRoundingNoder` that puts all vertices on a grid defined by a precision model using "hot pixels", with intersection detection done *before* rounding "to avoid distorting the line arrangement" ([SnappingNoder](https://github.com/locationtech/jts/blob/master/modules/core/src/main/java/org/locationtech/jts/noding/snap/SnappingNoder.java), [SnapRoundingNoder](https://github.com/locationtech/jts/blob/master/modules/core/src/main/java/org/locationtech/jts/noding/snapround/SnapRoundingNoder.java), [OverlayNG noding strategies](http://lin-ear-th-inking.blogspot.com/2020/06/jts-overlayng-noding-strategies.html)). Snap rounding theory: Hobby, Goodrich–Guibas–Hershberger–Tanenbaum (SoCG 1997), Guibas–Marimont; CGAL implements SR and *Iterated* SR, where "each vertex is at least half-the-width-of-a-pixel away from any non-incident edge" ([CGAL Snap_rounding_2](https://doc.cgal.org/latest/Snap_rounding_2/index.html), [CGAL bibliography](https://doc.cgal.org/latest/Snap_rounding_2/citelist.html), [Goodrich et al.](https://dl.acm.org/doi/10.1145/262839.262985), [ISR with bounded drift](https://dl.acm.org/doi/10.1145/1137856.1137910)). Snap rounding "preserves certain topological properties of the arrangement" ([Wikipedia](https://en.wikipedia.org/wiki/Snap_rounding)) but ISR can drift; bounded-drift variants exist.
- **Chain merging semantics.** `LineMerger` merges only at nodes of degree exactly 2, stops at degree 1 or ≥3, and requires correctly noded input (it "will accept non-noded data but won't merge edges that aren't properly noded") ([JTS LineMerger](https://github.com/locationtech/jts/blob/master/modules/core/src/main/java/org/locationtech/jts/operation/linemerge/LineMerger.java)). `Polygonizer` requires noded input and reports *dangles* ("one or both ends not incident on another edge endpoint") and *cut edges* ([JTS Polygonizer](https://github.com/locationtech/jts/blob/master/modules/core/src/main/java/org/locationtech/jts/operation/polygonize/Polygonizer.java)). Shapely's `unary_union` on lines "fully dissolves and nodes"; `linemerge` and `polygonize` mirror JTS ([Shapely manual](https://shapely.readthedocs.io/en/stable/manual.html), [unary_union](https://shapely.readthedocs.io/en/stable/reference/shapely.unary_union.html)). **Implication:** the GIS stack gives "fully noded" graphs where every crossing becomes a node — exactly what is *not* wanted for pipes that cross without joining. A node classifier must be built on top (below).
- **Engineering-drawing digitization.** Moreno-García et al. 2019 give the general framework (detection → contextualisation) and review P&ID digitisation ([NCA 2019](https://link.springer.com/article/10.1007/s00521-018-3583-1)). Rahul et al. 2019 detect pipelines and assign line codes by nearest-distance rules ([arXiv 1901.11383](https://arxiv.org/abs/1901.11383)). Digitize-PID (Paliwal et al., PAKDD 2021) uses a three-stage Detection→Comprehension→Reconciliation pipeline with "kernel-based"/morphological line detection plus a dashed-line detector, and released Dataset-P&ID (500 synthetic sheets) ([arXiv 2109.03794](https://arxiv.org/abs/2109.03794), [HF abstract](https://huggingface.co/papers/2109.03794)). PID2Graph (2024) frames the problem as image-to-graph with a Relationformer and introduces node classes **"line ankles" (bends), "crossings" (pipes intersect without connecting) and "borders"**, reporting 83.63% node AP / 75.46% edge mAP on real OPEN100 data and 96.89%/88.95% on synthetic ([arXiv 2411.13929](https://arxiv.org/abs/2411.13929), [HF abstract](https://huggingface.co/papers/2411.13929), [Zenodo dataset](https://zenodo.org/records/14803338)). Prusty et al. 2025 show that merging detected segments into continuous pipes needs only four geometric rules — "edge-to-edge closeness, perpendicular edge-on-line contact, crossing non-splitting, transitive fusion of groups that share a segment, and deletion of orphan segments" — reaching 93.65% ([arXiv 2505.11976](https://arxiv.org/abs/2505.11976)) **[excerpt-only]**. A P&ID→digital-twin pipeline uses the rule "a connection exists if two or three lines leave the line crossing and no connection exists if four lines leave" ([arXiv 2108.13912](https://arxiv.org/pdf/2108.13912)) **[excerpt-only; verify attribution]**. Bentley's patent US 12,406,519 combines a link-segmentation model, a keypoint (start/stop) heatmap model and a gradient-boosted label→link association model producing a connectivity matrix ([USPTO PDF](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12406519)).
- **Junction ambiguity in line drawings.** Noris et al. classify skeleton-graph nodes by valence (1 = endpoint, 2 = connection, ≥3 = junction) ([Topology-driven vectorization, TOG 2013](https://dl.acm.org/doi/10.1145/2421636.2421640)); Bessmeltsev & Solomon's PolyVector fields "reliably and efficiently disambiguate T- and X-junctions" ([TOG 2019](https://dl.acm.org/doi/fullHtml/10.1145/3202661)). Classic surveys: Tombre's "to thin or not to thin" and "Analysis of engineering drawings" ([ICPR 2000](https://members.loria.fr/KTombre/tombre-icpr00.pdf), [Springer](https://link.springer.com/chapter/10.1007/3-540-64381-8_54)).

### Algorithm to implement
**Stage A — PDF path harvesting (O(P) in operators).** Use pdf.js `page.getOperatorList()`; walk `fnArray/argsArray`, maintaining a CTM stack across `save/restore/transform` and `paintFormXObjectBegin/End`, and collect `constructPath` payloads (`moveTo/lineTo/curveTo/rectangle`) together with graphics state (`setLineWidth`, `setDash`, `setStrokeRGBColor`) and the enclosing optional-content/marked-content group (`beginMarkedContentProps`) as a "layer" ([pdf.js OPS enum](https://github.com/mozilla/pdf.js/blob/master/src/shared/util.js), [issue 10593](https://github.com/mozilla/pdf.js/issues/10593)). Flatten Béziers adaptively (tolerance 0.1 pt) but keep the original curve; fit a circle to flattened points and keep an *arc primitive* (center, r, θ0, θ1) when residual < 0.1 pt — arcs are elbows/fillets. Emit `Float64Array` segments `[x1,y1,x2,y2]` + `Int32Array` style ids. Style key = (lineWidth quantised, dash pattern, stroke colour, layer).

**Stage B — Normalisation (O(n log n)).** Quantise coordinates to a grid `g` (0.05–0.1 pt; snap rounding makes results order-independent). Hash each segment by its supporting line `(angle mod π quantised to 0.25°, signed offset quantised to g)`; within a bucket sort by projection and merge overlapping/abutting collinear segments of the same style (CAD exports overdraw lines heavily). Drop zero-length segments.

**Stage C — Intersection finding (O((n+k) log n)).** For CAD sheets a uniform grid (cell ≈ 2× median segment length) with per-cell pair tests is usually faster than Bentley–Ottmann; a sweep-line library exists in JS ([sweepline-intersections](https://github.com/rowanwins/sweepline-intersections), MIT; 17k vertices ≈ 28 ms in its benchmark). Use `orient2d` from [robust-predicates](https://github.com/mourner/robust-predicates) (Unlicense) for all side tests. Record three event types with tolerance ε (default 0.5 pt, ≥ half the stroke width): **EE** endpoint–endpoint (|p−q|<ε), **ET** endpoint on interior of another segment (T-touch), **II** proper interior crossing (X).

**Stage D — Graph build.** Union-find EE clusters into nodes; split segments at ET/II events; edges keep style ids and a `virtual` flag. Store per-node an *incident edge list sorted by angle* and a **continuation map**: for each incident edge, its straight-through partner (angle difference < θ_col = 3°) if any. This lets an X node carry two independent through-paths without deleting the node.

**Stage E — Node classification.**
```
deg1 → DANGLE (candidate: cap, gap, dashed-segment end, text gap, arrow)
deg2, turn<θ_col → COLLINEAR (merge into chain)          # LineMerger semantics
deg2, turn≥θ_col → CORNER (elbow candidate; arc edge → radius elbow)
deg3, two collinear + one other → TEE (through pair + branch)
deg3, none collinear → WYE / 45° tee
deg4, two collinear pairs → CROSS (no connection unless marker)   # PID2Graph "crossing"
deg≥3 with a filled circle/dot symbol at node → JUNCTION (P&ID convention)
```
**Stage F — Gap bridging (dangle repair).** For each DANGLE, query the index for other dangles within `r_gap` (default 6 pt; 12 pt if a text bbox lies in the gap) that are collinear (angle < 3°, lateral offset < ε) and style-equal; add a `virtual` edge. Dashed strokes come either as a `setDash` pattern (keep as one segment) or as many short collinear segments (group with Dori-style dashed-line grouping: regular length/gap periodicity) ([Dori et al., "How to win a dashed line detection contest"](https://link.springer.com/chapter/10.1007/3-540-61226-2_23)). Arcs: an arc whose endpoints are tangent-continuous with two straight edges is a fillet → keep as one CORNER edge with radius.

### Failure modes and mitigations
- *Every crossing becomes a junction* if `unary_union`/`polygonize` is used naively → keep the continuation map; treat CROSS as pass-through by default (PID2Graph "crossings"; 2/3-vs-4 rule).
- *Text gaps and dashed lines* fragment runs → Stage F with text-aware gap radius.
- *Overdrawn/duplicate lines* create degree-4 pseudo-nodes → Stage B dissolve.
- *Hatching, leaders, dimension lines, grid bubbles* pollute the graph → filter by style/layer; leaders are thin, short, often with arrowheads (Section 3).
- *Precision*: snap rounding drift with iterated SR; keep a single-pass SR with a fine grid and robust predicates.
- *Form XObjects/patterns* with nested CTMs → transform at harvest time, never later.

### Browser libraries
[flatbush](https://github.com/mourner/flatbush) (ISC), [robust-predicates](https://github.com/mourner/robust-predicates) (Unlicense), [sweepline-intersections](https://github.com/rowanwins/sweepline-intersections) (MIT), [JSTS](https://github.com/bjornharrtell/jsts) (EPL-1.0/EDL-1.0; full noding/linemerge/polygonize) or [geos-wasm](https://github.com/chrispahm/geos-wasm) (LGPL-2.1 — weigh licence). Recommendation: write Stages B–F in-house (they are small) and use JSTS only for polygonize/buffer.

---

## 2. Double-line duct: centreline extraction

### State of the art
- **GIS "collapse dual lines".** ArcGIS's *Collapse Dual Lines To Centerline* "derives centerlines from dual-line features, such as road casings, based on specified width tolerances", is "intended for regular, near parallel pairs of lines", outputs `LeftLn_FID/RightLn_FID`, and warns it "would not be able to recognize the intended casing pairs where a number of lines run parallel with widths narrower than the specified Maximum Width" ([ArcMap doc](https://desktop.arcgis.com/en/arcmap/latest/tools/coverage-toolbox/how-collapse-dual-lines-to-centerline-works.htm), [ArcGIS Pro](https://pro.arcgis.com/en/pro-app/3.4/tool-reference/cartography/collapse-dual-lines-to-centerline.htm)) **[excerpt-only]**.
- **Skeletons.** Haunert & Sester derive road centrelines from area features via the straight skeleton, with skeleton-edge classification and pruning ([GeoInformatica 2008](https://link.springer.com/article/10.1007/s10707-007-0028-x)). CGAL notes the straight skeleton bisects "two parallel lines by another parallel line placed halfway in between" and coincides with the medial axis for convex polygons but not in general ([CGAL Straight_skeleton_2](https://doc.cgal.org/latest/Straight_skeleton_2/index.html)). Medial axis/Voronoi background: [Eppstein](https://ics.uci.edu/~eppstein/gina/medial.html); raster medial axis returns the distance transform, "enabling computation of local object width" ([scikit-image example](https://github.com/scikit-image/scikit-image/blob/main/doc/examples/edges/plot_skeleton.py)).

### Algorithm to implement (parallel-pair matching first, skeleton as fallback)
**P1 — Candidate pairs (O(n log n)).** For each segment `s` (style = duct-outline style), query the flatbush index with `s`'s bbox expanded by `w_max`; keep segments `t` with: same style; |Δangle| < θ_par (2°); lateral distance `d ∈ [w_min, w_max]` (from sheet scale: 4″…120″ duct → e.g. 0.03–1.0 in at 1/8″=1′-0″); longitudinal overlap ≥ 50% of min(len). Score = overlap_len / (1 + |d − d_text|/d_text) where `d_text` is a nearby "W×H" label's W (Section 3) if present.
**P2 — Matching.** Greedy by score with the constraint that a side segment can belong to at most one duct on each of its sides (a segment can be shared by two adjacent ducts). Output centreline = midline over the overlap interval; `width = d`; keep left/right ids (as ArcGIS does).
**P3 — Fittings from geometry.**
- *Radius elbow*: two arc primitives with common centre (< ε) and radii `r`, `r + w` → centreline arc radius `r + w/2`, angle = arc sweep.
- *Mitred elbow*: two pairs meeting at a CORNER with a diagonal segment between outer corners.
- *Transition*: a pair whose sides are non-parallel (2° < |Δangle| < 30°) joining widths `w1→w2`; centreline = bisector.
- *Tee/branch*: a pair's side segment has an ET node where another pair's sides terminate; branch width = spacing of the terminating pair.
- *End cap / neck*: short perpendicular segment closing the pair (length ≈ w) → END; a diffuser symbol bbox at the end → END(DIFFUSER).
**P4 — Fallback skeleton.** If pairing fails (curved offsets, odd shapes): polygonize the outline (JSTS `Polygonizer`), densify the boundary (step ≈ w/4), build a Voronoi diagram with [d3-delaunay](https://github.com/d3/d3-delaunay) (ISC; Voronoi from Delaunay circumcentres), keep Voronoi edges strictly inside the polygon, prune branches shorter than `w/2`, then simplify. O(m log m) in boundary samples. Width along the centreline = 2 × distance to boundary (medial-axis property).
**Cross-check.** Compare measured `w` to the label's first dimension: on plan the "first number is always the duct dimension you see on the drawing and the second number is the duct dimension into the paper" ([Eng-Tips](https://www.eng-tips.com/threads/duct-dimensions-on-the-drawings-w-x-h-or-h-x-w.362813/), [Helonic](https://helonic.com/knowledge-base/hvac-duct-sizing-basics)) **[excerpt-only]**. Flag |w − W·scale| > 15% for review.

### Failure modes
Adjacent parallel ducts at spacing ≈ width; insulation/liner lines drawn parallel inside the duct (nested pairs → pick the *outer* pair by style or the pair matching the label); walls mistaken for duct sides (require duct style/layer or a size label on the run); mixed single-/double-line on one sheet (run both engines; prefer whichever has a label match); very short pair fragments at fittings (min overlap threshold too high → lower to 30% near CORNER nodes).

---

## 3. Text-to-geometry association and size grammar

### State of the art
Rahul et al. associate pipeline codes "to the nearest pipeline based on the minimum euclidean distance from any vertex of the bounding box to the nearest point on the line" and use inlet/outlet "line emerging direction" ([arXiv 1901.11383](https://arxiv.org/abs/1901.11383)) **[excerpt-only]**. Microsoft's P&ID pipeline "shoots a ray from a detected text label to the nearest symbol" ([ISE blog](https://devblogs.microsoft.com/ise/engineering-document-pid-digitization/)) **[excerpt-only]**. Bentley's patent trains a gradient-boosted model on "features describing the geometric relationship between text labels and link pairs" ([US 12,406,519](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12406519)). Digitize-PID stresses that "significant domain knowledge [is] involved in determining line changes and associating text with lines" ([arXiv 2109.03794](https://arxiv.org/abs/2109.03794)). Learned association (attention/GNN) for engineering drawings: [Automation in Construction 2025](https://www.sciencedirect.com/science/article/abs/pii/S0926580524006782); classic dimension-frame recognition: [Dimension recognition in vectorization of engineering drawings](https://www.academia.edu/27123238/Dimension_recognition_and_geometry_reconstruction_in_vectorization_of_engineering_drawings); text/graphics separation: [Tombre, DAS 2002](https://members.loria.fr/KTombre/tombre-das02.pdf).

### Algorithm to implement
**T1 — Text runs.** pdf.js `getTextContent()` items carry `str`, `dir`, a 6-element `transform` (font size and rotation), `width`, `height`, `fontName` ([pdf.js api.js TextItem](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js)). Merge items on the same baseline (same rotation, gap < 0.5 em) into tokens/lines; compute rotated bbox and baseline angle φ. Normalise glyphs: `×→x`, `Ø/⌀/ø→ø`, `″/”→"`, AutoCAD `%%c`→ø, and map private-use codepoints by font name **[heuristic]**.
**T2 — Classification grammar** (anchor everything; run in this order, first match wins):
```
ELEV   \b(BOD|BOP|TOP|TOD|COD|COP|CL|IE|INV|FFL|AFF|EL|ELEV)\b|\d+'-\d+(\s?\d/\d)?"   → exclude
INSUL  \b(INSUL\w*|LINED|LINER|WRAP|ACOUSTIC\w*)\b                                   → attach as attribute
RECT   ^(\d{1,3}(?:\.\d+)?)\s*"?\s*[xX×]\s*(\d{1,3}(?:\.\d+)?)\s*"?(?:\s*(FO|F\.O\.|FLAT\s*OVAL))?(?:\s+[A-Z]{2,5})?$
ROUND  ^(?:ø|DIA\.?|D)?\s*(\d{1,3}(?:\.\d+)?)\s*"?\s*(?:ø|DIA\.?|DIAM|RD|ROUND)(?:\s+[A-Z]{2,5})?$   (a round marker is mandatory)
PIPE   ^(?:([A-Z]{2,5})\s+)?(\d{1,2})?(?:[\s-](\d)/(\d{1,2}))?\s*"(?:\s+([A-Z]{2,5}(?:[-/][A-Z0-9]+)?))?$
       | ^(DN|NPS)\s*(\d{2,4})$ | ^(\d{2,4})\s*mm$
SYSTEM {CHWS,CHWR,HWS,HWR,CWS,CWR,CD,SA,RA,EA,OA,MA,TA,GEX,...} (project legend overrides)
```
BOD/BOP/COD are standard elevation callouts ([Engineering Toolbox abbreviations](https://www.engineeringtoolbox.com/piping-hvac-abbreviations-d_1694.html), [Autodesk forum on TOP/BOP tags](https://forums.autodesk.com/t5/autocad-mep-forum/top-and-bop-tags-don-t-match-with-pipe-elevations/td-p/6377822)) **[excerpt-only]**. Units: treat a bare `12x8` as inches in imperial sheets, mm if the sheet's scale block says metric.
**T3 — Scoring (O(L·k) with index queries).** For each size token `L` query the index for chain edges within `R = 3 × fontHeight`; score each candidate edge `e`:
`cost = d⊥/fontH + 0.5·min(1, off_along/len_e) + 2·[|φ − angle(e)| mod 180° > 12°] + 1·[style/system mismatch] − 3·[leader from L hits e]`
where `d⊥` is perpendicular distance from the bbox centre, `off_along` is how far the projection falls outside the edge, and a *leader* is a thin short segment (optionally with an arrowhead) starting within 1 fontH of the bbox and ending on `e` (follow it through one bend). Assign greedily by cost with a one-label-per-(edge, side) constraint so competing labels for parallel neighbouring runs go to distinct runs; ties broken by consistent side-of-run along the chain. Labels placed at the branch (near a TEE node) attach to the *branch* if their orientation matches the branch, else to the main.
**T4 — Size propagation.** Walk each chain; every edge inherits the last label seen; when the next label differs, place a SIZE-CHANGE at the nearest fitting/transition/TEE node between the two labels (or at the label boundary if none). Unlabelled chains inherit through collinear continuation only, never across TEE.

### Failure modes
Rotated/mirrored text; labels inside the duct outline (double-line) with inner d⊥ ≈ 0 for *both* sides (use the centreline); stacked callouts ("24x12 SA / BOD 9'-6"") — split lines; text as outlines (no `getTextContent`) → OCR fallback (Section 6); abbreviations that look like sizes ("2 TYP"); dimension strings ("12'-6"") — excluded by the feet-inches pattern.

---

## 4. Snapping/picking UX and performance

### State of the art (libraries, measured)
- [flatbush](https://github.com/mourner/flatbush) (ISC): static packed Hilbert R-tree; README benchmark on M1 Pro: index 1,000,000 rectangles 109 ms; 1,000 searches (1% area) 66 ms; 10,000 kNN queries (1 neighbour) 30 ms; `neighbors(x, y, maxResults, maxDistance, filterFn)`; index lives in a single `ArrayBuffer` "enabling thread transfer".
- [rbush](https://github.com/mourner/rbush) (MIT): dynamic; bulk-insert 1M items 1.25 s, 1,000 searches (1% area) 0.35 s; OMT bulk loading; kNN via [rbush-knn](https://github.com/mourner/rbush-knn) (priority-queue depth-first kNN).
- [kdbush](https://github.com/mourner/kdbush) (ISC): points only, `ArrayBuffer`/`SharedArrayBuffer`. [d3-quadtree](https://github.com/d3/d3-quadtree) (ISC): points only; `find(x, y, radius)`. Guidance: "If your data changes after initial load, use rbush. For indexing areas, use flatbush. If you're only dealing with points, use kdbush" ([npm-compare](https://npm-compare.com/flatbush,geokdbush,kdbush,rbush)). Point-to-segment projection semantics: [turf nearestPointOnLine](https://github.com/Turfjs/turf/tree/master/packages/turf-nearest-point-on-line).
- Hit tolerance conventions: AutoCAD's object-snap `APERTURE` defaults to 10 px ([Autodesk](https://help.autodesk.com/view/ACDLT/2023/ENU/?guid=GUID-C8603032-7E55-4EEF-B2DF-CD2FD9EDEF91)) **[excerpt-only]**; Bluebeam "Snap to Content" snaps measurement endpoints to embedded vector geometry with adjustable sensitivity ([Bluebeam support](https://support.bluebeam.com/revu/how-to/disable-snap-to-content-in-measurements-panel.html)).

### Algorithm to implement
- **Index**: one flatbush over *segment bboxes* (100k segments ≈ 10–15 ms to build, extrapolating the README's 1M-rects figure). Exact nearest segment: pull `neighbors()` incrementally (they are ordered by box distance, a lower bound) and compute true point–segment distance until the next box distance exceeds the best true distance — O(log n + k). Return the projection point and parameter `t`.
- **Tolerance**: `tol_pt = max(10 px / zoom, 0.5·strokeWidth + 0.5 pt)`; prefer endpoints/nodes over interiors when both are within tolerance (AutoCAD-style priority). Show a hover highlight of the whole candidate run before the click commits.
- **Threading**: harvest paths and build the index in a Web Worker; transfer the `ArrayBuffer` index to the UI thread (zero-copy). Full-sheet noding (Section 1 C–F) runs in the Worker *after* the index is ready; until it completes, the click handler runs a **lazy** trace: BFS from the hit segment, computing neighbours on demand via index queries within ε at each endpoint (visited-set memo). 100k segments full noding is O((n+k) log n): expected sub-second in WASM/JS **[estimate; no published benchmark]**. Cache the graph per page; invalidate on layer toggles only.
- **Determinism**: snap coordinates to the grid before indexing; sort candidate lists by `(x, y, id)`; use robust predicates — identical output regardless of operator order or worker timing.

---

## 5. Path-following rules

### State of the art
Rules mined from P&ID work: 2/3 lines leaving a crossing = connection, 4 = pass-through ([arXiv 2108.13912](https://arxiv.org/pdf/2108.13912)) **[excerpt-only]**; PID2Graph's explicit "line ankle" and "crossing" nodes ([arXiv 2411.13929](https://arxiv.org/abs/2411.13929)); Prusty et al.'s four merge rules including "crossing non-splitting" ([arXiv 2505.11976](https://arxiv.org/abs/2505.11976)); flow arrows found by "heuristics of the intersection points of lines and arrow symbol" or a DNN, treating the arrow as part of the line object ([Applied Sciences 2021](https://www.mdpi.com/2076-3417/11/21/10054); hybrid DL+rules for high-density P&IDs, [Comput. Chem. Eng. 2026](https://www.sciencedirect.com/science/article/abs/pii/S0098135426000244)) **[excerpt-only]**. HVAC plan conventions: rises/drops are shown "with an arrow and with a letter; R (Rise), D (Drop)"; solid vs dashed riser lines indicate up vs down; estimators "add a couple of angles (45-degree elbows) or an offset fitting" where a duct rises or drops ([MEP Academy](https://mepacademy.com/understanding-hvac-symbols/)) **[excerpt-only]**; Revit/AutoCAD MEP expose rise/drop symbol styles per system ([Revit help](https://help.autodesk.com/view/RVT/2025/ENU/?guid=GUID-07845892-5B60-4F66-8E44-9E6D713FCB3A)). **No literature was found on inferring hidden vertical fittings from plan geometry** — treat as a heuristic layer with user confirmation.

### Algorithm to implement
```
trace(seedEdge, options):
  for dir in (forward, backward):
     e = seedEdge; run.push(e)
     loop:
       v = farNode(e); inc = incident(v) \ {e}
       if inside(equipmentBBox(v)) or diffuserSymbol(v) → stop(EQUIPMENT)
       if v.deg == 1: if capSymbol(v)→stop(CAP); if riserSymbol(v)→stop(RISER); else stop(OPEN_END)
       if riserSymbol(v) → stop(RISER)          # circle/ellipse ≈ w with stub, or "UP"/"DN" text
       if sizeLabel(next) != sizeLabel(e) and options.stopAtSizeChange → stop(SIZE_CHANGE; fitting=REDUCER/TRANSITION)
       n = continuation(v, e)                    # straight-through partner, or arc-tangent partner
       case v.type:
         COLLINEAR: e = n
         CORNER:    θ = turn(e, n); record ELBOW(θ ≈ 90 | 45 | other, radius if arc); e = n
         TEE:       if e is through-line: record TEE(branch=w_branch); e = n (or stop if options.stopAtBranch)
                    else (e is the branch): record TEE; stop(BRANCH_END) unless options.continueIntoMain
         CROSS:     if junctionMarker(v) → treat as TEE/CROSS-connection else e = n   # pass through
         WYE:       record WYE; choose partner with smallest turn; stop if ambiguous (> 1 partner within 20°)
       if styleMismatch(e, n) (width/dash/colour/layer) → stop(STYLE)   # e.g. SA vs RA, pipe vs leader
       if e.virtual and gapLength(e) > r_gap → stop(GAP)
       if crosses(sheetBorder | viewport | matchline) → stop(SHEET_EDGE)
       if visited(e) → stop(LOOP)
```
Fitting inference: elbows = CORNER nodes (angle class ±7°; arcs give radius); tees = TEE nodes on the run; reducers/transitions = SIZE_CHANGE positions; caps/ends from symbols. Flow direction: filled 3-vertex paths (triangles) whose centroid lies on the run and whose axis is parallel → orientation; else from the SA/RA system tag or the equipment end. Hidden fittings: at a RISER stop add 1 elbow (plan-view drop) and, if an elevation callout changes along one run (e.g. BOD 9'-6" → BOD 8'-0"), infer an *offset* = 2 elbows (45° or 90° per project rule) plus vertical length |ΔBOD| — surface as "inferred" items the user can accept.

### Failure modes
Two runs touching end-to-end with the same style (SA main → branch drawn collinear) → rely on SIZE_CHANGE and TEE; short-stub crossings that look like tees; dashed "existing" work vs solid "new" (style rule handles); arcs exported as many tiny segments (Stage A arc fitting); crossings drawn *with* gaps ("jumper") — the broken line yields two DANGLEs collinear across the crossing → Stage F bridges them and the node stays CROSS.

---

## 6. Raster fallback

### State of the art
- Classical detectors: LSD is linear-time, sub-pixel, with a-contrario false-alarm control ([LSD](https://www.researchgate.net/publication/41910459_LSD_A_Fast_Line_Segment_Detector_with_a_False_Detection_Control)); EDLines/EDPF are "parameter-free" real-time detectors validated by the Helmholtz principle ([ED_Lib, MIT](https://github.com/CihanTopal/ED_Lib)). The IPOL 2024 review of nine detectors concludes LSD/EDLines "are parameter-free, fixed to allow for one false alarm on average", while "the six purely ML based line segment detectors show a significant variability to their end-parameters", and that the learned detectors were trained "at reconstructing architectures as wireframes" — a different goal ([IPOL 2024](http://www.ipol.im/pub/art/2024/481/)) **[excerpt-only]**. Deep detectors: M-LSD-tiny has 0.6 M parameters, 56.8 FPS on Android, ships as TFLite, Apache-2.0 ([M-LSD](https://github.com/navervision/mlsd), [abstract](https://huggingface.co/papers/2106.00186)); HAWP (MIT) ([hawp](https://github.com/cherubicXN/hawp)); LETR sAP10 65.6 on Wireframe ([LETR](https://github.com/mlpc-ucsd/LETR)); DeepLSD predicts distance/angle fields and refines with Ceres (MIT, native deps) ([DeepLSD](https://github.com/cvg/DeepLSD)); catalogue of 16 detectors at [LineSegmentsDetection](https://github.com/Vincentqyw/LineSegmentsDetection).
- Vectorization of technical drawings: Egiazarian et al. (ECCV 2020) use a cleaning net, a transformer that estimates line/quadratic-Bézier primitives per patch, and an optimisation/merging stage; code MPL-2.0 ([paper](https://arxiv.org/abs/2003.05471), [repo](https://github.com/Vahe1994/Deep-Vectorization-of-Technical-Drawings)). Topology-aware vectorizers: Noris et al., PolyVector fields, end-to-end AAAI 2022 ([pdf](https://cdn.aaai.org/ojs/20379/20379-13-24392-1-2-20220628.pdf)). Floor-plan raster→vector: R2V (junction heatmaps + integer programming, ~90% P/R) ([R2V](https://github.com/art-programmer/FloorplanTransformation)), GNN line parsing ([arXiv 2303.03851](https://arxiv.org/pdf/2303.03851)). Potrace traces *region outlines*, not centrelines, so thin strokes become two-sided polygons; it is GPL (JS port too) ([potrace paper](https://potrace.sourceforge.net/potrace.pdf), [JS port, GPL-2.0](https://github.com/kilobtye/potrace)). Thinning: Zhang–Suen / Guo–Hall in OpenCV `ximgproc.thinning` ([header](https://github.com/opencv/opencv_contrib/blob/4.x/modules/ximgproc/include/opencv2/ximgproc.hpp)); Tombre warns skeletons distort junctions ([ICPR 2000](https://members.loria.fr/KTombre/tombre-icpr00.pdf)). Hough: `HoughLinesP(rho, theta, threshold, minLineLength, maxLineGap)` — `maxLineGap` bridges dashes but also merges neighbours ([OpenCV tutorial](https://github.com/opencv/opencv/blob/4.x/doc/py_tutorials/py_imgproc/py_houghlines/py_houghlines.markdown)).
- In-browser: the default opencv.js build includes imgproc/features2d/dnn etc. but **not contrib modules (ximgproc)** unless built with `--extra_modules`; `--simd` and `--threads` flags exist ([build_js.py](https://github.com/opencv/opencv/blob/4.x/platforms/js/build_js.py)); WASM OpenCV.js ran ~2× asm.js and ~20× pure JS in the Mozilla study ([Mozilla Hacks](https://hacks.mozilla.org/2017/09/bootcamps-webassembly-and-computer-vision/), [SEDICI paper](http://sedici.unlp.edu.ar/handle/10915/89186)) **[excerpt-only]**; onnxruntime-web offers wasm (multithreaded), WebGL (maintenance), WebGPU and WebNN EPs ([ORT Web README](https://github.com/microsoft/onnxruntime/blob/main/js/web/README.md)).

### Recommended raster pipeline (all O(pixels) except detection)
1. Deskew (Hough on long edges) → adaptive binarisation (Sauvola) → connected components; remove text-like CCs (Fletcher–Kasturi size/aspect rules, [Tombre DAS 2002](https://members.loria.fr/KTombre/tombre-das02.pdf)) and keep them for OCR (Tesseract.js).
2. Line primitives: run **EDLines or LSD** (compile ED_Lib to WASM; or M-LSD-tiny through onnxruntime-web WebGPU if fine-tuned on drawings). For double-line ducts both sides come out as separate segments — which feeds Section 2 unchanged. Avoid Hough for the primary pass (endpoint inaccuracy; `maxLineGap` breaks dashes or merges neighbours).
3. Dashed lines: group collinear short segments with periodic gaps (Dori et al.).
4. Optional Zhang–Suen thinning + tracking for curved elbows (arcs) where LSD fragments; fit circles.
5. Snap all segments to the grid and enter the vector pipeline (Sections 1–5) with ε ≈ 1.5 px and `r_gap` ≈ 8 px.
Accuracy on thin dashed lines: classical detectors are strongest at ≥2 px stroke; below that expect fragmentation (mitigated by step 3) **[judgement]**.

---

## 7. Prior art in takeoff products and patents

- **Bluebeam Dynamic Fill** "automatically creates Spaces and measurement markups using shapes found on the content layer", "uses the line weights defined by the PDF to determine its boundaries", offers Edge Sensitivity and Boundary Size to "bridge small gaps", "Add Boundary" for temporary walls, and works "with Raster and Vector quality documents" ([support](https://support.bluebeam.com/user-manual/menus/tools/dynamic-fill.html), [overview](https://support.bluebeam.com/revu/features/dynamic-fill-overview.html)) **[excerpt-only]**; users request "razor sharp" vector boundaries, implying a raster flood-fill core ([community](https://community.bluebeam.com/discussion/6305/provide-razor-sharp-boundary-option-for-dynamic-fill)). It is an *area* tool; no public description of a linear line-follower.
- **Togal.AI**: claims 5 granted / 6 pending patents on AI takeoff (floor-plan interpretation, change-order conversion, code-compliance metrics) ([Legal Reader](https://www.legalreader.com/race-to-patent-ai-miami-based-togal-ai-announces-five-ai-patents-won/)); marketed "up to 98% accuracy" on walls/floors/objects ([togal.ai](https://www.togal.ai/)); embedded in eTakeoff as SnapAI ([eTakeoff](https://etakeoff.com/etakeoff-dimension/ai/)). Related USPTO grants titled "Automatic area detection" (US 11,410,362; 11,900,515; 12,223,574) frame the QTO problem ([11410362](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11410362)) — assignee **[unverified]**.
- **Kreo Auto Measure 3.0**: "reads native PDF and CAD vector data (not rasterized images)"; second pass "re-fits every outline to the lines of the drawing"; returns "length and thickness for linear elements like walls" ([Kreo](https://www.kreo.net/news-2d-takeoff/auto-measure-3-0-best-ai-model-quantity-takeoff)) **[excerpt-only]**.
- **STACK Floor Plan AI / Autocount**: detects doors, windows, rooms, walls; Autocount "works best with graphical symbols" ([STACK](https://www.stackct.com/floor-plan-ai/), [support](https://support.stackct.com/hc/en-us/articles/47342466736787-Create-Takeoffs-TE)). **PlanSwift/ConstructConnect Takeoff Boost**: full-page auto takeoff "in about 30 seconds" ([PlanSwift](https://hub.planswift.com/construction-takeoff-software-b)). None publish MEP line-following methods.
- **Patents**: US 6,324,508 (1999-era digitizer tracing to polygons/lengths) ([Google Patents](https://patents.google.com/patent/US6324508B1/en)); US 2009/0070071 "semi-automatic quantity takeoff from CAD drawings" — takeoff objects with mapping methods and quantify type "count, linear, or area" ([Google Patents](https://patents.google.com/patent/US20090070071A1/en)); US 11,790,122 "Predictive vector guide" — matching "non-object-based vectors as objects" for counting ([USPTO](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11790122)) assignee **[unverified]**; US 10,997,325 automatic extraction from 2D floor plans into BIM ([USPTO](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10997325)); US 8,766,982 "Vectorization of line drawings using global topology" (T-junction = one segment extends past; X = both extend) ([USPTO](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8766982)); Bentley US 12,406,519 (Section 1). **Freedom-to-operate note:** the Bentley claims cover ML link-segmentation + keypoints + learned label association on *image-only* schematics; a geometric vector-path follower is materially different, but have counsel review the "Automatic area detection" family.

---

## 8. Evaluation

**Ground truth.** Annotate runs as polylines with ordered vertices, per-vertex fitting class, size string per sub-run, system tag, and stop reason; annotate in the *page coordinate system* (pt). Build ground truth two ways: (a) synthetic sheets generated from a random duct/pipe network rendered to PDF via a CAD-like exporter (varying styles, text gaps, crossings, dashes, arcs-as-polylines), following the topology-preserving synthetic-data idea of SynthPID ([CVPRW 2026](https://openaccess.thecvf.com/content/CVPR2026W/AI4RWC/papers/Prasad_SynthPID_PID_digitization_from_Topology-Preserving_Synthetic_Data_CVPRW_2026_paper.pdf)) and Dataset-P&ID (500 synthetic, noise/complex symbols) ([HF mirror](https://huggingface.co/datasets/hamzas/digitize-pid-yolo)); (b) 50–100 real sheets hand-traced by estimators (double-blind on 20% to measure annotator agreement).

**Metrics (per sheet, then macro-averaged).**
- *Run matching*: predicted run ↔ GT run if discrete Fréchet distance < τ (τ = 2 pt vector / 4 px raster) and length overlap ≥ 80%; report per-run precision/recall/F1 and **length error %** = |L_pred − L_gt| / L_gt on matched runs (plus total length error per sheet, the estimator's KPI).
- *Vertices/fittings*: match within radius r (5 pt) with class agreement (elbow-90/45, tee, reducer, cap, riser) → F1, in the spirit of sAP's endpoint-error thresholds for lines ([HAWP](https://arxiv.org/pdf/2003.01663), [TP-LSD](https://arxiv.org/pdf/2009.05505)) and R2V's junction precision/recall ([R2V](https://github.com/art-programmer/FloorplanTransformation)).
- *Topology*: node AP / edge mAP as in PID2Graph ([arXiv 2411.13929](https://arxiv.org/abs/2411.13929)).
- *Size assignment*: exact-string accuracy and length-weighted accuracy; separate confusion for "no label" vs "wrong label".
- *Stop-reason accuracy* (branch/size-change/equipment/edge), since over-tracing is the costliest UX failure.
- Classic raster→vector protocols: Wenyin & Dori 1997 (Machine Vision and Applications 9:240–250) and polygon-assignment evaluation ([IJDAR 2010](https://link.springer.com/article/10.1007/s10032-010-0143-3)); MCMLSD's evaluation framework ([arXiv 2001.01788](https://arxiv.org/pdf/2001.01788)).

**Datasets.** P&ID: PID2Graph ([Zenodo](https://zenodo.org/records/14803338); graphml with crossings/ankles), Dataset-P&ID, SynthPID. Floor plans (wall-tracing analogue): CubiCasa5K (5,000 plans, 80+ categories, polygon annotations) ([repo](https://github.com/CubiCasa/CubiCasa5k), [abstract](https://huggingface.co/papers/1904.01920)); R2V (815 images; vector annotations released, raster not) ([repo](https://github.com/art-programmer/FloorplanTransformation)). **No public HVAC duct or piping *plan* takeoff dataset was found** — expect to build one.

**Determinism/regression.** Golden-file suites like JTS's XML test corpus (`general/robust/validate/misc/failure`) ([JTS testxml](https://github.com/locationtech/jts/tree/master/modules/tests/src/test/resources/testxml)); robust predicates ([robust-predicates](https://github.com/mourner/robust-predicates)); snap-rounded integer grid and sorted iteration so output is order-independent; property tests: invariance of run lengths under translation, 90° rotation, uniform scale, segment shuffling and segment splitting; fuzzing of ε/r_gap sensitivity with a "stability" score.

---

## Recommended pipeline (PDF → graph → click → run → sizes → fittings)

1. **Load** page in a Worker; `getOperatorList` + `getTextContent`; walk CTM stack; emit segments/arcs with style ids, text tokens with rotation; build optional-content "layers".
2. **Normalise**: snap-round to 0.05 pt grid; dissolve duplicate/overlapping collinear strokes; arc fitting.
3. **Index**: flatbush over segment bboxes (transfer buffer to UI thread); second flatbush over text bboxes; third over closed small paths (symbol candidates: circles, triangles, rectangles) and equipment bboxes.
4. **Node** (background): grid/sweep intersection events EE/ET/II with ε = 0.5 pt; union-find nodes; continuation map; node classes (COLLINEAR/CORNER/TEE/CROSS/WYE/DANGLE); gap bridging r_gap = 6 pt (12 pt through text); dashed grouping.
5. **Double-line pass**: pair parallel strokes → centrelines with width; fitting geometry (arcs, transitions, tees, caps); fallback Voronoi skeleton.
6. **Labels**: tokenise, grammar-classify, score against chain edges (d⊥, orientation, leader, side consistency), assign, propagate sizes and mark SIZE_CHANGE nodes.
7. **Click**: nearest segment/centreline within `max(10 px/zoom, ½ stroke)`; hover preview; if noding not finished, lazy BFS.
8. **Trace** both directions with the rule engine (Section 5) and user options (stop at tee / size change / continue into main).
9. **Fittings & attributes**: elbows (angle/radius), tees, reducers, caps, risers, inferred offsets (flagged), flow direction from arrows/system tag, insulation from notes.
10. **Emit** a takeoff item: polyline (page pt → scaled length), size, system, fittings list with confidence, stop reasons; persist for regression replay; log ε/r_gap used.

## The 10 hardest cases for the test corpus
1. Two pipes crossing without a junction, one drawn with a break ("jumper") and the other continuous — must stay two runs.
2. Size label sitting *inline* in a gap of the line ("—— 12x8 ——"), plus a second label in the same gap for an adjacent parallel run.
3. Dashed return-air duct exported as hundreds of 2-pt segments, crossing a solid supply duct at 45°.
4. Double-line duct with internal liner lines (three or four parallel strokes) next to a wall drawn in the same line weight at spacing equal to the duct width.
5. Radius elbow exported as a 40-segment polyline on the outer side and a 25-segment polyline on the inner side; centreline radius must be recovered.
6. Tee where the branch is collinear with the main's far end (main terminates into a cap just past the tee) — stop reason and fitting classification.
7. Run that leaves the sheet at a matchline and continues on another sheet; run ending at an AHU bbox whose outline is the same style as the duct.
8. Rotated (vertical) text with `%%c`/private-use glyphs ("24ø", "2-1/2"" CHWS") and an elevation callout ("BOD 9'-6"") within 1 em of the run; a "2 TYP" note nearby.
9. Reducer drawn as a trapezoid between 24x12 and 18x12 on a run with a single label upstream only (size must propagate to the change, not past it).
10. Scanned sheet at 200 dpi with 1-px dashed lines, skew 1.2°, and a coffee-ring stain across a tee — raster fallback must fragment gracefully rather than hallucinate connections.
