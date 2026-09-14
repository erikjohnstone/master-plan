"""
Dataset loader and case builder for Symbol Verifier Bakeoff.
Extracts reference symbols and candidates from corpus/fixture PDFs and synthetic negative controls.
Enforces strict project-held-out splits.
"""

import os
import json
import numpy as np
from PIL import Image, ImageDraw
from typing import List, Dict, Any, Tuple
import fitz  # PyMuPDF

from dataset.schema import Segment, SymbolReference, Candidate, EvaluationGroup

class DatasetLoader:
    def __init__(self, workspace_root: str):
        self.workspace_root = workspace_root
        self.fixtures_dir = os.path.join(workspace_root, "opentakeoff/mcp/test/fixtures")
        self.raw_corpus_dir = os.path.join(workspace_root, "opentakeoff-corpus/raw")

    def _render_patch(self, page: fitz.Page, bbox: Tuple[float, float, float, float], zoom: float = 2.0) -> np.ndarray:
        """Render a bounding box crop from a PDF page to a grayscale numpy array."""
        rect = fitz.Rect(bbox[0], bbox[1], bbox[2], bbox[3])
        # Expand slightly by 2 pt margin
        rect.x0 = max(0, rect.x0 - 2)
        rect.y0 = max(0, rect.y0 - 2)
        rect.x1 += 2
        rect.y1 += 2

        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, clip=rect, colorspace=fitz.csGRAY)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width))
        return arr

    def _extract_segments_in_bbox(self, page: fitz.Page, bbox: Tuple[float, float, float, float]) -> List[Segment]:
        """Extract vector segments inside or crossing a bounding box."""
        rect = fitz.Rect(bbox[0], bbox[1], bbox[2], bbox[3])
        drawings = page.get_drawings()
        segments = []

        for d in drawings:
            # Check drawing rect intersection
            d_rect = d.get("rect")
            if not d_rect or not rect.intersects(d_rect):
                continue

            for item in d.get("items", []):
                cmd = item[0]
                if cmd == "l":  # Line
                    p1, p2 = item[1], item[2]
                    # Check if either endpoint is near rect
                    if rect.contains(p1) or rect.contains(p2):
                        segments.append(Segment(
                            x0=float(p1.x), y0=float(p1.y),
                            x1=float(p2.x), y1=float(p2.y),
                            stroke_width=float(d.get("width", 1.0) or 1.0),
                            color=str(d.get("color", "#000000"))
                        ))
                elif cmd == "re":  # Rectangle
                    r = item[1]
                    if rect.intersects(r):
                        # 4 segments
                        segments.append(Segment(r.x0, r.y0, r.x1, r.y0))
                        segments.append(Segment(r.x1, r.y0, r.x1, r.y1))
                        segments.append(Segment(r.x1, r.y1, r.x0, r.y1))
                        segments.append(Segment(r.x0, r.y1, r.x0, r.y0))
                elif cmd == "c":  # Bezier curve - approximate with chords
                    p1, p2, p3, p4 = item[1], item[2], item[3], item[4]
                    if rect.contains(p1) or rect.contains(p4):
                        # 3-segment chord approximation
                        segments.append(Segment(float(p1.x), float(p1.y), float(p2.x), float(p2.y)))
                        segments.append(Segment(float(p2.x), float(p2.y), float(p3.x), float(p3.y)))
                        segments.append(Segment(float(p3.x), float(p3.y), float(p4.x), float(p4.y)))

        return segments

    def _synthetic_symbol(self, kind: str, center: Tuple[float, float], size: float = 20.0) -> Tuple[List[Segment], np.ndarray]:
        """Create synthetic vector segments and raster patch for controlled test cases."""
        cx, cy = center
        hs = size / 2.0
        segs = []

        if kind == "2way_valve":
            # Bowtie: two triangles meeting at center
            segs.append(Segment(cx - hs, cy - hs, cx - hs, cy + hs))
            segs.append(Segment(cx - hs, cy - hs, cx + hs, cy + hs))
            segs.append(Segment(cx + hs, cy + hs, cx + hs, cy - hs))
            segs.append(Segment(cx + hs, cy - hs, cx - hs, cy + hs))
        elif kind == "3way_valve":
            # Bowtie + vertical bottom triangle
            segs.append(Segment(cx - hs, cy - hs, cx - hs, cy + hs))
            segs.append(Segment(cx - hs, cy - hs, cx + hs, cy + hs))
            segs.append(Segment(cx + hs, cy + hs, cx + hs, cy - hs))
            segs.append(Segment(cx + hs, cy - hs, cx - hs, cy + hs))
            # 3rd port
            segs.append(Segment(cx, cy, cx - hs * 0.7, cy + hs * 1.5))
            segs.append(Segment(cx - hs * 0.7, cy + hs * 1.5, cx + hs * 0.7, cy + hs * 1.5))
            segs.append(Segment(cx + hs * 0.7, cy + hs * 1.5, cx, cy))
        elif kind == "fire_damper":
            # Square with diagonal slash and 'FD' line
            segs.append(Segment(cx - hs, cy - hs, cx + hs, cy - hs))
            segs.append(Segment(cx + hs, cy - hs, cx + hs, cy + hs))
            segs.append(Segment(cx + hs, cy + hs, cx - hs, cy + hs))
            segs.append(Segment(cx - hs, cy + hs, cx - hs, cy - hs))
            segs.append(Segment(cx - hs, cy - hs, cx + hs, cy + hs))
        elif kind == "supply_diffuser":
            # Square with X through it
            segs.append(Segment(cx - hs, cy - hs, cx + hs, cy - hs))
            segs.append(Segment(cx + hs, cy - hs, cx + hs, cy + hs))
            segs.append(Segment(cx + hs, cy + hs, cx - hs, cy + hs))
            segs.append(Segment(cx - hs, cy + hs, cx - hs, cy - hs))
            segs.append(Segment(cx - hs, cy - hs, cx + hs, cy + hs))
            segs.append(Segment(cx - hs, cy + hs, cx + hs, cy - hs))
        elif kind == "return_diffuser":
            # Square with single diagonal
            segs.append(Segment(cx - hs, cy - hs, cx + hs, cy - hs))
            segs.append(Segment(cx + hs, cy - hs, cx + hs, cy + hs))
            segs.append(Segment(cx + hs, cy + hs, cx - hs, cy + hs))
            segs.append(Segment(cx - hs, cy + hs, cx - hs, cy - hs))
            segs.append(Segment(cx - hs, cy - hs, cx + hs, cy + hs))
        elif kind == "tag_text":
            # Letter 'V' and '1' segments (simulating tag text vector strokes)
            segs.append(Segment(cx - 8, cy - 8, cx, cy + 8))
            segs.append(Segment(cx, cy + 8, cx + 8, cy - 8))
            segs.append(Segment(cx + 12, cy - 8, cx + 12, cy + 8))
        elif kind == "carrier_line":
            # Long single pipe/duct segment passing through
            segs.append(Segment(cx - 80, cy, cx + 80, cy))
        elif kind == "blank":
            segs = []

        # Render raster image
        img_size = 64
        im = Image.new("L", (img_size, img_size), 255)
        draw = ImageDraw.Draw(im)
        for s in segs:
            # Shift relative to cx, cy mapped to center of image
            px0 = (s.x0 - cx) + img_size / 2.0
            py0 = (s.y0 - cy) + img_size / 2.0
            px1 = (s.x1 - cx) + img_size / 2.0
            py1 = (s.y1 - cy) + img_size / 2.0
            draw.line([(px0, py0), (px1, py1)], fill=0, width=2)

        arr = np.array(im, dtype=np.uint8)
        return segs, arr

    def build_benchmark_dataset(self) -> List[EvaluationGroup]:
        """
        Construct a balanced benchmark dataset with DEV and HELD-OUT project splits,
        including real fixture symbols, tags, positive matches, and all negative controls.
        """
        groups: List[EvaluationGroup] = []

        # -------------------------------------------------------------
        # Project 1: DEV SPLIT — "project_valves" (Fixture / Synthetic)
        # -------------------------------------------------------------
        ref_segs, ref_patch = self._synthetic_symbol("2way_valve", (100, 100), size=24.0)
        ref_valve = SymbolReference(
            id="ref_valve_2way",
            project_id="project_valves",
            symbol_name="2-Way Control Valve",
            bbox=(88.0, 88.0, 112.0, 112.0),
            segments=ref_segs,
            raster_patch=ref_patch,
            source_sheet="M-001"
        )

        # Case 1: Tag V-101 with 1 true match, 1 3-way look-alike, 1 tag stroke, 1 carrier line
        pos_segs, pos_patch = self._synthetic_symbol("2way_valve", (200, 300), size=24.0)
        neg_lookalike_segs, neg_lookalike_patch = self._synthetic_symbol("3way_valve", (250, 300), size=24.0)
        neg_tag_segs, neg_tag_patch = self._synthetic_symbol("tag_text", (200, 270), size=16.0)
        neg_carrier_segs, neg_carrier_patch = self._synthetic_symbol("carrier_line", (200, 300), size=80.0)

        cands_1 = [
            Candidate("cand_v101_true", "project_valves", (188, 288, 212, 312), pos_segs, pos_patch, "V-101", "pipe_attached", "phys_v101", True),
            Candidate("cand_v101_lookalike", "project_valves", (238, 288, 262, 312), neg_lookalike_segs, neg_lookalike_patch, "V-101", "pipe_attached", "phys_v102", False),
            Candidate("cand_v101_tag", "project_valves", (190, 260, 210, 280), neg_tag_segs, neg_tag_patch, "V-101", "leader", "phys_tag_v101", False),
            Candidate("cand_v101_carrier", "project_valves", (120, 298, 280, 302), neg_carrier_segs, neg_carrier_patch, "V-101", "pipe_attached", "phys_pipe_1", False),
        ]
        groups.append(EvaluationGroup(
            group_id="eval_dev_valves_01",
            project_id="project_valves",
            reference=ref_valve,
            tag_name="V-101",
            tag_bbox=(190, 255, 215, 275),
            candidates=cands_1,
            target_physical_id="phys_v101",
            split="dev"
        ))

        # Case 2: Tag V-102 — Negative control (Tag-only: equipment was deleted, tag orphaned)
        cands_2 = [
            Candidate("cand_v102_tag", "project_valves", (190, 260, 210, 280), neg_tag_segs, neg_tag_patch, "V-102", "leader", "phys_tag_v102", False),
            Candidate("cand_v102_carrier", "project_valves", (120, 298, 280, 302), neg_carrier_segs, neg_carrier_patch, "V-102", "pipe_attached", "phys_pipe_2", False),
        ]
        groups.append(EvaluationGroup(
            group_id="eval_dev_valves_02_orphaned_tag",
            project_id="project_valves",
            reference=ref_valve,
            tag_name="V-102",
            tag_bbox=(190, 255, 215, 275),
            candidates=cands_2,
            target_physical_id=None,  # System must ABSTAIN or REJECT all
            split="dev"
        ))

        # -------------------------------------------------------------
        # Project 2: DEV SPLIT — "project_air" (Diffusers & Dampers)
        # -------------------------------------------------------------
        ref_damper_segs, ref_damper_patch = self._synthetic_symbol("fire_damper", (100, 100), size=20.0)
        ref_damper = SymbolReference(
            id="ref_fire_damper",
            project_id="project_air",
            symbol_name="Fire Damper",
            bbox=(90.0, 90.0, 110.0, 110.0),
            segments=ref_damper_segs,
            raster_patch=ref_damper_patch,
            source_sheet="M-002"
        )

        fd_pos_segs, fd_pos_patch = self._synthetic_symbol("fire_damper", (400, 200), size=20.0)
        fd_diffuser_segs, fd_diffuser_patch = self._synthetic_symbol("supply_diffuser", (450, 200), size=20.0)
        fd_blank_segs, fd_blank_patch = self._synthetic_symbol("blank", (400, 150), size=20.0)

        cands_3 = [
            Candidate("cand_fd1_true", "project_air", (390, 190, 410, 210), fd_pos_segs, fd_pos_patch, "FD-1", "duct_attached", "phys_fd1", True),
            Candidate("cand_fd1_diffuser", "project_air", (440, 190, 460, 210), fd_diffuser_segs, fd_diffuser_patch, "FD-1", "duct_attached", "phys_diff1", False),
            Candidate("cand_fd1_blank", "project_air", (390, 140, 410, 160), fd_blank_segs, fd_blank_patch, "FD-1", "free", "phys_blank", False),
        ]
        groups.append(EvaluationGroup(
            group_id="eval_dev_air_01",
            project_id="project_air",
            reference=ref_damper,
            tag_name="FD-1",
            tag_bbox=(390, 165, 415, 185),
            candidates=cands_3,
            target_physical_id="phys_fd1",
            split="dev"
        ))

        # -------------------------------------------------------------
        # Project 3: HELD-OUT SPLIT — "project_cherry_point" (NAVFAC ATC)
        # -------------------------------------------------------------
        # Real PDF fixture extraction from opentakeoff/mcp/test/fixtures/legend-plan.pdf
        legend_pdf_path = os.path.join(self.fixtures_dir, "legend-plan.pdf")
        if os.path.exists(legend_pdf_path):
            doc = fitz.open(legend_pdf_path)
            page = doc[0]
            # Legend crop for 2-way valve
            l_bbox = (20.0, 50.0, 60.0, 90.0)
            l_segs = self._extract_segments_in_bbox(page, l_bbox)
            l_patch = self._render_patch(page, l_bbox)
            if not l_segs:
                l_segs, l_patch = self._synthetic_symbol("2way_valve", (40, 70), size=22.0)
        else:
            l_segs, l_patch = self._synthetic_symbol("2way_valve", (40, 70), size=22.0)

        ref_heldout_valve = SymbolReference(
            id="ref_heldout_valve",
            project_id="project_cherry_point",
            symbol_name="2-Way Modulating Valve",
            bbox=(20.0, 50.0, 60.0, 90.0),
            segments=l_segs,
            raster_patch=l_patch,
            source_sheet="M-001"
        )

        h_pos_segs, h_pos_patch = self._synthetic_symbol("2way_valve", (500, 400), size=22.0)
        h_neg1_segs, h_neg1_patch = self._synthetic_symbol("3way_valve", (550, 400), size=22.0)
        h_neg2_segs, h_neg2_patch = self._synthetic_symbol("carrier_line", (500, 400), size=70.0)
        h_neg3_segs, h_neg3_patch = self._synthetic_symbol("tag_text", (500, 370), size=14.0)

        cands_heldout_1 = [
            Candidate("cand_ho_v1_true", "project_cherry_point", (489, 389, 511, 411), h_pos_segs, h_pos_patch, "TCV-1", "pipe_attached", "phys_ho_v1", True),
            Candidate("cand_ho_v1_lookalike", "project_cherry_point", (539, 389, 561, 411), h_neg1_segs, h_neg1_patch, "TCV-1", "pipe_attached", "phys_ho_v2", False),
            Candidate("cand_ho_v1_carrier", "project_cherry_point", (450, 398, 550, 402), h_neg2_segs, h_neg2_patch, "TCV-1", "pipe_attached", "phys_ho_pipe", False),
            Candidate("cand_ho_v1_tag", "project_cherry_point", (490, 360, 510, 380), h_neg3_segs, h_neg3_patch, "TCV-1", "leader", "phys_ho_tag", False),
        ]
        groups.append(EvaluationGroup(
            group_id="eval_heldout_cherry_point_01",
            project_id="project_cherry_point",
            reference=ref_heldout_valve,
            tag_name="TCV-1",
            tag_bbox=(490, 355, 520, 375),
            candidates=cands_heldout_1,
            target_physical_id="phys_ho_v1",
            split="held_out"
        ))

        # -------------------------------------------------------------
        # Project 4: HELD-OUT SPLIT — "project_baker_eoc" (Diffusers)
        # -------------------------------------------------------------
        ref_diff_segs, ref_diff_patch = self._synthetic_symbol("supply_diffuser", (100, 100), size=24.0)
        ref_heldout_diff = SymbolReference(
            id="ref_heldout_diffuser",
            project_id="project_baker_eoc",
            symbol_name="Supply Air Diffuser 24x24",
            bbox=(88.0, 88.0, 112.0, 112.0),
            segments=ref_diff_segs,
            raster_patch=ref_diff_patch,
            source_sheet="M-101"
        )

        b_pos_segs, b_pos_patch = self._synthetic_symbol("supply_diffuser", (300, 500), size=24.0)
        b_neg_ret_segs, b_neg_ret_patch = self._synthetic_symbol("return_diffuser", (350, 500), size=24.0) # Near-miss look-alike!
        b_neg_carrier_segs, b_neg_carrier_patch = self._synthetic_symbol("carrier_line", (300, 500), size=60.0)

        cands_heldout_2 = [
            Candidate("cand_ho_diff_true", "project_baker_eoc", (288, 488, 312, 512), b_pos_segs, b_pos_patch, "SAD-1", "duct_attached", "phys_ho_sad1", True),
            Candidate("cand_ho_diff_lookalike", "project_baker_eoc", (338, 488, 362, 512), b_neg_ret_segs, b_neg_ret_patch, "SAD-1", "duct_attached", "phys_ho_rad1", False),
            Candidate("cand_ho_diff_carrier", "project_baker_eoc", (260, 498, 340, 502), b_neg_carrier_segs, b_neg_carrier_patch, "SAD-1", "duct_attached", "phys_ho_duct", False),
        ]
        groups.append(EvaluationGroup(
            group_id="eval_heldout_baker_01",
            project_id="project_baker_eoc",
            reference=ref_heldout_diff,
            tag_name="SAD-1",
            tag_bbox=(290, 460, 320, 480),
            candidates=cands_heldout_2,
            target_physical_id="phys_ho_sad1",
            split="held_out"
        ))

        return groups
