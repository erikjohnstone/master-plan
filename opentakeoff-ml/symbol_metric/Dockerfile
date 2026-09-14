# Pinned training container for opentakeoff-ml/symbol_metric.
# Built for a RunPod Secure Cloud Pod (one NVIDIA GPU, >=24GB VRAM, e.g.
# RTX 4090). CUDA 12.4 matches recent RunPod PyTorch templates at time of
# writing (2026-09) -- confirm the current template tag in the RunPod
# console before deploying; do not assume this stays current indefinitely.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3.11 python3-pip python3.11-venv \
      qpdf tmux git curl ca-certificates zstd \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 && \
    ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /workspace/opentakeoff-symbol-metric-v1

COPY requirements.txt .
RUN python3 -m pip install --upgrade pip && \
    python3 -m pip install torch --index-url https://download.pytorch.org/whl/cu124 && \
    python3 -m pip install -r requirements.txt

COPY . .

ENTRYPOINT ["/bin/bash"]
