"""
Method 5: Off-the-Shelf Metric Embedding Baseline using Pretrained PyTorch Backbone (MobileNetV3-Small).
Extracts deep visual embeddings from symbol raster patches, projects to unit hypersphere,
and computes cosine similarity. Fully Apache-2.0 / offline / CPU-ready.
Thresholds are calibrated for sparse line-art cosine dynamic range.
"""

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as models
from torchvision import transforms
from PIL import Image
from typing import Tuple, Optional
from dataset.schema import SymbolReference, Candidate
from verifiers.base import BaseVerifier

class MetricEmbeddingVerifier(BaseVerifier):
    def __init__(self, threshold: float = 0.95, abstain_threshold: float = 0.91):
        super().__init__(
            name="off_the_shelf_mobilenet_v3_metric",
            version="1.0.0",
            threshold=threshold,
            abstain_threshold=abstain_threshold
        )
        self.device = torch.device("cpu")
        # Load official off-the-shelf MobileNetV3-Small (Apache 2.0, 2.5M params)
        base_model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
        # Extract features up to pooling (remove classification head)
        self.features = base_model.features
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.features.eval()

        self.transform = transforms.Compose([
            transforms.Resize((64, 64)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])

    def _patch_to_tensor(self, patch: np.ndarray) -> Optional[torch.Tensor]:
        if patch.size == 0 or np.sum(patch) < 1e-3:
            return None
        # Invert if white background so lines are active signal
        if np.mean(patch) > 127:
            patch = 255 - patch

        # Convert grayscale (H, W) to RGB PIL Image
        img = Image.fromarray(patch.astype(np.uint8)).convert("RGB")
        t = self.transform(img).unsqueeze(0).to(self.device)
        return t

    def _extract_embedding(self, patch: np.ndarray) -> np.ndarray:
        t = self._patch_to_tensor(patch)
        if t is None:
            return np.zeros(576, dtype=np.float32)

        with torch.no_grad():
            f = self.features(t)
            p = self.pool(f).squeeze() # Shape (576,)
            p_norm = F.normalize(p, p=2, dim=0)
            return p_norm.cpu().numpy()

    def score_pair(self, reference: SymbolReference, candidate: Candidate) -> Tuple[float, Optional[str]]:
        emb_ref = self._extract_embedding(reference.raster_patch)
        emb_cand = self._extract_embedding(candidate.raster_patch)

        norm_ref = np.linalg.norm(emb_ref)
        norm_cand = np.linalg.norm(emb_cand)

        if norm_ref < 1e-4 or norm_cand < 1e-4:
            return (0.0, "blank_embedding_vector")

        # Cosine similarity on unit hypersphere
        cos_sim = float(np.dot(emb_ref, emb_cand))
        # Map [-1.0, 1.0] to [0.0, 1.0]
        score = max(0.0, (cos_sim + 1.0) / 2.0)

        reason = None
        if score < self.abstain_threshold:
            reason = "low_metric_embedding_similarity"
        elif score < self.threshold:
            reason = "borderline_embedding_match"

        return (score, reason)
