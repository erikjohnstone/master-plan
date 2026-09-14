"""
Method 2: Normalized Raster Template Matching at Multiple Scales and Rotations.
Evaluates multi-scale Zero-mean Normalized Cross-Correlation (ZNCC).
"""

import numpy as np
from PIL import Image
from typing import Tuple, Optional
from dataset.schema import SymbolReference, Candidate
from verifiers.base import BaseVerifier

class RasterTemplateVerifier(BaseVerifier):
    def __init__(self, target_size: int = 64, threshold: float = 0.78, abstain_threshold: float = 0.58):
        super().__init__(
            name="raster_template_matching",
            version="1.0.0",
            threshold=threshold,
            abstain_threshold=abstain_threshold
        )
        self.target_size = target_size
        self.scales = [0.8, 0.9, 1.0, 1.1, 1.2]
        self.rotations = [0, 90, 180, 270]

    def _normalize_patch(self, patch: np.ndarray, size: int) -> np.ndarray:
        """Resize patch with aspect preservation and padding to size x size."""
        if patch.size == 0:
            return np.zeros((size, size), dtype=np.float32)

        # Invert if white background (CAD drawings are typically black lines on white)
        # We want ink as high values (positive signal)
        if np.mean(patch) > 127:
            patch = 255 - patch

        img = Image.fromarray(patch.astype(np.uint8))
        w, h = img.size
        if w == 0 or h == 0:
            return np.zeros((size, size), dtype=np.float32)

        scale = min((size - 4) / max(w, 1), (size - 4) / max(h, 1))
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))
        resized = img.resize((new_w, new_h), Image.Resampling.BILINEAR)

        canvas = Image.new("L", (size, size), 0)
        paste_x = (size - new_w) // 2
        paste_y = (size - new_h) // 2
        canvas.paste(resized, (paste_x, paste_y))

        arr = np.array(canvas, dtype=np.float32) / 255.0
        return arr

    def _zncc(self, t: np.ndarray, c: np.ndarray) -> float:
        """Compute Zero-mean Normalized Cross-Correlation between two equal-sized arrays."""
        t_mean = np.mean(t)
        c_mean = np.mean(c)
        t_zero = t - t_mean
        c_zero = c - c_mean

        t_std = np.std(t)
        c_std = np.std(c)

        if t_std < 1e-5 or c_std < 1e-5:
            return 0.0

        corr = np.sum(t_zero * c_zero) / (t.size * t_std * c_std)
        return float(np.clip(corr, 0.0, 1.0))

    def score_pair(self, reference: SymbolReference, candidate: Candidate) -> Tuple[float, Optional[str]]:
        ref_img = self._normalize_patch(reference.raster_patch, self.target_size)
        cand_img = self._normalize_patch(candidate.raster_patch, self.target_size)

        if np.sum(ref_img) < 1e-3 or np.sum(cand_img) < 1e-3:
            return (0.0, "blank_raster_patch")

        best_corr = 0.0
        cand_pil = Image.fromarray((cand_img * 255).astype(np.uint8))

        for rot in self.rotations:
            rotated = cand_pil.rotate(rot, resample=Image.Resampling.BILINEAR)
            for scale in self.scales:
                if scale == 1.0:
                    scaled = rotated
                else:
                    sw = max(4, int(self.target_size * scale))
                    sh = max(4, int(self.target_size * scale))
                    temp = rotated.resize((sw, sh), Image.Resampling.BILINEAR)
                    scaled = Image.new("L", (self.target_size, self.target_size), 0)
                    px = (self.target_size - sw) // 2
                    py = (self.target_size - sh) // 2
                    scaled.paste(temp, (px, py))

                test_arr = np.array(scaled, dtype=np.float32) / 255.0
                corr = self._zncc(ref_img, test_arr)
                if corr > best_corr:
                    best_corr = corr

        reason = None
        if best_corr < self.abstain_threshold:
            reason = "low_template_correlation"
        elif best_corr < self.threshold:
            reason = "borderline_template_match"

        return (best_corr, reason)
