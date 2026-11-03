// node --test scripts/ci/__tests__ — easCliVersion in scripts/ci/lib.mjs (the eas-cli that pnpm ios:adhoc and
// pnpm credentials:* run locally).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { easCliVersion, repoRoot } from '../lib.mjs';

describe('easCliVersion', () => {
  it('is the eas-cli every workflow pins', () => {
    const version = easCliVersion();

    assert.match(version, /^\d+\.\d+\.\d+$/);

    const dir = path.join(repoRoot, '.github', 'workflows');

    for (const file of fs.readdirSync(dir)) {
      const pinned = /EAS_CLI_VERSION: '([^']+)'/.exec(fs.readFileSync(path.join(dir, file), 'utf8'))?.[1];

      if (pinned) assert.equal(pinned, version, `${file} pins eas-cli ${pinned}, release.yml ${version}`);
    }
  });
});
