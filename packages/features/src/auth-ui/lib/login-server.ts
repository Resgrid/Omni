import { findLocationByUrl, getBaseApiUrl, registerServerChangeListener, RESGRID_HOSTED_LOCATIONS } from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';
import { useMemo, useSyncExternalStore } from 'react';

/** Which server a sign-in goes to, as the login form labels it (Responder `lib/login-server.ts`). */
export type LoginServerKind = 'us_west' | 'eu_central' | 'custom';

export interface LoginServer {
  kind: LoginServerKind;
  /** The server's host name, shown beside "Custom" so a self-hosted or test server is recognizable. */
  host: string;
  apiUrl: string;
}

const HOSTED_KINDS: Record<string, Exclude<LoginServerKind, 'custom'>> = { 'US-West': 'us_west', 'EU-Central': 'eu_central' };

// RN's URL polyfill does not implement hostname, so the host is read from the address directly.
const hostOf = (url: string): string => /^[a-z][a-z\d+.-]*:\/\/([^/?#]+)/i.exec(url.trim())?.[1]?.toLowerCase() ?? url.trim();

/** Names the server behind an API URL (with or without the /api/vX suffix): a Resgrid hosted site, or a custom one. */
export const describeLoginServer = (apiUrl: string): LoginServer => {
  const hosted = findLocationByUrl(RESGRID_HOSTED_LOCATIONS, apiUrl);
  return { kind: (hosted ? HOSTED_KINDS[hosted.Name] : undefined) ?? 'custom', host: hostOf(apiUrl), apiUrl };
};

// The stored server has no store of its own: a switch (switchServer) notifies the registered listeners, and the sheet
// calls notifyLoginServerChanged() after a save so an unchanged URL re-renders too.
let version = 0;
const listeners = new Set<() => void>();
let unregister: (() => void) | null = null;

export const notifyLoginServerChanged = (): void => {
  version += 1;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  unregister ??= registerServerChangeListener(() => notifyLoginServerChanged());
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unregister) {
      unregister();
      unregister = null;
    }
  };
};

const getVersion = (): number => version;

/** The server this device signs in to and its display name ("US West", "EU Central" or "Custom (host)"). */
export const useLoginServer = (): LoginServer & { name: string } => {
  const { t } = useTranslation();
  const current = useSyncExternalStore(subscribe, getVersion, getVersion);
  return useMemo(() => {
    const server = describeLoginServer(getBaseApiUrl());
    const name = server.kind === 'custom' ? t('login.server.custom_host', { host: server.host }) : t(`login.server.${server.kind}`);
    return { ...server, name };
    // `current` re-reads the stored server after a switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, current]);
};
