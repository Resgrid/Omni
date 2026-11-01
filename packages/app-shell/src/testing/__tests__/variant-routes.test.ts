/* eslint-disable @typescript-eslint/no-require-imports -- the variants' nav.ts and the features' routes.ts are loaded at run time, after the barrel mocks are in place. */
// Per-variant route contract (AGENTS.md Testing, omni-plan §12): for every variant, read its route tree, manifest and
// nav.ts plus the sources of the features it ships, and assert the full contract (testing/variant-contract.ts). Data
// driven: a route file, nav entry, feature or builder added later is checked without editing this file.
import fs from 'node:fs';
import path from 'node:path';

import { VARIANT_IDS, type VariantId } from '@resgrid/config';

import { appDirOf, loadManifest, REPO_ROOT, VARIANTS_DIR } from '../../__tests__/helpers/variants';
import type { NavRegistry } from '../../nav/define-nav';
import { CANONICAL_ROUTES, isRouteAvailableFor, ROUTE_KEYS } from '../../routes/canonical';
import type { RouteContract } from '../../routes/define-routes';
import { assertVariantContract, featureOfSpecifier, resolveCanonicalPath, resolveSourceModule } from '../variant-contract';

// The variants' nav.ts import the registry builders from the package barrel; only these are needed.
jest.mock('@resgrid/app-shell', () => ({
  ...jest.requireActual('../../nav/define-nav'),
  ...jest.requireActual('../../nav/feature-nav'),
  ...jest.requireActual('../../routes/define-routes'),
}));

const FEATURES_DIR = path.join(REPO_ROOT, 'packages', 'features', 'src');

// A feature barrel pulls in its screens; nav and routes modules that import another feature's barrel (settings →
// auth-ui) only need its builders and nav entries, so every barrel resolves to its routes.ts + nav.ts here.
// Folders without an index.ts are still being written and are skipped until they have one.
const featureFolders = fs.readdirSync(FEATURES_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.join(FEATURES_DIR, entry.name, 'index.ts')));
for (const folder of featureFolders) {
  jest.doMock(`@resgrid/features/${folder.name}`, () => {
    const merged: Record<string, unknown> = {};
    for (const part of ['routes', 'nav']) {
      if (fs.existsSync(path.join(FEATURES_DIR, folder.name, `${part}.ts`))) {
        Object.assign(merged, jest.requireActual(path.join(FEATURES_DIR, folder.name, part)));
      }
    }
    return merged;
  });
}

const loadFeatureRoutes = (feature: string): Record<string, unknown> => {
  const file = path.join(FEATURES_DIR, feature, 'routes.ts');
  return fs.existsSync(file) ? (require(file) as Record<string, unknown>) : {};
};

/** Features imported by these files (`@resgrid/features/<name>[/…]`). */
function featuresImportedBy(files: readonly string[]): string[] {
  const names = new Set<string>();
  for (const file of files) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/from '(@resgrid\/features\/[^']+)'/g)) {
      const name = featureOfSpecifier(match[1]);
      if (name) {
        names.add(name);
      }
    }
  }
  return Array.from(names);
}

/** Every route file (layouts included) of a variant's tree. */
function routeFilesOf(id: VariantId): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(appDirOf(id));
  return files;
}

/**
 * App-layer files a variant ships besides its route tree: its nav.ts and the wrapper screens its routes re-export
 * relatively (apps/omni/screens). Cross-cutting registrations (shell-registrations, providers, call tabs) are not counted:
 * their links sit behind the feature's own flag and capability checks.
 */
function appFilesOf(id: VariantId): string[] {
  const wrappers = new Set<string>();
  for (const file of routeFilesOf(id)) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)) {
      const target = resolveSourceModule(match[1], file, REPO_ROOT);
      if (target && !target.startsWith(VARIANTS_DIR)) {
        wrappers.add(target);
      }
    }
  }
  return [path.join(VARIANTS_DIR, id, 'nav.ts'), ...wrappers];
}

interface VariantModules {
  nav: NavRegistry;
  routes: RouteContract;
}

const loadVariantModules = (id: VariantId): VariantModules => require(path.join(VARIANTS_DIR, id, 'nav')) as VariantModules;

/** Features a variant ships: those its route files re-export from, plus the app-layer ones. */
function featuresOf(id: VariantId, extra: readonly string[]): string[] {
  return Array.from(new Set([...featuresImportedBy(routeFilesOf(id)), ...extra])).sort();
}

describe('canonical route table', () => {
  it('resolves concrete feature paths to the most specific canonical route', () => {
    expect(resolveCanonicalPath('/call/new')).toBe('callNew');
    expect(resolveCanonicalPath('/call/12')).toBe('callDetail');
    expect(resolveCanonicalPath('/weather-alerts/settings')).toBe('weatherAlertSettings');
    expect(resolveCanonicalPath('/weather-alerts/w1')).toBe('weatherAlertDetail');
    expect(resolveCanonicalPath('/no/such/screen')).toBeNull();
  });
});

describe.each(VARIANT_IDS as readonly VariantId[])('route contract: %s', (variantId) => {
  const manifest = loadManifest(variantId);
  const { nav, routes } = loadVariantModules(variantId);
  const extraFeatures = featuresImportedBy(appFilesOf(variantId));

  it('route files, declared routes, nav entries, entitlements and every feature link agree', () => {
    const report = assertVariantContract({ variantId, appDir: appDirOf(variantId), manifest, routes, nav, repoRoot: REPO_ROOT, loadFeatureRoutes, extraFeatures });
    expect(report.routes.find((route) => route.path === '/')?.inAppGroup).toBe(true);
    // Every route file is checked as a re-export (the home route included).
    expect(report.reexports.length).toBeGreaterThan(0);
  });

  it('every route pattern a shipped feature publishes is a canonical route (no drift between features and the shell)', () => {
    const features = featuresOf(variantId, extraFeatures);
    const drift: string[] = [];
    for (const feature of features) {
      for (const [name, value] of Object.entries(loadFeatureRoutes(feature))) {
        if (!/_ROUTE_PATTERNS$/.test(name) || !value || typeof value !== 'object') {
          continue;
        }
        for (const pattern of Object.values(value as Record<string, unknown>)) {
          if (typeof pattern === 'string' && !ROUTE_KEYS.some((key) => CANONICAL_ROUTES[key].pattern === pattern)) {
            drift.push(`${feature}.${name}: ${pattern}`);
          }
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it('declares every canonical route only where the manifest entitles it', () => {
    expect(routes.keys.filter((key) => !isRouteAvailableFor(key, manifest))).toEqual([]);
  });
});
