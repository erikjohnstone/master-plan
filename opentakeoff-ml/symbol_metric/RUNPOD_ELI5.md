# Open the RunPod website

This is a simple, complete recipe for producing a **first visual-pretraining
checkpoint**. You do not need to write Python. You will copy commands exactly
as shown.

Important first: this trains a model that ranks drawing regions by visual
similarity. It is **not** a model that is allowed to decide a takeoff quantity
or say that a plan symbol is correct without the existing citation and human
review workflow. The scripts deliberately keep those decisions out of the
model.

## What you are about to make

At the end you will have three files:

- `best.pt` — the trained PyTorch checkpoint;
- `evaluation_test.json` — honest, limited pretraining diagnostics; and
- `dinov2_vits14_symbol_metric_v1.onnx` — a portable inference file.

The model starts from Meta's pretrained DINOv2-S/14 visual encoder and learns
a 256-number “fingerprint” for a symbol crop. It is not DINOv2-from-scratch
training. Starting from the pretrained encoder is exactly why one GPU Pod can
do the job.

## 1. Make a GPU computer on RunPod

1. Open [RunPod](https://www.runpod.io/) and sign in.
2. Choose **Pods**, then **Deploy** / **Create Pod**.
3. Choose an NVIDIA GPU with **at least 24 GB of VRAM**. A 48 GB GPU will let
   you increase the batch size later, but is not required for this first run.
4. Pick RunPod's **official PyTorch** template. Do not pick a CPU-only image.
   The template provides a PyTorch/CUDA pair that matches the Pod GPU.
5. Give the Pod **at least 40 GB of persistent storage**. “Persistent” means
   your uploaded data and checkpoints stay when you stop the Pod. It is safer
   than a temporary disk.
6. Click **Deploy**. Wait until the Pod says it is running.

## 2. Copy the training data from your Mac to the Pod

You will do this part in the **Terminal app on your Mac**, not in RunPod.

1. In your RunPod Pod page, open **Connect**. You will see a line like:

   ```text
   ssh root@abc123.runpod.io -p 12345
   ```

   Copy the part after `root@` into `HOST`, and copy the number after `-p`
   into `PORT`. In this example, `HOST` is `abc123.runpod.io` and `PORT` is
   `12345`.
2. Copy and paste this whole command into Mac Terminal. Replace only the two
   ALL-CAPS words with your own HOST and PORT. Do not change the long folder
   path.

   ```sh
   curl -fsSL https://raw.githubusercontent.com/erikjohnstone/master-plan/codex/dinov2-metric-training-data/opentakeoff-ml/symbol_metric/scripts/upload_data_to_runpod.sh -o /tmp/upload_opentakeoff_data.sh && bash /tmp/upload_opentakeoff_data.sh --local-root "/Users/erikjohnstone/Documents/Codex/2026-09-06/i-x20/outputs/HVAC_BAS_RTDETR" --host YOUR_HOST --port YOUR_PORT --remote-root /workspace/HVAC_BAS_RTDETR
   ```

3. When it asks for an SSH password or key, use the method shown in RunPod's
   Connect panel. Do not paste a password, API key, or SSH private key into
   this chat.
4. Wait for the command to say `Upload complete`. It transfers roughly 2 GB.
   It sends only the 11 audited packs used by this model and the 11 MB manifest
   bundle—not the unrelated data you previously collected.

## 3. Open a terminal inside the Pod

Back in RunPod, click **Connect**, then open its web terminal (or Jupyter
terminal). Copy and paste these commands **one at a time**:

```sh
cd /workspace
git clone --branch codex/dinov2-metric-training-data --single-branch https://github.com/erikjohnstone/master-plan.git master-plan
cd /workspace/master-plan/opentakeoff-ml/symbol_metric
```

The first command goes to the large persistent drive. The second downloads the
training scripts. The third opens the exact folder that holds the scripts.

## 4. Check the Pod before spending GPU money

Paste this one command in the **RunPod terminal**:

```sh
bash scripts/bootstrap_runpod.sh --dataset /workspace/HVAC_BAS_RTDETR/DINOv2_METRIC_V1 --source-root /workspace/HVAC_BAS_RTDETR/TRAIN_NOW --hub-cache /workspace/dino-hub-cache
```

It does four things:

1. installs the small Python packages the scripts need;
2. confirms that CUDA and an NVIDIA GPU are actually visible;
3. checks every one of the 38,140 image records is present after upload; and
4. downloads the exact, pinned DINOv2-S/14 backbone and writes a receipt with
   its SHA-256 fingerprint.

Stop if it prints an error. A `CUDA is unavailable` error means the Pod was
created with the wrong template or GPU setting.

## 5. Do a two-batch smoke test first

This costs only a few minutes. It proves the data loader, DINO download, GPU,
loss, and checkpoint writing all work together. It does **not** make a usable
model.

```sh
bash scripts/smoke_train.sh /workspace/HVAC_BAS_RTDETR/DINOv2_METRIC_V1 /workspace/HVAC_BAS_RTDETR/TRAIN_NOW /workspace/dino-hub-cache /workspace/opentakeoff-symbol-metric-runs/smoke
```

You want the final line to say `Smoke training passed`.

## 6. Start the real training run

Paste this one command in the same RunPod terminal:

```sh
bash scripts/run_full_training.sh --dataset /workspace/HVAC_BAS_RTDETR/DINOv2_METRIC_V1 --source-root /workspace/HVAC_BAS_RTDETR/TRAIN_NOW --hub-cache /workspace/dino-hub-cache --run-dir /workspace/opentakeoff-symbol-metric-runs/v1
```

The script runs 20 epochs by default. It does this in order:

1. reads an original drawing crop twice and applies two slightly different,
   safe render variations;
2. trains the shared DINOv2-S/14 encoder plus a small 256-dimensional head to
   keep those two views close together;
3. adds a clearly-labelled *weak* source-class helper loss; it is a helpful
   warm-up signal, not ground truth;
4. writes `last.pt` after every epoch and preserves the lowest-validation-loss
   checkpoint as `best.pt`;
5. runs held-out **source-label** diagnostics on the test split; and
6. exports `best.pt` to ONNX.

It includes the requested stretched-symbol work safely: non-directional
symbols get up to 14% independent horizontal/vertical stretch; directional
symbols (valves, actuators, instruments) are restricted to 6%. The script
never rotates or mirrors a symbol, because that could change what it means.

If the Pod disconnects, your files remain on the persistent drive. Reconnect
and inspect `/workspace/opentakeoff-symbol-metric-runs/v1/last.pt`. To continue
the same run, use the same command with this added at the end:

```sh
--resume /workspace/opentakeoff-symbol-metric-runs/v1/last.pt
```

`EPOCHS` means the total desired number of epochs, not the number of extra
epochs. For example, a run interrupted after epoch 7 should resume with the
same default `EPOCHS=20`; it will start at epoch 8 and end at epoch 19.

## 7. Confirm it finished and download the useful files

In the RunPod terminal, paste:

```sh
ls -lh /workspace/opentakeoff-symbol-metric-runs/v1
cat /workspace/opentakeoff-symbol-metric-runs/v1/evaluation_test.json
```

You should see:

- `TRAINING_COMPLETE.txt`
- `best.pt`
- `last.pt`
- `evaluation_test.json`
- `dinov2_vits14_symbol_metric_v1.onnx`
- `dinov2_vits14_symbol_metric_v1.onnx.json`

Use RunPod's file browser or its documented download/SSH method to download
`best.pt`, `evaluation_test.json`, and the two ONNX files to a safe place on
your Mac. Then stop the Pod when you are not using it, so you stop paying for
GPU time. Keep its persistent disk until the files are safely downloaded.

## What “good” means—and what it does not mean

`evaluation_test.json` reports two-view similarity and source-local semantic
retrieval. A healthy value means the pipeline trained and the representation
is learning something from the image corpus. It does **not** prove that the
model can identify a symbol on a new project, follow a leader line, or count
installed equipment.

Before this is allowed anywhere near production, the next required gate is a
separate human-reviewed, project-held-out legend-to-plan benchmark. That test
must measure recall, false-positive rate, calibration, latency, and whether a
human can inspect the tag, physical symbol, legend reference, and source page.
The existing citation and approval workflow remains the authority.

## If you want a bigger run later

On a 48 GB GPU, increase `BATCH_SIZE` carefully after the first run works:

```sh
EPOCHS=30 BATCH_SIZE=64 WORKERS=8 bash scripts/run_full_training.sh --dataset /workspace/HVAC_BAS_RTDETR/DINOv2_METRIC_V1 --source-root /workspace/HVAC_BAS_RTDETR/TRAIN_NOW --hub-cache /workspace/dino-hub-cache --run-dir /workspace/opentakeoff-symbol-metric-runs/v2
```

Do this as a new folder (`v2`), never over the first `v1` run. Bigger is not
automatically better; compare the separate, reviewed holdout benchmark before
choosing a checkpoint.
