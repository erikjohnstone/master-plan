// Surface-specific matrix reader. All meaning and quantities come from the
// shared point record; clicks never turn a printed flag into an installed count.
import { useEffect, useMemo, useState } from 'react';
import { activeBasCapture, verifyBasWorkflow } from '../lib/basWorkflow.ts';
import { downloadText } from '../lib/totals.js';
import { ANN_SCHEMA } from '../lib/store.js';
import './BasPointsWorkspace.css';

export default function BasPointsWorkspace({ workflow, onOpenCitation, viewState, onViewStateChange }) {
  const [validation, setValidation] = useState({ input: null, error: '', value: null });
  const [sourceError, setSourceError] = useState('');
  useEffect(() => {
    let live = true;
    verifyBasWorkflow(workflow).then(value => {
      if (live) setValidation({ input: workflow, value, error: '' });
    }).catch(error => {
      if (live) setValidation({ input: workflow, value: null, error: error.message });
    });
    return () => { live = false; };
  }, [workflow]);
  const ready = validation.input === workflow;
  const capture = ready && validation.value ? activeBasCapture(validation.value) : null;
  const matrices = capture?.points.matrices || [];
  const matrix = matrices.find(m => m.matrix_id === viewState?.matrixId) || matrices[0];
  const needle = (viewState?.filter || '').trim().toLowerCase();
  const visibleRows = useMemo(() => matrix?.raw.rows.map((raw, index) => ({ raw, index }))
    .filter(({ raw, index }) => index < matrix.header_rows || !needle || [raw.key, ...Object.values(raw.cells).map(c => c.text)].join(' ').toLowerCase().includes(needle)) || [], [matrix, needle]);
  const selected = matrix?.rows.find(r => r.row_id === viewState?.rowId);
  const change = patch => onViewStateChange({ ...viewState, ...patch });
  const sourceClick = async (box, text, column = '') => {
    setSourceError('');
    try {
      if (box && matrix?.page_id) {
        const result = await onOpenCitation?.({ page_id: matrix.page_id, source_id: matrix.source_id,
          sheet_id: matrix.raw.sheet, bbox_px: box, value: text, column, kind: 'row', table_title: matrix.raw.title?.text || '' });
        if (result?.error) setSourceError(result.error);
      }
    } catch (error) { setSourceError(error.message || 'Could not open the original source.'); }
  };
  if (!ready) return <p role="status" className="bas-point-message">Checking saved evidence…</p>;
  if (validation.error) return <section className="bas-point-message" role="alert"><h2>Saved BAS evidence needs attention</h2>
    <p>{validation.error}</p><p>The saved record has not been discarded. Recompile the original source before using it.</p></section>;
  if (!capture) return <p className="bas-point-message">No point-list capture is selected.</p>;
  return <section aria-label="Grounded point lists" className="bas-point-workspace">
    <div className="bas-point-controls">
      <label>Point list<select aria-label="Point list" value={matrix?.matrix_id || ''} onChange={e => change({ matrixId: e.target.value, rowId: null, filter: '' })}>
        {matrices.map(m => <option key={m.matrix_id} value={m.matrix_id}>{m.raw.title?.text || 'Untitled point list'} · PDF page {m.page_id?.split(':p').at(-1)}</option>)}
      </select></label>
      <label>Find a point<input aria-label="Find a point" value={viewState?.filter || ''} onChange={e => change({ filter: e.target.value })} placeholder="Description or printed value" /></label>
      <button type="button" onClick={() => downloadText('bas-point-evidence.takeoff.json', JSON.stringify({ schema: ANN_SCHEMA, bas_workflow: validation.value }, null, 2), 'application/json')}>Export point evidence</button>
    </div>
    <div className="bas-point-scope"><strong>{matrices.length} discovered matrices</strong><span>Listed requirements · not installed quantities</span>
      <span>Source-byte matching is checked when opening a citation. Historical PDFs are not included in this JSON.</span></div>
    {sourceError && <p role="alert">{sourceError}</p>}
    {!matrix ? <p>No point matrices were discovered. This does not establish that the drawings contain none.</p> : <>
      <div className="bas-point-heading"><h2>{matrix.raw.title?.text || 'Untitled point list'}</h2>
        <span>{matrix.rows.length} listed rows · {matrix.raw.headers.length} columns</span>
        <button type="button" disabled={!matrix.raw.region || !onOpenCitation} onClick={() => sourceClick(matrix.raw.region, matrix.raw.title?.text || '')}>View matrix on drawing</button>
      </div>
      <div className="bas-point-grid" tabIndex={0} role="region" aria-label="Scrollable point matrix">
        <table aria-label="Original point-list matrix"><thead><tr><th scope="col">Row</th>
          {matrix.raw.headers.map((header, index) => <th scope="col" key={index}>{header}</th>)}
        </tr></thead><tbody>{visibleRows.map(({ raw, index }) => {
          const row = matrix.rows[index - matrix.header_rows];
          return <tr key={index} data-selected={!!row && row.row_id === selected?.row_id}>
            <th scope="row">{row ? <button type="button" aria-label={`Inspect point ${row.local_key}: ${row.name}`} aria-pressed={row.row_id === selected?.row_id}
              onClick={() => change({ rowId: row.row_id })}>{row.local_key || 'Unnamed'}</button> : 'Header'}</th>
            {matrix.raw.headers.map((header, columnIndex) => {
              const cell = raw.cells[header];
              return <td key={columnIndex}>{!cell ? <span title="No cell supplied by extraction" aria-label="Not observed">—</span>
                : cell.bbox && cell.text.trim() && onOpenCitation ? <button type="button" className="bas-point-cell" title={`View source: ${header}`} onClick={() => sourceClick(cell.bbox, cell.text, header)}>{cell.text}</button>
                : <span aria-label={cell.text.trim() ? undefined : 'Explicit blank'}>{cell.text || '\u00a0'}</span>}</td>;
            })}
          </tr>;
        })}</tbody></table>
      </div>
      {visibleRows.length === matrix.header_rows && needle && <p role="status">No listed points match this filter. Export still contains every row.</p>}
      {selected && <section className="bas-point-detail" aria-label="Selected point interpretation">
        <div className="bas-point-heading"><h3>{selected.local_key} · {selected.name || 'Unpopulated row'}</h3><button type="button" onClick={() => change({ rowId: null })}>Close details</button></div>
        <p>{selected.status.replaceAll('_', ' ')} · Field wiring not established</p>
        <dl>{selected.observations.map((o, i) => <div key={i}><dt>{o.channel} · {o.kind.replaceAll('_', ' ')}</dt><dd>{o.value == null ? 'Ambiguous' : o.value} <button type="button" disabled={!o.source.bbox_px} onClick={() => sourceClick(o.source.bbox_px, o.source.text, o.source.column)}>Source</button></dd></div>)}</dl>
        {selected.qualifiers.map((q, i) => <p key={i}>{q.source.text} <button type="button" disabled={!q.source.bbox_px} onClick={() => sourceClick(q.source.bbox_px, q.source.text)}>View note</button></p>)}
        {!!selected.unobserved_columns.length && <p>Not observed: {selected.unobserved_columns.join(', ')}. Missing cells have not been replaced with zeros.</p>}
        {!!selected.uninterpreted_columns.length && <p>Not interpreted: {selected.uninterpreted_columns.join(', ')}.</p>}
        {[...matrix.issues, ...selected.issues].map((issue, i) => <p key={i}>{issue}</p>)}
      </section>}
      <details className="bas-point-disclosure"><summary>Coverage and source record</summary>
        <p>Only discovered matrices are represented. This is not complete SOO coverage, verified equipment assignment, or a reviewed takeoff release.</p>
        {capture.sources.map(s => <p key={s.source_id}>{s.names.join(', ')} · {s.page_count} PDF pages <code>{s.source_id}</code></p>)}
        {capture.points.issues.map((issue, i) => <p key={i}>{issue}</p>)}
      </details>
    </>}
  </section>;
}
