# Probe scripts behind `plans/03-linear-takeoff-hvac-bas-plan.md` §3

Throwaway research probes, kept so the numbers in the plan can be re-run. They import the
repo's own engine modules (`extractVectorGeometry`, `textSpans`, `detectScale`,
`buildMepGraph`, `classifyMepLayerName`, `classifyLayerName`) — nothing is reimplemented.
Run them from `opentakeoff/mcp` after `npm install` there **and** in `opentakeoff/web`
(the shared libs resolve `jsts` and `pdfjs-dist` from `web/node_modules`):

```bash
cd opentakeoff/mcp
P=../../plans/03-research/probes
node --import tsx $P/probe.mts ../samples/bessemer-mechanical-bidset.pdf          # per-page segments, pens, layers, scale, label classes, MEP graph
node --import tsx $P/probe.mts ../../opentakeoff-corpus/raw/itd-d1-lab-mechanical.pdf 3,4,5
node --import tsx $P/probe-nograph.mts <pdf>                                       # same without the graph step (fast, all pages)
node --import tsx $P/spans.mts <pdf> <page> ['^\d+"?[xX]\d+"?$']                    # text spans with bbox and rotation, optional regex
node --import tsx $P/ductwidth.mts                                                  # Bessemer M101: parallel-pair spacing vs each size label
node --import tsx $P/ductwidth2.mts <pdf> <page> <px_per_ft>                        # same, any sheet (27 = 3/16" at RENDER_SCALE 2)
node --import tsx $P/trace-proto.mts <pdf> <page> <pen_nibble> <px_per_ft> '<label regex>' [tol_px]   # pen-filtered chain walk from a label
node --import tsx $P/layers.mts <pdf> <page>                                        # OCG layer names → MEP system / role classification
node --import tsx $P/render.mts <pdf> <page> out.png full 0.45                      # page PNG at a scale
node --import tsx $P/render.mts <pdf> <page> out.png region x0 y0 x1 y1 1800        # region crop (image px at RENDER_SCALE 2)
```

`ductwidth.mts` is hard-wired to the Bessemer sample at 1/4" (36 px/ft); `ductwidth2.mts`
generalises it. These are not tests and not on the shared path; the plan's Phase 8 turns
the measurements they produce into pinned fixtures.
