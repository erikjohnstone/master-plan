#!/usr/bin/env python3
"""Which corpus sets are not independent of the frozen dev / held-out split.

Work that reads "the rest of the corpus" (robustness sweeps, blind audits on
unseen documents) must never read a held-out document under another corpus
id, and must not count a copy of a dev document as unseen. The split
(`reports/assemblies/01-split.json`) was drawn from the 17 documents staged
on 2026-09-23; the corpus now stages 121 sets, and some are the same drawings
under other ids. This report finds them from the input PDFs alone (it runs no
pipeline, so it reads no output of any held-out document):

- **twin:** a set whose PDF is byte-identical (sha256) to a split document's;
- **near:** a set sharing >= 15% of its printed 8-word shingles with a split
  document (the share of the smaller document's shingles, 1 in 8 sampled);
- **drafter:** a set whose text names the firm that drafted a held-out
  document (`reports/assemblies/drafters.json`; the split keeps one drafter's
  documents on one side, so tuning on such a set would tune on a held-out
  drafter's style);
- **duplicate / derived:** a copy drafters.json already records (a derived
  rendition with no text layer is found by no other test).

Requires PyMuPDF and numpy (the sidecar's virtualenv has both):

    opentakeoff/.venv-sidecar/bin/python opentakeoff/mcp/scripts/corpus-hygiene.py \
        opentakeoff-corpus [--report]

`--report` writes reports/control-intent/00-corpus-hygiene.{json,md}.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import zlib
from pathlib import Path

import fitz  # PyMuPDF
import numpy as np

WORD = re.compile(r"[A-Z0-9]{2,}")
NEAR = 0.15
MAX_PAGES = 300
# The printed name of each held-out drafter group's firm, as its title
# blocks print it (reports/assemblies/drafters.json quotes the evidence).
FIRM_TEXT = {
    "burns-mcdonnell": r"BURNS\s*(?:&|AND)?\s*MC\s*DONNELL",
    "coffman-engineers": r"COFFMAN\s+ENGINEERS",
    "crockett-engineering": r"CROCKETT\s+ENGINEERING|TIMBERLAKE\s+ENGINEERING",
    "up-engineers-architects": r"U\.?\s*P\.?\s+ENGINEERS",
    "usda-ars-southeast-area": r"SOUTHEAST\s+AREA|STONEVILLE",
}


def resolve_files(corpus: Path, spec: dict, entry: dict) -> list[Path]:
    """The set's PDFs, tried in the order mcp/scripts/corpusFiles.mjs tries
    them: the recorded roots, the corpus's own folders, then each recorded
    root re-anchored by its last 1-3 segments onto the corpus's parent."""
    recorded = [r for r in (entry.get("root"), spec.get("root")) if r]
    bulk = corpus / "bulk"
    roots = [Path(r) for r in recorded] + [
        corpus / "raw", corpus,
        bulk / "HVAC_BAS_Plan_Sets", bulk / "HVAC_BAS_Plan_Sets" / "_rejoined",
        bulk / "HVAC_BAS_Plan_Sets_Vol2", bulk / "HVAC_BAS_Plan_Sets_Vol2" / "_rejoined",
    ]
    for r in recorded:
        segs = [s for s in re.split(r"[\\/]+", r) if s]
        for k in range(1, min(3, len(segs)) + 1):
            roots.append(corpus.parent.joinpath(*segs[len(segs) - k:]))
    out = []
    for name in entry["files"]:
        hit = next((root / name for root in roots if (root / name).exists()), None)
        if hit is not None:
            out.append(hit)
    return out


def scan(paths: list[Path], firms: dict[str, str]) -> tuple[list[str], np.ndarray, dict[str, int]]:
    hashes, grams, named = [], [], {}
    for p in paths:
        hashes.append(hashlib.sha256(p.read_bytes()).hexdigest())
        doc = fitz.open(p)
        tail: list[str] = []
        for i, page in enumerate(doc):
            if i >= MAX_PAGES:
                break
            text = page.get_text().upper()
            flat = re.sub(r"\s+", " ", text)
            for group, rx in firms.items():
                if re.search(rx, flat):
                    named[group] = named.get(group, 0) + 1
            words = tail + WORD.findall(text)
            for j in range(max(0, len(words) - 7)):
                s = " ".join(words[j:j + 8]).encode()
                h = zlib.crc32(s) | (zlib.adler32(s) << 32)
                if h % 8 == 0:
                    grams.append(h)
            tail = words[-7:]
        doc.close()
    return hashes, np.unique(np.array(grams, dtype=np.uint64)), named


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 2
    corpus = Path(args[0]).resolve()
    spec = json.loads((corpus / "sets.json").read_text())
    split = json.loads((corpus / "reports" / "assemblies" / "01-split.json").read_text())
    drafters = json.loads((corpus / "reports" / "assemblies" / "drafters.json").read_text())
    role = {**{s: "dev" for s in split["dev"]["sets"]}, **{s: "heldout" for s in split["heldout"]["sets"]}}
    held_groups = {g for g, v in drafters["groups"].items() if any(s in role and role[s] == "heldout" for s in v["sets"])}
    firms = {g: rx for g, rx in FIRM_TEXT.items() if g in held_groups}
    missing = sorted(held_groups - set(firms))
    if missing:
        print(f"no printed firm text for held-out drafter groups: {', '.join(missing)}", file=sys.stderr)
        return 2

    seen: dict[str, tuple[list[str], np.ndarray, dict[str, int]]] = {}
    for entry in spec["sets"]:
        paths = resolve_files(corpus, spec, entry)
        if not paths:
            print(f"{entry['id']}: no PDF found", file=sys.stderr)
            continue
        seen[entry["id"]] = scan(paths, firms)

    rows = []
    split_ids = [s for s in seen if s in role]
    for other, (hashes, grams, named) in seen.items():
        if other in role:
            continue
        for sid in split_ids:
            s_hashes, s_grams, _ = seen[sid]
            if set(hashes) & set(s_hashes):
                rows.append({"set": other, "relation": "twin", "of": sid, "side": role[sid], "share": 1.0})
                continue
            if len(grams) < 50 or len(s_grams) < 50:
                continue
            share = len(np.intersect1d(grams, s_grams, assume_unique=True)) / min(len(grams), len(s_grams))
            if share >= NEAR:
                rows.append({"set": other, "relation": "near", "of": sid, "side": role[sid], "share": round(share, 2)})
        for group, pages in sorted(named.items()):
            rows.append({"set": other, "relation": "drafter", "of": group, "side": "heldout", "pages": pages})
    # Copies drafters.json already records (a derived rendition has no text
    # layer to compare: "itd-d1-lab-raster").
    for relation, entries in (("duplicate", drafters.get("duplicates", {})), ("derived", drafters.get("derived", {}))):
        for other, v in entries.items():
            of = v.get("duplicate_of") or v.get("derived_from")
            if other in seen and of in role and not any(r["set"] == other and r["of"] == of for r in rows):
                rows.append({"set": other, "relation": relation, "of": of, "side": role[of], "share": "drafters.json"})

    # The split itself: a dev document sharing drawings with a held-out one
    # would leak held-out content into tuning.
    split_pairs = []
    for d in [s for s in split_ids if role[s] == "dev"]:
        for h in [s for s in split_ids if role[s] == "heldout"]:
            (dh, dg, _), (hh, hg, _) = seen[d], seen[h]
            share = 1.0 if set(dh) & set(hh) else (
                len(np.intersect1d(dg, hg, assume_unique=True)) / min(len(dg), len(hg)) if len(dg) >= 50 and len(hg) >= 50 else 0.0)
            if share >= NEAR:
                split_pairs.append({"dev": d, "heldout": h, "share": round(share, 2)})

    held_twins = sorted({r["set"] for r in rows if r["side"] == "heldout" and r["relation"] in ("twin", "duplicate", "derived")})
    held_drafter = sorted({r["set"] for r in rows if r["relation"] == "drafter"} - set(held_twins))
    dev_like = sorted({r["set"] for r in rows if r["side"] == "dev"} - set(held_twins) - set(held_drafter))
    summary = {
        "scanned": len(seen),
        "not_unseen": {"heldout_twin": held_twins, "heldout_drafter": held_drafter, "dev_twin_or_near": dev_like},
        "split_dev_heldout_overlaps": split_pairs,
        "rows": sorted(rows, key=lambda r: (r["side"], r["relation"], r["set"])),
    }
    lines = [
        "# Corpus hygiene: sets that are not independent of the dev / held-out split",
        "",
        f"`opentakeoff/mcp/scripts/corpus-hygiene.py` over {len(seen)} corpus sets (input PDFs only; no pipeline output).",
        "",
        f"- **Held-out twin (never read):** {', '.join(f'`{s}`' for s in held_twins) or 'none'}",
        f"- **Held-out drafter (never tuned on):** {', '.join(f'`{s}`' for s in held_drafter) or 'none'}",
        f"- **Dev twin or near copy (counts as dev, never as unseen):** {', '.join(f'`{s}`' for s in dev_like) or 'none'}",
        f"- **Dev and held-out documents sharing printed text (>= {NEAR:.0%}):** "
        + (", ".join(f"`{p['dev']}` / `{p['heldout']}` ({p['share']})" for p in split_pairs) or "none"),
        "",
        "| Set | Relation | Of | Side | Share / pages |",
        "|---|---|---|---|---|",
    ]
    for r in summary["rows"]:
        lines.append(f"| `{r['set']}` | {r['relation']} | `{r['of']}` | {r['side']} | {r.get('share', r.get('pages'))} |")
    text = "\n".join(lines) + "\n"
    print(text)
    if "--report" in argv:
        out = corpus / "reports" / "control-intent"
        (out / "00-corpus-hygiene.json").write_text(json.dumps(summary, indent=1) + "\n")
        (out / "00-corpus-hygiene.md").write_text(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
