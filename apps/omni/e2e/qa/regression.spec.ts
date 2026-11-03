import { test } from '../support/qa-fixtures';
import { defineQaRegression } from './define-regression';

// Web: the variant's web export served locally, signed in to the seeded QA departments. Run:
// E2E_QA_MANIFEST=<qa-departments.json> E2E_WEB_PORT=19300 node scripts/ci/run-playwright.mjs test -c apps/omni/e2e/playwright.config.ts --project qa-unit
defineQaRegression(test);
