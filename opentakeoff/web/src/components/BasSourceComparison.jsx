import './BasSourceComparison.css';

function EvidenceCard({ kind, evidence, onOpenCitation }) {
  const plan = kind === 'plan';
  return <article className="bas-source-comparison-card" data-evidence-kind={kind} data-source-sheet={evidence.sheet_id}>
    <header>
      <div><span>{plan ? 'Installed-plan evidence' : 'Scheduled equipment evidence'}</span>
        <h3>{plan ? 'Grounded plan match' : 'Exact schedule row'}</h3></div>
      <button type="button" onClick={() => onOpenCitation(evidence.citation)}>
        Open on drawing
      </button>
    </header>
    <p>{evidence.sheet_label} · original bbox {evidence.citation.bbox_px.map(value => Math.round(value)).join(', ')}</p>
    <div className="bas-source-comparison-image">
      <img src={evidence.image_url} alt={`${plan ? 'Plan symbol' : 'Schedule row'} evidence on ${evidence.sheet_label}, with the exact citation outlined.`} />
    </div>
    <small>{plan
      ? 'Detected marker/tag used for the installed-plan observation.'
      : 'Row identity and leading columns. Open on drawing to inspect the complete source row.'}</small>
  </article>;
}

export default function BasSourceComparison({ comparison, onBack, onOpenCitation }) {
  return <section className="bas-source-comparison" role="region" aria-label="Matched plan and schedule evidence"
    data-comparison-tag={comparison.tag || ''} data-plan-sheet={comparison.plan.sheet_id} data-schedule-sheet={comparison.schedule.sheet_id}>
    <header className="bas-source-comparison-heading">
      <button type="button" onClick={onBack}>← Back to takeoff</button>
      <div><span>Source comparison</span><h2>{comparison.tag || 'Matched equipment'}</h2>
        <p>Read-only evidence. A geometric match does not approve the quantity or release the takeoff.</p>
        {comparison.facts && <p className="bas-source-comparison-facts">
          <strong>{comparison.facts.status || 'MATCH'}</strong>
          <span>Scheduled {comparison.facts.scheduled_qty ?? '—'}</span>
          <span>Installed observation {comparison.facts.installed_qty ?? '—'}</span>
        </p>}</div>
    </header>
    <div className="bas-source-comparison-grid">
      <EvidenceCard kind="plan" evidence={comparison.plan} onOpenCitation={onOpenCitation} />
      <EvidenceCard kind="schedule" evidence={comparison.schedule} onOpenCitation={onOpenCitation} />
    </div>
  </section>;
}
