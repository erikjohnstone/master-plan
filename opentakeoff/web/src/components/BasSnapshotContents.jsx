/** Surface-specific reader of exact shared readiness fields. No recomputation
 * of quantities, relevance, coverage or approval. Every list is bounded in DOM. */
import { useMemo, useRef, useEffect, useState } from 'react';
import { SCOPE_CLAIM_LABELS as labels, scopeWindow } from './basScopeEditorState.ts';
import { basDeliverableTargetKey } from '../lib/basDeliverableScopeContract.ts';

const human = value => String(value).replace(/_/g, ' ');
function Page({ rows, page, onPage, name, children }) {
  const window = scopeWindow(rows, page);
  return <><div className="bas-point-grid" tabIndex={0} role="region" aria-label={name}>{children(window.rows)}</div>
    <div className="bas-point-controls"><button type="button" disabled={!window.page} onClick={() => onPage(window.page - 1)}>Previous {name}</button>
      <span>{window.total ? window.page * 50 + 1 : 0}–{Math.min(window.total, (window.page + 1) * 50)} of {window.total}</span>
      <button type="button" disabled={(window.page + 1) * 50 >= window.total} onClick={() => onPage(window.page + 1)}>Next {name}</button></div></>;
}
function Evidence({ refs, onSource }) {
  const [page, setPage] = useState(0);
  return <Page rows={refs} page={page} onPage={setPage} name="source references">{rows => <table><thead><tr><th>Original wording</th><th>Source</th></tr></thead><tbody>
    {rows.map((r, i) => <tr key={i}><td>{r.text || '(No retained wording)'}</td><td><button type="button" onClick={() => onSource(r)}>View original page {r.page_id.split(':p').at(-1)}</button>{!r.bbox_px && <small>Whole page; no located highlight</small>}</td></tr>)}
  </tbody></table>}</Page>;
}
function Item({ item, onSource }) {
  const [page, setPage] = useState(0);
  return <section aria-label="Retained snapshot item"><h4>{item.label || human(item.kind)}</h4>
    <p>{human(item.kind)} · {human(item.origin)} · rule {item.rule_version}</p>
    {!!item.quantities.length && <Page rows={item.quantities} page={page} onPage={setPage} name="retained values">{rows => <table><thead><tr><th>Measure</th><th>Value</th><th>Dimension / basis</th><th>Retained status</th></tr></thead><tbody>
      {rows.map((q, i) => <tr key={i}><th scope="row">{human(q.metric)}</th><td>{q.value === null ? 'Not established' : q.value}</td><td>{human(q.dimension)} · {human(q.basis)}</td><td>{human(q.status)}</td></tr>)}
    </tbody></table>}</Page>}
    {!item.quantities.length && <p>This retained item is not a quantity total.</p>}
    {!!item.source_refs.length && <Evidence refs={item.source_refs} onSource={onSource} />}
    {!item.source_refs.length && <p>No direct PDF location on this item. Inspect its dependencies and recorded decision.</p>}
    <details><summary>Exact retained item and decision inputs</summary><pre>{JSON.stringify(JSON.parse(item.original_json), null, 2)}</pre></details>
  </section>;
}

export default function BasSnapshotContents({ readiness, onSource }) {
  const [tab, setTab] = useState('claims'), [page, setPage] = useState(0), [filter, setFilter] = useState('');
  const [claimId, setClaimId] = useState(null), [itemId, setItemId] = useState(null), [itemPage, setItemPage] = useState(0);
  const heading = useRef(null), claimButton = useRef(null), returnClaim = useRef(null);
  const items = useMemo(() => new Map(readiness.scope.inventory.items.map(i => [i.item_id, i])), [readiness]);
  const claim = readiness.scope.claims.find(c => basDeliverableTargetKey(c.target) === claimId), item = items.get(itemId);
  useEffect(() => { if (claim) heading.current?.focus(); else claimButton.current?.focus(); }, [claim]);
  const selectTab = value => { setTab(value); setPage(0); setFilter(''); setClaimId(null); setItemId(null); };
  const tabs = [['claims', `Included (${readiness.scope.claims.length})`], ['exclusions', `Exclusions (${readiness.scope.exclusions.length})`],
    ['findings', `Findings (${readiness.issues.length})`], ['coverage', 'Coverage'], ['sources', `Original PDFs (${readiness.sources.length})`]];
  const claims = readiness.scope.claims.filter(c => !filter || `${items.get(c.root_item_id)?.label} ${labels[c.target.claim]}`.toLowerCase().includes(filter.toLowerCase()));
  const findings = readiness.issues.filter(e => !filter || `${e.issue.title} ${e.issue.subject.label} ${e.issue.code} ${e.scope}`.toLowerCase().includes(filter.toLowerCase()));
  return <section className="bas-snapshot-contents" aria-label="Snapshot contents">
    <nav className="bas-point-controls" aria-label="Snapshot sections">{tabs.map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => selectTab(id)}>{label}</button>)}</nav>
    {tab === 'claims' && (claim ? <section aria-label="Included claim details">
      <button type="button" onClick={() => { setClaimId(null); setItemId(null); }}>← Back to included claims</button>
      <h3 ref={heading} tabIndex={-1}>{labels[claim.target.claim]} · {items.get(claim.root_item_id)?.label}</h3>
      <p>Exact retained values, not an inferred installed total. Saved-result labels describe the retained item; the snapshot replay result is shown above.</p>
      <Page rows={claim.dependency_item_ids} page={itemPage} onPage={setItemPage} name="dependencies">{ids => <table><thead><tr><th>Retained dependency</th><th>Type</th><th>Read</th></tr></thead><tbody>
        {ids.map(id => <tr key={id}><th scope="row">{items.get(id)?.label}</th><td>{human(items.get(id)?.kind)}</td><td><button type="button" aria-pressed={itemId === id} onClick={() => setItemId(id)}>Inspect item</button></td></tr>)}
      </tbody></table>}</Page>
      {item && <Item key={item.item_id} item={item} onSource={onSource} />}
    </section> : <><label className="bas-snapshot-search">Find an included item<input value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} /></label>
      <Page rows={claims} page={page} onPage={setPage} name="included claims">{rows => <table><thead><tr><th>Item</th><th>Included claim</th><th>Evidence &amp; retained values</th></tr></thead><tbody>
        {rows.map(c => <tr key={basDeliverableTargetKey(c.target)}><th scope="row">{items.get(c.root_item_id)?.label}</th><td>{labels[c.target.claim]}</td><td><button type="button"
          ref={button => { if (button && returnClaim.current === basDeliverableTargetKey(c.target)) claimButton.current = button; }}
          onClick={e => { returnClaim.current = basDeliverableTargetKey(c.target); claimButton.current = e.currentTarget; setClaimId(returnClaim.current); setItemId(c.root_item_id); setItemPage(0); }}>Inspect claim</button><small>{c.dependency_item_ids.length} retained dependencies</small></td></tr>)}
      </tbody></table>}</Page></>)}
    {tab === 'exclusions' && <><p>Explicitly omitted claims only. Unselected items are not covered by this approval; required prerequisites are not removed by an exclusion.</p>
      <Page rows={readiness.scope.exclusions} page={page} onPage={setPage} name="exclusions">{rows => <table><thead><tr><th>Omitted claim</th><th>Reason / consequence</th><th>Evidence</th></tr></thead><tbody>
        {rows.map(e => <tr key={basDeliverableTargetKey(e.target)}><th scope="row">{labels[e.target.claim]} · {items.get(e.root_item_id)?.label}</th><td>{e.reason}<p>Consequence: {e.consequence}</p></td><td><Evidence refs={e.source_refs} onSource={onSource} /></td></tr>)}
      </tbody></table>}</Page></>}
    {tab === 'findings' && <><p>Findings remain visible, including those outside the approved claims. A historical snapshot does not close project-wide issues.</p>
      <label className="bas-snapshot-search">Find a snapshot finding<input value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} /></label>
      <Page rows={findings} page={page} onPage={setPage} name="snapshot findings">{rows => <table><thead><tr><th>Finding / affected item</th><th>Scope</th><th>Next step</th></tr></thead><tbody>
        {rows.map(e => <tr key={`${e.capture_id}:${e.issue.occurrence_id}`}><th scope="row">{e.issue.title}<small>{e.issue.subject.label} · {human(e.issue.severity)}</small><details><summary>Evidence &amp; shared effects</summary><Evidence refs={e.issue.evidence} onSource={onSource} />{e.effects.map((effect, i) => <p key={i}>{labels[effect.target.claim]}: {human(effect.effect)}</p>)}</details></th><td>{human(e.scope)}</td><td>{e.issue.next_step}</td></tr>)}
      </tbody></table>}</Page></>}
    {tab === 'coverage' && <><p>Recorded human applicability review, not proof of automatic discovery of every requirement.</p>
      <Page rows={readiness.coverage.pages} page={page} onPage={setPage} name="coverage pages">{rows => <table><thead><tr><th>Claim / original page</th><th>Accounting</th><th>Source</th></tr></thead><tbody>
        {rows.map((p, i) => <tr key={i}><th scope="row">{labels[p.target.claim]} · PDF page {p.page_id.split(':p').at(-1)}</th><td>{human(p.status)} · {p.whole_page ? 'Whole-page review' : `${p.accounted_spans} / ${p.total_spans} retained spans`}</td><td><button type="button" onClick={() => onSource(p)}>View original</button></td></tr>)}
      </tbody></table>}</Page></>}
    {tab === 'sources' && <Page rows={readiness.sources} page={page} onPage={setPage} name="original PDFs">{rows => <table><thead><tr><th>Original identity</th><th>Pages / bytes</th><th>Verification / view</th></tr></thead><tbody>
      {rows.map(({ source, status }) => <tr key={source.source_id}><th scope="row"><code>{source.sha256}</code></th><td>{source.page_count} pages · {source.byte_length.toLocaleString()} bytes</td><td>{human(status)}<div><button type="button" onClick={() => onSource({ page_id: `${source.source_id}:p1` })}>Read original PDF</button></div></td></tr>)}
    </tbody></table>}</Page>}
  </section>;
}
