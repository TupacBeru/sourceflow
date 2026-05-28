#!/usr/bin/env bash
# Build (if needed) and install the latest SourceFlow RPM locally.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/build-rpm.sh"

RPM="$(ls -1 "$ROOT/src-tauri/target/release/bundle/rpm"/*.rpm | sort -V | tail -1)"
RPM_NEVRA="$(rpm -qp --queryformat '%{NAME}-%{VERSION}-%{RELEASE}.%{ARCH}' "$RPM")"
INSTALLED_NEVRA="$(rpm -q --queryformat '%{NAME}-%{VERSION}-%{RELEASE}.%{ARCH}' source-flow 2>/dev/null || true)"

echo "==> RPM file: $RPM"
echo "==> Package:  $RPM_NEVRA"
if [[ -n "$INSTALLED_NEVRA" ]]; then
  echo "==> Installed: $INSTALLED_NEVRA"
fi

# `dnf install` on a local RPM: fresh install OR upgrade to a newer release.
# Do NOT use `reinstall` for a new build — that only works when this exact
# NEVRA is already on disk (same version-release).
if sudo dnf install -y "$RPM"; then
  :
elif [[ "$INSTALLED_NEVRA" == "$RPM_NEVRA" ]]; then
  echo "==> Same release already installed; replacing package files..."
  sudo dnf reinstall -y "$RPM"
else
  echo "dnf install failed; see errors above." >&2
  exit 1
fi

echo ""
echo "Done. SourceFlow is installed:"
echo "  - App menu: Development → SourceFlow"
echo "  - Command:  sourceflow"
echo "  - Pin from the app launcher (right-click → Add to Task Manager)"
