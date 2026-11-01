import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { LoginPage } from '../pages/login-page';
import { repoRoot } from '../support/variants';
import { expect, test } from '../support/web-fixtures';

// Runs once per variant against apps/omni/dist/<variant>, signed out and without a server.

test.describe('routes while signed out', () => {
  // `/contacts` and `/settings` exist in every variant's (app) group; `/call/<id>` is a detail route.
  for (const route of ['/contacts', '/call/12345', '/settings']) {
    test(`deep-linking to the protected ${route} shows the sign-in screen in place`, async ({ page }) => {
      const login = new LoginPage(page);
      await login.open(route);
      await expect(login.byTestId('shell-gate')).toBeVisible();
      await login.expectForm();
      // The gate wraps the route instead of redirecting, so signing in lands on the link that was opened.
      expect(new URL(page.url()).pathname).toBe(route);
    });
  }

  test('the public /login page renders the sign-in screen outside the gate', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open('/login');
    await login.expectForm();
    await expect(login.byTestId('shell-gate')).toHaveCount(0);
  });
});

// docker/nginx/csp.conf's policy, and the Electron shell's for an app served from this origin (BigBoard's loopback form).
const nginxPolicy = (): string => {
  const conf = fs.readFileSync(path.join(repoRoot, 'docker', 'nginx', 'csp.conf'), 'utf8');
  const match = /add_header Content-Security-Policy "([^"]+)"/.exec(conf);
  if (!match) throw new Error('docker/nginx/csp.conf has no Content-Security-Policy');
  return match[1];
};

const electronPolicy = (origin: string): string => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildContentSecurityPolicy } = require(path.join(repoRoot, 'apps', 'desktop', 'src', 'core', 'csp.js')) as { buildContentSecurityPolicy: (options: { appOrigins: string[] }) => string };
  return buildContentSecurityPolicy({ appOrigins: [origin] });
};

/** Serves every response with the given CSP, as nginx and the Electron shell do. */
async function withPolicy(page: Page, policy: string): Promise<void> {
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
}

/** Starts the worker the way maplibre-gl does for a same-origin URL (a module worker) and reports whether it loaded. */
const startModuleWorker = (page: Page, url: string): Promise<string> =>
  page.evaluate(
    (workerUrl) =>
      new Promise<string>((resolve) => {
        try {
          const worker = new Worker(workerUrl, { type: 'module' });
          const timer = setTimeout(() => {
            worker.terminate();
            resolve('loaded');
          }, 2_000);
          worker.addEventListener('error', (event) => {
            clearTimeout(timer);
            worker.terminate();
            resolve(`error: ${(event as ErrorEvent).message || 'the worker script did not load'}`);
          });
        } catch (error) {
          resolve(`threw: ${String(error)}`);
        }
      }),
    url
  );

test.describe('MapLibre on the web', () => {
  test('the export serves the maplibre-gl worker as JavaScript', async ({ request }) => {
    const response = await request.get('/maplibre-gl-worker.js');
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toMatch(/javascript/);
    expect((await response.body()).length).toBeGreaterThan(100_000);
  });

  for (const [name, policyFor] of [
    ['nginx (Docker)', () => nginxPolicy()],
    ['Electron', (origin: string) => electronPolicy(origin)],
  ] as const) {
    test(`the app boots and the worker starts under the ${name} CSP`, async ({ page, webServer }) => {
      await withPolicy(page, policyFor(webServer.url));
      const login = new LoginPage(page);
      await login.open('/');
      await login.expectForm();
      // The console guard (web-fixtures) fails the test on any CSP violation the page reports.
      expect(await startModuleWorker(page, '/maplibre-gl-worker.js')).toBe('loaded');
    });
  }
});
