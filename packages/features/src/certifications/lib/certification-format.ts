import type { DataError, DataErrorCode } from '@resgrid/data';
import { type Certification, CertificationStatus } from '@resgrid/models';

/** An expiry within this many days is "expiring soon" (amber). */
export const EXPIRING_SOON_DAYS = 60;

/** Core refuses uploads over 10 MB (CertificationsController.MaxFileBytes). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Core refuses continuing-education entries over this many hours. */
export const MAX_CREDIT_HOURS = 9999;

/** Where a record stands against its expiry date. */
export type ExpiryState = 'none' | 'ok' | 'soon' | 'expired';

export const expiryState = (item: Pick<Certification, 'ExpiresOn' | 'DaysUntilExpiry' | 'Status'>): ExpiryState => {
  if (item.Status === CertificationStatus.Expired || (item.DaysUntilExpiry != null && item.DaysUntilExpiry < 0)) return 'expired';
  if (!item.ExpiresOn) return 'none';
  return item.DaysUntilExpiry != null && item.DaysUntilExpiry <= EXPIRING_SOON_DAYS ? 'soon' : 'ok';
};

/** Text colour for an expiry line: expired red, expiring soon amber, otherwise muted. */
export const expiryTextClass = (state: ExpiryState): string => (state === 'expired' ? 'text-error-600' : state === 'soon' ? 'text-warning-700' : 'text-typography-600');

export type StatusAction = 'success' | 'error' | 'warning' | 'info' | 'muted';

/** Badge colour for a record's status (the department sets it; Expired is the nightly sweep's). */
export const statusAction = (status: number): StatusAction => {
  switch (status) {
    case CertificationStatus.Active:
      return 'success';
    case CertificationStatus.Expired:
    case CertificationStatus.Revoked:
      return 'error';
    case CertificationStatus.Suspended:
      return 'warning';
    case CertificationStatus.PendingVerification:
      return 'info';
    default:
      return 'muted';
  }
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar-day string (yyyy-MM-dd) that names a real day. */
export const isDateKey = (value: string): boolean => DATE_KEY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** An optional calendar-day field: blank is null, anything else must be yyyy-MM-dd. */
export const optionalDate = (value: string): { ok: boolean; value: string | null } => {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  return isDateKey(trimmed) ? { ok: true, value: trimmed } : { ok: false, value: null };
};

/** Continuing-education hours as typed ("1,5" allowed), rounded to 2 places; null unless above 0 and within Core's limit. */
export const hoursOf = (text: string): number | null => {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && value > 0 && value <= MAX_CREDIT_HOURS ? Math.round(value * 100) / 100 : null;
};

/** A certification's calendar day field for input (the wire may append a time). */
export const dayOf = (value: string | null | undefined): string => String(value ?? '').slice(0, 10);

/** Today as a device-local calendar day. */
export const todayKey = (now: Date = new Date()): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** A calendar day `months` later; the day is kept where the month has it (Jan 31 + 1 month = Feb 28/29). */
export const addMonths = (day: string, months: number): string => {
  const [year, month, date] = day.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  return target.toISOString().slice(0, 10);
};

/** A calendar day for display in the reader's language ("Dec 1, 2026"); the raw text when it is not a day. */
export const formatDay = (value: string | null | undefined, locale: string): string => {
  const day = dayOf(value);
  if (!isDateKey(day)) return day;
  const [year, month, date] = day.split('-').map(Number);
  try {
    return new Date(year, month - 1, date).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return day;
  }
};

/** Soonest expiry first; records that never expire last; then by name. */
export const sortCertifications = (items: readonly Certification[]): Certification[] =>
  [...items].sort((a, b) => (a.ExpiresOn ?? '9999').localeCompare(b.ExpiresOn ?? '9999') || (a.TypeName ?? a.Name ?? '').localeCompare(b.TypeName ?? b.Name ?? ''));

/** The record's display name: catalog type, own name, or a generic label. */
export const certificationName = (item: Pick<Certification, 'TypeName' | 'Name'>, fallback: string): string => item.TypeName || item.Name || fallback;

/** Counts for the list's summary tiles. */
export const summarize = (items: readonly Certification[]): { total: number; soon: number; expired: number } => {
  let soon = 0;
  let expired = 0;
  for (const item of items) {
    const state = expiryState(item);
    if (state === 'soon') soon += 1;
    else if (state === 'expired') expired += 1;
  }
  return { total: items.length, soon, expired };
};

export interface CertificationFormValues {
  /** True when the member names it ("Other") instead of picking a catalog type. */
  isOther: boolean;
  /** A catalog type is chosen (always true for "Other"). */
  hasType: boolean;
  name: string;
  receivedOn: string;
  expiresOn: string;
}

/** Field → translation key of what is wrong with it. */
export type CertificationFormErrors = Partial<Record<'type' | 'name' | 'receivedOn' | 'expiresOn', string>>;

/** Checks the add/edit form before it is sent, so every reason Core would refuse it for is caught on the field. */
export const validateCertificationForm = (values: CertificationFormValues, today: string = todayKey()): CertificationFormErrors => {
  const errors: CertificationFormErrors = {};
  if (!values.hasType) errors.type = 'certifications.validation.typeRequired';
  else if (values.isOther && !values.name.trim()) errors.name = 'certifications.validation.nameRequired';
  const received = optionalDate(values.receivedOn);
  const expires = optionalDate(values.expiresOn);
  if (!received.ok) errors.receivedOn = 'certifications.dateInvalid';
  else if (received.value && received.value > today) errors.receivedOn = 'certifications.validation.receivedInFuture';
  if (!expires.ok) errors.expiresOn = 'certifications.dateInvalid';
  else if (received.value && expires.value && expires.value <= received.value) errors.expiresOn = 'certifications.validation.expiresBeforeReceived';
  return errors;
};

/** Core's reason codes (`X-Resgrid-Reason`, surfaced as the problem type) and the text that tells the member what to do. */
const REASON_KEYS: Readonly<Record<string, string>> = {
  certifications_file_invalid: 'certifications.errors.certifications_file_invalid',
  certifications_file_too_large: 'certifications.errors.certifications_file_too_large',
  certifications_type_not_found: 'certifications.errors.typeUnavailable',
  certifications_type_scope: 'certifications.errors.typeUnavailable',
  certifications_record_not_found: 'certifications.errors.notFound',
  certifications_credit_not_found: 'certifications.errors.notFound',
  certifications_expiry_required: 'certifications.errors.expiryRequired',
  certifications_expiry_not_later: 'certifications.errors.expiryNotLater',
  certifications_credit_hours_invalid: 'certifications.hoursInvalid',
  certifications_protected_write_refused: 'certifications.errors.locked',
  protected_data_required: 'certifications.errors.locked',
  step_up_required: 'certifications.errors.locked',
  grant_expired: 'certifications.errors.locked',
};

/**
 * Failures without a reason. Writes here are online only (no outbox), so the data layer's "will be sent when you are
 * back online" never applies; these say the entries are kept and what to try.
 */
const CODE_KEYS: Readonly<Partial<Record<DataErrorCode, string>>> = {
  network: 'certifications.errors.offline',
  timeout: 'certifications.errors.timeout',
  server: 'certifications.errors.server',
  forbidden: 'certifications.errors.denied',
  not_found: 'certifications.errors.notFound',
  rejected: 'certifications.errors.rejected',
};

/** The translation key for a certifications failure: Core's reason when it gave one, else the kind of failure. */
export const certificationErrorKey = (error: DataError): string => (error.problemType ? REASON_KEYS[error.problemType] : undefined) ?? CODE_KEYS[error.code] ?? error.messageKey;
