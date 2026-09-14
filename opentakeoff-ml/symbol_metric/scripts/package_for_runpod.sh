#!/usr/bin/env bash
# Package code + pinned deps + the crop/annotation dataset + manifests +
# hashes into one archive for RunPod, WITHOUT any raw PDF (per the goal
# doc: "Do not upload raw PDFs to RunPod by default"). Pass --allow-raw-pdf
# only after rights/sensitivity have been explicitly confirmed for every
# source family included.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALLOW_RAW_PDF=0
if [[ "${1:-}" == "--allow-raw-pdf" ]]; then
  ALLOW_RAW_PDF=1
fi

mkdir -p dist
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
PKG_NAME="opentakeoff-symbol-metric-v1"
PKG_DIR="$STAGE/$PKG_NAME"
mkdir -p "$PKG_DIR"

cp -r src schemas configs scripts requirements.txt Dockerfile \
  README.md DATASET_CARD.md MODEL_CARD_TEMPLATE.md LICENSE_PROVENANCE.md TASK_SPEC.md \
  "$PKG_DIR"/ 2>/dev/null || true
mkdir -p "$PKG_DIR/tests"
cp -r tests/* "$PKG_DIR/tests"/ 2>/dev/null || true
mkdir -p "$PKG_DIR/reports"
cp reports/*.json reports/*.md "$PKG_DIR/reports"/ 2>/dev/null || true

mkdir -p "$PKG_DIR/data/manifests"
cp -r data/manifests/* "$PKG_DIR/data/manifests"/ 2>/dev/null || true
if [[ -d data/export ]]; then
  mkdir -p "$PKG_DIR/data/export"
  cp -r data/export/* "$PKG_DIR/data/export"/
fi
if [[ -d data/reviewed ]]; then
  mkdir -p "$PKG_DIR/data/reviewed"
  cp -r data/reviewed/* "$PKG_DIR/data/reviewed"/
fi

if [[ "$ALLOW_RAW_PDF" == "1" ]]; then
  echo "WARNING: --allow-raw-pdf set -- packaging raw source PDFs. Confirm rights/sensitivity first."
  mkdir -p "$PKG_DIR/opentakeoff-corpus-raw"
  # left as an explicit manual step: copy only the specific, rights-cleared
  # source PDFs here before running with --allow-raw-pdf.
fi

# Hash-seal everything in the package.
(
  cd "$PKG_DIR"
  find . -type f ! -name checksums.txt -exec sha256sum {} \; | sed 's#\./##' > checksums.txt
)

ARCHIVE="dist/${PKG_NAME}.tar.zst"
if command -v zstd >/dev/null 2>&1; then
  tar -C "$STAGE" -cf - "$PKG_NAME" | zstd -19 -T0 -o "$ARCHIVE"
else
  ARCHIVE="dist/${PKG_NAME}.tar.gz"
  tar -C "$STAGE" -czf "$ARCHIVE" "$PKG_NAME"
fi

echo "wrote $ARCHIVE"
du -sh "$ARCHIVE"
echo "contains no raw PDFs unless --allow-raw-pdf was passed with pre-approved sources"
