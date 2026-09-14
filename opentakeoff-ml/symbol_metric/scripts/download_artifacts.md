# Retrieving the release bundle from a RunPod Pod

After `scripts/run_full_pipeline.sh` finishes on the Pod:

```bash
cd /workspace/opentakeoff-symbol-metric-v1/artifacts
tar -I 'zstd -19' -cf symbol-metric-release-candidate.tar.zst release-candidate
runpodctl send symbol-metric-release-candidate.tar.zst
```

`runpodctl send` prints a one-time receive code. On the machine driving the
Pod:

```bash
runpodctl receive THE-CODE-PRINTED-BY-THE-POD
```

Then verify before trusting anything in the archive:

```bash
tar -I 'zstd -d' -xf symbol-metric-release-candidate.tar.zst
cd release-candidate
sha256sum -c checksums.txt
```

Do not delete the Pod/volume until `checksums.txt` verifies cleanly against
the downloaded archive -- RunPod storage is not a backup target (see
SYMBOL-METRIC-MODEL-PRODUCTION-PLAN.md's RunPod section).
