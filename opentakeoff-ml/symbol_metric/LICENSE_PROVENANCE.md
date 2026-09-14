# License / provenance ledger

## Base model weights

- **`facebook/dinov2-small`** (`dinov2_vits14`) -- Apache-2.0. Meta AI.
  https://github.com/facebookresearch/dinov2/blob/main/MODEL_CARD.md
  Fetched via `transformers` from Hugging Face Hub (`huggingface.co`, reachable
  from this session; `download.pytorch.org` is not -- see below).
- **`convnext_tiny`** (timm) -- weights are `timm`'s own default pretrained
  tag (ImageNet-1k), Apache-2.0-licensed release of the ConvNeXt weights
  (Facebook Research, `facebookresearch/ConvNeXt`, Apache-2.0-licensed
  repository; timm redistributes under the same terms it documents per-model).
  Confirm the exact timm-reported license string for the resolved weight tag
  at training time (`timm.create_model(..., pretrained=True)` logs the
  source) and record it here before shipping a ConvNeXt release candidate.

## Training data provenance

Every training record traces to a `source_pdf_sha256` and
`source_pdf_relative_path` recorded in `reports/CORPUS_INVENTORY.json` and
carried through every exported crop's manifest row. Per-source-family
provenance notes (download date, hosting pattern, redistribution caveat) are
inherited from `opentakeoff-corpus/sets.json` and `opentakeoff-corpus/bulk/
HVAC_BAS_Plan_Sets{,_Vol2}/INDEX.md` -- both are read-only inputs to this
package, never modified by it.

**Standing caveat inherited from `sets.json`**, applying to every non-Bessemer
source family used here: these are publicly posted competitive-bid
construction drawing sets. Posting for bidding does not itself grant a
general redistribution license; the private AE firm typically retains
copyright. This package therefore:

- keeps every raw source PDF local (`opentakeoff-corpus/raw/`,
  `opentakeoff-corpus/bulk/`) -- never bundled into a RunPod upload by
  default (`scripts/package_for_runpod.sh` requires an explicit
  `--allow-raw-pdf` flag and pre-confirmed rights per source);
  file names embed a project's own descriptive title, and rendered crops are
  small excerpts (a symbol + immediate context), not full-sheet reproductions;
- treats "training-data use" here as internal model development, not
  redistribution of the drawings themselves. Before any wider release of
  crops/renders (not just model weights) beyond this internal training
  package, re-confirm rights per source family with the repository owner.

## Corpus recovery note

The 113-source-family bulk archive (`HVAC_BAS_Plan_Sets.zip` /
`HVAC_BAS_Plan_Sets_Vol2.zip`) was recovered this session from
`https://github.com/erikjohnstone/master-plan/releases/{corpus,corpus_2}` --
the repository owner's own GitHub Releases, not a third party. This is the
same archive the (gitignored, Google-Drive-based)
`scripts/stage-bulk-corpus.sh` targets; Drive was unreachable under this
session's egress policy, GitHub Releases was not.
