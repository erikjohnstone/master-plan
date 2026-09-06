"""Validate authored audit assertions against two retained raw PDF captures.

Shared-path decision: checks reference annotations; does not discover schedules,
infer equipment, count plan symbols, or replace production Session truth logic.
Passing proves only the checks described in the resulting report.
"""
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "ground_truth"


def digest(p):
    with p.open("rb") as s:
        return hashlib.file_digest(s, "sha256").hexdigest()


def tokens(s):
    return Counter(re.findall(r"[A-Z]+|\d+(?:[.,]\d+)*", unicodedata.normalize("NFKC",s).upper()))


def within(word, bbox):
    b=word["bbox"]
    x,y=(b[0]+b[2])/2,(b[1]+b[3])/2
    return bbox[0] <= x <= bbox[2] and bbox[1] <= y <= bbox[3]


def validate(path, write_report=True, verbose=True):
    record=json.loads(path.read_text())
    if record.get("schema_version")=="authored-module-bundle-v1":
        from bundle_record import validate as validate_bundle
        return validate_bundle(path,write_report=write_report,verbose=verbose)
    ident=record["id"]
    cap=AUDIT/"evidence"/ident
    report={"id":ident,"record_sha256":digest(path),"checked_utc":datetime.now(timezone.utc).isoformat(),
            "checks":[],"errors":[],"manual_visual_assertions":[],
            "scope": "Source integrity, authored bounded text/cell corroboration in MuPDF and Poppler, annotation arithmetic and evidence links. NOT automatic completeness proof or independent automatic symbol counting."}
    def error(message):
        report["errors"].append(message)
    if digest(ROOT/record["source_pdf"]) != record["source_sha256"]:
        error("Source PDF SHA-256 mismatch")
    capture=json.loads((cap/"capture.json").read_text())
    if capture["source_sha256"]!=record["source_sha256"] or capture["page_count"]!=record["page_count"]:
        error("Capture source identity/page count mismatch")
    cache={}
    def words(engine,page):
        k=(engine,page)
        if k not in cache:
            cache[k]=json.loads((cap/engine/f"{page:04d}.json").read_text())["words"]
        return cache[k]
    def check(label,page,bbox,expected,exact_tokens=False):
        result={"label":label,"page":page,"bbox":bbox,"expected":expected,"engines":{}}
        for engine in ["mupdf","poppler"]:
            selected=[w for w in words(engine,page) if within(w,bbox)]
            text=" ".join(w["text"] for w in selected)
            exp,got=tokens(expected),tokens(text)
            if expected.strip()=="-":
                ok=text.strip()=="-"
            else:
                ok=bool(exp) and (exp==got if exact_tokens else not bool(exp-got))
            result["engines"][engine]={"pass":ok,"word_ids":[w["id"] for w in selected],"raw_region_text":text,
                                       "missing_tokens":dict(exp-got),"extra_tokens":dict(got-exp)}
            if not ok:
                error(f"{label} / {engine}: expected {expected!r}; region contains {text!r}")
        report["checks"].append(result)
    if {s["page"] for s in record["sheets"]} != set(range(1,record["page_count"]+1)):
        error("Sheet ledger does not cover every PDF page")
    defaults=record["sheet_defaults"]
    for sheet in record["sheets"]:
        n=sheet["page"]
        if sheet["visual_review"]!="complete":
            error(f"Page {n} not visually complete")
        if n in defaults["pages"]:
            check(f"sheet/{n}/number",n,defaults["sheet_number_bbox"],sheet["sheet_number"],True)
            check(f"sheet/{n}/title",n,defaults["title_bbox"],sheet["title"],True)
            check(f"sheet/{n}/issue_date",n,defaults["issue_date_bbox"],defaults["issue_date_source"],True)
            check(f"sheet/{n}/issue",n,defaults["issue_type_bbox"],defaults["issue_type"],True)
        for v in sheet["views"]:
            check(f'sheet/{n}/view/{v["number"]}/scale',n,v["scale_bbox"],v["scale"])
            if v["graphic_scale_bar"]:
                check(f'sheet/{n}/view/{v["number"]}/bar_labels',n,v["graphic_scale_bbox"]," ".join(v["graphic_labels_left_to_right"]))
        if sheet["graphic_scale_bar_count"]!=sum(v["graphic_scale_bar"] for v in sheet["views"]):
            error(f"Page {n} graphic bar annotation total inconsistent")
    cells={}
    for table in record["tables"]:
        if table["row_count"]!=len(table["rows"]):
            error(f'Table {table["id"]} row count inconsistent')
        hy=table["header_y"]
        for col in table["columns"]:
            x=col["x"]
            check(f'{table["id"]}/header/{col["key"]}',table["page"],[x[0],hy[0],x[1],hy[1]],col["source_header"])
        for row in table["rows"]:
            if len(row["cells"])!=len(table["columns"]):
                error(f'{table["id"]}/{row["number"]} cell count inconsistent')
                continue
            for col,value in zip(table["columns"],row["cells"]):
                x,y=col["x"],row["y"]
                check(f'{table["id"]}/{row["number"]}/{col["key"]}',table["page"],[x[0],y[0],x[1],y[1]],value,True)
                cells[f'{table["id"]}/{row["number"]}/{col["key"]}']=value
    for equipment in record["equipment"]:
        for name,spec in equipment.get("performance",{}).items():
            if "cell" not in spec:
                continue
            raw=cells.get(spec["cell"])
            if raw is None:
                error(f"Unknown performance source cell: {spec['cell']}")
                continue
            source_numbers=[float(v.replace(',','')) for v in re.findall(r"\d+(?:,\d{3})*(?:\.\d+)?",raw)]
            declared=spec["value"] if isinstance(spec["value"],list) else [spec["value"]]
            if declared != source_numbers:
                error(f"Normalized value disagrees with source cell: {equipment['identity']}/{name}")
    controls=record["controls"]
    for point in controls["points"]:
        check(f'point/{point["tag"]}',controls["page"],point["bbox"],point["tag"]+" "+point["description"],True)
    counts=Counter(p["type_normalized"] for p in controls["points"])
    for key,value in counts.items():
        if controls["point_counts"].get(key)!=value:
            error(f"Point type count inconsistent: {key}")
    if controls["point_counts"]["total"]!=len(controls["points"]):
        error("Point total inconsistent")
    if len({p["tag"] for p in controls["points"]})!=len(controls["points"]):
        error("Duplicate point identity within equipment")
    evidence_ids={e["id"] for e in record["evidence"]}
    for e in record["evidence"]:
        if "expected" in e:
            check("evidence/"+e["id"],e["page"],e["bbox"],e["expected"])
        if "visual_note" in e:
            report["manual_visual_assertions"].append({"id":e["id"],"note":e["visual_note"]})
        for render in e.get("renders",[]):
            if not (AUDIT/"reviews"/ident/render).exists():
                error(f'Missing review render {render}')
    def walk(v):
        if isinstance(v,dict):
            for ref in v.get("evidence_ids",[]):
                if ref not in evidence_ids:
                    error(f"Unknown evidence link: {ref}")
            for a in v.values():walk(a)
        elif isinstance(v,list):
            for a in v:walk(a)
    walk(record)
    report["bounded_assertions"]=len(report["checks"])
    report["independent_engine_checks"]=2*len(report["checks"])
    report["pass"]=not report["errors"]
    if write_report:
        output=AUDIT/"verification"/(ident+".json")
        output.parent.mkdir(parents=True,exist_ok=True)
        output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")
    if verbose:
        print(json.dumps({k:report[k] for k in ["id","bounded_assertions","independent_engine_checks","pass","errors"]},indent=2))
    return report["pass"]


if __name__=="__main__":
    paths=[Path(p) for p in sys.argv[1:]] or sorted((AUDIT/"records").glob("*.json"))
    outcomes=[validate(p) for p in paths]
    raise SystemExit(not all(outcomes))
