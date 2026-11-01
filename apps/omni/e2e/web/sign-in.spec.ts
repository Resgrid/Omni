import { LoginPage } from '../pages/login-page';
import { expect, test } from '../support/web-fixtures';

// A fresh browser profile is signed out, so every web variant opens on the real sign-in screen (registered by
// apps/omni/shell-registrations.tsx), not the shell's built-in fallback. Nothing here reaches a server.

test.describe('sign in', () => {
  test('shows the sign-in form for this app', async ({ page, manifest }) => {
    const login = new LoginPage(page);
    await login.open();
    await login.expectForm();
    await expect(login.screen.getByText(manifest.identity.name, { exact: true }).first()).toBeVisible();
  });

  test('validates an empty form without sending it', async ({ page }) => {
    const login = new LoginPage(page);
    await login.open();
    await login.expectForm();

    const tokenRequests: string[] = [];
    page.on('request', (request) => {
      if (/\/connect\/token|\/api\/v4\//i.test(request.url())) tokenRequests.push(request.url());
    });
    await login.submit.click();
    await expect(login.byTestId('login-username-error')).toBeVisible();
    await expect(login.byTestId('login-password-error')).toBeVisible();
    expect(tokenRequests, 'no auth or API request for an invalid form').toEqual([]);
  });
});
