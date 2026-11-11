import type { ApiContext } from '@resgrid/api';
import type { VariantManifest } from '@resgrid/config';
import type { DurableKv } from '@resgrid/offline';

import { useChatStore } from './chat/chat-store';
import { setDataStorage } from './core/persist';
import { startQueuedMarkerReconciliation } from './core/queued-markers';
import {
  type DataLocationFix,
  type DataLogger,
  type DataOutbox,
  type DataSessionScope,
  setDataApiContext,
  setDataLocationProvider,
  setDataLogger,
  setDataOutbox,
  setDataSessionScopeProvider,
  setDataVariant,
} from './core/runtime';
import { type HandlerRegistryLike, type HydrationRegistryLike, registerDataHydrationSteps, registerDataOutboxHandlers } from './offline-scope/register';

export interface ConfigureDataOptions {
  manifest: VariantManifest;
  api: ApiContext;
  /** Signed-in session (server + department + user + unit), or null while signed out. */
  getSession: () => DataSessionScope | null;
  /** `runtime.outbox` from `initOffline()`. */
  outbox: DataOutbox;
  /** `runtime.storage.main` from `initOffline()`: persisted stores rehydrate from it. */
  storage: DurableKv;
  /** `runtime.sync` from `initOffline()`: receives the variant's hydration steps. */
  sync?: HydrationRegistryLike;
  /** Defaults to the process-wide outbox handler registry. */
  handlerRegistry?: HandlerRegistryLike;
  logger?: DataLogger;
  getLocation?: () => DataLocationFix | null;
}

/**
 * App-shell composition for @resgrid/data (after `initOffline()`, before the first screen reads a store):
 * injects the API context, session, outbox and logger, rehydrates persisted stores, registers the
 * variant's outbox handlers and hydration steps. Returns a disposer.
 */
export async function configureData(options: ConfigureDataOptions): Promise<() => void> {
  setDataVariant(options.manifest);
  setDataApiContext(options.api);
  setDataSessionScopeProvider(options.getSession);
  setDataOutbox(options.outbox);
  setDataLogger(options.logger ?? null);
  setDataLocationProvider(options.getLocation ?? null);
  // Handlers must exist before rehydration can surface queued work, and before the outbox drains.
  const disposeHandlers = registerDataOutboxHandlers(options.manifest, options.handlerRegistry);
  const disposeSteps = options.sync ? registerDataHydrationSteps(options.sync, options.manifest) : () => undefined;
  await setDataStorage(options.storage);
  // Legacy `chat-outbox-storage` items move into the durable outbox once, keeping their ClientMessageId.
  await useChatStore.getState().importLegacyOutbox();
  // Rehydrated "Pending sync" markers whose write this device's outbox no longer holds are cleared now and after every
  // outbox change (another tab's markers, an expired event, a close between delivery and the marker's save).
  const disposeReconciliation = startQueuedMarkerReconciliation();
  return () => {
    disposeReconciliation();
    disposeSteps();
    disposeHandlers();
  };
}
