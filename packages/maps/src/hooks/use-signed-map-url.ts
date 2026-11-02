import { useEffect, useMemo, useState } from 'react';

import { useMapServices } from '../provider/context';
import type { SignedMapUrl } from '../provider/url-signer';

/** setTimeout's ceiling (~24.8 days); later renewals wait for the next run. */
const MAX_TIMER_MS = 2_147_483_647;
/** Never renew more often than this (a refused URL or a very short signature must not spin). */
const MIN_RENEW_MS = 5_000;

const urlKey = (urls: readonly (string | null | undefined)[]): string => urls.map((url) => (typeof url === 'string' ? url.trim() : '')).join('\n');

/**
 * Signed versions of server-hosted map resource URLs (D12) for map sources, in the same order: each entry is the signed
 * URL, or null while it is being signed and when it cannot be signed (never the unsigned URL). Re-signed while
 * mounted before the signature expires, so a long-lived map keeps loading tiles.
 */
export function useSignedMapUrls(urls: readonly (string | null | undefined)[]): (string | null)[] {
  const { urlSigner } = useMapServices();
  const key = urlKey(urls);
  // The key is the joined, trimmed URL list; it changes exactly when the list does.
  const wanted = useMemo(() => key.split('\n'), [key]);
  const [signed, setSigned] = useState<Record<string, string | null>>({});
  const [renewal, setRenewal] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending = wanted.filter((url) => url.length > 0);
    if (pending.length === 0) return undefined;
    // A signer that throws counts as "cannot sign" for now and is asked again a minute later.
    const signOne = (url: string) => urlSigner.sign(url).catch((): SignedMapUrl => ({ url: null, refreshAt: Date.now() + 60_000 }));
    void Promise.all(pending.map((url) => signOne(url).then((entry) => [url, entry] as const))).then((entries) => {
      if (!active) return;
      setSigned((previous) => {
        const next: Record<string, string | null> = {};
        for (const [url, entry] of entries) next[url] = entry.url;
        const unchanged = Object.keys(next).length === Object.keys(previous).length && entries.every(([url, entry]) => previous[url] === entry.url);
        return unchanged ? previous : next;
      });
      const soonest = Math.min(...entries.map(([, entry]) => entry.refreshAt));
      if (Number.isFinite(soonest)) {
        timer = setTimeout(() => setRenewal((value) => value + 1), Math.min(Math.max(soonest - Date.now(), MIN_RENEW_MS), MAX_TIMER_MS));
      }
    });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [urlSigner, wanted, renewal]);

  return useMemo(
    () =>
      wanted.map((url) => {
        if (!url) return null;
        if (url in signed) return signed[url];
        // First render (or a list change): a still-fresh cached signature draws at once.
        return urlSigner.peek(url)?.url ?? null;
      }),
    [signed, urlSigner, wanted]
  );
}

/** One signed map resource URL (see `useSignedMapUrls`); null while signing or when it cannot be signed. */
export function useSignedMapUrl(url: string | null | undefined): string | null {
  return useSignedMapUrls([url])[0] ?? null;
}
