#!/usr/bin/env bash
# Maestro e2e on an iOS simulator (nightly.yml, opt-in). Installs the dev-sim simulator build and runs the variant's
# flows against Metro on :8081 (the workflow starts it).
#
# Env: APP_VARIANT, APP_TARBALL (the .tar.gz from `eas build --profile <v>-dev-sim --platform ios`), [MAESTRO_OUTPUT]
set -euo pipefail
: "${APP_VARIANT:?APP_VARIANT is required}"
: "${APP_TARBALL:?APP_TARBALL is required}"
out="${MAESTRO_OUTPUT:-apps/omni/e2e/maestro-output/${APP_VARIANT}-ios}"

work="$(mktemp -d)"
tar -xzf "$APP_TARBALL" -C "$work"
app="$(find "$work" -maxdepth 3 -name '*.app' -type d | head -n1)"
if [ -z "$app" ]; then echo "::error::No .app in $APP_TARBALL"; exit 1; fi

# Newest available iOS runtime, first iPhone on it.
udid="$(xcrun simctl list devices available -j | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const devices = JSON.parse(s).devices;
    const runtimes = Object.keys(devices).filter((r) => /iOS/.test(r)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const r of runtimes) { const d = devices[r].find((x) => /^iPhone/.test(x.name)); if (d) { console.log(d.udid); return; } }
    process.exit(1);
  });')"
xcrun simctl boot "$udid" 2> /dev/null || true
xcrun simctl bootstatus "$udid" -b
xcrun simctl install "$udid" "$app"
node apps/omni/e2e/maestro/run-maestro.mjs --variant "$APP_VARIANT" --platform ios --app-env development --dev-client-url http://localhost:8081 --device "$udid" --output "$out"
