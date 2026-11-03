// node --test scripts/ci/__tests__ — githubClient in scripts/ci/lib.mjs (the GitHub REST helper of the release job).
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { githubClient } from '../lib.mjs';

describe('githubClient.pullsForCommit', () => {
  let server;
  let client;
  const pending = new Set();

  before(async () => {
    server = http.createServer((req, res) => {
      pending.add(res);
      if (req.url.includes('/commits/ok/')) return res.end(JSON.stringify([{ number: 8 }]));
      // A response whose body never finishes; /commits/silent/ never answers at all.
      if (req.url.includes('/commits/partial/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('[');
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    client = githubClient({ GITHUB_TOKEN: 'token', GITHUB_REPOSITORY: 'Resgrid/Omni', GITHUB_API_URL: `http://127.0.0.1:${server.address().port}` });
  });

  after(async () => {
    for (const res of pending) res.destroy();
    await new Promise((resolve) => server.close(resolve));
  });

  it('returns the pull requests GitHub lists for the commit', async () => {
    assert.deepEqual(await client.pullsForCommit('ok'), [{ number: 8 }]);
  });

  it('gives up on a lookup that never answers', async () => {
    await assert.rejects(client.pullsForCommit('silent', { timeoutMs: 200 }), { name: 'TimeoutError' });
  });

  it('gives up on a response body that stalls', async () => {
    await assert.rejects(client.pullsForCommit('partial', { timeoutMs: 200 }), { name: 'TimeoutError' });
  });
});
