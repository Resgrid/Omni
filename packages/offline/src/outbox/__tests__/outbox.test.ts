import { __resetSqliteFake } from '../../__tests__/fakes/expo-sqlite';
import { createClock, createTestHandler, DAY, engines, flush, httpError, networkError, scopeA, scopeB, sequentialIds, type TestClock } from '../../__tests__/helpers';
import type { DurableDb } from '../../db/types';
import { createTestPayloadCipher } from '../../testing';
import type { OfflineScope } from '../../util/scope';
import { createManualConnectivitySource, type ManualConnectivitySource } from '../connectivity';
import { ConfirmationRequiredError, createOutbox, type Outbox, OutboxNoSessionError, type OutboxOptions, OutboxUnknownTypeError, ProtectedPayloadError } from '../outbox';
import { createOutboxHandlerRegistry, type OutboxHandlerRegistry } from '../registry';
import { OUTBOX_TABLE } from '../schema';

afterEach(() => __resetSqliteFake());

describe.each(engines())('Outbox (%s)', (_engine, openDb) => {
  let db: DurableDb;
  let clock: TestClock;
  let registry: OutboxHandlerRegistry;
  let connectivity: ManualConnectivitySource;
  let scope: OfflineScope | null;
  let outbox: Outbox;

  const build = async (overrides: Partial<OutboxOptions> = {}): Promise<Outbox> => {
    const instance = createOutbox({ db, getScope: () => scope, registry, connectivity, now: clock.now, generateId: sequentialIds(), ...overrides });
    await instance.init();
    return instance;
  };

  const rows = () => db.select(OUTBOX_TABLE, { orderBy: [{ column: 'seq' }] });

  beforeEach(async () => {
    db = await openDb();
    clock = createClock();
    registry = createOutboxHandlerRegistry();
    connectivity = createManualConnectivitySource(true);
    scope = scopeA;
    outbox = await build();
  });

  describe('enqueue', () => {
    it('stores the event durably with its scope, then applies it optimistically', async () => {
      const handler = createTestHandler('status.set');
      registry.register(handler);

      const result = await outbox.enqueue({ type: 'status.set', payload: { statusType: 2 } });

      expect(result).toEqual({ id: 'evt-1', status: 'queued', replaced: [] });
      const [row] = await rows();
      expect(row).toMatchObject({
        id: 'evt-1',
        type: 'status.set',
        state: 'pending',
        attempts: 0,
        payloadEncoding: 'json',
        scopeServer: 'https://api.resgrid.com',
        scopeDepartmentId: 1,
        scopeUserId: 'user-a',
        scopeUnitId: 10,
        createdAt: clock.now(),
      });
      expect(handler.optimisticApply).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-1', payload: { statusType: 2 }, state: 'pending' }));
      const snapshot = outbox.getSnapshot();
      expect(snapshot.counts).toMatchObject({ pending: 1, unsent: 1, total: 1 });
      expect(snapshot.items[0]).not.toHaveProperty('payload');
    });

    it('keeps the write queued when the optimistic apply throws', async () => {
      const handler = createTestHandler('status.set');
      handler.optimisticApply.mockImplementation(() => {
        throw new Error('store missing');
      });
      registry.register(handler);
      await outbox.enqueue({ type: 'status.set', payload: {} });
      expect(await rows()).toHaveLength(1);
    });

    it('refuses unknown types and writes without a session', async () => {
      await expect(outbox.enqueue({ type: 'nope', payload: {} })).rejects.toBeInstanceOf(OutboxUnknownTypeError);
      registry.register(createTestHandler('status.set'));
      scope = null;
      await expect(outbox.enqueue({ type: 'status.set', payload: {} })).rejects.toBeInstanceOf(OutboxNoSessionError);
    });

    it('is idempotent for an imported id', async () => {
      registry.register(createTestHandler('status.set'));
      await outbox.enqueue({ type: 'status.set', payload: {}, id: 'legacy-1' });
      expect((await outbox.enqueue({ type: 'status.set', payload: {}, id: 'legacy-1' })).status).toBe('duplicate');
      expect(await rows()).toHaveLength(1);
    });

    it('notifies subscribers', async () => {
      registry.register(createTestHandler('status.set'));
      const listener = jest.fn();
      const unsubscribe = outbox.subscribe(listener);
      await outbox.enqueue({ type: 'status.set', payload: {} });
      expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ counts: expect.objectContaining({ pending: 1 }) }));
      unsubscribe();
    });
  });

  describe('drain', () => {
    it('delivers in queue order, one at a time, deleting each on acknowledgement', async () => {
      const handler = createTestHandler('note.add');
      let inFlight = 0;
      let maxInFlight = 0;
      const order: number[] = [];
      handler.send.mockImplementation(async (event) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await flush();
        order.push((event.payload as { n: number }).n);
        inFlight--;
        return { saved: true };
      });
      registry.register(handler);
      for (const n of [1, 2, 3]) await outbox.enqueue({ type: 'note.add', payload: { n } });

      const result = await outbox.drain();

      expect(result).toMatchObject({ status: 'completed', sent: ['evt-1', 'evt-2', 'evt-3'] });
      expect(order).toEqual([1, 2, 3]);
      expect(maxInFlight).toBe(1);
      expect(await rows()).toHaveLength(0);
      expect(handler.afterAck).toHaveBeenCalledTimes(3);
      expect(handler.afterAck).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-1' }), { saved: true });
      expect(outbox.getSnapshot().counts.unsent).toBe(0);
    });

    it('keeps insertion order even when the device clock goes backwards', async () => {
      const handler = createTestHandler('note.add');
      registry.register(handler);
      await outbox.enqueue({ type: 'note.add', payload: { n: 1 } });
      clock.advance(-60 * 60_000);
      await outbox.enqueue({ type: 'note.add', payload: { n: 2 } });
      await outbox.drain();
      expect(handler.send.mock.calls.map(([event]) => (event.payload as { n: number }).n)).toEqual([1, 2]);
    });

    it('sends the same idempotency key on every attempt and backs off between them', async () => {
      const handler = createTestHandler('status.set');
      handler.send.mockRejectedValueOnce(httpError(500)).mockRejectedValueOnce(httpError(503)).mockResolvedValue({});
      registry.register(handler);
      await outbox.enqueue({ type: 'status.set', payload: {} });

      expect((await outbox.drain()).failed).toEqual(['evt-1']);
      expect((await rows())[0]).toMatchObject({ state: 'failed', retryFailures: 1, nextAttemptAt: clock.now() + 2_000 });

      const early = await outbox.drain();
      expect(early.waiting).toBe(1);
      expect(handler.send).toHaveBeenCalledTimes(1);

      clock.advance(2_000);
      await outbox.drain();
      expect((await rows())[0]).toMatchObject({ retryFailures: 2, nextAttemptAt: clock.now() + 4_000 });

      clock.advance(4_000);
      expect((await outbox.drain()).sent).toEqual(['evt-1']);
      expect(handler.send.mock.calls.map(([event, context]) => [event.id, context.idempotencyKey, context.attempt])).toEqual([
        ['evt-1', 'evt-1', 1],
        ['evt-1', 'evt-1', 2],
        ['evt-1', 'evt-1', 3],
      ]);
    });

    it('dead-letters a 4xx at once, rolls back, and carries on with the next event', async () => {
      const rejected = createTestHandler('call.create');
      rejected.send.mockRejectedValue(httpError(400));
      const ok = createTestHandler('note.add');
      registry.register(rejected);
      registry.register(ok);
      await outbox.enqueue({ type: 'call.create', payload: {} });
      await outbox.enqueue({ type: 'note.add', payload: {} });

      const result = await outbox.drain();

      expect(result).toMatchObject({ dead: ['evt-1'], sent: ['evt-2'] });
      const [row] = await rows();
      expect(row).toMatchObject({ id: 'evt-1', state: 'dead', attempts: 1 });
      expect(JSON.parse(row.lastError as string)).toEqual({ status: 400, message: 'Request failed with status code 400' });
      expect(rejected.rollback).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-1' }), 'dead');
      expect(outbox.getSnapshot().counts).toMatchObject({ dead: 1, unsent: 0 });
    });

    it('dead-letters after the maximum attempts of retryable failures', async () => {
      outbox = await build({ retry: { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 10_000 } });
      const handler = createTestHandler('status.set');
      handler.send.mockRejectedValue(httpError(500));
      registry.register(handler);
      await outbox.enqueue({ type: 'status.set', payload: {} });
      for (let i = 0; i < 3; i++) {
        await outbox.drain();
        clock.advance(10_000);
      }
      expect((await rows())[0]).toMatchObject({ state: 'dead', retryFailures: 3 });
      expect(handler.rollback).toHaveBeenCalledWith(expect.anything(), 'dead');
    });

    it('stops the pass on a network failure without spending the retry budget', async () => {
      const handler = createTestHandler('status.set');
      handler.send.mockRejectedValueOnce(networkError());
      registry.register(handler);
      await outbox.enqueue({ type: 'status.set', payload: { n: 1 } });
      await outbox.enqueue({ type: 'status.set', payload: { n: 2 } });

      const result = await outbox.drain();

      expect(result.status).toBe('stopped-network');
      expect(handler.send).toHaveBeenCalledTimes(1);
      expect((await rows())[0]).toMatchObject({ state: 'failed', retryFailures: 0, attempts: 1 });
    });

    it('stops on 401, keeps the event pending and asks for a token refresh', async () => {
      const onAuthRequired = jest.fn();
      outbox = await build({ onAuthRequired });
      const handler = createTestHandler('status.set');
      handler.send.mockRejectedValueOnce(httpError(401));
      registry.register(handler);
      await outbox.enqueue({ type: 'status.set', payload: {} });
      await outbox.enqueue({ type: 'status.set', payload: {} });

      expect((await outbox.drain()).status).toBe('stopped-auth');
      expect(onAuthRequired).toHaveBeenCalledTimes(1);
      expect(handler.send).toHaveBeenCalledTimes(1);
      expect((await rows())[0]).toMatchObject({ state: 'pending', nextAttemptAt: null });

      expect((await outbox.drain()).sent).toEqual(['evt-1', 'evt-2']);
    });

    it('recovers an event left "processing" by a killed app and sends it once', async () => {
      const handler = createTestHandler('status.set');
      registry.register(handler);
      await outbox.enqueue({ type: 'status.set', payload: {} });
      await db.update(OUTBOX_TABLE, { id: 'evt-1' }, { state: 'processing' });

      const afterRestart = await build();
      expect((await rows())[0].state).toBe('pending');
      expect((await afterRestart.drain()).sent).toEqual(['evt-1']);
      expect(handler.send).toHaveBeenCalledTimes(1);
    });

    it('skips while offline, and can send a filtered subset regardless (Unit: queued statuses before a new one)', async () => {
      const status = createTestHandler('status.set');
      const note = createTestHandler('note.add');
      registry.register(status);
      registry.register(note);
      await outbox.enqueue({ type: 'note.add', payload: {} });
      await outbox.enqueue({ type: 'status.set', payload: {} });
      connectivity.setOnline(false);

      expect((await outbox.drain()).status).toBe('skipped-offline');
      expect(status.send).not.toHaveBeenCalled();

      const result = await outbox.drain({ ignoreConnectivity: true, filter: (item) => item.type === 'status.set' });
      expect(result.sent).toEqual(['evt-2']);
      expect(note.send).not.toHaveBeenCalled();
    });

    it('runs one pass at a time: concurrent calls never send an event twice', async () => {
      const handler = createTestHandler('note.add');
      handler.send.mockImplementation(async () => {
        await flush(3);
        return {};
      });
      registry.register(handler);
      await outbox.enqueue({ type: 'note.add', payload: {} });
      await outbox.enqueue({ type: 'note.add', payload: {} });

      await Promise.all([outbox.drain(), outbox.drain(), outbox.drain(), outbox.notifyForeground()]);

      expect(handler.send).toHaveBeenCalledTimes(2);
    });

    it('leaves events of an unregistered type waiting', async () => {
      const handler = createTestHandler('note.add');
      const unregister = registry.register(handler);
      await outbox.enqueue({ type: 'note.add', payload: {} });
      unregister();
      expect((await outbox.drain()).waiting).toBe(1);
      expect((await rows())[0].state).toBe('pending');
    });
  });

  describe('ordering (IC rule generalized)', () => {
    it('holds a call close until the command close it depends on is delivered', async () => {
      const closeCommand = createTestHandler('ic.command.close');
      const closeCall = createTestHandler('calls.close');
      closeCommand.send.mockRejectedValueOnce(httpError(500));
      registry.register(closeCommand);
      registry.register(closeCall);
      const command = await outbox.enqueue({ type: 'ic.command.close', payload: { callId: '7' } });
      await outbox.enqueue({ type: 'calls.close', payload: { callId: '7' }, dependsOn: [command.id] });

      const first = await outbox.drain();
      expect(first).toMatchObject({ failed: ['evt-1'], waiting: 1 });
      expect(closeCall.send).not.toHaveBeenCalled();

      clock.advance(2_000);
      expect((await outbox.drain()).sent).toEqual(['evt-1', 'evt-2']);
    });

    it('lets the dependent go once its dependency is dead-lettered (the server decides)', async () => {
      const closeCommand = createTestHandler('ic.command.close');
      closeCommand.send.mockRejectedValue(httpError(404));
      const closeCall = createTestHandler('calls.close');
      registry.register(closeCommand);
      registry.register(closeCall);
      const command = await outbox.enqueue({ type: 'ic.command.close', payload: {} });
      await outbox.enqueue({ type: 'calls.close', payload: {}, dependsOn: [command.id] });
      expect(await outbox.drain()).toMatchObject({ dead: ['evt-1'], sent: ['evt-2'] });
    });

    it('does not hold events without a dependency', async () => {
      const closeCommand = createTestHandler('ic.command.close');
      closeCommand.send.mockRejectedValue(httpError(500));
      const closeCall = createTestHandler('calls.close');
      registry.register(closeCommand);
      registry.register(closeCall);
      await outbox.enqueue({ type: 'ic.command.close', payload: { callId: '7' } });
      await outbox.enqueue({ type: 'calls.close', payload: { callId: '8' } });
      expect((await outbox.drain()).sent).toEqual(['evt-2']);
    });

    it('runs another round in the same drain when a later-queued dependency is delivered', async () => {
      const handler = createTestHandler('ic.event');
      registry.register(handler);
      await outbox.enqueue({ type: 'ic.event', payload: { step: 'assign' }, dependsOn: ['create-node'] });
      await outbox.enqueue({ type: 'ic.event', payload: { step: 'create' }, id: 'create-node' });
      const result = await outbox.drain();
      expect(result.sent).toEqual(['create-node', 'evt-1']);
    });

    it('keeps an order group strictly FIFO: a newer unit status never overtakes an older one', async () => {
      const handler = createTestHandler('unit.status');
      handler.send.mockImplementation(async (event) => {
        if ((event.payload as { n: number }).n === 1 && event.attempts === 1) throw httpError(502);
        return {};
      });
      registry.register(handler);
      await outbox.enqueue({ type: 'unit.status', payload: { n: 1 }, orderKey: 'unit:10' });
      await outbox.enqueue({ type: 'unit.status', payload: { n: 2 }, orderKey: 'unit:10' });
      await outbox.enqueue({ type: 'unit.status', payload: { n: 3 }, orderKey: 'unit:11' });

      expect(await outbox.drain()).toMatchObject({ failed: ['evt-1'], sent: ['evt-3'], waiting: 2 });
      clock.advance(2_000);
      expect((await outbox.drain()).sent).toEqual(['evt-1', 'evt-2']);
    });
  });

  describe('coalescing (newest location fix wins)', () => {
    beforeEach(() => {
      registry.register(createTestHandler('location.unit'));
    });

    it('replaces a waiting fix with a newer one', async () => {
      await outbox.enqueue({ type: 'location.unit', payload: { t: 100 }, coalesceKey: 'loc:10', coalesceAt: 100 });
      const result = await outbox.enqueue({ type: 'location.unit', payload: { t: 200 }, coalesceKey: 'loc:10', coalesceAt: 200 });
      expect(result).toEqual({ id: 'evt-2', status: 'queued', replaced: ['evt-1'] });
      expect((await rows()).map((row) => row.id)).toEqual(['evt-2']);
    });

    it('does not queue a fix older than one already waiting, returning the newer id', async () => {
      await outbox.enqueue({ type: 'location.unit', payload: { t: 200 }, coalesceKey: 'loc:10', coalesceAt: 200 });
      const result = await outbox.enqueue({ type: 'location.unit', payload: { t: 100 }, coalesceKey: 'loc:10', coalesceAt: 100 });
      expect(result).toEqual({ id: 'evt-1', status: 'coalesced', replaced: [] });
      expect(await rows()).toHaveLength(1);
    });

    it('replaces a dead-lettered newer fix, and leaves other keys and other sessions alone', async () => {
      await outbox.enqueue({ type: 'location.unit', payload: {}, coalesceKey: 'loc:10', coalesceAt: 500 });
      await db.update(OUTBOX_TABLE, { id: 'evt-1' }, { state: 'dead' });
      await outbox.enqueue({ type: 'location.unit', payload: {}, coalesceKey: 'loc:11', coalesceAt: 100 });
      await outbox.enqueue({ type: 'location.unit', payload: {}, coalesceKey: 'loc:10', coalesceAt: 100, scope: scopeB });
      const result = await outbox.enqueue({ type: 'location.unit', payload: {}, coalesceKey: 'loc:10', coalesceAt: 100 });
      expect(result.replaced).toEqual(['evt-1']);
      expect((await rows()).map((row) => row.id)).toEqual(['evt-2', 'evt-3', 'evt-4']);
    });

    it('leaves a send in flight alone and drops it, instead of retrying, when it fails behind a newer fix', async () => {
      const handler = createTestHandler('location.unit');
      handler.send.mockImplementationOnce(async () => {
        await outbox.enqueue({ type: 'location.unit', payload: { t: 200 }, coalesceKey: 'loc:10', coalesceAt: 200 });
        throw httpError(500);
      });
      registry.register(handler);
      await outbox.enqueue({ type: 'location.unit', payload: { t: 100 }, coalesceKey: 'loc:10', coalesceAt: 100 });

      const result = await outbox.drain();

      expect(result.superseded).toEqual(['evt-1']);
      expect((await rows()).map((row) => [row.id, row.state])).toEqual([['evt-2', 'pending']]);
      expect((await outbox.drain()).sent).toEqual(['evt-2']);
    });

    it('retries a failed fix as usual when nothing newer is queued', async () => {
      const handler = createTestHandler('location.unit');
      handler.send.mockRejectedValueOnce(httpError(500));
      registry.register(handler);
      await outbox.enqueue({ type: 'location.unit', payload: {}, coalesceKey: 'loc:10', coalesceAt: 100 });
      expect((await outbox.drain()).failed).toEqual(['evt-1']);
    });
  });

  describe('session scope (Responder rule)', () => {
    let handler: ReturnType<typeof createTestHandler>;
    beforeEach(async () => {
      handler = createTestHandler('status.set');
      registry.register(handler);
      await outbox.enqueue({ type: 'status.set', payload: {} });
    });

    it("never replays another user's events, and shows them only as a count", async () => {
      scope = scopeB;
      const result = await outbox.drain();
      expect(result).toMatchObject({ status: 'completed', held: 1, sent: [] });
      expect(handler.send).not.toHaveBeenCalled();
      expect(outbox.getSnapshot()).toMatchObject({ items: [], counts: expect.objectContaining({ held: 1, unsent: 0 }) });
    });

    it('sends them when their owner signs back in within the hold window', async () => {
      scope = scopeB;
      await outbox.drain();
      clock.advance(6 * DAY);
      scope = scopeA;
      expect((await outbox.drain()).sent).toEqual(['evt-1']);
    });

    it('drops them after 7 days with a visible record, never sending them', async () => {
      scope = scopeB;
      clock.advance(7 * DAY + 1);
      const result = await outbox.drain();
      expect(result.droppedForeign).toEqual(['evt-1']);
      expect(handler.send).not.toHaveBeenCalled();
      expect(await rows()).toHaveLength(0);
      expect(outbox.getSnapshot().recentlyDropped).toEqual([{ id: 'evt-1', type: 'status.set', reason: 'foreign-expired', createdAt: clock.now() - 7 * DAY - 1, droppedAt: clock.now() }]);
    });

    it('keeps everything while signed out, however long', async () => {
      scope = null;
      clock.advance(30 * DAY);
      expect((await outbox.drain()).status).toBe('skipped-signed-out');
      expect(await rows()).toHaveLength(1);
    });

    it('treats another server or department as another session', async () => {
      scope = { ...scopeA, server: 'https://eu.resgrid.com' };
      expect((await outbox.drain()).held).toBe(1);
      scope = { ...scopeA, departmentId: 2 };
      expect((await outbox.drain()).held).toBe(1);
      expect(handler.send).not.toHaveBeenCalled();
    });

    it('matches servers by normalized URL and ignores the unit', async () => {
      scope = { server: 'HTTPS://api.resgrid.com/', departmentId: 1, userId: 'user-a', unitId: 99 };
      expect((await outbox.drain()).sent).toEqual(['evt-1']);
    });
  });

  describe('requiresOnlineAuth (never silently replayed)', () => {
    it('waits for an explicit user confirmation, then sends exactly once', async () => {
      const handler = createTestHandler('records.finalize');
      registry.register(handler);
      await outbox.enqueue({ type: 'records.finalize', payload: {}, requiresOnlineAuth: true });

      expect((await outbox.drain()).waiting).toBe(1);
      expect(handler.send).not.toHaveBeenCalled();
      expect(outbox.getSnapshot().counts.awaitingConfirmation).toBe(1);

      scope = scopeB;
      expect(await outbox.confirmOnlineAuth('evt-1')).toBe(false);
      scope = scopeA;
      expect(await outbox.confirmOnlineAuth('evt-1')).toBe(true);
      await outbox.drain();
      await outbox.drain();
      expect(handler.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('user actions', () => {
    it('retries a dead-lettered event with a fresh budget and the same id', async () => {
      const handler = createTestHandler('call.create');
      handler.send.mockRejectedValueOnce(httpError(422));
      registry.register(handler);
      await outbox.enqueue({ type: 'call.create', payload: {} });
      await outbox.drain();
      expect(await outbox.retry('evt-1')).toBe(true);
      expect((await rows())[0]).toMatchObject({ state: 'pending', retryFailures: 0, lastError: null });
      expect((await outbox.drain()).sent).toEqual(['evt-1']);
      expect(handler.send.mock.calls[1][1].idempotencyKey).toBe('evt-1');
    });

    it('retries all failed and dead events of the session only', async () => {
      registry.register(createTestHandler('status.set'));
      await outbox.enqueue({ type: 'status.set', payload: {} });
      await outbox.enqueue({ type: 'status.set', payload: {} });
      await outbox.enqueue({ type: 'status.set', payload: {}, scope: scopeB });
      await db.update(OUTBOX_TABLE, {}, { state: 'dead' });
      expect(await outbox.retryAll()).toBe(2);
      expect((await rows()).map((row) => row.state)).toEqual(['pending', 'pending', 'dead']);
    });

    it('discards only with confirmation and rolls the optimistic change back', async () => {
      const handler = createTestHandler('status.set');
      registry.register(handler);
      await outbox.enqueue({ type: 'status.set', payload: { s: 1 } });
      await expect(outbox.discard('evt-1', { confirmed: false })).rejects.toBeInstanceOf(ConfirmationRequiredError);
      expect(await outbox.discard('evt-1', { confirmed: true })).toBe(true);
      expect(await rows()).toHaveLength(0);
      expect(handler.rollback).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-1', payload: { s: 1 } }), 'discarded');
    });

    it('lets a rejected offline call be corrected and resent under the same id', async () => {
      const handler = createTestHandler('calls.save');
      handler.send.mockRejectedValueOnce(httpError(400, 'Address required'));
      registry.register(handler);
      await outbox.enqueue({ type: 'calls.save', payload: { address: '' } });
      await outbox.drain();
      expect(outbox.getSnapshot().items[0]).toMatchObject({ state: 'dead', lastError: { status: 400, message: 'Address required' } });

      expect(await outbox.amend('evt-1', { address: '1 Main St' })).toBe(true);
      expect((await outbox.getEvent('evt-1'))?.payload).toEqual({ address: '1 Main St' });
      await outbox.drain();
      expect(handler.send.mock.calls[1][0]).toMatchObject({ id: 'evt-1', payload: { address: '1 Main St' } });
    });
  });

  describe('payload encryption', () => {
    it('stores ciphertext and hands the handler the decrypted payload', async () => {
      const cipher = createTestPayloadCipher();
      outbox = await build({ cipher });
      const handler = createTestHandler('notes.add');
      registry.register(handler);
      await outbox.enqueue({ type: 'notes.add', payload: { text: 'patient in room 4' } });

      const [row] = await rows();
      expect(row.payloadEncoding).toBe('cipher:test');
      expect(row.payload).not.toContain('patient');
      await outbox.drain();
      expect(handler.send.mock.calls[0][0].payload).toEqual({ text: 'patient in room 4' });
    });

    it('encrypts only protected payloads when configured so, and refuses protected payloads without a cipher', async () => {
      registry.register(createTestHandler('notes.add'));
      await expect(outbox.enqueue({ type: 'notes.add', payload: {}, protected: true })).rejects.toBeInstanceOf(ProtectedPayloadError);

      outbox = await build({ cipher: createTestPayloadCipher(), encryptPayloads: 'protected-only' });
      await outbox.enqueue({ type: 'notes.add', payload: { a: 1 } });
      await outbox.enqueue({ type: 'notes.add', payload: { ssn: 'x' }, protected: true });
      expect((await rows()).map((row) => row.payloadEncoding)).toEqual(['json', 'cipher:test']);
    });

    it('parks an unreadable payload as dead instead of dropping it', async () => {
      outbox = await build({ cipher: createTestPayloadCipher() });
      const handler = createTestHandler('notes.add');
      registry.register(handler);
      await outbox.enqueue({ type: 'notes.add', payload: {} });

      const withoutKey = await build({ cipher: null });
      const result = await withoutKey.drain();

      expect(result.dead).toEqual(['evt-1']);
      expect(handler.send).not.toHaveBeenCalled();
      const [row] = await rows();
      expect(row.payload).toMatch(/^test:/);
      expect(JSON.parse(row.lastError as string)).toMatchObject({ code: 'payload_unreadable' });
    });
  });

  describe('triggers', () => {
    it('drains on reconnect and re-arms the timer at the retry time', async () => {
      const scheduled: { fn: () => void; ms: number }[] = [];
      const timers = { setTimeout: (fn: () => void, ms: number) => scheduled.push({ fn, ms }), clearTimeout: jest.fn() };
      outbox = await build({ timers });
      const handler = createTestHandler('status.set');
      handler.send.mockRejectedValueOnce(httpError(500));
      registry.register(handler);
      connectivity.setOnline(false);
      outbox.startTriggers({ intervalMs: 10_000 });
      await outbox.enqueue({ type: 'status.set', payload: {} });
      expect(handler.send).not.toHaveBeenCalled();

      connectivity.setOnline(true);
      await flush(50);
      expect(handler.send).toHaveBeenCalledTimes(1);
      expect(scheduled[scheduled.length - 1].ms).toBe(2_000);

      clock.advance(2_000);
      scheduled[scheduled.length - 1].fn();
      await flush(50);
      expect(handler.send).toHaveBeenCalledTimes(2);
      outbox.stopTriggers();
    });
  });

  describe('maintenance hooks', () => {
    it('counts and deletes unsent events per session', async () => {
      registry.register(createTestHandler('status.set'));
      await outbox.enqueue({ type: 'status.set', payload: {} });
      await outbox.enqueue({ type: 'status.set', payload: {}, scope: scopeB });
      expect(await outbox.countUnsent(scopeA)).toBe(1);
      expect(await outbox.countUnsent(null)).toBe(2);
      expect(await outbox.deleteForScope(scopeA)).toBe(1);
      expect(await outbox.countUnsent(null)).toBe(1);
    });

    it('drops dead letters past 14 days or beyond 200, with records, and never touches unsent events', async () => {
      registry.register(createTestHandler('status.set'));
      for (let i = 0; i < 5; i++) await outbox.enqueue({ type: 'status.set', payload: {} });
      await db.update(OUTBOX_TABLE, { id: { in: ['evt-1', 'evt-2', 'evt-3'] } }, { state: 'dead', stateChangedAt: clock.now() });
      await db.update(OUTBOX_TABLE, { id: 'evt-1' }, { stateChangedAt: clock.now() - 15 * DAY });

      expect(await outbox.pruneDead({ maxAgeMs: 14 * DAY, maxRows: 1 })).toBe(2);
      expect((await rows()).map((row) => [row.id, row.state])).toEqual([
        ['evt-2', 'dead'],
        ['evt-4', 'pending'],
        ['evt-5', 'pending'],
      ]);
      expect(
        outbox
          .getSnapshot()
          .recentlyDropped.map((record) => record.reason)
          .sort()
      ).toEqual(['dead-expired', 'dead-overflow']);
    });

    it('drops foreign events only while someone is signed in', async () => {
      registry.register(createTestHandler('status.set'));
      await outbox.enqueue({ type: 'status.set', payload: {}, scope: scopeB });
      clock.advance(8 * DAY);
      scope = null;
      expect(await outbox.pruneForeign()).toBe(0);
      scope = scopeA;
      expect(await outbox.pruneForeign()).toBe(1);
    });
  });
});
