"""Corroborate manually transcribed table cells against independent raw captures.

Shared-path gate: an offline reference-annotation checker, not table discovery or
production extraction/count logic. Grid and all expected cells are authored data.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import unicodedata

ROOT=Path(__file__).resolve().parents[2]
AUDIT=ROOT/"ground_truth"


def canon(s):
    s=unicodedata.normalize('NFKC',s).upper()
    return re.sub(r'\s+', '', s).replace('–','-').replace('−','-')


def token(s):
    return Counter(re.findall(r'[A-Z]+|\d+(?:[.,]\d+)*',unicodedata.normalize('NFKC',s).upper()))


def verify(path, *, write=True, quiet=False):
    data=json.loads(path.read_text())
    ident=data['document_id']
    capture=AUDIT/'evidence'/ident
    meta=json.loads((capture/'capture.json').read_text())
    pdf=ROOT/meta['source_pdf']
    errors=[];checks=[];cache={}
    with pdf.open('rb') as stream:
        if hashlib.file_digest(stream,'sha256').hexdigest()!=meta['source_sha256']:
            errors.append('Source hash mismatch')
    def region(engine,page,b,direction='right',excluded_ids=frozenset()):
        key=engine,page
        if key not in cache:
            cache[key]=json.loads((capture/engine/f'{page:04d}.json').read_text())['words']
        selected=[w for w in cache[key] if w['id'] not in excluded_ids
                  and b[0] <= (w['bbox'][0]+w['bbox'][2])/2 < b[2]
                  and b[1] <= (w['bbox'][1]+w['bbox'][3])/2 < b[3]]
        if direction=='up':
            return sorted(selected,key=lambda w:(round((w['bbox'][0]+w['bbox'][2])/2/3)*3,-w['bbox'][1]))
        if direction=='left_to_right':
            return sorted(selected,key=lambda w:((w['bbox'][0]+w['bbox'][2])/2,w['bbox'][1]))
        return sorted(selected,key=lambda w:(round((w['bbox'][1]+w['bbox'][3])/2/3)*3,w['bbox'][0]))
    for t in data['tables']:
        xs=t['x_edges'];columns=t['columns'].split('|')
        excluded_by_engine={}
        for exclusion in t.get('parser_exclusions',[]):
            engine=exclusion.get('engine')
            word_ids=exclusion.get('word_ids')
            if engine not in ['mupdf','poppler'] or not isinstance(word_ids,list) or not word_ids or not exclusion.get('reason'):
                errors.append(f'{t["id"]}: malformed parser exclusion')
                continue
            excluded_by_engine.setdefault(engine,set()).update(word_ids)
        # Noncontiguous authored row bounds allow intervening type headers.
        # This never discovers rows or supplies missing expected values.
        if 'y_ranges' in t and 'y_edges' in t:
            errors.append(f'{t["id"]}: provide y_ranges or y_edges, not both')
            continue
        ys=t.get('y_edges',[])
        ranges=t.get('y_ranges',list(zip(ys,ys[1:])))
        if (len(columns)!=len(xs)-1 or len(t['rows'])!=len(ranges)
                or any(a>=b for a,b in zip(xs,xs[1:]))
                or any(len(r)!=2 or r[0]>=r[1] for r in ranges)
                or any(a[1]>b[0] for a,b in zip(ranges,ranges[1:]))):
            errors.append(f'{t["id"]}: declared grid dimensions disagree')
            continue
        if 'listed_point_counts' in t:
            marks=[line.split('|')[0] for line in t['rows']]
            if len(marks)!=len(set(marks)):
                errors.append(f'{t["id"]}: duplicate point marks within one matrix')
            counts=Counter()
            for mark in marks:
                match=re.fullmatch(r'([A-Z]+)-?\d+',mark)
                normalized=data.get('normalization',{}).get(match[1] if match else '')
                if normalized is None:
                    errors.append(f'{t["id"]}: unknown point type {mark!r}')
                else:
                    counts[normalized]+=1
            if counts!=Counter(t['listed_point_counts']):
                errors.append(f'{t["id"]}: declared point counts disagree with authored marks')
            if 'owner_groups' in t:
                owners=Counter(mark for g in t['owner_groups'] for mark in g['marks'])
                if owners!=Counter(marks):
                    errors.append(f'{t["id"]}: owner groups must cover each point exactly once')
        for ri,line in enumerate(t['rows']):
            values=line.split('|')
            if len(values)!=len(columns):
                errors.append(f'{t["id"]}/{ri+1}: expected {len(columns)} cells, got {len(values)}')
                continue
            for ci,expected in enumerate(values):
                box=[xs[ci],ranges[ri][0],xs[ci+1],ranges[ri][1]]
                check={'table':t['id'],'row':ri+1,'column':columns[ci],'page':t['page'],
                       'bbox':box,'expected':expected,'engines':{}}
                for engine in ['mupdf','poppler']:
                    ws=region(engine,t['page'],box,t.get('row_reading_order','right'),excluded_by_engine.get(engine,frozenset()));actual=' '.join(w['text'] for w in ws)
                    # Strict glyph-sequence equality after whitespace normalization:
                    # preserve < >, fractions, decimals, signs and blank cells.
                    ok=canon(expected)==canon(actual)
                    check['engines'][engine]={'pass':ok,'text':actual,'word_ids':[w['id'] for w in ws]}
                    if not ok:errors.append(f'{t["id"]}/{ri+1}/{columns[ci]}/{engine}: expected {expected!r}, got {actual!r}')
                checks.append(check)
        for h in t.get('header_evidence',[]):
            for engine in ['mupdf','poppler']:
                ws=region(engine,t['page'],h['bbox']); actual=' '.join(w['text'] for w in ws)
                ok=not bool(token(h['expected'])-token(actual))
                checks.append({'table':t['id'],'header':h['expected'],'page':t['page'],'bbox':h['bbox'],
                               'engine':engine,'actual':actual,'pass':ok})
                if not ok:errors.append(f'{t["id"]}/header/{engine}: expected {h["expected"]!r}, got {actual!r}')
    assertions=list(data.get('assertions',[]))
    # Expand only explicitly authored fields/bounds; no source discovery or
    # extraction inference. Repeated sheet borders need not be hand-duplicated.
    for group in data.get('assertion_groups',[]):
        if group.get('covers_all_source_pages'):
            pages=[r['page'] for r in group['records']]
            if sorted(pages)!=list(range(1,meta['page_count']+1)):
                errors.append(f'{group["id"]}: authored ledger must cover every source page exactly once')
        for record in group['records']:
            values={**group.get('defaults',{}),**record}
            for template in group['templates']:
                a={k:v for k,v in template.items() if k not in ['field','bbox_field']}
                a['id']=f'{group["id"]}/{record["id"]}/{template["id"]}'
                a['page']=record['page']
                a['expected']=values[template['field']]
                if 'bbox_field' in template:
                    a['bbox']=values[template['bbox_field']]
                assertions.append(a)
    assertion_ids=[a['id'] for a in assertions]
    if len(assertion_ids)!=len(set(assertion_ids)):
        errors.append('Duplicate bounded text assertion IDs')
    def check_references(value):
        if isinstance(value,dict):
            for ref in value.get('assertion_ids',[]):
                if ref not in assertion_ids:
                    errors.append(f'Unknown bounded text assertion reference: {ref}')
            for child in value.values():check_references(child)
        elif isinstance(value,list):
            for child in value:check_references(child)
    check_references(data)
    # Arithmetic over authored inventories only. These checks never search the
    # PDF for objects or infer how many physical devices a symbol represents.
    def at_path(path):
        value=data
        for part in path:value=value[part]
        return value
    inventory_results=[]
    dependencies={}
    def linked_module(filename):
        linked=AUDIT/'work'/ident/filename
        if linked.parent!=AUDIT/'work'/ident or linked.suffix!='.json':
            raise ValueError('linked module must be a sibling JSON annotation')
        annotation=json.loads(linked.read_text())
        outcome=json.loads(linked.with_name(linked.stem+'.verification.json').read_text())
        digest=hashlib.sha256(linked.read_bytes()).hexdigest()
        if (annotation.get('document_id')!=ident or not outcome.get('pass')
                or outcome.get('annotation_sha256')!=digest
                or outcome.get('source_sha256')!=meta['source_sha256']):
            raise ValueError(f'linked annotation {filename} lacks current passing source corroboration')
        dependencies[filename]=digest
        return annotation

    # Cross-reference validation, not schedule discovery or point inference.
    # All identities, scopes and application multiplicities are authored data.
    registry=data.get('schedule_registry_schema')
    if registry:
        try:
            modules={};seen=Counter();identities=[];instance_ids=[];row_total=0
            for family in data['scheduled_families']:
                filename=family['module']
                if filename not in modules:modules[filename]=linked_module(filename)
                candidates=[t for t in modules[filename]['tables'] if t['id']==family['table']]
                if len(candidates)!=1:raise ValueError(f'{family["table"]}: absent/ambiguous table')
                table=candidates[0];seen[filename,table['id']]+=1
                if len(table['rows'])!=family['rows']:raise ValueError(f'{table["id"]}: row-count mismatch')
                row_total+=len(table['rows']);columns=table['columns'].split('|')
                namespace=table['id'].split(registry['namespace_separator'],1)[0]
                if not family.get('class'):raise ValueError('missing authored equipment classification')
                for field,column in registry['identity_columns'].items():
                    if field not in family:continue
                    ci=columns.index(column)
                    actual=[row.split('|')[ci] for row in table['rows']]
                    if actual!=family[field]:raise ValueError(f'{table["id"]}: identity-column mismatch')
                    ids=[namespace+'-'+tag for tag in actual]
                    identities.extend(ids)
                    if table['id'] not in registry['non_instance_table_ids']:instance_ids.extend(ids)
            expected_tables=Counter((filename,t['id']) for filename,module in modules.items() for t in module['tables'])
            if seen!=expected_tables:raise ValueError('families must cover all linked schedule tables exactly once')
            if len(set(identities))!=len(identities):raise ValueError('duplicate building-scoped schedule identity')
            counts=data['schedule_counts']
            if (len(seen)!=counts['tables'] or row_total!=counts['rows']
                    or len(identities)!=counts['building_scoped_tag_identities_including_outlet_types']
                    or len(instance_ids)!=counts['other_scheduled_tag_identities']):
                raise ValueError('declared schedule totals disagree')
            anchors=at_path(registry['anchor_records_path'])
            if Counter(a['id'] for a in anchors)!=Counter(instance_ids):
                raise ValueError('primary anchors must cover every non-outlet schedule identity exactly once')
            inventory_results.append({'id':'linked-schedule-registry','pass':True,'tables':len(seen),
                                      'rows':row_total,'identities':len(identities),'primary_anchors':len(instance_ids)})
        except (KeyError,TypeError,ValueError,IndexError,OSError) as exc:
            errors.append(f'linked-schedule-registry: {exc}')
    if 'source_points_module' in data:
        try:
            points=linked_module(data['source_points_module'])
            point_tables={t['id']:t for t in points['tables']}
            listed=Counter();expanded=Counter();applications={}
            for t in point_tables.values():listed.update(t['listed_point_counts'])
            declared=data['listed_template_counts']
            if listed!=Counter({k:v for k,v in declared.items() if k!='total'}) or sum(listed.values())!=declared['total']:
                raise ValueError('listed template counts disagree with corroborated points')
            for application in data['applications']:
                aid=application['id']
                if aid in applications:raise ValueError(f'duplicate application {aid}')
                applications[aid]=application
                if not isinstance(application['instances'],int) or application['instances']<1:
                    raise ValueError(f'{aid}: invalid multiplicity')
                counts=Counter()
                for tid in application['point_tables']:counts.update(point_tables[tid]['listed_point_counts'])
                if counts!=Counter(application['counts']):raise ValueError(f'{aid}: counts differ from referenced matrix')
                expanded.update({k:v*application['instances'] for k,v in counts.items()})
            declared=data['expanded_template_counts']
            if expanded!=Counter({k:v for k,v in declared.items() if k!='total'}) or sum(expanded.values())!=declared['total']:
                raise ValueError('expanded logical template counts disagree')
            if set(point_tables)!={t for a in applications.values() for t in a['point_tables']}:
                raise ValueError('not every printed points table has an application')
            for rule in data.get('leaf_ownership_rules',[]):
                marks=Counter(row.split('|')[0] for tid in rule['tables'] for row in point_tables[tid]['rows'])
                if marks!=Counter(m for g in rule['groups'] for m in g['marks']):
                    raise ValueError('leaf ownership must cover each referenced point exactly once')
                for aid in rule['applies_to']:
                    if not set(rule['tables'])<=set(applications[aid]['point_tables']):
                        raise ValueError(f'{aid}: ownership rule references an unrelated table')
            for a in applications.values():
                if 'shared_input' in a:
                    aid,tid,mark=a['shared_input'].split('/')
                    if tid not in applications[aid]['point_tables'] or mark not in [r.split('|')[0] for r in point_tables[tid]['rows']]:
                        raise ValueError('shared input refers to unknown point')
            bindings=data.get('leaf_role_bindings',[])
            if bindings:
                rules=data['leaf_ownership_rules']
                if sorted(b['rule_index'] for b in bindings)!=list(range(len(rules))):
                    raise ValueError('leaf bindings must cover every ownership rule exactly once')
                for binding in bindings:
                    rule=rules[binding['rule_index']]
                    groups=binding['owners_by_group']
                    if len(groups)!=len(rule['groups']):
                        raise ValueError('leaf binding group count mismatch')
                    for owners in groups:
                        if len(owners)!=len(rule['applies_to']) or any(not owner for owner in owners):
                            raise ValueError('leaf binding application count/missing owner')
                for aid,owner in data.get('single_owner_applications',{}).items():
                    if aid not in applications or not owner:
                        raise ValueError('unknown single-owner application')
            inventory_results.append({'id':'linked-point-applications','pass':True,'applications':len(applications),
                                      'listed_rows':sum(listed.values()),'expanded_logical_rows':sum(expanded.values()),
                                      'warning':'Expanded logical occurrences are not unique physical I/O.'})
        except (KeyError,TypeError,ValueError,IndexError,OSError) as exc:
            errors.append(f'linked-point-applications: {exc}')
    for item in data.get('inventory_checks',[]):
        try:
            records=at_path(item['records_path'])
            if not isinstance(records,list):raise ValueError('records must be a list')
            if 'defaults_path' in item:
                records=[{**at_path(item['defaults_path']),**r} for r in records]
            records=[r for r in records if all(r.get(k)==v for k,v in item.get('equals',{}).items())
                     and all(r.get(k)!=v for k,v in item.get('not_equals',{}).items())]
            actual=len(records)
            expected=at_path(item['expected_path']) if 'expected_path' in item else item['expected']
            ok=actual==expected
            if item.get('unique_key'):
                ok=ok and len({r[item['unique_key']] for r in records})==actual
            if 'group_by' in item:
                actual=dict(Counter(r[item['group_by']] for r in records))
                groups=at_path(item['expected_groups_path'])
                expected={g[item['expected_key']]:g[item['expected_value']] for g in groups}
                ok=ok and len(expected)==len(groups) and actual==expected
            inventory_results.append({'id':item['id'],'actual':actual,'expected':expected,'pass':ok})
            if not ok:errors.append(f'{item["id"]}: authored inventory count/uniqueness mismatch')
        except (KeyError,TypeError,ValueError,IndexError) as exc:
            errors.append(f'{item["id"]}: invalid inventory declaration: {exc}')
    absence_results=[]
    for item in data.get('text_absence_assertions',[]):
        # Text absence alone is NOT proof of visual/engineering absence. The
        # annotation must separately document full-scope page review.
        pages=item['pages'];result={'id':item['id'],'engines':{}}
        if item.get('covers_all_source_pages') and sorted(pages)!=list(range(1,meta['page_count']+1)):
            errors.append(f'{item["id"]}: text absence search must cover every source page exactly once')
        for engine in ['mupdf','poppler']:
            matches=[]
            for page in pages:
                region(engine,page,[-1e9,-1e9,1e9,1e9])  # populate raw cache
                # Do not geometrically concatenate separate columns into a
                # phrase: a cleanout CO plus remote keynote 2 is not CO2.
                lines={}
                for w in cache[engine,page]:
                    lines.setdefault((w['block'],w['line']),[]).append(w['text'])
                for line,texts in lines.items():
                    actual=unicodedata.normalize('NFKC',' '.join(texts))
                    for pattern in item['patterns']:
                        for match in re.finditer(pattern,actual,re.I):
                            matches.append({'page':page,'native_line':line,'pattern':pattern,'text':match.group()})
            result['engines'][engine]={'pass':not matches,'matches':matches,
                                      'search_scope':'Native parser lines, NFKC normalized; not global cross-column word concatenation. Wrapped/outlined text still requires visual review.'}
            if matches:errors.append(f'{item["id"]}/{engine}: claimed absent text is present')
        absence_results.append(result)
    for assertion in assertions:
        check={'assertion':assertion['id'],'page':assertion['page'],
               'bbox':assertion['bbox'],'expected':assertion['expected'],'engines':{}}
        mode=assertion.get('mode','contains')
        if mode not in ['contains','exact','blank']:
            errors.append(f'{assertion["id"]}: unknown assertion mode {mode!r}')
            continue
        direction=assertion.get('reading_direction','right')
        if direction not in ['right','up']:
            errors.append(f'{assertion["id"]}: unknown reading direction {direction!r}')
            continue
        for engine in ['mupdf','poppler']:
            ws=region(engine,assertion['page'],assertion['bbox'],direction)
            actual=' '.join(w['text'] for w in ws)
            exp,got=canon(assertion['expected']),canon(actual)
            ok=(exp==got=='') if mode=='blank' else bool(exp) and (exp==got if mode=='exact' else exp in got)
            check['engines'][engine]={'pass':ok,'text':actual,'word_ids':[w['id'] for w in ws]}
            if not ok:errors.append(f'{assertion["id"]}/{engine}: expected {assertion["expected"]!r}, got {actual!r}')
        checks.append(check)
    result={'document_id':ident,'source_sha256':meta['source_sha256'],
            'annotation_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
            'tables':len(data['tables']),'rows':sum(len(t['rows']) for t in data['tables']),
            'cell_assertions':sum('row' in c for c in checks),
            'text_assertions':sum('assertion' in c for c in checks),'checks':checks,'pass':not errors,'errors':errors,
            'inventory_checks':inventory_results,'text_absence_checks':absence_results,
            'linked_annotation_sha256':dependencies,
            'scope':'Verifies authored cell content/position, header witnesses, bounded text and annotation consistency. Does not prove engineering interpretation, physical counts or complete-document review.'}
    out=path.with_name(path.stem+'.verification.json')
    if write:
        out.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    if not quiet:
        print(json.dumps({k:v for k,v in result.items() if k!='checks'},indent=2))
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('annotation',type=Path);a=p.parse_args()
    raise SystemExit(not verify(a.annotation)['pass'])
