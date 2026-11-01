import { ApiError, NoActiveSessionError, V4FailureError } from '@resgrid/api';
import type { OutboxEvent, OutboxHandler } from '@resgrid/offline';
import { createOutboxHandlerRegistry } from '@resgrid/offline/testing';

import { LOCATION_PERSON_EVENT, LOCATION_UNIT_EVENT } from '../constants';
import { classifyLocationError, registerLocationOutboxHandlers } from '../outbox-handlers';
import { buildPersonLocationPayload, buildUnitLocationPayload } from '../payload';
import type { LocationPayload } from '../types';
import { createFakeApi, fixAt, ORIGIN } from './helpers';

const event = <P>(type: string, payload: P, id = 'evt-1'): OutboxEvent<P> => ({
  id,
  type,
  payload,
  scope: { server: 'https://api.test', departmentId: 1, userId: 'user-1' },
  createdAt: 0,
  attempts: 0,
  state: 'processing',
});

describe('location outbox handlers', () => {
  it('registers only the requested target (variants register only their own scope)', () => {
    const registry = createOutboxHandlerRegistry();
    registerLocationOutboxHandlers({ getApiContext: () => createFakeApi().ctx, targets: ['unit'], registry });
    expect(registry.types()).toEqual([LOCATION_UNIT_EVENT]);
  });

  it('registers both by default and unregisters cleanly', () => {
    const registry = createOutboxHandlerRegistry();
    const unregister = registerLocationOutboxHandlers({ getApiContext: () => createFakeApi().ctx, registry });
    expect(registry.types().sort()).toEqual([LOCATION_PERSON_EVENT, LOCATION_UNIT_EVENT]);
    unregister();
    expect(registry.types()).toEqual([]);
  });

  it('sends a person fix to SetPersonLocation with the event id as idempotency key', async () => {
    const registry = createOutboxHandlerRegistry();
    const api = createFakeApi();
    registerLocationOutboxHandlers({ getApiContext: () => api.ctx, registry });
    const handler = registry.get(LOCATION_PERSON_EVENT) as OutboxHandler<LocationPayload>;
    const payload = buildPersonLocationPayload('user-1', fixAt(ORIGIN, 0));

    await handler.send(event(LOCATION_PERSON_EVENT, payload, 'evt-42'), { idempotencyKey: 'evt-42', attempt: 1 });

    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request.mock.calls[0][0]).toMatchObject({ method: 'POST', url: '/PersonnelLocation/SetPersonLocation', data: { ...payload, IdempotencyKey: 'evt-42' } });
  });

  it('sends a unit fix to SetUnitLocation', async () => {
    const registry = createOutboxHandlerRegistry();
    const api = createFakeApi();
    registerLocationOutboxHandlers({ getApiContext: () => api.ctx, registry });
    const handler = registry.get(LOCATION_UNIT_EVENT) as OutboxHandler<LocationPayload>;
    const payload = buildUnitLocationPayload('42', fixAt(ORIGIN, 0));

    await handler.send(event(LOCATION_UNIT_EVENT, payload), { idempotencyKey: 'evt-1', attempt: 1 });

    expect(api.request.mock.calls[0][0]).toMatchObject({ method: 'POST', url: '/UnitLocation/SetUnitLocation', data: { UnitId: '42', IdempotencyKey: 'evt-1' } });
  });

  it('treats a 200 whose envelope says failure as a refusal', async () => {
    const registry = createOutboxHandlerRegistry();
    const api = createFakeApi();
    api.request.mockResolvedValueOnce({ data: { Status: 'failure' } });
    registerLocationOutboxHandlers({ getApiContext: () => api.ctx, registry });
    const handler = registry.get(LOCATION_UNIT_EVENT) as OutboxHandler<LocationPayload>;

    const failure = await handler.send(event(LOCATION_UNIT_EVENT, buildUnitLocationPayload('42', fixAt(ORIGIN, 0))), { idempotencyKey: 'evt-1', attempt: 1 }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(V4FailureError);
    expect(handler.classify(failure, event(LOCATION_UNIT_EVENT, buildUnitLocationPayload('42', fixAt(ORIGIN, 0))))).toBe('permanent');
  });

  it('reports acknowledgements and rejections to the transmitter callbacks', async () => {
    const registry = createOutboxHandlerRegistry();
    const onDelivered = jest.fn();
    const onRejected = jest.fn();
    registerLocationOutboxHandlers({ getApiContext: () => createFakeApi().ctx, registry, onDelivered, onRejected });
    const handler = registry.get(LOCATION_UNIT_EVENT) as OutboxHandler<LocationPayload>;
    const queued = event(LOCATION_UNIT_EVENT, buildUnitLocationPayload('42', fixAt(ORIGIN, 0)));

    await handler.afterAck?.(queued, {});
    await handler.rollback?.(queued, 'dead');

    expect(onDelivered).toHaveBeenCalledWith('unit', queued);
    expect(onRejected).toHaveBeenCalledWith('unit', queued, 'dead');
  });
});

describe('classifyLocationError', () => {
  it.each([
    [new ApiError({ kind: 'http', status: 400 }), 'permanent'],
    [new ApiError({ kind: 'http', status: 404 }), 'permanent'],
    [new ApiError({ kind: 'http', status: 401 }), 'auth'],
    [new ApiError({ kind: 'http', status: 408 }), 'retry'],
    [new ApiError({ kind: 'http', status: 429 }), 'retry'],
    [new ApiError({ kind: 'http', status: 503 }), 'retry'],
    [new ApiError({ kind: 'network' }), 'network'],
    [new ApiError({ kind: 'timeout' }), 'network'],
    [new NoActiveSessionError('/UnitLocation/SetUnitLocation'), 'auth'],
    [new V4FailureError({ Status: 'failure' }), 'permanent'],
  ])('classifies %p as %s', (error, expected) => {
    expect(classifyLocationError(error)).toBe(expected);
  });

  it('falls back to the offline default for foreign errors', () => {
    expect(classifyLocationError(Object.assign(new Error('x'), { response: { status: 422 } }))).toBe('permanent');
    expect(classifyLocationError(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))).toBe('network');
  });
});
