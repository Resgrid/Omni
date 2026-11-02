// node --test scripts/ci/__tests__ — scripts/ci/issue-labels.mjs (the labels .github/workflows/issue-labels.yml adds).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { answers, appLabelFor, labelsForIssue, loadApps, managedLabels, parseIssueForm } from '../issue-labels.mjs';
import { VARIANT_IDS } from '../lib.mjs';

const apps = loadApps();

// The body GitHub writes for an issue opened from .github/ISSUE_TEMPLATE/1-bug-report.yml.
const bugBody = [
  '### App',
  '',
  'Unit — for vehicle and apparatus crews (MDT), IC — for incident commanders',
  '',
  '### Platform',
  '',
  'Android (phone or tablet), Web (self-hosted Docker image), Windows desktop app',
  '',
  '### App version',
  '',
  'Version 8.12 (100012)',
  '',
  '### Current update',
  '',
  '_No response_',
  '',
  '### Resgrid server',
  '',
  'Self-hosted Resgrid Core',
  '',
  '### What happened?',
  '',
  'The status button does nothing.',
  '### App',
  'Responder — for department members',
  '',
  '### Did this work before?',
  '',
  'Yes — it started after an app update',
].join('\r\n');

describe('loadApps', () => {
  it('reads every variant manifest', () => {
    assert.deepEqual(
      apps.map((a) => a.id),
      VARIANT_IDS
    );
    assert.deepEqual(
      apps.find((a) => a.id === 'bigboard'),
      { id: 'bigboard', displayName: 'BigBoard', name: 'Resgrid BigBoard' }
    );
  });
});

describe('parseIssueForm', () => {
  it('reads answers by field label and keeps the first of a repeated heading', () => {
    const fields = parseIssueForm(bugBody);
    assert.equal(fields['App version'], 'Version 8.12 (100012)');
    assert.equal(fields['What happened?'], 'The status button does nothing.');
    assert.equal(fields.App, 'Unit — for vehicle and apparatus crews (MDT), IC — for incident commanders');
  });
  it('copes with an empty or missing body', () => {
    assert.deepEqual(parseIssueForm(null), {});
    assert.deepEqual(parseIssueForm('No headings here'), {});
  });
});

describe('answers', () => {
  it('splits multi-select answers and drops empty ones', () => {
    assert.deepEqual(answers('Android (phone or tablet), Windows desktop app'), ['Android (phone or tablet)', 'Windows desktop app']);
    assert.deepEqual(answers('_No response_'), []);
    assert.deepEqual(answers('None'), []);
    assert.deepEqual(answers(undefined), []);
  });
});

describe('appLabelFor', () => {
  it('matches the displayName before the dash, case-insensitively', () => {
    assert.equal(appLabelFor('Dispatch — for dispatchers', apps), 'app: dispatch');
    assert.equal(appLabelFor('bigboard', apps), 'app: bigboard');
    assert.equal(appLabelFor('All apps', apps), 'app: all');
    assert.equal(appLabelFor('Not sure', apps), null);
    assert.equal(appLabelFor('Relay', apps), null);
  });
});

describe('labelsForIssue', () => {
  it('labels the apps, platforms, self-hosted server and regression', () => {
    assert.deepEqual(labelsForIssue(bugBody, apps), ['app: ic', 'app: unit', 'platform: android', 'platform: web', 'platform: windows', 'regression', 'self-hosted']);
  });
  it('labels a feature an older version had as a regression', () => {
    const body = '### App\n\nAll apps\n\n### Platform\n\n_No response_\n\n### Could an older version of the app do this?\n\nYes — an older version could do this';
    assert.deepEqual(labelsForIssue(body, apps), ['app: all', 'regression']);
  });
  it('adds nothing for "Not sure", unknown options or a blank issue', () => {
    assert.deepEqual(labelsForIssue('### App\n\nNot sure\n\n### Platform\n\nPlayStation\n\n### Did this work before?\n\nNo — it has never worked', apps), []);
    assert.deepEqual(labelsForIssue('', apps), []);
  });
});

describe('managedLabels', () => {
  it('covers every label the labeller adds, with valid names, colours and descriptions', () => {
    const labels = managedLabels(apps);
    const names = labels.map((l) => l.name);
    assert.equal(new Set(names).size, names.length);
    for (const label of labelsForIssue(bugBody, apps)) assert.ok(names.includes(label), label);
    for (const id of VARIANT_IDS) assert.ok(names.includes(`app: ${id}`), id);
    for (const name of ['app: all', 'needs-triage', 'bug', 'enhancement', 'question', 'feedback', 'translation']) assert.ok(names.includes(name), name);
    for (const label of labels) {
      assert.match(label.color, /^[0-9a-f]{6}$/);
      assert.ok(label.name.length <= 50 && label.description.length <= 100, label.name);
    }
  });
});
