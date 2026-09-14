# Architecture Decision Record (ADR): Symbol Verification Architecture

## Status: PROVISIONAL / PENDING FROZEN BASELINE EVALUATION

## Context
We need to determine the optimal verifier architecture to follow deterministic candidate isolation near printed equipment tags:
> *Given a source-reviewed project legend symbol, a printed equipment tag, and several isolated physical-body candidates near that tag, which candidate depicts the referenced physical object—or should the system abstain?*

We constructed an offline harness supporting 8 methods across:
1. Deterministic vector linework matching ($D_4$ symmetry).
2. Multi-scale/multi-rotation normalized raster template matching.
3. Local keypoint descriptors (Shape Context, OpenCV SIFT, OpenCV ORB).
4. Vector graph topology (junctions, ports, closed cycles).
5. Off-the-shelf metric embedding (MobileNetV3).
6. Hybrid cascaded combinations.

## Preliminary Hypotheses & Provisional Decision
Pending full evaluation on the coordinator's frozen reviewed benchmark dataset:
- **Primary Working Architecture**: **Deterministic / Topological Fast-Lane + Secondary Verifier**.
- **Key Caveat**: Off-the-shelf ImageNet models cannot be trusted zero-shot on technical line art without empirical calibration or metric fine-tuning.
- **Final Architecture Decision**: Will be finalized exclusively on measured candidate recall, false-accept curves, and latency across the coordinator's frozen benchmark dataset.

## Proposed Additive Shared-Path Result Contract (For Future Production Phase)
*(Non-breaking, additive contract only — no production code implemented during this phase)*:
```typescript
export interface SymbolVerificationResult {
  candidate_id: string;
  physical_object_id: string;
  score: number;
  verdict: 'verified' | 'withheld' | 'rejected';
  reason?: string;
  evidence: {
    vector_coverage: number;
    topology_match_score?: number;
    metric_similarity?: number;
    symmetry_transform: string;
  };
}
```
