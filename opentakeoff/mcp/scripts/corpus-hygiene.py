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
  drafter's style), or that drafters.json itself places in a held-out
  drafter's group: a firm printed only as an image has no text to find, and
  is named from a render of the title block;
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
# blocks print it (reports/assemblies/drafters.json quotes the evidence), and
# its web address: a title block whose firm logo is an image carries only the
# address in its text layer (038_NC prints the Coffman Engineers logo as an
# image and "www.coffman.com" as text, on every sheet).
FIRM_TEXT = {
    "burns-mcdonnell": r"BURNS\s*(?:&|AND)?\s*MC\s*DONNELL|BURNSMCD\.COM",
    "coffman-engineers": r"COFFMAN\s+ENGINEERS|COFFMAN\.COM",
    "crockett-engineering": r"CROCKETT\s+ENGINEERING|TIMBERLAKE\s+ENGINEERING",
    "up-engineers-architects": r"U\.?\s*P\.?\s+ENGINEERS",
    "usda-ars-southeast-area": r"SOUTHEAST\s+AREA|STONEVILLE",
    # The second tier's held-out drafters (reports/assemblies/tier2/01-split.json).
    "elara-engineering": r"\bELARA\b",
    "glumac": r"GLUMAC",
    "johnsondanforth": r"JOHNSON\s*DANFORTH",
    "mes-group": r"\bMES\s+GROUP\b",
    "toland-mizell-molnar": r"TOLAND\s+MIZELL|MIZELL\s+MOLNAR",
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
    # The second tier (AS-17), once drawn: dev 2 is dev and held-out 2 is
    # held-out here too, so their copies and drafters are found the same way.
    tier2_path = corpus / "reports" / "assemblies" / "tier2" / "01-split.json"
    if tier2_path.exists():
        tier2 = json.loads(tier2_path.read_text())
        role.update({s: "dev" for s in tier2["dev"]["sets"]})
        role.update({s: "heldout" for s in tier2["heldout"]["sets"]})
    # The third tier (AS-17) is dev only.
    tier3_path = corpus / "reports" / "assemblies" / "tier3" / "01-split.json"
    if tier3_path.exists():
        role.update({s: "dev" for s in json.loads(tier3_path.read_text())["dev"]["sets"]})
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
    # A held-out drafter's document that drafters.json names from a render of
    # its title block (the firm printed as an image, with no text form).
    for group in sorted(held_groups):
        for other in drafters["groups"][group]["sets"]:
            if other in seen and other not in role and not any(r["set"] == other and r["relation"] == "drafter" for r in rows):
                rows.append({"set": other, "relation": "drafter", "of": group, "side": "heldout", "pages": "drafters.json"})
    # Copies drafters.json already records (a derived rendition has no text
    # layer to compare: "itd-d1-lab-raster").
    for relation, entries in (("duplicate", drafters.get("duplicates", {})), ("derived", drafters.get("derived", {}))):
        for other, v in entries.items():
            of = v.get("duplicate_of") or v.get("derived_from")
            if other in seen and of in role and not any(r["set"] == other and r["of"] == of for r in rows):
                rows.append({"set": other, "relation": relation, "of": of, "side": role[of], "share": "drafters.json"})
            elif other in seen and of in seen and of not in role:
                # A copy of another unseen set: the original counts, once.
                rows.append({"set": other, "relation": relation, "of": of, "side": "unseen", "share": "drafters.json"})

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
    unseen_copies = sorted({r["set"] for r in rows if r["side"] == "unseen"} - set(held_twins) - set(held_drafter) - set(dev_like))
    summary = {
        "scanned": len(seen),
        "not_unseen": {"heldout_twin": held_twins, "heldout_drafter": held_drafter, "dev_twin_or_near": dev_like, "unseen_copy": unseen_copies},
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
        f"- **Copy of another unseen set (the original counts, once):** {', '.join(f'`{s}`' for s in unseen_copies) or 'none'}",
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
