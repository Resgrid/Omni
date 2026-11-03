import { defineQaRegression } from '../qa/define-regression';
import { test } from '../support/qa-desktop-fixtures';

// Electron: the desktop shell (apps/desktop) serving this variant's web export, signed in to the seeded QA departments,
// with the same checks as the web suite. Run: E2E_QA_MANIFEST=<qa-departments.json> node scripts/ci/run-playwright.mjs
// test -c apps/omni/e2e/playwright.config.ts --project qa-desktop-unit
defineQaRegression(test);
