"""
Symbol verifier modules for offline bakeoff.
"""

from verifiers.base import BaseVerifier
from verifiers.deterministic_vector import DeterministicVectorVerifier
from verifiers.raster_template import RasterTemplateVerifier
from verifiers.keypoint_shape import KeypointShapeVerifier
from verifiers.vector_topology import VectorTopologyVerifier
from verifiers.metric_embedding import MetricEmbeddingVerifier
from verifiers.hybrid_verifier import HybridTopKVerifier
from verifiers.sift_orb_verifier import SiftOrbVerifier

ALL_VERIFIERS = {
    "deterministic_vector": DeterministicVectorVerifier,
    "raster_template": RasterTemplateVerifier,
    "keypoint_shape_context": KeypointShapeVerifier,
    "opencv_sift_keypoint": lambda: SiftOrbVerifier(method="sift"),
    "opencv_orb_keypoint": lambda: SiftOrbVerifier(method="orb"),
    "vector_topology": VectorTopologyVerifier,
    "off_the_shelf_metric": MetricEmbeddingVerifier,
    "hybrid_top_k": HybridTopKVerifier,
}
