# Vendored tesseract.js language data

`eng.traineddata.gz` — English OCR language model, vendored here so the L4.5
OCR-assist path (`mcp/src/session.ts`'s `ocrScheduleRegion`, gated behind
`OPENTAKEOFF_PIPELINE_OCR=1`) never needs a runtime network fetch.

**Why this exists**: tesseract.js's default configuration fetches this file
from a CDN (`cdn.jsdelivr.net/npm/@tesseract.js-data/...`) the first time OCR
runs. In this project's sandboxed dev environment that fetch returns HTTP 403
— confirmed directly, a raw `Tesseract.recognize()` call throws "Network
error while fetching...". Whether that specific failure is sandbox-only is
unconfirmed, but a runtime CDN dependency for OCR is fragile for any real
customer behind a restrictive corporate outbound proxy regardless — vendoring
removes the dependency entirely.

**Source**: `4.0.0_best_int` English traineddata from the `naptha/tessdata`
repository (the same upstream data tesseract.js's own package depends on),
fetched from its GitHub Pages mirror. Apache License 2.0, same as
Tesseract/tessdata upstream.

**To update**: replace `eng.traineddata.gz` with a newer version from
https://github.com/naptha/tessdata (pick the same `4.0.0_best_int` tier
tesseract.js's own `TESSDATA_PATH` default points at, unless intentionally
upgrading) — no code changes needed, `ocrScheduleRegion` reads whatever file
is here.
