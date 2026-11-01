#!/usr/bin/env node
// Collects one Electron OS build (apps/desktop output) into two folders:
//   --out   installers renamed to the release asset names of omni-plan §6.6.4
//           (<Prefix>-<version>-windows-setup.exe, -windows-portable.exe, -macos-arm64.dmg, -macos-x64.dmg,
//            -macos.zip, -linux.AppImage, -linux.deb, -linux.rpm). An arch suffix is added only when one
//           target produced several files (e.g. two zips). apps/desktop already names its artifacts this way, so
//           this is normally an identity copy that also proves every expected installer exists.
//   --feed  the update feed exactly as electron-builder wrote it (latest*.yml + the files and blockmaps it
//           references, original names) — electron-updater resolves files by the names inside latest*.yml.
//
// Usage: node scripts/ci/electron-assets.mjs --src apps/desktop/release --target win|mac|linux --prefix ResgridUnit --version 8.12 --out out/release --feed out/feed
import fs from 'node:fs';
import path from 'node:path';

import { listFiles, parseArgs, requireArg } from './lib.mjs';

const args = parseArgs();
const src = path.resolve(requireArg(args, 'src'));
const target = requireArg(args, 'target');
const prefix = requireArg(args, 'prefix');
const version = requireArg(args, 'version');
const outDir = path.resolve(requireArg(args, 'out'));
const feedDir = path.resolve(requireArg(args, 'feed'));

if (!['win', 'mac', 'linux'].includes(target)) throw new Error(`Unknown target "${target}"`);
if (!fs.existsSync(src)) {
  console.error(`::error::Electron output folder not found: ${src}`);
  process.exit(1);
}

// Unpacked app folders and .app bundles are build intermediates, not deliverables.
const skipDir = (name) => name.endsWith('-unpacked') || name.endsWith('.app') || name === 'mac' || /^mac-(arm64|x64|universal)$/.test(name) || name === '.icon-ico' || name === '.icon-icns';
const files = listFiles(src, { maxDepth: 2, skipDir });

const archOf = (name) => {
  const n = name.toLowerCase();
  if (n.includes('universal')) return 'universal';
  if (n.includes('arm64') || n.includes('aarch64')) return 'arm64';
  if (n.includes('armv7l')) return 'armv7l';
  if (n.includes('ia32')) return 'ia32';
  return 'x64';
};

// Update feed: every latest*.yml plus the files it references (and their blockmaps), names unchanged.
const feed = new Set();
const feedNames = () => new Set([...feed].map((f) => path.basename(f)));
for (const yml of files.filter((f) => /(^|\/)latest[^/]*\.yml$/.test(f))) {
  feed.add(yml);
  const text = fs.readFileSync(path.join(src, yml), 'utf8');
  for (const m of text.matchAll(/^\s*(?:-\s*)?(?:url|path):\s*['"]?([^'"\n]+?)['"]?\s*$/gm)) {
    const ref = m[1].trim();
    const match = files.find((f) => path.basename(f) === ref);
    if (match) {
      feed.add(match);
      const blockmap = files.find((f) => path.basename(f) === `${ref}.blockmap`);
      if (blockmap) feed.add(blockmap);
    }
  }
}

/** Release asset kind for a file, or null when it is not a deliverable for this target. */
function kindOf(file) {
  const base = path.basename(file);
  const lower = base.toLowerCase();
  if (target === 'win') {
    if (lower.endsWith('.exe') && !lower.startsWith('__') && !lower.includes('uninstall') && !lower.startsWith('elevate')) {
      // NSIS installers are "<product> Setup <version>.exe" and are what latest.yml points at; electron-builder's
      // default portable name is "<product> <version>.exe".
      const setup = !lower.includes('portable') && (lower.includes('setup') || feedNames().has(base));
      return { key: setup ? 'windows-setup' : 'windows-portable', ext: '.exe' };
    }
    if (lower.endsWith('.msi')) return { key: 'windows', ext: '.msi' };
  }
  if (target === 'mac') {
    if (lower.endsWith('.dmg')) return { key: `macos-${archOf(base)}`, ext: '.dmg', archInKey: true };
    if (lower.endsWith('.zip')) return { key: 'macos', ext: '.zip' };
  }
  if (target === 'linux') {
    if (base.endsWith('.AppImage')) return { key: 'linux', ext: '.AppImage' };
    if (lower.endsWith('.deb')) return { key: 'linux', ext: '.deb' };
    if (lower.endsWith('.rpm')) return { key: 'linux', ext: '.rpm' };
    if (lower.endsWith('.snap')) return { key: 'linux', ext: '.snap' };
    if (lower.endsWith('.tar.gz')) return { key: 'linux', ext: '.tar.gz' };
  }
  return null;
}

const groups = new Map();
for (const file of files) {
  const kind = kindOf(file);
  if (!kind) continue;
  const id = `${kind.key}${kind.ext}`;
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push({ file, ...kind });
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(feedDir, { recursive: true });

const renamed = [];
for (const entries of groups.values()) {
  for (const e of entries) {
    const suffix = entries.length > 1 && !e.archInKey ? `${e.key}-${archOf(e.file)}` : e.key;
    const name = `${prefix}-${version}-${suffix}${e.ext}`;
    if (renamed.some((r) => r.name === name)) throw new Error(`Two installers map to ${name}; extend electron-assets.mjs naming.`);
    fs.copyFileSync(path.join(src, e.file), path.join(outDir, name));
    renamed.push({ from: e.file, name });
  }
}

for (const f of feed) fs.copyFileSync(path.join(src, f), path.join(feedDir, path.basename(f)));

console.log(JSON.stringify({ target, installers: renamed, feed: [...feed].map((f) => path.basename(f)) }, null, 2));
if (!renamed.length) {
  console.error(`::error::No ${target} installers found under ${src}. Files seen:\n${files.join('\n')}`);
  process.exit(1);
}
if (!feed.size) console.error(`::warning::No latest*.yml in ${src}; this build cannot auto-update.`);
