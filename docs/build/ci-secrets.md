# CI secrets, variables and environments

Reference for the GitHub Actions workflows in `.github/workflows` (omni-plan §6.6, decision D14). Values never live in the repository. Signing material is decoded to `$RUNNER_TEMP` and deleted in an `always()` step.

## Environments

| Environment                                       | Used by                                                                                                               | Protection                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `responder`, `unit`, `ic`, `dispatch`, `bigboard` | `release.yml` (fingerprint, web, android, ios, ota, docker, electron, release), `ota.yml`, `nightly.yml` (dev builds) | Optional: restrict to `master` and `*-v*` tags |
| `store-responder` … `store-bigboard`              | `release.yml` store-submit (only with `submit: true` on the production channel)                                       | **Required reviewers**                         |

Every variant environment uses the **same secret names**. Each job runs in `environment: <variant>`, so `secrets.EXPO_TOKEN` resolves to that app's token. Never add per-app prefixes in workflows. Repository- or organisation-level secrets (for example Docker Hub) apply wherever an environment does not override them.

## Variant environment secrets (`<variant>`)

### Build and client configuration

These values are part of the Expo config and therefore of the **fingerprint**. Every job that resolves a runtime version reads them, so change them deliberately: a change forces native builds on the next release.

| Secret                                  | Purpose                                                                                       | Notes                                                                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_TOKEN`                            | EAS CLI auth (build, update, project lookup)                                                  | Robot token of the Expo account that owns the variant's EAS project                                                                                                 |
| `BASE_API_URL`                          | Resgrid API host baked into native and web builds                                             | https only. Docker overrides it at runtime                                                                                                                          |
| `LOGGING_KEY`                           | Client logging key                                                                            |                                                                                                                                                                     |
| `APP_KEY`                               | Client app key                                                                                |                                                                                                                                                                     |
| `SENTRY_DSN`                            | The variant's **own** Sentry project DSN                                                      | Legacy Dispatch and BigBoard reported to `unit`. Do not copy that over                                                                                              |
| `COUNTLY_APP_KEY`, `COUNTLY_SERVER_URL` | Analytics                                                                                     |                                                                                                                                                                     |
| `MMKV_KEY`                              | MMKV encryption key                                                                           | Exported under the manifest's `storage.keySecret` name (for example `UNIT_MMKV_KEY`) by `scripts/ci/variant-env.mjs`. Copy the **legacy value unchanged** (plan D8) |
| `IOS_APPLE_TEAM_ID`                     | Apple team id (`ios.appleTeamId`, Live Activities)                                            |                                                                                                                                                                     |
| `GOOGLE_SERVICES_JSON_BASE64`           | Android `google-services.json`, base64                                                        | Decoded to `$RUNNER_TEMP/firebase`, passed as `GOOGLE_SERVICES_FILE`                                                                                                |
| `GOOGLE_SERVICE_INFO_PLIST_BASE64`      | iOS `GoogleService-Info.plist`, base64                                                        | Passed as `IOS_GOOGLE_SERVICES_FILE`                                                                                                                                |
| `SENTRY_AUTH_TOKEN`                     | Native source-map upload during builds, and `sentry-expo-upload-sourcemaps` after OTA updates | Optional                                                                                                                                                            |

### Android signing

| Secret                    | Purpose                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64` | Upload keystore (`.jks`), base64. It signs the AAB and the bundletool universal APK                                                                                             |
| `CREDENTIALS_JSON_BASE64` | EAS `credentials.json`, base64. CI removes the `ios` block and points `android.keystore.keystorePath` at the decoded keystore, so the password and alias fields must be present |
| `GRADLE_PROPERTIES`       | Contents of `~/.gradle/gradle.properties` (JVM args and the like). CI appends `org.gradle.workers.max=2`                                                                        |

### iOS signing

App Store builds use the **EAS-managed** distribution certificate and provisioning profile (the `<v>-production` profile has no `credentialsSource: local`).

| Secret                                               | Purpose                                                                                                                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IOS_P8_BASE64`                                      | App Store Connect API key (`AuthKey_XXXX.p8`), base64. Lets eas-cli check credentials without prompting                                                                           |
| `IOS_ASC_KEY_ID`, `IOS_ASC_ISSUER_ID`                | Id and issuer of that key                                                                                                                                                         |
| `IOS_DIST_CERT_P12_BASE64`, `IOS_DIST_CERT_PASSWORD` | The **same** Apple Distribution certificate EAS uses (download it with `eas credentials`), for `fastlane sigh resign`                                                             |
| `IOS_ADHOC_PROFILE_BASE64`                           | Ad-hoc provisioning profile for the app's bundle id. It must carry the app's entitlements: push, critical alerts, time-sensitive, associated domains and the App Group where used |
| `IOS_ADHOC_WIDGET_PROFILE_BASE64`                    | Ad-hoc profile for `<bundle id>.CheckInTimerWidget`. Only for Responder and Unit (Live Activity)                                                                                  |

If the two required ad-hoc secrets are missing, the ad-hoc IPA is skipped and the build only warns.

### Release distribution

| Secret                                                           | Purpose                                                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`                           | Service account for Firebase App Distribution. Preferred over `FIREBASE_TOKEN` (deprecated CLI token)          |
| `FIREBASE_TOKEN`                                                 | Fallback CLI token                                                                                             |
| `FIREBASE_ANDROID_APP_ID`, `FIREBASE_IOS_APP_ID`                 | Firebase app ids that receive the APK and the ad-hoc IPA                                                       |
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

## Store environment secrets (`store-<variant>`)

The submit job runs only in this environment. Anything it needs must be here (or at organisation level):

| Secret                                                                      | Purpose                                                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `EXPO_TOKEN`                                                                | EAS CLI auth                                                                              |
| `IOS_P8_BASE64`, `IOS_ASC_KEY_ID`, `IOS_ASC_ISSUER_ID`, `IOS_APPLE_TEAM_ID` | App Store Connect API key for `eas submit`                                                |
| `ASC_APP_ID`                                                                | Numeric App Store Connect app id. Required for non-interactive iOS submission             |
| `PLAY_SERVICE_ACCOUNT_JSON_BASE64`                                          | Google Play service account. If it is missing, EAS uses the key stored on the EAS project |

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
| `PLAY_TRACK`                                                                                                             | `internal`              | Play track for `eas submit`                                                               |

`GITHUB_TOKEN` is used as provided: read releases (fingerprint lookup), create releases (`contents: write` on the release job only) and push to GHCR (`packages: write` on the docker job only). **Never replace it with a PAT on the release step.** Tags created with `GITHUB_TOKEN` do not re-trigger `release.yml`. Tags created with a PAT would start a production release.

## How the pipeline uses them

- **Versions** come only from the `plan` job (`scripts/release-plan.mjs`, `RELEASE_RUN_NUMBER` = `release.yml` run number).
- **Native or OTA:** the `fingerprint` job resolves `expo-updates runtimeversion:resolve` for each platform with the variant's build environment. It compares the result with `fingerprints.json` on the newest `<variant>-v*` release of the same channel, skipping this run's own tag so re-runs stay native. Unchanged → `eas update`. Changed, first release, or the previous binaries failed → native build. `force_native` skips the check. A missing decision always means native.
- **eas.json profiles:** for `internal` and `staging`, `scripts/ci/eas-profile.mjs release` derives `<v>-<channel>-aab` / `<v>-<channel>-store` (production profile with the channel and `APP_ENV` replaced) in the runner checkout, because the channel is baked into the binary. It runs in **every** fingerprint-resolving job, because eas.json is a fingerprint source. Adding those profiles to `scripts/generate-eas-json.mjs` makes the derivation a no-op.
- **ota.yml** refuses an update when the current fingerprint differs from the installed runtime recorded on the channel's newest release.

## Before the first release (owner checklist)

1. Create the five variant environments and five `store-<variant>` environments (with required reviewers). Fill in the secrets above, copying the legacy values (keystores, MMKV keys, Firebase files).
2. Create the EAS update channels `production`, `staging`, `internal` in each EAS project (D18).
3. Add `apps/omni/fingerprint.config.js` with `sourceSkips` for `ExpoConfigVersions` and `ExpoConfigExtraSection` (see "Known limitation" below). Until then every release builds native, which is safe but slow.
4. Make `ci-ok` a required status check on `master` (branch protection or ruleset), with up-to-date branches or the merge queue.

## Known limitation: fingerprints include the version today

The expo config embeds `version` / `buildNumber` (from `RELEASE_RUN_NUMBER`) and `extra.env`, so the fingerprint changes on every run, verified locally with `@expo/fingerprint` 0.20. The pipeline stays correct: it always builds native and `ota.yml` always refuses. OTA updates only become possible after the `fingerprint.config.js` change in step 3 of the checklist.
