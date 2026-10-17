#!/usr/bin/env bash
#
# Prepare the deployment host. Idempotent — safe to re-run.
#
#   sudo DOMAIN=nascon.artdevelopers.site bash deploy/scripts/bootstrap-vm.sh
#
# Installs Docker if needed, creates the app directory, installs the nginx vhost and
# issues the TLS certificate. It touches nothing outside:
#   /opt/nascon, /etc/nginx/sites-{available,enabled}/<domain>.conf, the letsencrypt
#   certificate for <domain>, and the docker service itself.
set -uo pipefail

DOMAIN="${DOMAIN:-nascon.artdevelopers.site}"
APP_DIR="${APP_DIR:-/opt/nascon}"
FRONTEND_PORT="${FRONTEND_PORT:-8085}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@artdevelopers.site}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "run me as root" >&2
  exit 1
fi

say "docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "installing docker"
  curl -fsSL https://get.docker.com | sh
else
  echo "docker present: $(docker --version)"
fi

systemctl enable --now docker >/dev/null 2>&1 || true

if ! docker compose version >/dev/null 2>&1; then
  echo "installing the compose plugin"
  apt-get update -qq
  apt-get install -y -qq docker-compose-plugin
fi

echo "compose: $(docker compose version --short 2>/dev/null || echo unknown)"

say "application directory"
mkdir -p "$APP_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$REPO_DIR/deploy/.env.example" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "created $APP_DIR/.env from the example"
fi

if grep -qE '^(JWT_SECRET|RABBITMQ_PASSWORD)=change-me' "$APP_DIR/.env"; then
  echo
  echo "!! $APP_DIR/.env still holds placeholder secrets."
  echo "   Fill in JWT_SECRET, RABBITMQ_PASSWORD, CLOUDINARY_* and GROQ_API_KEY, then re-run."
  exit 1
fi

say "nginx vhost"
CONF="/etc/nginx/sites-available/$DOMAIN.conf"

# The full vhost references a certificate that may not exist yet, so the HTTP-only
# challenge server goes in first and certbot runs against it.
cat >/etc/nginx/sites-available/"$DOMAIN".acme.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 200 "pending certificate\n"; add_header Content-Type text/plain; }
}
EOF

ln -sf /etc/nginx/sites-available/"$DOMAIN".acme.conf /etc/nginx/sites-enabled/"$DOMAIN".acme.conf
nginx -t && systemctl reload nginx

say "certificate"
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "certificate already present for $DOMAIN"
else
  certbot certonly --webroot -w /var/www/html -d "$DOMAIN" \
    --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --keep-until-expiring
fi

say "enable the real vhost"
sed -e "s/127.0.0.1:8085/127.0.0.1:${FRONTEND_PORT}/" \
    "$REPO_DIR/deploy/nginx/$DOMAIN.conf" >"$CONF"

ln -sf "$CONF" /etc/nginx/sites-enabled/"$DOMAIN".conf
rm -f /etc/nginx/sites-enabled/"$DOMAIN".acme.conf /etc/nginx/sites-available/"$DOMAIN".acme.conf

nginx -t && systemctl reload nginx
echo "nginx reloaded"

say "done"
echo "next:"
echo "  cd $APP_DIR"
echo "  docker compose --env-file .env up -d --build"
echo "  curl -sS https://$DOMAIN/api/health"
