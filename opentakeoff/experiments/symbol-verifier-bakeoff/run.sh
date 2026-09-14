#!/usr/bin/env bash
# One documented command to run the complete Symbol Verifier Bakeoff.
# Completely isolated under opentakeoff/experiments/symbol-verifier-bakeoff/
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKSPACE_ROOT="$( cd "$DIR/../../../.." && pwd )"

echo "=== Symbol Verifier Bakeoff Runner ==="
echo "Working directory: $DIR"
echo "Workspace root:    $WORKSPACE_ROOT"

# Check virtual environment
if [ ! -d "$DIR/.venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$DIR/.venv"
    source "$DIR/.venv/bin/activate"
    pip install --upgrade pip
    pip install torch torchvision --extra-index-url https://download.pytorch.org/whl/cpu
    pip install opencv-python onnxruntime pymupdf numpy pillow
else
    source "$DIR/.venv/bin/activate"
fi

export PYTHONPATH="$DIR:$WORKSPACE_ROOT"

echo ""
echo "--- Running Required Safeguards & Tests ---"
python3 "$DIR/tests/test_safeguards.py"

echo ""
echo "--- Running Head-to-Head Bakeoff ---"
python3 "$DIR/run_bakeoff.py"
