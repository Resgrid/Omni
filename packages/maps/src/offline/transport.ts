/**
 * The HTTP surface offline maps use: the global `fetch` matches it structurally; tests inject a fake. Requests go only
 * to the Resgrid server's signed URLs (manifest, packs) — never to a tile provider.
 */
export interface OfflineFetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type OfflineFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<OfflineFetchResponse>;

export const defaultOfflineFetch: OfflineFetch = (url, init) => fetch(url, init);

export interface RangeResponse {
  status: number;
  bytes: Uint8Array;
  /** Parsed `Content-Range: bytes start-end/total`, when present. */
  range: { start: number; end: number; total: number | null } | null;
}

/** Parses `bytes 0-1023/4096` (total may be `*`). */
export const parseContentRange = (value: string | null): RangeResponse['range'] => {
  const match = value ? /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value.trim()) : null;
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]), total: match[3] === '*' ? null : Number(match[3]) };
};

/**
 * One `Range` request (inclusive `end`). Identity encoding so byte offsets match the file the manifest hashed.
 * Non-2xx responses resolve with an empty body (the caller decides); network failures and aborts reject.
 */
export async function fetchRange(fetchImpl: OfflineFetch, url: string, start: number, end: number, signal?: AbortSignal): Promise<RangeResponse> {
  const response = await fetchImpl(url, { method: 'GET', headers: { Range: `bytes=${start}-${end}`, 'Accept-Encoding': 'identity' }, signal });
  if (response.status !== 200 && response.status !== 206) {
    return { status: response.status, bytes: new Uint8Array(0), range: null };
  }
  const buffer = await response.arrayBuffer();
  return { status: response.status, bytes: new Uint8Array(buffer), range: parseContentRange(response.headers.get('Content-Range')) };
}
