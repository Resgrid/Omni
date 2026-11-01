/**
 * The Core v4 response envelope (`StandardApiResponseV4Base`). Every v4 action answers with this shape and a
 * string `Status`. **`not_found` comes back as HTTP 200** — always look at `Status`, never only at the HTTP code.
 */
export const V4Status = {
  Success: 'success',
  Failure: 'failure',
  NotFound: 'not_found',
  Created: 'created',
  Updated: 'updated',
  Deleted: 'deleted',
  Queued: 'queued',
} as const;

// eslint-disable-next-line @typescript-eslint/no-redeclare -- enum-like const + literal union type pair
export type V4Status = (typeof V4Status)[keyof typeof V4Status];

export interface V4Envelope {
  PageSize?: number;
  Page?: number;
  Timestamp?: string;
  Version?: string;
  Node?: string;
  Environment?: string;
  RequestId?: string;
  /** One of {@link V4Status}; older servers and some actions use other casings, so compare with the helpers below. */
  Status?: string;
  PreviousPageUrl?: string | null;
  NextPageUrl?: string | null;
}

export interface V4Result<T> extends V4Envelope {
  Data: T;
}

/** A v4 result whose `Data` shape is not modelled yet (Core action typed `object` in Swagger). */
export type UnknownV4Result = V4Result<unknown>;

const SUCCESS_STATUSES: ReadonlySet<string> = new Set([V4Status.Success, V4Status.Created, V4Status.Updated, V4Status.Deleted, V4Status.Queued]);

const normalizeStatus = (status: unknown): string | null => (typeof status === 'string' ? status.trim().toLowerCase().replace(/\s+/g, '_') : null);

/** The envelope status in canonical form (`NotFound` / `not found` normalise to `not_found`), or null when absent. */
export const getV4Status = (result: unknown): string | null => {
  if (typeof result !== 'object' || result === null) {
    return null;
  }
  const status = normalizeStatus((result as V4Envelope).Status);
  return status === 'notfound' ? V4Status.NotFound : status;
};

/** True for `not_found` — which Core returns with HTTP 200 for empty lists and missing records. */
export const isV4NotFound = (result: unknown): boolean => getV4Status(result) === V4Status.NotFound;

export const isV4Failure = (result: unknown): boolean => getV4Status(result) === V4Status.Failure;

/**
 * True when the action succeeded (`success`, `created`, `updated`, `deleted`, `queued`). A missing `Status` counts as
 * success: a few legacy actions omit it and the HTTP layer already rejected real errors.
 */
export const isV4Success = (result: unknown): boolean => {
  const status = getV4Status(result);
  return status === null || SUCCESS_STATUSES.has(status);
};

export interface UnwrapV4Options<T> {
  /** Value returned for `not_found` (default: the result's own `Data`, typically an empty list or null). */
  notFound?: T;
}

/** Thrown by {@link unwrapV4Data} when the envelope reports `failure`. */
export class V4FailureError extends Error {
  public readonly status: string | null;
  public readonly requestId?: string;

  constructor(result: V4Envelope) {
    super('The server reported a failure');
    this.name = 'V4FailureError';
    this.status = getV4Status(result);
    this.requestId = result.RequestId;
  }
}

/**
 * Returns `Data`, honouring the envelope: `failure` throws {@link V4FailureError}; `not_found` returns `options.notFound`
 * when given (otherwise the server's `Data`).
 */
export const unwrapV4Data = <T>(result: V4Result<T>, options?: UnwrapV4Options<T>): T => {
  if (isV4Failure(result)) {
    throw new V4FailureError(result);
  }
  if (isV4NotFound(result) && options && 'notFound' in options) {
    return options.notFound as T;
  }
  return result.Data;
};
