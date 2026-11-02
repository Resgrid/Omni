# CI secrets, variables and environments

Reference for the GitHub Actions workflows in `.github/workflows` (omni-plan §6.6, decision D14). Values never live in the repository. Build secrets (Firebase files, `gradle.properties`) are decoded to `$RUNNER_TEMP` and deleted in an `always()` step. Native signing credentials are not GitHub secrets at all: they stay on EAS. Store credentials are not here either, and neither is an App Store Connect API key for the mobile apps: GitHub Actions never reaches App Store Connect or the Play Console (see "Store uploads").

## What to configure

The checklist for the current workflows. Secret names are identical in every variant environment; the values are that app's own. The sections after this one explain each name.

### Outside GitHub

- [ ] Each app's EAS project holds its signing credentials (`APP_VARIANT=<v> eas credentials`): the Android upload keystore, and the iOS distribution certificate and App Store provisioning profile, plus the `CheckInTimerWidget` extension profile for Responder and Unit. The keystore SHA-1 must match Play Console → App integrity → Upload key certificate. Check Unit first: legacy Unit signed its Android builds with a local keystore.
- [ ] Each EAS project has the update channels `production`, `staging` and `internal` (D18).

### GitHub settings

- [ ] Environments `responder`, `unit`, `ic`, `dispatch`, `bigboard`. Optionally restrict them to `master` and `*-v*` tags.
- [ ] `ci-ok` is a required status check on `master`, with up-to-date branches or the merge queue.

### Each variant environment

Required. Without these a release fails, or the app ships with the defaults (QA API, empty keys, no Android push):

- [ ] `EXPO_TOKEN`: robot token with access to the app's EAS project. Builds download the signing credentials with it.
- [ ] `BASE_API_URL`, `LOGGING_KEY`, `APP_KEY`
- [ ] `SENTRY_DSN` (the app's own Sentry project), `COUNTLY_APP_KEY`, `COUNTLY_SERVER_URL`
- [ ] `IOS_APPLE_TEAM_ID`
- [ ] `GOOGLE_SERVICES_JSON_BASE64`

Optional. Without these the step is skipped or uses defaults:

- [ ] `GRADLE_PROPERTIES`: recommended. Copy the legacy value (Gradle memory settings).
- [ ] `GOOGLE_SERVICE_INFO_PLIST_BASE64`: the legacy apps shipped no iOS Firebase file.
- [ ] `SENTRY_AUTH_TOKEN`: source-map upload.
- [ ] `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` (or `FIREBASE_TOKEN`) and `FIREBASE_ANDROID_APP_ID`: send the APK to Firebase App Distribution testers. `pnpm setup:app-distribution` sets both for every app: it creates a service account `omni-app-distribution` with only the Firebase App Distribution Admin role in each app's Firebase project (`scripts/setup-app-distribution.mjs`, try `--dry-run` first).
- [ ] `CHANGERAWR_API_URL`, `CHANGERAWR_API_KEY`: public release notes.
- [ ] `ELECTRON_FEED_ACCESS_KEY_ID`, `ELECTRON_FEED_SECRET_ACCESS_KEY`: Electron update feed (with the `ELECTRON_*` variables).
- [ ] Desktop signing:
  - Windows: `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`, or Azure Trusted Signing with `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` and the variables `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT`, `AZURE_TRUSTED_SIGNING_PROFILE` and `WIN_PUBLISHER_NAME`.
  - macOS: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, and for notarization `APPLE_NOTARY_KEY_BASE64`, `APPLE_NOTARY_KEY_ID`, `APPLE_NOTARY_ISSUER_ID`.

### Organisation or repository level (optional)

- [ ] `DOCKER_USERNAME`, `DOCKER_PASSWORD`: Docker Hub. Without them images go to GHCR only.
- [ ] Variables:
  - Electron update feed: `ELECTRON_UPDATE_BASE_URL`, `ELECTRON_FEED_BUCKET`, `ELECTRON_FEED_ENDPOINT`, `ELECTRON_FEED_REGION`
  - `DESKTOP_REQUIRE_SIGNING`
  - `FIREBASE_TESTER_GROUPS`

### No longer used

No workflow reads these; delete them if they were created. Delete the `store-responder` … `store-bigboard` environments too, with everything in them:

- `ANDROID_KEYSTORE_BASE64`
- `CREDENTIALS_JSON_BASE64`
- `IOS_DIST_CERT_P12_BASE64`
- `IOS_DIST_CERT_PASSWORD`
- `IOS_ADHOC_PROFILE_BASE64`
- `IOS_ADHOC_WIDGET_PROFILE_BASE64`
- `FIREBASE_IOS_APP_ID`
- App Store Connect API key for the mobile builds: `IOS_P8_BASE64`, `IOS_ASC_KEY_ID`, `IOS_ASC_ISSUER_ID`
- Store publishing: `ASC_APP_ID`, `PLAY_SERVICE_ACCOUNT_JSON_BASE64`, `FACTORY_TOKEN`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, and the variables `FACTORY_URL`, `IOS_RELEASE_TYPE`, `PLAY_ROLLOUT_FRACTION`, `PLAY_TRACK`

There is no MMKV key secret: each device generates its own storage keys (plan D8).

## Environments

| Environment                                       | Used by                                                                                                               | Protection                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `responder`, `unit`, `ic`, `dispatch`, `bigboard` | `release.yml` (fingerprint, web, android, ios, ota, docker, electron, release), `ota.yml`, `nightly.yml` (dev builds) | Optional: restrict to `master` and `*-v*` tags |

Every variant environment uses the **same secret names**. Each job runs in `environment: <variant>`, so `secrets.EXPO_TOKEN` resolves to that app's token. Never add per-app prefixes in workflows. Repository- or organisation-level secrets (for example Docker Hub) apply wherever an environment does not override them.

## Variant environment secrets (`<variant>`)

### Build and client configuration

Every job that resolves a runtime version reads them. `IOS_APPLE_TEAM_ID` (`ios.appleTeamId`) and the two Firebase files are part of the **fingerprint**, so change them deliberately: a change forces native builds on the next release. The client values (`BASE_API_URL`, `LOGGING_KEY`, `APP_KEY`, `SENTRY_DSN`, `COUNTLY_*`) go into `extra.env`, which the fingerprint leaves out (see "Fingerprint inputs" below).

| Secret                                  | Purpose                                                                                       | Notes                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `EXPO_TOKEN`                            | EAS CLI auth (build, update, project lookup)                                                  | Robot token of the Expo account that owns the variant's EAS project    |
| `BASE_API_URL`                          | Resgrid API host baked into native and web builds                                             | https only. Docker overrides it at runtime                             |
| `LOGGING_KEY`                           | Client logging key                                                                            |                                                                        |
| `APP_KEY`                               | Client app key                                                                                |                                                                        |
| `SENTRY_DSN`                            | The variant's **own** Sentry project DSN                                                      | Legacy Dispatch and BigBoard reported to `unit`. Do not copy that over |
| `COUNTLY_APP_KEY`, `COUNTLY_SERVER_URL` | Analytics                                                                                     |                                                                        |
| `IOS_APPLE_TEAM_ID`                     | Apple team id (`ios.appleTeamId`, Live Activities)                                            |                                                                        |
| `GOOGLE_SERVICES_JSON_BASE64`           | Android `google-services.json`, base64                                                        | Decoded to `$RUNNER_TEMP/firebase`, passed as `GOOGLE_SERVICES_FILE`   |
| `GOOGLE_SERVICE_INFO_PLIST_BASE64`      | iOS `GoogleService-Info.plist`, base64                                                        | Passed as `IOS_GOOGLE_SERVICES_FILE`                                   |
| `SENTRY_AUTH_TOKEN`                     | Native source-map upload during builds, and `sentry-expo-upload-sourcemaps` after OTA updates | Optional                                                               |

### Native signing: stored on EAS, nothing in GitHub

Every native build signs with the credentials stored on the variant's EAS project, as legacy Responder, IC, Dispatch and BigBoard did. No eas.json profile sets `credentialsSource`, and `eas build --local` downloads the Android upload keystore or the iOS distribution certificate and provisioning profiles with `EXPO_TOKEN`. There is no keystore, `credentials.json`, `.p12` or `.mobileprovision` secret. eas-cli cannot export stored credentials without prompting, so every artifact is its own EAS build: the Android job builds the AAB and then the sideload APK, and the iOS job builds only the App Store IPA (TestFlight, then the App Store). An ad-hoc IPA is a local build on a Mac: `pnpm ios:adhoc <variant>` (`scripts/build-ios-adhoc.mjs`).

Without an App Store Connect key, iOS builds use the stored certificate and profiles as they are and cannot repair them. When one expires or needs a new capability, the iOS build stops with a credentials error: renew it on a Mac with `APP_VARIANT=<v> eas credentials -p ios` (signed in to Apple there), then re-run the job.

| Secret              | Purpose                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `GRADLE_PROPERTIES` | Contents of `~/.gradle/gradle.properties` (JVM args and the like). CI appends `org.gradle.workers.max=2` |

### Release distribution

| Secret                                                           | Purpose                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`                           | Service account for Firebase App Distribution. Preferred over `FIREBASE_TOKEN` (deprecated CLI token)          |
| `FIREBASE_TOKEN`                                                 | Fallback CLI token                                                                                             |
| `FIREBASE_ANDROID_APP_ID`                                        | Firebase app id that receives the APK. iOS testers use TestFlight                                              |
| `CHANGERAWR_API_URL`, `CHANGERAWR_API_KEY`                       | Release notes. The step is skipped when either is missing                                                      |
| `DOCKER_USERNAME`, `DOCKER_PASSWORD`                             | Docker Hub push to `resgridllc/<variant>`. Without them CI pushes to GHCR only. Usually an organisation secret |
| `ELECTRON_FEED_ACCESS_KEY_ID`, `ELECTRON_FEED_SECRET_ACCESS_KEY` | Credentials for the S3-compatible bucket that hosts the Electron update feed                                   |

### Desktop signing (electron jobs)

| Secret                                                                     | Purpose                                                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                                     | Windows Authenticode PFX (base64 or https URL) and its password. Ignored when Azure Trusted Signing is configured                                       |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`                | Entra app for Azure Trusted Signing (with the `AZURE_TRUSTED_SIGNING_*` variables)                                                                      |
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`                                     | Developer ID Application certificate (`.p12`, base64) and password. When it is missing, macOS builds are unsigned (`CSC_IDENTITY_AUTO_DISCOVERY=false`) |
| `APPLE_NOTARY_KEY_BASE64`, `APPLE_NOTARY_KEY_ID`, `APPLE_NOTARY_ISSUER_ID` | App Store Connect API key used for notarization (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` for electron-builder)                          |

## Store uploads

GitHub Actions never writes to the App Store or Google Play and holds no store credentials (owner decision, omni-plan §15 #20). `release.yml` attaches the store packages (`<Prefix>-<version>-android.aab`, `-ios-appstore.ipa`, each with its CycloneDX SBOM `<package>.cdx.json`, and `SHA256SUMS`) to the app's GitHub release; the Software Factory (`int-RASF`) records each release as a version, and TestFlight and Google Play uploads are done by hand from there. The only distribution CI does itself is the sideload APK to Firebase App Distribution testers and the Electron update feed.

## Variables (repository or environment)

| Variable                                                                                                                 | Default                 | Purpose                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------- |
| `ELECTRON_UPDATE_BASE_URL`                                                                                               | unset (auto-update off) | Feed root baked into desktop builds. apps/desktop appends `/updates/<variant>/<channel>/` |
| `ELECTRON_FEED_BUCKET`                                                                                                   | unset (upload skipped)  | Bucket that serves `ELECTRON_UPDATE_BASE_URL`. Files go to `updates/<variant>/<channel>/` |
| `ELECTRON_FEED_ENDPOINT`                                                                                                 | AWS                     | S3-compatible endpoint URL (R2, Spaces, MinIO …)                                          |
| `ELECTRON_FEED_REGION`                                                                                                   | `auto`                  | Region for the AWS CLI                                                                    |
| `DESKTOP_REQUIRE_SIGNING`                                                                                                | unset                   | Set to `1` to fail desktop builds that would ship unsigned                                |
| `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT`, `AZURE_TRUSTED_SIGNING_PROFILE`, `WIN_PUBLISHER_NAME` | unset                   | Azure Trusted Signing for Windows (see `apps/desktop/packaging/builder-config.js`)        |
| `FIREBASE_TESTER_GROUPS`                                                                                                 | `testers`               | App Distribution groups                                                                   |

`GITHUB_TOKEN` is used as provided: read releases (fingerprint lookup), create releases (`contents: write` on the release job only) and push to GHCR (`packages: write` on the docker job only). **Never replace it with a PAT on the release step.** Tags created with `GITHUB_TOKEN` do not re-trigger `release.yml`. Tags created with a PAT would start a production release.

## How the pipeline uses them

- **Versions** come only from the `plan` job (`scripts/release-plan.mjs`, `RELEASE_RUN_NUMBER` = `release.yml` run number).
- **Native or OTA:** the `fingerprint` job resolves `expo-updates runtimeversion:resolve` for each platform with the variant's build environment. It compares the result with `fingerprints.json` on the newest `<variant>-v*` release of the same channel, skipping this run's own tag so re-runs stay native. Unchanged → `eas update`. Changed, first release, or the previous binaries failed → native build. `force_native` skips the check. A missing decision always means native.
- **eas.json profiles:** `scripts/ci/eas-profile.mjs release` picks `<v>-production` (AAB and App Store IPA) and `<v>-production-apk` on the production channel, `<v>-<channel>-store` and `<v>-<channel>-apk` on `internal` and `staging`, because the channel is baked into the binary. `scripts/generate-eas-json.mjs` emits all of them; a missing one is derived from the production profile (channel and `APP_ENV` replaced) in the runner checkout. It runs in **every** fingerprint-resolving job, because eas.json is a fingerprint source.
- **ota.yml** refuses an update when the current fingerprint differs from the installed runtime recorded on the channel's newest release.

## Fingerprint inputs

The expo config embeds `version` / `buildNumber` (from `RELEASE_RUN_NUMBER`) and `extra.env`, which change on every run without changing native code. `apps/omni/fingerprint.config.js` skips them (`sourceSkips: ['ExpoConfigVersions', 'ExpoConfigExtraSection']`), so the fingerprint only moves when native inputs change and OTA updates can apply. Without that file every release would build native and `ota.yml` would always refuse. Anything new that must force a native build belongs outside `extra`.
