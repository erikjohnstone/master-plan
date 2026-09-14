"""
Method 3: Local Keypoint / Shape Context Descriptors for Sparse B&W CAD.
Implements Shape Context log-polar distribution matching over sampled linework contours.
"""

import numpy as np
from typing import List, Tuple, Optional
from dataset.schema import SymbolReference, Candidate, Segment
from verifiers.base import BaseVerifier

class KeypointShapeVerifier(BaseVerifier):
    def __init__(self, num_points: int = 50, num_r_bins: int = 5, num_theta_bins: int = 12,
                 threshold: float = 0.75, abstain_threshold: float = 0.55):
        super().__init__(
            name="shape_context_descriptor",
            version="1.0.0",
            threshold=threshold,
            abstain_threshold=abstain_threshold
        )
        self.num_points = num_points
        self.num_r_bins = num_r_bins
        self.num_theta_bins = num_theta_bins

    def _sample_points_from_segments(self, segments: List[Segment], n_samples: int) -> np.ndarray:
        """Uniformly sample points along vector segments."""
        if not segments:
            return np.zeros((0, 2), dtype=np.float32)

        lengths = np.array([s.length() for s in segments], dtype=np.float32)
        total_len = np.sum(lengths)
        if total_len <= 1e-6:
            return np.zeros((0, 2), dtype=np.float32)

        probs = lengths / total_len
        # Deterministic sampling based on segment lengths
        points = []
        samples_per_seg = np.maximum(1, np.round(probs * n_samples).astype(int))

        for s, k in zip(segments, samples_per_seg):
            ts = np.linspace(0.0, 1.0, k, endpoint=False)
            for t in ts:
                points.append((s.x0 + t * (s.x1 - s.x0), s.y0 + t * (s.y1 - s.y0)))

        pts = np.array(points, dtype=np.float32)
        if len(pts) > n_samples:
            # Subsample evenly
            idx = np.linspace(0, len(pts) - 1, n_samples).astype(int)
            pts = pts[idx]
        elif len(pts) < n_samples and len(pts) > 0:
            # Pad by repeating
            extra = pts[:(n_samples - len(pts))]
            pts = np.vstack([pts, extra])

        return pts

    def _compute_shape_context(self, pts: np.ndarray) -> np.ndarray:
        """Compute (N, r_bins * theta_bins) shape context log-polar histogram."""
        N = len(pts)
        if N == 0:
            return np.zeros((0, self.num_r_bins * self.num_theta_bins), dtype=np.float32)

        # Pairwise differences
        diff = pts[:, np.newaxis, :] - pts[np.newaxis, :, :]  # (N, N, 2)
        dists = np.hypot(diff[:, :, 0], diff[:, :, 1])        # (N, N)
        angles = np.arctan2(diff[:, :, 1], diff[:, :, 0])     # (N, N) in [-pi, pi]

        # Mean distance for scale normalization
        mean_dist = np.mean(dists)
        if mean_dist <= 1e-6:
            return np.zeros((N, self.num_r_bins * self.num_theta_bins), dtype=np.float32)

        norm_dists = dists / mean_dist
        # Logarithmic radial bins
        r_bins_edges = np.logspace(-1.0, 0.5, self.num_r_bins + 1)
        # Angular bins in [0, 2*pi]
        angles = (angles + 2 * np.pi) % (2 * np.pi)
        theta_bins_edges = np.linspace(0, 2 * np.pi, self.num_theta_bins + 1)

        histograms = np.zeros((N, self.num_r_bins, self.num_theta_bins), dtype=np.float32)
        for i in range(N):
            for j in range(N):
                if i == j:
                    continue
                d = norm_dists[i, j]
                th = angles[i, j]
                r_idx = np.digitize(d, r_bins_edges) - 1
                th_idx = np.digitize(th, theta_bins_edges) - 1
                if 0 <= r_idx < self.num_r_bins and 0 <= th_idx < self.num_theta_bins:
                    histograms[i, r_idx, th_idx] += 1.0

        # Flatten and normalize each point's histogram
        flat_hist = histograms.reshape(N, -1)
        sums = np.sum(flat_hist, axis=1, keepdims=True)
        sums[sums == 0] = 1.0
        return flat_hist / sums

    def score_pair(self, reference: SymbolReference, candidate: Candidate) -> Tuple[float, Optional[str]]:
        ref_pts = self._sample_points_from_segments(reference.segments, self.num_points)
        cand_pts = self._sample_points_from_segments(candidate.segments, self.num_points)

        if len(ref_pts) < 10 or len(cand_pts) < 10:
            return (0.0, "insufficient_contour_points")

        # Center point clouds
        ref_pts = ref_pts - np.mean(ref_pts, axis=0)
        cand_pts = cand_pts - np.mean(cand_pts, axis=0)

        best_sim = 0.0

        # Check 4 discrete rotations to handle CAD orientation changes
        for rot_k in range(4):
            theta = rot_k * (np.pi / 2.0)
            R = np.array([[np.cos(theta), -np.sin(theta)], [np.sin(theta), np.cos(theta)]], dtype=np.float32)
            cand_rot = cand_pts @ R.T

            sc_ref = self._compute_shape_context(ref_pts)
            sc_cand = self._compute_shape_context(cand_rot)

            # Chi-squared matching cost between all pairs
            # C_ij = 0.5 * sum((p - q)^2 / (p + q + eps))
            eps = 1e-7
            diff_sq = (sc_ref[:, np.newaxis, :] - sc_cand[np.newaxis, :, :]) ** 2
            sum_pq = sc_ref[:, np.newaxis, :] + sc_cand[np.newaxis, :, :] + eps
            cost_matrix = 0.5 * np.sum(diff_sq / sum_pq, axis=-1)  # (N, N)

            # Greedy or min-cost bipartite approximation
            min_costs_p = np.min(cost_matrix, axis=1)  # For each ref point, best cand point
            min_costs_q = np.min(cost_matrix, axis=0)  # For each cand point, best ref point

            avg_cost = 0.5 * (np.mean(min_costs_p) + np.mean(min_costs_q))
            # Convert cost (lower is better, typically in [0.1, 0.8]) to similarity score in [0, 1]
            sim = float(np.clip(1.0 - (avg_cost / 0.65), 0.0, 1.0))

            if sim > best_sim:
                best_sim = sim

        reason = None
        if best_sim < self.abstain_threshold:
            reason = "dissimilar_shape_context"
        elif best_sim < self.threshold:
            reason = "borderline_shape_match"

        return (best_sim, reason)
