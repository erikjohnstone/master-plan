# Symbol-grounding ground truth

This directory stores human-reviewed evidence that an exact printed plan tag is
attached to one specific physical drawing object. It is deliberately separate
from schedule extraction and from symbol-sweep count ground truth.

## Required review rule

Every case must be authored from a rendered source page. Shared production
output may propose a location, but it may not define its own expected answer.
The reviewer must independently identify:

- the exact printed tag bbox;
- the complete physical-object bbox, excluding tag glyphs and unrelated
  linework;
- the semantic association route (`authored_leader`, `equipment_envelope`, or
  `legend_symbol`);
- nearby plausible-but-wrong bodies as prohibited false accepts; and
- whether the object is safely countable, ambiguous, or intentionally
  unresolved.

Coordinates are in `Session.renderSheetPng` image pixels. Source PDF hashes are
mandatory. A changed hash invalidates the review.

## Version 1 positive document

```json
{
  "schema": "opentakeoff.symbol_grounding_ground_truth.v1",
  "source": "raw/example.pdf",
  "source_sha256": "64 lowercase hex characters",
  "coordinate_space": "session_render_image_px",
  "session_page_size_px": [4896, 3168],
  "bbox_tolerance_px": 2,
  "cases": [],
  "review": {
    "method": "rendered source pages ...",
    "status": "human_reviewed_positive_and_negative_controls",
    "date": "YYYY-MM-DD"
  }
}
```

Each positive case requires `pdf_page`, `tag`, `equipment_family`,
`prefer_schedule_title`, `tag_bbox_image_px`,
`expected_symbol_bbox_image_px`, `expected_semantic_method`, and a plain-language
`review_note`. `prohibited_false_symbol_bboxes_image_px` is required whenever a
plausible local distractor exists. A case may not use the tag bbox itself as the
symbol bbox.

## Version 2 refusal case

Version 2 adds an explicit `expected_outcome`. A `grounded` case has the same
requirements as version 1. An `unresolved` case proves that the exact tag is
present but automatic production grounding must refuse because the current
evidence cannot establish the physical body without guessing. A `tag_absent`
case records a human-reviewed schedule item that has no separately drawn plan
tag and must never borrow a served-equipment tag or nearby linework. The
reviewer may record `reviewed_symbol_bbox_image_px` for an unresolved case as a
diagnostic target; it is not an accepted production match. Any automatic body
returned for either refusal case is scored as a false acceptance.

```json
{
  "schema": "opentakeoff.symbol_grounding_ground_truth.v2",
  "cases": [{
    "expected_outcome": "unresolved",
    "tag": "RTU1-2-H",
    "tag_bbox_image_px": [0, 0, 1, 1],
    "reviewed_symbol_bbox_image_px": [2, 2, 3, 3]
  }]
}
```

## Dataset split and strata

Splits are by source project, never by tag instance. Repeated devices from one
sheet cannot be divided across train/development and held-out evaluation.
Coverage is tracked in `manifest.json` for equipment envelopes, authored
leaders, inline pipe/duct devices, legend-transferred glyphs,
instruments/sensors, dense repeats, sparse equipment, and ambiguous/no-body
negatives.

Synthetic tests are useful implementation regressions, but they never increase
the reviewed real-PDF case count.
