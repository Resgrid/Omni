import { isDev } from '../dev';
import { isWeb } from '../platform/platform';

/**
 * Web development builds reach Resgrid servers through the Expo dev server (`apps/omni/metro/dev-api-proxy.js`): a page
 * on http://localhost:8081 is on no server's CORS allowlist, so the browser would refuse every response and sign-in
 * would report the server as unreachable. The dev server forwards `<page>/__resgrid-dev-proxy/<scheme>/<host>/<path>` to
 * `<scheme>://<host>/<path>`. Native builds, web exports (Docker) and Electron's packaged app call servers directly.
 */
export const DEV_PROXY_PREFIX = '/__resgrid-dev-proxy';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** `url` as the proxy path on `pageOrigin`; `url` itself when it is not an absolute http(s) URL or is already on the page's origin. */
export const buildDevProxyUrl = (pageOrigin: string, url: string): string => {
  const match = /^(https?):\/\/([^/?#]+)(.*)$/i.exec(url.trim());

  if (!match) return url;

  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  const rest = match[3];

  if (`${scheme}://${host}` === pageOrigin.toLowerCase()) return url;

  return `${pageOrigin}${DEV_PROXY_PREFIX}/${scheme}/${host}${rest.startsWith('/') ? rest : `/${rest}`}`;
};

// The page's origin when this is a web development build opened on this machine (the proxy refuses anyone else).
const proxyPageOrigin = (): string | null => {
  if (!isDev() || !isWeb() || typeof window === 'undefined' || !window?.location) return null;

  const { hostname, origin } = window.location;

  return LOOPBACK_HOSTS.has(hostname) ? origin : null;
};

/** Whether server requests go through the dev server (web development build on localhost). */
export const isDevProxyActive = (): boolean => proxyPageOrigin() !== null;

/** The URL to request a Resgrid server URL at: through the dev server's proxy in a web development build, unchanged elsewhere. */
export const toDevProxyUrl = (url: string): string => {
  const pageOrigin = proxyPageOrigin();

  return pageOrigin ? buildDevProxyUrl(pageOrigin, url) : url;
};
