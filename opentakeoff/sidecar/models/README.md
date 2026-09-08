# Vendored RapidTable + TableStructureRec ONNX models

Four gzipped ONNX checkpoints backing the L4.5 table-structure RPC
(`sidecar/table_structure_rpc.py`, gated behind `OPENTAKEOFF_TABLE_STRUCTURE=1`):
table-STRUCTURE recognition (`slanet-plus.onnx.gz`) and table-REGION detection
(`yolo_obj_det.onnx.gz`, `yolo_edge_det.onnx.gz`, `paddle_cls_det.onnx.gz`).

**Why this exists**: both `rapid_table` and `rapid_table_det` (already Python
dependencies of this project) auto-download their checkpoints from
`www.modelscope.cn` on first use. In this project's sandboxed dev environment
that fetch returns HTTP 403 from the egress proxy (organization policy, not a
transient failure — confirmed via the proxy's own status endpoint) — the same
class of problem `sidecar/tessdata`'s own README documents for tesseract.js.
Vendoring removes the runtime dependency entirely, same as that fix.

**How these got here**: modelscope.cn is blocked for outbound fetches from
this sandbox specifically, so these were downloaded on the user's own machine
and transferred in via a GitHub Release asset (`erikjohnstone/master-plan`'s
`Table_models` release, `OCR.zip`) rather than a runtime download step run
from here — worth knowing if this ever needs re-fetching from a fresh source.

**Source and provenance**:

| File | Upstream repo | Published SHA256 | Verified |
|---|---|---|---|
| `slanet-plus.onnx` | `RapidAI/RapidTable` (`rapid_table`'s `default_models.yaml`, `v2.0.0` tag) | `d57a942af6a2f57d6a4a0372573c696a2379bf5857c45e2ac69993f3b334514b` | matches exactly |
| `yolo_obj_det.onnx` | `jockerK/TableExtractor` (`rapid_table_det`'s `KEY_TO_MODEL_URL`, `master` branch) | none published | size-verified only |
| `yolo_edge_det.onnx` | same as above | none published | size-verified only |
| `paddle_cls_det.onnx` | same as above | none published | size-verified only |

`slanet-plus.onnx` is the modern, lightweight unified table-structure engine
`rapid_table` 3.0.2 ships (`RapidTableInput(model_type="slanet_plus")`) —
preferred over the older `wired_table_rec`/`lineless_table_rec` packages,
same author, newer, measured higher TEDS on OmniDocBench. The other three are
`rapid_table_det`'s literal default `model_type` trio
(`obj_model_type="yolo_obj_det"`, `edge_model_type="yolo_edge_det"`,
`cls_model_type="paddle_cls_det"` — confirmed directly against
`rapid_table_det/inference.py`'s own defaults), used to find and de-skew a
table region on a page before structure recognition runs on it.

**Why gzipped**: `yolo_edge_det.onnx` (110,783,963 bytes) and
`yolo_obj_det.onnx` (101,643,120 bytes) both exceed GitHub's 100MB single-blob
limit uncompressed. ONNX weights are dense float data and don't compress
much (~84-85% of original size for these two; ~92% for the two small ones,
included for consistency, not necessity), but it's enough to clear the limit.
`table_structure_rpc.py` gunzips each into a local cache directory on first
use and reads the plain `.onnx` from there afterward.

**To update**: replace the relevant `.onnx.gz` here with a re-gzipped newer
version from the same upstream repo/tag above — no code changes needed,
`table_structure_rpc.py` reads whatever files are here by their fixed names.
