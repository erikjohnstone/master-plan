"""
Data contracts and schema definitions for the Offline Symbol Verifier Bakeoff.
Results and types here are isolated from production.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional, Tuple
import numpy as np

@dataclass
class Segment:
    x0: float
    y0: float
    x1: float
    y1: float
    stroke_width: float = 1.0
    color: str = "#000000"

    def length(self) -> float:
        return np.hypot(self.x1 - self.x0, self.y1 - self.y0)

@dataclass
class SymbolReference:
    """A reviewed project legend symbol or reference."""
    id: str
    project_id: str
    symbol_name: str
    bbox: Tuple[float, float, float, float]  # [x0, y0, x1, y1]
    segments: List[Segment]
    raster_patch: np.ndarray  # Grayscale (H, W) uint8 [0, 255]
    source_sheet: str
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class Candidate:
    """An isolated physical-body candidate near a tag."""
    id: str
    project_id: str
    bbox: Tuple[float, float, float, float]  # [x0, y0, x1, y1]
    segments: List[Segment]
    raster_patch: np.ndarray  # Grayscale (H, W) uint8 [0, 255]
    source_tag: str
    carrier_type: str  # "leader", "duct_attached", "pipe_attached", "free"
    physical_object_id: str  # For deduplication across multi-tag detections
    is_ground_truth_match: bool = False  # Ground truth label for evaluation
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class VerifierDecision:
    """The decision made by a verifier for a candidate."""
    candidate_id: str
    physical_object_id: str
    score: float  # Normalized confidence score in [0.0, 1.0]
    decision: str  # "match", "abstain", "reject"
    rank: int  # 1-based rank within candidate group
    abstention_reason: Optional[str] = None
    provenance: Dict[str, Any] = field(default_factory=dict)

@dataclass
class EvaluationGroup:
    """A single evaluation query: 1 reference symbol, 1 printed tag, N isolated candidates."""
    group_id: str
    project_id: str
    reference: SymbolReference
    tag_name: str
    tag_bbox: Tuple[float, float, float, float]
    candidates: List[Candidate]
    target_physical_id: Optional[str] = None  # None if target is absent (tag-only negative control)
    split: str = "dev"  # "dev" or "held_out"
