import { completeBasJourneyStages } from '../lib/completeBasPresentation.js';
import './BasTakeoffJourney.css';

const stateLabel = {
  available: 'Ready',
  attention: 'Review needed',
  blocked: 'Needs setup',
  verified: 'Approved',
};

export default function BasTakeoffJourney({ corpusMeta, activeStage = 'scope', approved = false, onNavigate }) {
  const stages = completeBasJourneyStages(corpusMeta, { approved });
  const activeIndex = Math.max(0, stages.findIndex(stage => stage.id === activeStage));
  const position = approved ? 100 : stages.length > 1 ? (activeIndex / (stages.length - 1)) * 100 : 0;

  return <section className={`bas-journey${approved ? ' bas-journey--verified' : ''}`} aria-label="BAS takeoff verification workflow" data-bas-review-journey>
    <div className="bas-journey__heading">
      <div>
        <span>Takeoff review</span>
        <strong>Step {activeIndex + 1} of {stages.length} · {stages[activeIndex].label}</strong>
      </div>
      <div className={`bas-journey__release bas-journey__release--${approved ? 'verified' : 'pending'}`}>
        {approved ? 'Scoped takeoff verified' : 'Takeoff not yet verified'}
      </div>
    </div>
    <div className="bas-journey__track" aria-hidden="true">
      <span style={{ width: `${position}%` }} />
    </div>
    <nav className="bas-journey__stages" aria-label="Takeoff review stages">
      {stages.map((stage, index) => <button
        key={stage.id}
        type="button"
        className={`bas-journey-stage bas-journey-stage--${stage.state}${index === activeIndex ? ' is-current' : ''}`}
        aria-current={index === activeIndex ? 'step' : undefined}
        onClick={() => onNavigate?.(stage.id)}
        data-bas-journey-stage={stage.id}
      >
        <span className="bas-journey-stage__number">{String(index + 1).padStart(2, '0')}</span>
        <span className="bas-journey-stage__copy">
          <strong>{stage.label}</strong>
          <small>{stage.detail}</small>
        </span>
        <span className="bas-journey-stage__state">{stateLabel[stage.state]}</span>
      </button>)}
    </nav>
    <div className="bas-journey__instruction" aria-live="polite">
      <span>What to do now</span>
      <strong>{stages[activeIndex].instruction}</strong>
      <small>Done when: {stages[activeIndex].doneWhen}</small>
    </div>
    <p className="bas-journey__boundary">Checking a source or opening a step does not approve it. Only the final scoped snapshot records estimator approval.</p>
  </section>;
}
