/**
 * The native push registration, kept on the device (IC baseline): a sign-out after a restart — before this run has
 * registered again, or when it cannot — still takes the token off the server.
 *
 * `nativePushRegistration` is the key IC's store builds write (JSON). It is part of the frozen storage contract
 * (AGENTS.md): never rename it, or the first Omni sign-out after an IC upgrade leaves the old token live.
 */
import { IC_PUSH_SOURCE } from '@resgrid/api';
import { z } from 'zod';

export const NATIVE_PUSH_REGISTRATION_KEY = 'nativePushRegistration';
/** Units/departments the device left whose removal the server has not confirmed (Unit's in-memory list, now durable). */
export const NATIVE_PUSH_STALE_REGISTRATIONS_KEY = 'nativePushStaleRegistrations';

/**
 * Sign-outs whose registrations the server has not confirmed taken off yet. Kept through every wipe (the app shell
 * preserves the key): an app killed or offline during sign-out still takes the ended session's token off later.
 */
export const NATIVE_PUSH_PENDING_SIGN_OUTS_KEY = 'nativePushPendingSignOuts';

/**
 * Core's access tokens last 24 hours (`OidcConfig.AccessTokenExpiryMinutes`). After that the ended session's token can no
 * longer take anything off, and only a new device token stops the old registration delivering here.
 */
export const PENDING_SIGN_OUT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Matches IC's `StoredNativePushRegistration` (Core `NativePushUnRegistrationInput` + the owning user). */
export interface StoredNativePushRegistration {
  /** The user whose session made the registration: only that session's sign-out removes it. */
  UserId: string;
  Token: string;
  Prefix: string;
  Source?: string;
  UnitId?: string;
}

/** Structural subset of `DurableKv` (@resgrid/offline). */
export interface NotificationsKv {
  getJSON<T>(key: string): T | null;
  setJSON(key: string, value: unknown): unknown;
  delete(key: string): void;
}

export const createMemoryNotificationsKv = (): NotificationsKv => {
  const values = new Map<string, string>();
  return {
    getJSON<T>(key: string): T | null {
      const raw = values.get(key);
      if (raw === undefined) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        values.delete(key);
        return null;
      }
    },
    setJSON(key: string, value: unknown) {
      values.set(key, JSON.stringify(value));
      return true;
    },
    delete(key: string) {
      values.delete(key);
    },
  };
};

const optionalString = (value: unknown): boolean => value === undefined || value === null || typeof value === 'string';

export const isStoredNativePushRegistration = (value: unknown): value is StoredNativePushRegistration => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.UserId === 'string' && typeof record.Token === 'string' && record.Token !== '' && typeof record.Prefix === 'string' && optionalString(record.Source) && optionalString(record.UnitId);
};

const pendingSignOutSchema = z.object({
  id: z.string().min(1),
  /** The ended session's access token: Core takes a registration off only for the user who made it. */
  accessToken: z.string().min(1).nullable(),
  apiUrl: z.string(),
  signedOutAt: z.number(),
  registrations: z.array(z.unknown()).transform((entries) => entries.filter(isStoredNativePushRegistration)),
});

/** A sign-out whose registrations are still on the server, with what it takes to remove them as that session. */
export type PendingPushSignOut = z.infer<typeof pendingSignOutSchema>;

/** What became of one registration a sign-out tried to take off. */
export type SignOutUnregisterOutcome = 'removed' | 'refused' | 'retry';

/** Reads and writes the registration; every failure is a miss, never a crash. */
export class RegistrationStore {
  constructor(private readonly kv: NotificationsKv) {}

  getCurrent(): StoredNativePushRegistration | null {
    try {
      const value = this.kv.getJSON<unknown>(NATIVE_PUSH_REGISTRATION_KEY);
      return isStoredNativePushRegistration(value) ? value : null;
    } catch {
      return null;
    }
  }

  setCurrent(registration: StoredNativePushRegistration | null): void {
    try {
      if (registration) this.kv.setJSON(NATIVE_PUSH_REGISTRATION_KEY, registration);
      else this.kv.delete(NATIVE_PUSH_REGISTRATION_KEY);
    } catch {
      // Storage unavailable: the registration is just not remembered across restarts.
    }
  }

  getStale(): StoredNativePushRegistration[] {
    try {
      const value = this.kv.getJSON<unknown>(NATIVE_PUSH_STALE_REGISTRATIONS_KEY);
      return Array.isArray(value) ? value.filter(isStoredNativePushRegistration) : [];
    } catch {
      return [];
    }
  }

  setStale(registrations: StoredNativePushRegistration[]): void {
    try {
      if (registrations.length > 0) this.kv.setJSON(NATIVE_PUSH_STALE_REGISTRATIONS_KEY, registrations);
      else this.kv.delete(NATIVE_PUSH_STALE_REGISTRATIONS_KEY);
    } catch {
      // As above.
    }
  }

  getPendingSignOuts(): PendingPushSignOut[] {
    try {
      const parsed = z.array(z.unknown()).safeParse(this.kv.getJSON<unknown>(NATIVE_PUSH_PENDING_SIGN_OUTS_KEY));

      return parsed.success
        ? parsed.data.flatMap((entry) => {
            const record = pendingSignOutSchema.safeParse(entry);

            return record.success && record.data.registrations.length > 0 ? [record.data] : [];
          })
        : [];
    } catch {
      return [];
    }
  }

  /** Written synchronously, before any request: it is what survives an app killed during sign-out. */
  addPendingSignOut(record: PendingPushSignOut): void {
    this.setPendingSignOuts([...this.getPendingSignOuts().filter((entry) => entry.id !== record.id), record]);
  }

  /** Drops a registration the server took off (or that can never be taken off as that session); `retry` keeps it. */
  settlePendingSignOut(id: string, registration: StoredNativePushRegistration, outcome: SignOutUnregisterOutcome): void {
    if (outcome === 'retry') {
      return;
    }

    this.setPendingSignOuts(this.getPendingSignOuts().map((entry) => (entry.id === id ? { ...entry, registrations: entry.registrations.filter((stored) => !isSameRegistration(stored, registration)) } : entry)));
  }

  private setPendingSignOuts(records: PendingPushSignOut[]): void {
    const remaining = records.filter((entry) => entry.registrations.length > 0);

    try {
      if (remaining.length > 0) this.kv.setJSON(NATIVE_PUSH_PENDING_SIGN_OUTS_KEY, remaining);
      else this.kv.delete(NATIVE_PUSH_PENDING_SIGN_OUTS_KEY);
    } catch {
      // As above: the sign-out still tries now, it just is not retried after a restart.
    }
  }
}

/** Same token, department, unit and source: the server holds one registration for it. */
export const isSameRegistration = (a: StoredNativePushRegistration, b: StoredNativePushRegistration): boolean =>
  a.Token === b.Token && a.Prefix === b.Prefix && (a.UnitId ?? null) === (b.UnitId ?? null) && (a.Source ?? null) === (b.Source ?? null);

/**
 * Whether a registration is on IC's subscriber (`{code}_IC_User_{userId}`). Any other `Source` (Dispatch's) only picks
 * the push integration on the same `{code}_User_{userId}` subscriber.
 */
const isIcSubscriber = (registration: StoredNativePushRegistration): boolean => registration.Source === IC_PUSH_SOURCE;

/**
 * Same Novu subscriber (department, unit, user, IC or not) regardless of token or a user app's own `Source`: a build
 * that starts sending its `Source` keeps its token on the subscriber, rather than registering it and then removing it as
 * the "previous" registration (Core files both on the same integration until it routes that `Source`).
 */
export const isSameSubscriber = (a: StoredNativePushRegistration, b: StoredNativePushRegistration): boolean =>
  a.UserId === b.UserId && a.Prefix === b.Prefix && (a.UnitId ?? null) === (b.UnitId ?? null) && isIcSubscriber(a) === isIcSubscriber(b);
