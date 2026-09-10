/** Surface-only reader of the shared discovery partition, not a completeness
 * decision. All classifications, IDs, text and boxes come from retained data. */
import { useEffect, useMemo, useRef } from 'react';
const categories = { body_region_span_ids: 'Detected sequence body', heading_only_span_ids: 'Heading only',
  ambiguous_span_ids: 'Ambiguous', unassigned_horizontal_span_ids: 'Unassigned horizontal text',
  unsupported_span_ids: 'Unsupported text', blank_span_ids: 'Blank text' };
export default function BasSourceCoverage({ capture, discovery, selectedPageId, state, onChange, onSource }) {
  const heading = useRef(null);
  const pageId = selectedPageId || state.coveragePageId || discovery.pages[0]?.page_id;
  const page = discovery.pages.find(p => p.page_id === pageId);
  const original = capture.narrative_sources?.pages.find(p => p.page_id === pageId);
  const category = state.coverageCategory || '';
  const rows = useMemo(() => {
    const spans = new Map(original?.spans.map(s => [s.span_id, s]) || []);
    return page ? Object.entries(page.accounting).filter(([key]) => !category || key === category)
      .flatMap(([key, ids]) => ids.map(id => ({ category: key, id, span: spans.get(id) }))) : [];
  }, [page, original, category]);
  const index = Math.max(0, Math.min(state.coverageRowPage || 0, Math.ceil(rows.length / 50) - 1));
  useEffect(() => { heading.current?.focus(); }, [pageId]);
  return <section aria-label="Narrative source accounting" className="bas-point-detail bas-source-coverage">
    <h3 ref={heading} tabIndex={-1}>Source coverage</h3>
    <p>Accounting is not approval. Unassigned text is not irrelevant; missing text is not zero requirements.</p>
    <div className="bas-point-controls">
      <label>Source page<select aria-label="Source accounting page" value={page?.page_id || ''} onChange={e => onChange({ sequenceReviewTarget: null, coveragePageId: e.target.value, coverageRowPage: 0 })}>
        {!page && <option value="">Requested source page unavailable</option>}
        {discovery.pages.map(p => { const source = capture.narrative_sources.pages.find(s => s.page_id === p.page_id); return <option key={p.page_id} value={p.page_id}>PDF page {source?.page_number} · version {source?.source_id.slice(-8)} · {p.text_status.replaceAll('_', ' ')}</option>; })}
      </select></label>
      <label>Text accounting group<select aria-label="Text accounting group" value={category} onChange={e => onChange({ coverageCategory: e.target.value, coverageRowPage: 0 })}>
        <option value="">All retained text</option>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label} · {page?.accounting[key]?.length ?? 0}</option>)}
      </select></label>
    </div>
    {!page || !original ? <p role="alert">The exact requested page is unavailable in this capture. No other page has been substituted.</p> : <>
      <p>PDF page {original.page_number} · {page.text_status.replaceAll('_', ' ')} · {original.spans.length} retained spans · {page.regions.length} detected regions</p>
      <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Scrollable source accounting"><table aria-label="Retained source accounting"><thead><tr><th>Accounting</th><th>Original text</th><th>Evidence</th></tr></thead><tbody>
        {rows.slice(index * 50, (index + 1) * 50).map(row => <tr key={row.id}><td>{categories[row.category]}</td><td>{row.span ? row.span.text || 'Explicit blank' : 'Original span unavailable'}</td><td>
          <button type="button" disabled={!row.span || !onSource} onClick={() => onSource(pageId, row.span)}>View original source</button>
        </td></tr>)}
      </tbody></table></div>
      {!rows.length && <p>No retained spans in this selection. Discovery and applicability remain unverified.</p>}
      <div className="bas-point-controls"><button type="button" disabled={!index} onClick={() => onChange({ coverageRowPage: index - 1 })}>Previous text</button><span>{rows.length ? index * 50 + 1 : 0}–{Math.min(rows.length, (index + 1) * 50)} of {rows.length}</span><button type="button" disabled={(index + 1) * 50 >= rows.length} onClick={() => onChange({ coverageRowPage: index + 1 })}>Next text</button></div>
    </>}
  </section>;
}
