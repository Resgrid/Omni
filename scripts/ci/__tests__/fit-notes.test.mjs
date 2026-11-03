// node --test scripts/ci/__tests__ — scripts/ci/fit-notes.mjs (release notes cut to one service's size limit).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fitNotes } from '../fit-notes.mjs';

const bytes = (text) => Buffer.byteLength(text, 'utf8');
const note = 'Full notes: https://github.com/Resgrid/Omni/releases/tag/unit-v8.12';

describe('fitNotes', () => {
  it('returns notes within the limit unchanged', () => {
    const text = '### Build\n\n- one\n- two\n';
    assert.equal(fitNotes(text, bytes(text), note), text);
  });

  it('keeps the leading whole lines and ends with the note, within the limit', () => {
    const text = ['### Pull request [#8](https://github.com/Resgrid/Omni/pull/8): Pipeline', '', ...Array.from({ length: 100 }, (_, i) => `- change ${i}`)].join('\n');
    const fitted = fitNotes(text, 300, note);
    assert.ok(bytes(fitted) <= 300);
    assert.ok(fitted.startsWith('### Pull request [#8](https://github.com/Resgrid/Omni/pull/8): Pipeline\n\n- change 0\n'));
    assert.ok(fitted.endsWith(`\n\n${note}\n`));
    const body = fitted.slice(0, -`\n\n${note}\n`.length);
    for (const line of body.split('\n')) assert.ok(text.split('\n').includes(line), `"${line}" is a whole line of the notes`);
  });

  it('never cuts a multi-byte character in two', () => {
    const text = Array.from({ length: 50 }, () => 'Ünïcödé — 日本語 ✓').join('\n');
    for (const max of [120, 121, 122, 123, 200, 333]) {
      const fitted = fitNotes(text, max, note);
      assert.ok(bytes(fitted) <= max, `${bytes(fitted)} <= ${max}`);
      assert.equal(Buffer.from(fitted, 'utf8').toString('utf8'), fitted);
      assert.ok(!fitted.includes('�'));
    }
  });

  it('closes a code fence the cut leaves open, within the limit', () => {
    const text = ['Intro', '````sh', ...Array.from({ length: 100 }, (_, i) => `echo ${i}`), '````', 'After'].join('\n');
    const fitted = fitNotes(text, 200, note);
    assert.ok(bytes(fitted) <= 200);
    assert.ok(fitted.endsWith(['', '````', '', note, ''].join('\n')));
  });

  it('is only the note when not even the first line fits', () => {
    assert.equal(fitNotes(`${'x'.repeat(500)}\nmore`, 120, note), `${note}\n`);
  });
});
