import { registerStoreReset, type ResetReason } from '@resgrid/offline';

interface ResettableStore<S> {
  setState: (partial: Partial<S>) => void;
}

/**
 * Registers a domain store with the reset registry (Responder `registerStoreReset`): logout, auth
 * rejection, department/server switch and "Clear all local data" put it back to its initial state.
 * `beforeReset` bumps request generations so in-flight answers cannot repopulate the store.
 */
export function registerDataStoreReset<S>(name: string, store: ResettableStore<S>, initialState: () => Partial<S>, beforeReset?: (reason: ResetReason) => void): () => void {
  return registerStoreReset(`data.${name}`, (reason) => {
    beforeReset?.(reason);
    store.setState(initialState());
  });
}
