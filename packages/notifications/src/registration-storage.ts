/**
 * The native push registration, kept on the device (IC baseline): a sign-out after a restart — before this run has
 * registered again, or when it cannot — still takes the token off the server.
 *
 * `nativePushRegistration` is the key IC's store builds write (JSON). It is part of the frozen storage contract
 * (AGENTS.md): never rename it, or the first Omni sign-out after an IC upgrade leaves the old token live.
 */

export const NATIVE_PUSH_REGISTRATION_KEY = 'nativePushRegistration';
/** Units/departments the device left whose removal the server has not confirmed (Unit's in-memory list, now durable). */
export const NATIVE_PUSH_STALE_REGISTRATIONS_KEY = 'nativePushStaleRegistrations';

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
}

/** Same token, department, unit and source: the server holds one registration for it. */
export const isSameRegistration = (a: StoredNativePushRegistration, b: StoredNativePushRegistration): boolean =>
  a.Token === b.Token && a.Prefix === b.Prefix && (a.UnitId ?? null) === (b.UnitId ?? null) && (a.Source ?? null) === (b.Source ?? null);

/** Same Novu subscriber (department, unit, source, user) regardless of token. */
export const isSameSubscriber = (a: StoredNativePushRegistration, b: StoredNativePushRegistration): boolean =>
  a.UserId === b.UserId && a.Prefix === b.Prefix && (a.UnitId ?? null) === (b.UnitId ?? null) && (a.Source ?? null) === (b.Source ?? null);
