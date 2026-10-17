#!/usr/bin/env python3
"""Generate the provisioned Grafana dashboards.

Dashboards as code: adding a panel is one line here instead of forty lines of JSON, and
there is no chance of a stray comma breaking provisioning. Grafana reads whatever ends
up in this directory, so running this and committing the output is the whole workflow.

    python deploy/grafana/build-dashboards.py

Every query below is PromQL against the `prometheus` datasource provisioned alongside.
"""

import json
import pathlib

OUT = pathlib.Path(__file__).resolve().parent / "dashboards"
DATASOURCE = {"type": "prometheus", "uid": "prometheus"}


def panel(kind, title, targets, unit="short", x=0, y=0, w=12, h=8, reduce="lastNotNull"):
    """One panel. `targets` is a list of (expression, legend format)."""
    spec = {
        "type": kind,
        "title": title,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "datasource": DATASOURCE,
        "fieldConfig": {"defaults": {"unit": unit}, "overrides": []},
        "targets": [
            {"refId": chr(65 + index), "expr": expr, "legendFormat": legend}
            for index, (expr, legend) in enumerate(targets)
        ],
    }

    if kind == "stat":
        spec["options"] = {"reduceOptions": {"calcs": [reduce]}}

    return spec


def dashboard(uid, title, panels, time_from="now-6h"):
    return {
        "uid": uid,
        "title": title,
        "tags": ["nascon"],
        "timezone": "browser",
        "schemaVersion": 39,
        "version": 1,
        "refresh": "30s",
        "time": {"from": time_from, "to": "now"},
        "panels": panels,
    }


REQUESTS = "sum(rate(http_requests_total[5m]))"
P95 = "histogram_quantile(0.95, sum by (le) (rate(http_request_duration_ms_bucket[5m])))"
ERROR_RATE = (
    'sum(rate(http_requests_total{status=~"5.."}[5m])) '
    "/ clamp_min(sum(rate(http_requests_total[5m])), 1e-9)"
)
CPU = '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'
MEMORY = "100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)"
CONTAINER_CPU = (
    'sum by (name) (rate(container_cpu_usage_seconds_total{name=~"nascon-.*"}[5m])) * 100'
)
CONTAINER_MEMORY = (
    'sum by (name) (container_memory_working_set_bytes{name=~"nascon-.*"})'
)

DASHBOARDS = [
    dashboard(
        "nascon-overview",
        "NASCON — platform overview",
        [
            panel("timeseries", "Requests per second", [(REQUESTS, "requests/s")], "reqps", 0, 0),
            panel("timeseries", "Latency p95", [(P95, "p95")], "ms", 12, 0),
            panel("timeseries", "Error rate (5xx share)", [(ERROR_RATE, "5xx")], "percentunit", 0, 8),
            panel("stat", "Requests since the API started", [("sum(http_requests_total)", "requests")], "short", 12, 8),
            panel("timeseries", "Host CPU", [(CPU, "cpu")], "percent", 0, 16),
            panel("timeseries", "Host memory", [(MEMORY, "used")], "percent", 12, 16),
            panel("stat", "Deployment in progress", [("nascon_deploy_in_progress", "deploying")], "short", 0, 24),
            panel("timeseries", "Deployment progress", [("nascon_deploy_percent", "percent")], "percent", 12, 24),
            panel("timeseries", "Container CPU", [(CONTAINER_CPU, "{{name}}")], "percent", 0, 32),
            panel("stat", "Scrape targets up", [("sum(up)", "up")], "short", 12, 32),
            # `or vector(0)` so the tile reads 0 rather than "No data" when all is well.
            panel(
                "stat",
                "Firing alerts",
                [('sum(ALERTS{alertstate="firing"}) or vector(0)', "firing")],
                "short",
                0,
                40,
            ),
            panel(
                "timeseries",
                "Active alerts",
                [('ALERTS{alertstate="firing"}', "{{alertname}}")],
                "short",
                12,
                40,
            ),
        ],
    ),
    dashboard(
        "nascon-api",
        "NASCON — API detail",
        [
            panel(
                "timeseries",
                "Requests per second by route",
                [("sum by (route) (rate(http_requests_total[5m]))", "{{route}}")],
                "reqps",
                0,
                0,
            ),
            panel(
                "timeseries",
                "Responses by status code",
                [("sum by (status) (rate(http_requests_total[5m]))", "{{status}}")],
                "reqps",
                12,
                0,
            ),
            panel(
                "timeseries",
                "Latency percentiles",
                [
                    ("histogram_quantile(0.50, sum by (le) (rate(http_request_duration_ms_bucket[5m])))", "p50"),
                    (P95, "p95"),
                    ("histogram_quantile(0.99, sum by (le) (rate(http_request_duration_ms_bucket[5m])))", "p99"),
                ],
                "ms",
                0,
                8,
            ),
            panel(
                "timeseries",
                "5xx rate by route",
                [('sum by (route) (rate(http_requests_total{status=~"5.."}[5m]))', "{{route}}")],
                "reqps",
                12,
                8,
            ),
            panel(
                "timeseries",
                "Requests by method",
                [("sum by (method) (rate(http_requests_total[5m]))", "{{method}}")],
                "reqps",
                0,
                16,
            ),
            panel("timeseries", "API resident memory", [("process_resident_memory_bytes", "rss")], "bytes", 12, 16),
            panel(
                "timeseries",
                "Slowest routes (p95)",
                [
                    (
                        "topk(5, histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_ms_bucket[5m]))))",
                        "{{route}}",
                    )
                ],
                "ms",
                0,
                24,
            ),
            panel("stat", "Total requests", [("sum(http_requests_total)", "requests")], "short", 12, 24),
        ],
    ),
    dashboard(
        "nascon-infrastructure",
        "NASCON — infrastructure",
        [
            panel("timeseries", "Host CPU", [(CPU, "cpu")], "percent", 0, 0),
            panel(
                "timeseries",
                "Load average (1m / 5m / 15m)",
                [
                    ("node_load1", "1m"),
                    ("node_load5", "5m"),
                    ("node_load15", "15m"),
                ],
                "short",
                12,
                0,
            ),
            panel(
                "timeseries",
                "Memory used",
                [
                    ("node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes", "used"),
                    ("node_memory_MemAvailable_bytes", "available"),
                ],
                "bytes",
                0,
                8,
            ),
            panel(
                "timeseries",
                "Root filesystem used",
                [
                    (
                        '100 * (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})',
                        "used %",
                    )
                ],
                "percent",
                12,
                8,
            ),
            panel(
                "timeseries",
                "Network throughput",
                [
                    ("sum(rate(node_network_receive_bytes_total[5m]))", "in"),
                    ("sum(rate(node_network_transmit_bytes_total[5m]))", "out"),
                ],
                "Bps",
                0,
                16,
            ),
            panel(
                "stat",
                "Host uptime",
                [("node_time_seconds - node_boot_time_seconds", "seconds")],
                "s",
                12,
                16,
            ),
            panel("timeseries", "Container CPU", [(CONTAINER_CPU, "{{name}}")], "percent", 0, 24),
            panel("timeseries", "Container memory", [(CONTAINER_MEMORY, "{{name}}")], "bytes", 12, 24),
        ],
    ),
    dashboard(
        "nascon-data",
        "NASCON — data and releases",
        [
            panel(
                "timeseries",
                "Redis commands per second",
                [("rate(redis_commands_processed_total[5m])", "commands/s")],
                "ops",
                0,
                0,
            ),
            panel("timeseries", "Redis memory used", [("redis_memory_used_bytes", "used")], "bytes", 12, 0),
            panel("timeseries", "Redis connected clients", [("redis_connected_clients", "clients")], "short", 0, 8),
            panel(
                "timeseries",
                "Redis cache hits vs misses",
                [
                    ("rate(redis_keyspace_hits_total[5m])", "hits"),
                    ("rate(redis_keyspace_misses_total[5m])", "misses"),
                ],
                "ops",
                12,
                8,
            ),
            panel("timeseries", "Redis evictions", [("rate(redis_evicted_keys_total[5m])", "evicted/s")], "ops", 0, 16),
            panel("stat", "Deployment in progress", [("nascon_deploy_in_progress", "deploying")], "short", 12, 16),
            panel("timeseries", "Deployment progress", [("nascon_deploy_percent", "percent")], "percent", 0, 24),
            panel("stat", "API requests total", [("sum(http_requests_total)", "requests")], "short", 12, 24),
        ],
    ),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    for entry in DASHBOARDS:
        path = OUT / f"{entry['uid']}.json"
        path.write_text(json.dumps(entry, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path.relative_to(path.parents[3])} ({len(entry['panels'])} panels)")

    # Remove dashboard files this script no longer generates, so a renamed UID does not
    # leave a stale copy for Grafana to keep loading.
    expected = {f"{entry['uid']}.json" for entry in DASHBOARDS}

    for stale in OUT.glob("*.json"):
        if stale.name not in expected and stale.name != "nascon.json":
            stale.unlink()
            print(f"removed stale {stale.name}")

    # The first dashboard used to be called nascon.json; drop it if it is still there.
    legacy = OUT / "nascon.json"

    if legacy.exists():
        legacy.unlink()
        print("removed the legacy nascon.json")


if __name__ == "__main__":
    main()
