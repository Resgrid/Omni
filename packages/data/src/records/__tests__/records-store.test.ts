import { createRecordDraft, finalizeRecord, getFieldRecordsCatalog, saveRecordDraft, syncFieldRecords } from '@resgrid/api';
import { RmsOriginClient } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, manifest, ok, persisted } from '../../__tests__/helpers';
import { setDataVariant } from '../../core/runtime';
import { mergeRecentRecords, recordsOriginClient, useRecordsStore } from '../records-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getFieldRecordsCatalog: jest.fn(),
  syncFieldRecords: jest.fn(),
  createRecordDraft: jest.fn(),
  saveRecordDraft: jest.fn(),
  finalizeRecord: jest.fn(),
  submitRecordForReview: jest.fn(),
}));

const summary = (RecordId: string, ModifiedOn: string) => ({ RecordId, ModifiedOn, State: 1, RowVersion: 1, DefinitionVersion: 1, CreatedOn: ModifiedOn });

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'unit' });
  await defaultResetRegistry.getStoreResets().get('data.records')?.('logout');
});

describe('records (identical across apps; origin from manifest; Unit race guards)', () => {
  it('takes the origin client from the variant manifest', () => {
    expect(recordsOriginClient()).toBe(RmsOriginClient.Unit);
    setDataVariant(manifest('ic'));
    expect(recordsOriginClient()).toBe(RmsOriginClient.IncidentCommand);
    setDataVariant(manifest('bigboard'));
    expect(recordsOriginClient()).toBeNull();
  });

  it('merges sync pages: tombstones evicted, newest first', () => {
    const merged = mergeRecentRecords([summary('a', '2026-10-01'), summary('b', '2026-10-02')] as never, [summary('c', '2026-10-03')] as never, ['a']);
    expect(merged.map((r) => r.RecordId)).toEqual(['c', 'b']);
  });

  it('drops a catalog answer for a context that is no longer current', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    jest.mocked(getFieldRecordsCatalog).mockImplementationOnce(() => new Promise((r) => (resolve = r)) as never);
    useRecordsStore.getState().setContext({ CallId: 1 });
    const pending = useRecordsStore.getState().fetchCatalog();
    useRecordsStore.getState().setContext({ CallId: 2 });
    resolve(ok({ Definitions: [{ DefinitionKey: 'x' }] }));
    await pending;
    expect(useRecordsStore.getState().catalog).toBeNull();
    expect(getFieldRecordsCatalog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ OriginClient: RmsOriginClient.Unit, Context: { CallId: 1 } }));
  });

  it('syncs full for a new context, then delta with the cursor; a reset re-pulls in full', async () => {
    jest
      .mocked(syncFieldRecords)
      .mockResolvedValue(ok({ Ok: true, ResetRequired: false, ServerTimestampMs: 99, ScopeStamp: 's1', Records: [summary('a', '2026-10-01')], Tombstones: [], Drafts: [], Assignments: [] }) as never);
    await useRecordsStore.getState().sync();
    expect(syncFieldRecords).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ Since: 0, ScopeStamp: null }));
    await useRecordsStore.getState().sync();
    expect(syncFieldRecords).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ Since: 99, ScopeStamp: 's1' }));
    expect(persisted(runtime.kv, 'records-field-storage')?.state).toEqual({ pendingDrafts: {}, scopeStamp: 's1', lastSyncTimestampMs: 99 });

    jest.mocked(syncFieldRecords).mockResolvedValueOnce(ok({ Ok: true, ResetRequired: true, ServerTimestampMs: 0, ScopeStamp: 's2', Records: [], Tombstones: [], Drafts: [], Assignments: [] }) as never);
    await useRecordsStore.getState().sync();
    expect(jest.mocked(syncFieldRecords).mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ Since: 0, ScopeStamp: null }));
  });

  it('pushes a staged draft through the outbox with the client record id as idempotency key (offline-capable)', async () => {
    useRecordsStore.getState().stageDraft({ clientRecordId: 'cr-1', recordId: null, definitionKey: 'fire', definitionVersion: 1, name: 'Fire', values: [], updatedOn: '' });
    runtime.connectivity.setOnline(false);
    const result = await useRecordsStore.getState().pushDraft('cr-1');
    expect(result?.outcome).toBe('queued');
    expect(useRecordsStore.getState().pendingDrafts['cr-1'].queued).toBe(true);

    jest.mocked(createRecordDraft).mockResolvedValue(ok({ RecordId: 'r-9', RowVersion: 3 }) as never);
    runtime.connectivity.setOnline(true);
    await runtime.outbox.drain();
    expect(createRecordDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ IdempotencyKey: 'cr-1', ClientRecordId: 'cr-1', OriginClient: RmsOriginClient.Unit }));
    expect(useRecordsStore.getState().pendingDrafts['cr-1']).toMatchObject({ recordId: 'r-9', rowVersion: 3, queued: false });

    jest.mocked(saveRecordDraft).mockResolvedValue(ok({ RecordId: 'r-9', RowVersion: 4 }) as never);
    await useRecordsStore.getState().pushDraft('cr-1');
    expect(saveRecordDraft).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ RecordId: 'r-9', RowVersion: 3 }));
  });

  it('never replays a legal transition silently: finalize waits for confirmOnlineAuth', async () => {
    jest.mocked(finalizeRecord).mockResolvedValue(ok({ RecordId: 'r-1', RowVersion: 2 }) as never);
    jest.mocked(syncFieldRecords).mockResolvedValue(ok({ Ok: true, ResetRequired: false, ServerTimestampMs: 1, Records: [], Tombstones: [], Drafts: [], Assignments: [] }) as never);
    const result = await useRecordsStore.getState().finalize('r-1', 1, true);
    expect(result.outcome).toBe('queued');
    await runtime.outbox.drain();
    expect(finalizeRecord).not.toHaveBeenCalled();
    await runtime.outbox.confirmOnlineAuth(result.id);
    await runtime.outbox.drain();
    await flush();
    expect(finalizeRecord).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ RecordId: 'r-1', RowVersion: 1, Attested: true, IdempotencyKey: result.id }));
  });

  it('keeps a draft authored under a protected grant in memory only', async () => {
    useRecordsStore.getState().stageDraft({ clientRecordId: 'cr-p', recordId: null, definitionKey: 'adp', definitionVersion: 1, name: 'Protected', values: [], updatedOn: '', requiresProtectedGrant: true });
    useRecordsStore.getState().stageDraft({ clientRecordId: 'cr-o', recordId: null, definitionKey: 'fire', definitionVersion: 1, name: 'Fire', values: [], updatedOn: '' });
    await flush();
    expect(Object.keys(useRecordsStore.getState().pendingDrafts).sort()).toEqual(['cr-o', 'cr-p']);
    expect(Object.keys((persisted(runtime.kv, 'records-field-storage')?.state as { pendingDrafts: Record<string, unknown> }).pendingDrafts)).toEqual(['cr-o']);
  });

  it('resets on sign-out (Responder) including staged drafts', async () => {
    useRecordsStore.getState().stageDraft({ clientRecordId: 'cr-2', recordId: null, definitionKey: 'k', definitionVersion: 1, name: 'n', values: [], updatedOn: '' });
    await defaultResetRegistry.getStoreResets().get('data.records')?.('logout');
    expect(useRecordsStore.getState().pendingDrafts).toEqual({});
  });
});
