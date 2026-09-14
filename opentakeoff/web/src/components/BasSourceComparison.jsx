import './BasSourceComparison.css';

function EvidenceCard({ kind, evidence, onOpenCitation }) {
  const plan = kind === 'plan';
  const evidenceKind = evidence?.citation?.evidence_kind || (plan ? 'plan' : 'schedule');
  const diagram = plan && evidenceKind !== 'plan';
  const diagramLabel = evidenceKind === 'piping' ? 'Piping-diagram evidence'
    : evidenceKind === 'riser' ? 'Riser evidence'
      : evidenceKind === 'flow' ? 'Flow-diagram evidence'
        : 'Control-schematic evidence';
  const symbolOverlay = evidence.overlays?.find((overlay) => overlay.role === 'symbol');
  const tagOverlay = evidence.overlays?.find((overlay) => overlay.role === 'tag');
  return <article className="bas-source-comparison-card" data-evidence-kind={kind} data-source-sheet={evidence.sheet_id}>
    <header>
      <div><span>{plan ? (diagram ? diagramLabel : 'Installed-plan evidence') : 'Scheduled equipment evidence'}</span>
        <h3>{plan ? (diagram ? 'Authored diagram occurrence' : tagOverlay ? 'Verified symbol + printed tag' : 'Grounded plan match') : 'Exact schedule row'}</h3></div>
      <div className="bas-source-comparison-actions">
        <button type="button" onClick={() => onOpenCitation(evidence.citation)}>
          Open {plan && !diagram ? 'symbol' : 'on drawing'}
        </button>
        {plan && tagOverlay?.citation && <button type="button" onClick={() => onOpenCitation(tagOverlay.citation)}>
          Open tag
        </button>}
      </div>
    </header>
    <p>{evidence.sheet_label} · {symbolOverlay ? 'symbol' : 'original'} bbox {evidence.citation.bbox_px.map(value => Math.round(value)).join(', ')}</p>
    {plan && symbolOverlay && tagOverlay && <div className="bas-source-comparison-legend" aria-label="Plan evidence colors">
      <span><i style={{ '--evidence-color': symbolOverlay.color }} />Blue: physical symbol</span>
      <span><i style={{ '--evidence-color': tagOverlay.color }} />Orange: exact printed tag</span>
    </div>}
    <div className="bas-source-comparison-image">
      <img src={evidence.image_url} alt={`${plan ? (diagram ? 'Diagram tag' : tagOverlay ? 'Plan symbol in blue and its printed tag in orange' : 'Plan symbol') : 'Schedule row'} evidence on ${evidence.sheet_label}, with the exact citation outlined.`} />
    </div>
    <small>{plan
      ? (diagram
        ? 'Exact authored diagram tag. This corroborates design intent but does not establish installed-plan quantity.'
        : tagOverlay
          ? 'The orange tag identifies the blue physical body through the drawing’s authored adjacency or leader. Both must be present for installed quantity.'
          : 'Verified physical vector body used for the installed-plan observation.')
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
