'use strict';
// URL and origin guards for the main process (Dispatch's hardening + IC's external links). No electron import
// (unit-tested). Everything here fails closed: a value that does not parse cleanly is refused.

const path = require('path');

const MAX_URL_LENGTH = 8192;

/**
 * `scheme://host[:port]`, lowercased — also for custom schemes such as app://, where WHATWG `URL.origin` is "null".
 * Null for anything unparseable, with credentials, or with a backslash (Windows separator tricks).
 * @param {unknown} value
 * @returns {string | null}
 */
function originOf(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH || value.includes('\\')) {
    return null;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || !url.host) {
    return null;
  }
  return `${url.protocol}//${url.host}`.toLowerCase();
}

/**
 * Whether the window may navigate to `target`: only to one of the app's own origins (app://<host>, BigBoard's loopback
 * origin, or the dev server in development). Everything else is refused; links leave through the OS browser instead.
 * @param {unknown} target
 * @param {string[]} allowedOrigins
 */
function isAllowedNavigation(target, allowedOrigins) {
  const origin = originOf(target);
  return origin !== null && allowedOrigins.map((o) => o.toLowerCase()).includes(origin);
}

/**
 * The URL to hand to the OS browser, or null. Only http(s) leaves the app: other schemes (file:, javascript:, custom
 * protocols, smb:) are refused, because a crafted link inside rendered content (a call note, a chat message) could
 * otherwise reach an OS handler. Credentials in the URL (`https://bank.com@evil.com`) are refused too.
 * @param {unknown} value
 * @returns {string | null}
 */
function safeExternalUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH || !/^https?:\/\//i.test(value) || value.includes('\\')) {
    return null;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || !url.hostname) {
    return null;
  }
  return url.href;
}

function isSafeExternalUrl(value) {
  return safeExternalUrl(value) !== null;
}

/**
 * Maps a request for the bundled web export (app:// or the BigBoard loopback server) to a file inside `rootDir`.
 *
 * - backslashes and NUL bytes (raw or percent-encoded) are refused (403), as are malformed escapes (400);
 * - `..` segments cannot leave the root (resolved, then checked against the root);
 * - a path that names no file falls back to index.html when it looks like a route (no extension) and is a 404 when it
 *   looks like an asset, so a missing script is never answered with HTML.
 *
 * @param {string} rootDir absolute path of the web export
 * @param {string} requestUrl full request URL
 * @param {{ isFile?: (filePath: string) => boolean }} [options]
 * @returns {{ status: 200, filePath: string, fallback: boolean } | { status: 400 | 403 | 404 }}
 */
function resolveBundleRequest(rootDir, requestUrl, options = {}) {
  const isFile = options.isFile || defaultIsFile;
  const root = path.resolve(rootDir);
  const indexFile = path.join(root, 'index.html');

  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return { status: 400 };
  }
  if (requestUrl.includes('\\')) {
    return { status: 403 };
  }

  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return { status: 400 };
  }
  if (decoded.includes('\\') || decoded.includes('\0')) {
    return { status: 403 };
  }

  // A drive letter or stream name (C:, file.js:stream) never names a file in the export.
  if (decoded.includes(':')) {
    return path.extname(decoded) ? { status: 404 } : { status: 200, filePath: indexFile, fallback: true };
  }

  const relative = path.posix.normalize(`/${decoded}`).replace(/^\/+/, '');
  if (relative === '' || relative === '.') {
    return { status: 200, filePath: indexFile, fallback: false };
  }

  const resolved = path.resolve(root, ...relative.split('/'));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return { status: 403 };
  }

  if (isFile(resolved)) {
    return { status: 200, filePath: resolved, fallback: false };
  }
  if (path.posix.extname(relative) === '') {
    return { status: 200, filePath: indexFile, fallback: true };
  }
  return { status: 404 };
}

function defaultIsFile(filePath) {
  try {
    return require('fs').statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** Web permissions the app may use (notifications, PTT microphone, map location, clipboard); anything else is denied. */
const ALLOWED_PERMISSIONS = new Set(['notifications', 'media', 'geolocation', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'speaker-selection']);

/**
 * @param {string} permission Electron permission name
 * @param {unknown} requestingUrl
 * @param {string[]} allowedOrigins
 */
function isPermissionAllowed(permission, requestingUrl, allowedOrigins) {
  return ALLOWED_PERMISSIONS.has(permission) && isAllowedNavigation(requestingUrl, allowedOrigins);
}

/**
 * An http(s) URL on this computer's loopback, used for the Expo dev server in development. Null for anything else, so
 * an environment variable can never point the window at a remote page.
 * @param {unknown} value
 */
function safeDevServerUrl(value) {
  if (typeof value !== 'string' || value.includes('\\')) {
    return null;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !loopback || url.username || url.password) {
    return null;
  }
  return url.href;
}

module.exports = {
  ALLOWED_PERMISSIONS,
  isAllowedNavigation,
  isPermissionAllowed,
  isSafeExternalUrl,
  originOf,
  resolveBundleRequest,
  safeDevServerUrl,
  safeExternalUrl,
};
