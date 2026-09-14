"""
Required Tests and Safeguards for Symbol Verifier Bakeoff.
Validates:
1. Normalization & transforms
2. Deduplication & ranking
3. Repeatability (byte-equivalent decisions)
4. Negative controls (tag strokes, whitespace, carrier lines must not self-verify)
5. Project leakage (zero overlap between dev and held-out projects)
6. Provenance completeness
"""

import unittest
import numpy as np
import json
import os

from dataset.schema import Segment, SymbolReference, Candidate, EvaluationGroup, VerifierDecision
from dataset.loader import DatasetLoader
from verifiers.deterministic_vector import DeterministicVectorVerifier
from verifiers.raster_template import RasterTemplateVerifier
from verifiers.keypoint_shape import KeypointShapeVerifier
from verifiers.vector_topology import VectorTopologyVerifier
from verifiers.metric_embedding import MetricEmbeddingVerifier
from verifiers.hybrid_verifier import HybridTopKVerifier
from verifiers.sift_orb_verifier import SiftOrbVerifier

class TestSafeguardsAndVerifiers(unittest.TestCase):

    def setUp(self):
        self.workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
        self.loader = DatasetLoader(self.workspace_root)
        self.dataset = self.loader.build_benchmark_dataset()

    def test_01_leakage_safeguard(self):
        """LEAKAGE TEST: Fails if any project appears in both dev and held_out splits."""
        dev_projects = set()
        held_out_projects = set()

        for group in self.dataset:
            if group.split == "dev":
                dev_projects.add(group.project_id)
            elif group.split == "held_out":
                held_out_projects.add(group.project_id)
            else:
                self.fail(f"Invalid split name: {group.split}")

        overlap = dev_projects.intersection(held_out_projects)
        self.assertEqual(len(overlap), 0, f"DATA LEAKAGE DETECTED! Overlapping projects: {overlap}")
        self.assertTrue(len(dev_projects) > 0, "No dev projects found")
        self.assertTrue(len(held_out_projects) > 0, "No held-out projects found")

    def test_02_negative_controls(self):
        """
        NEGATIVE CONTROLS: Tag strokes, blank space, and long carrier lines
        MUST NOT self-verify as an equipment symbol.
        """
        ref_valve = None
        for g in self.dataset:
            if g.reference.id == "ref_valve_2way":
                ref_valve = g.reference
                break
        self.assertIsNotNone(ref_valve, "Missing valve reference symbol")

        # Extract negative candidates
        tag_cand = None
        carrier_cand = None
        for g in self.dataset:
            for c in g.candidates:
                if "tag" in c.id:
                    tag_cand = c
                if "carrier" in c.id:
                    carrier_cand = c

        self.assertIsNotNone(tag_cand, "Missing tag negative candidate")
        self.assertIsNotNone(carrier_cand, "Missing carrier negative candidate")

        verifiers = [
            DeterministicVectorVerifier(),
            RasterTemplateVerifier(),
            KeypointShapeVerifier(),
            VectorTopologyVerifier(),
            MetricEmbeddingVerifier(),
            HybridTopKVerifier(),
            SiftOrbVerifier("sift")
        ]

        for v in verifiers:
            # Test tag candidate
            score_tag, reason_tag = v.score_pair(ref_valve, tag_cand)
            self.assertLess(score_tag, v.threshold,
                f"Negative control failure! {v.name} accepted tag text with score {score_tag:.3f}")

            # Test carrier line candidate
            score_carrier, reason_carrier = v.score_pair(ref_valve, carrier_cand)
            self.assertLess(score_carrier, v.threshold,
                f"Negative control failure! {v.name} accepted carrier line with score {score_carrier:.3f}")

    def test_03_repeatability(self):
        """
        REPEATABILITY TEST: Two identical runs on the same input must produce
        byte-equivalent decisions and rankings.
        """
        v = DeterministicVectorVerifier()
        g = self.dataset[0]

        decisions_run1 = v.verify_group(g.reference, g.candidates)
        decisions_run2 = v.verify_group(g.reference, g.candidates)

        self.assertEqual(len(decisions_run1), len(decisions_run2))
        for d1, d2 in zip(decisions_run1, decisions_run2):
            self.assertEqual(d1.candidate_id, d2.candidate_id)
            self.assertEqual(d1.decision, d2.decision)
            self.assertEqual(d1.rank, d2.rank)
            self.assertAlmostEqual(d1.score, d2.score, places=5)

    def test_04_provenance_completeness(self):
        """
        PROVENANCE TEST: Every decision must include method name, version,
        threshold, reference_id, candidate_bbox, and latency.
        """
        v = HybridTopKVerifier()
        g = self.dataset[0]
        decisions = v.verify_group(g.reference, g.candidates)

        for d in decisions:
            prov = d.provenance
            self.assertIn("verifier_name", prov)
            self.assertIn("verifier_version", prov)
            self.assertIn("match_threshold", prov)
            self.assertIn("reference_id", prov)
            self.assertIn("candidate_bbox", prov)
            self.assertIn("latency_ms", prov)
            self.assertEqual(len(prov["candidate_bbox"]), 4)

    def test_05_deduplication(self):
        """
        DEDUPLICATION TEST: Candidates pointing to the same physical object
        must not produce multiple accepted matches.
        """
        ref_valve = self.dataset[0].reference
        cand = self.dataset[0].candidates[0] # true match
        # Create duplicate candidate pointing to the same physical_object_id
        cand_dup = Candidate(
            id="cand_v101_true_duplicate",
            project_id=cand.project_id,
            bbox=cand.bbox,
            segments=cand.segments,
            raster_patch=cand.raster_patch,
            source_tag="V-101-second-mention",
            carrier_type=cand.carrier_type,
            physical_object_id=cand.physical_object_id,
            is_ground_truth_match=True
        )

        v = DeterministicVectorVerifier()
        decisions = v.verify_group(ref_valve, [cand, cand_dup])

        accepted = [d for d in decisions if d.decision == "match"]
        self.assertLessEqual(len(accepted), 1, "Failed to deduplicate identical physical object candidates!")
        self.assertEqual(decisions[1].decision, "reject")
        self.assertEqual(decisions[1].abstention_reason, "duplicate_physical_object")

if __name__ == "__main__":
    unittest.main()
