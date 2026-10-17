import { Activity, Clock, Gauge, LoaderCircle, Server, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/authContext.js';
import { api } from '../lib/api.js';

const POLL_MS = 15000;

function format(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';

  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** A tiny SVG line chart. No charting dependency for four numbers and two sparklines. */
function Sparkline({ values, tone = 'blue', label }) {
  const points = (values ?? []).filter((value) => Number.isFinite(value));

  if (points.length < 2) {
    return <p className="hint">Not enough samples yet.</p>;
  }

  const width = 100;
  const height = 32;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const coordinates = points.map((value, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 4) - 2;

    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      className={`spark spark--${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <polygon points={`0,${height} ${coordinates.join(' ')} ${width},${height}`} className="spark__area" />
      <polyline points={coordinates.join(' ')} className="spark__line" />
    </svg>
  );
}

export default function PlatformHealth() {
  const { token } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const payload = await api.adminMetrics(token);

        if (!active) return;
        setMetrics(payload);
        setError('');
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const timer = setInterval(load, POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);

  if (loading) {
    return (
      <section className="dash-section">
        <h2 className="dash-section__title">Platform health</h2>
        <p className="hint">
          <LoaderCircle size={14} className="spin" aria-hidden="true" /> Reading Prometheus…
        </p>
      </section>
    );
  }

  if (!metrics?.available) {
    return (
      <section className="dash-section">
        <h2 className="dash-section__title">
          <Activity size={17} aria-hidden="true" /> Platform health
        </h2>
        <p className="alert alert--pending">
          <TriangleAlert size={15} aria-hidden="true" />
          Monitoring is not reachable
          {metrics?.source ? ` at ${metrics.source}` : ''}. {error ? error : 'Prometheus has not scraped anything yet.'}
        </p>
      </section>
    );
  }

  const instant = metrics.instant ?? {};
  const series = metrics.series ?? {};

  return (
    <section className="dash-section">
      <h2 className="dash-section__title">
        <Activity size={17} aria-hidden="true" /> Platform health
        <span className="hint">last {Math.round((metrics.windowSeconds ?? 3600) / 60)} minutes</span>
      </h2>

      <div className="metric-grid">
        <article className="metric-tile">
          <span className="label-micro">Requests / min</span>
          <strong>{format((instant.requestsPerSecond ?? 0) * 60, 1)}</strong>
          <span className="hint">{format(instant.requestsTotal)} since restart</span>
        </article>

        <article className="metric-tile">
          <span className="label-micro">p95 latency</span>
          <strong>{format(instant.p95Ms, 0)} ms</strong>
          <span className="hint">95th percentile</span>
        </article>

        <article className={`metric-tile${(instant.errorsPerSecond ?? 0) > 0 ? ' is-warn' : ''}`}>
          <span className="label-micro">Errors / min</span>
          <strong>{format((instant.errorsPerSecond ?? 0) * 60, 1)}</strong>
          <span className="hint">5xx responses</span>
        </article>

        <article className="metric-tile">
          <span className="label-micro">Host</span>
          <strong>
            {format(instant.hostCpuPercent, 0)}% CPU
          </strong>
          <span className="hint">
            {format(instant.hostMemoryPercent, 0)}% memory · {format(instant.targetsUp)}/{format(instant.targetsTotal)} scrapes up
          </span>
        </article>
      </div>

      <div className="metric-charts">
        <article className="metric-chart">
          <span className="label-micro">
            <Activity size={12} aria-hidden="true" /> Request rate
          </span>
          <Sparkline values={series.requestsPerSecond} tone="blue" label="Requests per second over the last hour" />
        </article>

        <article className="metric-chart">
          <span className="label-micro">
            <Clock size={12} aria-hidden="true" /> p95 latency (ms)
          </span>
          <Sparkline values={series.p95Ms} tone="amber" label="p95 latency over the last hour" />
        </article>

        <article className="metric-chart">
          <span className="label-micro">
            <Gauge size={12} aria-hidden="true" /> Host CPU %
          </span>
          <Sparkline values={series.hostCpuPercent} tone="emerald" label="Host CPU over the last hour" />
        </article>

        <article className="metric-chart">
          <span className="label-micro">
            <Server size={12} aria-hidden="true" /> Host memory %
          </span>
          <Sparkline values={series.hostMemoryPercent} tone="slate" label="Host memory over the last hour" />
        </article>
      </div>

      <p className="hint">
        Refreshes every {POLL_MS / 1000}s. Full dashboards, including per-container CPU and Redis, are in{' '}
        <a href="/grafana/" target="_blank" rel="noreferrer">
          Grafana
        </a>
        .
      </p>
    </section>
  );
}
