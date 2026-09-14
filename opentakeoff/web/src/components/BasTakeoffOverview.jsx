import { completeBasEstimatorOverview } from '../lib/completeBasPresentation.js';
import './BasTakeoffOverview.css';

const ioChannels = ['AI', 'AO', 'DI', 'DO'];

function Metric({ value, label, detail, tone = 'neutral' }) {
  return <article className={`bas-overview-metric bas-overview-metric--${tone}`}>
    <div className="bas-overview-metric__value">{value}</div>
    <h3>{label}</h3>
    <p>{detail}</p>
  </article>;
}

function ActionButton({ children, onClick, primary = false }) {
  return <button type="button" className={`bas-overview-action${primary ? ' bas-overview-action--primary' : ''}`} onClick={onClick}>
    {children}
  </button>;
}

export default function BasTakeoffOverview({ corpusMeta, citedFieldCount = 0, onNavigate }) {
  const summary = completeBasEstimatorOverview(corpusMeta);
  const c = summary.coverage;
  const hasPointMath = summary.typedPointTotal > 0;

  return <div className="bas-overview" data-bas-estimator-overview>
    <section className="bas-overview-hero" aria-labelledby="bas-overview-title">
      <div>
        <div className="bas-overview-eyebrow">AUTOMATED DRAFT · HUMAN APPROVAL REQUIRED</div>
        <h2 id="bas-overview-title">Review your BAS takeoff one step at a time</h2>
        <p>{summary.primaryMessage} OpenTakeoff organized the drawing evidence. You choose what belongs in the bid and approve only after the sources have been checked.</p>
      </div>
      <div className="bas-overview-hero__actions">
        <ActionButton primary onClick={() => onNavigate?.('scope')}>Define included scope</ActionButton>
        <ActionButton onClick={() => onNavigate?.('equipment')}>Review equipment</ActionButton>
      </div>
    </section>

    <section className="bas-overview-section" aria-labelledby="bas-overview-scope">
      <div className="bas-overview-section__heading">
        <div>
          <span className="bas-overview-step">01</span>
          <h2 id="bas-overview-scope">Scope found</h2>
        </div>
        <p>Separate source record types—never one misleading grand quantity.</p>
      </div>
      <div className="bas-overview-metrics">
        <Metric value={c.equipmentRecords} label="Equipment records" detail="Rows retained from equipment schedules" />
        <Metric value={c.valveRecords} label="Valve records" detail={c.coilGaps ? `${c.coilGaps} coil-related scope gaps need review` : 'No embedded coil gaps reported'} tone={c.coilGaps ? 'attention' : 'neutral'} />
        <Metric value={c.pointLists} label="BAS point lists" detail={`${c.pointRows} listed point requirements`} />
        <Metric value={c.sequences} label="Control sequences" detail={`${c.sequenceSections} source sections retained`} />
        <Metric value={c.schematics + c.risers} label="Control diagrams" detail={`${c.schematics} schematics · ${c.risers} riser/flow diagrams`} />
        <Metric value={citedFieldCount.toLocaleString()} label="Cited fields" detail="Source-linked values available for audit" />
      </div>
    </section>

    <div className="bas-overview-columns">
      <section className="bas-overview-section bas-overview-grounding" aria-labelledby="bas-overview-grounding">
        <div className="bas-overview-section__heading bas-overview-section__heading--stacked">
          <div><span className="bas-overview-step">02</span><h2 id="bas-overview-grounding">Plan grounding</h2></div>
          <p>Scheduled equipment compared with drawn plan evidence.</p>
        </div>
        {c.reconcileRows > 0 ? <>
          <div className="bas-overview-grounding__score">
            <strong>{summary.planCoveragePercent}%</strong>
            <span>{c.reconcileMatches} matched · {c.reconcileExceptions} need review</span>
          </div>
          <div className="bas-overview-progress" role="progressbar" aria-label="Schedule items with grounded plan matches" aria-valuemin="0" aria-valuemax="100" aria-valuenow={summary.planCoveragePercent}>
            <span style={{ width: `${summary.planCoveragePercent}%` }} />
          </div>
          <dl className="bas-overview-breakdown">
            <div><dt>Schedule only</dt><dd>{c.reconcileScheduleOnly}</dd></div>
            <div><dt>Plan only</dt><dd>{c.reconcilePlanOnly}</dd></div>
            <div><dt>Ambiguous</dt><dd>{c.reconcileAmbiguous}</dd></div>
            <div><dt>Refused</dt><dd>{c.reconcileRefused}</dd></div>
          </dl>
          <ActionButton onClick={() => onNavigate?.('grounding')}>Compare schedule rows with drawings</ActionButton>
        </> : <div className="bas-overview-empty">
          <strong>Plan grounding not established</strong>
          <p>No safe schedule-to-plan comparison was retained. This is not evidence of zero installed equipment.</p>
          <ActionButton onClick={() => onNavigate?.('grounding')}>Inspect takeoff evidence</ActionButton>
        </div>}
      </section>

      <section className="bas-overview-section bas-overview-points" aria-labelledby="bas-overview-points">
        <div className="bas-overview-section__heading bas-overview-section__heading--stacked">
          <div><span className="bas-overview-step">03</span><h2 id="bas-overview-points">BAS point requirements</h2></div>
          <p>Typed source requirements—not controller selection or installed device counts.</p>
        </div>
        {hasPointMath ? <>
          <div className="bas-overview-io-grid">
            {ioChannels.map(channel => <div key={channel}><span>{channel}</span><strong>{summary.physical[channel]}</strong></div>)}
          </div>
          <p className="bas-overview-note">{summary.typedPointTotal} typed physical I/O requirements · {summary.mathIssueCount} engineering evidence issues</p>
        </> : <div className="bas-overview-empty"><strong>Typed I/O totals unavailable</strong><p>Review the retained point matrices before assigning hardware.</p></div>}
        <ActionButton onClick={() => onNavigate?.('points')}>Review BAS points</ActionButton>
        <ActionButton onClick={() => onNavigate?.('sequences')}>Review sequences</ActionButton>
      </section>
    </div>

    <section className="bas-overview-section bas-overview-review" aria-labelledby="bas-overview-review">
      <div className="bas-overview-section__heading">
        <div><span className="bas-overview-step">04</span><h2 id="bas-overview-review">What needs your decision</h2></div>
        <p>A short queue instead of thousands of raw fields.</p>
      </div>
      {summary.reviewTasks.length ? <div className="bas-overview-task-list">
        {summary.reviewTasks.map(task => <article key={task.id} className={`bas-overview-task bas-overview-task--${task.severity}`}>
          <div className="bas-overview-task__count"><strong>{task.count}</strong><span>{task.noun}</span></div>
          <div className="bas-overview-task__body"><h3>{task.title}</h3><p>{task.detail}</p></div>
          <ActionButton onClick={() => onNavigate?.(task.action)}>{task.actionLabel}</ActionButton>
        </article>)}
      </div> : <div className="bas-overview-empty"><strong>No automated exceptions were reported.</strong><p>Final source review and estimator release are still required.</p></div>}
    </section>

    <footer className="bas-overview-footer">
      <div><strong>Release status: Not approved</strong><span>Review evidence, resolve exceptions, then use Review &amp; changes to release or export.</span></div>
      <ActionButton primary onClick={() => onNavigate?.('release')}>Verify &amp; export scope</ActionButton>
    </footer>
  </div>;
}
