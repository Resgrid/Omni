import { type ApiError, V4FailureError } from '@resgrid/api';
import { z } from 'zod';

/** Anything longer than this is not a reason written for a person (a stack trace, an error page). */
export const MAX_SERVER_MESSAGE_LENGTH = 500;

/** Core answers a refused call write with a plain-text 4xx body; a JSON body's Message/detail/title is accepted too. */
const refusalBodySchema = z.union([
  z.string(),
  z
    .looseObject({ Message: z.string().optional(), message: z.string().optional(), detail: z.string().optional(), title: z.string().optional() })
    .transform((body) => body.Message ?? body.message ?? body.detail ?? body.title ?? ''),
]);

/** A JSON-encoded string body that reached the app without being parsed. */
const quotedStringSchema = z.string().transform((text, context) => {
  try {
    return z.string().parse(JSON.parse(text));
  } catch {
    context.addIssue({ code: 'custom', message: 'not a JSON string' });

    return z.NEVER;
  }
});

/**
 * The text of a refused call write (close, save, edit): null for network/timeout failures, failure envelopes (their
 * message is generic) and bodies that carry no text. HTML and length are left to the caller.
 */
export function refusalText(error: ApiError | V4FailureError): string | null {
  if (error instanceof V4FailureError || error.kind !== 'http') return null;
  const parsed = refusalBodySchema.safeParse(error.data);

  if (!parsed.success) return null;
  const trimmed = parsed.data.trim();
  const unquoted = trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"') ? quotedStringSchema.safeParse(trimmed) : null;

  return (unquoted?.success ? unquoted.data : trimmed).trim() || null;
}

const MISSING_FIELDS_PREFIX = 'required call fields are missing:';

/**
 * The policy keys a save or edit was refused for, read from Core's 400 ("Required call fields are missing: address,
 * contactInfo"; Dispatch `getMissingCallFieldsFromError`). Null for anything else, so the caller falls back to its own
 * message. Keys come back as sent; `describeCallFields` names the known ones the way the form does.
 */
export function getMissingCallFieldsFromRefusal(error: ApiError | V4FailureError): string[] | null {
  if (error instanceof V4FailureError || error.status !== 400) return null;
  const message = refusalText(error) ?? '';
  const start = message.toLowerCase().indexOf(MISSING_FIELDS_PREFIX);

  if (start < 0) return null;

  const keys = message
    .slice(start + MISSING_FIELDS_PREFIX.length)
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);

  return keys.length > 0 ? keys : null;
}

/** A refusal sending it again cannot change: a 4xx other than a timeout (408) or rate limit (429). */
export const isFinalRefusal = (error: ApiError): boolean => {
  const status = error.kind === 'http' ? (error.status ?? 0) : 0;

  return status >= 400 && status < 500 && status !== 408 && status !== 429;
};
