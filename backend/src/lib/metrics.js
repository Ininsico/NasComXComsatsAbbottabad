/**
 * A very small Prometheus exposition layer.
 *
 * Prometheus scrapes text, so a dependency is not needed to produce it. Requests are
 * counted per method/route/status and timed into a histogram, which is what makes
 * histogram_quantile() — and therefore a real p95 — possible in Grafana.
 *
 * Cardinality is kept in check by using the matched route pattern (/api/documents/:id)
 * rather than the concrete URL.
 */

import { readFileSync } from 'node:fs';

const BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

const counters = new Map();
const histograms = new Map();

/**
 * The deploy route tells us where it keeps its status file, so scrapes can report the
 * deploy as gauges and Grafana can chart releases alongside traffic.
 */
let deployStatusFile = null;

export function trackDeployStatus(path) {
  deployStatusFile = path;
}

function deployGauges() {
  if (!deployStatusFile) return null;

  try {
    const record = JSON.parse(readFileSync(deployStatusFile, 'utf8'));

    return {
      inProgress: record.inProgress ? 1 : 0,
      percent: Number(record.percent ?? 0),
    };
  } catch {
    return { inProgress: 0, percent: 0 };
  }
}

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function labelString(labels) {
  const entries = Object.entries(labels).filter(([, value]) => value !== undefined && value !== null);

  if (entries.length === 0) return '';

  return `{${entries.map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(',')}}`;
}

export function increment(name, labels = {}, amount = 1) {
  const key = `${name}${labelString(labels)}`;
  const current = counters.get(key) ?? { name, labels, value: 0 };

  current.value += amount;
  counters.set(key, current);
}

export function observe(name, labels = {}, value = 0) {
  const key = `${name}${labelString(labels)}`;
  const current = histograms.get(key) ?? {
    name,
    labels,
    buckets: new Array(BUCKETS_MS.length).fill(0),
    sum: 0,
    count: 0,
  };

  current.sum += value;
  current.count += 1;

  for (let index = 0; index < BUCKETS_MS.length; index += 1) {
    if (value <= BUCKETS_MS[index]) current.buckets[index] += 1;
  }

  histograms.set(key, current);
}

/** Express middleware: counts every request and times it until the response finishes. */
export function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics') return next();

  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const milliseconds = Number(process.hrtime.bigint() - started) / 1e6;
    const route = `${req.baseUrl ?? ''}${req.route?.path ?? ''}` || 'unmatched';

    increment('http_requests_total', {
      method: req.method,
      route,
      status: String(res.statusCode),
    });
    observe('http_request_duration_ms', { route }, milliseconds);
  });

  return next();
}

export function renderMetrics() {
  const lines = [];
  const seen = new Set();

  const header = (name, type, help) => {
    if (seen.has(name)) return;
    seen.add(name);
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
  };

  // Counters
  for (const entry of counters.values()) {
    header(entry.name, 'counter', `Total ${entry.name}`);
    lines.push(`${entry.name}${labelString(entry.labels)} ${entry.value}`);
  }

  // Histograms
  for (const entry of histograms.values()) {
    header(entry.name, 'histogram', `Distribution of ${entry.name}`);
    header(`${entry.name}_bucket`, 'counter', `Buckets of ${entry.name}`);

    let cumulative = 0;

    for (let index = 0; index < BUCKETS_MS.length; index += 1) {
      cumulative = entry.buckets[index];
      const labels = labelString({ ...entry.labels, le: String(BUCKETS_MS[index]) });
      lines.push(`${entry.name}_bucket${labels} ${cumulative}`);
    }

    lines.push(`${entry.name}_bucket${labelString({ ...entry.labels, le: '+Inf' })} ${entry.count}`);
    lines.push(`${entry.name}_sum${labelString(entry.labels)} ${entry.sum}`);
    lines.push(`${entry.name}_count${labelString(entry.labels)} ${entry.count}`);
  }

  // Process gauges
  const memory = process.memoryUsage();

  lines.push('# HELP process_resident_memory_bytes Resident memory size in bytes.');
  lines.push('# TYPE process_resident_memory_bytes gauge');
  lines.push(`process_resident_memory_bytes ${memory.rss}`);

  lines.push('# HELP process_heap_bytes JS heap size in bytes.');
  lines.push('# TYPE process_heap_bytes gauge');
  lines.push(`process_heap_bytes ${memory.heapUsed}`);

  lines.push('# HELP process_uptime_seconds Seconds since the process started.');
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push(`process_uptime_seconds ${process.uptime()}`);

  lines.push('# HELP nascon_up Constant 1, so the scrape itself is visible.');
  lines.push('# TYPE nascon_up gauge');
  lines.push('nascon_up 1');

  lines.push('# HELP nodejs_version_info Node.js version.');
  lines.push('# TYPE nodejs_version_info gauge');
  lines.push(`nodejs_version_info{version="${process.version}"} 1`);

  const deploy = deployGauges();

  if (deploy) {
    lines.push('# HELP nascon_deploy_in_progress 1 while a deployment is replacing the stack.');
    lines.push('# TYPE nascon_deploy_in_progress gauge');
    lines.push(`nascon_deploy_in_progress ${deploy.inProgress}`);

    lines.push('# HELP nascon_deploy_percent How far the current or last deployment got.');
    lines.push('# TYPE nascon_deploy_percent gauge');
    lines.push(`nascon_deploy_percent ${deploy.percent}`);
  }

  return `${lines.join('\n')}\n`;
}
