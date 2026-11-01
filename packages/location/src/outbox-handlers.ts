import { type ApiContext, isApiError, isV4Failure, setPersonLocation, setUnitLocation, V4FailureError } from '@resgrid/api';
import type { PersonnelLocationInput, SaveUnitLocationResult, UnitLocationInput } from '@resgrid/models';
import { defaultClassify, type OutboxErrorClass, type OutboxEvent, type OutboxHandler, type OutboxHandlerRegistry, registerOutboxHandler, type RollbackReason } from '@resgrid/offline';

import { LOCATION_PERSON_EVENT, LOCATION_UNIT_EVENT } from './constants';
import type { LocationPayload, LocationTarget, PersonLocationPayload, UnitLocationPayload } from './types';

/**
 * Core dedupes replays by `IdempotencyKey` (plan §8.6 item 3, the Records convention: body field or `Idempotency-Key`
 * header). `@resgrid/api` has no per-request header option yet, so the key rides in the JSON body; servers that predate
 * the dedupe ignore the unknown field.
 */
interface IdempotentBody {
  IdempotencyKey: string;
}

/**
 * Location writes (plan §8.3/§8.5): 401 and "no session" wait for auth; network/timeout wait for connectivity;
 * 408/429/5xx retry with backoff; any other 4xx — or a 200 whose envelope says `failure` — is a permanent refusal
 * (dead-lettered; the next fix for the same target replaces it through the coalesce key).
 */
export const classifyLocationError = (error: unknown): OutboxErrorClass => {
  if (error instanceof V4FailureError) return 'permanent';
  if (isApiError(error)) {
    switch (error.kind) {
      case 'no_session':
        return 'auth';
      case 'network':
      case 'timeout':
      case 'canceled':
        return 'network';
      case 'http': {
        const status = error.status ?? 0;
        if (status === 401) return 'auth';
        if (status === 408 || status === 429) return 'retry';
        if (status >= 400 && status < 500) return 'permanent';
        return 'retry';
      }
      default:
        return 'retry';
    }
  }
  return defaultClassify(error);
};

const ensureSucceeded = (result: SaveUnitLocationResult): SaveUnitLocationResult => {
  if (isV4Failure(result)) throw new V4FailureError(result);
  return result;
};

export type LocationEvent = OutboxEvent<LocationPayload>;

export interface LocationHandlerCallbacks {
  /** The server acknowledged the fix. */
  onDelivered?: (target: LocationTarget, event: LocationEvent) => void;
  /** The fix was dead-lettered (server refusal, attempts exhausted) or discarded by the user. */
  onRejected?: (target: LocationTarget, event: LocationEvent, reason: RollbackReason) => void;
}

export interface RegisterLocationOutboxHandlersOptions extends LocationHandlerCallbacks {
  /** The API context (client + base URL) at send time; replays after a relaunch use whatever the session has then. */
  getApiContext: () => ApiContext;
  /** Only register the variant's own target (plan §8.3: variants register only the handlers in their scope). Default: both. */
  targets?: readonly LocationTarget[];
  /** Defaults to the process-wide registry used by `createOutbox()`. */
  registry?: Pick<OutboxHandlerRegistry, 'register'>;
}

export const createPersonLocationHandler = (options: RegisterLocationOutboxHandlersOptions): OutboxHandler<PersonLocationPayload, SaveUnitLocationResult> => ({
  type: LOCATION_PERSON_EVENT,
  async send(event, context) {
    const body: PersonnelLocationInput & IdempotentBody = { ...event.payload, IdempotencyKey: context.idempotencyKey };
    return ensureSucceeded(await setPersonLocation(options.getApiContext(), body));
  },
  classify: (error) => classifyLocationError(error),
  afterAck(event) {
    options.onDelivered?.('person', event);
  },
  rollback(event, reason) {
    options.onRejected?.('person', event, reason);
  },
});

export const createUnitLocationHandler = (options: RegisterLocationOutboxHandlersOptions): OutboxHandler<UnitLocationPayload, SaveUnitLocationResult> => ({
  type: LOCATION_UNIT_EVENT,
  async send(event, context) {
    const body: UnitLocationInput & IdempotentBody = { ...event.payload, IdempotencyKey: context.idempotencyKey };
    return ensureSucceeded(await setUnitLocation(options.getApiContext(), body));
  },
  classify: (error) => classifyLocationError(error),
  afterAck(event) {
    options.onDelivered?.('unit', event);
  },
  rollback(event, reason) {
    options.onRejected?.('unit', event, reason);
  },
});

/**
 * Registers the `location.person` / `location.unit` outbox handlers. Must run before the first fix is queued — at app
 * start and in the headless background bootstrap — or `enqueue` refuses the unknown type. Returns an unregister function.
 */
export function registerLocationOutboxHandlers(options: RegisterLocationOutboxHandlersOptions): () => void {
  const targets = options.targets ?? (['person', 'unit'] as const);
  const register = <P>(handler: OutboxHandler<P, SaveUnitLocationResult>): (() => void) => (options.registry ? options.registry.register(handler) : registerOutboxHandler(handler));
  const disposers = targets.map((target) => (target === 'person' ? register(createPersonLocationHandler(options)) : register(createUnitLocationHandler(options))));
  return () => disposers.forEach((dispose) => dispose());
}
