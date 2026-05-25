#!/usr/bin/env bash
# Build (if needed) and install the latest SourceFlow RPM locally.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/build-rpm.sh"

RPM="$(ls -1 "$ROOT/src-tauri/target/release/bundle/rpm"/*.rpm | sort -V | tail -1)"
echo "==> Installing $RPM"
if ! sudo dnf upgrade -y "$RPM"; then
  echo "==> Upgrade skipped or failed; reinstalling..."
  sudo dnf reinstall -y "$RPM"
fi

echo ""
echo "Done. SourceFlow is installed:"
echo "  - App menu: Development → SourceFlow"
echo "  - Command:  sourceflow"
echo "  - Pin from the app launcher (right-click → Add to Task Manager)"
