#!/usr/bin/env node
// Store submissions the Resgrid software factory dispatches (.github/workflows/store-publish.yml, docs/build/store-publish.md).
// The factory proposes a submission of one release's package, a person approves it, and the factory's executor dispatches
// the workflow with the submission's inputs. Nothing reaches a store unless the factory confirms that this very run is the
// approved dispatch, and the package is byte for byte the one the release recorded.
//
// Two operations, and only the second is a release to users:
//   upload   put the build in front of testers: TestFlight (App Store Connect), or a completed release on a Play testing
//            track (internal, alpha, beta). Nothing reaches the public store listing.
//   publish  release that same uploaded build: submit it for App Store review, or promote its version code from the
//            testing track to Play's production track. Nothing is uploaded again; the factory allows a publish only
//            after the upload succeeded.
//
//   plan          validate the inputs against the variant manifest at the release commit → variant, platform, asset
//   confirm       wait until the factory records this run as the approved dispatch, and compare the approved inputs
//   fetch         verify the release (SHA256SUMS, fingerprints.json); for an upload also download and verify the package
//   eas-receipt   record the EAS submission eas submit printed
//   app-store     App Store Connect: wait for processing and set the TestFlight notes (upload), or submit for review (publish)
//   play-release  Google Play: promote the uploaded version code from its testing track to production (publish)
//   report        upload the receipt to the factory as evidence and report the store outcome (--failed after a failure)
//
// Inputs arrive as environment variables (never spliced into shell): FACTORY_SUBMISSION_ID, SOURCE_SHA, ARTIFACT_DIGEST,
// ARTIFACT_URL, VERSION, RELEASE_NOTES, STORE, APP_ID, CHANNEL, OPERATION.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendSummary, parseArgs, readJsonIfExists, repoRoot, setOutputs, VARIANT_IDS, writeJson } from './lib.mjs';

/**
 * The stores this workflow publishes to, the release asset each takes and the channels it uploads to: TestFlight, or a Play
 * testing track. A publish releases from there (App Store review, Play production).
 */
export const STORES = {
  'google-play': { platform: 'android', suffix: '-android.aab', channels: ['internal', 'alpha', 'beta'] },
  'apple-ios': { platform: 'ios', suffix: '-ios-appstore.ipa', channels: ['testflight'] },
};
/** App Store and TestFlight "What's New" limit. */
export const NOTES_LIMIT = 4000;
/** Google Play release notes limit, per language. */
export const PLAY_NOTES_LIMIT = 500;
const ASC_API = 'https://api.appstoreconnect.apple.com';

export function readInputs(env = process.env) {
  return {
    submissionId: env.FACTORY_SUBMISSION_ID ?? '',
    sourceSha: env.SOURCE_SHA ?? '',
    artifactDigest: env.ARTIFACT_DIGEST ?? '',
    artifactUrl: env.ARTIFACT_URL ?? '',
    version: env.VERSION ?? '',
    notes: env.RELEASE_NOTES ?? '',
    store: env.STORE ?? '',
    appId: env.APP_ID ?? '',
    channel: env.CHANNEL ?? '',
    operation: env.OPERATION ?? '',
  };
}

/**
 * The submission as this workflow allows it: one of its stores, channels and operations, a release tag of a variant, and
 * a store package of exactly that release of this repository. The app identity is checked against the manifest separately.
 */
export function validateInputs(i, repo) {
  const fail = (message) => {
    throw new Error(message);
  };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(i.submissionId)) fail('factory_submission_id is not a factory submission ID.');
  if (!/^[0-9a-f]{40}$/.test(i.sourceSha)) fail('source_sha must be a 40-character commit SHA.');
  if (!/^sha256:[0-9a-f]{64}$/.test(i.artifactDigest)) fail('artifact_digest must be sha256: and 64 lowercase hex characters.');
  const store = STORES[i.store];
  if (!store) fail(`store "${i.store}" is not published by this workflow (${Object.keys(STORES).join(', ')}).`);
  if (!['upload', 'publish'].includes(i.operation)) fail(`operation "${i.operation}" must be upload or publish.`);
  if (!store.channels.includes(i.channel)) fail(`channel "${i.channel}" is not a ${i.store} channel (${store.channels.join(', ')}).`);
  const tag = /^([a-z]+)-v(\d+)\.(\d+)$/.exec(i.version);
  if (!tag || !VARIANT_IDS.includes(tag[1])) fail(`version "${i.version}" is not an app release tag (<variant>-v<major>.<run>).`);
  const prefix = `https://github.com/${repo}/releases/download/${i.version}/`;
  const asset = i.artifactUrl.startsWith(prefix) ? i.artifactUrl.slice(prefix.length) : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(asset) || !asset.endsWith(store.suffix)) fail(`artifact_url must be the ${store.suffix} asset of the ${i.version} release of ${repo}.`);
  return { variant: tag[1], platform: store.platform, tag: i.version, major: Number(tag[2]), run: Number(tag[3]), marketingVersion: `${tag[2]}.${tag[3]}`, asset };
}

/** The store identity a manifest gives the app: the iOS bundle ID or the Android package. */
export function manifestAppId(manifest, store) {
  return store === 'apple-ios' ? manifest?.identity?.ios?.bundleIdentifier : manifest?.identity?.android?.package;
}

/** The manifest checks: the tag belongs to this variant's version line, and app_id is this variant's store identity. */
export function checkManifest(manifest, plan, i) {
  if (manifest?.id !== plan.variant) throw new Error(`The manifest at ${i.sourceSha} is not the ${plan.variant} variant's.`);
  const { tagPrefix, major } = manifest.versioning ?? {};
  if (tagPrefix !== `${plan.variant}-v` || major !== plan.major) throw new Error(`${plan.tag} is not on ${plan.variant}'s version line (${tagPrefix}${major}.<run>).`);
  const expected = manifestAppId(manifest, i.store);
  if (!expected || expected !== i.appId) throw new Error(`app_id ${i.appId} is not ${plan.variant}'s ${i.store} identity (${expected ?? 'none'}).`);
}

/** The reviewed tags of this workflow; the store-<variant> environments release their credentials only to these. */
export const WORKFLOW_TAG_PREFIX = 'store-publish-v';
/**
 * The factory dispatches this workflow at a reviewed, immutable tag. A run on a branch (or another tag) carries code nobody
 * reviewed for store access, so it stops here, as the environments' tag policy stops it again.
 */
export function checkRef(refType, refName) {
  if (refType !== 'tag' || !String(refName).startsWith(WORKFLOW_TAG_PREFIX)) throw new Error(`Store submissions run only from a reviewed ${WORKFLOW_TAG_PREFIX}* tag of this workflow, not ${refType} ${refName}.`);
}

/**
 * Whether the factory approved this run: the submission exists, everything this run was given equals what was approved,
 * and the approved action's dispatch receipt names this run. `wait` while the executor has not recorded the receipt yet.
 */
export function checkDispatch(snapshot, i, runId) {
  const submission = snapshot?.submissions?.find((x) => x.id === i.submissionId);
  if (!submission) return { error: `The factory has no submission ${i.submissionId} that this identity can see.` };
  const action = snapshot.actions?.find((x) => x.id === submission.actionId);
  const version = snapshot.versions?.find((x) => x.id === submission.versionId);
  if (!action || !version) return { error: `The factory does not show the action and version of submission ${i.submissionId}.` };
  const differ = [
    ['artifact_url', submission.artifactUrl, i.artifactUrl],
    ['artifact_digest', submission.artifactDigest, i.artifactDigest],
    ['operation', submission.operation, i.operation],
    ['store', submission.target?.store, i.store],
    ['app_id', submission.target?.appId, i.appId],
    ['channel', submission.target?.channel, i.channel],
    ['version', version.tag, i.version],
    ['source_sha', version.sourceRevision, i.sourceSha],
  ]
    .filter(([, approved, given]) => approved !== given)
    .map(([name]) => name);
  if (differ.length) return { error: `These inputs differ from the approved submission: ${differ.join(', ')}.` };
  if (['failed', 'rejected', 'uncertain'].includes(action.state)) return { error: `The factory action of this submission is ${action.state}.` };
  if (action.state !== 'succeeded') return { wait: `The factory action is ${action.state}; waiting for its dispatch receipt.` };
  if (String(action.receipt?.observedRevision) !== String(runId)) return { error: `The approved dispatch started run ${action.receipt?.observedRevision}, not this run (${runId}).` };
  // A re-run after a store write must not write again: once reported, a submission is the factory's to follow up.
  if (submission.state !== 'dispatched') return { error: `The submission is already ${submission.state}.` };
  return { submission, action, version };
}

/** The digest SHA256SUMS lists for a file (`<hex>  <name>` lines, as sha256sum writes them). */
export function sumOf(sums, name) {
  for (const line of String(sums).split('\n')) {
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim());
    if (m && m[2] === name) return m[1];
  }
  return undefined;
}

/**
 * The release must be the production release of this commit, with this platform's binary built natively in it (not an
 * over-the-air update pointing at older binaries, not a failed build), and list the package's digest in SHA256SUMS.
 */
export function checkRelease({ release, commit, fingerprints, sums }, plan, i) {
  const fail = (message) => {
    throw new Error(`${plan.tag}: ${message}`);
  };
  if (release?.draft || release?.prerelease) fail('the GitHub release is a draft or prerelease; only production releases go to stores.');
  if (commit !== i.sourceSha) fail(`the tag points to ${commit}, not ${i.sourceSha}.`);
  const f = fingerprints ?? {};
  if (f.variant !== plan.variant || f.tag !== plan.tag || f.commit !== i.sourceSha) fail('fingerprints.json describes another variant, tag or commit.');
  if (f.channel !== 'production') fail(`the release was built for the ${f.channel} channel, not production.`);
  if (f.version !== plan.marketingVersion || !Number.isInteger(f.buildNumber)) fail('fingerprints.json has no matching version and build number.');
  const p = f.platforms?.[plan.platform];
  if (!p?.native || p.failed || p.binariesRelease !== plan.tag) fail(`${plan.platform} was not built natively in this release (an over-the-air update or a failed build).`);
  if (sumOf(sums, plan.asset) !== i.artifactDigest.slice('sha256:'.length)) fail(`SHA256SUMS does not list ${plan.asset} with the approved digest.`);
  return { buildNumber: f.buildNumber };
}

/** Release notes cut to a store's limit, on a line boundary where one is near. */
export function storeNotes(notes, limit = NOTES_LIMIT) {
  const text = String(notes).trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const line = cut.lastIndexOf('\n');
  return (line > limit * 0.8 ? cut.slice(0, line) : cut).trimEnd() + '…';
}

/**
 * The outcome to report. An upload is for testers and never a release, whatever track it reached. A publish is reported
 * once the store accepted the release: submitted for App Store review, or committed to Play's production track; the store's
 * own review follows in App Store Connect or the Play Console.
 */
export function outcomes(i) {
  return i.operation === 'publish' ? ['published'] : ['uploaded'];
}

/** Play release status of an upload: completed on its testing track, so the track's testers get it. */
export const playReleaseStatus = () => 'completed';

/** A Google service account assertion for the Play Developer API (RS256 JWT, one hour). */
export function playAssertion({ clientEmail, privateKey, tokenUri = 'https://oauth2.googleapis.com/token', now = Date.now() }) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(now / 1000);
  const data = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: clientEmail, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: tokenUri, iat, exp: iat + 3600 })}`;
  return `${data}.${crypto.sign('sha256', Buffer.from(data), privateKey).toString('base64url')}`;
}

/** Whether a Play track has a completed release of this version code. */
export const trackHas = (track, code, status = 'completed') => (track?.releases ?? []).some((r) => r.status === status && (r.versionCodes ?? []).map(String).includes(String(code)));

/** The EAS submission page eas submit prints. */
export function easSubmissionUrl(log) {
  return /https:\/\/expo\.dev\/accounts\/[\w.-]+\/projects\/[\w.-]+\/submissions\/[0-9a-f-]{36}/.exec(String(log))?.[0];
}

/** An App Store Connect API token (ES256 JWT, 20 minutes). */
export function ascToken({ keyId, issuerId, privateKey, now = Date.now() }) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(now / 1000);
  const data = `${b64({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${b64({ iss: issuerId, iat, exp: iat + 1200, aud: 'appstoreconnect-v1' })}`;
  const signature = crypto.sign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${data}.${signature.toString('base64url')}`;
}

// ── side effects ──────────────────────────────────────────────────────────────────────────────────────────────────

const storeDir = () => path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'store');
const receiptDir = () => path.join(storeDir(), 'receipt');
const recordPart = (name, data) => writeJson(path.join(receiptDir(), `${name}.json`), data);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (text) => String(text).replace(/\s+/g, ' ').slice(0, 300);

function manifestAt(sha, variant) {
  const text = execFileSync('git', ['show', `${sha}:apps/omni/variants/${variant}/variant.json`], { cwd: repoRoot, encoding: 'utf8' });
  return JSON.parse(text);
}

function factory(env = process.env) {
  const origin = String(env.FACTORY_URL ?? '').replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+/.test(origin) || !env.FACTORY_TOKEN) throw new Error('Set the FACTORY_URL variable (https) and the FACTORY_TOKEN secret: nothing is submitted without the factory confirming the approval.');
  const headers = {
    Authorization: `Bearer ${env.FACTORY_TOKEN}`,
    ...(env.CF_ACCESS_CLIENT_ID ? { 'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET ?? '' } : {}),
  };
  const call = async (pathname, init = {}) => {
    const res = await fetch(origin + pathname, { ...init, headers: { ...headers, ...init.headers }, redirect: 'error' });
    const text = await res.text();
    if (!res.ok) throw new Error(`Factory ${init.method ?? 'GET'} ${pathname} answered HTTP ${res.status}: ${short(text)}`);
    return text ? JSON.parse(text) : null;
  };
  return {
    snapshot: async () => (await call('/api/snapshot')).snapshot,
    evidence: (name, content, fields) => {
      const form = new FormData();
      form.set('file', new Blob([content], { type: 'application/json' }), name);
      for (const [k, v] of Object.entries(fields)) if (v) form.set(k, v);
      return call('/api/evidence', { method: 'POST', body: form });
    },
    command: (body, key) => call('/api/commands', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key } }),
  };
}

function github(env = process.env) {
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!repo || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required.');
  const api = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const request = async (pathname, accept = 'application/vnd.github+json') => {
    const res = await fetch(api + pathname, { headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'resgrid-omni-ci' } });
    if (!res.ok) throw new Error(`GitHub ${pathname} answered HTTP ${res.status}.`);
    return res;
  };
  return {
    repo,
    json: async (pathname) => (await request(pathname)).json(),
    asset: async (id) => Buffer.from(await (await request(`/repos/${repo}/releases/assets/${id}`, 'application/octet-stream')).arrayBuffer()),
  };
}

async function plan() {
  checkRef(process.env.GITHUB_REF_TYPE, process.env.GITHUB_REF_NAME);
  const i = readInputs();
  const p = validateInputs(i, process.env.GITHUB_REPOSITORY ?? '');
  checkManifest(manifestAt(i.sourceSha, p.variant), p, i);
  setOutputs({ variant: p.variant, platform: p.platform, asset: p.asset, marketing_version: p.marketingVersion, run_number: String(p.run), release_status: playReleaseStatus() });
  appendSummary(`## Store submission\n\n${p.tag} → ${i.store} · ${i.channel} · ${i.operation} (${i.appId})\n\nFactory submission \`${i.submissionId}\``);
  console.log(JSON.stringify(p));
}

async function confirm() {
  const i = readInputs();
  const client = factory();
  const runId = process.env.GITHUB_RUN_ID;
  const deadline = Date.now() + 10 * 60000;
  for (;;) {
    const result = checkDispatch(await client.snapshot(), i, runId);
    if (result.error) throw new Error(result.error);
    if (!result.wait) {
      recordPart('factory', { submissionId: i.submissionId, actionId: result.action.id, versionId: result.version.id, environmentId: result.submission.environmentId ?? null });
      console.log(`Run ${runId} is the approved dispatch of factory submission ${i.submissionId}.`);
      return;
    }
    if (Date.now() > deadline) throw new Error(`${result.wait} Gave up after 10 minutes; reconcile the submission in the factory.`);
    console.log(result.wait);
    await sleep(15000);
  }
}

async function fetchPackage() {
  const i = readInputs();
  const p = validateInputs(i, process.env.GITHUB_REPOSITORY ?? '');
  const gh = github();
  const release = await gh.json(`/repos/${gh.repo}/releases/tags/${encodeURIComponent(p.tag)}`);
  const commit = (await gh.json(`/repos/${gh.repo}/commits/${encodeURIComponent(p.tag)}`)).sha;
  const named = (name) => {
    const asset = (release.assets ?? []).find((a) => a.name === name);
    if (!asset) throw new Error(`${p.tag} has no ${name} asset.`);
    return asset;
  };
  const fingerprints = JSON.parse((await gh.asset(named('fingerprints.json').id)).toString('utf8'));
  const sums = (await gh.asset(named('SHA256SUMS').id)).toString('utf8');
  const { buildNumber } = checkRelease({ release, commit, fingerprints, sums }, p, i);
  const asset = named(p.asset);
  if (asset.digest && asset.digest !== i.artifactDigest) throw new Error(`GitHub records ${asset.digest} for ${p.asset}, not the approved digest.`);
  // A publish releases the build its upload sent to the store; only an upload needs the package itself.
  if (i.operation !== 'upload') {
    recordPart('package', { asset: p.asset, digest: i.artifactDigest, release: release.html_url, commit, buildNumber, version: p.marketingVersion });
    setOutputs({ build_number: String(buildNumber) });
    console.log(`${p.tag}: build ${buildNumber} verified against SHA256SUMS and fingerprints.json; nothing to download for a publish.`);
    return;
  }
  const bytes = await gh.asset(asset.id);
  const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  if (digest !== i.artifactDigest) throw new Error(`${p.asset} has digest ${digest}, not the approved ${i.artifactDigest}.`);
  const file = path.join(storeDir(), 'package', p.asset);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  recordPart('package', { asset: p.asset, digest, bytes: bytes.length, release: release.html_url, commit, buildNumber, version: p.marketingVersion });
  setOutputs({ path: file, build_number: String(buildNumber) });
  console.log(`${p.asset}: ${digest}, build ${buildNumber}, verified against the release, SHA256SUMS and fingerprints.json.`);
}

function easReceipt(args) {
  const log = fs.readFileSync(String(args.log), 'utf8');
  recordPart('eas', { submission: easSubmissionUrl(log) ?? null });
}

async function appStore() {
  const i = readInputs();
  const p = validateInputs(i, process.env.GITHUB_REPOSITORY ?? '');
  const env = process.env;
  const buildNumber = String(readJsonIfExists(path.join(receiptDir(), 'package.json'))?.buildNumber ?? '');
  if (!env.ASC_APP_ID || !env.IOS_ASC_KEY_ID || !env.IOS_ASC_ISSUER_ID || !env.ASC_KEY_PATH || !buildNumber)
    throw new Error('ASC_APP_ID, IOS_ASC_KEY_ID, IOS_ASC_ISSUER_ID, the API key and the build number are required.');
  const privateKey = fs.readFileSync(env.ASC_KEY_PATH, 'utf8');
  const asc = async (method, pathname, body) => {
    const token = ascToken({ keyId: env.IOS_ASC_KEY_ID, issuerId: env.IOS_ASC_ISSUER_ID, privateKey });
    const res = await fetch(ASC_API + pathname, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (!res.ok) {
      const detail = (() => {
        try {
          return JSON.parse(text)
            .errors?.map((e) => e.detail ?? e.title)
            .join(' ');
        } catch {
          return short(text);
        }
      })();
      throw new Error(`App Store Connect ${method} ${pathname.split('?')[0]} answered HTTP ${res.status}: ${detail}`);
    }
    return text ? JSON.parse(text) : null;
  };
  const appId = env.ASC_APP_ID;
  const app = await asc('GET', `/v1/apps/${appId}?fields[apps]=bundleId`);
  if (app.data.attributes.bundleId !== i.appId) throw new Error(`ASC_APP_ID ${appId} is ${app.data.attributes.bundleId}, not ${i.appId}.`);
  const receipt = { appId, bundleId: i.appId };

  // eas submit returns once the upload is done; App Store Connect then processes the build.
  let build;
  const deadline = Date.now() + 90 * 60000;
  for (;;) {
    const found = await asc(
      'GET',
      `/v1/builds?filter[app]=${appId}&filter[version]=${encodeURIComponent(buildNumber)}&filter[preReleaseVersion.version]=${encodeURIComponent(p.marketingVersion)}&fields[builds]=version,processingState,usesNonExemptEncryption,expired&limit=1`
    );
    build = found.data?.[0];
    const state = build?.attributes?.processingState;
    if (state === 'VALID') break;
    if (state === 'FAILED' || state === 'INVALID') throw new Error(`App Store Connect processing of build ${buildNumber} ended ${state}.`);
    if (Date.now() > deadline) throw new Error(`Build ${p.marketingVersion} (${buildNumber}) was not processed within 90 minutes (state ${state ?? 'not found'}).`);
    console.log(`Build ${p.marketingVersion} (${buildNumber}): ${state ?? 'not listed yet'}; checking again in 30 s.`);
    await sleep(30000);
  }
  receipt.buildId = build.id;
  const whatsNew = storeNotes(i.notes);

  if (i.operation === 'upload') {
    // TestFlight "What to Test", in English (the notes are English).
    const beta = await asc('GET', `/v1/builds/${build.id}/betaBuildLocalizations`);
    const english = beta.data?.find((l) => l.attributes.locale === 'en-US');
    if (english) await asc('PATCH', `/v1/betaBuildLocalizations/${english.id}`, { data: { type: 'betaBuildLocalizations', id: english.id, attributes: { whatsNew } } });
    else await asc('POST', '/v1/betaBuildLocalizations', { data: { type: 'betaBuildLocalizations', attributes: { locale: 'en-US', whatsNew }, relationships: { build: { data: { type: 'builds', id: build.id } } } } });
    receipt.testflightNotes = true;
  }

  if (i.operation === 'publish') {
    // Export compliance is a legal declaration: the app config answers it (ITSAppUsesNonExemptEncryption), never this job.
    if (build.attributes.usesNonExemptEncryption === null || build.attributes.usesNonExemptEncryption === undefined)
      throw new Error(`Build ${buildNumber} has no export compliance answer. Set ITSAppUsesNonExemptEncryption in the app config, or answer it in App Store Connect, then submit again.`);
    const editable = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];
    const versions = (await asc('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&fields[appStoreVersions]=versionString,appStoreState&limit=50`)).data ?? [];
    let version = versions.find((v) => v.attributes.versionString === p.marketingVersion);
    const pending = versions.find((v) => v !== version && [...editable, 'WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE'].includes(v.attributes.appStoreState));
    if (version && !editable.includes(version.attributes.appStoreState)) {
      const attached = (await asc('GET', `/v1/appStoreVersions/${version.id}/build`)).data;
      if (attached?.id === build.id && ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE'].includes(version.attributes.appStoreState)) {
        Object.assign(receipt, { appStoreVersionId: version.id, versionString: p.marketingVersion, state: version.attributes.appStoreState, note: 'This build was already submitted.' });
        recordPart('app-store', receipt);
        return;
      }
      throw new Error(`App Store version ${p.marketingVersion} is ${version.attributes.appStoreState} and cannot take this build.`);
    }
    if (!version && pending)
      throw new Error(`App Store version ${pending.attributes.versionString} is ${pending.attributes.appStoreState}. Finish or remove it in App Store Connect before submitting ${p.marketingVersion}.`);
    if (!version)
      version = (
        await asc('POST', '/v1/appStoreVersions', {
          data: {
            type: 'appStoreVersions',
            attributes: { platform: 'IOS', versionString: p.marketingVersion, releaseType: env.IOS_RELEASE_TYPE || 'AFTER_APPROVAL' },
            relationships: { app: { data: { type: 'apps', id: appId } } },
          },
        })
      ).data;
    await asc('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, { data: { type: 'builds', id: build.id } });
    // What's New in every localization of the version (the text is English).
    const localizations = (await asc('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`)).data ?? [];
    for (const l of localizations) await asc('PATCH', `/v1/appStoreVersionLocalizations/${l.id}`, { data: { type: 'appStoreVersionLocalizations', id: l.id, attributes: { whatsNew } } });
    const open = (await asc('GET', `/v1/reviewSubmissions?filter[app]=${appId}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&limit=1`)).data?.[0];
    const submission = open ?? (await asc('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: appId } } } } })).data;
    await asc('POST', '/v1/reviewSubmissionItems', {
      data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } },
    });
    const submitted = (await asc('PATCH', `/v1/reviewSubmissions/${submission.id}`, { data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } } })).data;
    Object.assign(receipt, {
      appStoreVersionId: version.id,
      versionString: p.marketingVersion,
      localizations: localizations.length,
      reviewSubmissionId: submission.id,
      state: submitted?.attributes?.state ?? 'WAITING_FOR_REVIEW',
    });
  }
  recordPart('app-store', receipt);
  console.log(JSON.stringify(receipt));
}

async function report(args) {
  const i = readInputs();
  const parts = Object.fromEntries(
    (fs.existsSync(receiptDir()) ? fs.readdirSync(receiptDir()) : []).filter((f) => f.endsWith('.json')).map((f) => [f.replace(/\.json$/, ''), readJsonIfExists(path.join(receiptDir(), f))])
  );
  const ids = parts.factory;
  if (!ids) throw new Error('No confirmed factory submission to report on.');
  const run = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const failed = !!args.failed;
  const list = failed ? ['failed'] : outcomes(i);
  const externalId = String(
    parts['app-store']?.reviewSubmissionId ?? parts['app-store']?.buildId ?? (parts.play ? `${parts.play.packageName}:${parts.play.track}:${parts.play.versionCode}` : undefined) ?? parts.eas?.submission ?? run
  ).slice(0, 1000);
  const receipt = {
    factorySubmissionId: i.submissionId,
    store: i.store,
    appId: i.appId,
    channel: i.channel,
    operation: i.operation,
    version: i.version,
    sourceSha: i.sourceSha,
    artifactDigest: i.artifactDigest,
    run,
    ...(failed ? { error: 'The store submission failed; the run log names the step.' } : {}),
    ...parts,
    reportedAt: new Date().toISOString(),
  };
  const client = factory();
  for (const outcome of list) {
    const snapshot = await client.snapshot();
    const submission = snapshot.submissions?.find((x) => x.id === i.submissionId);
    if (!submission) throw new Error(`The factory no longer shows submission ${i.submissionId}.`);
    if (submission.state === outcome) continue;
    const evidence = await client.evidence(`store-${outcome}-${i.submissionId}.json`, JSON.stringify({ ...receipt, outcome }, null, 2), {
      versionId: ids.versionId,
      actionId: ids.actionId,
      environmentId: ids.environmentId,
      sourceRevision: i.sourceSha,
    });
    await client.command(
      { type: 'store.report', id: i.submissionId, expectedRevision: submission.revision, outcome, externalId, evidenceIds: [evidence.id] },
      `store-report-${i.submissionId}-${outcome}-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? 1}`
    );
    console.log(`Reported ${outcome} for submission ${i.submissionId} (${externalId}).`);
  }
  appendSummary(`Factory submission \`${i.submissionId}\`: ${list.join(', then ')} · ${externalId}`);
}

async function playRelease() {
  const i = readInputs();
  const p = validateInputs(i, process.env.GITHUB_REPOSITORY ?? '');
  const env = process.env;
  const code = String(readJsonIfExists(path.join(receiptDir(), 'package.json'))?.buildNumber ?? '');
  if (!env.PLAY_KEY_PATH || !code) throw new Error('PLAY_SERVICE_ACCOUNT_JSON_BASE64 and the version code are required to release on Google Play.');
  const key = JSON.parse(fs.readFileSync(env.PLAY_KEY_PATH, 'utf8'));
  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token';
  const auth = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: playAssertion({ clientEmail: key.client_email, privateKey: key.private_key, tokenUri }) }),
  });
  if (!auth.ok) throw new Error(`Google sign-in for the Play service account answered HTTP ${auth.status}.`);
  const { access_token: token } = await auth.json();
  const app = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(i.appId)}`;
  const play = async (method, pathname, body) => {
    const res = await fetch(app + pathname, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (!res.ok) throw new Error(`Google Play ${method} ${pathname} answered HTTP ${res.status}: ${short(text)}`);
    return text ? JSON.parse(text) : null;
  };
  const edit = await play('POST', '/edits');
  const receipt = { packageName: i.appId, versionCode: code, from: i.channel, track: 'production' };
  try {
    const testing = await play('GET', `/edits/${edit.id}/tracks/${encodeURIComponent(i.channel)}`);
    if (!trackHas(testing, code)) throw new Error(`Version code ${code} is not a completed release on the ${i.channel} track. Upload it first.`);
    const production = await play('GET', `/edits/${edit.id}/tracks/production`);
    if (trackHas(production, code) || trackHas(production, code, 'inProgress')) {
      Object.assign(receipt, { note: 'This version code is already on the production track.' });
      await play('DELETE', `/edits/${edit.id}`).catch(() => {});
    } else {
      // An optional staged rollout (for example 0.1 for ten percent); without one the release goes to everyone.
      const fraction = Number(env.PLAY_ROLLOUT_FRACTION || 0);
      const staged = fraction > 0 && fraction < 1;
      await play('PUT', `/edits/${edit.id}/tracks/production`, {
        track: 'production',
        releases: [
          {
            name: `${p.marketingVersion} (${code})`,
            versionCodes: [code],
            status: staged ? 'inProgress' : 'completed',
            ...(staged ? { userFraction: fraction } : {}),
            releaseNotes: [{ language: 'en-US', text: storeNotes(i.notes, PLAY_NOTES_LIMIT) }],
          },
        ],
      });
      const committed = await play('POST', `/edits/${edit.id}:commit`);
      Object.assign(receipt, { editId: committed?.id ?? edit.id, status: staged ? `inProgress (${fraction})` : 'completed' });
    }
  } catch (error) {
    await play('DELETE', `/edits/${edit.id}`).catch(() => {});
    throw error;
  }
  recordPart('play', receipt);
  console.log(JSON.stringify(receipt));
}

const commands = { plan, confirm, fetch: fetchPackage, 'eas-receipt': easReceipt, 'app-store': appStore, 'play-release': playRelease, report };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs();
  const command = commands[args._[0]];
  if (!command) {
    console.error(`usage: store-publish.mjs <${Object.keys(commands).join('|')}>`);
    process.exit(2);
  }
  Promise.resolve(command(args)).catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
