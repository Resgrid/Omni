#!/usr/bin/env node
// Sets up Firebase App Distribution uploads for release.yml (docs/build/ci-secrets.md), once per app:
//   1. finds the app's Firebase project and Android app id by its package name (variant.json), searching every
//      Google Cloud project your gcloud account can see, unless --project names it
//   2. creates the service account `omni-app-distribution` in that project (if missing), enables the App
//      Distribution API and grants it Firebase App Distribution Admin only
//   3. creates a JSON key in a private temp folder and sets the secrets FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 and
//      FIREBASE_ANDROID_APP_ID in the app's GitHub environment, then deletes the local key
// Re-running is safe: it reuses the account and binding and adds a new key (--delete-old-keys removes the older
// user-managed keys of that account once the new one is stored).
//
// Needs: gcloud (`gcloud auth login`, owner or IAM + service account admin on each project) and gh (`gh auth login`,
// admin on the repository). The app's GitHub environment must exist.
//
// Usage: pnpm setup:app-distribution [--dry-run] [--delete-old-keys] [--project <variant>=<project id> …]
//                                    [--repo <owner/name>] [variant …]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { VARIANT_IDS, loadVariant } = require('@resgrid/config-plugins');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT_ID = 'omni-app-distribution';
const ROLE = 'roles/firebaseappdistro.admin';
const API = 'firebaseappdistribution.googleapis.com';
const KEY_SECRET = 'FIREBASE_SERVICE_ACCOUNT_JSON_BASE64';
const APP_ID_SECRET = 'FIREBASE_ANDROID_APP_ID';

// ── arguments ──────────────────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = { dryRun: false, deleteOldKeys: false, projects: {}, repo: '', variants: [] };
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--') continue;
  else if (arg === '--dry-run') opts.dryRun = true;
  else if (arg === '--delete-old-keys') opts.deleteOldKeys = true;
  else if (arg === '--repo') opts.repo = argv[++i] ?? '';
  else if (arg === '--project') {
    const [variant, project] = (argv[++i] ?? '').split('=');
    if (!VARIANT_IDS.includes(variant) || !project) usage(`--project expects <variant>=<project id>, got "${argv[i]}"`);
    opts.projects[variant] = project;
  } else if (VARIANT_IDS.includes(arg)) opts.variants.push(arg);
  else usage(`Unknown argument "${arg}"`);
}
if (!opts.variants.length) opts.variants = [...VARIANT_IDS];

function usage(message) {
  console.error(`${message}\nusage: pnpm setup:app-distribution [--dry-run] [--delete-old-keys] [--project <variant>=<project id> …] [--repo <owner/name>] [${VARIANT_IDS.join('|')} …]`);
  process.exit(2);
}

// ── command helpers ────────────────────────────────────────────────────────────────────────────────────────────
function run(cmd, args, { input, allowFail = false } = {}) {
  const result = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  if (result.error) throw new Error(`${cmd} is not available: ${result.error.message}`);
  if (result.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.slice(0, 4).join(' ')} … failed:\n${(result.stderr || result.stdout).trim()}`);
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}
const gcloud = (args, options) => run('gcloud', [...args, '--quiet'], options);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const say = (message) => console.log(message);

// ── preflight ──────────────────────────────────────────────────────────────────────────────────────────────────
if (!gcloud(['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'], { allowFail: true }).out) usage('gcloud has no active account: run `gcloud auth login` first.');
if (!run('gh', ['auth', 'status'], { allowFail: true }).ok) usage('gh is not signed in: run `gh auth login` first.');
const repo = opts.repo || run('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).out;
const token = gcloud(['auth', 'print-access-token']).out;

// Firebase Management API. gcloud's own OAuth client has no quota project, so each call bills the project it reads
// (x-goog-user-project); a project without Firebase answers with an error and is skipped.
async function androidApps(projectId) {
  const apps = [];
  let pageToken = '';
  do {
    const url = `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/androidApps?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': projectId } }).catch(() => null);
    if (!res?.ok) return null;
    const body = await res.json();
    apps.push(...(body.apps ?? []).filter((app) => app.state !== 'DELETED'));
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return apps;
}

// ── 1. find each app's Firebase project and Android app id ──────────────────────────────────────────────────────
const targets = opts.variants.map((variant) => ({ variant, packageName: loadVariant(variant).identity.android.package, project: opts.projects[variant] ?? null, appId: null, error: null }));

const appsByProject = new Map();
for (const project of new Set(targets.map((t) => t.project).filter(Boolean))) appsByProject.set(project, await androidApps(project));

if (targets.some((t) => !t.project)) {
  const projects = gcloud(['projects', 'list', '--format=value(projectId)']).out.split('\n').filter(Boolean);
  say(`Looking for the apps' Firebase projects among ${projects.length} Google Cloud projects…`);
  for (let i = 0; i < projects.length; i += 8) {
    const batch = projects.slice(i, i + 8).filter((p) => !appsByProject.has(p));
    const lists = await Promise.all(batch.map((p) => androidApps(p)));
    batch.forEach((p, j) => appsByProject.set(p, lists[j]));
  }
}

for (const t of targets) {
  const matches = [...appsByProject].flatMap(([project, apps]) => (apps ?? []).filter((app) => app.packageName === t.packageName).map((app) => ({ project, appId: app.appId })));
  const scoped = t.project ? matches.filter((m) => m.project === t.project) : matches;
  if (scoped.length === 1) Object.assign(t, scoped[0]);
  else if (!scoped.length)
    t.error = t.project
      ? `no Android app ${t.packageName} in Firebase project ${t.project} (or no access to it)`
      : `no Firebase project you can read has the Android app ${t.packageName}; pass --project ${t.variant}=<project id>`;
  else t.error = `${t.packageName} is in several Firebase projects (${scoped.map((m) => m.project).join(', ')}); pass --project ${t.variant}=<project id>`;
}

say('');
for (const t of targets) say(`${t.variant.padEnd(10)} ${t.packageName.padEnd(24)} ${t.error ? `✗ ${t.error}` : `${t.project}  ${t.appId}`}`);
say('');

// ── 2 and 3. service account, role, key, GitHub secrets ────────────────────────────────────────────────────────
async function setUp(t) {
  const email = `${ACCOUNT_ID}@${t.project}.iam.gserviceaccount.com`;
  if (!run('gh', ['api', `repos/${repo}/environments/${t.variant}`], { allowFail: true }).ok) throw new Error(`GitHub environment "${t.variant}" does not exist in ${repo}; create it first`);

  const exists = gcloud(['iam', 'service-accounts', 'describe', email, `--project=${t.project}`, '--format=value(email)'], { allowFail: true }).ok;
  if (opts.dryRun) {
    say(`${t.variant}: would ${exists ? 'reuse' : 'create'} ${email}, enable ${API}, grant ${ROLE}, create a key and set ${KEY_SECRET} and ${APP_ID_SECRET} in ${repo} environment "${t.variant}"`);
    return;
  }

  if (!exists) {
    gcloud([
      'iam',
      'service-accounts',
      'create',
      ACCOUNT_ID,
      `--project=${t.project}`,
      '--display-name=Omni App Distribution (GitHub Actions)',
      '--description=Uploads release APKs to Firebase App Distribution from Resgrid/Omni release.yml',
    ]);
    say(`${t.variant}: created ${email}`);
  }
  gcloud(['services', 'enable', API, `--project=${t.project}`]);
  // A new account takes a few seconds to become visible to IAM.
  for (let attempt = 1; ; attempt++) {
    const bound = gcloud(['projects', 'add-iam-policy-binding', t.project, `--member=serviceAccount:${email}`, `--role=${ROLE}`, '--condition=None', '--format=none'], { allowFail: true });
    if (bound.ok) break;
    if (attempt === 6) throw new Error(`could not grant ${ROLE}:\n${bound.err}`);
    await sleep(5000);
  }
  say(`${t.variant}: ${email} has ${ROLE}`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-appdist-'));
  try {
    const keyFile = path.join(dir, 'key.json');
    gcloud(['iam', 'service-accounts', 'keys', 'create', keyFile, `--iam-account=${email}`, `--project=${t.project}`]);
    const key = fs.readFileSync(keyFile);
    const keyId = JSON.parse(key.toString('utf8')).private_key_id;
    run('gh', ['secret', 'set', KEY_SECRET, '--env', t.variant, '--repo', repo], { input: key.toString('base64') });
    run('gh', ['secret', 'set', APP_ID_SECRET, '--env', t.variant, '--repo', repo, '--body', t.appId]);
    say(`${t.variant}: set ${KEY_SECRET} (key ${keyId.slice(0, 8)}…) and ${APP_ID_SECRET} in environment "${t.variant}"`);

    const older = gcloud(['iam', 'service-accounts', 'keys', 'list', `--iam-account=${email}`, `--project=${t.project}`, '--managed-by=user', '--format=value(name.basename())'])
      .out.split('\n')
      .filter((id) => id && id !== keyId);
    if (older.length && opts.deleteOldKeys) {
      for (const id of older) gcloud(['iam', 'service-accounts', 'keys', 'delete', id, `--iam-account=${email}`, `--project=${t.project}`]);
      say(`${t.variant}: deleted ${older.length} older key(s)`);
    } else if (older.length) {
      say(`${t.variant}: ${older.length} older key(s) still active on ${email}; re-run with --delete-old-keys to remove them`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

let failed = targets.filter((t) => t.error).length;
for (const t of targets.filter((x) => !x.error)) {
  try {
    await setUp(t);
  } catch (error) {
    failed++;
    console.error(`${t.variant}: ✗ ${error.message}`);
  }
}

say('');
say(`Each project also needs an App Distribution tester group with the alias "testers" (or set the FIREBASE_TESTER_GROUPS variable): Firebase console → App Distribution → Testers & Groups.`);
if (opts.dryRun) say('Dry run: nothing was changed.');
process.exit(failed ? 1 : 0);
