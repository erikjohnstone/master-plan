/** Surface-only reader for persisted Python derivations. No quantity math. */
export default function BasAssignedValues({ calculation, assignmentId, stale, page: selectedPage, onPage, onSource, open, onOpenChange }) {
  const result = calculation?.result.assignments.find(a => a.assignment.assignment_id === assignmentId);
  if (!result) return null;
  const lines = result.rows.flatMap(row => row.observations.map(observation => ({ row, observation })));
  const page = Math.max(0, Math.min(selectedPage || 0, Math.ceil(lines.length / 50) - 1));
  return <details className="bas-point-disclosure" aria-label="Assigned listed values" open={!!open} onToggle={e => { if (e.currentTarget.open !== !!open) onOpenChange(e.currentTarget.open); }}>
    <summary>Assigned listed values · {stale ? 'Earlier decisions — recalculate' : `× ${result.replication_factor} applications`}</summary>
    {stale && <p role="status">Historical result. Equipment decisions have changed; these values are not current.</p>}
    <p>{result.assignment.applicability === 'system_once' ? 'The entire system matrix is applied once when its selection is nonempty.' : 'Each source value is applied to every included named equipment item.'} This is a listed-value derivation, not a verified installation or field-wiring count.</p>
    <p>Known listed I/O subtotal: {Object.entries(result.known_listed_io_subtotal).map(([channel, value]) => `${channel} ${value}`).join(' · ')}.</p>
    {!!result.known_listed_software_subtotals.length && <p>Known listed software: {result.known_listed_software_subtotals.map(s => `${s.channel} ${s.known_listed_value}`).join(' · ')}.</p>}
    <p>{result.unobserved_typed_cells} typed cells not observed · {result.ambiguous_observations} ambiguous observations. Subtotals include known observations only; repeated physical requirements are not resolved or combined into a project total.</p>
    <div className="bas-point-grid" role="region" tabIndex={0} aria-label="Scrollable assigned values">
      <table aria-label="Assigned value derivation"><thead><tr><th>Point</th><th>Kind / channel</th><th>Listed value</th><th>Applications</th><th>Assigned value</th><th>Evidence</th></tr></thead><tbody>
        {lines.slice(page * 50, (page + 1) * 50).map(({ row, observation: o }) => <tr key={o.observation_id}>
          <th scope="row">{row.name || 'Unresolved point name'}{!!row.qualifiers.length && <small>{row.qualifiers.map(q => q.subject).join(' · ')} — wiring unverified</small>}</th>
          <td>{o.original.kind.replaceAll('_', ' ')} · {o.original.channel}</td>
          <td>{o.original.value ?? 'Unknown'}</td><td>{o.original.kind === 'attribute' ? '—' : result.replication_factor}</td>
          <td>{o.status === 'attribute_not_quantity' ? 'Attribute, not quantity' : o.assigned_value ?? 'Unknown'}</td>
          <td><button type="button" disabled={!o.original.source.page_id || !o.original.source.bbox_px}
            onClick={() => onSource(o.original.source.page_id, o.original.source.bbox_px, o.original.source.text)}>View source cell</button>
            <small>Printed: {o.original.source.text || '(explicit blank)'}</small></td>
        </tr>)}
      </tbody></table>
    </div>
    {lines.length > 50 && <nav aria-label="Assigned value pages" className="bas-point-controls">
      <button type="button" disabled={!page} onClick={() => onPage(page - 1)}>Previous values</button>
      <span>Values {page * 50 + 1}–{Math.min(lines.length, (page + 1) * 50)} of {lines.length}</span>
      <button type="button" disabled={(page + 1) * 50 >= lines.length} onClick={() => onPage(page + 1)}>Next values</button>
    </nav>}
    <details><summary>Source gaps, qualifications and calculation record</summary>
      {result.issues.map(issue => <p key={issue}>{issue.replaceAll('_', ' ')}</p>)}
      {result.rows.filter(row => row.issues.length || row.unobserved_typed_columns.length || row.uninterpreted_columns.length).map(row => <p key={row.row_id}>
        {row.name || row.row_id}: {[...row.issues, ...row.unobserved_typed_columns.map(c => `Not observed: ${c}`), ...row.uninterpreted_columns.map(c => `Not interpreted: ${c}`)].join(' · ')}
      </p>)}
      <p>Rule: {calculation.result.rule_version} · Engine: {calculation.result.engine} · Recorded: {calculation.created_at}</p>
      <p>Capture: <code>{calculation.result.capture_id}</code></p><p>Equipment decision: <code>{calculation.result.equipment_head}</code></p>
      <p>Calculation: <code>{calculation.calculation_id}</code></p>
    </details>
  </details>;
}
