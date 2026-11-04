// The release regression checks, shared by the web (qa/regression.spec.ts) and Electron (qa-desktop/regression.spec.ts)
// projects: every screen of this app, signed in to every seeded QA department (Core: Docker/qa-departments), must render
// without a console error, an uncaught exception, a failed start-up, an unmatched route or a Core response the app should
// never get. Flags are checked both ways: the app receives the state each department was seeded with, and flag-gated
// navigation shows in flags-on and hides in flags-off.
import type { Page } from '@playwright/test';

import { flagGatedNav, flagsExpected, loadQaManifest, persona, type QaDepartment, type QaUser, resolveRoute, selectedQaDepartments, signedInRoutes } from '../support/qa-departments';
import { expect, shellRoot, type test as qaTest } from '../support/qa-fixtures';

const manifest = loadQaManifest();
const departments = manifest ? selectedQaDepartments(manifest) : [];

// Time for a screen's first requests to land before the next one opens (E2E_QA_SETTLE_MS).
const SETTLE_MS = Number(process.env.E2E_QA_SETTLE_MS ?? 1500);

/** The persona each department's sweep signs in as: the admin sees every screen; restricted also checks a member. */
const sweepPersonas = (department: QaDepartment): QaUser[] =>
  ['admin', ...(department.scenario === 'restricted' ? ['member'] : [])].flatMap((id) => {
    const user = persona(department, id);

    return user ? [user] : [];
  });

// Sign-in behaviour checks need a department of their kind in this run.
const ssoOnly = departments.find((d) => d.features.sso === 'required');
const ssoMember = ssoOnly ? persona(ssoOnly, 'member') : undefined;
const mfaRequired = departments.find((d) => d.features.mfaRequired);
const unenrolled = mfaRequired?.users.find((user) => !user.totpSecret && !user.disabled && !user.hidden);

async function openMenu(page: Page): Promise<boolean> {
  const menu = page.getByTestId('shell-nav-menu');

  if (await menu.isVisible()) return true;
  const button = page.getByTestId('shell-menu-button');

  if (!(await button.isVisible())) return false;
  await button.click();

  return menu.isVisible();
}

/** Registers the QA regression tests on `test` (the web or the Electron QA fixtures). */
export function defineQaRegression(test: typeof qaTest): void {
  test.describe('QA regression', () => {
    test.skip(!manifest, 'Set E2E_QA_MANIFEST to a seeded QA server manifest (Core: Docker/qa-departments).');

    for (const department of departments) {
      test.describe(`${department.scenario}`, () => {
        test.skip(department.features.sso === 'required', 'SSO-only department: password sign-in is checked by its own test.');

        for (const user of sweepPersonas(department)) {
          test(`every screen renders for ${user.persona}`, async ({ page, signIn, variantId, appUrl }) => {
            test.setTimeout(15 * 60_000);
            const { outcome } = await signIn(department, user);

            expect(outcome, `${user.username} signs in`).toBe('signed-in');
            const skipped: string[] = [];

            for (const pattern of signedInRoutes(variantId)) {
              const route = resolveRoute(pattern, department);

              if (!route.url) {
                skipped.push(pattern);
                continue;
              }

              const url = route.url;

              await test.step(url, async () => {
                await page.goto(appUrl(url));
                await expect(shellRoot(page), `${url}: the app shell is up`).toBeVisible({ timeout: 45_000 });
                await expect(page.getByTestId('shell-init-failed'), `${url}: start-up did not fail`).toHaveCount(0);
                await expect(page.getByText('Unmatched Route'), `${url}: the route exists`).toHaveCount(0);
                await page.waitForTimeout(SETTLE_MS);
              });
            }

            if (skipped.length) test.info().annotations.push({ type: 'skipped routes', description: `${skipped.join(', ')}: no record in ${department.scenario} to open` });
          });
        }

        const admin = persona(department, 'admin');

        if (admin) {
          test('the app receives the flag states the department was seeded with', async ({ page, signIn }) => {
            const { outcome, flags } = await signIn(department, admin);

            expect(outcome).toBe('signed-in');
            await expect.poll(() => flags.size, { message: 'FeatureToggles/GetAll loaded', timeout: 90_000 }).toBeGreaterThan(0);

            // A flag the server did not send is off to the app (unknown flags are disabled), so a missing one seeded on fails.
            const mismatches = Object.entries(department.flags.expected)
              .filter(([key, expected]) => expected.enabled !== null && (flags.get(key) ?? false) !== expected.enabled)
              .map(([key, expected]) => `${key}: app has ${flags.has(key) ? (flags.get(key) ? 'on' : 'off') : 'none (off)'}, seeded ${expected.enabled ? 'on' : 'off'} (${expected.source})`);

            expect(mismatches).toEqual([]);
            await page.waitForTimeout(SETTLE_MS);
          });

          test('flag-gated navigation follows the department flags', async ({ page, signIn, variantId }) => {
            const gated = flagGatedNav(variantId);

            test.skip(gated.length === 0, 'this app has no flag-gated navigation');
            test.skip(department.features.disabledModules.length > 0, 'module switches also hide entries here');
            expect((await signIn(department, admin)).outcome).toBe('signed-in');
            test.skip(!(await openMenu(page)), 'this app shows no navigation menu at this size');

            for (const entry of gated) {
              const expected = flagsExpected(department, entry.flags);

              if (expected === null) continue;
              const item = page.getByTestId(`nav-${entry.id}`);

              if (expected) await expect(item, `${entry.id} shows (${entry.flags.join(' + ')} on)`).toBeVisible();
              else await expect(item, `${entry.id} hidden (${entry.flags.join(' + ')} off)`).toHaveCount(0);
            }
          });
        }
      });
    }

    if (ssoOnly && ssoMember) {
      test('password sign-in is refused in an SSO-only department', async ({ signIn }) => {
        expect((await signIn(ssoOnly, ssoMember)).outcome).toBe('refused');
      });
    }

    if (mfaRequired && unenrolled) {
      test('a member without an authenticator is sent to MFA enrollment where MFA is required', async ({ signIn }) => {
        expect((await signIn(mfaRequired, unenrolled)).outcome).not.toBe('signed-in');
      });
    }
  });
}
