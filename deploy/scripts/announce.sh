#!/usr/bin/env bash
#
# Report deploy progress so the site can draw a live progress bar and show each
# container's state.
#
#   bash deploy/scripts/announce.sh preparing
#   bash deploy/scripts/announce.sh health "waiting for services" /tmp/containers.json
#   bash deploy/scripts/announce.sh done
#   bash deploy/scripts/announce.sh failed "verification did not pass"
#
# Stages: preparing announced building rolling health verifying done failed
#
# The third argument is optional: a file holding a JSON array of
# {name, service, state, health}, as produced by
#   docker compose ps --format json | python3 -c '...'
#
# Reads DEPLOY_STATUS_TOKEN from the production env file. Without it the script is a
# no-op, so it is always safe to call. The request itself is made from python3 so the
# JSON can never be broken by shell quoting.
set -uo pipefail

STAGE="${1:?usage: announce.sh <stage> [message] [containers.json]}"
MESSAGE="${2:-}"
CONTAINERS="${3:-}"
DOMAIN="${DOMAIN:-nascon.artdevelopers.site}"
ENV_FILE="${APP_ENV_FILE:-/opt/nascon/.env}"

TOKEN=$(grep -E '^DEPLOY_STATUS_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)

if [ -z "$TOKEN" ]; then
  echo "announce: no DEPLOY_STATUS_TOKEN in $ENV_FILE — skipping"
  exit 0
fi

STAGE="$STAGE" \
  MESSAGE="$MESSAGE" \
  CONTAINERS="$CONTAINERS" \
  DOMAIN="$DOMAIN" \
  TOKEN="$TOKEN" \
  RUN_SHA="${GITHUB_SHA:-}" \
  RUN_ACTOR="${GITHUB_ACTOR:-}" \
  python3 - <<'PY'
import json
import os
import urllib.request

body = {
    "stage": os.environ["STAGE"],
    "sha": os.environ.get("RUN_SHA") or None,
    "actor": os.environ.get("RUN_ACTOR") or None,
    "message": os.environ.get("MESSAGE") or None,
}

path = os.environ.get("CONTAINERS") or ""

if path and os.path.exists(path):
    try:
        with open(path, encoding="utf-8") as handle:
            containers = json.load(handle)

        if isinstance(containers, list):
            body["containers"] = containers[:12]
    except Exception as exc:
        print(f"announce: could not read {path}: {exc}")

request = urllib.request.Request(
    f"https://{os.environ['DOMAIN']}/api/deploy/status",
    data=json.dumps(body).encode(),
    headers={
        "Content-Type": "application/json",
        "x-deploy-token": os.environ["TOKEN"],
        # Cloudflare answers 403 to the default urllib agent.
        "User-Agent": "nascon-deploy/1.0",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.loads(response.read().decode())

    print(f"announce: {body['stage']} -> {payload.get('percent')}%")
except Exception as exc:
    print(f"announce: could not report {body['stage']}: {exc}")
PY
