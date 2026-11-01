import fs from 'node:fs';
import path from 'node:path';

import { repoRoot, type VariantManifest } from './variants';

export interface DesktopApp {
  executable: string;
  args: string[];
}

const LINUX_NON_APP = new Set(['chrome-sandbox', 'chrome_crashpad_handler']);

/**
 * Locates an unpacked electron-builder build of the variant (win-unpacked/<productName>.exe,
 * mac*\/<productName>.app, linux-unpacked/<executable>). Order: E2E_DESKTOP_EXECUTABLE, E2E_DESKTOP_DIR,
 * apps/desktop/release[/<variant>], apps/desktop/out[/<variant>]. Returns null when nothing is built.
 */
export function findDesktopApp(manifest: VariantManifest, env: NodeJS.ProcessEnv = process.env): DesktopApp | null {
  // Linux CI runners cannot use the SUID sandbox of an unpacked build.
  const args = process.platform === 'linux' ? ['--no-sandbox'] : [];
  if (env.E2E_DESKTOP_EXECUTABLE) return fs.existsSync(env.E2E_DESKTOP_EXECUTABLE) ? { executable: env.E2E_DESKTOP_EXECUTABLE, args } : null;

  const desktop = path.join(repoRoot, 'apps', 'desktop');
  const roots = [env.E2E_DESKTOP_DIR, path.join(desktop, 'release', manifest.id), path.join(desktop, 'release'), path.join(desktop, 'out', manifest.id), path.join(desktop, 'out')].filter(
    (dir): dir is string => Boolean(dir) && fs.existsSync(dir as string)
  );
  for (const root of roots) {
    const executable = search(root, manifest, 3);
    if (executable) return { executable, args };
  }
  return null;
}

function search(dir: string, manifest: VariantManifest, depth: number): string | null {
  const product = manifest.identity.electron.productName;
  const found = matchIn(dir, product, manifest.id);
  if (found || depth === 0) return found;
  for (const entry of safeReaddir(dir)) {
    if (!entry.isDirectory() || entry.name.endsWith('.app') || entry.name === 'node_modules') continue;
    const nested = search(path.join(dir, entry.name), manifest, depth - 1);
    if (nested) return nested;
  }
  return null;
}

function matchIn(dir: string, product: string, variant: string): string | null {
  const name = path.basename(dir);
  if (process.platform === 'win32') {
    const exe = path.join(dir, `${product}.exe`);
    return name.endsWith('-unpacked') && fs.existsSync(exe) ? exe : null;
  }
  if (process.platform === 'darwin') {
    const bin = path.join(dir, `${product}.app`, 'Contents', 'MacOS', product);
    return fs.existsSync(bin) ? bin : null;
  }
  if (!name.endsWith('-unpacked') || !fs.existsSync(path.join(dir, 'resources'))) return null;
  const candidates = safeReaddir(dir)
    .filter((e) => e.isFile() && !LINUX_NON_APP.has(e.name) && !/\.(so(\.\d+)*|pak|dat|bin|json|html|dll)$/.test(e.name))
    .map((e) => e.name)
    .filter((file) => isExecutable(path.join(dir, file)));
  const wanted = [product, product.toLowerCase(), product.toLowerCase().replace(/\s+/g, '-'), product.replace(/\s+/g, ''), variant];
  const preferred = candidates.find((c) => wanted.includes(c) || wanted.includes(c.toLowerCase()));
  const pick = preferred ?? (candidates.length === 1 ? candidates[0] : undefined);
  return pick ? path.join(dir, pick) : null;
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function safeReaddir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
