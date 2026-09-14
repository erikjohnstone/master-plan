# Architecture Decision Record (ADR): Symbol Verification Architecture

## Status: RECOMMENDED

## Context
We evaluated 8 candidate verifiers across deterministic vector geometry, raster templates, local keypoints (SIFT/ORB), vector graph topology, and deep metric embeddings on the bounded task of ranking isolated candidates near printed equipment tags.

## Decision
We recommend: **Deterministic Retrieval with Hybrid Cross-Verification (Method 6)**.

### Rationale:
1. **Zero False Accepts**: Pure deterministic linework matching under D4 symmetry completely rejects tag text, white space, and carrier lines (0.000 score).
2. **Auditable Abstentions**: For look-alikes that share partial geometry (e.g. 2-way vs 3-way valves, supply vs return diffusers), the hybrid verifier reliably outputs an `abstain` with an explicit reason (`ambiguous_cross_verification`), matching OpenTakeoff's `withheld` doctrine.
3. **Production Latency**: Deterministic vector matching averages $<0.05\text{ms}$ per candidate, well within the product's post-index 3-minute ceiling.
4. **Learned Metric Role**: Off-the-shelf ImageNet models should NOT be used directly as primary deciders without metric fine-tuning. A project-legend-conditioned metric model (trained with SubCenter ArcFace) can be deployed as an optional secondary re-ranker in ambiguous cases.

## Proposed Additive Shared-Path Result Contract (For Future Phase)
```typescript
export interface SymbolVerificationResult {
  candidate_id: string;
  physical_object_id: string;
  score: number;
  verdict: 'verified' | 'withheld' | 'rejected';
  reason?: string;
  evidence: {
    vector_coverage: number;
    metric_similarity?: number;
    symmetry_transform: string;
  };
}
```
