'use strict';
// The app:// protocol (Unit): serves the bundled web export so its absolute paths (/_expo/static/...) resolve, which
// file:// breaks. Path handling is the shared guard (url-guards.resolveBundleRequest: Dispatch's backslash rejection and
// root check, plus encoded tricks); HTML responses carry the CSP header. `protocol` and `net` are injected (no electron
// import), so this module is unit-tested.

const { pathToFileURL } = require('url');

const { resolveBundleRequest } = require('../core/url-guards');

const APP_SCHEME = 'app';

/** Must run before app `ready` (Electron requirement). */
function registerAppScheme(protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ]);
}

/**
 * @param {{ handle: Function }} protocol
 * @param {{ fetch: (url: string) => Promise<Response> }} net
 * @param {{ rootDir: string, host: string, csp: string, isFile?: (p: string) => boolean }} options
 */
function createAppProtocolHandler(net, { rootDir, host, csp, isFile }) {
  return async (request) => {
    let requestHost;
    try {
      requestHost = new URL(request.url).host;
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    // Only the app's own host: app://anything-else is not this bundle.
    if (requestHost !== host) {
      return new Response('Not Found', { status: 404 });
    }
    const result = resolveBundleRequest(rootDir, request.url, isFile ? { isFile } : {});
    if (result.status !== 200) {
      return new Response(result.status === 403 ? 'Forbidden' : result.status === 400 ? 'Bad Request' : 'Not Found', { status: result.status });
    }
    const response = await net.fetch(pathToFileURL(result.filePath).toString());
    if (!result.filePath.toLowerCase().endsWith('.html')) {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', csp);
    headers.set('Cache-Control', 'no-cache');
    return new Response(response.body, { status: response.status, headers });
  };
}

function registerAppProtocol(protocol, net, options) {
  protocol.handle(APP_SCHEME, createAppProtocolHandler(net, options));
}

module.exports = { APP_SCHEME, createAppProtocolHandler, registerAppProtocol, registerAppScheme };
