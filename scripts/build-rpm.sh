#!/usr/bin/env bash
# Build a Fedora RPM for SourceFlow (installable + pin to KDE taskbar).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v rpmbuild >/dev/null 2>&1; then
  echo "Note: rpmbuild not found; Tauri may still produce an RPM via its bundler."
  echo "If packaging fails, install: sudo dnf install rpm-build"
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
echo "Install:"
echo "  sudo dnf install \"$RPM_DIR\"/*.rpm"
echo ""
echo "Then launch 'SourceFlow' from the app menu or pin it to your taskbar."
