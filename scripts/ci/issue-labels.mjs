// Labels for issues opened from the forms in .github/ISSUE_TEMPLATE, applied by .github/workflows/issue-labels.yml so
// every issue shows which app and platform it is about.
//
// GitHub renders each form field as "### <field label>" followed by the answer; a multi-select dropdown joins its
// answers with ", " and an empty optional field reads "_No response_". App options start with the variant's
// displayName from variant.json ("Unit — for vehicle and apparatus crews"), so the app labels follow the manifests.
// validate-workflows.mjs fails CI when a form leaves out a variant or offers an option this file cannot label.
//
// Node built-ins only: the workflow runs on a sparse checkout without installing the workspace.
import { loadManifest, VARIANT_IDS } from './lib.mjs';

/** Form field labels the labeller reads. Every form needs the App field; the others are optional. */
export const FIELD = {
  app: 'App',
  platform: 'Platform',
  server: 'Resgrid server',
  regressedBug: 'Did this work before?',
  regressedFeature: 'Could an older version of the app do this?',
};

export const ALL_APPS = 'All apps';
export const NOT_SURE = 'Not sure';
export const SELF_HOSTED = 'Self-hosted Resgrid Core';
/** Answers to the "worked before" questions that mark a regression start with this. */
export const YES = 'Yes — ';

/** Platform label suffix → label description. */
export const PLATFORMS = {
  ios: 'iOS app (iPhone, iPad)',
  android: 'Android app (phone, tablet)',
  web: 'Web app (hosted by Resgrid or the self-hosted Docker image)',
  windows: 'Windows desktop app (Electron)',
  macos: 'macOS desktop app (Electron)',
  linux: 'Linux desktop app (Electron)',
};

/** Platform option text in the forms → platform label suffix. */
export const PLATFORM_OPTIONS = {
  'iOS (iPhone or iPad)': 'ios',
  'Android (phone or tablet)': 'android',
  'Web browser (hosted by Resgrid)': 'web',
  'Web (self-hosted Docker image)': 'web',
  'Windows desktop app': 'windows',
  'macOS desktop app': 'macos',
  'Linux desktop app': 'linux',
};

/** Labels the forms set themselves (`labels:`); GitHub drops a form label that does not exist yet. */
const TYPE_LABELS = [
  { name: 'bug', color: 'd73a4a', description: "Something isn't working" },
  { name: 'enhancement', color: 'a2eeef', description: 'New feature or request' },
  { name: 'question', color: 'd876e3', description: 'Further information is requested' },
  { name: 'feedback', color: '0e8a16', description: 'Feedback on how an app works or feels' },
  { name: 'translation', color: '5319e7', description: 'Wrong, missing or broken text in one of the ten languages' },
];

/** The apps the forms offer, from the variant manifests. */
export function loadApps(manifests = VARIANT_IDS.map(loadManifest)) {
  return manifests.map((m) => ({ id: m.id, displayName: m.displayName, name: m.identity.name }));
}

/** Every label the workflow may add, created up front when missing. */
export function managedLabels(apps) {
  return [
    ...apps.map((a) => ({ name: `app: ${a.id}`, color: '1d76db', description: `Reported in ${a.name}` })),
    { name: 'app: all', color: '1d76db', description: 'Affects every app' },
    ...Object.entries(PLATFORMS).map(([id, description]) => ({ name: `platform: ${id}`, color: 'c5def5', description })),
    { name: 'self-hosted', color: 'fef2c0', description: 'Seen against a self-hosted Resgrid Core server' },
    { name: 'regression', color: 'b60205', description: 'Worked in an earlier version of the app' },
    { name: 'needs-triage', color: 'fbca04', description: 'New issue, not yet reviewed' },
    ...TYPE_LABELS,
  ];
}

/** Field label → answer text. The first field with a label wins, so a "### App" line typed into an answer is ignored. */
export function parseIssueForm(body) {
  const fields = {};
  let current = null;
  for (const line of String(body ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = Object.hasOwn(fields, heading[1]) ? null : heading[1];
      if (current) fields[current] = [];
    } else if (current) {
      fields[current].push(line);
    }
  }
  return Object.fromEntries(Object.entries(fields).map(([label, lines]) => [label, lines.join('\n').trim()]));
}

/** A dropdown answer as its selected options. */
export function answers(value) {
  if (!value || value === '_No response_' || value === 'None') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The app label for an App option, or null for "Not sure" and anything unknown. */
export function appLabelFor(option, apps) {
  const name = String(option).split(' — ')[0].trim().toLowerCase();
  if (name === ALL_APPS.toLowerCase()) return 'app: all';
  const app = apps.find((a) => a.displayName.toLowerCase() === name);
  return app ? `app: ${app.id}` : null;
}

/** Labels for an issue body written by one of the forms (sorted, no duplicates). */
export function labelsForIssue(body, apps) {
  const fields = parseIssueForm(body);
  const labels = new Set();
  for (const option of answers(fields[FIELD.app])) {
    const label = appLabelFor(option, apps);
    if (label) labels.add(label);
  }
  for (const option of answers(fields[FIELD.platform])) {
    const platform = PLATFORM_OPTIONS[option];
    if (platform) labels.add(`platform: ${platform}`);
  }
  if (answers(fields[FIELD.server]).includes(SELF_HOSTED)) labels.add('self-hosted');
  if ([FIELD.regressedBug, FIELD.regressedFeature].some((field) => (fields[field] ?? '').startsWith(YES))) labels.add('regression');
  return [...labels].sort();
}
