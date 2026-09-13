#!/usr/bin/env python3
"""
PIXEL RULER — a genuinely human-blind box-tier measurement tool for the Demo
Corpus's own stricter, no-auto-accept bar (goals/VECTORGRID_TABLE_BOXES.md,
"The Demo Corpus": "Auto-accept does not apply here... boxes picked from the
page's own candidate rules").

`rulelinebox.py` (this same directory) is real, disclosed, corpus-wide-gate
evidence, but it is SEEDED by the extractor's own region to know where to
scan, which is exactly what the Demo Corpus section forbids. This tool has
no seed at all: a person (or an agent doing the grading) first reads the
FULL, unlabeled page render and decides for themselves roughly where a
table's own border sits -- the same act of looking a human grader always
does -- and only THEN asks this tool to crop that self-chosen window and
draw a fine, labeled pixel-coordinate grid over it, so the exact pixel
position of the real drawn rule line can be read off directly, the same way
a person would lay a ruler over a photograph. The tool never looks at the
extractor's own box; it only makes a rendered image's own pixels legible at
the precision a bare eyeball estimate cannot reach.

Coordinate space: whatever the source PNG's own pixel space is (typically a
render-page-hires.mjs output at some --scale). To compare a measurement
against a ScheduleTable's own `region` field (RENDER_SCALE=2 image-pixel
space, mcp/src/pdf.ts's own documented convention), convert with
    region_units = pixel_at_render_scale_S / S * 2

Usage:
    python3 pixelruler.py <page.png> <out.png> <x0> <y0> <x1> <y1> \
        [--step 20] [--zoom 1]

    x0,y0,x1,y1   the crop window IN THE SOURCE IMAGE'S OWN PIXEL SPACE,
                  chosen by looking at the full page render -- never from
                  the extractor's own output.
    --step        gridline spacing in source pixels (default 20; use a
                  small value like 5 for a final, precise reading near one
                  edge once the coarse pass has narrowed it down).
    --zoom        integer upscale factor applied (nearest-neighbor, so
                  gridlines stay crisp) before drawing the grid -- use
                  zoom=1 for a coarse first look, 6-8 for a fine reading.

Two-pass workflow (matches this file's own worked examples in
keys/DEMO_CORPUS_GRADING.md's own 045_FL entry):
  1. Coarse: step=20, zoom=1, a few-hundred-pixel window around where you
     believe a corner is, from reading the full page.
  2. Fine: step=5, zoom=8, a ~60x50px window centered on that corner, to
     read the exact line position within a pixel or two.
"""
import sys
from PIL import Image, ImageDraw


def main() -> None:
    args = sys.argv[1:]
    step, zoom = 20, 1
    pos = []
    i = 0
    while i < len(args):
        if args[i] == "--step":
            step = int(args[i + 1]); i += 2
        elif args[i] == "--zoom":
            zoom = int(args[i + 1]); i += 2
        else:
            pos.append(args[i]); i += 1
    if len(pos) != 6:
        print(__doc__)
        sys.exit(1)
    src, out, x0, y0, x1, y1 = pos[0], pos[1], *map(int, pos[2:6])

    img = Image.open(src)
    crop = img.crop((x0, y0, x1, y1)).convert("RGB")
    if zoom > 1:
        crop = crop.resize((crop.width * zoom, crop.height * zoom), Image.NEAREST)
    draw = ImageDraw.Draw(crop)
    w, h = crop.size

    first_x = (x0 // step) * step
    for gx in range(first_x, x1 + 1, step):
        lx = (gx - x0) * zoom
        if 0 <= lx <= w:
            major = gx % (step * 5) == 0
            draw.line([(lx, 0), (lx, h)], fill=(255, 0, 0) if major else (255, 180, 180), width=1)
            if major:
                draw.text((lx + 2, 2), str(gx), fill=(200, 0, 0))

    first_y = (y0 // step) * step
    for gy in range(first_y, y1 + 1, step):
        ly = (gy - y0) * zoom
        if 0 <= ly <= h:
            major = gy % (step * 5) == 0
            draw.line([(0, ly), (w, ly)], fill=(0, 100, 255) if major else (180, 210, 255), width=1)
            if major:
                draw.text((2, ly + 2), str(gy), fill=(0, 80, 200))

    crop.save(out)
    print(f"saved {out} size={crop.size} source-region=({x0},{y0})-({x1},{y1}) step={step} zoom={zoom}")


if __name__ == "__main__":
    main()
