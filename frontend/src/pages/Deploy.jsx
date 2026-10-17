import { Circle, CircleCheckBig, Clock, CloudUpload, Hourglass, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deployStatus } from '../lib/api.js';

const POLL_MS = 2000;

function elapsed(startedAt, now) {
  const from = Date.parse(startedAt ?? '');

  if (!Number.isFinite(from)) return null;

  const seconds = Math.max(0, Math.round((now - from) / 1000));

  if (seconds < 60) return `${seconds}s`;

  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function clock(value) {
  const at = Date.parse(value ?? '');

  return Number.isFinite(at) ? new Date(at).toLocaleTimeString() : null;
}

function StageIcon({ state }) {
  if (state === 'done') return <CircleCheckBig size={16} aria-hidden="true" />;
  if (state === 'current') return <LoaderCircle size={16} className="deploy-stage__spin" aria-hidden="true" />;
  if (state === 'failed') return <TriangleAlert size={16} aria-hidden="true" />;

  return <Circle size={16} aria-hidden="true" />;
}

export default function Deploy() {
  const [status, setStatus] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    const poll = async () => {
      const next = await deployStatus();

      if (active && next) setStatus(next);
    };

    void poll();
    const timer = setInterval(poll, POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Tick locally so the elapsed clock keeps moving between polls.
  useEffect(() => {
    if (!status?.inProgress) return undefined;

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [status?.inProgress]);

  if (!status) {
    return (
      <section className="deploy-page">
        <div className="card deploy-card">
          <LoaderCircle size={18} className="deploy-stage__spin" aria-hidden="true" />
          <p>Checking whether a deployment is running…</p>
        </div>
      </section>
    );
  }

  const running = status.inProgress === true;
  const failed = status.stage === 'failed';
  const percent = Math.max(0, Math.min(100, status.percent ?? 0));
  const took = running ? elapsed(status.startedAt, now) : null;

  return (
    <section className="deploy-page">
      <div className="card deploy-card">
        <div className="deploy-card__head">
          <span className={`deploy-card__icon${running ? ' is-running' : ''}${failed ? ' is-failed' : ''}`}>
            {running ? (
              <CloudUpload size={26} aria-hidden="true" />
            ) : failed ? (
              <TriangleAlert size={26} aria-hidden="true" />
            ) : (
              <CircleCheckBig size={26} aria-hidden="true" />
            )}
          </span>

          <div>
            <h1>{running ? 'Deployment in progress' : failed ? 'The last deployment failed' : 'Everything is up to date'}</h1>
            <p>
              {running
                ? status.stageLabel
                : failed
                  ? status.message ?? 'Check the Actions run for the reason.'
                  : 'No deployment is running right now.'}
            </p>
          </div>
        </div>

        <div className="deploy-progress">
          <div className="deploy-progress__labels">
            <span className="label-micro">{running ? 'Progress' : 'Last run'}</span>
            <span className="deploy-progress__percent">{percent}%</span>
          </div>

          <div
            className={`deploy-progress__track${failed ? ' is-failed' : ''}`}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Deployment progress"
          >
            <span className="deploy-progress__fill" style={{ width: `${percent}%` }}>
              {running ? <span className="deploy-progress__sweep" aria-hidden="true" /> : null}
            </span>
          </div>
        </div>

        <ul className="deploy-stages">
          {(status.stages ?? []).map((stage) => (
            <li key={stage.key} className={`deploy-stage deploy-stage--${stage.state}`}>
              <StageIcon state={stage.state} />
              <span>{stage.label}</span>
            </li>
          ))}
        </ul>

        <div className="deploy-meta">
          {running && took ? (
            <span className="pill pill--info">
              <Hourglass size={12} aria-hidden="true" />
              {took} elapsed
            </span>
          ) : null}

          {!running && status.finishedAt ? (
            <span className="pill pill--neutral">
              <Clock size={12} aria-hidden="true" />
              finished {clock(status.finishedAt)}
            </span>
          ) : null}

          {status.sha ? <span className="pill pill--done">commit {status.sha.slice(0, 7)}</span> : null}
          {status.actor ? <span className="pill pill--neutral">{status.actor}</span> : null}
        </div>

        <p className="hint">
          This page refreshes itself every couple of seconds.{' '}
          <Link to="/">Back to the site</Link>
        </p>
      </div>
    </section>
  );
}
