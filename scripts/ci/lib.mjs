// Shared helpers for the CI scripts in scripts/ci. Node built-ins only: these scripts also run in jobs
// that skip the workspace install (release, electron), so they must not import workspace packages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const omniRoot = path.join(repoRoot, 'apps', 'omni');

// Mirror of VARIANT_IDS in @resgrid/config-plugins (variants.js); validate-workflows checks they agree.
export const VARIANT_IDS = ['responder', 'unit', 'ic', 'dispatch', 'bigboard'];
export const PLATFORMS = ['android', 'ios'];
export const CHANNELS = ['production', 'staging', 'internal'];

/** Channel → APP_ENV. The channel names match the APP_ENV values (eas.json profiles do the same). */
export function appEnvForChannel(channel) {
  if (!CHANNELS.includes(channel)) throw new Error(`Unknown channel "${channel}". Expected one of: ${CHANNELS.join(', ')}.`);
  return channel;
}

export function assertVariant(id) {
  if (!VARIANT_IDS.includes(id)) throw new Error(`Unknown variant "${id}". Expected one of: ${VARIANT_IDS.join(', ')}.`);
  return id;
}

export function loadManifest(id) {
  assertVariant(id);
  return JSON.parse(fs.readFileSync(path.join(omniRoot, 'variants', id, 'variant.json'), 'utf8'));
}

/** Minimal `--name value` / `--flag` parser. Repeated options keep the last value. */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      args._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq > 0) {
      args[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[a.slice(2)] = argv[++i];
    } else {
      args[a.slice(2)] = true;
    }
  }
  return args;
}

export function requireArg(args, name) {
  const v = args[name];
  if (v === undefined || v === true || v === '') throw new Error(`Missing --${name}`);
  return String(v);
}

export function csv(value, allowed) {
  const list = String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed) for (const v of list) if (!allowed.includes(v)) throw new Error(`Unknown value "${v}". Expected one of: ${allowed.join(', ')}.`);
  return list;
}

/** Appends `key=value` lines to $GITHUB_OUTPUT (multi-line values use a heredoc delimiter). */
export function setOutputs(outputs) {
  const file = process.env.GITHUB_OUTPUT;
  const lines = [];
  for (const [k, raw] of Object.entries(outputs)) {
    const v = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (v.includes('\n')) {
      const delim = `EOF_${k}_${Date.now()}`;
      lines.push(`${k}<<${delim}`, v, delim);
    } else {
      lines.push(`${k}=${v}`);
    }
  }
  if (file) fs.appendFileSync(file, lines.join('\n') + '\n');
  return lines;
}

export function appendSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) fs.appendFileSync(file, markdown.endsWith('\n') ? markdown : `${markdown}\n`);
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Recursively lists files under dir (relative paths, forward slashes), skipping directories matched by skipDir. */
export function listFiles(dir, { maxDepth = 8, skipDir = () => false } = {}) {
  const out = [];
  const walk = (abs, rel, depth) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (depth < maxDepth && !skipDir(e.name, childRel)) walk(path.join(abs, e.name), childRel, depth + 1);
      } else if (e.isFile()) {
        out.push(childRel);
      }
    }
  };
  walk(dir, '', 0);
  return out.sort();
}

/** GitHub REST helper (GITHUB_TOKEN + GITHUB_REPOSITORY). Returns null when not configured. */
export function githubClient(env = process.env) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  const repo = env.GITHUB_REPOSITORY;
  if (!token || !repo) return null;
  const api = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'resgrid-omni-ci' };
  const request = async (pathname, { accept = 'application/vnd.github+json' } = {}) => {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${api}${pathname}`, { headers: { ...headers, Accept: accept }, redirect: 'follow' });
      if (res.ok) return res;
      if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`GitHub API ${pathname} → HTTP ${res.status}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  };
  return {
    repo,
    /** Releases newest first (up to `pages` × 100). */
    async releases(pages = 3) {
      const all = [];
      for (let page = 1; page <= pages; page++) {
        const res = await request(`/repos/${repo}/releases?per_page=100&page=${page}`);
        const batch = await res.json();
        all.push(...batch);
        if (batch.length < 100) break;
      }
      return all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    },
    async assetText(assetId) {
      const res = await request(`/repos/${repo}/releases/assets/${assetId}`, { accept: 'application/octet-stream' });
      return res.text();
    },
  };
}

/** Newest release of this variant whose fingerprints.json is for the same channel. */
export async function findPreviousRelease({ variant, channel, excludeTag, client = githubClient(), maxAssets = 30 }) {
  if (!client) return { release: null, record: null, note: 'GITHUB_TOKEN / GITHUB_REPOSITORY not set — treating as first release' };
  const { tagPrefix } = loadManifest(variant).versioning;
  const releases = await client.releases();
  let inspected = 0;
  for (const r of releases) {
    if (r.draft || !String(r.tag_name).startsWith(tagPrefix) || r.tag_name === excludeTag) continue;
    const asset = (r.assets || []).find((a) => a.name === 'fingerprints.json');
    if (!asset) continue;
    if (++inspected > maxAssets) break;
    let record;
    try {
      record = JSON.parse(await client.assetText(asset.id));
    } catch (error) {
      console.error(`::warning::Could not read fingerprints.json on ${r.tag_name}: ${error.message}`);
      continue;
    }
    if (record?.channel === channel) return { release: r.tag_name, record, note: null };
  }
  return { release: null, record: null, note: `no earlier ${tagPrefix}* release on channel "${channel}"` };
}
