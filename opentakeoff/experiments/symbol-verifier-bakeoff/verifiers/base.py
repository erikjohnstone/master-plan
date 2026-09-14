"""
Base verifier interface for offline symbol bakeoff.
Every verifier adheres to this contract.
"""

from abc import ABC, abstractmethod
import time
from typing import List, Dict, Any, Optional
import numpy as np

from dataset.schema import SymbolReference, Candidate, VerifierDecision

class BaseVerifier(ABC):
    def __init__(self, name: str, version: str, threshold: float, abstain_threshold: float = 0.5):
        self.name = name
        self.version = version
        self.threshold = threshold
        self.abstain_threshold = abstain_threshold

    @abstractmethod
    def score_pair(self, reference: SymbolReference, candidate: Candidate) -> Tuple_Score_Reason:
        """
        Compute similarity score between reference and candidate.
        Returns: (score: float in [0.0, 1.0], reason: Optional[str])
        """
        pass

    def verify_group(self, reference: SymbolReference, candidates: List[Candidate]) -> List[VerifierDecision]:
        """
        Rank, verify, or abstain across candidate group.
        Handles physical deduplication, ranking, timing, and provenance.
        """
        start_time = time.perf_counter()
        raw_scored = []

        for cand in candidates:
            score, reason = self.score_pair(reference, cand)
            raw_scored.append((cand, score, reason))

        # Sort descending by score
        raw_scored.sort(key=lambda x: x[1], reverse=True)
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        decisions = []
        seen_physical_ids = set()

        for rank, (cand, score, reason) in enumerate(raw_scored, start=1):
            is_duplicate = cand.physical_object_id in seen_physical_ids
            seen_physical_ids.add(cand.physical_object_id)

            if is_duplicate:
                decision = "reject"
                abstain_reason = "duplicate_physical_object"
            elif score >= self.threshold:
                decision = "match"
                abstain_reason = None
            elif score >= self.abstain_threshold:
                decision = "abstain"
                abstain_reason = reason or "borderline_confidence"
            else:
                decision = "reject"
                abstain_reason = reason or "below_abstain_threshold"

            decisions.append(VerifierDecision(
                candidate_id=cand.id,
                physical_object_id=cand.physical_object_id,
                score=float(score),
                decision=decision,
                rank=rank,
                abstention_reason=abstain_reason,
                provenance={
                    "verifier_name": self.name,
                    "verifier_version": self.version,
                    "match_threshold": self.threshold,
                    "abstain_threshold": self.abstain_threshold,
                    "reference_id": reference.id,
                    "candidate_bbox": list(cand.bbox),
                    "latency_ms": elapsed_ms / max(1, len(candidates)),
                    "timestamp": time.time()
                }
            ))

        return decisions

Tuple_Score_Reason = tuple[float, Optional[str]]
