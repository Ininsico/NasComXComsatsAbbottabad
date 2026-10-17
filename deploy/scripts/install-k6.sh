#!/usr/bin/env bash
#
# Install k6 from the official release tarball.
#
#   bash deploy/scripts/install-k6.sh
#   K6_VERSION=0.54.0 bash deploy/scripts/install-k6.sh
set -euo pipefail

if command -v k6 >/dev/null 2>&1; then
  echo "k6 already installed: $(k6 version)"
  exit 0
fi

VERSION="${K6_VERSION:-}"

if [ -z "${VERSION}" ]; then
  VERSION=$(curl -fsSL https://api.github.com/repos/grafana/k6/releases/latest \
    | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -1)
fi

if [ -z "${VERSION}" ]; then
  VERSION=0.54.0
  echo "could not resolve the latest release, falling back to ${VERSION}"
fi

case "$(uname -m)" in
  x86_64) ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *)
    echo "unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

echo "installing k6 ${VERSION} for linux-${ARCH}"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

curl -fsSL -o "$TMP/k6.tar.gz" \
  "https://github.com/grafana/k6/releases/download/v${VERSION}/k6-v${VERSION}-linux-${ARCH}.tar.gz"

tar -xzf "$TMP/k6.tar.gz" -C "$TMP"

install -m 0755 "$TMP/k6-v${VERSION}-linux-${ARCH}/k6" /usr/local/bin/k6

k6 version
