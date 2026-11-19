import type { ApiError } from '@resgrid/api';
import type { RecurringCallErrorData } from '@resgrid/models';
import { z } from 'zod';

/** Core's 400 body for a schedule it would not save: `Errors[{ Key, Message }]` (`SaveRecurringCallResult`). */
const saveRefusalSchema = z.looseObject({
  Errors: z.array(z.looseObject({ Key: z.string().min(1), Message: z.string().nullish() })),
});

/**
 * The validation keys of a refused save, read from the response body at the I/O boundary; empty for anything else
 * (network failures, other statuses, a body without `Errors`), so the caller falls back to a general message.
 */
export function readSaveErrors(error: ApiError): RecurringCallErrorData[] {
  if (error.kind !== 'http' || error.status !== 400) return [];
  const parsed = saveRefusalSchema.safeParse(error.data);

  return parsed.success ? parsed.data.Errors.map((entry) => ({ Key: entry.Key, Message: entry.Message ?? null })) : [];
}
