// node --test scripts/ci/__tests__ — the pure parts of scripts/ci/store-publish.mjs.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';

import { ascToken, checkDispatch, checkManifest, checkRef, checkRelease, easSubmissionUrl, outcomes, playAssertion, playReleaseStatus, storeNotes, sumOf, trackHas, validateInputs } from '../store-publish.mjs';

const repo = 'Resgrid/Omni';
const sha = 'a'.repeat(40);
const hex = 'b'.repeat(64);
const inputs = (fields = {}) => ({
  submissionId: '0a3bacde-deae-4e42-86a7-681e7dea54d3',
  sourceSha: sha,
  artifactDigest: `sha256:${hex}`,
  artifactUrl: `https://github.com/${repo}/releases/download/unit-v8.15/ResgridUnit-8.15-android.aab`,
  version: 'unit-v8.15',
  notes: '# unit-v8.15\n\n- Change',
  store: 'google-play',
  appId: 'com.resgrid.unit',
  channel: 'internal',
  operation: 'upload',
  ...fields,
});
const unit = { id: 'unit', identity: { ios: { bundleIdentifier: 'com.resgrid.unit' }, android: { package: 'com.resgrid.unit' } }, versioning: { tagPrefix: 'unit-v', major: 8 } };

describe('validateInputs', () => {
  it('plans a store package of an app release', () => {
    assert.deepEqual(validateInputs(inputs(), repo), { variant: 'unit', platform: 'android', tag: 'unit-v8.15', major: 8, run: 15, marketingVersion: '8.15', asset: 'ResgridUnit-8.15-android.aab' });
    const ios = validateInputs(inputs({ store: 'apple-ios', channel: 'testflight', operation: 'publish', artifactUrl: `https://github.com/${repo}/releases/download/unit-v8.15/ResgridUnit-8.15-ios-appstore.ipa` }), repo);
    assert.equal(ios.platform, 'ios');
  });
  it('refuses anything else', () => {
    const refused = (fields, pattern) => assert.throws(() => validateInputs(inputs(fields), repo), pattern);
    refused({ submissionId: 'x' }, /factory submission ID/);
    refused({ sourceSha: 'main' }, /40-character/);
    refused({ artifactDigest: 'sha256:abc' }, /artifact_digest/);
    refused({ store: 'microsoft-store' }, /not published by this workflow/);
    refused({ operation: 'delete' }, /upload or publish/);
    refused({ channel: 'testflight' }, /not a google-play channel/);
    // Uploads go to testers; production is reached only by publishing an uploaded build.
    refused({ channel: 'production' }, /not a google-play channel/);
    refused({ store: 'apple-ios', channel: 'app-store', artifactUrl: `https://github.com/${repo}/releases/download/unit-v8.15/ResgridUnit-8.15-ios-appstore.ipa` }, /not a apple-ios channel/);
    refused({ version: 'v8.15' }, /not an app release tag/);
    refused({ version: 'other-v8.15' }, /not an app release tag/);
    // Another repository, another release, a sideload build or a path trick.
    refused({ artifactUrl: 'https://github.com/Evil/Omni/releases/download/unit-v8.15/ResgridUnit-8.15-android.aab' }, /artifact_url/);
    refused({ artifactUrl: `https://github.com/${repo}/releases/download/unit-v8.14/ResgridUnit-8.14-android.aab` }, /artifact_url/);
    refused({ artifactUrl: `https://github.com/${repo}/releases/download/unit-v8.15/ResgridUnit-8.15-android.apk` }, /artifact_url/);
    refused({ artifactUrl: `https://github.com/${repo}/releases/download/unit-v8.15/../x-android.aab` }, /artifact_url/);
  });
  it('checks the app identity and version line against the manifest', () => {
    const plan = validateInputs(inputs(), repo);
    checkManifest(unit, plan, inputs());
    assert.throws(() => checkManifest(unit, plan, inputs({ appId: 'com.resgrid.dispatch' })), /not unit's google-play identity/);
    assert.throws(() => checkManifest({ ...unit, versioning: { tagPrefix: 'unit-v', major: 7 } }, plan, inputs()), /version line/);
    assert.throws(() => checkManifest({ ...unit, id: 'ic' }, plan, inputs()), /not the unit variant/);
  });
});

describe('checkRef', () => {
  it('runs only from a reviewed tag of the workflow', () => {
    checkRef('tag', 'store-publish-v1');
    assert.throws(() => checkRef('branch', 'master'), /reviewed store-publish-v\* tag/);
    assert.throws(() => checkRef('tag', 'unit-v8.15'), /not tag unit-v8.15/);
  });
});

describe('checkDispatch', () => {
  const snapshot = (fields = {}) => ({
    submissions: [
      {
        id: inputs().submissionId,
        actionId: 'act',
        versionId: 'ver',
        state: 'dispatched',
        artifactUrl: inputs().artifactUrl,
        artifactDigest: inputs().artifactDigest,
        operation: 'upload',
        target: { store: 'google-play', appId: 'com.resgrid.unit', channel: 'internal' },
        revision: 3,
        ...fields.submission,
      },
    ],
    actions: [{ id: 'act', state: 'succeeded', receipt: { observedRevision: '777' }, ...fields.action }],
    versions: [{ id: 'ver', tag: 'unit-v8.15', sourceRevision: sha }],
  });
  it('accepts only the approved dispatch of these exact inputs', () => {
    assert.equal(checkDispatch(snapshot(), inputs(), 777).submission.revision, 3);
    assert.match(checkDispatch(snapshot({ action: { state: 'executing', receipt: undefined } }), inputs(), 777).wait, /waiting for its dispatch receipt/);
    assert.match(checkDispatch(snapshot(), inputs(), 778).error, /started run 777, not this run/);
    assert.match(checkDispatch(snapshot(), inputs({ channel: 'beta', artifactDigest: `sha256:${'c'.repeat(64)}` }), 777).error, /artifact_digest, channel/);
    assert.match(checkDispatch(snapshot({ action: { state: 'rejected' } }), inputs(), 777).error, /rejected/);
    assert.match(checkDispatch(snapshot({ submission: { state: 'uploaded' } }), inputs(), 777).error, /already uploaded/);
    assert.match(checkDispatch({ submissions: [] }, inputs(), 777).error, /no submission/);
  });
});

describe('checkRelease', () => {
  const plan = validateInputs(inputs(), repo);
  const record = (android = { fingerprint: 'f', native: true, binariesRelease: 'unit-v8.15' }) => ({
    release: { draft: false, prerelease: false },
    commit: sha,
    fingerprints: { variant: 'unit', tag: 'unit-v8.15', commit: sha, channel: 'production', version: '8.15', buildNumber: 100015, platforms: { android } },
    sums: `${'1'.repeat(64)}  fingerprints.json\n${hex}  ResgridUnit-8.15-android.aab\n`,
  });
  it('accepts the production release that built this binary', () => {
    assert.deepEqual(checkRelease(record(), plan, inputs()), { buildNumber: 100015 });
    assert.equal(sumOf(record().sums, 'fingerprints.json'), '1'.repeat(64));
  });
  it('refuses prereleases, other commits and channels, over-the-air releases and other digests', () => {
    const refused = (change, pattern) => {
      const r = record();
      change(r);
      assert.throws(() => checkRelease(r, plan, inputs()), pattern);
    };
    refused((r) => (r.release.prerelease = true), /prerelease/);
    refused((r) => (r.commit = 'c'.repeat(40)), /tag points to/);
    refused((r) => (r.fingerprints.channel = 'internal'), /internal channel/);
    refused((r) => (r.fingerprints.platforms.android = { fingerprint: 'f', native: false, binariesRelease: 'unit-v8.12' }), /over-the-air/);
    refused((r) => (r.fingerprints.platforms.android = { fingerprint: 'f', native: true, binariesRelease: null, failed: true }), /failed build/);
    refused((r) => (r.sums = `${'d'.repeat(64)}  ResgridUnit-8.15-android.aab\n`), /SHA256SUMS/);
  });
});

describe('store details', () => {
  it('reports an upload as uploaded, never as a release, and a publish as published', () => {
    assert.deepEqual(outcomes(inputs()), ['uploaded']);
    assert.deepEqual(outcomes(inputs({ channel: 'beta' })), ['uploaded']);
    assert.deepEqual(outcomes(inputs({ store: 'apple-ios', channel: 'testflight' })), ['uploaded']);
    assert.deepEqual(outcomes(inputs({ operation: 'publish' })), ['published']);
    assert.deepEqual(outcomes(inputs({ store: 'apple-ios', channel: 'testflight', operation: 'publish' })), ['published']);
    // A testing-track upload is completed there, so its testers get it.
    assert.equal(playReleaseStatus(), 'completed');
  });
  it('finds an uploaded version code on a Play track', () => {
    const track = {
      releases: [
        { status: 'completed', versionCodes: ['100015'] },
        { status: 'draft', versionCodes: ['100016'] },
      ],
    };
    assert.ok(trackHas(track, 100015));
    assert.ok(!trackHas(track, 100016));
    assert.ok(trackHas(track, '100016', 'draft'));
    assert.ok(!trackHas({}, 100015));
  });
  it('signs Play service account assertions', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwt = playAssertion({ clientEmail: 'publisher@resgrid.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), now: 1_700_000_000_000 });
    const [header, payload, signature] = jwt.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'RS256', typ: 'JWT' });
    assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), {
      iss: 'publisher@resgrid.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    assert.ok(crypto.verify('sha256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')));
  });
  it('cuts notes to the store limit and finds the EAS submission', () => {
    assert.equal(storeNotes('short'), 'short');
    const long = Array.from({ length: 200 }, (_, n) => `- Change ${n} with a description long enough to matter`).join('\n');
    const cut = storeNotes(long, 1000);
    assert.ok(cut.length <= 1000 && cut.endsWith('…') && !cut.includes('\n…'));
    assert.equal(
      easSubmissionUrl('done\nSee https://expo.dev/accounts/resgrid/projects/resgrid-unit/submissions/0a3bacde-deae-4e42-86a7-681e7dea54d3 now'),
      'https://expo.dev/accounts/resgrid/projects/resgrid-unit/submissions/0a3bacde-deae-4e42-86a7-681e7dea54d3'
    );
    assert.equal(easSubmissionUrl('nothing'), undefined);
  });
  it('signs App Store Connect tokens with the API key', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const token = ascToken({ keyId: 'KEY', issuerId: 'ISSUER', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), now: 1_700_000_000_000 });
    const [header, payload, signature] = token.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'ES256', kid: 'KEY', typ: 'JWT' });
    assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), { iss: 'ISSUER', iat: 1_700_000_000, exp: 1_700_001_200, aud: 'appstoreconnect-v1' });
    assert.ok(crypto.verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
  });
});
