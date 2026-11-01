// @resgrid/core (layer L1) — platform core shared by all five apps (omni-plan §5.2, §7.1).
// Imports only @resgrid/config among Omni packages; never stores, UI, or higher layers.

export * from './analytics/analytics-service';
export type { AnalyticsEventProperties, CountlyClient } from './analytics/types';
export { isDev, isJest } from './dev';
export * from './env/env';
export * from './lifecycle/app-lifecycle';
export * from './logging/logger';
export * from './logging/sanitize';
export * from './logging/types';
export * from './navigation/router';
export * from './platform/platform';
export * from './sentry/filters';
export * from './sentry/sentry';
export * from './utils/dates';
export * from './utils/keep-alive';
export * from './utils/request-errors';
export * from './utils/route-ids';
export * from './utils/single-flight';
