import { createHash } from 'node:crypto';

import type { OfflineFetch, OfflineFetchResponse } from '../transport';

export const API_BASE = 'https://api.resgrid.test/api/v4';
export const MANIFEST_URL = 'https://api.resgrid.test/api/v4/Mapping/GetOfflineManifest?sig=signed-token';
export const packUrl = (id: string, sig = 's1'): string => `https://api.resgrid.test/api/v4/Mapping/GetOfflinePack/${id}?sig=${sig}`;

/** Deterministic pseudo-random bytes. */
export const bytesOf = (length: number, seed = 1): Uint8Array => {
  const bytes = new Uint8Array(length);
  let state = seed * 2654435761;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) >>> 0;
    bytes[i] = state >>> 24;
  }
  return bytes;
};

export const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

interface ServedFile {
  body?: Uint8Array;
  json?: unknown;
  status?: number;
  /** Respond 200 with the full body even to Range requests. */
  ignoreRange?: boolean;
  /** Throw a network error for ranges starting at or after this offset. */
  failFrom?: number;
}

const response = (status: number, body: Uint8Array, headers: Record<string, string> = {}, json?: unknown): OfflineFetchResponse => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  json: async () => {
    if (json === undefined) throw new SyntaxError('Unexpected token');
    return json;
  },
  arrayBuffer: async () => body.slice().buffer,
});

/** A fake Resgrid server for `fetch`: JSON documents and Range-capable files, with request recording. */
export function createFakeServer() {
  const files = new Map<string, ServedFile>();
  const requests: { url: string; range: string | null }[] = [];

  const fetchImpl: OfflineFetch = async (url, init) => {
    requests.push({ url, range: init?.headers?.Range ?? null });
    if (init?.signal?.aborted) {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      throw error;
    }
    const file = files.get(url);
    if (!file) return response(404, new Uint8Array(0));
    if (file.status !== undefined && file.status !== 200) return response(file.status, new Uint8Array(0));
    if (file.json !== undefined) return response(200, new Uint8Array(0), {}, file.json);
    const body = file.body ?? new Uint8Array(0);
    const range = init?.headers?.Range ? /^bytes=(\d+)-(\d+)$/.exec(init.headers.Range) : null;
    if (!range || file.ignoreRange) {
      if (file.failFrom !== undefined) throw new TypeError('Network request failed');
      return response(200, body, { 'content-length': String(body.length) });
    }
    const start = Number(range[1]);
    const end = Math.min(Number(range[2]), body.length - 1);
    if (file.failFrom !== undefined && start >= file.failFrom) throw new TypeError('Network request failed');
    if (start >= body.length) return response(416, new Uint8Array(0), { 'content-range': `bytes */${body.length}` });
    return response(206, body.slice(start, end + 1), { 'content-range': `bytes ${start}-${end}/${body.length}` });
  };

  return {
    files,
    requests,
    fetchImpl,
    serveJson: (url: string, json: unknown) => files.set(url, { json }),
    serveFile: (url: string, body: Uint8Array, options: Omit<ServedFile, 'body' | 'json'> = {}) => files.set(url, { body, ...options }),
    requestsFor: (url: string) => requests.filter((request) => request.url === url),
  };
}

export const packEntry = (options: {
  id: string;
  kind?: number;
  body: Uint8Array;
  version?: string;
  name?: string;
  status?: number;
  url?: string | null;
  sizeBytes?: number;
  sha256?: string | null;
  layerId?: string;
}) => ({
  PackId: options.id,
  Kind: options.kind ?? 0,
  Name: options.name ?? `Area ${options.id}`,
  PackKey: `key-${options.id}`,
  Bounds: [-121.9, 38.4, -121.5, 38.8],
  MinZoom: 0,
  MaxZoom: 15,
  SizeBytes: options.sizeBytes ?? options.body.length,
  Sha256: options.sha256 === undefined ? sha(options.body) : options.sha256,
  Version: options.version ?? 'v1',
  Status: options.status ?? 2,
  DownloadUrl: options.url === undefined ? packUrl(options.id) : options.url,
  ExpiresUtc: null,
  CustomMapLayerId: options.layerId ?? null,
});
