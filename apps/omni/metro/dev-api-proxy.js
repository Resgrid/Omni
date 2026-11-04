// The dev server's proxy to Resgrid servers for web development builds. A page on http://localhost:8081 is on no
// server's CORS allowlist, so the browser refuses every response (sign-in reports the server as unreachable). The app
// (`toDevProxyUrl`, @resgrid/core/env/dev-proxy) sends `<page>/__resgrid-dev-proxy/<scheme>/<host>/<path>` instead, and
// this middleware forwards it to `<scheme>://<host>/<path>`, streaming both ways. Expo's dev server drops WebSocket
// upgrades on paths it does not know, so SignalR uses Server-Sent Events or long polling through it. Only `expo start`
// mounts it: web exports, native builds and Electron's packaged app call the servers directly.
//
// Not an open proxy: a request must come from this machine (loopback address and Host header, which also stops DNS
// rebinding), from a page of this dev server (Origin and Sec-Fetch-Site), and go to https (http only to a server on this
// machine). The page's cookies are not forwarded and the server's are not returned.
const http = require('node:http');
const https = require('node:https');
const { pipeline } = require('node:stream');

const DEV_PROXY_PREFIX = '/__resgrid-dev-proxy/';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Hop-by-hop headers (RFC 9110 section 7.6.1) never cross a proxy, nor do the ones a Connection header names.
const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade'];
const DROPPED_REQUEST_HEADERS = new Set([...HOP_BY_HOP, 'host', 'origin', 'referer', 'cookie']);

// The page is same-origin with the proxy: the server's CORS headers mean nothing to it, HSTS must not pin localhost, and
// a challenge would open the browser's own sign-in dialog — the token endpoint's `invalid_client` (a server without the
// app's client_id, which the app retries without it) is a 401 with `WWW-Authenticate: Basic`. The app reads the status
// and body only.
const DROPPED_RESPONSE_HEADERS = new Set([...HOP_BY_HOP, 'set-cookie', 'strict-transport-security', 'www-authenticate']);

/** The header names a message's Connection header nominates as hop-by-hop, lower-cased. */
function nominatedHeaders(headers) {
  const connection = headers.connection;
  const values = Array.isArray(connection) ? connection : [connection ?? ''];

  return new Set(
    values
      .flatMap((value) => String(value).split(','))
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
  );
}

const hostnameOf = (host) => /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(host || '')?.[1]?.toLowerCase() ?? null;

/** `/__resgrid-dev-proxy/https/api.resgrid.com/api/v4/x?y` → the URL `https://api.resgrid.com/api/v4/x?y`, or null. */
function parseProxyTarget(requestUrl) {
  if (!requestUrl?.startsWith(DEV_PROXY_PREFIX)) return null;

  const match = /^(https?)\/([^/?#]+)(.*)$/.exec(requestUrl.slice(DEV_PROXY_PREFIX.length));

  if (!match) return null;

  const [, scheme, host, rest] = match;
  let target;

  try {
    target = new URL(`${scheme}://${host}${rest.startsWith('/') ? rest : `/${rest}`}`);
  } catch {
    return null;
  }

  // The host segment must be the whole host: no user info and nothing the URL parser reads differently.
  if (target.host !== host.toLowerCase() || target.username || target.password) return null;

  if (target.protocol === 'http:' && !LOOPBACK_HOSTNAMES.has(target.hostname)) return null;

  return target;
}

/** Why a request may not use the proxy, or null when it may. */
function refusalOf(req) {
  if (!LOOPBACK_ADDRESSES.has(req.socket?.remoteAddress)) return 'not from this machine';

  const host = req.headers.host;

  if (!LOOPBACK_HOSTNAMES.has(hostnameOf(host))) return 'not addressed to localhost';

  const origin = req.headers.origin;

  if (origin && origin !== `http://${host}` && origin !== `https://${host}`) return 'from another site';

  const site = req.headers['sec-fetch-site'];

  if (site && site !== 'same-origin' && site !== 'none') return 'from another site';

  return null;
}

/** A redirect to the server (or another one) stays on the proxy, so the page never leaves it for a CORS failure. */
function proxiedLocation(location, target) {
  let url;

  try {
    url = new URL(location, target);
  } catch {
    return location;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return location;

  return `${DEV_PROXY_PREFIX}${url.protocol.slice(0, -1)}/${url.host}${url.pathname}${url.search}`;
}

function forward(req, res, target, log) {
  const headers = {};
  const nominated = nominatedHeaders(req.headers);

  for (const [name, value] of Object.entries(req.headers)) {
    if (!DROPPED_REQUEST_HEADERS.has(name) && !nominated.has(name)) headers[name] = value;
  }

  headers.host = target.host;

  const transport = target.protocol === 'https:' ? https : http;

  const upstream = transport.request(target, { method: req.method, headers }, (upstreamRes) => {
    const responseHeaders = {};
    const nominatedResponse = nominatedHeaders(upstreamRes.headers);

    for (const [name, value] of Object.entries(upstreamRes.headers)) {
      if (DROPPED_RESPONSE_HEADERS.has(name) || nominatedResponse.has(name) || name.startsWith('access-control-')) continue;
      responseHeaders[name] = name === 'location' ? proxiedLocation(value, target) : value;
    }

    res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
    // Server-Sent Events: the headers go out now, not with the first event.
    res.flushHeaders();
    // pipeline, not pipe: a server that drops the body part-way (an event stream it closed) ends the page's response
    // too, so the page sees the disconnect and reconnects instead of waiting on a response that never ends.
    pipeline(upstreamRes, res, (error) => {
      if (error && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') log(`${req.method} ${target.host}: ${error.code || error.message}`);
    });
  });

  upstream.on('error', (error) => {
    log(`${req.method} ${target.host}: ${error.code || error.message}`);
    // No response, as when the browser cannot reach the server itself: sign-in reports it unreachable, not failing.
    res.destroy();
  });
  // The page went away (a closed event stream, an aborted request): stop the server's side too.
  res.on('close', () => {
    if (!res.writableFinished) upstream.destroy();
  });
  req.pipe(upstream);
}

/** The connect middleware: proxies `/__resgrid-dev-proxy/...` and hands every other request to `next`. */
function createDevApiProxy({ log = (message) => console.warn(`[resgrid-dev-proxy] ${message}`) } = {}) {
  return (req, res, next) => {
    if (!req.url?.startsWith(DEV_PROXY_PREFIX)) {
      next();

      return;
    }

    const refusal = refusalOf(req);

    if (refusal) {
      log(`refused a request ${refusal}`);
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');

      return;
    }

    const target = parseProxyTarget(req.url);

    if (!target) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Not a proxied server URL');

      return;
    }

    forward(req, res, target, log);
  };
}

/** Mounts the proxy in front of the dev server's other middleware (Sentry's included). */
function withDevApiProxy(config, options) {
  const previous = config.server?.enhanceMiddleware;
  const proxy = createDevApiProxy(options);

  return {
    ...config,
    server: {
      ...config.server,
      enhanceMiddleware: (middleware, server) => {
        const inner = previous ? previous(middleware, server) : middleware;

        return (req, res, next) => proxy(req, res, () => inner(req, res, next));
      },
    },
  };
}

module.exports = { DEV_PROXY_PREFIX, createDevApiProxy, parseProxyTarget, withDevApiProxy };
