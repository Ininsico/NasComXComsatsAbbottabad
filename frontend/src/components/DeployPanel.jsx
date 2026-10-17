import {
  Circle,
  CircleCheckBig,
  Clock,
  CloudUpload,
  Hourglass,
  LoaderCircle,
  Server,
  TriangleAlert,
} from 'lucide-react';

function StageIcon({ state }) {
  if (state === 'done') return <CircleCheckBig size={16} aria-hidden="true" />;
  if (state === 'current') return <LoaderCircle size={16} className="spin" aria-hidden="true" />;
  if (state === 'failed') return <TriangleAlert size={16} aria-hidden="true" />;

  return <Circle size={16} aria-hidden="true" />;
}

/** What docker says about a service, expressed as a tone the UI can colour. */
function containerTone(container) {
  const state = (container.state ?? '').toLowerCase();
  const health = (container.health ?? '').toLowerCase();

  if (health === 'healthy' || (state === 'running' && !health)) return 'done';
  if (health === 'unhealthy' || state === 'restarting' || state === 'exited' || state === 'dead') {
    return 'problem';
  }

  return 'pending';
}

const CONTAINER_LABELS = {
  frontend: 'Web app (nginx)',
  backend: 'API (Express)',
  ai: 'AI service (voice, embeddings)',
  chroma: 'Vector database (Chroma)',
  rabbitmq: 'Audio queue (RabbitMQ)',
};

function elapsedLabel(startedAt, now) {
  const from = Date.parse(startedAt ?? '');

  if (!Number.isFinite(from)) return null;

  const seconds = Math.max(0, Math.round((now - from) / 1000));

  if (seconds < 60) return `${seconds}s`;

  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function clockLabel(value) {
  const at = Date.parse(value ?? '');

  return Number.isFinite(at) ? new Date(at).toLocaleTimeString() : null;
}

export default function DeployPanel({ status, now }) {
  const running = status?.inProgress === true;
  const failed = status?.stage === 'failed';
  const percent = Math.max(0, Math.min(100, status?.percent ?? 0));
  const containers = status?.containers ?? [];
  const took = running ? elapsedLabel(status?.startedAt, now) : null;

  return (
    <div className="deploy-panel">
      <div className="deploy-panel__head">
        <span
          className={`deploy-panel__icon${running ? ' is-running' : ''}${failed ? ' is-failed' : ''}`}
        >
          {running ? (
            <CloudUpload size={26} aria-hidden="true" />
          ) : failed ? (
            <TriangleAlert size={26} aria-hidden="true" />
          ) : (
            <CircleCheckBig size={26} aria-hidden="true" />
          )}
        </span>

        <div>
          <h1 className="deploy-panel__title">
            {running
              ? 'Deploying an update'
              : failed
                ? 'The last deployment failed'
                : 'Everything is up to date'}
          </h1>
          <p className="deploy-panel__subtitle">
            {running
              ? (status?.stageLabel ?? 'Working')
              : failed
                ? (status?.message ?? 'Open the Actions run for the reason.')
                : 'No deployment is running right now.'}
          </p>
        </div>
      </div>

      <div>
        <div className="deploy-panel__prolabels">
          <span className="label-micro">{running ? 'Progress' : 'Last run'}</span>
          <span className="deploy-panel__percent">{percent}%</span>
        </div>

        <div
          className={`deploy-panel__track${failed ? ' is-failed' : ''}`}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Deployment progress"
        >
          <span className="deploy-panel__fill" style={{ width: `${percent}%` }}>
            {running ? <span className="deploy-panel__sweep" aria-hidden="true" /> : null}
          </span>
        </div>
      </div>

      <div className="deploy-panel__columns">
        <div>
          <h2 className="label-micro">Pipeline</h2>
          <ul className="deploy-stages">
            {(status?.stages ?? []).map((stage) => (
              <li key={stage.key} className={`deploy-stage deploy-stage--${stage.state}`}>
                <StageIcon state={stage.state} />
                <span>{stage.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="label-micro">
            <Server size={12} aria-hidden="true" /> Services
          </h2>

          {containers.length === 0 ? (
            <p className="hint">
              {running ? 'Waiting for docker to report…' : 'Nothing running right now.'}
            </p>
          ) : (
            <ul className="deploy-containers">
              {containers.map((container) => {
                const tone = containerTone(container);

                return (
                  <li key={container.name} className={`deploy-container is-${tone}`}>
                    <span className="deploy-container__dot" aria-hidden="true" />
                    <span className="deploy-container__name">
                      {CONTAINER_LABELS[container.service] ?? container.service ?? container.name}
                    </span>
                    <span className="deploy-container__state">
                      {container.health || container.state || 'unknown'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="deploy-panel__meta">
        {running && took ? (
          <span className="pill pill--info">
            <Hourglass size={12} aria-hidden="true" />
            {took} elapsed
          </span>
        ) : null}

        {!running && status?.finishedAt ? (
          <span className="pill pill--neutral">
            <Clock size={12} aria-hidden="true" />
            finished {clockLabel(status.finishedAt)}
          </span>
        ) : null}

        {status?.sha ? <span className="pill pill--done">commit {status.sha.slice(0, 7)}</span> : null}
        {status?.actor ? <span className="pill pill--neutral">{status.actor}</span> : null}
      </div>
    </div>
  );
}
