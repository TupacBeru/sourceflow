#!/usr/bin/env bash
# Build a Fedora RPM for SourceFlow (installable + pin to KDE taskbar).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v rpmbuild >/dev/null 2>&1; then
  echo "Note: rpmbuild not found; Tauri may still produce an RPM via its bundler."
  echo "If packaging fails, install: sudo dnf install rpm-build"
fi

# Bump RPM release so `dnf upgrade` picks up rebuilds at the same app version.
CONF="$ROOT/src-tauri/tauri.conf.json"
if [[ -f "$CONF" ]]; then
  CURRENT=$(grep -m1 '"release"' "$CONF" | sed -n 's/.*"release": "\([0-9]*\)".*/\1/p')
  if [[ -n "$CURRENT" ]]; then
    NEXT=$((CURRENT + 1))
    sed -i "s/\"release\": \"${CURRENT}\"/\"release\": \"${NEXT}\"/" "$CONF"
    echo "==> RPM release bumped: ${CURRENT} → ${NEXT}"
  fi
fi

echo "==> Building SourceFlow RPM (release)..."
npm run package

RPM_DIR="$ROOT/src-tauri/target/release/bundle/rpm"
if ! ls "$RPM_DIR"/*.rpm >/dev/null 2>&1; then
  echo "No RPM found in $RPM_DIR"
  exit 1
fi

echo ""
echo "Built:"
ls -1 "$RPM_DIR"/*.rpm
echo ""
RPM=$(ls -1 "$RPM_DIR"/*.rpm | sort -V | tail -1)
echo "Install or upgrade (use this after every build):"
echo "  sudo dnf install -y \"$RPM\""
echo ""
echo "Or run: ./scripts/install-rpm.sh"
echo ""
echo "Only if the SAME release is already installed and you need to"
echo "overwrite files without bumping release:"
echo "  sudo dnf reinstall -y \"$RPM\""
echo ""
echo "Then quit any running SourceFlow and launch again from the app menu (or: sourceflow)."
