import { expect, type Locator } from '@playwright/test';

import { AppPage } from './app-page';

/** The sign-in screen from @resgrid/features/auth-ui, shown by the ShellGate to a signed-out install. */
export class LoginPage extends AppPage {
  get screen(): Locator {
    return this.byTestId('login-screen');
  }

  get username(): Locator {
    return this.byTestId('login-username');
  }

  get password(): Locator {
    return this.byTestId('login-password');
  }

  get submit(): Locator {
    return this.byTestId('login-submit');
  }

  async expectForm(): Promise<void> {
    await expect(this.screen).toBeVisible();
    await expect(this.username).toBeVisible();
    await expect(this.password).toBeVisible();
    await expect(this.submit).toBeEnabled();
  }
}
