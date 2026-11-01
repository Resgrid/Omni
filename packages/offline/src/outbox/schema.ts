import type { SchemaModule, TableSpec } from '../db/types';

/** Table names are part of the frozen on-disk identity once released. */
export const OUTBOX_TABLE = 'outbox';
export const OUTBOX_DROPPED_TABLE = 'outbox_dropped';

export const outboxTable: TableSpec = {
  name: OUTBOX_TABLE,
  columns: [
    { name: 'id', type: 'TEXT', primaryKey: true },
    { name: 'type', type: 'TEXT', notNull: true },
    { name: 'payload', type: 'TEXT', notNull: true },
    /** `json`, or `cipher:<cipher id>` when encrypted. */
    { name: 'payloadEncoding', type: 'TEXT', notNull: true },
    { name: 'scopeServer', type: 'TEXT', notNull: true },
    { name: 'scopeDepartmentId', type: 'INTEGER', notNull: true },
    { name: 'scopeUserId', type: 'TEXT', notNull: true },
    { name: 'scopeUnitId', type: 'INTEGER' },
    { name: 'createdAt', type: 'INTEGER', notNull: true },
    /** Insertion order; drives delivery order within a scope. */
    { name: 'seq', type: 'INTEGER', notNull: true },
    /** JSON array of event ids. */
    { name: 'dependsOn', type: 'TEXT' },
    { name: 'coalesceKey', type: 'TEXT' },
    { name: 'coalesceAt', type: 'INTEGER' },
    { name: 'orderKey', type: 'TEXT' },
    { name: 'attempts', type: 'INTEGER', notNull: true, default: 0 },
    /** Retryable server failures — what max attempts counts (network failures do not). */
    { name: 'retryFailures', type: 'INTEGER', notNull: true, default: 0 },
    { name: 'state', type: 'TEXT', notNull: true },
    /** JSON `{ status?, code?, message }`. */
    { name: 'lastError', type: 'TEXT' },
    { name: 'requiresOnlineAuth', type: 'INTEGER', notNull: true, default: 0 },
    { name: 'confirmedAt', type: 'INTEGER' },
    { name: 'nextAttemptAt', type: 'INTEGER' },
    { name: 'updatedAt', type: 'INTEGER', notNull: true },
    { name: 'stateChangedAt', type: 'INTEGER', notNull: true },
  ],
  indexes: [
    { name: 'outbox_state_seq', columns: ['state', 'seq'] },
    { name: 'outbox_coalesce', columns: ['coalesceKey'] },
    { name: 'outbox_scope', columns: ['scopeUserId', 'scopeServer', 'scopeDepartmentId'] },
  ],
};

/** Visible record of events dropped without being sent (held too long for another session, dead-letter overflow). */
export const outboxDroppedTable: TableSpec = {
  name: OUTBOX_DROPPED_TABLE,
  columns: [
    { name: 'id', type: 'TEXT', primaryKey: true },
    { name: 'type', type: 'TEXT', notNull: true },
    { name: 'reason', type: 'TEXT', notNull: true },
    { name: 'createdAt', type: 'INTEGER', notNull: true },
    { name: 'droppedAt', type: 'INTEGER', notNull: true },
  ],
  indexes: [{ name: 'outbox_dropped_at', columns: ['droppedAt'] }],
};

export const outboxSchemaModule: SchemaModule = {
  module: 'outbox',
  version: 1,
  tables: [outboxTable, outboxDroppedTable],
  migrations: [],
  preserveRowsOnFailure: true,
};
