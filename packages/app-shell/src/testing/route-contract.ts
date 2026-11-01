/**
 * Per-variant route contract check (omni-plan §5.3.4) for Jest — Node only (reads the route tree from disk); never
 * import it from app code. Other packages' tests reach it as `@resgrid/app-shell/testing/route-contract`.
 *
 *   assertRouteContract('unit', path.join(repoRoot, 'apps/omni/variants/unit/app'));
 *
 * Fails when a declared route has no file, a route file is not declared, a nav href does not resolve to a declared
 * route, or an `(app)` route has no nav registry entry (it would become an unlabeled tab or an unreachable screen).
 */
import fs from 'node:fs';
import path from 'node:path';

import { type NavRegistry, navRouteName, normalizeHref } from '../nav/define-nav';
import { CANONICAL_ROUTES } from '../routes/canonical';
import type { RouteContract } from '../routes/define-routes';

export interface ScannedRoute {
  /** File path relative to the app dir, forward slashes. */
  file: string;
  /** URL pattern with groups removed: `/call/[id]`. `+not-found` reads as `/[...missing]`. */
  path: string;
  /** Inside the `(app)` group (gated, part of the shell). */
  inAppGroup: boolean;
  /** For `(app)` routes: the child route name the `(app)` navigator sees (`calls`, `maps`, `operations/index`). */
  appRouteName: string | null;
}

const ROUTE_EXTENSIONS = /\.(tsx|ts|jsx|js)$/;
const PLATFORM_SUFFIX = /\.(web|native|ios|android)$/;
const IGNORED_SPECIAL = new Set(['+html', '+native-intent', '+middleware']);

const isGroup = (segment: string): boolean => /^\(.+\)$/.test(segment);

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (ROUTE_EXTENSIONS.test(entry.name) && !entry.name.endsWith('.d.ts') && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
}

/** Every route file in an expo-router root (layouts and special files excluded), one entry per URL. */
export function scanRouteFiles(appDir: string): ScannedRoute[] {
  if (!fs.existsSync(appDir)) {
    throw new Error(`Route directory not found: ${appDir}`);
  }
  const files: string[] = [];
  walk(appDir, files);
  const relative = files.map((file) => path.relative(appDir, file).split(path.sep).join('/'));
  const layoutDirs = new Set(relative.filter((file) => /(^|\/)_layout(\.(web|native|ios|android))?\.(tsx|ts|jsx|js)$/.test(file)).map((file) => path.posix.dirname(file)));

  const byPath = new Map<string, ScannedRoute>();
  for (const file of relative) {
    const withoutExt = file.replace(ROUTE_EXTENSIONS, '').replace(PLATFORM_SUFFIX, '');
    const segments = withoutExt.split('/');
    const base = segments[segments.length - 1];
    if (base === '_layout' || IGNORED_SPECIAL.has(base) || base.startsWith('+api')) {
      continue;
    }
    const normalized = segments.map((segment) => (segment === '+not-found' ? '[...missing]' : segment));
    const urlSegments = normalized.filter((segment) => !isGroup(segment));
    if (urlSegments[urlSegments.length - 1] === 'index') {
      urlSegments.pop();
    }
    const routePath = `/${urlSegments.join('/')}`;
    const inAppGroup = segments[0] === '(app)';

    let appRouteName: string | null = null;
    if (inAppGroup) {
      const inner = segments.slice(1);
      // The (app) navigator's child is the first nested folder that has its own layout, else the file itself.
      let name = inner.join('/');
      for (let i = 1; i < inner.length; i++) {
        if (layoutDirs.has(['(app)', ...inner.slice(0, i)].join('/'))) {
          name = inner.slice(0, i).join('/');
          break;
        }
      }
      appRouteName = name;
    }

    if (!byPath.has(routePath)) {
      byPath.set(routePath, { file, path: routePath, inAppGroup, appRouteName });
    }
  }
  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
}

export interface RouteContractInput {
  routes: RouteContract;
  nav: NavRegistry;
  /** `shell.kind`; tabs shells are checked by child route name (every child becomes a tab screen). */
  shellKind: 'drawer-slot' | 'tabs';
}

export interface RouteContractReport {
  variantId: string;
  routes: ScannedRoute[];
  /** Declared routes with no route file. */
  missingFiles: string[];
  /** Route files the contract does not declare (links to them could never be built). */
  undeclaredFiles: string[];
  /** Nav hrefs that do not resolve to a declared route. */
  unresolvedNav: string[];
  /** `(app)` routes with no nav registry entry. */
  unregisteredAppRoutes: string[];
}

interface VariantModules {
  nav?: NavRegistry;
  routes?: RouteContract;
}

/** Reads `variants/<v>/nav.ts` (exports `nav` and `routes`) and the manifest's `shell.kind` next to the app dir. */
function loadVariantInput(appDir: string): RouteContractInput {
  const variantDir = path.resolve(appDir, '..');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- test-only loader for the variant's registration module.
  const modules = require(path.join(variantDir, 'nav')) as VariantModules;
  if (!modules.nav || !modules.routes) {
    throw new Error(`${path.join(variantDir, 'nav.ts')} must export \`nav\` (defineNav) and \`routes\` (defineRoutes).`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(variantDir, 'variant.json'), 'utf8')) as { shell?: { kind?: string } };
  return { nav: modules.nav, routes: modules.routes, shellKind: manifest.shell?.kind === 'tabs' ? 'tabs' : 'drawer-slot' };
}

export function checkRouteContract(variantId: string, appDir: string, input: RouteContractInput = loadVariantInput(appDir)): RouteContractReport {
  const routes = scanRouteFiles(appDir);
  const filePaths = new Set(routes.map((route) => route.path));
  const declaredPatterns = new Set(input.routes.keys.map((key) => CANONICAL_ROUTES[key].pattern as string));

  const missingFiles = input.routes.keys.filter((key) => !filePaths.has(CANONICAL_ROUTES[key].pattern)).map((key) => `${key} (${CANONICAL_ROUTES[key].pattern})`);
  const undeclaredFiles = routes.filter((route) => !declaredPatterns.has(route.path)).map((route) => `${route.path} (${route.file})`);
  const unresolvedNav = input.nav.entries.filter((entry) => input.routes.resolve(entry.href) === null).map((entry) => `${entry.id} (${entry.href})`);

  const routeNames = new Set(input.nav.entries.map((entry) => navRouteName(entry)));
  const navHrefs = input.nav.entries.map((entry) => normalizeHref(entry.href));
  const unregisteredAppRoutes = routes
    .filter((route) => route.inAppGroup)
    .filter((route) => {
      if (input.shellKind === 'tabs') {
        return !routeNames.has(route.appRouteName ?? '');
      }
      return !navHrefs.some((href) => href === route.path || (href !== '/' && route.path.startsWith(`${href}/`)));
    })
    .map((route) => `${route.appRouteName ?? route.path} (${route.file})`);

  return { variantId, routes, missingFiles, undeclaredFiles, unresolvedNav, unregisteredAppRoutes };
}

/** Throws a readable error listing every contract violation for the variant. */
export function assertRouteContract(variantId: string, appDir: string, input?: RouteContractInput): RouteContractReport {
  const report = checkRouteContract(variantId, appDir, input);
  const problems = [
    ...report.missingFiles.map((item) => `declared route has no file: ${item}`),
    ...report.undeclaredFiles.map((item) => `route file is not declared in defineRoutes(): ${item}`),
    ...report.unresolvedNav.map((item) => `nav entry does not resolve to a declared route: ${item}`),
    ...report.unregisteredAppRoutes.map((item) => `(app) route has no nav registry entry: ${item}`),
  ];
  if (problems.length > 0) {
    throw new Error(`Route contract for "${variantId}" failed:\n  - ${problems.join('\n  - ')}`);
  }
  return report;
}
