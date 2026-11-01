import { base64Encode } from '../util/bytes';

export interface ResolvedStreamSource {
  uri: string;
  headers?: Record<string, string>;
}

/** `scheme://userinfo@rest`, split at the LAST `@` before the path so an unencoded `@` in a password survives. */
const CREDENTIALED_URL = /^(https?:\/\/)([^/?#]*)@([\s\S]*)$/i;

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Moves inline `user:pass@` credentials out of a scanner stream URL into an `Authorization` header (Unit
 * audio-stream-store). iOS applies inline credentials itself; Android's ExoPlayer/OkHttp never sends them, so the relay
 * answers 401 and playback fails with a bare "Source error".
 */
export const resolveStreamSource = (url: string): ResolvedStreamSource => {
  const match = CREDENTIALED_URL.exec(url);
  if (!match) return { uri: url };
  const [, scheme, userInfo, rest] = match;
  if (!userInfo) return { uri: `${scheme}${rest}` };
  const separator = userInfo.indexOf(':');
  const username = decode(separator < 0 ? userInfo : userInfo.slice(0, separator));
  const password = separator < 0 ? '' : decode(userInfo.slice(separator + 1));
  return { uri: `${scheme}${rest}`, headers: { Authorization: `Basic ${base64Encode(`${username}:${password}`)}` } };
};

/** Stream URLs can carry credentials: never log or report one verbatim. */
export const redactStreamUrl = (url: string): string => url.replace(CREDENTIALED_URL, (_match, scheme: string, _userInfo: string, rest: string) => `${scheme}***@${rest}`);
