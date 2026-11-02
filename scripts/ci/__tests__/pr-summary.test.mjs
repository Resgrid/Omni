// node --test scripts/ci/__tests__ — scripts/ci/pr-summary.mjs (the pull request section of the release notes).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cleanDescription, formatPullRequest, pickPullRequest } from '../pr-summary.mjs';

const sha = 'fa26ff99ce0b9a7032d4cdeb3122b3488ebfbd3b';

describe('pickPullRequest', () => {
  it('prefers the pull request merged as the commit', () => {
    const pulls = [
      { number: 7, merged_at: '2026-11-01T10:00:00Z', merge_commit_sha: 'other' },
      { number: 8, merged_at: '2026-11-02T21:44:43Z', merge_commit_sha: sha },
    ];
    assert.equal(pickPullRequest(pulls, sha)?.number, 8);
  });

  it('falls back to the first merged pull request listing the commit', () => {
    const pulls = [
      { number: 9, merged_at: null, merge_commit_sha: 'test-merge' },
      { number: 7, merged_at: '2026-11-01T10:00:00Z', merge_commit_sha: 'other' },
    ];
    assert.equal(pickPullRequest(pulls, sha)?.number, 7);
  });

  it('ignores open and closed-unmerged pull requests', () => {
    assert.equal(pickPullRequest([{ number: 9, merged_at: null, merge_commit_sha: sha }], sha), null);
    assert.equal(pickPullRequest([], sha), null);
    assert.equal(pickPullRequest(undefined, sha), null);
  });
});

describe('cleanDescription', () => {
  it('removes HTML comments, including multi-line template hints and bot markers', () => {
    const body = '<!-- kody-pr-summary:start -->\r\n## Summary\r\n\r\n<!-- What changes\r\nand why -->\r\nNew pipeline.\r\n<!-- kody-pr-summary:end -->\r\n';
    assert.equal(cleanDescription(body), '#### Summary\n\nNew pipeline.');
  });

  it('steps the shallowest heading down to just below the section heading', () => {
    assert.equal(cleanDescription('## Summary\n\nText\n\n### Details\n\nMore'), '#### Summary\n\nText\n\n##### Details\n\nMore');
    assert.equal(cleanDescription('# Title\n\n## Part'), '#### Title\n\n##### Part');
    assert.equal(cleanDescription('##### Deep'), '##### Deep');
    assert.equal(cleanDescription('## A\n\n###### Deepest'), '#### A\n\n###### Deepest');
  });

  it('leaves code fences and text that only starts with # alone', () => {
    const body = '## Summary\n\n```sh\n# a shell comment\n```\n\n~~~\n## not a heading\n~~~\n\n#123 fixed';
    assert.equal(cleanDescription(body), '#### Summary\n\n```sh\n# a shell comment\n```\n\n~~~\n## not a heading\n~~~\n\n#123 fixed');
  });

  it('collapses the blank lines removed comments leave behind', () => {
    assert.equal(cleanDescription('One\n\n<!-- a -->\n\n<!-- b -->\n\nTwo'), 'One\n\nTwo');
  });

  it('returns an empty string for an empty description', () => {
    assert.equal(cleanDescription(null), '');
    assert.equal(cleanDescription('<!-- only a hint -->\n'), '');
  });
});

describe('formatPullRequest', () => {
  const pr = { number: 8, title: 'RO-T101 Fixing build pipeline', html_url: 'https://github.com/Resgrid/Omni/pull/8' };

  it('heads the description with a link to the pull request', () => {
    assert.equal(formatPullRequest({ ...pr, body: '## Summary\n\nNew pipeline.' }), '### Pull request [#8](https://github.com/Resgrid/Omni/pull/8): RO-T101 Fixing build pipeline\n\n#### Summary\n\nNew pipeline.\n');
  });

  it('is only the heading when the pull request has no description', () => {
    assert.equal(formatPullRequest({ ...pr, body: null }), '### Pull request [#8](https://github.com/Resgrid/Omni/pull/8): RO-T101 Fixing build pipeline\n');
  });
});
