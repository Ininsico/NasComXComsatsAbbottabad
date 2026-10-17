#!/usr/bin/env bash
#
# Authorise a public key for GitHub Actions deployments. Run once, as root:
#
#   bash deploy/scripts/authorize-deploy-key.sh "ssh-ed25519 AAAA... github-actions"
#
# Generate the pair with:
#   ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/nascon_deploy -N ""
#
# Keep the private half out of the repository: it belongs in the repository secret
# VM_SSH_KEY.
set -euo pipefail

PUBLIC_KEY="${1:?pass the public key as the first argument}"
DEPLOY_USER="${DEPLOY_USER:-root}"

if [ "$(id -u)" -ne 0 ]; then
  echo "run me as root" >&2
  exit 1
fi

case "$PUBLIC_KEY" in
  ssh-ed25519* | ssh-rsa* | ecdsa-*) ;;
  *)
    echo "that does not look like a public key: ${PUBLIC_KEY:0:40}..." >&2
    exit 1
    ;;
esac

HOME_DIR="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
AUTH="$HOME_DIR/.ssh/authorized_keys"

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$HOME_DIR/.ssh"
touch "$AUTH"
chmod 600 "$AUTH"
chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH"

if grep -qF "$PUBLIC_KEY" "$AUTH"; then
  echo "already authorised for $DEPLOY_USER"
else
  printf '%s\n' "$PUBLIC_KEY" >>"$AUTH"
  echo "authorised for $DEPLOY_USER"
fi

echo "keys in $AUTH: $(wc -l <"$AUTH")"
echo
echo "verify from the machine that holds the private key:"
echo "  ssh -i ~/.ssh/nascon_deploy $DEPLOY_USER@\$(hostname -I | awk '{print \$1}') 'docker --version'"
