#!/usr/bin/env bash
# Stage Vol1 + Vol2 HVAC/BAS bulk plan-set PDFs under opentakeoff-corpus/bulk/
# (gitignored). Idempotent: skips download when both trees already look complete.
#
# Sources (public Google Drive file links from the corpus curator):
#   Vol1  ~552MB  https://drive.google.com/file/d/1cDMOhgm6Ts_LIVm_AwIDKNzRoQmVz5Ma
#   Vol2  ~1.1GB  https://drive.google.com/file/d/1HGWFUwHpNbI_8wEloYRyhMwCcOEbjCEE
#
# Usage:
#   ./scripts/stage-bulk-corpus.sh           # download if missing, rejoin multipart
#   FORCE=1 ./scripts/stage-bulk-corpus.sh   # re-download even if present
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BULK="$ROOT/opentakeoff-corpus/bulk"
VOL1_ID="1cDMOhgm6Ts_LIVm_AwIDKNzRoQmVz5Ma"
VOL2_ID="1HGWFUwHpNbI_8wEloYRyhMwCcOEbjCEE"
VOL1_DIR="$BULK/HVAC_BAS_Plan_Sets"
VOL2_DIR="$BULK/HVAC_BAS_Plan_Sets_Vol2"
TMP="${TMPDIR:-/tmp}/ot-bulk-stage-$$"

export PATH="${HOME}/.local/bin:${PATH}"

need_gdown() {
  if ! command -v gdown >/dev/null 2>&1; then
    python3 -m pip install -q gdown
  fi
  command -v gdown >/dev/null 2>&1 || {
    echo "gdown not on PATH after install" >&2
    exit 1
  }
}

need_qpdf() {
  if command -v qpdf >/dev/null 2>&1; then
    return 0
  fi
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq qpdf
  else
    echo "qpdf required for multipart rejoin" >&2
    exit 1
  fi
}

download_zip() {
  local id="$1" out="$2" i
  for i in 1 2 3 4; do
    if gdown "$id" -O "$out"; then
      return 0
    fi
    echo "gdown failed (attempt $i); sleeping $((4 * i))s" >&2
    sleep $((4 * i))
  done
  echo "gdown failed for $id" >&2
  exit 1
}

stage_vol() {
  local id="$1" name="$2" dest="$3"
  if [[ -z "${FORCE:-}" && -d "$dest" && -f "$dest/INDEX.md" ]]; then
    echo "keep $dest (INDEX.md present; FORCE=1 to refresh)"
    return 0
  fi
  need_gdown
  mkdir -p "$TMP" "$BULK"
  local zip="$TMP/${name}.zip"
  echo "download $name → $zip"
  download_zip "$id" "$zip"
  rm -rf "$dest"
  local extract="$TMP/${name}-extract"
  rm -rf "$extract"
  mkdir -p "$extract"
  unzip -qo "$zip" -x '__MACOSX/*' '*.DS_Store' -d "$extract"
  local extracted
  extracted="$(find "$extract" -mindepth 1 -maxdepth 1 -type d | head -1)"
  if [[ -z "$extracted" ]]; then
    echo "zip $zip had no top-level directory" >&2
    exit 1
  fi
  mv "$extracted" "$dest"
  rm -f "$zip"
  echo "staged $dest"
}

rejoin_vol() {
  local dest="$1"
  local script="$dest/REJOIN_full_sets.sh"
  if [[ ! -f "$script" ]]; then
    echo "no REJOIN_full_sets.sh in $dest — skip"
    return 0
  fi
  need_qpdf
  (cd "$dest" && bash ./REJOIN_full_sets.sh)
}

mkdir -p "$BULK"
stage_vol "$VOL1_ID" "vol1" "$VOL1_DIR"
stage_vol "$VOL2_ID" "vol2" "$VOL2_DIR"
rejoin_vol "$VOL1_DIR"
rejoin_vol "$VOL2_DIR"
rm -rf "$TMP"

ROOT="$ROOT" python3 - <<'PY'
import glob, json, os
from pathlib import Path

root = Path(os.environ["ROOT"])
corpus = root / "opentakeoff-corpus"
missing = []
present = 0
for path in glob.glob(str(corpus / "takeoffs/cross-set-compile/*.compile.json")):
    data = json.load(open(path))
    sf = data.get("source_file") or ""
    if not sf.startswith("bulk/"):
        continue
    full = corpus / sf
    if full.exists():
        present += 1
    else:
        missing.append(sf)
print(f"bulk key PDFs present={present} missing={len(missing)}")
for m in missing[:20]:
    print(" missing", m)
raise SystemExit(1 if missing else 0)
PY

echo "bulk corpus ready under $BULK"
du -sh "$VOL1_DIR" "$VOL2_DIR"
