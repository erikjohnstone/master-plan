# Symbol Verifier Offline Bakeoff: Initial Harness Verification Report

> **DISCLOSURE & PRE-EVALUATION NOTICE**:  
> The metrics below reflect ONLY the isolated 5-case synthetic/fixture sanity suite used to verify that the harness, safeguard tests, timing hooks, and verifier interfaces function.  
> **These are NOT production corpus metrics.** Final corpus metrics are strictly held pending the coordinator's frozen baseline SHA and reviewed ground-truth candidate dataset. Do not rely on these percentages for production takeoff accuracy.

---

## 1. Scope & Case Disclosure (Harness Verification Suite)

The initial harness test was run across exactly **5 controlled fixture groups** (18 total candidate instances) across 4 project labels to test interface conformance, zero project-leakage assertions, and negative controls:

| Group ID | Project Split | Reference Symbol | Target Present? | Candidates Evaluated |
| :--- | :--- | :--- | :--- | :--- |
| `eval_dev_valves_01` | Dev (`project_valves`) | 2-Way Control Valve | Yes (`phys_v101`) | 1 True Match, 1 3-Way Lookalike, 1 Tag Text, 1 Carrier Line |
| `eval_dev_valves_02_orphaned_tag` | Dev (`project_valves`) | 2-Way Control Valve | **No (Negative Control)** | 1 Tag Text, 1 Carrier Line (Orphaned tag) |
| `eval_dev_air_01` | Dev (`project_air`) | Fire Damper | Yes (`phys_fd1`) | 1 True Match, 1 Diffuser Lookalike, 1 Blank Patch |
| `eval_heldout_cherry_point_01` | Held-Out (`project_cherry_point`) | 2-Way Control Valve | Yes (`phys_ho_v1`) | 1 True Match, 1 3-Way Lookalike, 1 Carrier Line, 1 Tag Text |
| `eval_heldout_baker_01` | Held-Out (`project_baker_eoc`) | Supply Air Diffuser | Yes (`phys_ho_sad1`) | 1 True Match, 1 Return Diffuser Lookalike, 1 Carrier Line |

---

## 2. Harness Smoke-Test Measurements (5 Synthetic Fixture Cases)

*Note: High accuracy on this small synthetic suite proves harness execution, but indicates nothing about real-world CAD discrimination.*

| Method | Dev Split (3 cases) | Held-Out (2 cases) | False Accepts | Abstentions | p50 Latency (ms) | p95 Latency (ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`deterministic_vector_baseline`** | 66.7% | 100.0% | 0.0% | 0.0% | 1.32 ms | 1.51 ms |
| **`raster_template_matching`** | 66.7% | 100.0% | 0.0% | 0.0% | 3.52 ms | 5.33 ms |
| **`shape_context_descriptor`** | 66.7% | 100.0% | 0.0% | 0.0% | 220.22 ms | 297.99 ms |
| **`vector_topology_descriptor`** | 66.7% | 100.0% | 0.0% | 20.0% | 0.21 ms | 0.30 ms |
| **`off_the_shelf_mobilenet_v3_metric`** | 66.7% | 100.0% | 0.0% | 0.0% | 222.57 ms | 299.65 ms |
| **`hybrid_deterministic_metric_verifier`**| 66.7% | 100.0% | 0.0% | 0.0% | 74.43 ms | 76.09 ms |
| **`opencv_sift_keypoint_verifier`** | 66.7% | 100.0% | 0.0% | 0.0% | 3.86 ms | 10.56 ms |
| **`opencv_orb_keypoint_verifier`** | 0.0% | 0.0% | 0.0% | 0.0% | 0.56 ms | 1.56 ms |

*(Dev split accuracy reflects 2/3 because Case 2 is an orphaned tag negative control with no target; true reject of all candidates counts as correct handling rather than a match).*

---

## 3. Real Hypotheses to Test on the Frozen Baseline

The synthetic run confirmed structural harness mechanics, but highlighted specific hypotheses that must be tested against the coordinator's real candidate set:

1. **ImageNet Embedding Calibration Risk**:
   - Off-the-shelf models pre-trained on ImageNet output very high raw cosine similarity on sparse line art. We must test whether un-fine-tuned embeddings can distinguish real-world CAD symbol variants on complex sheets without high false-accept rates.
2. **Topology & Junction Utility**:
   - Graph features (junction degree counts, port counts, closed loops) offer strong theoretical separation for look-alike families (e.g. 2-way vs 3-way valves). We need to measure whether real PDF CAD linework (which is often fragmented into multiple subpaths) preserves these topological invariants cleanly.
3. **Deterministic Fast-Lane Boundaries**:
   - Deterministic geometry is fast ($<1.5\text{ms}$), but we must measure its real proposal recall and failure modes on noisy, rotated, or deformed candidate bodies across real projects.
4. **Metric Re-Ranking**:
   - Determine whether a legend-conditioned metric verifier provides measurable lift over deterministic and topological methods on the ambiguous candidate tail.

---

## 4. Next Step & Protocol

We remain blocked on running corpus evaluation until the coordinator delivers the frozen baseline commit SHA and reviewed candidate set. Once provided:
1. Run all 8 verifiers on the identical frozen candidate set.
2. Compute candidate recall, top-K ranking ($K=1, 3, 5, 10$), localization IoU, false accepts, abstentions, and runtime.
3. Deliver an evidence-based ADR.
