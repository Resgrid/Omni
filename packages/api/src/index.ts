// @resgrid/api — Resgrid Core v4 HTTP client, cached endpoints and endpoint functions (layer L2).
// Auth, base URL and storage are injected; nothing here imports a store or UI (omni-plan §5.2, §7.2).
export * from './core';
export * from './endpoints';
export { endpointDomains, endpointRegistry } from './registry';
