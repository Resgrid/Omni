#!/usr/bin/env node
// Writes the CycloneDX SBOM of one store package, named after it (<package>.cdx.json), next to the package. The release
// job attaches it with the package and covers it in SHA256SUMS; the Software Factory reads it from the release and shows
// it on that package's store uploads (int-RASF docs/sbom.md, "SBOMs attached to GitHub releases").
//
// It lists what the package ships, from the build that made it:
//   - npm: the production dependencies of apps/omni and the workspace packages it links, from pnpm-lock.yaml
//   - android: the :app module's releaseRuntimeClasspath, from Gradle in the kept EAS build directory
//   - ios: the pods in the build's Podfile.lock, except the ones npm packages provide from node_modules (listed as npm)
// Nothing is downloaded or installed; only the repository's own dependencies are used.
//
// Usage: node scripts/ci/package-sbom.mjs --platform android|ios --build-dir <EAS_LOCAL_BUILD_WORKINGDIR> \
//          --package out/<Prefix>-<version>-android.aab [--lockfile pnpm-lock.yaml] [--importer apps/omni]
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArgs, repoRoot, requireArg } from './lib.mjs';

const require = createRequire(import.meta.url);
// Not `build`: EAS keeps its copy of the repository in <working dir>/build.
const SKIP_DIRS = new Set(['node_modules', 'Pods']);

/** The version of a lockfile entry without its peer and patch suffixes: `58.0.2(expo@58.0.22)` → `58.0.2`. */
const bareVersion = (v) => String(v).split('(')[0];

/**
 * The npm packages an importer of a pnpm v9 lockfile ships: its dependencies and optional dependencies, the workspace
 * packages it links (their production dependencies, not the packages themselves) and everything they depend on.
 */
export function pnpmProductionPackages(lock, importer) {
  if (!String(lock?.lockfileVersion ?? '').startsWith('9')) throw new Error(`pnpm-lock.yaml version ${lock?.lockfileVersion} is not supported (expected 9).`);
  if (!lock.importers?.[importer]) throw new Error(`pnpm-lock.yaml has no importer ${importer}.`);
  const packages = new Map();
  const seenImporters = new Set();
  const seenSnapshots = new Set();
  const queue = [];
  const runtime = (entry) => ({ ...(entry?.dependencies ?? {}), ...(entry?.optionalDependencies ?? {}) });
  const visitImporter = (dir) => {
    if (seenImporters.has(dir)) return;
    seenImporters.add(dir);
    for (const [name, dep] of Object.entries(runtime(lock.importers[dir]))) {
      const version = String(dep?.version ?? '');
      if (version.startsWith('link:')) {
        const linked = path.posix.normalize(path.posix.join(dir, version.slice('link:'.length)));
        if (lock.importers[linked]) visitImporter(linked);
      } else queue.push([name, version]);
    }
  };
  visitImporter(importer);
  while (queue.length) {
    const [name, version] = queue.pop();
    // An alias (`string-width-cjs: string-width@4.2.3`) names the real package in its version.
    const key = /^[^(]+@/.test(version.replace(/^@/, '')) && !/^\d/.test(version) ? version : `${name}@${version}`;
    if (seenSnapshots.has(key)) continue;
    seenSnapshots.add(key);
    const at = key.indexOf('@', 1);
    const realName = key.slice(0, at);
    const bare = bareVersion(key.slice(at + 1));
    if (bare.startsWith('link:') || bare.startsWith('file:')) continue;
    const meta = lock.packages?.[`${realName}@${bare}`];
    const integrity = meta?.resolution?.integrity;
    packages.set(`${realName}@${bare}`, { name: realName, version: bare, ...(integrity ? { integrity } : {}) });
    // A snapshot also lists the peers it resolved (expo-router's optional @testing-library/react-native, met by the
    // workspace's dev tools). Peers come from whoever installs the package, so only its own dependencies are followed.
    const peers = new Set(Object.keys(meta?.peerDependencies ?? {}));
    for (const [depName, depVersion] of Object.entries(runtime(lock.snapshots?.[key]))) if (!peers.has(depName)) queue.push([depName, String(depVersion)]);
  }
  return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/**
 * The Maven artifacts in `gradle :app:dependencies --configuration <c>` output, at the version Gradle resolved. Project
 * modules (npm packages' native code), constraints (c), unresolved (n) and failed entries are left out.
 */
export function gradleArtifacts(output) {
  const artifacts = new Map();
  for (const line of String(output).split(/\r?\n/)) {
    if (!/^[|\\+ ]*[+\\]--- /.test(line)) continue;
    const entry = line
      .replace(/^[|\\+\- ]*/, '')
      .replace(/\s+\(\*\)$/, '')
      .trim();
    if (entry.startsWith('project ') || /\((c|n)\)$/.test(entry) || / FAILED$/.test(entry)) continue;
    const [declared, resolved] = entry.split(/\s+->\s+/);
    if (resolved?.startsWith('project ')) continue;
    const parts = declared.split(':');
    if (parts.length < 2) continue;
    const declaredVersion = parts
      .slice(2)
      .join(':')
      .replace(/^\{(?:strictly|require|prefer)\s+([^;}\s]+)[^}]*\}$/, '$1');
    const version = (resolved ?? declaredVersion).trim();
    if (!version || /[\s{}[\]]/.test(version)) continue;
    artifacts.set(`${parts[0]}:${parts[1]}@${version}`, { group: parts[0], name: parts[1], version });
  }
  return [...artifacts.values()].sort((a, b) => `${a.group}:${a.name}`.localeCompare(`${b.group}:${b.name}`));
}

/**
 * The pods of a parsed Podfile.lock, one per pod (subspecs belong to their pod). Pods built from a local path are the
 * native code of npm packages in node_modules and are listed as those packages instead.
 */
export function cocoaPods(podfileLock) {
  const local = new Set(Object.entries(podfileLock?.['EXTERNAL SOURCES'] ?? {}).flatMap(([name, source]) => (source && typeof source === 'object' && ':path' in source ? [name] : [])));
  const pods = new Map();
  for (const entry of podfileLock?.PODS ?? []) {
    const spec = typeof entry === 'string' ? entry : Object.keys(entry ?? {})[0];
    const match = /^"?([^\s(]+) \(([^)]+)\)"?$/.exec(String(spec ?? ''));
    if (!match) continue;
    const name = match[1].split('/')[0];
    if (local.has(name)) continue;
    pods.set(`${name}@${match[2]}`, { name, version: match[2] });
  }
  return [...pods.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const purlName = (s) => encodeURIComponent(s);
/** sha512-<base64> (an npm integrity) as CycloneDX's hex hash. */
const integrityHash = (integrity) => {
  const match = /^sha512-([A-Za-z0-9+/=]+)$/.exec(integrity ?? '');
  return match ? [{ alg: 'SHA-512', content: Buffer.from(match[1], 'base64').toString('hex') }] : [];
};

/** A CycloneDX 1.6 document describing one package file, with its SHA-256, and the components it ships. */
export function cycloneDx({ packageName, packageSha256, version, npm = [], maven = [], pods = [], timestamp = new Date().toISOString() }) {
  const components = [
    ...npm.map((p) => {
      const scoped = p.name.startsWith('@') ? p.name.split('/') : null;
      const purl = `pkg:npm/${scoped ? `${purlName(scoped[0])}/${purlName(scoped[1])}` : purlName(p.name)}@${purlName(p.version)}`;
      const hashes = integrityHash(p.integrity);
      return { type: 'library', 'bom-ref': purl, ...(scoped ? { group: scoped[0], name: scoped[1] } : { name: p.name }), version: p.version, purl, ...(hashes.length ? { hashes } : {}) };
    }),
    ...maven.map((a) => {
      const purl = `pkg:maven/${purlName(a.group)}/${purlName(a.name)}@${purlName(a.version)}`;
      return { type: 'library', 'bom-ref': purl, group: a.group, name: a.name, version: a.version, purl };
    }),
    ...pods.map((p) => {
      const purl = `pkg:cocoapods/${purlName(p.name)}@${purlName(p.version)}`;
      return { type: 'library', 'bom-ref': purl, name: p.name, version: p.version, purl };
    }),
  ];
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp,
      tools: { components: [{ type: 'application', name: 'omni package-sbom', version: '1' }] },
      component: { type: 'application', 'bom-ref': packageName, name: packageName, version, hashes: [{ alg: 'SHA-256', content: packageSha256 }] },
    },
    components,
  };
}

/** The shallowest directory under root that holds every one of the files, outside node_modules and build output. */
export function findDirectory(root, files, maxDepth = 6) {
  let level = [root];
  for (let depth = 0; depth <= maxDepth && level.length; depth++) {
    const found = level.find((dir) => files.every((f) => [].concat(f).some((alt) => fs.existsSync(path.join(dir, alt)))));
    if (found) return found;
    level = level.flatMap((dir) => {
      try {
        return fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
          .map((e) => path.join(dir, e.name));
      } catch {
        return [];
      }
    });
  }
  return null;
}

function androidArtifacts(buildDir) {
  const project = findDirectory(buildDir, [['settings.gradle', 'settings.gradle.kts'], 'gradlew', 'app']);
  if (!project) throw new Error(`No Android project (settings.gradle, gradlew, app/) under ${buildDir}; was the EAS build directory kept?`);
  console.log(`Gradle project: ${project}`);
  const result = spawnSync(path.join(project, 'gradlew'), [':app:dependencies', '--configuration', 'releaseRuntimeClasspath', '--console=plain', '-q'], {
    cwd: project,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
  });
  if (result.status !== 0) throw new Error(`gradlew :app:dependencies failed (${result.error?.message ?? `exit ${result.status}`}): ${String(result.stderr).slice(-2000)}`);
  const artifacts = gradleArtifacts(result.stdout);
  if (!artifacts.length) throw new Error('Gradle listed no runtime dependencies for :app.');
  return artifacts;
}

function iosPods(buildDir) {
  const project = findDirectory(buildDir, ['Podfile', 'Podfile.lock']);
  if (!project) throw new Error(`No Podfile.lock under ${buildDir}; was the EAS build directory kept?`);
  console.log(`CocoaPods project: ${project}`);
  const pods = cocoaPods(require('yaml').parse(fs.readFileSync(path.join(project, 'Podfile.lock'), 'utf8')));
  if (!pods.length) throw new Error('Podfile.lock lists no pods.');
  return pods;
}

async function main() {
  const args = parseArgs();
  const platform = requireArg(args, 'platform');
  if (!['android', 'ios'].includes(platform)) throw new Error('--platform must be android or ios.');
  const buildDir = path.resolve(requireArg(args, 'build-dir'));
  const packageFile = path.resolve(requireArg(args, 'package'));
  if (!fs.existsSync(packageFile)) throw new Error(`${packageFile} does not exist.`);
  const lockfile = path.resolve(args.lockfile ? String(args.lockfile) : path.join(repoRoot, 'pnpm-lock.yaml'));
  const importer = args.importer ? String(args.importer) : 'apps/omni';

  const npm = pnpmProductionPackages(require('yaml').parse(fs.readFileSync(lockfile, 'utf8')), importer);
  const maven = platform === 'android' ? androidArtifacts(buildDir) : [];
  const pods = platform === 'ios' ? iosPods(buildDir) : [];
  const packageName = path.basename(packageFile);
  const version = /-(\d+(?:\.\d+)+)-/.exec(packageName)?.[1] ?? 'unknown';
  const packageSha256 = crypto.createHash('sha256').update(fs.readFileSync(packageFile)).digest('hex');
  const bom = cycloneDx({ packageName, packageSha256, version, npm, maven, pods });
  const out = `${packageFile}.cdx.json`;
  fs.writeFileSync(out, JSON.stringify(bom, null, 2) + '\n');
  console.log(`${path.basename(out)}: ${npm.length} npm packages, ${maven.length} Maven artifacts, ${pods.length} pods.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`::warning::No SBOM for this package: ${error.message}`);
    process.exit(1);
  });
}
