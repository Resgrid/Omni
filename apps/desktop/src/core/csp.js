'use strict';
// Content-Security-Policy for the app window (Dispatch's session.webRequest CSP, tightened). No electron import
// (unit-tested).
//
// Production: scripts only from the app origin; network to https/wss only (AGENTS.md: server URLs are https, http only to
// localhost in development); MapLibre's module worker from the app origin (the web export ships maplibre-gl-worker.js)
// with blob: for its cross-origin fallback, map styles, tiles, glyphs and sprites over https; no plugins, no foreign <base>
// or form targets.
// Development: additionally the Expo dev server (HMR over ws:, 'unsafe-eval' for Metro's dev runtime) and plain http to
// loopback servers.

const LOOPBACK_HTTP = ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*'];

/**
 * @param {{ appOrigins: string[], devServerOrigin?: string | null }} options
 *   appOrigins: the origins the app is served from (e.g. `app://bundle`, `http://127.0.0.1:29317`).
 *   devServerOrigin: the Expo dev server origin in development, else null.
 * @returns {string}
 */
function buildContentSecurityPolicy({ appOrigins, devServerOrigin = null }) {
  if (!Array.isArray(appOrigins) || appOrigins.length === 0) {
    throw new Error('buildContentSecurityPolicy: at least one app origin is required.');
  }
  for (const origin of [...appOrigins, ...(devServerOrigin ? [devServerOrigin] : [])]) {
    if (!/^[a-z][a-z0-9+.-]*:\/\/[^\s;,'"]+$/i.test(origin)) {
      throw new Error(`buildContentSecurityPolicy: invalid origin "${origin}".`);
    }
  }

  const dev = Boolean(devServerOrigin);
  // 'self' already covers the page's own origin; listing it again only helps when the host is a valid CSP host-source.
  // Dispatch's legacy origin app://. is not (Chromium warns and ignores it), so it is left to 'self'.
  const listed = appOrigins.filter((origin) => !origin.endsWith('://.'));
  const self = ["'self'", ...listed, ...(dev ? [devServerOrigin] : [])];

  const directives = [
    ['default-src', self],
    ['script-src', [...self, "'unsafe-inline'", "'wasm-unsafe-eval'", ...(dev ? ["'unsafe-eval'"] : [])]],
    ['style-src', [...self, "'unsafe-inline'"]],
    ['img-src', [...self, 'data:', 'blob:', 'https:', ...(dev ? ['http:'] : [])]],
    ['font-src', [...self, 'data:']],
    ['connect-src', [...self, 'https:', 'wss:', 'data:', 'blob:', ...(dev ? LOOPBACK_HTTP : [])]],
    ['media-src', [...self, 'data:', 'blob:', 'https:']],
    ['worker-src', ["'self'", ...listed, 'blob:']],
    ['child-src', ["'self'", ...listed, 'blob:']],
    ['frame-src', ["'self'", ...listed, 'https:', 'blob:']],
    ['manifest-src', self],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
  ];

  return directives.map(([name, values]) => `${name} ${Array.from(new Set(values)).join(' ')}`).join('; ');
}

module.exports = { buildContentSecurityPolicy };
