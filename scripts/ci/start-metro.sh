#!/usr/bin/env bash
# Starts Metro for APP_VARIANT in the background (dev-client e2e in nightly.yml) and waits until it serves, then
# requests the platform bundle once so the first app launch does not wait for a cold transform.
#
# Usage: bash scripts/ci/start-metro.sh <android|ios> [log-file]
set -euo pipefail
platform="${1:?platform (android|ios) required}"
log="${2:-${RUNNER_TEMP:-/tmp}/metro.log}"
: "${APP_VARIANT:?APP_VARIANT is required}"

cd "$(dirname "$0")/../../apps/omni"
CI=1 EXPO_NO_DOTENV=1 nohup npx expo start --dev-client --port 8081 > "$log" 2>&1 &
echo "Metro PID $! (log: $log)"

for _ in $(seq 1 120); do
  if curl -sf http://localhost:8081/status | grep -q 'packager-status:running'; then break; fi
  sleep 2
done
curl -sf http://localhost:8081/status | grep -q 'packager-status:running' || { echo "::error::Metro did not start"; tail -n 50 "$log"; exit 1; }

if ! curl -sf -o /dev/null --max-time 900 "http://localhost:8081/index.bundle?platform=${platform}&dev=true&minify=false"; then
  echo "::warning::Bundle pre-warm failed; the app will build it on first open."
fi
