import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Base page object shared by the web and Electron suites (both run the same web bundle). React Native Web renders
 * `testID` as `data-testid`, so screens are located by the testIDs the components already carry.
 */
export class AppPage {
  constructor(readonly page: Page) {}

  byTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  /** Navigates (web only — Electron opens its own start URL) and waits for React to mount. */
  async open(route = '/'): Promise<void> {
    await this.page.goto(route);
    await this.waitForBoot();
  }

  /** The Expo web shell renders into #root; it is empty until the bundle has mounted the app. */
  async waitForBoot(): Promise<void> {
    await expect(this.page.locator('#root')).not.toBeEmpty();
  }
}
