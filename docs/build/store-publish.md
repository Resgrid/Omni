# Store submissions through the factory

Every merge into `master` builds a release: `release.yml` builds each app whose native code changed on the `production` channel and attaches the store binaries to a GitHub release, `<variant>-v<major>.<run>`. A merge build publishes nothing to users. It sends no over-the-air update, no Electron update feed, no Docker `latest` and no public changelog.

From there everything goes through the Resgrid software factory, one platform at a time, and only as far as you decide:

1. **Upload for testing**, for example iOS first: the factory submits the release's App Store IPA to App Store Connect, and TestFlight testers get it. This is not a release.
2. **Test and verify** the build. Then upload the Android App Bundle the same way: it becomes a completed release on a Play testing track (internal, alpha or beta), and that track's testers get it. Also not a release.
3. **Release**, later and only if you choose: the factory submits the build you tested for App Store review, or promotes its version code from the testing track to Play's production track. Nothing is built or uploaded again. A build you never release stays with your testers.

`.github/workflows/store-publish.yml` does both steps. It runs only when the factory dispatches it for a submission a person approved there. The factory's approval is the only approval, and `release.yml`'s own `submit` input no longer reaches the store credentials (see the environment policy below).

Over-the-air updates follow the same rule. A JavaScript-only merge builds no new binary and publishes no update; its release says "JavaScript only — no update published". You release it to the apps on the production channel with `ota.yml`. A tag push (`<variant>-v*`) or a manual `release.yml` dispatch still publishes as before.

## How a submission runs

1. The factory reads the release and records a version of that app with its two store packages and their GitHub digests.
2. Someone proposes **Submit app** in the factory for one of the app's publishing targets (**Upload for testing**, or later **Release the uploaded build**), and an approver approves it. The factory allows a release only after the upload of that build to that store succeeded. Its executor dispatches this workflow at the target's reviewed tag with the ten inputs: `factory_submission_id`, `source_sha`, `artifact_digest`, `artifact_url`, `version`, `release_notes`, `store`, `app_id`, `channel` (`testflight`, or the Play testing track `internal`, `alpha` or `beta`) and `operation` (`upload` or `publish`).
3. **plan** checks that the run is on a reviewed `store-publish-v*` tag of this workflow. It then checks the inputs (`scripts/ci/store-publish.mjs plan`): a store this workflow serves, an allowed channel and operation, a release tag on the variant's version line, `artifact_url` the store package of exactly that release of this repository, and `app_id` the variant's bundle ID or package in `variant.json` at `source_sha`.
4. **publish** runs in the `store-<variant>` environment:
   - **confirm** waits until the factory's action for the submission shows this run as its dispatch receipt and checks that every input equals what was approved. A manual dispatch, a copied set of inputs or a re-run after a store write stops here, before any store call.
   - **fetch** checks the release: `SHA256SUMS`, the tag's commit, and `fingerprints.json` (production channel, `source_sha`, and the platform built natively in this release). For an upload it also downloads the package and checks its SHA-256 against `artifact_digest` and GitHub's digest.
   - **Upload:**
     - `eas submit` sends the package. Google Play: a completed release on the testing track named by the channel. App Store: App Store Connect.
     - **app-store** then waits up to 90 minutes for processing and sets TestFlight's "What to Test" from the notes (cut to 4,000 characters).
   - **Release, App Store:** **app-store** finds the processed build and creates or reuses the App Store version `<major>.<run>`. It then attaches the build, sets "What's New" in each localization and submits the version for review (`IOS_RELEASE_TYPE`, default `AFTER_APPROVAL`). It stops with the reason when the build has no export compliance answer or another version is already pending.
   - **Release, Google Play:** **play-release** checks that the version code is a completed release on the testing track, then puts it on the production track and commits the edit. The production release carries the notes, cut to 500 characters. An optional staged rollout uses `PLAY_ROLLOUT_FRACTION`, for example `0.1`.
   - **report** uploads a JSON receipt to the factory as evidence. An upload reports `uploaded`, never a release. A release reports `published` once the store accepted it (submitted for review, or committed to production); the store's review follows in App Store Connect or the Play Console. A failure after confirm reports `failed` with a receipt that links the run.

The submission's inputs reach scripts only as environment variables. No step rebuilds the app, and no step retries a store write.

## Environment `store-<variant>`

Besides the secrets `docs/build/ci-secrets.md` lists for store environments (`EXPO_TOKEN`, `IOS_P8_BASE64`, `IOS_ASC_KEY_ID`, `IOS_ASC_ISSUER_ID`, `IOS_APPLE_TEAM_ID`, `ASC_APP_ID`, `PLAY_SERVICE_ACCOUNT_JSON_BASE64`):

| Name                                             | Kind     | Purpose                                                                                                                                                                                   |
| ------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FACTORY_URL`                                    | variable | The factory console origin, `https://…`. Required: without it nothing is submitted                                                                                                        |
| `FACTORY_TOKEN`                                  | secret   | Token of a factory machine identity with `store-publisher` and `evidence`, scoped to product `omni` and repository `Resgrid/Omni` (and to the environment of a submission that names one) |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | secrets  | Cloudflare Access service token for the factory, when it sits behind Access                                                                                                               |
| `IOS_RELEASE_TYPE`                               | variable | `AFTER_APPROVAL` (default) or `MANUAL` for App Store versions this workflow creates                                                                                                       |
| `PLAY_ROLLOUT_FRACTION`                          | variable | Optional staged rollout for Google Play releases, such as `0.1`; empty releases to everyone                                                                                               |

The App Store Connect API key needs the App Manager role to create versions and submit them for review. The Play service account (`PLAY_SERVICE_ACCOUNT_JSON_BASE64`, required for a Google Play release) needs release permissions for the app's testing and production tracks.

### Protection: the reviewed tag, not reviewers

The factory's approval is the approval, so the `store-<variant>` environments have **no required reviewers**. Their credentials go only to the reviewed workflow instead:

- **Deployment branches and tags:** _Selected branches and tags_, with the single tag rule `store-publish-v*`. A run on a branch, or a modified copy of the workflow on any other ref, gets no store credentials. `plan` refuses such a run before the environment is reached, and the environment refuses it again.
- **Tag ruleset** on `refs/tags/store-publish-v*`: restrict creation, update and deletion to administrators, so only a reviewed commit of this workflow is ever tagged and a tag never moves (the factory also refuses a dispatch when the tag no longer resolves to the commit its target recorded).
- `release.yml`'s `store-submit` job (its `submit` input) runs on `master` and is therefore refused by the policy: it stays in the file but cannot reach the credentials. Submissions go through the factory.

With the policy in place, a store write needs all of: an approved factory submission, the factory's executor dispatching this run (its receipt names the run), and the reviewed tag.

## Factory side

Each app has two publishing targets in the factory (Settings & access → Resgrid/Omni): App Store with channel `testflight`, and Google Play with the testing track uploads go to (`internal`). Each has provider GitHub Actions, workflow `store-publish.yml`, the reviewed tag of this workflow (for example `store-publish-v1`) and that tag's commit. The same target serves the upload and the later release. The factory refuses a dispatch when the tag has moved. See the factory's `docs/delivery.md`, "Omni: Google Play and the App Store".

## Checks

`node --test "scripts/ci/__tests__/*.test.mjs"` (in CI's checks job) covers the input, dispatch, release and token rules. Nothing here has run against a live store account.
