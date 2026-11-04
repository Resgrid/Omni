import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { z } from 'zod';

import { LoginPage } from '../pages/login-page';
import { FlagStatesSchema, loadQaManifest, type QaDepartment, type QaManifest, type QaUser, totp, withTotpTime } from './qa-departments';
import { type ApiFailure, describeFailure, type QaSignedIn, unexpectedFailures } from './qa-expected-refusals';
import { test as webTest } from './web-fixtures';

/** The refusal code a Core error body carries: OAuth `error`, problem-details `type` or the v4 envelope `Status`. */
const ErrorBodySchema = z.object({ error: z.string().optional(), type: z.string().optional(), Status: z.string().optional() });

/** Where a sign-in attempt ended. */
export type SignInOutcome = 'signed-in' | 'refused' | 'mfa-enrollment';

export interface SignedIn {
  outcome: SignInOutcome;
  /** `FeatureToggles/GetAll` as the app received it during start-up (key -> enabled); empty when it never loaded. */
  flags: Map<string, boolean>;
}

interface QaWorkerFixtures {
  qa: QaManifest;
}

interface QaTestFixtures {
  /** Who the test signed in as, for refusals that depend on the department or the persona. */
  qaContext: QaSignedIn;
  /** Fails the test on a Core response the app should never get (any 5xx, any 4xx that is not an expected refusal). */
  apiGuard: ApiFailure[];
  /** A route as an absolute URL on the app's origin (the static server, or the Electron shell's app://), for goto. */
  appUrl: (route: string) => string;
  /** Signs in through the login screen as one of a department's personas (TOTP entered for an MFA-enrolled persona). */
  signIn: (department: QaDepartment, user: QaUser) => Promise<SignedIn>;
}

/** The app shell is up: `app-shell-<shell kind>` wraps every signed-in screen. */
export const shellRoot = (page: Page): Locator => page.locator('[data-testid^="app-shell-"]');

/**
 * QA regression fixtures: the web fixtures (static export, console-error guard) plus the seeded departments' manifest
 * and a sign-in against the QA API. The app reads BASE_API_URL from `window.__ENV__` on web (packages/core env.ts),
 * so the same production export points at the QA server without a rebuild.
 */
export const test = webTest.extend<QaTestFixtures, QaWorkerFixtures>({
  qa: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern; this one has none.
    async ({}, provide) => {
      const manifest = loadQaManifest();

      // The qa specs skip themselves without a manifest, so reaching this means a spec forgot to.
      if (!manifest) throw new Error('Set E2E_QA_MANIFEST to the qa-departments.json a seeded QA server produced (Core: Docker/qa-departments).');

      await provide(manifest);
    },
    { scope: 'worker' },
  ],

  // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern; this one has none.
  qaContext: async ({}, provide) => provide({ department: null, user: null }),

  apiGuard: [
    async ({ page, qa, qaContext }, provide, testInfo) => {
      const failures: ApiFailure[] = [];
      // Reading a refusal's body is async: the check at the end waits for every one still being read.
      const reading: Promise<void>[] = [];
      const origin = new URL(qa.apiUrl ?? 'https://invalid.invalid').origin;

      const record = async (response: Response): Promise<void> => {
        const body = ErrorBodySchema.safeParse(await response.json().catch(() => null));
        const code = body.success ? (body.data.error ?? body.data.type ?? body.data.Status ?? null) : null;
        const headers = await response.allHeaders().catch((): Record<string, string> => ({}));

        failures.push({ method: response.request().method(), url: response.url(), status: response.status(), code, reason: headers['x-resgrid-reason'] ?? null });
      };

      page.on('response', (response) => {
        if (response.status() >= 400 && new URL(response.url()).origin === origin) reading.push(record(response));
      });

      await provide(failures);
      await Promise.all(reading);

      if (failures.length) await testInfo.attach('api-failures.txt', { body: failures.map(describeFailure).join('\n'), contentType: 'text/plain' });
      expect(unexpectedFailures(failures, qaContext), 'Core answered requests the app should never get').toEqual([]);
    },
    { auto: true },
  ],

  // Absolute on purpose: baseURL does not apply to the Electron shell's own window.
  appUrl: async ({ baseURL }, provide) => provide((route) => new URL(route, baseURL).toString()),

  signIn: async ({ page, qa, qaContext, appUrl }, provide) => {
    await page.addInitScript((apiUrl) => Object.assign(window, { __ENV__: { BASE_API_URL: apiUrl } }), qa.apiUrl ?? '');

    await provide(async (department, user) => {
      qaContext.department = department;
      qaContext.user = user;
      const flags = new Map<string, boolean>();
      page.on('response', async (response) => {
        if (!/\/api\/v4\/FeatureToggles\/GetAll/i.test(response.url()) || response.status() !== 200) return;
        const parsed = FlagStatesSchema.safeParse(await response.json().catch(() => null));

        for (const item of parsed.success ? (parsed.data.Data ?? []) : []) flags.set(item.Key, item.Enabled);
      });

      const login = new LoginPage(page);

      await page.goto(appUrl('/'));
      await login.waitForBoot();
      await login.expectForm();
      await login.username.fill(user.username);
      await login.password.fill(qa.credentials.password);
      await login.submit.click();

      const mfaCode = page.getByTestId('login-mfa-code').or(page.getByTestId('login-otp-code'));
      const refused = page.getByTestId('login-error-dialog').or(page.getByTestId('login-error-message'));
      const enrollment = page.getByTestId('mfa-setup-key').or(page.getByTestId('mfa-setup-shared-key'));
      await expect(shellRoot(page).or(mfaCode).or(refused).or(enrollment).first(), `sign-in of ${user.username} (${department.scenario})`).toBeVisible({ timeout: 45_000 });

      if (user.totpSecret && (await mfaCode.isVisible())) {
        // A fresh time step per sign-in, submitted while this persona's turn is held: Core refuses a replayed or older step,
        // and every refusal counts toward the lockout.
        const totpSecret = user.totpSecret;

        await withTotpTime(user.username, async (at) => {
          await mfaCode.fill(totp(totpSecret, at));
          await page
            .getByTestId('login-mfa-submit')
            .or(page.getByTestId('login-otp-submit'))
            .first()
            // The sheet may already have submitted the sixth digit by itself.
            .click({ timeout: 2_000 })
            .catch(() => undefined);
          await expect(shellRoot(page).or(refused).first()).toBeVisible({ timeout: 45_000 });
        });
      }

      const outcome: SignInOutcome = (await shellRoot(page).isVisible()) ? 'signed-in' : (await enrollment.isVisible()) ? 'mfa-enrollment' : 'refused';

      if (outcome === 'signed-in') {
        await expect(page.getByTestId('shell-init-loading')).toHaveCount(0, { timeout: 60_000 });
      }

      return { outcome, flags };
    });
  },
});

export { expect };
