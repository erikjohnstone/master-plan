"""
Method 4: Vector Topology Descriptors Based on Segments, Junctions, Ports, and Closed Loops.
Extracts invariant graph topological features from raw CAD vector linework.
"""

import numpy as np
from typing import List, Tuple, Dict, Optional, Set
from dataset.schema import SymbolReference, Candidate, Segment
from verifiers.base import BaseVerifier

class VectorTopologyVerifier(BaseVerifier):
    def __init__(self, snap_tol: float = 1.5, threshold: float = 0.80, abstain_threshold: float = 0.60):
        super().__init__(
            name="vector_topology_descriptor",
            version="1.0.0",
            threshold=threshold,
            abstain_threshold=abstain_threshold
        )
        self.snap_tol = snap_tol

    def _extract_topology(self, segments: List[Segment]) -> Dict[str, float]:
        """Construct graph and extract invariant topological features."""
        if not segments:
            return {"seg_count": 0, "loop_count": 0, "d1": 0, "d3": 0, "d4": 0, "aspect": 1.0}

        # Quantize points to merge junctions
        def quantize(x: float, y: float) -> Tuple[int, int]:
            return (int(np.round(x / self.snap_tol)), int(np.round(y / self.snap_tol)))

        adj: Dict[Tuple[int, int], Set[Tuple[int, int]]] = {}
        edges: Set[Tuple[Tuple[int, int], Tuple[int, int]]] = set()

        min_x = min_y = float('inf')
        max_x = max_y = float('-inf')

        for s in segments:
            p0 = quantize(s.x0, s.y0)
            p1 = quantize(s.x1, s.y1)
            if p0 == p1:
                continue

            edge = (min(p0, p1), max(p0, p1))
            edges.add(edge)

            adj.setdefault(p0, set()).add(p1)
            adj.setdefault(p1, set()).add(p0)

            min_x = min(min_x, s.x0, s.x1)
            max_x = max(max_x, s.x0, s.x1)
            min_y = min(min_y, s.y0, s.y1)
            max_y = max(max_y, s.y0, s.y1)

        V = len(adj)
        E = len(edges)

        # Count connected components
        visited = set()
        components = 0
        for node in adj:
            if node not in visited:
                components += 1
                queue = [node]
                visited.add(node)
                while queue:
                    curr = queue.pop()
                    for nbr in adj[curr]:
                        if nbr not in visited:
                            visited.add(nbr)
                            queue.append(nbr)

        # Euler characteristic for planar graph cycle estimation: F = E - V + C
        cycles = max(0, E - V + components) if V > 0 else 0

        # Degree distribution
        d1 = sum(1 for n, nbrs in adj.items() if len(nbrs) == 1)  # Ports / terminals
        d3 = sum(1 for n, nbrs in adj.items() if len(nbrs) == 3)  # T-junctions
        d4 = sum(1 for n, nbrs in adj.items() if len(nbrs) >= 4)  # Crossings / hubs

        w = max(1.0, max_x - min_x) if min_x < float('inf') else 1.0
        h = max(1.0, max_y - min_y) if min_y < float('inf') else 1.0
        aspect = max(w / h, h / w)

        return {
            "seg_count": float(len(segments)),
            "loop_count": float(cycles),
            "ports_d1": float(d1),
            "t_junctions_d3": float(d3),
            "crossings_d4": float(d4),
            "aspect": float(aspect),
            "edge_vertex_ratio": float(E / max(1, V))
        }

    def score_pair(self, reference: SymbolReference, candidate: Candidate) -> Tuple[float, Optional[str]]:
        t_ref = self._extract_topology(reference.segments)
        t_cand = self._extract_topology(candidate.segments)

        if t_ref["seg_count"] == 0 or t_cand["seg_count"] == 0:
            return (0.0, "empty_topology")

        # Compare topological feature vectors
        diffs = []
        # Cycle / loop matching (crucial for valves, dampers, diffusers)
        loop_diff = abs(t_ref["loop_count"] - t_cand["loop_count"])
        loop_sim = max(0.0, 1.0 - loop_diff * 0.4)
        diffs.append(loop_sim)

        # Port / terminal count matching
        port_diff = abs(t_ref["ports_d1"] - t_cand["ports_d1"])
        port_sim = max(0.0, 1.0 - port_diff * 0.25)
        diffs.append(port_sim)

        # T-junction and X-crossing matching
        junc_diff = abs(t_ref["t_junctions_d3"] - t_cand["t_junctions_d3"]) + abs(t_ref["crossings_d4"] - t_cand["crossings_d4"])
        junc_sim = max(0.0, 1.0 - junc_diff * 0.2)
        diffs.append(junc_sim)

        # Aspect ratio consistency
        aspect_diff = abs(t_ref["aspect"] - t_cand["aspect"])
        aspect_sim = max(0.0, 1.0 - aspect_diff * 0.3)
        diffs.append(aspect_sim)

        # Segment density relative error
        s_rel = abs(t_ref["seg_count"] - t_cand["seg_count"]) / max(t_ref["seg_count"], 1.0)
        seg_sim = max(0.0, 1.0 - s_rel * 0.5)
        diffs.append(seg_sim)

        # Weighted combination
        weights = [0.30, 0.20, 0.20, 0.15, 0.15]
        score = float(np.average(diffs, weights=weights))

        reason = None
        if score < self.abstain_threshold:
            reason = "topological_incompatibility"
        elif score < self.threshold:
            reason = "marginal_topology_match"

        return (score, reason)
