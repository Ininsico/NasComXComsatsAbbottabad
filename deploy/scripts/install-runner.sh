#!/usr/bin/env bash
#
# Install GitHub Actions self-hosted runners for this repository.
#
#   GH_RUNNER_TOKEN=<registration token> bash deploy/scripts/install-runner.sh nascon-vm-4
#   GH_RUNNER_TOKEN=<registration token> bash deploy/scripts/install-runner.sh nascon-vm-2 nascon-vm-3
#
# Get a token with (it expires after an hour):
#
#   gh api -X POST repos/Ininsico/NasComXComsatsAbbottabad/actions/runners/registration-token --jq .token
#
# Each runner gets its own directory, its own systemd unit and the label `nascon`, so
# any job with `runs-on: [self-hosted, nascon]` can land on it. They run as root
# because the deploy needs docker.
#
# The first runner keeps the bare /opt/actions-runner directory, the rest are suffixed,
# which is how this host was originally laid out.
#
# Why self-hosted at all: see deploy/README.md. Short version — this account is
# refused GitHub-hosted runners, so every job on every workflow is aborted with
# runner_id 0 and no steps.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Ininsico/NasComXComsatsAbbottabad}"
RUNNER_VERSION="${RUNNER_VERSION:-2.338.0}"
LABELS="${LABELS:-nascon}"
TOKEN="${GH_RUNNER_TOKEN:-${1:-}}"

if [ -z "${TOKEN}" ]; then
  echo "no registration token. Set GH_RUNNER_TOKEN or pass it as the first argument." >&2
  exit 1
fi

shift || true

NAMES=("$@")

if [ ${#NAMES[@]} -eq 0 ]; then
  NAMES=("nascon-vm")
fi

# Root is required for docker. The runner refuses to run as root unless this is set.
export RUNNER_ALLOW_RUNASROOT=1

if [ "$(id -u)" -ne 0 ]; then
  echo "run me as root" >&2
  exit 1
fi

if [ ! -x /usr/bin/docker ] && ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed — run deploy/scripts/bootstrap-vm.sh first" >&2
  exit 1
fi

install_runner() {
  local name="$1"
  local dir
  local service="actions.runner.Ininsico-NasComXComsatsAbbottabad.${name}.service"

  case "$name" in
    nascon-vm) dir=/opt/actions-runner ;;
    *) dir="/opt/actions-runner-${name#nascon-vm-}" ;;
  esac

  echo
  echo "=================== $name ==================="
  echo "  directory: $dir"
  echo "  service  : $service"

  systemctl stop "$service" 2>/dev/null && echo "  stopped the old service" || true

  mkdir -p "$dir"
  cd "$dir"

  if [ ! -f ./config.sh ]; then
    echo "  downloading the runner"
    curl -fsSL -o runner.tar.gz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
    tar xzf runner.tar.gz
    rm -f runner.tar.gz
  fi

  ./config.sh \
    --url "$REPO_URL" \
    --token "$TOKEN" \
    --name "$name" \
    --labels "$LABELS" \
    --work "_work" \
    --unattended \
    --replace 2>&1 | sed 's/^/  /'

  if [ ! -f .runner ]; then
    echo "  configuration failed — no .runner file" >&2
    return 1
  fi

  # This release's tarball has no svc.sh, so the unit is written directly.
  cat >"/etc/systemd/system/$service" <<EOF
[Unit]
Description=GitHub Actions Runner ($name)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$dir
ExecStart=$dir/run.sh
Restart=always
RestartSec=10
KillMode=process
KillSignal=SIGTERM
TimeoutStopSec=5min
Environment=RUNNER_ALLOW_RUNASROOT=1

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$service" >/dev/null 2>&1
  systemctl restart "$service"
  sleep 5

  echo "  status: $(systemctl is-active "$service")"
}

for name in "${NAMES[@]}"; do
  install_runner "$name"
done

echo
echo "=================== runners on this host ==================="
systemctl list-units 'actions.runner.*' --no-pager 2>/dev/null | grep actions.runner || echo "none"
echo
echo "Check they are online from anywhere with:"
echo "  gh api repos/Ininsico/NasComXComsatsAbbottabad/actions/runners --jq '.runners[] | \"\\(.name) \\(.status)\"'"
