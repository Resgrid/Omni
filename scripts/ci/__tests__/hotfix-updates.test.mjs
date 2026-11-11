// node --test scripts/ci/__tests__ — EAS updates are for critical and emergency fixes only (owner decision 2026-11-10):
// only ota.yml publishes them, only from the hotfix branch, and its guard (runsRuntime + findPreviousRelease in
// scripts/ci/lib.mjs) matches the newest release whose binaries run the bundle's runtime.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findPreviousRelease, repoRoot, runsRuntime } from '../lib.mjs';

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
});

describe('EAS update publishing', () => {
  it('only ota.yml runs eas update', () => {
    for (const file of fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f))) {
      if (file === 'ota.yml') continue;

      assert.doesNotMatch(readWorkflow(file), /\beas update\b/, `${file} must not publish EAS updates; they ship only from the hotfix branch (ota.yml)`);
    }
  });

  it('ota.yml runs only for the hotfix branch: a push to it, or a dispatch it refuses elsewhere', () => {
    const source = readWorkflow('ota.yml');
    const on = YAML.parse(source).on;

    assert.deepEqual(Object.keys(on).sort(), ['push', 'workflow_dispatch']);
    assert.deepEqual(on.push.branches, ['hotfix']);
    assert.equal(on.push.tags, undefined);
    assert.match(source, /if \[ "\$REF" != refs\/heads\/hotfix \]; then[\s\S]*?exit 1/);
  });

  it('release.yml has no update job and no force_native input (every run builds native)', () => {
    const doc = YAML.parse(readWorkflow('release.yml'));

    assert.equal(doc.jobs.ota, undefined);
    assert.equal(doc.on.workflow_dispatch.inputs.force_native, undefined);
  });
});
