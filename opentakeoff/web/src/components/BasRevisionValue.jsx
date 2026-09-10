// Surface-only original-value reader. Paging never alters or truncates exports.
import { useState } from 'react';
export const revisionScalar = value => value === null ? 'Unknown / null' : value === '' ? 'Explicit blank' : String(value);
export default function BasRevisionValue({ value, label = 'Original value' }) {
  const [path, setPath] = useState([]), [page, setPage] = useState(0);
  const current = path.reduce((v, key) => v?.[key], value);
  const entries = current && typeof current === 'object' ? Object.entries(current) : null;
  const move = next => { setPath(next); setPage(0); };
  return <div className="bas-revision-value">
    <div className="bas-point-controls"><strong>{label}</strong>{!!path.length && <button type="button" onClick={() => move(path.slice(0, -1))}>↑ Parent field</button>}</div>
    {!!path.length && <p className="bas-revision-path">{path.join(' › ')}</p>}
    {!entries ? <p>{revisionScalar(current)}</p> : <>
      <div className="bas-point-grid"><table aria-label={label}><thead><tr><th scope="col">{Array.isArray(current) ? 'Entry' : 'Field'}</th><th scope="col">Original value</th></tr></thead><tbody>
        {entries.slice(page * 20, (page + 1) * 20).map(([key, child]) => <tr key={key}><th scope="row">{key}</th><td>{child && typeof child === 'object'
          ? <button type="button" onClick={() => move([...path, key])}>Explore {Object.keys(child).length} {Array.isArray(child) ? 'entries' : 'fields'}</button>
          : revisionScalar(child)}</td></tr>)}
      </tbody></table></div>
      {entries.length > 20 && <div className="bas-point-controls"><button type="button" disabled={!page} onClick={() => setPage(page - 1)}>Previous fields</button><span>{page * 20 + 1}–{Math.min((page + 1) * 20, entries.length)} of {entries.length}</span><button type="button" disabled={(page + 1) * 20 >= entries.length} onClick={() => setPage(page + 1)}>Next fields</button></div>}
    </>}
  </div>;
}
