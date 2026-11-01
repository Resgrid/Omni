/**
 * The always-mounted Novu provider (Responder's fix) and the hooks that feed it.
 *
 * Config and rights land a moment after a cold start. Rendering the provider only once they did swapped the tree
 * between "bare content" and "content wrapped in a provider", which unmounted and remounted every screen seconds into
 * each launch. The provider is therefore rendered from the start with placeholder credentials and Novu rebuilds its
 * client when the real ones arrive. Inbox UI must render only when `config.ready` (it would fetch against the
 * placeholder client otherwise).
 */
import { NovuProvider } from '@novu/react-native';
import { type ApiContext, ApiError, getUnitSubscriberHash } from '@resgrid/api';
import { logger } from '@resgrid/core';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { getNotificationsDependencies, getPushSubjectKind, type NotificationsSession, type PushSubjectKind } from './configure';
import { openNotification } from './deep-links';
import { type NovuInboxConfig, type NovuInboxItemLike, type NovuServerConfig, resolveNovuInboxConfig } from './novu';

/** First retry delay for a hash lookup that failed without an answer; each later one doubles, up to the max (Unit). */
export const SUBSCRIBER_HASH_RETRY_BASE_DELAY_MS = 2000;
export const SUBSCRIBER_HASH_RETRY_MAX_DELAY_MS = 5 * 60 * 1000;
/** Failed lookups before the inbox opens without a hash anyway; the retries carry on behind it. */
export const SUBSCRIBER_HASH_ATTEMPTS_BEFORE_SETTLING = 3;

/** The server answered and asking again cannot change that (older server without the endpoint, or a refusal). */
const isDefinitiveFailure = (error: unknown): boolean => {
  const status = error instanceof ApiError ? error.status : undefined;
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
};

/**
 * The Novu subscriberHash for a unit's inbox (Unit). `settled` turns true once the lookup has an outcome; a definitive
 * failure settles without a hash at once, one without an answer retries with backoff and settles after a few tries.
 */
export const useUnitSubscriberHash = (unitId: string | null | undefined): { settled: boolean; subscriberHash: string | undefined } => {
  const [fetched, setFetched] = useState<{ unitId: string; hash?: string } | null>(null);

  useEffect(() => {
    if (!unitId) {
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const attempt = (failures: number): void => {
      let ctx: ApiContext;
      try {
        ctx = getNotificationsDependencies().getApiContext();
      } catch (error) {
        logger.warn({ message: 'Unit inbox hash: notifications are not configured', context: { error } });
        setFetched({ unitId });
        return;
      }
      getUnitSubscriberHash(ctx, { unitId })
        .then((result) => {
          if (!cancelled) {
            setFetched({ unitId, ...(result?.Data?.SubscriberHash ? { hash: result.Data.SubscriberHash } : {}) });
          }
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          const failed = failures + 1;
          const definitive = isDefinitiveFailure(error);
          logger.warn({ message: 'Could not fetch the unit inbox subscriber hash', context: { attempt: failed, willRetry: !definitive } });
          if (definitive || failed === SUBSCRIBER_HASH_ATTEMPTS_BEFORE_SETTLING) {
            setFetched((previous) => (previous?.unitId === unitId && previous.hash ? previous : { unitId }));
          }
          if (!definitive) {
            retryTimer = setTimeout(() => attempt(failed), Math.min(SUBSCRIBER_HASH_RETRY_BASE_DELAY_MS * 2 ** failures, SUBSCRIBER_HASH_RETRY_MAX_DELAY_MS));
          }
        });
    };

    attempt(0);
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [unitId]);

  const settled = !!unitId && fetched?.unitId === unitId;
  return { settled, subscriberHash: settled ? fetched?.hash : undefined };
};

export interface UseNovuInboxConfigInput {
  session: NotificationsSession | null;
  config: NovuServerConfig | null | undefined;
  /** Unit only: the active unit. */
  unitId?: string | null;
  isWeb?: boolean;
  /** Novu on web/Electron (default true). */
  enableOnWeb?: boolean;
  /** Defaults to the variant manifest's push subject. */
  subject?: PushSubjectKind;
}

/**
 * The provider config for the variant, keeping the last known-good credentials while a refresh briefly drops them
 * (Unit), so the provider never flips back to placeholders mid-session. A different subscriber replaces them.
 */
export const useNovuInboxConfig = (input: UseNovuInboxConfigInput): NovuInboxConfig => {
  const subject = input.subject ?? getPushSubjectKind();
  const unitHash = useUnitSubscriberHash(subject === 'unit' ? input.unitId : null);
  const resolved = resolveNovuInboxConfig({
    subject,
    session: input.session,
    unitId: input.unitId ?? null,
    unitSubscriberHash: unitHash.subscriberHash ?? null,
    unitHashSettled: unitHash.settled,
    config: input.config,
    ...(input.isWeb === undefined ? {} : { isWeb: input.isWeb }),
    ...(input.enableOnWeb === undefined ? {} : { enableOnWeb: input.enableOnWeb }),
  });
  const lastReady = useRef<NovuInboxConfig | null>(null);
  if (resolved.ready) {
    lastReady.current = resolved;
  }
  // Signed out: forget the previous subscriber rather than keep showing their inbox.
  if (!input.session) {
    lastReady.current = null;
  }
  return resolved.ready ? resolved : (lastReady.current ?? resolved);
};

export interface NotificationsInboxProviderProps {
  config: NovuInboxConfig;
  children?: ReactNode;
  /** False renders the children without Novu (variant turned Novu off on this platform). */
  enabled?: boolean;
}

/** Always-mounted Novu provider; placeholder credentials until `config.ready`. */
export function NotificationsInboxProvider({ config, children, enabled = true }: NotificationsInboxProviderProps): ReactNode {
  if (!enabled) {
    return children ?? null;
  }
  return (
    <NovuProvider
      subscriber={config.subscriberId}
      {...(config.subscriberHash ? { subscriberHash: config.subscriberHash } : {})}
      applicationIdentifier={config.applicationIdentifier}
      apiUrl={config.apiUrl}
      socketUrl={config.socketUrl}
    >
      {children}
    </NovuProvider>
  );
}

/** Opens an inbox item like a tapped push (deep link to its target, else the push modal). */
export async function openInboxItem(item: NovuInboxItemLike & { subject?: string | null; body?: string | null }): Promise<boolean> {
  const data = item.data;
  const eventCode = data && typeof data === 'object' ? (data.eventCode ?? data.eventId) : undefined;
  if (typeof eventCode !== 'string' || !eventCode) {
    return false;
  }
  return openNotification({
    eventCode,
    data: data ?? {},
    ...(item.subject ? { title: item.subject } : {}),
    ...(item.body ? { body: item.body } : {}),
  });
}
