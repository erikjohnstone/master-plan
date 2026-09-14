"""
Method 3b: Off-the-Shelf Local Keypoint Descriptor using OpenCV SIFT / ORB.
Computes keypoint detection, descriptor matching (BFMatcher), and RANSAC inlier ratio.
Apache-2.0 / BSD compatible.
"""

import cv2
import numpy as np
from typing import Tuple, Optional
from dataset.schema import SymbolReference, Candidate
from verifiers.base import BaseVerifier

class SiftOrbVerifier(BaseVerifier):
    def __init__(self, method: str = "sift", threshold: float = 0.70, abstain_threshold: float = 0.50):
        super().__init__(
            name=f"opencv_{method}_keypoint_verifier",
            version="1.0.0",
            threshold=threshold,
            abstain_threshold=abstain_threshold
        )
        self.method = method.lower()
        if self.method == "sift":
            self.detector = cv2.SIFT_create(nfeatures=100)
            self.matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
        else:
            self.detector = cv2.ORB_create(nfeatures=100)
            self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)

    def _prepare_image(self, patch: np.ndarray) -> np.ndarray:
        if patch.size == 0:
            return np.zeros((64, 64), dtype=np.uint8)
        # Ensure uint8 [0, 255]
        if patch.dtype != np.uint8:
            patch = (patch * 255).astype(np.uint8) if patch.max() <= 1.0 else patch.astype(np.uint8)
        # Invert if white background
        if np.mean(patch) > 127:
            patch = 255 - patch
        # Resize to standard 64x64
        return cv2.resize(patch, (64, 64), interpolation=cv2.INTER_LINEAR)

    def score_pair(self, reference: SymbolReference, candidate: Candidate) -> Tuple[float, Optional[str]]:
        img_ref = self._prepare_image(reference.raster_patch)
        img_cand = self._prepare_image(candidate.raster_patch)

        if np.sum(img_ref) < 10 or np.sum(img_cand) < 10:
            return (0.0, "blank_keypoint_image")

        kp1, des1 = self.detector.detectAndCompute(img_ref, None)
        kp2, des2 = self.detector.detectAndCompute(img_cand, None)

        if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
            return (0.0, "insufficient_keypoints")

        # KNN matching with Lowe's ratio test
        matches = self.matcher.knnMatch(des1, des2, k=2)
        good_matches = []
        for m_pair in matches:
            if len(m_pair) == 2:
                m, n = m_pair
                if m.distance < 0.75 * n.distance:
                    good_matches.append(m)

        if len(good_matches) < 4:
            score = float(len(good_matches) / max(len(kp1), 1))
            return (score, "few_good_matches")

        # RANSAC homography geometric consistency check
        src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

        try:
            _, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
            inliers = int(np.sum(mask)) if mask is not None else 0
        except Exception:
            inliers = len(good_matches)

        # Inlier fraction relative to reference keypoints
        score = float(np.clip(inliers / max(10, len(kp1) * 0.6), 0.0, 1.0))

        reason = None
        if score < self.abstain_threshold:
            reason = "low_keypoint_inlier_ratio"
        elif score < self.threshold:
            reason = "borderline_keypoint_match"

        return (score, reason)
