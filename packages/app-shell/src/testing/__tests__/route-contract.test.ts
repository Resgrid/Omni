import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { appDirOf } from '../../__tests__/helpers/variants';
import { defineNav } from '../../nav/define-nav';
import { defineRoutes } from '../../routes/define-routes';
import { assertRouteContract, checkRouteContract, scanRouteFiles } from '../route-contract';

// The variants' nav.ts import defineNav/defineRoutes from the package barrel; only those two builders are needed here.
jest.mock('@resgrid/app-shell', () => ({
  defineNav: jest.requireActual('../../nav/define-nav').defineNav,
  defineRoutes: jest.requireActual('../../routes/define-routes').defineRoutes,
}));

const VARIANTS = ['responder', 'unit', 'ic', 'dispatch', 'bigboard'] as const;

function makeTree(files: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-shell-routes-'));
  for (const file of files) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'export {};\n');
  }
  return root;
}

describe('scanRouteFiles', () => {
  it('maps files to canonical URL patterns (groups, index, platform files, +not-found, layouts)', () => {
    const dir = makeTree([
      '_layout.tsx',
      '+html.tsx',
      '+not-found.tsx',
      'sso-return.tsx',
      '(app)/_layout.tsx',
      '(app)/index.tsx',
      '(app)/calls.tsx',
      '(app)/calls.web.tsx',
      '(app)/maps/_layout.tsx',
      '(app)/maps/index.tsx',
      '(app)/maps/search.tsx',
      '(app)/records/index.tsx',
      '(app)/records/[id].tsx',
      '(app)/__tests__/ignored.test.tsx',
      'call/[id]/index.tsx',
    ]);

    const routes = scanRouteFiles(dir);

    expect(routes.map((route) => route.path)).toEqual(['/', '/[...missing]', '/call/[id]', '/calls', '/maps', '/maps/search', '/records', '/records/[id]', '/sso-return']);
    const byPath = Object.fromEntries(routes.map((route) => [route.path, route]));
    expect(byPath['/calls'].appRouteName).toBe('calls');
    expect(byPath['/maps/search'].appRouteName).toBe('maps');
    expect(byPath['/records/[id]'].appRouteName).toBe('records/[id]');
    expect(byPath['/call/[id]'].inAppGroup).toBe(false);
  });

  it('throws for a missing directory', () => {
    expect(() => scanRouteFiles(path.join(os.tmpdir(), 'does-not-exist-app-shell'))).toThrow(/not found/);
  });
});

describe('checkRouteContract', () => {
  const dir = makeTree(['_layout.tsx', '(app)/_layout.tsx', '(app)/index.tsx', '(app)/calls.tsx', '(app)/orphan.tsx', 'sso-return.tsx']);

  it('reports declared routes without files, undeclared files, unresolved nav hrefs and unregistered (app) routes', () => {
    const report = checkRouteContract('fixture', dir, {
      routes: defineRoutes(['home', 'calls', 'callDetail']),
      nav: defineNav([
        { id: 'home', href: '/', placement: 'tab', labelKey: 'tabs.home' },
        { id: 'calls', href: '/calls', placement: 'tab', labelKey: 'tabs.calls' },
        { id: 'chat', href: '/chat', placement: 'sidebar', labelKey: 'tabs.chat' },
      ]),
      shellKind: 'tabs',
    });

    expect(report.missingFiles).toEqual(['callDetail (/call/[id])']);
    expect(report.undeclaredFiles).toEqual(['/orphan ((app)/orphan.tsx)', '/sso-return (sso-return.tsx)']);
    expect(report.unresolvedNav).toEqual(['chat (/chat)']);
    expect(report.unregisteredAppRoutes).toEqual(['orphan ((app)/orphan.tsx)']);
    expect(() => assertRouteContract('fixture', dir, { routes: defineRoutes(['home']), nav: defineNav([]), shellKind: 'drawer-slot' })).toThrow(/Route contract for "fixture" failed/);
  });

  it('drawer-slot shells accept nested routes under a registered entry', () => {
    const nested = makeTree(['(app)/_layout.tsx', '(app)/index.tsx', '(app)/records/index.tsx', '(app)/records/[id].tsx']);
    const report = checkRouteContract('fixture', nested, {
      routes: defineRoutes(['home', 'records', 'recordDetail']),
      nav: defineNav([
        { id: 'home', href: '/', placement: 'sidebar', labelKey: 'tabs.home' },
        { id: 'records', href: '/records', placement: 'sidebar', labelKey: 'tabs.records' },
      ]),
      shellKind: 'drawer-slot',
    });
    expect(report.unregisteredAppRoutes).toEqual([]);
  });
});

describe.each(VARIANTS)('route contract: %s', (variantId) => {
  it('every declared route has a file, every file is declared, every nav href resolves and every (app) route is registered', () => {
    const report = assertRouteContract(variantId, appDirOf(variantId));
    expect(report.routes.map((route) => route.path)).toContain('/');
    expect(report.routes.find((route) => route.path === '/')?.inAppGroup).toBe(true);
  });
});
