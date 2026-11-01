'use strict';
// Copies the desktop shell's runtime dependencies (push receiver, updater) and their dependency closure out of the
// workspace's hoisted node_modules into a staging folder that electron-builder packs as the app's node_modules.
//
// electron-builder's own collectors cannot read this workspace: `pnpm list` reports virtual-store paths that do not
// exist under node-linker=hoisted, and `npm ls` rejects `catalog:`/`workspace:` specs, so they return nothing and the
// installer ships without node_modules. Resolving the closure here, the way Node itself resolves it, is deterministic.

const fs = require('fs');
const path = require('path');

const EXCLUDED_FILE = /\.(map|md|markdown|d\.ts|d\.mts|d\.cts|tsbuildinfo)$/i;
const EXCLUDED_DIR = new Set(['node_modules', 'test', 'tests', '__tests__', 'example', 'examples', 'docs', '.github', 'coverage']);

/** Node's lookup: <dir>/node_modules/<name>, walking up from `fromDir` to the filesystem root. */
function findPackageDir(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'));
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return fs.realpathSync(candidate);
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/** Path below the last `node_modules` segment: `electron-updater`, `@eneris/push-receiver`, `a/node_modules/b`. */
function installPath(packageDir, roots) {
  for (const root of roots) {
    const relative = path.relative(root, packageDir);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative;
    }
  }
  throw new Error(`${packageDir} is outside the known node_modules folders.`);
}

/**
 * @param {{ dependencies: string[], fromDir: string, roots: string[], outDir: string }} options
 *   dependencies: top-level runtime dependency names; fromDir: where they are resolved from (the desktop package);
 *   roots: node_modules folders packages may live in (desktop first, then the workspace root); outDir: staging folder.
 * @returns {{ name: string, version: string, path: string }[]} the copied packages
 */
function stageRuntimeModules({ dependencies, fromDir, roots, outDir }) {
  const byInstallPath = new Map();
  const queue = dependencies.map((name) => ({ name, from: fromDir, optional: false, requiredBy: 'apps/desktop' }));

  while (queue.length > 0) {
    const { name, from, optional, requiredBy } = queue.shift();
    const packageDir = findPackageDir(name, from);
    if (!packageDir) {
      if (optional) {
        continue;
      }
      throw new Error(`Runtime dependency "${name}" (required by ${requiredBy}) is not installed. Run pnpm install.`);
    }
    const target = installPath(packageDir, roots);
    const existing = byInstallPath.get(target);
    if (existing) {
      if (existing.source !== packageDir) {
        throw new Error(`Two copies of ${name} map to node_modules/${target}: ${existing.source} and ${packageDir}.`);
      }
      continue;
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
    byInstallPath.set(target, { source: packageDir, name, version: pkg.version });
    for (const dep of Object.keys(pkg.dependencies || {})) {
      queue.push({ name: dep, from: packageDir, optional: false, requiredBy: name });
    }
    for (const dep of Object.keys(pkg.optionalDependencies || {})) {
      queue.push({ name: dep, from: packageDir, optional: true, requiredBy: name });
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const [target, { source }] of byInstallPath) {
    fs.cpSync(source, path.join(outDir, target), {
      recursive: true,
      filter: (file) => {
        if (file === source) {
          return true;
        }
        const base = path.basename(file);
        const isDir = fs.statSync(file).isDirectory();
        // Nested node_modules are copied as packages of their own, only when something needs them.
        return isDir ? !EXCLUDED_DIR.has(base) : !EXCLUDED_FILE.test(base);
      },
    });
  }

  return [...byInstallPath.entries()].map(([target, { name, version }]) => ({ name, version, path: target.split(path.sep).join('/') })).sort((a, b) => a.path.localeCompare(b.path));
}

module.exports = { findPackageDir, stageRuntimeModules };
