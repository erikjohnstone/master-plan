"""
Method 6: Hybrid Combinations of Deterministic Retrieval with Top-K Cross-Verification.
Fuses carrier-detached vector matching with metric embedding and topology verification in ambiguous zones.
"""

from typing import Tuple, Optional
from dataset.schema import SymbolReference, Candidate
from verifiers.base import BaseVerifier
from verifiers.deterministic_vector import DeterministicVectorVerifier
from verifiers.metric_embedding import MetricEmbeddingVerifier
from verifiers.vector_topology import VectorTopologyVerifier

class HybridTopKVerifier(BaseVerifier):
    def __init__(self, threshold: float = 0.80, abstain_threshold: float = 0.60):
        super().__init__(
            name="hybrid_deterministic_metric_verifier",
            version="1.0.0",
            threshold=threshold,
            abstain_threshold=abstain_threshold
        )
        self.v_det = DeterministicVectorVerifier(threshold=0.88, abstain_threshold=0.65)
        self.v_metric = MetricEmbeddingVerifier(threshold=0.82, abstain_threshold=0.62)
        self.v_topo = VectorTopologyVerifier(threshold=0.80, abstain_threshold=0.60)

    def score_pair(self, reference: SymbolReference, candidate: Candidate) -> Tuple[float, Optional[str]]:
        # Tier 1: Deterministic vector baseline
        s_det, r_det = self.v_det.score_pair(reference, candidate)

        # Fast path: High-confidence vector match
        if s_det >= 0.88:
            return (s_det, None)

        # Fast path: Clear geometric negative
        if s_det < 0.30:
            return (s_det, "clear_geometric_mismatch")

        # Tier 2: Cross-verification for ambiguous zone [0.30, 0.88)
        s_metric, _ = self.v_metric.score_pair(reference, candidate)
        s_topo, _ = self.v_topo.score_pair(reference, candidate)

        # Fused score
        fused = 0.50 * s_det + 0.30 * s_metric + 0.20 * s_topo

        reason = None
        if fused < self.abstain_threshold:
            reason = "cross_verification_failed"
        elif fused < self.threshold:
            reason = "ambiguous_cross_verification"

        return (float(fused), reason)
