#!/usr/bin/env bash
# Maestro e2e inside reactivecircus/android-emulator-runner (nightly.yml). The runner executes its `script` one line
# per shell, so the steps live here. Metro must already be serving on :8081 (the workflow starts it).
#
# Env: APP_VARIANT, APK_PATH, [APP_ENV=development], [MAESTRO_OUTPUT]
set -euo pipefail
: "${APP_VARIANT:?APP_VARIANT is required}"
: "${APK_PATH:?APK_PATH is required}"
out="${MAESTRO_OUTPUT:-apps/omni/e2e/maestro-output/${APP_VARIANT}-android}"

adb wait-for-device
# -g grants runtime permissions (notifications, location) so system dialogs do not cover the app.
adb install -r -g "$APK_PATH"
adb reverse tcp:8081 tcp:8081
node apps/omni/e2e/maestro/run-maestro.mjs --variant "$APP_VARIANT" --platform android --app-env "${APP_ENV:-development}" --dev-client-url http://localhost:8081 --output "$out"
