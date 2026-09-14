#!/usr/bin/env bash
# Copy only the audited source-native inputs needed by DINOv2_METRIC_V1.
# Run this on your Mac, not inside the Pod. It uses your RunPod SSH host/port.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage (run on your Mac):
  bash scripts/upload_data_to_runpod.sh \
    --local-root /absolute/path/to/HVAC_BAS_RTDETR \
    --host SSH_HOST_FROM_RUNPOD \
    --port SSH_PORT_FROM_RUNPOD \
    --remote-root /workspace/HVAC_BAS_RTDETR

The RunPod Connect panel shows the SSH host and port. This script prompts for
the normal root password/key if your Pod requires one. It copies the 11 source
packs named by required_input_paths.txt and DINOv2_METRIC_V1, not unrelated
RT-DETR packs.
EOF
}

LOCAL_ROOT=""
HOST=""
PORT=""
REMOTE_ROOT="/workspace/HVAC_BAS_RTDETR"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --local-root) LOCAL_ROOT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --remote-root) REMOTE_ROOT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
if [[ -z "$LOCAL_ROOT" || -z "$HOST" || -z "$PORT" ]]; then
  usage >&2
  exit 2
fi
if [[ ! -f "$LOCAL_ROOT/DINOv2_METRIC_V1/required_input_paths.txt" ]]; then
  echo "Cannot find DINOv2_METRIC_V1/required_input_paths.txt below $LOCAL_ROOT" >&2
  exit 3
fi
if ! command -v rsync >/dev/null || ! command -v ssh >/dev/null; then
  echo "This Mac needs both rsync and ssh (both are built into normal macOS)." >&2
  exit 4
fi

TARGET="root@$HOST"
SSH=(ssh -p "$PORT")
RSYNC=(rsync -a --info=progress2 -e "ssh -p $PORT")
"${SSH[@]}" "$TARGET" "mkdir -p '$REMOTE_ROOT/TRAIN_NOW'"
"${RSYNC[@]}" "$LOCAL_ROOT/DINOv2_METRIC_V1" "$TARGET:$REMOTE_ROOT/"
while IFS= read -r relative; do
  [[ -z "$relative" || "$relative" == \#* ]] && continue
  pack="${relative#TRAIN_NOW/}"
  if [[ ! -d "$LOCAL_ROOT/TRAIN_NOW/$pack" ]]; then
    echo "Missing required pack on this Mac: $LOCAL_ROOT/TRAIN_NOW/$pack" >&2
    exit 5
  fi
  "${RSYNC[@]}" "$LOCAL_ROOT/TRAIN_NOW/$pack" "$TARGET:$REMOTE_ROOT/TRAIN_NOW/"
done < "$LOCAL_ROOT/DINOv2_METRIC_V1/required_input_paths.txt"
echo "Upload complete: $TARGET:$REMOTE_ROOT"
