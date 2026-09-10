/** Surface-only rendering of saved shared-Python outcomes and original inputs.
 * No source interpretation, readiness decision or calculation happens here. */
import { engineeringInputAtPath, engineeringArrayIndex } from './basEngineeringEditorState.ts';
import { humanEngineering as human } from './BasEngineeringFields.jsx';

export const engineeringStatusLabel = status => ({ pass: 'Pass for this constraint', fail: 'Fails declared constraint', not_evaluable: 'Not evaluable' })[status] || 'Not calculated';

export function EngineeringInputLink({ check, path, onField }) {
  const value = engineeringInputAtPath(check, path);
  const basis = value && typeof value === 'object' ? value.basis : null;
  const label = value == null ? 'Unknown / not provided' : basis?.origin === 'drawing_transcription'
    ? 'Manually transcribed from drawing' : basis?.origin === 'explicit_input' ? 'Explicit input — not extracted' : 'Recorded input';
  return <div className="bas-engineering-input-link"><button type="button" onClick={() => onField(check.check_id, path)}>{human(path)}</button>
    <small>{label}{basis?.source_span_ids?.length ? ` · ${basis.source_span_ids.length} drawing references` : ''}</small></div>;
}

export default function BasEngineeringResults({ result, register, checkId, onField, page = 0, onPage = () => {} }) {
  const checks = checkId ? result?.checks.filter(c => c.check_id === checkId) : result?.checks;
  if (!checks?.length) return <p>No saved calculation for this selection.</p>;
  const total = checks.reduce((sum, check) => sum + check.constraints.length, 0), pages = Math.max(1, Math.ceil(total / 50));
  const current = engineeringArrayIndex(page, pages), rows = [];
  const inputs = new Map((register?.input.checks || []).map(check => [check.check_id, check]));
  let offset = 0;
  for (const check of checks) {
    for (let i = 0; i < check.constraints.length; i++, offset++) {
      if (offset >= current * 50 && offset < (current + 1) * 50) rows.push({ check, row: check.constraints[i], i });
    }
  }
  return <>
    <p>Calculated from recorded inputs. Drawing transcriptions and explicit declarations are shown below; a pass is not verification of installed hardware or the entire design.</p>
    <div className="bas-point-grid bas-engineering-result" role="region" tabIndex={0} aria-label="Scrollable engineering outcomes"><table aria-label="Engineering outcomes">
      <thead><tr><th>Constraint</th><th>Outcome</th><th>Explanation &amp; exact comparison</th><th>Original inputs &amp; provenance</th></tr></thead><tbody>
        {rows.map(({ check, row, i }) => <tr key={`${check.check_id}:${i}`}><th scope="row">{human(row.rule_id)}</th>
          <td data-status={row.status}>{engineeringStatusLabel(row.status)}</td><td>{row.message}
            {!!row.missing_inputs.length && <p>Missing: {row.missing_inputs.map(human).join(', ')}</p>}
            {!!Object.keys(row.normalized).length && <details><summary>Exact normalized values</summary>{Object.entries(row.normalized).map(([key, value]) => <p key={key}>{human(key)}: <span className="bas-engineering-verbatim">{value}</span></p>)}</details>}
          </td><td>{row.input_paths.map(path => <EngineeringInputLink key={path} check={inputs.get(check.check_id) || { check_id: check.check_id }} path={path} onField={onField} />)}</td></tr>)}
      </tbody></table></div>
    {pages > 1 && <div className="bas-point-controls"><button disabled={!current} onClick={() => onPage(current - 1)}>Previous outcomes</button>
      <span>{total} constraints · page {current + 1} of {pages}</span><button disabled={current + 1 >= pages} onClick={() => onPage(current + 1)}>Next outcomes</button></div>}
  </>;
}
