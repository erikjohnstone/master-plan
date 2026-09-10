// Surface-only rendering of unchanged shared comparison rows and Python deltas.
import { useEffect, useMemo, useRef, useState } from 'react';
import BasRevisionValue, { revisionScalar } from './BasRevisionValue.jsx';
const human = value => String(value).replaceAll('_', ' ');
const measureName = value => human(value).replace(/^declared io:/, 'Declared I/O · ').replaceAll(':', ' · ');
const measureValue = (q, side) => side === 'delta' ? q.delta === null ? human(q.status) : q.delta
  : q[side] ? q[side].value === null ? 'Unknown' : q[side].value : 'Not present';
function Pages({ page, size, total, label, onPage }) {
  return total > size && <div className="bas-point-controls"><button type="button" disabled={!page} onClick={() => onPage(page - 1)}>Previous {label}</button><span>{page * size + 1}–{Math.min((page + 1) * size, total)} of {total} {label}</span><button type="button" disabled={(page + 1) * size >= total} onClick={() => onPage(page + 1)}>Next {label}</button></div>;
}
function FieldValue({ field, label }) {
  const [open, setOpen] = useState(false);
  if (!field.present) return <span>Not present</span>;
  const value = JSON.parse(field.json);
  if (value === null || typeof value !== 'object') return <span>{revisionScalar(value)}</span>;
  return <details onToggle={e => setOpen(e.currentTarget.open)}><summary>{Object.keys(value).length} {Array.isArray(value) ? 'entries' : 'fields'} — explore original value</summary>{open && <BasRevisionValue value={value} label={label} />}</details>;
}
export default function BasRevisionResults({ report, state, onChange, onSource, onMembershipReview, editable }) {
  const detailHeading = useRef(null), requestedFocus = useRef(false), returnFocus = useRef(null);
  useEffect(() => { if (requestedFocus.current) { detailHeading.current?.focus(); requestedFocus.current = false; } }, [state.selectedId]);
  const select = (r, event) => { returnFocus.current = event.currentTarget; requestedFocus.current = true;
    onChange({ selectedId: r.row_id, sourcePage: 0, quantityPage: 0, fieldPage: 0 });
    if (r.row_id === state.selectedId) { detailHeading.current?.focus(); requestedFocus.current = false; }
  };
  const rows = useMemo(() => report.rows.filter(r => (!state.kind || (r.before || r.after).kind === state.kind)
    && (!state.filter || `${r.before?.label || ''} ${r.after?.label || ''} ${r.disposition}`.toLowerCase().includes(state.filter.toLowerCase()))
    && (!state.changedOnly || r.declared_fields_equal !== true || r.rules_equal !== true || r.retained_evidence !== 'equal'
      || r.saved_output_equal === false || r.issues.length > 0
      || r.quantities.some(q => (q.status !== 'calculated' && q.status !== 'not_a_quantity') || (q.delta !== null && q.delta !== 0)))), [report, state.kind, state.filter, state.changedOnly]);
  const page = Math.max(0, Math.min(state.page || 0, Math.ceil(rows.length / 25) - 1));
  const selected = report.rows.find(r => r.row_id === state.selectedId);
  const quantityPage = Math.max(0, Math.min(state.quantityPage || 0, Math.ceil((selected?.quantities.length || 0) / 10) - 1));
  const fieldPage = Math.max(0, Math.min(state.fieldPage || 0, Math.ceil((selected?.field_changes.length || 0) / 20) - 1));
  const selectedQuantities = selected?.quantities.slice(quantityPage * 10, (quantityPage + 1) * 10) || [];
  const sourcePage = Math.max(0, state.sourcePage || 0);
  const kinds = [...new Set(report.rows.map(r => (r.before || r.after).kind))];
  return <>
    <div className="bas-point-controls"><label>Find a compared item<input value={state.filter || ''} onChange={e => onChange({ filter: e.target.value, page: 0 })} placeholder="Equipment, requirement or point" /></label>
      <label>Item kind<select aria-label="Item kind" value={state.kind || ''} onChange={e => onChange({ kind: e.target.value, page: 0 })}><option value="">All item kinds</option>{kinds.map(k => <option key={k} value={k}>{human(k)}</option>)}</select></label>
      <label className="bas-revision-check"><input type="checkbox" checked={!!state.changedOnly} onChange={e => onChange({ changedOnly: e.target.checked, page: 0 })} />Changes and unresolved items only</label></div>
    <div className="bas-point-grid bas-revision-grid" tabIndex={0} role="region" aria-label="Scrollable revision comparison">
      <table aria-label="Requirements and quantities comparison"><thead><tr><th scope="col">Item</th><th scope="col">Correspondence</th><th scope="col">Requirement changes</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Difference</th></tr></thead><tbody>
        {rows.slice(page * 25, (page + 1) * 25).map(r => <tr key={r.row_id} data-selected={r.row_id === state.selectedId}>
          <th scope="row"><button type="button" className="bas-point-cell" onClick={event => select(r, event)}>{r.before?.label || r.after.label}</button><small>{human((r.before || r.after).kind)}</small>{r.before && r.after && r.before.label !== r.after.label && <small>After: {r.after.label}</small>}{r.quantities.length > 3 && <button type="button" onClick={event => select(r, event)}>Explore all {r.quantities.length} measures</button>}</th>
          <td>{human(r.disposition)}<small>{human(r.correspondence)}</small></td>
          <td>{r.declared_fields_equal === null ? 'Not paired' : r.field_changes.length ? `${r.field_changes.length} changed fields` : 'Declared fields unchanged'}{r.rules_equal === false && <small>Interpretation rules differ</small>}{r.retained_evidence === 'changed' && <small>Original evidence differs</small>}</td>
          {['before', 'after', 'delta'].map(side => <td key={side}>{r.quantities.length ? <>{r.quantities.slice(0, 3).map(q => <div className="bas-revision-measure" key={q.metric_key}>
            <small>{measureName((q.before || q.after).dimension)}</small>{measureValue(q, side)}
          </div>)}{r.quantities.length > 3 && <small>First 3 of {r.quantities.length} measures</small>}</> : 'Not a quantity'}</td>)}
        </tr>)}
      </tbody></table>
    </div>
    {!rows.length && <p role="status">No items match this filter. This does not prove complete coverage.</p>}
    <div className="bas-point-controls"><button type="button" disabled={!page} onClick={() => onChange({ page: page - 1 })}>Previous compared items</button><span>{Math.min(page * 25 + 1, rows.length)}–{Math.min((page + 1) * 25, rows.length)} of {rows.length}</span><button type="button" disabled={(page + 1) * 25 >= rows.length} onClick={() => onChange({ page: page + 1 })}>Next compared items</button></div>
    {selected && <section className="bas-revision-detail" aria-label="Compared item detail"><div className="bas-point-heading"><h3 ref={detailHeading} tabIndex={-1}>{selected.before?.label || selected.after.label}</h3><button type="button" onClick={() => { returnFocus.current?.focus(); onChange({ selectedId: null }); }}>Close item detail</button></div>
      <p>{selected.reason || 'No explicit correspondence reason.'}</p>
      <p>{selected.issues.map(human).join(' · ') || 'No additional comparison flags.'}</p>
      {!!selected.quantities.length && <><div className="bas-point-grid"><table aria-label="Selected item measures"><thead><tr><th scope="col">Measure</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Difference</th></tr></thead><tbody>{selectedQuantities.map(q => <tr key={q.metric_key}><th scope="row">{measureName((q.before || q.after).dimension)}</th>{['before', 'after', 'delta'].map(side => <td key={side}>{measureValue(q, side)}</td>)}</tr>)}</tbody></table></div><Pages page={quantityPage} size={10} total={selected.quantities.length} label="measures" onPage={quantityPage => onChange({ quantityPage })} /></>}
      {!!selected.field_changes.length && <><div className="bas-point-grid"><table aria-label="Changed requirement fields"><thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>{selected.field_changes.slice(fieldPage * 20, (fieldPage + 1) * 20).map(f => <tr key={f.field}><th scope="row">{human(f.field)}</th><td><FieldValue field={f.before} label={`Before ${f.field}`} /></td><td><FieldValue field={f.after} label={`After ${f.field}`} /></td></tr>)}</tbody></table></div><Pages page={fieldPage} size={20} total={selected.field_changes.length} label="changed fields" onPage={fieldPage => onChange({ fieldPage })} /></>}
      {editable && selectedQuantities.filter(q => q.status === 'membership_review_required').map(q => <div className="bas-revision-membership" key={q.metric_key}><p>{(q.before || q.after).dimension}: included membership or replication changed. Confirm only if comparing the same measure is intended.</p><label>Membership comparison reason<input aria-label={`Membership comparison reason for ${measureName((q.before || q.after).dimension)}`} value={state.membershipReasons?.[q.metric_key] || ''} onChange={e => onChange({ membershipReasons: { ...state.membershipReasons, [q.metric_key]: e.target.value } })} /></label><button type="button" disabled={!state.membershipReasons?.[q.metric_key]?.trim()} onClick={() => onMembershipReview(selected, q, state.membershipReasons[q.metric_key])}>Confirm comparable membership</button></div>)}
      <div className="bas-revision-sides">{['before', 'after'].map(side => { const item = selected[side]; return <section key={side}><h4>{side === 'before' ? 'Before — original evidence' : 'After — original evidence'}</h4>{!item ? <p>No paired item. Absence is not a zero quantity.</p> : <>
        <p>{human(item.origin)} · {human(item.source_scope)} · {human(item.dependency_status)}</p>
        {item.source_refs.slice(sourcePage * 10, (sourcePage + 1) * 10).map((s, i) => <div className="bas-revision-source" key={i}><p>{s.text || 'No retained wording'}</p><button type="button" onClick={() => onSource(s)}>View {side} PDF page {s.page_id.split(':p').at(-1)}</button></div>)}
        {!item.source_refs.length && <p>No located source is attached. Inspect the original record and its explicit decisions.</p>}
        <BasRevisionValue key={item.item_id + item.content_fingerprint} value={JSON.parse(item.original_json)} label={`${side === 'before' ? 'Before' : 'After'} original record`} />
      </>}</section>; })}</div>
      {Math.max(selected.before?.source_refs.length || 0, selected.after?.source_refs.length || 0) > 10 && <div className="bas-point-controls"><button type="button" disabled={!sourcePage} onClick={() => onChange({ sourcePage: sourcePage - 1 })}>Previous source references</button><span>Source page {sourcePage + 1}</span><button type="button" disabled={(sourcePage + 1) * 10 >= Math.max(selected.before?.source_refs.length || 0, selected.after?.source_refs.length || 0)} onClick={() => onChange({ sourcePage: sourcePage + 1 })}>Next source references</button></div>}
    </section>}
  </>;
}
