// Surface-specific, isolated PDF rendering. No active-document registration,
// extraction, overlays, annotation writes, or externally supplied PDF actions.
import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { RENDER_SCALE } from '../lib/sheets.ts';
import { prepareBasSourceView, assertBasSourceViewFrame, basSourceViewRegion } from '../lib/basSourceView.ts';
import { findBasOriginal } from '../lib/basSourceBrowser.js';
import { store } from '../lib/store.js';
import './BasSourceReader.css';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const MAX_EDGE = 2000;

export default function BasSourceReader({ workflow, request, adapter, onBack }) {
  const [loaded, setLoaded] = useState(null), [error, setError] = useState('');
  const [pageNumber, setPageNumber] = useState(Number(request.page_id.split(':p').at(-1)));
  const [focus, setFocus] = useState(!!request.bbox_px), [zoom, setZoom] = useState('fit');
  const [rendered, setRendered] = useState(null), [rendering, setRendering] = useState(true);
  const token = useRef(null), heading = useRef(null), mount = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    const operation = {}; token.current = operation;
    const current = () => token.current === operation && store === adapter;
    let loading;
    setError(''); setLoaded(null);
    (async () => {
      const view = await prepareBasSourceView(workflow, { page_id: request.page_id, ...(request.bbox_px ? { bbox_px: request.bbox_px } : {}) });
      if (!current()) return;
      const bytes = await findBasOriginal(adapter, view, current);
      if (!current()) return;
      // findBasOriginal returns an owned, verified copy, safe to transfer.
      loading = pdfjs.getDocument({ data: bytes, isEvalSupported: false, enableXfa: false });
      loading.onPassword = () => { if (current()) setError('This original is password-protected. It cannot be reviewed here without its password; no substitute was opened.'); void loading.destroy().catch(() => {}); };
      const doc = await loading.promise;
      if (current()) setLoaded({ doc, view, operation });
    })().catch(e => { if (current()) setError(e.message); });
    return () => { if (token.current === operation) token.current = null; void loading?.destroy().catch(() => {}); };
  }, [workflow, request, adapter]);

  useEffect(() => {
    if (!loaded) return;
    let active = true, renderTask;
    const current = () => active && token.current === loaded.operation && store === adapter;
    setRendering(true); setError(''); setRendered(null); mount.current?.replaceChildren();
    (async () => {
      const atCitation = pageNumber === loaded.view.page_number;
      const view = atCitation ? loaded.view : await prepareBasSourceView(workflow, { page_id: `${loaded.view.source.source_id}:p${pageNumber}` });
      if (!current()) return;
      const page = await loaded.doc.getPage(pageNumber);
      if (!current()) return;
      const original = page.getViewport({ scale: RENDER_SCALE });
      assertBasSourceViewFrame(view, { page_count: loaded.doc.numPages, width_px: original.width, height_px: original.height, rotation: page.rotate });
      const region = basSourceViewRegion(view, original.width, original.height, atCitation && focus);
      const scale = MAX_EDGE / Math.max(region.x1 - region.x0, region.y1 - region.y0);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((region.x1 - region.x0) * scale));
      canvas.height = Math.max(1, Math.round((region.y1 - region.y0) * scale));
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Original PDF page ${pageNumber}${view.bbox_px ? ' with original citation outlined' : ''}. Source wording is shown above when supplied.`);
      const context = canvas.getContext('2d');
      const viewport = page.getViewport({ scale: RENDER_SCALE * scale, offsetX: -region.x0 * scale, offsetY: -region.y0 * scale });
      renderTask = page.render({ canvasContext: context, viewport, background: '#ffffff' });
      await renderTask.promise;
      if (!current()) return;
      if (view.bbox_px) {
        const [x0, y0, x1, y1] = view.bbox_px;
        // Display-only outline on the isolated canvas. Original bbox unchanged.
        context.strokeStyle = '#1f3fc7'; context.lineWidth = 2;
        context.strokeRect((x0 - region.x0) * scale, (y0 - region.y0) * scale, (x1 - x0) * scale, (y1 - y0) * scale);
      }
      mount.current?.replaceChildren(canvas);
      setRendered({ page_id: view.page_id, bbox_px: view.bbox_px, frame: view.frame, region, width: canvas.width, height: canvas.height });
      setRendering(false);
    })().catch(e => { if (current()) { setError(e.message); setRendering(false); } });
    return () => { active = false; renderTask?.cancel(); };
  }, [loaded, pageNumber, focus, workflow, adapter]);

  const citationPage = loaded?.view.page_number;
  return <section className="bas-source-reader" aria-label="Original source reader" onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); onBack(); }
  }}>
    <header className="bas-source-reader-heading"><button type="button" onClick={onBack}>← Back to takeoff</button>
      <div><h2 ref={heading} tabIndex={-1}>Original source</h2><p>Read-only evidence · not added to the active drawing set</p></div></header>
    <div className="bas-source-reader-info">
      <strong>{loaded?.view.names.join(' / ') || (error ? 'Original could not be verified' : 'Checking exact PDF identity…')}</strong>
      {request.value && <p className="bas-source-reader-quote">Source wording: {String(request.value)}</p>}
      <details><summary>Source identity &amp; original coordinates</summary><code>{request.page_id}</code>
        <p>Original citation box: {request.bbox_px ? JSON.stringify(request.bbox_px) : 'No located highlight requested'}</p>
        {loaded && <p>Exact bytes verified · {loaded.view.source.byte_length.toLocaleString()} bytes · {loaded.view.source.page_count} pages</p>}
        {rendered && <p>{rendered.frame ? 'Saved page frame verified' : 'No saved frame in legacy history; whole-page inspection only'} · no quantity, review or approval changed.</p>}</details>
    </div>
    <nav className="bas-source-reader-controls" aria-label="Original PDF navigation">
      <button type="button" disabled={!loaded || pageNumber <= 1} onClick={() => setPageNumber(n => n - 1)}>Previous page</button>
      {loaded ? <><label>Page<input aria-label="Original PDF page" type="number" min={1} max={loaded.view.source.page_count} value={pageNumber}
        onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= loaded.view.source.page_count) setPageNumber(n); }} /></label>
      <span>of {loaded.view.source.page_count}</span></> : <span>Page {pageNumber} · unverified</span>}
      <button type="button" disabled={!loaded || pageNumber >= loaded.view.source.page_count} onClick={() => setPageNumber(n => n + 1)}>Next page</button>
      <button type="button" disabled={!loaded || !request.bbox_px} aria-pressed={pageNumber === citationPage && focus}
        onClick={() => { setPageNumber(citationPage); setFocus(true); setZoom('fit'); }}>Focus citation</button>
      <button type="button" disabled={!loaded} aria-pressed={!focus} onClick={() => { setFocus(false); setZoom('fit'); }}>Whole page</button>
      <label>Display<select aria-label="Source display size" value={zoom} onChange={e => setZoom(e.target.value)}><option value="fit">Fit</option><option value="1">100%</option><option value="2">200%</option></select></label>
    </nav>
    {error ? <p role="alert" className="bas-source-reader-error">Could not open the original: {error}</p> :
      <p role="status" className="bas-source-reader-status">{!loaded ? 'Verifying original PDF…' : rendering ? 'Rendering original page…' : `Original page ${pageNumber} ready${rendered?.bbox_px ? ' · citation outlined in blue' : ''}`}</p>}
    <div className={`bas-source-viewport ${zoom === 'fit' ? 'is-fit' : 'is-zoomed'}`} tabIndex={0} role="region" aria-label="Scrollable original PDF">
      <div ref={mount} className="bas-source-render" style={zoom !== 'fit' && rendered ? { width: rendered.width * Number(zoom), height: rendered.height * Number(zoom) } : undefined} />
    </div>
  </section>;
}
