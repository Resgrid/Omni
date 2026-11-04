import { isDev } from '@resgrid/core/dev';

/** Attachment links are HTTPS, with loopback HTTP allowed for a development server. */
export function getCallFileUrl(value: string | null | undefined, allowLocalHttp = isDev()): string | null {
  const candidate = value?.trim();

  if (!candidate) return null;

  try {
    const url = new URL(candidate);

    if (url.username || url.password) return null;

    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';

    return url.protocol === 'https:' || (allowLocalHttp && url.protocol === 'http:' && loopback) ? candidate : null;
  } catch {
    return null;
  }
}
