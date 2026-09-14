# DINOv2 symbol-metric v1

This directory records the provenance of the visual candidate-ranking model
trained on 2026-09-14. The browser model is stored in Git LFS at
`web/public/models/dinov2-symbol-metric-v1/dinov2_vits14_symbol_metric_v1.onnx`.

- Architecture: DINOv2-S/14 twin encoder with a normalized 256-dimensional
  embedding head.
- Input: 280×280 RGB, where source ink is converted to grayscale, padded on a
  white canvas without changing aspect ratio, then ImageNet normalized.
- SHA-256: `7911c2fae8fa9d63082416619d1224c9b2f6edb93b78bf306327ba08d44499f8`.
- Training set: 34,064 source-native HVAC/BAS symbol crops; validation 2,679;
  held-out training-data test 1,397.
- Training-data diagnostic: two-view cosine `0.9662`; weak source-label recall
  @1 `0.9090`, @5 `0.9627`.

The trained model ranks visual candidates for human review. It cannot establish
a symbol, tag, source citation, installed quantity, or schedule reconciliation
on its own. Real project-held-out legend-to-plan evaluation is required before
any production acceptance policy can use it.

## Browser runtime check

On 2026-09-14, the built browser bundle loaded the original 75-page NAVFAC
Cherry Point PDF and rendered an overlapping source tile from M-401. A
visually reviewed physical bypass-valve assembly crop ranked its identical
candidate at `1.000000`, while a nearby non-valve pipework crop scored
`0.269079`. The first WASM request took 2.9 seconds and the repeated request
with the model resident took 1.6 seconds for one reference plus two candidates.

This is a runtime smoke check, not an accuracy benchmark: an identical crop
must rank first. It proves that the shipped browser receives original PDF tile
pixels and returns model embeddings/rankings. It does **not** demonstrate
legend-to-plan recall, tag association, or installed quantity correctness.
