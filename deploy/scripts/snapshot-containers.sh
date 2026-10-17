#!/usr/bin/env bash
#
# Write what docker currently reports about each compose service to a JSON array, for
# the deployment page to render:
#
#   [{"name":"nascon-frontend-1","service":"frontend","state":"running","health":"healthy"}]
#
#   bash deploy/scripts/snapshot-containers.sh /tmp/containers.json
set -uo pipefail

OUT="${1:-/tmp/nascon-containers.json}"
ENV_FILE="${APP_ENV_FILE:-/opt/nascon/.env}"

docker compose --env-file "$ENV_FILE" ps --format json 2>/dev/null | python3 -c '
import json
import sys

rows = []

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        rows.append(json.loads(line))
    except Exception:
        pass

snapshot = [
    {
        "name": row.get("Name") or "",
        "service": row.get("Service") or "",
        "state": (row.get("State") or "").lower(),
        "health": (row.get("Health") or "").lower(),
    }
    for row in rows
]

with open(sys.argv[1], "w", encoding="utf-8") as handle:
    json.dump(snapshot, handle)

print(f"snapshot: {len(snapshot)} container(s)")
' "$OUT"
