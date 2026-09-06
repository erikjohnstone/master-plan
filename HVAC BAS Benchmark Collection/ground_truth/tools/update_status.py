"""Report audit-file state without inferring or changing drawing truth."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
AUDIT=ROOT/"ground_truth"
manifest=json.loads((ROOT/"manifest.json").read_text())
entries=manifest["entries"]
rows=[]
summary={"updated_utc":datetime.now(timezone.utc).isoformat(),"scope_documents":len(entries),
         "scope_pages":sum(e["page_count"] for e in entries),"captured_documents":0,
         "captured_pages":0,"completed_documents":0,"completed_pages":0,"documents":[]}
for e in entries:
    ident=f'{e["rank"]:02d}__{e["key"]}'
    cp=AUDIT/"evidence"/ident/"capture.json"
    rec=AUDIT/"records"/(ident+".json")
    ver=AUDIT/"verification"/(ident+".json")
    captured=False
    warnings=[]
    if cp.exists():
        c=json.loads(cp.read_text())
        captured=(c["source_sha256"]==e["sha256"] and c["page_count"]==e["page_count"] and
                  all((cp.parent/engine/f'{p:04d}.json').exists()
                      for engine in ["mupdf","poppler"] for p in range(1,e["page_count"]+1)))
        if c["mupdf_warnings"]:warnings.append("MuPDF warning retained")
        if c["poppler_warnings"]:warnings.append("Poppler warning retained")
    if captured:
        summary["captured_documents"]+=1
        summary["captured_pages"]+=e["page_count"]
    status="Detailed audit not yet written"
    completed=False
    modules=[]
    for module in sorted((AUDIT/'work'/ident).glob('*.json')):
        if module.name.endswith('.verification.json'):
            continue
        annotation=json.loads(module.read_text())
        if annotation.get('document_id')!=ident or 'tables' not in annotation:
            continue
        result_path=module.with_name(module.stem+'.verification.json')
        result=json.loads(result_path.read_text()) if result_path.exists() else {}
        current=(hashlib.sha256(module.read_bytes()).hexdigest()==result.get('annotation_sha256')
                 and result.get('source_sha256')==e['sha256'])
        for filename,digest in result.get('linked_annotation_sha256',{}).items():
            dependency=module.parent/filename
            current=(current and dependency.is_file()
                     and hashlib.sha256(dependency.read_bytes()).hexdigest()==digest)
        modules.append({'file':str(module.relative_to(AUDIT)),
                        'verification_current':current,'pass':current and result.get('pass',False),
                        'tables':result.get('tables'),'rows':result.get('rows'),
                        'cell_assertions':result.get('cell_assertions'),
                        'text_assertions':result.get('text_assertions',0)})
    if modules:
        n=sum(m['pass'] for m in modules)
        status=f'In progress; {n}/{len(modules)} partial annotation modules verified'
        if (AUDIT/'work'/ident/'README.md').exists():
            status=f'[{status}](work/{ident}/README.md)'
    if rec.exists():
        r=json.loads(rec.read_text())
        status=r["review_status"]
        if ver.exists():
            v=json.loads(ver.read_text())
            current=hashlib.sha256(rec.read_bytes()).hexdigest()==v["record_sha256"]
            current=(current and r.get('source_sha256')==e['sha256']
                     and hashlib.sha256((ROOT/e['output_file']).read_bytes()).hexdigest()==e['sha256'])
            for filename,expected_hash in v.get('source_files_sha256',{}).items():
                dependency=AUDIT/filename
                current=(current and dependency.is_file()
                         and hashlib.sha256(dependency.read_bytes()).hexdigest()==expected_hash)
            if r.get('schema_version')=='authored-module-bundle-v1':
                from bundle_record import render
                current=(current and rec.with_suffix('.md').is_file()
                         and rec.with_suffix('.md').read_text()==render(r))
            completed=(status=="complete_with_documented_source_limitations" and current and v["pass"] and
                       all(value for key,value in r["completion_checks"].items() if isinstance(value,bool)))
            if not current:status+=" (verification stale)"
            elif not v["pass"]:status+=" (verification failed)"
    if completed:
        summary["completed_documents"]+=1
        summary["completed_pages"]+=e["page_count"]
        status=f'[Complete; source limitations recorded](records/{ident}.md)'
    summary["documents"].append({"id":ident,"rank":e["rank"],"pages":e["page_count"],
                                  "captured":captured,"complete":completed,"status":status,"warnings":warnings,
                                  "partial_modules":modules})
    rows.append(f'| {e["rank"]:02d} | {e["title"]} | {e["page_count"]} | {"Captured" if captured else "Incomplete"} | {status} |')
summary["overall_complete"]=summary["completed_documents"]==len(entries)
(AUDIT/"status.json").write_text(json.dumps(summary,indent=2)+"\n")
lines=["# Ground-truth status - all 30 PDFs", "",
       f'Updated {summary["updated_utc"]}.',"",
       f'- Independent raw capture: {summary["captured_documents"]}/30 PDFs, {summary["captured_pages"]}/1,489 pages.',
       f'- Complete detailed records: {summary["completed_documents"]}/30 PDFs, covering {summary["completed_pages"]}/1,489 pages.',
       "- The goal remains active. Parser capture, text agreement and curation previews are not completed ground truth.",
       "- Completion below reflects authored page-by-page review plus current, hash-matched verification, not an automatic parser score.","",
       "## All-document ledger","",
       "| Rank | Document | Pages | MuPDF + Poppler raw capture | Detailed ground truth |",
       "|---:|---|---:|---|---|",*rows,"",
       "## Next work","",
       "1. Follow the current document ledger above. Norfolk (02) has a ten-module assembled record; it counts as complete only with a current passing final audit. Proceed to Cherry Point (01) after its completion gate passes.",
       "2. Continue the full 30-document queue; do not substitute selected preview-page reviews for complete records.",
       "3. Investigate all parser disagreements in the relevant fields. USDA ARS has a Poppler character-collection warning; Transbay has substantial text-segmentation differences. Low-text/outlined areas require visual and independent corroboration.",
       "4. Once all records are complete, run the full source-integrity/verification/completeness audit and package the new records. The existing focus ZIP is the original curation package and does not yet contain these ground-truth records.","",
       "## Current verification tools","",
       "- `tools/capture_evidence.py`: immutable-source MuPDF/Poppler raw captures, coordinate and text diagnostics; resumable.",
       "- `tools/render_region.py`: source-page/region rendering by either independent engine.",
       "- `tools/validate_record.py`: bounded authored field/cell checks and annotation consistency; no production takeoff inference.",
       "- `tools/test_validation.py`: positive case and deliberately corrupt negative controls.",
       "- `tools/verify_tables.py`: strict authored schedule/points cells, bounded sequence text and declared-count/reference checks.",
       "- `tools/test_tables.py`: positive modules and corrupt cell, bounds, type-count, ownership, header, sign and reference controls.",
       "- `tools/bundle_record.py`: self-contained authored-module records, equipment/point presentation, whole-document coverage and source/render hash checks.",
       "- `tools/update_status.py`: all-30 ledger with stale-verification detection.","",
       "See [audit protocol](README.md) for scope, evidence semantics and shared-path decision.",""]
(AUDIT/"STATUS.md").write_text("\n".join(lines))
print(json.dumps({k:v for k,v in summary.items() if k!="documents"},indent=2))
