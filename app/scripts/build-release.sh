#!/usr/bin/env bash
# Builds a release APK of the Smartrays app (2026-10-23).
#
#   scripts/build-release.sh localtest    # TEST: the laptop's local backend (plain http)
#   scripts/build-release.sh production   # the live CRM (HTTPS only)
#
# Run from app/ in Git Bash. Needs JAVA_HOME / ANDROID_HOME (D:\Tools — see
# the toolchain notes). The API address comes from the env file below, created
# on first use (gitignored, no secrets in it):
#   localtest  → .env.localtest   LOCAL_API_URL, default http://<this laptop's Wi-Fi IP>:5000/api/v1
#   production → .env.production  PRODUCTION_API_URL / PRODUCTION_WEB_URL
# Signing: the upload key when SMARTRAYS_UPLOAD_* are set in
# GRADLE_USER_HOME/gradle.properties; otherwise the DEBUG key, and the file
# name says NOT-FOR-PLAY.
# Output: app/dist/smartrays-<target>-<signing>-<version>.apk, plus a check
# that the API host is really inside the APK (R8 keeps BuildConfig).
set -euo pipefail

target="${1:-}"
case "$target" in
  localtest | production) ;;
  *) echo "usage: scripts/build-release.sh localtest|production" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."
envfile=".env.$target"

if [ ! -f "$envfile" ]; then
  if [ "$target" = "localtest" ]; then
    ip=$(ipconfig.exe 2>/dev/null | grep -a "IPv4" | head -1 | sed 's/.*: *//' | tr -d '\r')
    api="${LOCAL_API_URL:-http://${ip:-10.0.2.2}:5000/api/v1}"
    web="${LOCAL_WEB_URL:-http://${ip:-10.0.2.2}:5173}"
  else
    api="${PRODUCTION_API_URL:-https://smartrays-crm-backend.vercel.app/api/v1}"
    web="${PRODUCTION_WEB_URL:-https://crm.smartrayssolutions.com}"
  fi
  printf 'API_BASE_URL=%s\nWEB_APP_URL=%s\n' "$api" "$web" > "$envfile"
  echo "Created $envfile"
fi
api_host=$(grep '^API_BASE_URL=' "$envfile" | sed 's#^API_BASE_URL=[a-z]*://##; s#[:/].*##')
echo "Building $target against $(grep '^API_BASE_URL=' "$envfile" | cut -d= -f2-)"

props="${GRADLE_USER_HOME:-$HOME/.gradle}/gradle.properties"
if [ -f "$props" ] && [ "$(grep -c '^SMARTRAYS_UPLOAD_' "$props")" -ge 4 ]; then signing="signed"; else signing="NOT-FOR-PLAY-debugkey"; fi

(cd android && ENVFILE="$envfile" ./gradlew.bat assembleRelease -PsmartraysBuild="$target" --console=plain)

version=$(grep -m1 'versionName' android/app/build.gradle | sed 's/.*"\(.*\)".*/\1/')
mkdir -p dist
out="dist/smartrays-$target-$signing-$version.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$out"

# The API host must be inside the APK, or the release app cannot reach the server.
# (grep -c reads everything: grep -q would stop early, unzip would then fail on
# the closed pipe, and pipefail would report "not found".)
matches=$(unzip -p "$out" 'classes*.dex' resources.arsc 2>/dev/null | grep -a -c "$api_host" || true)
if [ "${matches:-0}" -gt 0 ]; then
  echo "API host '$api_host' found in the APK."
else
  echo "ERROR: API host '$api_host' NOT found in the APK — check the R8 BuildConfig rule." >&2
  exit 1
fi
echo "Wrote $out ($(du -h "$out" | cut -f1))"
