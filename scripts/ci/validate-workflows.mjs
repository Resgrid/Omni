#!/usr/bin/env node
// Static checks for the GitHub Actions workflows, local composite actions and Maestro flows (run by ci.yml):
//   - every file parses as YAML (Maestro flows as multi-document YAML)
//   - workflows: `on` + `jobs`; every job has runs-on (or uses), timeout-minutes, and matrix jobs set fail-fast: false
//   - steps have exactly one of `run` / `uses`; third-party actions are pinned (@vN or a commit SHA, never a branch);
//     local actions (./.github/actions/x) exist
//   - `run:` scripts reference repository files that exist (resolved against the step's working-directory) and
//     `pnpm <script>` / `pnpm --filter <pkg> <script>` name scripts that exist
//   - `${{ }}` expressions are balanced
//   - the variant list in scripts/ci/lib.mjs and ci.yml matches @resgrid/config-plugins
//   - issue forms (.github/ISSUE_TEMPLATE): the basic form schema, a required App dropdown offering every variant,
//     and App / Platform options that scripts/ci/issue-labels.mjs can label; the Language options match packages/i18n
// Usage: node scripts/ci/validate-workflows.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { ALL_APPS, appLabelFor, FIELD, loadApps, managedLabels, NOT_SURE, PLATFORM_OPTIONS } from './issue-labels.mjs';
import { listFiles, repoRoot, VARIANT_IDS } from './lib.mjs';

const require = createRequire(import.meta.url);
const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${path.relative(repoRoot, file).replace(/\\/g, '/')}: ${msg}`);
const warn = (file, msg) => warnings.push(`${path.relative(repoRoot, file).replace(/\\/g, '/')}: ${msg}`);

const yaml = loadYamlParser();

// Files a run step may reference that only exist at run time.
const GENERATED = [/^apps\/omni\/dist(\/|$)/, /^apps\/omni\/credentials\.json$/, /^apps\/desktop\/(release|out)(\/|$)/, /^apps\/omni\/e2e\/(maestro-output|test-results|playwright-report|results)(\/|$)/];
const PNPM_BUILTINS = new Set([
  'install',
  'i',
  'add',
  'exec',
  'dlx',
  'store',
  'run',
  'why',
  'list',
  'ls',
  'config',
  'prune',
  'rebuild',
  'audit',
  'outdated',
  'update',
  'up',
  'remove',
  'fetch',
  'deploy',
  'pack',
  'publish',
]);
const workspacePackages = loadWorkspacePackages();

const workflowsDir = path.join(repoRoot, '.github', 'workflows');
const actionsDir = path.join(repoRoot, '.github', 'actions');
const workflowFiles = fs.existsSync(workflowsDir) ? fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f)) : [];
if (!workflowFiles.length) errors.push('.github/workflows: no workflow files found');

for (const name of workflowFiles) {
  const file = path.join(workflowsDir, name);
  const doc = parse(file);
  if (!doc) continue;
  checkExpressions(file, doc);
  const on = doc.on ?? doc[true];
  if (!on) err(file, 'missing `on`');
  if (!doc.jobs || typeof doc.jobs !== 'object') {
    err(file, 'missing `jobs`');
    continue;
  }
  for (const [id, job] of Object.entries(doc.jobs)) {
    const where = `job "${id}"`;
    if (job.uses) continue; // reusable workflow call
    if (!job['runs-on']) err(file, `${where}: missing runs-on`);
    if (job['timeout-minutes'] === undefined) err(file, `${where}: missing timeout-minutes`);
    if (job.strategy?.matrix && job.strategy['fail-fast'] !== false) err(file, `${where}: matrix jobs must set fail-fast: false`);
    if (!Array.isArray(job.steps) || !job.steps.length) err(file, `${where}: no steps`);
    for (const [i, step] of (job.steps ?? []).entries())
      checkStep(file, `${where} step ${i + 1}${step.name ? ` (${step.name})` : ''}`, step, job.defaults?.run?.['working-directory'] ?? doc.defaults?.run?.['working-directory']);
  }
  if (name === 'ci.yml') {
    const listed = doc.jobs?.variant?.strategy?.matrix?.variant;
    if (JSON.stringify(listed) !== JSON.stringify(VARIANT_IDS)) err(file, `variant matrix ${JSON.stringify(listed)} differs from ${JSON.stringify(VARIANT_IDS)}`);
  }
}

if (fs.existsSync(actionsDir)) {
  for (const dir of fs.readdirSync(actionsDir)) {
    const file = ['action.yml', 'action.yaml'].map((f) => path.join(actionsDir, dir, f)).find((f) => fs.existsSync(f));
    if (!file) {
      errors.push(`.github/actions/${dir}: no action.yml`);
      continue;
    }
    const doc = parse(file);
    if (!doc) continue;
    checkExpressions(file, doc);
    if (doc.runs?.using !== 'composite') continue;
    for (const [i, step] of (doc.runs.steps ?? []).entries()) {
      const where = `step ${i + 1}${step.name ? ` (${step.name})` : ''}`;
      if (step.run && !step.shell) err(file, `${where}: composite run steps need a shell`);
      checkStep(file, where, step, undefined);
    }
  }
}

const maestroDir = path.join(repoRoot, 'apps', 'omni', 'e2e', 'maestro');
for (const rel of fs.existsSync(maestroDir) ? listFiles(maestroDir).filter((f) => /\.ya?ml$/.test(f)) : []) {
  const file = path.join(maestroDir, rel);
  try {
    const docs = yaml.loadAll(fs.readFileSync(file, 'utf8'));
    if (docs.length !== 2 || !docs[0]?.appId || !Array.isArray(docs[1])) err(file, 'expected a Maestro flow: a config document with appId, then a list of commands');
    for (const command of docs[1] ?? []) {
      const sub = command?.runFlow?.file ?? (typeof command?.runFlow === 'string' ? command.runFlow : null);
      if (sub && !fs.existsSync(path.resolve(path.dirname(file), sub))) err(file, `runFlow file not found: ${sub}`);
    }
  } catch (error) {
    err(file, `YAML: ${error.message.split('\n')[0]}`);
  }
}

const issueTemplatesDir = path.join(repoRoot, '.github', 'ISSUE_TEMPLATE');
const issueForms = fs.existsSync(issueTemplatesDir) ? checkIssueForms(issueTemplatesDir) : 0;

try {
  const { VARIANT_IDS: canonical } = require('@resgrid/config-plugins');
  if (JSON.stringify(canonical) !== JSON.stringify(VARIANT_IDS)) errors.push(`scripts/ci/lib.mjs VARIANT_IDS ${JSON.stringify(VARIANT_IDS)} differ from @resgrid/config-plugins ${JSON.stringify(canonical)}`);
} catch {
  warnings.push('@resgrid/config-plugins not resolvable (workspace not installed?); variant list not cross-checked');
}

for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  console.error(`Workflow validation failed (${errors.length}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`Workflow validation passed: ${workflowFiles.length} workflows, local actions, Maestro flows and ${issueForms} issue forms (${yaml.name}).`);

// ── helpers ───────────────────────────────────────────────────────────────────────────────────────────────────────

function parse(file) {
  try {
    const doc = yaml.load(fs.readFileSync(file, 'utf8'));
    if (!doc || typeof doc !== 'object') {
      err(file, 'empty or not a mapping');
      return null;
    }
    return doc;
  } catch (error) {
    err(file, `YAML: ${error.message.split('\n')[0]}`);
    return null;
  }
}

function checkStep(file, where, step, defaultWorkdir) {
  const hasRun = typeof step.run === 'string';
  const hasUses = typeof step.uses === 'string';
  if (hasRun === hasUses) {
    err(file, `${where}: needs exactly one of run / uses`);
    return;
  }
  if (hasUses) {
    const uses = step.uses;
    if (uses.startsWith('./')) {
      const dir = path.join(repoRoot, uses);
      if (!fs.existsSync(path.join(dir, 'action.yml')) && !fs.existsSync(path.join(dir, 'action.yaml'))) err(file, `${where}: local action ${uses} not found`);
    } else if (!uses.startsWith('docker://')) {
      const ref = uses.split('@')[1];
      if (!ref) err(file, `${where}: ${uses} is not pinned`);
      else if (!/^v\d+(\.\d+){0,2}$/.test(ref) && !/^[0-9a-f]{40}$/.test(ref)) err(file, `${where}: ${uses} must be pinned to a version tag or commit SHA, not "${ref}"`);
    }
    // e.g. docker/build-push-action `file:` — a warning only, the file may come from a parallel change.
    const input = step.with?.file;
    if (typeof input === 'string' && !input.includes('${{') && !fs.existsSync(path.join(repoRoot, input))) warn(file, `${where}: with.file ${input} does not exist yet`);
    return;
  }
  const workdir = step['working-directory'] ?? defaultWorkdir ?? '.';
  checkRunScript(file, where, step.run, workdir);
}

function checkRunScript(file, where, script, workdir) {
  const base = path.resolve(repoRoot, workdir.includes('${{') ? '.' : workdir);
  const pathRe = /(?:^|[\s"'=(])((?:\.\.\/)*(?:scripts|apps|packages|tooling|docker|\.github)\/[\w./@-]+\.(?:mjs|cjs|js|ts|sh|json|ya?ml))\b/g;
  for (const m of script.matchAll(pathRe)) {
    const ref = m[1];
    if (ref.includes('$')) continue;
    const abs = path.resolve(base, ref);
    const rel = path.relative(repoRoot, abs).replace(/\\/g, '/');
    if (GENERATED.some((re) => re.test(rel))) continue;
    if (!fs.existsSync(abs)) err(file, `${where}: references missing file ${ref} (resolved to ${rel})`);
  }
  for (const line of script.split('\n')) {
    for (const cmd of line.split(/&&|\|\||;|\|/)) {
      const words = cmd.trim().split(/\s+/);
      const at = words.indexOf('pnpm');
      if (at !== 0) continue;
      checkPnpm(file, where, words.slice(1));
    }
  }
}

function checkPnpm(file, where, args) {
  let pkg = 'resgrid-omni';
  const rest = [...args];
  while (rest.length && rest[0].startsWith('-')) {
    const flag = rest.shift();
    if (flag === '--filter' || flag === '-F') pkg = (rest.shift() ?? '').replace(/^["']|["']$/g, '');
    else if (flag === '--if-present') return;
  }
  let script = rest.shift();
  if (!script) return;
  if (script === 'run') {
    if (rest[0] === '--if-present') return;
    script = rest.shift();
  }
  if (!script || PNPM_BUILTINS.has(script) || script.includes('$')) return;
  if (pkg.includes('...')) return; // install filters
  const scripts = workspacePackages.get(pkg);
  if (!scripts) {
    err(file, `${where}: pnpm --filter ${pkg}: no such workspace package`);
    return;
  }
  if (!(script in scripts)) err(file, `${where}: ${pkg} has no "${script}" script`);
}

function checkExpressions(file, node, trail = '') {
  if (typeof node === 'string') {
    const open = (node.match(/\$\{\{/g) ?? []).length;
    const close = (node.match(/\}\}/g) ?? []).length;
    if (open !== close) err(file, `${trail || '(root)'}: unbalanced \${{ }} expression`);
    return;
  }
  if (Array.isArray(node)) node.forEach((v, i) => checkExpressions(file, v, `${trail}[${i}]`));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) checkExpressions(file, v, trail ? `${trail}.${k}` : k);
}

/** Checks every issue form and the chooser config; returns the number of forms. */
function checkIssueForms(dir) {
  const FIELD_TYPES = ['markdown', 'input', 'textarea', 'dropdown', 'checkboxes'];
  const apps = loadApps();
  const labels = new Set(managedLabels(apps).map((l) => l.name));
  const languages = (/SUPPORTED_LANGUAGES\s*=\s*\[([^\]]*)\]/.exec(fs.readFileSync(path.join(repoRoot, 'packages', 'i18n', 'src', 'languages.ts'), 'utf8'))?.[1] ?? '').match(/[a-z]{2}/g) ?? [];
  const names = new Set();
  let forms = 0;
  for (const name of fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    const file = path.join(dir, name);
    const doc = parse(file);
    if (!doc) continue;
    if (/^config\.ya?ml$/.test(name)) {
      if (typeof doc.blank_issues_enabled !== 'boolean') err(file, 'blank_issues_enabled must be true or false');
      for (const link of doc.contact_links ?? []) if (!link?.name || !link.about || !/^https:\/\//.test(link.url ?? '')) err(file, `contact link ${JSON.stringify(link?.name)} needs a name, about and an https url`);
      continue;
    }
    forms++;
    for (const key of ['name', 'description', 'body']) if (!doc[key]) err(file, `missing ${key}`);
    if (names.has(doc.name)) err(file, `another form is also named "${doc.name}"`);
    names.add(doc.name);
    for (const label of doc.labels ?? []) if (!labels.has(label)) err(file, `label "${label}" is not created by scripts/ci/issue-labels.mjs (managedLabels)`);
    const ids = new Set();
    const fields = new Map();
    for (const [i, item] of (Array.isArray(doc.body) ? doc.body : []).entries()) {
      const where = `body item ${i + 1}`;
      if (!FIELD_TYPES.includes(item?.type)) {
        err(file, `${where}: type must be one of ${FIELD_TYPES.join(', ')}`);
        continue;
      }
      if (item.id !== undefined) {
        if (!/^[A-Za-z0-9_-]+$/.test(item.id)) err(file, `${where}: id "${item.id}" may only use letters, digits, - and _`);
        if (ids.has(item.id)) err(file, `${where}: duplicate id "${item.id}"`);
        ids.add(item.id);
      }
      if (item.type === 'markdown') {
        if (!item.attributes?.value) err(file, `${where}: markdown needs attributes.value`);
        continue;
      }
      const label = item.attributes?.label;
      if (!label) err(file, `${where}: missing attributes.label`);
      if (fields.has(label)) err(file, `${where}: duplicate label "${label}" (the labeller reads answers by label)`);
      fields.set(label, item);
      const options = item.attributes?.options;
      if (item.type === 'dropdown' || item.type === 'checkboxes') {
        if (!Array.isArray(options) || !options.length) err(file, `${where} (${label}): needs options`);
        else if (item.type === 'dropdown' && (options.some((o) => typeof o !== 'string') || new Set(options).size !== options.length)) err(file, `${where} (${label}): options must be unique strings`);
        else if (item.type === 'checkboxes' && options.some((o) => !o?.label)) err(file, `${where} (${label}): every checkbox needs a label`);
      }
      // A multi-select answer is rendered comma-separated, so an option with a comma could not be read back.
      if (item.type === 'dropdown' && Object.values(FIELD).includes(label) && options?.some((o) => String(o).includes(','))) err(file, `${where} (${label}): options must not contain commas`);
    }

    const app = fields.get(FIELD.app);
    if (app?.type !== 'dropdown' || app.validations?.required !== true) err(file, `needs a required "${FIELD.app}" dropdown so every issue names its app`);
    else {
      const options = app.attributes.options ?? [];
      for (const option of options) if (option !== NOT_SURE && !appLabelFor(option, apps)) err(file, `"${FIELD.app}" option "${option}" must start with a variant displayName or "${ALL_APPS}", or be "${NOT_SURE}"`);
      for (const a of apps) if (!options.some((o) => appLabelFor(o, apps) === `app: ${a.id}`)) err(file, `"${FIELD.app}" has no option for ${a.displayName}`);
    }
    const platform = fields.get(FIELD.platform);
    if (platform) {
      if (platform.type !== 'dropdown') err(file, `"${FIELD.platform}" must be a dropdown`);
      for (const option of platform.attributes?.options ?? []) if (!PLATFORM_OPTIONS[option]) err(file, `"${FIELD.platform}" option "${option}" is not in PLATFORM_OPTIONS (scripts/ci/issue-labels.mjs)`);
    }
    const language = fields.get('Language');
    if (language) {
      const codes = (language.attributes?.options ?? []).map((o) => /\(([a-z]{2})\)$/.exec(String(o))?.[1]);
      if (JSON.stringify([...codes].sort()) !== JSON.stringify([...languages].sort()))
        err(file, `"Language" options ${JSON.stringify(codes)} differ from SUPPORTED_LANGUAGES ${JSON.stringify(languages)} (packages/i18n/src/languages.ts)`);
    }
  }
  return forms;
}

function loadWorkspacePackages() {
  const map = new Map();
  const add = (dir) => {
    const file = path.join(repoRoot, dir, 'package.json');
    if (!fs.existsSync(file)) return;
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    map.set(pkg.name, pkg.scripts ?? {});
  };
  add('.');
  for (const group of ['apps', 'packages', 'tooling']) {
    const dir = path.join(repoRoot, group);
    if (fs.existsSync(dir)) for (const d of fs.readdirSync(dir)) add(path.join(group, d));
  }
  return map;
}

function loadYamlParser() {
  for (const name of ['yaml', 'js-yaml']) {
    try {
      const mod = require(name);
      if (name === 'yaml') return { name, load: (s) => mod.parse(s), loadAll: (s) => mod.parseAllDocuments(s).map((d) => d.toJSON()) };
      return { name, load: (s) => mod.load(s), loadAll: (s) => mod.loadAll(s) };
    } catch {
      // try the next parser
    }
  }
  console.error('validate-workflows: neither `yaml` nor `js-yaml` is installed; add `yaml` as a root devDependency.');
  process.exit(1);
}
