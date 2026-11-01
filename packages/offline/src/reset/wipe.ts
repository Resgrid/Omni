import type { VariantId } from '@resgrid/config';

import type { DurableDb } from '../db/types';
import { CONTRACT_KEYS, DEVICE_PREFERENCE_KEYS, SESSION_KEYS, VARIANT_PRESERVED_KEYS } from '../kv/contract-keys';
import type { ClearResult, DurableKv } from '../kv/durable-kv';
import { ConfirmationRequiredError, type Outbox } from '../outbox/outbox';
import { getOfflineLogger } from '../util/logger';
import type { OfflineScope } from '../util/scope';
import { defaultResetRegistry, type ResetReason, type ResetRegistry } from './registry';

/** Unsent writes on a wipe: kept for their owner (encrypted, scoped, never replayed for anyone else) or discarded. */
export type UnsentWritesPolicy = 'hold' | 'discard';

export interface WipeOptions {
  /** The session being left; used when discarding its unsent writes. */
  scope?: OfflineScope | null;
  /** Default `hold`, except `clear-all-data` which always discards. */
  unsentWrites?: UnsentWritesPolicy;
  /** Discarding unsent writes needs the user's confirmation (the UI shows the count first). */
  confirmedDiscard?: boolean;
}

export interface WipeReport {
  reason: ResetReason;
  teardowns: { ok: string[]; failed: string[] };
  stores: { ok: string[]; failed: string[] };
  tablesCleared: string[];
  kv: Record<string, ClearResult>;
  unsentWrites: { policy: UnsentWritesPolicy; discarded: number; held: number };
}

export interface ScopeWiperOptions {
  registry?: ResetRegistry;
  /** Every MMKV instance of the variant (main + extra), from `openVariantStorage().all()`. */
  kvInstances?: () => DurableKv[];
  db?: DurableDb | null;
  outbox?: Outbox | null;
  variantId?: VariantId;
  /** Extra preserved keys for this variant (in addition to device preferences and registry entries). */
  preserveKeys?: readonly string[];
  /** Instances kept whole on a department switch (the session lives there in Dispatch/BigBoard). */
  sessionInstances?: readonly string[];
}

export interface ScopeWiper {
  wipeScope(reason: ResetReason, options?: WipeOptions): Promise<WipeReport>;
  /** Keys a wipe for `reason` keeps in `instanceId`. */
  preservedKeysFor(reason: ResetReason, instanceId: string): Set<string>;
}

const DEFAULT_SESSION_INSTANCES: readonly string[] = [CONTRACT_KEYS.authStore];

/**
 * Wipe the signed-in scope on logout, forced sign-out, department switch, server switch or "Clear all
 * local data" (plan §8.2): teardowns → store resets → unsent-writes policy → wipe tables → MMKV
 * (all instances) except device preferences. Each step is isolated: one failure never stops the rest.
 */
export function createScopeWiper(options: ScopeWiperOptions = {}): ScopeWiper {
  const registry = options.registry ?? defaultResetRegistry;
  const sessionInstances = new Set(options.sessionInstances ?? DEFAULT_SESSION_INSTANCES);

  const preservedKeysFor = (reason: ResetReason, instanceId: string): Set<string> => {
    const keys = new Set<string>([...DEVICE_PREFERENCE_KEYS, ...(options.variantId ? (VARIANT_PRESERVED_KEYS[options.variantId] ?? []) : []), ...(options.preserveKeys ?? []), ...registry.getPreservedKeys(instanceId)]);
    if (reason === 'department-switch') {
      SESSION_KEYS.forEach((key) => keys.add(key));
    }
    return keys;
  };

  const wipeScope = async (reason: ResetReason, wipeOptions: WipeOptions = {}): Promise<WipeReport> => {
    const logger = getOfflineLogger();
    const policy: UnsentWritesPolicy = reason === 'clear-all-data' ? 'discard' : (wipeOptions.unsentWrites ?? 'hold');
    if (policy === 'discard' && !wipeOptions.confirmedDiscard) {
      throw new ConfirmationRequiredError('Discarding unsent changes');
    }
    logger.info({ message: 'Wiping local data for scope change', context: { reason, unsentWrites: policy } });

    const report: WipeReport = { reason, teardowns: { ok: [], failed: [] }, stores: { ok: [], failed: [] }, tablesCleared: [], kv: {}, unsentWrites: { policy, discarded: 0, held: 0 } };

    for (const [name, teardown] of registry.getTeardowns()) {
      try {
        await teardown(reason);
        report.teardowns.ok.push(name);
      } catch (error) {
        report.teardowns.failed.push(name);
        logger.error({ message: 'Teardown failed during wipe', context: { name, reason, error: error instanceof Error ? error.name : typeof error } });
      }
    }

    for (const [name, reset] of registry.getStoreResets()) {
      try {
        await reset(reason);
        report.stores.ok.push(name);
      } catch (error) {
        report.stores.failed.push(name);
        logger.error({ message: 'Failed to reset store', context: { storeName: name, reason, error: error instanceof Error ? error.name : typeof error } });
      }
    }

    if (options.outbox) {
      try {
        if (policy === 'discard') {
          report.unsentWrites.discarded = await options.outbox.deleteForScope(reason === 'clear-all-data' ? null : (wipeOptions.scope ?? null));
        } else {
          report.unsentWrites.held = await options.outbox.countUnsent(wipeOptions.scope ?? null);
        }
      } catch (error) {
        logger.error({ message: 'Outbox step failed during wipe', context: { reason, error: error instanceof Error ? error.name : typeof error } });
      }
    }

    if (options.db) {
      const existing = new Set(await options.db.listTables().catch(() => [] as string[]));
      for (const table of registry.getWipeTables()) {
        if (!existing.has(table)) continue;
        try {
          await options.db.delete(table);
          report.tablesCleared.push(table);
        } catch (error) {
          logger.error({ message: 'Failed to clear table during wipe', context: { table, reason, error: error instanceof Error ? error.name : typeof error } });
        }
      }
    }

    for (const kv of options.kvInstances?.() ?? []) {
      if (reason === 'department-switch' && sessionInstances.has(kv.id)) {
        report.kv[kv.id] = { removed: 0, preserved: kv.keys().length };
        continue;
      }
      report.kv[kv.id] = kv.clear({ preserve: preservedKeysFor(reason, kv.id) });
    }

    logger.info({
      message: 'Local data wiped',
      context: { reason, stores: report.stores.ok.length, storeFailures: report.stores.failed.length, tables: report.tablesCleared.length, discarded: report.unsentWrites.discarded, held: report.unsentWrites.held },
    });
    return report;
  };

  return { wipeScope, preservedKeysFor };
}
