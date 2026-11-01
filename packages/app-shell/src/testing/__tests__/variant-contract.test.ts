import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadManifest } from '../../__tests__/helpers/variants';
import { defineNav } from '../../nav/define-nav';
import { defineRoutes } from '../../routes/define-routes';
import { checkRouteReexports, checkVariantContract, evaluateRouteBuilder, findFeatureRouteUses, hasValueExport, readRouteReexport, resolveSourceModule } from '../variant-contract';

/** A throwaway repo: `files` maps repo-relative paths to contents. */
function makeRepo(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-shell-variant-contract-'));
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

const FEATURES = {
  'packages/features/src/calls/index.ts': "export { default as CallListScreen, type CallListProps } from './screens/call-list';\nexport * from './more';\nexport type { Hidden } from './types';\n",
  'packages/features/src/calls/screens/call-list.tsx': "import { callDetail, callRoutes } from '../routes';\nexport default function CallList() { callDetail('1'); callRoutes.callNew(); return null; }\n",
  'packages/features/src/calls/more.ts': 'export const CallDetailScreen = () => null;\nexport function helper() {}\n',
  'packages/features/src/calls/types.ts': 'export interface Hidden { a: string }\n',
  'packages/features/src/calls/routes.ts': '// builders',
  'packages/features/src/dashboard/index.ts': 'export default function Dashboard() { return null; }\n',
  'packages/features/src/dashboard/routes.ts': '// builders',
};

const callBuilders = {
  callDetail: (id: string) => `/call/${id}`,
  callRoutes: { callNew: () => '/call/new', callDetail: (id: string) => `/call/${id}` },
};

describe('source helpers', () => {
  const repo = makeRepo(FEATURES);
  const index = path.join(repo, 'packages/features/src/calls/index.ts');

  it('resolves @resgrid/* and relative specifiers to source files', () => {
    expect(resolveSourceModule('@resgrid/features/calls', index, repo)).toBe(index);
    expect(resolveSourceModule('./screens/call-list', index, repo)).toBe(path.join(repo, 'packages/features/src/calls/screens/call-list.tsx'));
    expect(resolveSourceModule('react', index, repo)).toBeNull();
  });

  it('follows named re-exports and export * to value exports; types do not count', () => {
    expect(hasValueExport(index, 'CallListScreen', repo)).toBe(true);
    expect(hasValueExport(index, 'CallDetailScreen', repo)).toBe(true);
    expect(hasValueExport(index, 'helper', repo)).toBe(true);
    expect(hasValueExport(index, 'CallListProps', repo)).toBe(false);
    expect(hasValueExport(index, 'Hidden', repo)).toBe(false);
    expect(hasValueExport(index, 'Nope', repo)).toBe(false);
  });

  it('evaluates builders with sample ids and drops the query', () => {
    expect(evaluateRouteBuilder((id: unknown) => `/call/${String(id)}?tab=notes`)).toBe('/call/1');
    expect(
      evaluateRouteBuilder((id: unknown) => {
        if (typeof id !== 'number') throw new Error('number ids only');
        return `/poi/${id}`;
      })
    ).toBe('/poi/1');
    expect(evaluateRouteBuilder(() => 42)).toBeNull();
  });

  it('finds the builders a feature calls (named imports and xRoutes.member calls)', () => {
    const uses = findFeatureRouteUses(path.join(repo, 'packages/features/src'), 'calls', () => callBuilders);
    expect(uses.map((use) => `${use.builder}:${use.path}`)).toEqual(['callDetail:/call/1', 'callRoutes.callNew:/call/new']);
    expect(uses[0].calledFrom).toBe('calls/screens/call-list.tsx:2');
  });
});

describe('route files', () => {
  const repo = makeRepo({
    ...FEATURES,
    'app/(app)/_layout.tsx': 'export default function Layout() { return null; }\n',
    'app/(app)/index.tsx': "export { CallListScreen as default } from '@resgrid/features/calls';\n",
    'app/(app)/calls.tsx': "export { NoSuchScreen as default } from '@resgrid/features/calls';\n",
    'app/(app)/logic.tsx': "import React from 'react';\nexport default function Logic() { return null; }\n",
    'app/(app)/broken.tsx': "export { default } from '@resgrid/missing-package';\n",
    'app/(app)/thing.test.tsx': 'test("x", () => undefined);\n',
  });
  const appDir = path.join(repo, 'app');

  it('reads a one-line re-export', () => {
    expect(readRouteReexport(path.join(appDir, '(app)/index.tsx'))).toEqual({ specifier: '@resgrid/features/calls', imported: 'CallListScreen' });
    expect(readRouteReexport(path.join(appDir, '(app)/logic.tsx'))).toEqual({ problem: expect.stringMatching(/may only re-export/) });
  });

  it('reports logic, missing exports, unresolvable modules and tests in the route tree (layouts are skipped)', () => {
    const { reexports, problems } = checkRouteReexports(appDir, repo);
    expect(reexports.map((entry) => entry.file)).toEqual(['(app)/index.tsx']);
    expect(problems).toEqual([
      expect.stringMatching(/^\(app\)\/broken\.tsx: cannot resolve/),
      expect.stringMatching(/^\(app\)\/calls\.tsx: .* no export named "NoSuchScreen"/),
      expect.stringMatching(/^\(app\)\/logic\.tsx: route files may only re-export/),
      expect.stringMatching(/^\(app\)\/thing\.test\.tsx: tests do not belong/),
    ]);
  });
});

describe('checkVariantContract', () => {
  const bigboard = loadManifest('bigboard');
  const responder = loadManifest('responder');

  const repo = makeRepo({
    ...FEATURES,
    'app/(app)/_layout.tsx': 'export default function Layout() { return null; }\n',
    'app/(app)/index.tsx': "export { default } from '@resgrid/features/dashboard';\n",
    'app/(app)/calls.tsx': "export { CallListScreen as default } from '@resgrid/features/calls';\n",
    'app/(app)/call/[id].tsx': "export { CallDetailScreen as default } from '@resgrid/features/calls';\n",
  });
  const appDir = path.join(repo, 'app');
  const nav = defineNav([
    { id: 'home', href: '/', placement: 'sidebar', labelKey: 'tabs.home' },
    { id: 'calls', href: '/calls', placement: 'sidebar', labelKey: 'calls.title' },
    { id: 'call-detail', href: '/call/[id]', placement: 'hidden', labelKey: 'call_detail.title' },
    { id: 'inventory', href: '/calls', routeName: 'inventory', placement: 'hidden', labelKey: 'inventory.title', requiresModule: 'inventory' },
  ]);
  const routes = defineRoutes(['home', 'calls', 'callDetail']);

  it('skips links to routes the variant is not entitled to (BigBoard creates no calls) but flags module routes it does not ship', () => {
    const report = checkVariantContract({ variantId: 'bigboard', appDir, manifest: bigboard, routes, nav, repoRoot: repo, loadFeatureRoutes: () => callBuilders });
    expect(report.features).toEqual(['calls', 'dashboard']);
    expect(report.problems).toEqual([expect.stringMatching(/nav entry inventory requires module "inventory"/)]);
  });

  it('flags a feature module the manifest does not list, a declared route it is not entitled to and a link to an undeclared route', () => {
    const report = checkVariantContract({
      variantId: 'responder',
      appDir,
      manifest: responder,
      routes: defineRoutes(['home', 'calls', 'callDetail', 'lockscreen']),
      nav: defineNav(nav.entries.filter((entry) => entry.id !== 'inventory')),
      repoRoot: repo,
      loadFeatureRoutes: () => callBuilders,
    });
    expect(report.problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/declared route has no file: lockscreen/),
        expect.stringMatching(/route lockscreen .* not entitled/),
        expect.stringMatching(/\(app\)\/index\.tsx re-exports the "dashboard" module/),
        expect.stringMatching(/calls builder callRoutes\.callNew .* links to callNew \(\/call\/new\)/),
      ])
    );
  });

  it('flags a builder whose path is not a canonical route', () => {
    const report = checkVariantContract({
      variantId: 'bigboard',
      appDir,
      manifest: { ...bigboard, modules: ['dashboard'] },
      routes,
      nav: defineNav(nav.entries.filter((entry) => entry.id !== 'inventory')),
      repoRoot: repo,
      loadFeatureRoutes: () => ({ callDetail: () => '/calls-v2/1', callRoutes: { callNew: () => '/call/new' } }),
    });
    expect(report.problems).toEqual([expect.stringMatching(/callDetail .* produces "\/calls-v2\/1", which is not a canonical route/)]);
  });
});

describe('module folders behind an explicitly gated route', () => {
  it("allow a variant without the module to serve a shared screen on a route with its own entitlement (Dispatch's call board)", () => {
    const dispatch = loadManifest('dispatch');
    const repo = makeRepo({
      ...FEATURES,
      'packages/features/src/incident-command/index.ts': 'export default function Board() { return null; }\n',
      'app/(app)/_layout.tsx': 'export default function Layout() { return null; }\n',
      'app/(app)/index.tsx': "export { CallListScreen as default } from '@resgrid/features/calls';\n",
      'app/(app)/call/[id].tsx': "export { CallDetailScreen as default } from '@resgrid/features/calls';\n",
      'app/(app)/call/[id]/command.tsx': "export { default } from '@resgrid/features/incident-command';\n",
      'app/(app)/command.tsx': "export { default } from '@resgrid/features/incident-command';\n",
    });
    const report = checkVariantContract({
      variantId: 'dispatch',
      appDir: path.join(repo, 'app'),
      manifest: dispatch,
      routes: defineRoutes(['home', 'callDetail', 'callCommand', 'commandBoard']),
      nav: defineNav([
        { id: 'home', href: '/', placement: 'sidebar', labelKey: 'tabs.home' },
        { id: 'call-detail', href: '/call/[id]', placement: 'hidden', labelKey: 'call_detail.title' },
        { id: 'command', href: '/command', placement: 'sidebar', labelKey: 'incident_command.nav_board' },
      ]),
      repoRoot: repo,
      loadFeatureRoutes: () => ({}),
    });
    // /call/[id]/command is entitled by the assist tier; /command is IC's module route.
    expect(report.problems).toEqual([expect.stringMatching(/route commandBoard .* not entitled/), expect.stringMatching(/\(app\)\/command\.tsx re-exports the "incident-command" module/)]);
  });
});
