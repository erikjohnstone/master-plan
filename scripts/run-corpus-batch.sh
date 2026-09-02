#!/usr/bin/env bash
# One coordinator-owned batch: stage PDFs (if needed) → prewarm cache → emit takeoffs.
# Idempotent: emit uses --resume; prewarm skips already-cached graphs (fast hit).
#
# Usage:
#   ./scripts/run-corpus-batch.sh              # all phases
#   ./scripts/run-corpus-batch.sh --emit-only  # skip stage+prewarm (cache must exist)
#   SHARDS=2 ./scripts/run-corpus-batch.sh     # fewer parallel workers (less RAM)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MCP="$ROOT/opentakeoff/mcp"
OUT="$ROOT/opentakeoff/out"
CORPUS="$ROOT/opentakeoff-corpus"
LOG_DIR="${LOG_DIR:-/opt/cursor/artifacts}"
SHARDS="${SHARDS:-4}"
EMIT_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --emit-only) EMIT_ONLY=1 ;;
  esac
done

mkdir -p "$LOG_DIR" "$OUT"
export OPENTAKEOFF_TABLE_SIDECAR=0

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG_DIR/corpus-batch.log"; }

need_pdf() {
  node -e "
    const fs=require('fs');const path=require('path');
    const k=JSON.parse(fs.readFileSync('$CORPUS/takeoffs/cross-set-compile/001_NC_FY20_P_228_ATC_Tower_and_Air_Operations.compile.json'));
    process.exit(fs.existsSync(path.join('$CORPUS',k.source_file))?0:1);
  " 2>/dev/null
}

run_shard() {
  local phase="$1" script="$2"
  local pids=()
  for ((i=0; i<SHARDS; i++)); do
    local log="$LOG_DIR/corpus-${phase}-shard${i}.log"
    log "start ${phase} shard ${i}/${SHARDS} → $log"
    (cd "$MCP" && node --import tsx "$script" \
      --corpus "$CORPUS" \
      ${phase==emit:+--out "$OUT"} \
      ${phase==emit:+--resume} \
      --shard "${i}/${SHARDS}" \
      2>&1 | tee "$log") &
    pids+=($!)
  done
  local fail=0
  for pid in "${pids[@]}"; do
    wait "$pid" || fail=1
  done
  return "$fail"
}

log "=== corpus batch start (shards=$SHARDS emit_only=$EMIT_ONLY) ==="

if [[ "$EMIT_ONLY" -eq 0 ]]; then
  if ! need_pdf; then
    log "PDFs missing — running stage-bulk-corpus.sh (~2GB download, ~10 min)"
    "$ROOT/scripts/stage-bulk-corpus.sh" 2>&1 | tee "$LOG_DIR/stage-bulk-corpus.log"
  else
    log "PDFs present — skipping stage"
  fi

  log "=== prewarm phase (${SHARDS} shards, sidecar off) ==="
  if ! run_shard prewarm scripts/prewarm-corpus-graph.mjs; then
    log "ERROR: prewarm failed — see $LOG_DIR/corpus-prewarm-shard*.log"
    exit 1
  fi
  log "prewarm complete"
fi

log "=== emit phase (${SHARDS} shards, --resume) ==="
if ! run_shard emit scripts/emit-corpus-takeoff.mjs; then
  log "ERROR: emit failed — see $LOG_DIR/corpus-emit-shard*.log"
  exit 1
fi

count="$(ls "$OUT"/*.takeoff.json 2>/dev/null | wc -l | tr -d ' ')"
log "=== done: ${count}/116 takeoff files in $OUT ==="
echo "$count"
