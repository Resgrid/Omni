#!/usr/bin/env bash
# Starts Metro for APP_VARIANT in the background (dev-client e2e in nightly.yml) and waits until it serves, then
# requests the platform bundle once so the first app launch does not wait for a cold transform. Fails when Metro
# reports a bundle build error.
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

# Pre-warm exactly the bundle the dev client loads: the manifest's launchAsset URL. Its path is relative to the monorepo
# root Metro serves from (apps/omni/index.ts.bundle), and its query (Hermes transform, the variant's router root) keys
# Metro's cache, so a hand-built URL either 404s (/index.bundle resolves at the repo root) or warms a different bundle.
manifest="$(curl -sf --max-time 120 -H "expo-platform: ${platform}" -H 'accept: application/expo+json,application/json' http://localhost:8081/ || true)"
# An answer that is not JSON says why on stderr (the CI log) and leaves the URL empty: the warning below follows.
bundle_url="$(printf '%s' "$manifest" | node -e 'const input = require("node:fs").readFileSync(0, "utf8"); try { process.stdout.write(JSON.parse(input).launchAsset?.url ?? ""); } catch (error) { if (input) console.error(`Metro manifest is not JSON: ${error.message}`); }')"
if [ -z "$bundle_url" ]; then
  echo "::warning::Metro returned no ${platform} manifest; the app will build its bundle on first open."
  exit 0
fi

body="$(mktemp)"
status="$(curl -s -o "$body" -w '%{http_code}' --max-time 900 "$bundle_url" || true)"
case "$status" in
  200) echo "Bundle pre-warmed: ${bundle_url%%\?*}" ;;
  000) echo "::warning::Bundle pre-warm timed out or lost its connection; the app will build its bundle on first open." ;;
  *)
    # Metro answers a build error (unresolved import, syntax error) with its JSON error: the app would get the same.
    echo "::error::Metro could not build the ${platform} bundle (HTTP ${status})."
    head -c 4000 "$body"
    echo
    exit 1
    ;;
esac
