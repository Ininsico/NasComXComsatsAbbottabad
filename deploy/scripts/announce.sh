#!/usr/bin/env bash
#
# Report deploy progress so the site can draw a live progress bar.
#
#   bash deploy/scripts/announce.sh building
#   bash deploy/scripts/announce.sh done
#   bash deploy/scripts/announce.sh failed "verification did not pass"
#
# Stages: preparing announced building rolling health verifying done failed
#
# Reads DEPLOY_STATUS_TOKEN from the production env file. Without it the script is a
# no-op, so it is safe to call from anywhere.
set -uo pipefail

STAGE="${1:?usage: announce.sh <stage> [message]}"
MESSAGE="${2:-}"
DOMAIN="${DOMAIN:-nascon.artdevelopers.site}"
ENV_FILE="${APP_ENV_FILE:-/opt/nascon/.env}"

TOKEN=$(grep -E '^DEPLOY_STATUS_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)

if [ -z "$TOKEN" ]; then
  echo "announce: no DEPLOY_STATUS_TOKEN in $ENV_FILE — skipping"
  exit 0
fi

BODY=$(printf '{"stage":"%s","sha":"%s","actor":"%s","message":"%s"}' \
  "$STAGE" "${GITHUB_SHA:-}" "${GITHUB_ACTOR:-}" "$MESSAGE")

if curl -fsS --max-time 10 -X POST "https://$DOMAIN/api/deploy/status" \
  -H "x-deploy-token: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$BODY" >/dev/null 2>&1; then
  echo "announce: $STAGE"
else
  echo "announce: could not report $STAGE (site unreachable?) — continuing"
fi
