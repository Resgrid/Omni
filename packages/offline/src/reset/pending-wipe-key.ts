/**
 * A wipe the app did not live through. Sign-out ends the session at once, but its wipe waits for the work that must still
 * reach the server as the ending session (push unregister, up to `SIGN_OUT_HOOK_TIMEOUT_MS`), and the wipe's own teardowns
 * are awaited too. An app killed in that window kept every persisted store (`calls-storage`, the `omni-*-storage` stores,
 * rights, the active unit and call…) and the next launch rehydrated them before anyone signed in.
 *
 * So the wipe is marked pending before anything is awaited and the mark is removed once the wipe is complete;
 * `initOffline()` finishes a marked wipe before anything reads storage. Every wipe keeps the mark: only its owner removes
 * it. Storage identity: the key lives in the variant's main instance and is never renamed.
 */
export const PENDING_WIPE_KEY = 'resgrid.offline.pendingWipe';
