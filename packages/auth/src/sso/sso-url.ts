import { isDevelopmentBuild } from '../runtime/platform';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Whether an identity-provider or SAML start URL from discovery may be opened (Responder's `isValidSsoUrl`): https only;
 * plain http only to localhost in a development build (Responder allowed http to any host in dev). A malformed URL, a
 * custom scheme or `javascript:` is refused.
 */
export const isValidSsoUrl = (url: string | null | undefined, allowLocalHttp: boolean = isDevelopmentBuild()): boolean => {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') {
      return parsed.hostname.length > 0;
    }
    return allowLocalHttp && parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
};
