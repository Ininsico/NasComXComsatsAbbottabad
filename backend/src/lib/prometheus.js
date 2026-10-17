/**
 * Read-only Prometheus client for the admin dashboard.
 *
 * The queries are fixed here, not passed in from the request: an endpoint that runs
 * arbitrary PromQL on behalf of a caller is a needless injection surface. Prometheus is
 * only reachable on the compose network.
 */

const BASE = (process.env.PROMETHEUS_URL || 'http://prometheus:9090').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.PROMETHEUS_TIMEOUT_MS || 4000);
const WINDOW_SECONDS = 3600;
const STEP_SECONDS = 60;

async function call(path, params) {
  const url = new URL(`${BASE}${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });

  if (!response.ok) {
    throw new Error(`Prometheus answered ${response.status}`);
  }

  return response.json();
}

async function instant(query) {
  const payload = await call('/api/v1/query', { query });
  const first = payload.data?.result?.[0];

  return first ? Number(first.value[1]) : null;
}

async function series(query) {
  const end = Math.floor(Date.now() / 1000);
  const payload = await call('/api/v1/query_range', {
    query,
    start: end - WINDOW_SECONDS,
    end,
    step: STEP_SECONDS,
  });

  const first = payload.data?.result?.[0];

  return (first?.values ?? []).map(([, value]) => Number(value));
}

/** Never throws: a missing metric becomes null rather than a broken dashboard. */
async function safe(read, fallback) {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

const QUERIES = {
  requestsPerSecond: 'sum(rate(http_requests_total[5m]))',
  p95Ms:
    'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_ms_bucket[5m]))) * 1',
  errorsPerSecond: 'sum(rate(http_requests_total{status=~"5.."}[5m]))',
  requestsTotal: 'sum(http_requests_total)',
  hostCpuPercent: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
  hostMemoryPercent: '100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)',
  targetsUp: 'sum(up)',
  targetsTotal: 'count(up)',
};

export async function monitoringSnapshot() {
  const [reads, rangeReads] = await Promise.all([
    Promise.all(
      Object.entries(QUERIES).map(async ([key, query]) => [key, await safe(() => instant(query), null)]),
    ),
    Promise.all(
      ['requestsPerSecond', 'p95Ms', 'hostCpuPercent', 'hostMemoryPercent'].map(async (key) => [
        key,
        await safe(() => series(QUERIES[key]), []),
      ]),
    ),
  ]);

  const instantValues = Object.fromEntries(reads);

  // If not one single metric resolved, Prometheus is not reachable at all.
  const available = Object.values(instantValues).some((value) => value !== null);

  return {
    available,
    generatedAt: new Date().toISOString(),
    source: BASE,
    windowSeconds: WINDOW_SECONDS,
    stepSeconds: STEP_SECONDS,
    instant: instantValues,
    series: Object.fromEntries(rangeReads),
  };
}
