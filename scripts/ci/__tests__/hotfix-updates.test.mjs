// node --test scripts/ci/__tests__ — EAS updates are for critical and emergency fixes only (owner decision 2026-11-10):
// only ota.yml publishes them, only from the hotfix branch, and its guard (runsRuntime + findPreviousRelease in
// scripts/ci/lib.mjs) matches the newest release whose binaries run the bundle's runtime. A pull request into hotfix
// publishes nothing and fails when it changes native code (describeNativeChanges lists what changed).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';

import { describeNativeChanges, findPreviousRelease, repoRoot, runsRuntime } from '../lib.mjs';

const require = createRequire(import.meta.url);
const YAML = require('yaml');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');
const readWorkflow = (name) => fs.readFileSync(path.join(workflowsDir, name), 'utf8');

const built = (tag, fingerprint) => ({ fingerprint, native: true, binariesRelease: tag });

function release(tag, channel, platforms) {
  return { tag, channel, record: { schema: 1, channel, tag, runNumber: Number(tag.split('.').pop()), platforms } };
}

/** A githubClient stand-in serving releases newest first, each with a fingerprints.json asset. */
function fakeClient(releases) {
  return {
    async releases() {
      return releases.map((r, i) => ({ tag_name: r.tag, draft: false, assets: [{ id: i, name: 'fingerprints.json' }] }));
    },
    async assetText(id) {
      return JSON.stringify(releases[id].record);
    },
  };
}

describe('runsRuntime', () => {
  const record = { platforms: { android: built('unit-v8.40', 'aaa'), ios: built('unit-v8.40', 'iii') } };

  it('matches when every requested platform has binaries with that fingerprint', () => {
    assert.equal(runsRuntime(record, { android: 'aaa', ios: 'iii' }), true);
    assert.equal(runsRuntime(record, { android: 'aaa' }), true);
  });

  it('refuses a different fingerprint on any platform', () => {
    assert.equal(runsRuntime(record, { android: 'aaa', ios: 'other' }), false);
  });

  it('refuses a platform whose native build failed or was never recorded', () => {
    const failed = { platforms: { android: { fingerprint: 'aaa', native: true, binariesRelease: null, failed: true } } };

    assert.equal(runsRuntime(failed, { android: 'aaa' }), false);
    assert.equal(runsRuntime({ platforms: {} }, { ios: 'iii' }), false);
    assert.equal(runsRuntime({ platforms: { android: built('unit-v8.1', null) } }, { android: null }), false);
  });
});

describe('findPreviousRelease with a match (hotfix guard)', () => {
  const releases = [
    // A release candidate from master with a native change, not in the stores yet.
    release('unit-v8.45', 'production', { android: built('unit-v8.45', 'new'), ios: built('unit-v8.45', 'new-ios') }),
    release('unit-v8.44', 'internal', { android: built('unit-v8.44', 'aaa'), ios: built('unit-v8.44', 'iii') }),
    // The store build the hotfix branch was cut from.
    release('unit-v8.40', 'production', { android: built('unit-v8.40', 'aaa'), ios: built('unit-v8.40', 'iii') }),
    release('unit-v8.30', 'production', { android: built('unit-v8.30', 'aaa'), ios: built('unit-v8.30', 'iii') }),
  ];

  const client = fakeClient(releases);

  it('finds the newest release on the channel whose binaries run the runtime, skipping newer ones that do not', async () => {
    const found = await findPreviousRelease({ variant: 'unit', channel: 'production', client, match: (r) => runsRuntime(r, { android: 'aaa', ios: 'iii' }) });

    assert.equal(found.release, 'unit-v8.40');
    assert.equal(found.record.runNumber, 40);
    assert.deepEqual(found.skipped, ['unit-v8.45']);
  });

  it('refuses when no release on the channel runs the runtime', async () => {
    const found = await findPreviousRelease({ variant: 'unit', channel: 'production', client, match: (r) => runsRuntime(r, { android: 'native-change' }) });

    assert.equal(found.release, null);
    assert.equal(found.record, null);
    assert.deepEqual(found.skipped, ['unit-v8.45', 'unit-v8.40', 'unit-v8.30']);
    assert.match(found.note, /no matching unit-v\* release on channel "production"/);
  });

  it('still returns the newest release on the channel without a match', async () => {
    const found = await findPreviousRelease({ variant: 'unit', channel: 'production', client, excludeTag: 'unit-v8.45' });

    assert.equal(found.release, 'unit-v8.40');
    assert.deepEqual(found.skipped, []);
  });

  it('finds the store build behind any number of newer release candidates with another runtime', async () => {
    const candidates = Array.from({ length: 40 }, (_, i) => {
      const tag = `unit-v8.${100 - i}`;

      return release(tag, 'production', { android: built(tag, `rc-${i}`), ios: built(tag, `rc-ios-${i}`) });
    });

    const many = fakeClient([...candidates, release('unit-v8.40', 'production', { android: built('unit-v8.40', 'aaa'), ios: built('unit-v8.40', 'iii') })]);
    const found = await findPreviousRelease({ variant: 'unit', channel: 'production', client: many, match: (r) => runsRuntime(r, { android: 'aaa', ios: 'iii' }) });

    assert.equal(found.release, 'unit-v8.40');
    assert.equal(found.skipped.length, 40);
  });
});

describe('describeNativeChanges (hotfix pull request check)', () => {
  const file = (filePath, hash) => ({ type: 'file', filePath, reasons: ['expoConfigPlugins'], hash });
  const pkg = (name, version, hash) => ({ type: 'package', name, version, filePath: `../../node_modules/${name}/package.json`, reasons: ['expoAutolinkingAndroid'], hash });
  const config = (android) => ({ type: 'contents', id: 'expoConfig', contents: JSON.stringify({ name: 'Unit', android, plugins: ['a'] }), reasons: ['expoConfig'], hash: JSON.stringify(android) });
  const base = [file('../../packages/config-plugins/index.js', 'f1'), pkg('react-native-foo', '1.2.0', 'p1'), pkg('react-native-old', '2.0.0', 'o1'), config({ permissions: ['WAKE_LOCK'], package: 'x' })];

  it('reports nothing for identical sources', () => {
    assert.deepEqual(describeNativeChanges(base, base), []);
  });

  it('names upgraded, added and removed native packages, changed files and changed app config keys', () => {
    const head = [file('../../packages/config-plugins/index.js', 'f2'), pkg('react-native-foo', '1.3.0', 'p2'), pkg('react-native-new', '0.1.0', 'n1'), config({ permissions: ['WAKE_LOCK', 'NFC'], package: 'x' })];

    assert.deepEqual(describeNativeChanges(base, head), [
      'app config changed: android.permissions',
      'file packages/config-plugins/index.js changed',
      'native package react-native-foo 1.2.0 → 1.3.0',
      'native package react-native-new 0.1.0 added',
      'native package react-native-old 2.0.0 removed',
    ]);
  });

  it('ignores sources without a hash (generated native folders the fingerprint skips)', () => {
    const generated = { type: 'dir', filePath: 'android', reasons: ['bareNativeDir'], hash: null };

    assert.deepEqual(describeNativeChanges([...base, generated], base), []);
  });
});

describe('EAS update publishing', () => {
  it('only ota.yml runs eas update', () => {
    for (const file of fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f))) {
      if (file === 'ota.yml') continue;

      assert.doesNotMatch(readWorkflow(file), /\beas update\b/, `${file} must not publish EAS updates; they ship only from the hotfix branch (ota.yml)`);
    }
  });

  it('ota.yml runs only for the hotfix branch: a pull request into it, a push to it, or a dispatch it refuses elsewhere', () => {
    const source = readWorkflow('ota.yml');
    const on = YAML.parse(source).on;

    assert.deepEqual(Object.keys(on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
    assert.deepEqual(on.push.branches, ['hotfix']);
    assert.deepEqual(on.pull_request.branches, ['hotfix']);
    assert.equal(on.push.tags, undefined);
    assert.match(source, /\[ "\$BASE_REF" != hotfix \]; then[\s\S]*?exit 1/);
    assert.match(source, /\[ "\$REF" != refs\/heads\/hotfix \]; then[\s\S]*?exit 1/);
  });

  it('a pull request into hotfix is a dry run: it never publishes and gets no Expo token', () => {
    const { jobs } = YAML.parse(readWorkflow('ota.yml'));
    const publishing = Object.entries(jobs).filter(([, job]) => /\beas update\b/.test(JSON.stringify(job.steps)));

    assert.deepEqual(
      publishing.map(([id]) => id),
      ['update']
    );
    assert.equal(jobs.update.if, "github.event_name != 'pull_request'");
    assert.equal(jobs.check.if, "github.event_name == 'pull_request'");
    assert.doesNotMatch(JSON.stringify(jobs.check), /EXPO_TOKEN|SENTRY_AUTH_TOKEN|expo-github-action/);
    assert.equal(jobs.check.environment.deployment, false);
    assert.ok(
      jobs.check.steps.some((step) => /fingerprint\.mjs check/.test(step.run ?? '')),
      'the dry run runs the same guard as the update job'
    );
  });

  it('a pull request with native changes cannot pass: hotfix-ok needs the no-secrets native comparison and the dry run', () => {
    const { jobs } = YAML.parse(readWorkflow('ota.yml'));
    const native = JSON.stringify(jobs.native);

    assert.equal(jobs.native.if, "github.event_name == 'pull_request'");
    assert.equal(jobs.native.environment, undefined);
    assert.doesNotMatch(native, /secrets\./);
    assert.match(native, /fingerprint\.mjs diff --base/);
    // The hotfix branch is resolved outside the workspace (autolinking searches node_modules above the project).
    assert.match(native, /git worktree add --detach \\"\$RUNNER_TEMP\/hotfix-base\\" \\"\$BASE_SHA\\"/);
    assert.deepEqual(jobs.check.needs, ['plan', 'native']);
    assert.deepEqual(jobs['hotfix-ok'].needs, ['plan', 'native', 'check']);
    assert.equal(jobs['hotfix-ok'].name, 'hotfix-ok');
    assert.equal(jobs['hotfix-ok'].if, "${{ always() && github.event_name == 'pull_request' }}");
  });

  it('release.yml has no update job and no force_native input (every run builds native)', () => {
    const doc = YAML.parse(readWorkflow('release.yml'));

    assert.equal(doc.jobs.ota, undefined);
    assert.equal(doc.on.workflow_dispatch.inputs.force_native, undefined);
  });
});
