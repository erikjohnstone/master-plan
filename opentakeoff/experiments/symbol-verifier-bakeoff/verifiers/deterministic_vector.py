"""
Method 1: Frozen Carrier-Detached Deterministic Baseline.
Evaluates vector linework matching under D4 symmetry without learned weights.
"""

import numpy as np
from typing import List, Tuple, Optional
from dataset.schema import SymbolReference, Candidate, Segment
from verifiers.base import BaseVerifier

class DeterministicVectorVerifier(BaseVerifier):
    def __init__(self, threshold: float = 0.85, abstain_threshold: float = 0.65):
        super().__init__(
            name="deterministic_vector_baseline",
            version="1.0.0",
            threshold=threshold,
            abstain_threshold=abstain_threshold
        )

    def _strip_carrier_lines(self, segments: List[Segment], bbox: Tuple[float, float, float, float]) -> List[Segment]:
        """Strip long lines that extend far beyond candidate bounding box (duct/pipe carrier lines)."""
        w = max(1.0, bbox[2] - bbox[0])
        h = max(1.0, bbox[3] - bbox[1])
        diag = np.hypot(w, h)
        max_internal_len = diag * 1.25

        clean = []
        for s in segments:
            # If segment is significantly longer than symbol diagonal, it's a carrier or boundary line
            if s.length() <= max_internal_len:
                clean.append(s)
        return clean if clean else segments

    def _get_centroid(self, segments: List[Segment]) -> Tuple[float, float]:
        total_len = sum(s.length() for s in segments)
        if total_len <= 1e-6:
            return (0.0, 0.0)
        cx = sum(((s.x0 + s.x1) / 2.0) * s.length() for s in segments) / total_len
        cy = sum(((s.y0 + s.y1) / 2.0) * s.length() for s in segments) / total_len
        return (cx, cy)

    def _transform_point(self, pt: Tuple[float, float], rot_idx: int, mirror: bool) -> Tuple[float, float]:
        x, y = pt
        if mirror:
            x = -x
        if rot_idx == 1:    # 90 deg
            return (-y, x)
        elif rot_idx == 2:  # 180 deg
            return (-x, -y)
        elif rot_idx == 3:  # 270 deg
            return (y, -x)
        return (x, y)       # 0 deg

    def score_pair(self, reference: SymbolReference, candidate: Candidate) -> Tuple[float, Optional[str]]:
        ref_segs = reference.segments
        cand_segs = self._strip_carrier_lines(candidate.segments, candidate.bbox)

        if not ref_segs or not cand_segs:
            return (0.0, "missing_vector_segments")

        ref_total_len = sum(s.length() for s in ref_segs)
        cand_total_len = sum(s.length() for s in cand_segs)

        if ref_total_len <= 1e-6 or cand_total_len <= 1e-6:
            return (0.0, "zero_length_linework")

        # Normalize relative to centroids
        rcx, rcy = self._get_centroid(ref_segs)
        ccx, ccy = self._get_centroid(cand_segs)

        ref_centered = [
            (s.x0 - rcx, s.y0 - rcy, s.x1 - rcx, s.y1 - rcy, s.length())
            for s in ref_segs
        ]
        cand_centered = [
            (s.x0 - ccx, s.y0 - ccy, s.x1 - ccx, s.y1 - ccy, s.length())
            for s in cand_segs
        ]

        best_score = 0.0

        # Test D4 symmetry (4 rotations x 2 mirrors)
        for rot in range(4):
            for mirror in (False, True):
                matched_len = 0.0
                for rx0, ry0, rx1, ry1, rlen in ref_centered:
                    tx0, ty0 = self._transform_point((rx0, ry0), rot, mirror)
                    tx1, ty1 = self._transform_point((rx1, ry1), rot, mirror)

                    # Find closest candidate segment
                    best_seg_dist = float('inf')
                    for cx0, cy0, cx1, cy1, clen in cand_centered:
                        d1 = np.hypot(tx0 - cx0, ty0 - cy0) + np.hypot(tx1 - cx1, ty1 - cy1)
                        d2 = np.hypot(tx0 - cx1, ty0 - cy1) + np.hypot(tx1 - cx0, ty1 - cy0)
                        dist = min(d1, d2)
                        if dist < best_seg_dist:
                            best_seg_dist = dist

                    # Tolerance scaled with symbol scale
                    tol_px = max(2.5, min(8.0, rlen * 0.25))
                    if best_seg_dist <= tol_px:
                        matched_len += rlen

                score = matched_len / ref_total_len
                # Penalize excess unmatched clutter in candidate
                excess_penalty = max(0.0, min(0.3, (cand_total_len - ref_total_len) / (ref_total_len + 1e-6) * 0.15))
                penalized_score = max(0.0, score - excess_penalty)

                if penalized_score > best_score:
                    best_score = penalized_score

        reason = None
        if best_score < self.abstain_threshold:
            reason = "insufficient_linework_coverage"
        elif best_score < self.threshold:
            reason = "marginal_geometric_reproduction"

        return (best_score, reason)
